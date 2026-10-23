import { isHttpSourceUrl } from "./research-evidence";
import { getLocalDateOnly, isValidDateOnly, isValidIsoTimestamp } from "./recipe";

export const EDITORIAL_PLATFORMS = [
  "YouTube Shorts",
  "YouTube long-form",
  "Instagram Reels",
  "TikTok",
  "Other",
] as const;

export type EditorialPlatform = (typeof EDITORIAL_PLATFORMS)[number];
export type EditorialStatus = "idea" | "researching" | "ready" | "scheduled" | "published" | "hold";
export type EditorialEvidenceKind = "hypothesis" | "dated-observation";

export type EditorialScoreInputs = {
  audienceFit: number;
  originality: number;
  evidenceReadiness: number;
  productionEffort: number;
  seasonalRelevance: number;
};

export type EditorialScoreWeights = {
  audienceFit: number;
  originality: number;
  evidenceReadiness: number;
  productionEffort: number;
  seasonalRelevance: number;
};

export type EditorialReviewChecks = {
  recipeSafetyReviewed: boolean;
  rightsReviewed: boolean;
  nutritionClaimsReviewed: boolean;
  platformDisclosureReviewed: boolean;
};

export type EditorialIdea = {
  id: string;
  title: string;
  recipeOrSeries: string;
  platform: EditorialPlatform;
  scheduledDate: string;
  audiencePromise: string;
  originalContribution: string;
  hypothesis: string;
  evidenceKind: EditorialEvidenceKind;
  sourceUrl: string;
  observedDate: string;
  observationNotes: string;
  scores: EditorialScoreInputs;
  reviewChecks: EditorialReviewChecks;
  status: EditorialStatus;
  createdAt: string;
  updatedAt: string;
  publishedUrl: string;
  outcomeNotes: string;
};

export type EditorialWorkspaceBackup = {
  format: "cooking-creator-editorial-workspace";
  version: 1;
  exportedAt: string;
  ideas: EditorialIdea[];
  weights: EditorialScoreWeights;
};

export type EditorialMergeResult = {
  ideas: EditorialIdea[];
  added: number;
  duplicates: number;
};

export const DEFAULT_EDITORIAL_WEIGHTS: EditorialScoreWeights = {
  audienceFit: 3,
  originality: 3,
  evidenceReadiness: 2,
  productionEffort: 1,
  seasonalRelevance: 1,
};

export const DEFAULT_EDITORIAL_SCORES: EditorialScoreInputs = {
  audienceFit: 3,
  originality: 3,
  evidenceReadiness: 2,
  productionEffort: 3,
  seasonalRelevance: 3,
};

export const DEFAULT_EDITORIAL_REVIEW_CHECKS: EditorialReviewChecks = {
  recipeSafetyReviewed: false,
  rightsReviewed: false,
  nutritionClaimsReviewed: false,
  platformDisclosureReviewed: false,
};

