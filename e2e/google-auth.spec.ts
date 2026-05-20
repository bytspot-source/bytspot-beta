import { expect, type Page, test } from '@playwright/test';

async function installGoogleAuthMocks(page: Page) {
  await page.addInitScript(() => {
    type GoogleMockWindow = Window & {
      __BYT_GOOGLE_CLIENT_ID__?: string;
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

test('Parker consumer can continue with Google Sign-In', async ({ page }) => {
  await installGoogleAuthMocks(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');

  const landingCta = page.getByRole('button', { name: /Let's Go/i }).first();
  await expect(landingCta).toBeVisible({ timeout: 20_000 });
  await landingCta.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole('heading', { name: 'Welcome to Bytspot' })).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('google-signin-button').getByRole('button', { name: 'Continue with Google' }).click();

  await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_auth_token'))).toBe('parker-google-token');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bytspot_user') || '{}').email)).toBe('google.consumer@bytspot.test');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
});
