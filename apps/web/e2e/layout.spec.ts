import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  dayFromNow,
  expectNoAxeViolations,
  publishSpaceViaApi,
  signUp,
} from './marketplace-helpers';

// T067: the layout editor with the keyboard only, then a renter books from the saved plan.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'desktop journeys');
});

async function key(page: Page, target: Locator, k: string) {
  await target.focus();
  await page.keyboard.press(k);
}

test('keyboard-only: place, move and resize seats, save, reload, and a renter books from the plan', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const owner = await ownerCtx.newPage();
  await signUp(owner, 'owner');
  const id = await publishSpaceViaApi(owner, {
    name: 'Plan Hub',
    city: 'Pln',
    seats: 3,
    prefix: 'A-',
  });

  await owner.goto(`/owner/spaces/${id}/layout`);
  await expect(owner.getByRole('heading', { level: 1, name: 'Layout' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(owner.getByRole('list', { name: 'Items not on the plan' })).toBeVisible({
    timeout: 15_000,
  });

  // Place every seat from the tray with Enter.
  for (const label of ['A-1', 'A-2', 'A-3']) {
    await key(
      owner,
      owner.getByRole('button', { name: new RegExp(`Place on plan.*seat ${label}`) }),
      'Enter',
    );
    await expect(
      owner.getByRole('button', { name: new RegExp(`^Seat ${label}, column`) }),
    ).toBeVisible({ timeout: 15_000 });
  }

  // Pick up A-1, move it down twice, drop it, then resize it with Shift+Arrow.
  const a1 = () => owner.getByRole('button', { name: /^Seat A-1, column/ });
  const before = (await a1().getAttribute('aria-label')) ?? (await a1().innerText());
  await a1().focus();
  await owner.keyboard.press('Space');
  await owner.keyboard.press('ArrowDown');
  await owner.keyboard.press('ArrowDown');
  await owner.keyboard.press('Space');
  await expectNoAxeViolations(owner);
  await owner.getByRole('button', { name: /^Seat A-1, column/ }).focus();
  await owner.keyboard.press('Shift+ArrowDown');
  await owner.keyboard.press('Enter'); // opens the name editor, form open for axe
  await expectNoAxeViolations(owner);
  await owner.keyboard.press('Escape');

  const moved = (await a1().getAttribute('aria-label')) ?? (await a1().innerText());
  expect(moved).not.toBe(before);

  await key(owner, owner.getByRole('button', { name: 'Save layout' }), 'Enter');
  await expect(owner.getByText('Layout saved').first()).toBeVisible({ timeout: 15_000 });

  // The saved plan survives a reload with the same positions.
  await owner.reload();
  const reloaded = (await a1().getAttribute('aria-label')) ?? (await a1().innerText());
  expect(reloaded).toBe(moved);
  await expect(owner.getByRole('button', { name: /^Seat A-2, column/ })).toBeVisible({
    timeout: 15_000,
  });
  await expect(owner.getByRole('button', { name: /^Seat A-3, column/ })).toBeVisible({
    timeout: 15_000,
  });

  // A renter sees the plan and books a seat from it by keyboard.
  const renterCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const renter = await renterCtx.newPage();
  await signUp(renter, 'renter');
  await renter.goto(`/spaces/${id}`);
  await renter
    .getByRole('radio', { name: /Day pass/ })
    .first()
    .check();
  await renter.getByLabel('Start date').fill(dayFromNow(4));
  const planSeat = renter
    .getByRole('radiogroup')
    .getByRole('radio', { name: /A-2, Free/ })
    .first();
  await expect(planSeat).toBeVisible({ timeout: 15_000 });
  await expectNoAxeViolations(renter);
  await key(renter, planSeat, 'Space');
  await expect(planSeat).toBeChecked({ timeout: 15_000 });
  await key(renter, renter.getByRole('button', { name: 'Review booking' }), 'Enter');
  await key(renter, renter.getByRole('button', { name: 'Confirm booking' }), 'Enter');
  await expect(renter.getByText('Booking confirmed')).toBeVisible({ timeout: 15_000 });
  await expectNoAxeViolations(renter);
  await ownerCtx.close();
  await renterCtx.close();
});
