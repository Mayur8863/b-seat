import { expect, test } from '@playwright/test';

import {
  dayFromNow,
  expectNoAxeViolations,
  publishSpaceViaApi,
  signUp,
} from './marketplace-helpers';

// T032: the owner sets prices, the renter sees exactly them; a mode switch keeps an existing booking.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

test('owner prices three slots; renter sees them and the saving; switching to fixed hours keeps a night booking', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const owner = await ownerCtx.newPage();
  await signUp(owner, 'owner');
  const id = await publishSpaceViaApi(owner, {
    name: 'Price Hub',
    city: 'Prc',
    seats: 3,
    prefix: 'R-',
  });

  // Invalid input first: a field error, then axe.
  await owner.goto(`/owner/spaces/${id}/pricing`);
  await owner.locator('#day-day').fill('abc');
  await owner.getByRole('button', { name: 'Save prices' }).click();
  await expect(owner.locator('#day-day')).toHaveAttribute('aria-invalid', 'true');
  await expectNoAxeViolations(owner);

  const prices: Record<string, string> = {
    'day-day': '12',
    'day-month': '240',
    'night-day': '9',
    'night-month': '180',
    'full_day-day': '18',
    'full_day-month': '300',
  };
  for (const [field, value] of Object.entries(prices)) await owner.locator(`#${field}`).fill(value);
  await owner.locator('#day-week').fill('');
  await owner.getByRole('button', { name: 'Save prices' }).click();
  await expect(owner.getByText('Prices saved').first()).toBeVisible();
  await expectNoAxeViolations(owner);

  const renterCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const renter = await renterCtx.newPage();
  await signUp(renter, 'renter');
  await renter.goto(`/spaces/${id}`);
  await expect(renter.getByRole('radio', { name: /Day pass, Day slot.*£12\.00/ })).toBeVisible();
  await expect(
    renter.getByRole('radio', { name: /Monthly pass, Day slot.*£240\.00/ }),
  ).toBeVisible();
  await expect(renter.getByRole('radio', { name: /Weekly pass, Day slot/ })).toHaveCount(0);
  await expect(
    renter.getByRole('radio', { name: /Monthly pass, 24-hour slot.*£300\.00/ }),
  ).toBeVisible();
  await expect(renter.getByText(/Save £3\.00 \(\d+%\) compared with day and night/)).toBeVisible();
  await expectNoAxeViolations(renter);

  // A night booking exists; the owner then switches the space to fixed working hours.
  await renter.getByRole('radio', { name: /Day pass, Night slot/ }).check();
  await renter.getByLabel('Start date').fill(dayFromNow(5));
  await renter.getByRole('radio', { name: /R-1, Free/ }).check();
  await renter.getByRole('button', { name: 'Review booking' }).click();
  await renter.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(renter.getByText('Booking confirmed')).toBeVisible();

  await owner.goto(`/owner/spaces/${id}`);
  await owner.getByRole('radio', { name: /Fixed working hours/ }).check();
  await owner.getByLabel('Opens at').fill('09:00');
  await owner.getByLabel('Closes at').fill('18:00');
  await owner.getByRole('button', { name: 'Save details' }).click();
  await expect(owner.getByText(/saved/i).first()).toBeVisible();
  await owner.goto(`/owner/spaces/${id}/pricing`);
  await owner.locator('#working_hours-day').fill('11');
  await owner.getByRole('button', { name: 'Save prices' }).click();
  await expect(owner.getByText('Prices saved').first()).toBeVisible();

  await renter.goto(`/spaces/${id}`);
  await expect(renter.getByRole('radio', { name: /Working hours/ }).first()).toBeVisible();
  await expect(renter.getByRole('radio', { name: /Night slot|24-hour slot/ })).toHaveCount(0);
  await renter.goto('/bookings');
  await expect(renter.getByText('R-1')).toBeVisible();
  await expectNoAxeViolations(renter);
  await ownerCtx.close();
  await renterCtx.close();
});
