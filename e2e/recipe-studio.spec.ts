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
    await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
  } catch {
    const cookies = await page.context().cookies();
    const hasSessionCookie = cookies.some((cookie) => cookie.name === "cooking_creator_session");
    throw new Error(`Owner login returned HTTP ${loginResponse.status()} but workspace stayed locked; sessionCookiePresent=${hasSessionCookie}; middlewareDiagnostic=${middlewareDiagnostic}; finalPath=${new URL(page.url()).pathname}`);
  }
}

async function chooseMenuTool(page: import("@playwright/test").Page, label: string) {
  // Tools are dedicated screens. Return Home before opening another tool or using chat.
  const activeTool = await page.locator(".shell").getAttribute("data-active-tool");
  if (activeTool && activeTool !== "home") {
    await page.getByRole("button", { name: "Back to chat home" }).click();
    await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "home");
  }

  if (label === "Today's Plan" || label === "Plan Content") {
    await page.getByRole("button", { name: "Choose a task" }).click();
    const taskLabel = label === "Today's Plan" ? "Today's plan" : "Plan content";
    await page.getByRole("button", { name: taskLabel, exact: true }).click();
    return;
  }

  if (label === "Creator profile") {
    await page.getByRole("button", { name: "Open settings and account menu" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    return;
  }

  const drawer = page.locator("#workspace-drawer");
  if (await drawer.getAttribute("aria-hidden") === "true") {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
  }

  if (label === "Growth Lab") {
    await page.getByRole("button", { name: "Growth Lab", exact: true }).click();
    return;
  }
  if (label === "Editorial Calendar") {
    await page.getByRole("button", { name: "Editorial Calendar", exact: true }).click();
    return;
  }
  if (label === "Monetization Readiness") {
    await page.getByRole("button", { name: "Monetization Readiness", exact: true }).click();
    return;
  }
  if (label === "New recipe") {
    await page.getByRole("button", { name: "Images", exact: true }).click();
    return;
  }
  if (label === "Library / recent drafts") {
    await page.getByRole("button", { name: "Library", exact: true }).click();
    return;
  }
  if (label === "Connect social accounts" || label === "Remote") {
    await page.getByRole("button", { name: "Remote", exact: true }).click();
    return;
  }
  await page.getByRole("button", { name: label, exact: true }).click();
}

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith("AUTH:")) return;
  await signInOwner(page);
});

test("recipe draft can be created, edited, reordered, saved, and exported", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
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
  await page.locator(".action-row").getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("lemon-rice.json");
});

test("JSON backup import restores a legacy draft and rejects unsafe source URLs", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await chooseMenuTool(page, "New recipe");
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

test("mobile workspace matches the two reference screens and has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
  await expect(page.getByText("Tap + to choose a task, or type your request below.")).toBeVisible();
  await expect(page.locator("#name")).not.toBeVisible();
  await expect(page.locator(".task-popover")).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Choose a task" }).click();
  for (const task of ["Today's plan", "Plan content", "Links upload", "Publish", "Full Download"]) {
    await expect(page.getByRole("button", { name: task, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Choose a task" }).click();
  await expect(page.locator(".task-popover")).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  for (const item of ["Images", "Library", "Projects", "Remote", "Scheduled", "Explore"]) {
    await expect(page.getByRole("button", { name: item, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close menu" }).click();

  await page.getByRole("button", { name: "Open settings and account menu" }).click();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out", exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Open settings and account menu" }).click();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("schedule planner accepts unlimited links and builds, edits, saves, and exports plans", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Plan Content");
  const expectedEasternDate = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  });
  await expect(page.locator("#schedule-start-date")).toHaveValue(expectedEasternDate);
  const urls = Array.from({ length: 11 }, (_, index) => `https://example.com/reel-${index + 1}`);
  await page.locator("#schedule-links").fill(urls.join("\n"));
  await page.locator("#schedule-start-date").fill("2026-10-14");

  await page.locator("#schedule-links-per-day").fill("4");
  await page.locator("#schedule-days-count").fill("3");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  const rows = page.locator(".schedule-table tbody tr");
  await expect(rows).toHaveCount(11);
  await expect(page.getByLabel("Post 1 date")).toHaveValue("2026-10-14");
  await expect(page.getByLabel("Post 1 time")).toHaveValue("09:00");
  await expect(page.getByLabel("Post 2 time")).toHaveValue("13:00");
  await expect(page.getByLabel("Post 5 date")).toHaveValue("2026-10-15");
  await expect(page.getByLabel("Post 11 date")).toHaveValue("2026-10-16");
  await expect(page.getByText("Draft — approval needed").first()).toBeVisible();

  await page.getByLabel("Post 1 time").selectOption("13:00");
  await page.reload();
  await expect(rows).toHaveCount(11);
  await expect(page.getByLabel("Post 1 time")).toHaveValue("13:00");
  await expect(page.locator("#schedule-links")).toHaveValue(urls.join("\n"));
  await expect(page.locator("#schedule-links-per-day")).toHaveValue("4");
  await expect(page.locator("#schedule-days-count")).toHaveValue("3");

  // Too little capacity must keep the last valid plan and explain how to fit every link.
  await page.locator("#schedule-links-per-day").fill("3");
  await page.locator("#schedule-days-count").fill("3");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  await expect(page.locator(".message")).toContainText("Choose at least 4 days");
  await expect(rows).toHaveCount(11);

  await page.locator("#schedule-links-per-day").fill("2");
  await page.locator("#schedule-days-count").fill("7");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  await expect(page.getByLabel("Post 11 date")).toHaveValue("2026-10-19");
  await expect(page.getByLabel("Post 11 time")).toHaveValue("09:00");

  // Calendar-day planning must stay correct across the US daylight-saving transition.
  await page.locator("#schedule-start-date").fill("2026-10-31");
  await page.locator("#schedule-links-per-day").fill("2");
  await page.locator("#schedule-days-count").fill("7");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  await expect(page.getByLabel("Post 1 date")).toHaveValue("2026-10-31");
  await expect(page.getByLabel("Post 2 date")).toHaveValue("2026-10-31");
  await expect(page.getByLabel("Post 3 date")).toHaveValue("2026-11-01");
  await expect(page.getByLabel("Post 11 date")).toHaveValue("2026-11-05");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export schedule JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cooking-creator-schedule-draft.json");
});

test("navigation drawer, Settings appearance, and workspace command work and persist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(page.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#workspace-drawer")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeFocused();

  await chooseMenuTool(page, "Creator profile");
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "dark");
  await chooseMenuTool(page, "New recipe");
  await expect(page.locator("#name")).toBeVisible();

  // Chat commands are sent from Home; the destination tool opens as its own screen.
  await page.getByRole("button", { name: "Back to chat home" }).click();
  await page.locator("#workspace-command").fill("new recipe");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "intake");
  await expect(page.locator("#name")).toBeVisible();
  await page.getByRole("button", { name: "Back to chat home" }).click();
  await expect(page.locator("#workspace-command")).toHaveValue("");
});


test("social connection center shows honest OAuth readiness without collecting social passwords", async ({ page }) => {
  await page.goto("/");
  await page.locator("#workspace-command").fill("connect my social accounts");
  await page.getByRole("button", { name: "Send message" }).click();

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

  // Remote in the drawer opens the same feature as the chat command, on its own screen.
  await page.getByRole("button", { name: "Back to chat home" }).click();
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Remote", exact: true }).click();
  await expect(center.getByRole("heading", { name: "Connect your social accounts" })).toBeVisible();
});

test("source research desk records references and exports uncertainty honestly", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
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
  await expect(preview).toContainText("Source references may include manual notes or an explicit public-HTML inspection record");
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
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("Some saved data was invalid and was skipped");
  await expect(page.getByRole("heading", { name: "Corrupt saved draft" })).toHaveCount(0);
});


