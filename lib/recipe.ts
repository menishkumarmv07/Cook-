export type Ingredient = {
  id: string;
  amount: string;
  unit: string;
  name: string;
  prep: string;
  // Values apply to the exact amount written in this ingredient row; no unit conversion is inferred.
  nutritionCalories?: string;
  nutritionProteinG?: string;
  nutritionCarbsG?: string;
  nutritionFatG?: string;
  nutritionBasis?: string;
  nutritionSourceUrl?: string;
};

export type RecipeNutritionSummary = {
  totalCalories: number | null;
  caloriesPerServing: number | null;
  proteinGPerServing: number | null;
  carbsGPerServing: number | null;
  fatGPerServing: number | null;
  missingIngredients: string[];
};
export type RecipeStep = {
  id: string;
  action: string;
  duration: string;
  heat: string;
  cue: string;
  // Creator-selected ingredient IDs; legacy drafts may not have this field.
  ingredientIds?: string[];
};
export type Scene = { title: string; detail: string; timing: string };
export type SourceReference = {
  id: string;
  url: string;
  kind: "recipe-page" | "video" | "transcript" | "other";
  checked: string;
  notes: string;
  // Source-specific comparison notes are manually entered and never imply automatic source verification.
  ingredientFindings?: string;
  methodFindings?: string;
  timingFindings?: string;
  safetyStorageFindings?: string;
};
export function getLocalDateOnly(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

export type RecipeProject = {
  id: number;
  trialStatus: "untested" | "tested";
  trialRating: string;
  trialDate: string;
  trialChanges: string;
  trialNotes: string;
  trialPhotoDataUrl: string;
  // Local revision counters prevent old trial evidence from being reused after recipe edits.
  recipeRevision: number;
  trialPhotoRevision: number;
  trialNotesRevision: number;
  evidenceReviewedAt: string;
  approved: boolean;
  approvedAt: string;
  name: string;
  url: string;
  notes: string;
  sourceEvidence: string;
  sourceReferences: SourceReference[];
  servings: string;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  scenes: Scene[];
};
export type CreatorProfile = {
  tone: string;
  catchphrases: string;
  language: string;
  cuisineFocus: string;
  skillLevel: string;
  equipment: string;
  budget: string;
  dietLimits: string;
  units: string;
  usualCookingTime: string;
  platforms: string;
  neverSay: string;
  sampleCaptions: string;
};

export const DEFAULT_CREATOR_PROFILE: CreatorProfile = {
  tone: "Warm, clear, confident, and practical",
  catchphrases: "",
  language: "English",
  cuisineFocus: "Worldwide recipes; explain unfamiliar ingredients clearly",
  skillLevel: "Beginner-friendly",
  equipment: "Standard home kitchen",
  budget: "Affordable ingredients where practical",
  dietLimits: "",
  units: "US customary",
  usualCookingTime: "Under 45 minutes when practical",
  platforms: "YouTube Shorts, Instagram Reels",
  neverSay: "Guaranteed viral; cures; miracle food; guaranteed weight loss",
  sampleCaptions: "",
};

export function isCreatorProfile(value: unknown): value is CreatorProfile {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(DEFAULT_CREATOR_PROFILE).every((key) => typeof record[key] === "string");
}

export type CreatorWorkspaceBackup = {
  format: "cooking-creator-workspace-backup";
  version: 1;
  exportedAt: string;
  creatorProfile: CreatorProfile;
  projects: RecipeProject[];
};

const MAX_WORKSPACE_BACKUP_PROJECTS = 500;
const MAX_WORKSPACE_BACKUP_CHARACTERS = 15_000_000;

export function createCreatorWorkspaceBackupJSON(
  projects: RecipeProject[],
  creatorProfile: CreatorProfile,
  exportedAt = new Date().toISOString(),
): string {
  const backup: CreatorWorkspaceBackup = {
    format: "cooking-creator-workspace-backup",
    version: 1,
    exportedAt,
    creatorProfile,
    projects,
  };
  return JSON.stringify(backup, null, 2);
}

export function parseCreatorWorkspaceBackupJSON(raw: string): CreatorWorkspaceBackup | null {
  if (raw.length > MAX_WORKSPACE_BACKUP_CHARACTERS) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (
    record.format !== "cooking-creator-workspace-backup" ||
    record.version !== 1 ||
    typeof record.exportedAt !== "string" ||
    !isCreatorProfile(record.creatorProfile) ||
    !Array.isArray(record.projects) ||
    record.projects.length > MAX_WORKSPACE_BACKUP_PROJECTS
  ) return null;

  const projects: RecipeProject[] = [];
  for (const candidate of record.projects) {
    let candidateJSON: string;
    try {
      candidateJSON = JSON.stringify(candidate);
    } catch {
      return null;
    }
    if (typeof candidateJSON !== "string") return null;
    const project = parseRecipeProjectJSON(candidateJSON);
    if (!project) return null;
    projects.push(project);
  }

  return {
    format: "cooking-creator-workspace-backup",
    version: 1,
    exportedAt: record.exportedAt,
    creatorProfile: record.creatorProfile,
    projects,
  };
}

export type ValidationIssue = { level: "warning" | "error"; field: string; message: string };

export const SCENE_TEMPLATE: Scene[] = [
  { title: "Hook & finished dish", detail: "Show the finished dish and explain what viewers will learn.", timing: "0:00–0:08" },
  { title: "Ingredients", detail: "Show every ingredient and its recorded quantity.", timing: "0:08–0:25" },
  { title: "Preparation", detail: "Show washing, chopping, measuring, and prep in order.", timing: "0:25–0:45" },
  { title: "Cooking steps", detail: "Explain each action, recorded heat level, timing, and visual cue.", timing: "0:45–1:35" },
  { title: "Finish & serve", detail: "Show texture, doneness, plating, and verified safe-serving guidance.", timing: "1:35–1:50" },
  { title: "Taste & nutrition", detail: "Plan the chef tasting reaction; only include nutrition when verified.", timing: "1:50–2:00" },
];

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeSourceUrlForComparison(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return value.trim();
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}${url.search}`;
  } catch {
    return value.trim();
  }
}

export function calculateRecipeNutrition(project: RecipeProject): RecipeNutritionSummary {
  const numeric = (value: string | undefined): number | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const servingMatch = project.servings.match(/^\s*(\d+(?:\.\d+)?)\s*(?:servings?|people|persons?|portions?)?\s*$/i);
  const servingCount = servingMatch ? Number(servingMatch[1]) : null;
  const positiveServings = servingCount !== null && Number.isFinite(servingCount) && servingCount > 0
    ? servingCount : null;

  const sourceComplete = (ingredient: Ingredient) =>
    Boolean(ingredient.name.trim() && ingredient.amount.trim() && ingredient.unit.trim() &&
      ingredient.nutritionBasis?.trim() &&
      ingredient.nutritionSourceUrl?.trim() && isHttpUrl(ingredient.nutritionSourceUrl));
  const completeFor = (field: "nutritionCalories" | "nutritionProteinG" | "nutritionCarbsG" | "nutritionFatG") =>
    project.ingredients.length > 0 && project.ingredients.every((ingredient) =>
      sourceComplete(ingredient) && numeric(ingredient[field]) !== null);
  const totalFor = (field: "nutritionCalories" | "nutritionProteinG" | "nutritionCarbsG" | "nutritionFatG") =>
    completeFor(field)
      ? project.ingredients.reduce((total, ingredient) => total + (numeric(ingredient[field]) ?? 0), 0)
      : null;
  const totalCalories = totalFor("nutritionCalories");
  const protein = totalFor("nutritionProteinG");
  const carbs = totalFor("nutritionCarbsG");
  const fat = totalFor("nutritionFatG");
  const missingIngredients = project.ingredients
    .filter((ingredient) => !sourceComplete(ingredient) || numeric(ingredient.nutritionCalories) === null)
    .map((ingredient) => ingredient.name.trim() || `Ingredient ${project.ingredients.indexOf(ingredient) + 1}`);

  return {
    totalCalories,
    caloriesPerServing: totalCalories !== null && positiveServings !== null ? totalCalories / positiveServings : null,
    proteinGPerServing: protein !== null && positiveServings !== null ? protein / positiveServings : null,
    carbsGPerServing: carbs !== null && positiveServings !== null ? carbs / positiveServings : null,
    fatGPerServing: fat !== null && positiveServings !== null ? fat / positiveServings : null,
    missingIngredients,
  };
}

export function isRecipeProject(value: unknown): value is RecipeProject {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<RecipeProject>;
  return typeof p.id === "number" &&
    (p.trialStatus === "untested" || p.trialStatus === "tested") &&
    typeof p.trialRating === "string" && (p.trialRating === "" || /^[1-5]$/.test(p.trialRating)) &&
    typeof p.trialDate === "string" && (p.trialDate === "" || isValidDateOnly(p.trialDate)) &&
    typeof p.trialChanges === "string" &&
    typeof p.trialNotes === "string" &&
    typeof p.trialPhotoDataUrl === "string" &&
    Number.isSafeInteger(p.recipeRevision) && (p.recipeRevision ?? -1) >= 0 && (p.recipeRevision ?? MAX_RECIPE_REVISION + 1) <= MAX_RECIPE_REVISION &&
    Number.isSafeInteger(p.trialPhotoRevision) && (p.trialPhotoRevision ?? -2) >= -1 && (p.trialPhotoRevision ?? MAX_RECIPE_REVISION + 1) <= MAX_RECIPE_REVISION &&
    Number.isSafeInteger(p.trialNotesRevision) && (p.trialNotesRevision ?? -2) >= -1 && (p.trialNotesRevision ?? MAX_RECIPE_REVISION + 1) <= MAX_RECIPE_REVISION &&
    typeof p.evidenceReviewedAt === "string" &&
    typeof p.approved === "boolean" &&
    typeof p.approvedAt === "string" &&
    typeof p.name === "string" &&
    typeof p.url === "string" &&
    typeof p.notes === "string" &&
    typeof p.sourceEvidence === "string" &&
    Array.isArray(p.sourceReferences) && p.sourceReferences.every((source) => typeof source === "object" && source !== null &&
      typeof source.id === "string" && typeof source.url === "string" &&
      ["recipe-page", "video", "transcript", "other"].includes(source.kind) &&
      typeof source.checked === "string" && typeof source.notes === "string" &&
      ["ingredientFindings", "methodFindings", "timingFindings", "safetyStorageFindings"]
        .every((field) => (source as Record<string, unknown>)[field] === undefined || typeof (source as Record<string, unknown>)[field] === "string")) &&
    typeof p.servings === "string" &&
    Array.isArray(p.ingredients) &&
    p.ingredients.every((x) => typeof x === "object" && x !== null &&
      typeof x.id === "string" && typeof x.amount === "string" &&
      typeof x.unit === "string" && typeof x.name === "string" && typeof x.prep === "string" &&
      ["nutritionCalories", "nutritionProteinG", "nutritionCarbsG", "nutritionFatG", "nutritionBasis", "nutritionSourceUrl"]
        .every((field) => (x as Record<string, unknown>)[field] === undefined || typeof (x as Record<string, unknown>)[field] === "string")) &&
    Array.isArray(p.steps) &&
    p.steps.every((x) => typeof x === "object" && x !== null &&
      typeof x.id === "string" && typeof x.action === "string" &&
      typeof x.duration === "string" && typeof x.heat === "string" && typeof x.cue === "string" &&
      ((x as Record<string, unknown>).ingredientIds === undefined ||
        (Array.isArray((x as Record<string, unknown>).ingredientIds) &&
          ((x as Record<string, unknown>).ingredientIds as unknown[]).every((id) => typeof id === "string")))) &&
    Array.isArray(p.scenes) &&
    p.scenes.every((x) => typeof x === "object" && x !== null &&
      typeof x.title === "string" && typeof x.detail === "string" && typeof x.timing === "string");
}

export function validateRecipe(project: RecipeProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!project.name.trim()) issues.push({ level: "error", field: "name", message: "Add a recipe name." });
  if (!isHttpUrl(project.url)) issues.push({ level: "error", field: "url", message: "Use a valid http:// or https:// source link." });
  if (!project.servings.trim()) issues.push({ level: "warning", field: "servings", message: "Serving count is missing; nutrition per serving cannot be estimated reliably." });
  if (project.ingredients.length === 0) issues.push({ level: "warning", field: "ingredients", message: "Add ingredients and amounts before treating this as a complete recipe." });
  project.ingredients.forEach((ingredient, index) => {
    if (!ingredient.name.trim()) issues.push({ level: "warning", field: `ingredient-${index}`, message: `Ingredient ${index + 1} has no name.` });
    if (!ingredient.amount.trim()) issues.push({ level: "warning", field: `amount-${index}`, message: `Quantity for ${ingredient.name.trim() || `ingredient ${index + 1}`} is missing.` });
    if (!ingredient.unit.trim() && ingredient.amount.trim()) issues.push({ level: "warning", field: `unit-${index}`, message: `Unit for ${ingredient.name.trim() || `ingredient ${index + 1}`} is not recorded; check whether the amount is count-based.` });
  });
  if (project.steps.length === 0) issues.push({ level: "warning", field: "steps", message: "Add the cooking method in the correct order." });
  project.steps.forEach((step, index) => {
    if (!step.action.trim()) issues.push({ level: "warning", field: `step-${index}`, message: `Cooking step ${index + 1} has no action.` });
    if (!step.duration.trim()) issues.push({ level: "warning", field: `duration-${index}`, message: `Timing for step ${index + 1} is not recorded; do not invent a time.` });
  });
  const seenSourceUrls = new Set<string>();
  project.sourceReferences.forEach((source, index) => {
    if (source.url.trim() && !isHttpUrl(source.url)) issues.push({ level: "error", field: `source-url-${index}`, message: `Source reference ${index + 1} must use a valid HTTP(S) URL.` });
    const normalizedUrl = normalizeSourceUrlForComparison(source.url);
    if (normalizedUrl && seenSourceUrls.has(normalizedUrl)) issues.push({ level: "warning", field: `source-duplicate-${index}`, message: `Source reference ${index + 1} duplicates another reference; keep distinct sources where possible.` });
    if (normalizedUrl) seenSourceUrls.add(normalizedUrl);
    if (!source.url.trim()) issues.push({ level: "warning", field: `source-url-${index}`, message: `Source reference ${index + 1} has no URL.` });
    if (!source.checked.trim()) issues.push({ level: "warning", field: `source-checked-${index}`, message: `Record what was actually checked for source reference ${index + 1}.` });
  });
  if (project.url.trim() || project.sourceReferences.length) issues.push({ level: "warning", field: "source", message: "Source claims have not been independently verified. Explicit page inspection only extracts accessible public HTML and optional Recipe metadata; it does not confirm quantities, method, timing, allergens, or food-safety claims, and it does not analyze video frames or audio." });
  else issues.push({ level: "warning", field: "source", message: "No source references have been recorded. Add multiple references and compare ingredient quantities, method order, and timings before treating the recipe as verified." });
  if (project.sourceReferences.length) {
    const sections = [
      ["ingredient quantities", (source: SourceReference) => source.ingredientFindings],
      ["method/order", (source: SourceReference) => source.methodFindings],
      ["timing/heat", (source: SourceReference) => source.timingFindings],
      ["food safety/storage", (source: SourceReference) => source.safetyStorageFindings],
    ] as const;
    const missingSections = sections
      .filter(([, valueFor]) => project.sourceReferences.some((source) => !valueFor(source)?.trim()))
      .map(([label]) => label);
    if (missingSections.length) {
      issues.push({
        level: "warning",
        field: "source-comparison",
        message: `Structured source comparison notes are incomplete for: ${missingSections.join(", ")}. Record what each reference actually says; the app does not analyze the source automatically.`,
      });
    }
  }
  const assignedIngredientIds = new Set(project.steps.flatMap((step) => step.ingredientIds ?? []));
  const unmappedIngredients = project.ingredients.filter((ingredient) => !assignedIngredientIds.has(ingredient.id));
  if (unmappedIngredients.length) {
    issues.push({
      level: "warning",
      field: "ingredient-mapping",
      message: `Ingredients not explicitly assigned to a cooking step: ${unmappedIngredients.map((ingredient) => ingredient.name.trim() || "Unnamed ingredient").join(", ")}. Confirm when each is added; the app will not infer the timing.`,
    });
  }
  const knownIngredientIds = new Set(project.ingredients.map((ingredient) => ingredient.id));
  if (project.steps.some((step) => (step.ingredientIds ?? []).some((id) => !knownIngredientIds.has(id)))) {
    issues.push({ level: "warning", field: "ingredient-mapping-invalid", message: "One or more step ingredient mappings refer to a missing ingredient. Reassign them before recording." });
  }
  issues.push({ level: "warning", field: "safety", message: "Food-safety guidance has not been independently verified." });
  const nutrition = calculateRecipeNutrition(project);
  if (nutrition.caloriesPerServing === null) {
    issues.push({ level: "warning", field: "nutrition", message: "Nutrition has not been calculated from sourced values for the exact amount of every ingredient and a clear serving count." });
  } else {
    issues.push({ level: "warning", field: "nutrition", message: "A calorie estimate is calculated from manually entered values and sources; the app has not independently verified the values or source matches." });
  }
  return issues;
}

export function buildTutorialDraft(project: RecipeProject): string {
  const nutrition = calculateRecipeNutrition(project);
  const lines = [
    `# ${project.name.trim() || "Untitled recipe"}`,
    "",
    "**Status:** Draft — not published",
    `**Servings:** ${project.servings.trim() || "Not provided"}`,
    `**Source:** ${project.url.trim() || "User-entered recipe; no source URL"}`,
    "",
    "## Ingredients",
    ...(project.ingredients.length ? project.ingredients.map((x, i) =>
      `${i + 1}. ${[x.amount, x.unit, x.name].filter(Boolean).join(" ")}${x.prep.trim() ? ` — ${x.prep.trim()}` : ""}`) : ["Ingredients not supplied."]),
    "",
    "## Cooking method",
    ...(project.steps.length ? project.steps.map((x, i) => {
      const mappedIngredients = (x.ingredientIds ?? [])
        .map((id) => project.ingredients.find((ingredient) => ingredient.id === id))
        .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));
      const additions = mappedIngredients.length
        ? ` Ingredients explicitly assigned to add now: ${mappedIngredients.map((ingredient) => [ingredient.amount, ingredient.unit, ingredient.name].filter(Boolean).join(" ")).join(", ")}.`
        : " No ingredients are explicitly mapped to this step; confirm additions before recording.";
      return `${i + 1}. ${x.action.trim() || "[Action missing]"}${x.duration.trim() ? ` (recorded timing: ${x.duration.trim()})` : " (timing not provided)"}${x.heat.trim() ? ` Heat: ${x.heat.trim()}.` : ""}${x.cue.trim() ? ` Visual cue: ${x.cue.trim()}` : ""}${additions}`;
    }) : ["Cooking steps not supplied."]),
    "",
    "## Creator scene plan",
    ...project.scenes.flatMap((x, i) => [`### ${i + 1}. ${x.title}`, `Timing guide: ${x.timing}`, x.detail, ""]),
    "## Source references and inspection records",
    ...(project.sourceReferences.length ? project.sourceReferences.map((source, i) =>
      `${i + 1}. ${source.kind} — ${source.url.trim() || "URL missing"}\n   Checked: ${source.checked.trim() || "Not recorded"}\n   Ingredient/quantity findings: ${source.ingredientFindings?.trim() || "Not recorded"}\n   Method/order findings: ${source.methodFindings?.trim() || "Not recorded"}\n   Timing/heat findings: ${source.timingFindings?.trim() || "Not recorded"}\n   Food-safety/storage notes: ${source.safetyStorageFindings?.trim() || "Not recorded"}\n   Notes / disagreements: ${source.notes.trim() || "None recorded"}`) : ["No structured source references recorded."]),
    "",
    "## Source evidence notes",
    project.sourceEvidence.trim() || "No manual source evidence notes recorded. Optional public-page inspection only extracts accessible HTML/metadata; source claims have not been independently verified, and video frames/audio are not analyzed.",
    "",
    "## Notes",
    project.notes.trim() || "No additional notes.",
    "",
    "## Nutrition worksheet (manual source values)",
    ...(nutrition.caloriesPerServing !== null
      ? [
          `Estimated calories per serving: ${Math.round(nutrition.caloriesPerServing)} kcal (recipe total: ${Math.round(nutrition.totalCalories ?? 0)} kcal; serving count: ${project.servings.trim()}).`,
          nutrition.proteinGPerServing !== null ? `Estimated protein per serving: ${nutrition.proteinGPerServing.toFixed(1)} g.` : "Protein per serving is incomplete because at least one ingredient lacks a sourced protein value for the exact amount used.",
          nutrition.carbsGPerServing !== null ? `Estimated carbohydrates per serving: ${nutrition.carbsGPerServing.toFixed(1)} g.` : "Carbohydrates per serving are incomplete because at least one ingredient lacks a sourced carbohydrate value for the exact amount used.",
          nutrition.fatGPerServing !== null ? `Estimated fat per serving: ${nutrition.fatGPerServing.toFixed(1)} g.` : "Fat per serving is incomplete because at least one ingredient lacks a sourced fat value for the exact amount used.",
          "These totals use manually entered nutrition values and source links. Confirm values, quantity, preparation state, and servings yourself; the app does not fetch or independently verify nutrition data.",
        ]
      : ["No calorie-per-serving result yet. Each ingredient needs calories for the exact quantity used, a matching amount/preparation basis, a valid source URL, and a simple positive serving count. No unit conversion or source verification is performed automatically."]),
    "",
    "## Verification status",
    "- This draft reflects user-entered information and, if explicitly requested, app-extracted public HTML metadata; neither is independently verified.",
    "- Public HTML/Recipe metadata may be extracted only after explicit inspection; this is not independent recipe verification and does not analyze video frames/audio.",
    "- Manual source evidence notes are user-provided and have not been independently verified.",
    "- Source references may include manual notes or an explicit public-HTML inspection record; neither is independent recipe verification.",
    "- Compare references yourself; conflicts or missing details must be resolved before publishing.",
    "- Missing amounts/timings must be checked; do not guess.",
    "- Food safety and nutrition have not been independently verified.",
    "- This file is a draft and has not been published.",
  ];
  return lines.join("\n");
}


