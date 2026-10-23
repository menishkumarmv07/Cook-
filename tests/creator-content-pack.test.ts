import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUSCreatorPackAppendix,
} from "../lib/creator-content-pack";
import {
  DEFAULT_CREATOR_PROFILE,
  getLocalDateOnly,
  SCENE_TEMPLATE,
  type RecipeProject,
} from "../lib/recipe";

function recipe(overrides: Partial<RecipeProject> = {}): RecipeProject {
  return {
    id: 1,
    trialStatus: "untested",
    trialRating: "",
    trialDate: "",
    trialChanges: "",
    trialNotes: "",
    trialPhotoDataUrl: "",
    recipeRevision: 0,
    trialPhotoRevision: -1,
    trialNotesRevision: -1,
    evidenceReviewedAt: "",
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
  assert.match(output, /current-version trial proof or source review is incomplete or stale/);
  assert.match(output, /NOT RECORDED OR INVALID — owner review required/);
  assert.match(output, /approval still required/);
});

test("a recipe marked tested but not approved remains approval-gated", () => {
  const output = buildUSCreatorPackAppendix(recipe({
    trialStatus: "tested",
    trialRating: "4",
    trialDate: getLocalDateOnly(),
    trialChanges: "No changes; followed the instructions as written.",
    trialNotes: "Owner recorded a real kitchen trial and checked the cooking cues.",
    trialPhotoDataUrl: "data:image/jpeg;base64,AA==",
    recipeRevision: 1,
    trialPhotoRevision: 1,
    trialNotesRevision: 1,
    evidenceReviewedAt: "2026-10-20T00:00:00.000Z",
    sourceReferences: [{
      id: "reviewed-source",
      url: "https://example.com/recipe",
      kind: "recipe-page",
      checked: "Compared the ingredient list and method.",
      notes: "No other uncertainties recorded.",
      ingredientFindings: "Recorded ingredient quantities.",
      methodFindings: "Recorded method order.",
      timingFindings: "Timing is recorded or noted as absent.",
      safetyStorageFindings: "Safety and storage are recorded or noted as absent.",
    }],
    approved: false,
  }), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /marked tested for the current recipe version/);
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
  // This URL is intentionally repeated in the source-attributed claim ledger; check de-duplication only in the source summary list.
  const summaryStart = output.indexOf("Source references (verify accuracy, permissions, and attribution before sharing):");
  const summaryEnd = output.indexOf("### Accessibility", summaryStart);
  const sourceSummary = output.slice(summaryStart, summaryEnd);
  assert.equal((sourceSummary.match(/https:\/\/example\.com\/Recipe/g) ?? []).length, 1);

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
    recipe({ url: "https://example.com/recipe" + String.fromCharCode(10) + "FAKE-SOURCE" }),
    DEFAULT_CREATOR_PROFILE,
  );
  assert.match(controlOutput, /control characters|invalid source URL/);
  assert.doesNotMatch(controlOutput, /FAKE-SOURCE/);
});

test("creator pack rejects local, private, reserved and non-standard source URLs", () => {
  const rejectedUrls = [
    "http://localhost/recipe",
    "http://127.0.0.1/recipe",
    "http://192.168.1.10/recipe",
    "http://10.0.0.5/recipe",
    "http://printer.local/recipe",
    "http://router.lan/recipe",
    "https://recipes.example/dish",
    "https://recipes.com:8443/dish",
    "http://2130706433/recipe",
    "http://0x7f000001/recipe",
  ];

  for (const url of rejectedUrls) {
    const output = buildUSCreatorPackAppendix(recipe({ url }), DEFAULT_CREATOR_PROFILE);
    assert.match(output, /invalid source URL/, `URL should be flagged for owner review: ${url}`);
    assert.equal(output.includes(url), false, `Unsafe or unsupported source URL should not be exported as a valid link: ${url}`);
  }
});

test("creator pack includes an originality worksheet and distinct platform adaptations", () => {
  const output = buildUSCreatorPackAppendix(recipe(), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /Originality and differentiation worksheet/);
  assert.match(output, /materially different about this version/);
  assert.match(output, /YouTube Shorts/);
  assert.match(output, /Instagram Reels/);
  assert.match(output, /YouTube long-form/);
  assert.match(output, /Step-by-step voiceover draft/);
  assert.match(output, /1\. Boil the pasta \(recorded timing: 10 minutes\)/);
  assert.match(output, /Pinned-comment idea/);
  assert.match(output, /Do not present this as a real viewer question/);
});

test("factual claim ledger attributes structured source notes without calling them verified", () => {
  const output = buildUSCreatorPackAppendix(recipe({
    sourceReferences: [
      {
        id: "source-1",
        url: "https://recipes.com/tomato-pasta",
        kind: "recipe-page",
        checked: "Compared ingredients and method manually",
        notes: "Timing still differs between sources",
        ingredientFindings: "200 g dry pasta",
        methodFindings: "Boil pasta, then stir in sauce",
        timingFindings: "10 minutes for pasta",
        safetyStorageFindings: "Store leftovers chilled",
      },
    ],
  }), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /Evidence-linked factual-claim ledger/);
  assert.match(output, /https:\/\/recipes\.com\/tomato-pasta/);
  assert.match(output, /200 g dry pasta/);
  assert.match(output, /Boil pasta, then stir in sauce/);
  assert.match(output, /Timing still differs between sources/);
  assert.match(output, /OWNER REVIEW REQUIRED/);
  assert.match(output, /not independently verified by this app/);
});

