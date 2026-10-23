import { isHttpSourceUrl } from "./research-evidence";
import { getLocalDateOnly, isValidDateOnly, isValidIsoTimestamp } from "./recipe";

export const MONETIZATION_PLATFORMS = [
  "YouTube Shorts",
  "YouTube long-form",
  "Instagram Reels",
  "TikTok",
  "Other",
] as const;
export type MonetizationPlatform = (typeof MONETIZATION_PLATFORMS)[number];
export type MonetizationAgeBand = "under18" | "18plus" | "not-set";
export type ReportedValueKind = "actual" | "estimate";
export type MonetizationMetricName = "followers" | "averageViews" | "averageReach" | "engagementPercent" | "monthlyViews" | "watchTimeHours";
export type PartnershipStatus = "lead" | "negotiating" | "contracted" | "delivered" | "paid" | "closed";
export type AmountStage = "none" | "estimate" | "offered" | "contracted" | "received";
export type AffiliateStatus = "idea" | "active" | "paused" | "ended";
export type CommissionKind = "none" | "estimate" | "received";
export type ReadinessCategory = "originality" | "platformEligibility" | "ageAndPayment" | "rights" | "sponsorshipDisclosure" | "affiliateDisclosure" | "recordsAndTax";
export type ReadinessStatus = "not-reviewed" | "needs-action" | "reviewed";

export type CreatorMediaKitProfile = {
  brandName: string;
  bio: string;
  cuisineFocus: string;
  targetAudience: string;
  contentFormats: string;
  publicWebsiteUrl: string;
  ageBand: MonetizationAgeBand;
  guardianInvolved: boolean;
};

export type CreatorMetricSnapshot = {
  id: string;
  platform: MonetizationPlatform;
  metricName: MonetizationMetricName;
  value: number;
  valueKind: ReportedValueKind;
  asOfDate: string;
  sourceUrl: string;
  evidenceNote: string;
};

export type PartnershipReview = {
  writtenTermsReviewed: boolean;
  assetRightsReviewed: boolean;
  disclosureReviewed: boolean;
  ageEligibilityReviewed: boolean;
};

export type CreatorPartnership = {
  id: string;
  brandName: string;
  campaign: string;
  deliverable: string;
  platform: MonetizationPlatform;
  status: PartnershipStatus;
  dueDate: string;
  amountUsd: number | null;
  amountStage: AmountStage;
  sponsoredOrAffiliate: boolean;
  disclosureText: string;
  review: PartnershipReview;
  paymentDate: string;
  paymentEvidenceNote: string;
  notes: string;
};

export type AffiliateRecord = {
  id: string;
  merchantOrProgram: string;
  productOrService: string;
  destinationUrl: string;
  status: AffiliateStatus;
  disclosureText: string;
  disclosureReviewed: boolean;
  rightsReviewed: boolean;
  ageEligibilityReviewed: boolean;
  commissionUsd: number | null;
  commissionKind: CommissionKind;
  commissionAsOfDate: string;
  commissionEvidenceNote: string;
  notes: string;
};

export type MonetizationReadinessCheck = {
  category: ReadinessCategory;
  status: ReadinessStatus;
  reviewedDate: string;
  sourceUrl: string;
  notes: string;
};

export type MonetizationWorkspaceBackup = {
  format: "cooking-creator-monetization-workspace";
  version: 1;
  exportedAt: string;
  profile: CreatorMediaKitProfile;
  metrics: CreatorMetricSnapshot[];
  partnerships: CreatorPartnership[];
  affiliates: AffiliateRecord[];
  readinessChecks: MonetizationReadinessCheck[];
  // Parser-only warnings are omitted from newly generated exports.
  migrationWarnings?: string[];
};

export const DEFAULT_MEDIA_KIT_PROFILE: CreatorMediaKitProfile = {
  brandName: "",
  bio: "",
  cuisineFocus: "",
  targetAudience: "US home-cooking audience (target audience, not verified demographics)",
  contentFormats: "YouTube Shorts, Instagram Reels",
  publicWebsiteUrl: "",
  ageBand: "not-set",
  guardianInvolved: false,
};

