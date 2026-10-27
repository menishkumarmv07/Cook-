export const V3_CONTINUITY_SCHEMA_VERSION = 1 as const;
export const MAX_V3_REFERENCE_BYTES = 10 * 1024 * 1024;
export const V3_REFERENCE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type V3ReferenceRole =
  | "chef-identity"
  | "chef-wardrobe"
  | "kitchen-wide"
  | "kitchen-detail"
  | "cookware-prop"
  | "finished-dish";

export type V3ReferenceReviewState = "not-reviewed" | "approved" | "rejected";
export type V3VisualReviewState = "not-tested" | "pass" | "fail";

export type V3ContinuityReference = {
  id: string;
  role: V3ReferenceRole;
  label: string;
  ownerConfirmedDetails: string;
  originalFileName: string;
  mimeType: (typeof V3_REFERENCE_IMAGE_MIME_TYPES)[number];
  byteSize: number;
  sha256: string;
  width: number;
  height: number;
  importedAt: string;
  reviewState: V3ReferenceReviewState;
};

export type V3ContinuityBible = {
  schemaVersion: typeof V3_CONTINUITY_SCHEMA_VERSION;
  version: number;
  referenceIds: string[];
  ownerConfirmedAppearanceNotes: string;
  ownerConfirmedKitchenNotes: string;
  allowedVariations: string;
  reviewChecklist: {
    chefIdentity: V3VisualReviewState;
    wardrobe: V3VisualReviewState;
    kitchenLayout: V3VisualReviewState;
    lightingAndProps: V3VisualReviewState;
    cookingAction: V3VisualReviewState;
    ingredientAndFoodState: V3VisualReviewState;
    temporalMotion: V3VisualReviewState;
    audioAndCaptions: V3VisualReviewState;
  };
  visualRealismStatus: V3VisualReviewState;
  lastReviewedClipIds: string[];
  notes: string[];
};

const REFERENCE_ROLES: readonly V3ReferenceRole[] = [
  "chef-identity",
  "chef-wardrobe",
  "kitchen-wide",
  "kitchen-detail",
  "cookware-prop",
  "finished-dish",
];

