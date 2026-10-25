export const V3_CREATOR_READINESS_SCHEMA_VERSION = 1 as const;

export const V3_CREATOR_PLATFORMS = [
  "youtube-shorts",
  "instagram-reels",
  "tiktok",
] as const;

export type V3CreatorPlatform = (typeof V3_CREATOR_PLATFORMS)[number];

export const V3_CREATOR_MEDIA_ORIGINS = [
  "owner-footage-only",
  "ai-generated-or-altered",
  "mixed",
  "uncertain",
] as const;

export type V3CreatorMediaOrigin = (typeof V3_CREATOR_MEDIA_ORIGINS)[number];

export const V3_CREATOR_REVIEW_CHECKS = [
  { key: "recipeFactsReviewed", label: "I checked every instruction, amount, timing and food claim against the current recipe/evidence." },
  { key: "foodSafetyReviewed", label: "I checked food-safety, allergen and cross-contact notes for this recipe." },
  { key: "assetRightsReviewed", label: "I checked permission/rights for every clip, image, voice and sound used." },
  { key: "originalityReviewed", label: "I checked that this piece has recipe-specific value and is not just repetitive template output." },
  { key: "platformDisclosureReviewed", label: "I checked the target platform's current synthetic-media/disclosure rules and will add any required label manually." },
] as const;

export type V3CreatorReviewCheckKey = (typeof V3_CREATOR_REVIEW_CHECKS)[number]["key"];

export type V3CreatorReadiness = {
  schemaVersion: typeof V3_CREATOR_READINESS_SCHEMA_VERSION;
  platform: V3CreatorPlatform;
  title: string;
  caption: string;
  callToAction: string;
  hashtags: string;
  mediaOrigin: V3CreatorMediaOrigin;
  checks: Record<V3CreatorReviewCheckKey, boolean>;
  notes: string;
};

const MAX_TITLE_LENGTH = 100;
const MAX_CAPTION_LENGTH = 4_000;
const MAX_CTA_LENGTH = 300;
const MAX_HASHTAGS_LENGTH = 1_000;
const MAX_NOTES_LENGTH = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringWithin(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum &&
    !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

export function createEmptyV3CreatorReadiness(): V3CreatorReadiness {
  return {
    schemaVersion: V3_CREATOR_READINESS_SCHEMA_VERSION,
    platform: "youtube-shorts",
    title: "",
    caption: "",
    callToAction: "",
    hashtags: "",
    mediaOrigin: "uncertain",
    checks: {
      recipeFactsReviewed: false,
      foodSafetyReviewed: false,
      assetRightsReviewed: false,
      originalityReviewed: false,
      platformDisclosureReviewed: false,
    },
    notes: "",
  };
}

export function validateV3CreatorReadiness(value: unknown): value is V3CreatorReadiness {
  if (!isRecord(value) ||
      value.schemaVersion !== V3_CREATOR_READINESS_SCHEMA_VERSION ||
      !V3_CREATOR_PLATFORMS.includes(value.platform as V3CreatorPlatform) ||
      !V3_CREATOR_MEDIA_ORIGINS.includes(value.mediaOrigin as V3CreatorMediaOrigin) ||
      !isStringWithin(value.title, MAX_TITLE_LENGTH) ||
      !isStringWithin(value.caption, MAX_CAPTION_LENGTH) ||
      !isStringWithin(value.callToAction, MAX_CTA_LENGTH) ||
      !isStringWithin(value.hashtags, MAX_HASHTAGS_LENGTH) ||
      !isStringWithin(value.notes, MAX_NOTES_LENGTH) ||
      !isRecord(value.checks)) {
    return false;
  }
  const checks = value.checks;
  if (!isRecord(checks)) return false;
  return V3_CREATOR_REVIEW_CHECKS.every((item) => typeof checks[item.key] === "boolean");
}

/**
 * Older local V3 projects receive an explicit, incomplete checklist. It must
 * never inherit approval merely because the project predates this schema.
 */
export function normalizeV3CreatorReadiness(
  value: unknown,
): { readiness: V3CreatorReadiness; migrated: boolean } | null {
  if (value === undefined) {
    return { readiness: createEmptyV3CreatorReadiness(), migrated: true };
  }
  if (!validateV3CreatorReadiness(value)) return null;
  return { readiness: value, migrated: false };
}

export function getV3CreatorReadinessIssues(readiness: V3CreatorReadiness): string[] {
  const issues: string[] = [];
  if (!readiness.title.trim()) issues.push("Add a distinct, recipe-specific title or hook (maximum 100 characters).");
  if (!readiness.caption.trim()) issues.push("Add and review the target platform's caption/description.");
  if (!readiness.callToAction.trim()) issues.push("Add a clear, honest call to action.");
  if (readiness.mediaOrigin === "uncertain") {
    issues.push("Confirm the media origin: owner footage, realistic AI-generated/altered media, or a mixture. Do not guess.");
  }
  for (const item of V3_CREATOR_REVIEW_CHECKS) {
    if (!readiness.checks[item.key]) issues.push(item.label);
  }
  if (readiness.mediaOrigin === "ai-generated-or-altered" || readiness.mediaOrigin === "mixed") {
    issues.push("Before publishing, confirm the applicable AI/synthetic-media label in the platform's own upload flow; this app does not apply that label automatically.");
  }
  return Array.from(new Set(issues));
}

export function isV3CreatorReadinessChecklistComplete(readiness: V3CreatorReadiness): boolean {
  return getV3CreatorReadinessIssues(readiness).length === 0;
}
