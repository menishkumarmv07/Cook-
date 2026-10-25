"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  DEFAULT_CREATOR_PROFILE,
  isCreatorProfile,
  parseRecipeProjectJSON,
  type CreatorProfile,
  type RecipeProject,
} from "@/lib/recipe";
import {
  createEmptyResearchEvidenceArchive,
  parseResearchEvidenceArchive,
  type ResearchEvidenceArchive,
} from "@/lib/research-evidence";
import {
  buildV3ContentBlueprint,
  createV3ContentBlueprintBackupJSON,
  parseV3ContentBlueprintBackupJSON,
  validateV3ContentBlueprint,
  verifyV3ContentBlueprintFingerprints,
  type V3ContentBlueprint,
  type V3BlueprintScene,
} from "@/lib/v3-content-blueprint";
import { buildV3SubtitleFile, validateV3SubtitleTimeline, type V3SubtitleFormat } from "@/lib/v3-captions";

const RECIPE_STORAGE_KEY = "cooking-creator-v1-drafts";
const PROFILE_STORAGE_KEY = "cooking-creator-profile-v1";
const EVIDENCE_DATABASE_NAME = "cooking-creator-research-evidence";
const EVIDENCE_DATABASE_VERSION = 1;
const EVIDENCE_STORE = "archives";
const EVIDENCE_ARCHIVE_KEY = "primary";
const PROJECT_DATABASE_NAME = "cooking-creator-v3-content-studio";
const PROJECT_DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const MAX_BACKUP_BYTES = 15 * 1024 * 1024;

type V3StudioProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  blueprint: V3ContentBlueprint;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredProject(value: unknown): value is V3StudioProject {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) &&
    typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 1 &&
    validateV3ContentBlueprint(value.blueprint);
}

function openDatabase(
  name: string,
  version: number,
  storeName: string,
  keyPath?: string,
): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support IndexedDB. V3 projects cannot be safely saved here."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    let settled = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, keyPath ? { keyPath } : undefined);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
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
      reject(request.error ?? new Error("Could not open local V3 project storage."));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("V3 project storage is busy in another tab. Close the other tab and retry."));
    };
  });
}

async function readEvidenceArchive(): Promise<ResearchEvidenceArchive> {
  const database = await openDatabase(
    EVIDENCE_DATABASE_NAME,
    EVIDENCE_DATABASE_VERSION,
    EVIDENCE_STORE,
  );
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(EVIDENCE_STORE, "readonly");
      const request = transaction.objectStore(EVIDENCE_STORE).get(EVIDENCE_ARCHIVE_KEY);
      request.onsuccess = () => {
        if (request.result === undefined) {
          resolve(createEmptyResearchEvidenceArchive());
          return;
        }
        const archive = parseResearchEvidenceArchive(request.result);
        if (!archive) {
          reject(new Error("The saved Research Studio ledger failed validation. V3 did not modify it."));
          return;
        }
        resolve(archive);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read the local Research Studio ledger."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Reading Research Studio evidence was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function loadStoredProjects(): Promise<V3StudioProject[]> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_STORE, "id");
  try {
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      const request = transaction.objectStore(PROJECT_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error("Could not list saved V3 projects."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Listing V3 projects was interrupted."));
    });
    const projects: V3StudioProject[] = [];
    for (const record of records) {
      if (!isStoredProject(record) || !(await verifyV3ContentBlueprintFingerprints(record.blueprint))) {
        throw new Error("A saved V3 project failed validation or fingerprint verification. No saved project was overwritten; keep a backup and investigate this record.");
      }
      projects.push(record);
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    database.close();
  }
}

/**
 * Create/update is guarded by an IndexedDB transaction and a revision check.
 * A stale tab cannot silently overwrite a newer saved project.
 */
async function persistProject(
  project: V3StudioProject,
  expectedRevision: number | null,
): Promise<V3StudioProject> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_STORE, "id");
  try {
    const saved = await new Promise<V3StudioProject>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, "readwrite");
      const store = transaction.objectStore(PROJECT_STORE);
      const request = store.get(project.id);
      let safeError: Error | null = null;
      let result: V3StudioProject | null = null;

      request.onsuccess = () => {
        const existing = request.result;
        if (expectedRevision === null) {
          if (existing !== undefined) {
            safeError = new Error("This new project ID already exists. Nothing was overwritten.");
            transaction.abort();
            return;
          }
          store.add(project);
          result = project;
          return;
        }
        if (!isStoredProject(existing) || existing.revision !== expectedRevision) {
          safeError = new Error("This project changed in another tab. Your edits were not saved over the newer version; reload the project before trying again.");
          transaction.abort();
          return;
        }
        store.put(project);
        result = project;
      };
      request.onerror = () => {
        safeError = new Error("Could not check the last saved project version. Nothing was intentionally overwritten.");
        transaction.abort();
      };
      transaction.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("V3 save completed without a project result."));
      };
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not save the V3 project."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Saving the V3 project was interrupted."));
    });
    return saved;
  } finally {
    database.close();
  }
}

