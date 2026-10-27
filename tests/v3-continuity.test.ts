import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyV3ContinuityBible,
  createStarterV3ContinuityBible,
  incrementV3ContinuityBibleVersion,
  isLatestV3ClipReviewed,
  reviewV3ContinuityClip,
  hasRequiredV3ContinuityReferenceRoles,
  validateV3ContinuityBible,
  validateV3ContinuityReference,
  MAX_V3_REFERENCE_BYTES,
  type V3ContinuityReference,
  type V3VisualReviewState,
} from "../lib/v3-continuity";

const validReference = (): V3ContinuityReference => ({
  id: "reference-1",
  role: "chef-identity",
  label: "Owner-approved chef reference",
  ownerConfirmedDetails: "Description explicitly confirmed by the owner.",
  originalFileName: "chef-reference.webp",
  mimeType: "image/webp",
  byteSize: 150_000,
  sha256: "a".repeat(64),
  width: 1200,
  height: 1800,
  importedAt: "2026-10-25T16:00:00.000Z",
  reviewState: "approved",
});

test("starter Bible captures the chosen chef and kitchen style without celebrity identity or voice imitation", () => {
  const bible = createStarterV3ContinuityBible();
  assert.equal(validateV3ContinuityBible(bible), true);
  assert.match(bible.ownerConfirmedAppearanceNotes, /aviator-style sunglasses/i);
  assert.match(bible.ownerConfirmedAppearanceNotes, /black apron with dark-brown leather straps/i);
  assert.match(bible.ownerConfirmedAppearanceNotes, /clearly original/i);
  assert.match(bible.ownerConfirmedAppearanceNotes, /do not reproduce a real person's exact facial identity/i);
  assert.match(bible.ownerConfirmedAppearanceNotes, /do not imitate a real person's voice/i);
  assert.match(bible.ownerConfirmedKitchenNotes, /dark green brick backsplash/i);
  assert.match(bible.ownerConfirmedKitchenNotes, /central wooden prep island/i);
  assert.match(bible.allowedVariations, /not a[n]? AI-generation capability/i);
  assert.equal(bible.visualRealismStatus, "not-tested");
  assert.deepEqual(bible.referenceIds, []);
  assert.ok(bible.notes.some((note) => /no image bytes were auto-imported/i.test(note)));
});

test("validates owner reference metadata and rejects invalid file facts", () => {
  assert.equal(validateV3ContinuityReference(validReference()), true);
  assert.equal(validateV3ContinuityReference({ ...validReference(), byteSize: MAX_V3_REFERENCE_BYTES + 1 }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), mimeType: "image/svg+xml" }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), sha256: "not-a-hash" }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), width: 0 }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), role: "imaginary-role" }), false);
});

test("realism review requires an approved chef identity and kitchen reference", () => {
  assert.equal(hasRequiredV3ContinuityReferenceRoles([]), false);
  assert.equal(hasRequiredV3ContinuityReferenceRoles(["chef-identity"]), false);
  assert.equal(hasRequiredV3ContinuityReferenceRoles(["kitchen-wide"]), false);
  assert.equal(hasRequiredV3ContinuityReferenceRoles(["chef-wardrobe", "kitchen-detail"]), false);
  assert.equal(hasRequiredV3ContinuityReferenceRoles(["chef-identity", "kitchen-wide"]), true);
  assert.equal(hasRequiredV3ContinuityReferenceRoles(["chef-identity", "kitchen-detail"]), true);
});

test("empty Bible starts explicitly NOT TESTED and does not invent references", () => {
  const bible = createEmptyV3ContinuityBible();
  assert.equal(validateV3ContinuityBible(bible), true);
  assert.deepEqual(bible.referenceIds, []);
  assert.equal(bible.visualRealismStatus, "not-tested");
  assert.ok(bible.notes.some((note) => /do not infer/i.test(note)));
});

