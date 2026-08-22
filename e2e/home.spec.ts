import { expect, test } from "@playwright/test";

test("fetch() to an HTTP/2 host completes instead of failing under testProxy", async ({
  page
}) => {
  await page.goto("/");
  const text = await page.locator("p").textContent();
  expect(text).toContain('"status":200');
});
