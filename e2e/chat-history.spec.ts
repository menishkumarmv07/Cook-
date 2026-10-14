import { test, expect } from "@playwright/test";

async function signInOwner(page: import("@playwright/test").Page) {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) throw new Error("OWNER_PASSWORD must be set to a test-only value for the Playwright server.");
  await page.goto("/login");
  await page.locator("#owner-password").fill(ownerPassword);
  const loginResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  const loginResponse = await loginResponsePromise;
  if (!loginResponse.ok()) {
    throw new Error(`Test owner sign-in failed with HTTP ${loginResponse.status()}.`);
  }
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
}

async function openHistory(page: import("@playwright/test").Page) {
  const drawer = page.locator("#workspace-drawer");
  if (await drawer.getAttribute("aria-hidden") === "true") {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
  }
  await expect(page.getByRole("region", { name: "Saved chat history" })).toBeVisible();
}

async function sendChatMessage(page: import("@playwright/test").Page, message: string) {
  await page.locator("#workspace-command").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".chat-message.from-user").filter({ hasText: message })).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  // The migration case must seed legacy localStorage before the first workspace load.
  if (testInfo.title.startsWith("LEGACY:")) return;
  await signInOwner(page);
});

test("chat history creates separate conversations and restores a conversation after refresh", async ({ page }) => {
  await openHistory(page);
  await page.getByRole("button", { name: /^Chat$/ }).click();
  await expect(page.locator(".chat-empty")).toBeVisible();

  await sendChatMessage(page, "Tell me about garlic");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("not connected to an AI model yet");

  await openHistory(page);
  await expect(page.locator(".chat-history-row")).toHaveCount(1);
  await expect(page.locator(".chat-history-row")).toContainText("Tell me about garlic");

  await page.getByRole("button", { name: /^Chat$/ }).click();
  await expect(page.locator(".chat-empty")).toBeVisible();
  await openHistory(page);
  await expect(page.locator(".chat-history-row")).toHaveCount(2);

  await page.locator(".chat-history-open").filter({ hasText: "Tell me about garlic" }).click();
  await expect(page.locator(".chat-message.from-user").filter({ hasText: "Tell me about garlic" })).toBeVisible();
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("not connected to an AI model yet");

  await sendChatMessage(page, "Add one more note about fresh basil");
  await expect(page.locator(".chat-message.from-user")).toContainText(["Tell me about garlic", "Add one more note about fresh basil"]);

  await page.reload();
  await expect(page.locator(".chat-message.from-user").filter({ hasText: "Tell me about garlic" })).toBeVisible();
  await expect(page.locator(".chat-message.from-user").filter({ hasText: "Add one more note about fresh basil" })).toBeVisible();
  await openHistory(page);
  await expect(page.locator(".chat-history-row")).toHaveCount(2);
});

test("LEGACY: flat chat history migrates into a saved conversation", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cooking-creator-chat-history-v1", JSON.stringify([
      { id: "legacy-user", role: "user", text: "My old recipe conversation", timestamp: "2026-10-10T10:00:00.000Z" },
      { id: "legacy-assistant", role: "assistant", text: "An older saved response", timestamp: "2026-10-10T10:00:05.000Z" },
    ]));
  });

  await page.goto("/login");
  await page.locator("#owner-password").fill(process.env.OWNER_PASSWORD || "");
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();

  await expect(page.locator(".chat-message.from-user").filter({ hasText: "My old recipe conversation" })).toBeVisible();
  await openHistory(page);
  await expect(page.locator(".chat-history-row")).toHaveCount(1);
  await expect(page.locator(".chat-history-row")).toContainText("My old recipe conversation");
});

test("deleting a conversation removes it from local chat history", async ({ page }) => {
  await openHistory(page);
  await page.getByRole("button", { name: /^Chat$/ }).click();
  await sendChatMessage(page, "Delete this temporary chat");
  await openHistory(page);
  await expect(page.locator(".chat-history-row")).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete chat: Delete this temporary chat" }).click();
  await expect(page.locator(".chat-history-row")).toHaveCount(0);
  await expect(page.locator(".chat-history-empty")).toBeVisible();
});

test("AUTH: rejects oversized sign-in request bodies before parsing", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    data: { password: "x".repeat(5_000) },
  });
  expect(response.status()).toBe(413);
  await expect(response.json()).resolves.toMatchObject({
    error: "The sign-in request is too large.",
  });
});
