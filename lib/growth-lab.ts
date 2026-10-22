import { getLocalDateOnly, isValidDateOnly, isValidIsoTimestamp } from "./recipe";

export const GROWTH_PLATFORMS = [
  "YouTube Shorts",
  "YouTube long-form",
  "Instagram Reels",
  "TikTok",
  "Other",
] as const;

export type GrowthPlatform = (typeof GROWTH_PLATFORMS)[number];
export type GrowthDataKind = "actual" | "estimate";
export type GrowthExperimentStatus = "planned" | "reviewed" | "closed";

export type GrowthMetric = {
  id: string;
  publishedDate: string;
  platform: GrowthPlatform;
  contentTitle: string;
  concept: string;
  dataKind: GrowthDataKind;
  // Only enter a USD amount when the platform reports it for this content. Estimates remain separate.
  revenueUsd: number | null;
  views: number | null;
  reach: number | null;
  averageWatchSeconds: number | null;
  retentionPercent: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followersGained: number | null;
  linkClicks: number | null;
};

export type GrowthExperiment = {
  id: string;
  hypothesis: string;
  variableChanged: string;
  platform: GrowthPlatform;
  contentTitle: string;
  startedDate: string;
  resultDate: string;
  outcome: string;
  nextAction: string;
  status: GrowthExperimentStatus;
};

export type GrowthWorkspaceBackup = {
  format: "cooking-creator-growth-lab";
  version: 2;
  exportedAt: string;
  metrics: GrowthMetric[];
  experiments: GrowthExperiment[];
  // Parser-only warnings: never written into the exported backup file.
  migrationWarnings?: string[];
};

export type GrowthCsvRejectedRow = {
  rowNumber: number;
  reason: string;
};

export type GrowthCsvImportResult = {
  rows: GrowthMetric[];
  rejectedRows: GrowthCsvRejectedRow[];
  errors: string[];
  duplicateRows: number;
};

export type GrowthMetricSummary = {
  totalRows: number;
  actualRows: number;
  estimateRows: number;
  actualViewsTotal: number | null;
  actualViewsRows: number;
  estimateViewsTotal: number | null;
  estimateViewsRows: number;
  actualReachTotal: number | null;
  actualReachRows: number;
  estimateReachTotal: number | null;
  estimateReachRows: number;
  actualRevenueUsdTotal: number | null;
  actualRevenueUsdRows: number;
  estimateRevenueUsdTotal: number | null;
  estimateRevenueUsdRows: number;
  warnings: string[];
};

const MAX_CSV_CHARACTERS = 2_000_000;
const MAX_CSV_ROWS = 10_000;
const MAX_WORKSPACE_CHARACTERS = 15_000_000;
export const MAX_GROWTH_METRIC_ROWS = 10_000;
export const MAX_GROWTH_EXPERIMENT_ROWS = 2_000;
const MAX_WORKSPACE_METRICS = MAX_GROWTH_METRIC_ROWS;
const MAX_WORKSPACE_EXPERIMENTS = MAX_GROWTH_EXPERIMENT_ROWS;
const MAX_TEXT_TITLE = 180;
const MAX_TEXT_CONCEPT = 240;
const MAX_SAFE_METRIC = 1_000_000_000_000;

const REQUIRED_HEADERS = ["published_date", "platform", "content_title", "data_kind"] as const;
const CSV_HEADERS = [
  "published_date",
  "platform",
  "content_title",
  "concept",
  "data_kind",
  "views",
  "reach",
  "average_watch_seconds",
  "retention_percent",
  "likes",
  "comments",
  "shares",
  "saves",
  "followers_gained",
  "link_clicks",
  "revenue_usd",
] as const;

type NumericGrowthField =
  | "views"
  | "reach"
  | "averageWatchSeconds"
  | "retentionPercent"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "followersGained"
  | "linkClicks"
  | "revenueUsd";

