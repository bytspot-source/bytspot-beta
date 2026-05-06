import { useEffect, useId, useRef, useState } from 'react';

type GoogleCredentialResponse = { credential?: string };

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

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Sign-In script failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Sign-In script failed to load.'));
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
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const fallbackId = useId();
  const [ready, setReady] = useState(false);
  const clientId = getGoogleClientId();

  useEffect(() => {
    if (!clientId || disabled) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (response) => {
            if (response.credential) void onCredential(response.credential);
            else onError?.('Google did not return a sign-in credential. Please try again.');
          },
        });
        buttonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(360, buttonRef.current.clientWidth || 360),
        });
        setReady(true);
      })
      .catch((error: Error) => onError?.(error.message));
    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel?.();
    };
  }, [clientId, disabled, onCredential, onError]);

  if (!clientId) {
    return (
      <button
        type="button"
        aria-describedby={fallbackId}
        disabled
        className="w-full rounded-[16px] border-2 border-white/20 px-4 py-3.5 text-[15px] font-bold text-white/55"
      >
        Google Sign-In not configured
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={buttonRef} aria-busy={!ready || disabled} className={disabled ? 'pointer-events-none opacity-60' : ''} />
      {!ready && !disabled && <p id={fallbackId} className="text-center text-[12px] font-semibold text-white/55">Loading Google Sign-In…</p>}
      <span className="sr-only">{label}</span>
    </div>
  );
}