function readSavedRecipes(): { recipes: RecipeProject[]; skipped: number } {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECIPE_STORAGE_KEY);
  } catch {
    throw new Error("Browser storage is unavailable, so V3 could not read your saved V2 recipes.");
  }
  if (!raw) return { recipes: [], skipped: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The saved V2 recipe list is unreadable. V3 has not changed it; export or recover your existing work first.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("The saved V2 recipe list has an unexpected format. V3 has not changed it.");
  }
  const recipes: RecipeProject[] = [];
  let skipped = 0;
  for (const item of parsed) {
    const serialized = JSON.stringify(item);
    if (typeof serialized !== "string") {
      skipped += 1;
      continue;
    }
    const validated = parseRecipeProjectJSON(serialized);
    if (validated) recipes.push(validated);
    else skipped += 1;
  }
  return { recipes: recipes.sort((a, b) => a.name.localeCompare(b.name)), skipped };
}

function readCreatorProfile(): CreatorProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_CREATOR_PROFILE;
    const parsed: unknown = JSON.parse(raw);
    return isCreatorProfile(parsed) ? parsed : DEFAULT_CREATOR_PROFILE;
  } catch {
    return DEFAULT_CREATOR_PROFILE;
  }
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "v3-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

function filenameFromTitle(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return normalized || "cooking-creator-v3-blueprint";
}

