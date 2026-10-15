import { test, expect } from "@playwright/test";

test("signed-out account popup shows Settings and Log in, and closes outside or on Back", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Cooking Creator" })).toBeVisible();

  const logoButton = page.getByRole("button", { name: "Open settings and account menu" });
  const popup = page.locator(".login-logo-popover");
  await expect(logoButton).toBeVisible();
  await logoButton.click();
  await expect(popup).toHaveAttribute("aria-hidden", "false");
  await expect(popup.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(popup.getByRole("button", { name: "Log in", exact: true })).toBeVisible();

  await page.locator(".login-popup-dismiss").click({ position: { x: 150, y: 200 } });
  await expect(popup).toHaveAttribute("aria-hidden", "true");

  await logoButton.click();
  await expect(popup).toHaveAttribute("aria-hidden", "false");
  await page.goBack();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(popup).toHaveAttribute("aria-hidden", "true");
});

test("signed-out Settings asks for sign-in, then opens app Settings after authentication", async ({ page }) => {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) throw new Error("OWNER_PASSWORD must be set to a test-only value for the Playwright server.");

  await page.goto("/login");
  await page.getByRole("button", { name: "Open settings and account menu" }).click();
  await page.locator(".login-logo-popover").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Sign in to open Settings");
  await expect(page.locator("#owner-password")).toBeFocused();

  await page.locator("#owner-password").fill(ownerPassword);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "profile");
  await expect(page.locator("#creator-profile details")).toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
  await expect(page).not.toHaveURL(/settings=1/);
});
