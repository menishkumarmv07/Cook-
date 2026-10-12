import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function signInOwner(page: import("@playwright/test").Page) {
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerPassword) throw new Error("OWNER_PASSWORD must be set to a test-only value for the Playwright server.");
  let middlewareDiagnostic = "not-observed";
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && new URL(response.url()).pathname === "/" && response.status() >= 300 && response.status() < 400) {
      middlewareDiagnostic = response.headers()["x-owner-auth-diagnostic"] ?? "header-not-present";
    }
  });
  await page.goto("/login");
  await page.locator("#owner-password").fill(ownerPassword);
  const loginResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/auth/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  const loginResponse = await loginResponsePromise;
  const responseBody = await loginResponse.json().catch(() => null);
  if (!loginResponse.ok()) {
    throw new Error(`Test owner sign-in failed with HTTP ${loginResponse.status()}: ${JSON.stringify(responseBody)}`);
  }
  try {
    await expect(page.getByRole("heading", { name: /Good cooking deserves a story/ })).toBeVisible();
  } catch {
    const cookies = await page.context().cookies();
    const hasSessionCookie = cookies.some((cookie) => cookie.name === "cooking_creator_session");
    throw new Error(`Owner login returned HTTP ${loginResponse.status()} but workspace stayed locked; sessionCookiePresent=${hasSessionCookie}; middlewareDiagnostic=${middlewareDiagnostic}; finalPath=${new URL(page.url()).pathname}`);
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith("AUTH:")) return;
  await signInOwner(page);
});

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

test("mobile workspace shows the screenshot-inspired home and no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Good cooking deserves a story." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today's Plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Research & Trends" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Content Studio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await expect(page.locator("#name")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("navigation drawer, workspace command, and theme toggle work and persist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("button", { name: /Projects \/ new recipe/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#workspace-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeFocused();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "dark");
  await page.locator("#workspace-command").fill("new recipe");
  await page.getByRole("button", { name: "Run workspace command" }).click();
  await expect(page.getByRole("heading", { name: "Start a recipe project" })).toBeVisible();
  await expect(page.locator("#workspace-command")).toHaveValue("");
});


