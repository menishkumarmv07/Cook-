import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDescriptiveGrowthInsights,
  createGrowthWorkspaceBackupJSON,
  growthMetricFingerprint,
  getLocalDateOnly,
  isGrowthExperiment,
  isGrowthMetric,
  mergeGrowthExperiments,
  mergeGrowthMetrics,
  parseGrowthMetricsCsv,
  parseGrowthWorkspaceBackupJSON,
  serializeGrowthMetricsCsv,
  summarizeGrowthMetrics,
  validateGrowthExperiment,
  validateGrowthMetric,
  type GrowthExperiment,
  type GrowthMetric,
} from "../lib/growth-lab";

const actualMetric = (overrides: Partial<GrowthMetric> = {}): GrowthMetric => ({
  id: "metric-1",
  publishedDate: "2026-10-01",
  platform: "YouTube Shorts",
  contentTitle: "Lemon rice in 30 seconds",
  concept: "Quick weeknight meals",
  dataKind: "actual",
  revenueUsd: null,
  views: 1200,
  reach: 1000,
  averageWatchSeconds: 18.5,
  retentionPercent: 61.25,
  likes: 70,
  comments: 6,
  shares: 10,
  saves: 24,
  followersGained: 8,
  linkClicks: 3,
  ...overrides,
});

const estimateMetric = (overrides: Partial<GrowthMetric> = {}): GrowthMetric => ({
  ...actualMetric({ id: "estimate-1", dataKind: "estimate", views: 500 }),
  ...overrides,
});

const experiment = (overrides: Partial<GrowthExperiment> = {}): GrowthExperiment => ({
  id: "experiment-1",
  hypothesis: "A clearer first step will improve short-form retention.",
  variableChanged: "Opening shot",
  platform: "YouTube Shorts",
  contentTitle: "Lemon rice in 30 seconds",
  startedDate: "2026-10-01",
  resultDate: "",
  outcome: "",
  nextAction: "",
  status: "planned",
  ...overrides,
});

function csvFor(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => {
    const value = String(cell);
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(",")).join("\r\n");
}

const headers = [
  "published_date", "platform", "content_title", "concept", "data_kind",
  "views", "reach", "average_watch_seconds", "retention_percent",
  "likes", "comments", "shares", "saves", "followers_gained", "link_clicks",
];

test("validates actual and estimated rows without conflating their meaning", () => {
  assert.equal(isGrowthMetric(actualMetric()), true);
  assert.equal(isGrowthMetric(estimateMetric()), true);
  assert.deepEqual(validateGrowthMetric(actualMetric()), []);
  assert.equal(isGrowthMetric({ ...actualMetric(), dataKind: "maybe" }), false);
  assert.ok(validateGrowthMetric({ ...actualMetric(), views: -1 }).some((x) => /views must be/.test(x)));
  assert.ok(validateGrowthMetric({ ...actualMetric(), retentionPercent: 100.1 }).some((x) => /retention_percent must be/.test(x)));
  assert.ok(validateGrowthMetric({ ...actualMetric(), likes: 1.5 }).some((x) => /likes must be/.test(x)));
  assert.ok(validateGrowthMetric({ ...actualMetric(), revenueUsd: -0.01 }).some((x) => /revenue_usd must be/.test(x)));
  assert.ok(validateGrowthMetric({ ...actualMetric(), revenueUsd: 1_000_000_001 }).some((x) => /revenue_usd must be/.test(x)));
  assert.ok(validateGrowthMetric({ ...actualMetric(), publishedDate: "2026-02-30" }).some((x) => /real YYYY-MM-DD/.test(x)));
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const futurePublishDate = getLocalDateOnly(tomorrowDate);
  assert.ok(validateGrowthMetric(actualMetric({ publishedDate: futurePublishDate })).some((x) => /future publish date/i.test(x)));
  assert.deepEqual(validateGrowthMetric(estimateMetric({ publishedDate: futurePublishDate })), []);
  assert.ok(validateGrowthMetric({ ...actualMetric(), views: null, reach: null, averageWatchSeconds: null, retentionPercent: null, likes: null, comments: null, shares: null, saves: null, followersGained: null, linkClicks: null }).some((x) => /at least one metric value/.test(x)));
});

