"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ScheduledPost = {
  id: string;
  url: string;
  date: string;
  time: string;
  status: "Draft — approval needed";
};

const STORAGE_KEY = "cooking-creator-local-schedule-v1";
const SUGGESTED_TIMES = ["09:00", "13:00", "18:00"] as const;
const DEFAULT_AUDIENCE_TIME_ZONE = "America/New_York";
const US_AUDIENCE_TIME_ZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)", shortLabel: "ET" },
  { value: "America/Chicago", label: "Central Time (CT)", shortLabel: "CT" },
  { value: "America/Denver", label: "Mountain Time (MT)", shortLabel: "MT" },
  { value: "America/Phoenix", label: "Arizona (MST year-round)", shortLabel: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)", shortLabel: "PT" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", shortLabel: "AKT" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)", shortLabel: "HT" },
] as const;
type AudienceTimeZone = typeof US_AUDIENCE_TIME_ZONES[number]["value"];

function isAudienceTimeZone(value: unknown): value is AudienceTimeZone {
  return typeof value === "string" && US_AUDIENCE_TIME_ZONES.some((zone) => zone.value === value);
}

function localDateString(date: Date, timeZone: AudienceTimeZone): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function addDays(start: string, days: number): string {
  const date = new Date(`${start}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseLinks(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function SchedulePlanner({ prefillLinksText = "" }: { prefillLinksText?: string }) {
  const [linksText, setLinksText] = useState("");
  const [timeZone, setTimeZone] = useState<AudienceTimeZone>(DEFAULT_AUDIENCE_TIME_ZONE);
  const [startDate, setStartDate] = useState(() => localDateString(new Date(), DEFAULT_AUDIENCE_TIME_ZONE));
  const [daysToProcess, setDaysToProcess] = useState("3");
  const [linksPerDay, setLinksPerDay] = useState("2");
  const [plan, setPlan] = useState<ScheduledPost[]>([]);
  const [message, setMessage] = useState("Add as many public Reel or video URLs as you want, one per line.");
  const [hydrated, setHydrated] = useState(false);
  // Keep initial prefill separate from future prop changes during browser hydration.
  const initialPrefillLinksText = useRef(prefillLinksText);

  useEffect(() => {
    if (prefillLinksText.trim()) setLinksText(prefillLinksText);
  }, [prefillLinksText]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { linksText?: unknown; startDate?: unknown; timeZone?: unknown; plan?: unknown };
        const savedTimeZone = isAudienceTimeZone(saved.timeZone) ? saved.timeZone : DEFAULT_AUDIENCE_TIME_ZONE;
        setTimeZone(savedTimeZone);
        // Explicit links passed from the chat command must win over an older saved list.
        if (typeof saved.linksText === "string" && !initialPrefillLinksText.current.trim()) setLinksText(saved.linksText);
        if (typeof saved.startDate === "string" && isValidCalendarDate(saved.startDate)) setStartDate(saved.startDate);
        else setStartDate(localDateString(new Date(), savedTimeZone));
        if (Array.isArray(saved.plan) && saved.plan.every((item) =>
          typeof item === "object" && item !== null &&
          typeof item.id === "string" && typeof item.url === "string" && validHttpUrl(item.url) &&
          typeof item.date === "string" && isValidCalendarDate(item.date) &&
          (item.time === "09:00" || item.time === "13:00" || item.time === "18:00") &&
          item.status === "Draft — approval needed"
        )) setPlan(saved.plan as ScheduledPost[]);
      }
    } catch {
      setMessage("Saved schedule could not be restored. You can create a new local draft.");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ linksText, startDate, timeZone, plan }));
    } catch {
      setMessage("Browser storage is full or unavailable. Export your plan to keep a copy.");
    }
  }, [hydrated, linksText, startDate, timeZone, plan]);

  const links = useMemo(() => parseLinks(linksText), [linksText]);
  const invalidLinks = useMemo(() => links.filter((link) => !validHttpUrl(link)), [links]);
  const activeTimeZone = US_AUDIENCE_TIME_ZONES.find((zone) => zone.value === timeZone) ?? US_AUDIENCE_TIME_ZONES[0];
  const capacityValue = Number(linksPerDay) * Number(daysToProcess);
  const capacityLabel = Number.isSafeInteger(capacityValue) && capacityValue > 0
    ? capacityValue.toLocaleString("en-US")
    : "above the safe numeric range";

  function generateSchedule() {
    if (!isValidCalendarDate(startDate)) {
      setMessage("Choose a valid start date before generating the plan.");
      return;
    }
    if (links.length === 0) {
      setMessage("Add at least one video URL before generating a plan.");
      return;
    }
    const dayCount = Number(daysToProcess);
    const perDay = Number(linksPerDay);
    if (!Number.isSafeInteger(dayCount) || dayCount < 1 ||
        !Number.isSafeInteger(perDay) || perDay < 1) {
      setMessage("Enter positive whole numbers for days and links per day. Very large values beyond the browser's safe numeric range are not supported.");
      return;
    }
    const requiredDays = Math.ceil(links.length / perDay);
    if (requiredDays > dayCount) {
      setMessage(`You have ${links.length} links. At ${perDay} links per day, they need ${requiredDays} days; increase the days so every link is included.`);
      return;
    }
    if (invalidLinks.length) {
      setMessage("Every line must be a complete http:// or https:// URL. Fix the highlighted invalid links first.");
      return;
    }
    const next = links.map((url, index) => {
      // Preserve the pasted link order without allocating an array for every selected day.
      // Times repeat in local sequence when a day contains more than three posts.
      const day = Math.floor(index / perDay);
      const positionWithinDay = index % perDay;
      const time = SUGGESTED_TIMES[positionWithinDay % SUGGESTED_TIMES.length];
      return {
        id: `${Date.now()}-${index}`,
        url,
        date: addDays(startDate, day),
        time,
        status: "Draft — approval needed" as const,
      };
    });
    setPlan(next);
    setMessage(`Created a local ${dayCount}-day draft with all ${links.length} links, in the order you entered them, at up to ${perDay} links per day.`);
  }

  function updatePost(id: string, field: "date" | "time", value: string) {
    setPlan((current) => current.map((post) => post.id === id ? { ...post, [field]: value } : post));
  }

  function exportPlan() {
    if (plan.some((post) => !isValidCalendarDate(post.date) || !["09:00", "13:00", "18:00"].includes(post.time))) {
      setMessage("Choose a valid date and suggested time for every post before exporting.");
      return;
    }
    const blob = new Blob([JSON.stringify({
      version: 1,
      audienceTimezone: timeZone,
      audienceTimezoneLabel: activeTimeZone.label,
      timesAre: "Suggested wall-clock times in the selected US audience timezone; not analytics-backed and not scheduled with a social platform.",
      posts: plan,
    }, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "cooking-creator-schedule-draft.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the Blob URL alive long enough for Android Chrome and other browsers
    // to begin the download before releasing the temporary object URL.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    setMessage("Schedule draft exported as JSON.");
  }

  return (
    <section className="schedule-preview panel" aria-labelledby="schedule-preview-title">
      <div className="section-head">
        <div>
          <p className="eyebrow">CONTENT CALENDAR · LOCAL DRAFT</p>
          <h2 id="schedule-preview-title">Plan your video links</h2>
          <p>Add as many video links as you want, then choose how many links to process each day and how many days to use.</p>
        </div>
        <span className="step">APPROVAL REQUIRED</span>
      </div>

      <div className="schedule-builder">
        <div className="schedule-inputs">
          <label htmlFor="schedule-links">Reel / video URLs <span>{links.length} link{links.length === 1 ? "" : "s"}</span></label>
          <textarea
            id="schedule-links"
            value={linksText}
            onChange={(event) => setLinksText(event.target.value)}
            rows={5}
            placeholder={"https://www.instagram.com/reel/...\nhttps://www.youtube.com/shorts/...\nOne URL per line"}
          />
          {invalidLinks.length > 0 && <p className="schedule-error" role="alert">{invalidLinks.length} invalid URL(s) found. Use complete HTTP(S) links.</p>}
          <label htmlFor="schedule-audience-timezone">Target US audience timezone</label>
          <select
            id="schedule-audience-timezone"
            value={timeZone}
            onChange={(event) => {
              const nextTimeZone = event.target.value;
              if (!isAudienceTimeZone(nextTimeZone)) return;
              const todayInCurrentZone = localDateString(new Date(), timeZone);
              setTimeZone(nextTimeZone);
              if (startDate === todayInCurrentZone) setStartDate(localDateString(new Date(), nextTimeZone));
              const nextLabel = US_AUDIENCE_TIME_ZONES.find((zone) => zone.value === nextTimeZone)?.label ?? "selected timezone";
              setMessage(`Audience timezone changed to ${nextLabel}. Existing times are local planning labels; no platform was contacted.`);
            }}
          >
            {US_AUDIENCE_TIME_ZONES.map((zone) => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
          </select>
          <label htmlFor="schedule-start-date">Start date ({activeTimeZone.label})</label>
          <input id="schedule-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <p className="hint">Suggested slots use the selected audience&apos;s local time: 9:00 AM, 1:00 PM, and 6:00 PM. They are starting suggestions, not predictions of reach or guaranteed best posting times.</p>
        </div>
        <div className="schedule-actions schedule-customizer">
          <p className="schedule-customizer-title">CUSTOM PLAN</p>
          <label htmlFor="schedule-links-per-day">How many links per day?</label>
          <input id="schedule-links-per-day" type="number" min="1" step="1" value={linksPerDay} onChange={(event) => setLinksPerDay(event.target.value)} />
          <label htmlFor="schedule-days-count">How many days?</label>
          <input id="schedule-days-count" type="number" min="1" step="1" value={daysToProcess} onChange={(event) => setDaysToProcess(event.target.value)} />
          <p className="schedule-capacity" aria-live="polite">Capacity: {Number(linksPerDay) > 0 && Number(daysToProcess) > 0 ? capacityLabel : 0} links · You added {links.length}</p>
          <button className="schedule-build-button" type="button" onClick={generateSchedule}>Build my custom plan</button>
          <p className="hint">Links are processed in the same order you pasted them. If the capacity is too small, increase the days or links per day to include every link.</p>
          <p className="hint">Links stay in this browser unless you export them. No external platform is contacted.</p>
        </div>
      </div>

      <p className="message" aria-live="polite">{message}</p>

      {plan.length > 0 && (
        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead><tr><th>#</th><th>Video link</th><th>Planned date</th><th>Time ({activeTimeZone.shortLabel})</th><th>Status</th></tr></thead>
            <tbody>
              {plan.map((post, index) => (
                <tr key={post.id}>
                  <td>{index + 1}</td>
                  <td><a href={post.url} target="_blank" rel="noreferrer">{post.url}</a></td>
                  <td><input aria-label={`Post ${index + 1} date`} type="date" value={post.date} onChange={(event) => updatePost(post.id, "date", event.target.value)} /></td>
                  <td><select aria-label={`Post ${index + 1} time`} value={post.time} onChange={(event) => updatePost(post.id, "time", event.target.value)}><option value="09:00">9:00 AM</option><option value="13:00">1:00 PM</option><option value="18:00">6:00 PM</option></select></td>
                  <td><span className="status status-warning">{post.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="action-row">
            <button className="secondary" type="button" onClick={exportPlan}>Export schedule JSON</button>
            <button className="secondary" type="button" onClick={() => { setPlan([]); setMessage("Schedule cleared. Your URL list remains available to build another draft."); }}>Clear generated plan</button>
          </div>
        </div>
      )}
      <p className="hint">This is a saved planning draft only. It does not inspect video frames or audio, use account analytics, schedule posts on a platform, or publish. Review every link and approve posts in the official platform before publishing.</p>
    </section>
  );
}
