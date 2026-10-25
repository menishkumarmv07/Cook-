import type { V3BlueprintScene } from "./v3-content-blueprint";
import { preflightV3OwnerFootageRender, type V3MediaAsset } from "./v3-rendering";
import { validateV3SubtitleTimeline } from "./v3-captions";

export type V3MediaFile = { metadata: V3MediaAsset; file: Blob };
export type V3RenderProgress = { stage: "preparing" | "rendering" | "validating"; completedScenes: number; totalScenes: number; message: string };
export type V3OwnerFootageRenderResult = {
  blob: Blob;
  mimeType: string;
  width: 720;
  height: 1280;
  durationMs: number;
  sha256: string;
  sceneCount: number;
};

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;
const MAX_OUTPUT_BYTES = 500 * 1024 * 1024;

function abortError(): DOMException {
  return new DOMException("V3 video rendering was cancelled.", "AbortError");
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function waitForMediaReady(
  element: HTMLMediaElement,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let metadataReady = false;
    let dataReady = element instanceof HTMLAudioElement;
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error("Media decode timed out. Try a shorter or browser-compatible file.")), 20_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      element.removeEventListener("loadedmetadata", handleMetadata);
      element.removeEventListener("loadeddata", handleData);
      element.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const maybeFinish = () => {
      if (metadataReady && dataReady) finish();
    };
    const handleMetadata = () => {
      metadataReady = true;
      maybeFinish();
    };
    const handleData = () => {
      dataReady = true;
      maybeFinish();
    };
    const handleError = () => finish(new Error("The browser could not decode a selected media file."));
    const handleAbort = () => finish(abortError());
    element.addEventListener("loadedmetadata", handleMetadata);
    element.addEventListener("loadeddata", handleData);
    element.addEventListener("error", handleError);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) metadataReady = true;
    if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) dataReady = true;
    maybeFinish();
  });
}

async function seekVideo(video: HTMLVideoElement, milliseconds: number, signal?: AbortSignal): Promise<void> {
  ensureNotAborted(signal);
  if (Math.abs(video.currentTime * 1_000 - milliseconds) <= 25) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Seeking within a source clip timed out.")), 10_000);
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const handleSeeked = () => finish();
    const handleError = () => finish(new Error("The source clip failed while seeking."));
    const handleAbort = () => finish(abortError());
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    signal?.addEventListener("abort", handleAbort, { once: true });
    video.currentTime = milliseconds / 1_000;
  });
}

function fitCaptionLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 3) return lines;
  const firstLines = lines.slice(0, 2);
  firstLines.push(lines.slice(2).join(" ").slice(0, 120) + "…");
  return firstLines;
}

function drawCrop(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
): void {
  context.fillStyle = "#211a16";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (video.videoWidth < 1 || video.videoHeight < 1) {
    throw new Error("The source clip has no decodable frame dimensions.");
  }
  const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  const x = (WIDTH - width) / 2;
  const y = (HEIGHT - height) / 2;
  context.drawImage(video, x, y, width, height);
}

function drawCaptionOverlay(
  context: CanvasRenderingContext2D,
  scenes: readonly V3BlueprintScene[],
  timelineMs: number,
): void {
  const caption = scenes.find((scene) =>
    scene.captionText.trim() &&
    scene.captionStartMs !== null &&
    scene.captionEndMs !== null &&
    timelineMs >= scene.captionStartMs &&
    timelineMs < scene.captionEndMs
  );
  if (!caption) return;

  context.save();
  context.font = "bold 30px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const maxWidth = WIDTH * 0.84;
  const lines = fitCaptionLines(context, caption.captionText, maxWidth - 36);
  const lineHeight = 39;
  const boxHeight = lines.length * lineHeight + 34;
  const boxY = HEIGHT - 115 - boxHeight;
  context.fillStyle = "rgba(35, 25, 20, 0.82)";
  context.fillRect((WIDTH - maxWidth) / 2, boxY, maxWidth, boxHeight);
  context.fillStyle = "#fff8ee";
  lines.forEach((line, index) => {
    context.fillText(line, WIDTH / 2, boxY + 17 + lineHeight * index + lineHeight / 2, maxWidth - 26);
  });
  context.restore();
}

