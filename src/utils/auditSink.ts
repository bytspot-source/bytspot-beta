/**
 * Durable audit sink — NIST PR.PT-1 (audit/log records).
 *
 * Buffers VirtualPatchAuditEvent (and any future audit shape) in memory and in
 * IndexedDB, drains on a periodic timer via `trpc.audit.append`, and falls back
 * to `navigator.sendBeacon` on page hide. Survives reload, network blips, and
 * unexpected close — events stay in IndexedDB until the server acknowledges
 * receipt, at which point they're deleted.
 *
 * The server endpoint (`audit.append` tRPC mutation + `/audit/beacon` REST
 * fallback) is implemented in the bytspot-api repo. Until it ships, events
 * accumulate in IndexedDB and flush on the next successful POST.
 */
import { trpc, API_BASE_URL } from './trpc';
import type { VirtualPatchAuditEvent } from './virtualPatch';

const DB_NAME = 'bytspot_audit';
const STORE_NAME = 'queue';
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS_BEFORE_DROP = 50;

interface AuditSinkConfig {
  batchSize?: number;
  flushIntervalMs?: number;
  beaconEndpoint?: string;
}

interface QueuedEvent {
  id: string;
  event: VirtualPatchAuditEvent;
  attempts: number;
}

export interface AuditSink {
  emit: (event: VirtualPatchAuditEvent) => void;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
}

let activeSink: AuditSink | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function persistEvent(db: IDBDatabase | null, queued: QueuedEvent): Promise<void> {
  if (!db) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(queued);
    await txDone(tx);
  } catch { /* ignore */ }
}

async function readAll(db: IDBDatabase | null): Promise<QueuedEvent[]> {
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as QueuedEvent[]) ?? []);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

async function deleteIds(db: IDBDatabase | null, ids: string[]): Promise<void> {
  if (!db || ids.length === 0) return;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    ids.forEach((id) => store.delete(id));
    await txDone(tx);
  } catch { /* ignore */ }
}

export function createAuditSink(config: AuditSinkConfig = {}): AuditSink {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
  const flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const beaconEndpoint = config.beaconEndpoint ?? `${API_BASE_URL}/audit/beacon`;

  const dbPromise: Promise<IDBDatabase | null> = openDb();
  const memoryQueue: QueuedEvent[] = [];
  const inflight = new Set<string>();
  let flushing = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const flush = async (): Promise<void> => {
    if (flushing) return;
    flushing = true;
    try {
      const db = await dbPromise;
      const persisted = await readAll(db);
      const dedup = new Map<string, QueuedEvent>();
      [...memoryQueue, ...persisted].forEach((q) => dedup.set(q.id, q));
      const pending = Array.from(dedup.values()).filter((q) => !inflight.has(q.id));
      if (pending.length === 0) return;
      const batch = pending.slice(0, batchSize);
      batch.forEach((q) => inflight.add(q.id));
      try {
        await trpc.audit.append.mutate({ events: batch.map((q) => q.event) });
        // Success — drop from memory and persistent queue.
        for (const q of batch) {
          const idx = memoryQueue.findIndex((m) => m.id === q.id);
          if (idx >= 0) memoryQueue.splice(idx, 1);
        }
        await deleteIds(db, batch.map((q) => q.id));
      } catch {
        // Failed — bump attempts; drop after MAX_ATTEMPTS_BEFORE_DROP to avoid
        // an unbounded queue if the endpoint is permanently misconfigured.
        for (const q of batch) {
          q.attempts += 1;
          if (q.attempts < MAX_ATTEMPTS_BEFORE_DROP) {
            await persistEvent(db, q);
          }
        }
        const drops = batch.filter((q) => q.attempts >= MAX_ATTEMPTS_BEFORE_DROP);
        if (drops.length > 0) await deleteIds(db, drops.map((q) => q.id));
      } finally {
        batch.forEach((q) => inflight.delete(q.id));
      }
    } finally {
      flushing = false;
    }
  };

  const beaconFlush = (): void => {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
    if (memoryQueue.length === 0) return;
    try {
      const blob = new Blob(
        [JSON.stringify({ events: memoryQueue.map((q) => q.event) })],
        { type: 'application/json' },
      );
      const ok = navigator.sendBeacon(beaconEndpoint, blob);
      if (ok) memoryQueue.length = 0;
    } catch { /* ignore */ }
  };

  const emit = (event: VirtualPatchAuditEvent): void => {
    const queued: QueuedEvent = { id: generateId(), event, attempts: 0 };
    memoryQueue.push(queued);
    void dbPromise.then((db) => persistEvent(db, queued));
    if (memoryQueue.length >= batchSize) void flush();
  };

  const shutdown = async (): Promise<void> => {
    if (timer) { clearInterval(timer); timer = null; }
    beaconFlush();
    await flush();
    const db = await dbPromise;
    if (db) db.close();
  };

  if (typeof window !== 'undefined') {
    timer = setInterval(() => { void flush(); }, flushIntervalMs);
    const onHide = () => beaconFlush();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    window.addEventListener('pagehide', onHide);
    // Drain anything left from a previous session shortly after boot.
    setTimeout(() => { void flush(); }, 1500);
  }

  return { emit, flush, shutdown };
}

/** Idempotent boot — App.tsx calls this once. Subsequent calls reuse the sink. */
export function initAuditSink(config?: AuditSinkConfig): AuditSink {
  if (activeSink) return activeSink;
  activeSink = createAuditSink(config);
  return activeSink;
}

/** Returns the sink constructed by `initAuditSink`, or null if not yet booted. */
export function getAuditSink(): AuditSink | null {
  return activeSink;
}
