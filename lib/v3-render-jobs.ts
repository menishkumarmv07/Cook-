export const V3_RENDER_JOB_ACTIVE_STATUSES = ["preparing", "rendering"] as const;
export const V3_RENDER_JOB_TERMINAL_STATUSES = ["completed", "cancelled", "failed", "interrupted"] as const;

export type V3RenderJobStatus =
  | (typeof V3_RENDER_JOB_ACTIVE_STATUSES)[number]
  | (typeof V3_RENDER_JOB_TERMINAL_STATUSES)[number];

export type V3RenderJob = {
  id: string;
  projectId: string;
  projectRevision: number;
  ownerSessionId: string;
  planKey: string;
  status: V3RenderJobStatus;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  message: string | null;
};

const MAX_RENDER_JOB_MESSAGE_LENGTH = 500;
const TERMINAL_STATUSES = new Set<V3RenderJobStatus>(V3_RENDER_JOB_TERMINAL_STATUSES);

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isStatus(value: unknown): value is V3RenderJobStatus {
  return typeof value === "string" &&
    [...V3_RENDER_JOB_ACTIVE_STATUSES, ...V3_RENDER_JOB_TERMINAL_STATUSES].includes(value as V3RenderJobStatus);
}

export function isV3RenderJob(value: unknown): value is V3RenderJob {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === "string" && job.id.length > 0 && job.id.length <= 160 &&
    typeof job.projectId === "string" && job.projectId.length > 0 && job.projectId.length <= 160 &&
    Number.isSafeInteger(job.projectRevision) && (job.projectRevision as number) > 0 &&
    typeof job.ownerSessionId === "string" && job.ownerSessionId.length > 0 && job.ownerSessionId.length <= 160 &&
    typeof job.planKey === "string" && job.planKey.length <= 160 &&
    isStatus(job.status) && isValidTimestamp(job.startedAt) && isValidTimestamp(job.updatedAt) &&
    (job.finishedAt === null || isValidTimestamp(job.finishedAt)) &&
    (job.message === null || (typeof job.message === "string" && job.message.length <= MAX_RENDER_JOB_MESSAGE_LENGTH));
}

export function createV3RenderJob(input: {
  id: string;
  projectId: string;
  projectRevision: number;
  ownerSessionId: string;
  planKey: string;
  startedAt: string;
}): V3RenderJob {
  const job: V3RenderJob = {
    id: input.id,
    projectId: input.projectId,
    projectRevision: input.projectRevision,
    ownerSessionId: input.ownerSessionId,
    planKey: input.planKey,
    status: "preparing",
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    finishedAt: null,
    message: "Rendering has been prepared locally. The saved project remains the recovery source.",
  };
  if (!isV3RenderJob(job)) throw new Error("The proposed render job failed schema validation.");
  return job;
}

/**
 * Enforce the one-way render-job lifecycle. A terminal attempt is immutable;
 * retrying always creates a new job ID so the previous outcome remains auditable.
 */
export function transitionV3RenderJob(
  job: V3RenderJob,
  nextStatus: V3RenderJobStatus,
  updatedAt: string,
  message: string | null = null,
): V3RenderJob {
  if (!isV3RenderJob(job)) throw new Error("The existing render job failed schema validation.");
  if (!isValidTimestamp(updatedAt)) throw new Error("A render-job transition requires a valid timestamp.");
  if (!isStatus(nextStatus)) throw new Error("The requested render-job state is invalid.");
  if (TERMINAL_STATUSES.has(job.status)) {
    throw new Error("A finished render attempt cannot be reopened. Start a new render attempt instead.");
  }
  if (nextStatus === "preparing" && job.status !== "preparing") {
    throw new Error("A render cannot return to preparation after rendering has started.");
  }
  if (message !== null && (typeof message !== "string" || message.length > MAX_RENDER_JOB_MESSAGE_LENGTH)) {
    throw new Error("The render-job status message is invalid or too long.");
  }

  const terminal = TERMINAL_STATUSES.has(nextStatus);
  const next: V3RenderJob = {
    ...job,
    status: nextStatus,
    updatedAt,
    finishedAt: terminal ? updatedAt : null,
    message,
  };
  if (!isV3RenderJob(next)) throw new Error("The updated render job failed schema validation.");
  return next;
}