test("CSV parser accepts BOM, CRLF, quoted commas, escaped quotes and embedded newlines", () => {
  const rows = [
    headers,
    ["2026-10-01", "YouTube Shorts", 'Lemon rice, "fast"', "Quick meals\nfor weekdays", "actual", "1200", "1000", "18.5", "61.25", "70", "6", "10", "24", "8", "3"],
  ];
  const imported = parseGrowthMetricsCsv("\uFEFF" + csvFor(rows));
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rejectedRows.length, 0);
  assert.equal(imported.rows[0].contentTitle, 'Lemon rice, "fast"');
  assert.equal(imported.rows[0].concept, "Quick meals\nfor weekdays");
  assert.equal(imported.rows[0].views, 1200);
  assert.equal(imported.rows[0].averageWatchSeconds, 18.5);
  assert.equal(imported.rows[0].dataKind, "actual");
  assert.equal(imported.rows[0].revenueUsd, null);
});

test("CSV header aliases are supported but required columns stay mandatory", () => {
  const imported = parseGrowthMetricsCsv(csvFor([
    ["date", "platform", "title", "concept", "actual_or_estimate", "views"],
    ["2026-10-02", "Instagram Reels", "Crispy potatoes", "Side dishes", "estimate", "250"],
  ]));
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.rows[0].publishedDate, "2026-10-02");
  assert.equal(imported.rows[0].contentTitle, "Crispy potatoes");
  assert.equal(imported.rows[0].dataKind, "estimate");
  assert.equal(imported.rows[0].views, 250);

  const missing = parseGrowthMetricsCsv("platform,title,views\nYouTube Shorts,Example,25");
  assert.equal(missing.rows.length, 0);
  assert.match(missing.errors.join(" "), /published_date.*data_kind/);
});

test("CSV import reports bad rows independently and never treats blank metrics as zero", () => {
  const imported = parseGrowthMetricsCsv(csvFor([
    headers,
    ["2026-10-01", "YouTube Shorts", "Good row", "Basics", "actual", "0", "", "", "", "", "", "", "", "", ""],
    ["2026-02-30", "YouTube Shorts", "Bad date", "Basics", "actual", "12", "", "", "", "", "", "", "", "", ""],
    ["2026-10-03", "YouTube Shorts", "Bad count", "Basics", "actual", "12 views", "", "", "", "", "", "", "", "", ""],
    ["2026-10-04", "YouTube Shorts", "No metrics", "Basics", "actual", "", "", "", "", "", "", "", "", "", ""],
  ]));
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.rows.length, 1);
  assert.equal(imported.rows[0].views, 0);
  assert.equal(imported.rows[0].reach, null);
  assert.equal(imported.rejectedRows.length, 3);
  assert.match(imported.rejectedRows[0].reason, /real YYYY-MM-DD/);
  assert.match(imported.rejectedRows[1].reason, /non-negative number/);
  assert.match(imported.rejectedRows[2].reason, /at least one metric value/);
});

test("CSV import rejects malformed quoting, wrong cell counts, duplicate headers and oversized files", () => {
  assert.match(parseGrowthMetricsCsv('"published_date,platform\n').errors.join(" "), /ends inside a quoted cell/);
  const wrongCells = parseGrowthMetricsCsv(csvFor([headers, ["2026-10-01", "YouTube Shorts"]]));
  assert.match(wrongCells.rejectedRows[0].reason, /Expected 15 columns/);
  const repeatedHeaders = parseGrowthMetricsCsv(csvFor([["date", "published_date", "platform", "title", "data_kind"], ["2026-10-01", "2026-10-01", "Other", "Test", "actual"]]));
  assert.match(repeatedHeaders.errors.join(" "), /duplicate published_date/);
  assert.match(parseGrowthMetricsCsv("x".repeat(2_000_001)).errors.join(" "), /2 MB/);
});

