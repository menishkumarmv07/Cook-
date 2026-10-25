"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  DEFAULT_CREATOR_PROFILE,
  isCreatorProfile,
  parseRecipeProjectJSON,
  type CreatorProfile,
  type RecipeProject,
} from "@/lib/recipe";
import {
  createEmptyResearchEvidenceArchive,
  parseResearchEvidenceArchive,
  type ResearchEvidenceArchive,
} from "@/lib/research-evidence";
import {
  buildV3ContentBlueprint,
  createV3ContentBlueprintBackupJSON,
  parseV3ContentBlueprintBackupJSON,
  validateV3ContentBlueprint,
  verifyV3ContentBlueprintFingerprints,
  type V3ContentBlueprint,
  type V3BlueprintScene,
} from "@/lib/v3-content-blueprint";
import { buildV3SubtitleFile, validateV3SubtitleTimeline, type V3SubtitleFormat } from "@/lib/v3-captions";
import {
  createEmptyV3ContinuityBible,
  incrementV3ContinuityBibleVersion,
  MAX_V3_REFERENCE_BYTES,
  validateV3ContinuityBible,
  validateV3ContinuityReference,
  V3_REFERENCE_IMAGE_MIME_TYPES,
  type V3ContinuityBible,
  type V3ContinuityReference,
  type V3ReferenceRole,
} from "@/lib/v3-continuity";
import {
  isV3MediaAsset,
  MAX_V3_MEDIA_ASSETS,
  MAX_V3_MEDIA_FILE_BYTES,
  MAX_V3_MEDIA_LIBRARY_BYTES,
  preflightV3OwnerFootageRender,
  type V3MediaAsset,
  type V3MediaKind,
  type V3MediaRightsStatus,
} from "@/lib/v3-rendering";

const RECIPE_STORAGE_KEY = "cooking-creator-v1-drafts";
const PROFILE_STORAGE_KEY = "cooking-creator-profile-v1";
const EVIDENCE_DATABASE_NAME = "cooking-creator-research-evidence";
const EVIDENCE_DATABASE_VERSION = 1;
const EVIDENCE_STORE = "archives";
const EVIDENCE_ARCHIVE_KEY = "primary";
const PROJECT_DATABASE_NAME = "cooking-creator-v3-content-studio";
const PROJECT_DATABASE_VERSION = 3;
const PROJECT_STORE = "projects";
const REFERENCE_STORE = "references";
const MEDIA_STORE = "media";
const MAX_V3_REFERENCE_COUNT = 20;
const MAX_V3_REFERENCE_TOTAL_BYTES = 80 * 1024 * 1024;
const MAX_BACKUP_BYTES = 15 * 1024 * 1024;

type V3StudioProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  blueprint: V3ContentBlueprint;
  referenceBible: V3ContinuityBible;
  narrationMediaId: string | null;
};

type StoredV3Reference = {
  metadata: V3ContinuityReference;
  file: Blob;
};

type StoredV3Media = {
  metadata: V3MediaAsset;
  file: Blob;
};

type V3ReferenceRoleOption = {
  value: V3ReferenceRole;
  label: string;
  description: string;
};

const V3_REFERENCE_ROLE_OPTIONS: readonly V3ReferenceRoleOption[] = [
  { value: "chef-identity", label: "Chef identity", description: "An owner-approved reference for the chef's appearance." },
  { value: "chef-wardrobe", label: "Chef wardrobe", description: "Approved clothing/hat/wardrobe reference." },
  { value: "kitchen-wide", label: "Kitchen wide view", description: "Overall layout and background." },
  { value: "kitchen-detail", label: "Kitchen detail", description: "Counter, lighting, cupboards or fixed background details." },
  { value: "cookware-prop", label: "Cookware / prop", description: "Specific cookware or props to preserve." },
  { value: "finished-dish", label: "Finished dish", description: "A reference dish image; not proof that the recipe result is correct." },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredProject(value: unknown): value is V3StudioProject {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) &&
    typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 1 &&
    (value.narrationMediaId === null || typeof value.narrationMediaId === "string") &&
    validateV3ContentBlueprint(value.blueprint) &&
    validateV3ContinuityBible(value.referenceBible);
}

function normalizeStoredBlueprint(value: unknown): { blueprint: V3ContentBlueprint; migrated: boolean } | null {
  if (!isRecord(value) || !Array.isArray(value.scenes)) return null;
  let migrated = false;
  const scenes = value.scenes.map((scene) => {
    if (!isRecord(scene)) return scene;
    const nextScene = { ...scene };
    if (nextScene.captionStartMs === undefined) {
      nextScene.captionStartMs = null;
      migrated = true;
    }
    if (nextScene.captionEndMs === undefined) {
      nextScene.captionEndMs = null;
      migrated = true;
    }
    if (nextScene.sourceMediaId === undefined) {
      nextScene.sourceMediaId = null;
      migrated = true;
    }
    if (nextScene.sourceMediaStartMs === undefined) {
      nextScene.sourceMediaStartMs = null;
      migrated = true;
    }
    if (nextScene.sourceMediaEndMs === undefined) {
      nextScene.sourceMediaEndMs = null;
      migrated = true;
    }
    if (nextScene.targetClipSeconds === undefined) {
      nextScene.targetClipSeconds = null;
      migrated = true;
    }
    return nextScene;
  });
  const candidate = { ...value, scenes };
  if (!validateV3ContentBlueprint(candidate)) return null;
  return { blueprint: candidate, migrated };
}

function normalizeStoredProject(value: unknown): { project: V3StudioProject; migrated: boolean } | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id ||
      typeof value.title !== "string" ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt)) ||
      typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    return null;
  }
  const normalizedBlueprint = normalizeStoredBlueprint(value.blueprint);
  if (!normalizedBlueprint) return null;
  let bible: V3ContinuityBible;
  let migrated = normalizedBlueprint.migrated;
  if (value.referenceBible === undefined) {
    bible = createEmptyV3ContinuityBible();
    migrated = true;
  } else {
    if (!validateV3ContinuityBible(value.referenceBible)) return null;
    bible = value.referenceBible;
  }
  return {
    project: {
      id: value.id,
      title: value.title,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      revision: value.revision,
      blueprint: normalizedBlueprint.blueprint,
      referenceBible: bible,
      narrationMediaId: value.narrationMediaId === undefined ? null : value.narrationMediaId as string | null,
    },
    migrated: migrated || value.narrationMediaId === undefined,
  };
}

function isStoredReference(value: unknown): value is StoredV3Reference {
  if (!isRecord(value) || !(value.file instanceof Blob)) return false;
  if (!validateV3ContinuityReference(value.metadata)) return false;
  return value.file.size === value.metadata.byteSize && value.file.type === value.metadata.mimeType;
}

function isStoredMedia(value: unknown): value is StoredV3Media {
  if (!isRecord(value) || !(value.file instanceof Blob)) return false;
  if (!isV3MediaAsset(value.metadata)) return false;
  return value.file.size === value.metadata.byteSize && value.file.type === value.metadata.mimeType;
}

function openDatabase(
  name: string,
  version: number,
  storeName: string,
  keyPath?: string,
): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support IndexedDB. V3 projects cannot be safely saved here."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    let settled = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (name === PROJECT_DATABASE_NAME) {
        if (!database.objectStoreNames.contains(PROJECT_STORE)) {
          database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(REFERENCE_STORE)) {
          database.createObjectStore(REFERENCE_STORE, { keyPath: "metadata.id" });
        }
        if (!database.objectStoreNames.contains(MEDIA_STORE)) {
          database.createObjectStore(MEDIA_STORE, { keyPath: "metadata.id" });
        }
      } else if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, keyPath ? { keyPath } : undefined);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error("Could not open local V3 project storage."));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("V3 project storage is busy in another tab. Close the other tab and retry."));
    };
  });
}

