import type { V3BlueprintScene } from "./v3-content-blueprint";

export type V3SubtitleFormat = "srt" | "vtt";
export type V3SubtitleIssue = {
  sceneId: string;
  message: string;
};
export type V3SubtitleValidation = {
  ok: boolean;
  issues: V3SubtitleIssue[];
};

type TimedCaption = {
  sceneId: string;
  text: string;
  startMs: number;
  endMs: number;
};

const MAX_CAPTION_TEXT_CHARS = 4_000;
const MAX_TIMELINE_MS = 24 * 60 * 60 * 1_000;

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_TIMELINE_MS;
}

function normalizeCaptionText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function validateV3SubtitleTimeline(
  scenes: readonly V3BlueprintScene[],
): V3SubtitleValidation {
  const issues: V3SubtitleIssue[] = [];
  const captions: TimedCaption[] = [];

  for (const scene of scenes) {
    const text = normalizeCaptionText(scene.captionText);
    if (!text) continue;

    if (text.length > MAX_CAPTION_TEXT_CHARS) {
      issues.push({
        sceneId: scene.id,
        message: "Caption exceeds the 4,000-character limit. Shorten it before export.",
      });
      continue;
    }

    if (!isSafeTimestamp(scene.captionStartMs) || !isSafeTimestamp(scene.captionEndMs)) {
      issues.push({
        sceneId: scene.id,
        message: "Enter a start and end time for this caption; V3 does not invent caption timing.",
      });
      continue;
    }

    if (scene.captionEndMs <= scene.captionStartMs) {
      issues.push({
        sceneId: scene.id,
        message: "Caption end time must be later than its start time.",
      });
      continue;
    }

    captions.push({
      sceneId: scene.id,
      text,
      startMs: scene.captionStartMs,
      endMs: scene.captionEndMs,
    });
  }

  captions.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let index = 1; index < captions.length; index += 1) {
    const previous = captions[index - 1];
    const current = captions[index];
    if (current.startMs < previous.endMs) {
      issues.push({
        sceneId: current.sceneId,
        message: "This caption overlaps another caption. Adjust the times before subtitle export.",
      });
    }
  }

  if (!captions.length && !issues.length) {
    issues.push({ sceneId: "", message: "There are no non-empty captions to export." });
  }

  return { ok: issues.length === 0, issues };
}

function formatTimestamp(milliseconds: number, separator: "," | "."): string {
  const safe = Math.max(0, Math.min(milliseconds, MAX_TIMELINE_MS));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":") + separator + String(millis).padStart(3, "0");
}

/** Subtitle payloads are escaped because source text is owner-editable. */
function escapeSubtitleText(value: string): string {
  return normalizeCaptionText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getValidatedCues(scenes: readonly V3BlueprintScene[]): TimedCaption[] {
  const validation = validateV3SubtitleTimeline(scenes);
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  return scenes
    .filter((scene) => normalizeCaptionText(scene.captionText).length > 0)
    .map((scene) => ({
      sceneId: scene.id,
      text: normalizeCaptionText(scene.captionText),
      startMs: scene.captionStartMs as number,
      endMs: scene.captionEndMs as number,
    }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

export function buildV3SubtitleFile(
  scenes: readonly V3BlueprintScene[],
  format: V3SubtitleFormat,
): string {
  const cues = getValidatedCues(scenes);
  if (format === "vtt") {
    return "WEBVTT\n\n" + cues.map((cue) =>
      formatTimestamp(cue.startMs, ".") + " --> " + formatTimestamp(cue.endMs, ".") +
      "\n" + escapeSubtitleText(cue.text),
    ).join("\n\n") + "\n";
  }
  if (format === "srt") {
    return cues.map((cue, index) =>
      String(index + 1) + "\n" +
      formatTimestamp(cue.startMs, ",") + " --> " + formatTimestamp(cue.endMs, ",") +
      "\n" + escapeSubtitleText(cue.text),
    ).join("\n\n") + "\n";
  }
  throw new Error("Unsupported subtitle format.");
}