const NUMERIC_FIELDS: Array<{ field: NumericGrowthField; header: string; integer: boolean; max: number }> = [
  { field: "views", header: "views", integer: true, max: MAX_SAFE_METRIC },
  { field: "reach", header: "reach", integer: true, max: MAX_SAFE_METRIC },
  { field: "averageWatchSeconds", header: "average_watch_seconds", integer: false, max: 86_400 },
  { field: "retentionPercent", header: "retention_percent", integer: false, max: 100 },
  { field: "likes", header: "likes", integer: true, max: MAX_SAFE_METRIC },
  { field: "comments", header: "comments", integer: true, max: MAX_SAFE_METRIC },
  { field: "shares", header: "shares", integer: true, max: MAX_SAFE_METRIC },
  { field: "saves", header: "saves", integer: true, max: MAX_SAFE_METRIC },
  { field: "followersGained", header: "followers_gained", integer: true, max: MAX_SAFE_METRIC },
  { field: "linkClicks", header: "link_clicks", integer: true, max: MAX_SAFE_METRIC },
  { field: "revenueUsd", header: "revenue_usd", integer: false, max: 1_000_000_000 },
];

const HEADER_ALIASES: Record<string, string> = {
  date: "published_date",
  publish_date: "published_date",
  post_date: "published_date",
  title: "content_title",
  post_title: "content_title",
  content: "content_title",
  content_concept: "concept",
  content_pillar: "concept",
  data_type: "data_kind",
  actual_or_estimate: "data_kind",
  avg_watch_seconds: "average_watch_seconds",
  average_watch_duration_seconds: "average_watch_seconds",
  avg_watch_duration_seconds: "average_watch_seconds",
  retention_pct: "retention_percent",
  average_retention_percent: "retention_percent",
  follower_gains: "followers_gained",
  link_clicks: "link_clicks",
};

function normalizeHeader(value: string): string {
  const normalized = value.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return HEADER_ALIASES[normalized] ?? normalized;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGrowthPlatform(value: unknown): value is GrowthPlatform {
  return typeof value === "string" && (GROWTH_PLATFORMS as readonly string[]).includes(value);
}

function isGrowthDataKind(value: unknown): value is GrowthDataKind {
  return value === "actual" || value === "estimate";
}

function isGrowthExperimentStatus(value: unknown): value is GrowthExperimentStatus {
  return value === "planned" || value === "reviewed" || value === "closed";
}

function validText(value: unknown, max: number, required: boolean): value is string {
  return typeof value === "string" && value.length <= max && (required ? value.trim().length > 0 : true);
}

function validMetricNumber(value: unknown, integer: boolean, max: number): value is number | null {
  return value === null || (typeof value === "number" &&
    Number.isFinite(value) && value >= 0 && value <= max && (!integer || Number.isSafeInteger(value)));
}

export function validateGrowthMetric(value: unknown): string[] {
  if (!isPlainObject(value)) return ["Metric row must be a plain object."];
  const errors: string[] = [];
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 160) errors.push("Metric ID is missing or too long.");
  if (typeof value.publishedDate !== "string" || !isValidDateOnly(value.publishedDate)) {
    errors.push("Published date must be a real YYYY-MM-DD date.");
  } else if (value.dataKind === "actual" && value.publishedDate > getLocalDateOnly()) {
    errors.push("Actual platform metrics cannot be recorded for content with a future publish date. Use Estimate until it is published.");
  }
  if (!isGrowthPlatform(value.platform)) errors.push("Choose a supported platform.");
  if (!validText(value.contentTitle, MAX_TEXT_TITLE, true)) errors.push("Content title is required and must be 180 characters or fewer.");
  if (!validText(value.concept, MAX_TEXT_CONCEPT, false)) errors.push("Content concept must be 240 characters or fewer.");
  if (!isGrowthDataKind(value.dataKind)) errors.push("Choose whether the values are actual platform metrics or estimates.");
  for (const item of NUMERIC_FIELDS) {
    if (!validMetricNumber(value[item.field], item.integer, item.max)) {
      errors.push(`${item.header} must be blank or a valid non-negative ${item.integer ? "whole number" : "number"} no greater than ${item.max}.`);
    }
  }
  const hasSignal = NUMERIC_FIELDS.some((item) => typeof value[item.field] === "number");
  if (!hasSignal) errors.push("Enter at least one metric value; blank cells mean not recorded, not zero.");
  return errors;
}

