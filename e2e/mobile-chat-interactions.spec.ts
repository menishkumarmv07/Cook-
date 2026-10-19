import { test, expect } from "@playwright/test";

async function signInOwner(page: import("@playwright/test").Page) {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) throw new Error("OWNER_PASSWORD must be set to a test-only value for the Playwright server.");
  await page.goto("/login");
  await page.locator("#owner-password").fill(ownerPassword);
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
}

async function holdMessage(page: import("@playwright/test").Page, selector: string) {
  const target = page.locator(selector).last();
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + Math.min(18, box!.width / 2), box!.y + Math.min(12, box!.height / 2));
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await signInOwner(page);
});

test("long-press message menu copies assistant replies and edits user messages from that point", async ({ page }) => {
  await page.locator("#workspace-command").fill("A small message to edit");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".chat-message.from-user").last()).toContainText("A small message to edit");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("not connected to an AI model yet");

  await holdMessage(page, ".chat-message.from-user");
  const menu = page.getByRole("menu", { name: "Message actions" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Edit" }).click();

  const editBox = page.getByRole("textbox", { name: "Edit your message" });
  await expect(editBox).toBeVisible();
  await expect(editBox).toHaveValue("A small message to edit");
  await editBox.fill("This must be cancelled");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".chat-message.from-user").last()).toContainText("A small message to edit");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("not connected to an AI model yet");

  await holdMessage(page, ".chat-message.from-user");
  await page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem", { name: "Edit" }).click();
  const secondEditBox = page.getByRole("textbox", { name: "Edit your message" });
  await expect(secondEditBox).toHaveValue("A small message to edit");
  await secondEditBox.fill("Today's Plan");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.locator(".chat-message.from-user")).toHaveCount(1);
  await expect(page.locator(".chat-message.from-user").last()).toContainText("Today's Plan");
  await expect(page.locator(".chat-message.from-assistant")).toHaveCount(1);
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("Today’s Plan is open");
  await expect(page.getByRole("textbox", { name: "Edit your message" })).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".chat-message.from-user").last()).toContainText("Today's Plan");
  await expect(page.locator(".chat-message.from-user")).not.toContainText("A small message to edit");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("Today’s Plan is open");

  await holdMessage(page, ".chat-message.from-assistant");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Copy" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
});

test("task and logo popups dismiss outside and browser Back closes the drawer first", async ({ page }) => {
  await expect(page.locator(".task-popover")).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "Choose a task" }).click();
  await expect(page.locator(".task-popover")).toHaveAttribute("aria-hidden", "false");
  await page.locator(".popup-dismiss-layer").click({ position: { x: 280, y: 100 } });
  await expect(page.locator(".task-popover")).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Open settings and account menu" }).click();
  await expect(page.locator(".logo-popover")).toHaveAttribute("aria-hidden", "false");
  await page.locator(".popup-dismiss-layer").click({ position: { x: 160, y: 240 } });
  await expect(page.locator(".logo-popover")).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.locator("#workspace-drawer")).toHaveAttribute("aria-hidden", "false");
  await page.goBack();
  await expect(page.locator("#workspace-drawer")).toHaveAttribute("aria-hidden", "true");
});


test("composer and plus popup stay inside the visible viewport when the keyboard reduces space", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const viewport = await page.evaluate(() => {
    const visibleHeight = window.innerHeight - 260;
    document.documentElement.style.setProperty("--keyboard-inset", "260px");
    document.documentElement.style.setProperty("--visible-viewport-height", `${visibleHeight}px`);
    return { windowHeight: window.innerHeight, visibleHeight };
  });

  const dock = page.locator(".command-dock");
  let dockBox = await dock.boundingBox();
  expect(dockBox).toBeTruthy();
  expect(Math.abs((dockBox!.y + dockBox!.height) - (viewport.windowHeight - 260))).toBeLessThan(2);

  await page.getByRole("button", { name: "Choose a task" }).click();
  const popup = page.locator(".task-popover");
  await expect(popup).toHaveAttribute("aria-hidden", "false");
  const popupBox = await popup.boundingBox();
  dockBox = await dock.boundingBox();
  expect(popupBox).toBeTruthy();
  expect(dockBox).toBeTruthy();
  expect(popupBox!.x).toBeGreaterThanOrEqual(0);
  expect(popupBox!.y).toBeGreaterThanOrEqual(0);
  expect((popupBox!.x + popupBox!.width)).toBeLessThanOrEqual(390);
  const plusBox = await page.getByRole("button", { name: "Choose a task" }).boundingBox();
  expect(plusBox).toBeTruthy();
  expect((popupBox!.y + popupBox!.height)).toBeLessThanOrEqual(plusBox!.y + 4);
  expect(popupBox!.height).toBeLessThan(viewport.visibleHeight);
});