async function sha256Blob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 verification is unavailable in this browser.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyRecordedVideo(blob: Blob, expectedDurationMs: number, signal?: AbortSignal): Promise<void> {
  ensureNotAborted(signal);
  if (blob.size <= 0 || blob.size > MAX_OUTPUT_BYTES) throw new Error("Rendered video is empty or exceeds the 500 MiB output limit.");
  if (!blob.type.toLowerCase().startsWith("video/webm")) throw new Error("The renderer did not produce a WebM video. Output was not accepted.");
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    video.src = url;
    video.load();
    await waitForMediaReady(video, signal);
    const actualDurationMs = video.duration * 1_000;
    if (!Number.isFinite(actualDurationMs) || actualDurationMs < expectedDurationMs - 2_500 ||
        actualDurationMs > expectedDurationMs + 2_500) {
      throw new Error("The rendered video's duration differs too much from the planned timeline. Keep the source project and review the render.");
    }
    if (video.videoWidth !== WIDTH || video.videoHeight !== HEIGHT) {
      throw new Error("The rendered file does not match the expected 720×1280 portrait dimensions.");
    }
    await seekVideo(video, Math.max(0, actualDurationMs - 60), signal);
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function renderV3OwnerFootageVideo(options: {
  scenes: readonly V3BlueprintScene[];
  assets: readonly V3MediaFile[];
  narrationAssetId: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: V3RenderProgress) => void;
}): Promise<V3OwnerFootageRenderResult> {
  const { scenes, assets, narrationAssetId, signal, onProgress } = options;
  ensureNotAborted(signal);
  const preflight = preflightV3OwnerFootageRender(
    scenes,
    assets.map((asset) => asset.metadata),
    narrationAssetId,
  );
  if (!preflight.ok) {
    throw new Error("Render blocked: " + preflight.issues.map((issue) => issue.message).join(" "));
  }
  const narration = assets.find((asset) => asset.metadata.id === narrationAssetId);
  if (!narration) throw new Error("The selected narration file is not available in the local media library.");
  const mediaById = new Map(assets.map((asset) => [asset.metadata.id, asset]));
  const usedAssets = new Map<string, V3MediaFile>([[narration.metadata.id, narration]]);
  for (const scene of scenes) {
    if (scene.sourceMediaId) {
      const asset = mediaById.get(scene.sourceMediaId);
      if (!asset) throw new Error("A source clip is missing from the local media library.");
      usedAssets.set(asset.metadata.id, asset);
    }
  }

  onProgress?.({ stage: "preparing", completedScenes: 0, totalScenes: scenes.length, message: "Verifying local source file checksums…" });
  for (const asset of usedAssets.values()) {
    ensureNotAborted(signal);
    if (await sha256Blob(asset.file) !== asset.metadata.sha256) {
      throw new Error("A local source file failed SHA-256 integrity verification. The video was not rendered.");
    }
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is unavailable in this browser. Use the editable project bundle/another local editor; no paid fallback will be activated.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context || typeof canvas.captureStream !== "function") {
    throw new Error("This browser cannot capture the portrait canvas into a real video file.");
  }

  const mimeCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) throw new Error("No supported WebM recorder codec was found on this device. Nothing was exported.");

  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) throw new Error("Web Audio is unavailable in this browser, so the narration track cannot be mixed.");
  const audioContext = new AudioContextConstructor();
  const audio = document.createElement("audio");
  const audioUrl = URL.createObjectURL(narration.file);
  audio.preload = "auto";
  audio.src = audioUrl;
  const audioSource = audioContext.createMediaElementSource(audio);
  const audioDestination = audioContext.createMediaStreamDestination();
  audioSource.connect(audioDestination);

  // Request playback directly during the user's button gesture. It will be paused
  // and reset once hashes are checked so the exported audio begins at timeline zero.
  const initialPlay = audio.play();
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let recordingPromise: Promise<Blob> | null = null;
  const clipUrls: string[] = [];

  try {
    await audioContext.resume();
    await initialPlay;
    ensureNotAborted(signal);
    audio.pause();
    audio.currentTime = 0;

    stream = canvas.captureStream(FPS);
    for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
    const chunks: Blob[] = [];
    recordingPromise = new Promise<Blob>((resolve, reject) => {
      if (!recorder) {
        reject(new Error("MediaRecorder was not initialized."));
        return;
      }
      recorder.onerror = () => reject(new Error("Browser media recording failed. The source project was preserved."));
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder?.mimeType || mimeType });
        if (!blob.size) reject(new Error("The browser returned an empty recording. The output was rejected."));
        else resolve(blob);
      };
    });
    recorder.start(1_000);
    onProgress?.({ stage: "rendering", completedScenes: 0, totalScenes: scenes.length, message: "Recording the 720×1280 montage with owner footage and reviewed narration…" });
    const narrationPlay = audio.play();
    await narrationPlay;

    let timelineOffsetMs = 0;
    for (let index = 0; index < scenes.length; index += 1) {
      ensureNotAborted(signal);
      const scene = scenes[index];
      const mediaId = scene.sourceMediaId;
      if (!mediaId || scene.sourceMediaStartMs === null || scene.sourceMediaEndMs === null) {
        throw new Error("Every scene must have a source video and explicit trim boundaries.");
      }
      const asset = mediaById.get(mediaId);
      if (!asset || asset.metadata.kind !== "video") throw new Error("A selected scene clip is missing or is not a video.");
      const clipStartMs = scene.sourceMediaStartMs;
      const clipEndMs = scene.sourceMediaEndMs;
      const clipDurationMs = clipEndMs - clipStartMs;
      if (clipDurationMs <= 0 || clipEndMs > asset.metadata.durationMs) {
        throw new Error("A source clip trim is invalid. Review its start/end boundaries.");
      }
      onProgress?.({
        stage: "rendering",
        completedScenes: index,
        totalScenes: scenes.length,
        message: "Rendering scene " + (index + 1) + " of " + scenes.length + ": " + scene.title,
      });

      const videoUrl = URL.createObjectURL(asset.file);
      clipUrls.push(videoUrl);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl;
      video.load();
      await waitForMediaReady(video, signal);
      await seekVideo(video, clipStartMs, signal);
      await video.play();

      const sourceOriginMs = video.currentTime * 1_000;
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        let frameHandle = 0;
        const finish = (error?: Error) => {
          if (finished) return;
          finished = true;
          cancelAnimationFrame(frameHandle);
          if (error) reject(error);
          else resolve();
        };
        const frame = () => {
          if (signal?.aborted) {
            finish(abortError());
            return;
          }
          const sourceNowMs = video.currentTime * 1_000;
          const elapsedMs = Math.max(0, Math.min(clipDurationMs, sourceNowMs - clipStartMs));
          try {
            drawCrop(context, video);
            drawCaptionOverlay(context, scenes, timelineOffsetMs + elapsedMs);
          } catch (error) {
            finish(error instanceof Error ? error : new Error("Could not draw the current video frame."));
            return;
          }
          if (sourceNowMs >= clipEndMs || video.ended) {
            finish();
            return;
          }
          frameHandle = requestAnimationFrame(frame);
        };
        frameHandle = requestAnimationFrame(frame);
      });
      video.pause();
      video.removeAttribute("src");
      video.load();
      timelineOffsetMs += clipDurationMs;
      onProgress?.({ stage: "rendering", completedScenes: index + 1, totalScenes: scenes.length, message: "Finished scene " + (index + 1) + " of " + scenes.length + "." });
    }

    audio.pause();
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    onProgress?.({ stage: "validating", completedScenes: scenes.length, totalScenes: scenes.length, message: "Validating the actual recorded video file…" });
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    const blob = await recordingPromise;
    ensureNotAborted(signal);
    if (timelineOffsetMs !== preflight.durationMs) throw new Error("The rendered timeline no longer matches its preflight duration.");
    await verifyRecordedVideo(blob, preflight.durationMs, signal);
    const sha256 = await sha256Blob(blob);
    return {
      blob,
      mimeType: blob.type || mimeType,
      width: WIDTH,
      height: HEIGHT,
      durationMs: preflight.durationMs,
      sha256,
      sceneCount: scenes.length,
    };
  } catch (error) {
    audio.pause();
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* preserve the original error */ }
    }
    if (recordingPromise) {
      try { await recordingPromise; } catch { /* the source project remains saved */ }
    }
    throw error;
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(audioUrl);
    for (const url of clipUrls) URL.revokeObjectURL(url);
    if (stream) for (const track of stream.getTracks()) track.stop();
    for (const track of audioDestination.stream.getTracks()) track.stop();
    await audioContext.close().catch(() => undefined);
  }
}