test("social connection center shows honest OAuth readiness without collecting social passwords", async ({ page }) => {
  await page.goto("/");
  await page.locator("#workspace-command").fill("connect my social accounts");
  await page.getByRole("button", { name: "Run workspace command" }).click();

  const center = page.locator("#social-connections");
  await expect(center.getByRole("heading", { name: "Connect your social accounts" })).toBeVisible();
  const platformNames = ["YouTube", "Instagram", "TikTok", "Facebook", "Pinterest", "Snapchat", "X"];
  for (const [index, platformName] of platformNames.entries()) {
    const card = center.locator(".connection-card").nth(index);
    await expect(card.getByRole("heading", { name: platformName, exact: true })).toBeVisible();
    await expect(card.getByText("Not connected", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Connect when available" })).toBeDisabled();
  }
  await expect(center.locator('input[type="password"]')).toHaveCount(0);
  await expect(center.getByText(/never asks for social passwords/i)).toBeVisible();

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("button", { name: "Connect social accounts" })).toBeVisible();
});

test("source research desk records references and exports uncertainty honestly", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Source-checked soup");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

  await page.getByRole("button", { name: /Add source/ }).click();
  await page.getByLabel("Reference URL").fill("https://example.com/recipe");
  await page.getByLabel("What did you actually check?").fill("Ingredient list and method order");
  await page.getByLabel("Differences, uncertainty, or missing details").fill("Cooking time is not specified");
  await page.getByLabel("Ingredient quantities & differences").fill("Oil is 1 tbsp in this reference");
  await page.getByLabel("Method / step-order findings").fill("Add onions before tomato");
  await page.getByLabel("Cooking timing & heat findings").fill("Medium heat for 5 minutes");
  await page.getByLabel("Food safety & storage notes").fill("No storage directions provided");

  await page.getByRole("button", { name: /Add source/ }).click();
  await page.getByLabel("Source type").nth(1).selectOption("video");
  await page.getByLabel("Reference URL").nth(1).fill("https://example.org/video");
  await page.getByLabel("What did you actually check?").nth(1).fill("Visible cooking actions");
  await page.getByLabel("Differences, uncertainty, or missing details").nth(1).fill("Exact temperature is unclear");
  await page.getByLabel("Ingredient quantities & differences").nth(1).fill("Oil is 2 tbsp in the video description");
  await page.getByLabel("Method / step-order findings").nth(1).fill("Add onions after tomato paste");
  await page.getByLabel("Cooking timing & heat findings").nth(1).fill("Exact temperature is unclear");
  await page.getByLabel("Food safety & storage notes").nth(1).fill("Storage directions not shown");

  await page.getByRole("button", { name: "Generate tutorial draft" }).click();
  const preview = page.locator(".tutorial-preview pre");
  await expect(preview).toContainText("https://example.com/recipe");
  await expect(preview).toContainText("https://example.org/video");
  await expect(preview).toContainText("Cooking time is not specified");
  await expect(preview).toContainText("Exact temperature is unclear");
  await expect(preview).toContainText("Ingredient/quantity findings: Oil is 1 tbsp in this reference");
  await expect(preview).toContainText("Method/order findings: Add onions before tomato");
  await expect(preview).toContainText("Timing/heat findings: Medium heat for 5 minutes");
  await expect(preview).toContainText("Food-safety/storage notes: No storage directions provided");
  await expect(page.locator(".source-comparison-summary")).toContainText("Ingredient quantities 2/2");
  await expect(page.locator(".source-comparison-summary")).toContainText("Timing / heat 2/2");
  await expect(preview).toContainText("Source references and checked items are manually recorded");
  await expect(preview).toContainText("conflicts or missing details must be resolved before publishing");

  await page.reload();
  await expect(page.getByLabel("Reference URL").first()).toHaveValue("https://example.com/recipe");
  await expect(page.getByLabel("Reference URL").nth(1)).toHaveValue("https://example.org/video");
  await expect(page.getByLabel("Ingredient quantities & differences").first()).toHaveValue("Oil is 1 tbsp in this reference");
  await expect(page.getByLabel("Method / step-order findings").nth(1)).toHaveValue("Add onions after tomato paste");
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

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export narration" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("lemon-rice.narration.txt");
});


test("tested recipe must be approved before share; recipe edits reset trust and approval", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Lemon rice");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

  await expect(page.getByText("UNTESTED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve pack" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeDisabled();

  await page.locator("#trial-photo").setInputFiles({
    name: "cooked-dish.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(page.getByRole("status")).toContainText("Cooking-trial photo saved locally");
  await expect(page.getByAltText("Your cooking-trial photo for Lemon rice")).toBeVisible();

  await page.getByLabel("Your trial rating").selectOption("5");
  await page.getByLabel("What happened when you cooked it?").fill("Cooked at home; texture and taste were good.");
  await page.getByRole("button", { name: "Mark as Tested" }).click();
  await expect(page.getByText("TESTED BY YOU")).toBeVisible();

  await page.getByRole("button", { name: "Prepare content pack" }).click();
  const pack = page.locator(".approval-panel .tutorial-preview pre");
  await expect(pack).toContainText("HOOK OPTIONS");
  await expect(pack).toContainText("1. Here's how to make Lemon rice step by step.");
  await expect(pack).toContainText("#EasyRecipes");
  await expect(pack).toContainText("does not create a video");

  await page.getByRole("button", { name: "Approve pack" }).click();
  await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeEnabled();

  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 1 name").fill("cooked rice");
  await expect(page.getByText("UNTESTED", { exact: true })).toBeVisible();
  await expect(page.getByText("AWAITING APPROVAL", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeDisabled();
});

test("content pack export downloads a text file without publishing", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Lemon rice");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export pack" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("lemon-rice.content-pack.txt");
  await expect(page.getByRole("status")).toContainText("not uploaded or published");
});


test("PWA manifest and service worker support reopening the app offline after first visit", async ({ page }) => {
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Cooking Creator Studio");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThan(0);

  const workerResponse = await page.request.get("/sw.js");
  expect(workerResponse.ok()).toBeTruthy();
  expect(await workerResponse.text()).toContain("caches.open");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good cooking deserves a story/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => "serviceWorker" in navigator)).toBe(true);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /You’re offline/ })).toBeVisible();
  await expect(page.getByText(/private workspace page is not stored offline/i)).toBeVisible();
  await page.context().setOffline(false);
});


