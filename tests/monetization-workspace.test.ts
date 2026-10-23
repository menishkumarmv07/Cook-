import assert from "node:assert/strict";
import test from "node:test";
import {
  actualReceivedAffiliateUsd,
  actualReceivedPartnershipUsd,
  buildMediaKitMarkdown,
  createMonetizationBackupJSON,
  DEFAULT_MEDIA_KIT_PROFILE,
  DEFAULT_PARTNERSHIP_REVIEW,
  DEFAULT_READINESS_CHECKS,
  estimatedAffiliateUsd,
  estimatedPartnerUsd,
  contractedPartnershipUsd,
  mergeMonetizationRows,
  metricFingerprint,
  parseMonetizationBackupJSON,
  validateAffiliateRecord,
  validateCreatorMetricSnapshot,
  validateMediaKitProfile,
  validatePartnership,
  validateReadinessCheck,
  type AffiliateRecord,
  type CreatorMetricSnapshot,
  type CreatorPartnership,
  type CreatorMediaKitProfile,
} from "../lib/monetization-workspace";

const safeProfile = (overrides: Partial<CreatorMediaKitProfile> = {}): CreatorMediaKitProfile => ({
  ...DEFAULT_MEDIA_KIT_PROFILE,
  brandName: "Weeknight Kitchen Lab",
  bio: "Original cooking demonstrations and practical home-kitchen tests.",
  cuisineFocus: "Global home cooking",
  targetAudience: "US home cooks (target audience, not verified demographics)",
  contentFormats: "YouTube Shorts, Instagram Reels",
  ageBand: "18plus",
  guardianInvolved: false,
  ...overrides,
});

const metric = (overrides: Partial<CreatorMetricSnapshot> = {}): CreatorMetricSnapshot => ({
  id: "metric-1",
  platform: "YouTube Shorts",
  metricName: "followers",
  value: 2300,
  valueKind: "actual",
  asOfDate: "2026-10-20",
  sourceUrl: "https://support.google.com/youtube/",
  evidenceNote: "Copied by the owner from the channel analytics page on the recorded date.",
  ...overrides,
});

const partnership = (overrides: Partial<CreatorPartnership> = {}): CreatorPartnership => ({
  id: "partner-1",
  brandName: "Example Kitchen Brand",
  campaign: "Pantry product demo",
  deliverable: "One original, owner-reviewed recipe video and caption.",
  platform: "YouTube Shorts",
  status: "lead",
  dueDate: "2026-11-15",
  amountUsd: null,
  amountStage: "none",
  sponsoredOrAffiliate: true,
  disclosureText: "Paid partnership with Example Kitchen Brand.",
  review: { ...DEFAULT_PARTNERSHIP_REVIEW },
  paymentDate: "",
  paymentEvidenceNote: "",
  notes: "",
  ...overrides,
});

const affiliate = (overrides: Partial<AffiliateRecord> = {}): AffiliateRecord => ({
  id: "affiliate-1",
  merchantOrProgram: "Kitchen tools affiliate program",
  productOrService: "Pan used in an original demo",
  destinationUrl: "https://recipes.com/products/pan",
  status: "idea",
  disclosureText: "I may earn a commission from qualifying purchases.",
  disclosureReviewed: false,
  rightsReviewed: false,
  commissionUsd: null,
  commissionKind: "none",
  commissionAsOfDate: "",
  commissionEvidenceNote: "",
  notes: "",
  ...overrides,
});

const yesterday = (() => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
})();
const today = (() => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
})();
const allReviewed = {
  writtenTermsReviewed: true,
  assetRightsReviewed: true,
  disclosureReviewed: true,
  ageEligibilityReviewed: true,
};

test("media-kit profile validates optional public website and age/guardian settings without collecting secrets", () => {
  assert.deepEqual(validateMediaKitProfile(safeProfile()), []);
  assert.ok(validateMediaKitProfile(safeProfile({ publicWebsiteUrl: "javascript:alert(1)" })).some((error) => /safe public HTTP\(S\) URL/.test(error)));
  assert.ok(validateMediaKitProfile(safeProfile({ ageBand: "under18", guardianInvolved: false })).length === 0);
  // The age band may be set without asking for a legal name, account password, tax ID or payment credentials.
});