test("Bible changes create a new version and reset all previous visual approvals", () => {
  const original = createEmptyV3ContinuityBible();
  const passed = {
    chefIdentity: "pass",
    wardrobe: "pass",
    kitchenLayout: "pass",
    lightingAndProps: "pass",
    cookingAction: "pass",
    ingredientAndFoodState: "pass",
    temporalMotion: "pass",
    audioAndCaptions: "pass",
  } satisfies Record<string, V3VisualReviewState>;
  const withPinnedRefs = { ...original, referenceIds: ["chef-ref", "kitchen-ref"] };
  const reviewed = reviewV3ContinuityClip(withPinnedRefs, "clip-1", passed, "pass", ["chef-identity", "kitchen-wide"]);
  assert.equal(reviewed.visualRealismStatus, "pass");
  const updated = incrementV3ContinuityBibleVersion(reviewed, {
    ownerConfirmedAppearanceNotes: "Updated by owner after checking the real reference.",
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.visualRealismStatus, "not-tested");
  assert.ok(Object.values(updated.reviewChecklist).every((state) => state === "not-tested"));
  assert.deepEqual(updated.lastReviewedClipIds, []);
  assert.equal(validateV3ContinuityBible(updated), true);
});

test("cannot mark a clip passed while any criterion is untested or failed", () => {
  const bible = createEmptyV3ContinuityBible();
  const incomplete = { ...bible.reviewChecklist, chefIdentity: "pass" as const };
  assert.throws(() => reviewV3ContinuityClip(bible, "clip-1", incomplete, "pass", ["chef-identity", "kitchen-wide"]), /every required/i);
  const failed = {
    chefIdentity: "pass",
    wardrobe: "pass",
    kitchenLayout: "pass",
    lightingAndProps: "pass",
    cookingAction: "fail",
    ingredientAndFoodState: "pass",
    temporalMotion: "pass",
    audioAndCaptions: "pass",
  } satisfies Record<string, V3VisualReviewState>;
  assert.throws(() => reviewV3ContinuityClip(bible, "clip-2", failed, "pass", ["chef-identity", "kitchen-wide"]), /every required/i);
  const recorded = reviewV3ContinuityClip(bible, "clip-2", failed, "fail", []);
  assert.equal(recorded.visualRealismStatus, "fail");
  assert.deepEqual(recorded.lastReviewedClipIds, ["clip-2"]);

  // The Bible stores only the most recent clip's checklist; a prior clip must not
  // inherit the latest clip's PASS/FAIL status because historical per-clip checklists
  // are not stored.
  const priorPass = reviewV3ContinuityClip({ ...bible, referenceIds: ["chef-ref", "kitchen-ref"] }, "clip-1", ({
    chefIdentity: "pass",
    wardrobe: "pass",
    kitchenLayout: "pass",
    lightingAndProps: "pass",
    cookingAction: "pass",
    ingredientAndFoodState: "pass",
    temporalMotion: "pass",
    audioAndCaptions: "pass",
  }), "pass", ["chef-identity", "kitchen-wide"]);
  const latestFail = reviewV3ContinuityClip(priorPass, "clip-2", failed, "fail", []);
  assert.deepEqual(latestFail.lastReviewedClipIds, ["clip-2"]);
  assert.equal(latestFail.visualRealismStatus, "fail");
});

test("only the latest clip can inherit the saved checklist in an older accumulated-ID Bible", () => {
  const bible = createEmptyV3ContinuityBible();
  const legacy = {
    ...bible,
    visualRealismStatus: "fail" as const,
    lastReviewedClipIds: ["old-clip", "latest-clip"],
  };
  assert.equal(isLatestV3ClipReviewed(legacy, "old-clip"), false);
  assert.equal(isLatestV3ClipReviewed(legacy, "latest-clip"), true);
  assert.equal(isLatestV3ClipReviewed(legacy, ""), false);
  assert.equal(isLatestV3ClipReviewed({ ...legacy, schemaVersion: 99 } as unknown as typeof bible, "latest-clip"), false);
});

test("Bible IDs and review states are validated rather than silently normalized", () => {
  const bible = createEmptyV3ContinuityBible();
  assert.equal(validateV3ContinuityBible({ ...bible, referenceIds: ["same", "same"] }), false);
  assert.equal(validateV3ContinuityBible({ ...bible, reviewChecklist: { ...bible.reviewChecklist, temporalMotion: "maybe" } }), false);
  assert.equal(validateV3ContinuityBible({ ...bible, version: 0 }), false);
});
