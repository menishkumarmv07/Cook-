import assert from "node:assert/strict";
import test from "node:test";
import {
  buildV3ContentBlueprint,
  createV3ContentBlueprintBackupJSON,
  parseV3ContentBlueprintBackupJSON,
  V3BlueprintInputError,
  validateV3ContentBlueprint,
  verifyV3ContentBlueprintFingerprints,
} from "../lib/v3-content-blueprint";
import { DEFAULT_CREATOR_PROFILE, SCENE_TEMPLATE, type RecipeProject } from "../lib/recipe";
import type { ResearchEvidenceArchive } from "../lib/research-evidence";

const fixedNow = "2026-10-25T16:00:00.000Z";

function recipe(overrides: Partial<RecipeProject> = {}): RecipeProject {
  return {
    id: 17,
    trialStatus: "untested",
    trialRating: "",
    trialDate: "",
    trialChanges: "",
    trialNotes: "",
    trialPhotoDataUrl: "",
    recipeRevision: 3,
    trialPhotoRevision: -1,
    trialNotesRevision: -1,
    evidenceReviewedAt: "",
    approved: false,
    approvedAt: "",
    name: "Tomato pasta",
    url: "https://recipes.example.com/tomato-pasta",
    notes: "Use the recorded method.",
    sourceEvidence: "A manually entered note.",
    sourceReferences: [{
      id: "source-1",
      url: "https://recipes.example.com/tomato-pasta",
      kind: "recipe-page",
      checked: "Owner compared the ingredient list",
      notes: "Cooking time should be checked during a trial",
      ingredientFindings: "Pasta and sauce are listed",
      methodFindings: "Boil pasta, then mix with sauce",
      timingFindings: "Pasta timing is recorded below",
      safetyStorageFindings: "Storage guidance not recorded",
    }],
    servings: "2",
    ingredients: [
      { id: "ingredient-pasta", amount: "200", unit: "g", name: "pasta", prep: "dry" },
      { id: "ingredient-sauce", amount: "1", unit: "cup", name: "tomato sauce", prep: "" },
    ],
    steps: [
      {
        id: "step-boil",
        action: "Boil the pasta",
        duration: "10 minutes",
        heat: "boiling",
        cue: "Tender",
        ingredientIds: ["ingredient-pasta"],
      },
      {
        id: "step-mix",
        action: "Stir in the sauce",
        duration: "2 minutes",
        heat: "low",
        cue: "Sauce is warm",
        ingredientIds: ["ingredient-sauce"],
      },
    ],
    scenes: SCENE_TEMPLATE.map((scene) => ({ ...scene })),
    ...overrides,
  };
}

function evidenceArchive(overrides: Partial<ResearchEvidenceArchive> = {}): ResearchEvidenceArchive {
  return {
    version: 1,
    updatedAt: fixedNow,
    sources: [{
      id: "research-source-1",
      url: "https://recipes.example.com/tomato-pasta",
      title: "Tomato pasta page",
      publisher: "Recipe site",
      capturedAt: fixedNow,
      captureMethod: "page-text",
      status: "accessible",
      warnings: [],
    }],
    claims: [{
      id: "claim-salt",
      sourceId: "research-source-1",
      subject: "tomato pasta",
      predicate: "salt quantity",
      value: "two tablespoons",
      unit: "tbsp",
      excerpt: "This is a deliberately non-accepted claim.",
      capturedAt: fixedNow,
      reviewStatus: "unreviewed",
    }],
    ...overrides,
  };
}