export function isGrowthMetric(value: unknown): value is GrowthMetric {
  return validateGrowthMetric(value).length === 0;
}

function parseCsvNumber(value: string, integer: boolean, max: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) throw new Error("expected a non-negative number or a blank cell");
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > max || (integer && !Number.isSafeInteger(numeric))) {
    throw new Error(`value must be ${integer ? "a safe whole number" : "a number"} between 0 and ${max}`);
  }
  return numeric;
}

/** Parse CSV quoting, escaped quotes, commas and embedded newlines without a dependency. */
function parseCsvGrid(raw: string): { rows: string[][]; errors: string[] } {
  if (raw.length > MAX_CSV_CHARACTERS) return { rows: [], errors: ["CSV exceeds the 2 MB text limit."] };
  const text = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let closedQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (closedQuote && char !== "," && char !== "\n" && char !== "\r" && char !== " " && char !== "\t") {
      return { rows: [], errors: ["CSV has characters after a closing quote. Check the quoted cells and try again."] };
    }
    if (char === '"' && cell.length === 0 && !closedQuote) {
      inQuotes = true;
      continue;
    }
    if (char === '"') {
      return { rows: [], errors: ["CSV has a quote inside an unquoted cell. Quote the entire cell and escape inner quotes as double quotes."] };
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      closedQuote = false;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((part) => part.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      closedQuote = false;
      if (rows.length > MAX_CSV_ROWS + 1) return { rows: [], errors: ["CSV has more than 10,000 data rows. Split the file into smaller batches."] };
      continue;
    }
    if (closedQuote && (char === " " || char === "\t")) continue;
    cell += char;
  }

  if (inQuotes) return { rows: [], errors: ["CSV ends inside a quoted cell. Close the quote and retry."] };
  row.push(cell);
  if (row.some((part) => part.trim() !== "")) rows.push(row);
  if (rows.length > MAX_CSV_ROWS + 1) return { rows: [], errors: ["CSV has more than 10,000 data rows. Split the file into smaller batches."] };
  return { rows, errors };
}

