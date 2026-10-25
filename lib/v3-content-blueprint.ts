import { isCreatorProfile, type CreatorProfile, type RecipeProject } from "./recipe";
import {
  isHttpSourceUrl,
  parseResearchEvidenceArchive,
  type ResearchEvidenceArchive,
} from "./research-evidence";

export const V3_CONTENT_BLUEPRINT_SCHEMA_VERSION = 1 as const;
const MAX_INGREDIENTS = 500;
const MAX_STEPS = 500;
const MAX_SOURCES = 100;
const MAX_FIELD_LENGTH = 4_000;
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export type V3SceneKind = "opening" | "ingredient-overview" | "cooking-step" | "closing";
export type V3SceneReviewStatus = "needs-review" | "approved" | "rejected";
export type V3BlueprintStatus =
  | "draft"
  | "blueprint-reviewed"
  | "visuals-reviewed"
  | "audio-reviewed"
  | "ready-to-export"
  | "exported";

export type V3RecipeSnapshot = {
  id: number;
  recipeRevision: number;
  name: string;
  url: string;
  notes: string;
  sourceEvidence: string;
  servings: string;
  trialStatus: "untested" | "tested";
  trialDate: string;
  trialChanges: string;
  trialNotes: string;
  evidenceReviewedAt: string;
  approved: boolean;
  approvedAt: string;
  hasCurrentTrialPhoto: boolean;
  trialPhotoRevision: number;
  trialNotesRevision: number;
  sourceReferences: Array<{
    id: string;
    url: string;
    kind: string;
    checked: string;
    notes: string;
    ingredientFindings: string;
    methodFindings: string;
    timingFindings: string;
    safetyStorageFindings: string;
  }>;
  ingredients: Array<{
    id: string;
    amount: string;
    unit: string;
    name: string;
    prep: string;
    nutritionCalories: string;
    nutritionProteinG: string;
    nutritionCarbsG: string;
    nutritionFatG: string;
    nutritionBasis: string;
    nutritionSourceUrl: string;
  }>;
  steps: Array<{
    id: string;
    action: string;
    duration: string;
    heat: string;
    cue: string;
    ingredientIds: string[];
  }>;
};

export type V3BlueprintWarningCode =
  | "recipe-not-named"
  | "recipe-not-tried"
  | "recipe-not-approved"
  | "evidence-review-incomplete"
  | "no-source-references"
  | "no-ingredients"
  | "no-steps"
  | "ingredient-name-missing"
  | "ingredient-amount-missing"
  | "ingredient-unit-missing"
  | "step-action-missing"
  | "step-duration-missing"
  | "step-heat-missing"
  | "step-cue-missing"
  | "step-ingredient-reference-missing"
  | "dangling-ingredient-reference"
  | "duplicate-source-id"
  | "evidence-archive-invalid"
  | "research-archive-not-included"
  | "research-archive-empty"
  | "evidence-claim-not-accepted"
  | "evidence-source-not-usable"
  | "source-url-unusable"
  | "input-text-truncated";

export type V3BlueprintWarning = {
  code: V3BlueprintWarningCode;
  message: string;
  entityId?: string;
};

export type V3SceneTrace = {
  entityType: "recipe" | "ingredient" | "step";
  entityId: string;
  fields: string[];
};

export type V3BlueprintScene = {
  id: string;
  kind: V3SceneKind;
  title: string;
  narrationText: string;
  captionText: string;
  onScreenText: string[];
  visualDirection: string;
  cookingDuration: string | null;
  heat: string | null;
  visualCue: string | null;
  ingredientIds: string[];
  trace: V3SceneTrace[];
  reviewStatus: V3SceneReviewStatus;
  targetClipSeconds: null;
};

export type V3ContentBlueprint = {
  schemaVersion: typeof V3_CONTENT_BLUEPRINT_SCHEMA_VERSION;
  createdAt: string;
  status: V3BlueprintStatus;
  recipeTitle: string;
  servings: string;
  creatorProfile: CreatorProfile;
  sourceSnapshot: {
    recipe: V3RecipeSnapshot;
    researchEvidence: ResearchEvidenceArchive | null;
  };
  fingerprints: {
    recipeSha256: string;
    creatorProfileSha256: string;
    researchEvidenceSha256: string | null;
    inputsSha256: string;
  };
  scenes: V3BlueprintScene[];
  warnings: V3BlueprintWarning[];
  reviewNotes: string[];
};

