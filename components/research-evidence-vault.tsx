"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  createEmptyResearchEvidenceArchive,
  findPotentialEvidenceConflicts,
  isHttpSourceUrl,
  mergeResearchEvidence,
  parseResearchEvidenceArchive,
  researchEvidenceArchiveFitsByteLimit,
  type ResearchCaptureMethod,
  type ResearchEvidenceArchive,
  type ResearchEvidenceClaim,
  type ResearchEvidenceSource,
} from "@/lib/research-evidence";

export type ResearchPageCapture = {
  requestedUrl: string;
  finalUrl: string;
  contentType: string;
  redirectCount: number;
  limitation: string;
  title: string;
  description: string;
  siteName: string;
  textExcerpt: string;
  structuredRecipe: {
    name: string;
    description: string;
    author: string;
    servings: string;
    prepTime: string;
    cookTime: string;
    totalTime: string;
    ingredients: string[];
    instructions: string[];
  } | null;
};

type ResearchEvidenceVaultProps = {
  inspectedSource?: ResearchPageCapture | null;
  onImportedSource?: () => void;
};

const DATABASE_NAME = "cooking-creator-research-evidence";
const DATABASE_VERSION = 1;
const ARCHIVE_STORE = "archives";
const PRIMARY_ARCHIVE_KEY = "primary";
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

function openEvidenceDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support IndexedDB. The evidence ledger is unavailable in this session."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ARCHIVE_STORE)) {
        database.createObjectStore(ARCHIVE_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      // A blocked open can later succeed after the caller has shown a recoverable
      // error. Close that late connection instead of leaking it in the browser.
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("Could not open the local evidence database."));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("The evidence database is busy in another tab. Close other Cooking Creator tabs and try again."));
    };
  });
}

async function readArchive(): Promise<ResearchEvidenceArchive> {
  const database = await openEvidenceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(ARCHIVE_STORE, "readonly");
      const request = transaction.objectStore(ARCHIVE_STORE).get(PRIMARY_ARCHIVE_KEY);
      request.onsuccess = () => {
        if (request.result === undefined) {
          resolve(createEmptyResearchEvidenceArchive());
          return;
        }
        const parsed = parseResearchEvidenceArchive(request.result);
        if (!parsed) {
          reject(new Error("The saved evidence archive failed validation. It was not overwritten."));
          return;
        }
        resolve(parsed);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read the local evidence archive."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Reading the local evidence archive was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function writeArchive(
  archive: ResearchEvidenceArchive,
  expectedCurrentArchive: ResearchEvidenceArchive,
): Promise<void> {
  const validated = parseResearchEvidenceArchive(archive);
  if (!validated) throw new Error("The evidence archive failed validation and was not saved.");
  const expected = parseResearchEvidenceArchive(expectedCurrentArchive);
  if (!expected) throw new Error("The current in-memory evidence snapshot failed validation. Reload before saving.");
  // Keep the persisted archive within the same limit accepted by restore so
  // every archive saved by this version remains exportable and restorable.
  if (!researchEvidenceArchiveFitsByteLimit(validated, MAX_IMPORT_BYTES)) {
    throw new Error("The evidence ledger would exceed the 25 MB recovery limit. Nothing was saved. Export a backup and remove older records before trying again; the previous saved ledger remains intact.");
  }

  const database = await openEvidenceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      // Read and compare inside the same read-write transaction. This makes
      // the check atomic across tabs and prevents a stale tab silently erasing
      // records saved by another tab.
      const transaction = database.transaction(ARCHIVE_STORE, "readwrite");
      const store = transaction.objectStore(ARCHIVE_STORE);
      const currentRequest = store.get(PRIMARY_ARCHIVE_KEY);
      let safeAbortError: Error | null = null;

      currentRequest.onsuccess = () => {
        const rawCurrent = currentRequest.result;
        if (rawCurrent === undefined) {
          if (expected.sources.length > 0 || expected.claims.length > 0) {
            safeAbortError = new Error("The saved evidence ledger changed in another tab. Reload this page before saving again; no current records were overwritten.");
            transaction.abort();
            return;
          }
        } else {
          const current = parseResearchEvidenceArchive(rawCurrent);
          if (!current) {
            safeAbortError = new Error("The saved evidence ledger no longer passes validation. Nothing was overwritten; export or recover a known-good backup before continuing.");
            transaction.abort();
            return;
          }
          if (JSON.stringify(current) !== JSON.stringify(expected)) {
            safeAbortError = new Error("The evidence ledger changed in another tab. Reload this page before saving again; your newer saved records were not overwritten.");
            transaction.abort();
            return;
          }
        }

        store.put(validated, PRIMARY_ARCHIVE_KEY);
      };
      currentRequest.onerror = () => {
        safeAbortError = currentRequest.error instanceof Error
          ? currentRequest.error
          : new Error("Could not check the current saved evidence before writing.");
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(safeAbortError ?? transaction.error ?? new Error("Could not save the local evidence archive."));
      transaction.onabort = () => reject(safeAbortError ?? transaction.error ?? new Error("Saving was interrupted. The previous saved archive should remain intact."));
    });
  } finally {
    database.close();
  }
}