test("narration script preserves recipe order and flags missing timing before recording", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
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


test("recipe lifecycle requires source review and current-version cooking-trial proof before sharing", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Lemon rice");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();

  await expect(page.getByText("UNTESTED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve pack" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeDisabled();
  await expect(page.getByText("DRAFT", { exact: true })).toBeVisible();

  // A source URL alone is not review. Fill all source-comparison categories.
  await page.getByRole("button", { name: /Add source/ }).click();
  await page.getByLabel("Reference URL").fill("https://example.com/lemon-rice-recipe");
  await page.getByLabel("What did you actually check?").fill("Compared the source ingredient list and method order.");
  await page.getByLabel("Ingredient quantities & differences").fill("One cup cooked rice and one tablespoon lemon juice are listed.");
  await page.getByLabel("Method / step-order findings").fill("Warm the pan, fold in the rice, then add lemon juice.");
  await page.getByLabel("Cooking timing & heat findings").fill("This source does not state exact timing or heat settings.");
  await page.getByLabel("Food safety & storage notes").fill("Storage is not stated by this source; check authoritative guidance separately.");

  // Complete the recipe enough to enter the Ready for cooking trial stage.
  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 1 amount").fill("1");
  await page.getByLabel("Ingredient 1 unit").fill("cup");
  await page.getByLabel("Ingredient 1 name").fill("cooked rice");

  await page.getByRole("button", { name: /Add step/ }).click();
  await page.getByLabel("Action / instruction").fill("Warm the cooked rice in a pan, then add lemon juice.");
  await page.getByLabel("Timing", { exact: true }).fill("3 minutes");
  await page.getByLabel("Heat / setting").fill("medium");
  await page.getByLabel("Visual / doneness cue").fill("Rice is steaming hot and evenly coated.");
  await page.getByRole("checkbox", { name: "Add cooked rice at step 1" }).check();

  await page.getByRole("button", { name: "Mark source review complete" }).click();
  await expect(page.getByText("READY FOR COOKING TRIAL", { exact: true })).toBeVisible();

  // Enter current-version proof, then confirm a missing date still blocks Tested.
  const trialDate = await page.evaluate(() => {
    const now = new Date();
    const year = String(now.getFullYear()).padStart(4, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return [year, month, day].join("-");
  });
  await page.getByLabel("What changed (or confirm no changes)").fill("No changes; followed the recipe as written.");
  await page.getByLabel("What happened when you cooked it?").fill("Cooked at home; texture and taste were checked.");
  await page.locator("#trial-photo").setInputFiles({
    name: "cooked-dish.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(page.getByRole("status")).toContainText("Cooking-trial photo saved locally");
  await expect(page.getByAltText("Your cooking-trial photo for Lemon rice")).toBeVisible();
  await page.getByLabel("Your trial rating").selectOption("5");
  await page.getByRole("button", { name: "Mark as Tested" }).click();
  await expect(page.getByRole("status")).toContainText("actual cooking-trial date");
  await expect(page.getByText("UNTESTED", { exact: true })).toBeVisible();

  await page.locator("#trial-date").fill(trialDate);
  await page.getByRole("button", { name: "Mark as Tested" }).click();
  await expect(page.getByText("TESTED BY YOU")).toBeVisible();

  await page.getByRole("button", { name: "Prepare content pack" }).click();
  const pack = page.locator(".approval-panel .tutorial-preview pre");
  await expect(pack).toContainText("HOOK OPTIONS");
  await expect(pack).toContainText("1. Here's how to make Lemon rice step by step.");
  await expect(pack).toContainText("#EasyRecipes");
  await expect(pack).toContainText("does not create a video");
  await expect(pack).toContainText("US-first creator production appendix");
  await expect(pack).toContainText("USD-oriented business tracking");
  await expect(pack).toContainText("Owner sign-off");
  await expect(pack).toContainText(`Actual cooking-trial date: ${trialDate}`);
  await expect(pack).toContainText("What changed during the trial: No changes; followed the recipe as written.");
  await expect(pack).toContainText("Current-version trial photo: revision matches the current recipe");
  await expect(pack).toContainText("Current-version trial notes: revision matches the current recipe");
  await expect(pack).toContainText("Recipe lifecycle stage: Tested by owner");
  await expect(pack).toContainText("Evidence review timestamp:");
  await expect(pack).toContainText("Source links for creator-policy review");
  await expect(pack).toContainText("Originality and differentiation worksheet");
  await expect(pack).toContainText("Platform-specific finishing pass");
  await expect(pack).toContainText("Step-by-step voiceover draft");
  await expect(pack).toContainText("Evidence-linked factual-claim ledger");
  await expect(pack).toContainText("OWNER REVIEW REQUIRED");
  await expect(pack).toContainText("Nutrition traceability — manual values only");
  await expect(pack).toContainText("Pinned-comment idea");

  await page.getByRole("button", { name: "Approve pack" }).click();
  await expect(page.locator("#publish-queue").getByText("APPROVED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeEnabled();

  // Storyboard changes require pack re-approval but do not claim the dish was never cooked.
  await page.getByLabel("Scene 1 title").fill("New original opening shot");
  await expect(page.getByText("TESTED BY YOU", { exact: true })).toBeVisible();
  await expect(page.locator("#publish-queue").getByText("AWAITING APPROVAL", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeDisabled();
  await page.getByRole("button", { name: "Approve pack" }).click();
  await expect(page.locator("#publish-queue").getByText("APPROVED", { exact: true })).toBeVisible();

  // Profile is a dedicated Settings screen; changing generated copy must renew pack approval.
  await chooseMenuTool(page, "Creator profile");
  // openSettingsView expands this details panel as part of screen navigation.
  await expect(page.getByLabel("Voice / tone")).toBeVisible();
  await page.getByLabel("Voice / tone").fill("Warm, practical, and more concise");
  await chooseMenuTool(page, "New recipe");
  await expect(page.getByText("TESTED BY YOU", { exact: true })).toBeVisible();
  await expect(page.locator("#publish-queue").getByText("AWAITING APPROVAL", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeDisabled();
  await page.getByRole("button", { name: "Approve pack" }).click();
  await expect(page.locator("#publish-queue").getByText("APPROVED", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 2 amount").fill("1");
  await page.getByLabel("Ingredient 2 unit").fill("tbsp");
  await page.getByLabel("Ingredient 2 name").fill("lemon juice");
  await expect(page.getByText("UNTESTED", { exact: true })).toBeVisible();
  await expect(page.getByText(/photo is retained for reference but belongs to an earlier recipe version/i)).toBeVisible();
  await expect(page.getByText(/notes are retained from an earlier recipe version/i)).toBeVisible();
  await expect(page.getByText("AWAITING APPROVAL", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share approved pack" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Mark source review complete" })).toBeEnabled();
});
test("content pack export downloads a text file without publishing", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Lemon rice");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export pack" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("lemon-rice.content-pack.txt");
  const exportedPack = await readFile(await download.path(), "utf8");
  expect(exportedPack).toContain("US-first creator production appendix");
  expect(exportedPack).toContain("USD-oriented business tracking");
  expect(exportedPack).toContain("Source links for creator-policy review");
  expect(exportedPack).toContain("Evidence-linked factual-claim ledger");
  expect(exportedPack).toContain("Nutrition traceability — manual values only");
  expect(exportedPack).toContain("Originality and differentiation worksheet");
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
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => "serviceWorker" in navigator)).toBe(true);
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
  });
  // A fresh navigation gives the newly installed worker a chance to control this page.
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 15_000 });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /You’re offline/ })).toBeVisible();
  await expect(page.getByText(/private workspace page is not stored offline/i)).toBeVisible();
  await page.context().setOffline(false);
});


test("creator profile saves locally, shapes content-pack guidance, and travels with JSON backup", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Creator profile");
  await page.getByLabel("Voice / tone").fill("Professional and concise");
  await page.getByLabel("Main language").fill("English");
  await page.getByLabel("Target platforms").fill("YouTube Shorts, Instagram Reels");
  await page.getByLabel("3–5 sample captions in your real voice").fill("A simple dinner with clear steps.\\nCook with me tonight.");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Tomato pasta");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await page.getByRole("button", { name: "Prepare content pack" }).click();
  const pack = page.locator(".approval-panel .tutorial-preview pre");
  await expect(pack).toContainText("Tone: Professional and concise");
  await expect(pack).toContainText("Target platforms: YouTube Shorts, Instagram Reels");
  await expect(pack).toContainText("A simple dinner with clear steps.");
  await expect(pack).toContainText("Follow this step-by-step Tomato pasta tutorial.");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".action-row").getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(download.suggestedFilename()).toBe("tomato-pasta.json");
  expect(path).toBeTruthy();
  const exported = JSON.parse(await readFile(path!, "utf8")) as { creatorProfile?: { tone?: string; sampleCaptions?: string } };
  expect(exported.creatorProfile?.tone).toBe("Professional and concise");
  expect(exported.creatorProfile?.sampleCaptions).toContain("A simple dinner with clear steps.");
  await chooseMenuTool(page, "Creator profile");
  await page.locator("#profile-tone").fill("Casual");
  await page.locator("#import-backup").setInputFiles(path!);
  await expect(page.locator("#profile-tone")).toHaveValue("Professional and concise");
});


test("workspace backup exports all drafts and restores them with explicit confirmation", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Creator profile");
  await page.getByLabel("Voice / tone").fill("Workspace backup profile");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("First backup recipe");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await chooseMenuTool(page, "Library / recent drafts");

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

  await chooseMenuTool(page, "Creator profile");
  await page.getByLabel("Voice / tone").fill("Changed before restore");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Temporary current draft");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#import-backup").setInputFiles(path!);
  await chooseMenuTool(page, "Creator profile");

  await expect(page.locator("#profile-tone")).toHaveValue("Workspace backup profile");
  await chooseMenuTool(page, "New recipe");
  await expect(page.getByRole("heading", { name: "First backup recipe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Temporary current draft" })).toHaveCount(0);
  await chooseMenuTool(page, "Library / recent drafts");
  await expect(page.locator(".recent-item strong")).toHaveCount(1);
});



test("light workspace theme uses the requested warm cream and terracotta palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".shell")).toHaveAttribute("data-theme", "light");

  const palette = await page.evaluate(() => ({
    background: window.getComputedStyle(document.body).backgroundColor,
    dock: window.getComputedStyle(document.querySelector(".quick-dock")!).backgroundColor,
  }));
  expect(palette.background).toBe("rgb(241, 238, 221)");
  expect(palette.dock).toBe("rgb(113, 59, 42)");
});


