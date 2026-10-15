import test from "node:test";
import assert from "node:assert/strict";
import {
  addScheduleDays,
  buildScheduleDraft,
  getUsEasternCalendarDate,
  isValidCalendarDate,
  isValidScheduleUrl,
  parseScheduleLinks,
} from "../lib/schedule";

function urls(count: number): string[] {
  return Array.from({ length: count }, (_, index) => "https://example.com/video/" + index);
}

test("parses any number of lines while trimming blanks and preserving order", () => {
  assert.deepEqual(
    parseScheduleLinks("  https://example.com/1  \n\nhttps://example.com/2\n"),
    ["https://example.com/1", "https://example.com/2"],
  );
});

test("accepts HTTP(S) sources only", () => {
  assert.equal(isValidScheduleUrl("https://example.com/reel/1"), true);
  assert.equal(isValidScheduleUrl("http://example.com/video"), true);
  assert.equal(isValidScheduleUrl("javascript:alert(1)"), false);
  assert.equal(isValidScheduleUrl("not a url"), false);
});

test("spreads seven links across a chosen three-day window without changing link order", () => {
  const links = urls(7);
  const result = buildScheduleDraft({
    links,
    startDate: "2026-10-15",
    daysToProcess: 3,
    linksPerDay: 3,
    now: 123,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.posts.length, 7);
  assert.deepEqual(result.posts.map((post) => post.url), links);
  assert.deepEqual([...new Set(result.posts.map((post) => post.date))], [
    "2026-10-15",
    "2026-10-16",
    "2026-10-17",
  ]);
  assert.deepEqual(
    result.posts.reduce<Record<string, number>>((counts, post) => {
      counts[post.date] = (counts[post.date] ?? 0) + 1;
      return counts;
    }, {}),
    { "2026-10-15": 3, "2026-10-16": 2, "2026-10-17": 2 },
  );
  assert.ok(result.posts.every((post) => post.status === "Draft — approval needed"));
});

test("supports more than seven links and more than 1,000 links per day", () => {
  const links = urls(1_005);
  const result = buildScheduleDraft({
    links,
    startDate: "2026-10-15",
    daysToProcess: 1,
    linksPerDay: 1_005,
    now: 500,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.posts.length, 1_005);
  assert.equal(result.posts[0].url, links[0]);
  assert.equal(result.posts[1_004].url, links[1_004]);
});

test("rejects settings that cannot accommodate every link instead of dropping links", () => {
  const result = buildScheduleDraft({
    links: urls(5),
    startDate: "2026-10-15",
    daysToProcess: 2,
    linksPerDay: 2,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /at least 3 days/i);
});

test("reports an invalid source link before checking schedule capacity", () => {
  const result = buildScheduleDraft({
    links: ["https://example.com/ok", "javascript:alert(1)"],
    startDate: "2026-10-15",
    daysToProcess: 1,
    linksPerDay: 1,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Link 2/i);
});

test("validates positive safe whole-number settings without arbitrary UI caps", () => {
  const valid = buildScheduleDraft({
    links: urls(20),
    startDate: "2026-10-15",
    daysToProcess: 2,
    linksPerDay: 10,
  });
  assert.equal(valid.ok, true);

  const invalid = buildScheduleDraft({
    links: urls(2),
    startDate: "2026-10-15",
    daysToProcess: 1.5,
    linksPerDay: 2,
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.match(invalid.error, /whole number/i);
});

test("calendar arithmetic is stable across the US daylight-saving transition", () => {
  assert.equal(addScheduleDays("2026-03-07", 0), "2026-03-07");
  assert.equal(addScheduleDays("2026-03-07", 1), "2026-03-08");
  assert.equal(addScheduleDays("2026-03-07", 2), "2026-03-09");
  assert.equal(isValidCalendarDate("2026-02-29"), false);
  assert.equal(isValidCalendarDate("2026-02-28"), true);
});

test("uses the US Eastern calendar date rather than the device timezone", () => {
  assert.equal(
    getUsEasternCalendarDate(new Date("2026-10-15T02:00:00.000Z")),
    "2026-10-14",
  );
});
