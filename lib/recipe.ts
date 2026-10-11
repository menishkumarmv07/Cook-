export type Ingredient = { id: string; amount: string; unit: string; name: string; prep: string };
export type RecipeStep = { id: string; action: string; duration: string; heat: string; cue: string };
export type Scene = { title: string; detail: string; timing: string };
export type SourceReference = {
  id: string;
  url: string;
  kind: "recipe-page" | "video" | "transcript" | "other";
  checked: string;
  notes: string;
};
export type RecipeProject = {
  id: number;
  name: string;
  url: string;
  notes: string;
  sourceEvidence: string;
  sourceReferences: SourceReference[];
  servings: string;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  scenes: Scene[];
};
export type ValidationIssue = { level: "warning" | "error"; field: string; message: string };

export const SCENE_TEMPLATE: Scene[] = [
  { title: "Hook & finished dish", detail: "Show the finished dish and explain what viewers will learn.", timing: "0:00–0:08" },
  { title: "Ingredients", detail: "Show every ingredient and its recorded quantity.", timing: "0:08–0:25" },
  { title: "Preparation", detail: "Show washing, chopping, measuring, and prep in order.", timing: "0:25–0:45" },
  { title: "Cooking steps", detail: "Explain each action, recorded heat level, timing, and visual cue.", timing: "0:45–1:35" },
  { title: "Finish & serve", detail: "Show texture, doneness, plating, and verified safe-serving guidance.", timing: "1:35–1:50" },
  { title: "Taste & nutrition", detail: "Plan the chef tasting reaction; only include nutrition when verified.", timing: "1:50–2:00" },
];

export function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isRecipeProject(value: unknown): value is RecipeProject {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<RecipeProject>;
  return typeof p.id === "number" &&
    typeof p.name === "string" &&
    typeof p.url === "string" &&
    typeof p.notes === "string" &&
    typeof p.sourceEvidence === "string" &&
    Array.isArray(p.sourceReferences) && p.sourceReferences.every((source) => typeof source === "object" && source !== null &&
      typeof source.id === "string" && typeof source.url === "string" &&
      ["recipe-page", "video", "transcript", "other"].includes(source.kind) &&
      typeof source.checked === "string" && typeof source.notes === "string") &&
    typeof p.servings === "string" &&
    Array.isArray(p.ingredients) &&
    p.ingredients.every((x) => typeof x === "object" && x !== null &&
      typeof x.id === "string" && typeof x.amount === "string" &&
      typeof x.unit === "string" && typeof x.name === "string" && typeof x.prep === "string") &&
    Array.isArray(p.steps) &&
    p.steps.every((x) => typeof x === "object" && x !== null &&
      typeof x.id === "string" && typeof x.action === "string" &&
      typeof x.duration === "string" && typeof x.heat === "string" && typeof x.cue === "string") &&
    Array.isArray(p.scenes) &&
    p.scenes.every((x) => typeof x === "object" && x !== null &&
      typeof x.title === "string" && typeof x.detail === "string" && typeof x.timing === "string");
}

export function validateRecipe(project: RecipeProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!project.name.trim()) issues.push({ level: "error", field: "name", message: "Add a recipe name." });
  if (!isHttpUrl(project.url)) issues.push({ level: "error", field: "url", message: "Use a valid http:// or https:// source link." });
  if (!project.servings.trim()) issues.push({ level: "warning", field: "servings", message: "Serving count is missing; nutrition per serving cannot be estimated reliably." });
  if (project.ingredients.length === 0) issues.push({ level: "warning", field: "ingredients", message: "Add ingredients and amounts before treating this as a complete recipe." });
  project.ingredients.forEach((ingredient, index) => {
    if (!ingredient.name.trim()) issues.push({ level: "warning", field: `ingredient-${index}`, message: `Ingredient ${index + 1} has no name.` });
    if (!ingredient.amount.trim()) issues.push({ level: "warning", field: `amount-${index}`, message: `Quantity for ${ingredient.name.trim() || `ingredient ${index + 1}`} is missing.` });
    if (!ingredient.unit.trim() && ingredient.amount.trim()) issues.push({ level: "warning", field: `unit-${index}`, message: `Unit for ${ingredient.name.trim() || `ingredient ${index + 1}`} is not recorded; check whether the amount is count-based.` });
  });
  if (project.steps.length === 0) issues.push({ level: "warning", field: "steps", message: "Add the cooking method in the correct order." });
  project.steps.forEach((step, index) => {
    if (!step.action.trim()) issues.push({ level: "warning", field: `step-${index}`, message: `Cooking step ${index + 1} has no action.` });
    if (!step.duration.trim()) issues.push({ level: "warning", field: `duration-${index}`, message: `Timing for step ${index + 1} is not recorded; do not invent a time.` });
  });
  const seenSourceUrls = new Set<string>();
  project.sourceReferences.forEach((source, index) => {
    if (source.url.trim() && !isHttpUrl(source.url)) issues.push({ level: "error", field: `source-url-${index}`, message: `Source reference ${index + 1} must use a valid HTTP(S) URL.` });
    const normalizedUrl = source.url.trim().replace(/\/$/, "").toLowerCase();
    if (normalizedUrl && seenSourceUrls.has(normalizedUrl)) issues.push({ level: "warning", field: `source-duplicate-${index}`, message: `Source reference ${index + 1} duplicates another reference; keep distinct sources where possible.` });
    if (normalizedUrl) seenSourceUrls.add(normalizedUrl);
    if (!source.url.trim()) issues.push({ level: "warning", field: `source-url-${index}`, message: `Source reference ${index + 1} has no URL.` });
    if (!source.checked.trim()) issues.push({ level: "warning", field: `source-checked-${index}`, message: `Record what was actually checked for source reference ${index + 1}.` });
  });
  if (project.url.trim() || project.sourceReferences.length) issues.push({ level: "warning", field: "source", message: "Source link has not been fetched or analyzed by this app; manual notes and checked items are user-entered and have not been independently checked or verified." });
  else issues.push({ level: "warning", field: "source", message: "No source references have been recorded. Add multiple references and compare ingredient quantities, method order, and timings before treating the recipe as verified." });
  issues.push({ level: "warning", field: "safety", message: "Food-safety guidance has not been independently verified." });
  issues.push({ level: "warning", field: "nutrition", message: "Nutrition has not been calculated from ingredient quantities." });
  return issues;
}