test("manual sourced nutrition worksheet calculates exact entries and labels the estimate honestly", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
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
  await chooseMenuTool(page, "New recipe");
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
  const sourceUrl = "https://recipes.example.com/lemon-rice";
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
  await chooseMenuTool(page, "New recipe");
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
  await expect(page.locator('.source-reference textarea[id^="source-notes-"]')).toHaveValue(/recipe details are not independently verified/);

  // The inspected payload must remain available after draft creation and be
  // explicitly imported to the separate V2 evidence ledger, with claims still unreviewed.
  await expect(page.getByRole("heading", { name: "Import inspected page into the evidence ledger" })).toBeVisible();
  await page.getByRole("button", { name: "Save inspected facts to evidence ledger" }).click();
  await expect(page.getByText(/Saved the inspected page and \d+ extracted field/)).toBeVisible();
  await expect(page.getByText(/Lemon Rice · recipe name: Lemon Rice/)).toBeVisible();
  await expect(page.getByText(/Lemon Rice · ingredient 1: 2 cups cooked rice/)).toBeVisible();
  await expect(page.getByText(/Status: unreviewed/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import inspected page into the evidence ledger" })).toHaveCount(0);

  // Re-inspecting the same canonical URL must update the existing source rather
  // than fabricate a second independent source or duplicate unchanged claims.
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Lemon rice re-inspection");
  await page.locator("#url").fill(sourceUrl);
  await page.getByRole("button", { name: "Inspect public recipe page" }).click();
  await expect(page.locator(".source-inspection-preview")).toBeVisible();
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await expect(page.getByRole("heading", { name: "Import inspected page into the evidence ledger" })).toBeVisible();
  await page.getByRole("button", { name: "Save inspected facts to evidence ledger" }).click();
  await expect(page.getByText("Updated the existing source details. No duplicate facts were added.")).toBeVisible();
  await expect(page.locator(".research-evidence-counts span").nth(0)).toContainText("1");
  await expect(page.getByText(/Lemon Rice · ingredient 1: 2 cups cooked rice/)).toHaveCount(1);
});

test("pasting a supported recipe or video URL into the chat dock prefills intake and explains the inspection limits", async ({ page }) => {
  await page.goto("/");
  const sourceUrl = "https://www.youtube.com/watch?v=123456789ab";
  await page.locator("#workspace-command").fill(sourceUrl);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#url")).toHaveValue(sourceUrl);
  await expect(page.locator("#intake")).toBeVisible();
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("added your source URL to recipe intake");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("Video/Reel audio and frames are not analyzed");
  await expect(page.locator("#name")).toBeVisible();
});

test("chat menu selections are shown in the transcript and pasted links prefill Plan Content", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();

  await chooseMenuTool(page, "Today's Plan");
  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "plan");
  await expect(page.locator("#daily-plan")).toBeVisible();
  await page.getByRole("button", { name: "Back to chat home" }).click();
  await expect(page.locator(".chat-message.from-user").last()).toContainText("Today’s Plan");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("Today’s Plan is open");

  // Use 11 links here to prove chat intake is not limited to the old seven-link preset.
  const links = Array.from({ length: 11 }, (_, index) => `https://example.com/reel-${index + 1}`);
  const request = `Take these ${links.length} Reels and post over 3 days, morning, afternoon and evening where appropriate:\n${links.join("\n")}`;
  await page.locator("#workspace-command").fill(request);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "content");
  await expect(page.locator("#schedule-links")).toHaveValue(links.join(String.fromCharCode(10)));
  await expect(page.getByRole("button", { name: "Build my custom plan" })).toBeVisible();
  await expect(page.locator(".schedule-table tbody tr")).toHaveCount(0);
  await page.locator("#schedule-links-per-day").fill("4");
  await page.locator("#schedule-days-count").fill("3");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  await expect(page.locator(".schedule-table tbody tr")).toHaveCount(11);
  await expect(page.locator(".schedule-table")).toContainText("Draft — approval needed");

  await page.reload();
  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "content");
  await expect(page.locator("#schedule-links")).toHaveValue(links.join("\n"));
  await page.getByRole("button", { name: "Back to chat home" }).click();
  await expect(page.locator(".chat-message.from-user").last()).toContainText("Take these 11 Reels");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("placed them in Plan Content");
});

test("chat dock rejects non-HTTP(S) links rather than adding them as recipe sources", async ({ page }) => {
  await page.goto("/");
  await page.locator("#workspace-command").fill("ftp://example.com/recipe");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#url")).toHaveValue("");
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("Only a valid HTTP(S) URL can be added");
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
  await expect(page.getByRole("heading", { name: /What are we cooking today/ })).toBeVisible();
});

test("AUTH: logging out clears the session and protects later workspace requests", async ({ page }) => {
  await signInOwner(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});


test("mixed valid and unsupported URL schemes are reported instead of silently omitted", async ({ page }) => {
  await page.goto("/");
  await page.locator("#workspace-command").fill("Plan these links https://example.com/reel ftp://example.com/recipe");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("1 are not valid HTTP(S) URLs");
  await expect(page.locator("#schedule-links")).toHaveValue("https://example.com/reel");
  await expect(page.getByRole("button", { name: "Build my custom plan" })).toBeVisible();
});


test("new chat link intake replaces stale saved schedule rows", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Plan Content");
  await page.locator("#schedule-links").fill("https://example.com/old-reel");
  await page.locator("#schedule-links-per-day").fill("1");
  await page.locator("#schedule-days-count").fill("1");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  await expect(page.locator(".schedule-table tbody tr")).toHaveCount(1);

  await page.reload();
  // The active screen is restored after reload; return Home to send a new chat command.
  await page.getByRole("button", { name: "Back to chat home" }).click();
  await page.locator("#workspace-command").fill("Plan this new link https://example.com/new-reel");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#schedule-links")).toHaveValue("https://example.com/new-reel");
  await expect(page.locator(".schedule-table tbody tr")).toHaveCount(0);
  await expect(page.locator(".chat-message.from-assistant").last()).toContainText("in Plan Content");
});

test("manual link-list edits clear stale schedule rows before export", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Plan Content");
  await page.locator("#schedule-links").fill("https://example.com/old-manual-link");
  await page.locator("#schedule-links-per-day").fill("1");
  await page.locator("#schedule-days-count").fill("1");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  await expect(page.locator(".schedule-table tbody tr")).toHaveCount(1);

  await page.locator("#schedule-links").fill("https://example.com/new-manual-link");
  await expect(page.locator(".schedule-table tbody tr")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export schedule JSON" })).toHaveCount(0);
  await expect(page.locator(".message")).toContainText("Build a new plan");
});
test("Library has an empty state and tool screens have a back button", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "library");
  await expect(page.getByRole("heading", { name: "No recipe drafts yet" })).toBeVisible();
  await expect(page.locator("#workspace-command")).toBeHidden();
  await expect(page.getByRole("button", { name: "Back to chat home" })).toBeVisible();
  await page.getByRole("button", { name: "Start a recipe project" }).click();
  await expect(page.locator("#name")).toBeVisible();
  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "intake");
  await page.getByRole("button", { name: "Back to chat home" }).click();
});


test("V2 evidence import preserves the bounded page excerpt when structured recipe data is absent", async ({ page }) => {
  const sourceUrl = "https://recipes.example.com/story-without-recipe-markup";
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
          limitation: "Readable public page text only; no structured recipe and no video/audio analysis.",
          title: "A cooking story",
          description: "",
          siteName: "Example Kitchen",
          textExcerpt: "The author describes a simmered tomato sauce and says to cook until thick. No ingredient quantities are present in this excerpt.",
          structuredRecipe: null,
        },
      }),
    });
  });

  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Story excerpt evidence");
  await page.locator("#url").fill(sourceUrl);
  await page.getByRole("button", { name: "Inspect public recipe page" }).click();
  await expect(page.locator(".source-inspection-preview")).toContainText("A cooking story");
  await expect(page.locator(".source-inspection-preview")).toContainText("No ingredient quantities are present");

  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await page.getByRole("heading", { name: "Import inspected page into the evidence ledger" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Save inspected facts to evidence ledger" }).click();

  await expect(page.getByText(/Saved the inspected page and 1 extracted field/)).toBeVisible();
  await expect(page.getByText(/A cooking story · page text excerpt:/)).toBeVisible();
  await expect(page.locator(".research-evidence-list").nth(1).getByText(/No ingredient quantities are present in this excerpt/).first()).toBeVisible();
  await expect(page.getByText(/Status: unreviewed/).first()).toBeVisible();
});


test("V2 evidence ledger saves sources and claims locally, flags possible disagreements, and survives reload", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Evidence ledger test recipe");
  await page.locator("#servings").fill("2");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await expect(page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true })).toBeVisible();
  await page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true }).scrollIntoViewIfNeeded();

  await page.locator("#evidence-source-url").fill("https://example.com/recipe-a");
  await page.locator("#evidence-source-title").fill("Recipe source A");
  await page.getByRole("button", { name: /Save source/ }).click();
  await expect(page.locator(".research-evidence-list").first().getByText("Recipe source A", { exact: true })).toBeVisible();

  await page.locator("#evidence-source-url").fill("https://example.org/recipe-b");
  await page.locator("#evidence-source-title").fill("Recipe source B");
  await page.getByRole("button", { name: /Save source/ }).click();
  await expect(page.locator(".research-evidence-list").first().getByText("Recipe source B", { exact: true })).toBeVisible();

  await page.locator("#evidence-claim-source").selectOption({ label: "Recipe source A" });
  await page.locator("#evidence-claim-subject").fill("salt");
  await page.locator("#evidence-claim-predicate").fill("quantity");
  await page.locator("#evidence-claim-value").fill("1");
  await page.locator("#evidence-claim-unit").fill("tsp");
  await page.locator("#evidence-claim-excerpt").fill("Source A lists one teaspoon.");
  await page.locator("#evidence-claim-media-timestamp").fill("01:23");
  await page.getByRole("button", { name: /Save unreviewed claim/ }).click();
  await expect(page.getByText(/salt · quantity: 1 tsp/)).toBeVisible();
  await expect(page.getByText("Video timestamp: 01:23")).toBeVisible();

  await page.locator("#evidence-claim-source").selectOption({ label: "Recipe source B" });
  await page.locator("#evidence-claim-subject").fill("salt");
  await page.locator("#evidence-claim-predicate").fill("quantity");
  await page.locator("#evidence-claim-value").fill("2");
  await page.locator("#evidence-claim-unit").fill("tsp");
  await page.locator("#evidence-claim-excerpt").fill("Source B lists two teaspoons.");
  await page.getByRole("button", { name: /Save unreviewed claim/ }).click();
  await expect(page.getByText("2 possible disagreements")).toHaveCount(0);
  await expect(page.getByText("1 possible disagreements")).toBeVisible();
  await expect(page.getByText("Source A lists one teaspoon.")).toBeVisible();
  await expect(page.getByText("Source B lists two teaspoons.")).toBeVisible();

  await page.reload();
  await expect(page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true })).toBeVisible();
  await expect(page.locator(".research-evidence-list").first().getByText("Recipe source A", { exact: true })).toBeVisible();
  await expect(page.locator(".research-evidence-list").first().getByText("Recipe source B", { exact: true })).toBeVisible();
  await expect(page.getByText("1 possible disagreements")).toBeVisible();

  const backupTimestamp = new Date().toISOString();
  const replacementArchive = {
    version: 1,
    updatedAt: backupTimestamp,
    sources: [{
      id: "source-replacement-restore-test",
      url: "https://replacement.com/recipe",
      title: "Replacement source",
      publisher: "Playwright test",
      capturedAt: backupTimestamp,
      captureMethod: "manual",
      status: "needs-input",
      warnings: ["Test-only source; not independently verified."],
    }],
    claims: [],
  };
  const restoreDialogPromise = page.waitForEvent("dialog");
  const restoreFilePromise = page.getByLabel("Restore evidence backup JSON").setInputFiles({
    name: "replacement-evidence.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replacementArchive)),
  });
  const restoreDialog = await restoreDialogPromise;
  expect(restoreDialog.type()).toBe("confirm");
  expect(restoreDialog.message()).toContain("replaces the current local evidence ledger");
  await restoreDialog.dismiss();
  await restoreFilePromise;
  await expect(page.getByText("Restore cancelled. Your current evidence was not changed.")).toBeVisible();
  await expect(page.locator(".research-evidence-list").first().getByText("Recipe source A", { exact: true })).toBeVisible();
  await expect(page.locator(".research-evidence-list").first().getByText("Replacement source", { exact: true })).toHaveCount(0);
});


