import assert from "node:assert/strict";
import test from "node:test";
import type { V3BlueprintScene } from "../lib/v3-content-blueprint";
import {
  isV3MediaAsset,
  MAX_V3_EXPORT_DURATION_MS,
  preflightV3OwnerFootageRender,
  type V3MediaAsset,
} from "../lib/v3-rendering";

function scene(id: string, sourceStartMs = 0, sourceEndMs = 2_000): V3BlueprintScene {
  return {
    id,
    kind: "cooking-step",
    title: "Cook the food",
    narrationText: "Cook the food.",
    captionText: "Cook the food.",
    onScreenText: ["Cook the food."],
    visualDirection: "Show the recorded cooking action.",
    cookingDuration: "2 minutes",
    heat: "medium",
    visualCue: "Cooked",
    ingredientIds: ["food"],
    trace: [{ entityType: "step", entityId: id, fields: ["action"] }],
    reviewStatus: "approved",
    captionStartMs: sourceStartMs,
    captionEndMs: sourceEndMs,
    sourceMediaId: "video-1",
    sourceMediaStartMs: sourceStartMs,
    sourceMediaEndMs: sourceEndMs,
    targetClipSeconds: (sourceEndMs - sourceStartMs) / 1_000,
  };
}

const video: V3MediaAsset = {
  id: "video-1",
  kind: "video",
  label: "Owner footage",
  originalFileName: "cooking.webm",
  mimeType: "video/webm",
  byteSize: 2_500_000,
  sha256: "a".repeat(64),
  durationMs: 30_000,
  width: 720,
  height: 1_280,
  importedAt: "2026-10-25T16:00:00.000Z",
  rightsStatus: "owner-recorded",
  rightsNote: "Recorded by the owner.",
  reviewState: "owner-cleared",
};
const narration: V3MediaAsset = {
  id: "narration-1",
  kind: "narration",
  label: "Owner narration",
  originalFileName: "narration.wav",
  mimeType: "audio/wav",
  byteSize: 500_000,
  sha256: "b".repeat(64),
  durationMs: 4_000,
  width: null,
  height: null,
  importedAt: "2026-10-25T16:00:00.000Z",
  rightsStatus: "owner-recorded",
  rightsNote: "Recorded by the owner.",
  reviewState: "owner-cleared",
};

test("validates a real owner-footage timeline with cleared clips, narration and manual caption times", () => {
  const scenes = [
    scene("first", 0, 2_000),
    { ...scene("second", 2_000, 4_000), sourceMediaStartMs: 3_000, sourceMediaEndMs: 5_000 },
  ];
  // Both segments are the same length and point to the imported clip.
  const report = preflightV3OwnerFootageRender(scenes, [video, narration], "narration-1");
  assert.equal(report.ok, true);
  assert.equal(report.durationMs, 4_000);
  assert.deepEqual(report.issues, []);
});

test("blocks a scene until its recipe action and source mapping are explicitly reviewed", () => {
  const report = preflightV3OwnerFootageRender([
    { ...scene("needs-review"), reviewStatus: "needs-review" },
  ], [video, narration], "narration-1");
  assert.ok(report.issues.some((issue) => issue.code === "scene-not-reviewed"));
});

test("blocks missing scene footage instead of rendering a still image or fake clip", () => {
  const report = preflightV3OwnerFootageRender([
    { ...scene("missing"), sourceMediaId: null, sourceMediaStartMs: null, sourceMediaEndMs: null, targetClipSeconds: null },
  ], [video, narration], "narration-1");
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "missing-scene-clip"));
});

test("blocks media without explicit rights notes or owner clearance", () => {
  const unresolved = { ...video, rightsStatus: "unknown" as const, rightsNote: "", reviewState: "needs-review" as const };
  const report = preflightV3OwnerFootageRender([scene("one")], [unresolved, narration], "narration-1");
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "rights-unresolved"));
});

test("rejects source times beyond the selected clip duration", () => {
  const report = preflightV3OwnerFootageRender([scene("one", 29_000, 31_000)], [video, narration], "narration-1");
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "source-range-out-of-bounds"));
});

test("requires a narration track long enough for the edited timeline", () => {
  const shortNarration = { ...narration, durationMs: 1_000 };
  const report = preflightV3OwnerFootageRender([scene("one", 0, 4_000)], [video, shortNarration], "narration-1");
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "narration-too-short"));
});

test("blocks un-timed captions, overlapping caption intervals and captions after video end", () => {
  const untimed = { ...scene("one"), captionStartMs: null, captionEndMs: null };
  const untimedReport = preflightV3OwnerFootageRender([untimed], [video, narration], "narration-1");
  assert.ok(untimedReport.issues.some((issue) => issue.code === "caption-timing-invalid"));

  const beyond = { ...scene("one", 0, 2_000), captionStartMs: 3_000, captionEndMs: 4_000 };
  const beyondReport = preflightV3OwnerFootageRender([beyond], [video, narration], "narration-1");
  assert.ok(beyondReport.issues.some((issue) => issue.code === "caption-beyond-video"));
});

test("rejects timelines over the first-renderer safety limit", () => {
  const long = Array.from({ length: 4 }, (_, index) => ({
    ...scene("long-" + index, 0, 50_000),
    id: "long-" + index,
    captionStartMs: index * 50_000,
    captionEndMs: index * 50_000 + 10_000,
    sourceMediaStartMs: 0,
    sourceMediaEndMs: 50_000,
    targetClipSeconds: 50,
  }));
  const longVideo = { ...video, durationMs: 60_000 };
  const longNarration = { ...narration, durationMs: MAX_V3_EXPORT_DURATION_MS };
  const report = preflightV3OwnerFootageRender(long, [longVideo, longNarration], "narration-1");
  assert.ok(report.issues.some((issue) => issue.code === "render-too-long"));
});

test("media metadata validator rejects inconsistent video/audio fields and unsafe sizes", () => {
  assert.equal(isV3MediaAsset(video), true);
  assert.equal(isV3MediaAsset(narration), true);
  assert.equal(isV3MediaAsset({ ...video, width: null }), false);
  assert.equal(isV3MediaAsset({ ...narration, width: 10 }), false);
  assert.equal(isV3MediaAsset({ ...video, byteSize: 0 }), false);
  assert.equal(isV3MediaAsset({ ...video, sha256: "bad" }), false);
});
