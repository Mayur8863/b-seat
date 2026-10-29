import { expect, test } from '@playwright/test';

import {
  bookDayPass,
  dayFromNow,
  expectNoAxeViolations,
  publishSpaceViaApi,
  signUp,
} from './marketplace-helpers';

// T049: occupancy through the seats page, as seen by a renter.
test.use({ actionTimeout: 10_000 });
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

test('a marked seat is taken for renters until it is marked vacant; a conflict shows in the dialog', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const owner = await ownerCtx.newPage();
  await signUp(owner, 'owner');
  const id = await publishSpaceViaApi(owner, {
    name: 'Occ Hub',
    city: 'Occ',
    seats: 4,
    prefix: 'O-',
  });
  const renterCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const renter = await renterCtx.newPage();
  await signUp(renter, 'renter');

  // Renter books O-3 for day+9; the owner then tries to mark it over that day.
  await bookDayPass(renter, id, 'O-3', 9);

  await owner.goto(`/owner/spaces/${id}/seats`);
  await expectNoAxeViolations(owner);
  await owner.getByRole('checkbox', { name: 'Select seat O-3' }).check();
  await owner.getByRole('button', { name: 'Mark occupied' }).click();
  await owner.getByLabel('Start date').fill(dayFromNow(8));
  await owner.getByRole('radio', { name: 'On a date' }).check();
  await owner.getByLabel('End date').fill(dayFromNow(10));
  await owner.getByRole('button', { name: 'Mark occupied' }).last().click();
  await expect(owner.getByRole('alert').first()).toBeVisible();
  await expectNoAxeViolations(owner);
  await owner.getByRole('button', { name: 'Cancel' }).click();

  // A free seat can be marked for a week and the renter then sees it taken and cannot book it.
  await owner.reload();
  await owner.getByRole('checkbox', { name: 'Select seat O-2' }).check();
  await owner.getByRole('button', { name: 'Mark occupied' }).click();
  await owner.getByLabel('Start date').fill(dayFromNow(7));
  await owner.getByRole('radio', { name: 'On a date' }).check();
  await owner.getByLabel('End date').fill(dayFromNow(13));
  await owner.getByLabel('Note (optional)').fill('Private: long-term tenant');
  await owner.getByRole('button', { name: 'Mark occupied' }).last().click();
  await expect(
    owner
      .getByRole('status')
      .filter({ hasText: /occupied|marked/i })
      .first(),
  ).toBeVisible();
  await expectNoAxeViolations(owner);

  await renter.goto(`/spaces/${id}`);
  await renter
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();
  await renter.getByLabel('Start date').fill(dayFromNow(10));
  await expect(renter.getByRole('radio', { name: /O-2, Taken/ })).toBeDisabled();
  await expect(renter.getByText('long-term tenant')).toHaveCount(0);

  // Removing the mark frees the seat for renters; the current-mark Mark vacant path is covered by api tests.
  await owner.reload();
  await owner
    .getByRole('button', { name: /Occupancy \(1/ })
    .first()
    .click();
  await owner.getByRole('list', { name: 'Occupancy for seat O-2' }).getByRole('button').click();
  await owner.getByRole('alertdialog').getByRole('button', { name: 'Remove mark' }).click();
  await expect(owner.getByRole('alertdialog')).toBeHidden();
  await renter.reload();
  await renter
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();
  await renter.getByLabel('Start date').fill(dayFromNow(10));
  await expect(renter.getByRole('radio', { name: /O-2, Free/ })).toBeVisible();
  await ownerCtx.close();
  await renterCtx.close();
});