/**
 * When a page reloads, any active browser render is irrecoverably interrupted.
 * Mark it explicitly instead of pretending rendering continued in the background.
 * The project/source media remain unchanged; the user can start a new render.
 */
export const V3_RENDER_JOB_STALE_AFTER_MS = 5 * 60 * 1_000;

export function markInterruptedV3RenderJobs(
  jobs: readonly V3RenderJob[],
  now: string,
  ownerSessionId?: string,
): V3RenderJob[] {
  if (!isValidTimestamp(now)) throw new Error("Render-job recovery requires a valid timestamp.");
  return jobs.map((job) => {
    if (!isV3RenderJob(job)) throw new Error("A saved render job failed schema validation.");
    if (!V3_RENDER_JOB_ACTIVE_STATUSES.includes(job.status as (typeof V3_RENDER_JOB_ACTIVE_STATUSES)[number])) {
      return { ...job };
    }
    // A same-tab reload makes its render immediately unrecoverable. A closed tab's
    // job is also recovered after five minutes; supported clips are capped at 180s,
    // so a fresh render in another live tab is not marked interrupted prematurely.
    const sameOwnerSession = ownerSessionId === undefined || job.ownerSessionId === ownerSessionId;
    const staleFromClosedTab = Date.parse(now) - Date.parse(job.updatedAt) >= V3_RENDER_JOB_STALE_AFTER_MS;
    if (!sameOwnerSession && !staleFromClosedTab) return { ...job };
    return transitionV3RenderJob(
      job,
      "interrupted",
      now,
      "The browser reloaded or the tab closed during rendering. The saved project and source media were preserved; start a new render to retry from the beginning.",
    );
  });
}

export function sortV3RenderJobsNewestFirst(jobs: readonly unknown[]): V3RenderJob[] {
  return jobs
    .filter(isV3RenderJob)
    .map((job) => ({ ...job }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.startedAt.localeCompare(a.startedAt));
}

export const MAX_V3_RENDER_JOBS = 50;

export type V3RenderJobRetentionPlan =
  | { ok: true; deleteJobIds: string[]; retainedCount: number }
  | { ok: false; reason: "invalid-history" | "invalid-next-job" | "duplicate-id" | "active-limit" };

/**
 * Bound status-only history. Only the oldest terminal status records are eligible
 * for pruning; active attempts, projects and all media binaries remain untouched.
 */
export function planV3RenderJobRetention(
  existingJobs: readonly unknown[],
  nextJob: unknown,
): V3RenderJobRetentionPlan {
  if (!isV3RenderJob(nextJob) || nextJob.status !== "preparing") {
    return { ok: false, reason: "invalid-next-job" };
  }
  if (existingJobs.some((job) => !isV3RenderJob(job))) {
    return { ok: false, reason: "invalid-history" };
  }

  const jobs = existingJobs as V3RenderJob[];
  if (jobs.some((job) => job.id === nextJob.id)) return { ok: false, reason: "duplicate-id" };

  const activeCount = jobs.filter((job) =>
    V3_RENDER_JOB_ACTIVE_STATUSES.includes(job.status as (typeof V3_RENDER_JOB_ACTIVE_STATUSES)[number])
  ).length;
  if (activeCount >= MAX_V3_RENDER_JOBS) return { ok: false, reason: "active-limit" };

  const neededToPrune = Math.max(0, jobs.length + 1 - MAX_V3_RENDER_JOBS);
  const terminal = jobs
    .filter((job) => TERMINAL_STATUSES.has(job.status))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.startedAt.localeCompare(b.startedAt));
  if (terminal.length < neededToPrune) return { ok: false, reason: "active-limit" };

  const deleteJobIds = terminal.slice(0, neededToPrune).map((job) => job.id);
  return { ok: true, deleteJobIds, retainedCount: jobs.length + 1 - deleteJobIds.length };
}