/** Require both approved chef identity and kitchen references before a realism PASS. */
export function hasRequiredV3ContinuityReferenceRoles(
  roles: readonly V3ReferenceRole[],
): boolean {
  const roleSet = new Set(roles);
  return roleSet.has("chef-identity") &&
    (roleSet.has("kitchen-wide") || roleSet.has("kitchen-detail"));
}
const REVIEW_STATES: readonly V3ReferenceReviewState[] = ["not-reviewed", "approved", "rejected"];
const VISUAL_REVIEW_STATES: readonly V3VisualReviewState[] = ["not-tested", "pass", "fail"];
const CHECKLIST_KEYS = [
  "chefIdentity",
  "wardrobe",
  "kitchenLayout",
  "lightingAndProps",
  "cookingAction",
  "ingredientAndFoodState",
  "temporalMotion",
  "audioAndCaptions",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

export function createEmptyV3ContinuityBible(): V3ContinuityBible {
  return {
    schemaVersion: V3_CONTINUITY_SCHEMA_VERSION,
    version: 1,
    referenceIds: [],
    ownerConfirmedAppearanceNotes: "",
    ownerConfirmedKitchenNotes: "",
    allowedVariations: "",
    reviewChecklist: {
      chefIdentity: "not-tested",
      wardrobe: "not-tested",
      kitchenLayout: "not-tested",
      lightingAndProps: "not-tested",
      cookingAction: "not-tested",
      ingredientAndFoodState: "not-tested",
      temporalMotion: "not-tested",
      audioAndCaptions: "not-tested",
    },
    visualRealismStatus: "not-tested",
    lastReviewedClipIds: [],
    notes: [
      "Original owner reference images have not yet been imported into this local Bible.",
      "Visual realism remains NOT TESTED until actual generated or owner-supplied video clips are reviewed against the approved references.",
      "Only owner-confirmed details belong in appearance and kitchen notes; do not infer unconfirmed attributes.",
    ],
  };
}

/**
 * Create an editable starting visual Bible from the owner's chosen style references.
 * This adds text guidance only: it does not import any private image bytes or certify realism.
 * Keep the character clearly fictional rather than reproducing a real actor's identity or voice.
 */
export function createStarterV3ContinuityBible(): V3ContinuityBible {
  const empty = createEmptyV3ContinuityBible();
  return {
    ...empty,
    ownerConfirmedAppearanceNotes: [
      "Owner-selected wardrobe and silhouette: adult male chef with tousled light-brown/wavy hair and aviator-style sunglasses.",
      "White chef shirt with rolled sleeves; black apron with dark-brown leather straps; black trousers and black shoes.",
      "Keep the face clearly original and distinguishable from any real actor or film character. Do not reproduce a real person's exact facial identity, voice, accent, cadence, mannerisms or performance.",
      "Use an original voice or owner-recorded narration; do not imitate a real person's voice.",
    ].join(" "),
    ownerConfirmedKitchenNotes: [
      "Warm cinematic kitchen with dark green brick backsplash, rich dark timber cabinets and ceiling, dark stone counters, and a central wooden prep island.",
      "Dark cookware and shelves, one warm pendant light, a large window with woven blinds, soft daylight and plants.",
      "Keep the kitchen layout, counter orientation, lighting direction, materials and prop placement coherent across scenes; avoid unexplained layout flips.",
    ].join(" "),
    allowedVariations: [
      "Camera angle, framing, hand position, steam, ingredient level and non-identifying expression may vary when the recipe requires it.",
      "Keep the fictional chef's face, hairstyle, wardrobe, apron straps, kitchen geometry, materials, lighting direction and recipe-specific food-state progression consistent.",
      "These are editable creative notes, not an AI-generation capability or proof that any clip is realistic. Real clips still require owner review.",
    ].join(" "),
    notes: Array.from(new Set([
      ...empty.notes,
      "Starter visual notes reflect the owner's supplied reference style and remain editable; no image bytes were auto-imported.",
      "The character must remain original and must not imitate a real actor's exact likeness, voice or acting performance.",
    ])),
  };
}

export function validateV3ContinuityReference(value: unknown): value is V3ContinuityReference {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.trim().length === 0 || value.id.length > 160) return false;
  if (typeof value.role !== "string" || !REFERENCE_ROLES.includes(value.role as V3ReferenceRole)) return false;
  if (!boundedString(value.label, 240) || !value.label.trim()) return false;
  if (!boundedString(value.ownerConfirmedDetails, 2_000)) return false;
  if (!boundedString(value.originalFileName, 240) || !value.originalFileName.trim()) return false;
  if (typeof value.mimeType !== "string" ||
    !V3_REFERENCE_IMAGE_MIME_TYPES.includes(value.mimeType as (typeof V3_REFERENCE_IMAGE_MIME_TYPES)[number])) return false;
  if (typeof value.byteSize !== "number" || !Number.isSafeInteger(value.byteSize) ||
    value.byteSize <= 0 || value.byteSize > MAX_V3_REFERENCE_BYTES) return false;
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) return false;
  if (typeof value.width !== "number" || !Number.isSafeInteger(value.width) || value.width < 1 || value.width > 20_000) return false;
  if (typeof value.height !== "number" || !Number.isSafeInteger(value.height) || value.height < 1 || value.height > 20_000) return false;
  if (!validTimestamp(value.importedAt)) return false;
  if (typeof value.reviewState !== "string" || !REVIEW_STATES.includes(value.reviewState as V3ReferenceReviewState)) return false;
  return true;
}

export function validateV3ContinuityBible(value: unknown): value is V3ContinuityBible {
  if (!isRecord(value) || value.schemaVersion !== V3_CONTINUITY_SCHEMA_VERSION) return false;
  if (typeof value.version !== "number" || !Number.isSafeInteger(value.version) || value.version < 1) return false;
  if (!Array.isArray(value.referenceIds) ||
    !value.referenceIds.every((id) => typeof id === "string" && id.length > 0) ||
    new Set(value.referenceIds).size !== value.referenceIds.length) return false;
  if (!boundedString(value.ownerConfirmedAppearanceNotes, 4_000) ||
    !boundedString(value.ownerConfirmedKitchenNotes, 4_000) ||
    !boundedString(value.allowedVariations, 4_000)) return false;
  if (!isRecord(value.reviewChecklist)) return false;
  const checklist = value.reviewChecklist;
  if (!CHECKLIST_KEYS.every((key) =>
    typeof checklist[key] === "string" &&
    VISUAL_REVIEW_STATES.includes(checklist[key] as V3VisualReviewState)
  )) return false;
  if (typeof value.visualRealismStatus !== "string" ||
    !VISUAL_REVIEW_STATES.includes(value.visualRealismStatus as V3VisualReviewState)) return false;
  if (!Array.isArray(value.lastReviewedClipIds) ||
    !value.lastReviewedClipIds.every((id) => typeof id === "string")) return false;
  if (!Array.isArray(value.notes) || !value.notes.every((note) => typeof note === "string" && note.length <= 2_000)) return false;
  return true;
}