function fingerprintString(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function growthMetricFingerprint(metric: GrowthMetric): string {
  return [
    metric.publishedDate,
    metric.platform,
    fingerprintString(metric.contentTitle),
    fingerprintString(metric.concept),
    metric.dataKind,
  ].join("|");
}

export function parseGrowthMetricsCsv(raw: string, idPrefix = "csv"): GrowthCsvImportResult {
  const grid = parseCsvGrid(raw);
  const result: GrowthCsvImportResult = { rows: [], rejectedRows: [], errors: grid.errors, duplicateRows: 0 };
  if (grid.errors.length || grid.rows.length === 0) {
    if (!grid.errors.length) result.errors.push("CSV is empty.");
    return result;
  }

  const header = grid.rows[0].map(normalizeHeader);
  const columns = new Map<string, number>();
  for (let i = 0; i < header.length; i += 1) {
    const key = header[i];
    if (!key) continue;
    if (columns.has(key)) {
      result.errors.push(`CSV has duplicate ${key} columns.`);
      return result;
    }
    columns.set(key, i);
  }
  const missing = REQUIRED_HEADERS.filter((key) => !columns.has(key));
  if (missing.length) {
    result.errors.push(`CSV is missing required column(s): ${missing.join(", ")}.`);
    return result;
  }

  const seen = new Set<string>();
  for (let index = 1; index < grid.rows.length; index += 1) {
    const cells = grid.rows[index];
    const rowNumber = index + 1;
    if (cells.length !== header.length) {
      result.rejectedRows.push({ rowNumber, reason: `Expected ${header.length} columns but found ${cells.length}.` });
      continue;
    }
    const valueFor = (key: string) => {
      const position = columns.get(key);
      return position === undefined ? "" : cells[position].trim();
    };
    const draft: Record<string, unknown> = {
      id: `${idPrefix}-row-${rowNumber}`,
      publishedDate: valueFor("published_date"),
      platform: valueFor("platform"),
      contentTitle: valueFor("content_title"),
      concept: valueFor("concept"),
      dataKind: valueFor("data_kind").toLowerCase(),
      views: null,
      reach: null,
      averageWatchSeconds: null,
      retentionPercent: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      followersGained: null,
      linkClicks: null,
      revenueUsd: null,
    };

    try {
      for (const spec of NUMERIC_FIELDS) draft[spec.field] = parseCsvNumber(valueFor(spec.header), spec.integer, spec.max);
    } catch (error) {
      result.rejectedRows.push({ rowNumber, reason: error instanceof Error ? error.message : "Invalid numeric metric." });
      continue;
    }

    const issues = validateGrowthMetric(draft);
    if (issues.length) {
      result.rejectedRows.push({ rowNumber, reason: issues.join(" ") });
      continue;
    }
    const metric = draft as GrowthMetric;
    const fingerprint = growthMetricFingerprint(metric);
    if (seen.has(fingerprint)) {
      result.duplicateRows += 1;
      result.rejectedRows.push({ rowNumber, reason: "Duplicate of an earlier row in this CSV; only the first copy was kept." });
      continue;
    }
    seen.add(fingerprint);
    result.rows.push(metric);
  }

  return result;
}

function exportCsvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^(?:\s*[=+@\-]|[\t\r])/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function serializeGrowthMetricsCsv(metrics: GrowthMetric[]): string {
  const safeMetrics = metrics.filter(isGrowthMetric);
  const header = CSV_HEADERS.join(",");
  const lines = safeMetrics.map((metric) => [
    metric.publishedDate,
    metric.platform,
    metric.contentTitle,
    metric.concept,
    metric.dataKind,
    ...NUMERIC_FIELDS.map((item) => metric[item.field]),
  ].map(exportCsvCell).join(","));
  return [header, ...lines].join("\r\n") + "\r\n";
}

export function createGrowthWorkspaceBackupJSON(
  metrics: GrowthMetric[],
  experiments: GrowthExperiment[],
  exportedAt = new Date().toISOString(),
): string {
  const safeMetrics = metrics.filter(isGrowthMetric);
  const safeExperiments = experiments.filter(isGrowthExperiment);
  const backup: GrowthWorkspaceBackup = {
    format: "cooking-creator-growth-lab",
    version: 2,
    exportedAt,
    metrics: safeMetrics,
    experiments: safeExperiments,
  };
  return JSON.stringify(backup, null, 2);
}

export function isGrowthExperiment(value: unknown): value is GrowthExperiment {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 160) return false;
  if (!validText(value.hypothesis, 500, true) || !validText(value.variableChanged, 240, true)) return false;
  if (!isGrowthPlatform(value.platform) || !validText(value.contentTitle, MAX_TEXT_TITLE, false)) return false;
  if (typeof value.startedDate !== "string" || !isValidDateOnly(value.startedDate)) return false;
  if (typeof value.resultDate !== "string" || (value.resultDate !== "" && !isValidDateOnly(value.resultDate))) return false;
  if (value.resultDate && value.resultDate < value.startedDate) return false;
  if (!validText(value.outcome, 1200, false) || !validText(value.nextAction, 500, false)) return false;
  if (!isGrowthExperimentStatus(value.status)) return false;
  if (value.status !== "planned" && (!value.resultDate || !value.outcome.trim() || !value.nextAction.trim())) return false;
  if (value.status !== "planned" &&
      (value.startedDate > getLocalDateOnly() || value.resultDate > getLocalDateOnly())) return false;
  return true;
}

