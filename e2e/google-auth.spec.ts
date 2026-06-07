import { expect, type Page, test } from '@playwright/test';

async function installGoogleAuthMocks(page: Page) {
  await page.addInitScript(() => {
    type GoogleMockWindow = Window & {
      __BYT_GOOGLE_CLIENT_ID__?: string;
      __BYT_GOOGLE_AUTHORIZED_ORIGINS__?: string;
      google?: {
        accounts: {
          id: {
            initialize: (config: { callback: (response: { credential?: string }) => void }) => void;
            renderButton: (element: HTMLElement) => void;
            cancel: () => void;
          };
        };
      };
    };
    const googleWindow = window as GoogleMockWindow;
    localStorage.setItem('bytspot_intro_seen', 'true');
    googleWindow.__BYT_GOOGLE_CLIENT_ID__ = 'google-web-client-id';
    googleWindow.__BYT_GOOGLE_AUTHORIZED_ORIGINS__ = window.location.origin;
    let googleCredentialCallback: ((response: { credential?: string }) => void) | null = null;
    googleWindow.google = {
      accounts: {
        id: {
          initialize: (config: { callback: (response: { credential?: string }) => void }) => { googleCredentialCallback = config.callback; },
          renderButton: (element: HTMLElement) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Continue with Google';
            button.setAttribute('data-testid', 'mock-google-signin');
            button.onclick = () => googleCredentialCallback?.({ credential: 'mock-google-id-token' });
            element.appendChild(button);
          },
          cancel: () => undefined,
        },
      },
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);
      const procedure = url.match(/\/trpc\/([^?]+)/)?.[1] ?? '';
      if (procedure.includes('auth.googleSignIn')) {
        return new Response(JSON.stringify({
          result: {
            data: {
              token: 'parker-google-token',
              user: { id: 'google-consumer-1', email: 'google.consumer@bytspot.test', name: 'Google Consumer' },
              isNewUser: true,
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ result: { data: null } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  });
}

async function installNativeGoogleAuthMocks(page: Page) {
  await page.addInitScript(() => {
    type NativeCall = { pluginName: string; methodName: string; options?: unknown };
    type NativeMockWindow = Window & {
      __BYT_GOOGLE_CLIENT_ID__?: string;
      __BYT_GOOGLE_AUTHORIZED_ORIGINS__?: string;
      __BYT_NATIVE_GOOGLE_CALLS__?: NativeCall[];
      webkit?: { messageHandlers?: { bridge?: unknown } };
      CapacitorCustomPlatform?: { name: string };
      Capacitor?: {
        PluginHeaders?: Array<{ name: string; methods: Array<{ name: string; rtype: 'promise' }> }>;
        nativePromise?: (pluginName: string, methodName: string, options?: unknown) => Promise<unknown>;
      };
    };
    const nativeWindow = window as NativeMockWindow;
    localStorage.setItem('bytspot_intro_seen', 'true');
    nativeWindow.__BYT_GOOGLE_CLIENT_ID__ = 'google-web-client-id';
    nativeWindow.__BYT_GOOGLE_AUTHORIZED_ORIGINS__ = window.location.origin;
    nativeWindow.__BYT_NATIVE_GOOGLE_CALLS__ = [];
    nativeWindow.CapacitorCustomPlatform = { name: 'ios' };
    nativeWindow.webkit = { messageHandlers: { bridge: {} } };
    nativeWindow.Capacitor = {
      PluginHeaders: [{
        name: 'SocialLogin',
        methods: [
          { name: 'initialize', rtype: 'promise' },
          { name: 'login', rtype: 'promise' },
          { name: 'logout', rtype: 'promise' },
        ],
      }],
      nativePromise: async (pluginName, methodName, options) => {
        nativeWindow.__BYT_NATIVE_GOOGLE_CALLS__?.push({ pluginName, methodName, options });
        if (pluginName === 'SocialLogin' && methodName === 'login') {
          return { result: { responseType: 'online', idToken: 'mock-native-google-id-token', email: 'native.google@bytspot.test' } };
        }
        return {};
      },
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);
      const procedure = url.match(/\/trpc\/([^?]+)/)?.[1] ?? '';
      if (procedure.includes('auth.googleSignIn')) {
        return new Response(JSON.stringify({
          result: {
            data: {
              token: 'native-google-token',
              user: { id: 'native-google-consumer-1', email: 'native.google@bytspot.test', name: 'Native Google Consumer' },
              isNewUser: true,
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ result: { data: null } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  });
}

test('Parker consumer can continue with Google Sign-In', async ({ page }) => {
  await installGoogleAuthMocks(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');

  const landingCta = page.getByRole('button', { name: /Let's Go/i }).first();
  await expect(landingCta).toBeVisible({ timeout: 20_000 });
  await landingCta.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole('heading', { name: 'Welcome to Bytspot' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_auth_token'))).toBe('parker-google-token');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bytspot_user') || '{}').email)).toBe('google.consumer@bytspot.test');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
});

test('Parker consumer sees native iOS Google Sign-In instead of web GIS', async ({ page }) => {
  await installNativeGoogleAuthMocks(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');

  const landingCta = page.getByRole('button', { name: /Let's Go/i }).first();
  await expect(landingCta).toBeVisible({ timeout: 20_000 });
  await landingCta.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole('heading', { name: 'Welcome to Bytspot' })).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId('google-signin-button').getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.locator('#google-identity-services')).toHaveCount(0);
});

test('Parker consumer sees email-first fallback when Google origin is not authorized', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    (window as Window & { __BYT_GOOGLE_CLIENT_ID__?: string }).__BYT_GOOGLE_CLIENT_ID__ = 'google-web-client-id';
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');

  const landingCta = page.getByRole('button', { name: /Let's Go/i }).first();
  await expect(landingCta).toBeVisible({ timeout: 20_000 });
  await landingCta.evaluate((button) => (button as HTMLButtonElement).click());

  await expect(page.getByRole('heading', { name: 'Welcome to Bytspot' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('google-signin-button')).toContainText('Google unavailable here');
  await expect(page.getByText('Google Sign-In is not enabled for this preview address. Create your account with email and password instead.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
});
