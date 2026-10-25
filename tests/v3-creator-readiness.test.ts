import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyV3CreatorReadiness,
  getV3CreatorReadinessIssues,
  isV3CreatorReadinessChecklistComplete,
  normalizeV3CreatorReadiness,
  validateV3CreatorReadiness,
  V3_CREATOR_REVIEW_CHECKS,
  type V3CreatorReadiness,
} from "../lib/v3-creator-readiness";

function completeOwnerFootageChecklist(): V3CreatorReadiness {
  const readiness = createEmptyV3CreatorReadiness();
  readiness.title = "A quick, practical recipe lesson";
  readiness.caption = "Show the actual method and key doneness cues.";
  readiness.callToAction = "Save this recipe for your next meal.";
  readiness.hashtags = "#cooking #recipe";
  readiness.mediaOrigin = "owner-footage-only";
  for (const item of V3_CREATOR_REVIEW_CHECKS) readiness.checks[item.key] = true;
  return readiness;
}

test("new projects start with explicit uncertainty and no inherited creator approvals", () => {
  const readiness = createEmptyV3CreatorReadiness();
  assert.equal(readiness.mediaOrigin, "uncertain");
  assert.ok(V3_CREATOR_REVIEW_CHECKS.every((item) => readiness.checks[item.key] === false));
  assert.equal(isV3CreatorReadinessChecklistComplete(readiness), false);
  assert.ok(getV3CreatorReadinessIssues(readiness).some((issue) => /do not guess/i.test(issue)));
});

test("a complete owner-footage checklist requires all content and review gates", () => {
  const readiness = completeOwnerFootageChecklist();
  assert.equal(validateV3CreatorReadiness(readiness), true);
  assert.deepEqual(getV3CreatorReadinessIssues(readiness), []);
  assert.equal(isV3CreatorReadinessChecklistComplete(readiness), true);
});

test("uncertain media origin blocks readiness even when all other checks are marked", () => {
  const readiness = completeOwnerFootageChecklist();
  readiness.mediaOrigin = "uncertain";
  assert.ok(getV3CreatorReadinessIssues(readiness).some((issue) => /media origin/i.test(issue)));
});

test("realistic AI or mixed media never skips an explicit manual platform-label reminder", () => {
  const readiness = completeOwnerFootageChecklist();
  readiness.mediaOrigin = "ai-generated-or-altered";
  const issues = getV3CreatorReadinessIssues(readiness);
  assert.ok(issues.some((issue) => /platform's own upload flow/i.test(issue)));
  assert.equal(isV3CreatorReadinessChecklistComplete(readiness), false);
});

test("all platform disclosure checklist states are required", () => {
  const readiness = completeOwnerFootageChecklist();
  readiness.checks.platformDisclosureReviewed = false;
  assert.ok(getV3CreatorReadinessIssues(readiness).some((issue) => /synthetic-media\/disclosure rules/i.test(issue)));
});

test("invalid schema, platform, media origin, review shape and oversized text are rejected", () => {
  const valid = completeOwnerFootageChecklist();
  assert.equal(validateV3CreatorReadiness({ ...valid, schemaVersion: 99 }), false);
  assert.equal(validateV3CreatorReadiness({ ...valid, platform: "unknown" }), false);
  assert.equal(validateV3CreatorReadiness({ ...valid, mediaOrigin: "guess" }), false);
  assert.equal(validateV3CreatorReadiness({ ...valid, checks: { ...valid.checks, assetRightsReviewed: "yes" } }), false);
  assert.equal(validateV3CreatorReadiness({ ...valid, title: "x".repeat(101) }), false);
  assert.equal(validateV3CreatorReadiness({ ...valid, caption: "x".repeat(4_001) }), false);
  assert.equal(validateV3CreatorReadiness({ ...valid, notes: "x\u0001" }), false);
});

test("older project data receives an incomplete checklist rather than an approval", () => {
  const migrated = normalizeV3CreatorReadiness(undefined);
  assert.ok(migrated);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.readiness.mediaOrigin, "uncertain");
  assert.equal(isV3CreatorReadinessChecklistComplete(migrated.readiness), false);
  assert.equal(normalizeV3CreatorReadiness({ schemaVersion: 99 }), null);
});
