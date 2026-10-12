import { test, expect } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("test-only-owner-password-123");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(page).toHaveURL(/127[.]0[.]0[.]1:3000[/]$/);
}

test("chat home follows the requested mobile-first layout and opens the drawer", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Plus" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a voice chat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an image or sticker" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write or edit" })).toBeVisible();
  await expect(page.getByPlaceholder("Ask ChatGPT")).toBeVisible();

  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("complementary", { name: "Main menu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect apps" })).toBeVisible();
  await page.getByRole("button", { name: "Connect apps" }).click();
  await expect(page.getByRole("heading", { name: "Connect your apps" })).toBeVisible();
  await expect(page.locator(".connection-copy").getByText("YouTube", { exact: true })).toBeVisible();
  await expect(page.locator(".connection-copy").getByText("Instagram", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Connect/ }).first().click();
  await expect(page.getByRole("dialog")).toContainText("OAuth flow is not configured");
});

test("chat accepts a video link and clearly reports current integration limits", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Ask cooking").fill("Please inspect this recipe https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/I recognized this as a YouTube link/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open YouTube link" })).toHaveAttribute("href", "https://youtu.be/dQw4w9WgXcQ");

  // Save the link into the recipe form without sending it to a server or
  // implying that the linked video has been fetched or analysed.
  await page.getByRole("button", { name: "Add link to recipe workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator("#url")).toHaveValue("https://youtu.be/dQw4w9WgXcQ");
  const sourceLink = page.getByRole("link", { name: "Open source in a new tab" });
  await expect(sourceLink).toHaveAttribute("href", "https://youtu.be/dQw4w9WgXcQ");
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByRole("status")).toContainText("V1 saves the URL only");
});

test("chat carries a new-recipe instruction into local notes without claiming automatic drafting", async ({ page }) => {
  await signIn(page);
  const prompt = "Start a new recipe draft for lemon rice. The rice is already cooked.";
  await page.getByLabel("Ask cooking").fill(prompt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator("#notes")).toHaveValue(prompt);
  await expect(page.getByRole("status")).toContainText("Instruction copied into Recipe notes");
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


test("owner-only middleware redirects anonymous workspace requests and blocks anonymous APIs", async ({ page, request }) => {
  const workspace = await page.goto("/");
  expect(workspace?.url()).toContain("/login?from=%2F");
  const api = await request.get("/api/recipe");
  expect(api.status()).toBe(401);
});

test("login rejects an incorrect owner password without opening the workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("incorrect-owner-password");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(page.getByText("Password not accepted.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("owner logout clears the session and locks both the workspace and API", async ({ page }) => {
  await signIn(page);

  const logout = await page.evaluate(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    return { status: response.status, body: await response.json() };
  });
  expect(logout.status).toBe(200);
  expect(logout.body).toEqual({ ok: true });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?from=%2F$/);

  const apiStatus = await page.evaluate(async () => (await fetch("/api/recipe")).status);
  expect(apiStatus).toBe(401);
});
