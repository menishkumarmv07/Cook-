import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUSCreatorPackAppendix,
} from "../lib/creator-content-pack";
import {
  DEFAULT_CREATOR_PROFILE,
  SCENE_TEMPLATE,
  type RecipeProject,
} from "../lib/recipe";

function recipe(overrides: Partial<RecipeProject> = {}): RecipeProject {
  return {
    id: 1,
    trialStatus: "untested",
    trialRating: "",
    trialNotes: "",
    trialPhotoDataUrl: "",
    approved: false,
    approvedAt: "",
    name: "Tomato pasta",
    url: "https://example.com/recipe",
    notes: "",
    sourceEvidence: "",
    sourceReferences: [],
    servings: "2",
    ingredients: [
      { id: "i1", amount: "200", unit: "g", name: "pasta", prep: "dry" },
      { id: "i2", amount: "1", unit: "cup", name: "tomato sauce", prep: "" },
    ],
    steps: [
      { id: "s1", action: "Boil the pasta", duration: "10 minutes", heat: "boiling", cue: "Tender", ingredientIds: ["i1"] },
      { id: "s2", action: "Stir in sauce", duration: "2 minutes", heat: "low", cue: "Sauce is warm", ingredientIds: ["i2"] },
    ],
    scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
    ...overrides,
  };
}

test("US creator appendix produces title, hook, short-form and long-form sections", () => {
  const output = buildUSCreatorPackAppendix(recipe(), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /US-first creator production appendix/);
  assert.match(output, /United States by default/);
  assert.match(output, /Title options/);
  assert.match(output, /Opening hooks/);
  assert.match(output, /Short-form edit outline/);
  assert.match(output, /Long-form video structure/);
  assert.match(output, /Thumbnail storyboard/);
  assert.match(output, /Accessibility/);
});

test("creator pack preserves entered quantities, order, source links and audience units", () => {
  const output = buildUSCreatorPackAppendix(recipe(), {
    ...DEFAULT_CREATOR_PROFILE,
    units: "US customary",
    platforms: "YouTube Shorts, Instagram Reels",
  });
  assert.match(output, /200 g — pasta/);
  assert.match(output, /1 cup — tomato sauce/);
  assert.ok(output.indexOf("Boil the pasta") < output.indexOf("Stir in sauce"));
  assert.match(output, /https:\/\/example\.com\/recipe/);
  assert.match(output, /US customary/);
});

test("missing information is exposed, not filled in with fabricated quantities or timings", () => {
  const incomplete = recipe({
    servings: "",
    ingredients: [{ id: "i1", amount: "", unit: "", name: "salt", prep: "" }],
    steps: [{ id: "s1", action: "", duration: "", heat: "", cue: "" }],
    url: "",
    notes: "",
  });
  const output = buildUSCreatorPackAppendix(incomplete, DEFAULT_CREATOR_PROFILE);
  assert.match(output, /\[amount not recorded\]/);
  assert.match(output, /\[unit not recorded\]/);
  assert.match(output, /action not recorded/);
  assert.match(output, /timing not recorded/);
  assert.match(output, /Record the serving yield/);
  assert.match(output, /No source URLs recorded/);
  assert.match(output, /NO — not marked tested/);
  assert.match(output, /approval still required/);
});

test("a recipe marked tested but not approved remains approval-gated", () => {
  const output = buildUSCreatorPackAppendix(recipe({
    trialStatus: "tested",
    trialNotes: "Owner recorded a real kitchen trial.",
    approved: false,
  }), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /marked tested — confirm the notes reflect a real trial/);
  assert.match(output, /Content approved by owner: NO/);
  assert.match(output, /Owner approval is not complete/);
});

test("untrusted or invalid source links are not presented as valid evidence", () => {
  const output = buildUSCreatorPackAppendix(recipe({
    url: "javascript:alert(1)",
    sourceReferences: [
      { id: "s1", url: "javascript:alert(2)", kind: "other", checked: "", notes: "" },
    ],
  }), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /invalid source URL/);
  assert.doesNotMatch(output, /javascript:alert/);
});

test("creator policy checklist includes originality, material disclosures and AI disclosure review", () => {
  const output = buildUSCreatorPackAppendix(recipe(), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /original, licensed, or otherwise permitted/);
  assert.match(output, /affiliate link/);
  assert.match(output, /altered\/synthetic content/);
  assert.match(output, /mass-produced/);
  assert.match(output, /YouTube payment age eligibility/);
});

test("business tracking does not promise earnings or invent performance metrics", () => {
  const output = buildUSCreatorPackAppendix(recipe(), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /USD-oriented business tracking/);
  assert.match(output, /does not forecast earnings/);
  assert.match(output, /Record actual post URL/);
  assert.match(output, /do not invent missing values/);
});

test("large recipe lists remain explicitly bounded in the exported appendix", () => {
  const manyIngredients = Array.from({ length: 105 }, (_, index) => ({
    id: `i${index}`,
    amount: "1",
    unit: "g",
    name: `ingredient ${index}`,
    prep: "",
  }));
  const output = buildUSCreatorPackAppendix(recipe({ ingredients: manyIngredients }), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /first 100 ingredient rows are shown/);
  assert.doesNotMatch(output, /105\. 1 g/);
});


test("source URL export does not truncate links or collapse distinct case-sensitive paths", () => {
  const mixedCase = recipe({
    url: "https://example.com/Recipe",
    sourceReferences: [
      { id: "lower", url: "https://example.com/recipe", kind: "recipe-page", checked: "page", notes: "" },
      { id: "duplicate", url: "https://EXAMPLE.com/Recipe/", kind: "recipe-page", checked: "same page", notes: "" },
    ],
  });
  const output = buildUSCreatorPackAppendix(mixedCase, DEFAULT_CREATOR_PROFILE);
  assert.match(output, /https:\/\/example\.com\/Recipe/);
  assert.match(output, /https:\/\/example\.com\/recipe/);
  assert.equal((output.match(/https:\/\/example\.com\/Recipe/g) ?? []).length, 1);

  const longUrl = "https://example.com/" + "a".repeat(2_050);
  const longOutput = buildUSCreatorPackAppendix(recipe({ url: longUrl }), DEFAULT_CREATOR_PROFILE);
  assert.match(longOutput, /source URL exceeds 2,000 characters/);
  assert.doesNotMatch(longOutput, new RegExp(longUrl));
});

test("source URLs containing embedded credentials or control characters are redacted", () => {
  const credentialOutput = buildUSCreatorPackAppendix(
    recipe({ url: "https://user:secret@example.com/recipe" }),
    DEFAULT_CREATOR_PROFILE,
  );
  assert.match(credentialOutput, /embedded credentials/);
  assert.doesNotMatch(credentialOutput, /user:secret/);

  const controlOutput = buildUSCreatorPackAppendix(
    recipe({ url: "https://example.com/recipe\\nFAKE-SOURCE" }),
    DEFAULT_CREATOR_PROFILE,
  );
  assert.match(controlOutput, /control characters|invalid source URL/);
  assert.doesNotMatch(controlOutput, /FAKE-SOURCE/);
});