/**
 * Recovery-only path used when the current archive could not be parsed.
 * It replaces the stored value only if it is still missing or invalid, and
 * only after the owner explicitly chooses a valid backup. A concurrently
 * repaired valid archive is never overwritten by this recovery operation.
 */
async function restoreOverMissingOrInvalidArchive(
  candidateValue: ResearchEvidenceArchive,
): Promise<void> {
  const candidate = parseResearchEvidenceArchive(candidateValue);
  if (!candidate) throw new Error("The selected recovery archive failed validation.");
  // Recovery bypasses the normal React save path, so enforce the exact same
  // serialized-size guard before opening a transaction or touching saved data.
  if (!researchEvidenceArchiveFitsByteLimit(candidate, MAX_IMPORT_BYTES)) {
    throw new Error("The selected recovery backup exceeds the 25 MB recovery limit. Nothing was written.");
  }

  const database = await openEvidenceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ARCHIVE_STORE, "readwrite");
      const store = transaction.objectStore(ARCHIVE_STORE);
      const request = store.get(PRIMARY_ARCHIVE_KEY);
      let recoveryError: Error | null = null;

      request.onsuccess = () => {
        const rawCurrent = request.result;
        if (rawCurrent !== undefined && parseResearchEvidenceArchive(rawCurrent)) {
          recoveryError = new Error(
            "A valid evidence ledger is now saved in this browser, so recovery stopped to protect it. Reload this page before restoring again.",
          );
          transaction.abort();
          return;
        }
        store.put(candidate, PRIMARY_ARCHIVE_KEY);
      };
      request.onerror = () => {
        recoveryError = new Error("Could not verify the stored archive before recovery. No backup was written.");
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(recoveryError ?? transaction.error ?? new Error("Backup recovery could not be completed."));
      };
      transaction.onabort = () => {
        reject(recoveryError ?? transaction.error ?? new Error("Backup recovery was interrupted. No successful restore was reported."));
      };
    });
  } finally {
    database.close();
  }
}

function canonicalSourceIdentity(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\\/+$/, "") || "/";
    return url.href;
  } catch {
    return value.trim();
  }
}

