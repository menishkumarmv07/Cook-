import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTutorialDraft,
  isHttpUrl,
  isRecipeProject,
  parseRecipeProjectJSON,
  SCENE_TEMPLATE,
  validateRecipe,
  type RecipeProject,
} from "../lib/recipe";

const base: RecipeProject = {
  id: 1,
  name: "Tomato pasta",
  url: "",
  notes: "Keep the pasta water.",
  sourceEvidence: "",
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
  assert.match(messages, /source link has not been fetched/);
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
});
