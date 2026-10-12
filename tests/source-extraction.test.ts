import test from "node:test";
import assert from "node:assert/strict";
import { extractRecipePageHtml } from "../lib/source-extraction";

test("extracts Open Graph metadata and structured Schema.org Recipe fields", () => {
  const recipe = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Example Kitchen" },
      {
        "@type": "Recipe",
        name: "Lemon Rice",
        description: "Bright and tangy rice.",
        author: { "@type": "Person", name: "Asha" },
        recipeYield: "4 servings",
        prepTime: "PT10M",
        cookTime: "PT15M",
        totalTime: "PT25M",
        recipeIngredient: ["2 cups cooked rice", "1 tbsp lemon juice"],
        recipeInstructions: [
          { "@type": "HowToStep", text: "Warm the pan." },
          {
            "@type": "HowToSection",
            itemListElement: [{ "@type": "HowToStep", text: "Fold in rice and lemon." }],
          },
        ],
      },
    ],
  };

  const html = [
    "<!doctype html><html><head>",
    "<title>Fallback browser title</title>",
    '<meta property="og:title" content="Lemon Rice &amp; Peas">',
    '<meta name="description" content="Bright, quick rice.">',
    '<meta property="og:site_name" content="Example Cooking">',
    '<script type="application/ld+json">',
    JSON.stringify(recipe),
    "</script>",
    "<style>.private-style{color:red}</style>",
    '<script>privateScriptShouldNotAppear()</script>',
    "</head><body><nav>private navigation</nav><p>Visible recipe story.</p></body></html>",
  ].join("");

  const extracted = extractRecipePageHtml(html, "Fallback host");

  assert.equal(extracted.title, "Lemon Rice & Peas");
  assert.equal(extracted.description, "Bright, quick rice.");
  assert.equal(extracted.siteName, "Example Cooking");
  assert.match(extracted.textExcerpt, /Visible recipe story/);
  assert.doesNotMatch(extracted.textExcerpt, /private-style|privateScriptShouldNotAppear|private navigation/);

  assert.ok(extracted.structuredRecipe);
  assert.equal(extracted.structuredRecipe.name, "Lemon Rice");
  assert.equal(extracted.structuredRecipe.author, "Asha");
  assert.equal(extracted.structuredRecipe.servings, "4 servings");
  assert.equal(extracted.structuredRecipe.prepTime, "PT10M");
  assert.equal(extracted.structuredRecipe.cookTime, "PT15M");
  assert.deepEqual(extracted.structuredRecipe.ingredients, ["2 cups cooked rice", "1 tbsp lemon juice"]);
  assert.deepEqual(extracted.structuredRecipe.instructions, ["Warm the pan.", "Fold in rice and lemon."]);
});

test("ignores malformed JSON-LD and uses safe metadata fallbacks", () => {
  const html = [
    "<html><head>",
    '<meta property="og:title" content="Fallback &amp; safe">',
    '<script type="application/ld+json">{not valid JSON}</script>',
    "</head><body><p>Readable page body.</p></body></html>",
  ].join("");

  const extracted = extractRecipePageHtml(html, "fallback.example");

  assert.equal(extracted.title, "Fallback & safe");
  assert.equal(extracted.structuredRecipe, null);
  assert.match(extracted.textExcerpt, /Readable page body/);
  assert.doesNotMatch(extracted.textExcerpt, /not valid JSON/);
});

test("caps structured recipe ingredients, instructions, and text excerpt", () => {
  const recipe = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Long Recipe",
    recipeIngredient: Array.from({ length: 105 }, (_, index) => "ingredient " + (index + 1)),
    recipeInstructions: Array.from(
      { length: 105 },
      (_, index) => ({ "@type": "HowToStep", text: "step " + (index + 1) }),
    ),
  };
  const html = [
    '<html><head><script type="application/ld+json">',
    JSON.stringify(recipe),
    "</script></head><body><p>",
    "x".repeat(9_000),
    "</p></body></html>",
  ].join("");

  const extracted = extractRecipePageHtml(html);

  assert.ok(extracted.structuredRecipe);
  assert.equal(extracted.structuredRecipe.ingredients.length, 100);
  assert.equal(extracted.structuredRecipe.instructions.length, 100);
  assert.ok(extracted.textExcerpt.length <= 8_000);
});
