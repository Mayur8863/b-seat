import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Calendar date `n` days from now as YYYY-MM-DD (UTC is close enough for a start date days ahead). */
export const dayFromNow = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(results.violations.map((v) => `${v.id}: ${String(v.nodes[0]?.target)}`)).toEqual([]);
}

/** Signs up through the UI; a renter skips the optional preferences step. */
export async function signUp(page: Page, role: 'owner' | 'renter') {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page
    .getByRole('radio', { name: role === 'owner' ? /I own a space/ : /I need a space/ })
    .check();
  await page.getByRole('button', { name: 'Create account' }).click();
  const skip = page.getByRole('button', { name: 'Skip for now' });
  await Promise.race([skip.waitFor(), page.waitForURL(/\/dashboard$/)]).catch(() => undefined);
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForURL(/\/dashboard$/);
}

interface Created {
  data?: { id: string };
  id?: string;
}

/** Creates and publishes a space with `seats` seats named `<prefix><n>` through the API of the signed-in owner. */
export async function publishSpaceViaApi(
  page: Page,
  opts: { name: string; city: string; seats: number; prefix: string },
) {
  const send = async (method: 'post' | 'put', url: string, data: unknown) => {
    const res = await page.request[method](url, { data });
    expect(res.ok(), `${method} ${url} -> ${res.status()}`).toBe(true);
    return (await res.json()) as Created;
  };
  const created = await send('post', '/api/owner/spaces', {
    name: opts.name,
    description: 'Quiet desks for e2e.',
    country: 'GB',
    city: opts.city,
    area: 'Zed',
    streetAddress: '1 Test Street',
    timeZone: 'Europe/London',
    currency: 'GBP',
    openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
    utilities: ['wifi'],
  });
  const id = created.data?.id ?? created.id ?? '';
  await send('post', `/api/owner/spaces/${id}/seats`, {
    pattern: { prefix: opts.prefix, from: 1, to: opts.seats },
  });
  await send('put', `/api/owner/spaces/${id}/pricing`, {
    slots: [
      { slot: 'day', enabled: true, prices: { day: '10.00', week: '60.00', month: '200.00' } },
      { slot: 'night', enabled: true, prices: { day: '8.00', week: null, month: null } },
      { slot: 'full_day', enabled: true, prices: { day: '15.00', week: null, month: null } },
    ],
  });
  await send('post', `/api/owner/spaces/${id}/publish`, {});
  return id;
}
