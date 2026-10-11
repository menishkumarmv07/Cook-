import { test, expect } from "@playwright/test";

test("recipe draft can be created, edited, reordered, saved, and exported", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Lemon rice");
  await page.locator("#servings").fill("3");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await expect(page.getByRole("heading", { name: "Lemon rice" })).toBeVisible();

  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 1 amount").fill("2");
  await page.getByLabel("Ingredient 1 unit").fill("cups");
  await page.getByLabel("Ingredient 1 name").fill("cooked rice");
  await page.getByLabel("Ingredient 1 prep").fill("cooled");

  await page.getByRole("button", { name: /Add step/ }).click();
  await page.getByLabel("Action / instruction").nth(0).fill("Warm the pan");
  await page.getByLabel("Timing").nth(0).fill("1 minute");
  await page.getByRole("button", { name: /Add step/ }).click();
  await page.getByLabel("Action / instruction").nth(1).fill("Fold in the rice");
  await page.getByLabel("Move step 1 down").click();

  await page.getByRole("button", { name: "Generate tutorial draft" }).click();
  const preview = page.locator(".tutorial-preview pre");
  await expect(preview).toContainText("2 cups cooked rice");
  const text = await preview.innerText();
  expect(text.indexOf("Fold in the rice")).toBeLessThan(text.indexOf("Warm the pan"));
  await expect(preview).toContainText("Food safety and nutrition have not been independently verified");

  await page.reload();
  await expect(page.getByLabel("Ingredient 1 name")).toHaveValue("cooked rice");
  await expect(page.getByLabel("Action / instruction").nth(0)).toHaveValue("Fold in the rice");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("lemon-rice.json");
});

test("JSON backup import restores a legacy draft and rejects unsafe source URLs", async ({ page }) => {
  await page.goto("/");
  const legacyDraft = {
    id: 17,
    name: "Imported legacy recipe",
    url: "",
    notes: "Recovered from an older export.",
    scenes: [{ title: "Hook", detail: "Show the dish", timing: "0:00–0:08" }],
  };
  await page.locator("#import-backup").setInputFiles({
    name: "legacy-recipe.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacyDraft)),
  });
  await expect(page.getByRole("heading", { name: "Imported legacy recipe" })).toBeVisible();
  await expect(page.getByLabel("Servings / yield")).toHaveValue("");

  const unsafeDraft = { ...legacyDraft, id: 18, name: "Unsafe URL draft", url: "javascript:alert(1)" };
  await page.locator("#import-backup").setInputFiles({
    name: "unsafe-recipe.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(unsafeDraft)),
  });
  await expect(page.getByRole("status")).toContainText("Nothing was imported");
  await expect(page.getByRole("heading", { name: "Unsafe URL draft" })).toHaveCount(0);
});

test("mobile layout exposes the intake and editor without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make every recipe a story." })).toBeVisible();
  await expect(page.locator("#name")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
