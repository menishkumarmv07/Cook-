"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduledPost = {
  id: string;
  url: string;
  date: string;
  time: string;
  status: "Draft — approval needed";
};

const STORAGE_KEY = "cooking-creator-local-schedule-v1";
const SUGGESTED_TIMES = ["09:00", "13:00", "18:00"] as const;

function localDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
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
  const [startDate, setStartDate] = useState(() => localDateString(new Date()));
  const [daysToProcess, setDaysToProcess] = useState("3");
  const [linksPerDay, setLinksPerDay] = useState("2");
  const [plan, setPlan] = useState<ScheduledPost[]>([]);
  const [message, setMessage] = useState("Add as many public Reel or video URLs as you want, one per line.");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (prefillLinksText.trim()) setLinksText(prefillLinksText);
  }, [prefillLinksText]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { linksText?: unknown; startDate?: unknown; plan?: unknown };
        if (typeof saved.linksText === "string") setLinksText(saved.linksText);
        if (typeof saved.startDate === "string" && isValidCalendarDate(saved.startDate)) setStartDate(saved.startDate);
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ linksText, startDate, plan }));
    } catch {
      setMessage("Browser storage is full or unavailable. Export your plan to keep a copy.");
    }
  }, [hydrated, linksText, startDate, plan]);

  const links = useMemo(() => parseLinks(linksText), [linksText]);
  const invalidLinks = useMemo(() => links.filter((link) => !validHttpUrl(link)), [links]);

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
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 365 ||
        !Number.isInteger(perDay) || perDay < 1 || perDay > 1000) {
      setMessage("Choose 1–365 days and 1–1,000 links per day.");
      return;
    }
    const capacity = dayCount * perDay;
    if (links.length > capacity) {
      const requiredDays = Math.ceil(links.length / perDay);
      setMessage(`You have ${links.length} links, but these settings fit ${capacity}. Increase the days to at least ${requiredDays}, or allow more links per day, so every link is included.`);
      return;
    }
    if (invalidLinks.length) {
      setMessage("Every line must be a complete http:// or https:// URL. Fix the highlighted invalid links first.");
      return;
    }
    const postsPerDay = Array.from({ length: dayCount }, () => 0);
    const next = links.map((url, index) => {
      // Preserve the pasted link order and process up to the selected number each day.
      const day = Math.floor(index / perDay);
      const time = SUGGESTED_TIMES[postsPerDay[day] % SUGGESTED_TIMES.length];
      postsPerDay[day] += 1;
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
      audienceTimezone: "America/New_York",
      timesAre: "Suggested local draft times; not analytics-backed and not scheduled with a social platform.",
      posts: plan,
    }, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "cooking-creator-schedule-draft.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
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
          <label htmlFor="schedule-start-date">Start date (US Eastern Time)</label>
          <input id="schedule-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <p className="hint">Suggested slots use US Eastern Time (ET): morning 9:00 AM, afternoon 1:00 PM, evening 6:00 PM. These are starting suggestions, not predictions of reach.</p>
        </div>
        <div className="schedule-actions schedule-customizer">
          <p className="schedule-customizer-title">CUSTOM PLAN</p>
          <label htmlFor="schedule-links-per-day">How many links per day?</label>
          <input id="schedule-links-per-day" type="number" min="1" max="1000" step="1" value={linksPerDay} onChange={(event) => setLinksPerDay(event.target.value)} />
          <label htmlFor="schedule-days-count">How many days?</label>
          <input id="schedule-days-count" type="number" min="1" max="365" step="1" value={daysToProcess} onChange={(event) => setDaysToProcess(event.target.value)} />
          <p className="schedule-capacity" aria-live="polite">Capacity: {Number(linksPerDay) > 0 && Number(daysToProcess) > 0 ? Number(linksPerDay) * Number(daysToProcess) : 0} links · You added {links.length}</p>
          <button className="schedule-build-button" type="button" onClick={generateSchedule}>Build my custom plan</button>
          <p className="hint">Links are processed in the same order you pasted them. If the capacity is too small, increase the days or links per day to include every link.</p>
          <p className="hint">Links stay in this browser unless you export them. No external platform is contacted.</p>
        </div>
      </div>

      <p className="message" aria-live="polite">{message}</p>

      {plan.length > 0 && (
        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead><tr><th>#</th><th>Video link</th><th>Planned date</th><th>Time (ET)</th><th>Status</th></tr></thead>
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
