export const RESEARCH_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type ResearchCaptureMethod =
  | "schema-org"
  | "page-text"
  | "official-api"
  | "user-transcript"
  | "manual"
  | "nutrition-dataset"
  | "other";

export type ResearchSourceStatus = "accessible" | "needs-input" | "blocked" | "failed";
export type EvidenceReviewStatus = "unreviewed" | "accepted" | "rejected";

export type ResearchEvidenceSource = {
  id: string;
  url: string;
  title: string;
  publisher: string;
  capturedAt: string;
  captureMethod: ResearchCaptureMethod;
  status: ResearchSourceStatus;
  warnings: string[];
};

export type ResearchEvidenceClaim = {
  id: string;
  sourceId: string;
  subject: string;
  predicate: string;
  value: string;
  unit: string;
  excerpt: string;
  capturedAt: string;
  reviewStatus: EvidenceReviewStatus;
};

export type ResearchEvidenceArchive = {
  version: typeof RESEARCH_EVIDENCE_SCHEMA_VERSION;
  updatedAt: string;
  sources: ResearchEvidenceSource[];
  claims: ResearchEvidenceClaim[];
};

export type PotentialEvidenceConflict = {
  key: string;
  subject: string;
  predicate: string;
  alternatives: Array<{
    normalizedValue: string;
    displayValue: string;
    claims: ResearchEvidenceClaim[];
    sources: ResearchEvidenceSource[];
  }>;
  explanation: string;
};

const CAPTURE_METHODS: readonly ResearchCaptureMethod[] = [
  "schema-org", "page-text", "official-api", "user-transcript", "manual", "nutrition-dataset", "other",
];
const SOURCE_STATUSES: readonly ResearchSourceStatus[] = ["accessible", "needs-input", "blocked", "failed"];
const REVIEW_STATUSES: readonly EvidenceReviewStatus[] = ["unreviewed", "accepted", "rejected"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length >= minLength && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 40) return false;
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

/**
 * Storage validation only. Any server-side fetch must still go through the
 * existing DNS-pinned URL validator in lib/remote-source.ts.
 */
export function isHttpSourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (!url.hostname || url.username || url.password) return false;
    if (url.port) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    // Literal IPs are deliberately not accepted as stored sources; the app
    // only needs normal public website hostnames for this evidence workflow.
    if (
      !host.includes(".") ||
      host.endsWith(".") ||
      host.includes(":") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
      ["localhost", "local", "internal", "lan", "home", "test", "invalid", "example"]
        .some((suffix) => host === suffix || host.endsWith("." + suffix))
    ) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalization for comparison keys, not semantic equivalence. Units,
 * synonyms and equivalent cooking instructions are deliberately not inferred.
 */
export function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function validSource(value: unknown): value is ResearchEvidenceSource {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id, 1, 120)) return false;
  if (!isHttpSourceUrl(value.url)) return false;
  if (!isBoundedString(value.title, 0, 500) || !isBoundedString(value.publisher, 0, 250)) return false;
  if (!isTimestamp(value.capturedAt)) return false;
  if (typeof value.captureMethod !== "string" || !CAPTURE_METHODS.includes(value.captureMethod as ResearchCaptureMethod)) return false;
  if (typeof value.status !== "string" || !SOURCE_STATUSES.includes(value.status as ResearchSourceStatus)) return false;
  if (!Array.isArray(value.warnings) || !value.warnings.every((item) => isBoundedString(item, 0, 1_000))) return false;
  return true;
}

function validClaim(value: unknown): value is ResearchEvidenceClaim {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id, 1, 120) || !isBoundedString(value.sourceId, 1, 120)) return false;
  if (!isBoundedString(value.subject, 1, 240) || !isBoundedString(value.predicate, 1, 120)) return false;
  if (!isBoundedString(value.value, 1, 2_000) || !isBoundedString(value.unit, 0, 80)) return false;
  if (!isBoundedString(value.excerpt, 0, 1_600) || !isTimestamp(value.capturedAt)) return false;
  if (typeof value.reviewStatus !== "string" || !REVIEW_STATUSES.includes(value.reviewStatus as EvidenceReviewStatus)) return false;
  return true;
}

export function createEmptyResearchEvidenceArchive(now = new Date().toISOString()): ResearchEvidenceArchive {
  if (!isTimestamp(now)) throw new Error("A valid ISO timestamp is required.");
  return { version: RESEARCH_EVIDENCE_SCHEMA_VERSION, updatedAt: now, sources: [], claims: [] };
}

/**
 * Validates a JSON value before it is used as a research archive. The caller
 * should apply a byte-size limit before JSON.parse when reading imported files.
 * There is intentionally no arbitrary source-count limit; callers should use
 * recoverable queues and explicit storage-quota handling instead.
 */
export function parseResearchEvidenceArchive(value: unknown): ResearchEvidenceArchive | null {
  if (!isRecord(value) || value.version !== RESEARCH_EVIDENCE_SCHEMA_VERSION) return null;
  if (!isTimestamp(value.updatedAt) || !Array.isArray(value.sources) || !Array.isArray(value.claims)) return null;
  if (!value.sources.every(validSource) || !value.claims.every(validClaim)) return null;

  const sources = value.sources as ResearchEvidenceSource[];
  const claims = value.claims as ResearchEvidenceClaim[];
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) return null;
    sourceIds.add(source.id);
  }

  const claimIds = new Set<string>();
  for (const claim of claims) {
    if (claimIds.has(claim.id) || !sourceIds.has(claim.sourceId)) return null;
    claimIds.add(claim.id);
  }

  return {
    version: RESEARCH_EVIDENCE_SCHEMA_VERSION,
    updatedAt: value.updatedAt,
    sources: sources.map((source) => ({ ...source, warnings: [...source.warnings] })),
    claims: claims.map((claim) => ({ ...claim })),
  };
}

