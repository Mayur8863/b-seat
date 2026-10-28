import { expect, test } from '@playwright/test';

import {
  dayFromNow,
  expectNoAxeViolations,
  publishSpaceViaApi,
  signUp,
} from './marketplace-helpers';

// The journeys drive the desktop layout; the mobile project is covered by the 375px checks below.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

test('owner lists a space; renter books a pass; owner sees it; renter cancels and the seat is free', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const name = `E2E Hub ${Date.now() % 1_000_000}`;
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const owner = await ownerCtx.newPage();
  await signUp(owner, 'owner');

  // Owner lists the space from the dashboard, with no typed URL.
  await owner.getByRole('link', { name: 'List a space' }).first().click();
  await expect(owner.getByRole('heading', { level: 1, name: 'List a space' })).toBeVisible();
  await expectNoAxeViolations(owner);
  await owner.getByLabel('Name').fill(name);
  await owner.getByLabel('Description').fill('Quiet desks near the station.');
  await owner.getByLabel('Country').selectOption({ label: 'United Kingdom' });
  await owner.getByLabel('City').fill('London');
  await owner.getByLabel('Area or locality').fill('Hoxton');
  await owner.getByLabel('Street address').fill('2 Test Road');
  await owner.getByLabel('Currency').selectOption({ label: 'GBP British Pound' });
  await owner.getByRole('radio', { name: /Open 24 hours/ }).check();
  await owner.getByRole('button', { name: 'Create space' }).click();
  await owner.waitForURL(/\/owner\/spaces\/[0-9a-f-]{36}$/);
  const spaceUrl = owner.url();

  // Publishing is refused until there are seats and a price (US2 AS4).
  await owner.getByRole('button', { name: 'Publish' }).click();
  await expect(owner.getByText('Add at least one seat')).toBeVisible();
  await expect(owner.getByText('Price at least one pass')).toBeVisible();

  await owner.getByRole('link', { name: 'Seats', exact: true }).first().click();
  await owner.getByLabel('Label prefix').fill('B-');
  await owner.getByLabel('From number').fill('1');
  await owner.getByLabel('To number').fill('4');
  await owner.getByRole('button', { name: /Add 4 seats/ }).click();
  await expect(owner.getByText('B-4').first()).toBeVisible();
  await owner.getByLabel('Label', { exact: true }).fill('B-1');
  await owner.getByRole('button', { name: 'Add seat', exact: true }).click();
  await expect(owner.getByText('B-1 is already used by another seat')).toBeVisible();
  await expectNoAxeViolations(owner);

  await owner.getByRole('link', { name: 'Passes and prices' }).first().click();
  await owner.getByLabel('Day pass').first().fill('20');
  await owner.getByLabel('Weekly pass').first().fill('110.5');
  await owner.getByLabel('Monthly pass').first().fill('300');
  await owner.getByRole('button', { name: 'Save prices' }).click();
  await expect(owner.getByText('Prices saved').first()).toBeVisible();
  await expectNoAxeViolations(owner);

  await owner.goto(spaceUrl);
  await owner.getByRole('button', { name: 'Publish' }).click();
  await expect(owner.getByText('Published', { exact: true }).first()).toBeVisible();

  // Renter finds it by city (case-insensitive) and books a day pass on seat B-2.
  const renterCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const renter = await renterCtx.newPage();
  await signUp(renter, 'renter');
  await renter.getByRole('link', { name: 'Find a space' }).first().click();
  await renter.getByLabel('Country').selectOption({ label: 'United Kingdom' });
  await renter.getByLabel('City (optional)').fill('london');
  await renter.getByRole('button', { name: 'Search' }).click();
  await renter.getByRole('link', { name }).click();
  await renter.waitForURL(/\/spaces\//);
  const spaceId = renter.url().split('/').pop() ?? '';
  await renter
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();
  await renter.getByLabel('Start date').fill(dayFromNow(2));
  await expect(renter.getByRole('radio', { name: /B-2, Free/ })).toBeVisible();
  await expectNoAxeViolations(renter);
  await renter.getByRole('radio', { name: /B-2, Free/ }).check();
  await renter.getByRole('button', { name: 'Review booking' }).click();
  await expect(renter.getByRole('alertdialog')).toBeVisible();
  await expectNoAxeViolations(renter);
  await renter.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(renter.getByText(/directly to the owner/).first()).toBeVisible();
  await expect(renter.getByText('Booking confirmed')).toBeVisible();
  await expectNoAxeViolations(renter);

  // The seat is now taken for that period, and My bookings lists it.
  await renter.reload();
  await renter
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();
  await renter.getByLabel('Start date').fill(dayFromNow(2));
  await expect(renter.getByRole('radio', { name: /B-2, Taken/ })).toBeDisabled();
  await renter.goto('/bookings');
  await expect(renter.getByText('B-2')).toBeVisible();
  await expectNoAxeViolations(renter);

  // The owner sees the renter's booking with name and email.
  await owner.goto(`${spaceUrl}/bookings`);
  await expect(owner.getByText('1 booking')).toBeVisible();
  await expect(owner.getByText('B-2')).toBeVisible();
  await expectNoAxeViolations(owner);

  // Renter cancels; the whole period is free again.
  await renter.goto('/bookings');
  await renter.getByRole('button', { name: /Cancel booking/ }).click();
  await renter
    .getByRole('alertdialog')
    .getByRole('button', { name: /Cancel booking|Yes/ })
    .last()
    .click();
  await expect(renter.getByText(/no upcoming bookings/)).toBeVisible();
  await renter.goto(`/spaces/${spaceId}`);
  await renter
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();
  await renter.getByLabel('Start date').fill(dayFromNow(2));
  await expect(renter.getByRole('radio', { name: /B-2, Free/ })).toBeVisible();
  await ownerCtx.close();
  await renterCtx.close();
});

