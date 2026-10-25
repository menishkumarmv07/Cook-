import {
  validateV3ContentBlueprint,
  verifyV3ContentBlueprintFingerprints,
  type V3ContentBlueprint,
} from "./v3-content-blueprint";
import {
  validateV3ContinuityBible,
  validateV3ContinuityReference,
  type V3ContinuityBible,
  type V3ContinuityReference,
} from "./v3-continuity";
import { buildV3SubtitleFile, validateV3SubtitleTimeline } from "./v3-captions";
import { getV3CreatorReadinessIssues, validateV3CreatorReadiness, type V3CreatorReadiness } from "./v3-creator-readiness";
import { isV3MediaAsset, type V3MediaAsset } from "./v3-rendering";

export const V3_PRODUCTION_BUNDLE_SCHEMA_VERSION = 1 as const;
export const MAX_V3_PRODUCTION_BUNDLE_BYTES = 200 * 1024 * 1024;
const MAX_BUNDLE_FILES = 100;
const MAX_FILENAME_UTF8_BYTES = 220;

export type V3BundleMediaAsset = { metadata: V3MediaAsset; file: Blob };
export type V3BundleReferenceAsset = { metadata: V3ContinuityReference; file: Blob };

export type V3ProductionBundleProject = {
  id: string;
  title: string;
  revision: number;
  blueprint: V3ContentBlueprint;
  referenceBible: V3ContinuityBible;
  narrationMediaId: string | null;
  creatorReadiness: V3CreatorReadiness;
};

export type V3ProductionBundleResult = {
  blob: Blob;
  byteSize: number;
  fileCount: number;
  missingMediaIds: string[];
  missingReferenceIds: string[];
  subtitleFilesIncluded: boolean;
  warnings: string[];
};

type ZipEntry = { path: string; blob: Blob };

type BundleManifest = {
  schemaVersion: typeof V3_PRODUCTION_BUNDLE_SCHEMA_VERSION;
  createdAt: string;
  project: {
    id: string;
    title: string;
    revision: number;
    recipeId: number;
    recipeRevision: number;
    recipeSha256: string;
    creatorProfileSha256: string;
    researchEvidenceSha256: string | null;
    inputSha256: string;
  };
  usage: {
    outputType: "production-bundle-not-rendered-video";
    generatedVideoIncluded: false;
    ownerFootageIncluded: boolean;
    narrationIncluded: boolean;
    subtitleFilesIncluded: boolean;
    visualRealismStatus: "not-tested" | "pass" | "fail";
    continuityBibleVersion: number;
  };
  creatorReadiness: V3CreatorReadiness;
  assets: Array<{
    path: string;
    id: string;
    kind: string;
    label?: string;
    role?: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    durationMs?: number;
    width?: number | null;
    height?: number | null;
    rightsStatus?: string;
    rightsNote?: string;
    reviewState?: string;
  }>;
  missingMediaIds: string[];
  missingReferenceIds: string[];
  warnings: string[];
};

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function safeBaseName(value: string, fallback: string): string {
  const base = value.split(/[\\/]/).pop() ?? fallback;
  const cleaned = base.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\.+/, "").trim();
  return (cleaned || fallback).slice(0, 180);
}

function safeZipPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("The bundle contains an unsafe file path.");
  }
  if (utf8(normalized).byteLength > MAX_FILENAME_UTF8_BYTES) {
    throw new Error("A production-bundle path exceeds the ZIP filename safety limit.");
  }
  return normalized;
}

function dosDateTime(timestamp: string): { time: number; date: number } {
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) throw new Error("The production-bundle timestamp is invalid.");
  const year = Math.max(1980, Math.min(2107, parsed.getFullYear()));
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const hour = parsed.getHours();
  const minute = parsed.getMinutes();
  const second = Math.floor(parsed.getSeconds() / 2);
  return {
    time: (hour << 11) | (minute << 5) | second,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let number = 0; number < 256; number += 1) {
    let value = number;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[number] = value >>> 0;
  }
  return table;
})();

async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const bytes = new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + chunkSize)).arrayBuffer());
    for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/** Return an owned ArrayBuffer so BlobPart stays compatible with strict TS typed-array generics. */
