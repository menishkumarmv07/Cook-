import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNarrationScript,
  buildTutorialDraft,
  calculateRecipeNutrition,
  DEFAULT_CREATOR_PROFILE,
  isCreatorProfile,
  isHttpUrl,
  isRecipeProject,
  normalizeSourceUrlForComparison,
  parseRecipeProjectJSON,
  SCENE_TEMPLATE,
  validateRecipe,
  type RecipeProject,
} from "../lib/recipe";

const base: RecipeProject = {
  id: 1,
  trialStatus: "untested",
  trialRating: "",
  trialNotes: "",
  trialPhotoDataUrl: "",
  approved: false,
  approvedAt: "",
  name: "Tomato pasta",
  url: "",
  notes: "Keep the pasta water.",
  sourceEvidence: "",
  sourceReferences: [],
  servings: "2",
  ingredients: [{ id: "i1", amount: "200", unit: "g", name: "pasta", prep: "dry" }],
  steps: [{ id: "s1", action: "Boil pasta", duration: "10 minutes", heat: "boiling", cue: "Pasta is tender" }],
  scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
};

test("accepts empty optional URL and valid HTTP(S) links", () => {
  assert.equal(isHttpUrl(""), true);
  assert.equal(isHttpUrl("https://example.com/recipe"), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("not a url"), false);
});

test("recognizes a valid structured project and rejects malformed data", () => {
  assert.equal(isRecipeProject(base), true);
  assert.equal(isRecipeProject({ ...base, ingredients: [{ name: "missing fields" }] }), false);
  assert.equal(isRecipeProject(null), false);
});

test("warns about missing quantities, steps, source analysis, safety and nutrition", () => {
  const issues = validateRecipe({
    ...base,
    servings: "",
    ingredients: [{ id: "i1", amount: "", unit: "", name: "salt", prep: "" }],
    steps: [{ id: "s1", action: "", duration: "", heat: "", cue: "" }],
    url: "https://example.com/recipe",
  });
  const messages = issues.map((issue) => issue.message).join(" ");
  assert.match(messages, /Serving count is missing/);
  assert.match(messages, /Quantity for salt is missing/);
  assert.match(messages, /has no action/);
  assert.match(messages, /source link has not been fetched/i);
  assert.match(messages, /Food-safety guidance has not been independently verified/);
  assert.match(messages, /Nutrition has not been calculated/);
});

test("tutorial draft preserves entered ingredient, step order, and honesty notices", () => {
  const draft = buildTutorialDraft(base);
  assert.ok(draft.indexOf("200 g pasta") < draft.indexOf("Boil pasta"));
  assert.match(draft, /recorded timing: 10 minutes/);
  assert.match(draft, /Food safety and nutrition have not been independently verified/);
  assert.match(draft, /has not been published/);
});

test("nutrition calculator sums exact-amount entries and divides by a clear serving count", () => {
  const recipe: RecipeProject = {
    ...base,
    servings: "2 people",
    ingredients: [{
      ...base.ingredients[0],
      nutritionCalories: "700",
      nutritionProteinG: "20",
      nutritionCarbsG: "140",
      nutritionFatG: "8",
      nutritionBasis: "Values for the exact 200 g dry pasta quantity listed above",
      nutritionSourceUrl: "https://fdc.nal.usda.gov/",
    }],
  };
  const result = calculateRecipeNutrition(recipe);
  assert.equal(result.totalCalories, 700);
  assert.equal(result.caloriesPerServing, 350);
  assert.equal(result.proteinGPerServing, 10);
  assert.equal(result.carbsGPerServing, 70);
  assert.equal(result.fatGPerServing, 4);
  assert.deepEqual(result.missingIngredients, []);
});

test("nutrition calculator refuses missing, negative, unsourced, or ambiguous values", () => {
  const incomplete: RecipeProject = {
    ...base,
    servings: "2-4",
    ingredients: [{
      ...base.ingredients[0],
      nutritionCalories: "700",
      nutritionBasis: "Per exact amount used",
      nutritionSourceUrl: "javascript:alert(1)",
    }],
  };
  const result = calculateRecipeNutrition(incomplete);
  assert.equal(result.totalCalories, null);
  assert.equal(result.caloriesPerServing, null);
  assert.deepEqual(result.missingIngredients, ["pasta"]);

  const invalidServingCount = calculateRecipeNutrition({
    ...incomplete,
    servings: "2-4",
    ingredients: [{
      ...incomplete.ingredients[0],
      nutritionSourceUrl: "https://fdc.nal.usda.gov/",
    }],
  });
  assert.equal(invalidServingCount.totalCalories, 700);
  assert.equal(invalidServingCount.caloriesPerServing, null);

  const negative = calculateRecipeNutrition({
    ...base,
    ingredients: [{
      ...base.ingredients[0],
      nutritionCalories: "-4",
      nutritionBasis: "Exact amount used",
      nutritionSourceUrl: "https://fdc.nal.usda.gov/",
    }],
  });
  assert.equal(negative.totalCalories, null);
});