test("V2 evidence ledger rejects stale writes from another tab without losing newer records", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Cross-tab evidence test");
  await page.locator("#servings").fill("2");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true }).scrollIntoViewIfNeeded();

  await page.locator("#evidence-source-url").fill("https://example.com/shared-source-a");
  await page.locator("#evidence-source-title").fill("Shared source A");
  await page.getByRole("button", { name: /Save source/ }).click();
  await expect(page.locator(".research-evidence-list").first().getByText("Shared source A", { exact: true })).toBeVisible();

  // Open a second tab after source A has been saved so it has the same baseline.
  const secondPage = await page.context().newPage();
  try {
    await secondPage.goto("/");
    await expect(secondPage.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true })).toBeVisible();
    await expect(secondPage.locator(".research-evidence-list").first().getByText("Shared source A", { exact: true })).toBeVisible();

    // The first tab advances the stored archive after the second tab has loaded.
    await page.locator("#evidence-source-url").fill("https://example.org/shared-source-b");
    await page.locator("#evidence-source-title").fill("Shared source B");
    await page.getByRole("button", { name: /Save source/ }).click();
    await expect(page.locator(".research-evidence-list").first().getByText("Shared source B", { exact: true })).toBeVisible();

    // The stale second tab must refuse to replace the newer archive with A + C.
    await secondPage.locator("#evidence-source-url").fill("https://example.net/stale-source-c");
    await secondPage.locator("#evidence-source-title").fill("Stale source C");
    await secondPage.getByRole("button", { name: /Save source/ }).click();
    await expect(secondPage.getByText(/evidence ledger changed in another tab/i)).toBeVisible();
    await expect(page.locator(".research-evidence-list").first().getByText("Shared source B", { exact: true })).toBeVisible();

    await secondPage.reload();
    await expect(secondPage.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true })).toBeVisible();
    await expect(secondPage.locator(".research-evidence-list").first().getByText("Shared source A", { exact: true })).toBeVisible();
    await expect(secondPage.locator(".research-evidence-list").first().getByText("Shared source B", { exact: true })).toBeVisible();
    await expect(secondPage.locator(".research-evidence-list").first().getByText("Stale source C", { exact: true })).toHaveCount(0);
  } finally {
    await secondPage.close();
  }
});


test("V2 evidence ledger can recover an invalid saved archive from an explicit backup", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Evidence recovery test");
  await page.locator("#servings").fill("2");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true }).scrollIntoViewIfNeeded();

  // Simulate a malformed archive left by an old build, interrupted migration,
  // or browser-side corruption. The application must not silently overwrite it.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("cooking-creator-research-evidence", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("archives", "readwrite");
        transaction.objectStore("archives").put({ version: 999, invalid: true }, "primary");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });

  await page.reload();
  await expect(page.locator(".research-evidence-vault .research-evidence-error")).toContainText("saved evidence archive failed validation");
  await expect(page.getByLabel("Restore evidence backup JSON")).toBeEnabled();

  const backupTimestamp = new Date().toISOString();
  const validArchive = {
    version: 1,
    updatedAt: backupTimestamp,
    sources: [{
      id: "source-recovered-from-backup",
      url: "https://recovery.example.org/recipe",
      title: "Recovered source",
      publisher: "Recovery test",
      capturedAt: backupTimestamp,
      captureMethod: "manual",
      status: "needs-input",
      warnings: ["Recovered test data; not independently verified."],
    }],
    claims: [],
  };

  const restoreDialogPromise = page.waitForEvent("dialog");
  const restoreFilePromise = page.getByLabel("Restore evidence backup JSON").setInputFiles({
    name: "recovery-evidence.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(validArchive)),
  });
  const restoreDialog = await restoreDialogPromise;
  expect(restoreDialog.type()).toBe("confirm");
  expect(restoreDialog.message()).toContain("current evidence ledger could not be loaded");
  await restoreDialog.accept();
  await restoreFilePromise;

  await expect(page.getByText("Evidence backup restored. Review the source records before relying on them.")).toBeVisible();
  await expect(page.locator(".research-evidence-list").first().getByText("Recovered source", { exact: true })).toBeVisible();

  // The recovered archive should survive another full component reload.
  await page.reload();
  await expect(page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true })).toBeVisible();
  await expect(page.locator(".research-evidence-list").first().getByText("Recovered source", { exact: true })).toBeVisible();
});


test("V2 evidence records can be removed safely, including linked claims", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Evidence deletion test");
  await page.locator("#servings").fill("2");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true }).scrollIntoViewIfNeeded();

  await page.locator("#evidence-source-url").fill("https://delete-test.example.com/recipe");
  await page.locator("#evidence-source-title").fill("Source to remove");
  await page.getByRole("button", { name: /Save source/ }).click();
  await page.locator("#evidence-claim-source").selectOption({ label: "Source to remove" });
  await page.locator("#evidence-claim-subject").fill("salt");
  await page.locator("#evidence-claim-predicate").fill("quantity");
  await page.locator("#evidence-claim-value").fill("1");
  await page.getByRole("button", { name: /Save unreviewed claim/ }).click();
  await expect(page.getByText(/salt · quantity: 1/)).toBeVisible();

  const sourceRecord = page.locator(".research-evidence-list").first().locator(".research-evidence-record").filter({ hasText: "Source to remove" });
  let cancelDialogMessage = "";
  page.once("dialog", (dialog) => {
    cancelDialogMessage = dialog.message();
    void dialog.dismiss();
  });
  await sourceRecord.getByRole("button", { name: "Remove source and linked claims", exact: true }).click({ noWaitAfter: true });
  expect(cancelDialogMessage).toContain("linked claim");
  await expect(sourceRecord.getByText("Source to remove", { exact: true })).toBeVisible();
  await expect(page.getByText(/salt · quantity: 1/)).toBeVisible();

  let confirmDialogMessage = "";
  page.once("dialog", (dialog) => {
    confirmDialogMessage = dialog.message();
    void dialog.accept();
  });
  await sourceRecord.getByRole("button", { name: "Remove source and linked claims", exact: true }).click({ noWaitAfter: true });
  expect(confirmDialogMessage).toContain("linked claim");
  await expect(page.getByText("Source to remove", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/salt · quantity: 1/)).toHaveCount(0);
  await expect(page.getByText("0 sources")).toBeVisible();
  await expect(page.getByText("0 claims")).toBeVisible();
});


