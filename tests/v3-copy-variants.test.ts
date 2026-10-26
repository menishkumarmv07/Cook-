import assert from "node:assert/strict";
import test from "node:test";
import {
  buildV3CreatorCopyVariants,
  detectV3CreatorCopyRepetition,
  MAX_V3_COPY_CAPTION_LENGTH,
  MAX_V3_COPY_TITLE_LENGTH,
  type V3CreatorCopySnapshot,
} from "../lib/v3-copy-variants";

function snapshot(
  projectId: string,
  overrides: Partial<V3CreatorCopySnapshot> = {},
): V3CreatorCopySnapshot {
  return {
    projectId,
    projectTitle: "Garlic Rice",
    platform: "youtube-shorts",
    title: "Garlic rice in one pan",
    caption: "A step-by-step look at garlic rice. Check the final edit against the saved method and review safety and allergen details before posting.",
    callToAction: "Save this recipe for later.",
    hashtags: "#garlicrice #cooking",
    ...overrides,
  };
}

test("builds three deterministic copy suggestions from the saved recipe title and first method step", () => {
  const variants = buildV3CreatorCopyVariants("Garlic Rice", ["Stir the rice gently", "Let it rest"]);
  assert.equal(variants.length, 3);
  assert.equal(variants[0].title, "How to make Garlic Rice");
  assert.equal(variants[1].title, "Garlic Rice: Stir the rice gently");
  assert.match(variants[1].caption, /Stir the rice gently/);
  assert.equal(variants[2].title, "Garlic Rice — step by step");
  assert.ok(variants.every((variant) => variant.title.length <= MAX_V3_COPY_TITLE_LENGTH));
  assert.ok(variants.every((variant) => variant.caption.length <= MAX_V3_COPY_CAPTION_LENGTH));
  assert.ok(variants.every((variant) => !/viral|guaranteed|best ever|weight loss/i.test(variant.title + " " + variant.caption)));
});

test("does not double a recipe title that already starts with a how-to phrase", () => {
  const variants = buildV3CreatorCopyVariants("How to make Garlic Rice", ["Stir the rice gently"]);
  assert.equal(variants[0].title, "How to make Garlic Rice");
  assert.equal(variants.length, 3);
});

test("returns no variants for an empty or non-text recipe title", () => {
  assert.deepEqual(buildV3CreatorCopyVariants("  ", ["Mix"]), []);
  assert.deepEqual(buildV3CreatorCopyVariants((42 as unknown) as string, ["Mix"]), []);
});

test("bounds long source fields and removes control characters without overflowing platform fields", () => {
  const title = "Long Rice Recipe " + "grain ".repeat(100);
  const action = "Stir gently " + "slowly ".repeat(400);
  const variants = buildV3CreatorCopyVariants(title, [action]);
  assert.equal(variants.length, 3);
  assert.ok(variants.every((variant) => variant.title.length <= 100));
  assert.ok(variants.every((variant) => variant.caption.length <= 4_000));
  assert.ok(variants.every((variant) => !/[\u0000-\u001F\u007F]/.test(variant.title + variant.caption)));
  assert.ok(variants.every((variant) => variant.title.endsWith("…") || variant.title.length <= 100));
});

test("detects exact repeated copy on the same platform but ignores its own project and other platforms", () => {
  const current = snapshot("current");
  const duplicate = snapshot("previous", { projectTitle: "Previous Garlic Rice" });
  const sameProject = snapshot("current", { projectTitle: "Current Project" });
  const otherPlatform = snapshot("instagram", { platform: "instagram-reels" });
  const warnings = detectV3CreatorCopyRepetition(current, [duplicate, sameProject, otherPlatform]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].kind, "exact-duplicate");
  assert.equal(warnings[0].similarityPercent, 100);
  assert.match(warnings[0].message, /Previous Garlic Rice/);
});

test("flags only very high overlap copy as a possible repeated template", () => {
  const common = "Detailed rice cooking method carefully checks ingredient measures timing texture and preparation technique for clear learning instructions";
  const current = snapshot("current", {
    title: "Garlic rice tutorial",
    caption: common + " with garlic and rice",
    callToAction: "Save the full cooking method",
    hashtags: "#rice #garlic",
  });
  const previous = snapshot("previous", {
    projectTitle: "Onion Rice",
    title: "Onion rice tutorial",
    caption: common + " with onion and rice",
    callToAction: "Save the full cooking method",
    hashtags: "#rice #onion",
  });
  const warnings = detectV3CreatorCopyRepetition(current, [previous]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].kind, "high-similarity");
  assert.ok(warnings[0].similarityPercent >= 88);
});

test("does not flag unrelated copy or an incomplete current draft", () => {
  const current = snapshot("current");
  const different = snapshot("different", {
    title: "Pan-seared salmon",
    caption: "Chill a bowl then whisk lemon juice with fresh dill and serve with a crisp green salad.",
    callToAction: "What herbs do you like?",
    hashtags: "#salmon",
  });
  assert.deepEqual(detectV3CreatorCopyRepetition(current, [different]), []);
  assert.deepEqual(detectV3CreatorCopyRepetition(snapshot("empty", { title: "", caption: "" }), [current]), []);
});
