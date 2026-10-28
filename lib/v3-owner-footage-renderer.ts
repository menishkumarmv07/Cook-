import type { V3BlueprintScene } from "./v3-content-blueprint";
import { preflightV3OwnerFootageRender, type V3MediaAsset } from "./v3-rendering";
import { patchV3WebmDuration } from "./v3-webm-duration";

export type V3MediaFile = { metadata: V3MediaAsset; file: Blob };
export type V3RenderProgress = {
  stage: "preparing" | "rendering" | "validating";
  completedScenes: number;
  totalScenes: number;
  message: string;
};
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
const MAX_SCENES = 12;
const MAX_USED_INPUT_BYTES = 100 * 1024 * 1024;

type PreparedScene = {
  scene: V3BlueprintScene;
  video: HTMLVideoElement;
  url: string;
  startMs: number;
  endMs: number;
  durationMs: number;
};

function abortError(): DOMException {
  return new DOMException("V3 video rendering was cancelled.", "AbortError");
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function waitForMediaReady(element: HTMLMediaElement, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let metadataReady = element.readyState >= HTMLMediaElement.HAVE_METADATA;
    let dataReady = element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    let settled = false;
    const timeout = window.setTimeout(
      () => finish(new Error("Media decode timed out. Try a shorter or browser-compatible file.")),
      20_000,
    );
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
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    maybeFinish();
  });
}

async function seekVideo(video: HTMLVideoElement, milliseconds: number, signal?: AbortSignal): Promise<void> {
  ensureNotAborted(signal);
  if (Math.abs(video.currentTime * 1_000 - milliseconds) <= 25) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => finish(new Error("Seeking within a source clip timed out.")), 10_000);
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
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    video.currentTime = milliseconds / 1_000;
  });
}

/**
 * MediaRecorder-created WebM blobs may omit a finite Duration value in their EBML
 * Info element. Browsers can still play the completed file, but report duration=Infinity
 * until a seek reaches the end. Force that seek and use the decoder's resolved end time
 * instead of treating a playable recording as corrupt.
 */
export async function discoverV3RecordedVideoDurationMs(
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<number> {
  ensureNotAborted(signal);
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Math.round(video.duration * 1_000);
  }

  const durationMs = await new Promise<number>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(
      () => finish(new Error("This browser could not resolve the completed WebM duration by seeking to its end.")),
      8_000,
    );
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (error?: Error, value?: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (value !== undefined) resolve(value);
      else reject(new Error("The browser did not provide a usable WebM duration."));
    };
    const isUsable = (seconds: number) =>
      Number.isFinite(seconds) && seconds > 0 && seconds <= 600;
    const resolveKnownDuration = () => {
      if (isUsable(video.duration)) finish(undefined, Math.round(video.duration * 1_000));
    };
    const handleDurationChange = () => resolveKnownDuration();
    const handleSeeked = () => {
      resolveKnownDuration();
      if (settled) return;
      // Some browsers continue reporting Infinity but clamp currentTime to the
      // final decoded position. That end position is still an observable duration.
      if (isUsable(video.currentTime)) finish(undefined, Math.round(video.currentTime * 1_000));
      else finish(new Error("The completed WebM could not be seeked to a finite end position."));
    };
    const handleError = () => finish(new Error("The browser could not decode the completed WebM while finding its duration."));
    const handleAbort = () => finish(abortError());
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("error", handleError);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    try {
      video.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      finish(new Error("The browser refused to seek to the end of this WebM recording."));
    }
  });

  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new Error("The completed WebM did not provide a safe, positive duration.");
  }
  video.pause();
  await seekVideo(video, 0, signal);
  return durationMs;
}

function fitCaptionLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
  return [...lines.slice(0, 2), lines.slice(2).join(" ").slice(0, 120) + "…"];
}