export const DEFAULT_PARTNERSHIP_REVIEW: PartnershipReview = {
  writtenTermsReviewed: false,
  assetRightsReviewed: false,
  disclosureReviewed: false,
  ageEligibilityReviewed: false,
};

export const READINESS_CATEGORIES: ReadinessCategory[] = [
  "originality", "platformEligibility", "ageAndPayment", "rights",
  "sponsorshipDisclosure", "affiliateDisclosure", "recordsAndTax",
];

export const READINESS_LABELS: Record<ReadinessCategory, string> = {
  originality: "Original-content standards",
  platformEligibility: "Current platform monetization eligibility",
  ageAndPayment: "Age, guardian and payment eligibility",
  rights: "Recipe, footage, image and music rights",
  sponsorshipDisclosure: "Sponsorship and gifted-product disclosure",
  affiliateDisclosure: "Affiliate-link disclosure",
  recordsAndTax: "Payment records and applicable tax obligations",
};

export const DEFAULT_READINESS_CHECKS: MonetizationReadinessCheck[] = READINESS_CATEGORIES.map((category) => ({
  category,
  status: "not-reviewed",
  reviewedDate: "",
  sourceUrl: "",
  notes: "",
}));

const MAX_WORKSPACE_CHARS = 5_000_000;
const MAX_ROWS = 2_000;
const MAX_TEXT = 2_000;
const MAX_USD = 1_000_000_000;
const METRIC_NAMES: readonly MonetizationMetricName[] = ["followers", "averageViews", "averageReach", "engagementPercent", "monthlyViews", "watchTimeHours"];
const PARTNERSHIP_STATUSES: readonly PartnershipStatus[] = ["lead", "negotiating", "contracted", "delivered", "paid", "closed"];
const AMOUNT_STAGES: readonly AmountStage[] = ["none", "estimate", "offered", "contracted", "received"];
const AFFILIATE_STATUSES: readonly AffiliateStatus[] = ["idea", "active", "paused", "ended"];
const COMMISSION_KINDS: readonly CommissionKind[] = ["none", "estimate", "received"];
const AGE_BANDS: readonly MonetizationAgeBand[] = ["under18", "18plus", "not-set"];
const READINESS_STATUSES: readonly ReadinessStatus[] = ["not-reviewed", "needs-action", "reviewed"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedText(value: unknown, max: number, required: boolean): value is string {
  return typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
}
function enumValue<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}
function validUsd(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_USD);
}
function optionalSafeUrl(value: unknown, label: string, errors: string[]): void {
  if (!boundedText(value, 2_000, false)) {
    errors.push(`${label} must be 2,000 characters or fewer.`);
  } else if (value.trim() && !isHttpSourceUrl(value)) {
    errors.push(`${label} must be a safe public HTTP(S) URL.`);
  }
}

export function validateMediaKitProfile(value: unknown, strictPublicUrl = true): string[] {
  if (!isObject(value)) return ["Media-kit profile must be an object."];
  const errors: string[] = [];
  if (!boundedText(value.brandName, 180, false)) errors.push("Brand name must be 180 characters or fewer.");
  if (!boundedText(value.bio, 1_000, false)) errors.push("Creator bio must be 1,000 characters or fewer.");
  if (!boundedText(value.cuisineFocus, 300, false)) errors.push("Cuisine focus must be 300 characters or fewer.");
  if (!boundedText(value.targetAudience, 500, false)) errors.push("Target audience must be 500 characters or fewer.");
  if (!boundedText(value.contentFormats, 300, false)) errors.push("Content formats must be 300 characters or fewer.");
  if (strictPublicUrl) optionalSafeUrl(value.publicWebsiteUrl, "Public website", errors);
  else if (!boundedText(value.publicWebsiteUrl, 2_000, false)) errors.push("Public website URL must be 2,000 characters or fewer.");
  if (!enumValue(value.ageBand, AGE_BANDS)) errors.push("Choose an age/payment eligibility setting.");
  if (typeof value.guardianInvolved !== "boolean") errors.push("Guardian-involvement setting is invalid.");
  return errors;
}