test("creator profile saves locally, shapes content-pack guidance, and travels with JSON backup", async ({ page }) => {
  await page.goto("/");
  await page.locator(".profile-panel summary").click();
  await page.getByLabel("Voice / tone").fill("Professional and concise");
  await page.getByLabel("Main language").fill("English");
  await page.getByLabel("Target platforms").fill("YouTube Shorts, Instagram Reels");
  await page.getByLabel("3–5 sample captions in your real voice").fill("A simple dinner with clear steps.\\nCook with me tonight.");
  await page.locator("#name").fill("Tomato pasta");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await page.getByRole("button", { name: "Prepare content pack" }).click();
  const pack = page.locator(".approval-panel .tutorial-preview pre");
  await expect(pack).toContainText("Tone: Professional and concise");
  await expect(pack).toContainText("Target platforms: YouTube Shorts, Instagram Reels");
  await expect(pack).toContainText("A simple dinner with clear steps.");
  await expect(pack).toContainText("Follow this step-by-step Tomato pasta tutorial.");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(download.suggestedFilename()).toBe("tomato-pasta.json");
  expect(path).toBeTruthy();
  const exported = JSON.parse(await readFile(path!, "utf8")) as { creatorProfile?: { tone?: string; sampleCaptions?: string } };
  expect(exported.creatorProfile?.tone).toBe("Professional and concise");
  expect(exported.creatorProfile?.sampleCaptions).toContain("A simple dinner with clear steps.");
  await page.locator("#profile-tone").fill("Casual");
  await page.locator("#import-backup").setInputFiles(path!);
  await expect(page.locator("#profile-tone")).toHaveValue("Professional and concise");
});


test("workspace backup exports all drafts and restores them with explicit confirmation", async ({ page }) => {
  await page.goto("/");
  await page.locator(".profile-panel summary").click();
  await page.getByLabel("Voice / tone").fill("Workspace backup profile");
  await page.locator("#name").fill("First backup recipe");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all drafts" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cooking-creator-workspace-backup.json");
  const path = await download.path();
  expect(path).toBeTruthy();
  const backup = JSON.parse(await readFile(path!, "utf8")) as {
    format: string;
    version: number;
    projects: Array<{ name: string }>;
    creatorProfile: { tone: string; units: string };
  };
  expect(backup.format).toBe("cooking-creator-workspace-backup");
  expect(backup.version).toBe(1);
  expect(backup.projects.map((project) => project.name)).toEqual(["First backup recipe"]);
  expect(backup.creatorProfile.tone).toBe("Workspace backup profile");
  expect(backup.creatorProfile.units).toBe("US customary");

  await page.getByLabel("Voice / tone").fill("Changed before restore");
  await page.locator("#name").fill("Temporary current draft");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#import-backup").setInputFiles(path!);

  await expect(page.getByRole("heading", { name: "First backup recipe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Temporary current draft" })).toHaveCount(0);
  await expect(page.locator(".recent-item strong")).toHaveCount(1);
  await expect(page.locator("#profile-tone")).toHaveValue("Workspace backup profile");
});



test("light workspace theme is pure white with grayscale UI colors", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "light");

  const palette = await page.locator(".shell").evaluate((root) => {
    const elements = [root, ...Array.from(root.querySelectorAll("*"))];
    const properties = [
      "color", "backgroundColor", "borderTopColor",
      "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor",
    ];
    const nonMonochrome: string[] = [];
    for (const element of elements) {
      const style = window.getComputedStyle(element);
      for (const property of properties) {
        const value = style[property as keyof CSSStyleDeclaration];
        if (typeof value !== "string") continue;
        const channels = value.match(/[0-9.]+/g);
        if (!channels || channels.length < 3) continue;
        const [red, green, blue] = channels.slice(0, 3).map(Number);
        if (red !== green || green !== blue) {
          const className = String(element.className || "").split(" ").join(".");
          nonMonochrome.push(element.tagName.toLowerCase() + "." + className + ": " + property + "=" + value);
          if (nonMonochrome.length >= 10) {
            return { background: window.getComputedStyle(document.body).backgroundColor, nonMonochrome };
          }
        }
      }
    }
    return { background: window.getComputedStyle(document.body).backgroundColor, nonMonochrome };
  });
  expect(palette.background).toBe("rgb(255, 255, 255)");
  expect(palette.nonMonochrome).toEqual([]);
});


