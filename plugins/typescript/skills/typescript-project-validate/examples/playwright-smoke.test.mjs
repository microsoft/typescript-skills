import { expect, test } from '@playwright/test';

const baseUrl = process.env.VALIDATION_BASE_URL ?? 'http://127.0.0.1:4173/';

test('primary route renders', async ({ page }) => {
	await page.goto(baseUrl);
	await expect(page.locator('main')).toBeVisible();
});
