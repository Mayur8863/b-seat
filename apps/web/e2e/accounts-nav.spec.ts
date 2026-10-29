import { expect, test } from '@playwright/test';

import { expectNoAxeViolations, signUp } from './marketplace-helpers';

// T016 and T070: the signed-in redirects, the stale-cookie case and the protected-route sweep.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

const ID = '3f2b1c9e-8a4d-4e6b-9c1a-2d5e7f8a9b0c';
const PROTECTED = [
  '/dashboard',
  '/find',
  '/spaces',
  `/spaces/${ID}`,
  '/bookings',
  '/owner/spaces/new',
  `/owner/spaces/${ID}`,
  `/owner/spaces/${ID}/seats`,
  `/owner/spaces/${ID}/pricing`,
  `/owner/spaces/${ID}/availability`,
  `/owner/spaces/${ID}/bookings`,
  `/owner/spaces/${ID}/layout`,
];

test('every protected route sends a guest to sign-in with next (FR-005)', async ({ page }) => {
  for (const path of PROTECTED) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
  }
});

test('a signed-in visitor skips sign-up and follows only safe next targets', async ({ page }) => {
  await signUp(page, 'renter');
  await page.goto('/sign-up');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/sign-in?next=/find');
  await expect(page).toHaveURL(/\/find$/);
  await page.goto('/sign-in?next=//example.com');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('a renter dashboard shows the neutral card and a Find a space link', async ({ page }) => {
  await signUp(page, 'renter');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a space' }).first()).toBeVisible();
  await expectNoAxeViolations(page);
});

test('a stale cookie renders sign-in and sign-up without a redirect loop', async ({
  page,
  context,
}) => {
  await signUp(page, 'owner');
  // Invalidate the session on the server but keep the cookie in the browser.
  const cookies = await context.cookies();
  const res = await page.request.post('/api/auth/sign-out', {
    data: {},
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.ok()).toBe(true);
  await context.clearCookies();
  await context.addCookies(cookies);
  for (const path of ['/sign-up', '/sign-in']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await expectNoAxeViolations(page);
});

test('a keyboard-only user reaches every main nav page from the dashboard', async ({ page }) => {
  await signUp(page, 'owner');
  const nav = page.getByRole('navigation', { name: 'Main' });
  // The owner links appear once the session has loaded, so wait for one before counting.
  await expect(nav.getByRole('link', { name: 'List a space' })).toBeVisible();
  const links = await nav.getByRole('link').all();
  expect(links.length).toBeGreaterThanOrEqual(3);
  const names = await Promise.all(links.map((l) => l.innerText()));
  for (const name of names) {
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name, exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  }
});
