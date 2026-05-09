import { useId, useState } from 'react';

type GoogleCredentialResponse = { credential?: string };
type GooglePromptMoment = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
};

declare global {
  interface Window {
    __BYT_GOOGLE_CLIENT_ID__?: string;
    google?: {
      accounts?: {
        id?: {
          initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; ux_mode?: 'popup' | 'redirect' }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
          prompt?: (callback?: (notification: GooglePromptMoment) => void) => void;
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
  const fallbackId = useId();
  const [loading, setLoading] = useState(false);
  const clientId = getGoogleClientId();

  const handleClick = async () => {
    if (disabled || loading) return;
    if (!clientId) {
      onError?.('Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID to your Google OAuth Web Client ID.');
      return;
    }

    setLoading(true);
    try {
      await loadGoogleScript();
      const googleId = window.google?.accounts?.id;
      if (!googleId) throw new Error('Google Sign-In failed to initialize. Please try again.');
      googleId.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        callback: (response) => {
          setLoading(false);
          if (response.credential) void onCredential(response.credential);
          else onError?.('Google did not return a sign-in credential. Please try again.');
        },
      });
      if (!googleId.prompt) throw new Error('Google Sign-In is unavailable in this browser. Please try email sign-in.');
      googleId.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
          setLoading(false);
          const reason = notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || notification.getDismissedReason?.();
          onError?.(reason ? `Google Sign-In is unavailable right now: ${reason}.` : 'Google Sign-In is unavailable right now. Please try again.');
        }
      });
    } catch (error) {
      setLoading(false);
      onError?.((error as Error).message || 'Google Sign-In failed. Please try again.');
    }
  };

  return (
    <div className="relative w-full">
      <button
        type="button"
        aria-label={label}
        aria-describedby={fallbackId}
        aria-busy={loading}
        disabled={disabled || loading}
        onClick={handleClick}
        data-testid="google-signin-button"
        className="flex h-12 min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-black/10 bg-white px-4 text-[17px] text-black shadow-lg transition-colors hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', fontWeight: 600 }}
      >
        <GoogleLogoMark />
        <span>{loading ? 'Connecting…' : 'Continue with Google'}</span>
      </button>
      <span id={fallbackId} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
        Continue with Google creates or signs in to your Bytspot account without filling out the email form.
      </span>
    </div>
  );
}
