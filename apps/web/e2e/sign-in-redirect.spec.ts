import { expect, test } from '@playwright/test';

for (const next of ['/%5Cexample.com', '/.//example.com']) {
  test(`sign-in ignores the open-redirect target ${next}`, async ({ page, request }) => {
    const email = `e2e-redirect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const password = 'correct-horse-battery';
    const baseURL = test.info().project.use.baseURL ?? 'http://localhost:3000';
    const signUp = await request.post(`${baseURL}/api/auth/sign-up/email`, {
      data: { name: 'Grace Hopper', email, password },
      headers: { origin: baseURL },
    });

    expect(signUp.ok()).toBe(true);

    await page.goto(`/sign-in?next=${next}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(new URL('/dashboard', baseURL).href);
  });
}