test("builds a deterministic, editable scene plan from the exact saved recipe fields", async () => {
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: { ...DEFAULT_CREATOR_PROFILE },
    now: fixedNow,
  });

  assert.equal(blueprint.schemaVersion, 2);
  assert.equal(blueprint.status, "draft");
  assert.equal(blueprint.recipeTitle, "Tomato pasta");
  assert.equal(blueprint.servings, "2");
  assert.equal(blueprint.scenes.length, recipe().steps.length + 3);
  assert.deepEqual(blueprint.scenes.map((scene) => scene.kind), [
    "opening", "ingredient-overview", "cooking-step", "cooking-step", "closing",
  ]);
  assert.match(blueprint.scenes[1].captionText, /200 g — pasta/);
  assert.match(blueprint.scenes[1].captionText, /1 cup — tomato sauce/);
  assert.equal(blueprint.scenes[2].narrationText, "Boil the pasta Recorded ingredients: pasta.");
  assert.equal(blueprint.scenes[2].cookingDuration, "10 minutes");
  assert.equal(blueprint.scenes[2].targetClipSeconds, null);
  assert.equal(blueprint.scenes[2].reviewStatus, "needs-review");
  assert.equal(blueprint.fingerprints.inputsSha256.length, 64);
  assert.ok(blueprint.warnings.some((warning) => warning.code === "recipe-not-tried"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "recipe-not-approved"));
  assert.equal(await verifyV3ContentBlueprintFingerprints(blueprint), true);
});

test("accepts assigned owner-footage ranges when their trims and durations are consistent", async () => {
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  const cookingSceneIndex = blueprint.scenes.findIndex((scene) => scene.kind === "cooking-step");
  assert.ok(cookingSceneIndex >= 0);

  const assigned = {
    ...blueprint,
    scenes: blueprint.scenes.map((scene, index) => index === cookingSceneIndex
      ? {
          ...scene,
          sourceMediaId: "test-video-1",
          sourceMediaStartMs: 0,
          sourceMediaEndMs: 2_500,
          targetClipSeconds: 2.5,
        }
      : scene),
  };
  assert.equal(validateV3ContentBlueprint(assigned), true);
  assert.equal(await verifyV3ContentBlueprintFingerprints(assigned), true);

  const inconsistentDuration = {
    ...assigned,
    scenes: assigned.scenes.map((scene, index) => index === cookingSceneIndex
      ? { ...scene, targetClipSeconds: 3 }
      : scene),
  };
  assert.equal(validateV3ContentBlueprint(inconsistentDuration), false);
});

test("does not invent missing amounts, units, cooking duration, heat, cues or actions", async () => {
  const incomplete = recipe({
    servings: "",
    ingredients: [{ id: "ingredient-salt", amount: "", unit: "", name: "salt", prep: "" }],
    steps: [{
      id: "step-season",
      action: "",
      duration: "",
      heat: "",
      cue: "",
      ingredientIds: ["ingredient-salt"],
    }],
  });
  const blueprint = await buildV3ContentBlueprint({
    recipe: incomplete,
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  const ingredientScene = blueprint.scenes.find((scene) => scene.kind === "ingredient-overview");
  const cookingScene = blueprint.scenes.find((scene) => scene.kind === "cooking-step");

  assert.ok(ingredientScene);
  assert.match(ingredientScene.captionText, /\[amount not recorded\]/);
  assert.match(ingredientScene.captionText, /\[unit not recorded\]/);
  assert.ok(cookingScene);
  assert.match(cookingScene.narrationText, /action not recorded/i);
  assert.equal(cookingScene.cookingDuration, null);
  assert.equal(cookingScene.heat, null);
  assert.equal(cookingScene.visualCue, null);
  assert.ok(blueprint.warnings.some((warning) => warning.code === "ingredient-amount-missing"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "ingredient-unit-missing"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "step-action-missing"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "step-duration-missing"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "step-heat-missing"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "step-cue-missing"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "evidence-review-incomplete"));
  assert.equal(blueprint.servings, "[servings not recorded]");
});

test("research claims are preserved with review status but never inserted automatically into narration", async () => {
  const archive = evidenceArchive();
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    researchEvidence: archive,
    now: fixedNow,
  });

  assert.equal(blueprint.sourceSnapshot.researchEvidence?.claims[0].reviewStatus, "unreviewed");
  assert.ok(blueprint.warnings.some((warning) =>
    warning.code === "evidence-claim-not-accepted" && warning.entityId === "claim-salt"
  ));
  assert.ok(blueprint.scenes.every((scene) => !scene.narrationText.includes("two tablespoons")));
  assert.ok(blueprint.scenes.every((scene) => !scene.captionText.includes("two tablespoons")));
  assert.equal(await verifyV3ContentBlueprintFingerprints(blueprint), true);
});