async function hashBlobSha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure SHA-256 is unavailable in this browser. The reference was not imported.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadStoredReferences(): Promise<StoredV3Reference[]> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, REFERENCE_STORE, "id");
  try {
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction(REFERENCE_STORE, "readonly");
      const request = transaction.objectStore(REFERENCE_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error("Could not load local Chef & Kitchen references."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Loading local references was interrupted."));
    });
    if (records.length > MAX_V3_REFERENCE_COUNT) {
      throw new Error("The local reference library exceeds the safe reference count. Export/inspect your work before adding more.");
    }
    let totalBytes = 0;
    const valid: StoredV3Reference[] = [];
    for (const record of records) {
      if (!isStoredReference(record)) {
        throw new Error("A saved Chef & Kitchen reference failed metadata/file validation. No references were overwritten.");
      }
      totalBytes += record.file.size;
      if (totalBytes > MAX_V3_REFERENCE_TOTAL_BYTES) {
        throw new Error("The local Chef & Kitchen reference library exceeds its 80 MiB safety limit.");
      }
      if (await hashBlobSha256(record.file) !== record.metadata.sha256) {
        throw new Error("A saved reference failed SHA-256 integrity verification. Keep the current data and restore a known-good backup if available.");
      }
      valid.push(record);
    }
    return valid.sort((a, b) => b.metadata.importedAt.localeCompare(a.metadata.importedAt));
  } finally {
    database.close();
  }
}

async function persistNewReference(reference: StoredV3Reference, current: readonly StoredV3Reference[]): Promise<void> {
  if (!isStoredReference(reference)) throw new Error("The reference metadata or image file failed validation.");
  if (current.length >= MAX_V3_REFERENCE_COUNT) throw new Error("The library supports up to 20 local references.");
  const total = current.reduce((sum, item) => sum + item.file.size, 0);
  if (total + reference.file.size > MAX_V3_REFERENCE_TOTAL_BYTES) {
    throw new Error("The 80 MiB local reference-library limit would be exceeded. Nothing was saved.");
  }
  if (current.some((item) => item.metadata.sha256 === reference.metadata.sha256 && item.metadata.role === reference.metadata.role)) {
    throw new Error("That exact image is already saved with this reference role. No duplicate was added.");
  }

  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, REFERENCE_STORE, "id");
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(REFERENCE_STORE, "readwrite");
      const store = transaction.objectStore(REFERENCE_STORE);
      const duplicateRequest = store.get(reference.metadata.id);
      let safeError: Error | null = null;
      duplicateRequest.onsuccess = () => {
        if (duplicateRequest.result !== undefined) {
          safeError = new Error("This reference ID already exists. Nothing was overwritten.");
          transaction.abort();
          return;
        }
        store.add(reference);
      };
      duplicateRequest.onerror = () => {
        safeError = new Error("Could not check the reference ID. Nothing was saved.");
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not save the local reference."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Reference import was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function updateStoredReferenceMetadata(
  referenceId: string,
  expectedSha256: string,
  update: (metadata: V3ContinuityReference) => V3ContinuityReference,
): Promise<StoredV3Reference> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, REFERENCE_STORE, "id");
  try {
    return await new Promise<StoredV3Reference>((resolve, reject) => {
      const transaction = database.transaction(REFERENCE_STORE, "readwrite");
      const store = transaction.objectStore(REFERENCE_STORE);
      const request = store.get(referenceId);
      let safeError: Error | null = null;
      let result: StoredV3Reference | null = null;
      request.onsuccess = () => {
        if (!isStoredReference(request.result) || request.result.metadata.sha256 !== expectedSha256) {
          safeError = new Error("This reference changed in another tab. Reload the library before changing its review status.");
          transaction.abort();
          return;
        }
        const updated: StoredV3Reference = {
          ...request.result,
          metadata: update(request.result.metadata),
        };
        if (!isStoredReference(updated)) {
          safeError = new Error("The proposed reference metadata failed validation. No update was saved.");
          transaction.abort();
          return;
        }
        store.put(updated);
        result = updated;
      };
      request.onerror = () => {
        safeError = new Error("Could not read the current reference metadata.");
        transaction.abort();
      };
      transaction.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("Reference metadata update completed without a result."));
      };
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not update the reference metadata."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Reference metadata update was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function deleteStoredReference(referenceId: string, expectedSha256: string): Promise<void> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, REFERENCE_STORE, "id");
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(REFERENCE_STORE, "readwrite");
      const store = transaction.objectStore(REFERENCE_STORE);
      const request = store.get(referenceId);
      let safeError: Error | null = null;
      request.onsuccess = () => {
        if (!isStoredReference(request.result) || request.result.metadata.sha256 !== expectedSha256) {
          safeError = new Error("The reference changed in another tab. Reload before removing it.");
          transaction.abort();
          return;
        }
        store.delete(referenceId);
      };
      request.onerror = () => {
        safeError = new Error("Could not verify the reference before removal.");
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not remove the local reference."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Reference removal was interrupted."));
    });
  } finally {
    database.close();
  }
}

function mediaExtensionMatches(fileName: string, kind: V3MediaKind, mimeType: string): boolean {
  const extension = fileName.toLowerCase().split(".").pop() || "";
  const videoTypes: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    ogv: "video/ogg",
    ogg: "video/ogg",
  };
  const audioTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    webm: "audio/webm",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
  };
  return (kind === "video" ? videoTypes : audioTypes)[extension] === mimeType;
}

function mediaSignatureMatches(file: File, bytes: Uint8Array, kind: V3MediaKind): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (file.type === "video/webm" || file.type === "audio/webm") {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (file.type === "video/mp4" || file.type === "video/quicktime" || file.type === "audio/mp4") {
    return bytes.length >= 12 && ascii(4, 8) === "ftyp";
  }
  if (file.type === "video/ogg" || file.type === "audio/ogg") {
    return bytes.length >= 4 && ascii(0, 4) === "OggS";
  }
  if (file.type === "audio/wav") {
    return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
  }
  if (file.type === "audio/mpeg") {
    return bytes.length >= 3 && (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  }
  return false;
}

async function readMediaFileMetadata(file: File, kind: V3MediaKind): Promise<{
  durationMs: number; width: number | null; height: number | null;
}> {
  const objectUrl = URL.createObjectURL(file);
  const element = kind === "video" ? document.createElement("video") : document.createElement("audio");
  element.preload = "auto";
  if (element instanceof HTMLVideoElement) {
    element.muted = true;
    element.playsInline = true;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      let metadataReady = false;
      let decodeReady = kind === "narration";
      let settled = false;
      const timeout = window.setTimeout(() => finish(new Error("Browser media metadata/decode check timed out. Try a shorter clip or a supported format.")), 20_000);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const maybeFinish = () => {
        if (metadataReady && decodeReady) finish();
      };
      element.onloadedmetadata = () => {
        metadataReady = true;
        maybeFinish();
      };
      element.onloadeddata = () => {
        decodeReady = true;
        maybeFinish();
      };
      element.onerror = () => finish(new Error("This browser could not decode the selected media. Try a different MP4/WebM or WAV/MP3 file."));
      element.src = objectUrl;
      element.load();
    });

    const durationMs = Math.round(element.duration * 1_000);
    if (!Number.isSafeInteger(durationMs) || durationMs < 1) throw new Error("Media duration is missing or invalid.");
    if (kind === "video") {
      const video = element as HTMLVideoElement;
      if (durationMs > 5 * 60 * 1_000) throw new Error("Each imported source clip is limited to five minutes for safe browser rendering.");
      if (!Number.isSafeInteger(video.videoWidth) || !Number.isSafeInteger(video.videoHeight) ||
          video.videoWidth < 1 || video.videoHeight < 1 ||
          video.videoWidth > 20_000 || video.videoHeight > 20_000 ||
          video.videoWidth * video.videoHeight > 30_000_000) {
        throw new Error("The source video dimensions exceed V3's 30-megapixel safety limit.");
      }
      return { durationMs, width: video.videoWidth, height: video.videoHeight };
    }
    if (durationMs > 10 * 60 * 1_000) throw new Error("Narration files are limited to ten minutes; shorten the audio before importing.");
    return { durationMs, width: null, height: null };
  } finally {
    element.pause();
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadStoredMedia(): Promise<StoredV3Media[]> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, MEDIA_STORE, "id");
  try {
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction(MEDIA_STORE, "readonly");
      const request = transaction.objectStore(MEDIA_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error("Could not load local video and narration assets."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Loading local media was interrupted."));
    });
    if (records.length > MAX_V3_MEDIA_ASSETS) throw new Error("The local media library exceeds its 30-asset safety limit.");
    let totalBytes = 0;
    const valid: StoredV3Media[] = [];
    for (const record of records) {
      if (!isStoredMedia(record)) throw new Error("A saved media asset failed metadata/file validation. Nothing was overwritten.");
      totalBytes += record.file.size;
      if (totalBytes > MAX_V3_MEDIA_LIBRARY_BYTES) throw new Error("The local media library exceeds its 400 MiB safety limit.");
      if (await hashBlobSha256(record.file) !== record.metadata.sha256) {
        throw new Error("A saved media asset failed SHA-256 integrity verification. Keep the project data and investigate before exporting.");
      }
      valid.push(record);
    }
    return valid.sort((a, b) => b.metadata.importedAt.localeCompare(a.metadata.importedAt));
  } finally {
    database.close();
  }
}

