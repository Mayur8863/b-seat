import type { Page } from '@playwright/test';

/** Signs out on any viewport: below 640 px the button is inside the collapsed Menu panel. */
export async function signOut(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Sign out' }).click();
}