export function validateCreatorMetricSnapshot(value: unknown): string[] {
  if (!isObject(value)) return ["Metric snapshot must be an object."];
  const errors: string[] = [];
  if (!boundedText(value.id, 160, true)) errors.push("Metric ID is required and must be at most 160 characters.");
  if (!enumValue(value.platform, MONETIZATION_PLATFORMS)) errors.push("Choose a supported platform.");
  if (!enumValue(value.metricName, METRIC_NAMES)) errors.push("Choose a supported metric name.");
  if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 1_000_000_000_000) {
    errors.push("Metric value must be a non-negative finite number within the supported range.");
  } else if ((value.metricName === "followers" || value.metricName === "averageViews" || value.metricName === "averageReach" || value.metricName === "monthlyViews") && !Number.isSafeInteger(value.value)) {
    errors.push("Follower/view/reach metrics must be whole numbers.");
  } else if (value.metricName === "engagementPercent" && value.value > 100) {
    errors.push("Engagement percentage must be between 0 and 100.");
  } else if (value.metricName === "watchTimeHours" && value.value > 1_000_000) {
    errors.push("Watch-time hours exceed the supported range.");
  }
  if (!enumValue(value.valueKind, ["actual", "estimate"])) errors.push("Label the value as actual or estimate.");
  if (typeof value.asOfDate !== "string" || !isValidDateOnly(value.asOfDate)) errors.push("Metric date must be a real YYYY-MM-DD date.");
  else if (value.asOfDate > getLocalDateOnly()) errors.push("Metric as-of date cannot be in the future.");
  optionalSafeUrl(value.sourceUrl, "Metric source URL", errors);
  if (!boundedText(value.evidenceNote, 1_000, true)) errors.push("Record where this value came from or why it is an estimate.");
  return errors;
}

