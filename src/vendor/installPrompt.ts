/**
 * Install path for the vendor console.
 *
 * Two browsers, two different contracts. Chrome fires `beforeinstallprompt`
 * and gives us a prompt we must keep and call from a user gesture. iOS Safari
 * fires nothing and never will, so the only honest thing is to show the
 * Add to Home Screen steps instead of a button that cannot work.
 *
 * The decision is pure so it can be tested without a browser.
 */

export type InstallState =
  | 'installed'
  | 'promptable'
  | 'manual-ios'
  | 'unavailable';

export interface InstallSignals {
  /** A captured beforeinstallprompt event is waiting to be used. */
  hasDeferredPrompt: boolean;
  /** The document is already running as an installed app. */
  isStandalone: boolean;
  /** iOS or iPadOS, where installation is manual. */
  isIos: boolean;
}

export function resolveInstallState({ hasDeferredPrompt, isStandalone, isIos }: InstallSignals): InstallState {
  if (isStandalone) return 'installed';
  if (hasDeferredPrompt) return 'promptable';
  if (isIos) return 'manual-ios';
  return 'unavailable';
}

/**
 * iPadOS 13+ reports itself as a Mac, so a plain iPad check misses exactly the
 * tablet a vendor is most likely to use. Touch points separate a real Mac from
 * an iPad pretending to be one.
 */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function isStandaloneDisplay(matches: boolean, iosStandalone: boolean | undefined): boolean {
  return matches || iosStandalone === true;
}

export const IOS_INSTALL_STEPS = [
  'Tap the Share button in the Safari toolbar.',
  'Scroll down and tap Add to Home Screen.',
  'Tap Add. Bytspot Vendor opens in its own window.',
] as const;

export function installHeadline(state: InstallState): string {
  switch (state) {
    case 'installed':
      return 'Installed';
    case 'promptable':
      return 'Install the vendor console';
    case 'manual-ios':
      return 'Add to Home Screen';
    case 'unavailable':
      return 'Open in a supported browser to install';
  }
}

type PromptOutcome = 'accepted' | 'dismissed';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: PromptOutcome }>;
}

/**
 * Holds the deferred event. The browser only hands it over once, so losing it
 * means the vendor cannot install until a full reload.
 */
export function createInstallController() {
  let deferred: BeforeInstallPromptEvent | null = null;
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  return {
    capture(event: BeforeInstallPromptEvent) {
      event.preventDefault();
      deferred = event;
      notify();
    },
    clear() {
      deferred = null;
      notify();
    },
    hasPrompt: () => deferred !== null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async promptToInstall(): Promise<PromptOutcome | 'unavailable'> {
      if (!deferred) return 'unavailable';
      const event = deferred;
      // Single-use: Chrome rejects a second prompt() on the same event.
      deferred = null;
      notify();
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome;
    },
  };
}

export type InstallController = ReturnType<typeof createInstallController>;