export function buildTutorialDraft(project: RecipeProject): string {
  const lines = [
    `# ${project.name.trim() || "Untitled recipe"}`,
    "",
    "**Status:** Draft — not published",
    `**Servings:** ${project.servings.trim() || "Not provided"}`,
    `**Source:** ${project.url.trim() || "User-entered recipe; no source URL"}`,
    "",
    "## Ingredients",
    ...(project.ingredients.length ? project.ingredients.map((x, i) =>
      `${i + 1}. ${[x.amount, x.unit, x.name].filter(Boolean).join(" ")}${x.prep.trim() ? ` — ${x.prep.trim()}` : ""}`) : ["Ingredients not supplied."]),
    "",
    "## Cooking method",
    ...(project.steps.length ? project.steps.map((x, i) =>
      `${i + 1}. ${x.action.trim() || "[Action missing]"}${x.duration.trim() ? ` (recorded timing: ${x.duration.trim()})` : " (timing not provided)"}${x.heat.trim() ? ` Heat: ${x.heat.trim()}.` : ""}${x.cue.trim() ? ` Visual cue: ${x.cue.trim()}` : ""}`) : ["Cooking steps not supplied."]),
    "",
    "## Creator scene plan",
    ...project.scenes.flatMap((x, i) => [`### ${i + 1}. ${x.title}`, `Timing guide: ${x.timing}`, x.detail, ""]),
    "## Source references (manual records)",
    ...(project.sourceReferences.length ? project.sourceReferences.map((source, i) =>
      `${i + 1}. ${source.kind} — ${source.url.trim() || "URL missing"}\n   Checked: ${source.checked.trim() || "Not recorded"}\n   Notes / disagreements: ${source.notes.trim() || "None recorded"}`) : ["No structured source references recorded."]),
    "",
    "## Source evidence notes",
    project.sourceEvidence.trim() || "No manual source evidence notes recorded. The app has not fetched or analyzed the source content.",
    "",
    "## Notes",
    project.notes.trim() || "No additional notes.",
    "",
    "## Verification status",
    "- This draft reflects only information entered by the user.",
    "- Source links have not been analyzed automatically.",
    "- Source references and checked items are manually recorded and have not been independently verified.\n- Compare references yourself; conflicts or missing details must be resolved before publishing."
    "- Missing amounts/timings must be checked; do not guess.",
    "- Food safety and nutrition have not been independently verified.",
    "- This file is a draft and has not been published.",
  ];
  return lines.join("\n");
}


export function parseRecipeProjectJSON(raw: string): RecipeProject | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const legacy = parsed as Record<string, unknown>;
  const candidate = {
    ...legacy,
    sourceEvidence: typeof legacy.sourceEvidence === "string" ? legacy.sourceEvidence : "",
    sourceReferences: Array.isArray(legacy.sourceReferences) ? legacy.sourceReferences : [],
    servings: typeof legacy.servings === "string" ? legacy.servings : "",
    ingredients: Array.isArray(legacy.ingredients) ? legacy.ingredients : [],
    steps: Array.isArray(legacy.steps) ? legacy.steps : [],
  };
  if (!isRecipeProject(candidate) || !isHttpUrl(candidate.url)) return null;
  return candidate;
}
