import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const path of ['/book', '/bookings']) {
  test(`${path} redirects signed-out visitors to sign-in`, async ({ page }) => {
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

const focusVisible = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      matches: el?.matches(':focus-visible') ?? false,
      label: el?.getAttribute('id') ?? el?.tagName ?? '',
    };
  });

test('/book can be completed with the keyboard only', async ({ page }) => {
  await signUp(page);
  await page.goto('/book');
  const radios = page.getByRole('radio');
  await expect(radios.first()).toBeVisible();

  // Start the sequential focus point at the group heading, as a keyboard user arriving here would.
  await page.getByRole('heading', { level: 2, name: 'Office space' }).click();
  await page.keyboard.press('Tab');
  await expect(radios.first()).toBeFocused();
  expect((await focusVisible(page)).matches).toBe(true);

  // Arrow keys move focus and select within the group.
  await page.keyboard.press('ArrowDown');
  await expect(radios.nth(1)).toBeFocused();
  await expect(radios.nth(1)).toBeChecked();
  expect((await focusVisible(page)).matches).toBe(true);

  // A native date input has several segments (day, month, year), so it takes more than one Tab.
  const date = page.getByLabel('Date');
  await page.keyboard.press('Tab');
  await expect(date).toBeFocused();
  expect((await focusVisible(page)).matches).toBe(true);
  for (
    let i = 0;
    i < 5 && !(await page.getByLabel('Start time').evaluate((el) => el === document.activeElement));
    i++
  ) {
    await expect(date).toBeFocused();
    await page.keyboard.press('Tab');
  }
  for (const label of ['Start time', 'End time']) {
    await expect(page.getByLabel(label)).toBeFocused();
    expect((await focusVisible(page)).matches).toBe(true);
    await page.keyboard.press('Tab');
  }
  await expect(page.getByRole('button', { name: 'Show seats' })).toBeFocused();
  expect((await focusVisible(page)).matches).toBe(true);

  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText(/\d+ of \d+ seats free\./);
});

test('/book moves focus to End time when the range is invalid', async ({ page }) => {
  await signUp(page);
  await page.goto('/book');
  await page.getByRole('radio').first().check();
  await page.getByLabel('Start time').selectOption('15:00');
  await page.getByLabel('End time').selectOption('10:00');
  // Enter in a select does not submit, so submit from the date field.
  await page.getByLabel('Date').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('End time must be after start time')).toBeVisible();
  await expect(page.getByLabel('End time')).toBeFocused();
  await expect(page.getByLabel('End time')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/\d+ of \d+ seats free/)).toHaveCount(0);
});

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
