import { getLocalDateOnly, isValidDateOnly, isValidIsoTimestamp, isValidTrialPhotoDataUrl, type RecipeProject } from "./recipe";
import { isHttpSourceUrl } from "./research-evidence";

export type RecipeLifecycleStageId =
  | "draft"
  | "evidence-reviewed"
  | "ready-for-trial"
  | "tested-by-owner"
  | "approved";

export type RecipeLifecycleStep = {
  id: RecipeLifecycleStageId;
  label: string;
  description: string;
  complete: boolean;
  current: boolean;
};

export type RecipeTrustAssessment = {
  stageId: RecipeLifecycleStageId;
  stageLabel: string;
  stageDescription: string;
  stageIndex: number;
  steps: RecipeLifecycleStep[];
  evidenceReviewBlockers: string[];
  trialReadinessBlockers: string[];
  trialRecordBlockers: string[];
  evidenceReviewed: boolean;
  readyForTrial: boolean;
  testedByOwner: boolean;
  canMarkEvidenceReviewed: boolean;
  canMarkTested: boolean;
  canApprove: boolean;
  canShare: boolean;
};

type SourceFindingField =
  | "ingredientFindings"
  | "methodFindings"
  | "timingFindings"
  | "safetyStorageFindings";

const SOURCE_FINDINGS: Array<[SourceFindingField, string]> = [
  ["ingredientFindings", "Record what this source says about ingredients and quantities, or note that the detail is absent."],
  ["methodFindings", "Record what this source says about cooking method and step order, or note that it is absent."],
  ["timingFindings", "Record the timing and heat information checked, or state that it is not provided."],
  ["safetyStorageFindings", "Record the food-safety and storage guidance checked, or state that it is not provided."],
];

const LIFECYCLE: Array<{ id: RecipeLifecycleStageId; label: string; description: string }> = [
  { id: "draft", label: "Draft", description: "Capture the recipe and its original sources; missing facts stay visible." },
  { id: "evidence-reviewed", label: "Evidence reviewed", description: "You documented what each source actually states and what remains uncertain." },
  { id: "ready-for-trial", label: "Ready for cooking trial", description: "Required quantities, ordered steps, timings, heat/cues and ingredient mappings are recorded." },
  { id: "tested-by-owner", label: "Tested by owner", description: "A real cooking-trial photo, rating and useful notes are saved by the owner." },
  { id: "approved", label: "Approved", description: "The owner approved this specific tested version for manual sharing." },
];

function hasValidTimestamp(value: string | undefined): boolean {
  return typeof value === "string" &&
    isValidIsoTimestamp(value) &&
    Date.parse(value) <= Date.now();
}

function getEvidenceReviewBlockers(project: RecipeProject): string[] {
  const blockers: string[] = [];
  if (project.sourceReferences.length === 0) {
    blockers.push("Add at least one structured source reference; typing a URL alone is not a source review.");
    return blockers;
  }

  project.sourceReferences.forEach((source, index) => {
    const label = `Reference ${index + 1}`;
    if (!source.url.trim() || !isHttpSourceUrl(source.url)) {
      blockers.push(`${label}: enter a valid HTTP(S) source URL.`);
    }
    if (!source.checked.trim()) blockers.push(`${label}: record what you actually checked.`);
    for (const [field, message] of SOURCE_FINDINGS) {
      const value = source[field];
      if (typeof value !== "string" || !value.trim()) blockers.push(`${label}: ${message}`);
    }
  });
  return blockers;
}

function getTrialReadinessBlockers(project: RecipeProject): string[] {
  const blockers: string[] = [];
  if (!project.name.trim()) blockers.push("Add a recipe name.");
  const servingsMatch = project.servings.match(/^\s*(\d+(?:\.\d+)?)\s*(?:servings?|people|persons?|portions?)?\s*$/i);
  if (!servingsMatch || !Number.isFinite(Number(servingsMatch[1])) || Number(servingsMatch[1]) <= 0) {
    blockers.push("Record one clear positive serving/yield count, such as 4 or 4 servings.");
  }
  if (project.ingredients.length === 0) {
    blockers.push("Add the complete ingredient list.");
  } else {
    project.ingredients.forEach((ingredient, index) => {
      const label = ingredient.name.trim() || `ingredient ${index + 1}`;
      if (!ingredient.name.trim()) blockers.push(`Give ${label} a name.`);
      if (!ingredient.amount.trim()) blockers.push(`Record the quantity for ${label}.`);
      if (!ingredient.unit.trim()) blockers.push(`Record a unit or explicit count basis for ${label}.`);
    });
  }
  if (project.steps.length === 0) {
    blockers.push("Add the ordered cooking steps.");
  } else {
    project.steps.forEach((step, index) => {
      const label = `Step ${index + 1}`;
      if (!step.action.trim()) blockers.push(`${label}: record the action.`);
      if (!step.duration.trim()) blockers.push(`${label}: record the timing or write that the source does not state it.`);
      if (!step.heat.trim()) blockers.push(`${label}: record the heat/setting or write that it is not provided.`);
      if (!step.cue.trim()) blockers.push(`${label}: record a visual/doneness cue or note that it needs confirmation.`);
    });
  }
  const assignedIngredientIds = new Set(project.steps.flatMap((step) => step.ingredientIds ?? []));
  if (project.ingredients.some((ingredient) => !assignedIngredientIds.has(ingredient.id))) {
    blockers.push("Assign each ingredient to the step where it is added, or to the step that explicitly confirms it is already present.");
  }
  const validIngredientIds = new Set(project.ingredients.map((ingredient) => ingredient.id));
  if (project.steps.some((step) => (step.ingredientIds ?? []).some((id) => !validIngredientIds.has(id)))) {
    blockers.push("Remove or reassign ingredient mappings that refer to missing ingredient rows.");
  }
  if (getEvidenceReviewBlockers(project).length > 0) {
    blockers.push("Complete the source comparison fields before the recipe is ready for a cooking trial.");
  }
  return blockers;
}