function drawCrop(context: CanvasRenderingContext2D, video: HTMLVideoElement): void {
  context.fillStyle = "#211a16";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (video.videoWidth < 1 || video.videoHeight < 1) {
    throw new Error("The source clip has no decodable frame dimensions.");
  }
  const scale = Math.max(WIDTH / video.videoWidth, HEIGHT / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  context.drawImage(video, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
}

function drawCaptionOverlay(context: CanvasRenderingContext2D, scenes: readonly V3BlueprintScene[], timelineMs: number): void {
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

async function verifyRecordedVideo(blob: Blob, expectedDurationMs: number, signal?: AbortSignal, requireFiniteDuration = false): Promise<number> {
  ensureNotAborted(signal);
  if (blob.size <= 0 || blob.size > MAX_OUTPUT_BYTES) {
    throw new Error("Rendered video is empty or exceeds the 500 MiB output limit.");
  }
  if (!blob.type.toLowerCase().startsWith("video/webm")) {
    throw new Error("The renderer did not produce a WebM video. Output was not accepted.");
  }
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    video.src = url;
    video.load();
    await waitForMediaReady(video, signal);
    if (requireFiniteDuration && (!Number.isFinite(video.duration) || video.duration <= 0)) {
      throw new Error("The finalized WebM still has no finite Duration metadata after patching. The output was rejected.");
    }
    const actualDurationMs = await discoverV3RecordedVideoDurationMs(video, signal);
    const durationToleranceMs = Math.max(500, Math.min(2_500, expectedDurationMs * 0.05));
    if (!Number.isFinite(actualDurationMs) || actualDurationMs < expectedDurationMs - durationToleranceMs ||
        actualDurationMs > expectedDurationMs + durationToleranceMs) {
      throw new Error(
        "The rendered video's duration differs too much from the planned timeline " +
        "(planned " + expectedDurationMs + " ms ± " + durationToleranceMs + " ms; browser reported " +
        (Number.isFinite(actualDurationMs) ? Math.round(actualDurationMs) : "a non-finite duration") +
        " ms). The partial output was rejected; keep the source project and review the render.",
      );
    }
    if (video.videoWidth !== WIDTH || video.videoHeight !== HEIGHT) {
      throw new Error("The rendered file does not match the expected 720×1280 portrait dimensions.");
    }
    try {
      await video.play();
    } catch {
      throw new Error("The downloaded render metadata exists, but the browser could not play the generated file.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    ensureNotAborted(signal);
    video.pause();
    await seekVideo(video, Math.max(0, actualDurationMs - 60), signal);
    return actualDurationMs;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function drawFrameAt(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  scenes: readonly V3BlueprintScene[],
  timelineMs: number,
): void {
  drawCrop(context, video);
  drawCaptionOverlay(context, scenes, timelineMs);
}

async function recordPreparedScene(
  context: CanvasRenderingContext2D,
  prepared: PreparedScene,
  scenes: readonly V3BlueprintScene[],
  timelineOffsetMs: number,
  signal?: AbortSignal,
  alreadyPlaying = false,
): Promise<void> {
  const { video, startMs, endMs, durationMs } = prepared;
  ensureNotAborted(signal);
  if (!alreadyPlaying) {
    video.pause();
    await seekVideo(video, startMs, signal);
    try {
      await video.play();
    } catch {
      throw new Error("The browser could not start playback for a selected source scene.");
    }
  }
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let frameHandle = 0;
    let lastSourceNowMs = video.currentTime * 1_000;
    let lastProgressAt = performance.now();
    const cleanup = () => {
      cancelAnimationFrame(frameHandle);
      document.removeEventListener("visibilitychange", handleVisibility);
      signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      video.pause();
      if (error) reject(error);
      else resolve();
    };
    const handleAbort = () => finish(abortError());
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        finish(new Error("The browser tab went into the background during rendering. The partial output was rejected; keep the tab visible and try again."));
      }
    };
    const frame = () => {
      if (signal?.aborted) {
        finish(abortError());
        return;
      }
      if (document.visibilityState === "hidden") {
        finish(new Error("Keep the V3 tab in the foreground while rendering."));
        return;
      }
      const sourceNowMs = video.currentTime * 1_000;
      if (sourceNowMs > lastSourceNowMs + 20) {
        lastSourceNowMs = sourceNowMs;
        lastProgressAt = performance.now();
      } else if (performance.now() - lastProgressAt > 10_000) {
        finish(new Error("Source playback stopped advancing for 10 seconds. The partial video was rejected; retry with a shorter browser-compatible clip."));
        return;
      }
      const elapsedMs = Math.max(0, Math.min(durationMs, sourceNowMs - startMs));
      try {
        drawFrameAt(context, video, scenes, timelineOffsetMs + elapsedMs);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Could not draw the current video frame."));
        return;
      }
      if (sourceNowMs >= endMs || video.ended) {
        finish();
        return;
      }
      frameHandle = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    signal?.addEventListener("abort", handleAbort, { once: true });
    frameHandle = requestAnimationFrame(frame);
  });
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
  if (scenes.length > MAX_SCENES) {
    throw new Error("The first mobile-safe renderer supports at most " + MAX_SCENES + " scenes.");
  }
  const narration = assets.find((asset) => asset.metadata.id === narrationAssetId);
  if (!narration || narration.metadata.kind !== "narration") {
    throw new Error("The selected narration file is not available in the local media library.");
  }
  const mediaById = new Map(assets.map((asset) => [asset.metadata.id, asset]));
  const usedAssets = new Map<string, V3MediaFile>([[narration.metadata.id, narration]]);
  const plannedScenes: Array<{ scene: V3BlueprintScene; asset: V3MediaFile; startMs: number; endMs: number; durationMs: number }> = [];
  for (const scene of scenes) {
    ensureNotAborted(signal);
    const mediaId = scene.sourceMediaId;
    const startMs = scene.sourceMediaStartMs;
    const endMs = scene.sourceMediaEndMs;
    if (!mediaId || startMs === null || endMs === null) {
      throw new Error("Every scene must have a source video and explicit trim boundaries.");
    }
    const asset = mediaById.get(mediaId);
    if (!asset || asset.metadata.kind !== "video") {
      throw new Error("A selected scene clip is missing or is not a video.");
    }
    const durationMs = endMs - startMs;
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 ||
        durationMs <= 0 || endMs > asset.metadata.durationMs) {
      throw new Error("A source clip trim is invalid. Review its start/end boundaries.");
    }
    plannedScenes.push({ scene, asset, startMs, endMs, durationMs });
    usedAssets.set(asset.metadata.id, asset);
  }

  const usedBytes = Array.from(usedAssets.values()).reduce((sum, asset) => sum + asset.file.size, 0);
  if (usedBytes > MAX_USED_INPUT_BYTES) {
    throw new Error("Selected media files exceed the 100 MiB mobile-render limit. Choose smaller source files.");
  }

  onProgress?.({ stage: "preparing", completedScenes: 0, totalScenes: scenes.length, message: "Verifying source files and preparing local footage…" });
  for (const asset of usedAssets.values()) {
    ensureNotAborted(signal);
    if (await sha256Blob(asset.file) !== asset.metadata.sha256) {
      throw new Error("A local source file failed SHA-256 integrity verification. The video was not rendered.");
    }
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is unavailable in this browser. Use the editable project bundle/another local editor; no paid fallback will be activated.");
  }
  if (!HTMLCanvasElement.prototype.captureStream) {
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

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not initialize the portrait renderer canvas.");

  const clipUrls: string[] = [];
  const preparedScenes: PreparedScene[] = [];
  const audioUrl = URL.createObjectURL(narration.file);
  const audio = document.createElement("audio");
  const audioContext = new AudioContextConstructor();
  let audioDestination: MediaStreamAudioDestinationNode | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let recordingPromise: Promise<Blob> | null = null;
  let recorderStarted = false;

  try {
    audio.preload = "auto";
    audio.src = audioUrl;
    audio.load();
    await waitForMediaReady(audio, signal);
    await audioContext.resume();
    const audioSource = audioContext.createMediaElementSource(audio);
    audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);

    // Load and seek all scenes before recording starts. This prevents a slow
    // device/file decode from consuming narration time between recorded scenes.
    for (let index = 0; index < plannedScenes.length; index += 1) {
      ensureNotAborted(signal);
      const plan = plannedScenes[index];
      onProgress?.({
        stage: "preparing",
        completedScenes: index,
        totalScenes: scenes.length,
        message: "Preparing video scene " + (index + 1) + " of " + scenes.length + "…",
      });
      const url = URL.createObjectURL(plan.asset.file);
      clipUrls.push(url);
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      video.load();
      await waitForMediaReady(video, signal);
      if (video.videoWidth * video.videoHeight > 8_500_000) {
        throw new Error("A source clip is larger than the 8.5-megapixel mobile-safe render limit. Use a smaller source file.");
      }
      await seekVideo(video, plan.startMs, signal);
      video.pause();
      preparedScenes.push({
        scene: plan.scene,
        video,
        url,
        startMs: plan.startMs,
        endMs: plan.endMs,
        durationMs: plan.durationMs,
      });
    }

    ensureNotAborted(signal);
    // Prime audio playback within the click gesture, then reset it to timeline zero.
    const unlockPlay = audio.play();
    await unlockPlay;
    audio.pause();
    audio.currentTime = 0;
    await seekVideo(preparedScenes[0].video, preparedScenes[0].startMs, signal);

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

    // Start both source tracks together and wait until playback has actually begun
    // before opening the recorder. Starting MediaRecorder first can capture browser
    // startup latency as unintended leading silence, making the file duration diverge
    // from the approved scene timeline on slower desktop/mobile decoders.
    const audioPlay = audio.play();
    const firstVideoPlay = preparedScenes[0].video.play();
    await Promise.all([audioPlay, firstVideoPlay]);
    ensureNotAborted(signal);
    recorder.start(1_000);
    recorderStarted = true;
    onProgress?.({ stage: "rendering", completedScenes: 0, totalScenes: scenes.length, message: "Recording the 720×1280 montage from local footage and reviewed narration…" });

    let timelineOffsetMs = 0;
    for (let index = 0; index < preparedScenes.length; index += 1) {
      ensureNotAborted(signal);
      const prepared = preparedScenes[index];
      // The first clip is already playing in sync with the narration/recorder start.
      // Following clips were decoded and seeked before recording, so their starts should
      // not lose speech time to a slow file load.
      await recordPreparedScene(context, prepared, scenes, timelineOffsetMs, signal, index === 0);
      timelineOffsetMs += prepared.durationMs;
      onProgress?.({
        stage: "rendering",
        completedScenes: index + 1,
        totalScenes: scenes.length,
        message: "Finished scene " + (index + 1) + " of " + scenes.length + ".",
      });
    }

    audio.pause();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
    onProgress?.({ stage: "validating", completedScenes: scenes.length, totalScenes: scenes.length, message: "Validating the recorded WebM file and playback…" });
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await withTimeout(
      recordingPromise,
      15_000,
      "Browser MediaRecorder did not finalize within 15 seconds. The partial output was rejected; keep the source project and use the production bundle fallback.",
    );
    ensureNotAborted(signal);
    if (timelineOffsetMs !== preflight.durationMs) {
      throw new Error("The rendered timeline no longer matches its preflight duration.");
    }
    // MediaRecorder frequently omits a finite Duration element in WebM. Measure
    // the real decoded end position first, then write that measured duration into
    // the container so reopened files expose a finite playback timeline.
    const measuredDurationMs = await verifyRecordedVideo(blob, preflight.durationMs, signal);
    const finalizedBlob = await patchV3WebmDuration(blob, measuredDurationMs);
    const verifiedDurationMs = await verifyRecordedVideo(
      finalizedBlob,
      preflight.durationMs,
      signal,
      true,
    );
    return {
      blob: finalizedBlob,
      mimeType: finalizedBlob.type || mimeType,
      width: WIDTH,
      height: HEIGHT,
      durationMs: verifiedDurationMs,
      sha256: await sha256Blob(finalizedBlob),
      sceneCount: scenes.length,
    };
  } catch (error) {
    audio.pause();
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* preserve the original error */ }
    }
    if (recordingPromise && recorderStarted) {
      // Never block error recovery on a recorder that failed to emit its stop event.
      // The main path has a bounded finalization wait and observes late rejection.
      void recordingPromise.catch(() => undefined);
    }
    throw error;
  } finally {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(audioUrl);
    for (const item of preparedScenes) {
      item.video.pause();
      item.video.removeAttribute("src");
      item.video.load();
    }
    for (const url of clipUrls) URL.revokeObjectURL(url);
    if (stream) for (const track of stream.getTracks()) track.stop();
    if (audioDestination) for (const track of audioDestination.stream.getTracks()) track.stop();
    await audioContext.close().catch(() => undefined);
  }
}