function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function zipStoredEntries(entries: readonly ZipEntry[], timestamp: string): Promise<Blob> {
  if (entries.length === 0 || entries.length > MAX_BUNDLE_FILES) {
    throw new Error("The production bundle must contain between 1 and 100 files.");
  }
  const normalized = entries.map((entry) => ({ path: safeZipPath(entry.path), blob: entry.blob }));
  const names = new Set<string>();
  let totalPayloadBytes = 0;
  for (const entry of normalized) {
    if (names.has(entry.path)) throw new Error("Duplicate bundle file path: " + entry.path);
    names.add(entry.path);
    totalPayloadBytes += entry.blob.size;
    if (entry.blob.size > 0xffffffff || totalPayloadBytes > MAX_V3_PRODUCTION_BUNDLE_BYTES) {
      throw new Error("Production bundle exceeds the 200 MiB safety limit. Export fewer or smaller media files.");
    }
  }
  const stamp = dosDateTime(timestamp);
  const localParts: BlobPart[] = [];
  const centralParts: ArrayBuffer[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of normalized) {
    const nameBytes = utf8(entry.path);
    const crc = await crc32Blob(entry.blob);
    const size = entry.blob.size;
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800); // UTF-8 filename.
    writeUint16(localView, 8, 0); // Store without compression.
    writeUint16(localView, 10, stamp.time);
    writeUint16(localView, 12, stamp.date);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, size);
    writeUint32(localView, 22, size);
    writeUint16(localView, 26, nameBytes.byteLength);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(copyBytesToArrayBuffer(localHeader), entry.blob);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, stamp.time);
    writeUint16(centralView, 14, stamp.date);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, size);
    writeUint32(centralView, 24, size);
    writeUint16(centralView, 28, nameBytes.byteLength);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(copyBytesToArrayBuffer(centralHeader));
    centralSize += centralHeader.byteLength;
    localOffset += localHeader.byteLength + size;
  }

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, normalized.length);
  writeUint16(endView, 10, normalized.length);
  writeUint32(endView, 12, centralSize);
  writeUint32(endView, 16, localOffset);
  writeUint16(endView, 20, 0);

  return new Blob([...localParts, ...centralParts, copyBytesToArrayBuffer(endRecord)], { type: "application/zip" });
}

