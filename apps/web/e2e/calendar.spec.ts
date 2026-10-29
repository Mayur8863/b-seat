import { expect, test } from '@playwright/test';

import { expectNoAxeViolations, publishSpaceViaApi, signUp } from './marketplace-helpers';

// T053: a Mon-Fri shared calendar closes weekend starts; a weekly pass skips closed days.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

/** Next date (2 to 9 days ahead) that falls on `weekday` (0 = Sunday), as YYYY-MM-DD in UTC. */
function nextWeekday(weekday: number) {
  for (let n = 2; n < 10; n++) {
    const d = new Date(Date.now() + n * 86_400_000);
    if (d.getUTCDay() === weekday) return d.toISOString().slice(0, 10);
  }
  throw new Error('unreachable');
}

test('closed days block a start, a weekly pass skips them, and the page is accessible', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const owner = await ownerCtx.newPage();
  await signUp(owner, 'owner');
  const id = await publishSpaceViaApi(owner, {
    name: 'Cal Hub',
    city: 'Cal',
    seats: 3,
    prefix: 'C-',
  });
  const today = new Date().toISOString().slice(0, 10);
  const put = await owner.request.put(`/api/owner/spaces/${id}/calendars/shared`, {
    data: {
      startDate: today,
      endDate: null,
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    },
  });
  expect(put.ok()).toBe(true);

  await owner.goto(`/owner/spaces/${id}/availability`);
  await expect(owner.getByRole('heading', { level: 2, name: 'Shared calendar' })).toBeVisible();
  await expect(
    owner.getByRole('heading', { level: 2, name: 'Seats with their own calendar' }),
  ).toBeVisible();
  await expectNoAxeViolations(owner);

  const renterCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const renter = await renterCtx.newPage();
  await signUp(renter, 'renter');
  await renter.goto(`/spaces/${id}`);
  await renter
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();

  await renter.getByLabel('Start date').fill(nextWeekday(6));
  await expect(renter.getByRole('radio', { name: /C-1, Closed on/ })).toBeDisabled();
  await expectNoAxeViolations(renter);

  await renter
    .getByRole('radio', { name: /Weekly pass/ })
    .first()
    .check();
  await renter.getByLabel('Start date').fill(nextWeekday(1));
  await expect(renter.getByRole('radio', { name: /C-1, Free/ })).toBeVisible();
  await expect(renter.getByText('Skips 2 closed days').first()).toBeVisible();
  await renter.getByRole('radio', { name: /C-1, Free/ }).check();
  await renter.getByRole('button', { name: 'Review booking' }).click();
  await renter.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(renter.getByText('Booking confirmed')).toBeVisible();
  await expectNoAxeViolations(renter);

  // Closing every weekday later never cancels the booking and the owner is told how many fall outside.
  const narrow = await owner.request.put(`/api/owner/spaces/${id}/calendars/shared`, {
    data: { startDate: today, endDate: null, weekdays: ['sat'] },
  });
  expect(
    ((await narrow.json()) as { bookingsOutsideCalendar: number }).bookingsOutsideCalendar,
  ).toBe(1);
  await renter.goto('/bookings');
  await expect(renter.getByText('C-1')).toBeVisible();
  await owner.goto(`/owner/spaces/${id}/availability`);
  await expectNoAxeViolations(owner);
  await ownerCtx.close();
  await renterCtx.close();
});
