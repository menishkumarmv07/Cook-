import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRevenueScenario,
  createRevenueScenarioBackupJSON,
  DEFAULT_REVENUE_SCENARIO_DRAFT,
  DEFAULT_REVENUE_SCENARIO_INPUTS,
  parseRevenueScenarioBackupJSON,
  revenueScenarioInputsFromDraft,
  validateRevenueScenarioDraft,
  validateRevenueScenarioInputs,
  type RevenueScenarioInputs,
} from "../lib/revenue-scenario";

function inputs(overrides: Partial<RevenueScenarioInputs> = {}): RevenueScenarioInputs {
  return { ...DEFAULT_REVENUE_SCENARIO_INPUTS, ...overrides };
}

test("models streams separately and computes only a transparent scenario subtotal", () => {
  const result = calculateRevenueScenario(inputs({
    targetMonthlyNetUsd: 1_500,
    expectedMonthlyViews: 100_000,
    assumedAdRpmUsd: 4,
    expectedAffiliateClicks: 100,
    assumedAffiliateConversionPercent: 5,
    assumedCommissionPerConversionUsd: 10,
    expectedSponsoredDealsPerMonth: 2,
    assumedSponsorFeeUsd: 200,
    monthlyOperatingCostsUsd: 100,
  }));
  assert.equal(result.adRevenueUsd, 400);
  assert.equal(result.affiliateRevenueUsd, 50);
  assert.equal(result.sponsorshipRevenueUsd, 400);
  assert.equal(result.modeledGrossUsd, 850);
  assert.equal(result.modeledNetUsd, 750);
  assert.equal(result.targetGapUsd, 750);
  assert.equal(result.additionalMonthlyViewsNeeded, 187_500);
  assert.deepEqual(result.incompleteAssumptions, []);
  assert.ok(result.caveats.some((item) => /not an earnings forecast/i.test(item)));
});

test("unknown assumptions stay unknown instead of silently becoming zero", () => {
  const result = calculateRevenueScenario(inputs({
    expectedMonthlyViews: 5_000,
    expectedAffiliateClicks: 20,
    expectedSponsoredDealsPerMonth: 1,
  }));
  assert.equal(result.adRevenueUsd, null);
  assert.equal(result.affiliateRevenueUsd, null);
  assert.equal(result.sponsorshipRevenueUsd, null);
  assert.equal(result.modeledGrossUsd, 0);
  assert.equal(result.modeledNetUsd, 0);
  assert.deepEqual(result.incompleteAssumptions, [
    "ad RPM",
    "affiliate conversion and commission",
    "average sponsorship fee",
  ]);
  assert.equal(result.additionalMonthlyViewsNeeded, null);
});

test("unused stream rates may remain blank when the modeled activity count is zero", () => {
  const result = calculateRevenueScenario(inputs({
    expectedMonthlyViews: 0,
    expectedAffiliateClicks: 0,
    expectedSponsoredDealsPerMonth: 0,
    monthlyOperatingCostsUsd: 25,
    targetMonthlyNetUsd: 1_500,
  }));
  assert.equal(result.adRevenueUsd, 0);
  assert.equal(result.affiliateRevenueUsd, 0);
  assert.equal(result.sponsorshipRevenueUsd, 0);
  assert.equal(result.targetGapUsd, 1_525);
  assert.equal(result.additionalMonthlyViewsNeeded, null);
  assert.deepEqual(result.incompleteAssumptions, []);
});

test("target already met reports zero additional views even if ad RPM is not supplied", () => {
  const result = calculateRevenueScenario(inputs({
    targetMonthlyNetUsd: 300,
    expectedMonthlyViews: 0,
    expectedAffiliateClicks: 100,
    assumedAffiliateConversionPercent: 10,
    assumedCommissionPerConversionUsd: 5,
    expectedSponsoredDealsPerMonth: 1,
    assumedSponsorFeeUsd: 100,
    monthlyOperatingCostsUsd: 0,
  }));
  assert.equal(result.modeledNetUsd, 150);
  assert.equal(result.targetGapUsd, 150);
  assert.equal(result.additionalMonthlyViewsNeeded, null);
});

test("validation rejects negative, non-finite, fractional count and out-of-range inputs", () => {
  assert.ok(validateRevenueScenarioInputs(inputs({ targetMonthlyNetUsd: Number.NaN })).length > 0);
  assert.ok(validateRevenueScenarioInputs(inputs({ expectedMonthlyViews: -1 })).some((error) => /views/i.test(error)));
  assert.ok(validateRevenueScenarioInputs(inputs({ expectedAffiliateClicks: 1.2 })).some((error) => /affiliate clicks/i.test(error)));
  assert.ok(validateRevenueScenarioInputs(inputs({ assumedAffiliateConversionPercent: 100.01 })).some((error) => /conversion percentage/i.test(error)));
  assert.ok(validateRevenueScenarioInputs(inputs({ expectedSponsoredDealsPerMonth: 1_001 })).some((error) => /sponsored deals/i.test(error)));
  assert.throws(() => calculateRevenueScenario(inputs({ assumedAdRpmUsd: -1 })), /RPM/i);
});

test("scenario draft backup round-trips locally and rejects malformed or oversized input", () => {
  const backup = createRevenueScenarioBackupJSON(DEFAULT_REVENUE_SCENARIO_DRAFT, "2026-10-27T10:00:00.000Z");
  assert.deepEqual(parseRevenueScenarioBackupJSON(backup), DEFAULT_REVENUE_SCENARIO_DRAFT);
  assert.equal(parseRevenueScenarioBackupJSON('{"format":"wrong"}'), null);
  assert.equal(parseRevenueScenarioBackupJSON("x".repeat(100_001)), null);
  assert.equal(validateRevenueScenarioDraft({ ...DEFAULT_REVENUE_SCENARIO_DRAFT, assumedAdRpmUsd: "-12" }).length > 0, true);
  assert.equal(validateRevenueScenarioDraft({ ...DEFAULT_REVENUE_SCENARIO_DRAFT, expectedMonthlyViews: "1e8" }).length > 0, true);
  assert.equal(revenueScenarioInputsFromDraft(DEFAULT_REVENUE_SCENARIO_DRAFT).assumedAdRpmUsd, null);
});
