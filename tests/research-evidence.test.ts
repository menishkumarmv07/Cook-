import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyResearchEvidenceArchive,
  findPotentialEvidenceConflicts,
  isHttpSourceUrl,
  mergeResearchEvidence,
  normalizeEvidenceText,
  parseResearchEvidenceArchive,
  type ResearchEvidenceClaim,
  type ResearchEvidenceSource,
} from "../lib/research-evidence";

const capturedAt = "2026-10-15T12:00:00.000Z";

function source(id: string, url = "https://recipes.com/" + id): ResearchEvidenceSource {
  return {
    id,
    url,
    title: "Recipe " + id,
    publisher: "Example Kitchen",
    capturedAt,
    captureMethod: "schema-org",
    status: "accessible",
    warnings: ["Schema.org extraction is unverified."],
  };
}

function claim(
  id: string,
  sourceId: string,
  value: string,
  overrides: Partial<ResearchEvidenceClaim> = {},
): ResearchEvidenceClaim {
  return {
    id,
    sourceId,
    subject: "salt",
    predicate: "quantity",
    value,
    unit: "tsp",
    excerpt: value + " tsp salt",
    capturedAt,
    reviewStatus: "unreviewed",
    ...overrides,
  };
}

test("creates and validates an empty versioned archive", () => {
  const archive = createEmptyResearchEvidenceArchive(capturedAt);
  assert.equal(archive.version, 1);
  assert.deepEqual(parseResearchEvidenceArchive(archive), archive);
  assert.equal(parseResearchEvidenceArchive({ ...archive, version: 2 }), null);
});

test("accepts HTTP(S) source links without credentials and rejects unsafe URL forms", () => {
  assert.equal(isHttpSourceUrl("https://recipes.com/dish"), true);
  assert.equal(isHttpSourceUrl("http://recipes.com/dish"), true);
  assert.equal(isHttpSourceUrl("javascript:alert(1)"), false);
  assert.equal(isHttpSourceUrl("file:///private/source"), false);
  assert.equal(isHttpSourceUrl("https://user:pass@recipes.com/dish"), false);
  assert.equal(isHttpSourceUrl("http://localhost/recipe"), false);
  assert.equal(isHttpSourceUrl("http://127.0.0.1/recipe"), false);
  assert.equal(isHttpSourceUrl("http://10.0.0.1/recipe"), false);
  assert.equal(isHttpSourceUrl("http://192.168.1.5/recipe"), false);
  assert.equal(isHttpSourceUrl("http://[::1]/recipe"), false);
  assert.equal(isHttpSourceUrl("https://recipes.example/dish"), false);
  assert.equal(isHttpSourceUrl("https://recipes.invalid/dish"), false);
  assert.equal(isHttpSourceUrl("https://recipes.com:8443/dish"), false);
  assert.equal(isHttpSourceUrl("not a URL"), false);
});

test("rejects duplicate source IDs, duplicate claim IDs and orphan claims", () => {
  const archive = createEmptyResearchEvidenceArchive(capturedAt);
  assert.equal(parseResearchEvidenceArchive({
    ...archive,
    sources: [source("same"), source("same", "https://other.com/recipe")],
  }), null);
  assert.equal(parseResearchEvidenceArchive({
    ...archive,
    sources: [source("one")],
    claims: [claim("same", "one", "1"), claim("same", "one", "2")],
  }), null);
  assert.equal(parseResearchEvidenceArchive({
    ...archive,
    sources: [source("one")],
    claims: [claim("claim-one", "missing-source", "1")],
  }), null);
});

test("flags different quantities reported by two source records with both citations", () => {
  const archive = {
    ...createEmptyResearchEvidenceArchive(capturedAt),
    sources: [source("a"), source("b", "https://other.com/recipe")],
    claims: [claim("claim-a", "a", "1"), claim("claim-b", "b", "2")],
  };
  const conflicts = findPotentialEvidenceConflicts(archive);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].subject, "salt");
  assert.equal(conflicts[0].predicate, "quantity");
  assert.equal(conflicts[0].alternatives.length, 2);
  assert.deepEqual(
    conflicts[0].alternatives.flatMap((alternative) => alternative.sources.map((item) => item.url)).sort(),
    ["https://other.com/recipe", "https://recipes.com/a"],
  );
  assert.match(conflicts[0].explanation, /Check units/);
});

test("does not mistake duplicate URL records for independent conflicting sources", () => {
  const archive = {
    ...createEmptyResearchEvidenceArchive(capturedAt),
    sources: [
      source("a", "https://recipes.com/pasta#ingredients"),
      source("b", "https://recipes.com/pasta/"),
    ],
    claims: [claim("claim-a", "a", "1"), claim("claim-b", "b", "2")],
  };
  assert.equal(findPotentialEvidenceConflicts(archive).length, 0);
});

