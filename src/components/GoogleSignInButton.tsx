import { useEffect, useId, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

type GoogleCredentialResponse = { credential?: string };
type GoogleButtonState = 'loading' | 'ready' | 'unavailable';

declare global {
  interface Window {
    __BYT_GOOGLE_CLIENT_ID__?: string;
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; ux_mode?: 'popup' | 'redirect' }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
          cancel?: () => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_ID = 'google-identity-services';
let googleScriptPromise: Promise<void> | null = null;

function getGoogleClientId(): string {
  return String(window.__BYT_GOOGLE_CLIENT_ID__ || import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
}

function GoogleLogoMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20" className="shrink-0" focusable="false">
      <path fill="#FFC107" d="M43.61 20.08H42V20H24v8h11.3C33.65 32.66 29.22 36 24 36c-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.64-.39-3.92Z" />
      <path fill="#FF3D00" d="m6.31 14.69 6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69Z" />
      <path fill="#4CAF50" d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.09 26.72 36 24 36c-5.2 0-9.62-3.32-11.28-7.95l-6.52 5.02C9.51 39.55 16.24 44 24 44Z" />
      <path fill="#1976D2" d="M43.61 20.08H42V20H24v8h11.3a12.04 12.04 0 0 1-4.09 5.57l6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.64-.39-3.92Z" />
    </svg>
  );
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      if (existing.dataset.failed === 'true') {
        reject(new Error('Google Sign-In is unavailable. Continue with email or try again later.'));
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Sign-In is unavailable. Continue with email or try again later.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      script.dataset.failed = 'true';
      googleScriptPromise = null;
      reject(new Error('Google Sign-In is unavailable. Continue with email or try again later.'));
    };
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

export function GoogleSignInButton({
  label = 'Continue with Google',
  disabled = false,
  onCredential,
  onError,
}: {
  label?: string;
  disabled?: boolean;
  onCredential: (idToken: string) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const fallbackId = useId();
  const buttonHostRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [buttonState, setButtonState] = useState<GoogleButtonState>('loading');
  const [unavailableMessage, setUnavailableMessage] = useState('');
  const clientId = getGoogleClientId();
  const isNativeApp = Capacitor.isNativePlatform();

  useEffect(() => { onCredentialRef.current = onCredential; }, [onCredential]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (isNativeApp) return;

    if (!clientId) {
      setButtonState('unavailable');
      setUnavailableMessage('Google Sign-In is not configured. Continue with email or try again later.');
      return;
    }

    let cancelled = false;
    setButtonState('loading');
    setUnavailableMessage('');

    loadGoogleScript()
      .then(() => {
        if (cancelled) return;
        const googleId = window.google?.accounts?.id;
        const host = buttonHostRef.current;
        if (!googleId || !host) throw new Error('Google Sign-In is unavailable. Continue with email or try again later.');

        googleId.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (response) => {
            if (!response.credential) {
              onErrorRef.current?.('Google did not return a sign-in credential. Please try again.');
              return;
            }
            void Promise.resolve(onCredentialRef.current(response.credential)).catch((error: unknown) => {
              onErrorRef.current?.(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
            });
          },
        });

        host.innerHTML = '';
        googleId.renderButton(host, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: Math.max(280, Math.min(host.getBoundingClientRect().width || 345, 400)),
        });
        setButtonState('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Google Sign-In is unavailable. Continue with email or try again later.';
        setUnavailableMessage(message);
        setButtonState('unavailable');
      });

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel?.();
    };
  }, [clientId, isNativeApp]);

  if (isNativeApp) return null;

  const handleUnavailableClick = () => {
    onError?.(unavailableMessage || 'Google Sign-In is unavailable. Continue with email or try again later.');
  };

  return (
    <div className="relative w-full">
      {buttonState === 'unavailable' ? (
        <button
          type="button"
          aria-label={label}
          aria-describedby={fallbackId}
          onClick={handleUnavailableClick}
          data-testid="google-signin-button"
          className="flex h-12 min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-black/10 bg-white px-4 text-[17px] text-black shadow-lg transition-colors hover:bg-white/95"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', fontWeight: 600 }}
        >
          <GoogleLogoMark />
          <span>{label}</span>
        </button>
      ) : (
        <div className="relative min-h-[48px] w-full rounded-[10px]">
          <div
            ref={buttonHostRef}
            aria-describedby={fallbackId}
            aria-disabled={disabled}
            aria-busy={buttonState === 'loading'}
            data-testid="google-signin-button"
            className="flex min-h-[48px] w-full items-center justify-center overflow-hidden rounded-[10px] bg-white shadow-lg"
            style={{ opacity: disabled || buttonState === 'loading' ? 0.6 : 1, pointerEvents: disabled || buttonState === 'loading' ? 'none' : 'auto' }}
          />
          {buttonState === 'loading' && (
            <div
              className="pointer-events-none absolute inset-0 flex h-12 min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-black/10 bg-white px-4 text-[17px] text-black shadow-lg"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', fontWeight: 600 }}
            >
              <GoogleLogoMark />
              <span>Preparing Google…</span>
            </div>
          )}
        </div>
      )}
      <span id={fallbackId} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
        Continue with Google creates or signs in to your Bytspot account without filling out the email form.
      </span>
    </div>
  );
}