function getTrialRecordBlockers(project: RecipeProject): string[] {
  const blockers: string[] = [];
  if (!isValidDateOnly(project.trialDate)) {
    blockers.push("Record the actual cooking-trial date using a valid calendar date.");
  } else if (project.trialDate > getLocalDateOnly()) {
    blockers.push("A future date cannot be recorded as a completed cooking trial.");
  }
  if (project.trialChanges.trim().length < 3) {
    blockers.push("Record what changed, or explicitly state that you followed the recipe as written.");
  }
  if (!isValidTrialPhotoDataUrl(project.trialPhotoDataUrl)) {
    blockers.push("Save a photo of the dish you actually cooked.");
  }
  if (project.trialPhotoRevision !== project.recipeRevision) {
    blockers.push("The cooking-trial photo belongs to an earlier recipe version; add a fresh photo for this version.");
  }
  const rating = Number(project.trialRating);
  if (!/^[1-5]$/.test(project.trialRating) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    blockers.push("Choose a cooking-trial rating from 1 to 5.");
  }
  if (project.trialNotes.trim().length < 10) {
    blockers.push("Write at least 10 characters about what happened during the real cooking trial.");
  }
  if (project.trialNotesRevision !== project.recipeRevision) {
    blockers.push("Trial notes belong to an earlier recipe version; review and rewrite them after cooking this version.");
  }
  return blockers;
}

/** A deterministic local checklist, not independent source verification or a food-safety certification. */
export function getRecipeTrustAssessment(project: RecipeProject): RecipeTrustAssessment {
  const evidenceReviewBlockers = getEvidenceReviewBlockers(project);
  const evidenceReviewed = hasValidTimestamp(project.evidenceReviewedAt) && evidenceReviewBlockers.length === 0;
  const trialReadinessBlockers = getTrialReadinessBlockers(project);
  const readyForTrial = evidenceReviewed && trialReadinessBlockers.length === 0;
  const trialRecordBlockers = getTrialRecordBlockers(project);
  const testedByOwner = readyForTrial && project.trialStatus === "tested" && trialRecordBlockers.length === 0;
  const approvalFollowsEvidenceReview =
    hasValidTimestamp(project.evidenceReviewedAt) &&
    hasValidTimestamp(project.approvedAt) &&
    Date.parse(project.approvedAt) >= Date.parse(project.evidenceReviewedAt);
  const approved = testedByOwner && project.approved && approvalFollowsEvidenceReview;

  const stageId: RecipeLifecycleStageId = approved
    ? "approved"
    : testedByOwner
      ? "tested-by-owner"
      : readyForTrial
        ? "ready-for-trial"
        : evidenceReviewed
          ? "evidence-reviewed"
          : "draft";
  const stageIndex = LIFECYCLE.findIndex((stage) => stage.id === stageId);
  const stage = LIFECYCLE[stageIndex];

  return {
    stageId,
    stageLabel: stage.label,
    stageDescription: stage.description,
    stageIndex,
    steps: LIFECYCLE.map((item, index) => ({
      ...item,
      complete: index < stageIndex || (index === stageIndex && stageId === "approved"),
      current: index === stageIndex && stageId !== "approved",
    })),
    evidenceReviewBlockers,
    trialReadinessBlockers: evidenceReviewed ? trialReadinessBlockers : [...trialReadinessBlockers, "Record an explicit source-review timestamp before starting the trial."],
    trialRecordBlockers,
    evidenceReviewed,
    readyForTrial,
    testedByOwner,
    canMarkEvidenceReviewed: evidenceReviewBlockers.length === 0 && !evidenceReviewed,
    canMarkTested: readyForTrial && trialRecordBlockers.length === 0 && project.trialStatus !== "tested",
    canApprove: testedByOwner && !approved,
    canShare: approved,
  };
}
