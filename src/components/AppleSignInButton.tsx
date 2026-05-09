import { useEffect, useId, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';

type AppleCredential = { identityToken: string; email?: string; name?: string };
type AppleButtonAppearance = 'black' | 'white';

interface AppleSignInButtonProps {
  disabled?: boolean;
  label?: 'continue' | 'sign-in';
  appearance?: AppleButtonAppearance;
  onCredential: (credential: AppleCredential) => void | Promise<void>;
  onError?: (message: string) => void;
}

declare global {
  interface Window {
    AppleID?: {
      auth?: {
        init: (config: Record<string, unknown>) => void;
        signIn: () => Promise<{ authorization?: { id_token?: string }; user?: { email?: string; name?: { firstName?: string; lastName?: string } } }>;
      };
    };
  }
}

const APPLE_SCRIPT_ID = 'apple-sign-in-js';
const DEFAULT_NATIVE_APP_ID = 'com.bytspot.app';
const DEFAULT_WEB_SERVICE_ID = 'com.bytspot.app.sid';
const DEFAULT_WEB_REDIRECT_URI = 'https://bytspot.app';
let appleScriptPromise: Promise<void> | null = null;

function readEnv(name: string): string {
  return String(import.meta.env[name] || '').trim();
}

function loadAppleScript(): Promise<void> {
  if (window.AppleID?.auth) return Promise.resolve();
  if (appleScriptPromise) return appleScriptPromise;
  appleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(APPLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Sign in with Apple failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = APPLE_SCRIPT_ID;
    script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Sign in with Apple failed to load.'));
    document.head.appendChild(script);
  });
  return appleScriptPromise;
}

function getAppleClientId(): string {
  const isNativeIOS = Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform();
  if (isNativeIOS) {
    return readEnv('VITE_APPLE_NATIVE_CLIENT_ID') || readEnv('VITE_APPLE_APP_ID') || DEFAULT_NATIVE_APP_ID;
  }

  const webClientId = readEnv('VITE_APPLE_WEB_CLIENT_ID') || readEnv('VITE_APPLE_SERVICE_ID') || readEnv('VITE_APPLE_CLIENT_ID') || DEFAULT_WEB_SERVICE_ID;
  if (!webClientId || webClientId === DEFAULT_NATIVE_APP_ID) {
    throw new Error('Sign in with Apple web is not configured. Add a Services ID and matching Return URL in Apple Developer, then set VITE_APPLE_WEB_CLIENT_ID.');
  }
  return webClientId;
}

function getAppleRedirectUri(): string {
  const configured = readEnv('VITE_APPLE_WEB_REDIRECT_URI') || readEnv('VITE_APPLE_REDIRECT_URI');
  if (configured) return configured;
  return DEFAULT_WEB_REDIRECT_URI;
}

function isNativeIOS(): boolean {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform();
}

function AppleLogoMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[22px] w-[18px] shrink-0 fill-current" focusable="false">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
    </svg>
  );
}

export function AppleSignInButton({ disabled = false, label = 'continue', appearance = 'black', onCredential, onError }: AppleSignInButtonProps) {
  const hintId = useId();
  const [loading, setLoading] = useState(false);
  const state = useMemo(() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, []);
  const labelText = label === 'sign-in' ? 'Sign in with Apple' : 'Continue with Apple';
  const buttonClass = appearance === 'white'
    ? 'bg-white text-black border-black/10 hover:bg-white/95'
    : 'bg-black text-white border-white/25 hover:bg-neutral-900';

  useEffect(() => {
    if (isNativeIOS()) return;
    void loadAppleScript().catch(() => {
      // Surface load failures on tap so the UI does not show an error before user intent.
    });
  }, []);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const clientId = getAppleClientId();
      const redirectURI = getAppleRedirectUri();

      if (isNativeIOS()) {
        const result = await SignInWithApple.authorize({ clientId, redirectURI, scopes: 'email name', state });
        const identityToken = result.response.identityToken;
        if (!identityToken) throw new Error('Apple did not return a sign-in credential. Please try again.');
        const given = result.response.givenName?.trim() ?? '';
        const family = result.response.familyName?.trim() ?? '';
        await onCredential({ identityToken, email: result.response.email ?? undefined, name: [given, family].filter(Boolean).join(' ') || undefined });
        return;
      }

      if (!window.AppleID?.auth) await loadAppleScript();
      window.AppleID?.auth?.init({ clientId, redirectURI, scope: 'name email', state, usePopup: true });
      const result = await window.AppleID?.auth?.signIn();
      const identityToken = result?.authorization?.id_token;
      if (!identityToken) throw new Error('Apple did not return a sign-in credential. Please try again.');
      const given = result?.user?.name?.firstName?.trim() ?? '';
      const family = result?.user?.name?.lastName?.trim() ?? '';
      await onCredential({ identityToken, email: result?.user?.email, name: [given, family].filter(Boolean).join(' ') || undefined });
    } catch (err: unknown) {
      const error = err as { error?: string; message?: string };
      if (error?.error === 'popup_closed_by_user') return;
      onError?.(error?.message || 'Sign in with Apple failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full">
      <button
        type="button"
        aria-label={labelText}
        aria-describedby={hintId}
        disabled={disabled || loading}
        onClick={handleClick}
        className={`flex h-12 min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] border px-4 text-[17px] shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${buttonClass}`}
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', fontWeight: 600 }}
      >
        <AppleLogoMark />
        <span>{loading ? 'Connecting…' : labelText}</span>
      </button>
      <span
        id={hintId}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}
      >
        Sign in with Apple supports Hide My Email and limits shared data to name and email.
      </span>
    </div>
  );
}