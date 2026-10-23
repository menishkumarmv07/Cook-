"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  actualReceivedAffiliateUsd,
  actualReceivedPartnershipUsd,
  buildMediaKitMarkdown,
  contractedPartnershipUsd,
  createMonetizationBackupJSON,
  DEFAULT_MEDIA_KIT_PROFILE,
  DEFAULT_PARTNERSHIP_REVIEW,
  DEFAULT_READINESS_CHECKS,
  estimatedAffiliateUsd,
  estimatedPartnerUsd,
  mergeMonetizationRows,
  metricFingerprint,
  partnershipFingerprint,
  affiliateFingerprint,
  MONETIZATION_PLATFORMS,
  parseMonetizationBackupJSON,
  READINESS_LABELS,
  serializeAffiliatesCsv,
  serializePartnershipsCsv,
  validateAffiliateRecord,
  validateCreatorMetricSnapshot,
  validateMediaKitProfile,
  validatePartnership,
  validateReadinessCheck,
  type AffiliateRecord,
  type AffiliateStatus,
  type AmountStage,
  type CommissionKind,
  type CreatorMetricSnapshot,
  type CreatorPartnership,
  type CreatorMediaKitProfile,
  type MonetizationMetricName,
  type MonetizationPlatform,
  type MonetizationReadinessCheck,
  type PartnershipStatus,
  type ReadinessCategory,
  type ReadinessStatus,
  type ReportedValueKind,
} from "@/lib/monetization-workspace";
import { getLocalDateOnly } from "@/lib/recipe";

const STORAGE_KEY = "cooking-creator-monetization-workspace-v1";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

type MetricForm = {
  platform: MonetizationPlatform;
  metricName: MonetizationMetricName;
  value: string;
  valueKind: ReportedValueKind;
  asOfDate: string;
  sourceUrl: string;
  evidenceNote: string;
};
type PartnershipForm = Omit<CreatorPartnership, "id" | "amountUsd"> & { amountUsd: string };
type AffiliateForm = Omit<AffiliateRecord, "id" | "commissionUsd"> & { commissionUsd: string };

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
function emptyMetricForm(): MetricForm {
  return { platform: MONETIZATION_PLATFORMS[0], metricName: "followers", value: "", valueKind: "actual", asOfDate: getLocalDateOnly(), sourceUrl: "", evidenceNote: "" };
}
function emptyPartnershipForm(): PartnershipForm {
  return {
    brandName: "", campaign: "", deliverable: "", platform: MONETIZATION_PLATFORMS[0],
    status: "lead", dueDate: "", amountUsd: "", amountStage: "none",
    sponsoredOrAffiliate: true, disclosureText: "Paid partnership with [brand].",
    review: { ...DEFAULT_PARTNERSHIP_REVIEW }, paymentDate: "", paymentEvidenceNote: "", notes: "",
  };
}
function emptyAffiliateForm(): AffiliateForm {
  return {
    merchantOrProgram: "", productOrService: "", destinationUrl: "", status: "idea",
    disclosureText: "I may earn a commission from qualifying purchases.",
    disclosureReviewed: false, rightsReviewed: false, commissionUsd: "", commissionKind: "none",
    commissionAsOfDate: "", commissionEvidenceNote: "", notes: "",
  };
}
function saveFile(filename: string, content: string, mimeType: string) {
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
function fmtUsd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
const PARTNERSHIP_STATUSES: Array<{ value: PartnershipStatus; label: string }> = [
  { value: "lead", label: "Lead" },
  { value: "negotiating", label: "Negotiating" },
  { value: "contracted", label: "Contracted" },
  { value: "delivered", label: "Delivered" },
  { value: "paid", label: "Paid — receipt recorded" },
  { value: "closed", label: "Closed" },
];
const METRIC_NAMES: Array<{ value: MonetizationMetricName; label: string }> = [
  { value: "followers", label: "Followers / subscribers" },
  { value: "averageViews", label: "Average views per post/video" },
  { value: "averageReach", label: "Average reach / impressions" },
  { value: "engagementPercent", label: "Engagement rate (%)" },
  { value: "monthlyViews", label: "Monthly views" },
  { value: "watchTimeHours", label: "Watch time (hours)" },
];
const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  "not-reviewed": "Not reviewed",
  "needs-action": "Needs action",
  reviewed: "Reviewed by owner",
};

