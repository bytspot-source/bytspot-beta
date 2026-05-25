import { expect, test, type Locator, type Page } from '@playwright/test';

async function openMap(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
  });
  await page.goto('/');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('bytspot:native-tab', { detail: { tab: 'map' } }));
  });
  await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true');
}

async function expectReadableToast(toast: Locator, expectedText: string) {
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(expectedText);

  const styles = await toast.evaluate((node) => {
    const toastStyles = getComputedStyle(node as HTMLElement);
    const title = node.querySelector('[data-title]') as HTMLElement | null;
    const description = node.querySelector('[data-description]') as HTMLElement | null;
    const titleStyles = title ? getComputedStyle(title) : null;
    const descriptionStyles = description ? getComputedStyle(description) : null;
    const toaster = document.querySelector('[data-sonner-toaster]') as HTMLElement | null;
    const toasterStyles = toaster ? getComputedStyle(toaster) : null;
    return {
      toastColor: toastStyles.color,
      toastBackground: toastStyles.backgroundColor,
      titleColor: titleStyles?.color,
      descriptionColor: descriptionStyles?.color,
      descriptionOpacity: descriptionStyles?.opacity,
      normalText: toasterStyles?.getPropertyValue('--normal-text').trim(),
      successText: toasterStyles?.getPropertyValue('--success-text').trim(),
      errorText: toasterStyles?.getPropertyValue('--error-text').trim(),
    };
  });

  expect(styles.toastBackground).toBe('rgb(226, 232, 240)');
  expect(styles.toastColor).toBe('rgb(2, 6, 23)');
  expect(styles.titleColor).toBe('rgb(2, 6, 23)');
  expect(styles.descriptionColor).toBe('rgb(2, 6, 23)');
  expect(styles.descriptionOpacity).toBe('1');
  expect(styles.normalText).toBe('#020617');
  expect(styles.successText).toBe('#052e16');
  expect(styles.errorText).toBe('#450a0a');
}

test.describe('Toast contrast', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('renders readable high-contrast toast text across global Sonner styles', async ({ page }) => {
    await openMap(page);
    await page.getByTestId('partnered-vendors-patch-button').click();

    const toast = page.locator('[data-sonner-toast]').first();
    await expectReadableToast(toast, 'Partnered vendors');
  });
});