test("manual sourced nutrition worksheet calculates exact entries and labels the estimate honestly", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Pasta nutrition check");
  await page.locator("#servings").fill("4");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 1 amount").fill("200");
  await page.getByLabel("Ingredient 1 unit").fill("g");
  await page.getByLabel("Ingredient 1 name").fill("dry pasta");
  await page.getByLabel("Ingredient 1 prep").fill("dry");

  await page.locator(".ingredient-nutrition summary").first().click();
  await page.getByLabel("Ingredient 1 calories for amount used").fill("700");
  await page.getByLabel("Protein (g)").fill("20");
  await page.getByLabel("Carbohydrates (g)").fill("140");
  await page.getByLabel("Fat (g)").fill("8");
  await page.getByLabel("Amount/preparation basis").fill("Values for the exact 200 g dry pasta quantity listed above");
  await page.getByLabel("Nutrition source URL").fill("https://fdc.nal.usda.gov/");

  const summary = page.locator(".nutrition-summary");
  await expect(summary).toContainText("175 kcal");
  await expect(summary).toContainText("700 kcal total");
  await expect(summary).toContainText("Protein 5.0 g");
  await expect(summary).toContainText("Carbs 35.0 g");
  await expect(summary).toContainText("Fat 2.0 g");
  await expect(summary).toContainText("not independently verified");

  await page.getByRole("button", { name: "Generate narration script" }).click();
  const script = page.locator(".narration-preview pre");
  await expect(script).toContainText("approximately 175 kcal per serving");
  await expect(script).toContainText("manually entered ingredient values");
  await expect(script).toContainText("not independently verified");
});


test("ingredient additions are explicitly mapped to cooking steps and spoken in narration", async ({ page }) => {
  await page.goto("/");
  await page.locator("#name").fill("Tomato onion base");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 1 amount").fill("1");
  await page.getByLabel("Ingredient 1 unit").fill("cup");
  await page.getByLabel("Ingredient 1 name").fill("diced onion");
  await page.getByLabel("Ingredient 1 prep").fill("small dice");

  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 2 amount").fill("2");
  await page.getByLabel("Ingredient 2 unit").fill("tbsp");
  await page.getByLabel("Ingredient 2 name").fill("tomato paste");

  await page.getByRole("button", { name: /Add step/ }).click();
  await page.getByLabel("Action / instruction").nth(0).fill("Cook the onions until softened");
  await page.getByLabel("Add diced onion at step 1").check();
  await page.getByRole("button", { name: /Add step/ }).click();
  await page.getByLabel("Action / instruction").nth(1).fill("Stir in the tomato paste");
  await page.getByLabel("Add tomato paste at step 2").check();

  await page.getByRole("button", { name: "Generate narration script" }).click();
  const script = page.locator(".narration-preview pre");
  await expect(script).toContainText("Add 1 cup diced onion (small dice) now");
  await expect(script).toContainText("INGREDIENTS TO ADD NOW: 1 cup diced onion (small dice)");
  await expect(script).toContainText("Add 2 tbsp tomato paste now");
  await expect(script).toContainText("INGREDIENTS TO ADD NOW: 2 tbsp tomato paste");
});


