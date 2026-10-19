import test from "node:test";
import assert from "node:assert/strict";
import { getRecipeTrustAssessment } from "../lib/recipe-trust";
import { SCENE_TEMPLATE, type RecipeProject } from "../lib/recipe";

const now = "2026-10-20T00:00:00.000Z";
const goodSource = {
  id: "source-1",
  url: "https://example.com/recipe",
  kind: "recipe-page" as const,
  checked: "Ingredient list, method order and safety notes checked",
  notes: "Cooking time is not stated; confirm in trial",
  ingredientFindings: "One cup rice",
  methodFindings: "Add rice after warming the pan",
  timingFindings: "Exact cooking time is not stated",
  safetyStorageFindings: "Storage is not stated; check authoritative guidance separately",
};
const readyProject = (): RecipeProject => ({
  id: 1,
  trialStatus: "untested",
  trialRating: "",
  trialNotes: "",
  trialPhotoDataUrl: "",
  evidenceReviewedAt: now,
  approved: false,
  approvedAt: "",
  name: "Lemon rice",
  url: goodSource.url,
  notes: "",
  sourceEvidence: "",
  sourceReferences: [{ ...goodSource }],
  servings: "2 servings",
  ingredients: [{ id: "rice", amount: "1", unit: "cup", name: "cooked rice", prep: "" }],
  steps: [{ id: "step-1", action: "Warm rice in a pan", duration: "3 minutes", heat: "medium", cue: "steaming hot", ingredientIds: ["rice"] }],
  scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
});

test("legacy draft stays a draft and source review cannot be skipped", () => {
  const project = readyProject();
  project.evidenceReviewedAt = "";
  const assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.stageId, "draft");
  assert.equal(assessment.canMarkEvidenceReviewed, true);
  assert.equal(assessment.canMarkTested, false);
  assert.equal(assessment.canApprove, false);
  assert.equal(assessment.canShare, false);
});

test("evidence review requires each source comparison category and a valid URL", () => {
  const project = readyProject();
  project.sourceReferences[0].timingFindings = "";
  let assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.canMarkEvidenceReviewed, false);
  assert.ok(assessment.evidenceReviewBlockers.some((blocker) => /timing and heat information/i.test(blocker)));

  project.sourceReferences[0].timingFindings = "No timing stated";
  project.sourceReferences[0].url = "javascript:alert(1)";
  assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.canMarkEvidenceReviewed, false);
  assert.match(assessment.evidenceReviewBlockers.join(" "), /valid HTTP/);
});

test("recipe cannot be ready for trial with missing quantities, method details or mappings", () => {
  const project = readyProject();
  project.evidenceReviewedAt = now;
  project.ingredients[0].amount = "";
  project.steps[0].ingredientIds = [];
  const assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.stageId, "evidence-reviewed");
  assert.equal(assessment.canMarkTested, false);
  assert.match(assessment.trialReadinessBlockers.join(" "), /quantity/);
  assert.match(assessment.trialReadinessBlockers.join(" "), /Assign each ingredient/);
});

test("tested and approved stages require real trial fields plus the recipe review gate", () => {
  const project = readyProject();
  project.trialPhotoDataUrl = "data:image/jpeg;base64,cGhvdG8=";
  project.trialRating = "5";
  project.trialNotes = "I cooked this and checked the texture.";
  project.trialStatus = "tested";
  project.approved = true;
  project.approvedAt = now;
  let assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.stageId, "approved");
  assert.equal(assessment.canShare, true);

  project.evidenceReviewedAt = "";
  assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.stageId, "draft");
  assert.equal(assessment.canShare, false);
});

test("trial notes, photo and rating are required and the app cannot infer them", () => {
  const project = readyProject();
  project.evidenceReviewedAt = now;
  project.trialPhotoDataUrl = "data:image/jpeg;base64,cGhvdG8=";
  project.trialNotes = "Looks good to me";
  let assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.trialRecordBlockers.length, 1);
  assert.equal(assessment.canMarkTested, false);
  project.trialRating = "5";
  assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.canMarkTested, true);
});