async function persistNewMedia(asset: StoredV3Media, current: readonly StoredV3Media[]): Promise<void> {
  if (!isStoredMedia(asset)) throw new Error("The selected media failed metadata/file validation.");
  if (current.length >= MAX_V3_MEDIA_ASSETS) throw new Error("The media library supports up to 30 source clips/narration files.");
  const currentBytes = current.reduce((sum, item) => sum + item.file.size, 0);
  if (currentBytes + asset.file.size > MAX_V3_MEDIA_LIBRARY_BYTES) throw new Error("The 400 MiB local media limit would be exceeded.");
  if (current.some((item) => item.metadata.sha256 === asset.metadata.sha256 && item.metadata.kind === asset.metadata.kind)) {
    throw new Error("This exact media file is already imported in the same role. No duplicate was added.");
  }
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, MEDIA_STORE, "id");
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const request = store.get(asset.metadata.id);
      let safeError: Error | null = null;
      request.onsuccess = () => {
        if (request.result !== undefined) {
          safeError = new Error("This media ID already exists. Nothing was overwritten.");
          transaction.abort();
          return;
        }
        store.add(asset);
      };
      request.onerror = () => {
        safeError = new Error("Could not check this media ID. Nothing was saved.");
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not save media locally."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Media import was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function updateStoredMediaMetadata(
  mediaId: string,
  expectedSha256: string,
  update: (metadata: V3MediaAsset) => V3MediaAsset,
): Promise<StoredV3Media> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, MEDIA_STORE, "id");
  try {
    return await new Promise<StoredV3Media>((resolve, reject) => {
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const request = store.get(mediaId);
      let safeError: Error | null = null;
      let result: StoredV3Media | null = null;
      request.onsuccess = () => {
        if (!isStoredMedia(request.result) || request.result.metadata.sha256 !== expectedSha256) {
          safeError = new Error("This media asset changed in another tab. Reload before changing its review status.");
          transaction.abort();
          return;
        }
        const updated = { ...request.result, metadata: update(request.result.metadata) };
        if (!isStoredMedia(updated)) {
          safeError = new Error("The proposed media metadata failed validation. No change was saved.");
          transaction.abort();
          return;
        }
        store.put(updated);
        result = updated;
      };
      request.onerror = () => {
        safeError = new Error("Could not read the media asset before updating its metadata.");
        transaction.abort();
      };
      transaction.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("Media metadata update completed without a result."));
      };
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not update media metadata."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Media metadata update was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function deleteStoredMedia(mediaId: string, expectedSha256: string): Promise<void> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, MEDIA_STORE, "id");
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(MEDIA_STORE, "readwrite");
      const store = transaction.objectStore(MEDIA_STORE);
      const request = store.get(mediaId);
      let safeError: Error | null = null;
      request.onsuccess = () => {
        if (!isStoredMedia(request.result) || request.result.metadata.sha256 !== expectedSha256) {
          safeError = new Error("The media asset changed in another tab. Reload before removing it.");
          transaction.abort();
          return;
        }
        store.delete(mediaId);
      };
      request.onerror = () => {
        safeError = new Error("Could not verify the media asset before removal.");
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not remove local media."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Media removal was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  let width = 0;
  let height = 0;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      width = bitmap.width;
      height = bitmap.height;
    } finally {
      bitmap.close();
    }
  } else {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The selected file is not a decodable image."));
        image.src = url;
      });
      width = image.naturalWidth;
      height = image.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 20_000 || height > 20_000 || width * height > 30_000_000) {
    throw new Error("The image dimensions exceed V3's safety limit (maximum 20,000 pixels per side and 30 megapixels).");
  }
  return { width, height };
}

function imageSignatureMatches(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

async function readEvidenceArchive(): Promise<ResearchEvidenceArchive> {
  const database = await openDatabase(
    EVIDENCE_DATABASE_NAME,
    EVIDENCE_DATABASE_VERSION,
    EVIDENCE_STORE,
  );
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(EVIDENCE_STORE, "readonly");
      const request = transaction.objectStore(EVIDENCE_STORE).get(EVIDENCE_ARCHIVE_KEY);
      request.onsuccess = () => {
        if (request.result === undefined) {
          resolve(createEmptyResearchEvidenceArchive());
          return;
        }
        const archive = parseResearchEvidenceArchive(request.result);
        if (!archive) {
          reject(new Error("The saved Research Studio ledger failed validation. V3 did not modify it."));
          return;
        }
        resolve(archive);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read the local Research Studio ledger."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Reading Research Studio evidence was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function persistMigratedProjectIfUnchanged(
  original: unknown,
  migrated: V3StudioProject,
): Promise<void> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_STORE, "id");
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, "readwrite");
      const store = transaction.objectStore(PROJECT_STORE);
      const request = store.get(migrated.id);
      let safeError: Error | null = null;
      request.onsuccess = () => {
        if (JSON.stringify(request.result) !== JSON.stringify(original)) {
          safeError = new Error("A saved project changed during schema migration. No newer data was overwritten; reload V3 and retry.");
          transaction.abort();
          return;
        }
        store.put(migrated);
      };
      request.onerror = () => {
        safeError = new Error("Could not verify a project before migration. No project was changed.");
        transaction.abort();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not migrate a V3 project."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("V3 project migration was interrupted."));
    });
  } finally {
    database.close();
  }
}