function makeRecordId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function downloadArchive(archive: ResearchEvidenceArchive) {
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cooking-creator-evidence-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  // Allow the browser to begin the download before releasing the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function ResearchEvidenceVault({ inspectedSource = null, onImportedSource }: ResearchEvidenceVaultProps) {
  const [archive, setArchive] = useState<ResearchEvidenceArchive | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [captureMethod, setCaptureMethod] = useState<ResearchCaptureMethod>("manual");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [subject, setSubject] = useState("");
  const [predicate, setPredicate] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    readArchive()
      .then((saved) => {
        if (!cancelled) {
          setArchive(saved);
          setSelectedSourceId(saved.sources[0]?.id ?? "");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load the evidence archive.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => { cancelled = true; };
  }, []);

  const conflicts = useMemo(() => archive ? findPotentialEvidenceConflicts(archive) : [], [archive]);

  async function commit(next: ResearchEvidenceArchive, successMessage: string): Promise<boolean> {
    // Avoid two rapid actions writing snapshots based on the same stale React
    // state. IndexedDB transactions are atomic, but the caller's snapshot can
    // still be stale if concurrent writes are allowed to race.
    if (saveLock.current) return false;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!archive) throw new Error("The evidence ledger has not finished loading. Nothing was saved.");
      await writeArchive(next, archive);
      setArchive(next);
      setMessage(successMessage);
      return true;
    } catch (cause) {
      const name = typeof cause === "object" && cause !== null && "name" in cause
        ? String((cause as { name?: unknown }).name ?? "")
        : "";
      if (name === "QuotaExceededError") {
        setError("This browser has run out of storage for the evidence ledger. Export a JSON backup, remove unneeded records, and try again. The previous saved archive was not intentionally replaced.");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not save. Your previous saved archive has not been intentionally replaced.");
      }
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function saveInspectedSourceToLedger() {
    if (!archive || !inspectedSource) return;

    const finalUrl = inspectedSource.finalUrl.trim();
    if (!isHttpSourceUrl(finalUrl)) {
      setError("The inspected page URL cannot be stored by the evidence ledger. Nothing was imported.");
      return;
    }

    const capturedAt = new Date().toISOString();
    const recipe = inspectedSource.structuredRecipe;
    const recipeLabel = (recipe?.name.trim() || inspectedSource.title.trim() || new URL(finalUrl).hostname).slice(0, 240);
    const publisher = (inspectedSource.siteName.trim() || new URL(finalUrl).hostname).slice(0, 250);
    const candidates: Array<{ predicate: string; value: string; excerpt: string }> = [];
    const addCandidate = (predicate: string, value: string | undefined) => {
      const cleaned = typeof value === "string" ? value.trim() : "";
      if (!cleaned) return;
      candidates.push({
        predicate: predicate.slice(0, 120),
        value: cleaned.slice(0, 2_000),
        excerpt: cleaned.slice(0, 1_600),
      });
    };

    addCandidate("recipe name", recipe?.name);
    addCandidate("description", recipe?.description || inspectedSource.description);
    addCandidate("listed author", recipe?.author);
    addCandidate("listed yield", recipe?.servings);
    addCandidate("listed prep time", recipe?.prepTime);
    addCandidate("listed cook time", recipe?.cookTime);
    addCandidate("listed total time", recipe?.totalTime);
    recipe?.ingredients.forEach((ingredient, index) => addCandidate(`ingredient ${index + 1}`, ingredient));
    recipe?.instructions.forEach((instruction, index) => addCandidate(`instruction step ${index + 1}`, instruction));
    // When Schema.org recipe data is absent, keep the exact bounded page excerpt
    // as attributed evidence instead of losing the only text the inspector found.
    if (!recipe && inspectedSource.textExcerpt.trim()) {
      addCandidate("page text excerpt", inspectedSource.textExcerpt.slice(0, 2_000));
    }

    const sourceTitle = (recipe?.name.trim() || inspectedSource.title.trim() || finalUrl).slice(0, 500);
    const sourceIdentity = canonicalSourceIdentity(finalUrl);
    // A re-inspection of one canonical URL updates the existing source record.
    // It must not create a fake "independent" source merely because the title,
    // publisher metadata, or extracted recipe fields changed.
    const existingSource = archive.sources.find((existing) =>
      canonicalSourceIdentity(existing.url) === sourceIdentity
    );
    const missingCandidates = candidates.filter((candidate) => !(
      existingSource && archive.claims.some((claim) =>
        claim.sourceId === existingSource.id &&
        claim.subject === recipeLabel &&
        claim.predicate === candidate.predicate &&
        claim.value === candidate.value &&
        claim.unit === "" &&
        claim.excerpt === candidate.excerpt &&
        claim.reviewStatus !== "rejected"
      )
    ));

    const source: ResearchEvidenceSource = {
      id: existingSource?.id ?? makeRecordId("source"),
      url: finalUrl,
      title: sourceTitle,
      publisher,
      capturedAt,
      captureMethod: recipe ? "schema-org" : "page-text",
      status: "accessible",
      warnings: [
        "Captured from accessible public HTML after an explicit owner action. Extracted facts are not independently verified.",
        `Requested URL: ${inspectedSource.requestedUrl.slice(0, 800)}`,
        `Content type: ${inspectedSource.contentType.slice(0, 200)}; redirects followed: ${inspectedSource.redirectCount}`,
        `Inspection limitation: ${inspectedSource.limitation.slice(0, 1_000)}`,
        ...(!recipe ? ["No Schema.org recipe was available; no video/audio or frames were analysed."] : []),
      ],
    };
    const claims: ResearchEvidenceClaim[] = missingCandidates.map((candidate) => ({
      id: makeRecordId("claim"),
      sourceId: source.id,
      subject: recipeLabel,
      predicate: candidate.predicate,
      value: candidate.value,
      unit: "",
      excerpt: candidate.excerpt,
      capturedAt,
      reviewStatus: "unreviewed",
    }));
    const nextArchive = mergeResearchEvidence(archive, [source], claims, capturedAt);
    if (!nextArchive) {
      setError("The inspected source could not be validated for the evidence ledger. Nothing was imported.");
      return;
    }

    const successMessage = existingSource
      ? claims.length > 0
        ? `Updated the existing source and added ${claims.length} new unreviewed field${claims.length === 1 ? "" : "s"}. Existing facts were not duplicated.`
        : "Updated the existing source details. No duplicate facts were added."
      : `Saved the inspected page and ${claims.length} extracted field${claims.length === 1 ? "" : "s"} as unreviewed evidence. Check every value against the source before relying on it.`;
    const saved = await commit(nextArchive, successMessage);
    if (saved) onImportedSource?.();
  }

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archive) return;
    const normalizedUrl = sourceUrl.trim();
    if (!isHttpSourceUrl(normalizedUrl)) {
      setError("Enter a valid public-looking HTTP(S) URL without credentials or a custom port. Saving a URL does not inspect or verify its page.");
      return;
    }
    const canonicalUrl = canonicalSourceIdentity(normalizedUrl);
    const existingSource = archive.sources.find((source) => canonicalSourceIdentity(source.url) === canonicalUrl);
    if (existingSource) {
      setSelectedSourceId(existingSource.id);
      setError("");
      setMessage("This page is already in the evidence ledger. I selected its existing record instead of creating a duplicate source. Add any new claim to that record.");
      return;
    }
    const now = new Date().toISOString();
    const source: ResearchEvidenceSource = {
      id: makeRecordId("source"),
      url: normalizedUrl,
      title: sourceTitle.trim(),
      publisher: publisher.trim(),
      capturedAt: now,
      captureMethod,
      status: "needs-input",
      warnings: ["Owner-entered source record. Content has not been independently fetched or verified by this ledger."],
    };
    const next = mergeResearchEvidence(archive, [source], [], now);
    if (!next) {
      setError("The source record failed validation and was not saved.");
      return;
    }
    if (await commit(next, "Source saved locally. Its contents are not verified.")) {
      setSourceUrl("");
      setSourceTitle("");
      setPublisher("");
      setSelectedSourceId(source.id);
    }
  }

  async function addClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archive) return;
    if (!selectedSourceId || !archive.sources.some((source) => source.id === selectedSourceId)) {
      setError("Add and select a source before recording a claim.");
      return;
    }
    const now = new Date().toISOString();
    const claim: ResearchEvidenceClaim = {
      id: makeRecordId("claim"),
      sourceId: selectedSourceId,
      subject: subject.trim(),
      predicate: predicate.trim(),
      value: value.trim(),
      unit: unit.trim(),
      excerpt: excerpt.trim(),
      capturedAt: now,
      reviewStatus: "unreviewed",
    };
    const next = mergeResearchEvidence(archive, [], [claim], now);
    if (!next) {
      setError("Complete the subject, field and value. The claim failed validation and was not saved.");
      return;
    }
    if (await commit(next, "Claim saved locally and marked unreviewed.")) {
      setSubject("");
      setPredicate("");
      setValue("");
      setUnit("");
      setExcerpt("");
    }
  }

  async function setClaimReviewStatus(claimId: string, reviewStatus: ResearchEvidenceClaim["reviewStatus"]) {
    if (!archive) return;
    const next = parseResearchEvidenceArchive({
      ...archive,
      updatedAt: new Date().toISOString(),
      claims: archive.claims.map((claim) => claim.id === claimId ? { ...claim, reviewStatus } : claim),
    });
    if (!next) {
      setError("The review change failed validation and was not saved.");
      return;
    }
    await commit(next, reviewStatus === "accepted" ? "Claim marked as reviewed by you; this is not independent verification." : "Claim rejected in your local review.");
  }

  async function removeSource(sourceId: string) {
    if (!archive || saving) return;
    const source = archive.sources.find((item) => item.id === sourceId);
    if (!source) return;
    const linkedClaims = archive.claims.filter((claim) => claim.sourceId === sourceId);
    const confirmed = window.confirm(
      `Remove “${source.title || source.url}” and its ${linkedClaims.length} linked claim(s) from this browser? Export a backup first if you may need them.`,
    );
    if (!confirmed) return;

    const next = parseResearchEvidenceArchive({
      ...archive,
      updatedAt: new Date().toISOString(),
      sources: archive.sources.filter((item) => item.id !== sourceId),
      claims: archive.claims.filter((claim) => claim.sourceId !== sourceId),
    });
    if (!next) {
      setError("The source could not be removed safely. Your saved evidence was not changed.");
      return;
    }
    if (await commit(next, "Source and its linked claims removed from this browser.")) {
      if (selectedSourceId === sourceId) setSelectedSourceId(next.sources[0]?.id ?? "");
    }
  }

  async function removeClaim(claimId: string) {
    if (!archive || saving) return;
    const claim = archive.claims.find((item) => item.id === claimId);
    if (!claim) return;
    const confirmed = window.confirm(
      `Remove the claim “${claim.subject} · ${claim.predicate}: ${claim.value}” from this browser?`,
    );
    if (!confirmed) return;

    const next = parseResearchEvidenceArchive({
      ...archive,
      updatedAt: new Date().toISOString(),
      claims: archive.claims.filter((item) => item.id !== claimId),
    });
    if (!next) {
      setError("The claim could not be removed safely. Your saved evidence was not changed.");
      return;
    }
    await commit(next, "Claim removed from this browser.");
  }

  async function importArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("Evidence backup is larger than 25 MB. Nothing was imported.");
      return;
    }
    try {
      const candidate = parseResearchEvidenceArchive(JSON.parse(await file.text()) as unknown);
      if (!candidate) {
        setError("This file is not a valid supported evidence backup. Nothing was imported.");
        return;
      }

      if (!archive) {
        const confirmed = window.confirm(
          "The current evidence ledger could not be loaded. Restoring this backup may replace the unusable saved archive. The app will protect any valid archive that another tab has saved meanwhile. Continue?",
        );
        if (!confirmed) {
          setError("");
          setMessage("Recovery cancelled. No saved evidence was changed.");
          return;
        }
        setSaving(true);
        setError("");
        setMessage("");
        try {
          const recovered = { ...candidate, updatedAt: new Date().toISOString() };
          await restoreOverMissingOrInvalidArchive(recovered);
          setArchive(recovered);
          setSelectedSourceId(recovered.sources[0]?.id ?? "");
          setMessage("Evidence backup restored. Review the source records before relying on them.");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Backup recovery failed. The saved archive was not confirmed as changed.");
        } finally {
          setSaving(false);
        }
        return;
      }

      if (archive.sources.length > 0 || archive.claims.length > 0) {
        const confirmed = window.confirm(
          "Restoring this backup replaces the current local evidence ledger. Export a backup first. Continue?",
        );
        if (!confirmed) {
          setError("");
          setMessage("Restore cancelled. Your current evidence was not changed.");
          return;
        }
      }
      const restored = { ...candidate, updatedAt: new Date().toISOString() };
      if (await commit(restored, "Evidence backup restored locally.")) {
        setSelectedSourceId(restored.sources[0]?.id ?? "");
      }
    } catch {
      setError("The backup could not be read. Nothing was imported.");
    }
  }

  return (
    <section className="research-evidence-vault" aria-labelledby="research-evidence-vault-title" aria-busy={busy || saving}>
      <div className="research-evidence-vault-heading">
        <div>
          <p className="eyebrow">V2 · LOCAL EVIDENCE VAULT</p>
          <h3 id="research-evidence-vault-title">Evidence ledger</h3>
          <p className="muted">Keep each source connected to the exact claim you recorded. Claims start unreviewed; differences are prompts to check, not proof that a source is wrong.</p>
        </div>
        <div className="research-evidence-actions">
          <button className="secondary" type="button" disabled={!archive || busy || saving} onClick={() => archive && downloadArchive(archive)}>Export JSON</button>
          <label className="secondary research-evidence-import">Restore JSON<input aria-label="Restore evidence backup JSON" type="file" accept="application/json,.json" disabled={busy || saving} onChange={importArchive} /></label>
        </div>
      </div>

      {busy && <p role="status">Loading local evidence…</p>}
      {saving && <p role="status">Saving evidence locally…</p>}
      {error && <p className="research-evidence-error" role="alert">{error}</p>}
      {message && <p className="research-evidence-success" role="status">{message}</p>}

      {!busy && archive && (
        <>
          <div className="research-evidence-counts">
            <span><strong>{archive.sources.length}</strong> sources</span>
            <span><strong>{archive.claims.length}</strong> claims</span>
            <span><strong>{conflicts.length}</strong> possible disagreements</span>
          </div>

          {inspectedSource && (
            <div className="research-evidence-form" aria-label="Inspected page evidence import">
              <h4>Import inspected page into the evidence ledger</h4>
              <p className="hint">Use the existing page inspector result. Ingredients and steps stay linked to this source, but every extracted field remains unreviewed until you check it. This does not analyse video/audio or verify correctness.</p>
              <p><strong>{inspectedSource.structuredRecipe?.name || inspectedSource.title || inspectedSource.finalUrl}</strong></p>
              <p className="hint">{inspectedSource.finalUrl}</p>
              <button className="primary" type="button" disabled={busy || saving || !archive} onClick={() => void saveInspectedSourceToLedger()}>
                Save inspected facts to evidence ledger
              </button>
            </div>
          )}

          <form className="research-evidence-form" onSubmit={addSource}>
            <h4>Add a source record</h4>
            <p className="hint">This records the URL and your capture method only. It does not fetch the page or prove that the content was checked.</p>
            <div className="editor-grid">
              <div><label htmlFor="evidence-source-url">Source URL</label><input id="evidence-source-url" type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></div>
              <div><label htmlFor="evidence-source-title">Source title (optional)</label><input id="evidence-source-title" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} maxLength={500} /></div>
              <div><label htmlFor="evidence-source-publisher">Publisher (optional)</label><input id="evidence-source-publisher" value={publisher} onChange={(event) => setPublisher(event.target.value)} maxLength={250} /></div>
              <div><label htmlFor="evidence-capture-method">Capture method</label><select id="evidence-capture-method" value={captureMethod} onChange={(event) => setCaptureMethod(event.target.value as ResearchCaptureMethod)}><option value="manual">Manual notes</option><option value="schema-org">Schema.org extraction</option><option value="page-text">Page text</option><option value="official-api">Official API</option><option value="user-transcript">User-provided transcript</option><option value="nutrition-dataset">Nutrition dataset</option><option value="other">Other</option></select></div>
            </div>
            <button className="primary" type="submit" disabled={busy || saving}>＋ Save source</button>
          </form>

          <form className="research-evidence-form" onSubmit={addClaim}>
            <h4>Record a claim from a source</h4>
            <div className="editor-grid">
              <div><label htmlFor="evidence-claim-source">Source</label><select id="evidence-claim-source" required value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}><option value="">Choose a source</option>{archive.sources.map((source) => <option key={source.id} value={source.id}>{source.title || source.url}</option>)}</select></div>
              <div><label htmlFor="evidence-claim-subject">Subject</label><input id="evidence-claim-subject" required maxLength={240} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. salt" /></div>
              <div><label htmlFor="evidence-claim-predicate">Field</label><input id="evidence-claim-predicate" required maxLength={120} value={predicate} onChange={(event) => setPredicate(event.target.value)} placeholder="e.g. quantity" /></div>
              <div><label htmlFor="evidence-claim-value">Claimed value</label><input id="evidence-claim-value" required maxLength={2000} value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. 1" /></div>
              <div><label htmlFor="evidence-claim-unit">Unit (optional)</label><input id="evidence-claim-unit" maxLength={80} value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="e.g. tsp" /></div>
              <div><label htmlFor="evidence-claim-excerpt">Short source excerpt / context (optional)</label><textarea id="evidence-claim-excerpt" rows={2} maxLength={1600} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Brief note or excerpt; avoid copying long passages." /></div>
            </div>
            <button className="primary" type="submit" disabled={busy || saving}>＋ Save unreviewed claim</button>
          </form>

          <div className="research-evidence-list">
            <h4>Saved source records</h4>
            {archive.sources.length === 0 ? <p className="empty-inline">No evidence sources yet.</p> : archive.sources.map((source) => (
              <article className="research-evidence-record" key={source.id}>
                <strong>{source.title || source.url}</strong>
                <a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>
                <small>{source.publisher || "Publisher not recorded"} · {source.captureMethod} · {source.status} · {new Date(source.capturedAt).toLocaleString()}</small>
                {source.warnings.map((warning) => <p className="hint" key={warning}>{warning}</p>)}
                <button className="text-button" type="button" disabled={saving} onClick={() => void removeSource(source.id)}>Remove source and linked claims</button>
              </article>
            ))}
          </div>

          <div className="research-evidence-list">
            <h4>Recorded claims</h4>
            {archive.claims.length === 0 ? <p className="empty-inline">No claims yet. Record what the source actually states.</p> : archive.claims.map((claim) => {
              const source = archive.sources.find((item) => item.id === claim.sourceId);
              return <article className="research-evidence-record" key={claim.id}>
                <strong>{claim.subject} · {claim.predicate}: {claim.value}{claim.unit ? ` ${claim.unit}` : ""}</strong>
                <small>Status: {claim.reviewStatus} · Source: {source?.title || source?.url || "missing source"}</small>
                {claim.excerpt && <p>{claim.excerpt}</p>}
                <div className="research-evidence-review-actions">
                  <button className="secondary" type="button" disabled={saving || claim.reviewStatus === "accepted"} onClick={() => setClaimReviewStatus(claim.id, "accepted")}>Mark reviewed</button>
                  <button className="text-button" type="button" disabled={saving || claim.reviewStatus === "rejected"} onClick={() => setClaimReviewStatus(claim.id, "rejected")}>Reject claim</button>
                  {claim.reviewStatus !== "unreviewed" && <button className="text-button" type="button" disabled={saving} onClick={() => setClaimReviewStatus(claim.id, "unreviewed")}>Undo review</button>}
                  <button className="text-button" type="button" disabled={saving} onClick={() => void removeClaim(claim.id)}>Remove claim</button>
                </div>
              </article>;
            })}
          </div>

          <div className="research-evidence-list">
            <h4>Possible disagreements</h4>
            {conflicts.length === 0 ? <p className="empty-inline">No cross-source differences detected in recorded claims. This is not a verification result.</p> : conflicts.map((conflict) => (
              <article className="research-evidence-record research-evidence-conflict" key={conflict.key}>
                <strong>{conflict.subject} · {conflict.predicate}</strong>
                <p>{conflict.explanation}</p>
                {conflict.alternatives.map((alternative) => <div className="research-evidence-alternative" key={alternative.normalizedValue}>
                  <b>{alternative.displayValue}</b>
                  {alternative.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>)}
                </div>)}
              </article>
            ))}
          </div>
        </>
      )}
      <p className="warning">Stored in this browser profile only, not cloud-synced or encrypted at rest. Export a backup before clearing browser data. The ledger does not inspect video/audio, verify food safety, or calculate nutrition.</p>
    </section>
  );
}