function downloadLocalFile(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export default function V3ContentStudio() {
  const [recipes, setRecipes] = useState<RecipeProject[]>([]);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile>(DEFAULT_CREATOR_PROFILE);
  const [projects, setProjects] = useState<V3StudioProject[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [omitResearchLedger, setOmitResearchLedger] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recipeSkippedCount, setRecipeSkippedCount] = useState(0);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => String(recipe.id) === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  );

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoading(true);
      setError("");
      try {
        const saved = readSavedRecipes();
        const profile = readCreatorProfile();
        const savedProjects = await loadStoredProjects();
        if (cancelled) return;
        setRecipes(saved.recipes);
        setRecipeSkippedCount(saved.skipped);
        setCreatorProfile(profile);
        setProjects(savedProjects);
        setSelectedRecipeId(saved.recipes[0] ? String(saved.recipes[0].id) : "");
        setSelectedProjectId(savedProjects[0]?.id ?? "");
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "V3 could not load local data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const captionTimeline = useMemo(
    () => validateV3SubtitleTimeline(activeProject?.blueprint.scenes ?? []),
    [activeProject],
  );

  function updateScene(sceneId: string, field: "title" | "narrationText" | "captionText" | "visualDirection", value: string) {
    if (!activeProject) return;
    setProjects((existing) => existing.map((project) => {
      if (project.id !== activeProject.id) return project;
      const blueprint: V3ContentBlueprint = {
        ...project.blueprint,
        status: "draft",
        scenes: project.blueprint.scenes.map((scene) => scene.id === sceneId
          ? { ...scene, [field]: value, reviewStatus: "needs-review" as const }
          : scene),
        reviewNotes: Array.from(new Set([
          ...project.blueprint.reviewNotes,
          "A scene was edited manually. Re-check every edited statement against the pinned recipe and evidence before export.",
        ])),
      };
      return { ...project, blueprint };
    }));
    setDirty(true);
    setMessage("Unsaved scene edit. Review it against the source recipe before exporting.");
  }

  function updateCaptionTiming(sceneId: string, field: "captionStartMs" | "captionEndMs", value: string) {
    if (!activeProject) return;
    let milliseconds: number | null = null;
    if (value.trim()) {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) {
        setError("Caption times must be between 0 and 86,400 seconds.");
        return;
      }
      milliseconds = Math.round(seconds * 1_000);
    }
    setProjects((existing) => existing.map((project) => {
      if (project.id !== activeProject.id) return project;
      return {
        ...project,
        blueprint: {
          ...project.blueprint,
          status: "draft",
          scenes: project.blueprint.scenes.map((scene) => scene.id === sceneId
            ? { ...scene, [field]: milliseconds, reviewStatus: "needs-review" as const }
            : scene),
          reviewNotes: Array.from(new Set([
            ...project.blueprint.reviewNotes,
            "Caption timing was edited by the owner. Confirm it against the real audio before subtitle export.",
          ])),
        },
      };
    }));
    setDirty(true);
    setError("");
    setMessage("Unsaved caption timing. Times are owner-entered and have not been checked against audio.");
  }

  function exportSubtitles(format: V3SubtitleFormat) {
    if (!activeProject) return;
    try {
      const content = buildV3SubtitleFile(activeProject.blueprint.scenes, format);
      downloadLocalFile(
        filenameFromTitle(activeProject.title) + "." + format,
        content,
        format === "srt" ? "application/x-subrip;charset=utf-8" : "text/vtt;charset=utf-8",
      );
      setError("");
      setMessage("Subtitle file downloaded locally. Playback timing still needs owner review against the final audio.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subtitle export failed validation.");
    }
  }

  async function generateBlueprint() {
    if (!selectedRecipe) {
      setError("Choose a valid saved V2 recipe first. V3 does not invent a recipe for you.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let archive: ResearchEvidenceArchive | undefined;
      if (!omitResearchLedger) {
        archive = await readEvidenceArchive();
      }
      const blueprint = await buildV3ContentBlueprint({
        recipe: selectedRecipe,
        creatorProfile,
        ...(archive ? { researchEvidence: archive } : {}),
      });
      const now = new Date().toISOString();
      const project: V3StudioProject = {
        id: makeId(),
        title: blueprint.recipeTitle || selectedRecipe.name || "Untitled cooking project",
        createdAt: now,
        updatedAt: now,
        revision: 1,
        blueprint,
      };
      await persistProject(project, null);
      setProjects((existing) => [project, ...existing]);
      setSelectedProjectId(project.id);
      setDirty(false);
      setMessage("Blueprint saved locally. It is a scene plan, not a rendered or AI-generated video.");
    } catch (caught) {
      setError(caught instanceof Error
        ? caught.message + (omitResearchLedger ? "" : " If you deliberately want to continue without the separate Research Studio ledger, tick the explicit opt-out and try again.")
        : "The blueprint could not be created. Your saved V2 recipe was not changed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentProject() {
    if (!activeProject) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const candidate: V3StudioProject = {
        ...activeProject,
        title: activeProject.blueprint.recipeTitle || activeProject.title,
        updatedAt: new Date().toISOString(),
        revision: activeProject.revision + 1,
      };
      await persistProject(candidate, activeProject.revision);
      setProjects((existing) => existing.map((project) => project.id === candidate.id ? candidate : project));
      setDirty(false);
      setMessage("Edits saved locally. Scene review is still required before export.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the scene edits.");
    } finally {
      setBusy(false);
    }
  }

  function exportCurrentProject() {
    if (!activeProject) return;
    try {
      const raw = createV3ContentBlueprintBackupJSON(activeProject.blueprint);
      downloadLocalFile(
        filenameFromTitle(activeProject.title) + ".v3-blueprint.json",
        raw,
        "application/json;charset=utf-8",
      );
      setMessage("V3 blueprint backup downloaded to this device. No upload occurred.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The blueprint backup could not be prepared.");
    }
  }

  async function importBlueprint(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError("The backup exceeds 15 MiB. Nothing was imported.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const raw = await file.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
        setError("The backup exceeds 15 MiB. Nothing was imported.");
        return;
      }
      const blueprint = parseV3ContentBlueprintBackupJSON(raw);
      if (!blueprint || !(await verifyV3ContentBlueprintFingerprints(blueprint))) {
        setError("The backup failed schema or source-fingerprint verification. Existing projects were not changed.");
        return;
      }
      // Restored files are treated as new drafts; old approvals never transfer automatically.
      const restoredBlueprint: V3ContentBlueprint = {
        ...blueprint,
        status: "draft",
        scenes: blueprint.scenes.map((scene) => ({ ...scene, reviewStatus: "needs-review" as const })),
        reviewNotes: Array.from(new Set([
          ...blueprint.reviewNotes,
          "Imported from a backup: re-review every scene, source note and disclosure before use. Previous scene approvals were reset.",
        ])),
      };
      const now = new Date().toISOString();
      const project: V3StudioProject = {
        id: makeId(),
        title: restoredBlueprint.recipeTitle || "Imported cooking project",
        createdAt: now,
        updatedAt: now,
        revision: 1,
        blueprint: restoredBlueprint,
      };
      await persistProject(project, null);
      setProjects((existing) => [project, ...existing]);
      setSelectedProjectId(project.id);
      setDirty(false);
      setMessage("The blueprint backup was verified and restored locally. Review all scene text before use.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The backup could not be restored.");
    } finally {
      setBusy(false);
    }
  }

  function selectProject(id: string) {
    if (dirty && id !== selectedProjectId && !window.confirm("You have unsaved scene edits. Discard those unsaved edits and open another project?")) {
      return;
    }
    setSelectedProjectId(id);
    setDirty(false);
    setError("");
    setMessage("");
  }

  function refreshV2Recipes() {
    try {
      const saved = readSavedRecipes();
      setRecipes(saved.recipes);
      setRecipeSkippedCount(saved.skipped);
      setCreatorProfile(readCreatorProfile());
      setSelectedRecipeId((current) => saved.recipes.some((recipe) => String(recipe.id) === current)
        ? current
        : saved.recipes[0] ? String(saved.recipes[0].id) : "");
      setMessage("V2 recipes refreshed from this browser. Previously created V3 snapshots remain unchanged.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh V2 recipes.");
    }
  }

  const canCreate = !loading && !busy && Boolean(selectedRecipe);

  return (
    <section className="v3-studio panel" id="v3-content-studio" aria-labelledby="v3-studio-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">V3 · AI CHEF & COOKING CONTENT STUDIO</p>
          <h2 id="v3-studio-title">Create a cooking-video blueprint</h2>
          <p>Start with a saved V2 recipe. The blueprint keeps recipe facts traceable and lets you edit each scene before any rendering is attempted.</p>
        </div>
        <span className="step">LOCAL-FIRST</span>
      </div>

      <p className="v3-studio-honesty"><strong>Important:</strong> this first build creates an editable scene plan, not a video or generated footage. The rendering and realistic-AI feasibility stages have not passed yet. Nothing is uploaded by this screen.</p>

      {error && <p className="v3-studio-alert" role="alert">{error}</p>}
      {message && <p className="message" role="status" aria-live="polite">{message}</p>}

      <div className="v3-studio-grid">
        <section className="v3-studio-card" aria-labelledby="v3-studio-create-heading">
          <h3 id="v3-studio-create-heading">1. Create from V2</h3>
          <p className="muted">V2 remains the source of truth. This creates a separate, versioned V3 project and never rewrites the original recipe.</p>
          <label htmlFor="v3-recipe-select">Saved recipe</label>
          <select id="v3-recipe-select" value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)} disabled={loading || busy}>
            {recipes.length === 0 ? <option value="">No valid saved recipes</option> : recipes.map((recipe) => (
              <option key={recipe.id} value={String(recipe.id)}>{recipe.name || "Untitled recipe"} · ID {recipe.id}</option>
            ))}
          </select>
          {selectedRecipe && (
            <div className="v3-source-summary">
              <p><strong>Recipe:</strong> {selectedRecipe.name || "Name not recorded"}</p>
              <p><strong>Ingredients:</strong> {selectedRecipe.ingredients.length}</p>
              <p><strong>Steps:</strong> {selectedRecipe.steps.length}</p>
              <p><strong>Recipe revision:</strong> {selectedRecipe.recipeRevision} (counter only; V3 also creates a content fingerprint)</p>
              <p><strong>Owner trial:</strong> {selectedRecipe.trialStatus === "tested" ? "Marked tested in V2; the resulting video still needs review." : "Untried recipe draft"}</p>
            </div>
          )}
          <label className="v3-studio-check">
            <input type="checkbox" checked={omitResearchLedger} onChange={(event) => setOmitResearchLedger(event.target.checked)} />
            <span>Explicitly continue without the separate Research Studio evidence ledger</span>
          </label>
          <p className="hint">When enabled, the blueprint will record no separate research archive. Use this only if the local ledger is genuinely unavailable; recipe-source notes remain in the snapshot.</p>
          <div className="v3-studio-actions">
            <button className="secondary" type="button" onClick={refreshV2Recipes} disabled={loading || busy}>Refresh V2 recipes</button>
            <button className="primary v3-studio-primary" type="button" onClick={() => void generateBlueprint()} disabled={!canCreate}>Create blueprint</button>
          </div>
          {recipeSkippedCount > 0 && <p className="hint">{recipeSkippedCount} local recipe record(s) did not pass V2 validation and were not used.</p>}
          {recipes.length === 0 && !loading && <p className="v3-studio-alert">Add or import a recipe in the existing V2 Recipe Studio, then return here and refresh. V3 will not create a substitute recipe.</p>}
        </section>

        <section className="v3-studio-card" aria-labelledby="v3-studio-projects-heading">
          <h3 id="v3-studio-projects-heading">2. Saved V3 projects</h3>
          {loading ? <p className="muted">Loading local projects…</p> : projects.length === 0 ? (
            <p className="empty-inline">No V3 projects saved on this device yet.</p>
          ) : (
            <div className="v3-studio-project-list">
              {projects.map((project) => (
                <button
                  className={project.id === selectedProjectId ? "v3-studio-project is-active" : "v3-studio-project"}
                  type="button"
                  key={project.id}
                  onClick={() => selectProject(project.id)}
                  aria-pressed={project.id === selectedProjectId}
                >
                  <strong>{project.title || "Untitled project"}</strong>
                  <span>Revision {project.revision} · {new Date(project.updatedAt).toLocaleString("en-US")}</span>
                </button>
              ))}
            </div>
          )}
          <label htmlFor="v3-blueprint-import">Restore a V3 blueprint backup</label>
          <input id="v3-blueprint-import" type="file" accept="application/json,.json" onChange={(event) => void importBlueprint(event)} disabled={busy} />
          <p className="hint">Restore checks the blueprint schema and source snapshot SHA-256 fingerprints, then resets scene approvals. A backup is added as a new local project; it does not overwrite existing ones.</p>
        </section>
      </div>

      {activeProject && (
        <section className="v3-studio-editor" aria-labelledby="v3-studio-editor-heading">
          <div className="section-head">
            <div>
              <p className="eyebrow">EDITABLE SCENE PLAN</p>
              <h3 id="v3-studio-editor-heading">{activeProject.title}</h3>
              <p>Revision {activeProject.revision} · Input fingerprint {activeProject.blueprint.fingerprints.inputsSha256.slice(0, 16)}…</p>
            </div>
            <span className={dirty ? "v3-studio-dirty" : "step"}>{dirty ? "UNSAVED EDITS" : activeProject.blueprint.status.toUpperCase()}</span>
          </div>
          <div className="v3-studio-actions">
            <button className="secondary" type="button" onClick={() => void saveCurrentProject()} disabled={busy || !dirty}>Save changes</button>
            <button className="secondary" type="button" onClick={exportCurrentProject} disabled={busy}>Export JSON backup</button>
          </div>
          <p className="hint">Manual text edits require fresh review. Saving does not approve a scene, verify facts or generate footage.</p>
          <section className="v3-subtitle-export" aria-labelledby="v3-subtitle-export-title">
            <h4 id="v3-subtitle-export-title">Manual subtitle timing</h4>
            <p className="hint">Enter start/end times for each caption from a real narration/audio track. V3 will not guess speech timing. Values are seconds with millisecond precision.</p>
            {captionTimeline.ok
              ? <p className="v3-caption-status" role="status">Caption timeline has valid non-overlapping timings.</p>
              : <p className="v3-caption-status is-warning" role="status">{captionTimeline.issues.length} timing issue(s) must be corrected before export.</p>}
            <div className="v3-studio-actions">
              <button className="secondary" type="button" disabled={busy || !captionTimeline.ok} onClick={() => exportSubtitles("srt")}>Export SRT</button>
              <button className="secondary" type="button" disabled={busy || !captionTimeline.ok} onClick={() => exportSubtitles("vtt")}>Export WebVTT</button>
            </div>
            {!captionTimeline.ok && <ul className="v3-caption-issues">
              {captionTimeline.issues.slice(0, 12).map((issue, index) => (
                <li key={issue.sceneId + "-" + index}>{issue.sceneId ? issue.sceneId + ": " : ""}{issue.message}</li>
              ))}
              {captionTimeline.issues.length > 12 && <li>And {captionTimeline.issues.length - 12} more issue(s).</li>}
            </ul>}
          </section>

          <div className="v3-scene-list">
            {activeProject.blueprint.scenes.map((scene: V3BlueprintScene, index) => (
              <article className="v3-scene-card" key={scene.id}>
                <div className="v3-scene-header">
                  <span className="v3-scene-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{scene.kind.replace(/-/g, " ")}</h4>
                    <p>{scene.trace.length} source mapping(s) · Review: {scene.reviewStatus}</p>
                  </div>
                </div>
                <label htmlFor={"v3-scene-title-" + scene.id}>Scene title</label>
                <input
                  id={"v3-scene-title-" + scene.id}
                  value={scene.title}
                  onChange={(event) => updateScene(scene.id, "title", event.target.value)}
                  maxLength={240}
                />
                <label htmlFor={"v3-scene-narration-" + scene.id}>Narration draft</label>
                <textarea
                  id={"v3-scene-narration-" + scene.id}
                  rows={3}
                  value={scene.narrationText}
                  onChange={(event) => updateScene(scene.id, "narrationText", event.target.value)}
                  maxLength={4_000}
                />
                <label htmlFor={"v3-scene-caption-" + scene.id}>Caption draft</label>
                <textarea
                  id={"v3-scene-caption-" + scene.id}
                  rows={2}
                  value={scene.captionText}
                  onChange={(event) => updateScene(scene.id, "captionText", event.target.value)}
                  maxLength={4_000}
                />
                <div className="v3-caption-timing-grid">
                  <div>
                    <label htmlFor={"v3-caption-start-" + scene.id}>Caption start (seconds)</label>
                    <input
                      id={"v3-caption-start-" + scene.id}
                      type="number"
                      min="0"
                      max="86400"
                      step="0.001"
                      value={scene.captionStartMs === null ? "" : String(scene.captionStartMs / 1_000)}
                      onChange={(event) => updateCaptionTiming(scene.id, "captionStartMs", event.target.value)}
                      placeholder="e.g. 0"
                    />
                  </div>
                  <div>
                    <label htmlFor={"v3-caption-end-" + scene.id}>Caption end (seconds)</label>
                    <input
                      id={"v3-caption-end-" + scene.id}
                      type="number"
                      min="0"
                      max="86400"
                      step="0.001"
                      value={scene.captionEndMs === null ? "" : String(scene.captionEndMs / 1_000)}
                      onChange={(event) => updateCaptionTiming(scene.id, "captionEndMs", event.target.value)}
                      placeholder="e.g. 1.5"
                    />
                  </div>
                </div>
                <label htmlFor={"v3-scene-visual-" + scene.id}>Visual direction / continuity notes</label>
                <textarea
                  id={"v3-scene-visual-" + scene.id}
                  rows={2}
                  value={scene.visualDirection}
                  onChange={(event) => updateScene(scene.id, "visualDirection", event.target.value)}
                  maxLength={4_000}
                />
                <div className="v3-scene-source-notes">
                  <strong>Source mapping</strong>
                  <p>{scene.trace.length ? scene.trace.map((trace) => trace.entityType + ": " + trace.entityId + " (" + trace.fields.join(", ") + ")").join(" · ") : "No explicit mapping; review this scene."}</p>
                  {scene.cookingDuration && <p><strong>Recorded cooking duration:</strong> {scene.cookingDuration}</p>}
                  {scene.heat && <p><strong>Recorded heat:</strong> {scene.heat}</p>}
                  {scene.visualCue && <p><strong>Recorded cue:</strong> {scene.visualCue}</p>}
                </div>
              </article>
            ))}
          </div>

          {activeProject.blueprint.warnings.length > 0 && (
            <section className="v3-studio-warnings" aria-labelledby="v3-studio-warnings-heading">
              <h4 id="v3-studio-warnings-heading">Review warnings ({activeProject.blueprint.warnings.length})</h4>
              <ul>
                {activeProject.blueprint.warnings.map((warning, index) => (
                  <li key={warning.code + "-" + (warning.entityId ?? "") + "-" + index}>
                    <strong>{warning.code.replace(/-/g, " ")}:</strong> {warning.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="v3-studio-honesty"><strong>Not a rendered video:</strong> this project has not been generated, animated, visually checked against your original references, or exported as video. Realism remains NOT TESTED until actual clips are reviewed.</p>
        </section>
      )}
    </section>
  );
}