test("metric records require a real non-future date, owner-entered source note, and separate actual/estimate labels", () => {
  assert.deepEqual(validateCreatorMetricSnapshot(metric()), []);
  assert.deepEqual(validateCreatorMetricSnapshot(metric({ valueKind: "estimate", value: 4000 })), []);
  assert.ok(validateCreatorMetricSnapshot(metric({ asOfDate: "2026-02-30" })).some((error) => /real YYYY-MM-DD date/.test(error)));
  const future = new Date();
  future.setDate(future.getDate() + 1);
  const futureDate = [future.getFullYear(), String(future.getMonth() + 1).padStart(2, "0"), String(future.getDate()).padStart(2, "0")].join("-");
  assert.ok(validateCreatorMetricSnapshot(metric({ asOfDate: futureDate })).some((error) => /cannot be in the future/.test(error)));
  assert.ok(validateCreatorMetricSnapshot(metric({ metricName: "engagementPercent", value: 100.1 })).some((error) => /between 0 and 100/.test(error)));
  assert.ok(validateCreatorMetricSnapshot(metric({ evidenceNote: "" })).some((error) => /where this value came from/.test(error)));
  assert.ok(validateCreatorMetricSnapshot(metric({ sourceUrl: "http://127.0.0.1/admin" })).some((error) => /safe public HTTP\(S\) URL/.test(error)));
});

test("contract progression requires rights, written terms, disclosure and explicit age/payment eligibility review", () => {
  const incomplete = partnership({ status: "contracted" });
  assert.ok(validatePartnership(incomplete, safeProfile()).some((error) => /written terms/.test(error)));
  assert.ok(validatePartnership(incomplete, safeProfile()).some((error) => /age, eligibility and payment/.test(error)));

  const reviewed = partnership({ status: "contracted", amountUsd: 250, amountStage: "contracted", review: allReviewed });
  assert.deepEqual(validatePartnership(reviewed, safeProfile()), []);

  const minorWithoutGuardian = partnership({ status: "contracted", amountUsd: 250, amountStage: "contracted", review: allReviewed });
  assert.ok(validatePartnership(minorWithoutGuardian, safeProfile({ ageBand: "under18" })).some((error) => /parent\/legal guardian/.test(error)));
  assert.deepEqual(validatePartnership(minorWithoutGuardian, safeProfile({ ageBand: "under18", guardianInvolved: true })), []);
});

test("cash partnerships count as received income only after a recorded payment", () => {
  const invalidPaid = partnership({ status: "paid", amountUsd: 400, amountStage: "contracted", review: allReviewed, paymentDate: today, paymentEvidenceNote: "Invoice sent" });
  assert.ok(validatePartnership(invalidPaid, safeProfile()).some((error) => /actually received in USD/.test(error)));
  assert.ok(validatePartnership(invalidPaid, safeProfile()).some((error) => /real payment reference/.test(error)));

  const paid = partnership({ status: "paid", amountUsd: 400, amountStage: "received", review: allReviewed, paymentDate: yesterday, paymentEvidenceNote: "Owner matched the $400 receipt to the platform/payment statement." });
  assert.deepEqual(validatePartnership(paid, safeProfile()), []);
  const contracted = partnership({ id: "partner-2", status: "contracted", amountUsd: 250, amountStage: "contracted", review: allReviewed });
  const estimate = partnership({ id: "partner-3", amountUsd: 900, amountStage: "estimate" });
  const offered = partnership({ id: "partner-4", amountUsd: 100, amountStage: "offered" });
  assert.equal(actualReceivedPartnershipUsd([paid, contracted, estimate, offered]), 400);
  assert.equal(contractedPartnershipUsd([paid, contracted, estimate, offered]), 250);
  assert.equal(estimatedPartnerUsd([paid, contracted, estimate, offered]), 1000);
});

test("affiliate activation requires a safe URL, reviewed disclosure and rights; estimates are not received commission", () => {
  const incompleteActive = affiliate({ status: "active" });
  assert.ok(validateAffiliateRecord(incompleteActive).some((error) => /disclosure text/.test(error)));
  assert.ok(validateAffiliateRecord(incompleteActive).some((error) => /product\/media rights/.test(error)));
  assert.deepEqual(validateAffiliateRecord(affiliate({
    status: "active", disclosureReviewed: true, rightsReviewed: true,
  })), []);
  assert.ok(validateAffiliateRecord(affiliate({ status: "active", destinationUrl: "https://recipes.example/pan", disclosureReviewed: true, rightsReviewed: true })).some((error) => /safe public HTTP\(S\) destination/.test(error)));

  const received = affiliate({ commissionUsd: 31.2, commissionKind: "received", commissionAsOfDate: yesterday, commissionEvidenceNote: "Actual commission shown by the affiliate program dashboard." });
  const estimate = affiliate({ id: "affiliate-2", commissionUsd: 75, commissionKind: "estimate", commissionAsOfDate: today, commissionEvidenceNote: "Planning estimate; not received income." });
  assert.equal(actualReceivedAffiliateUsd([received, estimate]), 31.2);
  assert.equal(estimatedAffiliateUsd([received, estimate]), 75);
});