export default function MonetizationWorkspace() {
  const [profile, setProfile] = useState<CreatorMediaKitProfile>({ ...DEFAULT_MEDIA_KIT_PROFILE });
  const [metrics, setMetrics] = useState<CreatorMetricSnapshot[]>([]);
  const [partnerships, setPartnerships] = useState<CreatorPartnership[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRecord[]>([]);
  const [readinessChecks, setReadinessChecks] = useState<MonetizationReadinessCheck[]>(DEFAULT_READINESS_CHECKS.map((item) => ({ ...item })));
  const [metricDraft, setMetricDraft] = useState<MetricForm>(emptyMetricForm);
  const [partnershipDraft, setPartnershipDraft] = useState<PartnershipForm>(emptyPartnershipForm);
  const [affiliateDraft, setAffiliateDraft] = useState<AffiliateForm>(emptyAffiliateForm);
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [editingPartnershipId, setEditingPartnershipId] = useState<string | null>(null);
  const [editingAffiliateId, setEditingAffiliateId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState<"overview" | "media-kit" | "partnerships" | "affiliates" | "readiness">("overview");
  const [mediaKitPreview, setMediaKitPreview] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const backup = parseMonetizationBackupJSON(raw);
        if (!backup) {
          setStorageBlocked(true);
          setMessage("The saved monetization workspace failed validation and has been left untouched. Import a known-good JSON backup, or explicitly replace the unreadable saved copy.");
        } else {
          setProfile(backup.profile);
          setMetrics(backup.metrics);
          setPartnerships(backup.partnerships);
          setAffiliates(backup.affiliates);
          setReadinessChecks(backup.readinessChecks);
        }
      }
    } catch {
      setStorageBlocked(true);
      setMessage("This browser could not read monetization storage. Existing data has not been replaced.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || storageBlocked) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, createMonetizationBackupJSON(profile, metrics, partnerships, affiliates, readinessChecks));
    } catch {
      setMessage("Changes are visible in this session but could not be saved to browser storage. Export a private JSON backup before leaving.");
    }
  }, [ready, storageBlocked, profile, metrics, partnerships, affiliates, readinessChecks]);

  const totals = useMemo(() => ({
    actualPartner: actualReceivedPartnershipUsd(partnerships),
    contractedPartner: contractedPartnershipUsd(partnerships),
    estimatedPartner: estimatedPartnerUsd(partnerships),
    actualAffiliate: actualReceivedAffiliateUsd(affiliates),
    estimatedAffiliate: estimatedAffiliateUsd(affiliates),
  }), [partnerships, affiliates]);

  function patchProfile(patch: Partial<CreatorMediaKitProfile>) {
    const candidate = { ...profile, ...patch };
    const errors = validateMediaKitProfile(candidate, false);
    if (errors.length) {
      setMessage(errors.join(" "));
      return;
    }
    const incompatible = partnerships.find((item) => validatePartnership(item, candidate).length > 0);
    if (incompatible) {
      setMessage("That age/guardian profile change would invalidate an existing advanced partnership. Keep the record safe and update its contract/guardian review first; do not bypass a platform age or payment rule.");
      return;
    }
    setProfile(candidate);
  }

  function saveMetric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (storageBlocked) return setMessage("Saved data is protected while storage is invalid. Import a known-good backup or explicitly replace the saved copy first.");
    const value = metricDraft.value.trim() === "" ? Number.NaN : Number(metricDraft.value);
    const candidate: CreatorMetricSnapshot = {
      ...metricDraft, id: editingMetricId ?? newId("metric"), value,
    };
    const errors = validateCreatorMetricSnapshot(candidate);
    if (errors.length) return setMessage(errors.join(" "));
    if (editingMetricId) {
      setMetrics((current) => current.map((item) => item.id === editingMetricId ? candidate : item));
      setMessage("Metric snapshot updated. Actual and estimated values remain separate.");
    } else {
      const merged = mergeMonetizationRows(metrics, [candidate], metricFingerprint);
      if (!merged.added) return setMessage("A matching platform/metric/date/value record already exists. Edit it or choose a genuinely different snapshot.");
      setMetrics(merged.rows);
      setMessage("Metric snapshot saved. These are owner-entered values, not independently verified numbers.");
    }
    setMetricDraft(emptyMetricForm());
    setEditingMetricId(null);
  }

  function beginMetricEdit(item: CreatorMetricSnapshot) {
    setMetricDraft({ platform: item.platform, metricName: item.metricName, value: String(item.value), valueKind: item.valueKind, asOfDate: item.asOfDate, sourceUrl: item.sourceUrl, evidenceNote: item.evidenceNote });
    setEditingMetricId(item.id);
    setActiveSection("media-kit");
    setMessage("Editing a local metric record. Save the form to apply it.");
  }

  function savePartnership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (storageBlocked) return setMessage("Saved data is protected while storage is invalid. Import a known-good backup or explicitly replace the saved copy first.");
    const value = partnershipDraft.amountUsd.trim() === "" ? null : Number(partnershipDraft.amountUsd);
    const candidate: CreatorPartnership = { ...partnershipDraft, id: editingPartnershipId ?? newId("partner"), amountUsd: value };
    const errors = validatePartnership(candidate, profile);
    if (errors.length) return setMessage(errors.join(" "));
    if (editingPartnershipId) {
      setPartnerships((current) => current.map((item) => item.id === editingPartnershipId ? candidate : item));
      setMessage("Partnership record updated locally.");
    } else {
      const merged = mergeMonetizationRows(partnerships, [candidate], partnershipFingerprint);
      if (!merged.added) return setMessage("A matching brand/campaign/deliverable/platform entry already exists. Edit it or record a genuinely distinct deliverable.");
      setPartnerships(merged.rows);
      setMessage("Partnership lead saved locally. Offers/contracted amounts are not paid revenue.");
    }
    setPartnershipDraft(emptyPartnershipForm());
    setEditingPartnershipId(null);
  }

  function beginPartnershipEdit(item: CreatorPartnership) {
    setPartnershipDraft({ ...item, review: { ...item.review }, amountUsd: item.amountUsd === null ? "" : String(item.amountUsd) });
    setEditingPartnershipId(item.id);
    setActiveSection("partnerships");
    setMessage("Editing a local partnership record. Advancing status requires the review gates.");
  }

  function updatePartnershipStatus(item: CreatorPartnership, status: PartnershipStatus) {
    const candidate = { ...item, status };
    const errors = validatePartnership(candidate, profile);
    if (errors.length) return setMessage(errors.join(" "));
    setPartnerships((current) => current.map((entry) => entry.id === item.id ? candidate : entry));
    setMessage(status === "paid" ? "Receipt recorded as actual income from your entered payment evidence. This tool does not verify the payment independently." : "Partnership status updated locally.");
  }

  function saveAffiliate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (storageBlocked) return setMessage("Saved data is protected while storage is invalid. Import a known-good backup or explicitly replace the saved copy first.");
    const value = affiliateDraft.commissionUsd.trim() === "" ? null : Number(affiliateDraft.commissionUsd);
    const candidate: AffiliateRecord = { ...affiliateDraft, id: editingAffiliateId ?? newId("affiliate"), commissionUsd: value };
    const errors = validateAffiliateRecord(candidate);
    if (errors.length) return setMessage(errors.join(" "));
    if (editingAffiliateId) {
      setAffiliates((current) => current.map((item) => item.id === editingAffiliateId ? candidate : item));
      setMessage("Affiliate record updated locally.");
    } else {
      const merged = mergeMonetizationRows(affiliates, [candidate], affiliateFingerprint);
      if (!merged.added) return setMessage("A matching merchant/product/destination record already exists.");
      setAffiliates(merged.rows);
      setMessage("Affiliate record saved locally. Commission estimates are kept separate from money received.");
    }
    setAffiliateDraft(emptyAffiliateForm());
    setEditingAffiliateId(null);
  }

  function beginAffiliateEdit(item: AffiliateRecord) {
    setAffiliateDraft({ ...item, commissionUsd: item.commissionUsd === null ? "" : String(item.commissionUsd) });
    setEditingAffiliateId(item.id);
    setActiveSection("affiliates");
    setMessage("Editing a local affiliate record.");
  }

  function updateReadiness(category: ReadinessCategory, patch: Partial<MonetizationReadinessCheck>) {
    const current = readinessChecks.find((item) => item.category === category);
    if (!current) return;
    let candidate = { ...current, ...patch };
    const errors = validateReadinessCheck(candidate);
    if (patch.status && patch.status !== "not-reviewed" && errors.length) return setMessage(errors.join(" "));
    if (!patch.status && current.status === "reviewed" && errors.length) {
      candidate = { ...candidate, status: "not-reviewed" };
      setMessage("Readiness evidence changed, so its status returned to Not reviewed. Re-check the source/date/notes before marking Reviewed again.");
    }
    setReadinessChecks((items) => items.map((item) => item.category === category ? candidate : item));
    if (patch.status === "reviewed") setMessage("Readiness item recorded as reviewed by you. The app does not certify policy, legal, tax or payment compliance.");
  }

  function exportJSON() {
    saveFile("cooking-creator-monetization-backup.json", createMonetizationBackupJSON(profile, metrics, partnerships, affiliates, readinessChecks), "application/json;charset=utf-8");
    setMessage("Full monetization workspace backup exported. Keep this file private.");
  }

  function exportPartnershipCsv() {
    saveFile("cooking-creator-partnerships.csv", serializePartnershipsCsv(partnerships), "text/csv;charset=utf-8");
    setMessage("Partnership CSV exported with status/review fields and amount basis.");
  }

  function exportAffiliateCsv() {
    saveFile("cooking-creator-affiliates.csv", serializeAffiliatesCsv(affiliates), "text/csv;charset=utf-8");
    setMessage("Affiliate CSV exported with disclosure/rights review and commission basis.");
  }

  async function importBackup(file: File | null) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setMessage("Backup exceeds 5 MB. Nothing was imported.");
    try {
      const parsed = parseMonetizationBackupJSON(await file.text());
      if (!parsed) return setMessage("This is not a valid monetization workspace backup. No current records were changed.");
      const nextProfile = profile.brandName.trim() || profile.bio.trim() ? profile : parsed.profile;
      const incomingPartnershipErrors = parsed.partnerships.filter((item) => validatePartnership(item, nextProfile).length > 0);
      if (incomingPartnershipErrors.length) return setMessage("This backup contains partnerships that fail the current age/payment/contract gates. No records were imported; review eligibility and guardian settings with a responsible adult before restoring.");
      const metricResult = mergeMonetizationRows(metrics, parsed.metrics, metricFingerprint);
      const partnershipResult = mergeMonetizationRows(partnerships, parsed.partnerships, partnershipFingerprint);
      const affiliateResult = mergeMonetizationRows(affiliates, parsed.affiliates, affiliateFingerprint);
      const existingChecks = new Set(readinessChecks.map((item) => item.category));
      const nextChecks = [...readinessChecks, ...parsed.readinessChecks.filter((item) => !existingChecks.has(item.category))];
      setProfile(nextProfile);
      setMetrics(metricResult.rows);
      setPartnerships(partnershipResult.rows);
      setAffiliates(affiliateResult.rows);
      setReadinessChecks(nextChecks);
      setStorageBlocked(false);
      setMessage(`Backup validated. Added ${metricResult.added} metric(s), ${partnershipResult.added} partnership(s), ${affiliateResult.added} affiliate record(s); preserved current distinct rows and skipped ${metricResult.duplicates + partnershipResult.duplicates + affiliateResult.duplicates} duplicate(s). Readiness checks already present were not overwritten.`);
    } catch {
      setMessage("The backup could not be read in this browser. Current data was not changed.");
    }
  }

  function replaceCorruptCopy() {
    if (!window.confirm("The saved workspace failed validation. Replace it with a new empty workspace? Try importing a known-good backup first; the unreadable local contents cannot be recovered by this action.")) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setProfile({ ...DEFAULT_MEDIA_KIT_PROFILE });
      setMetrics([]);
      setPartnerships([]);
      setAffiliates([]);
      setReadinessChecks(DEFAULT_READINESS_CHECKS.map((item) => ({ ...item })));
      setStorageBlocked(false);
      setMessage("A fresh empty monetization workspace was created after confirmation.");
    } catch {
      setMessage("Browser storage could not be cleared; the saved copy remains protected.");
    }
  }

  function createMediaKit() {
    const errors = validateMediaKitProfile(profile, true);
    if (errors.length) return setMessage(errors.join(" "));
    const markdown = buildMediaKitMarkdown(profile, metrics);
    setMediaKitPreview(markdown);
    setActiveSection("media-kit");
    setMessage("Media kit generated from the fields and dated metric records you supplied. Review it before sending; values are not independently verified.");
  }

  const actualMetrics = metrics.filter((item) => item.valueKind === "actual");
  const estimatedMetrics = metrics.filter((item) => item.valueKind === "estimate");
  const navItems: Array<{ value: typeof activeSection; label: string }> = [
    { value: "overview", label: "Overview" },
    { value: "media-kit", label: "Media kit & metrics" },
    { value: "partnerships", label: "Partnerships" },
    { value: "affiliates", label: "Affiliate links" },
    { value: "readiness", label: "Readiness checklist" },
  ];

  return (
    <section id="monetization-workspace" className="panel monetization-workspace" aria-labelledby="monetization-workspace-title">
      <div className="section-head monetization-heading">
        <div>
          <p className="eyebrow">V2.5 · PRIVATE CREATOR BUSINESS WORKSPACE</p>
          <h2 id="monetization-workspace-title">Monetization readiness</h2>
          <p>Prepare truthful media-kit details and keep track of partnerships and affiliate disclosures. This is record-keeping, not a promise of income.</p>
        </div>
        <span className="step">USD · LOCAL ONLY</span>
      </div>
      <div className="monetization-notice" role="note">
        <strong>Important:</strong> values are owner-entered and not independently verified. Estimates, offers, contracts and payments received are kept separate. Nothing here connects social accounts or publishes content.
      </div>
      <div className="monetization-subnav" aria-label="Monetization workspace sections">
        {navItems.map((item) => <button key={item.value} type="button" className={activeSection === item.value ? "is-active" : ""} aria-pressed={activeSection === item.value} onClick={() => setActiveSection(item.value)}>{item.label}</button>)}
      </div>

      {storageBlocked && <div className="monetization-alert" role="alert">
        <p>{message || "Saved data was not valid and has been left untouched."}</p>
        <label htmlFor="monetization-recovery-file">Import a known-good JSON backup</label>
        <input id="monetization-recovery-file" type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void importBackup(file); }} />
        <button className="secondary" type="button" onClick={replaceCorruptCopy}>Replace unreadable saved copy with empty workspace</button>
      </div>}

      {activeSection === "overview" && <>
        <div className="monetization-summary-grid" aria-label="USD tracker summary">
          <article><small>Actual partnership receipts</small><strong>{fmtUsd(totals.actualPartner)}</strong><p>Marked Paid with date and receipt note.</p></article>
          <article><small>Actual affiliate commission</small><strong>{fmtUsd(totals.actualAffiliate)}</strong><p>Recorded as Received, not an estimate.</p></article>
          <article><small>Contracted (not yet received)</small><strong>{fmtUsd(totals.contractedPartner)}</strong><p>Contracted amount only; not paid revenue.</p></article>
          <article><small>Offers and estimates</small><strong>{fmtUsd(totals.estimatedPartner + totals.estimatedAffiliate)}</strong><p>Not income. Never added to actual receipts.</p></article>
        </div>
        <div className="monetization-subpanel">
          <h3>Before seeking or accepting a partnership</h3>
          <p>Use official platform rules and written terms. A green checklist means only that you recorded a manual review; it does not grant platform eligibility or establish legal/tax compliance.</p>
          {profile.ageBand === "under18" ? (
            <p className="monetization-alert"><strong>Under 18:</strong> involve a parent or legal guardian in contracts, payment setup and applicable tax matters. Platform age, identity and payout requirements must be followed; do not try to bypass them.</p>
          ) : profile.ageBand === "not-set" ? (
            <p className="monetization-alert">Age/payment setting is not recorded. Check official eligibility requirements before advancing a paid partnership.</p>
          ) : <p className="monetization-safe-note">Adult eligibility is self-recorded, not verified by this app. Re-check each platform&apos;s current rules before using paid features.</p>}
          <div className="monetization-overview-links"><button className="secondary" type="button" onClick={() => setActiveSection("media-kit")}>Prepare media kit</button><button className="secondary" type="button" onClick={() => setActiveSection("partnerships")}>Track a partnership</button><button className="secondary" type="button" onClick={() => setActiveSection("affiliates")}>Review affiliate disclosures</button><button className="secondary" type="button" onClick={() => setActiveSection("readiness")}>Review readiness checklist</button></div>
        </div>
      </>}

      {activeSection === "media-kit" && <>
        <div className="monetization-subpanel">
          <h3>Creator / brand profile</h3>
          <p className="muted">Use your creator or brand label. Do not add passwords, payment card/bank details, tax IDs or private identity documents.</p>
          <div className="monetization-form-grid">
            <div><label htmlFor="money-brand-name">Creator / brand display name</label><input id="money-brand-name" value={profile.brandName} onChange={(event) => patchProfile({ brandName: event.target.value })} maxLength={180} /></div>
            <div><label htmlFor="money-cuisine">Cuisine / content focus</label><input id="money-cuisine" value={profile.cuisineFocus} onChange={(event) => patchProfile({ cuisineFocus: event.target.value })} maxLength={300} /></div>
            <div className="monetization-wide"><label htmlFor="money-bio">Short creator bio</label><textarea id="money-bio" value={profile.bio} onChange={(event) => patchProfile({ bio: event.target.value })} rows={3} maxLength={1000} /></div>
            <div><label htmlFor="money-audience">Target audience (not verified demographics)</label><textarea id="money-audience" value={profile.targetAudience} onChange={(event) => patchProfile({ targetAudience: event.target.value })} rows={2} maxLength={500} /></div>
            <div><label htmlFor="money-formats">Content formats / target platforms</label><input id="money-formats" value={profile.contentFormats} onChange={(event) => patchProfile({ contentFormats: event.target.value })} maxLength={300} /></div>
            <div><label htmlFor="money-website">Public website URL (optional)</label><input id="money-website" type="url" value={profile.publicWebsiteUrl} onChange={(event) => patchProfile({ publicWebsiteUrl: event.target.value })} maxLength={2000} placeholder="https://…" /></div>
            <div><label htmlFor="money-age-band">Age / payment eligibility setting</label><select id="money-age-band" value={profile.ageBand} onChange={(event) => patchProfile({ ageBand: event.target.value as CreatorMediaKitProfile["ageBand"] })}><option value="not-set">Not recorded — must check</option><option value="under18">Under 18 — guardian involvement required</option><option value="18plus">18+ — self-recorded, not verified</option></select></div>
            <label className="monetization-checkbox"><input type="checkbox" checked={profile.guardianInvolved} onChange={(event) => patchProfile({ guardianInvolved: event.target.checked })} /> Parent/legal guardian is or will be involved where needed for contracts and payment review.</label>
          </div>
        </div>
        <div className="monetization-subpanel">
          <div className="subsection-head"><div><h3>Metric snapshots for your media kit</h3><p className="muted">Enter figures from official platform dashboards. Estimates stay separate from actual values; no fake metrics are added.</p></div></div>
          <form className="monetization-form-grid" onSubmit={saveMetric}>
            <div><label htmlFor="money-metric-platform">Platform</label><select id="money-metric-platform" value={metricDraft.platform} onChange={(event) => setMetricDraft({ ...metricDraft, platform: event.target.value as MonetizationPlatform })}>{MONETIZATION_PLATFORMS.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="money-metric-name">Metric</label><select id="money-metric-name" value={metricDraft.metricName} onChange={(event) => setMetricDraft({ ...metricDraft, metricName: event.target.value as MonetizationMetricName })}>{METRIC_NAMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label htmlFor="money-metric-value">Value</label><input id="money-metric-value" type="number" min="0" step={metricDraft.metricName === "engagementPercent" || metricDraft.metricName === "watchTimeHours" ? "any" : "1"} value={metricDraft.value} onChange={(event) => setMetricDraft({ ...metricDraft, value: event.target.value })} required /></div>
            <div><label htmlFor="money-metric-kind">Value type</label><select id="money-metric-kind" value={metricDraft.valueKind} onChange={(event) => setMetricDraft({ ...metricDraft, valueKind: event.target.value as ReportedValueKind })}><option value="actual">Actual — owner-reported platform value</option><option value="estimate">Estimate — not actual result</option></select></div>
            <div><label htmlFor="money-metric-date">As-of date</label><input id="money-metric-date" type="date" max={getLocalDateOnly()} value={metricDraft.asOfDate} onChange={(event) => setMetricDraft({ ...metricDraft, asOfDate: event.target.value })} required /></div>
            <div><label htmlFor="money-metric-source">Source URL (optional)</label><input id="money-metric-source" type="url" value={metricDraft.sourceUrl} onChange={(event) => setMetricDraft({ ...metricDraft, sourceUrl: event.target.value })} maxLength={2000} placeholder="Official help page or accessible public evidence" /></div>
            <div className="monetization-wide"><label htmlFor="money-metric-note">Source note / why estimate *</label><textarea id="money-metric-note" value={metricDraft.evidenceNote} onChange={(event) => setMetricDraft({ ...metricDraft, evidenceNote: event.target.value })} rows={2} maxLength={1000} required placeholder="Where did you record this value? Do not include credentials or private account data." /></div>
            <div className="monetization-wide"><div className="action-row"><button className="primary" type="submit" disabled={!ready || storageBlocked}>{editingMetricId ? "Update metric snapshot" : "Add metric snapshot"}</button>{editingMetricId && <button className="secondary" type="button" onClick={() => { setMetricDraft(emptyMetricForm()); setEditingMetricId(null); }}>Cancel edit</button>}</div></div>
          </form>
          <div className="monetization-metric-summary"><span>Actual snapshots: <strong>{actualMetrics.length}</strong></span><span>Estimates: <strong>{estimatedMetrics.length}</strong></span></div>
          {metrics.length === 0 ? <p className="empty-inline">No metric snapshots recorded. The media kit will say that actual metrics were not provided.</p> : <div className="monetization-record-list">
            {metrics.map((item) => <article className="monetization-record-card" key={item.id}>
              <div className="monetization-record-heading"><h4>{METRIC_NAMES.find((record) => record.value === item.metricName)?.label ?? item.metricName}</h4><span className={item.valueKind === "actual" ? "monetization-pill" : "monetization-pill is-estimate"}>{item.valueKind === "actual" ? "Owner-reported actual" : "Estimate"}</span></div>
              <p><strong>{item.value.toLocaleString("en-US")}{item.metricName === "engagementPercent" ? "%" : ""}</strong> · {item.platform} · as of {item.asOfDate}</p>
              <p className="muted">{item.evidenceNote}</p>
              {item.sourceUrl && <p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Open recorded source</a></p>}
              <div className="action-row"><button className="secondary" type="button" onClick={() => beginMetricEdit(item)} disabled={storageBlocked}>Edit</button><button className="text-button" type="button" onClick={() => { if (window.confirm("Remove this metric snapshot from the local workspace?")) setMetrics((current) => current.filter((candidate) => candidate.id !== item.id)); }}>Remove</button></div>
            </article>)}
          </div>}
          <div className="action-row"><button className="secondary" type="button" onClick={createMediaKit} disabled={storageBlocked}>Generate media kit preview</button></div>
          {mediaKitPreview && <div className="monetization-preview"><h3>Media kit preview</h3><pre>{mediaKitPreview}</pre><button className="primary" type="button" onClick={() => saveFile("cooking-creator-media-kit.md", mediaKitPreview, "text/markdown;charset=utf-8")}>Export media kit Markdown</button></div>}
        </div>
      </>}

      {activeSection === "partnerships" && <>
        <div className="monetization-subpanel">
          <h3>{editingPartnershipId ? "Edit partnership" : "Track a brand partnership"}</h3>
          <p className="muted">Offers and contracts are not received income. Mark Paid only after a real payment is recorded. If under 18, involve a parent/legal guardian; don&apos;t bypass platform rules.</p>
          <form className="monetization-form-grid" onSubmit={savePartnership}>
            <div><label htmlFor="money-partner-brand">Brand / partner</label><input id="money-partner-brand" value={partnershipDraft.brandName} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, brandName: event.target.value })} required maxLength={180} /></div>
            <div><label htmlFor="money-partner-campaign">Campaign / product</label><input id="money-partner-campaign" value={partnershipDraft.campaign} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, campaign: event.target.value })} required maxLength={240} /></div>
            <div className="monetization-wide"><label htmlFor="money-partner-deliverable">Proposed/agreed deliverable</label><textarea id="money-partner-deliverable" value={partnershipDraft.deliverable} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, deliverable: event.target.value })} required rows={2} maxLength={500} /></div>
            <div><label htmlFor="money-partner-platform">Platform</label><select id="money-partner-platform" value={partnershipDraft.platform} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, platform: event.target.value as MonetizationPlatform })}>{MONETIZATION_PLATFORMS.map((value) => <option key={value}>{value}</option>)}</select></div>
            <div><label htmlFor="money-partner-status">Status</label><select id="money-partner-status" value={partnershipDraft.status} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, status: event.target.value as PartnershipStatus })}>{PARTNERSHIP_STATUSES.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}</select></div>
            <div><label htmlFor="money-partner-due">Due date</label><input id="money-partner-due" type="date" value={partnershipDraft.dueDate} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, dueDate: event.target.value })} /></div>
            <div><label htmlFor="money-partner-amount">Amount (USD, optional)</label><input id="money-partner-amount" type="number" min="0" step="0.01" value={partnershipDraft.amountUsd} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, amountUsd: event.target.value })} /></div>
            <div><label htmlFor="money-partner-amount-stage">Amount basis</label><select id="money-partner-amount-stage" value={partnershipDraft.amountStage} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, amountStage: event.target.value as AmountStage })}><option value="none">Not recorded</option><option value="estimate">Estimate</option><option value="offered">Offer received</option><option value="contracted">Contracted amount</option><option value="received">Actually received</option></select></div>
            <div className="monetization-wide"><label className="monetization-checkbox"><input type="checkbox" checked={partnershipDraft.sponsoredOrAffiliate} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, sponsoredOrAffiliate: event.target.checked })} /> Paid, gifted or affiliate relationship requiring disclosure review</label><label htmlFor="money-partner-disclosure">Disclosure text</label><textarea id="money-partner-disclosure" value={partnershipDraft.disclosureText} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, disclosureText: event.target.value })} rows={2} maxLength={1000} /></div>
            <fieldset className="monetization-fieldset"><legend>Pre-contract / pre-publish review</legend>
              <label className="monetization-checkbox"><input type="checkbox" checked={partnershipDraft.review.writtenTermsReviewed} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, review: { ...partnershipDraft.review, writtenTermsReviewed: event.target.checked } })} /> Written terms reviewed</label>
              <label className="monetization-checkbox"><input type="checkbox" checked={partnershipDraft.review.assetRightsReviewed} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, review: { ...partnershipDraft.review, assetRightsReviewed: event.target.checked } })} /> Asset and usage rights reviewed</label>
              <label className="monetization-checkbox"><input type="checkbox" checked={partnershipDraft.review.disclosureReviewed} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, review: { ...partnershipDraft.review, disclosureReviewed: event.target.checked } })} /> Disclosure requirements reviewed</label>
              <label className="monetization-checkbox"><input type="checkbox" checked={partnershipDraft.review.ageEligibilityReviewed} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, review: { ...partnershipDraft.review, ageEligibilityReviewed: event.target.checked } })} /> Current platform eligibility/payment rules checked</label>
            </fieldset>
            <div><label htmlFor="money-partner-payment-date">Actual payment date (Paid only)</label><input id="money-partner-payment-date" type="date" max={getLocalDateOnly()} value={partnershipDraft.paymentDate} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, paymentDate: event.target.value })} /></div>
            <div><label htmlFor="money-partner-payment-note">Payment evidence note (Paid only)</label><textarea id="money-partner-payment-note" value={partnershipDraft.paymentEvidenceNote} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, paymentEvidenceNote: event.target.value })} rows={2} maxLength={1000} /></div>
            <div className="monetization-wide"><label htmlFor="money-partner-notes">Private notes</label><textarea id="money-partner-notes" value={partnershipDraft.notes} onChange={(event) => setPartnershipDraft({ ...partnershipDraft, notes: event.target.value })} rows={2} maxLength={2000} /></div>
            <div className="monetization-wide"><div className="action-row"><button className="primary" type="submit" disabled={!ready || storageBlocked}>{editingPartnershipId ? "Update partnership" : "Add partnership"}</button>{editingPartnershipId && <button className="secondary" type="button" onClick={() => { setPartnershipDraft(emptyPartnershipForm()); setEditingPartnershipId(null); }}>Cancel edit</button>}</div></div>
          </form>
        </div>
        <div className="monetization-subpanel"><h3>Partnership tracker</h3>
          {partnerships.length === 0 ? <p className="empty-inline">No partnerships recorded yet.</p> : <div className="monetization-record-list">{partnerships.map((item) => <article className="monetization-record-card" key={item.id}>
            <div className="monetization-record-heading"><h4>{item.brandName} · {item.campaign}</h4><span className={item.status === "paid" ? "monetization-pill" : "monetization-pill is-estimate"}>{PARTNERSHIP_STATUSES.find((status) => status.value === item.status)?.label ?? item.status}</span></div>
            <p>{item.deliverable}</p><p className="muted">{item.platform} · Due: {item.dueDate || "Not set"}</p>
            <p><strong>{item.amountUsd === null ? "Amount not recorded" : fmtUsd(item.amountUsd)}</strong> · {item.amountStage === "received" ? "Received (owner-entered payment evidence)" : item.amountStage === "contracted" ? "Contracted, not necessarily paid" : item.amountStage === "offered" ? "Offer, not received income" : item.amountStage === "estimate" ? "Estimate only" : "No amount basis"}</p>
            {item.sponsoredOrAffiliate && <p><strong>Disclosure:</strong> {item.disclosureText || "Not recorded"} · {item.review.disclosureReviewed ? "reviewed by owner" : "needs review"}</p>}
            {item.status === "paid" && <p className="muted">Payment date: {item.paymentDate} · {item.paymentEvidenceNote}</p>}
            <div className="action-row"><button className="secondary" type="button" onClick={() => beginPartnershipEdit(item)} disabled={storageBlocked}>Edit</button>{item.status !== "paid" && <button className="text-button" type="button" onClick={() => updatePartnershipStatus(item, item.status === "closed" ? "lead" : "closed")} disabled={storageBlocked}>{item.status === "closed" ? "Reopen lead" : "Close record"}</button>}<button className="text-button" type="button" onClick={() => { if (window.confirm("Remove this partnership record from this browser?")) setPartnerships((current) => current.filter((entry) => entry.id !== item.id)); }}>Remove</button></div>
          </article>)}</div>}
        </div>
      </>}

      {activeSection === "affiliates" && <>
        <div className="monetization-subpanel"><h3>{editingAffiliateId ? "Edit affiliate record" : "Add an affiliate link"}</h3>
          <p className="muted">Use clear disclosures for affiliate relationships. No click tracking or payment access is connected; record only numbers you actually have.</p>
          <form className="monetization-form-grid" onSubmit={saveAffiliate}>
            <div><label htmlFor="money-affiliate-program">Merchant / program</label><input id="money-affiliate-program" value={affiliateDraft.merchantOrProgram} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, merchantOrProgram: event.target.value })} required maxLength={180} /></div>
            <div><label htmlFor="money-affiliate-product">Product / service</label><input id="money-affiliate-product" value={affiliateDraft.productOrService} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, productOrService: event.target.value })} required maxLength={240} /></div>
            <div className="monetization-wide"><label htmlFor="money-affiliate-url">Destination URL</label><input id="money-affiliate-url" type="url" value={affiliateDraft.destinationUrl} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, destinationUrl: event.target.value })} maxLength={2000} placeholder="https://…" /></div>
            <div><label htmlFor="money-affiliate-status">Status</label><select id="money-affiliate-status" value={affiliateDraft.status} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, status: event.target.value as AffiliateStatus })}><option value="idea">Idea</option><option value="active">Active — reviewed</option><option value="paused">Paused</option><option value="ended">Ended</option></select></div>
            <div><label htmlFor="money-affiliate-commission-kind">Commission type</label><select id="money-affiliate-commission-kind" value={affiliateDraft.commissionKind} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, commissionKind: event.target.value as CommissionKind })}><option value="none">Not recorded</option><option value="estimate">Estimate (not received)</option><option value="received">Received (actual)</option></select></div>
            <div><label htmlFor="money-affiliate-commission">Commission (USD)</label><input id="money-affiliate-commission" type="number" min="0" step="0.01" value={affiliateDraft.commissionUsd} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, commissionUsd: event.target.value })} /></div>
            <div><label htmlFor="money-affiliate-date">Commission as-of date</label><input id="money-affiliate-date" type="date" max={getLocalDateOnly()} value={affiliateDraft.commissionAsOfDate} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, commissionAsOfDate: event.target.value })} /></div>
            <div className="monetization-wide"><label htmlFor="money-affiliate-disclosure">Disclosure text</label><textarea id="money-affiliate-disclosure" value={affiliateDraft.disclosureText} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, disclosureText: event.target.value })} rows={2} maxLength={1000} required /></div>
            <div className="monetization-wide"><label className="monetization-checkbox"><input type="checkbox" checked={affiliateDraft.disclosureReviewed} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, disclosureReviewed: event.target.checked })} /> Disclosure reviewed</label><label className="monetization-checkbox"><input type="checkbox" checked={affiliateDraft.rightsReviewed} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, rightsReviewed: event.target.checked })} /> Product/media rights reviewed</label></div>
            <div className="monetization-wide"><label htmlFor="money-affiliate-evidence">Commission evidence / estimate note</label><textarea id="money-affiliate-evidence" value={affiliateDraft.commissionEvidenceNote} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, commissionEvidenceNote: event.target.value })} rows={2} maxLength={1000} /></div>
            <div className="monetization-wide"><label htmlFor="money-affiliate-notes">Private notes</label><textarea id="money-affiliate-notes" value={affiliateDraft.notes} onChange={(event) => setAffiliateDraft({ ...affiliateDraft, notes: event.target.value })} rows={2} maxLength={2000} /></div>
            <div className="monetization-wide"><div className="action-row"><button className="primary" type="submit" disabled={!ready || storageBlocked}>{editingAffiliateId ? "Update affiliate record" : "Add affiliate record"}</button>{editingAffiliateId && <button className="secondary" type="button" onClick={() => { setAffiliateDraft(emptyAffiliateForm()); setEditingAffiliateId(null); }}>Cancel edit</button>}</div></div>
          </form>
        </div>
        <div className="monetization-subpanel"><h3>Affiliate register</h3>
          {affiliates.length === 0 ? <p className="empty-inline">No affiliate links recorded.</p> : <div className="monetization-record-list">{affiliates.map((item) => <article className="monetization-record-card" key={item.id}>
            <div className="monetization-record-heading"><h4>{item.merchantOrProgram} · {item.productOrService}</h4><span className={item.commissionKind === "received" ? "monetization-pill" : "monetization-pill is-estimate"}>{item.commissionKind === "received" ? "Commission received" : item.commissionKind === "estimate" ? "Estimate only" : item.status}</span></div>
            {item.destinationUrl && <p><a href={item.destinationUrl} target="_blank" rel="noreferrer">Open recorded destination</a></p>}
            <p><strong>Disclosure:</strong> {item.disclosureText || "Not recorded"} · {item.disclosureReviewed ? "reviewed" : "review needed"}</p>
            <p>{item.commissionUsd === null ? "Commission not recorded" : fmtUsd(item.commissionUsd)} · {item.commissionKind === "received" ? "Actual commission (owner-recorded)" : item.commissionKind === "estimate" ? "Estimate, not actual income" : "No commission record"}</p>
            <div className="action-row"><button className="secondary" type="button" onClick={() => beginAffiliateEdit(item)} disabled={storageBlocked}>Edit</button><button className="text-button" type="button" onClick={() => { if (window.confirm("Remove this affiliate record from this browser?")) setAffiliates((current) => current.filter((entry) => entry.id !== item.id)); }}>Remove</button></div>
          </article>)}</div>}
        </div>
      </>}

      {activeSection === "readiness" && <>
        <div className="monetization-subpanel"><h3>Owner-run readiness checklist</h3><p>Use current official policies, and record the source and date that you checked. This checklist is not legal/tax advice, certification, or a platform eligibility determination.</p>
          <div className="monetization-readiness-list">{readinessChecks.map((item) => <article className="monetization-readiness-card" key={item.category}>
            <div className="monetization-record-heading"><h4>{READINESS_LABELS[item.category]}</h4><span className={item.status === "reviewed" ? "monetization-pill" : item.status === "needs-action" ? "monetization-pill is-warning" : "monetization-pill is-estimate"}>{READINESS_STATUS_LABELS[item.status]}</span></div>
            <label htmlFor={`money-readiness-status-${item.category}`}>Status<select id={`money-readiness-status-${item.category}`} value={item.status} onChange={(event) => updateReadiness(item.category, { status: event.target.value as ReadinessStatus })}><option value="not-reviewed">Not reviewed</option><option value="needs-action">Needs action</option><option value="reviewed">Reviewed by owner</option></select></label>
            <div className="monetization-form-grid">
              <div><label htmlFor={`money-readiness-date-${item.category}`}>Review date</label><input id={`money-readiness-date-${item.category}`} type="date" max={getLocalDateOnly()} value={item.reviewedDate} onChange={(event) => updateReadiness(item.category, { reviewedDate: event.target.value })} /></div>
              <div><label htmlFor={`money-readiness-source-${item.category}`}>Official source URL</label><input id={`money-readiness-source-${item.category}`} type="url" value={item.sourceUrl} onChange={(event) => updateReadiness(item.category, { sourceUrl: event.target.value })} maxLength={2000} placeholder="https://…" /></div>
              <div className="monetization-wide"><label htmlFor={`money-readiness-notes-${item.category}`}>What you checked / action needed</label><textarea id={`money-readiness-notes-${item.category}`} value={item.notes} onChange={(event) => updateReadiness(item.category, { notes: event.target.value })} rows={2} maxLength={1000} /></div>
            </div>
          </article>)}</div>
        </div>
      </>}

      <div className="monetization-export-bar">
        <button className="secondary" type="button" onClick={exportJSON} disabled={storageBlocked}>Export full workspace JSON backup</button>
        <button className="secondary" type="button" onClick={exportPartnershipCsv} disabled={storageBlocked}>Export partnerships CSV</button>
        <button className="secondary" type="button" onClick={exportAffiliateCsv} disabled={storageBlocked}>Export affiliates CSV</button>
        {!storageBlocked && <label htmlFor="monetization-import-file">Merge JSON backup<input id="monetization-import-file" type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void importBackup(file); }} /></label>}
      </div>
      {message && <p className="monetization-message" role="status" aria-live="polite">{message}</p>}
      <p className="hint monetization-privacy-note">Saved in this browser only and not encrypted at rest or synced. No passwords, bank/card details or tax IDs are requested. Export backups privately. A parent/legal guardian should be involved in contracts and payments for creators under 18. Current policies and eligibility must be checked with each platform directly.</p>
    </section>
  );
}
