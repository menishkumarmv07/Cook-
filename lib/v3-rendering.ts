import type { V3BlueprintScene } from "./v3-content-blueprint";
import { validateV3SubtitleTimeline } from "./v3-captions";

export const MAX_V3_MEDIA_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_V3_MEDIA_LIBRARY_BYTES = 400 * 1024 * 1024;
export const MAX_V3_MEDIA_ASSETS = 30;
export const MAX_V3_SOURCE_CLIP_DURATION_MS = 5 * 60 * 1_000;
export const MAX_V3_EXPORT_DURATION_MS = 3 * 60 * 1_000;

export type V3MediaKind = "video" | "narration";
export type V3MediaRightsStatus = "unknown" | "owner-recorded" | "owner-has-rights";
export type V3MediaReviewState = "needs-review" | "owner-cleared" | "rejected";

export type V3MediaAsset = {
  id: string;
  kind: V3MediaKind;
  label: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  durationMs: number;
  width: number | null;
  height: number | null;
  importedAt: string;
  rightsStatus: V3MediaRightsStatus;
  rightsNote: string;
  reviewState: V3MediaReviewState;
};

export type V3RenderPreflightIssue = {
  code:
    | "no-scenes"
    | "scene-not-reviewed"
    | "missing-scene-clip"
    | "missing-clip-asset"
    | "wrong-media-kind"
    | "asset-not-cleared"
    | "rights-unresolved"
    | "invalid-source-range"
    | "source-range-out-of-bounds"
    | "render-too-long"
    | "missing-narration"
    | "narration-not-cleared"
    | "narration-too-short"
    | "caption-timing-invalid"
    | "caption-beyond-video";
  message: string;
  sceneId?: string;
  assetId?: string;
};