export function buildNarrationScript(project: RecipeProject): string {
  const recipeName = project.name.trim() || "Untitled recipe";
  const nutrition = calculateRecipeNutrition(project);
  const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
  const lines = [
    `# Voiceover script: ${recipeName}`,
    "",
    "**Status:** Draft — text only, not audio, not independently verified, and not published",
    `**Servings:** ${project.servings.trim() || "Not recorded"}`,
    "",
    "## Opening",
    "ON SCREEN: Show the finished dish, then introduce the recipe.",
    `NARRATION: Today we're making ${recipeName}. I'll walk you through the ingredients and each recorded cooking step in order.`,
    "",
    "## Ingredient callouts",
    ...(project.ingredients.length
      ? project.ingredients.map((ingredient, index) => {
          const name = oneLine(ingredient.name);
          const quantity = [oneLine(ingredient.amount), oneLine(ingredient.unit)].filter(Boolean).join(" ");
          const prep = oneLine(ingredient.prep);
          const label = name || `ingredient ${index + 1}`;
          const narration = quantity && name
            ? `Prepare ${quantity} ${label}${prep ? `, ${prep}` : ""}.`
            : `Quantity not recorded or name incomplete for ${label}. Confirm it from a reliable source before filming; do not guess.`;
          if (!quantity || !name) return `- [DO NOT RECORD] Ingredient ${index + 1}: ${quantity || "[quantity not recorded]"} ${name || "[ingredient name missing]"}. Confirm the missing name or quantity before recording.`;
          return `${index + 1}. ON SCREEN: Show ${quantity} ${label}${prep ? ` (${prep})` : ""}.\n   NARRATION: ${narration}${ingredient.unit.trim() ? "" : " Production check: confirm the unit or count-based amount before recording."}`;
        })
      : ["No ingredients are recorded. Add the full ingredient list before filming."]),
    "",
    "## Ordered cooking narration",
    ...(project.steps.length
      ? project.steps.map((step, index) => {
          const action = oneLine(step.action);
          const duration = oneLine(step.duration);
          const heat = oneLine(step.heat);
          const cue = oneLine(step.cue);
          const mappedIngredients = (step.ingredientIds ?? [])
            .map((id) => project.ingredients.find((ingredient) => ingredient.id === id))
            .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));
          const formattedAdditions = mappedIngredients.map((ingredient) => {
            const quantity = [oneLine(ingredient.amount), oneLine(ingredient.unit)].filter(Boolean).join(" ");
            const ingredientName = oneLine(ingredient.name);
            const prep = oneLine(ingredient.prep);
            if (!quantity || !oneLine(ingredient.unit) || !ingredientName) return `[DO NOT RECORD: confirm quantity/unit/name for ingredient ${project.ingredients.indexOf(ingredient) + 1}]`;
            return `${quantity} ${ingredientName}${prep ? ` (${prep})` : ""}`;
          });
          const hasCompleteAdditions = mappedIngredients.length > 0 && formattedAdditions.every((text) => !text.startsWith("[DO NOT RECORD:"));
          const additionNarration = hasCompleteAdditions ? ` Add ${formattedAdditions.join(", ")} now.` : "";
          const additionChecklist = hasCompleteAdditions
            ? `INGREDIENTS TO ADD NOW: ${formattedAdditions.join(", ")}.`
            : mappedIngredients.length
              ? "INGREDIENTS TO ADD NOW: [DO NOT RECORD] A mapped ingredient is missing its name/quantity/unit; complete it before recording."
              : "INGREDIENTS TO ADD NOW: None explicitly mapped. Confirm which ingredients are added during this step; do not infer.";
          return [
            `### Step ${index + 1}`,
            `ON SCREEN: ${action || "Cooking action missing — resolve before filming."}`,
            `NARRATION: ${action ? `Step ${index + 1}: ${action}.${additionNarration}${duration ? ` The recorded timing is ${duration}.` : ""}${heat ? ` Use ${heat} heat.` : ""}${cue ? ` Look for this cue: ${cue.replace(/[.!?]+$/, "")}.` : ""}` : `Step ${index + 1} is incomplete. Confirm the action before filming.`}`,
            additionChecklist,
            `TIMING: ${duration || "Not recorded — confirm from a reliable source; do not invent a time."}`,
            ...(duration ? [] : ["PRODUCTION CHECK: timing is missing; confirm it rather than guessing."]),
            `HEAT: ${heat || "Not recorded — check the source and method."}`,
            `VISUAL CUE: ${cue || "Not recorded — add an observable cue if the source provides one."}`,
            "",
          ].join("\n");
        })
      : ["No cooking steps have been recorded. Add the complete method in the correct order before filming."]),
    "## Closing scene",
    "ON SCREEN: Show the finished dish and final texture.",
    `NARRATION: That's the recorded method for ${recipeName}. Review any unresolved details and food-safety guidance before cooking or publishing.`,
    "TASTING: Add a reaction only after the intended tasting scene is reviewed; this generated script does not establish a real human taste test.",
    ...(nutrition.caloriesPerServing !== null
      ? [`NUTRITION: The worksheet calculates approximately ${Math.round(nutrition.caloriesPerServing)} kcal per serving from manually entered ingredient values. Verify all values and sources before recording; this is arithmetic, not independent nutrition verification.`]
      : ["NUTRITION: Calories and health claims are omitted until every ingredient has a sourced value for the exact amount used and the recipe has a clear serving count."]),
    "",
    "## Source uncertainties to resolve",
    ...(project.sourceReferences.length
      ? project.sourceReferences.map((source, index) =>
          `${index + 1}. ${oneLine(source.url) || "Source URL missing"} — checked: ${oneLine(source.checked) || "Not recorded"} — ingredient/quantity findings: ${oneLine(source.ingredientFindings ?? "") || "Not recorded"} — method/order findings: ${oneLine(source.methodFindings ?? "") || "Not recorded"} — timing/heat findings: ${oneLine(source.timingFindings ?? "") || "Not recorded"} — food-safety/storage notes: ${oneLine(source.safetyStorageFindings ?? "") || "Not recorded"} — notes: ${oneLine(source.notes) || "No disagreement or uncertainty notes recorded"} (recorded/extracted; not independently verified)`)
      : ["No structured source references recorded. Optional public-page inspection extracts accessible HTML/metadata only; the app has not independently verified source claims and does not analyze video frames/audio."]),
    `Manual source evidence notes: ${oneLine(project.sourceEvidence) || "None recorded; links and content have not been independently checked."}`,
    "",
    "## Pre-recording checks",
    "- Confirm every ingredient name, amount, unit, and preparation note.",
    "- Confirm missing cooking times and heat levels; don't invent details.",
    "- Resolve source disagreements before filming.",
    "- Verify applicable food-safety guidance from an authoritative source.",
    "- Do not present uncalculated calories or unsupported health benefits as facts.",
    "- Only creator-selected ingredient-to-step mappings are narrated. Any unmapped ingredient must be assigned to a step before recording; the app does not infer timing.",
    "- Missing ingredient names, quantities, actions, or timings must be completed before recording. Do not guess.",
    ...(nutrition.caloriesPerServing !== null
      ? ["- Confirm the calorie worksheet against every source. Values are user-entered and not independently verified by the app."]
      : ["- Nutrition and calories have not been calculated because complete per-ingredient values and a simple serving count are missing."]),
    "- This is a text script draft. It has not generated voice, animated the chef, rendered a video, or published anything.",
  ];
  return lines.join("\n");
}