export function validateGrowthExperiment(value: unknown): string[] {
  if (!isPlainObject(value)) return ["Experiment must be a plain object."];
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 160) return ["Experiment ID is missing or too long."];
  const errors: string[] = [];
  if (!validText(value.hypothesis, 500, true)) errors.push("Add a hypothesis of 500 characters or fewer.");
  if (!validText(value.variableChanged, 240, true)) errors.push("Record one variable to change (240 characters or fewer).");
  if (!isGrowthPlatform(value.platform)) errors.push("Choose a supported platform.");
  if (!validText(value.contentTitle, MAX_TEXT_TITLE, false)) errors.push("Content title must be 180 characters or fewer.");
  if (typeof value.startedDate !== "string" || !isValidDateOnly(value.startedDate)) errors.push("Start date must be a real YYYY-MM-DD date.");
  if (typeof value.resultDate !== "string" || (value.resultDate !== "" && !isValidDateOnly(value.resultDate))) errors.push("Result date must be blank or a real YYYY-MM-DD date.");
  if (typeof value.startedDate === "string" && typeof value.resultDate === "string" && value.resultDate && isValidDateOnly(value.startedDate) && isValidDateOnly(value.resultDate) && value.resultDate < value.startedDate) {
    errors.push("Result date cannot be before the experiment start date.");
  }
  if (!validText(value.outcome, 1200, false)) errors.push("Outcome must be 1,200 characters or fewer.");
  if (!validText(value.nextAction, 500, false)) errors.push("Next action must be 500 characters or fewer.");
  if (!isGrowthExperimentStatus(value.status)) errors.push("Choose a supported experiment status.");
  if ((value.status === "reviewed" || value.status === "closed") && (typeof value.resultDate !== "string" || !value.resultDate)) {
    errors.push("Add the result date before marking this experiment reviewed or closed.");
  }
  if ((value.status === "reviewed" || value.status === "closed") && (typeof value.outcome !== "string" || value.outcome.trim().length === 0)) {
    errors.push("Record an outcome before marking this experiment reviewed or closed.");
  }
  if ((value.status === "reviewed" || value.status === "closed") &&
      (typeof value.nextAction !== "string" || value.nextAction.trim().length === 0)) {
    errors.push("Record the next action before marking this experiment reviewed or closed.");
  }
  if ((value.status === "reviewed" || value.status === "closed") &&
      typeof value.startedDate === "string" && isValidDateOnly(value.startedDate) &&
      value.startedDate > getLocalDateOnly()) {
    errors.push("A future-dated experiment cannot be marked reviewed or closed.");
  }
  if ((value.status === "reviewed" || value.status === "closed") &&
      typeof value.resultDate === "string" && isValidDateOnly(value.resultDate) &&
      value.resultDate > getLocalDateOnly()) {
    errors.push("A future result date cannot be marked reviewed or closed.");
  }
  return errors;
}

