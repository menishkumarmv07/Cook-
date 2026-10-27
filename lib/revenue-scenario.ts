export const REVENUE_SCENARIO_SCHEMA_VERSION = 1 as const;
const MAX_USD = 1_000_000_000;
const MAX_COUNT = 1_000_000_000_000;
const MAX_RPM = 1_000_000;
const MAX_PERCENT = 100;

export type RevenueScenarioInputs = {
  /** A planning target, not an income prediction. */
  targetMonthlyNetUsd: number;
  expectedMonthlyViews: number;
  assumedAdRpmUsd: number | null;
  expectedAffiliateClicks: number;
  assumedAffiliateConversionPercent: number | null;
  assumedCommissionPerConversionUsd: number | null;
  expectedSponsoredDealsPerMonth: number;
  assumedSponsorFeeUsd: number | null;
  monthlyOperatingCostsUsd: number;
};

export type RevenueScenarioOutput = {
  schemaVersion: typeof REVENUE_SCENARIO_SCHEMA_VERSION;
  targetMonthlyNetUsd: number;
  adRevenueUsd: number | null;
  affiliateRevenueUsd: number | null;
  sponsorshipRevenueUsd: number | null;
  modeledGrossUsd: number;
  operatingCostsUsd: number;
  modeledNetUsd: number;
  targetGapUsd: number;
  additionalMonthlyViewsNeeded: number | null;
  incompleteAssumptions: string[];
  caveats: string[];
};

export type RevenueScenarioDraft = {
  targetMonthlyNetUsd: string;
  expectedMonthlyViews: string;
  assumedAdRpmUsd: string;
  expectedAffiliateClicks: string;
  assumedAffiliateConversionPercent: string;
  assumedCommissionPerConversionUsd: string;
  expectedSponsoredDealsPerMonth: string;
  assumedSponsorFeeUsd: string;
  monthlyOperatingCostsUsd: string;
};

export const DEFAULT_REVENUE_SCENARIO_DRAFT: RevenueScenarioDraft = {
  targetMonthlyNetUsd: "1500",
  expectedMonthlyViews: "0",
  assumedAdRpmUsd: "",
  expectedAffiliateClicks: "0",
  assumedAffiliateConversionPercent: "",
  assumedCommissionPerConversionUsd: "",
  expectedSponsoredDealsPerMonth: "0",
  assumedSponsorFeeUsd: "",
  monthlyOperatingCostsUsd: "0",
};

const DRAFT_FIELDS: readonly (keyof RevenueScenarioDraft)[] = [
  "targetMonthlyNetUsd",
  "expectedMonthlyViews",
  "assumedAdRpmUsd",
  "expectedAffiliateClicks",
  "assumedAffiliateConversionPercent",
  "assumedCommissionPerConversionUsd",
  "expectedSponsoredDealsPerMonth",
  "assumedSponsorFeeUsd",
  "monthlyOperatingCostsUsd",
];

export function validateRevenueScenarioDraft(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return ["Scenario draft must be an object."];
  const object = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const field of DRAFT_FIELDS) {
    const draftValue = object[field];
    if (typeof draftValue !== "string" || draftValue.length > 64 ||
        (draftValue !== "" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(draftValue))) {
      errors.push(field + " must be a blank or valid non-negative numeric input of 64 characters or fewer.");
    }
  }
  return errors;
}

export function createRevenueScenarioBackupJSON(draft: RevenueScenarioDraft, exportedAt = new Date().toISOString()): string {
  const errors = validateRevenueScenarioDraft(draft);
  if (errors.length) throw new Error(errors.join(" "));
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error("Export timestamp must be a valid ISO date/time.");
  return JSON.stringify({
    format: "cooking-creator-revenue-scenario",
    version: REVENUE_SCENARIO_SCHEMA_VERSION,
    exportedAt,
    draft,
  }, null, 2);
}