async function loadStoredProjects(): Promise<V3StudioProject[]> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_STORE, "id");
  let records: unknown[];
  try {
    records = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      const request = transaction.objectStore(PROJECT_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error ?? new Error("Could not list saved V3 projects."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Listing V3 projects was interrupted."));
    });
  } finally {
    database.close();
  }

  const projects: V3StudioProject[] = [];
  for (const record of records) {
    const normalized = normalizeStoredProject(record);
    if (!normalized || !(await verifyV3ContentBlueprintFingerprints(normalized.project.blueprint))) {
      throw new Error("A saved V3 project failed schema or source-fingerprint verification. No saved project was overwritten; keep a backup and investigate this record.");
    }
    if (normalized.migrated) {
      await persistMigratedProjectIfUnchanged(record, normalized.project);
    }
    projects.push(normalized.project);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Create/update is guarded by an IndexedDB transaction and a revision check.
 * A stale tab cannot silently overwrite a newer saved project.
 */
async function persistProject(
  project: V3StudioProject,
  expectedRevision: number | null,
): Promise<V3StudioProject> {
  const database = await openDatabase(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION, PROJECT_STORE, "id");
  try {
    const saved = await new Promise<V3StudioProject>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, "readwrite");
      const store = transaction.objectStore(PROJECT_STORE);
      const request = store.get(project.id);
      let safeError: Error | null = null;
      let result: V3StudioProject | null = null;

      request.onsuccess = () => {
        const existing = request.result;
        if (expectedRevision === null) {
          if (existing !== undefined) {
            safeError = new Error("This new project ID already exists. Nothing was overwritten.");
            transaction.abort();
            return;
          }
          store.add(project);
          result = project;
          return;
        }
        if (!isStoredProject(existing) || existing.revision !== expectedRevision) {
          safeError = new Error("This project changed in another tab. Your edits were not saved over the newer version; reload the project before trying again.");
          transaction.abort();
          return;
        }
        store.put(project);
        result = project;
      };
      request.onerror = () => {
        safeError = new Error("Could not check the last saved project version. Nothing was intentionally overwritten.");
        transaction.abort();
      };
      transaction.oncomplete = () => {
        if (result) resolve(result);
        else reject(new Error("V3 save completed without a project result."));
      };
      transaction.onerror = () => reject(safeError ?? transaction.error ?? new Error("Could not save the V3 project."));
      transaction.onabort = () => reject(safeError ?? transaction.error ?? new Error("Saving the V3 project was interrupted."));
    });
    return saved;
  } finally {
    database.close();
  }
}

function readSavedRecipes(): { recipes: RecipeProject[]; skipped: number } {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECIPE_STORAGE_KEY);
  } catch {
    throw new Error("Browser storage is unavailable, so V3 could not read your saved V2 recipes.");
  }
  if (!raw) return { recipes: [], skipped: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The saved V2 recipe list is unreadable. V3 has not changed it; export or recover your existing work first.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("The saved V2 recipe list has an unexpected format. V3 has not changed it.");
  }
  const recipes: RecipeProject[] = [];
  let skipped = 0;
  for (const item of parsed) {
    const serialized = JSON.stringify(item);
    if (typeof serialized !== "string") {
      skipped += 1;
      continue;
    }
    const validated = parseRecipeProjectJSON(serialized);
    if (validated) recipes.push(validated);
    else skipped += 1;
  }
  return { recipes: recipes.sort((a, b) => a.name.localeCompare(b.name)), skipped };
}

function readCreatorProfile(): CreatorProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_CREATOR_PROFILE;
    const parsed: unknown = JSON.parse(raw);
    return isCreatorProfile(parsed) ? parsed : DEFAULT_CREATOR_PROFILE;
  } catch {
    return DEFAULT_CREATOR_PROFILE;
  }
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "v3-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}

function filenameFromTitle(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return normalized || "cooking-creator-v3-blueprint";
}