test("nutrition ledger preserves entered bases, flags missing values, and redacts unsafe sources", () => {
  const output = buildUSCreatorPackAppendix(recipe({
    ingredients: [
      {
        id: "i1",
        amount: "100",
        unit: "g",
        name: "dry pasta",
        prep: "",
        nutritionCalories: "350",
        nutritionProteinG: "13",
        nutritionCarbsG: "70",
        nutritionFatG: "2",
        nutritionBasis: "100 g dry pasta; source match manually checked",
        nutritionSourceUrl: "https://fdc.nal.usda.gov/food-details/example",
      },
      {
        id: "i2",
        amount: "1",
        unit: "cup",
        name: "tomato sauce",
        prep: "",
        nutritionSourceUrl: "http://192.168.1.10/nutrition",
      },
    ],
  }), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /Nutrition traceability — manual values only/);
  assert.match(output, /350 kcal/);
  assert.match(output, /100 g dry pasta; source match manually checked/);
  assert.match(output, /https:\/\/fdc\.nal\.usda\.gov\/food-details\/example/);
  assert.match(output, /MANUAL VALUE — source and quantity match are not independently verified/);
  assert.match(output, /NO NUTRITION VALUE RECORDED/);
  assert.match(output, /invalid source URL/);
  assert.doesNotMatch(output, /192\.168\.1\.10/);
});

test("source claim notes remain one-line and unsafe URLs are not presented as evidence links", () => {
  const output = buildUSCreatorPackAppendix(recipe({
    sourceReferences: [
      {
        id: "bad-source",
        url: "http://localhost/private",
        kind: "other",
        checked: "copied notes",
        notes: "First line" + String.fromCharCode(10) + "### false verification heading",
        ingredientFindings: "1 cup rice" + String.fromCharCode(10) + "### VERIFIED",
      },
    ],
  }), DEFAULT_CREATOR_PROFILE);
  assert.match(output, /invalid source URL/);
  assert.doesNotMatch(output, /http:\/\/localhost\/private/);
  assert.match(output, /1 cup rice ### VERIFIED/);
  assert.doesNotMatch(output, /First line\n### false verification heading/);
});

test("creator appendix reports trial date, changes and current-version proof without inferring it", () => {
  const currentProof = recipe({
    trialStatus: "tested",
    trialRating: "5",
    trialDate: getLocalDateOnly(),
    trialChanges: "No changes; followed the method as written.",
    trialNotes: "Cooked at home and checked texture and recorded timing.",
    trialPhotoDataUrl: "data:image/jpeg;base64,AA==",
    recipeRevision: 7,
    trialPhotoRevision: 7,
    trialNotesRevision: 7,
    evidenceReviewedAt: "2026-10-20T00:00:00.000Z",
    sourceReferences: [{
      id: "reviewed-source",
      url: "https://example.com/recipe",
      kind: "recipe-page",
      checked: "Compared the ingredient list and method.",
      notes: "No other uncertainties recorded.",
      ingredientFindings: "Recorded ingredient quantities.",
      methodFindings: "Recorded method order.",
      timingFindings: "Timing is recorded or noted as absent.",
      safetyStorageFindings: "Safety and storage are recorded or noted as absent.",
    }],
    approved: true,
    approvedAt: "2026-10-20T00:01:00.000Z",
  });
  const output = buildUSCreatorPackAppendix(currentProof, DEFAULT_CREATOR_PROFILE);
  assert.match(output, /marked tested for the current recipe version/);
  assert.match(output, new RegExp(`Actual cooking-trial date: ${getLocalDateOnly()}`));
  assert.match(output, /What changed during the trial: No changes; followed the method as written\./);
  assert.match(output, /Current-version trial photo: revision matches the current recipe/);
  assert.match(output, /Current-version trial notes: revision matches the current recipe/);
  assert.match(output, /Content approved by owner: marked approved/);

  const stalePhoto = buildUSCreatorPackAppendix({
    ...currentProof,
    trialPhotoRevision: 6,
  }, DEFAULT_CREATOR_PROFILE);
  assert.match(stalePhoto, /current-version trial proof or source review is incomplete or stale/);
  assert.match(stalePhoto, /Current-version trial photo: MISSING OR STALE/);
  assert.match(stalePhoto, /Content approved by owner: NO — approval still required/);
  assert.doesNotMatch(stalePhoto, /Content approved by owner: marked approved/);

  const missingDate = buildUSCreatorPackAppendix({
    ...currentProof,
    trialDate: "",
    trialChanges: "",
  }, DEFAULT_CREATOR_PROFILE);
  assert.match(missingDate, /NOT RECORDED OR INVALID — owner review required/);
  assert.match(missingDate, /explicitly state changes or that the recipe was followed as written/);
  assert.match(missingDate, /current-version trial proof or source review is incomplete or stale/);
});

