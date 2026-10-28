import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { signOut } from './helpers';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('new user signs up and lands on the dashboard', async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Signed in as Ada Lovelace')).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('dashboard redirects signed-out visitors to sign-in', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
});

for (const path of ['/', '/sign-in', '/sign-up']) {
  test(`${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
  });
}