export function parseGrowthWorkspaceBackupJSON(raw: string): GrowthWorkspaceBackup | null {
  if (raw.length > MAX_WORKSPACE_CHARACTERS) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) ||
      parsed.format !== "cooking-creator-growth-lab" ||
      (parsed.version !== 1 && parsed.version !== 2) ||
      typeof parsed.exportedAt !== "string" ||
      !isValidIsoTimestamp(parsed.exportedAt) ||
      !Array.isArray(parsed.metrics) ||
      !Array.isArray(parsed.experiments) ||
      parsed.metrics.length > MAX_WORKSPACE_METRICS ||
      parsed.experiments.length > MAX_WORKSPACE_EXPERIMENTS) return null;

  // Version 1 backups predate per-content USD revenue. Migrate the absent field to missing,
  // never to zero; malformed present values still fail validation.
  const metrics = parsed.metrics.map((value) => {
    if (!isPlainObject(value)) return value;
    return value.revenueUsd === undefined ? { ...value, revenueUsd: null } : value;
  });

  const migrationWarnings: string[] = [];
  const today = getLocalDateOnly();
  const experiments = parsed.experiments.map((value, index) => {
    if (!isPlainObject(value)) return value;
    // V2.3 introduced a required next action and disallows future-dated completed experiments.
    // Normalize a missing legacy field, then downgrade incomplete completed records instead of
    // discarding an otherwise recoverable owner's workspace.
    const candidate = value.nextAction === undefined ? { ...value, nextAction: "" } : value;
    if (candidate.status !== "reviewed" && candidate.status !== "closed") return candidate;

    const hasValidDates =
      typeof candidate.startedDate === "string" &&
      isValidDateOnly(candidate.startedDate) &&
      typeof candidate.resultDate === "string" &&
      isValidDateOnly(candidate.resultDate) &&
      candidate.resultDate >= candidate.startedDate;
    if (!hasValidDates) return candidate;

    const hasNextAction = typeof candidate.nextAction === "string" && Boolean(candidate.nextAction.trim());
    const hasFutureCompletionDate =
      candidate.startedDate > today || candidate.resultDate > today;
    if (!hasNextAction || hasFutureCompletionDate) {
      migrationWarnings.push(
        `Experiment ${index + 1} was downgraded to Planned because completed experiments require a recorded next action and non-future dates.`,
      );
      return { ...candidate, status: "planned" };
    }
    return candidate;
  });

  if (!metrics.every(isGrowthMetric) || !experiments.every(isGrowthExperiment)) return null;

  const seenFingerprints = new Set<string>();
  const seenMetricIds = new Set<string>();
  for (const metric of metrics as GrowthMetric[]) {
    const fingerprint = growthMetricFingerprint(metric);
    if (seenFingerprints.has(fingerprint) || seenMetricIds.has(metric.id)) return null;
    seenFingerprints.add(fingerprint);
    seenMetricIds.add(metric.id);
  }
  const seenExperimentIds = new Set<string>();
  for (const experiment of experiments as GrowthExperiment[]) {
    if (seenExperimentIds.has(experiment.id)) return null;
    seenExperimentIds.add(experiment.id);
  }
  return {
    format: "cooking-creator-growth-lab",
    version: 2,
    exportedAt: parsed.exportedAt,
    metrics: metrics as GrowthMetric[],
    experiments: experiments as GrowthExperiment[],
    ...(migrationWarnings.length ? { migrationWarnings } : {}),
  };
}

export function mergeGrowthMetrics(
  existing: GrowthMetric[],
  incoming: GrowthMetric[],
): { rows: GrowthMetric[]; added: number; duplicates: number } {
  const rows = existing.filter(isGrowthMetric).slice();
  const seenFingerprints = new Set(rows.map(growthMetricFingerprint));
  const usedIds = new Set(rows.map((metric) => metric.id));
  let added = 0;
  let duplicates = 0;

  for (const metric of incoming) {
    if (!isGrowthMetric(metric)) continue;
    const fingerprint = growthMetricFingerprint(metric);
    if (seenFingerprints.has(fingerprint)) {
      duplicates += 1;
      continue;
    }

    let id = metric.id;
    if (usedIds.has(id)) {
      const base = id.slice(0, 130);
      let suffix = 2;
      id = `${base}-imported-${suffix}`;
      while (usedIds.has(id) && suffix < 100_000) {
        suffix += 1;
        id = `${base}-imported-${suffix}`;
      }
      if (usedIds.has(id)) {
        duplicates += 1;
        continue;
      }
    }

    const safeMetric = id === metric.id ? metric : { ...metric, id };
    rows.push(safeMetric);
    usedIds.add(id);
    seenFingerprints.add(fingerprint);
    added += 1;
  }
  return { rows, added, duplicates };
}

