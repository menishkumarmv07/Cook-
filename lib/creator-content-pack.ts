import {
  normalizeSourceUrlForComparison,
  type CreatorProfile,
  type RecipeProject,
} from "@/lib/recipe";
import { isHttpSourceUrl } from "@/lib/research-evidence";

const MAX_LIST_ITEMS = 100;
const MAX_FIELD_CHARS = 4_000;

function clean(value: string, maxChars = 240): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function longText(value: string, fallback: string): string {
  const normalized = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_FIELD_CHARS);
  return normalized || fallback;
}

function sourceLabel(url: string): string {
  const raw = url.trim();
  if (!raw) return "[source URL not recorded]";
  if (raw.length > 2_000) {
    return "[source URL exceeds 2,000 characters — review it before export]";
  }
  if (/[\u0000-\u001F\u007F]/.test(raw)) {
    return "[source URL contains control characters — correct it before relying on this source]";
  }
  try {
    const parsed = new URL(raw);
    if (parsed.username || parsed.password) {
      return "[source URL contains embedded credentials — remove them before export]";
    }
    if (!isHttpSourceUrl(raw) || !/^https?:\/\//i.test(raw)) {
      return "[invalid source URL — correct it before relying on this source]";
    }
    return parsed.toString();
  } catch {
    return "[invalid source URL — correct it before relying on this source]";
  }
}

function ingredientLine(
  ingredient: RecipeProject["ingredients"][number],
  index: number,
): string {
  const name = clean(ingredient.name, 160) || `[ingredient ${index + 1} name missing]`;
  const amount = clean(ingredient.amount, 80) || "[amount not recorded]";
  const unit = clean(ingredient.unit, 80) || "[unit not recorded]";
  const prep = clean(ingredient.prep, 200);
  return `${index + 1}. ${amount} ${unit} — ${name}${prep ? `; preparation: ${prep}` : ""}`;
}

function stepLine(
  step: RecipeProject["steps"][number],
  index: number,
): string {
  const action = clean(step.action, 800) || "[action not recorded — owner review required]";
  const duration = clean(step.duration, 120) || "timing not recorded";
  const heat = clean(step.heat, 120);
  const cue = clean(step.cue, 240);
  return `${index + 1}. ${action} (recorded timing: ${duration})${heat ? `; recorded heat: ${heat}` : "; heat not recorded"}${cue ? `; recorded visual cue: ${cue}` : "; visual/doneness cue not recorded"}`;
}

