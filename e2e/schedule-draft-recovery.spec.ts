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
  if (!response.ok()) throw new Error(`Test owner sign-in failed with HTTP ${response.status()}.`);
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
}

async function chooseMenuTool(page: import("@playwright/test").Page, label: string) {
  const drawer = page.locator("#workspace-drawer");
  if (await drawer.getAttribute("aria-hidden") === "true") {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
  }
  await page.getByRole("button", { name: label, exact: true }).click();
}

test("schedule planner preserves a temporarily blank date across refresh and blocks invalid export", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/");
  await chooseMenuTool(page, "Plan Content");

  const urls = Array.from({ length: 7 }, (_, index) => `https://example.com/draft-recovery-${index + 1}`);
  await page.locator("#schedule-links").fill(urls.join("\n"));
  await page.locator("#schedule-start-date").fill("2026-10-14");
  await page.getByRole("button", { name: "Build 7-day plan (1 per day)" }).click();

  const rows = page.locator(".schedule-table tbody tr");
  await expect(rows).toHaveCount(7);
  await page.getByLabel("Post 1 date").fill("");
  await expect(page.getByLabel("Post 1 date")).toHaveValue("");
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("cooking-creator-local-schedule-v1");
    if (!raw) return false;
    const saved = JSON.parse(raw) as { plan?: Array<{ date?: string }> };
    return saved.plan?.[0]?.date === "";
  });

  await page.reload();
  await expect(rows).toHaveCount(7);
  await expect(page.getByLabel("Post 1 date")).toHaveValue("");

  await page.getByRole("button", { name: "Export schedule JSON" }).click();
  await expect(page.locator(".schedule-preview .message")).toContainText("Choose a valid date and suggested time");

  await page.getByLabel("Post 1 date").fill("2026-10-14");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export schedule JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cooking-creator-schedule-draft.json");
});