/**
 * Idempotent upsert by stable record ID. Invalid data returns null so the
 * caller can preserve the previous archive and display a recoverable error.
 */
export function mergeResearchEvidence(
  currentValue: unknown,
  incomingSources: readonly ResearchEvidenceSource[],
  incomingClaims: readonly ResearchEvidenceClaim[],
  updatedAt = new Date().toISOString(),
): ResearchEvidenceArchive | null {
  const current = parseResearchEvidenceArchive(currentValue);
  if (!current || !isTimestamp(updatedAt)) return null;
  if (!incomingSources.every(validSource) || !incomingClaims.every(validClaim)) return null;

  const sources = new Map(current.sources.map((source) => [source.id, source]));
  for (const source of incomingSources) sources.set(source.id, { ...source, warnings: [...source.warnings] });

  const claims = new Map(current.claims.map((claim) => [claim.id, claim]));
  for (const claim of incomingClaims) claims.set(claim.id, { ...claim });

  return parseResearchEvidenceArchive({
    version: RESEARCH_EVIDENCE_SCHEMA_VERSION,
    updatedAt,
    sources: [...sources.values()],
    claims: [...claims.values()],
  });
}

/**
 * Canonical identity for conflict checking. A fragment or trailing slash does
 * not make a page an independent source. Query parameters remain significant.
 */
function normalizeEvidenceSourceIdentity(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return value.trim();
  }
}

/**
 * Finds possible conflicts only when different canonical source URLs record
 * different sets of values for the same normalized subject and predicate.
 * Rejected claims are excluded. Results are review prompts, not factual verdicts.
 *
 * Comparing per-source value sets avoids a false positive where two sources
 * independently list the same two alternatives (for example, two serving
 * suggestions on each page). It still flags one source listing {1, 2} while
 * another lists only {1}. URL fragments and trailing slashes do not establish
 * independent sources.
 */
export function findPotentialEvidenceConflicts(
  archiveValue: unknown,
): PotentialEvidenceConflict[] {
  const archive = parseResearchEvidenceArchive(archiveValue);
  if (!archive) return [];

  const sourceById = new Map(archive.sources.map((source) => [source.id, source]));
  const sourceIdentityById = new Map(
    archive.sources.map((source) => [source.id, normalizeEvidenceSourceIdentity(source.url)]),
  );
  const groups = new Map<string, ResearchEvidenceClaim[]>();

  for (const claim of archive.claims) {
    if (claim.reviewStatus === "rejected") continue;
    const subjectKey = normalizeEvidenceText(claim.subject);
    const predicateKey = normalizeEvidenceText(claim.predicate);
    if (!subjectKey || !predicateKey || !normalizeEvidenceText(claim.value)) continue;
    // Encode tuple elements instead of joining with a delimiter that user text
    // could itself contain.
    const key = JSON.stringify([subjectKey, predicateKey]);
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }

  const output: PotentialEvidenceConflict[] = [];
  for (const [key, claims] of groups) {
    const values = new Map<string, ResearchEvidenceClaim[]>();
    const valuesBySource = new Map<string, Set<string>>();

    // Linear indexing keeps large but byte-bounded imports responsive.
    for (const claim of claims) {
      const normalizedValue = normalizeEvidenceText(claim.value + " " + claim.unit);
      const alternative = values.get(normalizedValue) ?? [];
      alternative.push(claim);
      values.set(normalizedValue, alternative);

      const identity = sourceIdentityById.get(claim.sourceId);
      if (!identity) continue;
      const sourceValues = valuesBySource.get(identity) ?? new Set<string>();
      sourceValues.add(normalizedValue);
      valuesBySource.set(identity, sourceValues);
    }

    if (values.size < 2 || valuesBySource.size < 2) continue;

    // If every independent source records the same set of alternatives, there
    // is no cross-source disagreement to flag. Compare set signatures in O(n).
    const profileSignatures = new Set(
      [...valuesBySource.values()].map((sourceValues) => JSON.stringify([...sourceValues].sort())),
    );
    if (profileSignatures.size < 2) continue;

    const first = claims[0];
    output.push({
      key,
      subject: first.subject.trim(),
      predicate: first.predicate.trim(),
      alternatives: [...values.entries()].map(([normalizedValue, alternativeClaims]) => ({
        normalizedValue,
        displayValue: alternativeClaims[0].value.trim() + (alternativeClaims[0].unit.trim() ? " " + alternativeClaims[0].unit.trim() : ""),
        claims: alternativeClaims.map((claim) => ({ ...claim })),
        sources: [...new Set(alternativeClaims.map((claim) => claim.sourceId))]
          .map((sourceId) => sourceById.get(sourceId))
          .filter((source): source is ResearchEvidenceSource => Boolean(source))
          .map((source) => ({ ...source, warnings: [...source.warnings] })),
      })),
      explanation: "Sources record different sets of values for the same subject and field. Check units, context and source wording before deciding whether this is a true conflict.",
    });
  }

  return output.sort((left, right) =>
    (left.subject + " " + left.predicate).localeCompare(right.subject + " " + right.predicate),
  );
}