test("readiness marked Reviewed needs a source, date and notes; a checklist never silently claims certification", () => {
  const emptyReview = { ...DEFAULT_READINESS_CHECKS[0], status: "reviewed" as const };
  assert.ok(validateReadinessCheck(emptyReview).some((error) => /source URL and notes/.test(error)));
  const reviewed = {
    ...emptyReview,
    reviewedDate: yesterday,
    sourceUrl: "https://www.ftc.gov/influencers",
    notes: "Owner reviewed the official disclosure guidance; this is not legal advice or certification.",
  };
  assert.deepEqual(validateReadinessCheck(reviewed), []);
  const action = { ...DEFAULT_READINESS_CHECKS[0], status: "needs-action" as const };
  assert.ok(validateReadinessCheck(action).some((error) => /action needed/.test(error)));
});

test("media-kit markdown separates actual values and estimates without revenue promises", () => {
  const markdown = buildMediaKitMarkdown(safeProfile(), [
    metric(),
    metric({ id: "estimate-1", metricName: "averageViews", value: 1800, valueKind: "estimate", evidenceNote: "Planning estimate only." }),
  ], "2026-10-23T12:00:00.000Z");
  assert.match(markdown, /Owner-entered actual platform-reported values/);
  assert.match(markdown, /Followers\/subscribers — 2,300/);
  assert.match(markdown, /Estimates — not actual results/);
  assert.match(markdown, /Average views per post\/video — 1,800/);
  assert.match(markdown, /do not turn estimates into actual results/i);
  assert.doesNotMatch(markdown, /guaranteed earnings|guaranteed views/i);
});

test("workspace JSON backup round-trips valid records and rejects malformed or duplicate archives", () => {
  const profile = safeProfile();
  const metrics = [metric()];
  const partners = [partnership()];
  const affiliates = [affiliate()];
  const checks = [...DEFAULT_READINESS_CHECKS];
  const exportedAt = "2026-10-22T12:00:00.000Z";
  const raw = createMonetizationBackupJSON(profile, metrics, partners, affiliates, checks, exportedAt);
  const restored = parseMonetizationBackupJSON(raw);
  assert.ok(restored);
  assert.deepEqual(restored.profile, profile);
  assert.deepEqual(restored.metrics, metrics);
  assert.deepEqual(restored.partnerships, partners);
  assert.deepEqual(restored.affiliates, affiliates);
  assert.deepEqual(restored.readinessChecks, checks);
  assert.equal(restored.exportedAt, exportedAt);
  assert.equal(parseMonetizationBackupJSON("not JSON"), null);
  assert.equal(parseMonetizationBackupJSON(JSON.stringify({ format: "cooking-creator-monetization-workspace", version: 9 })), null);
  assert.equal(parseMonetizationBackupJSON(createMonetizationBackupJSON(profile, [metric(), metric()], [], [], checks)), null);
});

test("merge preserves existing records, skips duplicates and rekeys ID collisions", () => {
  const original = metric();
  const same = metric({ id: "other-id" });
  const collision = metric({ id: original.id, metricName: "averageViews", value: 100 });
  const merged = mergeMonetizationRows([original], [same, collision], metricFingerprint);
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.rows.length, 2);
  assert.equal(merged.rows[0].id, original.id);
  assert.notEqual(merged.rows[1].id, original.id);
});

test("CSV exports quote cells and neutralize spreadsheet formula prefixes", async () => {
  const { serializePartnershipsCsv, serializeAffiliatesCsv } = await import("../lib/monetization-workspace");
  const partner = partnership({ brandName: "=HYPERLINK(\"https://bad.example\",\"click\")" });
  const affiliateRow = affiliate({ merchantOrProgram: "+IMPORTXML(\"https://bad.example\",\"//a\")" });
  const partnerCsv = serializePartnershipsCsv([partner]);
  const affiliateCsv = serializeAffiliatesCsv([affiliateRow]);
  assert.match(partnerCsv, /'=HYPERLINK/);
  assert.match(affiliateCsv, /'\+IMPORTXML/);
  assert.match(partnerCsv, /amount_stage/);
  assert.match(affiliateCsv, /commission_kind/);
});
