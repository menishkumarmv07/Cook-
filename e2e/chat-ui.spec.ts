import { test, expect } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("test-only-owner-password-123");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(page).toHaveURL(/127[.]0[.]0[.]1:3000[/]$/);
}

test("chat home follows the requested mobile-first layout and opens the drawer", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveTitle("cooking — Creator Chat");
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

test("chat theme setting persists and is shared with the recipe workspace", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator(".chat-app")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("status")).toContainText("Dark theme selected");

  await page.reload();
  await expect(page.locator(".chat-app")).toHaveAttribute("data-theme", "dark");

  await page.goto("/workspace");
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "light");

  await page.goto("/");
  await expect(page.locator(".chat-app")).toHaveAttribute("data-theme", "light");
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
  expect(api.headers()["cache-control"]).toContain("no-store");
  expect(api.headers().pragma).toBe("no-cache");
});

test("logout endpoint response is explicitly non-cacheable", async ({ request }) => {
  const response = await request.post("/api/auth/logout");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers().pragma).toBe("no-cache");
});

test("public login response includes baseline browser security headers", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.ok()).toBe(true);
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["x-dns-prefetch-control"]).toBe("off");
});

test("owner session cookie uses HttpOnly, Strict same-site, path scope, and an expiry", async ({ page }) => {
  await signIn(page);
  const cookie = (await page.context().cookies()).find((item) => item.name === "cooking_owner_session");

  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(cookie?.path).toBe("/");
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000);

  const privateApiCacheControl = await page.evaluate(async () => {
    const response = await fetch("/api/recipe");
    return {
      cacheControl: response.headers.get("cache-control"),
      pragma: response.headers.get("pragma"),
    };
  });
  expect(privateApiCacheControl.cacheControl).toContain("no-store");
  expect(privateApiCacheControl.pragma).toBe("no-cache");
});

test("login rejects an incorrect owner password without opening the workspace", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "cooking", exact: true })).toBeVisible();
  await page.getByLabel("Owner password").fill("incorrect-owner-password");
  const loginResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(401);
  expect(loginResponse.headers()["cache-control"]).toBe("no-store");
  expect(loginResponse.headers().pragma).toBe("no-cache");
  await expect(page.getByText("Password not accepted.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("login throttles repeated incorrect-password attempts for one client key", async ({ request }) => {
  const clientKey = `rate-limit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const headers = {
    "content-type": "application/json",
    "x-real-ip": clientKey,
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await request.post("/api/auth/login", {
      headers,
      data: { password: "incorrect-rate-limit-test-password" },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }

  const limited = await request.post("/api/auth/login", {
    headers,
    data: { password: "incorrect-rate-limit-test-password" },
  });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  expect(limited.headers()["cache-control"]).toBe("no-store");
});

test("owner lock revokes the session and clears temporary handoffs", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => {
    sessionStorage.setItem("cooking-pending-source-url-v1", "https://example.com/source");
    sessionStorage.setItem("cooking-pending-recipe-prompt-v1", "temporary recipe prompt");
  });

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Lock workspace" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const transientState = await page.evaluate(() => ({
    source: sessionStorage.getItem("cooking-pending-source-url-v1"),
    prompt: sessionStorage.getItem("cooking-pending-recipe-prompt-v1"),
  }));
  expect(transientState).toEqual({ source: null, prompt: null });

  const apiStatus = await page.evaluate(async () => (await fetch("/api/recipe")).status);
  expect(apiStatus).toBe(401);
});