test("rejected claims are never promoted to approved recipe facts", async () => {
  const archive = evidenceArchive({
    claims: [{
      id: "claim-salt",
      sourceId: "research-source-1",
      subject: "tomato pasta",
      predicate: "salt quantity",
      value: "five cups",
      unit: "cup",
      excerpt: "Rejected sample",
      capturedAt: fixedNow,
      reviewStatus: "rejected",
    }],
  });
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    researchEvidence: archive,
    now: fixedNow,
  });
  assert.ok(blueprint.warnings.some((warning) => warning.code === "evidence-claim-not-accepted"));
  assert.ok(blueprint.scenes.every((scene) => !scene.narrationText.includes("five cups")));
});

test("fingerprints are repeatable and change when source facts change", async () => {
  const first = await buildV3ContentBlueprint({ recipe: recipe(), creatorProfile: DEFAULT_CREATOR_PROFILE, now: fixedNow });
  const second = await buildV3ContentBlueprint({ recipe: recipe(), creatorProfile: DEFAULT_CREATOR_PROFILE, now: fixedNow });
  const changed = await buildV3ContentBlueprint({
    recipe: recipe({ ingredients: [{ id: "ingredient-pasta", amount: "250", unit: "g", name: "pasta", prep: "dry" }, recipe().ingredients[1]] }),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });

  assert.equal(first.fingerprints.inputsSha256, second.fingerprints.inputsSha256);
  assert.equal(first.fingerprints.recipeSha256, second.fingerprints.recipeSha256);
  assert.notEqual(first.fingerprints.inputsSha256, changed.fingerprints.inputsSha256);
  assert.notEqual(first.fingerprints.recipeSha256, changed.fingerprints.recipeSha256);
});

test("profile changes are included in the immutable input fingerprint", async () => {
  const first = await buildV3ContentBlueprint({ recipe: recipe(), creatorProfile: DEFAULT_CREATOR_PROFILE, now: fixedNow });
  const changedProfile = { ...DEFAULT_CREATOR_PROFILE, tone: "Quiet and concise" };
  const second = await buildV3ContentBlueprint({ recipe: recipe(), creatorProfile: changedProfile, now: fixedNow });
  assert.notEqual(first.fingerprints.creatorProfileSha256, second.fingerprints.creatorProfileSha256);
  assert.notEqual(first.fingerprints.inputsSha256, second.fingerprints.inputsSha256);
});

test("invalid evidence archive is excluded and reported rather than trusted", async () => {
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    researchEvidence: { version: 999, sources: [], claims: [] },
    now: fixedNow,
  });
  assert.equal(blueprint.sourceSnapshot.researchEvidence, null);
  assert.equal(blueprint.fingerprints.researchEvidenceSha256, null);
  assert.ok(blueprint.warnings.some((warning) => warning.code === "evidence-archive-invalid"));
});

