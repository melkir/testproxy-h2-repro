import { expect, test } from "@playwright/test";

test("get-it request completes instead of failing under testProxy", async ({ page }) => {
  await page.goto("/");
  const text = await page.locator("p").textContent();
  expect(text).toContain('"statusCode":200');
});