function buildSourceClaimLedger(project: RecipeProject): string[] {
  const missing = "[No recorded finding — owner review required]";
  const rows = project.sourceReferences.flatMap((source, index) => [
    \`#### Source \${index + 1}: \${sourceLabel(source.url)}\`,
    \`- Owner-entered check note: \${clean(source.checked, 240) || "Not recorded — owner review required"}\`,
    \`- Ingredient / quantity notes: \${clean(source.ingredientFindings ?? "", 800) || missing}\`,
    \`- Method / step-order notes: \${clean(source.methodFindings ?? "", 800) || missing}\`,
    \`- Timing / heat notes: \${clean(source.timingFindings ?? "", 800) || missing}\`,
    \`- Food-safety / storage notes: \${clean(source.safetyStorageFindings ?? "", 800) || missing}\`,
    \`- Disagreement / uncertainty notes: \${clean(source.notes, 800) || "No notes recorded — check for conflicts before sharing"}\`,
    "- Review status: OWNER REVIEW REQUIRED. Recorded or extracted notes are not independent verification.",
    "",
  ]);

  return [
    "### Evidence-linked factual-claim ledger",
    "**Trust rule:** The notes below are attributed to the listed source record but are not independently verified by this app. Do not publish a material cooking, timing, nutrition, allergen, safety or health claim as established fact unless the owner has checked the source and resolved disagreements.",
    ...(rows.length
      ? rows
      : [
          "[No structured source records exist. Material ingredient, method, timing, nutrition and food-safety claims remain OWNER REVIEW REQUIRED.]",
          "",
        ]),
    \`**Additional owner-entered source evidence:** \${clean(project.sourceEvidence, 1_200) || "None recorded — source-linked claim review is still required."}\`,
    "",
  ];
}

function buildNutritionClaimLedger(
  ingredients: RecipeProject["ingredients"],
): string[] {
  const format = (value: string | undefined, unit: string) => {
    const recorded = clean(value ?? "", 80);
    return recorded ? \`\${recorded} \${unit}\` : "[not recorded]";
  };

  return [
    "### Nutrition traceability — manual values only",
    "Nutrition entries below apply to each ingredient's recorded amount, not automatically to 100 g or another serving basis. The app does not fetch or verify nutrition sources and performs no implicit unit conversion. Treat every entered value and source match as an estimate requiring owner review.",
    ...(ingredients.length
      ? ingredients.map((ingredient, index) => {
          const hasValue = [
            ingredient.nutritionCalories,
            ingredient.nutritionProteinG,
            ingredient.nutritionCarbsG,
            ingredient.nutritionFatG,
          ].some((value) => Boolean(value?.trim()));
          return [
            \`\${index + 1}. \${clean(ingredient.name, 160) || "[ingredient name missing]"} — recorded amount: \${clean(ingredient.amount, 80) || "[amount missing]"} \${clean(ingredient.unit, 80) || "[unit missing]"}\`,
            \`   Calories: \${format(ingredient.nutritionCalories, "kcal")}; protein: \${format(ingredient.nutritionProteinG, "g")}; carbohydrates: \${format(ingredient.nutritionCarbsG, "g")}; fat: \${format(ingredient.nutritionFatG, "g")}.\`,
            \`   Recorded nutrition basis: \${clean(ingredient.nutritionBasis ?? "", 240) || "[not recorded — owner review required]"}\`,
            \`   Nutrition source: \${sourceLabel(ingredient.nutritionSourceUrl ?? "")}\`,
            \`   Status: \${hasValue ? "MANUAL VALUE — source and quantity match are not independently verified; owner review required." : "NO NUTRITION VALUE RECORDED — do not state a nutrition result for this ingredient."}\`,
          ].join("\\n");
        })
      : ["[No ingredients recorded. Nutrition claims are not supported.]"]),
    ...(ingredients.length === 0
      ? []
      : [
          "",
          "Do not state calorie or nutrient totals unless every included ingredient has a matching sourced value for its exact entered quantity, all units and preparation states have been checked, and the serving count is valid. Clearly label any computed result as an estimate.",
        ]),
    "",
  ];
}

/**
 * Adds a richer US-first production appendix to the existing local content pack.
 * This generator is deterministic: it does not call an AI, infer missing recipe facts,
 * estimate earnings, or mark content as independently verified.
 */
export function buildUSCreatorPackAppendix(
  project: RecipeProject,
  profile: CreatorProfile,
): string {
  const recipeName = clean(project.name, 180) || "Untitled recipe";
  const servings = clean(project.servings, 60) || "not recorded";
  const ingredients = project.ingredients.slice(0, MAX_LIST_ITEMS);
  const steps = project.steps.slice(0, MAX_LIST_ITEMS);
  const seenSourceKeys = new Set<string>();
  const sources = [
    project.url,
    ...project.sourceReferences.map((source) => source.url),
  ]
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url) => {
      let key = `raw:${url}`;
      if (isHttpSourceUrl(url) && /^https?:\/\//i.test(url)) {
        try {
          const parsed = new URL(url);
          if (!parsed.username && !parsed.password) {
            key = normalizeSourceUrlForComparison(parsed.toString());
          }
        } catch {
          // Keep malformed values separately so that each is visibly rejected below.
        }
      }
      if (seenSourceKeys.has(key)) return false;
      seenSourceKeys.add(key);
      return true;
    });
  const validSources = sources.map(sourceLabel);
  const firstIngredient = ingredients.find((item) => clean(item.name, 160));
  const firstStep = steps.find((item) => clean(item.action, 800));
  const tested = project.trialStatus === "tested";
  const approved = tested && project.approved;
  const unitPreference = clean(profile.units, 80) || "US customary";
  const platforms = clean(profile.platforms, 180) || "YouTube Shorts and Instagram Reels";
  const language = clean(profile.language, 80) || "English";
  const tone = clean(profile.tone, 160) || "Warm, clear, confident, and practical";

  const titles = [
    `${recipeName}: a step-by-step cooking guide`,
    `How to make ${recipeName} | ingredients and method`,
    `${recipeName}: follow the recorded recipe from prep to finish`,
  ];
  const hooks = [
    `Today, I’m preparing ${recipeName}. Here are the ingredients and the recorded steps.`,
    firstIngredient
      ? `Start with ${clean(firstIngredient.name, 160)}: see how it fits into this ${recipeName} recipe.`
      : `Before making ${recipeName}, check the ingredients and quantities listed below.`,
    firstStep
      ? `The first recorded step for ${recipeName} is: ${clean(firstStep.action, 220)}.`
      : `The method for ${recipeName} needs owner review before recording.`,
  ];

  const missingChecks: string[] = [];
  if (!project.name.trim()) missingChecks.push("Add a clear recipe title.");
  if (!project.servings.trim()) missingChecks.push("Record the serving yield.");
  if (!ingredients.length) missingChecks.push("Add and verify the ingredient list.");
  if (!steps.length) missingChecks.push("Add and verify the ordered cooking steps.");
  if (ingredients.some((item) => !item.name.trim() || !item.amount.trim() || !item.unit.trim())) {
    missingChecks.push("Some ingredients have a missing name, amount, or unit; confirm them rather than guessing.");
  }
  if (steps.some((item) => !item.action.trim() || !item.duration.trim())) {
    missingChecks.push("Some steps have a missing action or timing; confirm these before filming.");
  }
  if (!sources.length) missingChecks.push("Add the source URL(s) and review source rights/attribution.");
  if (!tested) missingChecks.push("The recipe is not marked as tested by the owner. Do not describe it as personally tested.");
  if (!approved) missingChecks.push("Owner approval is not complete. Review the finished recipe and content pack before sharing.");

  const lines = [
    "## US-first creator production appendix",
    "",
    "**Generation mode:** Deterministic editable draft; no AI service was called.",
    "**Target audience:** United States by default. Recipes may come from any region.",
    `**Default creator units:** ${unitPreference}. Confirm the displayed units match every entered quantity.`,
    `**Suggested platforms:** ${platforms}.`,
    `**Language:** ${language}. **Voice direction:** ${tone}.`,
    "**Status:** Draft only. This appendix does not publish, schedule, verify claims, or guarantee reach or income.",
    "",
    "### Title options — edit for the final video",
    ...titles.map((title, index) => `${index + 1}. ${title}`),
    "",
    "### Opening hooks — select one and add your own tested, original detail",
    ...hooks.map((hook, index) => \`\${index + 1}. \${hook}\`),
    "",
    "### Originality and differentiation worksheet — owner input required",
    "- Intended US viewer and cooking occasion: [Owner to define; do not assume audience demographics].",
    "- What is materially different about this version: [Owner to add a true, specific difference; superficial rewording is not enough].",
    "- Original creator contribution: [Owner to add a real test result, technique, explanation or cultural context; do not invent experience].",
    "",
    "### Short-form edit outline",
    "1. **Opening:** Show the finished dish only if you have filmed or selected the real final result; introduce the recipe in your own voice.",
    "2. **Ingredients:** Show the owner-reviewed ingredient card with quantities and units. Do not fill gaps with guesses.",
    "3. **Method:** Use the ordered steps below. Keep important timing, heat, and visual cues on screen only when those details have been confirmed.",
    "4. **Result:** Show the actual cooked result. Do not claim taste, texture, cooking success, or personal testing unless it is true.",
    "5. **Close:** Invite viewers to save the recipe or ask a genuine question. Avoid engagement bait and outcome promises.",
    "",
    "### Long-form video structure",
    "1. Explain what the dish is and what the viewer will learn; avoid unsupported health or performance claims.",
    "2. Introduce the ingredients and serving yield, flagging quantities that still need confirmation.",
    "3. Demonstrate each confirmed step in order, showing meaningful visual cues rather than repeating a generic template.",
    "4. Explain any substitutions only when they have been researched and tested; disclose what remains uncertain.",
    "5. Show the actual result, summarize practical lessons from the owner’s real cooking trial, and invite respectful comments.",
    "",
    "### Platform-specific finishing pass — adapt each version, do not copy blindly",
    "- **YouTube Shorts:** Choose one clear cooking promise, get to the first meaningful action quickly, keep step captions readable, and use the actual filmed result. Add only claims supported by the ledger below.",
    "- **Instagram Reels:** Make the opening frame understandable with sound off, adapt the caption to the clip, use only relevant hashtags and confirm audio/asset rights and any required partnership disclosures.",
    "- **YouTube long-form:** Build a fuller explanation around the confirmed ingredients and steps. Add chapter timestamps only after the final edit; never invent timestamps or claim a technique was tested if it was not.",
    "",
    "### Step-by-step voiceover draft — owner must review before recording",
    ...(steps.length
      ? steps.map((step, index) => {
          const action = clean(step.action, 800) || "[Action missing — owner review required]";
          const timing = clean(step.duration, 120);
          return \`\${index + 1}. \${action}\${timing ? \` (recorded timing: \${timing})\` : " (timing not recorded — do not guess)"}\`;
        })
      : ["[No steps recorded. Write and verify the narration after adding the method.]"]),
    "",
    "### Ingredient card — owner review required",
    `**Recipe:** ${recipeName}`,
    `**Yield:** ${servings} serving(s) as entered; confirm before publication.`,
    ...(ingredients.length ? ingredients.map(ingredientLine) : ["[No ingredients recorded.]"]),
    ...(project.ingredients.length > MAX_LIST_ITEMS ? [`[Only the first ${MAX_LIST_ITEMS} ingredient rows are shown in this export. Review the full recipe in the app.]`] : []),
    "",
    "### Ordered method — owner review required",
    ...(steps.length ? steps.map(stepLine) : ["[No cooking steps recorded.]"]),
    ...(project.steps.length > MAX_LIST_ITEMS ? [\`[Only the first \${MAX_LIST_ITEMS} cooking steps are shown in this export. Review the full recipe in the app.]\`] : []),
    "",
    ...buildSourceClaimLedger(project),
    ...buildNutritionClaimLedger(ingredients),
    "### YouTube description draft",
    `${recipeName} — a step-by-step recipe guide.`,
    "",
    `Servings: ${servings}. Ingredient quantities, timing, heat and serving yield must be checked against the final recipe before publication.`,
    "",
    `Creator notes: ${longText(project.trialNotes, "No owner cooking-trial notes recorded.")}`,
    "",
    "Source references (verify accuracy, permissions, and attribution before sharing):",
    ...(validSources.length ? validSources.map((source, index) => `${index + 1}. ${source}`) : ["[No source URLs recorded.]"]),
    "",
    "### Accessibility",
    "**Alt-text template:** “Recipe video about ${recipeName}. Replace this template with an accurate description of the actual thumbnail, including visible ingredients, tools, action, and on-screen text. Do not describe elements that are not shown.”",
    "**On-screen text review:** Use readable contrast and safe margins; keep essential instructions understandable without audio.",
    "",
    "### Thumbnail storyboard — concepts only, not generated images",
    `1. **Recipe identity:** Show a real image of ${recipeName}; add a short, accurate title.`,
    `2. **Process detail:** Show a real close-up of ${firstIngredient ? clean(firstIngredient.name, 160) : "a confirmed ingredient"} or a recorded cooking step that appears in the final video.`,
    "3. **Final result:** Use the actual plated result. Avoid fake before/after comparisons, misleading serving sizes, or unverified benefit claims.",
    "",
    "### Rights, advertising and platform checklist",
    "- Confirm the footage, photos, music, graphics and recipe text are original, licensed, or otherwise permitted for the intended use. Link to sources; do not copy another creator’s script or full presentation.",
    "- If a brand, affiliate link, free product, discount, payment, employment, family or other material connection exists, add a clear disclosure that viewers can notice near the endorsement; use the relevant platform disclosure tool as required.",
    "- Review the current platform rules for realistic altered/synthetic content and apply the required disclosure when relevant. AI assistance alone does not automatically answer every disclosure question.",
    "- Check the current platform monetization and advertiser-friendly rules before publishing. Repetitive, mass-produced or minimally transformed content may be ineligible for monetization.",
    "- Check all recipe, safety, nutrition and health statements against sources. Remove unsupported claims; label estimates and assumptions plainly.",
    "- Check whether the recipe was actually tested and approved. Do not use “tested,” “approved,” “safe,” or health-outcome language unless supported.",
    "- Review captions, hashtags, subtitles, accessibility, source attribution and music rights manually before sharing.",
    "",
    "### Draft caption",
    \`\${recipeName}: follow the ingredient list and method, and check the notes before cooking. Save this recipe for later.\`,
    "",
    "### Pinned-comment idea — personalize before use",
    \`"Have you tried \${recipeName}? Share what you learned. Check the ingredient and method notes above before cooking."\`,
    "Do not present this as a real viewer question, testimonial or endorsement.",
    "",
    "### Hashtag starting points — select only relevant tags",
    "#Cooking #RecipeIdeas #HomeCooking",
    "",
    "### Owner sign-off",
    `- Cooking trial recorded by owner: ${tested ? "marked tested — confirm the notes reflect a real trial" : "NO — not marked tested"}`,
    `- Content approved by owner: ${approved ? "marked approved — verify it remains current" : "NO — approval still required"}`,
    `- Unresolved review notes: ${longText(project.notes, "None recorded; inspect all recipe fields before sharing.")}`,
    ...(missingChecks.length ? ["", "### Items to resolve before publication", ...missingChecks.map((item) => `- ${item}`)] : []),
    "",
    "### USD-oriented business tracking — manual, evidence-only",
    "- Record actual post URL, publication date, platform, views, watch time/retention if supplied by the platform, saves, shares, comments, clicks, revenue and costs separately.",
    "- Record currency and reporting period. Convert currencies only with a dated, documented rate; do not invent missing values.",
    "- Keep estimates clearly separate from platform-reported results. This content generator does not forecast earnings, predict virality or confirm monetization eligibility.",
    "- Check current payment and age eligibility with the relevant platform. Do not bypass identity, age, tax, guardian, or payment requirements.",
    "",
    "### Source links for creator-policy review",
    "- YouTube channel monetization policies: https://support.google.com/youtube/answer/1311392",
    "- YouTube altered or synthetic content disclosure: https://support.google.com/youtube/answer/15447836",
    "- FTC social-media influencer disclosures: https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers",
    "- YouTube payment age eligibility: https://support.google.com/youtube/answer/2533300",
  ];

  return lines.join("\n");
}