test("public recipe-page inspection previews extracted facts and copies them to notes only on request", async ({ page }) => {
  const sourceUrl = "https://recipes.example/lemon-rice";
  await page.route("**/api/sources/inspect", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: {
          requestedUrl: sourceUrl,
          finalUrl: sourceUrl,
          contentType: "text/html",
          redirectCount: 0,
          limitation: "Extracted public HTML only; recipe details are not independently verified and video frames/audio are not inspected.",
          title: "Lemon Rice",
          description: "A simple lemon rice recipe.",
          siteName: "Recipe Kitchen",
          textExcerpt: "Lemon rice is made with rice, lemon, and spices.",
          structuredRecipe: {
            name: "Lemon Rice",
            description: "A simple lemon rice recipe.",
            author: "Recipe Kitchen",
            servings: "4 servings",
            prepTime: "10 minutes",
            cookTime: "15 minutes",
            totalTime: "25 minutes",
            ingredients: ["2 cups cooked rice", "1 tbsp lemon juice"],
            instructions: ["Warm the pan.", "Fold in the rice and lemon juice."],
          },
        },
      }),
    });
  });

  await page.goto("/");
  await page.locator("#name").fill("Lemon rice");
  await page.locator("#url").fill(sourceUrl);
  await page.getByRole("button", { name: "Inspect public recipe page" }).click();

  const preview = page.locator(".source-inspection-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Lemon Rice");
  await expect(preview).toContainText("2 cups cooked rice");
  await expect(preview).toContainText("not independently verified");
  await page.getByRole("button", { name: "Add extracted details to recipe notes" }).click();
  await expect(page.locator("#notes")).toHaveValue(/Ingredients \(extracted; not independently verified\)/);
  await expect(page.locator("#notes")).toHaveValue(/2 cups cooked rice/);

  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await expect(page.locator("#edit-notes")).toHaveValue(/2 cups cooked rice/);
  await expect(page.locator(".source")).toContainText(sourceUrl);
  await expect(page.locator('.source-reference textarea[id^="source-checked-"]')).toHaveValue(/Public HTML fetched by the app/);
  await expect(page.locator('.source-reference textarea[id^="source-checked-"]')).toHaveValue(/not independently verified/);
  await expect(page.locator('.source-reference textarea[id^="source-notes-"]')).toHaveValue(/Nothing was independently verified/);
});

test("pasting a supported recipe or video URL into the chat dock prefills intake and explains the inspection limits", async ({ page }) => {
  await page.goto("/");
  const sourceUrl = "https://www.youtube.com/watch?v=123456789ab";
  await page.locator("#workspace-command").fill(sourceUrl);
  await page.getByRole("button", { name: "Run workspace command" }).click();

  await expect(page.locator("#url")).toHaveValue(sourceUrl);
  await expect(page.locator("#intake")).toBeVisible();
  await expect(page.locator(".message[role=\"status\"]")).toContainText("added to recipe intake");
  await expect(page.locator(".message[role=\"status\"]")).toContainText("video/Reel audio and frames are not analyzed");
  await expect(page.locator("#name")).toBeVisible();
});

test("chat dock rejects non-HTTP(S) links rather than adding them as recipe sources", async ({ page }) => {
  await page.goto("/");
  await page.locator("#workspace-command").fill("ftp://example.com/recipe");
  await page.getByRole("button", { name: "Run workspace command" }).click();

  await expect(page.locator("#url")).toHaveValue("");
  await expect(page.locator(".message[role=\"status\"]")).toContainText("Only a valid HTTP(S) link can be added");
});


test("AUTH: logged-out source inspection requests are rejected", async ({ page }) => {
  const response = await page.request.post("/api/sources/inspect", {
    data: { url: "https://recipes.example/lemon-rice" },
  });
  expect(response.status()).toBe(401);
});

test("AUTH: logged-out requests are redirected to the owner login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Cooking Creator" })).toBeVisible();
  await expect(page.getByLabel("Owner password")).toBeVisible();
  await expect(page.getByText(/no public sign-up/i)).toBeVisible();
});

test("AUTH: a wrong password is rejected and the configured owner can sign in", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#owner-password").fill("incorrect-password-used-by-test");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(page.getByRole("status")).toHaveText("The password was not accepted.");

  await page.locator("#owner-password").fill(process.env.OWNER_PASSWORD ?? "");
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(page.getByRole("heading", { name: /Good cooking deserves a story/ })).toBeVisible();
});

test("AUTH: logging out clears the session and protects later workspace requests", async ({ page }) => {
  await signInOwner(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});
