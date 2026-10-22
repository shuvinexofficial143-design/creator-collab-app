import { test, expect } from "@playwright/test";
test("landing is readable and links to registration", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your creativity/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("link", { name: "Join as a creator" }).click();
  await expect(
    page.getByRole("heading", { name: "Start creating with us" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});
test("unconfigured workspace fails closed", async ({ page }) => {
  await page.goto("/workspace/admin");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole("heading", { name: "Your workspace is almost ready." }),
  ).toBeVisible();
});
test("login form displays configuration error without success claim", async ({
  page,
}) => {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill("creator@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("not configured");
});

test("unconfigured private export fails closed with no cached data", async ({ request }) => {
  const response = await request.get("/api/admin/export?kind=payments");
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
