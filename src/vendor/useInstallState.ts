import { useCallback, useEffect, useState } from 'react';
import {
  createInstallController,
  isIosDevice,
  isStandaloneDisplay,
  resolveInstallState,
  type BeforeInstallPromptEvent,
  type InstallState,
} from './installPrompt';

const controller = createInstallController();

function readStandalone(): boolean {
  const matches = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return isStandaloneDisplay(matches, iosStandalone);
}

function readState(): InstallState {
  return resolveInstallState({
    hasDeferredPrompt: controller.hasPrompt(),
    isStandalone: readStandalone(),
    isIos: isIosDevice(window.navigator.userAgent, window.navigator.maxTouchPoints),
  });
}

export function useInstallState() {
  const [state, setState] = useState<InstallState>(readState);

  useEffect(() => {
    const sync = () => setState(readState());

    const onBeforeInstallPrompt = (event: Event) => {
      controller.capture(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      controller.clear();
      sync();
    };

    const unsubscribe = controller.subscribe(sync);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const standalone = window.matchMedia?.('(display-mode: standalone)');
    standalone?.addEventListener('change', sync);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      standalone?.removeEventListener('change', sync);
    };
  }, []);

  const install = useCallback(async () => {
    const outcome = await controller.promptToInstall();
    setState(readState());
    return outcome;
  }, []);

  return { state, install };
}