export type BuildV3ContentBlueprintInput = {
  recipe: RecipeProject;
  creatorProfile: CreatorProfile;
  researchEvidence?: unknown;
  now?: string;
};

export class V3BlueprintInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V3BlueprintInputError";
  }
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength = MAX_FIELD_LENGTH): string {
  if (typeof value !== "string") return "";
  if (value.length > maxLength) {
    throw new V3BlueprintInputError(
      "A source field exceeds V3's safe text limit of " + maxLength.toLocaleString("en-US") +
      " characters. Nothing was truncated; shorten or split that field and retry.",
    );
  }
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

function safeBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 240));
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    const result = JSON.stringify(value);
    if (typeof result !== "string") throw new V3BlueprintInputError("Could not serialise a blueprint input.");
    return result;
  }
  if (Array.isArray(value)) {
    return "[" + value.map((item) => stableStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (isRecord(value)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      result[key] = toJsonValue(item);
    }
    return result;
  }
  throw new V3BlueprintInputError("A blueprint input contains unsupported data.");
}

async function sha256(value: JsonValue): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new V3BlueprintInputError("Secure SHA-256 is unavailable in this browser. The project was not created.");
  }
  const encoded = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeSourceUrl(value: unknown): string {
  const raw = cleanText(value, 2_048);
  if (!raw || !isHttpSourceUrl(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function snapshotRecipe(recipe: RecipeProject, warnings: V3BlueprintWarning[]): V3RecipeSnapshot {
  if (!isRecord(recipe)) throw new V3BlueprintInputError("A valid V2 recipe is required.");
  if (!Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps) || !Array.isArray(recipe.sourceReferences)) {
    throw new V3BlueprintInputError("The V2 recipe has an invalid ingredient, step, or source list.");
  }
  if (recipe.ingredients.length > MAX_INGREDIENTS || recipe.steps.length > MAX_STEPS || recipe.sourceReferences.length > MAX_SOURCES) {
    throw new V3BlueprintInputError("The recipe exceeds V3's safe input limits; split or reduce the source data first.");
  }

  const name = cleanText(recipe.name, 240);
  if (!name) warnings.push({ code: "recipe-not-named", message: "Recipe name is missing. Add and review it before export." });
  const ingredients = recipe.ingredients.map((item, index) => {
    if (!isRecord(item)) throw new V3BlueprintInputError("Ingredient row " + (index + 1) + " is invalid.");
    const ingredient: V3RecipeSnapshot["ingredients"][number] = {
      id: cleanText(item.id, 120),
      amount: cleanText(item.amount, 120),
      unit: cleanText(item.unit, 120),
      name: cleanText(item.name, 240),
      prep: cleanText(item.prep, 600),
      nutritionCalories: cleanText(item.nutritionCalories, 80),
      nutritionProteinG: cleanText(item.nutritionProteinG, 80),
      nutritionCarbsG: cleanText(item.nutritionCarbsG, 80),
      nutritionFatG: cleanText(item.nutritionFatG, 80),
      nutritionBasis: cleanText(item.nutritionBasis, 600),
      nutritionSourceUrl: safeSourceUrl(item.nutritionSourceUrl),
    };
    if (!ingredient.id) throw new V3BlueprintInputError("Ingredient row " + (index + 1) + " has no stable ID.");
    if (!ingredient.name) warnings.push({ code: "ingredient-name-missing", message: "Ingredient name is missing.", entityId: ingredient.id });
    if (!ingredient.amount) warnings.push({ code: "ingredient-amount-missing", message: "Amount is not recorded; V3 will not infer one.", entityId: ingredient.id });
    if (!ingredient.unit) warnings.push({ code: "ingredient-unit-missing", message: "Unit is not recorded; V3 will not convert or infer one.", entityId: ingredient.id });
    return ingredient;
  });

  const steps = recipe.steps.map((item, index) => {
    if (!isRecord(item)) throw new V3BlueprintInputError("Cooking step " + (index + 1) + " is invalid.");
    const step: V3RecipeSnapshot["steps"][number] = {
      id: cleanText(item.id, 120),
      action: cleanText(item.action, 2_000),
      duration: cleanText(item.duration, 240),
      heat: cleanText(item.heat, 240),
      cue: cleanText(item.cue, 600),
      ingredientIds: asStringArray(item.ingredientIds),
    };
    if (!step.id) throw new V3BlueprintInputError("Cooking step " + (index + 1) + " has no stable ID.");
    if (!step.action) warnings.push({ code: "step-action-missing", message: "Cooking action is not recorded; owner review is required.", entityId: step.id });
    if (!step.duration) warnings.push({ code: "step-duration-missing", message: "Cooking duration is not recorded; V3 will not invent one.", entityId: step.id });
    if (!step.heat) warnings.push({ code: "step-heat-missing", message: "Heat setting is not recorded; V3 will not infer one.", entityId: step.id });
    if (!step.cue) warnings.push({ code: "step-cue-missing", message: "Visual or doneness cue is not recorded.", entityId: step.id });
    if (step.ingredientIds.length === 0) {
      warnings.push({ code: "step-ingredient-reference-missing", message: "This step has no explicit ingredient mapping; check it before production.", entityId: step.id });
    }
    return step;
  });

  const sourceReferences = recipe.sourceReferences.map((item, index) => {
    if (!isRecord(item)) throw new V3BlueprintInputError("Source reference " + (index + 1) + " is invalid.");
    const url = safeSourceUrl(item.url);
    if (item.url && !url) {
      warnings.push({ code: "source-url-unusable", message: "A source URL was omitted from the V3 snapshot because it is invalid or contains credentials." });
    }
    return {
      id: cleanText(item.id, 120),
      url,
      kind: cleanText(item.kind, 80),
      checked: cleanText(item.checked, 600),
      notes: cleanText(item.notes, 1_200),
      ingredientFindings: cleanText(item.ingredientFindings, 1_200),
      methodFindings: cleanText(item.methodFindings, 1_200),
      timingFindings: cleanText(item.timingFindings, 1_200),
      safetyStorageFindings: cleanText(item.safetyStorageFindings, 1_200),
    };
  });

  if (ingredients.length === 0) warnings.push({ code: "no-ingredients", message: "No ingredients are recorded. A production-ready blueprint cannot be approved." });
  if (steps.length === 0) warnings.push({ code: "no-steps", message: "No cooking steps are recorded. A production-ready blueprint cannot be approved." });
  if (sourceReferences.length === 0) warnings.push({ code: "no-source-references", message: "No source references are recorded; factual claims need owner review." });
  if (recipe.trialStatus !== "tested") warnings.push({ code: "recipe-not-tried", message: "Untried recipe draft: the recipe has not been recorded as tested by the owner." });
  if (recipe.approved !== true) warnings.push({ code: "recipe-not-approved", message: "The V2 recipe is not currently approved; review it before publishing." });
  if (!cleanText(recipe.evidenceReviewedAt)) warnings.push({ code: "evidence-review-incomplete", message: "V2 evidence review is not recorded as complete." });

  return {
    id: safeNumber(recipe.id, -1),
    recipeRevision: safeNumber(recipe.recipeRevision, 0),
    name,
    url: safeSourceUrl(recipe.url),
    notes: cleanText(recipe.notes, 2_000),
    sourceEvidence: cleanText(recipe.sourceEvidence, 4_000),
    servings: cleanText(recipe.servings, 120),
    trialStatus: recipe.trialStatus === "tested" ? "tested" : "untested",
    trialDate: cleanText(recipe.trialDate, 40),
    trialChanges: cleanText(recipe.trialChanges, 1_200),
    trialNotes: cleanText(recipe.trialNotes, 2_000),
    evidenceReviewedAt: cleanText(recipe.evidenceReviewedAt, 40),
    approved: safeBoolean(recipe.approved),
    approvedAt: cleanText(recipe.approvedAt, 40),
    hasCurrentTrialPhoto: typeof recipe.trialPhotoDataUrl === "string" &&
      recipe.trialPhotoDataUrl.length > 0 &&
      recipe.trialPhotoRevision === recipe.recipeRevision,
    trialPhotoRevision: safeNumber(recipe.trialPhotoRevision, -1),
    trialNotesRevision: safeNumber(recipe.trialNotesRevision, -1),
    sourceReferences,
    ingredients,
    steps,
  };
}

function snapshotProfile(profile: CreatorProfile): CreatorProfile {
  if (!isRecord(profile)) throw new V3BlueprintInputError("A valid V2 creator profile is required.");
  const keys: Array<keyof CreatorProfile> = [
    "tone", "catchphrases", "language", "cuisineFocus", "skillLevel", "equipment", "budget",
    "dietLimits", "units", "usualCookingTime", "platforms", "neverSay", "sampleCaptions",
  ];
  const result = {} as CreatorProfile;
  for (const key of keys) {
    if (typeof profile[key] !== "string") {
      throw new V3BlueprintInputError("Creator profile field " + key + " is missing or invalid.");
    }
    result[key] = cleanText(profile[key], 1_000);
  }
  return result;
}

function addEvidenceWarnings(
  archive: ResearchEvidenceArchive | null,
  warnings: V3BlueprintWarning[],
): void {
  if (!archive) return;
  const sourceIds = new Set(archive.sources.map((source) => source.id));
  for (const claim of archive.claims) {
    if (claim.reviewStatus !== "accepted") {
      warnings.push({
        code: "evidence-claim-not-accepted",
        message: "Research claim '" + claim.id + "' is " + claim.reviewStatus + "; it must not be presented as an accepted fact.",
        entityId: claim.id,
      });
    }
  }
  for (const source of archive.sources) {
    if (source.status !== "accessible" || source.warnings.length > 0) {
      warnings.push({
        code: "evidence-source-not-usable",
        message: "Research source '" + source.id + "' is not fully clear for factual use; review its status and warnings.",
        entityId: source.id,
      });
    }
  }
  for (const claim of archive.claims) {
    if (!sourceIds.has(claim.sourceId)) {
      warnings.push({
        code: "evidence-source-not-usable",
        message: "Research claim '" + claim.id + "' has no source in this snapshot.",
        entityId: claim.id,
      });
    }
  }
}

function makeSceneId(kind: V3SceneKind, sourceId: string, index: number): string {
  const safeId = sourceId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return "v3-" + kind + "-" + (safeId || "source") + "-" + String(index + 1);
}

function makeScenes(snapshot: V3RecipeSnapshot, warnings: V3BlueprintWarning[]): V3BlueprintScene[] {
  const ingredientById = new Map(snapshot.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const scenes: V3BlueprintScene[] = [];
  const recipeTitle = snapshot.name || "Recipe name not recorded";
  const ingredientDisplay = snapshot.ingredients.map((ingredient) => {
    const amount = ingredient.amount || "[amount not recorded]";
    const unit = ingredient.unit || "[unit not recorded]";
    const name = ingredient.name || "[ingredient name not recorded]";
    return amount + " " + unit + " — " + name + (ingredient.prep ? "; preparation: " + ingredient.prep : "");
  });

  scenes.push({
    id: makeSceneId("opening", "recipe", 0),
    kind: "opening",
    title: recipeTitle + " — opening",
    narrationText: snapshot.name ? "Let's make " + snapshot.name + "." : "Recipe name not recorded. Owner review required.",
    captionText: snapshot.name ? "Let's make " + snapshot.name + "." : "Recipe name not recorded. Owner review required.",
    onScreenText: [recipeTitle],
    visualDirection: "Opening shot. Use the approved chef and kitchen references. Show only the recipe or finished dish when the actual reference footage supports it.",
    cookingDuration: null,
    heat: null,
    visualCue: null,
    ingredientIds: [],
    trace: [{ entityType: "recipe", entityId: String(snapshot.id), fields: ["name", "url", "notes"] }],
    reviewStatus: "needs-review",
    targetClipSeconds: null,
  });

  scenes.push({
    id: makeSceneId("ingredient-overview", "ingredients", 1),
    kind: "ingredient-overview",
    title: "Recorded ingredients",
    narrationText: ingredientDisplay.length ? ingredientDisplay.join(". ") + "." : "Ingredients are not recorded. Owner review required.",
    captionText: ingredientDisplay.length ? ingredientDisplay.join(". ") + "." : "Ingredients are not recorded. Owner review required.",
    onScreenText: ingredientDisplay,
    visualDirection: "Show the ingredients actually listed in this project's source snapshot. Do not add substitutes, quantities, packaging or props not recorded or owner-confirmed.",
    cookingDuration: null,
    heat: null,
    visualCue: null,
    ingredientIds: snapshot.ingredients.map((ingredient) => ingredient.id),
    trace: snapshot.ingredients.map((ingredient) => ({
      entityType: "ingredient" as const,
      entityId: ingredient.id,
      fields: ["amount", "unit", "name", "prep"],
    })),
    reviewStatus: "needs-review",
    targetClipSeconds: null,
  });

  snapshot.steps.forEach((step, index) => {
    const mappedIngredients: string[] = [];
    for (const ingredientId of step.ingredientIds) {
      if (!ingredientById.has(ingredientId)) {
        warnings.push({
          code: "dangling-ingredient-reference",
          message: "Step '" + step.id + "' references missing ingredient ID '" + ingredientId + "'.",
          entityId: step.id,
        });
      } else {
        mappedIngredients.push(ingredientId);
      }
    }
    const action = step.action || "Cooking action not recorded. Owner review required.";
    const ingredients = mappedIngredients.map((id) => ingredientById.get(id)?.name || "[ingredient name not recorded]");
    const mappedText = ingredients.length ? " Recorded ingredients: " + ingredients.join(", ") + "." : "";
    scenes.push({
      id: makeSceneId("cooking-step", step.id, index),
      kind: "cooking-step",
      title: step.action ? "Step " + (index + 1) + ": " + step.action.slice(0, 120) : "Step " + (index + 1) + ": action not recorded",
      narrationText: action + mappedText,
      captionText: action + mappedText,
      onScreenText: [action, ...ingredients],
      visualDirection: "Depict only the recorded action. Preserve ingredient identity and cooking-state progression. Use the pinned chef/kitchen references where the footage contains them. If this action cannot be shown faithfully, flag the scene for replacement rather than inventing a substitute.",
      cookingDuration: step.duration || null,
      heat: step.heat || null,
      visualCue: step.cue || null,
      ingredientIds: mappedIngredients,
      trace: [
        { entityType: "step", entityId: step.id, fields: ["action", "duration", "heat", "cue", "ingredientIds"] },
        ...mappedIngredients.map((id) => ({
          entityType: "ingredient" as const,
          entityId: id,
          fields: ["amount", "unit", "name", "prep"],
        })),
      ],
      reviewStatus: "needs-review",
      targetClipSeconds: null,
    });
  });

  scenes.push({
    id: makeSceneId("closing", "recipe", 1),
    kind: "closing",
    title: "Closing / result review",
    narrationText: "Show the completed dish only after checking that it matches the approved recipe and actual cooking result.",
    captionText: "Show the completed dish only after checking that it matches the approved recipe and actual cooking result.",
    onScreenText: [recipeTitle],
    visualDirection: "Closing shot. Show a finished dish only when it is supported by real footage or a reviewed visual that matches the source recipe. No invented garnish, ingredients or health claims.",
    cookingDuration: null,
    heat: null,
    visualCue: null,
    ingredientIds: [],
    trace: [{ entityType: "recipe", entityId: String(snapshot.id), fields: ["name", "servings", "trialStatus", "approved"] }],
    reviewStatus: "needs-review",
    targetClipSeconds: null,
  });

  return scenes;
}

export async function buildV3ContentBlueprint(
  input: BuildV3ContentBlueprintInput,
): Promise<V3ContentBlueprint> {
  if (!isRecord(input)) throw new V3BlueprintInputError("Blueprint input must be an object.");
  const now = typeof input.now === "string" ? input.now : new Date().toISOString();
  if (!Number.isFinite(Date.parse(now)) || !/^\d{4}-\d{2}-\d{2}T/.test(now)) {
    throw new V3BlueprintInputError("A valid ISO timestamp is required.");
  }

  const warnings: V3BlueprintWarning[] = [];
  const recipe = snapshotRecipe(input.recipe, warnings);
  const profile = snapshotProfile(input.creatorProfile);

  const rawEvidence = input.researchEvidence;
  const evidenceArchive = rawEvidence === undefined ? null : parseResearchEvidenceArchive(rawEvidence);
  if (rawEvidence === undefined) {
    warnings.push({
      code: "research-archive-not-included",
      message: "The separate Research Studio ledger was not included. Source notes attached to the V2 recipe remain in the snapshot, but a separate evidence archive was not pinned.",
    });
  } else if (!evidenceArchive) {
    warnings.push({
      code: "evidence-archive-invalid",
      message: "The supplied research archive could not be validated; it was not included in the snapshot.",
    });
  }
  if (evidenceArchive) {
    const bytes = new TextEncoder().encode(stableStringify(toJsonValue(evidenceArchive))).byteLength;
    if (bytes > MAX_EVIDENCE_BYTES) {
      throw new V3BlueprintInputError("The research evidence snapshot exceeds the 10 MiB safety limit.");
    }
    if (evidenceArchive.sources.length === 0 && evidenceArchive.claims.length === 0) {
      warnings.push({
        code: "research-archive-empty",
        message: "The separate Research Studio ledger is empty. This is not proof that recipe claims were independently verified.",
      });
    }
    addEvidenceWarnings(evidenceArchive, warnings);
  }

  const recipeSha256 = await sha256(toJsonValue(recipe));
  const creatorProfileSha256 = await sha256(toJsonValue(profile));
  const researchEvidenceSha256 = evidenceArchive ? await sha256(toJsonValue(evidenceArchive)) : null;
  const inputsSha256 = await sha256(toJsonValue({
    recipe,
    creatorProfile: profile,
    researchEvidence: evidenceArchive,
  }));

  const ingredientIds = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    if (ingredientIds.has(ingredient.id)) {
      throw new V3BlueprintInputError("Duplicate ingredient ID '" + ingredient.id + "'; the source must be corrected before planning.");
    }
    ingredientIds.add(ingredient.id);
  }
  const stepIds = new Set<string>();
  for (const step of recipe.steps) {
    if (stepIds.has(step.id)) {
      throw new V3BlueprintInputError("Duplicate cooking step ID '" + step.id + "'; the source must be corrected before planning.");
    }
    stepIds.add(step.id);
  }
  const sourceIds = new Set<string>();
  for (const source of recipe.sourceReferences) {
    if (!source.id) continue;
    if (sourceIds.has(source.id)) {
      warnings.push({ code: "duplicate-source-id", message: "Duplicate source reference ID found; source history needs review.", entityId: source.id });
    }
    sourceIds.add(source.id);
  }

  const scenes = makeScenes(recipe, warnings);
  return {
    schemaVersion: V3_CONTENT_BLUEPRINT_SCHEMA_VERSION,
    createdAt: now,
    status: "draft",
    recipeTitle: recipe.name || "Recipe name not recorded",
    servings: recipe.servings || "[servings not recorded]",
    creatorProfile: profile,
    sourceSnapshot: {
      recipe,
      researchEvidence: evidenceArchive,
    },
    fingerprints: {
      recipeSha256,
      creatorProfileSha256,
      researchEvidenceSha256,
      inputsSha256,
    },
    scenes,
    warnings,
    reviewNotes: [
      "Every scene requires owner review before it can be approved.",
      "Missing facts remain missing; do not infer amounts, units, timing, heat or safety guidance.",
      "The recipe snapshot records V2 status but does not independently prove the recipe was tested or approved.",
      "Research evidence retains its original review statuses. Unreviewed or rejected claims are not promoted to factual script lines.",
      "This blueprint is a scene plan, not a rendered video. It has no generated footage or estimated clip duration.",
    ],
  };
}

export function validateV3ContentBlueprint(value: unknown): value is V3ContentBlueprint {
  if (!isRecord(value) || value.schemaVersion !== V3_CONTENT_BLUEPRINT_SCHEMA_VERSION) return false;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (typeof value.status !== "string" || !["draft", "blueprint-reviewed", "visuals-reviewed", "audio-reviewed", "ready-to-export", "exported"].includes(value.status)) return false;
  if (typeof value.recipeTitle !== "string" || typeof value.servings !== "string") return false;
  if (!isRecord(value.sourceSnapshot) || !isRecord(value.fingerprints)) return false;
  if (!isRecord(value.sourceSnapshot.recipe) || !Array.isArray(value.scenes) || !Array.isArray(value.warnings) || !Array.isArray(value.reviewNotes)) return false;
  const fingerprints = value.fingerprints;
  if (
    typeof fingerprints.recipeSha256 !== "string" || !/^[a-f0-9]{64}$/.test(fingerprints.recipeSha256) ||
    typeof fingerprints.creatorProfileSha256 !== "string" || !/^[a-f0-9]{64}$/.test(fingerprints.creatorProfileSha256) ||
    typeof fingerprints.inputsSha256 !== "string" || !/^[a-f0-9]{64}$/.test(fingerprints.inputsSha256) ||
    (fingerprints.researchEvidenceSha256 !== null &&
      (typeof fingerprints.researchEvidenceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(fingerprints.researchEvidenceSha256)))
  ) return false;

  const sceneIds = new Set<string>();
  for (const scene of value.scenes) {
    if (!isRecord(scene)) return false;
    if (typeof scene.id !== "string" || !scene.id || sceneIds.has(scene.id)) return false;
    sceneIds.add(scene.id);
    if (typeof scene.kind !== "string" || !["opening", "ingredient-overview", "cooking-step", "closing"].includes(scene.kind)) return false;
    if (typeof scene.title !== "string" || typeof scene.narrationText !== "string" || typeof scene.captionText !== "string") return false;
    if (!Array.isArray(scene.onScreenText) || !scene.onScreenText.every((item) => typeof item === "string")) return false;
    if (!Array.isArray(scene.ingredientIds) || !scene.ingredientIds.every((item) => typeof item === "string")) return false;
    if (typeof scene.visualDirection !== "string") return false;
    if (scene.cookingDuration !== null && typeof scene.cookingDuration !== "string") return false;
    if (scene.heat !== null && typeof scene.heat !== "string") return false;
    if (scene.visualCue !== null && typeof scene.visualCue !== "string") return false;
    if (!Array.isArray(scene.trace) || !scene.trace.every((entry) => {
      if (!isRecord(entry)) return false;
      if (!["recipe", "ingredient", "step"].includes(String(entry.entityType))) return false;
      return typeof entry.entityId === "string" && entry.entityId.length > 0 &&
        Array.isArray(entry.fields) && entry.fields.every((field) => typeof field === "string");
    })) return false;
    if (scene.reviewStatus !== "needs-review" && scene.reviewStatus !== "approved" && scene.reviewStatus !== "rejected") return false;
    if (scene.targetClipSeconds !== null) return false;
  }
  if (!isCreatorProfile(value.creatorProfile)) return false;
  if (!Array.isArray(value.reviewNotes) || !value.reviewNotes.every((note) => typeof note === "string")) return false;
  if (!value.warnings.every((warning) => {
    if (!isRecord(warning)) return false;
    return typeof warning.code === "string" && typeof warning.message === "string" &&
      (warning.entityId === undefined || typeof warning.entityId === "string");
  })) return false;
  if (value.sourceSnapshot.researchEvidence !== null &&
    !parseResearchEvidenceArchive(value.sourceSnapshot.researchEvidence)) return false;
  const recipe = value.sourceSnapshot.recipe;
  const stringRecipeFields = [
    "name", "url", "notes", "sourceEvidence", "servings", "trialDate", "trialChanges",
    "trialNotes", "evidenceReviewedAt", "approvedAt",
  ];
  if (
    typeof recipe.id !== "number" || !Number.isSafeInteger(recipe.id) ||
    typeof recipe.recipeRevision !== "number" || !Number.isSafeInteger(recipe.recipeRevision) ||
    !stringRecipeFields.every((key) => typeof recipe[key] === "string") ||
    (recipe.trialStatus !== "tested" && recipe.trialStatus !== "untested") ||
    typeof recipe.approved !== "boolean" || typeof recipe.hasCurrentTrialPhoto !== "boolean" ||
    typeof recipe.trialPhotoRevision !== "number" || !Number.isSafeInteger(recipe.trialPhotoRevision) ||
    typeof recipe.trialNotesRevision !== "number" || !Number.isSafeInteger(recipe.trialNotesRevision) ||
    !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps) || !Array.isArray(recipe.sourceReferences)
  ) return false;
  const sourceFields = ["id", "url", "kind", "checked", "notes", "ingredientFindings", "methodFindings", "timingFindings", "safetyStorageFindings"];
  if (!recipe.sourceReferences.every((source) =>
    isRecord(source) && sourceFields.every((key) => typeof source[key] === "string")
  )) return false;
  const ingredientFields = [
    "id", "amount", "unit", "name", "prep", "nutritionCalories", "nutritionProteinG",
    "nutritionCarbsG", "nutritionFatG", "nutritionBasis", "nutritionSourceUrl",
  ];
  if (!recipe.ingredients.every((ingredient) =>
    isRecord(ingredient) && ingredientFields.every((key) => typeof ingredient[key] === "string")
  )) return false;
  const stepFields = ["id", "action", "duration", "heat", "cue"];
  if (!recipe.steps.every((step) =>
    isRecord(step) && stepFields.every((key) => typeof step[key] === "string") &&
    Array.isArray(step.ingredientIds) && step.ingredientIds.every((id) => typeof id === "string")
  )) return false;
  return true;
}

export async function verifyV3ContentBlueprintFingerprints(value: unknown): Promise<boolean> {
  if (!validateV3ContentBlueprint(value)) return false;
  try {
    const recipeSha256 = await sha256(toJsonValue(value.sourceSnapshot.recipe));
    const creatorProfileSha256 = await sha256(toJsonValue(value.creatorProfile));
    const evidence = value.sourceSnapshot.researchEvidence;
    const researchEvidenceSha256 = evidence ? await sha256(toJsonValue(evidence)) : null;
    const inputsSha256 = await sha256(toJsonValue({
      recipe: value.sourceSnapshot.recipe,
      creatorProfile: value.creatorProfile,
      researchEvidence: evidence,
    }));
    return recipeSha256 === value.fingerprints.recipeSha256 &&
      creatorProfileSha256 === value.fingerprints.creatorProfileSha256 &&
      researchEvidenceSha256 === value.fingerprints.researchEvidenceSha256 &&
      inputsSha256 === value.fingerprints.inputsSha256;
  } catch {
    return false;
  }
}

const MAX_BLUEPRINT_BACKUP_BYTES = 15 * 1024 * 1024;

export function createV3ContentBlueprintBackupJSON(blueprint: V3ContentBlueprint): string {
  if (!validateV3ContentBlueprint(blueprint)) {
    throw new V3BlueprintInputError("Only a structurally valid V3 blueprint can be exported.");
  }
  const raw = JSON.stringify(blueprint, null, 2);
  if (new TextEncoder().encode(raw).byteLength > MAX_BLUEPRINT_BACKUP_BYTES) {
    throw new V3BlueprintInputError("Blueprint backup exceeds the 15 MiB safety limit.");
  }
  return raw;
}

export function parseV3ContentBlueprintBackupJSON(raw: string): V3ContentBlueprint | null {
  if (typeof raw !== "string" || raw.length > MAX_BLUEPRINT_BACKUP_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_BLUEPRINT_BACKUP_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateV3ContentBlueprint(parsed) ? parsed : null;
}
