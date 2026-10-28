"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  calculateRevenueScenario,
  createRevenueScenarioBackupJSON,
  DEFAULT_REVENUE_SCENARIO_DRAFT,
  parseRevenueScenarioBackupJSON,
  revenueScenarioInputsFromDraft,
  validateRevenueScenarioDraft,
  validateRevenueScenarioInputs,
  type RevenueScenarioDraft,
  type RevenueScenarioOutput,
} from "@/lib/revenue-scenario";

const STORAGE_KEY = "cooking-creator-v4-revenue-scenario-v1";
const MAX_IMPORT_BYTES = 100_000;

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function saveDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="monetization-summary-card">
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function outputValue(value: number | null): string {
  return value === null ? "Needs an assumption" : formatUsd(value);
}

export default function RevenueScenarioPlanner() {
  const [draft, setDraft] = useState<RevenueScenarioDraft>({ ...DEFAULT_REVENUE_SCENARIO_DRAFT });
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = parseRevenueScenarioBackupJSON(raw);
        if (!parsed) {
          setStorageBlocked(true);
          setMessage("The saved scenario failed validation and has been left untouched. Import a known-good scenario backup, or explicitly replace this saved copy.");
        } else {
          setDraft(parsed);
        }
      }
    } catch {
      setStorageBlocked(true);
      setMessage("This browser could not read scenario storage. The existing saved copy has not been replaced.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || storageBlocked || validateRevenueScenarioDraft(draft).length) return;
    try {
      const encoded = createRevenueScenarioBackupJSON(draft);
      window.localStorage.setItem(STORAGE_KEY, encoded);
    } catch {
      setMessage("Scenario changes are visible in this session but could not be saved. Export a private JSON backup before leaving.");
    }
  }, [draft, ready, storageBlocked]);

  const calculation = useMemo((): { result: RevenueScenarioOutput | null; errors: string[] } => {
    const draftErrors = validateRevenueScenarioDraft(draft);
    if (draftErrors.length) return { result: null, errors: draftErrors };
    try {
      const inputs = revenueScenarioInputsFromDraft(draft);
      const inputErrors = validateRevenueScenarioInputs(inputs);
      if (inputErrors.length) return { result: null, errors: inputErrors };
      return { result: calculateRevenueScenario(inputs), errors: [] };
    } catch (error) {
      return { result: null, errors: [error instanceof Error ? error.message : "The scenario could not be calculated."] };
    }
  }, [draft]);

  function updateField(field: keyof RevenueScenarioDraft, value: string) {
    if (storageBlocked) {
      setMessage("Saved scenario data is protected. Import a known-good backup or explicitly replace the unreadable saved copy first.");
      return;
    }
    setDraft((previous) => ({ ...previous, [field]: value }));
    setMessage("");
  }

  function exportBackup() {
    try {
      saveDownload(
        "cooking-creator-revenue-scenario.json",
        createRevenueScenarioBackupJSON(draft),
        "application/json;charset=utf-8",
      );
      setMessage("Scenario assumptions exported. Store this file privately; it contains your business-planning assumptions.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The scenario backup could not be exported.");
    }
  }

  async function importBackup(file: File | null) {
    if (!file) return;
    if (storageBlocked) {
      setMessage("Saved scenario data is protected. Explicitly replace it first, or restore in a fresh browser profile.");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage("The scenario backup exceeds 100 KB. Nothing was imported.");
      return;
    }
    try {
      const parsed = parseRevenueScenarioBackupJSON(await file.text());
      if (!parsed) {
        setMessage("This is not a valid scenario backup. Current assumptions were not changed.");
        return;
      }
      if (!window.confirm("Replace the current scenario assumptions with this backup? Export the current assumptions first if you may need them.")) return;
      setDraft(parsed);
      setMessage("Scenario assumptions restored locally. Review every assumption before relying on the result.");
    } catch {
      setMessage("The backup could not be read. Current assumptions were not changed.");
    }
  }

  function replaceCorruptCopy() {
    if (!window.confirm("Replace the invalid saved scenario with the default draft? The unreadable saved copy may not be recoverable. Export any known-good backup first.")) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setDraft({ ...DEFAULT_REVENUE_SCENARIO_DRAFT });
      setStorageBlocked(false);
      setMessage("A fresh scenario draft was created after confirmation. Rates remain blank rather than being invented.");
    } catch {
      setMessage("Browser storage could not be cleared; the saved copy remains protected.");
    }
  }

  const result = calculation.result;
  const inputErrors = calculation.errors;

  return (
    <section className="monetization-subpanel revenue-scenario-planner" aria-labelledby="revenue-scenario-title">
      <div className="section-head monetization-heading">
        <div>
          <p className="eyebrow">V4 · ASSUMPTION-BASED PLANNING</p>
          <h3 id="revenue-scenario-title">Revenue scenario planner</h3>
          <p>Model a possible month using numbers you enter. It does not predict income, verify eligibility, or guarantee that any platform will pay you.</p>
        </div>
        <span className="step">USD · LOCAL ONLY</span>
      </div>

      <div className="monetization-notice" role="note">
        <strong>Use evidence, not guesses.</strong> Use your own dated platform dashboards for RPM, click and revenue assumptions where available. Leave unknown rates blank. The default $1,500/month is an editable planning target (equivalent to $50/day over 30 days), not an expected result.
      </div>

      <form className="monetization-form-grid" onSubmit={(event) => event.preventDefault()}>
        <div>
          <label htmlFor="scenario-target">Target monthly net income (USD)</label>
          <input id="scenario-target" type="number" min="0" max="1000000000" step="0.01" value={draft.targetMonthlyNetUsd} onChange={(event) => updateField("targetMonthlyNetUsd", event.target.value)} disabled={storageBlocked} />
        </div>
        <div>
          <label htmlFor="scenario-costs">Monthly operating costs (USD)</label>
          <input id="scenario-costs" type="number" min="0" max="1000000000" step="0.01" value={draft.monthlyOperatingCostsUsd} onChange={(event) => updateField("monthlyOperatingCostsUsd", event.target.value)} disabled={storageBlocked} />
        </div>
        <div>
          <label htmlFor="scenario-views">Expected monthly views</label>
          <input id="scenario-views" type="number" min="0" max="1000000000000" step="1" value={draft.expectedMonthlyViews} onChange={(event) => updateField("expectedMonthlyViews", event.target.value)} disabled={storageBlocked} />
        </div>
        <div>
          <label htmlFor="scenario-rpm">Assumed ad revenue per 1,000 views (USD)</label>
          <input id="scenario-rpm" type="number" min="0" max="1000000" step="0.01" inputMode="decimal" placeholder="Leave blank if unknown" value={draft.assumedAdRpmUsd} onChange={(event) => updateField("assumedAdRpmUsd", event.target.value)} disabled={storageBlocked} />
          <p className="hint">Only use a suitable, current revenue figure from your own eligible account or clearly label it hypothetical. RPM varies.</p>
        </div>
        <div>
          <label htmlFor="scenario-affiliate-clicks">Expected affiliate link clicks / month</label>
          <input id="scenario-affiliate-clicks" type="number" min="0" max="1000000000000" step="1" value={draft.expectedAffiliateClicks} onChange={(event) => updateField("expectedAffiliateClicks", event.target.value)} disabled={storageBlocked} />
        </div>
        <div>
          <label htmlFor="scenario-affiliate-rate">Assumed affiliate conversion (%)</label>
          <input id="scenario-affiliate-rate" type="number" min="0" max="100" step="0.01" placeholder="Leave blank if unknown" value={draft.assumedAffiliateConversionPercent} onChange={(event) => updateField("assumedAffiliateConversionPercent", event.target.value)} disabled={storageBlocked} />
        </div>
        <div>
          <label htmlFor="scenario-commission">Commission per conversion (USD)</label>
          <input id="scenario-commission" type="number" min="0" max="1000000000" step="0.01" placeholder="Leave blank if unknown" value={draft.assumedCommissionPerConversionUsd} onChange={(event) => updateField("assumedCommissionPerConversionUsd", event.target.value)} disabled={storageBlocked} />
        </div>
        <div>
          <label htmlFor="scenario-sponsor-count">Expected sponsored deals / month</label>
          <input id="scenario-sponsor-count" type="number" min="0" max="1000" step="1" value={draft.expectedSponsoredDealsPerMonth} onChange={(event) => updateField("expectedSponsoredDealsPerMonth", event.target.value)} disabled={storageBlocked} />
        </div>
        <div>
          <label htmlFor="scenario-sponsor-fee">Assumed fee per sponsorship (USD)</label>
          <input id="scenario-sponsor-fee" type="number" min="0" max="1000000000" step="0.01" placeholder="Leave blank if unknown" value={draft.assumedSponsorFeeUsd} onChange={(event) => updateField("assumedSponsorFeeUsd", event.target.value)} disabled={storageBlocked} />
        </div>
      </form>

      <div className="monetization-subpanel" aria-live="polite">
        <h4>Modeled result under entered assumptions</h4>
        {result ? (
          <>
            <div className="monetization-summary-grid">
              <MetricCard label="Ad revenue in scenario" value={outputValue(result.adRevenueUsd)} note="Not paid/received income." />
              <MetricCard label="Affiliate revenue in scenario" value={outputValue(result.affiliateRevenueUsd)} note="Depends on clicks, conversion and commission assumptions." />
              <MetricCard label="Sponsorship revenue in scenario" value={outputValue(result.sponsorshipRevenueUsd)} note="Deals are assumptions, not booked contracts." />
              <MetricCard label="Modeled gross subtotal" value={formatUsd(result.modeledGrossUsd)} note="Known stream values only; incomplete streams do not count as zero evidence." />
              <MetricCard label="Modeled net subtotal" value={formatUsd(result.modeledNetUsd)} note={`After entered operating costs of ${formatUsd(result.operatingCostsUsd)}; before any unentered tax/fee assumptions.`} />
              <MetricCard label="Net target gap" value={formatUsd(result.targetGapUsd)} note={`Editable target: ${formatUsd(result.targetMonthlyNetUsd)} per month.`} />
            </div>
            <p><strong>Additional monthly views needed to close the modeled gap:</strong> {result.additionalMonthlyViewsNeeded === null ? "Cannot calculate until the necessary assumptions are entered." : formatCount(result.additionalMonthlyViewsNeeded)}</p>
            {result.incompleteAssumptions.length > 0 && <p className="monetization-warning" role="status"><strong>Incomplete assumptions:</strong> {result.incompleteAssumptions.join("; ")}. The gross/net subtotal only includes streams whose values can be calculated from the entered assumptions.</p>}
            <ul>{result.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
          </>
        ) : (
          <div className="monetization-warning" role="alert">
            <strong>Scenario unavailable until inputs are corrected.</strong>
            <ul>{inputErrors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="action-row">
        <button className="secondary" type="button" onClick={exportBackup} disabled={!ready}>Export scenario JSON backup</button>
        <label htmlFor="scenario-import">Import scenario JSON backup<input id="scenario-import" type="file" accept=".json,application/json" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void importBackup(file); }} disabled={!ready || storageBlocked} /></label>
        {storageBlocked && <button className="secondary" type="button" onClick={replaceCorruptCopy}>Replace invalid saved scenario</button>}
      </div>
      {message && <p className="monetization-message" role="status" aria-live="polite">{message}</p>}
      <p className="hint">Assumptions and backups stay in this browser unless you export a file. Browser storage is not encrypted at rest. Do not record passwords, bank/card information, tax IDs, or private identity documents. Follow current platform eligibility, guardian, contract, copyright and sponsorship-disclosure rules.</p>
    </section>
  );
}
