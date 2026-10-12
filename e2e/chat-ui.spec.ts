import { test, expect } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("test-only-owner-password-123");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(page).toHaveURL(/127\\.0\\.0\\.1:3000\\/$/);
}

test("chat home follows the requested mobile-first layout and opens the drawer", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Plus" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a voice chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an image or sticker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write or edit" })).toBeVisible();
  await expect(page.getByPlaceholder("Ask cooking")).toBeVisible();

  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("complementary", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect apps" })).toBeVisible();
  await page.getByRole("button", { name: "Connect apps" }).click();
  await expect(page.getByRole("heading", { name: "Connect your apps" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "YouTube" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Instagram" })).toBeVisible();
  await page.getByRole("button", { name: /Connect/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("OAuth flow is not configured");
});

test("chat accepts a video link and clearly reports current integration limits", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Ask cooking").fill("Please inspect this recipe https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/I recognized this as a YouTube link/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube link" })).toHaveAttribute("href", "https://youtu.be/dQw4w9WgXcQ");
});

test("mobile chat interface does not introduce horizontal overflow", async ({ page }) => {
  await signIn(page);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.width);
});