const SCORE_KEYS = ["audienceFit", "originality", "evidenceReadiness", "productionEffort", "seasonalRelevance"] as const;
const MAX_IDEAS = 2_000;
const MAX_BACKUP_CHARS = 5_000_000;
const MAX_TITLE = 180;
const MAX_TEXT = 2_000;
const STATUSES: readonly EditorialStatus[] = ["idea", "researching", "ready", "scheduled", "published", "hold"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlatform(value: unknown): value is EditorialPlatform {
  return typeof value === "string" && (EDITORIAL_PLATFORMS as readonly string[]).includes(value);
}

function boundedText(value: unknown, max: number, required: boolean): value is string {
  return typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
}

function validRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function validWeight(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10;
}

function isScores(value: unknown): value is EditorialScoreInputs {
  return isObject(value) && SCORE_KEYS.every((key) => validRating(value[key]));
}

function isWeights(value: unknown): value is EditorialScoreWeights {
  return isObject(value) && SCORE_KEYS.every((key) => validWeight(value[key])) &&
    SCORE_KEYS.some((key) => Number(value[key]) > 0);
}

function isReviewChecks(value: unknown): value is EditorialReviewChecks {
  return isObject(value) &&
    typeof value.recipeSafetyReviewed === "boolean" &&
    typeof value.rightsReviewed === "boolean" &&
    typeof value.nutritionClaimsReviewed === "boolean" &&
    typeof value.platformDisclosureReviewed === "boolean";
}

function isStatus(value: unknown): value is EditorialStatus {
  return typeof value === "string" && STATUSES.includes(value as EditorialStatus);
}

function reviewChecksComplete(checks: EditorialReviewChecks): boolean {
  return checks.recipeSafetyReviewed && checks.rightsReviewed &&
    checks.nutritionClaimsReviewed && checks.platformDisclosureReviewed;
}

export function validateEditorialIdea(value: unknown): string[] {
  if (!isObject(value)) return ["Editorial idea must be an object."];
  const errors: string[] = [];

  if (!boundedText(value.id, 160, true)) errors.push("Idea ID is required and must be at most 160 characters.");
  if (!boundedText(value.title, MAX_TITLE, true)) errors.push("Add a title (180 characters or fewer).");
  if (!boundedText(value.recipeOrSeries, 180, false)) errors.push("Recipe/series must be at most 180 characters.");
  if (!isPlatform(value.platform)) errors.push("Choose a supported platform.");
  if (!boundedText(value.audiencePromise, 500, true)) errors.push("Describe the audience benefit in 500 characters or fewer.");
  if (!boundedText(value.originalContribution, 1_000, true)) errors.push("Record the real original contribution in 1,000 characters or fewer.");
  if (!boundedText(value.hypothesis, 1_000, false)) errors.push("Hypothesis must be 1,000 characters or fewer.");
  if (value.scheduledDate !== "" && (typeof value.scheduledDate !== "string" || !isValidDateOnly(value.scheduledDate))) {
    errors.push("Scheduled date must be blank or a real YYYY-MM-DD date.");
  }
  if (!isStatus(value.status)) errors.push("Choose a supported editorial status.");
  if (value.status === "published" && typeof value.scheduledDate === "string" &&
      (!isValidDateOnly(value.scheduledDate) || value.scheduledDate > getLocalDateOnly())) {
    errors.push("A published item must have a real, non-future publication date.");
  }
  if (value.status === "scheduled" && (!isValidDateOnly(String(value.scheduledDate)) || String(value.scheduledDate) < getLocalDateOnly())) {
    errors.push("A scheduled item needs today or a future calendar date.");
  }
  if (value.evidenceKind !== "hypothesis" && value.evidenceKind !== "dated-observation") {
    errors.push("Choose whether this is a hypothesis or a dated observation.");
  }
  if (value.evidenceKind === "dated-observation") {
    if (!isHttpSourceUrl(value.sourceUrl)) errors.push("A dated observation needs a safe public HTTP(S) source URL.");
    if (typeof value.observedDate !== "string" || !isValidDateOnly(value.observedDate)) {
      errors.push("A dated observation needs a real observation date.");
    } else if (value.observedDate > getLocalDateOnly()) {
      errors.push("An observation date cannot be in the future.");
    }
    if (!boundedText(value.observationNotes, 1_000, true)) errors.push("Record what the source actually showed (1,000 characters or fewer).");
  } else {
    if (!boundedText(value.sourceUrl, 2_000, false)) errors.push("Source URL must be 2,000 characters or fewer.");
    if (!boundedText(value.observedDate, 10, false) ||
      (value.observedDate !== "" && !isValidDateOnly(value.observedDate))) errors.push("Observation date must be blank or a real YYYY-MM-DD date.");
    if (!boundedText(value.observationNotes, 1_000, false)) errors.push("Observation notes must be 1,000 characters or fewer.");
  }
  if (!isScores(value.scores)) errors.push("Every idea score must be a whole number from 1 to 5.");
  if (!isReviewChecks(value.reviewChecks)) errors.push("Review checks are malformed.");
  if (!boundedText(value.createdAt, 40, true) || !isValidIsoTimestamp(String(value.createdAt))) errors.push("Created timestamp is invalid.");
  if (!boundedText(value.updatedAt, 40, true) || !isValidIsoTimestamp(String(value.updatedAt))) errors.push("Updated timestamp is invalid.");
  if (!boundedText(value.publishedUrl, 2_000, false)) errors.push("Published URL must be 2,000 characters or fewer.");
  if (typeof value.publishedUrl === "string" && value.publishedUrl.trim() && !isHttpSourceUrl(value.publishedUrl)) {
    errors.push("Published URL must be a safe public HTTP(S) URL.");
  }
  if (!boundedText(value.outcomeNotes, MAX_TEXT, false)) errors.push("Outcome notes must be 2,000 characters or fewer.");

  const gateNeedsChecks = value.status === "ready" || value.status === "scheduled" || value.status === "published";
  if (gateNeedsChecks && isReviewChecks(value.reviewChecks) && !reviewChecksComplete(value.reviewChecks)) {
    errors.push("Before Ready/Scheduled/Published, confirm recipe-safety review, media rights, nutrition-claim review, and platform disclosures (or mark not applicable after checking).");
  }
  if (value.status === "published" && typeof value.publishedUrl === "string" && value.publishedUrl.trim() && !isHttpSourceUrl(value.publishedUrl)) {
    errors.push("Published link must be a safe public HTTP(S) URL.");
  }
  return errors;
}

export function isEditorialIdea(value: unknown): value is EditorialIdea {
  return validateEditorialIdea(value).length === 0;
}

export function validateEditorialWeights(value: unknown): string[] {
  if (!isWeights(value)) return ["Each scoring weight must be between 0 and 10, and at least one weight must be above zero."];
  return [];
}

export function scoreEditorialIdea(scores: EditorialScoreInputs, weights: EditorialScoreWeights): number {
  const weighted = (
    ((scores.audienceFit - 1) / 4) * weights.audienceFit +
    ((scores.originality - 1) / 4) * weights.originality +
    ((scores.evidenceReadiness - 1) / 4) * weights.evidenceReadiness +
    ((5 - scores.productionEffort) / 4) * weights.productionEffort +
    ((scores.seasonalRelevance - 1) / 4) * weights.seasonalRelevance
  );
  const totalWeight = SCORE_KEYS.reduce((sum, key) => sum + weights[key], 0);
  return totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0;
}

export function editorialIdeaFingerprint(idea: Pick<EditorialIdea, "title" | "recipeOrSeries" | "platform" | "scheduledDate">): string {
  return [idea.title, idea.recipeOrSeries, idea.platform, idea.scheduledDate]
    .map((part) => part.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " "))
    .join("|");
}