export type V3RenderPreflightReport = {
  ok: boolean;
  durationMs: number;
  issues: V3RenderPreflightIssue[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isV3MediaAsset(value: unknown): value is V3MediaAsset {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.trim().length === 0 || value.id.length > 160) return false;
  if (value.kind !== "video" && value.kind !== "narration") return false;
  if (typeof value.label !== "string" || value.label.trim().length === 0 || value.label.length > 240) return false;
  if (typeof value.originalFileName !== "string" || !value.originalFileName || value.originalFileName.length > 240) return false;
  if (typeof value.mimeType !== "string" || !/^(video|audio)\/[a-z0-9.+-]+$/i.test(value.mimeType)) return false;
  if (value.kind === "video" && !value.mimeType.toLowerCase().startsWith("video/")) return false;
  if (value.kind === "narration" && !value.mimeType.toLowerCase().startsWith("audio/")) return false;
  if (typeof value.byteSize !== "number" || !Number.isSafeInteger(value.byteSize) ||
      value.byteSize <= 0 || value.byteSize > MAX_V3_MEDIA_FILE_BYTES) return false;
  if (typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) return false;
  if (typeof value.durationMs !== "number" || !Number.isSafeInteger(value.durationMs) ||
      value.durationMs <= 0) return false;
  if (value.kind === "video") {
    if (typeof value.width !== "number" || !Number.isSafeInteger(value.width) || value.width <= 0 || value.width > 20_000) return false;
    if (typeof value.height !== "number" || !Number.isSafeInteger(value.height) || value.height <= 0 || value.height > 20_000) return false;
    if (value.width * value.height > 30_000_000) return false;
    if (value.durationMs > MAX_V3_SOURCE_CLIP_DURATION_MS) return false;
  } else if (value.width !== null || value.height !== null) {
    return false;
  }
  if (typeof value.importedAt !== "string" || !Number.isFinite(Date.parse(value.importedAt))) return false;
  if (value.rightsStatus !== "unknown" && value.rightsStatus !== "owner-recorded" && value.rightsStatus !== "owner-has-rights") return false;
  if (typeof value.rightsNote !== "string" || value.rightsNote.length > 2_000) return false;
  if (value.reviewState !== "needs-review" && value.reviewState !== "owner-cleared" && value.reviewState !== "rejected") return false;
  return true;
}

/**
 * Conservative preflight for a real owner-footage render.
 * Every scene must point to an existing, locally stored and rights-cleared clip.
 * No image-only scene can pass this video gate.
 */
export function preflightV3OwnerFootageRender(
  scenes: readonly V3BlueprintScene[],
  assets: readonly V3MediaAsset[],
  narrationAssetId: string | null,
): V3RenderPreflightReport {
  const issues: V3RenderPreflightIssue[] = [];
  const assetsById = new Map<string, V3MediaAsset>();
  for (const asset of assets) {
    if (isV3MediaAsset(asset)) assetsById.set(asset.id, asset);
  }

  if (scenes.length === 0) {
    issues.push({ code: "no-scenes", message: "The project has no scenes to render." });
  }

  let totalDurationMs = 0;
  for (const scene of scenes) {
    if (scene.reviewStatus !== "approved") {
      issues.push({
        code: "scene-not-reviewed",
        message: "Review and approve the scene text and its mapped cooking action before rendering.",
        sceneId: scene.id,
      });
    }
    const mediaId = scene.sourceMediaId;
    if (!mediaId) {
      issues.push({
        code: "missing-scene-clip",
        message: "Assign actual video footage to this scene. A still image or scene plan is not a video clip.",
        sceneId: scene.id,
      });
      continue;
    }
    const asset = assetsById.get(mediaId);
    if (!asset) {
      issues.push({
        code: "missing-clip-asset",
        message: "The scene's saved video asset is missing from this device.",
        sceneId: scene.id,
        assetId: mediaId,
      });
      continue;
    }
    if (asset.kind !== "video") {
      issues.push({
        code: "wrong-media-kind",
        message: "Only a video clip can fill a scene. Audio files cannot be used as footage.",
        sceneId: scene.id,
        assetId: mediaId,
      });
      continue;
    }
    if (asset.reviewState !== "owner-cleared" || asset.rightsStatus === "unknown" || !asset.rightsNote.trim()) {
      issues.push({
        code: asset.rightsStatus === "unknown" || !asset.rightsNote.trim() ? "rights-unresolved" : "asset-not-cleared",
        message: "Confirm usage rights and clear this video asset for this project before rendering.",
        sceneId: scene.id,
        assetId: mediaId,
      });
      continue;
    }
    const startMs = scene.sourceMediaStartMs;
    const endMs = scene.sourceMediaEndMs;
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) ||
        (startMs as number) < 0 || (endMs as number) <= (startMs as number)) {
      issues.push({
        code: "invalid-source-range",
        message: "Choose a valid source clip start and end time. V3 will not infer the trim range.",
        sceneId: scene.id,
        assetId: mediaId,
      });
      continue;
    }
    if ((endMs as number) > asset.durationMs) {
      issues.push({
        code: "source-range-out-of-bounds",
        message: "The selected source range exceeds the imported clip duration.",
        sceneId: scene.id,
        assetId: mediaId,
      });
      continue;
    }
    const duration = (endMs as number) - (startMs as number);
    if (scene.targetClipSeconds === null || !Number.isFinite(scene.targetClipSeconds) ||
        Math.abs(scene.targetClipSeconds * 1_000 - duration) > 1) {
      issues.push({
        code: "invalid-source-range",
        message: "The scene duration must match its explicit source clip range.",
        sceneId: scene.id,
        assetId: mediaId,
      });
      continue;
    }
    totalDurationMs += duration;
  }

  if (totalDurationMs > MAX_V3_EXPORT_DURATION_MS) {
    issues.push({
      code: "render-too-long",
      message: "The first V3 browser renderer is limited to 180 seconds. Shorten scene ranges before rendering.",
    });
  }

  const narration = narrationAssetId ? assetsById.get(narrationAssetId) : undefined;
  if (!narration) {
    issues.push({ code: "missing-narration", message: "Choose a real owner-recorded or rights-cleared narration audio file before export." });
  } else if (narration.kind !== "narration") {
    issues.push({ code: "wrong-media-kind", message: "The narration track must be an audio asset.", assetId: narration.id });
  } else {
    if (narration.reviewState !== "owner-cleared" || narration.rightsStatus === "unknown" || !narration.rightsNote.trim()) {
      issues.push({
        code: narration.rightsStatus === "unknown" || !narration.rightsNote.trim() ? "rights-unresolved" : "narration-not-cleared",
        message: "Confirm rights and clear the narration audio before rendering.",
        assetId: narration.id,
      });
    }
    if (narration.durationMs < totalDurationMs) {
      issues.push({
        code: "narration-too-short",
        message: "The narration file is shorter than the assembled video. Trim the video or provide a complete narration track; V3 will not silently time-stretch speech.",
        assetId: narration.id,
      });
    }
  }

  const captionCheck = validateV3SubtitleTimeline(scenes);
  if (!captionCheck.ok) {
    for (const issue of captionCheck.issues) {
      issues.push({
        code: "caption-timing-invalid",
        message: issue.message,
        ...(issue.sceneId ? { sceneId: issue.sceneId } : {}),
      });
    }
  } else {
    for (const scene of scenes) {
      if (scene.captionText.trim() && scene.captionEndMs !== null && scene.captionEndMs > totalDurationMs) {
        issues.push({
          code: "caption-beyond-video",
          message: "A caption ends after the assembled video. Adjust its time or the source scene ranges.",
          sceneId: scene.id,
        });
      }
    }
  }

  return { ok: issues.length === 0, durationMs: totalDurationMs, issues };
}