async function sha256Blob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure SHA-256 is unavailable. Bundle export is disabled in this browser.");
  const hash = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createV3ProductionBundle(input: {
  project: V3ProductionBundleProject;
  mediaAssets: readonly V3BundleMediaAsset[];
  references: readonly V3BundleReferenceAsset[];
  now?: string;
}): Promise<V3ProductionBundleResult> {
  const { project } = input;
  if (!project.id || !Number.isSafeInteger(project.revision) || project.revision < 1 ||
      typeof project.title !== "string" || !validateV3ContentBlueprint(project.blueprint) ||
      !validateV3ContinuityBible(project.referenceBible) ||
      !validateV3CreatorReadiness(project.creatorReadiness)) {
    throw new Error("The selected V3 project failed validation. No production bundle was created.");
  }
  if (!(await verifyV3ContentBlueprintFingerprints(project.blueprint))) {
    throw new Error("The blueprint source fingerprints do not match. Save a verified source snapshot before bundling.");
  }
  if (project.narrationMediaId !== null && typeof project.narrationMediaId !== "string") {
    throw new Error("The project narration selection is invalid.");
  }

  const now = input.now ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error("The bundle timestamp is invalid.");
  const warnings: string[] = [
    "This ZIP is a production bundle, not a rendered or AI-generated video.",
    "Review every scene and check cooking safety, rights and platform disclosure before publishing.",
    "Visual realism is not proven by references, metadata or a production bundle.",
  ];
  const readinessIssues = getV3CreatorReadinessIssues(project.creatorReadiness);
  warnings.push(...readinessIssues.map((issue) => "Creator-readiness review: " + issue));
  const mediaById = new Map<string, V3BundleMediaAsset>();
  for (const item of input.mediaAssets) {
    if (!isV3MediaAsset(item.metadata) || item.file.size !== item.metadata.byteSize ||
        item.file.type !== item.metadata.mimeType) {
      throw new Error("A selected media asset failed bundle validation.");
    }
    mediaById.set(item.metadata.id, item);
  }
  const referencesById = new Map<string, V3BundleReferenceAsset>();
  for (const item of input.references) {
    if (!validateV3ContinuityReference(item.metadata) || item.file.size !== item.metadata.byteSize ||
        item.file.type !== item.metadata.mimeType) {
      throw new Error("A Chef & Kitchen reference failed bundle validation.");
    }
    referencesById.set(item.metadata.id, item);
  }

  const files: ZipEntry[] = [];
  const filesManifest: BundleManifest["assets"] = [];
  const missingMediaIds: string[] = [];
  const missingReferenceIds: string[] = [];
  const usedMediaIds = new Set<string>();
  for (const scene of project.blueprint.scenes) {
    if (scene.sourceMediaId) usedMediaIds.add(scene.sourceMediaId);
  }
  if (project.narrationMediaId) usedMediaIds.add(project.narrationMediaId);

  let videoCount = 0;
  let audioCount = 0;
  for (const id of usedMediaIds) {
    const item = mediaById.get(id);
    if (!item) {
      missingMediaIds.push(id);
      continue;
    }
    const metadata = item.metadata;
    if (await sha256Blob(item.file) !== metadata.sha256) {
      throw new Error("A selected media file failed SHA-256 verification. Nothing was exported.");
    }
    const extension = safeBaseName(metadata.originalFileName, "media").split(".").pop()?.toLowerCase();
    const safeExtension = extension && /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
    const path = metadata.kind === "video"
      ? "media/video-" + String(++videoCount).padStart(2, "0") + "." + safeExtension
      : "media/narration-" + String(++audioCount).padStart(2, "0") + "." + safeExtension;
    files.push({ path, blob: item.file });
    filesManifest.push({
      path,
      id: metadata.id,
      kind: metadata.kind,
      label: metadata.label,
      mimeType: metadata.mimeType,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
      durationMs: metadata.durationMs,
      width: metadata.width,
      height: metadata.height,
      rightsStatus: metadata.rightsStatus,
      rightsNote: metadata.rightsNote,
      reviewState: metadata.reviewState,
    });
    if (metadata.reviewState !== "owner-cleared" || metadata.rightsStatus === "unknown" || !metadata.rightsNote.trim()) {
      warnings.push("Media asset " + metadata.label + " is not fully rights-cleared; do not treat its presence in the ZIP as permission to publish.");
    }
  }

  let referenceCount = 0;
  for (const id of project.referenceBible.referenceIds) {
    const item = referencesById.get(id);
    if (!item) {
      missingReferenceIds.push(id);
      continue;
    }
    if (await sha256Blob(item.file) !== item.metadata.sha256) {
      throw new Error("A pinned reference image failed SHA-256 verification. Nothing was exported.");
    }
    if (item.metadata.reviewState !== "approved") {
      warnings.push("Reference " + item.metadata.label + " is not owner-approved; review before using it as a continuity source.");
    }
    const extension = safeBaseName(item.metadata.originalFileName, "reference").split(".").pop()?.toLowerCase();
    const safeExtension = extension && /^(jpg|jpeg|png|webp)$/.test(extension) ? extension : "bin";
    const path = "references/reference-" + String(++referenceCount).padStart(2, "0") + "." + safeExtension;
    files.push({ path, blob: item.file });
    filesManifest.push({
      path,
      id: item.metadata.id,
      kind: "reference-image",
      label: item.metadata.label,
      role: item.metadata.role,
      mimeType: item.metadata.mimeType,
      byteSize: item.metadata.byteSize,
      sha256: item.metadata.sha256,
      width: item.metadata.width,
      height: item.metadata.height,
      reviewState: item.metadata.reviewState,
    });
  }

  if (missingMediaIds.length) warnings.push("One or more referenced video/audio files are not available on this device; see missingMediaIds in timeline-manifest.json.");
  if (missingReferenceIds.length) warnings.push("One or more pinned reference images are not available on this device; see missingReferenceIds in timeline-manifest.json.");

  const subtitleTimeline = validateV3SubtitleTimeline(project.blueprint.scenes);
  let subtitleFilesIncluded = false;
  if (subtitleTimeline.ok) {
    files.push({ path: "captions/captions.srt", blob: new Blob([buildV3SubtitleFile(project.blueprint.scenes, "srt")], { type: "application/x-subrip;charset=utf-8" }) });
    files.push({ path: "captions/captions.vtt", blob: new Blob([buildV3SubtitleFile(project.blueprint.scenes, "vtt")], { type: "text/vtt;charset=utf-8" }) });
    subtitleFilesIncluded = true;
  } else {
    warnings.push("Captions were not exported as SRT/WebVTT because the manually entered timeline is incomplete or invalid.");
  }

  const script = [
    "# " + (project.blueprint.recipeTitle || project.title),
    "",
    "Production notes — not a rendered video.",
    "Recipe snapshot SHA-256: " + project.blueprint.fingerprints.recipeSha256,
    "Evidence snapshot SHA-256: " + (project.blueprint.fingerprints.researchEvidenceSha256 ?? "not included"),
    "",
    ...project.blueprint.scenes.map((scene, index) => [
      "## Scene " + String(index + 1).padStart(2, "0") + " — " + scene.title,
      "",
      "- Type: " + scene.kind,
      "- Review state: " + scene.reviewStatus,
      "- Narration draft: " + (scene.narrationText || "[not recorded]"),
      "- Caption draft: " + (scene.captionText || "[not recorded]"),
      "- Caption start/end (global timeline, ms): " + (scene.captionStartMs === null ? "unknown" : scene.captionStartMs) + " / " + (scene.captionEndMs === null ? "unknown" : scene.captionEndMs),
      "- Source footage ID: " + (scene.sourceMediaId ?? "not assigned"),
      "- Source trim (ms): " + (scene.sourceMediaStartMs === null ? "unknown" : scene.sourceMediaStartMs) + " / " + (scene.sourceMediaEndMs === null ? "unknown" : scene.sourceMediaEndMs),
      "- Visual direction: " + (scene.visualDirection || "[not recorded]"),
      "- Source trace: " + (scene.trace.length ? scene.trace.map((trace) => trace.entityType + ":" + trace.entityId + "[" + trace.fields.join(", ") + "]").join("; ") : "no explicit mapping"),
      "",
    ].join("\n")),
    "## Warnings",
    "",
    ...project.blueprint.warnings.map((warning) => "- " + warning.code + ": " + warning.message),
  ].join("\n");
  files.push({ path: "script/scene-script.md", blob: new Blob([script], { type: "text/markdown;charset=utf-8" }) });
  files.push({ path: "blueprint/blueprint.json", blob: new Blob([JSON.stringify(project.blueprint, null, 2)], { type: "application/json;charset=utf-8" }) });

  const manifest: BundleManifest = {
    schemaVersion: V3_PRODUCTION_BUNDLE_SCHEMA_VERSION,
    createdAt: now,
    project: {
      id: project.id,
      title: project.title,
      revision: project.revision,
      recipeId: project.blueprint.sourceSnapshot.recipe.id,
      recipeRevision: project.blueprint.sourceSnapshot.recipe.recipeRevision,
      recipeSha256: project.blueprint.fingerprints.recipeSha256,
      creatorProfileSha256: project.blueprint.fingerprints.creatorProfileSha256,
      researchEvidenceSha256: project.blueprint.fingerprints.researchEvidenceSha256,
      inputSha256: project.blueprint.fingerprints.inputsSha256,
    },
    usage: {
      outputType: "production-bundle-not-rendered-video",
      generatedVideoIncluded: false,
      ownerFootageIncluded: videoCount > 0,
      narrationIncluded: audioCount > 0,
      subtitleFilesIncluded,
      visualRealismStatus: project.referenceBible.visualRealismStatus,
      continuityBibleVersion: project.referenceBible.version,
    },
    creatorReadiness: project.creatorReadiness,
    assets: filesManifest,
    missingMediaIds: missingMediaIds.sort(),
    missingReferenceIds: missingReferenceIds.sort(),
    warnings,
  };
  files.push({ path: "timeline-manifest.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" }) });
  files.push({ path: "chef-kitchen-bible.json", blob: new Blob([JSON.stringify(project.referenceBible, null, 2)], { type: "application/json;charset=utf-8" }) });
  files.push({ path: "creator-readiness.json", blob: new Blob([JSON.stringify(project.creatorReadiness, null, 2)], { type: "application/json;charset=utf-8" }) });
  files.push({
    path: "README.txt",
    blob: new Blob([
      "COOKING CREATOR V3 PRODUCTION BUNDLE\n\n" +
      "This archive is NOT a rendered video. It contains an editable recipe-specific scene plan, local footage/narration assets that were selected for this project, pinned reference images that were available locally, manual captions when valid, and a provenance/timeline manifest.\n" +
      "Target platform: " + project.creatorReadiness.platform + ". See creator-readiness.json and timeline-manifest.json for the editable posting copy, selected media origin and pending owner checklist items. A complete checklist is not platform approval.\n\n" +
      "No media was uploaded by V3 to create this archive. The archive can contain personal reference images and source footage. Store and share it carefully.\n\n" +
      warnings.map((warning) => "- " + warning).join("\n") + "\n",
    ], { type: "text/plain;charset=utf-8" }),
  });

  const zip = await zipStoredEntries(files, now);
  if (zip.size > MAX_V3_PRODUCTION_BUNDLE_BYTES) {
    throw new Error("The finished ZIP exceeded the 200 MiB safety limit. Export fewer/smaller assets.");
  }
  return {
    blob: zip,
    byteSize: zip.size,
    fileCount: files.length,
    missingMediaIds,
    missingReferenceIds,
    subtitleFilesIncluded,
    warnings,
  };
}

/** Exportable for tests; production UI should use createV3ProductionBundle. */
export async function buildV3ZipForTests(entries: readonly { path: string; content: string }[], now = "2026-10-25T16:00:00.000Z"): Promise<Blob> {
  return zipStoredEntries(entries.map((entry) => ({
    path: entry.path,
    blob: new Blob([entry.content], { type: "text/plain;charset=utf-8" }),
  })), now);
}
