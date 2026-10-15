export const SUGGESTED_TIMES = ["09:00", "13:00", "18:00"] as const;

export type SuggestedTime = (typeof SUGGESTED_TIMES)[number];

export type ScheduledPost = {
  id: string;
  url: string;
  date: string;
  time: SuggestedTime;
  status: "Draft — approval needed";
};

export type ScheduleBuildResult =
  | { ok: true; posts: ScheduledPost[] }
  | { ok: false; error: string };

export type ScheduleBuildInput = {
  links: string[];
  startDate: string;
  daysToProcess: number;
  linksPerDay: number;
  now?: number;
};

export function getUsEasternCalendarDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999) return false;
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

/** Add calendar days in UTC so the US Eastern schedule remains stable across DST changes. */
export function addScheduleDays(start: string, days: number): string | null {
  if (!isValidCalendarDate(start) || !Number.isSafeInteger(days) || days < 0) return null;
  const date = new Date(start + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const result = date.toISOString().slice(0, 10);
    return isValidCalendarDate(result) ? result : null;
  } catch {
    return null;
  }
}

export function parseScheduleLinks(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function isValidScheduleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isSuggestedTime(value: unknown): value is SuggestedTime {
  return typeof value === "string" && (SUGGESTED_TIMES as readonly string[]).includes(value);
}

/**
 * Build a local draft for every URL. The selected day count is the scheduling
 * window and linksPerDay is the maximum number of posts on any one day. Links
 * stay in pasted order and are balanced across the chosen US Eastern date range.
 */
export function buildScheduleDraft(input: ScheduleBuildInput): ScheduleBuildResult {
  const { links, startDate, daysToProcess, linksPerDay } = input;

  if (!isValidCalendarDate(startDate)) {
    return { ok: false, error: "Choose a valid start date before generating the plan." };
  }
  if (links.length === 0) {
    return { ok: false, error: "Add at least one video URL before generating a plan." };
  }

  const invalidLinkIndex = links.findIndex((link) => !isValidScheduleUrl(link));
  if (invalidLinkIndex !== -1) {
    return {
      ok: false,
      error: "Link " + (invalidLinkIndex + 1) + " is not a complete http:// or https:// URL. Fix invalid links before generating the plan.",
    };
  }

  if (!Number.isSafeInteger(daysToProcess) || daysToProcess < 1 ||
      !Number.isSafeInteger(linksPerDay) || linksPerDay < 1) {
    return { ok: false, error: "Enter a whole number greater than zero for both days and links per day." };
  }

  const minimumDays = Math.ceil(links.length / linksPerDay);
  if (daysToProcess < minimumDays) {
    return {
      ok: false,
      error: "You added " + links.length + " links and allowed up to " + linksPerDay +
        " per day. Choose at least " + minimumDays + " days, or allow more links per day, so every link is included.",
    };
  }

  // Validate the full selected date range without imposing arbitrary day/link caps.
  if (addScheduleDays(startDate, daysToProcess - 1) === null) {
    return { ok: false, error: "That date range extends beyond the supported calendar. Choose a shorter plan or an earlier start date." };
  }

  const postedPerDay = new Map<number, number>();
  const posts: ScheduledPost[] = [];
  const idPrefix = input.now ?? Date.now();

  for (let index = 0; index < links.length; index += 1) {
    // Centered distribution uses the selected date range instead of front-loading
    // all links onto the first few days. It never exceeds the requested daily cap.
    const dayIndex = Math.min(
      daysToProcess - 1,
      Math.floor(((index + 0.5) * daysToProcess) / links.length),
    );
    const countForDay = postedPerDay.get(dayIndex) ?? 0;
    if (countForDay >= linksPerDay) {
      return { ok: false, error: "These settings cannot fit every link. Increase the days or links per day, then try again." };
    }
    const date = addScheduleDays(startDate, dayIndex);
    if (!date) {
      return { ok: false, error: "The schedule date range is invalid. Choose another start date." };
    }
    posts.push({
      id: String(idPrefix) + "-" + index,
      url: links[index],
      date,
      time: SUGGESTED_TIMES[countForDay % SUGGESTED_TIMES.length],
      status: "Draft — approval needed",
    });
    postedPerDay.set(dayIndex, countForDay + 1);
  }

  return { ok: true, posts };
}