export function mergeGrowthExperiments(
  existing: GrowthExperiment[],
  incoming: GrowthExperiment[],
): { rows: GrowthExperiment[]; added: number; duplicates: number } {
  const rows = existing.filter(isGrowthExperiment).slice();
  const usedIds = new Set(rows.map((experiment) => experiment.id));
  let added = 0;
  let duplicates = 0;

  for (const experiment of incoming) {
    if (!isGrowthExperiment(experiment)) continue;
    const currentWithId = rows.find((row) => row.id === experiment.id);
    if (currentWithId && JSON.stringify(currentWithId) === JSON.stringify(experiment)) {
      duplicates += 1;
      continue;
    }

    let id = experiment.id;
    if (usedIds.has(id)) {
      const base = id.slice(0, 130);
      let suffix = 2;
      id = `${base}-imported-${suffix}`;
      while (usedIds.has(id) && suffix < 100_000) {
        suffix += 1;
        id = `${base}-imported-${suffix}`;
      }
      if (usedIds.has(id)) {
        duplicates += 1;
        continue;
      }
    }

    rows.push(id === experiment.id ? experiment : { ...experiment, id });
    usedIds.add(id);
    added += 1;
  }
  return { rows, added, duplicates };
}

export function summarizeGrowthMetrics(metrics: GrowthMetric[]): GrowthMetricSummary {
  const actual = metrics.filter((metric) => isGrowthMetric(metric) && metric.dataKind === "actual");
  const estimates = metrics.filter((metric) => isGrowthMetric(metric) && metric.dataKind === "estimate");
  const sumFor = (rows: GrowthMetric[], field: "views" | "reach" | "revenueUsd") => {
    const recorded = rows.map((row) => row[field]).filter((value): value is number => value !== null);
    return { total: recorded.length ? recorded.reduce((sum, value) => sum + value, 0) : null, count: recorded.length };
  };
  const actualViews = sumFor(actual, "views");
  const estimateViews = sumFor(estimates, "views");
  const actualReach = sumFor(actual, "reach");
  const estimateReach = sumFor(estimates, "reach");
  const actualRevenue = sumFor(actual, "revenueUsd");
  const estimateRevenue = sumFor(estimates, "revenueUsd");
  const warnings: string[] = [
    "These are descriptive records supplied by the owner. They do not prove that a format caused a result or predict future performance.",
  ];
  if (actual.length < 5) warnings.push(`Very small actual-data sample (n=${actual.length}); do not draw trend conclusions yet.`);
  else if (actual.length < 10) warnings.push(`Small actual-data sample (n=${actual.length}); compare descriptively and avoid causal claims.`);
  if (estimates.length) warnings.push(`${estimates.length} estimated row(s) are kept separate from actual platform metrics.`);
  return {
    totalRows: metrics.filter(isGrowthMetric).length,
    actualRows: actual.length,
    estimateRows: estimates.length,
    actualViewsTotal: actualViews.total,
    actualViewsRows: actualViews.count,
    estimateViewsTotal: estimateViews.total,
    estimateViewsRows: estimateViews.count,
    actualReachTotal: actualReach.total,
    actualReachRows: actualReach.count,
    estimateReachTotal: estimateReach.total,
    estimateReachRows: estimateReach.count,
    actualRevenueUsdTotal: actualRevenue.total,
    actualRevenueUsdRows: actualRevenue.count,
    estimateRevenueUsdTotal: estimateRevenue.total,
    estimateRevenueUsdRows: estimateRevenue.count,
    warnings,
  };
}

/** Only describes recorded view counts; it never claims that a change caused the outcome. */
export function buildDescriptiveGrowthInsights(metrics: GrowthMetric[]): string[] {
  const actual = metrics.filter((metric) => isGrowthMetric(metric) && metric.dataKind === "actual" && metric.views !== null);
  const byPlatform = new Map<GrowthPlatform, GrowthMetric[]>();
  for (const metric of actual) byPlatform.set(metric.platform, [...(byPlatform.get(metric.platform) ?? []), metric]);
  const insights: string[] = [];
  for (const [platform, rows] of byPlatform) {
    if (rows.length < 10) continue;
    const ranked = rows.slice().sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    insights.push(`${platform}: highest recorded view count in this set is “${ranked[0].contentTitle}” (${ranked[0].views} views, among ${rows.length} actual rows). This is descriptive only; it does not show that a format caused the result.`);
  }
  if (!insights.length) insights.push(`No within-platform comparison is shown yet. Record at least 10 actual rows with view counts for the same platform; the current data contains ${actual.length} actual row(s) with views in total.`);
  return insights;
}
