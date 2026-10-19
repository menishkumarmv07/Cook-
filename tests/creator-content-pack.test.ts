import test from "node:test";
import assert from "node:assert/strict";
import { buildCreatorContentPack } from "../lib/creator-content-pack";
import { DEFAULT_CREATOR_PROFILE, SCENE_TEMPLATE, type RecipeProject } from "../lib/recipe";

const base: RecipeProject = {
  id: 1,
  trialStatus: "untested",
  trialRating: "",
  trialNotes: "",
  trialPhotoDataUrl: "",
  approved: false,
  approvedAt: "",
  name: "Tomato pasta",
  url: "https://example.com/tomato-pasta",
  notes: "",
  sourceEvidence: "",
  sourceReferences: [{
    id: "src-1",
    url: "https://example.com/tomato-pasta",
    kind: "recipe-page",
    checked: "Ingredients and step order",
    notes: "Cooking time not independently confirmed",
    ingredientFindings: "200 g pasta",
    methodFindings: "Boil before mixing",
    timingFindings: "10 minutes stated by source",
    safetyStorageFindings: "No storage information found",
  }],
  servings: "2",
  ingredients: [{ id: "i1", amount: "200", unit: "g", name: "pasta", prep: "dry" }],
  steps: [{ id: "s1", action: "Boil pasta", duration: "10 minutes", heat: "boiling", cue: "tender" }],
  scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
};

test("content pack provides US-first editable creator assets and an honest rights checklist", () => {
  const pack = buildCreatorContentPack(base, DEFAULT_CREATOR_PROFILE);
  assert.match(pack, /US-FIRST CONTENT PACK/);
  assert.match(pack, /TITLE OPTIONS/);
  assert.match(pack, /SHORT-FORM HOOK OPTIONS/);
  assert.match(pack, /LONG-FORM VIDEO OUTLINE/);
  assert.match(pack, /INGREDIENT CARD/);
  assert.match(pack, /THUMBNAIL STORYBOARD/);
  assert.match(pack, /ALT-TEXT DRAFT/);
  assert.match(pack, /RIGHTS \/ DISCLOSURE CHECKLIST/);
  assert.match(pack, /No content is posted automatically/);
  assert.match(pack, /US customary/);
});

test("content pack preserves source provenance and clearly separates checked notes from verification", () => {
  const pack = buildCreatorContentPack(base, DEFAULT_CREATOR_PROFILE);
  assert.match(pack, /https:\/\/example\.com\/tomato-pasta/);
  assert.match(pack, /Cooking time not independently confirmed/);
  assert.match(pack, /do not prove that a source independently verifies/);
  assert.match(pack, /Owner review required/);
});

test("content pack does not invent nutrition values or label an untested recipe as tested", () => {
  const pack = buildCreatorContentPack(base, DEFAULT_CREATOR_PROFILE);
  assert.match(pack, /UNTESTED/);
  assert.match(pack, /Not approved by the creator/);
  assert.match(pack, /Not included: complete, source-linked values/);
  assert.doesNotMatch(pack, /guaranteed viral/i);
});

test("nutrition remains explicitly a manual-entry estimate when all required fields exist", () => {
  const project: RecipeProject = {
    ...base,
    servings: "2 people",
    ingredients: [{
      ...base.ingredients[0],
      nutritionCalories: "700",
      nutritionProteinG: "20",
      nutritionCarbsG: "140",
      nutritionFatG: "8",
      nutritionBasis: "Exact 200 g dry pasta quantity",
      nutritionSourceUrl: "https://fdc.nal.usda.gov/",
    }],
  };
  const pack = buildCreatorContentPack(project, DEFAULT_CREATOR_PROFILE);
  assert.match(pack, /Manual-entry estimate: 350 kcal per serving/);
  assert.match(pack, /not independently verified/);
  assert.match(pack, /https:\/\/fdc\.nal\.usda\.gov/);
});
