"use client";

import SchedulePlanner from "@/components/schedule-planner";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import type { FormEvent } from "react";
import {
  buildNarrationScript,
  buildTutorialDraft,
  calculateRecipeNutrition,
  createCreatorWorkspaceBackupJSON,
  DEFAULT_CREATOR_PROFILE,
  isCreatorProfile,
  isHttpUrl,
  parseCreatorWorkspaceBackupJSON,
  parseRecipeProjectJSON,
  SCENE_TEMPLATE,
  validateRecipe,
  type CreatorProfile,
  type Ingredient,
  type RecipeProject,
  type RecipeStep,
  type Scene,
  type SourceReference,
} from "@/lib/recipe";

const STORAGE_KEY = "cooking-creator-v1-drafts";
const PROFILE_STORAGE_KEY = "cooking-creator-profile-v1";
const THEME_STORAGE_KEY = "cooking-creator-theme-v1";
const ACTIVE_TOOL_STORAGE_KEY = "cooking-creator-active-tool-v1";
const WORKSPACE_TOOLS: readonly WorkspaceTool[] = ["home", "plan", "content", "research", "publish", "intake", "profile", "library", "connections"];
const MAX_SAFE_LOCAL_DRAFT_CHARACTERS = 2_000_000;
const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;

type SourceInspectionResult = {
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

type WorkspaceTool = "home" | "plan" | "content" | "research" | "publish" | "intake" | "profile" | "library" | "connections";
type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

const WORKSPACE_TOOL_LABELS: Record<WorkspaceTool, string> = {
  home: "Home", plan: "Today’s Plan", content: "Plan Content", research: "Research Studio", publish: "Publish",
  intake: "New recipe", profile: "Creator profile", library: "Library / recent drafts", connections: "Connect social accounts",
};

const SOCIAL_PLATFORMS = [
  { name: "YouTube", mark: "YT", description: "Channels and Shorts" },
  { name: "Instagram", mark: "IG", description: "Reels and food posts" },
  { name: "TikTok", mark: "TT", description: "Short-form cooking videos" },
  { name: "Facebook", mark: "f", description: "Pages and video posts" },
  { name: "Pinterest", mark: "P", description: "Recipe pins and idea boards" },
  { name: "Snapchat", mark: "S", description: "Spotlight and stories" },
  { name: "X", mark: "X", description: "Posts and video clips" },
] as const;

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
  ).map((x) => ({
    ...x,
    nutritionCalories: typeof x.nutritionCalories === "string" ? x.nutritionCalories : "",
    nutritionProteinG: typeof x.nutritionProteinG === "string" ? x.nutritionProteinG : "",
    nutritionCarbsG: typeof x.nutritionCarbsG === "string" ? x.nutritionCarbsG : "",
    nutritionFatG: typeof x.nutritionFatG === "string" ? x.nutritionFatG : "",
    nutritionBasis: typeof x.nutritionBasis === "string" ? x.nutritionBasis : "",
    nutritionSourceUrl: typeof x.nutritionSourceUrl === "string" ? x.nutritionSourceUrl : "",
  })) : [];
  const knownIngredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
  const steps = Array.isArray(old.steps) ? old.steps.filter((x): x is RecipeStep =>
    typeof x === "object" && x !== null && typeof x.id === "string" && typeof x.action === "string" &&
    typeof x.duration === "string" && typeof x.heat === "string" && typeof x.cue === "string" &&
    (x.ingredientIds === undefined || (Array.isArray(x.ingredientIds) && x.ingredientIds.every((id) => typeof id === "string")))
  ).map((step) => ({
    ...step,
    ingredientIds: (step.ingredientIds ?? []).filter((id) => knownIngredientIds.has(id)),
  })) : [];
  if (Array.isArray(old.ingredients) && ingredients.length !== old.ingredients.length) return null;
  if (Array.isArray(old.steps) && steps.length !== old.steps.length) return null;
  if (old.sourceReferences !== undefined && !Array.isArray(old.sourceReferences)) return null;
  const sourceReferences = Array.isArray(old.sourceReferences) ? old.sourceReferences.filter((source): source is SourceReference =>
    typeof source === "object" && source !== null && typeof source.id === "string" && typeof source.url === "string" &&
    ["recipe-page", "video", "transcript", "other"].includes(source.kind) && typeof source.checked === "string" && typeof source.notes === "string" &&
    ["ingredientFindings", "methodFindings", "timingFindings", "safetyStorageFindings"].every((field) => (source as Record<string, unknown>)[field] === undefined || typeof (source as Record<string, unknown>)[field] === "string")
  ).map((source) => ({
    ...source,
    ingredientFindings: typeof source.ingredientFindings === "string" ? source.ingredientFindings : "",
    methodFindings: typeof source.methodFindings === "string" ? source.methodFindings : "",
    timingFindings: typeof source.timingFindings === "string" ? source.timingFindings : "",
    safetyStorageFindings: typeof source.safetyStorageFindings === "string" ? source.safetyStorageFindings : "",
  })) : [];
  if (Array.isArray(old.sourceReferences) && sourceReferences.length !== old.sourceReferences.length) return null;
  return { id: old.id, name: old.name, url: old.url, notes: old.notes,
    sourceEvidence: typeof old.sourceEvidence === "string" ? old.sourceEvidence : "",
    sourceReferences, servings: old.servings ?? "", ingredients, steps, scenes,
    trialStatus: old.trialStatus === "tested" ? "tested" : "untested",
    trialRating: typeof old.trialRating === "string" ? old.trialRating : "",
    trialNotes: typeof old.trialNotes === "string" ? old.trialNotes : "",
    trialPhotoDataUrl: typeof old.trialPhotoDataUrl === "string" && old.trialPhotoDataUrl.startsWith("data:image/") ? old.trialPhotoDataUrl : "",
    approved: old.approved === true,
    approvedAt: typeof old.approvedAt === "string" ? old.approvedAt : "" };
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSharePack(project: RecipeProject, profile: CreatorProfile): string {
  const slug = project.name.trim();
  const tone = profile.tone.trim() || DEFAULT_CREATOR_PROFILE.tone;
  const voiceNotes = [
    `Tone: ${tone}`,
    `Language preference: ${profile.language || "English"}`,
    `Cuisine focus: ${profile.cuisineFocus || "Not specified"}`,
    `Audience skill level: ${profile.skillLevel || "Not specified"}`,
    `Equipment: ${profile.equipment || "Not specified"}`,
    `Budget: ${profile.budget || "Not specified"}`,
    `Diet/allergy constraints to check: ${profile.dietLimits || "None recorded; ask/check before making suitability claims"}`,
    `Units: ${profile.units || "Not specified"}`,
    `Usual cooking-time target: ${profile.usualCookingTime || "Not specified"}`,
    `Target platforms: ${profile.platforms || "Not specified"}`,
    `Catchphrases: ${profile.catchphrases || "None recorded"}`,
    `Never-say list: ${profile.neverSay || "None recorded"}`,
  ];
  const hashtags = ["#Cooking", "#EasyRecipes", "#FoodTok", "#HomeCooking", "#RecipeIdeas"];
  const hooks = [
    `Here's how to make ${slug} step by step.`,
    `Save this ${slug} recipe for your next cooking day.`,
    `Let's make ${slug} with clear steps and no guesswork.`,
    `Want to try ${slug}? Here's the complete method.`,
    `From ingredients to the final plate: ${slug}.`,
  ];
  return [
    `RECIPE: ${slug}`,
    `STATUS: ${project.trialStatus === "tested" ? "Marked tested by the creator" : "UNTESTED — do not publish"}`,
    `APPROVAL: ${project.approved ? "Creator approved" : "Not approved"}`,
    "",
    "CREATOR PROFILE GUIDANCE (saved locally; apply while editing; this is not an AI-generated translation)",
    ...voiceNotes,
    `Sample captions in creator voice:\n${profile.sampleCaptions.trim() || "No sample captions supplied yet."}`,
    "",
    "HOOK OPTIONS",
    ...hooks.map((hook, index) => `${index + 1}. ${hook}`),
    "",
    "SHORT-FORM VOICEOVER / SHOT PLAN",
    buildNarrationScript(project),
    "",
    "CAPTION DRAFT",
    `${tone.toLowerCase().includes("professional") ? "Follow this step-by-step" : tone.toLowerCase().includes("energetic") ? "Let’s make" : "Come cook"} ${slug}${tone.toLowerCase().includes("professional") ? " tutorial" : ""}. Follow the recorded ingredients and steps, and save this post for later.`,
    "",
    hashtags.join(" "),
    "",
    "CALL TO ACTION",
    "Save this recipe and tell me what you would serve with it.",
    "",
    "REVIEW NOTES",
    project.trialNotes.trim() || "No cooking-trial notes recorded.",
    "",
    "SOURCE",
    project.url || "No source URL recorded.",
    "",
    "IMPORTANT: This is an editable text pack. It does not create a video, add music, upload media, or publish a post. Confirm platform-specific captions, music rights, and disclosures before sharing.",
  ].join("\n");
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
  const [sourceInspection, setSourceInspection] = useState<SourceInspectionResult | null>(null);
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [servings, setServings] = useState("4");
  const [projects, setProjects] = useState<RecipeProject[]>([]);
  const [profile, setProfile] = useState<CreatorProfile>(DEFAULT_CREATOR_PROFILE);
  const [active, setActive] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showNarration, setShowNarration] = useState(false);
  const [showContentPack, setShowContentPack] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [activeTool, setActiveTool] = useState<WorkspaceTool>("home");
  const [activeToolReady, setActiveToolReady] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [schedulePrefill, setSchedulePrefill] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const current = projects.find((project) => project.id === active);
  const issues = useMemo(() => current ? validateRecipe(current) : [], [current]);
  const tutorial = useMemo(() => current ? buildTutorialDraft(current) : "", [current]);
  const narration = useMemo(() => current ? buildNarrationScript(current) : "", [current]);
  const nutrition = useMemo(() => current ? calculateRecipeNutrition(current) : null, [current]);
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const sourceReferences = current?.sourceReferences ?? [];
  const sourceCoverage = {
    ingredient: sourceReferences.filter((source) => source.ingredientFindings?.trim()).length,
    method: sourceReferences.filter((source) => source.methodFindings?.trim()).length,
    timing: sourceReferences.filter((source) => source.timingFindings?.trim()).length,
    safety: sourceReferences.filter((source) => source.safetyStorageFindings?.trim()).length,
  };

  useEffect(() => {
    if (!menuOpen) return;
    function handleDrawerKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleDrawerKeydown);
    return () => window.removeEventListener("keydown", handleDrawerKeydown);
  }, [menuOpen]);

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {
      // The light theme remains the safe default when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    try {
      const savedTool = window.localStorage.getItem(ACTIVE_TOOL_STORAGE_KEY);
      if (savedTool && WORKSPACE_TOOLS.includes(savedTool as WorkspaceTool)) {
        setActiveTool(savedTool as WorkspaceTool);
      }
    } catch {
      // The default chat home remains available if browser storage is blocked.
    } finally {
      setActiveToolReady(true);
    }
  }, []);

  useEffect(() => {
    if (!activeToolReady) return;
    try {
      window.localStorage.setItem(ACTIVE_TOOL_STORAGE_KEY, activeTool);
    } catch {
      // Navigation still works for this session even if it cannot persist.
    }
  }, [activeTool, activeToolReady]);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The app remains usable if the browser blocks local storage.
    }
  }, [theme]);

  function openWorkspaceMenu() {
    setMenuOpen(true);
    // Wait for the drawer to become visible before moving keyboard focus.
    window.requestAnimationFrame(() => drawerCloseRef.current?.focus());
  }

  async function logOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out request failed");
      window.location.replace("/login");
    } catch {
      setMessage("Sign-out could not be confirmed. Check your connection and try again.");
    }
  }

  useEffect(() => {
    if (chatMessages.length > 0) chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages]);

  const lastChatStatusRef = useRef("");
  useEffect(() => {
    if (!message || message === lastChatStatusRef.current) return;
    lastChatStatusRef.current = message;
    setChatMessages((previous) => [...previous, {
      id: Date.now().toString(36) + "-status-" + previous.length,
      role: "assistant",
      text: message,
    }]);
  }, [message]);

  function responseForTool(tool: WorkspaceTool): string {
    if (tool === "home") return "Your chat workspace is ready. Choose a task from the three-line menu or type a request below.";
    if (tool === "plan") return current
      ? `Today’s Plan is open for “${current.name}”. Review the next step below. Your saved local posting schedule is also shown here when available.`
      : "Today’s Plan is open. Create a local posting draft with Plan Content, then return here to review your plan. Nothing is scheduled or published by this screen.";
    if (tool === "content") return "Plan Content is open. Add seven public video/Reel URLs, then choose a 3-day plan (2/2/3 posts) or a 7-day plan (one post per day). Suggested US Eastern times are placeholders, not audience-analytics predictions. This creates a local draft only; it does not schedule or publish posts.";
    if (tool === "research") return current
      ? `Research Studio is open for “${current.name}”. Add source references and record the ingredients, steps, timings, and safety/storage notes you actually checked. Public HTML extraction is not independent verification; video frames and audio are not analyzed.`
      : "Research Studio is open. Start a recipe draft below first, then add source references in its research desk. An accessible public recipe page can be inspected only after you request it; video/Reel frame and audio analysis is not implemented.";
    if (tool === "publish") return current
      ? (current.trialStatus === "tested"
          ? `Publish review is open for “${current.name}”. Review the text pack and approve it before using manual share/export. Social accounts are not connected, so no post will be scheduled or published automatically.`
          : `Publish review is open for “${current.name}”, but the recipe is still marked untested. Complete a real cooking trial and review the sources before approval. V1 does not publish directly to social platforms.`)
      : "Publish is open, but there is no recipe draft yet. Create a recipe first; then review the content pack. Official social publishing connections are not configured in this V1.";
    if (tool === "intake") return "Recipe intake is open. Enter a recipe name and optionally add a source URL. The draft is stored in this browser on this device; save an export backup for important work.";
    if (tool === "profile") return "Your creator profile settings are open. Preferences save in this browser. This screen is not connected to an AI model and does not automatically enforce every wording rule.";
    if (tool === "library") return projects.length ? `Your local library is open with ${projects.length} recipe draft(s). Select a draft to continue editing. Drafts are saved on this device only.` : "Your local library is open, but there are no recipe drafts saved in this browser yet.";
    return "Social connections are open. Official account authorization is not configured yet, so every platform remains disconnected and nothing can be posted from this screen.";
  }

  function openTool(tool: WorkspaceTool, userText?: string, customResponse?: string) {
    const shownText = userText?.trim() || WORKSPACE_TOOL_LABELS[tool];
    setActiveTool(tool);
    setMenuOpen(false);
    setCommand("");
    setChatMessages((previous) => {
      const base = Date.now().toString(36) + "-" + previous.length;
      return [
        ...previous,
        { id: base + "-user", role: "user", text: shownText },
        { id: base + "-assistant", role: "assistant", text: customResponse ?? responseForTool(tool) },
      ];
    });
    const targetId =
      tool === "home" ? "chat-transcript" :
      tool === "plan" ? "daily-plan" :
      tool === "content" ? "schedule-preview-title" :
      tool === "research" ? (current ? "research-desk" : "research-trends") :
      tool === "publish" ? (current ? "publish-queue" : "intake") :
      tool === "intake" ? "intake" :
      tool === "profile" ? "creator-profile" :
      tool === "library" ? "recent-projects" : "social-connections";
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goToSection(section: "plan" | "research" | "studio" | "publish" | "intake" | "profile" | "library" | "connections") {
    setMenuOpen(false);
    setActiveTool(
      section === "plan" ? "plan" : section === "research" ? "research" :
      section === "connections" ? "connections" : section === "publish" ? "publish" :
      section === "intake" ? "intake" : section === "profile" ? "profile" :
      section === "library" ? "library" : "intake"
    );
    const targetId =
      section === "plan" ? "daily-plan" :
      section === "research" ? (current ? "research-desk" : "research-trends") :
      section === "connections" ? "social-connections" :
      section === "studio" ? "recipe-editor" :
      section === "publish" ? (current ? "publish-queue" : "recipe-editor") :
      section === "intake" ? "intake" :
      section === "profile" ? "creator-profile" : "recent-projects";
    if (section === "publish" && !current) {
      setMessage("Create or open a recipe draft first. V1 supports owner-approved text export, not direct social publishing.");
    } else if (section === "research" && !current) {
      setMessage("Research notes are saved inside a recipe draft. Create or open a draft to add source references.");
    }
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submitWorkspaceCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawRequest = command.trim();
    const request = rawRequest.toLowerCase();
    if (!rawRequest) return;

    const detectedUrls = Array.from(rawRequest.matchAll(/https?:\/\/[^\s]+/gi), (match) => match[0].replace(/[),.;!?]+$/g, ""));
    const scheduleIntent = /\b(schedule|post|posting|week|morning|afternoon|evening|per day|daily|three days|3 days|seven days|7 days)\b/i.test(rawRequest);
    if (detectedUrls.length > 1 || (scheduleIntent && detectedUrls.length > 0)) {
      const invalidLinks = detectedUrls.filter((link) => !isHttpUrl(link));
      setSchedulePrefill(detectedUrls.filter(isHttpUrl).join("\n"));
      if (invalidLinks.length > 0) {
        openTool("content", rawRequest, `I found ${detectedUrls.length} link(s), but ${invalidLinks.length} do not look like valid HTTP(S) URLs. I placed the valid links into the planner. Correct the invalid link(s) and confirm there are exactly seven before generating a schedule.`);
        return;
      }
      openTool("content", rawRequest, detectedUrls.length === 7
        ? "I found seven valid HTTP(S) links and placed them in the Plan Content list. Choose the 3-day or 7-day draft option below. Times are suggested US Eastern slots; no posts are scheduled or published."
        : `I found ${detectedUrls.length} valid link(s) and placed them in the Plan Content list. The current planner needs exactly seven links to build a schedule; add or remove links before generating it. Nothing is scheduled or published.`);
      return;
    }

    if (/^(?:https?|ftp|file|javascript|data):/i.test(rawRequest)) {
      if (!isHttpUrl(rawRequest)) {
        openTool("intake", rawRequest, "Only a valid HTTP(S) URL can be added. Use a full http:// or https:// recipe/video link. No source was added.");
        return;
      }
      setSourceInspection(null);
      setUrl(rawRequest);
      openTool("intake", `Add this recipe/video source: ${rawRequest}`, "I added your source URL to recipe intake. Enter the recipe name, then review any extracted public-page details yourself. Video/Reel audio and frames are not analyzed.");
      return;
    }

    if (scheduleIntent || /plan content|seven links|7 links|three-day plan|7-day plan/.test(request)) {
      setSchedulePrefill("");
      openTool("content", rawRequest);
      return;
    }
    if (/connect|accounts?|integration|social/.test(request)) { openTool("connections", rawRequest); return; }
    if (/new recipe|create recipe|start recipe|add recipe/.test(request)) { openTool("intake", rawRequest); return; }
    if (/research|source|trend|video link/.test(request)) { openTool("research", rawRequest); return; }
    if (/publish|share|approval|queue/.test(request)) { openTool("publish", rawRequest); return; }
    if (/studio|editor|script|storyboard|content/.test(request)) { openTool("intake", rawRequest); return; }
    if (/today'?s plan|my plan|daily plan|next step|\bplan\b/.test(request)) { openTool("plan", rawRequest); return; }
    if (/theme|settings|profile/.test(request)) { openTool("profile", rawRequest); setMenuOpen(/theme|settings/.test(request)); return; }
    if (/library|recent drafts/.test(request)) { openTool("library", rawRequest); return; }

    const time = Date.now().toString(36);
    setChatMessages((previous) => [
      ...previous,
      { id: time + "-user-" + previous.length, role: "user", text: rawRequest },
      { id: time + "-assistant-" + (previous.length + 1), role: "assistant", text: "I can open the existing V1 tools and prepare local drafts, but this chat is not connected to an AI model yet. Try Today’s Plan, Plan Content, Research Studio, Publish, or paste source links to continue." },
    ]);
    setCommand("");
  }

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline caching is progressive enhancement; the online app must still work if registration fails.
      });
    }
  }, []);

  useEffect(() => {
    try {
      const rawProfile = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (rawProfile) {
        const parsedProfile: unknown = JSON.parse(rawProfile);
        if (isCreatorProfile(parsedProfile)) setProfile(parsedProfile);
        else setMessage("Saved creator profile was invalid; default profile loaded.");
      }
    } catch {
      setMessage("Saved creator profile could not be read; default profile loaded.");
    }
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
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      setMessage("Creator profile could not be saved. Export/record the profile details before leaving this browser.");
    }
  }, [profile, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      setMessage("Browser storage is unavailable or full. Export your draft before leaving this page.");
    }
  }, [projects, hydrated]);

  async function inspectRecipeSource() {
    const candidate = url.trim();
    if (!candidate || !isHttpUrl(candidate)) {
      setMessage("Enter a complete HTTP(S) recipe-page URL before inspecting it.");
      return;
    }

    setInspectionBusy(true);
    setSourceInspection(null);
    try {
      const response = await fetch("/api/sources/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: candidate }),
      });
      const payload = await response.json().catch(() => null) as { source?: SourceInspectionResult; error?: string } | null;
      if (!response.ok || !payload?.source) {
        setMessage(payload?.error || "The public page could not be inspected. Check the link and try again.");
        return;
      }
      setSourceInspection(payload.source);
      setMessage("Public page extracted. Verify the recipe details before using them; this does not analyze video frames or audio.");
    } catch {
      setMessage("The source inspection request could not be completed. Check your connection and try again.");
    } finally {
      setInspectionBusy(false);
    }
  }

  function addInspectedDetailsToNotes() {
    if (!sourceInspection) return;
    const recipe = sourceInspection.structuredRecipe;
    const extractedNotes = [
      "PUBLIC RECIPE PAGE EXTRACTION — VERIFY BEFORE USE",
      `Requested URL: ${sourceInspection.requestedUrl}`,
      `Final URL: ${sourceInspection.finalUrl}`,
      `Page title: ${sourceInspection.title || "(not available)"}`,
      `Site name: ${sourceInspection.siteName || "(not available)"}`,
      recipe?.name ? `Structured recipe name: ${recipe.name}` : "",
      recipe?.author ? `Listed author: ${recipe.author}` : "",
      recipe?.servings ? `Listed servings/yield: ${recipe.servings}` : "",
      recipe?.prepTime ? `Listed prep time: ${recipe.prepTime}` : "",
      recipe?.cookTime ? `Listed cook time: ${recipe.cookTime}` : "",
      recipe?.totalTime ? `Listed total time: ${recipe.totalTime}` : "",
      recipe?.description || sourceInspection.description
        ? `Description: ${recipe?.description || sourceInspection.description}`
        : "",
      recipe?.ingredients.length
        ? `Ingredients (extracted; not independently verified):\n${recipe.ingredients.slice(0, 30).map((item) => `- ${item}`).join("\n")}`
        : "",
      recipe?.instructions.length
        ? `Instructions (extracted; not independently verified):\n${recipe.instructions.slice(0, 30).map((item, index) => `${index + 1}. ${item}`).join("\n")}`
        : "",
      !recipe && sourceInspection.textExcerpt
        ? `Page text excerpt (not independently verified):\n${sourceInspection.textExcerpt.slice(0, 2_000)}`
        : "",
    ].filter(Boolean).join("\n\n");
    const reviewFooter = [
      `Inspection limitation: ${sourceInspection.limitation}`,
      "Review every quantity, step, timing, doneness cue, allergen, and food-safety detail against reliable sources before relying on this content.",
    ].join("\n\n");
    const truncationNotice = "[Some extracted details were omitted to fit the note limit. Review the full preview and original source.]";
    const bodyBudget = Math.max(0, 4_800 - reviewFooter.length - truncationNotice.length - 6);
    const safeBody = extractedNotes.length > bodyBudget
      ? `${extractedNotes.slice(0, Math.max(0, bodyBudget - truncationNotice.length - 2))}\n\n${truncationNotice}`
      : extractedNotes;
    const finalNotes = `${safeBody}\n\n${reviewFooter}`;
    const existingNotes = notes.trim();
    if (existingNotes && existingNotes.length + finalNotes.length + 2 > 4_800) {
      setMessage("These extracted details would exceed the 4,800-character recipe-notes limit. Shorten or export the existing notes before adding this extraction.");
      return;
    }
    setNotes(existingNotes ? `${existingNotes}\n\n${finalNotes}` : finalNotes);
    setMessage("Extracted details were added to recipe notes. Review all values before creating the draft or relying on them.");
  }

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
      sourceReferences: sourceInspection ? [{
        id: makeId(),
        url: sourceInspection.finalUrl,
        kind: "recipe-page",
        checked: "Public HTML fetched by the app after an explicit creator action; extracted fields are not independently verified.",
        notes: "Requested URL: " + sourceInspection.requestedUrl + ". Page title: " + (sourceInspection.title || "(not available)") + ". " + sourceInspection.limitation,
        ingredientFindings: "",
        methodFindings: "",
        timingFindings: "",
        safetyStorageFindings: "",
      }] : [],
      trialStatus: "untested",
      trialRating: "",
      trialNotes: "",
      trialPhotoDataUrl: "",
      approved: false,
      approvedAt: "",
      servings: servings.trim(),
      ingredients: [],
      steps: [],
      scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
    };
    setProjects((existing) => [project, ...existing]);
    setActive(project.id);
    setName("");
    setUrl("");
    setSourceInspection(null);
    setNotes("");
    setServings("4");
    setShowTutorial(false); setShowNarration(false); setShowContentPack(false);
    setMessage("Recipe draft created on this device. Review extracted source notes and add any missing ingredients, steps, and safety evidence manually.");
    document.getElementById("recipe-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function patchProfile(patch: Partial<CreatorProfile>) { setProfile((existing) => ({ ...existing, ...patch })); }

  function patchCurrent(patch: Partial<RecipeProject>) {
    if (!current) return;
    const changesRecipe = ["name", "url", "sourceEvidence", "sourceReferences", "servings", "ingredients", "steps", "scenes"].some((key) => key in patch);
    setProjects((existing) => existing.map((project) => project.id === current.id
      ? { ...project, ...patch, ...(changesRecipe ? { trialStatus: "untested" as const, trialRating: "", approved: false, approvedAt: "" } : (("trialNotes" in patch || "trialRating" in patch || "trialPhotoDataUrl" in patch) ? { approved: false, approvedAt: "" } : {})) }
      : project));
  }

  async function saveTrialPhoto(file: File | null) {
    if (!current || !file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file for the cooking-trial photo.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setMessage("That photo is over 12 MB. Choose a smaller image so local browser storage is less likely to fill.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image decode failed"));
        image.src = objectUrl;
      });
      const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        setMessage("This browser could not prepare the photo. Try a JPG or PNG image.");
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL("image/jpeg", 0.65);
      if (compressed.length > 500_000) {
        setMessage("The compressed photo is still too large for reliable local storage. Choose or crop a smaller photo.");
        return;
      }
      patchCurrent({ trialPhotoDataUrl: compressed });
      setMessage("Cooking-trial photo saved locally with the recipe. It is not uploaded.");
    } catch {
      setMessage("Photo could not be processed in this browser. Try a smaller JPG or PNG.");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function markRecipeTested() {
    if (!current) return;
    if (!current.trialPhotoDataUrl) {
      setMessage("Add a photo of the dish you actually cooked before marking this recipe Tested.");
      return;
    }
    if (!current.trialRating) {
      setMessage("Rate your real cooking trial before marking this recipe Tested.");
      return;
    }
    if (current.trialNotes.trim().length < 10) {
      setMessage("Add at least a short, useful cooking-trial note (10 characters or more) before marking Tested.");
      return;
    }
    patchCurrent({ trialStatus: "tested" });
    setMessage("Recipe marked Tested from your recorded trial. Any later recipe edits will reset approval.");
  }

  async function shareContentPack() {
    if (!current) return;
    if (current.trialStatus !== "tested") {
      setMessage("This recipe is still Untested. Record a real cooking trial and mark it Tested before sharing.");
      return;
    }
    if (!current.approved) {
      setMessage("Approve this content pack first. Nothing is posted automatically.");
      return;
    }
    const text = buildSharePack(current, profile);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${current.name} — Cooking Creator pack`, text });
        setMessage("Share sheet opened. Choose a destination yourself; this app did not publish automatically.");
      } else {
        const safeName = current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recipe";
        downloadFile(`${safeName}.content-pack.txt`, text, "text/plain;charset=utf-8");
        setMessage("Your phone/browser does not support text sharing here. Downloaded the content pack instead.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessage("Share cancelled. Your approved content pack remains saved.");
      } else {
        setMessage("Sharing was unavailable. Export the content pack as a text file instead.");
      }
    }
  }

  function exportContentPack() {
    if (!current) return;
    const safeName = current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recipe";
    downloadFile(`${safeName}.content-pack.txt`, buildSharePack(current, profile), "text/plain;charset=utf-8");
    setMessage("Content pack exported. It is not uploaded or published.");
  }

  function patchIngredient(id: string, patch: Partial<Ingredient>) {
    if (!current) return;
    const nutritionFields = new Set(["nutritionCalories", "nutritionProteinG", "nutritionCarbsG", "nutritionFatG", "nutritionBasis", "nutritionSourceUrl"]);
    const nutritionOnly = Object.keys(patch).length > 0 && Object.keys(patch).every((key) => nutritionFields.has(key));
    setProjects((existing) => existing.map((project) => {
      if (project.id !== current.id) return project;
      return {
        ...project,
        ingredients: project.ingredients.map((item) => item.id === id ? { ...item, ...patch } : item),
        ...(nutritionOnly
          ? { approved: false, approvedAt: "" }
          : { trialStatus: "untested" as const, trialRating: "", approved: false, approvedAt: "" }),
      };
    }));
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

  function exportProject(format: "markdown" | "json") {
    if (!current) return;
    const safeName = current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recipe-draft";
    const fileContent = format === "markdown" ? tutorial : JSON.stringify({
      ...current,
      creatorProfile: profile,
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
    downloadFile(`${safeName}.${format === "json" ? "json" : "md"}`, fileContent,
      format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8");
    setMessage(`Exported ${format.toUpperCase()} draft. Export does not publish or verify the recipe.`);
  }

  function exportNarration() {
    if (!current) return;
    const safeName = current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "recipe-draft";
    downloadFile(`${safeName}.narration.txt`, narration, "text/plain;charset=utf-8");
    setMessage("Exported narration script. Export does not publish or verify the recipe.");
  }

  function exportWorkspaceBackup() {
    if (projects.length === 0) {
      setMessage("There are no recipe drafts to back up yet.");
      return;
    }
    const backup = createCreatorWorkspaceBackupJSON(projects, profile);
    downloadFile("cooking-creator-workspace-backup.json", backup, "application/json;charset=utf-8");
    setMessage(`Exported ${projects.length} recipe draft(s) and the creator profile as a local workspace backup. Nothing was uploaded.`);
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
        setMessage("Clipboard access is unavailable; use Export Markdown instead.");
        return;
      }
      await navigator.clipboard.writeText(narration);
      setMessage("Narration script copied to clipboard.");
    } catch {
      setMessage("Clipboard permission was not available; use Export Markdown instead.");
    }
  }

  async function importProject(file: File) {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setMessage("That backup is larger than 15 MB. Nothing was imported; export smaller groups of drafts or remove large trial photos first.");
      return;
    }
    try {
      const rawText = await file.text();
      let parsedInput: unknown;
      try {
        parsedInput = JSON.parse(rawText);
      } catch {
        setMessage("The JSON file is malformed. Nothing was imported.");
        return;
      }

      const workspaceBackup = parseCreatorWorkspaceBackupJSON(rawText);
      if (workspaceBackup) {
        const estimatedStoredCharacters = JSON.stringify(workspaceBackup.projects).length;
        if (estimatedStoredCharacters > MAX_SAFE_LOCAL_DRAFT_CHARACTERS) {
          setMessage("This workspace backup is too large to restore safely into browser storage. Nothing was changed; keep the archive and export smaller groups of drafts.");
          return;
        }
        if (!window.confirm(`Restore ${workspaceBackup.projects.length} recipe draft(s) and the creator profile? This replaces all current local drafts and the saved profile in this browser. Export your current work first if you want to keep it.`)) {
          setMessage("Workspace restore was cancelled. Your current drafts and profile were not changed.");
          return;
        }
        const idBase = Date.now();
        const restoredProjects = workspaceBackup.projects.map((project, index) => ({ ...project, id: idBase + index }));
        setProjects(restoredProjects);
        setProfile(workspaceBackup.creatorProfile);
        setActive(restoredProjects[0]?.id ?? null);
        setShowTutorial(false);
        setShowNarration(false);
        setShowContentPack(false);
        setMessage(`Restored ${restoredProjects.length} recipe draft(s) and the creator profile from the workspace backup. Sources, food safety and nutrition remain unverified.`);
        document.getElementById("recipe-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      const imported = parseRecipeProjectJSON(rawText);
      if (!imported) {
        setMessage("That file is not a valid Cooking Creator JSON draft or workspace backup, or it contains an invalid source URL. Nothing was imported.");
        return;
      }

      const restored: RecipeProject = { ...imported, id: Date.now() };
      const combinedProjects = [restored, ...projects];
      if (JSON.stringify(combinedProjects).length > MAX_SAFE_LOCAL_DRAFT_CHARACTERS) {
        setMessage("This import would make local drafts too large for a safe browser-storage estimate. Nothing was imported; export a backup and remove large trial photos or old drafts first.");
        return;
      }

      const importedProfile = typeof parsedInput === "object" && parsedInput !== null && "creatorProfile" in parsedInput
        ? (parsedInput as { creatorProfile?: unknown }).creatorProfile
        : undefined;
      if (isCreatorProfile(importedProfile)) setProfile(importedProfile);
      setProjects(combinedProjects);
      setActive(restored.id);
      setShowTutorial(false);
      setShowNarration(false);
      setShowContentPack(false);
      setMessage("JSON recipe draft imported into this browser. Review all source, safety, and nutrition warnings before using it.");
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
    <main className="shell" data-theme={theme} data-active-tool={activeTool} data-has-current={current ? "true" : "false"}>
      {menuOpen && <button className="drawer-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
      <aside id="workspace-drawer" className={menuOpen ? "sidebar is-open" : "sidebar"} aria-hidden={!menuOpen}>
        <div className="drawer-head">
          <a className="brand" href="#dashboard" onClick={() => openTool("home")}><span className="brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.2c-1.3-.7-2.1-2-2.1-3.5A3.8 3.8 0 0 1 7.2 5a4.9 4.9 0 0 1 9.4 0 3.8 3.8 0 0 1 4.3 3.7c0 1.5-.8 2.8-2.1 3.5v6.1H5z"/><path d="M5 14h14M8 17h8"/></svg></span><span><b>Cooking Creator</b><small>AI COOKING CONTENT APP</small></span></a>
          <button ref={drawerCloseRef} className="drawer-close" type="button" aria-label="Close menu" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}>×</button>
        </div>
        <p className="nav-label">YOUR WORKFLOW</p>
        <button className={activeTool === "plan" ? "nav active" : "nav"} type="button" onClick={() => openTool("plan")}><span aria-hidden="true">▣</span> Today&apos;s Plan</button>
        <button className={activeTool === "content" ? "nav active" : "nav"} type="button" onClick={() => openTool("content")}><span aria-hidden="true">▤</span> Plan Content</button>
        <button className={activeTool === "research" ? "nav active" : "nav"} type="button" onClick={() => openTool("research")}><span aria-hidden="true">⌕</span> Research Studio</button>
        <button className={activeTool === "publish" ? "nav active" : "nav"} type="button" onClick={() => openTool("publish")}><span aria-hidden="true">➤</span> Publish</button>
        <div className="drawer-divider" />
        <p className="nav-label">MORE</p>
        <button className={activeTool === "intake" ? "nav active" : "nav"} type="button" onClick={() => openTool("intake")}><span aria-hidden="true">＋</span> New recipe</button>
        <button className={activeTool === "profile" ? "nav active" : "nav"} type="button" onClick={() => openTool("profile")}><span aria-hidden="true">⚙</span> Creator profile</button>
        <button className={activeTool === "library" ? "nav active" : "nav"} type="button" onClick={() => openTool("library")}><span aria-hidden="true">▤</span> Library / recent drafts</button>
        <button className={activeTool === "connections" ? "nav active" : "nav"} type="button" onClick={() => openTool("connections")}><span aria-hidden="true">◎</span> Connect social accounts</button>
        <div className="drawer-theme">
          <span><strong>Appearance</strong><small>Saved on this device</small></span>
          <button className="theme-toggle" type="button" aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}>{theme === "light" ? "☾ Dark" : "☀ Light"}</button>
        </div>
        <div className="drawer-projects">
          <p className="nav-label">RECENT PROJECTS</p>
          {projects.length === 0 ? <p className="drawer-empty">Your recipe drafts will appear here.</p> : projects.slice(0, 5).map((project) => <button key={project.id} className={project.id === active ? "nav nav-project selected" : "nav nav-project"} type="button" onClick={() => { setActive(project.id); setShowTutorial(false); setShowNarration(false); setShowContentPack(false); goToSection("studio"); }}>◦　{project.name}</button>)}
        </div>
        <div className="side-foot"><span className="dot" /> V1 foundation<br /><small>Local drafts · this browser</small></div>
      </aside>

      <section className="main" id="dashboard">
        <header className="top">
          <button ref={menuButtonRef} className="menu-trigger" type="button" aria-label="Open navigation menu" aria-controls="workspace-drawer" aria-expanded={menuOpen} onClick={openWorkspaceMenu}>☰</button>
          <span className="top-context"><strong>Cooking Creator</strong><small>AI Cooking Content App</small></span>
          <button className="logout-trigger" type="button" onClick={() => void logOut()} aria-label="Log out">Log out</button>
          <button className="assistant-mark" type="button" aria-label="Open creator profile" onClick={() => openTool("profile")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.2c-1.3-.7-2.1-2-2.1-3.5A3.8 3.8 0 0 1 7.2 5a4.9 4.9 0 0 1 9.4 0 3.8 3.8 0 0 1 4.3 3.7c0 1.5-.8 2.8-2.1 3.5v6.1H5z"/><path d="M5 14h14M8 17h8"/></svg><i aria-hidden="true" /></button>
        </header>
        <div className="content">
          <section className="chat-transcript" aria-label="Cooking Creator chat" role="log" aria-live="polite">
            {chatMessages.length === 0 ? (
              <div className="chat-empty">
                <span className="chat-chef-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.2c-1.3-.7-2.1-2-2.1-3.5A3.8 3.8 0 0 1 7.2 5a4.9 4.9 0 0 1 9.4 0 3.8 3.8 0 0 1 4.3 3.7c0 1.5-.8 2.8-2.1 3.5v6.1H5z"/><path d="M5 14h14M8 17h8"/></svg></span>
                <h1>What are we cooking today?</h1>
                <p>Choose a task from the three-line menu, or type your request below.</p>
              </div>
            ) : (
              <div className="chat-messages">
                {chatMessages.map((item) => (
                  <div key={item.id} className={item.role === "user" ? "chat-message from-user" : "chat-message from-assistant"}>
                    {item.role === "assistant" && <span className="chat-avatar" aria-hidden="true">♨</span>}
                    <p>{item.text}</p>
                  </div>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </section>
          <section className="hero">
            <div><p className="eyebrow">YOUR CREATOR WORKSPACE</p><h1>Good cooking deserves a story.</h1><p>Research the recipe, plan every step, and prepare a reviewed content pack. This version keeps drafts on this device.</p></div>
            <div className="dish" aria-hidden="true">✦</div>
          </section>

          <section className="plan-card panel" id="daily-plan">
            <div className="section-head"><div><p className="eyebrow">TODAY&apos;S PLAN</p><h2>Your next useful step</h2><p>Work through one recipe carefully before scaling up production.</p></div><span className="step">{current ? "DRAFT OPEN" : "READY TO START"}</span></div>
            <div className="plan-next">
              <span className="plan-check" aria-hidden="true">{current ? "02" : "01"}</span>
              <div><strong>{current ? (current.trialStatus === "tested" ? (current.approved ? "Review the approved content pack" : "Approve the reviewed content pack") : "Complete the recipe details and cooking trial") : "Create your first recipe draft"}</strong><p>{current ? (current.trialStatus === "tested" ? "Check the script, source evidence and final share text before exporting." : "Add quantities, ordered steps, sources, and real cooking-trial evidence before approval.") : "Add a recipe name and optional source link to open the structured recipe editor."}</p></div>
              <button type="button" className="secondary" onClick={() => goToSection(current ? (current.trialStatus === "tested" ? "publish" : "studio") : "intake")}>{current ? "Continue" : "Start recipe"} →</button>
            </div>
          </section>

          <SchedulePlanner prefillLinksText={schedulePrefill} />

          <div className="stats">
            <div><small>Recipe projects</small><strong>{projects.length}</strong><em>Saved in this browser</em></div>
            <div><small>Creator outline</small><strong>6 scenes</strong><em>Editable template</em></div>
            <div><small>Publishing</small><strong>Not connected</strong><em>Planned for V6</em></div>
          </div>

          <section className="research-hub panel" id="research-trends">
            <div className="section-head"><div><p className="eyebrow">RESEARCH STUDIO</p><h2>Build from evidence, not guesses.</h2><p>Compare recipe sources, record ingredients and ordered steps, and flag timing or safety gaps before scripting.</p></div><span className="step">SOURCE-FIRST</span></div>
            <div className="research-hub-row"><span className="research-icon" aria-hidden="true">⌕</span><div><strong>{current ? "Research desk is available in your open recipe" : "Start a recipe to open its research desk"}</strong><p>Public HTML recipe pages can be inspected after an explicit action during intake. Extraction is not verification; video frames and audio are not analyzed. Never treat a URL alone as proof that the video was inspected.</p></div><button className="secondary" type="button" onClick={() => goToSection(current ? "studio" : "intake")}>{current ? "Open recipe desk" : "Create recipe"} →</button></div>
          </section>

          <section className="connection-hub panel" id="social-connections">
            <div className="section-head">
              <div>
                <p className="eyebrow">SOCIAL CONNECTIONS</p>
                <h2>Connect your social accounts</h2>
                <p>Keep your publishing accounts in one place. Each connection must use the platform&apos;s official sign-in and approved permissions.</p>
              </div>
              <span className="step">OAUTH REQUIRED</span>
            </div>
            <p className="connection-notice"><strong>Private by design.</strong> This build never asks for social passwords or stores them. Official OAuth integrations have not been configured yet, so these accounts remain disconnected and publishing stays manual.</p>
            <div className="connection-grid">
              {SOCIAL_PLATFORMS.map((platform) => (
                <article className="connection-card" key={platform.name}>
                  <div className="connection-card-heading">
                    <span className="connection-platform-mark" aria-hidden="true">{platform.mark}</span>
                    <div><h3>{platform.name}</h3><p>{platform.description}</p></div>
                  </div>
                  <div className="connection-card-status"><span className="connection-dot" aria-hidden="true" />Not connected</div>
                  <button className="secondary connection-action" type="button" disabled title={`Official OAuth setup for ${platform.name} has not been configured in this build.`}>Connect when available</button>
                </article>
              ))}
            </div>
            <p className="hint">Connection support depends on each platform&apos;s current API rules, approved scopes, and developer credentials. No token or account permission is assumed, and no post is sent from this screen.</p>
          </section>

          <section className="profile-section" id="creator-profile">
            <details className="profile-panel">
              <summary><span><strong>Kitchen & creator profile</strong><small>Saved on this device · reused in every content pack</small></span><span className="profile-chevron">＋</span></summary>
              <p className="muted">Set your voice and cooking constraints once. This V1 uses these details as content-pack guidance; it does not call an AI model or automatically translate captions.</p>
              <div className="editor-grid profile-grid">
                <div><label htmlFor="profile-tone">Voice / tone</label><input id="profile-tone" value={profile.tone} onChange={(event) => patchProfile({ tone: event.target.value })} maxLength={240} placeholder="Warm, confident, funny…" /></div>
                <div><label htmlFor="profile-catchphrases">Catchphrases</label><input id="profile-catchphrases" value={profile.catchphrases} onChange={(event) => patchProfile({ catchphrases: event.target.value })} maxLength={300} placeholder="Your recurring words or sign-off" /></div>
                <div><label htmlFor="profile-language">Main language</label><input id="profile-language" value={profile.language} onChange={(event) => patchProfile({ language: event.target.value })} maxLength={80} placeholder="English" /></div>
                <div><label htmlFor="profile-cuisine">Cuisine focus</label><input id="profile-cuisine" value={profile.cuisineFocus} onChange={(event) => patchProfile({ cuisineFocus: event.target.value })} maxLength={300} placeholder="Indian, global home cooking…" /></div>
                <div><label htmlFor="profile-skill">Audience skill level</label><select id="profile-skill" value={profile.skillLevel} onChange={(event) => patchProfile({ skillLevel: event.target.value })}><option>Beginner-friendly</option><option>Mixed experience</option><option>Experienced cooks</option><option>Professional culinary</option></select></div>
                <div><label htmlFor="profile-equipment">Kitchen equipment</label><input id="profile-equipment" value={profile.equipment} onChange={(event) => patchProfile({ equipment: event.target.value })} maxLength={300} placeholder="Stove, oven, air fryer…" /></div>
                <div><label htmlFor="profile-budget">Budget preference</label><input id="profile-budget" value={profile.budget} onChange={(event) => patchProfile({ budget: event.target.value })} maxLength={240} placeholder="Affordable / premium / mixed" /></div>
                <div><label htmlFor="profile-diet">Diet/allergy constraints to check</label><input id="profile-diet" value={profile.dietLimits} onChange={(event) => patchProfile({ dietLimits: event.target.value })} maxLength={300} placeholder="Optional; list constraints to check" /></div>
                <div><label htmlFor="profile-units">Units</label><select id="profile-units" value={profile.units} onChange={(event) => patchProfile({ units: event.target.value })}><option>Metric</option><option>US customary</option><option>Both metric and US customary</option></select></div>
                <div><label htmlFor="profile-time">Usual cooking-time target</label><input id="profile-time" value={profile.usualCookingTime} onChange={(event) => patchProfile({ usualCookingTime: event.target.value })} maxLength={120} placeholder="e.g. under 45 minutes" /></div>
                <div><label htmlFor="profile-platforms">Target platforms</label><input id="profile-platforms" value={profile.platforms} onChange={(event) => patchProfile({ platforms: event.target.value })} maxLength={300} placeholder="YouTube Shorts, Instagram Reels…" /></div>
                <div><label htmlFor="profile-never">Never-say list</label><textarea id="profile-never" rows={2} value={profile.neverSay} onChange={(event) => patchProfile({ neverSay: event.target.value })} maxLength={800} placeholder="Claims, phrases, or tone to avoid" /></div>
                <div className="profile-wide"><label htmlFor="profile-samples">3–5 sample captions in your real voice</label><textarea id="profile-samples" rows={4} value={profile.sampleCaptions} onChange={(event) => patchProfile({ sampleCaptions: event.target.value })} maxLength={2500} placeholder="Paste a few captions you wrote. Separate each caption with a new line." /></div>
              </div>
              <p className="hint">Profile saves locally in this browser and is not encrypted or synced. Avoid entering sensitive personal details. The current text generator includes profile guidance in the pack; it does not guarantee every wording rule is automatically enforced.</p>
              <button className="secondary" type="button" onClick={() => { setProfile(DEFAULT_CREATOR_PROFILE); setMessage("Creator profile reset to defaults."); }}>Reset profile defaults</button>
            </details>
          </section>

          <section id="intake">
            <div className="section-head"><div><p className="eyebrow">STEP 01</p><h2>Start a recipe project</h2><p>Use a source link, a recipe, or your own notes.</p></div><span className="step">01 / 06</span></div>
            <div className="columns">
              <form className="panel" onSubmit={createProject}>
                <h3>✦　Recipe intake</h3><p className="muted">Start with the details you know.</p>
                <label htmlFor="name">Recipe name <b>*</b></label>
                <input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Spicy chicken gravy" required maxLength={100} />
                <label htmlFor="url">Video or recipe URL <span>OPTIONAL</span></label>
                <input id="url" type="url" value={url} disabled={inspectionBusy} onChange={(event) => { setUrl(event.target.value); setSourceInspection(null); }} placeholder="https://example.com/recipe" />
                <p className="hint">Use “Inspect public recipe page” for accessible HTML recipe pages. Video/Reel audio and frames are not inspected, and some sites block automated page access.</p>
                <button className="secondary" type="button" onClick={() => void inspectRecipeSource()} disabled={inspectionBusy || !url.trim()}>{inspectionBusy ? "Inspecting public page…" : "Inspect public recipe page"}</button>
                {sourceInspection && <div className="panel source-inspection-preview" role="region" aria-label="Inspected public page preview">
                  <h4>Extracted preview — verify before use</h4>
                  <p><strong>{sourceInspection.title || sourceInspection.finalUrl}</strong></p>
                  {sourceInspection.siteName && <p className="hint">Site: {sourceInspection.siteName}</p>}
                  {sourceInspection.description && <p>{sourceInspection.description}</p>}
                  {sourceInspection.structuredRecipe ? <>
                    {sourceInspection.structuredRecipe.name && <p><strong>Recipe:</strong> {sourceInspection.structuredRecipe.name}</p>}
                    {sourceInspection.structuredRecipe.servings && <p><strong>Listed yield:</strong> {sourceInspection.structuredRecipe.servings}</p>}
                    {sourceInspection.structuredRecipe.ingredients.length > 0 && <div><strong>Extracted ingredients</strong><ul>{sourceInspection.structuredRecipe.ingredients.slice(0, 25).map((item, index) => <li key={`source-ingredient-${index}`}>{item}</li>)}</ul>{sourceInspection.structuredRecipe.ingredients.length > 25 && <p className="hint">Preview shows the first 25 of {sourceInspection.structuredRecipe.ingredients.length} ingredients.</p>}</div>}
                    {sourceInspection.structuredRecipe.instructions.length > 0 && <div><strong>Extracted instructions</strong><ol>{sourceInspection.structuredRecipe.instructions.slice(0, 25).map((item, index) => <li key={`source-instruction-${index}`}>{item}</li>)}</ol>{sourceInspection.structuredRecipe.instructions.length > 25 && <p className="hint">Preview shows the first 25 of {sourceInspection.structuredRecipe.instructions.length} instructions.</p>}</div>}
                  </> : sourceInspection.textExcerpt ? <details><summary>View extracted page text excerpt</summary><p>{sourceInspection.textExcerpt}</p></details> : <p className="hint">No structured recipe or readable text excerpt was found on this page.</p>}
                  <p className="hint">URL: <a href={sourceInspection.finalUrl} target="_blank" rel="noreferrer">{sourceInspection.finalUrl}</a></p>
                  <p className="hint">{sourceInspection.limitation}</p>
                  <button className="secondary" type="button" onClick={addInspectedDetailsToNotes}>Add extracted details to recipe notes</button>
                </div>}
                <label htmlFor="servings">Servings <b>*</b></label>
                <input id="servings" value={servings} onChange={(event) => setServings(event.target.value)} placeholder="e.g. 4 people" maxLength={40} required />
                <label htmlFor="notes">Recipe notes <span>OPTIONAL</span></label>
                <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={5000} placeholder="Paste recipe notes, ingredients, source observations, or questions…" />
                <button className="primary" type="submit" disabled={inspectionBusy}>Create recipe draft　→</button>
                <label htmlFor="import-backup">Import a recipe draft or restore a workspace backup <span>OPTIONAL</span></label>
                <input id="import-backup" type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importProject(file); }} />
                <p className="hint">A single recipe draft is added to this browser. A full workspace backup restores all included drafts and creator settings, replacing current local data only after confirmation. Imports are not independently verified and nothing is uploaded.</p>
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
                <section className="trial-panel">
                  <div className="subsection-head"><div><p className="eyebrow">RECIPE TRUST CHECK</p><h3>Cooking trial & tested status</h3><p className="muted">Only mark Tested after you actually cook this recipe. This is your record, not an independent food-safety certification.</p></div><span className={current.trialStatus === "tested" ? "status" : "status status-warning"}>{current.trialStatus === "tested" ? "TESTED BY YOU" : "UNTESTED"}</span></div>
                  <div className="trial-photo-field"><label htmlFor="trial-photo">Cooking-trial photo <b>*</b></label><input id="trial-photo" type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; event.currentTarget.value = ""; void saveTrialPhoto(file); }} /><small className="hint">Resized on your device and saved locally; no upload. Keep the photo of the dish you actually cooked.</small>{current.trialPhotoDataUrl && <div className="trial-photo-preview"><NextImage src={current.trialPhotoDataUrl} alt={`Your cooking-trial photo for ${current.name}`} width={900} height={900} unoptimized style={{ width: "100%", height: "auto", maxWidth: 280, maxHeight: 260, objectFit: "contain" }} /><button className="text-button" type="button" onClick={() => patchCurrent({ trialPhotoDataUrl: "" })}>Remove photo</button></div>}</div>
                  <div className="editor-grid">
                    <div><label htmlFor="trial-rating">Your trial rating</label><select id="trial-rating" value={current.trialRating} onChange={(event) => patchCurrent({ trialRating: event.target.value })}><option value="">Choose a rating</option><option value="1">1 — Needs work</option><option value="2">2 — Below expectations</option><option value="3">3 — Good</option><option value="4">4 — Very good</option><option value="5">5 — Excellent</option></select></div>
                    <div><label htmlFor="trial-notes">What happened when you cooked it?</label><textarea id="trial-notes" rows={3} value={current.trialNotes} onChange={(event) => patchCurrent({ trialNotes: event.target.value })} placeholder="Record changes, actual timing, texture, taste, and any safety concerns…" /></div>
                  </div>
                  <div className="action-row"><button className="secondary" type="button" onClick={markRecipeTested}>Mark as Tested</button><small className="hint">Requires a real-dish photo, rating, and trial notes. Editing the recipe resets approval.</small></div>
                </section>
                <section className="approval-panel" id="publish-queue">
                  <div className="subsection-head"><div><p className="eyebrow">CREATOR CONTROL</p><h3>Approval before sharing</h3><p className="muted">Nothing is posted automatically. Review the pack, approve it, then choose a destination in Android’s share sheet.</p></div><span className={current.approved ? "status" : "status status-warning"}>{current.approved ? "APPROVED" : "AWAITING APPROVAL"}</span></div>
                  <div className="action-row">
                    <button className="primary" type="button" onClick={() => setShowContentPack((show) => !show)}>{showContentPack ? "Hide content pack" : "Prepare content pack"}</button>
                    <button className="secondary" type="button" disabled={current.trialStatus !== "tested"} onClick={() => { patchCurrent({ approved: true, approvedAt: new Date().toISOString() }); setShowContentPack(true); setMessage("Content pack approved by you. Sharing remains a separate manual action."); }}>Approve pack</button>
                    <button className="secondary" type="button" disabled={current.trialStatus !== "tested" || !current.approved} onClick={() => { void shareContentPack(); }}>Share approved pack</button>
                    <button className="secondary" type="button" onClick={exportContentPack}>Export pack</button>
                  </div>
                  {current.trialStatus !== "tested" && <p className="warning">This recipe is Untested. Complete a real cooking trial before it can be approved or shared from this workflow.</p>}
                  {showContentPack && <div className="tutorial-preview"><div className="subsection-head"><div><h3>Editable short-form content pack</h3><p className="muted">Includes five hook options, narration/shot guidance, a caption, hashtags, CTA, source, and review notes. Text only—not a rendered video.</p></div><button className="secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(buildSharePack(current, profile)); setMessage("Content pack copied."); } catch { setMessage("Clipboard unavailable. Use Export pack."); } }}>Copy pack</button></div><pre>{buildSharePack(current, profile)}</pre></div>}
                </section>
                {current.url && <p className="source">Source URL: <a href={current.url} target="_blank" rel="noreferrer">{current.url}</a></p>}
                <div className="editor-grid">
                  <div><label htmlFor="edit-servings">Servings / yield</label><input id="edit-servings" value={current.servings} onChange={(event) => patchCurrent({ servings: event.target.value })} placeholder="e.g. 4 servings" /></div>
                  <div><label htmlFor="edit-notes">Recipe notes</label><textarea id="edit-notes" rows={2} value={current.notes} onChange={(event) => patchCurrent({ notes: event.target.value })} placeholder="Personal notes or details to retain…" /></div>
                  <div><label htmlFor="edit-evidence">Manual source evidence notes</label><textarea id="edit-evidence" rows={3} value={current.sourceEvidence} onChange={(event) => patchCurrent({ sourceEvidence: event.target.value })} placeholder="For each reference, record what you checked. Explicit intake inspection may extract public HTML; source claims are not independently verified and video frames/audio are not analyzed." /></div>
                </div>

                <section className="panel source-research-panel" id="research-desk">
                  <div className="subsection-head"><div><h3>Source research desk</h3><p className="muted">Record manual comparisons and keep inspection records visible. Intake can extract accessible public HTML after an explicit action; this does not verify recipe claims or analyze video frames/audio.</p></div><button className="secondary" type="button" onClick={() => patchCurrent({ sourceReferences: [...current.sourceReferences, { id: makeId(), url: "", kind: "recipe-page", checked: "", notes: "", ingredientFindings: "", methodFindings: "", timingFindings: "", safetyStorageFindings: "" }] })}>＋ Add source</button></div>
                  {current.sourceReferences.length === 0 ? <p className="empty-inline">No structured references yet. Add at least two independent sources when possible.</p> : <>
                    <div className="source-comparison-summary" aria-label="Source comparison coverage">
                      <strong>Structured comparison coverage</strong>
                      <div className="source-coverage-grid">
                        <span>Ingredient quantities <b>{sourceCoverage.ingredient}/{sourceReferences.length}</b></span>
                        <span>Method / order <b>{sourceCoverage.method}/{sourceReferences.length}</b></span>
                        <span>Timing / heat <b>{sourceCoverage.timing}/{sourceReferences.length}</b></span>
                        <span>Safety / storage notes <b>{sourceCoverage.safety}/{sourceReferences.length}</b></span>
                      </div>
                      <p className="hint">Counts show which references have manual comparison notes, not whether claims are correct. Accessible public HTML is extracted only after explicit intake inspection; source claims remain unverified.</p>
                    </div>
                    <div className="source-reference-list">{current.sourceReferences.map((source, index) => (
                    <div className="source-reference" key={source.id}>
                      <div className="source-reference-heading"><strong>Reference {index + 1}</strong><button className="text-button" type="button" onClick={() => patchCurrent({ sourceReferences: current.sourceReferences.filter((item) => item.id !== source.id) })}>Remove</button></div>
                      <div className="editor-grid">
                        <div><label htmlFor={`source-kind-${source.id}`}>Source type</label><select id={`source-kind-${source.id}`} value={source.kind} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, kind: event.target.value as SourceReference["kind"] } : item) })}><option value="recipe-page">Recipe page</option><option value="video">Video / Reel</option><option value="transcript">Transcript</option><option value="other">Other reference</option></select></div>
                        <div><label htmlFor={`source-url-${source.id}`}>Reference URL</label><input id={`source-url-${source.id}`} type="url" inputMode="url" value={source.url} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, url: event.target.value } : item) })} placeholder="https://…" /></div>
                        <div><label htmlFor={`source-checked-${source.id}`}>What did you actually check?</label><textarea id={`source-checked-${source.id}`} rows={2} value={source.checked} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, checked: event.target.value } : item) })} placeholder="Ingredients, quantities, method order, timings, transcript, visible actions…" /></div>
                        <div><label htmlFor={`source-notes-${source.id}`}>Differences, uncertainty, or missing details</label><textarea id={`source-notes-${source.id}`} rows={2} value={source.notes} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, notes: event.target.value } : item) })} placeholder="Conflicting amounts, unclear step, missing timing; write 'none observed' only if checked." /></div>
                        <div><label htmlFor={`source-ingredients-${source.id}`}>Ingredient quantities & differences</label><textarea id={`source-ingredients-${source.id}`} rows={2} value={source.ingredientFindings ?? ""} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, ingredientFindings: event.target.value } : item) })} placeholder="Amounts/units reported by this source; note contradictions against other references." /></div>
                        <div><label htmlFor={`source-method-${source.id}`}>Method / step-order findings</label><textarea id={`source-method-${source.id}`} rows={2} value={source.methodFindings ?? ""} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, methodFindings: event.target.value } : item) })} placeholder="Order of steps, additions, omitted actions, or unclear instructions." /></div>
                        <div><label htmlFor={`source-timing-${source.id}`}>Cooking timing & heat findings</label><textarea id={`source-timing-${source.id}`} rows={2} value={source.timingFindings ?? ""} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, timingFindings: event.target.value } : item) })} placeholder="Cooking times, heat levels, temperatures, doneness cues; record uncertainty." /></div>
                        <div><label htmlFor={`source-safety-${source.id}`}>Food safety & storage notes</label><textarea id={`source-safety-${source.id}`} rows={2} value={source.safetyStorageFindings ?? ""} onChange={(event) => patchCurrent({ sourceReferences: current.sourceReferences.map((item) => item.id === source.id ? { ...item, safetyStorageFindings: event.target.value } : item) })} placeholder="Only record source statements checked; verify safety against an authoritative source separately." /></div>
                      </div>
                    </div>
                  ))}</div>
                  </>}
                  <p className="warning">Public HTML inspection runs only after an explicit intake action. It does not independently verify sources or analyze video frames/audio. Never mark a recipe verified just because a URL was entered.</p>
                </section>

                <div className="subsection-head"><div><h3>Ingredients</h3><p className="muted">Record each ingredient exactly. Amounts are not inferred.</p></div><button className="secondary" type="button" onClick={() => patchCurrent({ ingredients: [...current.ingredients, { id: makeId(), amount: "", unit: "", name: "", prep: "", nutritionCalories: "", nutritionProteinG: "", nutritionCarbsG: "", nutritionFatG: "", nutritionBasis: "", nutritionSourceUrl: "" }] })}>＋ Add ingredient</button></div>
                {current.ingredients.length === 0 ? <p className="empty-inline">No ingredients yet. Add one row per ingredient.</p> : <div className="ingredient-list">{current.ingredients.map((item, index) => (
                  <div className="ingredient-card" key={item.id}>
                    <div className="ingredient-row">
                    <span className="row-number">{index + 1}</span>
                    <input aria-label={`Ingredient ${index + 1} amount`} value={item.amount} onChange={(event) => patchIngredient(item.id, { amount: event.target.value })} placeholder="Amount" />
                    <input aria-label={`Ingredient ${index + 1} unit`} value={item.unit} onChange={(event) => patchIngredient(item.id, { unit: event.target.value })} placeholder="Unit (g, cup, pieces)" />
                    <input aria-label={`Ingredient ${index + 1} name`} value={item.name} onChange={(event) => patchIngredient(item.id, { name: event.target.value })} placeholder="Ingredient name" />
                    <input aria-label={`Ingredient ${index + 1} prep`} value={item.prep} onChange={(event) => patchIngredient(item.id, { prep: event.target.value })} placeholder="Prep (chopped…)" />
                    <button className="icon-button" type="button" aria-label={`Remove ingredient ${index + 1}`} onClick={() => patchCurrent({ ingredients: current.ingredients.filter((x) => x.id !== item.id), steps: current.steps.map((step) => ({ ...step, ingredientIds: (step.ingredientIds ?? []).filter((id) => id !== item.id) })) })}>×</button>
                  </div>
                  <details className="ingredient-nutrition">
                    <summary>Nutrition values & source <span>{item.nutritionCalories?.trim() && item.nutritionSourceUrl?.trim() ? "Values entered" : "Optional · manual entry"}</span></summary>
                    <p className="hint">Enter values for the <strong>exact amount listed above</strong>, not per 100 g unless you scale the values yourself first. Record the matching preparation state and a source you personally checked. The app does not fetch or verify nutrition data.</p>
                    <div className="nutrition-fields">
                      <div><label htmlFor={`nutrition-kcal-${item.id}`}>Calories (kcal) for amount used</label><input id={`nutrition-kcal-${item.id}`} aria-label={`Ingredient ${index + 1} calories for amount used`} type="number" min="0" step="any" inputMode="decimal" value={item.nutritionCalories ?? ""} onChange={(event) => patchIngredient(item.id, { nutritionCalories: event.target.value })} placeholder="e.g. 365" /></div>
                      <div><label htmlFor={`nutrition-protein-${item.id}`}>Protein (g)</label><input id={`nutrition-protein-${item.id}`} type="number" min="0" step="any" inputMode="decimal" value={item.nutritionProteinG ?? ""} onChange={(event) => patchIngredient(item.id, { nutritionProteinG: event.target.value })} placeholder="Optional" /></div>
                      <div><label htmlFor={`nutrition-carbs-${item.id}`}>Carbohydrates (g)</label><input id={`nutrition-carbs-${item.id}`} type="number" min="0" step="any" inputMode="decimal" value={item.nutritionCarbsG ?? ""} onChange={(event) => patchIngredient(item.id, { nutritionCarbsG: event.target.value })} placeholder="Optional" /></div>
                      <div><label htmlFor={`nutrition-fat-${item.id}`}>Fat (g)</label><input id={`nutrition-fat-${item.id}`} type="number" min="0" step="any" inputMode="decimal" value={item.nutritionFatG ?? ""} onChange={(event) => patchIngredient(item.id, { nutritionFatG: event.target.value })} placeholder="Optional" /></div>
                      <div className="nutrition-wide"><label htmlFor={`nutrition-basis-${item.id}`}>Amount/preparation basis <b>*</b></label><input id={`nutrition-basis-${item.id}`} value={item.nutritionBasis ?? ""} onChange={(event) => patchIngredient(item.id, { nutritionBasis: event.target.value })} placeholder="e.g. values for 200 g dry rice before cooking" /></div>
                      <div className="nutrition-wide"><label htmlFor={`nutrition-source-${item.id}`}>Nutrition source URL <b>*</b></label><input id={`nutrition-source-${item.id}`} type="url" value={item.nutritionSourceUrl ?? ""} onChange={(event) => patchIngredient(item.id, { nutritionSourceUrl: event.target.value })} placeholder="https://fdc.nal.usda.gov/..." /></div>
                    </div>
                  </details>
                </div>
                ))}</div>}
                <section className="nutrition-summary" aria-live="polite">
                  <div className="subsection-head"><div><h3>Nutrition estimate</h3><p className="muted">Arithmetic only. Values and references are entered manually and are not independently verified.</p></div><span className={nutrition?.caloriesPerServing !== null && nutrition?.caloriesPerServing !== undefined ? "status" : "status status-warning"}>{nutrition?.caloriesPerServing !== null && nutrition?.caloriesPerServing !== undefined ? "CALCULATED FROM ENTRIES" : "INCOMPLETE"}</span></div>
                  {nutrition?.caloriesPerServing !== null && nutrition?.caloriesPerServing !== undefined ? <div className="nutrition-result"><strong>{Math.round(nutrition.caloriesPerServing)} kcal <small>per serving</small></strong><span>{Math.round(nutrition.totalCalories ?? 0)} kcal total · {current.servings} servings</span><div className="nutrition-macros">{nutrition.proteinGPerServing !== null ? <span>Protein {nutrition.proteinGPerServing.toFixed(1)} g</span> : <span>Protein —</span>}{nutrition.carbsGPerServing !== null ? <span>Carbs {nutrition.carbsGPerServing.toFixed(1)} g</span> : <span>Carbs —</span>}{nutrition.fatGPerServing !== null ? <span>Fat {nutrition.fatGPerServing.toFixed(1)} g</span> : <span>Fat —</span>}</div></div> : <p className="empty-inline">To calculate calories per serving, every ingredient needs calories for the exact listed amount, an amount/preparation basis, a valid source URL, and a simple serving count such as “4” or “4 people”. {nutrition?.totalCalories !== null && nutrition?.totalCalories !== undefined ? "A total can be summed, but the serving count must be one positive number." : `${nutrition?.missingIngredients.length ?? current.ingredients.length} ingredient entry/entries still need complete calories and source information.`}</p>}
                  <p className="hint">Suggested reference: <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer">USDA FoodData Central</a>. Confirm whether the reference describes the raw, cooked, drained, or otherwise prepared form. The app does not convert cups/pieces to grams.</p>
                </section>

                <div className="subsection-head step-head"><div><h3>Cooking steps</h3><p className="muted">Keep the sequence intact. Add timing and cues only when known.</p></div><button className="secondary" type="button" onClick={() => patchCurrent({ steps: [...current.steps, { id: makeId(), action: "", duration: "", heat: "", cue: "", ingredientIds: [] }] })}>＋ Add step</button></div>
                {current.steps.length === 0 ? <p className="empty-inline">No method steps yet. Add steps in the exact order they happen.</p> : <div className="step-list">{current.steps.map((step, index) => (
                  <div className="recipe-step" key={step.id}>
                    <div className="recipe-step-top"><span className="row-number">STEP {index + 1}</span><div className="step-controls"><button className="text-button" type="button" disabled={index === 0} onClick={() => moveStep(step.id, -1)} aria-label={`Move step ${index + 1} up`}>↑ Move up</button><button className="text-button" type="button" disabled={index === current.steps.length - 1} onClick={() => moveStep(step.id, 1)} aria-label={`Move step ${index + 1} down`}>↓ Move down</button><button className="text-button" type="button" onClick={() => patchCurrent({ steps: current.steps.filter((x) => x.id !== step.id) })}>Remove</button></div></div>
                    <label htmlFor={`action-${step.id}`}>Action / instruction</label><textarea id={`action-${step.id}`} rows={2} value={step.action} onChange={(event) => patchStep(step.id, { action: event.target.value })} placeholder="What exactly happens in this step?" />
                    <div className="step-fields">
                      <div><label htmlFor={`duration-${step.id}`}>Timing</label><input id={`duration-${step.id}`} value={step.duration} onChange={(event) => patchStep(step.id, { duration: event.target.value })} placeholder="e.g. 5 minutes" /></div>
                      <div><label htmlFor={`heat-${step.id}`}>Heat / setting</label><input id={`heat-${step.id}`} value={step.heat} onChange={(event) => patchStep(step.id, { heat: event.target.value })} placeholder="e.g. medium heat" /></div>
                      <div className="cue-field"><label htmlFor={`cue-${step.id}`}>Visual / doneness cue</label><input id={`cue-${step.id}`} value={step.cue} onChange={(event) => patchStep(step.id, { cue: event.target.value })} placeholder="What should the cook observe?" /></div>
                    </div>
                    <fieldset className="step-ingredient-map">
                      <legend>Ingredients added during this step</legend>
                      {current.ingredients.length ? <div className="step-ingredient-options">{current.ingredients.map((ingredient, ingredientIndex) => {
                        const ingredientLabel = [ingredient.amount, ingredient.unit, ingredient.name].filter(Boolean).join(" ").trim() || `Ingredient ${ingredientIndex + 1}`;
                        return <label key={ingredient.id}><input type="checkbox" aria-label={`Add ${ingredient.name.trim() || `ingredient ${ingredientIndex + 1}`} at step ${index + 1}`} checked={(step.ingredientIds ?? []).includes(ingredient.id)} onChange={(event) => patchStep(step.id, { ingredientIds: event.target.checked ? [...new Set([...(step.ingredientIds ?? []), ingredient.id])] : (step.ingredientIds ?? []).filter((id) => id !== ingredient.id) })} /><span>{ingredientLabel}</span></label>;
                      })}</div> : <p className="hint">Add ingredients first, then return here to assign additions.</p>}
                      <p className="hint">Only selected ingredients will be named as additions in the narration. Nothing is assigned automatically.</p>
                    </fieldset>
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

                <div className="action-row"><button className="primary action-primary" type="button" onClick={() => setShowTutorial((show) => !show)}>{showTutorial ? "Hide tutorial draft" : "Generate tutorial draft"}</button><button className="secondary" type="button" onClick={() => setShowNarration((show) => !show)}>{showNarration ? "Hide narration script" : "Generate narration script"}</button><button className="secondary" type="button" onClick={exportNarration}>Export narration</button><button className="secondary" type="button" onClick={() => exportProject("markdown")}>Export Markdown</button><button className="secondary" type="button" onClick={() => exportProject("json")}>Export JSON</button><button className="danger" type="button" onClick={deleteCurrent}>Delete this draft</button></div>
                {showTutorial && <div className="tutorial-preview"><div className="subsection-head"><div><h3>Generated tutorial draft</h3><p className="muted">Deterministic outline using only your saved inputs. Not fact-checked, not published.</p></div><button className="secondary" type="button" onClick={() => { void copyTutorial(); }}>Copy text</button></div><pre>{tutorial}</pre></div>}
                {showNarration && <div className="tutorial-preview narration-preview"><div className="subsection-head"><div><h3>Generated narration script</h3><p className="muted">Uses saved ingredient and step order. Missing details are flagged rather than invented.</p></div><button className="secondary" type="button" onClick={() => { void copyNarration(); }}>Copy narration</button></div><pre>{narration}</pre></div>}
                <p className="hint">Drafts are stored in this browser on this device only. There is no owner login, cloud backup, or multi-device sync yet. Export important work regularly.</p>
              </div>
            )}
          </section>

          {projects.length > 0 && <section className="recent" id="recent-projects"><div className="section-head"><div><p className="eyebrow">YOUR WORK</p><h2>Recent drafts</h2></div><div className="backup-actions"><button className="secondary" type="button" onClick={exportWorkspaceBackup}>Export all drafts</button><button className="text-button" type="button" onClick={clearAllDrafts}>Clear all local drafts</button></div></div><div className="recent-list">{projects.map((project) => <button key={project.id} className={project.id === active ? "recent-item selected" : "recent-item"} onClick={() => { setActive(project.id); setShowTutorial(false); }}><span>✦</span><strong>{project.name}</strong><small>{project.trialStatus === "tested" ? "Tested" : "Untested"} · {project.approved ? "Approved" : "Draft"}</small> →</button>)}</div></section>}

          <footer>COOKING CREATOR STUDIO · V1 FOUNDATION <span>US audience-first creator workflow · Publishing planned for V6</span></footer>
        </div>
      </section>

      <div className="command-dock" role="region" aria-label="Workspace command">
        <button className="command-add" type="button" aria-label="Start a new recipe" onClick={() => openTool("intake")}>＋</button>
        <form className="command-form" onSubmit={submitWorkspaceCommand}>
          <label className="sr-only" htmlFor="workspace-command">Workspace command</label>
          <input id="workspace-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Message Cooking Creator… paste links or ask for a plan" />
          <button type="submit" className="command-submit" aria-label="Run workspace command">✦</button>
        </form>
      </div>
      <nav className="quick-dock" aria-label="Quick actions">
        <button type="button" onClick={() => goToSection("plan")}><span aria-hidden="true">▣</span><small>Today&apos;s Plan</small></button>
        <button type="button" onClick={() => goToSection("research")}><span aria-hidden="true">⌕</span><small>Research Studio</small></button>
        <button type="button" onClick={() => goToSection("studio")}><span aria-hidden="true">◉</span><small>Plan Content</small></button>
        <button type="button" onClick={() => goToSection("publish")}><span aria-hidden="true">➤</span><small>Publish</small></button>
      </nav>
    </main>
  );
}
