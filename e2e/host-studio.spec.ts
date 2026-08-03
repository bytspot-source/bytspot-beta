import { expect, test } from '@playwright/test';

test('Network Host Studio turns a comedy vibe into a Platinum Party Pass', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const procedures: string[] = [];
  const requestBodies: string[] = [];

  await page.addInitScript(() => {
    localStorage.setItem('bytspot_auth_token', 'host-studio-e2e-token');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'host-1', name: 'Ava Host' }));
    localStorage.setItem('bytspot_user_name', 'Ava');
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_onboarding_complete', 'true');
  });

  await page.route('**/trpc/**', async (route) => {
    const procedure = new URL(route.request().url()).pathname.split('/trpc/')[1]?.split('?')[0] ?? '';
    procedures.push(procedure);
    requestBodies.push(route.request().postData() ?? '');
    let data: unknown = {};
    if (procedure.includes('subscription.status')) data = { isPremium: true };
    else if (procedure.includes('social.groups.list')) data = { groups: [{ id: 'circle-1', name: 'Weekend Crew', memberCount: 12, memberIds: [], role: 'owner' }] };
    else if (procedure.includes('social.invites.list')) data = { invites: [] };
    else if (procedure.includes('social.suggestions')) data = { items: [] };
    else if (procedure.includes('user.points.get')) data = { total: 0, lifetime: 0 };
    else if (procedure.includes('user.points.history')) data = { items: [] };
    else if (procedure.includes('events.drafts.create')) data = { id: 'party-comedy-1' };
    else if (procedure.includes('events.publish')) data = { id: 'party-comedy-1', shareUrl: 'https://bytspot.com/party/party-comedy-1', passCode: 'LAUGH26' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: { data } }) });
  });

  await page.goto('/');
  await page.getByRole('tab', { name: 'Network tab' }).click();
  await expect(page.getByRole('heading', { name: 'Network' })).toBeVisible();
  await page.getByTestId('host-studio-launch').click();
  await expect(page.getByTestId('host-studio')).toBeVisible();

  await page.getByRole('button', { name: /Comedy Night/ }).click();
  await page.getByRole('button', { name: 'Build this vibe' }).click();
  await page.getByLabel('Party title').fill('No Cameras Comedy');
  await page.getByLabel('Party venue').fill('Aster Room');
  await page.getByRole('button', { name: 'Set the door' }).click();
  await page.getByRole('button', { name: /Paid Ticket/ }).click();
  await page.getByRole('button', { name: 'platinum', exact: true }).click();
  await page.getByLabel('Ticket price').fill('35');
  await page.getByRole('button', { name: 'Invite your people' }).click();
  await page.getByRole('button', { name: /Weekend Crew/ }).click();
  await page.getByLabel('Co-host email').fill('door@example.com');
  await page.getByLabel('Co-host role').selectOption('door');
  await page.getByRole('button', { name: 'Drop the Moment' }).click();

  await expect(page.getByLabel('Party Pass live')).toBeVisible();
  await expect(page.getByText('LAUGH26')).toBeVisible();
  await expect(page.getByText('PLATINUM PARTY PASS')).toBeVisible();
  expect(procedures.some((name) => name.includes('events.drafts.create'))).toBe(true);
  expect(procedures.some((name) => name.includes('events.publish'))).toBe(true);
  expect(requestBodies.some((body) => body.includes('requiredMembershipTier') && body.includes('platinum') && body.includes('circle-1'))).toBe(true);
});