test("scene template has six scenes with required headings", () => {
  assert.equal(SCENE_TEMPLATE.length, 6);
  assert.match(SCENE_TEMPLATE[0].title, /Hook/);
  assert.match(SCENE_TEMPLATE[5].title, /Taste/);
});


test("imports valid JSON exports and rejects malformed or unsafe backups", () => {
  const imported = parseRecipeProjectJSON(JSON.stringify({ ...base, status: "draft", published: false }));
  assert.ok(imported);
  assert.equal(imported.name, "Tomato pasta");
  assert.equal(imported.ingredients[0].name, "pasta");
  assert.equal(parseRecipeProjectJSON("{not json"), null);
  assert.equal(parseRecipeProjectJSON(JSON.stringify({ ...base, url: "javascript:alert(1)" })), null);
  assert.equal(parseRecipeProjectJSON(JSON.stringify({ ...base, steps: [{ action: "malformed" }] })), null);
  assert.equal(parseRecipeProjectJSON(JSON.stringify({ ...base, sourceReferences: "not-an-array" })), null);
});

test("imports older V1 draft exports with missing structured fields safely", () => {
  const legacy = {
    id: 22,
    name: "Old draft",
    url: "",
    notes: "Old notes",
    scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
  };
  const imported = parseRecipeProjectJSON(JSON.stringify(legacy));
  assert.ok(imported);
  assert.equal(imported.servings, "");
  assert.deepEqual(imported.ingredients, []);
  assert.deepEqual(imported.steps, []);
  assert.equal(imported.sourceEvidence, "");
  assert.deepEqual(imported.sourceReferences, []);
});


test("validates structured source references and flags invalid or duplicate URLs", () => {
  const issues = validateRecipe({
    ...base,
    sourceReferences: [
      { id: "r1", url: "https://example.com/recipe", kind: "recipe-page", checked: "Ingredients and method", notes: "" },
      { id: "r2", url: "https://example.com/recipe/", kind: "video", checked: "", notes: "Timing unclear" },
      { id: "r3", url: "javascript:alert(1)", kind: "other", checked: "", notes: "" },
    ],
  });
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "source-duplicate-1"));
  assert.ok(issues.some((issue) => issue.level === "error" && issue.field === "source-url-2"));
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "source-checked-1"));
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "source-checked-2"));
});

test("exports structured source references without claiming verification", () => {
  const draft = buildTutorialDraft({
    ...base,
    sourceReferences: [
      { id: "r1", url: "https://example.com/a", kind: "recipe-page", checked: "Ingredient list", notes: "Salt quantity differs" },
      { id: "r2", url: "https://example.org/b", kind: "video", checked: "Visible cooking order", notes: "No temperature shown" },
    ],
  });
  assert.ok(draft.indexOf("https://example.com/a") < draft.indexOf("https://example.org/b"));
  assert.match(draft, /Salt quantity differs/);
  assert.match(draft, /have not been independently verified/);
  assert.match(draft, /conflicts or missing details must be resolved/i);
});


test("source URL duplicate normalization preserves case-sensitive paths and query strings", () => {
  assert.equal(
    normalizeSourceUrlForComparison("https://example.com/dish/"),
    normalizeSourceUrlForComparison("https://EXAMPLE.com/dish"),
  );
  assert.notEqual(
    normalizeSourceUrlForComparison("https://example.com/Dish"),
    normalizeSourceUrlForComparison("https://example.com/dish"),
  );
  assert.notEqual(
    normalizeSourceUrlForComparison("https://example.com/dish?variant=1"),
    normalizeSourceUrlForComparison("https://example.com/dish?variant=2"),
  );
});


