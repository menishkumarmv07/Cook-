import assert from "node:assert/strict";
import test from "node:test";
import {
  buildV3SubtitleFile,
  validateV3SubtitleTimeline,
} from "../lib/v3-captions";
import type { V3BlueprintScene } from "../lib/v3-content-blueprint";

function scene(overrides: Partial<V3BlueprintScene> = {}): V3BlueprintScene {
  return {
    id: "scene-1",
    kind: "cooking-step",
    title: "Mix sauce",
    narrationText: "Mix the sauce.",
    captionText: "Mix the sauce.",
    onScreenText: ["Mix the sauce."],
    visualDirection: "Show the recorded action.",
    cookingDuration: "2 minutes",
    heat: "low",
    visualCue: "Warm",
    ingredientIds: ["sauce"],
    trace: [{ entityType: "step", entityId: "step-1", fields: ["action"] }],
    reviewStatus: "needs-review",
    captionStartMs: 0,
    captionEndMs: 1_500,
    targetClipSeconds: null,
    ...overrides,
  };
}

test("exports SRT and WebVTT from owner-entered exact millisecond timings", () => {
  const scenes = [
    scene(),
    scene({
      id: "scene-2",
      title: "Finish",
      captionText: "Finish & plate.",
      captionStartMs: 1_500,
      captionEndMs: 3_025,
    }),
  ];
  assert.equal(validateV3SubtitleTimeline(scenes).ok, true);
  assert.equal(
    buildV3SubtitleFile(scenes, "srt"),
    "1\n00:00:00,000 --> 00:00:01,500\nMix the sauce.\n\n" +
      "2\n00:00:01,500 --> 00:00:03,025\nFinish &amp; plate.\n",
  );
  assert.equal(
    buildV3SubtitleFile(scenes, "vtt"),
    "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nMix the sauce.\n\n" +
      "00:00:01.500 --> 00:00:03.025\nFinish &amp; plate.\n",
  );
});

test("does not invent missing timestamps", () => {
  const validation = validateV3SubtitleTimeline([scene({
    captionStartMs: null,
    captionEndMs: null,
  })]);
  assert.equal(validation.ok, false);
  assert.match(validation.issues[0].message, /does not invent caption timing/i);
  assert.throws(() => buildV3SubtitleFile([scene({
    captionStartMs: null,
    captionEndMs: null,
  })], "srt"), /does not invent caption timing/i);
});

test("rejects one-sided timing, reversed timing, negative time and unsafe large time", () => {
  for (const item of [
    scene({ captionStartMs: 500, captionEndMs: null }),
    scene({ captionStartMs: 900, captionEndMs: 900 }),
    scene({ captionStartMs: -1, captionEndMs: 1_000 }),
    scene({ captionStartMs: 1_000, captionEndMs: 86_400_001 }),
  ]) {
    assert.equal(validateV3SubtitleTimeline([item]).ok, false);
  }
});

test("overlapping captions are rejected rather than silently reordered or clipped", () => {
  const validation = validateV3SubtitleTimeline([
    scene({ id: "one", captionStartMs: 0, captionEndMs: 2_000 }),
    scene({ id: "two", captionStartMs: 1_500, captionEndMs: 2_500 }),
  ]);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => /overlaps another caption/i.test(issue.message)));
});

test("empty captions are skipped, but entirely empty timeline cannot be exported", () => {
  assert.equal(validateV3SubtitleTimeline([
    scene({ id: "empty", captionText: "", captionStartMs: null, captionEndMs: null }),
  ]).ok, false);
  assert.equal(
    validateV3SubtitleTimeline([
      scene({ id: "empty", captionText: "", captionStartMs: null, captionEndMs: null }),
      scene({ id: "valid", captionText: "Hello", captionStartMs: 500, captionEndMs: 1_000 }),
    ]).ok,
    true,
  );
  assert.match(
    buildV3SubtitleFile([scene({ captionText: "<script>alert(1)</script>" })], "vtt"),
    /&lt;script&gt;alert\(1\)&lt;\/script&gt;/,
  );
});

test("rejects captions beyond the safe text limit", () => {
  const validation = validateV3SubtitleTimeline([
    scene({ captionText: "x".repeat(4_001) }),
  ]);
  assert.equal(validation.ok, false);
  assert.match(validation.issues[0].message, /4,000-character/i);
});
