import { useId, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';

type AppleCredential = { identityToken: string; email?: string; name?: string };

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
let appleScriptPromise: Promise<void> | null = null;

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
  return String(import.meta.env.VITE_APPLE_CLIENT_ID || 'com.bytspot.app').trim();
}

function getAppleRedirectUri(): string {
  return String(import.meta.env.VITE_APPLE_REDIRECT_URI || `${window.location.origin}/auth/apple/callback`).trim();
}

export function AppleSignInButton({ disabled = false, onCredential, onError }: { disabled?: boolean; onCredential: (credential: AppleCredential) => void | Promise<void>; onError?: (message: string) => void }) {
  const hintId = useId();
  const [loading, setLoading] = useState(false);
  const state = useMemo(() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, []);

  const handleClick = async () => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const clientId = getAppleClientId();
      const redirectURI = getAppleRedirectUri();

      if (Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform()) {
        const result = await SignInWithApple.authorize({ clientId, redirectURI, scopes: 'email name', state });
        const identityToken = result.response.identityToken;
        if (!identityToken) throw new Error('Apple did not return a sign-in credential. Please try again.');
        const given = result.response.givenName?.trim() ?? '';
        const family = result.response.familyName?.trim() ?? '';
        await onCredential({ identityToken, email: result.response.email ?? undefined, name: [given, family].filter(Boolean).join(' ') || undefined });
        return;
      }

      await loadAppleScript();
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
    <button
      type="button"
      aria-describedby={hintId}
      disabled={disabled || loading}
      onClick={handleClick}
      className="w-full rounded-[16px] bg-white px-4 py-3.5 text-[15px] font-bold text-black shadow-lg disabled:opacity-60"
    >
      {loading ? 'Connecting to Apple…' : 'Continue with Apple'}
      <span id={hintId} className="sr-only">Sign in with Apple supports Hide My Email and limits shared data to name and email.</span>
    </button>
  );
}