export function validatePartnership(value: unknown, profile: CreatorMediaKitProfile): string[] {
  if (!isObject(value)) return ["Partnership record must be an object."];
  const errors: string[] = [];
  if (!boundedText(value.id, 160, true)) errors.push("Partnership ID is required.");
  if (!boundedText(value.brandName, 180, true)) errors.push("Brand/partner name is required.");
  if (!boundedText(value.campaign, 240, true)) errors.push("Campaign or product is required.");
  if (!boundedText(value.deliverable, 500, true)) errors.push("Describe the agreed or proposed deliverable.");
  if (!enumValue(value.platform, MONETIZATION_PLATFORMS)) errors.push("Choose a supported platform.");
  if (!enumValue(value.status, PARTNERSHIP_STATUSES)) errors.push("Choose a supported partnership status.");
  if (typeof value.dueDate !== "string" || (value.dueDate !== "" && !isValidDateOnly(value.dueDate))) errors.push("Due date must be blank or a real YYYY-MM-DD date.");
  if (!validUsd(value.amountUsd)) errors.push("USD amount must be blank or a non-negative valid amount.");
  if (!enumValue(value.amountStage, AMOUNT_STAGES)) errors.push("Choose how the amount should be interpreted.");
  if (typeof value.sponsoredOrAffiliate !== "boolean") errors.push("Disclosure requirement setting is invalid.");
  if (!boundedText(value.disclosureText, 1_000, false)) errors.push("Disclosure text must be 1,000 characters or fewer.");
  if (!isObject(value.review) ||
      typeof value.review.writtenTermsReviewed !== "boolean" ||
      typeof value.review.assetRightsReviewed !== "boolean" ||
      typeof value.review.disclosureReviewed !== "boolean" ||
      typeof value.review.ageEligibilityReviewed !== "boolean") {
    errors.push("Partnership review checklist is malformed.");
  }
  if (typeof value.paymentDate !== "string" || (value.paymentDate !== "" && !isValidDateOnly(value.paymentDate))) errors.push("Payment date must be blank or a real YYYY-MM-DD date.");
  if (typeof value.paymentDate === "string" && value.paymentDate && isValidDateOnly(value.paymentDate) && value.paymentDate > getLocalDateOnly()) errors.push("Payment date cannot be in the future.");
  if (!boundedText(value.paymentEvidenceNote, 1_000, false)) errors.push("Payment evidence note must be 1,000 characters or fewer.");
  if (!boundedText(value.notes, MAX_TEXT, false)) errors.push("Partnership notes must be 2,000 characters or fewer.");

  const advanced = value.status === "contracted" || value.status === "delivered" || value.status === "paid";
  if (advanced && isObject(value.review)) {
    if (!value.review.writtenTermsReviewed) errors.push("Review the written terms before a partnership becomes contracted, delivered or paid.");
    if (!value.review.assetRightsReviewed) errors.push("Review asset/usage rights before a partnership becomes contracted, delivered or paid.");
    if (!value.review.disclosureReviewed) errors.push("Review sponsorship/gift disclosure requirements before advancing this partnership.");
    if (!value.review.ageEligibilityReviewed) errors.push("Check current platform age, eligibility and payment requirements before advancing this partnership.");
    if (value.sponsoredOrAffiliate && (!boundedText(value.disclosureText, 1_000, true))) errors.push("Add the required sponsorship/affiliate disclosure text before advancing.");
    if (profile.ageBand === "not-set") errors.push("Record the creator age band in the profile (Under 18 or 18+) before advancing a paid partnership. The app will not infer eligibility.");
    if (profile.ageBand === "under18" && !profile.guardianInvolved) errors.push("A parent/legal guardian must be involved with contracts and payments for a creator under 18. Do not bypass platform age rules.");
  }
  if (value.status === "paid") {
    if (value.amountStage !== "received" || typeof value.amountUsd !== "number" || value.amountUsd <= 0) errors.push("Only mark a cash partnership Paid after recording a positive amount actually received in USD.");
    if (typeof value.paymentDate !== "string" || !isValidDateOnly(value.paymentDate) || value.paymentDate > getLocalDateOnly()) errors.push("A Paid partnership needs a real, non-future payment date.");
    if (!boundedText(value.paymentEvidenceNote, 1_000, true)) errors.push("Record the real payment reference or note before treating the amount as received income.");
  } else if (value.amountStage === "received") {
    errors.push("An amount marked Received must use Paid status so received income is not confused with an offer or contract.");
  }
  if (value.amountStage === "contracted" && !["contracted", "delivered", "closed"].includes(String(value.status))) {
    errors.push("A contracted amount must use Contracted or Delivered status (or remain archived as Closed); do not classify a lead or offer as contracted.");
  }
  if ((value.amountStage === "estimate" || value.amountStage === "offered") && ["contracted", "delivered", "paid"].includes(String(value.status))) {
    errors.push("A contracted, delivered or paid partnership cannot retain Estimate/Offer amount basis. Use Contracted for an agreed amount or Received for payment actually received.");
  }
  return errors;
}

