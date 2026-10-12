export type StructuredRecipeExtraction = {
  name: string;
  description: string;
  author: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  ingredients: string[];
  instructions: string[];
};

export type RecipePageExtraction = {
  title: string;
  description: string;
  siteName: string;
  textExcerpt: string;
  structuredRecipe: StructuredRecipeExtraction | null;
};

const MAX_HTML_CHARACTERS = 1_000_000;
const MAX_EXCERPT_CHARACTERS = 8_000;
const MAX_RECIPE_ITEMS = 100;
const MAX_ITEM_CHARACTERS = 600;

const ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", hellip: "…",
  copy: "©", reg: "®", trade: "™", eacute: "é", Eacute: "É", rsquor: "’",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const point = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    if (entity.startsWith("#")) {
      const point = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

function cleanText(value: string, maxLength = MAX_ITEM_CHARACTERS): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getAttribute(tag: string, attributeName: string): string {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function readMeta(html: string, keyName: string, keyValue: string): string {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (getAttribute(tag, keyName).toLowerCase() === keyValue.toLowerCase()) {
      const value = getAttribute(tag, "content");
      if (value) return cleanText(value, 1_000);
    }
  }
  return "";
}

function scalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return cleanText(String(value), 500);
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(", ").slice(0, 500);
  if (typeof value === "object" && value !== null && "name" in value) return scalar((value as { name?: unknown }).name);
  return "";
}

function collectInstructions(value: unknown, output: string[] = [], depth = 0): string[] {
  if (output.length >= MAX_RECIPE_ITEMS || depth > 8 || value == null) return output;
  if (typeof value === "string") {
    const item = cleanText(value);
    if (item) output.push(item);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectInstructions(item, output, depth + 1);
    return output;
  }
  if (typeof value !== "object") return output;
  const record = value as Record<string, unknown>;
  // Recipe schemas commonly put the actual wording in text, including HowToStep objects.
  const text = scalar(record.text);
  if (text) {
    output.push(text);
    return output;
  }
  if (record.itemListElement !== undefined) collectInstructions(record.itemListElement, output, depth + 1);
  else if (record.steps !== undefined) collectInstructions(record.steps, output, depth + 1);
  return output;
}

function findRecipeObjects(value: unknown, output: Record<string, unknown>[], seen: Set<object>, depth = 0): void {
  if (output.length >= 30 || depth > 10 || value == null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) findRecipeObjects(item, output, seen, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => typeof item === "string" && item.toLowerCase() === "recipe")) output.push(record);
  for (const [key, child] of Object.entries(record)) {
    if (key === "image" || key === "thumbnailUrl") continue;
    findRecipeObjects(child, output, seen, depth + 1);
  }
}

function readStructuredRecipe(html: string): StructuredRecipeExtraction | null {
  const scripts = [...html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const candidates: Record<string, unknown>[] = [];
  for (const script of scripts.slice(0, 20)) {
    const source = script[1].trim();
    if (!source || source.length > 200_000) continue;
    try {
      findRecipeObjects(JSON.parse(source) as unknown, candidates, new Set<object>());
    } catch {
      // Invalid JSON-LD is common on third-party recipe pages; keep looking and do not infer fields.
    }
  }
  const candidate = candidates.find((item) => scalar(item.name) || Array.isArray(item.recipeIngredient) || item.recipeInstructions);
  if (!candidate) return null;

  const ingredients = Array.isArray(candidate.recipeIngredient)
    ? candidate.recipeIngredient.slice(0, MAX_RECIPE_ITEMS).map(scalar).filter(Boolean)
    : [];
  const instructions = collectInstructions(candidate.recipeInstructions).slice(0, MAX_RECIPE_ITEMS);
  const author = scalar(candidate.author);
  return {
    name: scalar(candidate.name),
    description: scalar(candidate.description),
    author,
    servings: scalar(candidate.recipeYield),
    prepTime: scalar(candidate.prepTime),
    cookTime: scalar(candidate.cookTime),
    totalTime: scalar(candidate.totalTime),
    ingredients,
    instructions,
  };
}

/**
 * Extracts plain text and optional Schema.org Recipe fields from fetched HTML.
 * This does not execute scripts, inspect video frames, transcribe audio, or verify claims.
 */
export function extractRecipePageHtml(htmlInput: string, fallbackTitle = ""): RecipePageExtraction {
  const html = htmlInput.slice(0, MAX_HTML_CHARACTERS);
  const structuredRecipe = readStructuredRecipe(html);
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "";
  const title = readMeta(html, "property", "og:title")
    || readMeta(html, "name", "twitter:title")
    || (structuredRecipe?.name ?? "")
    || cleanText(titleTag, 300)
    || cleanText(fallbackTitle, 300)
    || "Untitled recipe page";
  const description = readMeta(html, "name", "description")
    || readMeta(html, "property", "og:description")
    || readMeta(html, "name", "twitter:description")
    || structuredRecipe?.description
    || "";
  const siteName = readMeta(html, "property", "og:site_name")
    || readMeta(html, "name", "application-name")
    || "";

  const withoutNonContent = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|canvas|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|article|tr|td|main)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const textExcerpt = cleanText(withoutNonContent, MAX_EXCERPT_CHARACTERS);

  return { title, description, siteName, textExcerpt, structuredRecipe };
}