test("dangling step ingredient references are warned about and excluded from mapped scene links", async () => {
  const source = recipe({
    steps: [{
      id: "step-mystery",
      action: "Stir the ingredients",
      duration: "",
      heat: "",
      cue: "",
      ingredientIds: ["missing-ingredient"],
    }],
  });
  const blueprint = await buildV3ContentBlueprint({
    recipe: source,
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  const scene = blueprint.scenes.find((item) => item.kind === "cooking-step");
  assert.ok(scene);
  assert.deepEqual(scene.ingredientIds, []);
  assert.ok(blueprint.warnings.some((warning) =>
    warning.code === "dangling-ingredient-reference" && warning.entityId === "step-mystery"
  ));
});

test("duplicate ingredient and step IDs reject an ambiguous snapshot", async () => {
  await assert.rejects(
    () => buildV3ContentBlueprint({
      recipe: recipe({ ingredients: [
        { id: "same", amount: "1", unit: "cup", name: "rice", prep: "" },
        { id: "same", amount: "2", unit: "cup", name: "water", prep: "" },
      ] }),
      creatorProfile: DEFAULT_CREATOR_PROFILE,
      now: fixedNow,
    }),
    V3BlueprintInputError,
  );
  await assert.rejects(
    () => buildV3ContentBlueprint({
      recipe: recipe({ steps: [
        { id: "same", action: "Mix", duration: "", heat: "", cue: "" },
        { id: "same", action: "Cook", duration: "", heat: "", cue: "" },
      ] }),
      creatorProfile: DEFAULT_CREATOR_PROFILE,
      now: fixedNow,
    }),
    V3BlueprintInputError,
  );
});

test("unusable source URLs, including URLs with credentials and private hosts, are not copied into the snapshot", async () => {
  const source = recipe({
    url: "https://user:password@recipes.example.com/private",
    sourceReferences: [{
      id: "unsafe-source",
      url: "http://127.0.0.1/admin",
      kind: "recipe-page",
      checked: "",
      notes: "",
    }],
  });
  const blueprint = await buildV3ContentBlueprint({ recipe: source, creatorProfile: DEFAULT_CREATOR_PROFILE, now: fixedNow });
  assert.equal(blueprint.sourceSnapshot.recipe.url, "");
  assert.equal(blueprint.sourceSnapshot.recipe.sourceReferences[0].url, "");
  assert.ok(blueprint.warnings.some((warning) => warning.code === "source-url-unusable"));
});

test("blueprint backup round-trips and rejects invalid JSON or oversized input", async () => {
  const blueprint = await buildV3ContentBlueprint({ recipe: recipe(), creatorProfile: DEFAULT_CREATOR_PROFILE, now: fixedNow });
  const raw = createV3ContentBlueprintBackupJSON(blueprint);
  const restored = parseV3ContentBlueprintBackupJSON(raw);
  assert.ok(restored);
  assert.equal(validateV3ContentBlueprint(restored), true);
  assert.equal(await verifyV3ContentBlueprintFingerprints(restored), true);
  assert.equal(parseV3ContentBlueprintBackupJSON("{bad json"), null);
  assert.equal(parseV3ContentBlueprintBackupJSON("x".repeat(15 * 1024 * 1024 + 1)), null);
});

test("schema version one backup is migrated to version two without inventing media or caption timings", async () => {
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  const legacy = JSON.parse(createV3ContentBlueprintBackupJSON(blueprint)) as {
    schemaVersion: number;
    scenes: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  legacy.schemaVersion = 1;
  for (const scene of legacy.scenes) {
    delete scene.captionStartMs;
    delete scene.captionEndMs;
    delete scene.sourceMediaId;
    delete scene.sourceMediaStartMs;
    delete scene.sourceMediaEndMs;
    delete scene.targetClipSeconds;
  }
  const restored = parseV3ContentBlueprintBackupJSON(JSON.stringify(legacy));
  assert.ok(restored);
  assert.equal(restored.schemaVersion, 2);
  assert.ok(restored.scenes.every((scene) =>
    scene.captionStartMs === null && scene.captionEndMs === null &&
    scene.sourceMediaId === null && scene.sourceMediaStartMs === null &&
    scene.sourceMediaEndMs === null && scene.targetClipSeconds === null
  ));
  assert.equal(await verifyV3ContentBlueprintFingerprints(restored), true);
});

test("older V3 backups migrate missing caption timing to unknown rather than inventing times", async () => {
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  const legacy = JSON.parse(createV3ContentBlueprintBackupJSON(blueprint)) as {
    scenes: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  for (const scene of legacy.scenes) {
    delete scene.captionStartMs;
    delete scene.captionEndMs;
  }
  const restored = parseV3ContentBlueprintBackupJSON(JSON.stringify(legacy));
  assert.ok(restored);
  assert.ok(restored.scenes.every((scene) => scene.captionStartMs === null && scene.captionEndMs === null));
  assert.equal(await verifyV3ContentBlueprintFingerprints(restored), true);
});

test("backup structure is validated and altered snapshots fail integrity verification", async () => {
  const blueprint = await buildV3ContentBlueprint({ recipe: recipe(), creatorProfile: DEFAULT_CREATOR_PROFILE, now: fixedNow });
  const raw = createV3ContentBlueprintBackupJSON(blueprint);
  const parsed = JSON.parse(raw) as typeof blueprint;
  parsed.sourceSnapshot.recipe.ingredients[0].amount = "999";
  assert.equal(validateV3ContentBlueprint(parsed), true);
  assert.equal(await verifyV3ContentBlueprintFingerprints(parsed), false);
  parsed.scenes[0].trace = [null] as unknown as typeof parsed.scenes[0]["trace"];
  assert.equal(validateV3ContentBlueprint(parsed), false);
});

test("no-step and no-ingredient recipes remain clearly incomplete, not silently completed", async () => {
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe({ ingredients: [], steps: [] }),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  assert.equal(blueprint.scenes.length, 3);
  assert.ok(blueprint.warnings.some((warning) => warning.code === "no-ingredients"));
  assert.ok(blueprint.warnings.some((warning) => warning.code === "no-steps"));
  assert.equal(blueprint.status, "draft");
});

test("invalid timestamps and oversized recipe arrays fail safely", async () => {
  await assert.rejects(
    () => buildV3ContentBlueprint({ recipe: recipe(), creatorProfile: DEFAULT_CREATOR_PROFILE, now: "not-a-date" }),
    V3BlueprintInputError,
  );
  await assert.rejects(
    () => buildV3ContentBlueprint({
      recipe: recipe({ steps: Array.from({ length: 501 }, (_, index) => ({
        id: "step-" + index,
        action: "Mix",
        duration: "",
        heat: "",
        cue: "",
      })) }),
      creatorProfile: DEFAULT_CREATOR_PROFILE,
      now: fixedNow,
    }),
    V3BlueprintInputError,
  );
});

test("an empty or omitted Research Studio archive is identified explicitly", async () => {
  const omitted = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  assert.ok(omitted.warnings.some((warning) => warning.code === "research-archive-not-included"));

  const empty = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    researchEvidence: { version: 1, updatedAt: fixedNow, sources: [], claims: [] },
    now: fixedNow,
  });
  assert.ok(empty.warnings.some((warning) => warning.code === "research-archive-empty"));
});

test("oversized source text is rejected rather than silently truncated", async () => {
  await assert.rejects(
    () => buildV3ContentBlueprint({
      recipe: recipe({
        steps: [{
          id: "step-too-long",
          action: "x".repeat(2_001),
          duration: "",
          heat: "",
          cue: "",
        }],
      }),
      creatorProfile: DEFAULT_CREATOR_PROFILE,
      now: fixedNow,
    }),
    V3BlueprintInputError,
  );
});

test("backup parser rejects malformed nested recipe records", async () => {
  const blueprint = await buildV3ContentBlueprint({
    recipe: recipe(),
    creatorProfile: DEFAULT_CREATOR_PROFILE,
    now: fixedNow,
  });
  const candidate = JSON.parse(createV3ContentBlueprintBackupJSON(blueprint)) as typeof blueprint;
  candidate.sourceSnapshot.recipe.ingredients = [null] as unknown as typeof candidate.sourceSnapshot.recipe.ingredients;
  assert.equal(validateV3ContentBlueprint(candidate), false);
});

test("control characters are removed from snapshot text without inventing recipe facts", async () => {
  const source = recipe({
    name: "Tomato\u0000 pasta",
    steps: [{
      id: "step-clean",
      action: "Stir\u0000 the sauce",
      duration: "",
      heat: "",
      cue: "",
      ingredientIds: ["ingredient-sauce"],
    }],
  });
  const blueprint = await buildV3ContentBlueprint({ recipe: source, creatorProfile: DEFAULT_CREATOR_PROFILE, now: fixedNow });
  assert.equal(blueprint.recipeTitle, "Tomato pasta");
  assert.equal(blueprint.scenes[2].narrationText.startsWith("Stir the sauce"), true);
  assert.equal(blueprint.fingerprints.inputsSha256.length, 64);
});
