import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("composer Download exports a valid workspace backup even before the first recipe", async ({ page }) => {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) throw new Error("OWNER_PASSWORD must be set to a test-only value for the Playwright server.");

  await page.goto("/login");
  await page.locator("#owner-password").fill(ownerPassword);
  const loginResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download workspace backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cooking-creator-workspace-backup.json");
  const path = await download.path();
  expect(path).toBeTruthy();
  const archive = JSON.parse(await readFile(path!, "utf8")) as {
    format: string;
    version: number;
    projects: unknown[];
    creatorProfile: unknown;
  };
  expect(archive.format).toBe("cooking-creator-workspace-backup");
  expect(archive.version).toBe(1);
  expect(archive.projects).toEqual([]);
  expect(archive.creatorProfile).toBeTruthy();
});
