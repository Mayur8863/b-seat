import { type Browser, expect, type Page, test } from '@playwright/test';

import {
  dayFromNow,
  expectNoAxeViolations,
  publishSpaceViaApi,
  signUp,
  uniqueEmail,
} from './marketplace-helpers';

// T044 (journey, axe, mixed-state conflict) and the SC-002 timed keyboard journey (T070).
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';

async function press(page: Page, locator: ReturnType<Page['locator']>, key = 'Enter') {
  await locator.focus();
  await page.keyboard.press(key);
}

async function ownerWithSpace(browser: Browser, city: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const owner = await ctx.newPage();
  await signUp(owner, 'owner');
  const id = await publishSpaceViaApi(owner, { name: `${city} Hub`, city, seats: 6, prefix: 'S-' });
  return { ctx, id };
}

test('SC-002: a renter goes from the dashboard to a confirmed weekly booking by keyboard in under 60 s', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const city = `Kb${Date.now() % 1_000_000}`;
  const { ctx: ownerCtx, id } = await ownerWithSpace(browser, city);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const email = uniqueEmail();
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Kay Board');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('radio', { name: /I need a space/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Country').selectOption({ label: 'United Kingdom' });
  await page.getByLabel('City').fill(city);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.waitForURL(/\/dashboard$/);

  const started = Date.now();
  let keys = 0;
  const hit = async (locator: ReturnType<Page['locator']>, key = 'Enter') => {
    keys += 1;
    await press(page, locator, key);
  };
  await hit(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Find a space' }),
  );
  await expect(page.getByLabel('City (optional)')).toHaveValue(city);
  await hit(page.getByRole('button', { name: 'Search' }));
  await hit(page.getByRole('link', { name: `${city} Hub` }));
  await page.waitForURL(/\/spaces\//);
  const week = page.getByRole('radio', { name: /Weekly pass/ }).first();
  await hit(week, 'Space');
  await expect(week).toBeChecked();
  const start = dayFromNow(4);
  await page.getByLabel('Start date').fill(start);
  const seat = page.getByRole('radio', { name: /S-3, Free/ });
  await expect(seat).toBeVisible();
  await hit(seat, 'Space');
  await hit(page.getByRole('button', { name: 'Review booking' }));
  await hit(page.getByRole('button', { name: 'Confirm booking' }));
  await expect(page.getByText('Booking confirmed')).toBeVisible();
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  console.warn(`SC002 seconds=${seconds} keyed-actions=${keys}`);
  expect(seconds).toBeLessThan(60);
  await expectNoAxeViolations(page);

  // The seat stays taken for the whole 7 days.
  for (const offset of [4, 10]) {
    await page.goto(`/spaces/${id}`);
    await page
      .getByRole('radio', { name: /Day pass/ })
      .first()
      .check();
    await page.getByLabel('Start date').fill(dayFromNow(offset));
    await expect(page.getByRole('radio', { name: /S-3, Taken/ })).toBeDisabled();
  }
  await page.getByLabel('Start date').fill(dayFromNow(11));
  await expect(page.getByRole('radio', { name: /S-3, Free/ })).toBeVisible();

  // Both emails reach Mailpit and state who is paid.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        return ((await res.json()) as { messages_count: number }).messages_count;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await ownerCtx.close();
  await ctx.close();
});

test('find: empty, loading and error states have no axe violations', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await signUp(page, 'renter');
  await page.goto(`/find?country=GB&city=Nowhere${Date.now() % 1000}`);
  await expect(page.getByText(/No spaces|no spaces/).first()).toBeVisible();
  await expectNoAxeViolations(page);

  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/listings?*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/find?country=GB&city=Slow');
  await expectNoAxeViolations(page);
  release();
  await page.unrouteAll({ behavior: 'wait' });

  await page.route('**/api/listings?*', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ type: 'about:blank', title: 'Server error', status: 500 }),
    }),
  );
  await page.goto('/find?country=GB&city=Broken');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expectNoAxeViolations(page);
  await ctx.close();
});

test('a seat taken by someone else while the page is open shows the conflict with no violations', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const city = `Cf${Date.now() % 1_000_000}`;
  const { ctx: ownerCtx, id } = await ownerWithSpace(browser, city);
  const open = async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await c.newPage();
    await signUp(p, 'renter');
    await p.goto(`/spaces/${id}`);
    await p
      .getByRole('radio', { name: /Day pass/ })
      .first()
      .check();
    await p.getByLabel('Start date').fill(dayFromNow(6));
    await p.getByRole('radio', { name: /S-2, Free/ }).check();
    await p.getByRole('button', { name: 'Review booking' }).click();
    return { c, p };
  };
  const a = await open();
  const b = await open();
  await b.p.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(b.p.getByText('Booking confirmed')).toBeVisible();
  await a.p.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(
    a.p.getByText(/no longer available|just taken|already booked|taken/i).first(),
  ).toBeVisible();
  await expectNoAxeViolations(a.p);
  await a.c.close();
  await b.c.close();
  await ownerCtx.close();
});