export function mergeEditorialIdeas(existing: EditorialIdea[], incoming: EditorialIdea[]): EditorialMergeResult {
  const ideas = [...existing];
  const fingerprints = new Set(existing.map(editorialIdeaFingerprint));
  const ids = new Set(existing.map((idea) => idea.id));
  let added = 0;
  let duplicates = 0;

  for (const candidate of incoming) {
    if (!isEditorialIdea(candidate)) {
      duplicates += 1;
      continue;
    }
    const fingerprint = editorialIdeaFingerprint(candidate);
    if (fingerprints.has(fingerprint)) {
      duplicates += 1;
      continue;
    }
    let next = candidate;
    if (ids.has(next.id)) {
      let suffix = 2;
      let nextId = `${candidate.id}-import-${suffix}`;
      while (ids.has(nextId)) {
        suffix += 1;
        nextId = `${candidate.id}-import-${suffix}`;
      }
      next = { ...candidate, id: nextId };
    }
    ids.add(next.id);
    fingerprints.add(fingerprint);
    ideas.push(next);
    added += 1;
  }
  return { ideas, added, duplicates };
}

export function createEditorialBackupJSON(
  ideas: EditorialIdea[],
  weights: EditorialScoreWeights = DEFAULT_EDITORIAL_WEIGHTS,
  exportedAt = new Date().toISOString(),
): string {
  const validIdeas = ideas.filter(isEditorialIdea);
  const safeWeights = isWeights(weights) ? weights : DEFAULT_EDITORIAL_WEIGHTS;
  return JSON.stringify({
    format: "cooking-creator-editorial-workspace",
    version: 1,
    exportedAt,
    ideas: validIdeas,
    weights: safeWeights,
  } satisfies EditorialWorkspaceBackup, null, 2);
}

export function parseEditorialBackupJSON(raw: string): EditorialWorkspaceBackup | null {
  if (raw.length > MAX_BACKUP_CHARS) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!isObject(parsed) ||
      parsed.format !== "cooking-creator-editorial-workspace" ||
      parsed.version !== 1 ||
      typeof parsed.exportedAt !== "string" ||
      !isValidIsoTimestamp(parsed.exportedAt) ||
      !Array.isArray(parsed.ideas) ||
      parsed.ideas.length > MAX_IDEAS ||
      !isWeights(parsed.weights) ||
      parsed.ideas.some((idea) => !isEditorialIdea(idea))) return null;
  const ideas = parsed.ideas as EditorialIdea[];
  if (new Set(ideas.map((idea) => idea.id)).size !== ideas.length) return null;
  if (new Set(ideas.map(editorialIdeaFingerprint)).size !== ideas.length) return null;
  return {
    format: "cooking-creator-editorial-workspace",
    version: 1,
    exportedAt: parsed.exportedAt,
    ideas,
    weights: parsed.weights,
  };
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^(?:\s*[=+@\-]|[\t\r])/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function serializeEditorialIdeasCsv(ideas: EditorialIdea[], weights: EditorialScoreWeights): string {
  const header = [
    "title", "recipe_or_series", "platform", "scheduled_date", "status", "audience_promise",
    "original_contribution", "hypothesis", "evidence_kind", "source_url", "observed_date",
    "observation_notes", "audience_fit", "originality", "evidence_readiness", "production_effort",
    "seasonal_relevance", "transparent_score_0_100", "published_url", "outcome_notes",
  ];
  const validIdeas = ideas.filter(isEditorialIdea);
  const rows = validIdeas.map((idea) => [
    idea.title, idea.recipeOrSeries, idea.platform, idea.scheduledDate, idea.status,
    idea.audiencePromise, idea.originalContribution, idea.hypothesis, idea.evidenceKind,
    idea.sourceUrl, idea.observedDate, idea.observationNotes,
    idea.scores.audienceFit, idea.scores.originality, idea.scores.evidenceReadiness,
    idea.scores.productionEffort, idea.scores.seasonalRelevance, scoreEditorialIdea(idea.scores, weights),
    idea.publishedUrl, idea.outcomeNotes,
  ].map(csvCell).join(","));
  return [header.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
