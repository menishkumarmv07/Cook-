"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createEditorialBackupJSON,
  DEFAULT_EDITORIAL_REVIEW_CHECKS,
  DEFAULT_EDITORIAL_SCORES,
  DEFAULT_EDITORIAL_WEIGHTS,
  EDITORIAL_PLATFORMS,
  mergeEditorialIdeas,
  parseEditorialBackupJSON,
  scoreEditorialIdea,
  serializeEditorialIdeasCsv,
  validateEditorialIdea,
  validateEditorialWeights,
  type EditorialEvidenceKind,
  type EditorialIdea,
  type EditorialPlatform,
  type EditorialScoreInputs,
  type EditorialScoreWeights,
  type EditorialStatus,
} from "@/lib/editorial-calendar";
import { getLocalDateOnly } from "@/lib/recipe";

const STORAGE_KEY = "cooking-creator-editorial-workspace-v1";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function makeId(): string {
  return `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyIdea(): EditorialIdea {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: "",
    recipeOrSeries: "",
    platform: EDITORIAL_PLATFORMS[0],
    scheduledDate: "",
    audiencePromise: "",
    originalContribution: "",
    unresolvedQuestions: "",
    hypothesis: "",
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
  };
}

const STATUSES: Array<{ value: EditorialStatus; label: string }> = [
  { value: "idea", label: "Idea backlog" },
  { value: "researching", label: "Researching" },
  { value: "ready", label: "Ready for scheduling" },
  { value: "scheduled", label: "Scheduled manually" },
  { value: "published", label: "Published (record only)" },
  { value: "hold", label: "Hold — do not publish" },
];

const SCORE_FIELDS: Array<{ key: keyof EditorialScoreInputs; label: string; hint: string }> = [
  { key: "audienceFit", label: "US audience fit", hint: "How relevant is the audience promise to the intended audience?" },
  { key: "originality", label: "Original contribution", hint: "How clearly does this idea add your own explanation or demonstration?" },
  { key: "evidenceReadiness", label: "Evidence readiness", hint: "How much source and recipe detail is available to review?" },
  { key: "productionEffort", label: "Production effort", hint: "1 = light lift; 5 = high effort. Higher effort lowers the score." },
  { key: "seasonalRelevance", label: "Seasonal relevance", hint: "How relevant is this to a season or timely occasion you can explain?" },
];

const WEIGHT_FIELDS: Array<{ key: keyof EditorialScoreWeights; label: string }> = [
  { key: "audienceFit", label: "Audience fit" },
  { key: "originality", label: "Originality" },
  { key: "evidenceReadiness", label: "Evidence readiness" },
  { key: "productionEffort", label: "Low-effort preference" },
  { key: "seasonalRelevance", label: "Seasonal relevance" },
];

export default function EditorialCalendar() {
  const [ideas, setIdeas] = useState<EditorialIdea[]>([]);
  const [weights, setWeights] = useState<EditorialScoreWeights>({ ...DEFAULT_EDITORIAL_WEIGHTS });
  const [draft, setDraft] = useState<EditorialIdea>(emptyIdea);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [message, setMessage] = useState("");
  const [showScoringSettings, setShowScoringSettings] = useState(false);
  const [filter, setFilter] = useState<"all" | EditorialStatus>("all");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = parseEditorialBackupJSON(raw);
        if (!saved) {
          setStorageBlocked(true);
          setMessage("The saved editorial workspace failed validation. It has been left untouched. Import a known-good backup or explicitly replace this saved copy before continuing.");
        } else {
          setIdeas(saved.ideas);
          setWeights(saved.weights);
          if (saved.migrationWarnings?.length) setMessage(saved.migrationWarnings.join(" "));
        }
      }
    } catch {
      setStorageBlocked(true);
      setMessage("This browser could not read editorial storage. Existing data has not been replaced. Export/import support may still work if storage becomes available.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || storageBlocked) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, createEditorialBackupJSON(ideas, weights));
    } catch {
      setMessage("Editorial changes are visible in this session but could not be saved in browser storage. Export a JSON backup before leaving this page.");
    }
  }, [ideas, weights, ready, storageBlocked]);

  const counts = useMemo(() => ({
    total: ideas.length,
    scheduled: ideas.filter((idea) => idea.status === "scheduled").length,
    published: ideas.filter((idea) => idea.status === "published").length,
    held: ideas.filter((idea) => idea.status === "hold").length,
  }), [ideas]);

  const visibleIdeas = useMemo(() => {
    return ideas
      .filter((idea) => filter === "all" || idea.status === filter)
      .slice()
      .sort((a, b) => {
        if (!a.scheduledDate && !b.scheduledDate) return scoreEditorialIdea(b.scores, weights) - scoreEditorialIdea(a.scores, weights);
        if (!a.scheduledDate) return 1;
        if (!b.scheduledDate) return -1;
        return a.scheduledDate.localeCompare(b.scheduledDate);
      });
  }, [ideas, filter, weights]);

  const ideasByDate = useMemo(() => {
    const grouped = new Map<string, EditorialIdea[]>();
    for (const idea of ideas) {
      if (!idea.scheduledDate || !/^\d{4}-\d{2}-\d{2}$/.test(idea.scheduledDate)) continue;
      const current = grouped.get(idea.scheduledDate) ?? [];
      current.push(idea);
      grouped.set(idea.scheduledDate, current);
    }
    return grouped;
  }, [ideas]);

  const calendarCells = useMemo(() => {
    const first = new Date(`${calendarMonth}T12:00:00`);
    const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay(), 12, 0, 0);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateOnly = getLocalDateOnly(date);
      return {
        date: dateOnly,
        day: date.getDate(),
        inMonth: date.getMonth() === first.getMonth(),
        entries: ideasByDate.get(dateOnly) ?? [],
      };
    });
  }, [calendarMonth, ideasByDate]);

  function shiftCalendarMonth(offset: number) {
    const date = new Date(`${calendarMonth}T12:00:00`);
    date.setDate(1);
    date.setMonth(date.getMonth() + offset);
    setCalendarMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`);
  }

  function patchDraft(patch: Partial<EditorialIdea>) {
    setDraft((previous) => ({ ...previous, ...patch, updatedAt: new Date().toISOString() }));
  }

  function patchScore(key: keyof EditorialScoreInputs, value: string) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) return;
    patchDraft({ scores: { ...draft.scores, [key]: numeric } });
  }

  function toggleReviewCheck(key: keyof EditorialIdea["reviewChecks"], checked: boolean) {
    patchDraft({ reviewChecks: { ...draft.reviewChecks, [key]: checked } });
  }

  function saveIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (storageBlocked) {
      setMessage("Saved storage is protected while its contents are invalid. Import a known-good backup or explicitly replace the saved copy first.");
      return;
    }
    const candidate: EditorialIdea = {
      ...draft,
      title: draft.title.trim(),
      recipeOrSeries: draft.recipeOrSeries.trim(),
      audiencePromise: draft.audiencePromise.trim(),
      originalContribution: draft.originalContribution.trim(),
      unresolvedQuestions: draft.unresolvedQuestions.trim(),
      hypothesis: draft.hypothesis.trim(),
      sourceUrl: draft.sourceUrl.trim(),
      observationNotes: draft.observationNotes.trim(),
      publishedUrl: draft.publishedUrl.trim(),
      outcomeNotes: draft.outcomeNotes.trim(),
      updatedAt: new Date().toISOString(),
    };
    const errors = validateEditorialIdea(candidate);
    if (errors.length) {
      setMessage(errors.join(" "));
      return;
    }
    if (editingId) {
      setIdeas((current) => current.map((idea) => idea.id === editingId ? candidate : idea));
      setMessage("Idea updated locally. No account, platform or publishing action was performed.");
    } else {
      const merged = mergeEditorialIdeas(ideas, [candidate]);
      if (merged.added === 0) {
        setMessage("A matching idea already exists for this title, recipe/series, platform and date. Edit the existing entry or choose a distinct title/date.");
        return;
      }
      setIdeas(merged.ideas);
      setMessage("Idea saved locally.");
    }
    setDraft(emptyIdea());
    setEditingId(null);
  }

  function beginEdit(idea: EditorialIdea) {
    setDraft({ ...idea, scores: { ...idea.scores }, reviewChecks: { ...idea.reviewChecks } });
    setEditingId(idea.id);
    setMessage("Editing a local copy. Save your changes to apply them.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setDraft(emptyIdea());
    setEditingId(null);
    setMessage("Draft cleared. Existing saved ideas were not changed.");
  }

  function changeStatus(idea: EditorialIdea, status: EditorialStatus) {
    const candidate = { ...idea, status, updatedAt: new Date().toISOString() };
    const errors = validateEditorialIdea(candidate);
    if (errors.length) {
      setMessage(errors.join(" "));
      return;
    }
    setIdeas((current) => current.map((entry) => entry.id === idea.id ? candidate : entry));
    setMessage(status === "published"
      ? "Publication recorded manually. This action does not publish content or verify platform performance."
      : "Editorial status updated locally.");
  }

  function removeIdea(idea: EditorialIdea) {
    if (!window.confirm(`Remove “${idea.title}” from this browser's editorial workspace? Export a backup first if you may need it.`)) return;
    setIdeas((current) => current.filter((entry) => entry.id !== idea.id));
    if (editingId === idea.id) cancelEdit();
    setMessage("Idea removed from this browser.");
  }

  function updateWeight(key: keyof EditorialScoreWeights, value: string) {
    const numeric = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) return;
    const candidate = { ...weights, [key]: numeric };
    const errors = validateEditorialWeights(candidate);
    if (errors.length) {
      setMessage(errors.join(" "));
      return;
    }
    setWeights(candidate);
    setMessage("Scoring weights saved locally. Scores are prioritization aids, not predictions.");
  }

  function exportJSON() {
    downloadFile("cooking-creator-editorial-backup.json", createEditorialBackupJSON(ideas, weights), "application/json;charset=utf-8");
    setMessage("Editorial ideas and scoring weights exported as JSON. Keep the file private.");
  }

  function exportCSV() {
    downloadFile("cooking-creator-editorial-calendar.csv", serializeEditorialIdeasCsv(ideas, weights), "text/csv;charset=utf-8");
    setMessage("Editorial calendar exported as CSV. Source notes and status remain editable in the JSON backup.");
  }

  async function importBackup(file: File | null) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage("Backup exceeds the 5 MB limit. Nothing was imported.");
      return;
    }
    try {
      const parsed = parseEditorialBackupJSON(await file.text());
      if (!parsed) {
        setMessage("This is not a valid editorial-workspace backup. Nothing was imported and current data was not changed.");
        return;
      }
      const merged = mergeEditorialIdeas(storageBlocked ? [] : ideas, parsed.ideas);
      setIdeas(merged.ideas);
      if (storageBlocked || ideas.length === 0) setWeights(parsed.weights);
      setStorageBlocked(false);
      const warnings = parsed.migrationWarnings?.length ? ` Migration: ${parsed.migrationWarnings.join(" ")}` : "";
      setMessage(`Backup checked. Added ${merged.added} idea(s); skipped ${merged.duplicates} duplicate or invalid record(s). Existing distinct records were preserved.${warnings}`);
    } catch {
      setMessage("The backup could not be read by this browser. Nothing was imported.");
    }
  }

  function updatePublishedRecord(idea: EditorialIdea, patch: Partial<Pick<EditorialIdea, "publishedUrl" | "outcomeNotes">>) {
    const candidate = { ...idea, ...patch, updatedAt: new Date().toISOString() };
    const errors = validateEditorialIdea(candidate);
    if (errors.some((error) => /Published URL|Published link/.test(error))) {
      setMessage("Use a safe public HTTP(S) URL for the published link, or leave it blank. Nothing was changed.");
      return;
    }
    setIdeas((current) => current.map((entry) => entry.id === idea.id ? candidate : entry));
  }

  function replaceCorruptCopy() {
    if (!window.confirm("The saved editorial workspace could not be validated. Replace that saved copy with an empty workspace? This cannot recover the unreadable data; try importing a known-good backup first.")) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setIdeas([]);
      setWeights({ ...DEFAULT_EDITORIAL_WEIGHTS });
      setStorageBlocked(false);
      setMessage("Empty editorial workspace created. The previous unreadable saved copy was removed after confirmation.");
    } catch {
      setMessage("Browser storage could not be cleared. The saved copy remains protected.");
    }
  }

  return (
    <section id="editorial-calendar" className="panel editorial-calendar" aria-labelledby="editorial-calendar-title">
      <div className="section-head editorial-heading">
        <div>
          <p className="eyebrow">V2.4 · LOCAL EDITORIAL WORKSPACE</p>
          <h2 id="editorial-calendar-title">Editorial calendar &amp; idea research</h2>
          <p>Plan original cooking content for your intended US audience. A hypothesis is not a trend; dated observations need a source and your notes about what it actually showed.</p>
        </div>
        <span className="step">LOCAL · EVIDENCE FIRST</span>
      </div>
      <p className="editorial-local-note">Saved in this browser on this device only. This screen does not fetch live trends, publish posts, connect social accounts or predict views/revenue. Export backups regularly.</p>

      {storageBlocked && (
        <div className="editorial-alert" role="alert">
          <p>{message || "Saved editorial data is protected because it could not be validated."}</p>
          <label htmlFor="editorial-recovery-file">Import a known-good editorial JSON backup</label>
          <input id="editorial-recovery-file" type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void importBackup(file); }} />
          <button className="secondary" type="button" onClick={replaceCorruptCopy}>Replace unreadable saved copy with empty workspace</button>
        </div>
      )}

      <div className="editorial-summary" aria-label="Editorial calendar summary">
        <div><small>Ideas in workspace</small><strong>{counts.total}</strong></div>
        <div><small>Manually scheduled</small><strong>{counts.scheduled}</strong></div>
        <div><small>Recorded as published</small><strong>{counts.published}</strong></div>
        <div><small>On hold</small><strong>{counts.held}</strong></div>
      </div>

      <section className="editorial-subpanel" aria-labelledby="editorial-new-title">
        <div className="subsection-head">
          <div><h3 id="editorial-new-title">{editingId ? "Edit content idea" : "Add a content idea"}</h3><p className="muted">Describe the value you will add, not just a topic to copy.</p></div>
        </div>
        <form className="editorial-form" onSubmit={saveIdea}>
          <div className="editorial-form-grid">
            <div><label htmlFor="editorial-title">Idea title *</label><input id="editorial-title" value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} maxLength={180} required placeholder="e.g. A clear 3-step weeknight dinner" /></div>
            <div><label htmlFor="editorial-series">Recipe family / series</label><input id="editorial-series" value={draft.recipeOrSeries} onChange={(event) => patchDraft({ recipeOrSeries: event.target.value })} maxLength={180} placeholder="e.g. budget-friendly dinners" /></div>
            <div><label htmlFor="editorial-platform">Platform *</label><select id="editorial-platform" value={draft.platform} onChange={(event) => patchDraft({ platform: event.target.value as EditorialPlatform })}>{EDITORIAL_PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></div>
            <div><label htmlFor="editorial-date">Planned publish date</label><input id="editorial-date" type="date" min={getLocalDateOnly()} value={draft.scheduledDate} onChange={(event) => patchDraft({ scheduledDate: event.target.value })} /><small className="hint">A plan only. The app will not schedule this with a social platform.</small></div>
            <div className="editorial-wide"><label htmlFor="editorial-promise">Audience promise *</label><textarea id="editorial-promise" value={draft.audiencePromise} onChange={(event) => patchDraft({ audiencePromise: event.target.value })} rows={2} maxLength={500} required placeholder="What useful outcome will a viewer get?" /></div>
            <div className="editorial-wide"><label htmlFor="editorial-original">Your original contribution *</label><textarea id="editorial-original" value={draft.originalContribution} onChange={(event) => patchDraft({ originalContribution: event.target.value })} rows={3} maxLength={1000} required placeholder="Your real test, explanation, comparison, technique, story, or other meaningful addition." /></div>
            <div className="editorial-wide"><label htmlFor="editorial-unresolved-questions">Open questions / do-not-publish blockers</label><textarea id="editorial-unresolved-questions" value={draft.unresolvedQuestions} onChange={(event) => patchDraft({ unresolvedQuestions: event.target.value })} rows={2} maxLength={1000} placeholder="Record unresolved recipe steps, safety, rights, nutrition or disclosure questions. Required before putting this item on Hold." /><small className="hint">A Hold status must include a specific blocker so the reason is clear to your future self.</small></div>
            <div className="editorial-wide"><label htmlFor="editorial-hypothesis">Hypothesis to test</label><textarea id="editorial-hypothesis" value={draft.hypothesis} onChange={(event) => patchDraft({ hypothesis: event.target.value })} rows={2} maxLength={1000} placeholder="What do you want to learn from real results?" /></div>
          </div>

          <fieldset className="editorial-fieldset">
            <legend>Evidence for any trend or timely claim</legend>
            <div className="editorial-form-grid">
              <div><label htmlFor="editorial-evidence-kind">Evidence type</label><select id="editorial-evidence-kind" value={draft.evidenceKind} onChange={(event) => patchDraft({ evidenceKind: event.target.value as EditorialEvidenceKind })}><option value="hypothesis">Hypothesis / idea, not a verified trend</option><option value="dated-observation">Dated observation from a source</option></select></div>
              <div><label htmlFor="editorial-source-url">Public source URL {draft.evidenceKind === "dated-observation" ? "*" : ""}</label><input id="editorial-source-url" type="url" value={draft.sourceUrl} onChange={(event) => patchDraft({ sourceUrl: event.target.value })} maxLength={2000} placeholder="https://…" /></div>
              <div><label htmlFor="editorial-observed-date">Date observed {draft.evidenceKind === "dated-observation" ? "*" : ""}</label><input id="editorial-observed-date" type="date" max={getLocalDateOnly()} value={draft.observedDate} onChange={(event) => patchDraft({ observedDate: event.target.value })} /></div>
              <div className="editorial-wide"><label htmlFor="editorial-observation-notes">What the source actually showed {draft.evidenceKind === "dated-observation" ? "*" : ""}</label><textarea id="editorial-observation-notes" value={draft.observationNotes} onChange={(event) => patchDraft({ observationNotes: event.target.value })} maxLength={1000} rows={2} placeholder="Describe the limited observation. Do not infer market-wide demand from one post or source." /></div>
            </div>
            <p className="hint">Only a dated, safe public HTTP(S) URL plus your observation notes can be labelled as a dated observation. This tool does not fetch or independently verify the URL.</p>
          </fieldset>

          <fieldset className="editorial-fieldset">
            <legend>Transparent idea score · each rating from 1 (low) to 5 (high)</legend>
            <div className="editorial-form-grid">
              {SCORE_FIELDS.map((field) => (
                <div key={field.key}>
                  <label htmlFor={`editorial-score-${field.key}`}>{field.label}</label>
                  <select id={`editorial-score-${field.key}`} value={draft.scores[field.key]} onChange={(event) => patchScore(field.key, event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select>
                  <small className="hint">{field.hint}</small>
                </div>
              ))}
            </div>
            <p className="editorial-score-preview">Current rubric score: <strong>{scoreEditorialIdea(draft.scores, weights)} / 100</strong></p>
            <button className="secondary" type="button" onClick={() => setShowScoringSettings((show) => !show)} aria-expanded={showScoringSettings}>{showScoringSettings ? "Hide scoring weights" : "Customize scoring weights"}</button>
            {showScoringSettings && <div className="editorial-weight-grid">
              {WEIGHT_FIELDS.map((field) => (
                <div key={field.key}><label htmlFor={`editorial-weight-${field.key}`}>{field.label} weight (0–10)</label><input id={`editorial-weight-${field.key}`} type="number" min="0" max="10" step="1" value={weights[field.key]} onChange={(event) => updateWeight(field.key, event.target.value)} /></div>
              ))}
              <p className="hint">Higher numbers matter more. At least one weight must be above zero. The score helps sort your own priorities; it is not a prediction of reach, virality, eligibility or income.</p>
            </div>}
          </fieldset>

          <fieldset className="editorial-fieldset">
            <legend>Pre-publish checks (review each even if the item does not use that claim or asset)</legend>
            <div className="editorial-check-grid">
              <label><input type="checkbox" checked={draft.reviewChecks.recipeSafetyReviewed} onChange={(event) => toggleReviewCheck("recipeSafetyReviewed", event.target.checked)} /> Recipe steps and food-safety concerns reviewed</label>
              <label><input type="checkbox" checked={draft.reviewChecks.rightsReviewed} onChange={(event) => toggleReviewCheck("rightsReviewed", event.target.checked)} /> Originality, footage, image and music rights reviewed</label>
              <label><input type="checkbox" checked={draft.reviewChecks.nutritionClaimsReviewed} onChange={(event) => toggleReviewCheck("nutritionClaimsReviewed", event.target.checked)} /> Nutrition/health claims checked or not used</label>
              <label><input type="checkbox" checked={draft.reviewChecks.platformDisclosureReviewed} onChange={(event) => toggleReviewCheck("platformDisclosureReviewed", event.target.checked)} /> Sponsorship, affiliate and synthetic-media disclosures checked</label>
            </div>
            <p className="hint">These are owner-entered review records, not third-party certification. A recipe that is unresolved or not ready should remain in Idea/Researching/Hold.</p>
          </fieldset>

          <div className="action-row"><button className="primary" type="submit" disabled={!ready || storageBlocked}>{editingId ? "Save idea changes" : "Save idea locally"}</button>{editingId && <button className="secondary" type="button" onClick={cancelEdit}>Cancel edit</button>}</div>
        </form>
      </section>

      <section className="editorial-subpanel" aria-labelledby="editorial-list-title">
        <div className="subsection-head">
          <div><h3 id="editorial-list-title">Your idea backlog &amp; calendar</h3><p className="muted">Items with dates appear first. Status changes are validated against the evidence and pre-publish gates.</p></div>
          <label className="editorial-filter-label" htmlFor="editorial-filter">Filter status<select id="editorial-filter" value={filter} onChange={(event) => setFilter(event.target.value as "all" | EditorialStatus)}><option value="all">All items</option>{STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        </div>
        <div className="editorial-calendar-month" aria-label="Monthly editorial calendar">
          <div className="editorial-month-heading">
            <div><h4>{new Date(`${calendarMonth}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h4><p className="hint">Dates are planning notes only; no platform is scheduled automatically.</p></div>
            <div className="editorial-month-controls">
              <button className="secondary" type="button" aria-label="Previous month" onClick={() => shiftCalendarMonth(-1)}>←</button>
              <button className="secondary" type="button" aria-label="Next month" onClick={() => shiftCalendarMonth(1)}>→</button>
            </div>
          </div>
          <div className="editorial-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="editorial-calendar-grid" role="grid" aria-label="Days in selected month">
            {calendarCells.map((cell) => (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                aria-label={`${new Date(`${cell.date}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}; ${cell.entries.length} saved idea(s). Select this date for the idea form.`}
                className={`editorial-day-cell${cell.inMonth ? "" : " is-outside-month"}${cell.entries.length ? " has-ideas" : ""}`}
                onClick={() => {
                  patchDraft({ scheduledDate: cell.date });
                  setMessage(`Draft date set to ${cell.date}. Save the idea form to keep the date; this does not schedule a post.`);
                }}
              >
                <span className="editorial-day-number">{cell.day}</span>
                {cell.entries.slice(0, 2).map((entry) => <span className="editorial-day-entry" key={entry.id} title={entry.title}>{entry.title}</span>)}
                {cell.entries.length > 2 && <span className="editorial-day-more">+{cell.entries.length - 2} more</span>}
              </button>
            ))}
          </div>
        </div>
        {visibleIdeas.length === 0 ? <div className="empty-inline">No ideas match this view yet. Add an original idea above, or change the filter.</div> : (
          <div className="editorial-idea-list">
            {visibleIdeas.map((idea) => (
              <article className="editorial-idea-card" key={idea.id}>
                <div className="editorial-idea-heading">
                  <div><h4>{idea.title}</h4><p>{idea.recipeOrSeries || "No series assigned"} · {idea.platform}</p></div>
                  <span className={idea.status === "hold" ? "editorial-status editorial-status-hold" : "editorial-status"}>{STATUSES.find((status) => status.value === idea.status)?.label ?? idea.status}</span>
                </div>
                <div className="editorial-meta-grid">
                  <div><small>Planned date</small><strong>{idea.scheduledDate || "Not set"}</strong></div>
                  <div><small>Priority rubric</small><strong>{scoreEditorialIdea(idea.scores, weights)} / 100</strong></div>
                  <div><small>Evidence</small><strong>{idea.evidenceKind === "dated-observation" ? `Observation · ${idea.observedDate}` : "Hypothesis (not a live trend)"}</strong></div>
                </div>
                <p className="editorial-card-copy"><strong>Audience promise:</strong> {idea.audiencePromise}</p>
                <p className="editorial-card-copy"><strong>Original contribution:</strong> {idea.originalContribution}</p>
                {idea.evidenceKind === "dated-observation" && <p className="editorial-card-copy"><strong>Observation:</strong> {idea.observationNotes} · <a href={idea.sourceUrl} target="_blank" rel="noreferrer">Open recorded source</a></p>}
                {idea.hypothesis && <p className="editorial-card-copy"><strong>Hypothesis:</strong> {idea.hypothesis}</p>}
                {idea.status === "hold" && <div className="editorial-warning"><strong>Do not publish yet.</strong><p>This idea is on hold because of the following unresolved question(s):</p><p>{idea.unresolvedQuestions}</p>Resolve the blocker and review the relevant evidence before changing the status.</div>}
                <div className="editorial-card-controls">
                  <label htmlFor={`editorial-status-${idea.id}`}>Status<select id={`editorial-status-${idea.id}`} value={idea.status} onChange={(event) => changeStatus(idea, event.target.value as EditorialStatus)} disabled={storageBlocked}>{STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
                  <button className="secondary" type="button" onClick={() => beginEdit(idea)} disabled={storageBlocked}>Edit</button>
                  <button className="secondary" type="button" onClick={() => removeIdea(idea)} disabled={storageBlocked}>Remove</button>
                </div>
                {idea.status === "published" && <div className="editorial-published-result"><label htmlFor={`editorial-published-url-${idea.id}`}>Recorded published URL</label><input id={`editorial-published-url-${idea.id}`} type="url" value={idea.publishedUrl} onChange={(event) => updatePublishedRecord(idea, { publishedUrl: event.target.value })} maxLength={2000} placeholder="https://… (optional)" /><label htmlFor={`editorial-outcome-${idea.id}`}>What you learned from actual results</label><textarea id={`editorial-outcome-${idea.id}`} rows={2} value={idea.outcomeNotes} onChange={(event) => updatePublishedRecord(idea, { outcomeNotes: event.target.value })} maxLength={2000} placeholder="Use real reported data and keep estimates labelled." /></div>}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="action-row editorial-export-actions">
        <button className="secondary" type="button" onClick={exportCSV} disabled={storageBlocked}>Export calendar CSV</button>
        <button className="secondary" type="button" onClick={exportJSON} disabled={storageBlocked}>Export workspace JSON backup</button>
        {!storageBlocked && <label className="editorial-import-label" htmlFor="editorial-import-file">Merge JSON backup<input id="editorial-import-file" type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void importBackup(file); }} /></label>}
      </div>
      {message && <p className="editorial-message" role="status" aria-live="polite">{message}</p>}
      <p className="hint">Local data is not encrypted at rest or synced to another device. Keep exports private. This workspace does not independently verify a source, discover current trends, determine legal rights, or guarantee views or earnings.</p>
    </section>
  );
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