test("US audience scheduling supports multiple time zones and values beyond the old arbitrary caps", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Plan Content");
  await page.locator("#schedule-links").fill([
    "https://example.com/one",
    "https://example.com/two",
    "https://example.com/three",
  ].join(String.fromCharCode(10)));

  await page.locator("#schedule-audience-timezone").selectOption("America/Los_Angeles");

  // Save timezone choices immediately, without needing to generate a schedule.
  await page.waitForFunction(() => {
    const saved = localStorage.getItem("cooking-creator-local-schedule-v1");
    return Boolean(saved && JSON.parse(saved).timeZone === "America/Los_Angeles");
  });
  await page.reload();
  await chooseMenuTool(page, "Plan Content");
  await expect(page.locator("#schedule-audience-timezone")).toHaveValue("America/Los_Angeles");

  await expect(page.locator('label[for="schedule-start-date"]')).toContainText("Pacific Time (PT)");
  await expect(page.locator("#schedule-links-per-day")).not.toHaveAttribute("max");
  await expect(page.locator("#schedule-days-count")).not.toHaveAttribute("max");
  await page.locator("#schedule-links-per-day").fill("1500");
  await page.locator("#schedule-days-count").fill("400");
  await page.waitForFunction(() => {
    const saved = localStorage.getItem("cooking-creator-local-schedule-v1");
    return Boolean(saved && JSON.parse(saved).linksPerDay === "1500" && JSON.parse(saved).daysToProcess === "400");
  });
  await page.reload();
  await chooseMenuTool(page, "Plan Content");
  await expect(page.locator("#schedule-links-per-day")).toHaveValue("1500");
  await expect(page.locator("#schedule-days-count")).toHaveValue("400");
  await page.getByRole("button", { name: "Build my custom plan" }).click();

  const rows = page.locator(".schedule-table tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(page.getByLabel("Post 1 date")).toHaveValue(await page.locator("#schedule-start-date").inputValue());
  await expect(page.getByLabel("Post 2 date")).toHaveValue(await page.locator("#schedule-start-date").inputValue());
  await expect(page.getByLabel("Post 1 time")).toHaveValue("09:00");
  await expect(page.getByLabel("Post 2 time")).toHaveValue("13:00");
  await expect(page.locator(".schedule-table thead")).toContainText("Time (PT)");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export schedule JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cooking-creator-schedule-draft.json");
  const path = await download.path();
  expect(path).toBeTruthy();
  const exported = JSON.parse(await readFile(path!, "utf8")) as {
    audienceTimezone?: string;
    audienceTimezoneLabel?: string;
    posts?: Array<{ url: string; date: string; time: string }>;
  };
  expect(exported.audienceTimezone).toBe("America/Los_Angeles");
  expect(exported.audienceTimezoneLabel).toBe("Pacific Time (PT)");
  expect(exported.posts?.map((post) => post.url)).toEqual([
    "https://example.com/one",
    "https://example.com/two",
    "https://example.com/three",
  ]);
});


test("V2 evidence ledger reuses an existing canonical source instead of duplicating it", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("Canonical source deduplication test");
  await page.locator("#servings").fill("2");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await page.locator(".research-evidence-vault").getByRole("heading", { name: "Evidence ledger", exact: true }).scrollIntoViewIfNeeded();

  await page.locator("#evidence-source-url").fill("https://example.com/same-recipe#ingredients");
  await page.locator("#evidence-source-title").fill("Original source");
  await page.getByRole("button", { name: /Save source/ }).click();
  await expect(page.getByText("1 sources")).toBeVisible();

  // A fragment and trailing slash are not independent source identities.
  await page.locator("#evidence-source-url").fill("https://example.com/same-recipe/");
  await page.locator("#evidence-source-title").fill("Duplicate title should not replace original");
  await page.getByRole("button", { name: /Save source/ }).click();

  await expect(page.getByText(/already in the evidence ledger/i)).toBeVisible();
  await expect(page.getByText("1 sources")).toBeVisible();
  await expect(page.locator(".research-evidence-list").first().getByText("Original source", { exact: true })).toBeVisible();
  await expect(page.getByText("Duplicate title should not replace original", { exact: true })).toHaveCount(0);
  await expect(page.locator("#evidence-claim-source")).toHaveValue(/source-/);
});


test("chat link planning accepts any submitted URL count and prefers explicit links over an old saved list", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cooking-creator-local-schedule-v1", JSON.stringify({
      linksText: "https://old.example/previous-list",
      startDate: "2026-10-14",
      plan: [],
    }));
  });
  await page.goto("/");

  const requestedLinks = [
    "https://example.com/a",
    "https://example.com/b",
    "https://example.com/c",
  ];
  await page.locator("#workspace-command").fill(
    `Plan these videos: ${requestedLinks.join(" ")}`,
  );
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#schedule-links")).toHaveValue(requestedLinks.join("\n"));
  await expect(page.locator(".chat-transcript")).toContainText("I found 3 valid HTTP(S) link(s)");
  await expect(page.locator(".chat-transcript")).not.toContainText("exactly seven");
  await expect(page.locator("#schedule-links")).not.toHaveValue("https://old.example/previous-list");

  await page.locator("#schedule-links-per-day").fill("2");
  await page.locator("#schedule-days-count").fill("2");
  await page.getByRole("button", { name: "Build my custom plan" }).click();
  await expect(page.locator(".schedule-table tbody tr")).toHaveCount(3);
  await expect(page.getByLabel("Post 1 date")).toHaveValue("2026-10-14");
  await expect(page.getByLabel("Post 3 date")).toHaveValue("2026-10-15");
});

test("Growth Lab validates manual metrics, previews CSV errors and exports local data", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Growth Lab");
  await expect(page.getByRole("heading", { name: "Growth Lab" })).toBeVisible();

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const tomorrowDate = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return [year, month, day].join("-");
  });
  await page.getByLabel("Publish date").fill(tomorrowDate);
  await page.getByLabel("Content title").fill("Lemon rice Short");
  await page.getByLabel("Views").fill("1200");
  await page.getByLabel("Reach / impressions").fill("1000");
  await page.getByLabel("Reported revenue for this content (USD)").fill("12.50");
  await page.getByRole("button", { name: "Add metric row" }).click();
  await expect(page.getByRole("status")).toContainText("future publish date");
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Actual metric rows" }).locator("strong")).toHaveText("0");
  await page.getByLabel("Publish date").fill("2026-10-20");
  await page.getByRole("button", { name: "Add metric row" }).click();
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Actual metric rows" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Reported revenue · actual USD" }).locator("strong")).toHaveText("$12.50");
  await expect(page.getByText("Lemon rice Short", { exact: true })).toBeVisible();
  await expect(page.getByText("ACTUAL", { exact: true })).toBeVisible();

  const csv = [
    "published_date,platform,content_title,concept,data_kind,views,reach,average_watch_seconds,retention_percent,likes,comments,shares,saves,followers_gained,link_clicks,revenue_usd",
    "2026-10-21,Instagram Reels,Tomato pasta,Weeknight meals,estimate,500,,,,,,,,,,0.40",
    "2026-02-30,Instagram Reels,Bad date,Weeknight meals,actual,20,,,,,,,,,,",
  ].join("\n");
  await page.locator("#growth-csv-file").setInputFiles({
    name: "platform-metrics.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  const preview = page.getByRole("region", { name: "CSV import preview" });
  await expect(preview).toContainText("1 valid row(s) ready");
  await expect(preview).toContainText("1 rejected row(s)");
  await page.getByRole("button", { name: "Import valid CSV rows" }).click();
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Estimated rows" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Revenue · estimates USD" }).locator("strong")).toHaveText("$0.40");
  await expect(page.getByText("Tomato pasta", { exact: true })).toBeVisible();
  await expect(page.getByText("ESTIMATE", { exact: true })).toBeVisible();

  await page.getByLabel("Hypothesis").fill("A clearer close-up will improve viewer retention.");
  await page.getByLabel("Variable changed").fill("Opening shot");
  await page.locator("#growth-experiment-start-date").fill("2026-10-20");
  await page.getByRole("button", { name: "Add experiment" }).click();
  const card = page.locator(".growth-experiment-card").filter({ hasText: "A clearer close-up will improve viewer retention." });
  await expect(card).toBeVisible();
  await card.getByLabel("Result date").fill("2026-10-22");
  await card.getByLabel("Observed outcome (use actual numbers where available)").fill("Recorded 1,200 actual views; the sample remains small.");
  await card.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByRole("status")).toContainText("next action before marking");
  await expect(card.locator(".growth-status-planned")).toContainText("planned");
  await card.getByLabel("Next action").fill("Repeat cautiously with one variable changed and compare actual results.");
  await card.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(card.locator(".growth-status-reviewed")).toContainText("reviewed");

  const csvDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export metrics CSV" }).click();
  const csvDownload = await csvDownloadPromise;
  expect(csvDownload.suggestedFilename()).toBe("cooking-creator-growth-metrics.csv");

  const jsonDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full backup JSON" }).click();
  const jsonDownload = await jsonDownloadPromise;
  expect(jsonDownload.suggestedFilename()).toBe("cooking-creator-growth-lab-backup.json");

  const backupContents = await readFile(await jsonDownload.path(), "utf8");
  await page.locator("#growth-backup-file").setInputFiles({
    name: "growth-lab-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupContents, "utf8"),
  });
  await expect(page.getByRole("status")).toContainText("skipped 2 duplicate metric row(s)");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.reload();
  await chooseMenuTool(page, "Growth Lab");
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Actual metric rows" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Estimated rows" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".growth-summary-card").filter({ hasText: "Reported revenue · actual USD" }).locator("strong")).toHaveText("$12.50");
  await expect(page.getByText("Lemon rice Short", { exact: true })).toBeVisible();
});



test("V2.4 editorial calendar records original ideas, gates Hold, persists and exports", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Editorial Calendar");
  await expect(page.getByRole("heading", { name: "Editorial calendar & idea research" })).toBeVisible();
  await expect(page.locator(".editorial-day-cell")).toHaveCount(42);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return [year, month, day].join("-");
  });
  const title = "Original kitchen texture experiment";
  await page.locator("#editorial-title").fill(title);
  await page.locator("#editorial-series").fill("Weeknight meals");
  await page.locator("#editorial-platform").selectOption("YouTube Shorts");
  await page.locator("#editorial-date").fill(tomorrow);
  await page.locator("#editorial-promise").fill("Show a viewer one practical texture cue they can repeat at home.");
  await page.locator("#editorial-original").fill("Demonstrate the actual dish, explain the texture cue, and record the creator's own cooking trial.");
  await page.getByRole("button", { name: "Save idea locally" }).click();

  const card = page.locator(".editorial-idea-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Hypothesis (not a live trend)");
  await card.getByLabel("Status").selectOption("hold");
  await expect(page.getByRole("status")).toContainText("concrete unresolved question or blocker");
  await expect(card.getByLabel("Status")).toHaveValue("idea");

  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#editorial-unresolved-questions").fill("Confirm the recipe heat cue and media-rights status before publishing.");
  await page.getByRole("button", { name: "Save idea changes" }).click();
  const updatedCard = page.locator(".editorial-idea-card").filter({ hasText: title });
  await updatedCard.getByLabel("Status").selectOption("hold");
  await expect(updatedCard).toContainText("Do not publish yet.");
  await expect(updatedCard).toContainText("Confirm the recipe heat cue and media-rights status before publishing.");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export workspace JSON backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cooking-creator-editorial-backup.json");
  const raw = await readFile(await download.path(), "utf8");
  const backup = JSON.parse(raw) as { ideas: Array<{ title: string; status: string; unresolvedQuestions: string }> };
  expect(backup.ideas.some((idea) => idea.title === title && idea.status === "hold" && idea.unresolvedQuestions.includes("heat cue"))).toBe(true);

  await page.reload();
  await chooseMenuTool(page, "Editorial Calendar");
  const restored = page.locator(".editorial-idea-card").filter({ hasText: title });
  await expect(restored).toBeVisible();
  await expect(restored.getByLabel("Status")).toHaveValue("hold");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});