test("backup merges keep records when internal IDs collide across different workspaces", () => {
  const existingMetric = actualMetric({ id: "shared-id", contentTitle: "Existing title" });
  const incomingMetric = actualMetric({ id: "shared-id", contentTitle: "Incoming title", publishedDate: "2026-10-02" });
  const metrics = mergeGrowthMetrics([existingMetric], [incomingMetric]);
  assert.equal(metrics.added, 1);
  assert.equal(metrics.rows.length, 2);
  assert.equal(new Set(metrics.rows.map((row) => row.id)).size, 2);
  assert.deepEqual(metrics.rows.map((row) => row.contentTitle), ["Existing title", "Incoming title"]);

  const existingExperiment = experiment({ id: "shared-experiment" });
  const incomingExperiment = experiment({ id: "shared-experiment", hypothesis: "A distinct hypothesis", startedDate: "2026-10-03" });
  const experiments = mergeGrowthExperiments([existingExperiment], [incomingExperiment]);
  assert.equal(experiments.added, 1);
  assert.equal(experiments.rows.length, 2);
  assert.equal(new Set(experiments.rows.map((row) => row.id)).size, 2);
  assert.deepEqual(experiments.rows.map((row) => row.hypothesis), [existingExperiment.hypothesis, incomingExperiment.hypothesis]);
});

test("duplicate CSV rows and repeated imports are deduplicated by stable content identity", () => {
  const rows = [
    headers,
    ["2026-10-01", "YouTube Shorts", "Lemon rice", "Quick meals", "actual", "100", "", "", "", "", "", "", "", "", ""],
    ["2026-10-01", "YouTube Shorts", " lemon   rice ", "Quick meals", "actual", "100", "", "", "", "", "", "", "", "", ""],
    ["2026-10-01", "YouTube Shorts", "Lemon rice", "Quick meals", "estimate", "100", "", "", "", "", "", "", "", "", ""],
  ];
  const imported = parseGrowthMetricsCsv(csvFor(rows));
  assert.equal(imported.rows.length, 2);
  assert.equal(imported.duplicateRows, 1);
  assert.equal(imported.rejectedRows.length, 1);
  const merged = mergeGrowthMetrics([imported.rows[0]], imported.rows);
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.rows.length, 2);
  assert.notEqual(growthMetricFingerprint(imported.rows[0]), growthMetricFingerprint(imported.rows[1]));
});