test("narration script preserves entered ingredient and step order without inventing missing timings", () => {
  const script = buildNarrationScript({
    ...base,
    name: "Tomato pasta",
    ingredients: [
      { id: "i1", amount: "200", unit: "g", name: "pasta", prep: "dry" },
      { id: "i2", amount: "1", unit: "tbsp", name: "olive oil", prep: "" },
    ],
    steps: [
      { id: "s1", action: "Boil the pasta", duration: "8 minutes", heat: "high", cue: "Pasta is tender" },
      { id: "s2", action: "Drain the pasta", duration: "", heat: "", cue: "Water is drained" },
    ],
  });
  assert.ok(script.indexOf("Prepare 200 g pasta") < script.indexOf("Prepare 1 tbsp olive oil"));
  assert.ok(script.indexOf("Step 1: Boil the pasta") < script.indexOf("Step 2: Drain the pasta"));
  assert.match(script, /The recorded timing is 8 minutes/);
  assert.match(script, /timing is missing; confirm it rather than guessing/i);
  assert.match(script, /Ingredient-to-step mapping is not inferred/);
  assert.match(script, /Nutrition and calories have not been calculated/);
  assert.doesNotMatch(script, /Step 2: Drain the pasta\. The recorded timing is \d+/);
});

test("narration script blocks incomplete ingredient names and quantities", () => {
  const script = buildNarrationScript({
    ...base,
    ingredients: [{ id: "i1", amount: "", unit: "", name: "salt", prep: "" }],
    steps: [],
  });
  assert.match(script, /DO NOT RECORD.*quantity not recorded.*salt/i);
  assert.match(script, /No cooking steps have been recorded/);
  assert.match(script, /Missing ingredient names, quantities, actions, or timings must be completed/);
});

test("narration script carries manual source uncertainty and keeps voice/video claims honest", () => {
  const script = buildNarrationScript({
    ...base,
    sourceEvidence: "Compared the ingredient lists; oil quantity differs.",
    sourceReferences: [
      { id: "r1", url: "https://example.com/recipe", kind: "recipe-page", checked: "Ingredient list and timing", notes: "Oil quantity differs" },
      { id: "r2", url: "https://example.org/video", kind: "video", checked: "Visible cooking order", notes: "Exact temperature is unclear" },
    ],
    steps: [
      { id: "s1", action: "Toast the spices", duration: "30 seconds", heat: "medium", cue: "Fragrant, not smoking" },
    ],
  });
  assert.match(script, /Servings:\*\* 2/);
  assert.ok(script.indexOf("https://example.com/recipe") < script.indexOf("https://example.org/video"));
  assert.match(script, /Ingredient list and timing/);
  assert.match(script, /Oil quantity differs/);
  assert.match(script, /Exact temperature is unclear/);
  assert.match(script, /manual entry; not independently verified/);
  assert.match(script, /Manual source evidence notes: Compared the ingredient lists; oil quantity differs/);
  assert.match(script, /Use medium heat/);
  assert.match(script, /Look for this cue: Fragrant, not smoking/);
  assert.match(script, /Ingredient-to-step mapping is not inferred/);
  assert.match(script, /has not generated voice, animated the chef, rendered a video, or published anything/);
});

test("narration script makes empty ingredient and method states explicit", () => {
  const script = buildNarrationScript({ ...base, ingredients: [], steps: [], sourceReferences: [] });
  assert.match(script, /No ingredients are recorded/);
  assert.match(script, /No cooking steps have been recorded/);
  assert.match(script, /app has not fetched or verified source content/);
  assert.match(script, /Nutrition and calories have not been calculated/);
});


test("legacy JSON draft imports with an explicit untested and unapproved default", () => {
  const legacy = {
    ...base,
    trialStatus: undefined,
    trialRating: undefined,
    trialNotes: undefined,
    trialPhotoDataUrl: undefined,
    approved: undefined,
    approvedAt: undefined,
  };
  const restored = parseRecipeProjectJSON(JSON.stringify(legacy));
  assert.ok(restored);
  assert.equal(restored.trialStatus, "untested");
  assert.equal(restored.trialRating, "");
  assert.equal(restored.trialNotes, "");
  assert.equal(restored.trialPhotoDataUrl, "");
  assert.equal(restored.approved, false);
  assert.equal(restored.approvedAt, "");
});


test("creator profile schema accepts complete defaults and rejects malformed values", () => {
  assert.equal(isCreatorProfile(DEFAULT_CREATOR_PROFILE), true);
  assert.equal(isCreatorProfile({ ...DEFAULT_CREATOR_PROFILE, tone: 7 }), false);
  assert.equal(isCreatorProfile(null), false);
});
