import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyV3ContinuityBible,
  incrementV3ContinuityBibleVersion,
  reviewV3ContinuityClip,
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

test("validates owner reference metadata and rejects invalid file facts", () => {
  assert.equal(validateV3ContinuityReference(validReference()), true);
  assert.equal(validateV3ContinuityReference({ ...validReference(), byteSize: MAX_V3_REFERENCE_BYTES + 1 }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), mimeType: "image/svg+xml" }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), sha256: "not-a-hash" }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), width: 0 }), false);
  assert.equal(validateV3ContinuityReference({ ...validReference(), role: "imaginary-role" }), false);
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
  const reviewed = reviewV3ContinuityClip(original, "clip-1", passed, "pass");
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
  assert.throws(() => reviewV3ContinuityClip(bible, "clip-1", incomplete, "pass"), /every required/i);
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
  assert.throws(() => reviewV3ContinuityClip(bible, "clip-2", failed, "pass"), /every required/i);
  const recorded = reviewV3ContinuityClip(bible, "clip-2", failed, "fail");
  assert.equal(recorded.visualRealismStatus, "fail");
  assert.deepEqual(recorded.lastReviewedClipIds, ["clip-2"]);

  // The Bible stores only the most recent clip's checklist; a prior clip must not
  // inherit the latest clip's PASS/FAIL status because historical per-clip checklists
  // are not stored.
  const priorPass = reviewV3ContinuityClip(bible, "clip-1", ({
    chefIdentity: "pass",
    wardrobe: "pass",
    kitchenLayout: "pass",
    lightingAndProps: "pass",
    cookingAction: "pass",
    ingredientAndFoodState: "pass",
    temporalMotion: "pass",
    audioAndCaptions: "pass",
  }), "pass");
  const latestFail = reviewV3ContinuityClip(priorPass, "clip-2", failed, "fail");
  assert.deepEqual(latestFail.lastReviewedClipIds, ["clip-2"]);
  assert.equal(latestFail.visualRealismStatus, "fail");
});

test("Bible IDs and review states are validated rather than silently normalized", () => {
  const bible = createEmptyV3ContinuityBible();
  assert.equal(validateV3ContinuityBible({ ...bible, referenceIds: ["same", "same"] }), false);
  assert.equal(validateV3ContinuityBible({ ...bible, reviewChecklist: { ...bible.reviewChecklist, temporalMotion: "maybe" } }), false);
  assert.equal(validateV3ContinuityBible({ ...bible, version: 0 }), false);
});