test("V2.5 monetization workspace separates real USD receipts, gates contracts, and exports local records", async ({ page }) => {
  await page.goto("/");
  await chooseMenuTool(page, "Monetization Readiness");
  await expect(page.getByRole("heading", { name: "Monetization readiness" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.locator(".monetization-subnav").getByRole("button", { name: "Media kit & metrics" }).click();
  await page.locator("#money-brand-name").fill("Weeknight Kitchen Lab");
  await page.locator("#money-bio").fill("Original cooking demonstrations and practical home-kitchen tests.");
  await page.locator("#money-cuisine").fill("Global home cooking");

  await page.locator("#money-metric-name").selectOption("followers");
  await page.locator("#money-metric-value").fill("1250");
  await page.locator("#money-metric-kind").selectOption("actual");
  await page.locator("#money-metric-date").fill("2026-10-22");
  await page.locator("#money-metric-source").fill("https://support.google.com/youtube/");
  await page.locator("#money-metric-note").fill("Owner copied this value from the platform dashboard on the recorded date.");
  await page.getByRole("button", { name: "Add metric snapshot" }).click();
  await expect(page.locator(".monetization-record-card").filter({ hasText: "Followers / subscribers" })).toContainText("Owner-reported actual");

  await page.locator("#money-metric-name").selectOption("averageViews");
  await page.locator("#money-metric-value").fill("900");
  await page.locator("#money-metric-kind").selectOption("estimate");
  await page.locator("#money-metric-date").fill("2026-10-23");
  await page.locator("#money-metric-source").fill("");
  await page.locator("#money-metric-note").fill("Planning estimate, not actual platform performance.");
  await page.getByRole("button", { name: "Add metric snapshot" }).click();
  await page.getByRole("button", { name: "Generate media kit preview" }).click();
  await expect(page.locator(".monetization-preview pre")).toContainText("Estimates — not actual results");
  await expect(page.locator(".monetization-preview pre")).toContainText("Followers/subscribers");
  await expect(page.locator(".monetization-preview pre")).toContainText("Planning estimate, not actual platform performance.");

  await page.locator("#money-age-band").selectOption("under18");
  await page.locator(".monetization-subnav").getByRole("button", { name: "Partnerships" }).click();
  await page.locator("#money-partner-brand").fill("Test Kitchen Brand");
  await page.locator("#money-partner-campaign").fill("Original skillet recipe");
  await page.locator("#money-partner-deliverable").fill("One original short recipe demonstration.");
  await page.locator("#money-partner-status").selectOption("contracted");
  await page.locator("#money-partner-amount").fill("85");
  await page.locator("#money-partner-amount-stage").selectOption("contracted");
  await page.getByRole("checkbox", { name: "Written terms reviewed" }).check();
  await page.getByRole("checkbox", { name: "Asset and usage rights reviewed" }).check();
  await page.getByRole("checkbox", { name: "Disclosure requirements reviewed" }).check();
  await page.getByRole("checkbox", { name: "Current platform eligibility/payment rules checked" }).check();
  await page.getByRole("button", { name: "Add partnership" }).click();
  await expect(page.getByRole("status")).toContainText("parent/legal guardian");
  await expect(page.locator(".monetization-record-card").filter({ hasText: "Test Kitchen Brand" })).toHaveCount(0);

  await page.locator(".monetization-subnav").getByRole("button", { name: "Media kit & metrics" }).click();
  await page.getByRole("checkbox", { name: /Parent\/legal guardian is or will be involved/ }).check();
  await page.locator(".monetization-subnav").getByRole("button", { name: "Partnerships" }).click();
  await page.getByRole("button", { name: "Add partnership" }).click();
  const partnerCard = page.locator(".monetization-record-card").filter({ hasText: "Test Kitchen Brand" });
  await expect(partnerCard).toContainText("Contracted");

  await partnerCard.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#money-partner-status").selectOption("paid");
  await page.locator("#money-partner-amount-stage").selectOption("received");
  await page.locator("#money-partner-payment-date").fill("2026-10-22");
  await page.locator("#money-partner-payment-note").fill("Owner matched the payment to the actual account statement.");
  await page.getByRole("button", { name: "Update partnership" }).click();
  await page.locator(".monetization-subnav").getByRole("button", { name: "Overview" }).click();
  await expect(page.locator(".monetization-summary-grid")).toContainText("$85.00");
  await expect(page.locator(".monetization-summary-grid")).toContainText("Actual partnership receipts");

  await page.locator(".monetization-subnav").getByRole("button", { name: "Affiliate links" }).click();
  await page.locator("#money-affiliate-program").fill("Kitchen tools affiliate program");
  await page.locator("#money-affiliate-product").fill("Pan used in recipe demonstration");
  await page.locator("#money-affiliate-url").fill("https://recipes.com/products/pan");
  await page.locator("#money-affiliate-status").selectOption("active");
  await page.getByRole("checkbox", { name: "Disclosure reviewed" }).check();
  await page.getByRole("checkbox", { name: "Product/media rights reviewed" }).check();
  await page.getByRole("checkbox", { name: "Affiliate platform age and payment eligibility reviewed" }).check();
  await page.getByRole("button", { name: "Add affiliate record" }).click();
  await expect(page.locator(".monetization-record-card").filter({ hasText: "Kitchen tools affiliate program" })).toContainText("Active");

  await page.locator(".monetization-subnav").getByRole("button", { name: "Readiness checklist" }).click();
  await page.locator("#money-readiness-notes-originality").fill("Review the official originality requirements and record an actual original contribution.");
  await page.locator("#money-readiness-status-originality").selectOption("needs-action");
  await page.locator("#money-readiness-date-originality").fill("2026-10-22");
  await page.locator("#money-readiness-source-originality").fill("https://support.google.com/youtube/");
  await page.locator("#money-readiness-status-originality").selectOption("reviewed");
  await expect(page.locator(".monetization-readiness-card").filter({ hasText: "Original-content standards" })).toContainText("Reviewed by owner");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full workspace JSON backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cooking-creator-monetization-backup.json");
  const raw = await readFile(await download.path(), "utf8");
  const backup = JSON.parse(raw) as {
    profile: { ageBand: string; guardianInvolved: boolean; brandName: string };
    metrics: Array<{ valueKind: string }>;
    partnerships: Array<{ status: string; amountStage: string; amountUsd: number | null }>;
    affiliates: Array<{ status: string }>;
  };
  expect(backup.profile.ageBand).toBe("under18");
  expect(backup.profile.guardianInvolved).toBe(true);
  expect(backup.metrics.some((item) => item.valueKind === "actual")).toBe(true);
  expect(backup.metrics.some((item) => item.valueKind === "estimate")).toBe(true);
  expect(backup.partnerships.some((item) => item.status === "paid" && item.amountStage === "received" && item.amountUsd === 85)).toBe(true);
  expect(backup.affiliates.some((item) => item.status === "active")).toBe(true);
  expect((backup as { readinessChecks?: Array<{ category: string; status: string }> }).readinessChecks?.some((item) => item.category === "originality" && item.status === "reviewed")).toBe(true);

  // Remove this browser's saved copy to prove JSON import restores the workspace rather than relying only on reload persistence.
  await page.evaluate(() => window.localStorage.removeItem("cooking-creator-monetization-workspace-v1"));
  await page.reload();
  await chooseMenuTool(page, "Monetization Readiness");
  await expect(page.getByRole("heading", { name: "Monetization readiness" })).toBeVisible();
  await page.locator("#monetization-import-file").setInputFiles({
    name: "monetization-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw, "utf8"),
  });
  await expect(page.getByRole("status")).toContainText("restored 1 blank/default readiness check");
  await page.locator(".monetization-subnav").getByRole("button", { name: "Readiness checklist" }).click();
  await expect(page.locator(".monetization-readiness-card").filter({ hasText: "Original-content standards" })).toContainText("Reviewed by owner");

  await page.reload();
  await chooseMenuTool(page, "Monetization Readiness");
  await expect(page.getByRole("heading", { name: "Monetization readiness" })).toBeVisible();
  await expect(page.locator(".monetization-summary-grid")).toContainText("$85.00");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

async function makeSyntheticWebmFixture(page: import("@playwright/test").Page): Promise<Buffer> {
  const generated = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 568;
    const context = canvas.getContext("2d");
    if (!context || typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error("CI browser does not support a local video fixture for the V3 render smoke test.");
    }
    const mimeType = ["video/webm;codecs=vp8", "video/webm"].find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("CI browser has no WebM encoder for the V3 render smoke test.");
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 350_000 });
    const chunks: Blob[] = [];
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => reject(new Error("Synthetic CI video recording failed."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType }));
    });
    recorder.start();
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const elapsedMs = performance.now() - startedAt;
        context.fillStyle = `hsl(${Math.floor(elapsedMs / 8) % 360} 35% 42%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.font = "bold 22px sans-serif";
        context.fillText("SYNTHETIC CI FOOTAGE", 15, 50);
        context.fillText(Math.round(elapsedMs) + " ms", 15, 88);
        if (elapsedMs >= 2_400) {
          recorder.stop();
          resolve();
        } else {
          requestAnimationFrame(draw);
        }
      };
      draw();
    });
    const blob = await stopped;
    stream.getTracks().forEach((track) => track.stop());
    if (blob.size < 32 || !blob.type.toLowerCase().startsWith("video/webm")) {
      throw new Error("Synthetic CI video did not produce a valid WebM blob.");
    }
    return { mimeType: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
  });
  return Buffer.from(generated.bytes);
}

function makeSyntheticWavFixture(durationSeconds = 1.8, sampleRate = 22_050): Buffer {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM.
  buffer.writeUInt16LE(1, 22); // Mono.
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const fade = Math.min(1, index / (sampleRate * 0.03), (sampleCount - index) / (sampleRate * 0.03));
    const sample = Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 0.06 * Math.max(0, fade);
    buffer.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }
  return buffer;
}

test("V3 creates a traced scene blueprint from a saved V2 recipe and exports its editable backup", async ({ page }) => {
  // The real browser renderer is part of this integration path, so allow it more time
  // than the standard UI smoke test while retaining a strict bounded failure.
  // The browser encoder performs a real encode/decode pass; allow time for CI's two browser projects,
  // but keep the download event itself bounded so failures report the application error rather than hanging.
  test.setTimeout(180_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.stack ?? error.message));
  await page.goto("/");
  await chooseMenuTool(page, "New recipe");
  await page.locator("#name").fill("V3 blueprint QA recipe");
  await page.locator("#servings").fill("2");
  await page.getByRole("button", { name: /Create recipe draft/ }).click();
  await expect(page.getByRole("heading", { name: "V3 blueprint QA recipe" })).toBeVisible();

  await page.getByRole("button", { name: /Add ingredient/ }).click();
  await page.getByLabel("Ingredient 1 amount").fill("1");
  await page.getByLabel("Ingredient 1 unit").fill("cup");
  await page.getByLabel("Ingredient 1 name").fill("rice");
  await page.getByLabel("Ingredient 1 prep").fill("rinsed");
  await page.getByRole("button", { name: /Add step/ }).click();
  await page.getByLabel("Action / instruction").nth(0).fill("Boil the rice");
  await page.getByLabel("Timing").nth(0).fill("15 minutes");
  await page.reload();
  await expect(page.getByLabel("Ingredient 1 name")).toHaveValue("rice");

  await chooseMenuTool(page, "AI Chef Studio");
  await expect(page.locator(".shell")).toHaveAttribute("data-active-tool", "studio");
  const studioMount = await page.evaluate(() => ({
    activeTool: document.querySelector(".shell")?.getAttribute("data-active-tool"),
    sectionCount: document.querySelectorAll("#v3-content-studio").length,
    headingTexts: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5")).map((node) => node.textContent?.trim() ?? ""),
    hiddenAncestors: (() => {
      const node = document.querySelector("#v3-content-studio");
      const result: string[] = [];
      let current: Element | null = node;
      while (current) {
        const style = window.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden" || current.getAttribute("aria-hidden") === "true") {
          result.push(current.tagName.toLowerCase() + (current.id ? "#" + current.id : "") + (current.className ? "." + String(current.className).replace(/\s+/g, ".") : ""));
        }
        current = current.parentElement;
      }
      return result;
    })(),
    bodyTail: document.body.innerText.slice(-2_500),
  }));
  if (studioMount.sectionCount !== 1 || !studioMount.headingTexts.includes("Create a cooking-video blueprint")) {
    throw new Error("V3 studio failed to mount after navigation: " + JSON.stringify({ studioMount, runtimeErrors }));
  }
  await expect(page.getByRole("heading", { name: "Create a cooking-video blueprint" })).toBeVisible();
  const savedRecipeOption = page.locator("#v3-recipe-select option").filter({ hasText: "V3 blueprint QA recipe" }).first();
  const savedRecipeId = await savedRecipeOption.getAttribute("value");
  expect(savedRecipeId).toBeTruthy();
  await page.getByLabel("Saved recipe").selectOption(savedRecipeId as string);
  await page.getByRole("button", { name: "Create blueprint", exact: true }).click();
  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Blueprint saved locally" })).toBeVisible();
  await expect(page.locator(".v3-scene-card")).toHaveCount(4);
  await expect(page.locator(".v3-studio-editor")).toContainText("V3 blueprint QA recipe");
  await expect(page.locator(".v3-scene-source-notes").filter({ hasText: "step:" })).toHaveCount(1);

  const startInputs = page.locator('input[id^="v3-caption-start-"]');
  const endInputs = page.locator('input[id^="v3-caption-end-"]');
  await expect(startInputs).toHaveCount(4);
  await expect(endInputs).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await startInputs.nth(index).fill(String(index));
    await endInputs.nth(index).fill(String(index + 1));
  }
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Edits saved locally" })).toBeVisible();
  const subtitleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SRT", exact: true }).click();
  expect((await subtitleDownload).suggestedFilename()).toMatch(/v3-blueprint-qa-recipe.*\.srt$/);

  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON backup", exact: true }).click();
  expect((await backupDownload).suggestedFilename()).toMatch(/v3-blueprint-qa-recipe.*\.v3-blueprint\.json$/);
  await expect(page.locator(".v3-studio-editor .v3-studio-honesty").filter({ hasText: "Visual realism: NOT TESTED" })).toContainText("NOT TESTED");

  // An empty-media project must not be allowed to render a fake video. The fallback
  // should produce a real ZIP whose label and manifest make its status unambiguous.
  await expect(page.getByRole("button", { name: "Render real owner footage", exact: true })).toBeDisabled();
  const bundleDialogPromise = page.waitForEvent("dialog");
  const bundleDownloadPromise = page.waitForEvent("download");
  const bundleClickPromise = page.getByRole("button", { name: "Export production bundle ZIP", exact: true }).click();
  const bundleDialog = await bundleDialogPromise;
  expect(bundleDialog.type()).toBe("confirm");
  expect(bundleDialog.message()).toContain("NOT a rendered video");
  await bundleDialog.accept();
  await bundleClickPromise;
  const bundleDownload = await bundleDownloadPromise;
  expect(bundleDownload.suggestedFilename()).toMatch(/v3-blueprint-qa-recipe.*-production-bundle\.zip$/);
  const bundlePath = await bundleDownload.path();
  expect(bundlePath).toBeTruthy();
  const bundleBytes = await readFile(bundlePath as string);
  expect(Array.from(bundleBytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  expect(bundleBytes.includes(Buffer.from("creator-readiness.json"))).toBe(true);
  expect(bundleBytes.includes(Buffer.from("youtube-shorts"))).toBe(true);
  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Production bundle downloaded locally" })).toBeVisible();

  // The selected platform copy is saved as part of the local project and remains
  // NOT READY until the owner identifies the real media origin and completes reviews.
  await page.locator("#v3-target-platform").selectOption("instagram-reels");
  await page.locator("#v3-platform-title").fill("V3 QA recipe title");
  await page.locator("#v3-platform-caption").fill("A recipe-specific caption for review.");
  await page.locator("#v3-platform-cta").fill("Save this for later.");
  await page.locator("#v3-platform-hashtags").fill("#cooking #recipe");
  await expect(page.locator(".v3-publish-status[role='status']")).toContainText("NOT READY");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Edits saved locally" })).toBeVisible();
  await page.reload();
  await expect(page.locator("#v3-target-platform")).toHaveValue("instagram-reels");
  await expect(page.getByLabel("Title / hook (up to 100 characters)")).toHaveValue("V3 QA recipe title");
  await expect(page.locator(".v3-publish-status[role='status']")).toContainText("NOT READY");
  const readinessLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(Math.max(readinessLayout.documentWidth, readinessLayout.bodyWidth)).toBeLessThanOrEqual(readinessLayout.viewportWidth + 1);

  const creatorCopyPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export creator copy", exact: true }).click();
  const creatorCopy = await creatorCopyPromise;
  expect(creatorCopy.suggestedFilename().toLowerCase().endsWith(".creator-copy.txt")).toBe(true);
  const creatorCopyPath = await creatorCopy.path();
  expect(creatorCopyPath).toBeTruthy();
  const creatorCopyText = await readFile(creatorCopyPath as string, "utf8");
  expect(creatorCopyText).toContain("Instagram Reels");
  expect(creatorCopyText).toContain("V3 QA recipe title");
  expect(creatorCopyText).toContain("A recipe-specific caption for review.");
  expect(creatorCopyText).toContain("NOT READY");
  expect(creatorCopyText).toContain("Nothing was published or uploaded");

  // Integration smoke: render a tiny procedurally-created QA clip plus a test-tone
  // WAV locally. These fixtures are generated at runtime and are never committed.
  // The output proves browser encoding/playback only; it is not cooking footage,
  // human narration, or a visual-realism acceptance test.
  const syntheticVideo = await makeSyntheticWebmFixture(page);
  await page.locator("#v3-media-label").fill("Synthetic CI footage — do not publish");
  await page.locator("#v3-media-rights").selectOption("owner-recorded");
  await page.locator("#v3-media-rights-note").fill("Procedurally generated CI fixture for local encoder testing only; not for publishing.");
  await page.locator("#v3-media-file").setInputFiles({
    name: "v3-ci-footage.webm",
    mimeType: "video/webm",
    buffer: syntheticVideo,
  });
  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Video clip imported into this browser only" })).toBeVisible({ timeout: 15_000 });
  const videoCard = page.locator(".v3-media-card").filter({ hasText: "Synthetic CI footage — do not publish" });
  await videoCard.getByRole("button", { name: "I reviewed and clear it", exact: true }).click();
  await expect(videoCard.locator(".v3-reference-badge")).toContainText("OWNER-CLEARED");

  await page.locator("#v3-media-kind").selectOption("narration");
  await page.locator("#v3-media-label").fill("Synthetic CI QA tone — not speech");
  await page.locator("#v3-media-rights").selectOption("owner-recorded");
  await page.locator("#v3-media-rights-note").fill("Synthetic tone fixture generated only to test audio mixing; not speech and not for publishing.");
  await page.locator("#v3-media-file").setInputFiles({
    name: "v3-ci-test-tone.wav",
    mimeType: "audio/wav",
    buffer: makeSyntheticWavFixture(),
  });
  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Narration imported into this browser only" })).toBeVisible({ timeout: 15_000 });
  const audioCard = page.locator(".v3-media-card").filter({ hasText: "Synthetic CI QA tone — not speech" });
  await audioCard.getByRole("button", { name: "I reviewed and clear it", exact: true }).click();
  await expect(audioCard.locator(".v3-reference-badge")).toContainText("OWNER-CLEARED");

  const narrationOption = page.locator("#v3-project-narration option").filter({ hasText: "Synthetic CI QA tone — not speech" }).first();
  const narrationId = await narrationOption.getAttribute("value");
  expect(narrationId).toBeTruthy();
  await page.locator("#v3-project-narration").selectOption(narrationId as string);

  const sceneCards = page.locator(".v3-scene-card");
  await expect(sceneCards).toHaveCount(4);
  const videoOption = sceneCards.first().locator('select[id^="v3-scene-video-"] option').filter({ hasText: "Synthetic CI footage — do not publish" }).first();
  const videoId = await videoOption.getAttribute("value");
  expect(videoId).toBeTruthy();
  for (let index = 0; index < 4; index += 1) {
    const scene = sceneCards.nth(index);
    await scene.locator('select[id^="v3-scene-video-"]').selectOption(videoId as string);
    await scene.locator('input[id^="v3-source-start-"]').fill("0");
    await scene.locator('input[id^="v3-source-end-"]').fill("0.4");
    await scene.locator('textarea[id^="v3-scene-caption-"]').fill("Synthetic QA test clip — not for publishing");
    await scene.locator('input[id^="v3-caption-start-"]').fill(String(index * 0.4));
    await scene.locator('input[id^="v3-caption-end-"]').fill(String((index + 1) * 0.4));
    // Every edit invalidates approval, so review only after all scene fields are final.
  }
  for (let index = 0; index < 4; index += 1) {
    await sceneCards.nth(index).locator(".v3-scene-review-button").click();
  }
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Edits saved locally" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".v3-render-preflight")).toContainText("Ready for a short owner-footage render");
  await expect(page.getByRole("button", { name: "Render real owner footage", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Render real owner footage", exact: true }).click();
  // Fail with the actual renderer error/progress message instead of a generic
  // "heading missing" timeout if the browser cannot complete one of the media stages.
  await expect.poll(async () => {
    if (await page.getByRole("heading", { name: "Rendered video preview", exact: true }).count()) return "RENDERED";
    const errors = await page.locator("#v3-content-studio [role='alert']").allInnerTexts();
    const usefulErrors = errors.map((value) => value.trim()).filter(Boolean);
    if (usefulErrors.length) return "RENDER ERROR: " + usefulErrors.join(" | ");
    const progress = await page.locator("#v3-content-studio [role='status']").allInnerTexts();
    const usefulProgress = progress.map((value) => value.trim()).filter(Boolean);
    return "RENDERING: " + usefulProgress.slice(-3).join(" | ");
  }, { timeout: 60_000, intervals: [250, 500, 1_000] }).toBe("RENDERED");
  const renderPreview = page.locator("#v3-content-studio video.v3-render-preview");
  await expect(renderPreview).toHaveCount(1);
  await expect.poll(() => renderPreview.evaluate((element) => {
    const video = element as HTMLVideoElement;
    return video.videoWidth === 720 &&
      video.videoHeight === 1280 &&
      Number.isFinite(video.duration) &&
      video.duration > 0 &&
      video.currentSrc.startsWith("blob:");
  }), { timeout: 15_000 }).toBe(true);
  await expect(page.locator(".v3-render-output .v3-reference-meta").filter({ hasText: "video/webm" })).toBeVisible();
  await expect(page.locator(".v3-render-output .v3-studio-honesty")).toContainText("not AI-generated footage");
  await expect(page.locator(".v3-visual-review [role='status']").filter({ hasText: "NOT TESTED for this exact clip" })).toBeVisible();

  // Test the actual file download, not only the in-memory preview. This synthetic
  // fixture proves the WebM/container path; it does not represent real cooking video.
  // Validate IndexedDB state before the final gesture. The actual native download
  // click must stay synchronous after confirmation for Chromium and Android browsers.
  await page.getByRole("button", { name: "Prepare reviewed WebM download", exact: true }).click();
  await expect.poll(async () => {
    const downloadButton = page.getByRole("button", { name: "I reviewed the video — download WebM", exact: true });
    if (await downloadButton.count()) {
      if (await downloadButton.isEnabled()) return "PREPARED";
      const staleStatus = await page.locator("#v3-content-studio [role='status']").allInnerTexts();
      if (staleStatus.some((value) => /prepared download is blocked/i.test(value))) return "PREPARED BUT STALE: " + staleStatus.filter((value) => /prepared download is blocked/i.test(value)).join(" | ");
      return "PREPARED BUT DISABLED";
    }
    const alerts = (await page.locator("#v3-content-studio [role='alert']").allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    if (alerts.length) return "PREPARE ERROR: " + alerts.join(" | ");
    const statuses = (await page.locator("#v3-content-studio [role='status']").allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    return "PREPARING: " + statuses.slice(-3).join(" | ");
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).toBe("PREPARED");
  await expect(page.getByRole("button", { name: "I reviewed the video — download WebM", exact: true })).toBeEnabled();
  const reviewedConfirm = page.waitForEvent("dialog");
  let downloadWaitError = "";
  const renderedDownloadPromise = page.waitForEvent("download", { timeout: 15_000 }).catch((error: unknown) => {
    downloadWaitError = error instanceof Error ? error.message : String(error);
    return null;
  });
  const reviewedClickPromise = page.getByRole("button", { name: "I reviewed the video — download WebM", exact: true }).click();
  const reviewedDialog = await reviewedConfirm;
  expect(reviewedDialog.type()).toBe("confirm");
  expect(reviewedDialog.message()).toContain("checked the cooking actions");
  await reviewedDialog.accept();
  await reviewedClickPromise;
  const renderedDownload = await renderedDownloadPromise;
  if (!renderedDownload) {
    const alerts = (await page.locator("#v3-content-studio [role='alert']").allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    const statuses = (await page.locator("#v3-content-studio [role='status']").allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    throw new Error("Reviewed WebM download did not start. App alerts: " + (alerts.join(" | ") || "none") +
      ". App status: " + (statuses.slice(-4).join(" | ") || "none") + ". Browser wait: " + downloadWaitError);
  }
  expect(renderedDownload.suggestedFilename().toLowerCase().endsWith(".webm")).toBe(true);
  const renderedFilePath = await renderedDownload.path();
  expect(renderedFilePath).toBeTruthy();
  const renderedBytes = await readFile(renderedFilePath as string);
  expect(renderedBytes.length).toBeGreaterThan(256);
  // EBML header signature used by WebM/Matroska containers.
  expect(Array.from(renderedBytes.subarray(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);

  // Re-open the bytes read back from Playwright's downloaded file as a new media
  // resource. This is stronger than checking only the in-memory preview or header.
  const downloadedPlayback = await page.evaluate(async (rawBytes: number[]) => {
    const ownedBytes = new Uint8Array(rawBytes.length);
    ownedBytes.set(rawBytes);
    const blob = new Blob([ownedBytes.buffer], { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(new Error("Downloaded WebM metadata timed out.")), 10_000);
        const cleanup = () => {
          window.clearTimeout(timeout);
          video.removeEventListener("loadedmetadata", onMetadata);
          video.removeEventListener("error", onError);
        };
        const finish = (error?: Error) => {
          cleanup();
          if (error) reject(error);
          else resolve();
        };
        const onMetadata = () => finish();
        const onError = () => finish(new Error("Downloaded WebM could not be decoded when reopened."));
        video.addEventListener("loadedmetadata", onMetadata, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.src = url;
        video.load();
      });
      const metadata = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      if (metadata.width !== 720 || metadata.height !== 1280 || !Number.isFinite(metadata.duration) || metadata.duration <= 0) {
        throw new Error("Downloaded WebM has invalid reopened playback metadata: " + JSON.stringify(metadata));
      }
      await video.play();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      video.pause();
      return { ...metadata, played: true };
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }, Array.from(renderedBytes));
  expect(downloadedPlayback.width).toBe(720);
  expect(downloadedPlayback.height).toBe(1280);
  expect(downloadedPlayback.duration).toBeGreaterThan(0);
  expect(downloadedPlayback.played).toBe(true);

  await expect(page.locator("#v3-content-studio [role='status']").filter({ hasText: "Reviewed owner-footage video downloaded locally" })).toBeVisible();
  // Owner download confirmation cannot upgrade the separate visual-realism result.
  await expect(page.locator(".v3-visual-review [role='status']").filter({ hasText: "NOT TESTED for this exact clip" })).toBeVisible();
});
