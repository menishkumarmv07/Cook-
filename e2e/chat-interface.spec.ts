import { test, expect } from "@playwright/test";

async function signInToChat(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("test-only-owner-password-123");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3000\/$/);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask cooking" })).toBeVisible();
}

test("chat-first home shows the cooking prompt, suggestions, and responsive layout", async ({ page }) => {
  await signInToChat(page);
  await expect(page.getByRole("button", { name: "Start a voice chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an image or sticker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write or edit" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
});

test("drawer exposes account connections and clearly marks integrations as not live", async ({ page }) => {
  await signInToChat(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("complementary", { name: "Main menu" })).toBeVisible();
  await page.getByRole("button", { name: "Connect apps" }).click();
  await expect(page.getByRole("heading", { name: "Connect your apps" })).toBeVisible();
  await expect(page.getByText("Not connected").first()).toBeVisible();
  await page.getByRole("button", { name: /Connect/ }).first().click();
  await expect(page.getByRole("dialog", { name: /Connect YouTube/ })).toBeVisible();
  await expect(page.getByText(/OAuth flow is not configured/)).toBeVisible();
});

test("pasted video URL is acknowledged honestly and can be opened by the owner", async ({ page }) => {
  await signInToChat(page);
  await page.getByRole("textbox", { name: "Ask cooking" }).fill("Please inspect this recipe https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/recognized this as a YouTube link/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube link" })).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await expect(page.getByText(/does not yet use your signed-in YouTube account/)).toBeVisible();
});
