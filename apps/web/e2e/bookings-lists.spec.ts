import { expect, test } from '@playwright/test';

import {
  bookDayPass,
  dayFromNow,
  expectNoAxeViolations,
  publishSpaceViaApi,
  signUp,
} from './marketplace-helpers';

// T059: three renters book one space; each sees only their own, the owner sees all, cancelling frees the seat.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

test('renter and owner booking lists, date filter, empty states and cancel', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const owner = await ownerCtx.newPage();
  await signUp(owner, 'owner');
  const id = await publishSpaceViaApi(owner, {
    name: 'List Hub',
    city: 'Lst',
    seats: 4,
    prefix: 'L-',
  });

  const renters = [];
  for (const [i, offset] of [3, 12, 20].entries()) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await signUp(page, 'renter');
    await bookDayPass(page, id, `L-${i + 1}`, offset);
    renters.push({ ctx, page, seat: `L-${i + 1}` });
  }

  const r1 = renters.at(0);
  if (!r1) throw new Error('no renter');

  // Each renter sees only their own booking.
  for (const r of renters) {
    await r.page.goto('/bookings');
    await expect(r.page.getByText(r.seat, { exact: false }).first()).toBeVisible();
    for (const other of renters.filter((o) => o !== r)) {
      await expect(r.page.getByText(new RegExp(`\\b${other.seat}\\b`))).toHaveCount(0);
    }
  }
  await expectNoAxeViolations(r1.page);

  // The owner sees all three, then filters by date.
  await owner.goto(`/owner/spaces/${id}/bookings`);
  await expect(owner.getByText('3 bookings')).toBeVisible();
  await expectNoAxeViolations(owner);
  await owner.getByLabel('From (optional)').fill(dayFromNow(10));
  await owner.getByLabel('To (optional)').fill(dayFromNow(14));
  await owner.getByRole('button', { name: 'Filter' }).click();
  await expect(owner.getByText('1 booking', { exact: true })).toBeVisible();
  await expectNoAxeViolations(owner);
  await owner.getByLabel('From (optional)').fill(dayFromNow(25));
  await owner.getByLabel('To (optional)').fill(dayFromNow(27));
  await owner.getByRole('button', { name: 'Filter' }).click();
  await expect(owner.getByText('No bookings in that date range.')).toBeVisible();
  await expectNoAxeViolations(owner);

  // Cancelling frees the seat; the renter's list is then empty.
  await r1.page.goto('/bookings');
  await r1.page.getByRole('button', { name: /Cancel booking/ }).click();
  await expectNoAxeViolations(r1.page);
  await r1.page
    .getByRole('alertdialog')
    .getByRole('button', { name: /Cancel booking|Yes/ })
    .last()
    .click();
  await expect(r1.page.getByText(/no upcoming bookings/)).toBeVisible();
  await expectNoAxeViolations(r1.page);
  await r1.page.goto('/dashboard');
  await expectNoAxeViolations(r1.page);
  await r1.page.goto(`/spaces/${id}`);
  await r1.page
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();
  await r1.page.getByLabel('Start date').fill(dayFromNow(3));
  await expect(r1.page.getByRole('radio', { name: /L-1, Free/ })).toBeVisible();

  await ownerCtx.close();
  for (const r of renters) await r.ctx.close();
});
