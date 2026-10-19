import {
  buildNarrationScript,
  calculateRecipeNutrition,
  DEFAULT_CREATOR_PROFILE,
  type CreatorProfile,
  type RecipeProject,
} from "./recipe";

/**
 * Build a locally generated, editable creator pack. This function does not call an AI
 * provider, inspect third-party media, verify claims, or publish content.
 */
export function buildCreatorContentPack(project: RecipeProject, profile: CreatorProfile): string {
  const recipeName = project.name.trim() || "Untitled recipe";
  const tone = profile.tone.trim() || DEFAULT_CREATOR_PROFILE.tone;
  const language = profile.language.trim() || "English";
  const units = profile.units.trim() || "US customary";
  const sources = project.sourceReferences.length
    ? project.sourceReferences.map((source, index) => [
      `${index + 1}. ${source.url.trim() || "No URL recorded"}`,
      `   Checked: ${source.checked.trim() || "Not recorded"}`,
      `   Notes: ${source.notes.trim() || "No differences or uncertainties recorded"}`,
      source.ingredientFindings?.trim() ? `   Ingredient findings: ${source.ingredientFindings.trim()}` : "",
      source.methodFindings?.trim() ? `   Method findings: ${source.methodFindings.trim()}` : "",
      source.timingFindings?.trim() ? `   Timing/heat findings: ${source.timingFindings.trim()}` : "",
      source.safetyStorageFindings?.trim() ? `   Safety/storage findings: ${source.safetyStorageFindings.trim()}` : "",
    ].filter(Boolean).join("\n")).join("\n")
    : "No structured source references recorded.";
  const ingredientList = project.ingredients.length
    ? project.ingredients.map((item, index) => `${index + 1}. ${[item.amount.trim(), item.unit.trim(), item.name.trim(), item.prep.trim() ? `(${item.prep.trim()})` : ""].filter(Boolean).join(" ")}`).join("\n")
    : "No ingredients recorded yet.";
  const stepList = project.steps.length
    ? project.steps.map((step, index) => `${index + 1}. ${step.action.trim() || "[Action not recorded]"}${step.duration.trim() ? ` — recorded time: ${step.duration.trim()}` : ""}${step.heat.trim() ? ` — recorded heat: ${step.heat.trim()}` : ""}${step.cue.trim() ? ` — cue: ${step.cue.trim()}` : ""}`).join("\n")
    : "No cooking steps recorded yet.";
  const nutrition = calculateRecipeNutrition(project);
  const nutritionText = nutrition.caloriesPerServing === null
    ? "Not included: complete, source-linked values for the exact ingredient amounts and a clear serving count are required."
    : `Manual-entry estimate: ${Math.round(nutrition.caloriesPerServing)} kcal per serving. Values and sources were entered by the creator and are not independently verified.`;
  const hooks = [
    `Here's how to make ${recipeName}, step by step.`,
    `Let's make ${recipeName} with the recorded ingredients and method.`,
    `Save this ${recipeName} recipe to try later.`,
    `From the ingredient list to the finished plate: ${recipeName}.`,
    `Cooking ${recipeName}? Follow along and check each step.`,
  ];
  const longFormOutline = [
    "1. Opening: show the actual finished dish and introduce the recipe without unsupported health or performance claims.",
    `2. Ingredient overview: show the recorded quantities below; call out missing or uncertain amounts instead of guessing.`,
    "3. Preparation: demonstrate only preparation actions that are recorded and actually performed.",
    "4. Cooking method: follow the recorded step order, timing, heat and visual cues; state when a detail is unknown.",
    "5. Finish and serving: show the actual result and any real substitutions made during the cooking trial.",
    "6. Tasting and close: describe the creator's genuine experience; invite viewers to save the recipe or share a question.",
  ];
  const hashtags = ["#Cooking", "#HomeCooking", "#RecipeIdeas", "#EasyRecipes"];
  const sourceUrl = project.url.trim() || "No primary source URL recorded.";
  const trialStatus = project.trialStatus === "tested"
    ? "Marked tested by the creator; this is not independent certification."
    : "UNTESTED — complete a real cooking trial before treating this as a tested recipe.";
  const approvalStatus = project.approved ? "Creator-approved" : "Not approved by the creator";
  const nutritionSourceLinks = project.ingredients
    .map((item) => item.nutritionSourceUrl?.trim())
    .filter((url): url is string => Boolean(url));

  return [
    `COOKING CREATOR — US-FIRST CONTENT PACK`,
    `RECIPE: ${recipeName}`,
    `STATUS: ${trialStatus}`,
    `APPROVAL: ${approvalStatus}`,
    `AUDIENCE / DEFAULTS: US-first; units preference: ${units}; language: ${language}.`,
    "All text is an editable starting point, not a performance prediction. No content is posted automatically.",
    "",
    "TITLE OPTIONS",
    `1. How to Make ${recipeName}: Step-by-Step`,
    `2. ${recipeName} — Ingredients, Method and Cooking Tips`,
    `3. Let's Cook ${recipeName}: A Home-Kitchen Walkthrough`,
    "",
    "SHORT-FORM HOOK OPTIONS",
    ...hooks.map((hook, index) => `${index + 1}. ${hook}`),
    "",
    "SHORT-FORM VOICEOVER / SHOT PLAN",
    buildNarrationScript(project),
    "",
    "LONG-FORM VIDEO OUTLINE",
    ...longFormOutline,
    "",
    "INGREDIENT CARD — USE THE RECORDED VALUES",
    ingredientList,
    `Yield / servings: ${project.servings.trim() || "Not recorded"}`,
    "",
    "COOKING STEPS — RECORDED DETAILS ONLY",
    stepList,
    "",
    "CAPTION DRAFT",
    `${tone}: Let's make ${recipeName}. Follow the recorded ingredients and steps, and save this recipe for later. Check the full method and any notes before cooking.`,
    "",
    "DESCRIPTION DRAFT",
    `A step-by-step home-cooking walkthrough for ${recipeName}. Ingredient quantities, timing and heat details are included only when recorded in this draft. Please review the full recipe and any uncertainty notes before cooking.`,
    "",
    "CALL TO ACTION",
    "Save this recipe for later and tell me what you'd like clarified or adapted.",
    "",
    "HASHTAG STARTERS",
    hashtags.join(" "),
    "",
    "THUMBNAIL STORYBOARD",
    `Frame: use a real photo or authorized footage of the finished ${recipeName}; do not imply an unmade result.`,
    "Composition: finished dish in clear focus, uncluttered background, readable short title, strong contrast and safe margins for mobile cropping.",
    "Optional supporting frame: a real ingredient/preparation image from this cooking session. Avoid fabricated before/after or health-result imagery.",
    "",
    "ALT-TEXT DRAFT",
    `A creator-prepared image of ${recipeName}. Replace this placeholder with a factual description of the actual visible dish, ingredients and presentation before publishing.`,
    "",
    "NUTRITION NOTE",
    nutritionText,
    ...(nutritionSourceLinks.length ? ["Nutrition source URLs recorded:", ...[...new Set(nutritionSourceLinks)]] : []),
    "",
    "SOURCE AND EVIDENCE NOTES",
    `Primary source: ${sourceUrl}`,
    "The following notes reflect what the creator recorded checking. They do not prove that a source independently verifies every recipe claim.",
    sources,
    "Owner review required for quantities, substitutions, method order, timing, heat, allergens, food safety and any nutrition or health-related statement.",
    "",
    "RIGHTS / DISCLOSURE CHECKLIST — REVIEW BEFORE EACH POST",
    "- Confirm the recipe narration and captions are original and do not copy another creator's wording.",
    "- Confirm permission or applicable rights for every third-party photo, clip, voice, illustration and music track.",
    "- If a post is sponsored, gifted, or uses affiliate links, add a clear and conspicuous disclosure that fits the actual relationship; verify current FTC and platform rules.",
    "- If synthetic or materially altered media is used, check the platform's current disclosure requirements and label it where required.",
    "- Remove unsupported health, nutrition, safety, “best,” trending, reach or income claims; keep estimates and creator opinions clearly identified.",
    "- Confirm the recipe has been cooked and tested by the creator before describing it as tested.",
    "- Review platform-specific formatting and current policies before manual sharing.",
    "",
    "REVIEW NOTES",
    project.trialNotes.trim() || "No cooking-trial notes recorded.",
    "",
    "IMPORTANT LIMITATIONS",
    "This pack is generated locally from the saved draft and profile. It does not fetch current trends, verify sources, create or edit media, secure third-party rights, provide legal advice, guarantee reach/income, upload files, schedule posts, or publish to a platform.",
  ].join("\n");
}