export function validateAffiliateRecord(value: unknown, profile: CreatorMediaKitProfile): string[] {
  if (!isObject(value)) return ["Affiliate record must be an object."];
  const errors: string[] = [];
  if (!boundedText(value.id, 160, true)) errors.push("Affiliate ID is required.");
  if (!boundedText(value.merchantOrProgram, 180, true)) errors.push("Merchant or program is required.");
  if (!boundedText(value.productOrService, 240, true)) errors.push("Product/service is required.");
  optionalSafeUrl(value.destinationUrl, "Affiliate destination", errors);
  if (!enumValue(value.status, AFFILIATE_STATUSES)) errors.push("Choose a supported affiliate status.");
  if (!boundedText(value.disclosureText, 1_000, false)) errors.push("Disclosure text must be 1,000 characters or fewer.");
  if (typeof value.disclosureReviewed !== "boolean" || typeof value.rightsReviewed !== "boolean" || typeof value.ageEligibilityReviewed !== "boolean") errors.push("Affiliate review flags are malformed.");
  if (!validUsd(value.commissionUsd)) errors.push("Commission must be blank or a non-negative valid USD amount.");
  if (!enumValue(value.commissionKind, COMMISSION_KINDS)) errors.push("Choose estimate, received or no commission record.");
  if (typeof value.commissionAsOfDate !== "string" || (value.commissionAsOfDate !== "" && !isValidDateOnly(value.commissionAsOfDate))) errors.push("Commission date must be blank or a real YYYY-MM-DD date.");
  if (typeof value.commissionAsOfDate === "string" && value.commissionAsOfDate && isValidDateOnly(value.commissionAsOfDate) && value.commissionAsOfDate > getLocalDateOnly()) errors.push("Commission date cannot be in the future.");
  if (!boundedText(value.commissionEvidenceNote, 1_000, false)) errors.push("Commission evidence note must be 1,000 characters or fewer.");
  if (!boundedText(value.notes, MAX_TEXT, false)) errors.push("Affiliate notes must be 2,000 characters or fewer.");
  if (value.status === "active") {
    if (!value.ageEligibilityReviewed) errors.push("Check current platform age, eligibility and payment rules before activating an affiliate relationship.");
    if (profile.ageBand === "not-set") errors.push("Record the creator age band in the profile before activating an affiliate relationship. The app will not infer eligibility.");
    if (profile.ageBand === "under18" && !profile.guardianInvolved) errors.push("A parent/legal guardian must be involved in affiliate agreements and payment review for a creator under 18. Do not bypass platform age rules.");
    if (!isHttpSourceUrl(value.destinationUrl)) errors.push("Active affiliate links need a safe public HTTP(S) destination.");
    if (!boundedText(value.disclosureText, 1_000, true) || !value.disclosureReviewed) errors.push("Active affiliate links need clear disclosure text that the owner has reviewed.");
    if (!value.rightsReviewed) errors.push("Review relevant product/media rights before activating an affiliate link.");
  }
  if (value.commissionKind === "received") {
    if (typeof value.commissionUsd !== "number") errors.push("Received commission needs a recorded actual USD amount.");
    if (typeof value.commissionAsOfDate !== "string" || !isValidDateOnly(value.commissionAsOfDate) || value.commissionAsOfDate > getLocalDateOnly()) errors.push("Received commission needs a real, non-future record date.");
    if (!boundedText(value.commissionEvidenceNote, 1_000, true)) errors.push("Record where the actual commission value came from.");
  } else if (typeof value.commissionUsd === "number" && value.commissionKind === "none") {
    errors.push("A commission amount must be labelled Estimate or Received, not None.");
  }
  return errors;
}

export function validateReadinessCheck(value: unknown): string[] {
  if (!isObject(value)) return ["Readiness check must be an object."];
  const errors: string[] = [];
  if (!enumValue(value.category, READINESS_CATEGORIES)) errors.push("Choose a supported readiness category.");
  if (!enumValue(value.status, READINESS_STATUSES)) errors.push("Choose a supported review status.");
  if (typeof value.reviewedDate !== "string" || (value.reviewedDate !== "" && !isValidDateOnly(value.reviewedDate))) errors.push("Review date must be blank or a real YYYY-MM-DD date.");
  if (typeof value.reviewedDate === "string" && value.reviewedDate && isValidDateOnly(value.reviewedDate) && value.reviewedDate > getLocalDateOnly()) errors.push("Review date cannot be in the future.");
  if (value.status === "reviewed") optionalSafeUrl(value.sourceUrl, "Readiness evidence URL", errors);
  else if (!boundedText(value.sourceUrl, 2_000, false)) errors.push("Readiness evidence URL must be 2,000 characters or fewer.");
  if (!boundedText(value.notes, 1_000, false)) errors.push("Review notes must be 1,000 characters or fewer.");
  if (value.status === "reviewed" && (!isValidDateOnly(String(value.reviewedDate)) || String(value.reviewedDate) > getLocalDateOnly() || !isHttpSourceUrl(value.sourceUrl) || !boundedText(value.notes, 1_000, true))) {
    errors.push("A reviewed readiness item needs a real past/today review date, a safe public source URL and notes about what you checked.");
  }
  if (value.status === "needs-action" && !boundedText(value.notes, 1_000, true)) errors.push("Record the action needed before marking this item Needs action.");
  return errors;
}

