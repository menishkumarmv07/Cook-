import test from "node:test";
import assert from "node:assert/strict";
import { getRecipeTrustAssessment } from "../lib/recipe-trust";
import { getLocalDateOnly, SCENE_TEMPLATE, type RecipeProject } from "../lib/recipe";

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
  trialDate: "",
  trialChanges: "",
  trialNotes: "",
  trialPhotoDataUrl: "",
  recipeRevision: 0,
  trialPhotoRevision: -1,
  trialNotesRevision: -1,
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

test("tested and approved stages require dated current-version trial proof and the review gate", () => {
  const project = readyProject();
  project.trialDate = getLocalDateOnly();
  project.trialChanges = "No changes; followed the recorded recipe.";
  project.trialPhotoDataUrl = "data:image/jpeg;base64,cGhvdG8=";
  project.trialPhotoRevision = project.recipeRevision;
  project.trialRating = "5";
  project.trialNotes = "I cooked this and checked the texture carefully.";
  project.trialNotesRevision = project.recipeRevision;
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

test("trial date, what-changed note, photo, rating and revision-matched notes are required", () => {
  const project = readyProject();
  project.evidenceReviewedAt = now;
  project.trialPhotoDataUrl = "data:image/jpeg;base64,cGhvdG8=";
  project.trialPhotoRevision = project.recipeRevision;
  project.trialNotes = "Looks good to me after cooking.";
  project.trialNotesRevision = project.recipeRevision;
  let assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.canMarkTested, false);
  assert.match(assessment.trialRecordBlockers.join(" "), /actual cooking-trial date/);
  assert.match(assessment.trialRecordBlockers.join(" "), /what changed/);
  assert.match(assessment.trialRecordBlockers.join(" "), /rating/);

  project.trialDate = getLocalDateOnly();
  project.trialChanges = "No changes; followed the recipe.";
  project.trialRating = "5";
  assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.canMarkTested, true);
});

test("future-dated or stale trial evidence cannot advance the lifecycle", () => {
  const project = readyProject();
  project.trialDate = getLocalDateOnly(new Date(Date.now() + 24 * 60 * 60 * 1000));
  project.trialChanges = "Followed the recipe as written.";
  project.trialPhotoDataUrl = "data:image/jpeg;base64,cGhvdG8=";
  project.trialPhotoRevision = project.recipeRevision;
  project.trialRating = "4";
  project.trialNotes = "Cooked the recipe and checked the result.";
  project.trialNotesRevision = project.recipeRevision;
  let assessment = getRecipeTrustAssessment(project);
  assert.match(assessment.trialRecordBlockers.join(" "), /future date/);
  assert.equal(assessment.canMarkTested, false);

  project.trialDate = getLocalDateOnly();
  project.trialPhotoRevision = project.recipeRevision - 1;
  project.trialNotesRevision = project.recipeRevision - 1;
  assessment = getRecipeTrustAssessment(project);
  assert.match(assessment.trialRecordBlockers.join(" "), /earlier recipe version/);
  assert.equal(assessment.canMarkTested, false);
});

test("recipe evidence review rejects local/private/reserved URLs and nonstandard ports", () => {
  const unsafeUrls = [
    "http://localhost/recipe",
    "http://127.0.0.1/recipe",
    "http://192.168.1.12/recipe",
    "https://recipes.example/recipe",
    "https://recipes.com:8443/recipe",
    "http://router.lan/recipe",
  ];
  for (const url of unsafeUrls) {
    const project = readyProject();
    project.sourceReferences[0].url = url;
    const assessment = getRecipeTrustAssessment(project);
    assert.equal(assessment.canMarkEvidenceReviewed, false, url);
    assert.match(assessment.evidenceReviewBlockers.join(" "), /valid HTTP\(S\) source URL/i, url);
  }
});

test("an approval timestamp earlier than the current evidence review is stale", () => {
  const project = readyProject();
  project.trialDate = getLocalDateOnly();
  project.trialChanges = "Followed the reviewed recipe as written.";
  project.trialPhotoDataUrl = "data:image/jpeg;base64,cGhvdG8=";
  project.trialPhotoRevision = project.recipeRevision;
  project.trialRating = "5";
  project.trialNotes = "I cooked this recipe and checked its texture.";
  project.trialNotesRevision = project.recipeRevision;
  project.trialStatus = "tested";
  project.approved = true;
  project.approvedAt = "2026-10-19T00:00:00.000Z";
  const assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.testedByOwner, true);
  assert.equal(assessment.canShare, false);
  assert.notEqual(assessment.stageId, "approved");
});

test("future evidence-review and approval timestamps cannot unlock sharing", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const project = readyProject();
  project.evidenceReviewedAt = future;
  project.trialDate = getLocalDateOnly();
  project.trialChanges = "Followed the reviewed recipe as written.";
  project.trialPhotoDataUrl = "data:image/jpeg;base64,cGhvdG8=";
  project.trialPhotoRevision = project.recipeRevision;
  project.trialRating = "5";
  project.trialNotes = "I cooked this recipe and checked the texture.";
  project.trialNotesRevision = project.recipeRevision;
  project.trialStatus = "tested";
  project.approved = true;
  project.approvedAt = future;
  const assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.evidenceReviewed, false);
  assert.equal(assessment.testedByOwner, false);
  assert.equal(assessment.canShare, false);
  assert.equal(assessment.stageId, "draft");
});

test("an unsafe primary recipe URL cannot be hidden by adding safe references", () => {
  const project = readyProject();
  project.url = "http://127.0.0.1/private-recipe";
  const assessment = getRecipeTrustAssessment(project);
  assert.equal(assessment.canMarkEvidenceReviewed, false);
  assert.match(assessment.evidenceReviewBlockers.join(" "), /primary source URL must be a safe public HTTP\(S\) URL/i);

  project.url = "";
  const withoutPrimaryUrl = getRecipeTrustAssessment(project);
  assert.equal(withoutPrimaryUrl.canMarkEvidenceReviewed, true);
});