/**
 * The Bible stores the checklist for the latest reviewed clip only. Older
 * pre-release records may have accumulated clip IDs, so only the last ID may
 * receive the saved checklist/status; earlier clips must be reviewed again.
 */
export function isLatestV3ClipReviewed(bible: V3ContinuityBible, clipId: string): boolean {
  return validateV3ContinuityBible(bible) &&
    typeof clipId === "string" &&
    clipId.length > 0 &&
    bible.lastReviewedClipIds.length > 0 &&
    bible.lastReviewedClipIds[bible.lastReviewedClipIds.length - 1] === clipId;
}

export function incrementV3ContinuityBibleVersion(
  bible: V3ContinuityBible,
  changes: Partial<Pick<V3ContinuityBible,
    "referenceIds" | "ownerConfirmedAppearanceNotes" | "ownerConfirmedKitchenNotes" | "allowedVariations"
  >>,
): V3ContinuityBible {
  if (!validateV3ContinuityBible(bible)) throw new Error("Cannot update an invalid Chef & Kitchen Bible.");
  const updated = {
    ...bible,
    ...changes,
    version: bible.version + 1,
    reviewChecklist: {
      chefIdentity: "not-tested",
      wardrobe: "not-tested",
      kitchenLayout: "not-tested",
      lightingAndProps: "not-tested",
      cookingAction: "not-tested",
      ingredientAndFoodState: "not-tested",
      temporalMotion: "not-tested",
      audioAndCaptions: "not-tested",
    } satisfies V3ContinuityBible["reviewChecklist"],
    visualRealismStatus: "not-tested" as const,
    lastReviewedClipIds: [],
    notes: Array.from(new Set([
      ...bible.notes,
      "Chef & Kitchen Bible changed. Previous visual-continuity approvals have been reset; review actual clips again.",
    ])),
  };
  if (!validateV3ContinuityBible(updated)) throw new Error("The proposed Chef & Kitchen Bible changes are invalid.");
  return updated;
}

export function reviewV3ContinuityClip(
  bible: V3ContinuityBible,
  clipId: string,
  checklist: V3ContinuityBible["reviewChecklist"],
  outcome: Exclude<V3VisualReviewState, "not-tested">,
  approvedPinnedReferenceRoles: readonly V3ReferenceRole[],
): V3ContinuityBible {
  if (!validateV3ContinuityBible(bible)) throw new Error("Cannot review clips against an invalid Chef & Kitchen Bible.");
  if (!clipId.trim() || clipId.length > 160) throw new Error("A clip ID is required for a visual review.");
  if (!CHECKLIST_KEYS.every((key) => VISUAL_REVIEW_STATES.includes(checklist[key]))) {
    throw new Error("Every visual-review checklist item must have a valid review state.");
  }
  const anyFailed = CHECKLIST_KEYS.some((key) => checklist[key] === "fail");
  const allPassed = CHECKLIST_KEYS.every((key) => checklist[key] === "pass");
  if (outcome === "pass" && !allPassed) {
    throw new Error("A clip cannot pass until every required continuity and realism check passes.");
  }
  if (outcome === "pass" && anyFailed) {
    throw new Error("A clip with a failed realism criterion cannot be approved.");
  }
  if (outcome === "pass" &&
      (bible.referenceIds.length === 0 ||
       !hasRequiredV3ContinuityReferenceRoles(approvedPinnedReferenceRoles))) {
    throw new Error("A visual realism PASS requires pinned, owner-approved references for both the chef identity and the kitchen.");
  }
  return {
    ...bible,
    reviewChecklist: { ...checklist },
    visualRealismStatus: outcome,
    lastReviewedClipIds: [clipId],
  };
}