function downloadLocalFile(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export default function V3ContentStudio() {
  const [recipes, setRecipes] = useState<RecipeProject[]>([]);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile>(DEFAULT_CREATOR_PROFILE);
  const [projects, setProjects] = useState<V3StudioProject[]>([]);
  const [references, setReferences] = useState<StoredV3Reference[]>([]);
  const [referencePreviewUrls, setReferencePreviewUrls] = useState<Record<string, string>>({});
  const [referenceRoleDraft, setReferenceRoleDraft] = useState<V3ReferenceRole>("chef-identity");
  const [referenceLabelDraft, setReferenceLabelDraft] = useState("");
  const [referenceDetailsDraft, setReferenceDetailsDraft] = useState("");
  const [appearanceNotesDraft, setAppearanceNotesDraft] = useState("");
  const [kitchenNotesDraft, setKitchenNotesDraft] = useState("");
  const [allowedVariationsDraft, setAllowedVariationsDraft] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [omitResearchLedger, setOmitResearchLedger] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recipeSkippedCount, setRecipeSkippedCount] = useState(0);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => String(recipe.id) === selectedRecipeId) ?? null,
    [recipes, selectedRecipeId],
  );

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoading(true);
      setError("");
      try {
        const saved = readSavedRecipes();
        const profile = readCreatorProfile();
        const savedProjects = await loadStoredProjects();
        const savedReferences = await loadStoredReferences();
        if (cancelled) return;
        setRecipes(saved.recipes);
        setRecipeSkippedCount(saved.skipped);
        setCreatorProfile(profile);
        setProjects(savedProjects);
        setReferences(savedReferences);
        setSelectedRecipeId(saved.recipes[0] ? String(saved.recipes[0].id) : "");
        setSelectedProjectId(savedProjects[0]?.id ?? "");
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "V3 could not load local data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const previewUrls: Record<string, string> = {};
    for (const reference of references) {
      previewUrls[reference.metadata.id] = URL.createObjectURL(reference.file);
    }
    setReferencePreviewUrls(previewUrls);
    return () => {
      for (const url of Object.values(previewUrls)) URL.revokeObjectURL(url);
    };
  }, [references]);

  useEffect(() => {
    if (!activeProject) {
      setAppearanceNotesDraft("");
      setKitchenNotesDraft("");
      setAllowedVariationsDraft("");
      return;
    }
    setAppearanceNotesDraft(activeProject.referenceBible.ownerConfirmedAppearanceNotes);
    setKitchenNotesDraft(activeProject.referenceBible.ownerConfirmedKitchenNotes);
    setAllowedVariationsDraft(activeProject.referenceBible.allowedVariations);
  }, [selectedProjectId]);

  const captionTimeline = useMemo(
    () => validateV3SubtitleTimeline(activeProject?.blueprint.scenes ?? []),
    [activeProject],
  );

  function updateScene(sceneId: string, field: "title" | "narrationText" | "captionText" | "visualDirection", value: string) {
    if (!activeProject) return;
    setProjects((existing) => existing.map((project) => {
      if (project.id !== activeProject.id) return project;
      const blueprint: V3ContentBlueprint = {
        ...project.blueprint,
        status: "draft",
        scenes: project.blueprint.scenes.map((scene) => scene.id === sceneId
          ? { ...scene, [field]: value, reviewStatus: "needs-review" as const }
          : scene),
        reviewNotes: Array.from(new Set([
          ...project.blueprint.reviewNotes,
          "A scene was edited manually. Re-check every edited statement against the pinned recipe and evidence before export.",
        ])),
      };
      return { ...project, blueprint };
    }));
    setDirty(true);
    setMessage("Unsaved scene edit. Review it against the source recipe before exporting.");
  }

  function updateCaptionTiming(sceneId: string, field: "captionStartMs" | "captionEndMs", value: string) {
    if (!activeProject) return;
    let milliseconds: number | null = null;
    if (value.trim()) {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) {
        setError("Caption times must be between 0 and 86,400 seconds.");
        return;
      }
      milliseconds = Math.round(seconds * 1_000);
    }
    setProjects((existing) => existing.map((project) => {
      if (project.id !== activeProject.id) return project;
      return {
        ...project,
        blueprint: {
          ...project.blueprint,
          status: "draft",
          scenes: project.blueprint.scenes.map((scene) => scene.id === sceneId
            ? { ...scene, [field]: milliseconds, reviewStatus: "needs-review" as const }
            : scene),
          reviewNotes: Array.from(new Set([
            ...project.blueprint.reviewNotes,
            "Caption timing was edited by the owner. Confirm it against the real audio before subtitle export.",
          ])),
        },
      };
    }));
    setDirty(true);
    setError("");
    setMessage("Unsaved caption timing. Times are owner-entered and have not been checked against audio.");
  }

  function exportSubtitles(format: V3SubtitleFormat) {
    if (!activeProject) return;
    try {
      const content = buildV3SubtitleFile(activeProject.blueprint.scenes, format);
      downloadLocalFile(
        filenameFromTitle(activeProject.title) + "." + format,
        content,
        format === "srt" ? "application/x-subrip;charset=utf-8" : "text/vtt;charset=utf-8",
      );
      setError("");
      setMessage("Subtitle file downloaded locally. Playback timing still needs owner review against the final audio.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Subtitle export failed validation.");
    }
  }

  async function importReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!V3_REFERENCE_IMAGE_MIME_TYPES.includes(file.type as (typeof V3_REFERENCE_IMAGE_MIME_TYPES)[number])) {
        throw new Error("Use a JPEG, PNG or WebP reference image. Other file types are not accepted.");
      }
      if (file.size <= 0 || file.size > MAX_V3_REFERENCE_BYTES) {
        throw new Error("Each reference image must be between 1 byte and 10 MiB.");
      }
      const originalFileName = (file.name.split(/[\\/]/).pop() || "owner-reference").slice(0, 240);
      const extension = originalFileName.toLowerCase().split(".").pop() || "";
      const expectedMime: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      if (expectedMime[extension] !== file.type) {
        throw new Error("The file extension and image MIME type do not match. Nothing was imported.");
      }
      const headerBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!imageSignatureMatches(file.type, headerBytes)) {
        throw new Error("The file signature does not match its declared image type. Nothing was imported.");
      }
      const dimensions = await getImageDimensions(file);
      const sha256 = await hashBlobSha256(file);
      const fallbackLabel = originalFileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 240) || "Owner reference";
      const metadata: V3ContinuityReference = {
        id: makeId(),
        role: referenceRoleDraft,
        label: referenceLabelDraft.trim() || fallbackLabel,
        ownerConfirmedDetails: referenceDetailsDraft.trim(),
        originalFileName,
        mimeType: file.type as V3ContinuityReference["mimeType"],
        byteSize: file.size,
        sha256,
        width: dimensions.width,
        height: dimensions.height,
        importedAt: new Date().toISOString(),
        reviewState: "not-reviewed",
      };
      if (!validateV3ContinuityReference(metadata)) {
        throw new Error("The reference metadata failed validation. Check the label and owner-confirmed notes.");
      }
      const stored: StoredV3Reference = { metadata, file: file.slice(0, file.size, file.type) };
      await persistNewReference(stored, references);
      setReferences((existing) => [stored, ...existing]);
      setReferenceLabelDraft("");
      setReferenceDetailsDraft("");
      setMessage("Reference imported into this browser only. It is not uploaded, and it is NOT approved until you review and mark it.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reference could not be imported.");
    } finally {
      setBusy(false);
    }
  }

  async function markReferenceReviewed(reference: StoredV3Reference) {
    if (reference.metadata.reviewState === "approved") return;
    setBusy(true);
    setError("");
    try {
      const updated = await updateStoredReferenceMetadata(
        reference.metadata.id,
        reference.metadata.sha256,
        (metadata) => ({ ...metadata, reviewState: "approved" }),
      );
      setReferences((existing) => existing.map((item) =>
        item.metadata.id === updated.metadata.id ? updated : item
      ));
      setMessage("You marked this reference as owner-approved. Only use this for an image you actually reviewed and intend to use.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the reference review state.");
    } finally {
      setBusy(false);
    }
  }

  function togglePinnedReference(reference: StoredV3Reference) {
    if (!activeProject) {
      setError("Create or open a V3 project before pinning references to its Chef & Kitchen Bible.");
      return;
    }
    const currentIds = activeProject.referenceBible.referenceIds;
    const isPinned = currentIds.includes(reference.metadata.id);
    if (!isPinned && reference.metadata.reviewState !== "approved") {
      setError("Review and owner-approve this reference before pinning it to a project.");
      return;
    }
    const nextIds = isPinned
      ? currentIds.filter((id) => id !== reference.metadata.id)
      : [...currentIds, reference.metadata.id];
    try {
      const referenceBible = incrementV3ContinuityBibleVersion(activeProject.referenceBible, {
        referenceIds: nextIds,
      });
      setProjects((existing) => existing.map((project) => project.id === activeProject.id
        ? { ...project, referenceBible }
        : project));
      setDirty(true);
      setError("");
      setMessage("Chef & Kitchen Bible changed. Visual approvals were reset; save the project, then review actual clips before claiming continuity.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the Chef & Kitchen Bible.");
    }
  }

  async function removeReference(reference: StoredV3Reference) {
    if (projects.some((project) => project.referenceBible.referenceIds.includes(reference.metadata.id))) {
      setError("This reference is pinned in at least one project. Unpin it from every project and save those changes before removing it.");
      return;
    }
    if (!window.confirm("Remove this reference image from this browser's local V3 library? Saved project blueprints will not be changed.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteStoredReference(reference.metadata.id, reference.metadata.sha256);
      setReferences((existing) => existing.filter((item) => item.metadata.id !== reference.metadata.id));
      setMessage("Reference removed from local browser storage. No network upload or repository file was involved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the local reference.");
    } finally {
      setBusy(false);
    }
  }

  function saveContinuityNotes() {
    if (!activeProject) return;
    const notes = [appearanceNotesDraft, kitchenNotesDraft, allowedVariationsDraft];
    if (notes.some((item) => item.length > 4_000)) {
      setError("Each continuity note field is limited to 4,000 characters.");
      return;
    }
    try {
      const referenceBible = incrementV3ContinuityBibleVersion(activeProject.referenceBible, {
        ownerConfirmedAppearanceNotes: appearanceNotesDraft,
        ownerConfirmedKitchenNotes: kitchenNotesDraft,
        allowedVariations: allowedVariationsDraft,
      });
      setProjects((existing) => existing.map((project) => project.id === activeProject.id
        ? { ...project, referenceBible }
        : project));
      setDirty(true);
      setError("");
      setMessage("Chef & Kitchen Bible notes updated. All previous visual approvals reset; use only details you personally confirmed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the continuity notes.");
    }
  }

  async function generateBlueprint() {
    if (!selectedRecipe) {
      setError("Choose a valid saved V2 recipe first. V3 does not invent a recipe for you.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let archive: ResearchEvidenceArchive | undefined;
      if (!omitResearchLedger) {
        archive = await readEvidenceArchive();
      }
      const blueprint = await buildV3ContentBlueprint({
        recipe: selectedRecipe,
        creatorProfile,
        ...(archive ? { researchEvidence: archive } : {}),
      });
      const now = new Date().toISOString();
      const project: V3StudioProject = {
        id: makeId(),
        title: blueprint.recipeTitle || selectedRecipe.name || "Untitled cooking project",
        createdAt: now,
        updatedAt: now,
        revision: 1,
        blueprint,
        referenceBible: createEmptyV3ContinuityBible(),
        narrationMediaId: null,
      };
      await persistProject(project, null);
      setProjects((existing) => [project, ...existing]);
      setSelectedProjectId(project.id);
      setDirty(false);
      setMessage("Blueprint saved locally. It is a scene plan, not a rendered or AI-generated video.");
    } catch (caught) {
      setError(caught instanceof Error
        ? caught.message + (omitResearchLedger ? "" : " If you deliberately want to continue without the separate Research Studio ledger, tick the explicit opt-out and try again.")
        : "The blueprint could not be created. Your saved V2 recipe was not changed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentProject() {
    if (!activeProject) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const candidate: V3StudioProject = {
        ...activeProject,
        title: activeProject.blueprint.recipeTitle || activeProject.title,
        updatedAt: new Date().toISOString(),
        revision: activeProject.revision + 1,
      };
      await persistProject(candidate, activeProject.revision);
      setProjects((existing) => existing.map((project) => project.id === candidate.id ? candidate : project));
      setDirty(false);
      setMessage("Edits saved locally. Scene review is still required before export.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the scene edits.");
    } finally {
      setBusy(false);
    }
  }

  function exportCurrentProject() {
    if (!activeProject) return;
    try {
      const raw = createV3ContentBlueprintBackupJSON(activeProject.blueprint);
      downloadLocalFile(
        filenameFromTitle(activeProject.title) + ".v3-blueprint.json",
        raw,
        "application/json;charset=utf-8",
      );
      setMessage("V3 blueprint backup downloaded to this device. No upload occurred.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The blueprint backup could not be prepared.");
    }
  }

  async function importBlueprint(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setError("The backup exceeds 15 MiB. Nothing was imported.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const raw = await file.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
        setError("The backup exceeds 15 MiB. Nothing was imported.");
        return;
      }
      const blueprint = parseV3ContentBlueprintBackupJSON(raw);
      if (!blueprint || !(await verifyV3ContentBlueprintFingerprints(blueprint))) {
        setError("The backup failed schema or source-fingerprint verification. Existing projects were not changed.");
        return;
      }
      // Restored files are treated as new drafts; old approvals never transfer automatically.
      const restoredBlueprint: V3ContentBlueprint = {
        ...blueprint,
        status: "draft",
        scenes: blueprint.scenes.map((scene) => ({ ...scene, reviewStatus: "needs-review" as const })),
        reviewNotes: Array.from(new Set([
          ...blueprint.reviewNotes,
          "Imported from a backup: re-review every scene, source note and disclosure before use. Previous scene approvals were reset.",
        ])),
      };
      const now = new Date().toISOString();
      const project: V3StudioProject = {
        id: makeId(),
        title: restoredBlueprint.recipeTitle || "Imported cooking project",
        createdAt: now,
        updatedAt: now,
        revision: 1,
        blueprint: restoredBlueprint,
        // Reference/media binaries are deliberately excluded from blueprint JSON backups.
        referenceBible: createEmptyV3ContinuityBible(),
        narrationMediaId: null,
      };
      await persistProject(project, null);
      setProjects((existing) => [project, ...existing]);
      setSelectedProjectId(project.id);
      setDirty(false);
      setMessage("The blueprint backup was verified and restored locally. Review all scene text before use.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The backup could not be restored.");
    } finally {
      setBusy(false);
    }
  }

  function selectProject(id: string) {
    if (dirty && id !== selectedProjectId && !window.confirm("You have unsaved scene edits. Discard those unsaved edits and open another project?")) {
      return;
    }
    setSelectedProjectId(id);
    setDirty(false);
    setError("");
    setMessage("");
  }

  function refreshV2Recipes() {
    try {
      const saved = readSavedRecipes();
      setRecipes(saved.recipes);
      setRecipeSkippedCount(saved.skipped);
      setCreatorProfile(readCreatorProfile());
      setSelectedRecipeId((current) => saved.recipes.some((recipe) => String(recipe.id) === current)
        ? current
        : saved.recipes[0] ? String(saved.recipes[0].id) : "");
      setMessage("V2 recipes refreshed from this browser. Previously created V3 snapshots remain unchanged.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh V2 recipes.");
    }
  }

  const canCreate = !loading && !busy && Boolean(selectedRecipe);

  return (
    <section className="v3-studio panel" id="v3-content-studio" aria-labelledby="v3-studio-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">V3 · AI CHEF & COOKING CONTENT STUDIO</p>
          <h2 id="v3-studio-title">Create a cooking-video blueprint</h2>
          <p>Start with a saved V2 recipe. The blueprint keeps recipe facts traceable and lets you edit each scene before any rendering is attempted.</p>
        </div>
        <span className="step">LOCAL-FIRST</span>
      </div>

      <p className="v3-studio-honesty"><strong>Important:</strong> this first build creates an editable scene plan, not a video or generated footage. The rendering and realistic-AI feasibility stages have not passed yet. Nothing is uploaded by this screen.</p>

      {error && <p className="v3-studio-alert" role="alert">{error}</p>}
      {message && <p className="message" role="status" aria-live="polite">{message}</p>}

      <div className="v3-studio-grid">
        <section className="v3-studio-card" aria-labelledby="v3-studio-create-heading">
          <h3 id="v3-studio-create-heading">1. Create from V2</h3>
          <p className="muted">V2 remains the source of truth. This creates a separate, versioned V3 project and never rewrites the original recipe.</p>
          <label htmlFor="v3-recipe-select">Saved recipe</label>
          <select id="v3-recipe-select" value={selectedRecipeId} onChange={(event) => setSelectedRecipeId(event.target.value)} disabled={loading || busy}>
            {recipes.length === 0 ? <option value="">No valid saved recipes</option> : recipes.map((recipe) => (
              <option key={recipe.id} value={String(recipe.id)}>{recipe.name || "Untitled recipe"} · ID {recipe.id}</option>
            ))}
          </select>
          {selectedRecipe && (
            <div className="v3-source-summary">
              <p><strong>Recipe:</strong> {selectedRecipe.name || "Name not recorded"}</p>
              <p><strong>Ingredients:</strong> {selectedRecipe.ingredients.length}</p>
              <p><strong>Steps:</strong> {selectedRecipe.steps.length}</p>
              <p><strong>Recipe revision:</strong> {selectedRecipe.recipeRevision} (counter only; V3 also creates a content fingerprint)</p>
              <p><strong>Owner trial:</strong> {selectedRecipe.trialStatus === "tested" ? "Marked tested in V2; the resulting video still needs review." : "Untried recipe draft"}</p>
            </div>
          )}
          <label className="v3-studio-check">
            <input type="checkbox" checked={omitResearchLedger} onChange={(event) => setOmitResearchLedger(event.target.checked)} />
            <span>Explicitly continue without the separate Research Studio evidence ledger</span>
          </label>
          <p className="hint">When enabled, the blueprint will record no separate research archive. Use this only if the local ledger is genuinely unavailable; recipe-source notes remain in the snapshot.</p>
          <div className="v3-studio-actions">
            <button className="secondary" type="button" onClick={refreshV2Recipes} disabled={loading || busy}>Refresh V2 recipes</button>
            <button className="primary v3-studio-primary" type="button" onClick={() => void generateBlueprint()} disabled={!canCreate}>Create blueprint</button>
          </div>
          {recipeSkippedCount > 0 && <p className="hint">{recipeSkippedCount} local recipe record(s) did not pass V2 validation and were not used.</p>}
          {recipes.length === 0 && !loading && <p className="v3-studio-alert">Add or import a recipe in the existing V2 Recipe Studio, then return here and refresh. V3 will not create a substitute recipe.</p>}
        </section>

        <section className="v3-studio-card" aria-labelledby="v3-studio-projects-heading">
          <h3 id="v3-studio-projects-heading">2. Saved V3 projects</h3>
          {loading ? <p className="muted">Loading local projects…</p> : projects.length === 0 ? (
            <p className="empty-inline">No V3 projects saved on this device yet.</p>
          ) : (
            <div className="v3-studio-project-list">
              {projects.map((project) => (
                <button
                  className={project.id === selectedProjectId ? "v3-studio-project is-active" : "v3-studio-project"}
                  type="button"
                  key={project.id}
                  onClick={() => selectProject(project.id)}
                  aria-pressed={project.id === selectedProjectId}
                >
                  <strong>{project.title || "Untitled project"}</strong>
                  <span>Revision {project.revision} · {new Date(project.updatedAt).toLocaleString("en-US")}</span>
                </button>
              ))}
            </div>
          )}
          <label htmlFor="v3-blueprint-import">Restore a V3 blueprint backup</label>
          <input id="v3-blueprint-import" type="file" accept="application/json,.json" onChange={(event) => void importBlueprint(event)} disabled={busy} />
          <p className="hint">Restore checks the blueprint schema and source snapshot SHA-256 fingerprints, then resets scene approvals. A backup is added as a new local project; it does not overwrite existing ones.</p>
        </section>
      </div>

      <section className="v3-continuity-library" aria-labelledby="v3-continuity-library-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">CHEF & KITCHEN BIBLE</p>
            <h3 id="v3-continuity-library-title">Reference library</h3>
            <p>Import the actual references you approve for your male chef and kitchen. Original image files stay in this browser and are never committed to the repository or uploaded by this screen.</p>
          </div>
          <span className="step">{references.length}/20 LOCAL REFERENCES</span>
        </div>
        <p className="v3-studio-honesty"><strong>Reference status:</strong> importing an image is not the same as approving it. A generated video cannot be marked realistic until actual clips are compared with the approved references. Current visual realism status: <strong>{activeProject?.referenceBible.visualRealismStatus.toUpperCase() ?? "NOT TESTED"}</strong>.</p>
        <div className="v3-reference-import-form">
          <div>
            <label htmlFor="v3-reference-role">Reference role</label>
            <select id="v3-reference-role" value={referenceRoleDraft} onChange={(event) => setReferenceRoleDraft(event.target.value as V3ReferenceRole)} disabled={busy}>
              {V3_REFERENCE_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <p className="hint">{V3_REFERENCE_ROLE_OPTIONS.find((option) => option.value === referenceRoleDraft)?.description}</p>
          </div>
          <div>
            <label htmlFor="v3-reference-label">Reference label (optional)</label>
            <input id="v3-reference-label" value={referenceLabelDraft} maxLength={240} onChange={(event) => setReferenceLabelDraft(event.target.value)} placeholder="e.g. Approved chef front view" disabled={busy} />
          </div>
          <div>
            <label htmlFor="v3-reference-details">Details you personally confirm (optional)</label>
            <textarea id="v3-reference-details" value={referenceDetailsDraft} maxLength={2_000} rows={2} onChange={(event) => setReferenceDetailsDraft(event.target.value)} placeholder="Describe only the details you know are correct." disabled={busy} />
          </div>
          <div>
            <label htmlFor="v3-reference-file">Import reference image (JPEG, PNG or WebP; up to 10 MiB)</label>
            <input id="v3-reference-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => void importReference(event)} disabled={busy || references.length >= 20} />
          </div>
        </div>
        {references.length === 0 ? (
          <p className="empty-inline">No reference images imported yet. The original chef and kitchen references are not available in this repository; import them from your own device when ready.</p>
        ) : (
          <div className="v3-reference-grid">
            {references.map((reference) => {
              const metadata = reference.metadata;
              const isPinned = Boolean(activeProject?.referenceBible.referenceIds.includes(metadata.id));
              const roleLabel = V3_REFERENCE_ROLE_OPTIONS.find((option) => option.value === metadata.role)?.label ?? metadata.role;
              return (
                <article className="v3-reference-card" key={metadata.id}>
                  {referencePreviewUrls[metadata.id]
                    ? <img className="v3-reference-preview" src={referencePreviewUrls[metadata.id]} alt={"Local preview: " + metadata.label} />
                    : <div className="v3-reference-preview v3-reference-preview-empty" aria-label="Reference preview loading">Preview loading…</div>}
                  <div className="v3-reference-card-body">
                    <span className={metadata.reviewState === "approved" ? "v3-reference-badge is-approved" : "v3-reference-badge"}>
                      {metadata.reviewState === "approved" ? "OWNER-APPROVED" : "NOT REVIEWED"}
                    </span>
                    <h4>{metadata.label}</h4>
                    <p className="v3-reference-role">{roleLabel}</p>
                    {metadata.ownerConfirmedDetails && <p className="v3-reference-notes">{metadata.ownerConfirmedDetails}</p>}
                    <p className="v3-reference-meta">{metadata.width} × {metadata.height} · {(metadata.byteSize / 1024).toFixed(0)} KiB · SHA-256 {metadata.sha256.slice(0, 12)}…</p>
                    <p className="v3-reference-meta">Local only · {metadata.originalFileName}</p>
                    <div className="v3-reference-actions">
                      {metadata.reviewState !== "approved" && (
                        <button className="secondary" type="button" disabled={busy} onClick={() => void markReferenceReviewed(reference)}>I reviewed this reference</button>
                      )}
                      {activeProject && (
                        <button className="secondary" type="button" disabled={busy || (!isPinned && metadata.reviewState !== "approved")} onClick={() => togglePinnedReference(reference)}>
                          {isPinned ? "Unpin from project" : "Pin to current project"}
                        </button>
                      )}
                      <button className="secondary" type="button" disabled={busy} onClick={() => void removeReference(reference)}>Remove</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {references.length > 0 && <p className="hint">Library storage limit: 20 references / 80 MiB total. Stored image files are checked for extension, MIME type, file signature, decoding, dimensions and SHA-256 integrity. They stay in local IndexedDB; preview URLs are revoked when replaced.</p>}
      </section>

      {activeProject && (
        <section className="v3-studio-editor" aria-labelledby="v3-studio-editor-heading">
          <div className="section-head">
            <div>
              <p className="eyebrow">EDITABLE SCENE PLAN</p>
              <h3 id="v3-studio-editor-heading">{activeProject.title}</h3>
              <p>Revision {activeProject.revision} · Input fingerprint {activeProject.blueprint.fingerprints.inputsSha256.slice(0, 16)}…</p>
            </div>
            <span className={dirty ? "v3-studio-dirty" : "step"}>{dirty ? "UNSAVED EDITS" : activeProject.blueprint.status.toUpperCase()}</span>
          </div>
          <div className="v3-studio-actions">
            <button className="secondary" type="button" onClick={() => void saveCurrentProject()} disabled={busy || !dirty}>Save changes</button>
            <button className="secondary" type="button" onClick={exportCurrentProject} disabled={busy}>Export JSON backup</button>
          </div>
          <p className="hint">Manual text edits require fresh review. Saving does not approve a scene, verify facts or generate footage.</p>
          <section className="v3-bible-editor" aria-labelledby="v3-bible-editor-title">
            <div className="section-head">
              <div>
                <h4 id="v3-bible-editor-title">Pinned Chef & Kitchen Bible · Version {activeProject.referenceBible.version}</h4>
                <p>Only owner-confirmed notes are stored here. Updating the Bible invalidates earlier visual reviews.</p>
              </div>
              <span className="step">REALISM {activeProject.referenceBible.visualRealismStatus.toUpperCase()}</span>
            </div>
            <p className="hint">{activeProject.referenceBible.referenceIds.length} reference(s) pinned. A pin records the intended source; it does not prove any generated clip matches that source.</p>
            {activeProject.referenceBible.referenceIds.length > 0 ? (
              <div className="v3-pinned-reference-list">
                {activeProject.referenceBible.referenceIds.map((id) => {
                  const reference = references.find((item) => item.metadata.id === id);
                  return <p key={id}>{reference ? reference.metadata.label + " — " + reference.metadata.role : id + " (reference unavailable on this device)"}</p>;
                })}
              </div>
            ) : <p className="v3-studio-alert">No references are pinned to this project. Import and owner-approve the actual chef and kitchen images above.</p>}
            <label htmlFor="v3-bible-appearance">Owner-confirmed chef appearance / wardrobe</label>
            <textarea id="v3-bible-appearance" rows={3} maxLength={4_000} value={appearanceNotesDraft} onChange={(event) => setAppearanceNotesDraft(event.target.value)} placeholder="Record only appearance and wardrobe details you confirm from your reference." />
            <label htmlFor="v3-bible-kitchen">Owner-confirmed kitchen / lighting / props</label>
            <textarea id="v3-bible-kitchen" rows={3} maxLength={4_000} value={kitchenNotesDraft} onChange={(event) => setKitchenNotesDraft(event.target.value)} placeholder="Record the kitchen layout, lighting, counter and props shown in your real reference." />
            <label htmlFor="v3-bible-variations">Allowed variations (optional)</label>
            <textarea id="v3-bible-variations" rows={2} maxLength={4_000} value={allowedVariationsDraft} onChange={(event) => setAllowedVariationsDraft(event.target.value)} placeholder="List only variations you explicitly allow." />
            <div className="v3-studio-actions">
              <button className="secondary" type="button" onClick={saveContinuityNotes} disabled={busy}>Save Bible notes</button>
            </div>
            <p className="v3-studio-honesty"><strong>Visual realism: NOT TESTED.</strong> No actual generated clip has yet passed a clip-by-clip comparison against your approved reference images. Do not mark the realism claim passed on the basis of imported references or this checklist alone.</p>
          </section>
          <section className="v3-subtitle-export" aria-labelledby="v3-subtitle-export-title">
            <h4 id="v3-subtitle-export-title">Manual subtitle timing</h4>
            <p className="hint">Enter start/end times for each caption from a real narration/audio track. V3 will not guess speech timing. Values are seconds with millisecond precision.</p>
            {captionTimeline.ok
              ? <p className="v3-caption-status" role="status">Caption timeline has valid non-overlapping timings.</p>
              : <p className="v3-caption-status is-warning" role="status">{captionTimeline.issues.length} timing issue(s) must be corrected before export.</p>}
            <div className="v3-studio-actions">
              <button className="secondary" type="button" disabled={busy || !captionTimeline.ok} onClick={() => exportSubtitles("srt")}>Export SRT</button>
              <button className="secondary" type="button" disabled={busy || !captionTimeline.ok} onClick={() => exportSubtitles("vtt")}>Export WebVTT</button>
            </div>
            {!captionTimeline.ok && <ul className="v3-caption-issues">
              {captionTimeline.issues.slice(0, 12).map((issue, index) => (
                <li key={issue.sceneId + "-" + index}>{issue.sceneId ? issue.sceneId + ": " : ""}{issue.message}</li>
              ))}
              {captionTimeline.issues.length > 12 && <li>And {captionTimeline.issues.length - 12} more issue(s).</li>}
            </ul>}
          </section>

          <div className="v3-scene-list">
            {activeProject.blueprint.scenes.map((scene: V3BlueprintScene, index) => (
              <article className="v3-scene-card" key={scene.id}>
                <div className="v3-scene-header">
                  <span className="v3-scene-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h4>{scene.kind.replace(/-/g, " ")}</h4>
                    <p>{scene.trace.length} source mapping(s) · Review: {scene.reviewStatus}</p>
                  </div>
                </div>
                <label htmlFor={"v3-scene-title-" + scene.id}>Scene title</label>
                <input
                  id={"v3-scene-title-" + scene.id}
                  value={scene.title}
                  onChange={(event) => updateScene(scene.id, "title", event.target.value)}
                  maxLength={240}
                />
                <label htmlFor={"v3-scene-narration-" + scene.id}>Narration draft</label>
                <textarea
                  id={"v3-scene-narration-" + scene.id}
                  rows={3}
                  value={scene.narrationText}
                  onChange={(event) => updateScene(scene.id, "narrationText", event.target.value)}
                  maxLength={4_000}
                />
                <label htmlFor={"v3-scene-caption-" + scene.id}>Caption draft</label>
                <textarea
                  id={"v3-scene-caption-" + scene.id}
                  rows={2}
                  value={scene.captionText}
                  onChange={(event) => updateScene(scene.id, "captionText", event.target.value)}
                  maxLength={4_000}
                />
                <div className="v3-caption-timing-grid">
                  <div>
                    <label htmlFor={"v3-caption-start-" + scene.id}>Caption start (seconds)</label>
                    <input
                      id={"v3-caption-start-" + scene.id}
                      type="number"
                      min="0"
                      max="86400"
                      step="0.001"
                      value={scene.captionStartMs === null ? "" : String(scene.captionStartMs / 1_000)}
                      onChange={(event) => updateCaptionTiming(scene.id, "captionStartMs", event.target.value)}
                      placeholder="e.g. 0"
                    />
                  </div>
                  <div>
                    <label htmlFor={"v3-caption-end-" + scene.id}>Caption end (seconds)</label>
                    <input
                      id={"v3-caption-end-" + scene.id}
                      type="number"
                      min="0"
                      max="86400"
                      step="0.001"
                      value={scene.captionEndMs === null ? "" : String(scene.captionEndMs / 1_000)}
                      onChange={(event) => updateCaptionTiming(scene.id, "captionEndMs", event.target.value)}
                      placeholder="e.g. 1.5"
                    />
                  </div>
                </div>
                <label htmlFor={"v3-scene-visual-" + scene.id}>Visual direction / continuity notes</label>
                <textarea
                  id={"v3-scene-visual-" + scene.id}
                  rows={2}
                  value={scene.visualDirection}
                  onChange={(event) => updateScene(scene.id, "visualDirection", event.target.value)}
                  maxLength={4_000}
                />
                <div className="v3-scene-source-notes">
                  <strong>Source mapping</strong>
                  <p>{scene.trace.length ? scene.trace.map((trace) => trace.entityType + ": " + trace.entityId + " (" + trace.fields.join(", ") + ")").join(" · ") : "No explicit mapping; review this scene."}</p>
                  {scene.cookingDuration && <p><strong>Recorded cooking duration:</strong> {scene.cookingDuration}</p>}
                  {scene.heat && <p><strong>Recorded heat:</strong> {scene.heat}</p>}
                  {scene.visualCue && <p><strong>Recorded cue:</strong> {scene.visualCue}</p>}
                </div>
              </article>
            ))}
          </div>

          {activeProject.blueprint.warnings.length > 0 && (
            <section className="v3-studio-warnings" aria-labelledby="v3-studio-warnings-heading">
              <h4 id="v3-studio-warnings-heading">Review warnings ({activeProject.blueprint.warnings.length})</h4>
              <ul>
                {activeProject.blueprint.warnings.map((warning, index) => (
                  <li key={warning.code + "-" + (warning.entityId ?? "") + "-" + index}>
                    <strong>{warning.code.replace(/-/g, " ")}:</strong> {warning.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="v3-studio-honesty"><strong>Not a rendered video:</strong> this project has not been generated, animated, visually checked against your original references, or exported as video. Realism remains NOT TESTED until actual clips are reviewed.</p>
        </section>
      )}
    </section>
  );
}
