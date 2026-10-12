import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTutorialDraft,
  isHttpUrl,
  isRecipeProject,
  SCENE_TEMPLATE,
  validateRecipe,
  type RecipeProject,
} from "../lib/recipe";

const project: RecipeProject = {
  id: 7,
  trialStatus: "untested",
  trialRating: "",
  trialNotes: "",
  trialPhotoDataUrl: "",
  approved: false,
  approvedAt: "",
  name: "Lemon rice",
  url: "https://example.com/recipe?source=test",
  notes: "Keep the lemon zest; don't invent missing timings.",
  sourceEvidence: "Recipe page text checked manually: ingredient list and method order.",
  sourceReferences: [],
  servings: "3",
  ingredients: [
    { id: "i1", amount: "2", unit: "cups", name: "cooked rice", prep: "cooled" },
    { id: "i2", amount: "1", unit: "tbsp", name: "lemon juice", prep: "fresh" },
  ],
  steps: [
    { id: "s1", action: "Warm the pan", duration: "1 minute", heat: "medium", cue: "Pan is warm, not smoking" },
    { id: "s2", action: "Fold in the rice", duration: "", heat: "low", cue: "Rice is evenly coated" },
  ],
  scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
};

test("URL validation trims whitespace and accepts only absolute HTTP(S) URLs", () => {
  assert.equal(isHttpUrl("  https://example.com/recipe  "), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl(""), true);
  assert.equal(isHttpUrl("   "), true);

  for (const unsafeOrMalformed of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "//example.com/recipe",
    "http://",
    "not a URL",
  ]) {
    assert.equal(isHttpUrl(unsafeOrMalformed), false, unsafeOrMalformed);
  }
});

test("validation separates blocking errors from incomplete-recipe warnings", () => {
  const issues = validateRecipe({
    ...project,
    name: "  ",
    url: "javascript:alert(1)",
  });

  assert.ok(issues.some((issue) => issue.level === "error" && issue.field === "name"));
  assert.ok(issues.some((issue) => issue.level === "error" && issue.field === "url"));
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "duration-1"));
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "source"));
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "safety"));
  assert.ok(issues.some((issue) => issue.field === "source" && /source claims have not been independently verified/i.test(issue.message)));
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "nutrition"));
});

test("tutorial export preserves ingredient and step order and marks missing timing", () => {
  const draft = buildTutorialDraft(project);

  assert.ok(draft.indexOf("2 cups cooked rice") < draft.indexOf("1 tbsp lemon juice"));
  assert.ok(draft.indexOf("Warm the pan") < draft.indexOf("Fold in the rice"));
  assert.match(draft, /Fold in the rice \(timing not provided\)/);
  assert.match(draft, /Keep the lemon zest; don't invent missing timings\./);
  assert.match(draft, /Draft — not published/);
  assert.match(draft, /## Source evidence notes/);
  assert.match(draft, /Recipe page text checked manually/);
  assert.match(draft, /Manual source evidence notes are user-provided and have not been independently verified/);
  assert.match(draft, /Food safety and nutrition have not been independently verified/);
});

test("saved-project guard rejects missing fields and malformed nested records", () => {
  assert.equal(isRecipeProject(project), true);
  assert.equal(isRecipeProject(undefined), false);
  assert.equal(isRecipeProject({ ...project, steps: [{ action: "missing id" }] }), false);
  assert.equal(isRecipeProject({ ...project, scenes: [{ title: "Only a title" }] }), false);
});


test("malformed source-reference URLs are blocking errors and duplicate references are warnings", () => {
  const issues = validateRecipe({
    ...project,
    sourceReferences: [
      { id: "a", url: "https://recipes.example/dish", kind: "recipe-page", checked: "Ingredients", notes: "" },
      { id: "b", url: "https://recipes.example/dish/", kind: "transcript", checked: "Spoken steps", notes: "" },
      { id: "c", url: "file:///private/source", kind: "other", checked: "", notes: "" },
    ],
  });
  assert.ok(issues.some((issue) => issue.level === "warning" && issue.field === "source-duplicate-1"));
  assert.ok(issues.some((issue) => issue.level === "error" && issue.field === "source-url-2"));
});

test("source reference schema rejects malformed records but accepts migrated empty lists", () => {
  assert.equal(isRecipeProject({ ...project, sourceReferences: [] }), true);
  assert.equal(isRecipeProject({ ...project, sourceReferences: [{ id: "x", url: 123, kind: "video", checked: "", notes: "" }] }), false);
});
