import assert from "node:assert/strict";
import test from "node:test";
import {
  createEditorialBackupJSON,
  DEFAULT_EDITORIAL_REVIEW_CHECKS,
  DEFAULT_EDITORIAL_SCORES,
  DEFAULT_EDITORIAL_WEIGHTS,
  editorialIdeaFingerprint,
  isEditorialIdea,
  mergeEditorialIdeas,
  parseEditorialBackupJSON,
  scoreEditorialIdea,
  serializeEditorialIdeasCsv,
  validateEditorialIdea,
  validateEditorialWeights,
  type EditorialIdea,
  type EditorialScoreWeights,
} from "../lib/editorial-calendar";

function testDateOnly(date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return testDateOnly(date);
}

function idea(overrides: Partial<EditorialIdea> = {}): EditorialIdea {
  const now = new Date().toISOString();
  return {
    id: "idea-1",
    title: "Three textures in a 20-minute chickpea bowl",
    recipeOrSeries: "Weeknight bowls",
    platform: "YouTube Shorts",
    scheduledDate: "",
    audiencePromise: "A practical US weeknight meal with clear textures and steps.",
    originalContribution: "Show an original taste test and explain why each texture is used.",
    hypothesis: "A close-up texture comparison may help viewers understand the recipe.",
    evidenceKind: "hypothesis",
    sourceUrl: "",
    observedDate: "",
    observationNotes: "",
    scores: { ...DEFAULT_EDITORIAL_SCORES },
    reviewChecks: { ...DEFAULT_EDITORIAL_REVIEW_CHECKS },
    status: "idea",
    createdAt: now,
    updatedAt: now,
    publishedUrl: "",
    outcomeNotes: "",
    ...overrides,
  };
}

test("accepts a basic hypothesis idea without pretending it is a measured trend", () => {
  assert.deepEqual(validateEditorialIdea(idea()), []);
  assert.equal(isEditorialIdea(idea()), true);
  assert.equal(idea().evidenceKind, "hypothesis");
});

test("dated observations need a safe source, actual observation date, and what was observed", () => {
  const incomplete = idea({ evidenceKind: "dated-observation" });
  assert.ok(validateEditorialIdea(incomplete).some((message) => /safe public HTTP\(S\) source URL/.test(message)));
  assert.ok(validateEditorialIdea(incomplete).some((message) => /observation date/.test(message)));
  assert.ok(validateEditorialIdea(incomplete).some((message) => /what the source actually showed/.test(message)));

  const complete = idea({
    evidenceKind: "dated-observation",
    sourceUrl: "https://food.example.com/story",
    observedDate: "2026-10-20",
    observationNotes: "The page dated October 20 mentions a seasonal ingredient; this is one source, not proof of broad trend demand.",
  });
  // The reserved example domain is deliberately rejected by the shared source validator.
  assert.ok(validateEditorialIdea(complete).some((message) => /safe public HTTP\(S\) source URL/.test(message)));

  const publicSource = idea({
    evidenceKind: "dated-observation",
    sourceUrl: "https://www.usda.gov/",
    observedDate: testDateOnly(),
    observationNotes: "This source provides context about food; it does not establish social-media trend demand.",
  });
  assert.deepEqual(validateEditorialIdea(publicSource), []);
});

test("future observation dates and unsafe source URLs cannot be used as dated evidence", () => {
  const future = idea({
    evidenceKind: "dated-observation",
    sourceUrl: "https://www.usda.gov/",
    observedDate: dateOffset(1),
    observationNotes: "Claimed future observation.",
  });
  assert.ok(validateEditorialIdea(future).some((message) => /cannot be in the future/.test(message)));
  const local = idea({
    evidenceKind: "dated-observation",
    sourceUrl: "http://127.0.0.1/admin",
    observedDate: testDateOnly(),
    observationNotes: "Private URL should not be accepted.",
  });
  assert.ok(validateEditorialIdea(local).some((message) => /safe public HTTP\(S\) source URL/.test(message)));
});

test("ready and scheduled states require the originality and review gates", () => {
  const notReviewed = idea({ status: "ready" });
  assert.ok(validateEditorialIdea(notReviewed).some((message) => /Before Ready\/Scheduled\/Published/.test(message)));

  const checks = {
    recipeSafetyReviewed: true,
    rightsReviewed: true,
    nutritionClaimsReviewed: true,
    platformDisclosureReviewed: true,
  };
  const scheduled = idea({ status: "scheduled", scheduledDate: dateOffset(2), reviewChecks: checks });
  assert.deepEqual(validateEditorialIdea(scheduled), []);
  const pastScheduled = idea({ status: "scheduled", scheduledDate: dateOffset(-1), reviewChecks: checks });
  assert.ok(validateEditorialIdea(pastScheduled).some((message) => /today or a future/.test(message)));
  const publishedFuture = idea({ status: "published", scheduledDate: dateOffset(1), reviewChecks: checks });
  assert.ok(validateEditorialIdea(publishedFuture).some((message) => /non-future publication date/.test(message)));
});

