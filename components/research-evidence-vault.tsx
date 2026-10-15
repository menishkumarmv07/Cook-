"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  createEmptyResearchEvidenceArchive,
  findPotentialEvidenceConflicts,
  isHttpSourceUrl,
  mergeResearchEvidence,
  parseResearchEvidenceArchive,
  type ResearchCaptureMethod,
  type ResearchEvidenceArchive,
  type ResearchEvidenceClaim,
  type ResearchEvidenceSource,
} from "@/lib/research-evidence";

const DATABASE_NAME = "cooking-creator-research-evidence";
const DATABASE_VERSION = 1;
const ARCHIVE_STORE = "archives";
const PRIMARY_ARCHIVE_KEY = "primary";
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

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

async function writeArchive(archive: ResearchEvidenceArchive): Promise<void> {
  const validated = parseResearchEvidenceArchive(archive);
  if (!validated) throw new Error("The evidence archive failed validation and was not saved.");

  const database = await openEvidenceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ARCHIVE_STORE, "readwrite");
      transaction.objectStore(ARCHIVE_STORE).put(validated, PRIMARY_ARCHIVE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the local evidence archive."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving was interrupted. The previous saved archive should remain intact."));
    });
  } finally {
    database.close();
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

export default function ResearchEvidenceVault() {
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
      await writeArchive(next);
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

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archive) return;
    const normalizedUrl = sourceUrl.trim();
    if (!isHttpSourceUrl(normalizedUrl)) {
      setError("Enter a valid public-looking HTTP(S) URL without credentials or a custom port. Saving a URL does not inspect or verify its page.");
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

  async function importArchive(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError("Evidence backup is larger than 2 MB. Nothing was imported.");
      return;
    }
    try {
      const candidate = parseResearchEvidenceArchive(JSON.parse(await file.text()) as unknown);
      if (!candidate) {
        setError("This file is not a valid supported evidence backup. Nothing was imported.");
        return;
      }
      if (archive && (archive.sources.length > 0 || archive.claims.length > 0)) {
        const confirmed = window.confirm(
          "Restoring this backup replaces the current local evidence ledger. Export a backup first. Continue?",
        );
        if (!confirmed) {
          setError("");
          setMessage("Restore cancelled. Your current evidence was not changed.");
          return;
        }
      }
      await commit({ ...candidate, updatedAt: new Date().toISOString() }, "Evidence backup restored locally.");
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