const MAX_RECIPE_PROJECT_CHARACTERS = 2_000_000;
const MAX_RECIPE_REVISION = 1_000_000_000;
const MAX_RECIPE_INGREDIENTS = 500;
const MAX_RECIPE_STEPS = 500;
const MAX_RECIPE_SCENES = 100;
const MAX_RECIPE_SOURCE_REFERENCES = 100;

export function parseRecipeProjectJSON(raw: string): RecipeProject | null {
  if (raw.length > MAX_RECIPE_PROJECT_CHARACTERS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const legacy = parsed as Record<string, unknown>;
  if (legacy.sourceReferences !== undefined && !Array.isArray(legacy.sourceReferences)) return null;
  const candidate = {
    ...legacy,
    trialStatus: legacy.trialStatus === "tested" ? "tested" : "untested",
    trialRating: typeof legacy.trialRating === "string" && /^[1-5]$/.test(legacy.trialRating) ? legacy.trialRating : "",
    trialDate: typeof legacy.trialDate === "string" && isValidDateOnly(legacy.trialDate) ? legacy.trialDate : "",
    trialChanges: typeof legacy.trialChanges === "string" ? legacy.trialChanges : "",
    trialNotes: typeof legacy.trialNotes === "string" ? legacy.trialNotes : "",
    trialPhotoDataUrl: typeof legacy.trialPhotoDataUrl === "string" && legacy.trialPhotoDataUrl.startsWith("data:image/") ? legacy.trialPhotoDataUrl : "",
    recipeRevision: Number.isSafeInteger(legacy.recipeRevision) && (legacy.recipeRevision as number) >= 0 && (legacy.recipeRevision as number) <= MAX_RECIPE_REVISION ? legacy.recipeRevision : 0,
    trialPhotoRevision: Number.isSafeInteger(legacy.trialPhotoRevision) && (legacy.trialPhotoRevision as number) >= -1 && (legacy.trialPhotoRevision as number) <= MAX_RECIPE_REVISION ? legacy.trialPhotoRevision : -1,
    trialNotesRevision: Number.isSafeInteger(legacy.trialNotesRevision) && (legacy.trialNotesRevision as number) >= -1 && (legacy.trialNotesRevision as number) <= MAX_RECIPE_REVISION ? legacy.trialNotesRevision : -1,
    evidenceReviewedAt: typeof legacy.evidenceReviewedAt === "string" && isValidIsoTimestamp(legacy.evidenceReviewedAt) ? legacy.evidenceReviewedAt : "",
    approved: legacy.approved === true,
    approvedAt: typeof legacy.approvedAt === "string" ? legacy.approvedAt : "",
    sourceEvidence: typeof legacy.sourceEvidence === "string" ? legacy.sourceEvidence : "",
    sourceReferences: Array.isArray(legacy.sourceReferences) ? legacy.sourceReferences.map((source) => {
      // Preserve malformed entries long enough for isRecipeProject to reject them; migration must never throw first.
      if (typeof source !== "object" || source === null || Array.isArray(source)) return source;
      return {
        ...source,
        ingredientFindings: typeof source.ingredientFindings === "string" ? source.ingredientFindings : "",
        methodFindings: typeof source.methodFindings === "string" ? source.methodFindings : "",
        timingFindings: typeof source.timingFindings === "string" ? source.timingFindings : "",
        safetyStorageFindings: typeof source.safetyStorageFindings === "string" ? source.safetyStorageFindings : "",
      };
    }) : [],
    servings: typeof legacy.servings === "string" ? legacy.servings : "",
    ingredients: Array.isArray(legacy.ingredients) ? legacy.ingredients : [],
    steps: Array.isArray(legacy.steps) ? legacy.steps : [],
  };
  if (!isRecipeProject(candidate) || !isHttpUrl(candidate.url)) return null;
  if (candidate.sourceReferences.some((source) => !isHttpUrl(source.url))) return null;
  if (
    candidate.ingredients.length > MAX_RECIPE_INGREDIENTS ||
    candidate.steps.length > MAX_RECIPE_STEPS ||
    candidate.scenes.length > MAX_RECIPE_SCENES ||
    candidate.sourceReferences.length > MAX_RECIPE_SOURCE_REFERENCES
  ) return null;
  const validIngredientIds = new Set(candidate.ingredients.map((ingredient) => ingredient.id));
  const sourceReviewComplete = Boolean(
    candidate.evidenceReviewedAt &&
    candidate.sourceReferences.length > 0 &&
    candidate.sourceReferences.every((source) =>
      Boolean(source.url.trim()) &&
      isHttpUrl(source.url) &&
      /^https?:\/\//i.test(source.url.trim()) &&
      Boolean(source.checked.trim()) &&
      ["ingredientFindings", "methodFindings", "timingFindings", "safetyStorageFindings"]
        .every((field) => typeof source[field as keyof typeof source] === "string" &&
          Boolean((source[field as keyof typeof source] as string).trim()))
    )
  );
  const currentTrialEvidenceIsComplete =
    candidate.trialStatus === "tested" &&
    sourceReviewComplete &&
    candidate.trialDate !== "" &&
    candidate.trialDate <= getLocalDateOnly() &&
    candidate.trialChanges.trim().length >= 3 &&
    candidate.trialRating !== "" &&
    candidate.trialNotes.trim().length >= 10 &&
    candidate.trialPhotoDataUrl !== "" &&
    candidate.trialPhotoRevision === candidate.recipeRevision &&
    candidate.trialNotesRevision === candidate.recipeRevision;
  const trialStatus = currentTrialEvidenceIsComplete ? "tested" : "untested";
  return {
    ...candidate,
    trialStatus,
    approved: trialStatus === "tested" && candidate.approved,
    approvedAt: trialStatus === "tested" && candidate.approved ? candidate.approvedAt : "",
    steps: candidate.steps.map((step) => ({
      ...step,
      ingredientIds: (step.ingredientIds ?? []).filter((id) => validIngredientIds.has(id)),
    })),
  };
}