export function parseRevenueScenarioBackupJSON(raw: string): RevenueScenarioDraft | null {
  if (typeof raw !== "string" || raw.length > 100_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const object = parsed as Record<string, unknown>;
    if (object.format !== "cooking-creator-revenue-scenario" ||
        object.version !== REVENUE_SCENARIO_SCHEMA_VERSION ||
        typeof object.exportedAt !== "string" || !Number.isFinite(Date.parse(object.exportedAt))) return null;
    return validateRevenueScenarioDraft(object.draft).length === 0
      ? object.draft as RevenueScenarioDraft
      : null;
  } catch {
    return null;
  }
}

function parseInput(value: string, blankValue: number | null = null): number | null {
  if (value.trim() === "") return blankValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function revenueScenarioInputsFromDraft(draft: RevenueScenarioDraft): RevenueScenarioInputs {
  const errors = validateRevenueScenarioDraft(draft);
  if (errors.length) throw new Error(errors.join(" "));
  const required = (value: string): number => parseInput(value, Number.NaN) as number;
  return {
    targetMonthlyNetUsd: required(draft.targetMonthlyNetUsd),
    expectedMonthlyViews: required(draft.expectedMonthlyViews),
    assumedAdRpmUsd: parseInput(draft.assumedAdRpmUsd),
    expectedAffiliateClicks: required(draft.expectedAffiliateClicks),
    assumedAffiliateConversionPercent: parseInput(draft.assumedAffiliateConversionPercent),
    assumedCommissionPerConversionUsd: parseInput(draft.assumedCommissionPerConversionUsd),
    expectedSponsoredDealsPerMonth: required(draft.expectedSponsoredDealsPerMonth),
    assumedSponsorFeeUsd: parseInput(draft.assumedSponsorFeeUsd),
    monthlyOperatingCostsUsd: required(draft.monthlyOperatingCostsUsd),
  };
}

export const DEFAULT_REVENUE_SCENARIO_INPUTS: RevenueScenarioInputs = {
  // Editable goal equivalent to $50/day over a 30-day planning month.
  // It is a target supplied as an example, not a claim that the app can earn it.
  targetMonthlyNetUsd: 1_500,
  expectedMonthlyViews: 0,
  assumedAdRpmUsd: null,
  expectedAffiliateClicks: 0,
  assumedAffiliateConversionPercent: null,
  assumedCommissionPerConversionUsd: null,
  expectedSponsoredDealsPerMonth: 0,
  assumedSponsorFeeUsd: null,
  monthlyOperatingCostsUsd: 0,
};

function isFiniteRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isWholeInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteRange(value, min, max) && Number.isSafeInteger(value);
}

function validOptionalRate(value: unknown, max: number): value is number | null {
  return value === null || isFiniteRange(value, 0, max);
}

export function validateRevenueScenarioInputs(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["Scenario inputs must be an object."];
  }
  const input = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!isFiniteRange(input.targetMonthlyNetUsd, 0, MAX_USD)) errors.push("Monthly net-income target must be a finite USD amount from 0 to 1,000,000,000.");
  if (!isWholeInRange(input.expectedMonthlyViews, 0, MAX_COUNT)) errors.push("Expected monthly views must be a non-negative whole number within the supported range.");
  if (!validOptionalRate(input.assumedAdRpmUsd, MAX_RPM)) errors.push("Assumed ad RPM must be blank or a finite USD amount from 0 to 1,000,000.");
  if (!isWholeInRange(input.expectedAffiliateClicks, 0, MAX_COUNT)) errors.push("Expected affiliate clicks must be a non-negative whole number within the supported range.");
  if (!validOptionalRate(input.assumedAffiliateConversionPercent, MAX_PERCENT)) errors.push("Assumed affiliate conversion percentage must be blank or from 0 to 100.");
  if (!validOptionalRate(input.assumedCommissionPerConversionUsd, MAX_USD)) errors.push("Assumed commission per conversion must be blank or a finite USD amount from 0 to 1,000,000,000.");
  if (!isWholeInRange(input.expectedSponsoredDealsPerMonth, 0, 1_000)) errors.push("Expected sponsored deals per month must be a whole number from 0 to 1,000.");
  if (!validOptionalRate(input.assumedSponsorFeeUsd, MAX_USD)) errors.push("Assumed sponsorship fee must be blank or a finite USD amount from 0 to 1,000,000,000.");
  if (!isFiniteRange(input.monthlyOperatingCostsUsd, 0, MAX_USD)) errors.push("Monthly operating costs must be a finite USD amount from 0 to 1,000,000,000.");
  return errors;
}