test("CSV export round-trips ordinary rows and neutralizes spreadsheet formula cells", () => {
  const original = actualMetric();
  const exported = serializeGrowthMetricsCsv([original]);
  const imported = parseGrowthMetricsCsv(exported);
  assert.equal(imported.rows.length, 1);
  assert.deepEqual(imported.rows[0], { ...original, id: "csv-row-2" });
  const malicious = serializeGrowthMetricsCsv([actualMetric({ contentTitle: "=HYPERLINK(\\\"https://bad.example\\\",\\\"click\\\")" })]);
  assert.match(malicious, /"'=HYPERLINK/);
  const leadingSpaceFormula = serializeGrowthMetricsCsv([actualMetric({ contentTitle: "   =1+1" })]);
  assert.match(leadingSpaceFormula, /"'   =1\+1"/);
  const tabPrefixFormula = serializeGrowthMetricsCsv([actualMetric({ contentTitle: "\t=1+1" })]);
  assert.match(tabPrefixFormula, /"'\t=1\+1"/);
  const maliciousImport = parseGrowthMetricsCsv(malicious);
  assert.equal(maliciousImport.rows[0].contentTitle.startsWith("'="), true);
});

test("experiment lifecycle requires evidence and a next action before review", () => {
  assert.equal(isGrowthExperiment(experiment()), true);
  assert.deepEqual(validateGrowthExperiment(experiment()), []);
  assert.ok(validateGrowthExperiment(experiment({ hypothesis: "" })).some((x) => /hypothesis/.test(x)));
  assert.ok(validateGrowthExperiment(experiment({
    resultDate: "2026-09-30",
    status: "reviewed",
    outcome: "Did better.",
    nextAction: "Repeat the test.",
  })).some((x) => /before the experiment start date/.test(x)));
  assert.ok(validateGrowthExperiment(experiment({ status: "closed", resultDate: "", outcome: "", nextAction: "" })).some((x) => /result date/.test(x)));

  const today = getLocalDateOnly();
  const noNextAction = experiment({
    status: "reviewed",
    startedDate: today,
    resultDate: today,
    outcome: "The actual view count was recorded, with a small sample.",
    nextAction: "",
  });
  assert.ok(validateGrowthExperiment(noNextAction).some((x) => /next action before marking/i.test(x)));
  assert.equal(isGrowthExperiment(noNextAction), false);

  const reviewed = experiment({
    status: "reviewed",
    startedDate: today,
    resultDate: today,
    outcome: "The actual view count was recorded, with a small sample.",
    nextAction: "Repeat cautiously and change only one variable.",
  });
  assert.equal(isGrowthExperiment(reviewed), true);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const futureDate = getLocalDateOnly(tomorrow);
  const prematurelyReviewed = experiment({
    status: "reviewed",
    startedDate: today,
    resultDate: futureDate,
    outcome: "Results are not available yet.",
    nextAction: "Wait until the platform reports actual values.",
  });
  assert.ok(validateGrowthExperiment(prematurelyReviewed).some((x) => /future result date/i.test(x)));
  assert.equal(isGrowthExperiment(prematurelyReviewed), false);
});

test("Growth Lab backup round-trips validated metrics and experiments and rejects malformed archives", () => {
  const metrics = [actualMetric(), estimateMetric()];
  const experiments = [experiment(), experiment({ id: "exp-2", status: "reviewed", resultDate: "2026-10-05", outcome: "The outcome is recorded.", nextAction: "Repeat cautiously." })];
  const exportedAt = "2026-10-22T12:00:00.000Z";
  const backup = createGrowthWorkspaceBackupJSON(metrics, experiments, exportedAt);
  const restored = parseGrowthWorkspaceBackupJSON(backup);
  assert.ok(restored);
  assert.equal(restored.version, 2);
  assert.equal(restored.exportedAt, exportedAt);
  assert.deepEqual(restored.metrics, metrics);
  assert.deepEqual(restored.experiments, experiments);
  assert.equal(parseGrowthWorkspaceBackupJSON("not JSON"), null);
  assert.equal(parseGrowthWorkspaceBackupJSON(JSON.stringify({ format: "cooking-creator-growth-lab", version: 3, exportedAt, metrics, experiments })), null);
  assert.equal(parseGrowthWorkspaceBackupJSON(JSON.stringify({ format: "cooking-creator-growth-lab", version: 1, exportedAt, metrics: [{ ...metrics[0], views: -1 }], experiments })), null);
  assert.equal(parseGrowthWorkspaceBackupJSON(JSON.stringify({ format: "cooking-creator-growth-lab", version: 1, exportedAt: "not time", metrics, experiments })), null);
  const legacyV1 = parseGrowthWorkspaceBackupJSON(JSON.stringify({
    format: "cooking-creator-growth-lab", version: 1, exportedAt, metrics: [{
      ...actualMetric(), revenueUsd: undefined,
    }], experiments,
  }));
  assert.ok(legacyV1);
  assert.equal(legacyV1.version, 2);
  assert.equal(legacyV1.metrics[0].revenueUsd, null);

  const today = getLocalDateOnly();
  const legacyCompletedWithoutNextAction = parseGrowthWorkspaceBackupJSON(JSON.stringify({
    format: "cooking-creator-growth-lab",
    version: 1,
    exportedAt,
    metrics: [actualMetric()],
    experiments: [{
      ...experiment({
        status: "reviewed",
        startedDate: today,
        resultDate: today,
        outcome: "The old backup recorded a result but did not include a next action.",
      }),
      nextAction: undefined,
    }],
  }));
  assert.ok(legacyCompletedWithoutNextAction);
  assert.equal(legacyCompletedWithoutNextAction.experiments[0].status, "planned");
  assert.equal(legacyCompletedWithoutNextAction.experiments[0].nextAction, "");
  assert.match((legacyCompletedWithoutNextAction.migrationWarnings ?? []).join(" "), /downgraded to Planned/);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const futureDate = getLocalDateOnly(tomorrow);
  const futureDatedActual = parseGrowthWorkspaceBackupJSON(JSON.stringify({
    format: "cooking-creator-growth-lab",
    version: 2,
    exportedAt,
    metrics: [actualMetric({ publishedDate: futureDate })],
    experiments: [experiment()],
  }));
  assert.ok(futureDatedActual);
  assert.equal(futureDatedActual.metrics[0].dataKind, "estimate");
  assert.match((futureDatedActual.migrationWarnings ?? []).join(" "), /downgraded to Estimate/);

  const futureCompleted = parseGrowthWorkspaceBackupJSON(JSON.stringify({
    format: "cooking-creator-growth-lab",
    version: 2,
    exportedAt,
    metrics: [actualMetric()],
    experiments: [experiment({
      status: "reviewed",
      startedDate: today,
      resultDate: futureDate,
      outcome: "This date should not count as completed yet.",
      nextAction: "Wait for actual platform data.",
    })],
  }));
  assert.ok(futureCompleted);
  assert.equal(futureCompleted.experiments[0].status, "planned");
  assert.equal(futureCompleted.migrationWarnings?.length, 1);

  assert.equal(parseGrowthWorkspaceBackupJSON(createGrowthWorkspaceBackupJSON([
    actualMetric({ id: "same-id", contentTitle: "First title" }),
    actualMetric({ id: "same-id", contentTitle: "Second title" }),
  ], [])), null);
  assert.equal(parseGrowthWorkspaceBackupJSON(createGrowthWorkspaceBackupJSON([], [
    experiment({ id: "same-experiment" }),
    experiment({ id: "same-experiment", hypothesis: "Another hypothesis with the same ID" }),
  ])), null);
});

test("growth summaries separate actual metrics from estimates and explain sample-size limits", () => {
  const summary = summarizeGrowthMetrics([actualMetric({ views: 1200 }), actualMetric({ id: "actual-2", views: null, reach: 100 }), estimateMetric({ views: 500 })]);
  assert.equal(summary.actualRows, 2);
  assert.equal(summary.estimateRows, 1);
  assert.equal(summary.actualViewsTotal, 1200);
  assert.equal(summary.actualViewsRows, 1);
  assert.equal(summary.estimateViewsTotal, 500);
  assert.equal(summary.estimateViewsRows, 1);
  assert.ok(summary.warnings.some((x) => /Very small actual-data sample/.test(x)));
  assert.ok(summary.warnings.some((x) => /estimated row/.test(x)));
  const revenueSummary = summarizeGrowthMetrics([
    actualMetric({ revenueUsd: 12.5 }),
    actualMetric({ id: "actual-revenue-2", revenueUsd: 2.25 }),
    estimateMetric({ revenueUsd: 99 }),
  ]);
  assert.equal(revenueSummary.actualRevenueUsdTotal, 14.75);
  assert.equal(revenueSummary.actualRevenueUsdRows, 2);
  assert.equal(revenueSummary.estimateRevenueUsdTotal, 99);
  assert.equal(revenueSummary.estimateRevenueUsdRows, 1);
  assert.equal(summarizeGrowthMetrics([]).actualViewsTotal, null);
});

test("descriptive insights require ten actual rows per platform and avoid causal claims", () => {
  const smallSample = buildDescriptiveGrowthInsights(
    Array.from({ length: 9 }, (_, i) => actualMetric({ id: `small-${i}`, views: i + 1 })),
  );
  assert.match(smallSample.join(" "), /No within-platform comparison is shown yet/);
  const adequateSample = buildDescriptiveGrowthInsights(
    Array.from({ length: 10 }, (_, i) => actualMetric({ id: `large-${i}`, contentTitle: `Recipe ${i + 1}`, views: i + 1 })),
  );
  assert.equal(adequateSample.length, 1);
  assert.match(adequateSample[0], /Recipe 10/);
  assert.match(adequateSample[0], /descriptive only/);
  assert.match(adequateSample[0], /does not show that a format caused the result/);
});
