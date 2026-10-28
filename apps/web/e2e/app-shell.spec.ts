import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signOut } from './helpers';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Every route in the proxy matcher (T014); FR-005.
for (const path of ['/dashboard', '/book', '/find', '/spaces', '/bookings', '/owner/spaces/new']) {
  test(`${path} redirects signed-out visitors to sign-in with next`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
  });
}

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Grace Hopper');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('signed-in shell: nav, current page, keyboard walk, mobile menu axe', async ({ page }) => {
  await signUp(page);
  const nav = page.getByRole('navigation', { name: 'Main' });
  const menu = page.getByRole('button', { name: 'Menu' });
  const mobile = await menu.isVisible();

  await expect(page.getByRole('link', { name: 'Find a space' }).first()).toBeAttached();
  if (mobile) {
    await expect(nav).toBeHidden();
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(menu).toBeFocused();
  } else {
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
  }

  // Keyboard: from the skip link, every nav link gets a visible focus ring.
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /skip to/i })).toBeFocused();
  const focusVisible = () => page.evaluate(() => document.activeElement?.matches(':focus-visible'));

  await page.keyboard.press('Tab'); // brand link
  await expect(page.getByRole('link', { name: 'BSeat', exact: true })).toBeFocused();
  if (mobile) {
    await page.keyboard.press('Tab');
    await expect(menu).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
  }
  for (const name of ['Dashboard', 'Find a space']) {
    await page.keyboard.press('Tab');
    await expect(nav.getByRole('link', { name })).toBeFocused();
    expect(await focusVisible()).toBe(true);
  }
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/book$/);
  if (mobile) await menu.click();
  await expect(nav.getByRole('link', { name: 'Find a space' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await signOut(page);
  await expect(page).toHaveURL(/\/sign-in$/);
});
