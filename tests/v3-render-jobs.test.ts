import assert from "node:assert/strict";
import test from "node:test";
import {
  createV3RenderJob,
  isV3RenderJob,
  markInterruptedV3RenderJobs,
  sortV3RenderJobsNewestFirst,
  V3_RENDER_JOB_STALE_AFTER_MS,
  transitionV3RenderJob,
  type V3RenderJob,
} from "../lib/v3-render-jobs";

const start = "2026-10-26T08:00:00.000Z";
const next = "2026-10-26T08:00:02.000Z";
const finish = "2026-10-26T08:00:10.000Z";

function createJob(id = "render-1", ownerSessionId = "session-a"): V3RenderJob {
  return createV3RenderJob({
    id,
    projectId: "project-1",
    projectRevision: 3,
    ownerSessionId,
    planKey: "a".repeat(64),
    startedAt: start,
  });
}

test("creates a validated preparing render job without embedding media bytes", () => {
  const job = createJob();
  assert.equal(isV3RenderJob(job), true);
  assert.equal(job.status, "preparing");
  assert.equal(job.finishedAt, null);
  assert.equal(job.message?.includes("source"), true);
  assert.equal("blob" in job, false);
  assert.equal("file" in job, false);
});

test("allows a render to move forward and records a terminal completion timestamp", () => {
  const preparing = createJob();
  const rendering = transitionV3RenderJob(preparing, "rendering", next, "Local WebM encoding has started.");
  assert.equal(rendering.status, "rendering");
  assert.equal(rendering.finishedAt, null);

  const completed = transitionV3RenderJob(rendering, "completed", finish, "The output passed browser playback validation.");
  assert.equal(completed.status, "completed");
  assert.equal(completed.finishedAt, finish);
  assert.equal(completed.updatedAt, finish);
  assert.equal(preparing.status, "preparing", "transitions must not mutate prior snapshots");
});

test("marks active jobs interrupted after a browser reload without touching terminal history", () => {
  const preparing = createJob("preparing");
  const rendering = transitionV3RenderJob(createJob("rendering"), "rendering", next, "Recording started.");
  const completed = transitionV3RenderJob(
    transitionV3RenderJob(createJob("completed"), "rendering", next, "Recording started."),
    "completed",
    finish,
    "Validated.",
  );
  const interrupted = markInterruptedV3RenderJobs([preparing, rendering, completed], "2026-10-26T08:01:00.000Z");
  assert.deepEqual(interrupted.map((job) => job.status), ["interrupted", "interrupted", "completed"]);
  assert.equal(interrupted[0].finishedAt, "2026-10-26T08:01:00.000Z");
  assert.match(interrupted[1].message ?? "", /saved project and source media were preserved/i);
  assert.equal(interrupted[2].finishedAt, finish);
  assert.equal(preparing.status, "preparing", "recovery must not mutate stored input objects");
});

test("reload recovery only interrupts active jobs from the current tab session", () => {
  const sameTab = createJob("same-tab", "session-a");
  const otherTab = createJob("other-tab", "session-b");
  const recovered = markInterruptedV3RenderJobs([sameTab, otherTab], finish, "session-a");
  assert.deepEqual(recovered.map((job) => job.status), ["interrupted", "preparing"]);
  assert.equal(recovered[0].ownerSessionId, "session-a");
  assert.equal(recovered[1].ownerSessionId, "session-b");
});


test("recovers a job from a closed tab after the bounded stale interval", () => {
  const abandoned = createJob("closed-tab", "session-a");
  const staleNow = new Date(Date.parse(start) + V3_RENDER_JOB_STALE_AFTER_MS + 1).toISOString();
  const recovered = markInterruptedV3RenderJobs([abandoned], staleNow, "session-b");
  assert.equal(recovered[0].status, "interrupted");
  assert.match(recovered[0].message ?? "", /start a new render/i);
});

test("requires a new job attempt rather than reopening terminal attempts", () => {
  const cancelled = transitionV3RenderJob(createJob(), "cancelled", next, "Cancelled by owner.");
  assert.throws(
    () => transitionV3RenderJob(cancelled, "rendering", finish, "Retry"),
    /cannot be reopened/i,
  );
  const started = transitionV3RenderJob(createJob(), "rendering", next, "Started.");
  assert.throws(
    () => transitionV3RenderJob(started, "preparing", finish, "invalid regression"),
    /return to preparation/i,
  );
});

test("rejects invalid saved render jobs and overlong messages", () => {
  assert.equal(isV3RenderJob({ ...createJob(), projectRevision: 0 }), false);
  assert.equal(isV3RenderJob({ ...createJob(), status: "unknown" }), false);
  assert.equal(isV3RenderJob({ ...createJob(), startedAt: "yesterday" }), false);
  assert.throws(
    () => transitionV3RenderJob(createJob(), "rendering", next, "x".repeat(501)),
    /message is invalid/i,
  );
});

test("sorts valid jobs newest first and skips malformed records", () => {
  const older = createJob("older");
  const newer = transitionV3RenderJob(createJob("newer"), "rendering", next, null);
  const sorted = sortV3RenderJobsNewestFirst([older, { id: "broken" }, newer]);
  assert.deepEqual(sorted.map((job) => job.id), ["newer", "older"]);
  assert.notEqual(sorted[0], newer, "sort returns detached job records");
});