test("score is deterministic, transparent, and production effort is inverted", () => {
  const effortEasy = scoreEditorialIdea({
    audienceFit: 5, originality: 5, evidenceReadiness: 5, productionEffort: 1, seasonalRelevance: 5,
  }, DEFAULT_EDITORIAL_WEIGHTS);
  const effortHard = scoreEditorialIdea({
    audienceFit: 5, originality: 5, evidenceReadiness: 5, productionEffort: 5, seasonalRelevance: 5,
  }, DEFAULT_EDITORIAL_WEIGHTS);
  assert.equal(effortEasy, 100);
  assert.equal(effortHard, 90);
  const zeroWeight = {
    audienceFit: 0, originality: 0, evidenceReadiness: 0, productionEffort: 0, seasonalRelevance: 0,
  };
  assert.ok(validateEditorialWeights(zeroWeight).length > 0);
  assert.deepEqual(validateEditorialWeights({ ...DEFAULT_EDITORIAL_WEIGHTS, originality: 10 }), []);
  assert.equal(scoreEditorialIdea(DEFAULT_EDITORIAL_SCORES, DEFAULT_EDITORIAL_WEIGHTS), 45);
});

test("scheduled and published links accept safe HTTP(S) only", () => {
  const checks = {
    recipeSafetyReviewed: true,
    rightsReviewed: true,
    nutritionClaimsReviewed: true,
    platformDisclosureReviewed: true,
  };
  assert.ok(validateEditorialIdea(idea({
    status: "published",
    scheduledDate: testDateOnly(),
    publishedUrl: "javascript:alert(1)",
    reviewChecks: checks,
  })).some((message) => /safe public HTTP\(S\) URL/.test(message)));
});

test("JSON backup round-trips ideas and weights while rejecting corrupt, duplicate, or oversized data", () => {
  const ideas = [idea(), idea({ id: "idea-2", title: "A separate original sauce tutorial" })];
  const exportedAt = "2026-10-22T12:00:00.000Z";
  const raw = createEditorialBackupJSON(ideas, DEFAULT_EDITORIAL_WEIGHTS, exportedAt);
  const restored = parseEditorialBackupJSON(raw);
  assert.ok(restored);
  assert.deepEqual(restored.ideas, ideas);
  assert.deepEqual(restored.weights, DEFAULT_EDITORIAL_WEIGHTS);
  assert.equal(restored.exportedAt, exportedAt);
  assert.equal(parseEditorialBackupJSON("not JSON"), null);
  assert.equal(parseEditorialBackupJSON(JSON.stringify({ format: "cooking-creator-editorial-workspace", version: 9 })), null);
  assert.equal(parseEditorialBackupJSON(JSON.stringify({
    format: "cooking-creator-editorial-workspace", version: 1, exportedAt, ideas: [ideas[0], ideas[0]], weights: DEFAULT_EDITORIAL_WEIGHTS,
  })), null);
  assert.equal(parseEditorialBackupJSON("x".repeat(5_000_001)), null);
});

test("merge keeps existing records, skips duplicates, and rekeys unrelated ID collisions", () => {
  const first = idea();
  const sameIdea = idea({ id: "another-id" });
  const idCollision = idea({ id: first.id, title: "A different title and angle" });
  const merged = mergeEditorialIdeas([first], [sameIdea, idCollision]);
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.ideas.length, 2);
  assert.equal(merged.ideas[0].title, first.title);
  assert.notEqual(merged.ideas[0].id, merged.ideas[1].id);
  assert.equal(editorialIdeaFingerprint(merged.ideas[0]), editorialIdeaFingerprint(first));
});

test("CSV export includes weighted score and neutralizes spreadsheet formula titles", () => {
  const raw = serializeEditorialIdeasCsv([idea({ title: "=HYPERLINK(\"https://bad.example\",\"click\")" })], DEFAULT_EDITORIAL_WEIGHTS);
  assert.match(raw, /'=HYPERLINK/);
  assert.match(raw, /transparent_score_0_100/);
  assert.match(raw, /100/);
});
