import { test, expect } from "@playwright/test";

test("landing links to the invitation-only private workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your creativity/ })).toBeVisible();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBeTruthy();
  await page.getByRole("link", { name: "Open creator workspace" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("public registration and recovery screens are not exposed", async ({ page }) => {
  for (const route of ["/auth/register", "/auth/forgot", "/auth/reset"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
  }
});

test("unconfigured workspace fails closed", async ({ page }) => {
  await page.goto("/workspace/admin");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Your workspace is almost ready." })).toBeVisible();
});

test("private username login does not claim success without backend", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Username", { exact: true }).fill("creator");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("not configured");
});

test("private APIs fail closed with no backend and no caching", async ({ request }) => {
  const response = await request.get("/api/admin/export?kind=applications");
  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");

  const owner = await request.post("/api/owner-delivery", {
    data: { storage_path: "test/invalid" },
  });
  expect(owner.status()).toBe(503);
  expect(owner.headers()["cache-control"]).toContain("no-store");
});

test("Android/desktop private sign-in is usable without horizontal overflow", async ({ page }, testInfo) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const size = page.viewportSize();
  expect(size).toBeTruthy();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBeTruthy();
  const username = page.getByLabel("Username", { exact: true });
  await expect(username).toBeVisible();
  const box = await username.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size!.width + 1);
  await expect(page.getByRole("button", { name: "Enter workspace" })).toBeVisible();
  expect(["desktop", "mobile"]).toContain(testInfo.project.name);
});

test("browser validates required username before sending sign-in request", async ({ page }) => {
  await page.goto("/auth/login");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  expect(await page.getByLabel("Username", { exact: true }).evaluate((input) =>
    (input as HTMLInputElement).validity.valueMissing,
  )).toBeTruthy();
  await expect(page).toHaveURL(/\/auth\/login$/);
});