export function isMetricSnapshot(value: unknown): value is CreatorMetricSnapshot {
  return validateCreatorMetricSnapshot(value).length === 0;
}
export function isPartnership(value: unknown, profile: CreatorMediaKitProfile): value is CreatorPartnership {
  return validatePartnership(value, profile).length === 0;
}
export function isAffiliateRecord(value: unknown, profile: CreatorMediaKitProfile): value is AffiliateRecord {
  return validateAffiliateRecord(value, profile).length === 0;
}

export function actualReceivedPartnershipUsd(partnerships: CreatorPartnership[]): number {
  return roundUsd(partnerships.filter((record) => record.status === "paid" && record.amountStage === "received" && typeof record.amountUsd === "number")
    .reduce((sum, record) => sum + (record.amountUsd ?? 0), 0));
}
export function contractedPartnershipUsd(partnerships: CreatorPartnership[]): number {
  return roundUsd(partnerships.filter((record) => (record.status === "contracted" || record.status === "delivered") && record.amountStage === "contracted" && typeof record.amountUsd === "number")
    .reduce((sum, record) => sum + (record.amountUsd ?? 0), 0));
}
export function estimatedPartnerUsd(partnerships: CreatorPartnership[]): number {
  return roundUsd(partnerships.filter((record) => (record.status === "lead" || record.status === "negotiating") && (record.amountStage === "estimate" || record.amountStage === "offered"))
    .reduce((sum, record) => sum + (record.amountUsd ?? 0), 0));
}
export function actualReceivedAffiliateUsd(affiliates: AffiliateRecord[]): number {
  return roundUsd(affiliates.filter((record) => record.commissionKind === "received" && typeof record.commissionUsd === "number")
    .reduce((sum, record) => sum + (record.commissionUsd ?? 0), 0));
}
export function estimatedAffiliateUsd(affiliates: AffiliateRecord[]): number {
  return roundUsd(affiliates.filter((record) => record.commissionKind === "estimate")
    .reduce((sum, record) => sum + (record.commissionUsd ?? 0), 0));
}
function roundUsd(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

export function createMonetizationBackupJSON(
  profile: CreatorMediaKitProfile,
  metrics: CreatorMetricSnapshot[],
  partnerships: CreatorPartnership[],
  affiliates: AffiliateRecord[],
  readinessChecks: MonetizationReadinessCheck[],
  exportedAt = new Date().toISOString(),
): string {
  const validProfile = validateMediaKitProfile(profile, false).length === 0 ? profile : DEFAULT_MEDIA_KIT_PROFILE;
  const validMetrics = metrics.filter(isMetricSnapshot);
  const validPartnerships = partnerships.filter((item) => isPartnership(item, validProfile));
  const validAffiliates = affiliates.filter((item) => isAffiliateRecord(item, validProfile));
  const validChecks = readinessChecks.filter((item) => validateReadinessCheck(item).length === 0);
  return JSON.stringify({
    format: "cooking-creator-monetization-workspace",
    version: 1,
    exportedAt,
    profile: validProfile,
    metrics: validMetrics,
    partnerships: validPartnerships,
    affiliates: validAffiliates,
    readinessChecks: validChecks,
  } satisfies MonetizationWorkspaceBackup, null, 2);
}

export function parseMonetizationBackupJSON(raw: string): MonetizationWorkspaceBackup | null {
  if (raw.length > MAX_WORKSPACE_CHARS) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!isObject(parsed) || parsed.format !== "cooking-creator-monetization-workspace" ||
      parsed.version !== 1 || typeof parsed.exportedAt !== "string" || !isValidIsoTimestamp(parsed.exportedAt) ||
      !isObject(parsed.profile) || !Array.isArray(parsed.metrics) || !Array.isArray(parsed.partnerships) ||
      !Array.isArray(parsed.affiliates) || !Array.isArray(parsed.readinessChecks) ||
      parsed.metrics.length > MAX_ROWS || parsed.partnerships.length > MAX_ROWS ||
      parsed.affiliates.length > MAX_ROWS || parsed.readinessChecks.length > READINESS_CATEGORIES.length) return null;
  const profile = parsed.profile as unknown as CreatorMediaKitProfile;
  if (validateMediaKitProfile(profile, false).length) return null;
  const metrics = parsed.metrics as unknown[];
  const partnerships = parsed.partnerships as unknown[];
  const affiliates = parsed.affiliates as unknown[];
  const readinessChecks = parsed.readinessChecks as unknown[];
  if (metrics.some((item) => !isMetricSnapshot(item)) ||
      partnerships.some((item) => !isPartnership(item, profile)) ||
      affiliates.some((item) => !isAffiliateRecord(item, profile)) ||
      readinessChecks.some((item) => validateReadinessCheck(item).length > 0)) return null;
  if (new Set(metrics.map((item) => (item as CreatorMetricSnapshot).id)).size !== metrics.length) return null;
  if (new Set(partnerships.map((item) => (item as CreatorPartnership).id)).size !== partnerships.length) return null;
  if (new Set(affiliates.map((item) => (item as AffiliateRecord).id)).size !== affiliates.length) return null;
  if (new Set(readinessChecks.map((item) => (item as MonetizationReadinessCheck).category)).size !== readinessChecks.length) return null;
  return {
    format: "cooking-creator-monetization-workspace",
    version: 1,
    exportedAt: parsed.exportedAt,
    profile,
    metrics: metrics as CreatorMetricSnapshot[],
    partnerships: partnerships as CreatorPartnership[],
    affiliates: affiliates as AffiliateRecord[],
    readinessChecks: readinessChecks as MonetizationReadinessCheck[],
  };
}