test('a renter cannot reach owner pages and a guest is sent to sign-in', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, 'renter');
  await page.goto('/owner/spaces/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Owners only' })).toBeVisible();
  await expectNoAxeViolations(page);
  await ctx.close();
});

// Known defects (specs/002-space-marketplace/qa-report.md). Each test states the correct behaviour and is
// marked test.fail so it flips to a failure ("expected to fail but passed") once the bug is fixed.
test('an empty sign-up form moves focus to the first invalid field', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Name')).toBeFocused();
});

test.describe('known defects', () => {
  test('QA-01 owner space tabs do not scroll the page sideways at 375px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    await signUp(page, 'owner');
    const id = await publishSpaceViaApi(page, {
      name: 'QA01 Hub',
      city: 'Qa01',
      seats: 2,
      prefix: 'A-',
    });
    for (const tab of ['', '/seats', '/pricing', '/layout', '/availability', '/bookings']) {
      await page.goto(`/owner/spaces/${id}${tab}`);
      await expect(page.getByRole('navigation', { name: 'Space management' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `tab ${tab || 'details'}`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });

  test('QA-02 the layout editor has no accessibility violations', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, 'owner');
    const id = await publishSpaceViaApi(page, {
      name: 'QA02 Hub',
      city: 'Qa02',
      seats: 2,
      prefix: 'A-',
    });
    await page.goto(`/owner/spaces/${id}/layout`);
    await expect(page.getByRole('heading', { level: 1, name: 'Layout' })).toBeVisible();
    await expectNoAxeViolations(page);
    await ctx.close();
  });

  test('QA-03 /find?country=GB shows the country in the select', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, 'renter');
    await page.goto('/find?country=GB&city=London');
    await expect(page.getByText(/spaces? in London, United Kingdom/)).toBeVisible();
    await expect(page.getByLabel('Country')).toHaveValue('GB');
    await ctx.close();
  });

  test('QA-04 My bookings content starts at the same left edge as the other pages', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await signUp(page, 'renter');
    const left = async (path: string) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      return page
        .getByRole('heading', { level: 1 })
        .evaluate((h) => Math.round(h.getBoundingClientRect().left));
    };
    const find = await left('/find');
    expect(await left('/bookings')).toBe(find);
    await ctx.close();
  });

  test('QA-05 seats are listed in natural order (M-2 before M-10)', async ({ browser }) => {
    test.fail();
    const ownerCtx = await browser.newContext();
    const owner = await ownerCtx.newPage();
    await signUp(owner, 'owner');
    const id = await publishSpaceViaApi(owner, {
      name: 'QA05 Hub',
      city: 'Qa05',
      seats: 12,
      prefix: 'M-',
    });
    const renterCtx = await browser.newContext();
    const renter = await renterCtx.newPage();
    await signUp(renter, 'renter');
    const res = await renter.request.get(
      `/api/listings/${id}/seats?pass=day&slot=day&startDate=${dayFromNow(3)}`,
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data?: { seats?: { label: string }[] };
      seats?: { label: string }[];
    };
    const labels = (body.data?.seats ?? body.seats ?? []).map((seat) => seat.label);
    expect(labels).toHaveLength(12);
    expect(labels.slice(0, 3)).toEqual(['M-1', 'M-2', 'M-3']);
    await ownerCtx.close();
    await renterCtx.close();
  });

  test('QA-06 submitting an empty create-space form moves focus to the first invalid field', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, 'owner');
    await page.goto('/owner/spaces/new');
    await page.getByRole('button', { name: 'Create space' }).click();
    await expect(page.getByLabel('Name')).toBeFocused();
    await ctx.close();
  });
});
