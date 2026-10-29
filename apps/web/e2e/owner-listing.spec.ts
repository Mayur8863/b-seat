import { expect, test } from '@playwright/test';

import { expectNoAxeViolations, signUp } from './marketplace-helpers';

// T025 and the SC-001 timed journey (T070). Desktop only, like the other journeys.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

test('SC-001: a new owner signs up, lists 20 seats, prices and publishes in minutes', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const started = Date.now();
  let steps = 0;
  const step = () => {
    steps += 1;
  };

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page
    .getByLabel('Email')
    .fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('radio', { name: /I own a space/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  for (let i = 0; i < 5; i++) step(); // name, email, password, role, submit
  await page.waitForURL(/\/dashboard$/);

  await page.getByRole('link', { name: 'List a space' }).first().click();
  await page.getByRole('button', { name: 'Create space' }).click(); // empty submit: errors
  await expectNoAxeViolations(page);
  await page.getByLabel('Name').fill('SC001 Hub');
  await page.getByLabel('Description').fill('Quiet desks near the station.');
  await page.getByLabel('Country').selectOption({ label: 'United Kingdom' });
  await page.getByLabel('City').fill('London');
  await page.getByLabel('Area or locality').fill('Hoxton');
  await page.getByLabel('Street address').fill('2 Test Road');
  await page.getByLabel('Currency').selectOption({ label: 'GBP British Pound' });
  await page.getByRole('radio', { name: /Open 24 hours/ }).check();
  await page.getByRole('button', { name: 'Create space' }).click();
  for (let i = 0; i < 9; i++) step();
  await page.waitForURL(/\/owner\/spaces\/[0-9a-f-]{36}$/);
  const spaceUrl = page.url();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Add at least one seat')).toBeVisible();
  await expect(page.getByText('Price at least one pass')).toBeVisible();
  await expectNoAxeViolations(page);
  step();

  await page.getByRole('link', { name: 'Seats', exact: true }).first().click();
  await page.getByLabel('Label prefix').fill('A-');
  await page.getByLabel('From number').fill('1');
  await page.getByLabel('To number').fill('20');
  await page.getByRole('button', { name: /Add 20 seats/ }).click();
  await expect(page.getByText('A-20').first()).toBeVisible();
  for (let i = 0; i < 4; i++) step();
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'Passes and prices' }).first().click();
  await page.getByLabel('Day pass').first().fill('20');
  await page.getByRole('button', { name: 'Save prices' }).click();
  await expect(page.getByText('Prices saved').first()).toBeVisible();
  for (let i = 0; i < 2; i++) step();

  await page.goto(spaceUrl);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  step();
  await expectNoAxeViolations(page);

  const seconds = Math.round((Date.now() - started) / 100) / 10;
  console.warn(`SC001 seconds=${seconds} steps=${steps}`);
  expect(seconds).toBeLessThan(600);
  await ctx.close();
});

test('a renter opening an owner page sees the gate and no axe violations', async ({ page }) => {
  await signUp(page, 'renter');
  await page.goto('/owner/spaces/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Owners only' })).toBeVisible();
  await expectNoAxeViolations(page);
});
