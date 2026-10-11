"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  buildNarrationScript,
  buildTutorialDraft,
  isHttpUrl,
  parseRecipeProjectJSON,
  SCENE_TEMPLATE,
  validateRecipe,
  type Ingredient,
  type RecipeProject,
  type RecipeStep,
  type Scene,
  type SourceReference,
} from "@/lib/recipe";

const STORAGE_KEY = "cooking-creator-v1-drafts";

function migrateProject(value: unknown): RecipeProject | null {
  if (typeof value !== "object" || value === null) return null;
  const old = value as Partial<RecipeProject>;
  if (typeof old.id !== "number" || typeof old.name !== "string" ||
      typeof old.url !== "string" || typeof old.notes !== "string" || !Array.isArray(old.scenes)) return null;
  const scenes = old.scenes.filter((scene): scene is Scene =>
    typeof scene === "object" && scene !== null &&
    typeof scene.title === "string" && typeof scene.detail === "string" && typeof scene.timing === "string"
  );
  if (scenes.length !== old.scenes.length) return null;
  const ingredients = Array.isArray(old.ingredients) ? old.ingredients.filter((x): x is Ingredient =>
    typeof x === "object" && x !== null && typeof x.id === "string" && typeof x.amount === "string" &&
    typeof x.unit === "string" && typeof x.name === "string" && typeof x.prep === "string"
  ) : [];
  const steps = Array.isArray(old.steps) ? old.steps.filter((x): x is RecipeStep =>
    typeof x === "object" && x !== null && typeof x.id === "string" && typeof x.action === "string" &&
    typeof x.duration === "string" && typeof x.heat === "string" && typeof x.cue === "string"
  ) : [];
  if (Array.isArray(old.ingredients) && ingredients.length !== old.ingredients.length) return null;
  if (Array.isArray(old.steps) && steps.length !== old.steps.length) return null;
  if (old.sourceReferences !== undefined && !Array.isArray(old.sourceReferences)) return null;
  const sourceReferences = Array.isArray(old.sourceReferences) ? old.sourceReferences.filter((source): source is SourceReference =>
    typeof source === "object" && source !== null && typeof source.id === "string" && typeof source.url === "string" &&
    ["recipe-page", "video", "transcript", "other"].includes(source.kind) && typeof source.checked === "string" && typeof source.notes === "string"
  ) : [];
  if (Array.isArray(old.sourceReferences) && sourceReferences.length !== old.sourceReferences.length) return null;
  return { id: old.id, name: old.name, url: old.url, notes: old.notes,
    sourceEvidence: typeof old.sourceEvidence === "string" ? old.sourceEvidence : "",
    sourceReferences, servings: old.servings ?? "", ingredients, steps, scenes };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function Home() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [servings, setServings] = useState("4");
  const [projects, setProjects] = useState<RecipeProject[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showNarration, setShowNarration] = useState(false);
  const current = projects.find((project) => project.id === active);
  const issues = useMemo(() => current ? validateRecipe(current) : [], [current]);
  const tutorial = useMemo(() => current ? buildTutorialDraft(current) : "", [current]);
  const narration = useMemo(() => current ? buildNarrationScript(current) : "", [current]);
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const saved = parsed.map(migrateProject).filter((project): project is RecipeProject => project !== null);
          setProjects(saved);
          setActive(saved[0]?.id ?? null);
          if (saved.length !== parsed.length) setMessage("Some saved data was invalid and was skipped. Export important drafts regularly.");
        }
      }
    } catch {
      setMessage("Saved drafts could not be read. Browser storage may be unavailable or the saved data may be damaged.");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      setMessage("Browser storage is unavailable or full. Export your draft before leaving this page.");
    }
  }, [projects, hydrated]);

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setMessage("Enter a recipe name to continue.");
      return;
    }
    if (!isHttpUrl(url)) {
      setMessage("Enter a valid http:// or https:// source URL, or leave the URL blank.");
      return;
    }
    const project: RecipeProject = {
      id: Date.now(),
      name: name.trim(),
      url: url.trim(),
      notes: notes.trim(),
      sourceEvidence: "",
      sourceReferences: [],
      servings: servings.trim(),
      ingredients: [],
      steps: [],
      scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
    };
    setProjects((existing) => [project, ...existing]);
    setActive(project.id);
    setName("");
    setUrl("");
    setNotes("");
    setServings("4");
    setShowTutorial(false);
    setShowNarration(false);
    setMessage("Recipe draft created on this device. Add ingredients and steps below; links are not analyzed automatically.");
    document.getElementById("recipe-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function patchCurrent(patch: Partial<RecipeProject>) {
    if (current) setProjects((existing) => existing.map((project) => project.id === current.id ? { ...project, ...patch } : project));
  }

  function patchIngredient(id: string, patch: Partial<Ingredient>) {
    if (current) patchCurrent({ ingredients: current.ingredients.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  function patchStep(id: string, patch: Partial<RecipeStep>) {
    if (current) patchCurrent({ steps: current.steps.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }

  function patchScene(index: number, patch: Partial<Scene>) {
    if (current) patchCurrent({ scenes: current.scenes.map((scene, i) => i === index ? { ...scene, ...patch } : scene) });
  }

  function moveStep(id: string, direction: -1 | 1) {
    if (!current) return;
    const from = current.steps.findIndex((step) => step.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= current.steps.length) return;
    const reordered = [...current.steps];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    patchCurrent({ steps: reordered });
  }

  function exportProject(format: "markdown" | "json" | "narration") {
    if (!current) return;
    const safeName = current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recipe-draft";
    const fileContent = format === "markdown" ? tutorial : format === "narration" ? narration : JSON.stringify({
      ...current,
      status: "draft",
      published: false,
      exportedAt: new Date().toISOString(),
      verification: {
        sourceAnalyzed: false,
        foodSafetyVerified: false,
        nutritionCalculated: false,
        warnings: warnings.map((issue) => issue.message),
      },
    }, null, 2);
    const extension = format === "json" ? "json" : format === "narration" ? "txt" : "md";
    const contentType = format === "json" ? "application/json;charset=utf-8" : format === "narration" ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8";
    downloadFile(`${safeName}-${format === "narration" ? "narration" : "draft"}.${extension}`, fileContent, contentType);
    setMessage(format === "narration" ? "Exported narration text. This is not generated audio and does not verify the recipe." : `Exported ${format.toUpperCase()} draft. Export does not publish or verify the recipe.`);
  }

  async function copyTutorial() {
    try {
      if (!navigator.clipboard?.writeText) {
        setMessage("Clipboard access is unavailable; use Export Markdown instead.");
        return;
      }
      await navigator.clipboard.writeText(tutorial);
      setMessage("Tutorial draft copied to clipboard.");
    } catch {
      setMessage("Clipboard permission was not available; use Export Markdown instead.");
    }
  }


  async function copyNarration() {
    try {
      if (!navigator.clipboard?.writeText) {
        setMessage("Clipboard access is unavailable; use Export narration instead.");
        return;
      }
      await navigator.clipboard.writeText(narration);
      setMessage("Narration script copied. It is text only; no audio has been generated.");
    } catch {
      setMessage("Clipboard permission was not available; use Export narration instead.");
    }
  }

  async function importProject(file: File) {
    try {
      const imported = parseRecipeProjectJSON(await file.text());
      if (!imported) {
        setMessage("That file is not a valid Cooking Creator JSON draft, or it contains an invalid source URL. Nothing was imported.");
        return;
      }
      const restored: RecipeProject = { ...imported, id: Date.now() };
      setProjects((existing) => [restored, ...existing]);
      setActive(restored.id);
      setShowTutorial(false);
      setMessage("JSON draft imported into this browser. Review all source, safety, and nutrition warnings before using it.");
      document.getElementById("recipe-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setMessage("The JSON file could not be read. Nothing was imported.");
    }
  }

  function deleteCurrent() {
    if (!current) return;
    const remaining = projects.filter((project) => project.id !== current.id);
    setProjects(remaining);
    setActive(remaining[0]?.id ?? null);
    setShowTutorial(false);
    setMessage("Draft removed from this browser's draft list.");
  }

  function clearAllDrafts() {
    if (!window.confirm("Delete every saved recipe draft from this browser? Export anything you want to keep first.")) return;
    setProjects([]);
    setActive(null);
    setMessage("All local recipe drafts were removed from this browser.");
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard"><span className="brand-icon">cc</span><span><b>Cooking Creator</b><small>STUDIO · V1</small></span></a>
        <p className="nav-label">WORKSPACE</p>
        <a className="nav active" href="#dashboard">▦　Dashboard</a>
        <a className="nav" href="#intake">＋　New recipe</a>
        <a className="nav" href="#recipe-editor">▤　Recipe editor</a>
        <div className="side-foot"><span className="dot" /> V1 foundation<br /><small>Local drafts · this browser</small></div>
      </aside>

      <section className="main" id="dashboard">
        <header className="top"><span>Workspace　/　Recipe Studio</span><span className="private">🔒 Private repository · local drafts</span></header>
        <div className="content">
          <section className="hero">
            <div><p className="eyebrow">YOUR CREATOR WORKSPACE</p><h1>Make every recipe a story.</h1><p>Build a clear, complete cooking tutorial from a recipe you supply. Missing details stay visible—never silently invented.</p></div>
            <div className="dish" aria-hidden="true">✿</div>
          </section>

          <div className="stats">
            <div><small>Recipe projects</small><strong>{projects.length}</strong><em>Saved in this browser</em></div>
            <div><small>Creator outline</small><strong>6 scenes</strong><em>Editable template</em></div>
            <div><small>Publishing</small><strong>Not connected</strong><em>Planned for V6</em></div>
          </div>

          <section id="intake">
            <div className="section-head"><div><p className="eyebrow">STEP 01</p><h2>Start a recipe project</h2><p>Use a source link, a recipe, or your own notes.</p></div><span className="step">01 / 06</span></div>
            <div className="columns">
              <form className="panel" onSubmit={createProject}>
                <h3>✦　Recipe intake</h3><p className="muted">Start with the details you know.</p>
                <label htmlFor="name">Recipe name <b>*</b></label>
                <input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Spicy chicken gravy" required maxLength={100} />
                <label htmlFor="url">Video or recipe URL <span>OPTIONAL</span></label>
                <input id="url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://youtube.com/..." />
                <p className="hint">This saves the link only. V1 does not fetch, transcribe, or analyze linked videos.</p>
                <label htmlFor="servings">Servings <b>*</b></label>
                <input id="servings" value={servings} onChange={(event) => setServings(event.target.value)} placeholder="e.g. 4 people" maxLength={40} required />
                <label htmlFor="notes">Recipe notes <span>OPTIONAL</span></label>
                <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={5000} placeholder="Paste recipe notes, ingredients, source observations, or questions…" />
                <button className="primary" type="submit">Create recipe draft　→</button>
                <label htmlFor="import-backup">Import a JSON draft backup <span>OPTIONAL</span></label>
                <input id="import-backup" type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importProject(file); }} />
                <p className="hint">Imports a JSON draft exported by this app. Imported information is not independently verified.</p>
                {message && <p className="message" role="status">{message}</p>}
              </form>

              <div className="right">
                <section className="panel">
                  <h3>✓　Quality checklist</h3><p className="muted">Checks that should be completed before a recipe is considered ready.</p>
                  <ul className="checklist">
                    <li><b>01</b><span><strong>Ingredient amounts</strong><small>Capture quantity, unit, and preparation.</small></span></li>
                    <li><b>02</b><span><strong>Ordered method</strong><small>Record each action, timing, heat, and cue.</small></span></li>
                    <li><b>03</b><span><strong>Food safety</strong><small>Verify doneness and safe handling using reliable guidance.</small></span></li>
                    <li><b>04</b><span><strong>Nutrition estimate</strong><small>Calculate from actual ingredient quantities and servings.</small></span></li>
                  </ul>
                  <p className="warning">Checklist only. This version does not independently verify food safety or nutrition.</p>
                </section>
                <section className="chef"><p className="eyebrow">YOUR SIGNATURE CHEF</p><h3>Your character, your kitchen.</h3><p>Your existing male chef and kitchen background remain the intended assets. Video/character animation integration comes later.</p><small>● Asset integration not connected yet</small></section>
              </div>
            </div>
          </section>

          <section id="recipe-editor" className="planner">
            <div className="section-head"><div><p className="eyebrow">STEP 02</p><h2>Recipe editor</h2><p>Record real quantities and method details before drafting narration.</p></div><span className="step">Structured recipe</span></div>
            {!current ? <div className="empty"><span>▤</span><h3>Your recipe editor will appear here</h3><p>Create a recipe draft above to add ingredients and ordered cooking steps.</p><a href="#intake">Start a recipe project ↑</a></div> : (
              <div className="panel">
                <div className="draft-head"><div><p className="eyebrow">EDITING DRAFT</p><h3>{current.name}</h3></div><span className="draft">NOT PUBLISHED</span></div>
                {current.url && <p className="source">Source URL: <a href={current.url} target="_blank" rel="noreferrer">{current.url}</a></p>}
                <div className="editor-grid">
                  <div><label htmlFor="edit-servings">Servings / yield</label><input id="edit-servings" value={current.servings} onChange={(event) => patchCurrent({ servings: event.target.value })} placeholder="e.g. 4 servings" /></div>
                  <div><label htmlFor="edit-notes">Recipe notes</label><textarea id="edit-notes" rows={2} value={current.notes} onChange={(event) => patchCurrent({ notes: event.target.value })} placeholder="Personal notes or details to retain…" /></div>
                  <div><label htmlFor="edit-evidence">Manual source evidence notes</label><textarea id="edit-evidence" rows={3} value={current.sourceEvidence} onChange={(event) => patchCurrent({ sourceEvidence: event.target.value })} placeholder="For each reference, record its URL and what you actually checked (recipe text, transcript, video frames, or your own notes). The app does not verify links automatically." /></div>
                </div>

                <section className="panel source-research-panel">
                  <div className="subsection-head"><div><h3>Source research desk</h3><p className="muted">Record separate references and exactly what you checked. This is a research log, not automatic link/video analysis.</p></div><button className="secondary" type="button" onClick={() => patchCurrent({ sourceReferences: [...current.sourceReferences, { id: makeId(), url: "", kind: "recipe-page", checked: "", notes: "" }] })}>＋ Add source</button></div>
                  {current.sourceReferences.length === 0 ? <p className="empty-inline">No structured references yet. Add at least two independent sources when possible.</p> : <div className="source-reference-list">{current.sourceReferences.map((source, index) => (
                    <div className="source-reference" key={source.id}>
                      <div className="source-reference-heading"><strong>Reference {index + 1}</strong><button className="text-button" type="button" onClick={() => patchCurrent({ sourceReferences: current.sourceReferences.filter((item) => item.id !== source.id) })}>Remove</button></div>
                      <div className="editor-grid">
                        <div><label htmlFor={`source-kind-${source.id}`}>Source type</label><select id={`source-kind-${source.id}`} value={source.kind} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, kind: event.target.value as SourceReference["kind"] } : item) })}><option value="recipe-page">Recipe page</option><option value="video">Video / Reel</option><option value="transcript">Transcript</option><option value="other">Other reference</option></select></div>
                        <div><label htmlFor={`source-url-${source.id}`}>Reference URL</label><input id={`source-url-${source.id}`} type="url" inputMode="url" value={source.url} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, url: event.target.value } : item) })} placeholder="https://…" /></div>
                        <div><label htmlFor={`source-checked-${source.id}`}>What did you actually check?</label><textarea id={`source-checked-${source.id}`} rows={2} value={source.checked} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, checked: event.target.value } : item) })} placeholder="Ingredients, quantities, method order, timings, transcript, visible actions…" /></div>
                        <div><label htmlFor={`source-notes-${source.id}`}>Differences, uncertainty, or missing details</label><textarea id={`source-notes-${source.id}`} rows={2} value={source.notes} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, notes: event.target.value } : item) })} placeholder="Conflicting amounts, unclear step, missing timing; write 'none observed' only if checked." /></div>
                      </div>
                    </div>
                  ))}</div>}
                  <p className="warning">No source is fetched or verified automatically in this version. Never mark a recipe verified just because a URL was entered.</p>
                </section>

                <div className="subsection-head"><div><h3>Ingredients</h3><p className="muted">Record each ingredient exactly. Amounts are not inferred.</p></div><button className="secondary" type="button" onClick={() => patchCurrent({ ingredients: [...current.ingredients, { id: makeId(), amount: "", unit: "", name: "", prep: "" }] })}>＋ Add ingredient</button></div>
                {current.ingredients.length === 0 ? <p className="empty-inline">No ingredients yet. Add one row per ingredient.</p> : <div className="ingredient-list">{current.ingredients.map((item, index) => (
                  <div className="ingredient-row" key={item.id}>
                    <span className="row-number">{index + 1}</span>
                    <input aria-label={`Ingredient ${index + 1} amount`} value={item.amount} onChange={(event) => patchIngredient(item.id, { amount: event.target.value })} placeholder="Amount" />
                    <input aria-label={`Ingredient ${index + 1} unit`} value={item.unit} onChange={(event) => patchIngredient(item.id, { unit: event.target.value })} placeholder="Unit (g, cup, pieces)" />
                    <input aria-label={`Ingredient ${index + 1} name`} value={item.name} onChange={(event) => patchIngredient(item.id, { name: event.target.value })} placeholder="Ingredient name" />
                    <input aria-label={`Ingredient ${index + 1} prep`} value={item.prep} onChange={(event) => patchIngredient(item.id, { prep: event.target.value })} placeholder="Prep (chopped…)" />
                    <button className="icon-button" type="button" aria-label={`Remove ingredient ${index + 1}`} onClick={() => patchCurrent({ ingredients: current.ingredients.filter((x) => x.id !== item.id) })}>×</button>
                  </div>
                ))}</div>}

                <div className="subsection-head step-head"><div><h3>Cooking steps</h3><p className="muted">Keep the sequence intact. Add timing and cues only when known.</p></div><button className="secondary" type="button" onClick={() => patchCurrent({ steps: [...current.steps, { id: makeId(), action: "", duration: "", heat: "", cue: "" }] })}>＋ Add step</button></div>
                {current.steps.length === 0 ? <p className="empty-inline">No method steps yet. Add steps in the exact order they happen.</p> : <div className="step-list">{current.steps.map((step, index) => (
                  <div className="recipe-step" key={step.id}>
                    <div className="recipe-step-top"><span className="row-number">STEP {index + 1}</span><div className="step-controls"><button className="text-button" type="button" disabled={index === 0} onClick={() => moveStep(step.id, -1)} aria-label={`Move step ${index + 1} up`}>↑ Move up</button><button className="text-button" type="button" disabled={index === current.steps.length - 1} onClick={() => moveStep(step.id, 1)} aria-label={`Move step ${index + 1} down`}>↓ Move down</button><button className="text-button" type="button" onClick={() => patchCurrent({ steps: current.steps.filter((x) => x.id !== step.id) })}>Remove</button></div></div>
                    <label htmlFor={`action-${step.id}`}>Action / instruction</label><textarea id={`action-${step.id}`} rows={2} value={step.action} onChange={(event) => patchStep(step.id, { action: event.target.value })} placeholder="What exactly happens in this step?" />
                    <div className="step-fields">
                      <div><label htmlFor={`duration-${step.id}`}>Timing</label><input id={`duration-${step.id}`} value={step.duration} onChange={(event) => patchStep(step.id, { duration: event.target.value })} placeholder="e.g. 5 minutes" /></div>
                      <div><label htmlFor={`heat-${step.id}`}>Heat / setting</label><input id={`heat-${step.id}`} value={step.heat} onChange={(event) => patchStep(step.id, { heat: event.target.value })} placeholder="e.g. medium heat" /></div>
                      <div className="cue-field"><label htmlFor={`cue-${step.id}`}>Visual / doneness cue</label><input id={`cue-${step.id}`} value={step.cue} onChange={(event) => patchStep(step.id, { cue: event.target.value })} placeholder="What should the cook observe?" /></div>
                    </div>
                  </div>
                ))}</div>}

                <div className="subsection-head step-head"><div><h3>Creator scene plan</h3><p className="muted">Six editable scene beats for the future video script.</p></div><span className="step">6 scenes</span></div>
                <div className="scenes">{current.scenes.map((scene, index) => (
                  <div className="scene" key={index}><b className="number">{String(index + 1).padStart(2, "0")}</b><div><input aria-label={`Scene ${index + 1} title`} value={scene.title} onChange={(event) => patchScene(index, { title: event.target.value })} /><textarea aria-label={`Scene ${index + 1} details`} rows={2} value={scene.detail} onChange={(event) => patchScene(index, { detail: event.target.value })} /></div><input className="timing" aria-label={`Scene ${index + 1} timing`} value={scene.timing} onChange={(event) => patchScene(index, { timing: event.target.value })} /></div>
                ))}</div>

                <section className="validation-panel" aria-live="polite">
                  <div className="subsection-head"><div><h3>Draft quality review</h3><p className="muted">Warnings identify missing details; they do not verify a recipe.</p></div><span className={errors.length ? "status status-error" : warnings.length ? "status status-warning" : "status"}>{errors.length ? `${errors.length} errors` : `${warnings.length} warnings`}</span></div>
                  {errors.length > 0 && <ul className="issue-list issue-errors">{errors.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul>}
                  {warnings.length > 0 ? <ul className="issue-list">{warnings.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul> : <p>No current validation warnings.</p>}
                </section>

                <div className="action-row"><button className="primary action-primary" type="button" onClick={() => setShowTutorial((show) => !show)}>{showTutorial ? "Hide tutorial draft" : "Generate tutorial draft"}</button><button className="primary action-primary" type="button" onClick={() => setShowNarration((show) => !show)}>{showNarration ? "Hide narration script" : "Generate narration script"}</button><button className="secondary" type="button" onClick={() => exportProject("markdown")}>Export Markdown</button><button className="secondary" type="button" onClick={() => exportProject("narration")}>Export narration (.txt)</button><button className="secondary" type="button" onClick={() => exportProject("json")}>Export JSON</button><button className="danger" type="button" onClick={deleteCurrent}>Delete this draft</button></div>
                {showTutorial && <div className="tutorial-preview"><div className="subsection-head"><div><h3>Generated tutorial draft</h3><p className="muted">Deterministic outline using only your saved inputs. Not fact-checked, not published.</p></div><button className="secondary" type="button" onClick={() => { void copyTutorial(); }}>Copy text</button></div><pre>{tutorial}</pre></div>}
                {showNarration && <div className="tutorial-preview"><div className="subsection-head"><div><h3>Structured narration script</h3><p className="muted">Generated from recorded fields only. Missing timings and unresolved sources are flagged; no voice audio is generated.</p></div><button className="secondary" type="button" onClick={() => { void copyNarration(); }}>Copy script</button></div><pre>{narration}</pre></div>}
                <p className="hint">Drafts are stored in this browser on this device only. There is no owner login, cloud backup, or multi-device sync yet. Export important work regularly.</p>
              </div>
            )}
          </section>

          {projects.length > 0 && <section className="recent"><div className="section-head"><div><p className="eyebrow">YOUR WORK</p><h2>Recent drafts</h2></div><button className="text-button" type="button" onClick={clearAllDrafts}>Clear all local drafts</button></div><div className="recent-list">{projects.map((project) => <button key={project.id} className={project.id === active ? "recent-item selected" : "recent-item"} onClick={() => { setActive(project.id); setShowTutorial(false); }}><span>✦</span><strong>{project.name}</strong><small>Draft</small> →</button>)}</div></section>}

          <footer>COOKING CREATOR STUDIO · V1 FOUNDATION <span>US audience-first creator workflow · Publishing planned for V6</span></footer>
        </div>
      </section>
    </main>
  );
}
