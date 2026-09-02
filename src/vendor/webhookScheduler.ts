import {
  drainQueue,
  type DeliveryAttempt,
  type DrainReport,
  type SecretResolver,
  type Transport,
  type WorkerClock,
  type WorkerState,
} from './webhookWorker.ts';

/** How long the loop waits when there is nothing due, so it is not a busy poll. */
const IDLE_SLEEP_SECS = 30;

/**
 * When the loop should next wake. Derived from the queue rather than fixed, so
 * a 30-second retry is not delayed by a six-hour one sitting behind it, and an
 * empty queue does not spin.
 */
export function nextWakeSecs(queue: DeliveryAttempt[], nowSecs: number): number {
  if (queue.length === 0) return IDLE_SLEEP_SECS;
  const earliest = queue.reduce((min, item) => Math.min(min, item.nextAttemptAtSecs), Infinity);
  return Math.max(0, Math.min(IDLE_SLEEP_SECS, earliest - nowSecs));
}

/**
 * Spread simultaneous retries. Without it, a receiver that returned 503 to a
 * hundred deliveries gets all hundred back at the same instant, which is how a
 * retry policy turns into an outage.
 */
export function jitteredSecs(secs: number, random: () => number): number {
  if (secs <= 0) return 0;
  const spread = Math.min(secs * 0.2, 5);
  return secs - spread / 2 + random() * spread;
}

export interface SchedulerOptions {
  secrets: SecretResolver;
  transport: Transport;
  clock: WorkerClock;
  sleep: (secs: number) => Promise<void>;
  random?: () => number;
  /** Called after every pass, including empty ones, for logging or metrics. */
  onReport?: (report: DrainReport, state: WorkerState) => void;
  /** A pass that throws must not end the loop, so failures are reported instead. */
  onError?: (error: unknown) => void;
}

export interface Scheduler {
  start: () => void;
  stop: () => Promise<void>;
  /** Runs one pass immediately. Used by the console's "send now" and by tests. */
  runOnce: () => Promise<DrainReport>;
  enqueue: (mutate: (state: WorkerState) => WorkerState) => void;
  state: () => WorkerState;
  running: () => boolean;
}

/**
 * Drives the worker. The state lives here rather than in a store because the
 * loop is single-flight: two passes over one queue would deliver the same event
 * twice, which at-least-once permits but nobody wants.
 */
export function createScheduler(initial: WorkerState, options: SchedulerOptions): Scheduler {
  const random = options.random ?? Math.random;
  let state = initial;
  let running = false;
  let draining = false;
  let loop: Promise<void> = Promise.resolve();

  const runOnce = async (): Promise<DrainReport> => {
    // Single-flight. A second caller gets an empty report rather than a second
    // pass over the same attempts.
    if (draining) return { delivered: 0, retried: 0, exhausted: 0, dropped: 0, disabled: [] };
    draining = true;
    try {
      const result = await drainQueue(state, {
        secrets: options.secrets,
        transport: options.transport,
        clock: options.clock,
      });
      state = result.state;
      options.onReport?.(result.report, state);
      return result.report;
    } finally {
      draining = false;
    }
  };

  const tick = async () => {
    while (running) {
      try {
        await runOnce();
      } catch (error) {
        // A thrown pass is reported and retried on the next wake. Ending the
        // loop here would silently stop every future delivery.
        options.onError?.(error);
      }
      if (!running) return;
      const wait = jitteredSecs(nextWakeSecs(state.queue, options.clock.nowSecs()), random);
      await options.sleep(wait);
    }
  };

  return {
    start: () => {
      if (running) return;
      running = true;
      loop = tick();
    },
    stop: async () => {
      running = false;
      // Awaits the pass in flight, so a stopped scheduler is not still sending.
      await loop;
    },
    runOnce,
    enqueue: (mutate) => {
      state = mutate(state);
    },
    state: () => state,
    running: () => running,
  };
}

/** A sleep that resolves early when the scheduler is stopped. */
export function timerSleep(): (secs: number) => Promise<void> {
  return (secs) => new Promise((resolve) => setTimeout(resolve, Math.max(0, secs) * 1000));
}
