import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const path of ['/book', '/bookings']) {
  test(`${path} redirects signed-out visitors to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
  });
}

test('/book lists spaces and seats and has no WCAG 2.1 AA violations', async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Grace Hopper');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/book');
  await expect(page.getByRole('heading', { level: 1, name: 'Book a seat' })).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);

  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Show seats' }).click();
  await expect(page.getByRole('status')).toContainText(/\d+ of \d+ seats free\./);
  expect((await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()).violations).toEqual([]);
});
