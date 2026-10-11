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


test("source research desk records references and exports uncertainty honestly", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Source-checked soup");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

  await page.getByRole("button", { name: /Add source/ }).click();
  await page.getByLabel("Reference URL").fill("https://example.com/recipe");
  await page.getByLabel("What did you actually check?").fill("Ingredient list and method order");
  await page.getByLabel("Differences, uncertainty, or missing details").fill("Cooking time is not specified");

  await page.getByRole("button", { name: /Add source/ }).click();
  await page.getByLabel("Source type").nth(1).selectOption("video");
  await page.getByLabel("Reference URL").nth(1).fill("https://example.org/video");
  await page.getByLabel("What did you actually check?").nth(1).fill("Visible cooking actions");
  await page.getByLabel("Differences, uncertainty, or missing details").nth(1).fill("Exact temperature is unclear");

  await page.getByRole("button", { name: "Generate tutorial draft" }).click();
  const preview = page.locator(".tutorial-preview pre");
  await expect(preview).toContainText("https://example.com/recipe");
  await expect(preview).toContainText("https://example.org/video");
  await expect(preview).toContainText("Cooking time is not specified");
  await expect(preview).toContainText("Exact temperature is unclear");
  await expect(preview).toContainText("Source references and checked items are manually recorded");
  await expect(preview).toContainText("conflicts or missing details must be resolved before publishing");

  await page.reload();
  await expect(page.getByLabel("Reference URL").first()).toHaveValue("https://example.com/recipe");
  await expect(page.getByLabel("Reference URL").nth(1)).toHaveValue("https://example.org/video");
});


test("malformed saved source-reference records are skipped with a visible warning", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cooking-creator-v1-drafts", JSON.stringify([{
      id: 909,
      name: "Corrupt saved draft",
      url: "",
      notes: "",
      sourceEvidence: "",
      servings: "2",
      ingredients: [],
      steps: [],
      scenes: [{ title: "Hook", detail: "Show dish", timing: "0:00" }],
      sourceReferences: [{ id: "bad", url: 123, kind: "video", checked: "", notes: "" }],
    }]));
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Some saved data was invalid and was skipped");
  await expect(page.getByRole("heading", { name: "Corrupt saved draft" })).toHaveCount(0);
});


test("narration script preserves recipe order and flags missing timing before recording", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Lemon rice");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

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

  await page.getByRole("button", { name: "Generate narration script" }).click();
  const preview = page.locator(".narration-preview pre");
  await expect(preview).toContainText("Prepare 2 cups cooked rice, cooled.");
  await expect(preview).toContainText("Step 1: Warm the pan. The recorded timing is 1 minute.");
  await expect(preview).toContainText("Step 2: Fold in the rice.");
  await expect(preview).toContainText("timing is missing; confirm it rather than guessing");
  await expect(preview).toContainText("Nutrition and calories have not been calculated");
});