function revenueForViews(views: number, rpm: number | null): number | null {
  if (rpm === null) return views === 0 ? 0 : null;
  return (views / 1_000) * rpm;
}

function revenueForAffiliates(
  clicks: number,
  conversionPercent: number | null,
  commissionUsd: number | null,
): number | null {
  if (clicks === 0) return 0;
  if (conversionPercent === null || commissionUsd === null) return null;
  return clicks * (conversionPercent / 100) * commissionUsd;
}

function revenueForSponsorships(deals: number, feeUsd: number | null): number | null {
  if (deals === 0) return 0;
  if (feeUsd === null) return null;
  return deals * feeUsd;
}

/**
 * Calculates an explicitly assumption-based scenario. It never fetches platform data,
 * assumes eligibility, converts estimates into actual receipts, or predicts future income.
 */
export function calculateRevenueScenario(input: RevenueScenarioInputs): RevenueScenarioOutput {
  const errors = validateRevenueScenarioInputs(input);
  if (errors.length) throw new Error(errors.join(" "));

  const adRevenueUsd = revenueForViews(input.expectedMonthlyViews, input.assumedAdRpmUsd);
  const affiliateRevenueUsd = revenueForAffiliates(
    input.expectedAffiliateClicks,
    input.assumedAffiliateConversionPercent,
    input.assumedCommissionPerConversionUsd,
  );
  const sponsorshipRevenueUsd = revenueForSponsorships(
    input.expectedSponsoredDealsPerMonth,
    input.assumedSponsorFeeUsd,
  );

  const streams = [
    { name: "ad RPM", value: adRevenueUsd },
    { name: "affiliate conversion and commission", value: affiliateRevenueUsd },
    { name: "average sponsorship fee", value: sponsorshipRevenueUsd },
  ];
  const incompleteAssumptions = streams.filter((stream) => stream.value === null).map((stream) => stream.name);
  const modeledGrossUsd = streams.reduce((sum, stream) => sum + (stream.value ?? 0), 0);
  const modeledNetUsd = modeledGrossUsd - input.monthlyOperatingCostsUsd;
  const targetGapUsd = Math.max(0, input.targetMonthlyNetUsd - modeledNetUsd);

  const nonAdStreamsKnown =
    affiliateRevenueUsd !== null &&
    sponsorshipRevenueUsd !== null;
  let additionalMonthlyViewsNeeded: number | null = null;
  if (targetGapUsd === 0) {
    additionalMonthlyViewsNeeded = 0;
  } else if (nonAdStreamsKnown && input.assumedAdRpmUsd !== null && input.assumedAdRpmUsd > 0) {
    // The targetGap already subtracts current modeled ad revenue. This is incremental,
    // not total, additional view volume needed under the entered assumptions.
    additionalMonthlyViewsNeeded = Math.ceil((targetGapUsd / input.assumedAdRpmUsd) * 1_000);
  }

  return {
    schemaVersion: REVENUE_SCENARIO_SCHEMA_VERSION,
    targetMonthlyNetUsd: input.targetMonthlyNetUsd,
    adRevenueUsd,
    affiliateRevenueUsd,
    sponsorshipRevenueUsd,
    modeledGrossUsd,
    operatingCostsUsd: input.monthlyOperatingCostsUsd,
    modeledNetUsd,
    targetGapUsd,
    additionalMonthlyViewsNeeded,
    incompleteAssumptions,
    caveats: [
      "This is a scenario calculator, not an earnings forecast, guarantee, or recommendation to spend money.",
      "Use only assumptions from your own records or clearly mark them as hypothetical; platform revenue, audience geography, eligibility, taxes and fees vary.",
      "Actual platform monetization may require minimum age, guardian involvement, thresholds, contracts or account approval. The app does not bypass those requirements.",
      "Modeled values are not actual receipts; reconcile real income separately from platform dashboards and payment records.",
    ],
  };
}