export function mergeMonetizationRows<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  fingerprint: (item: T) => string,
): { rows: T[]; added: number; duplicates: number } {
  const rows = [...existing];
  const fingerprints = new Set(existing.map(fingerprint));
  const ids = new Set(existing.map((item) => item.id));
  let added = 0;
  let duplicates = 0;
  for (const candidate of incoming) {
    const key = fingerprint(candidate);
    if (fingerprints.has(key)) { duplicates += 1; continue; }
    let next = candidate;
    if (ids.has(candidate.id)) {
      let suffix = 2;
      let nextId = `${candidate.id}-import-${suffix}`;
      while (ids.has(nextId)) { suffix += 1; nextId = `${candidate.id}-import-${suffix}`; }
      next = { ...candidate, id: nextId };
    }
    ids.add(next.id);
    fingerprints.add(key);
    rows.push(next);
    added += 1;
  }
  return { rows, added, duplicates };
}

export function metricFingerprint(item: CreatorMetricSnapshot): string {
  return [item.platform, item.metricName, item.asOfDate, item.valueKind, String(item.value)]
    .map((part) => part.trim().toLocaleLowerCase("en-US")).join("|");
}
export function partnershipFingerprint(item: CreatorPartnership): string {
  return [item.brandName, item.campaign, item.deliverable, item.platform]
    .map((part) => part.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ")).join("|");
}
export function affiliateFingerprint(item: AffiliateRecord): string {
  return [item.merchantOrProgram, item.productOrService, item.destinationUrl]
    .map((part) => part.trim().toLocaleLowerCase("en-US")).join("|");
}

export function buildMediaKitMarkdown(
  profile: CreatorMediaKitProfile,
  metrics: CreatorMetricSnapshot[],
  generatedAt = new Date().toISOString(),
): string {
  const cleanProfile = validateMediaKitProfile(profile).length ? DEFAULT_MEDIA_KIT_PROFILE : profile;
  const actual = metrics.filter((item) => isMetricSnapshot(item) && item.valueKind === "actual");
  const estimates = metrics.filter((item) => isMetricSnapshot(item) && item.valueKind === "estimate");
  const lines = [
    `# ${cleanProfile.brandName.trim() || "Cooking Creator — Media Kit"}`,
    "",
    `Prepared: ${generatedAt.slice(0, 10)}`,
    "",
    "## Creator overview",
    cleanProfile.bio.trim() || "Bio not provided.",
    "",
    `- Cuisine / content focus: ${cleanProfile.cuisineFocus.trim() || "Not specified"}`,
    `- Target audience: ${cleanProfile.targetAudience.trim() || "Not specified"}`,
    `- Content formats: ${cleanProfile.contentFormats.trim() || "Not specified"}`,
    ...(cleanProfile.publicWebsiteUrl ? [`- Public website: ${cleanProfile.publicWebsiteUrl}`] : []),
    "",
    "## Owner-entered actual platform-reported values",
    "These numbers were entered by the owner from their stated source notes. They are not independently verified; do not publish a claim that differs from the underlying platform record.",
    ...(actual.length ? actual.map((item) => `- ${metricLabel(item.metricName)} — ${item.value.toLocaleString("en-US")}${item.metricName === "engagementPercent" ? "%" : ""} · ${item.platform} · as of ${item.asOfDate} · note: ${item.evidenceNote} · source: ${item.sourceUrl || "not recorded"}`) : ["- No actual metrics recorded."]),
    "",
    "## Estimates — not actual results",
    ...(estimates.length ? estimates.map((item) => `- ${metricLabel(item.metricName)} — ${item.value.toLocaleString("en-US")}${item.metricName === "engagementPercent" ? "%" : ""} · ${item.platform} · as of ${item.asOfDate} · estimate note: ${item.evidenceNote} · source: ${item.sourceUrl || "not recorded"}`) : ["- No estimates recorded."]),
    "",
    "## Important notes",
    "- A media kit is a factual summary, not a promise of views, engagement, eligibility or revenue.",
    "- Refresh numbers from the platform before sending. Do not turn estimates into actual results.",
    "- Brand deals, affiliate relationships, rights, age requirements and payment terms need owner review. If the creator is under 18, involve a parent/legal guardian in contracts and payment setup; never bypass platform rules.",
    "",
  ];
  return lines.join("\n");
}

function metricLabel(value: MonetizationMetricName): string {
  const labels: Record<MonetizationMetricName, string> = {
    followers: "Followers/subscribers",
    averageViews: "Average views per post/video",
    averageReach: "Average reach/impressions",
    engagementPercent: "Engagement rate",
    monthlyViews: "Monthly views",
    watchTimeHours: "Watch time hours",
  };
  return labels[value];
}

export function serializePartnershipsCsv(items: CreatorPartnership[]): string {
  const headers = ["brand_name", "campaign", "deliverable", "platform", "status", "due_date", "amount_usd", "amount_stage", "sponsored_or_affiliate", "disclosure_reviewed", "rights_reviewed", "terms_reviewed", "age_eligibility_reviewed", "payment_date", "payment_evidence_note", "notes"];
  const rows = items.map((item) => [
    item.brandName, item.campaign, item.deliverable, item.platform, item.status, item.dueDate,
    item.amountUsd === null ? "" : item.amountUsd, item.amountStage, String(item.sponsoredOrAffiliate),
    String(item.review.disclosureReviewed), String(item.review.assetRightsReviewed), String(item.review.writtenTermsReviewed),
    String(item.review.ageEligibilityReviewed), item.paymentDate, item.paymentEvidenceNote, item.notes,
  ].map(csvCell).join(","));
  return [headers.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}

export function serializeAffiliatesCsv(items: AffiliateRecord[]): string {
  const headers = ["merchant_or_program", "product_or_service", "destination_url", "status", "disclosure_text", "disclosure_reviewed", "rights_reviewed", "commission_usd", "commission_kind", "commission_as_of_date", "commission_evidence_note", "notes"];
  const rows = items.map((item) => [
    item.merchantOrProgram, item.productOrService, item.destinationUrl, item.status, item.disclosureText,
    String(item.disclosureReviewed), String(item.rightsReviewed), item.commissionUsd === null ? "" : item.commissionUsd,
    item.commissionKind, item.commissionAsOfDate, item.commissionEvidenceNote, item.notes,
  ].map(csvCell).join(","));
  return [headers.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^(?:\s*[=+@\-]|[\t\r])/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