test("detects a cross-source difference even when one source records multiple alternatives", () => {
  const archive = {
    ...createEmptyResearchEvidenceArchive(capturedAt),
    sources: [source("a"), source("b", "https://other.com/recipe")],
    claims: [
      claim("claim-a-one", "a", "1"),
      claim("claim-a-two", "a", "2"),
      claim("claim-b-one", "b", "1"),
    ],
  };

  const conflicts = findPotentialEvidenceConflicts(archive);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(
    conflicts[0].alternatives.map((alternative) => alternative.displayValue).sort(),
    ["1 tsp", "2 tsp"],
  );
  assert.deepEqual(
    conflicts[0].alternatives.flatMap((alternative) => alternative.sources.map((item) => item.url)).sort(),
    ["https://other.com/recipe", "https://recipes.com/a"],
  );
});

test("normalization handles Unicode and whitespace without claiming semantic equivalence", () => {
  assert.equal(normalizeEvidenceText("  1\u00a0CUP  "), "1 CUP".toLocaleLowerCase("en-US"));
  const archive = {
    ...createEmptyResearchEvidenceArchive(capturedAt),
    sources: [source("a"), source("b")],
    claims: [
      claim("claim-a", "a", "1  cup", { unit: " " }),
      claim("claim-b", "b", "1\u00a0cup", { unit: "" }),
    ],
  };
  assert.equal(findPotentialEvidenceConflicts(archive).length, 0);
  const differentUnits = {
    ...archive,
    claims: [
      claim("claim-a", "a", "1", { unit: "cup" }),
      claim("claim-b", "b", "240", { unit: "ml" }),
    ],
  };
  assert.equal(findPotentialEvidenceConflicts(differentUnits).length, 1);
});

test("ignores rejected claims and different predicates when looking for possible conflicts", () => {
  const archive = {
    ...createEmptyResearchEvidenceArchive(capturedAt),
    sources: [source("a"), source("b"), source("c")],
    claims: [
      claim("claim-a", "a", "1", { reviewStatus: "rejected" }),
      claim("claim-b", "b", "2"),
      claim("claim-c", "c", "3", { predicate: "cooking time" }),
    ],
  };
  assert.equal(findPotentialEvidenceConflicts(archive).length, 0);
});

test("merge rejects duplicate IDs within the same incoming batch", () => {
  const empty = createEmptyResearchEvidenceArchive(capturedAt);
  assert.equal(
    mergeResearchEvidence(
      empty,
      [source("duplicate"), source("duplicate", "https://other.com/recipe")],
      [],
      capturedAt,
    ),
    null,
  );

  const withSource = mergeResearchEvidence(empty, [source("one")], [], capturedAt);
  assert.ok(withSource);
  assert.equal(
    mergeResearchEvidence(
      withSource,
      [],
      [claim("same-claim", "one", "1"), claim("same-claim", "one", "2")],
      capturedAt,
    ),
    null,
  );
});

test("upsert merge is idempotent and rejects a claim when its source is missing", () => {
  const empty = createEmptyResearchEvidenceArchive(capturedAt);
  const withSource = mergeResearchEvidence(empty, [source("a")], [], capturedAt);
  assert.ok(withSource);
  const once = mergeResearchEvidence(withSource, [source("a")], [claim("claim-a", "a", "1")], capturedAt);
  assert.ok(once);
  const twice = mergeResearchEvidence(once, [source("a")], [claim("claim-a", "a", "1")], capturedAt);
  assert.ok(twice);
  assert.equal(twice.sources.length, 1);
  assert.equal(twice.claims.length, 1);
  assert.equal(mergeResearchEvidence(empty, [], [claim("orphan", "missing", "1")], capturedAt), null);
});

test("malformed timestamps and oversized evidence fields fail validation", () => {
  const archive = createEmptyResearchEvidenceArchive(capturedAt);
  assert.equal(parseResearchEvidenceArchive({ ...archive, updatedAt: "yesterday" }), null);
  assert.equal(parseResearchEvidenceArchive({
    ...archive,
    sources: [source("x")],
    claims: [claim("claim-x", "x", "1".repeat(2_001))],
  }), null);
});

test("does not flag matching multivalued evidence sets repeated by each source", () => {
  const archive = {
    ...createEmptyResearchEvidenceArchive(capturedAt),
    sources: [source("a"), source("b", "https://other.com/recipe")],
    claims: [
      claim("a-one", "a", "1"),
      claim("a-two", "a", "2"),
      claim("b-one", "b", "1"),
      claim("b-two", "b", "2"),
    ],
  };

  assert.equal(findPotentialEvidenceConflicts(archive).length, 0);
});

test("keeps subject and predicate keys distinct when text contains separator-like characters", () => {
  const archive = {
    ...createEmptyResearchEvidenceArchive(capturedAt),
    sources: [source("a"), source("b", "https://other.com/recipe")],
    claims: [
      claim("claim-a", "a", "5", { subject: "beans::prep", predicate: "time" }),
      claim("claim-b", "b", "10", { subject: "beans", predicate: "prep::time" }),
    ],
  };

  assert.equal(findPotentialEvidenceConflicts(archive).length, 0);
});
