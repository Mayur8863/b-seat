import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { signOut } from './helpers';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function fillSignUp(page: Page, email: string) {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
}

test('owner signs up and lands on the dashboard', async ({ page }) => {
  await fillSignUp(page, uniqueEmail());
  await page.getByRole('radio', { name: /I own a space/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Signed in as Ada Lovelace')).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('renter signs up, skips preferences and lands on the dashboard', async ({ page }) => {
  await fillSignUp(page, uniqueEmail());
  await page.getByRole('radio', { name: /I need a space/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Where do you want a space?' }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Signed in as Ada Lovelace')).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('sign-up without a role shows the role error with no WCAG violations', async ({ page }) => {
  await fillSignUp(page, uniqueEmail());
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Choose whether you own a space or need one')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations).toEqual([]);
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
