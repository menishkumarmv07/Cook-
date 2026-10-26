export const MAX_V3_COPY_TITLE_LENGTH = 100;
export const MAX_V3_COPY_CAPTION_LENGTH = 4_000;

export type V3CreatorCopyVariant = {
  id: "how-to" | "method-step" | "walkthrough";
  label: string;
  title: string;
  caption: string;
  rationale: string;
};

export type V3CreatorCopySnapshot = {
  projectId: string;
  projectTitle: string;
  platform: string;
  title: string;
  caption: string;
  callToAction: string;
  hashtags: string;
};

export type V3CreatorCopyRepetitionWarning = {
  otherProjectId: string;
  otherProjectTitle: string;
  kind: "exact-duplicate" | "high-similarity";
  similarityPercent: number;
  message: string;
};

function cleanSourceText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function limitText(value: string, maximum: number): string {
  const clean = cleanSourceText(value);
  if (clean.length <= maximum) return clean;
  const candidate = clean.slice(0, maximum - 1);
  const boundary = candidate.lastIndexOf(" ");
  const prefix = boundary >= Math.floor(maximum * 0.6) ? candidate.slice(0, boundary) : candidate;
  return prefix.trimEnd() + "…";
}

function copyFieldFingerprint(value: unknown): string {
  return cleanSourceText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function buildV3CreatorCopyVariants(
  recipeTitle: string,
  stepActions: readonly string[],
): V3CreatorCopyVariant[] {
  const titleSource = cleanSourceText(recipeTitle);
  if (!titleSource) return [];

  const firstStep = stepActions.map(cleanSourceText).find(Boolean) ?? "";
  const howToTitle = /^how to (make|cook)\b/i.test(titleSource)
    ? titleSource
    : "How to make " + titleSource;
  const methodTitle = titleSource + ": " + (firstStep || "step by step");
  const walkthroughTitle = titleSource + " — step by step";

  const variants: V3CreatorCopyVariant[] = [
    {
      id: "how-to",
      label: "Tutorial",
      title: limitText(howToTitle, MAX_V3_COPY_TITLE_LENGTH),
      caption: limitText(
        "A step-by-step look at " + titleSource +
        ". Check the final edit against the saved method, ingredient amounts and timing. Review food-safety, allergen and required platform-disclosure details before posting.",
        MAX_V3_COPY_CAPTION_LENGTH,
      ),
      rationale: "Straightforward tutorial framing based on the saved recipe title; it does not promise a taste, health or performance outcome.",
    },
    {
      id: "method-step",
      label: "Method step",
      title: limitText(methodTitle, MAX_V3_COPY_TITLE_LENGTH),
      caption: limitText(
        firstStep
          ? "This option focuses on the saved method step: " + firstStep +
            ". Verify that the footage shows the action accurately and that timing, ingredient amounts, food safety and allergens match the reviewed recipe."
          : "This option focuses on the saved method for " + titleSource +
            ". Verify footage and captions against the reviewed recipe, including timing, food safety and allergens.",
        MAX_V3_COPY_CAPTION_LENGTH,
      ),
      rationale: firstStep
        ? "Uses the first non-empty saved step action; confirm that the footage really shows this action."
        : "No saved step action was available, so the suggestion stays general.",
    },
    {
      id: "walkthrough",
      label: "Step by step",
      title: limitText(walkthroughTitle, MAX_V3_COPY_TITLE_LENGTH),
      caption: limitText(
        "A step-by-step look at " + titleSource +
        ". Compare every scene, narration line and caption with the saved recipe before sharing, and add any required disclosure during manual platform upload.",
        MAX_V3_COPY_CAPTION_LENGTH,
      ),
      rationale: "Walkthrough framing without unsupported claims about taste, health, speed or results.",
    },
  ];

  const seen = new Set<string>();
  return variants.filter((variant) => {
    if (!variant.title || !variant.caption) return false;
    const key = copyFieldFingerprint(variant.title) + "|" + copyFieldFingerprint(variant.caption);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const COPY_STOP_WORDS = new Set([
  "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be",
  "before", "but", "by", "can", "check", "cook", "cooking", "do", "each", "for", "from",
  "has", "have", "how", "in", "into", "is", "it", "its", "make", "method", "not", "of",
  "on", "or", "our", "recipe", "review", "saved", "step", "that", "the", "this", "to",
  "up", "use", "verify", "was", "with", "your",
]);

function meaningfulTokens(snapshot: V3CreatorCopySnapshot): Set<string> {
  const text = [snapshot.title, snapshot.caption, snapshot.callToAction, snapshot.hashtags]
    .map(copyFieldFingerprint)
    .filter(Boolean)
    .join(" ");
  return new Set(text.split(" ").filter((token) => token.length > 2 && !COPY_STOP_WORDS.has(token)));
}

/**
 * A local text-only signal for copy that may be repetitive. It is not a plagiarism
 * verdict or monetization score; a warning forces visible owner review before the
 * app can report its checklist as ready. Different platforms are compared separately.
 */
export function detectV3CreatorCopyRepetition(
  current: V3CreatorCopySnapshot,
  previousProjects: readonly V3CreatorCopySnapshot[],
): V3CreatorCopyRepetitionWarning[] {
  const currentTitle = copyFieldFingerprint(current.title);
  const currentCaption = copyFieldFingerprint(current.caption);
  if (!current.projectId || !currentTitle || !currentCaption) return [];

  const currentFields = [
    currentTitle,
    currentCaption,
    copyFieldFingerprint(current.callToAction),
    copyFieldFingerprint(current.hashtags),
  ];
  const currentTokens = meaningfulTokens(current);
  const matches: V3CreatorCopyRepetitionWarning[] = [];

  for (const previous of previousProjects) {
    if (
      !previous.projectId ||
      previous.projectId === current.projectId ||
      copyFieldFingerprint(previous.platform) !== copyFieldFingerprint(current.platform)
    ) {
      continue;
    }
    const previousTitle = copyFieldFingerprint(previous.title);
    const previousCaption = copyFieldFingerprint(previous.caption);
    if (!previousTitle || !previousCaption) continue;

    const previousFields = [
      previousTitle,
      previousCaption,
      copyFieldFingerprint(previous.callToAction),
      copyFieldFingerprint(previous.hashtags),
    ];
    const exact = currentFields.every((field, index) => field === previousFields[index]);
    let similarityPercent = exact ? 100 : 0;
    let kind: V3CreatorCopyRepetitionWarning["kind"] = "exact-duplicate";

    if (!exact) {
      const previousTokens = meaningfulTokens(previous);
      if (currentTokens.size < 12 || previousTokens.size < 12) continue;
      const overlap = [...currentTokens].filter((token) => previousTokens.has(token)).length;
      const union = new Set([...currentTokens, ...previousTokens]).size;
      const similarity = union ? overlap / union : 0;
      if (similarity < 0.88) continue;
      similarityPercent = Math.round(similarity * 100);
      kind = "high-similarity";
    }

    const otherTitle = cleanSourceText(previous.projectTitle) || "another saved project";
    matches.push({
      otherProjectId: previous.projectId,
      otherProjectTitle: otherTitle,
      kind,
      similarityPercent,
      message:
        (exact ? "This platform copy duplicates " : "This platform copy closely resembles ") +
        "\"" + otherTitle + "\" on " + cleanSourceText(current.platform || "the selected platform") +
        ". Rewrite it with recipe-specific educational value or document a substantive editorial reason before export. Text similarity is a review signal, not a verdict.",
    });
  }

  return matches
    .sort((a, b) => b.similarityPercent - a.similarityPercent || a.otherProjectTitle.localeCompare(b.otherProjectTitle))
    .slice(0, 3);
}
