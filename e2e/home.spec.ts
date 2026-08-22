import { expect, test } from "next/experimental/testmode/playwright";

test("renders without the testProxy passthrough hanging", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("p")).not.toBeEmpty();
});
