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
  const [durationDays, setDurationDays] = useState("7");
  const [timesText, setTimesText] = useState("09:00, 13:00, 18:00");
  const [plan, setPlan] = useState<ScheduledPost[]>([]);
  const [message, setMessage] = useState("Paste as many video or Reel links as you want, one per line.");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (prefillLinksText.trim()) setLinksText(prefillLinksText);
  }, [prefillLinksText]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { linksText?: unknown; startDate?: unknown; durationDays?: unknown; timesText?: unknown; plan?: unknown };
        if (typeof saved.linksText === "string") setLinksText(saved.linksText);
        if (typeof saved.startDate === "string" && isValidCalendarDate(saved.startDate)) setStartDate(saved.startDate);
        if (typeof saved.durationDays === "string" && /^\\d+$/.test(saved.durationDays) && Number(saved.durationDays) > 0) setDurationDays(saved.durationDays);
        if (typeof saved.timesText === "string") setTimesText(saved.timesText);
        if (Array.isArray(saved.plan) && saved.plan.every((item) =>
          typeof item === "object" && item !== null &&
          typeof item.id === "string" && typeof item.url === "string" && validHttpUrl(item.url) &&
          typeof item.date === "string" && isValidCalendarDate(item.date) &&
          typeof item.time === "string" && /^([01]\\d|2[0-3]):[0-5]\\d$/.test(item.time) &&
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ linksText, startDate, durationDays, timesText, plan }));
    } catch {
      setMessage("Browser storage is full or unavailable. Export your plan to keep a copy.");
    }
  }, [hydrated, linksText, startDate, durationDays, timesText, plan]);

  const links = useMemo(() => parseLinks(linksText), [linksText]);
  const invalidLinks = useMemo(() => links.filter((link) => !validHttpUrl(link)), [links]);

  const times = useMemo(() => timesText.split(",").map((time) => time.trim()).filter(Boolean), [timesText]);
  const invalidTimes = useMemo(() => times.filter((time) => !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time)), [times]);

  function generateSchedule() {
    const days = Number(durationDays);
    if (!isValidCalendarDate(startDate)) {
      setMessage("Choose a valid start date before generating the plan.");
      return;
    }
    if (!links.length) {
      setMessage("Paste at least one video or Reel URL first.");
      return;
    }
    if (invalidLinks.length) {
      setMessage("Every non-empty line must be a complete HTTP(S) URL. Fix invalid links first.");
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setMessage("Choose a schedule length from 1 to 3650 days.");
      return;
    }
    if (!times.length || invalidTimes.length) {
      setMessage("Enter valid 24-hour times separated by commas, e.g. 09:00, 13:30, 19:00.");
      return;
    }
    const next = links.map((url, index) => {
      const day = Math.floor(index * days / links.length);
      const postIndexForDay = links.slice(0, index).filter((_, previousIndex) =>
        Math.floor(previousIndex * days / links.length) === day
      ).length;
      return {
        id: `${Date.now()}-${index}`,
        url,
        date: addDays(startDate, day),
        time: times[postIndexForDay % times.length],
        status: "Draft — approval needed" as const,
      };
    });
    setPlan(next);
    setMessage(`Created a local draft for ${links.length} post(s) across ${days} day(s). Review and edit each date and time before exporting.`);
  }

  function updatePost(id: string, field: "date" | "time", value: string) {
    setPlan((current) => current.map((post) => post.id === id ? { ...post, [field]: value } : post));
  }

  function exportPlan() {
    if (plan.some((post) => !isValidCalendarDate(post.date) || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(post.time))) {
      setMessage("Choose a valid date and suggested time for every post before exporting.");
      return;
    }
    const blob = new Blob([JSON.stringify({
      version: 1,
      audienceTimezone: "America/New_York",
      timesAre: "Creator-selected local draft times; not analytics-backed and not scheduled with a social platform.",
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
          <h2 id="schedule-preview-title">Plan your content schedule</h2>
          <p>Add any number of video links, choose how many days to use, and set your preferred posting times.</p>
        </div>
        <span className="step">APPROVAL REQUIRED</span>
      </div>

      <div className="schedule-builder">
        <div className="schedule-inputs">
          <label htmlFor="schedule-links">Reel / video URLs <span>{links.length} link(s)</span></label>
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
          <label htmlFor="schedule-duration">Schedule length (days)</label>
          <input id="schedule-duration" type="number" min="1" max="3650" step="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
          <label htmlFor="schedule-times">Your posting times (24-hour format)</label>
          <input id="schedule-times" type="text" value={timesText} onChange={(event) => setTimesText(event.target.value)} placeholder="09:00, 13:00, 19:30" />
          {invalidTimes.length > 0 && <p className="schedule-error" role="alert">Use valid times like 09:00 or 19:30, separated by commas.</p>}
          <p className="hint">Posts are spread as evenly as possible across your chosen days. Your listed times repeat for multiple posts on a day. You can edit each post’s date and time below.</p>
        </div>
        <div className="schedule-actions">
          <button className="primary action-primary" type="button" onClick={generateSchedule}>Build my schedule</button>
          <p className="hint">Your example is not a fixed rule. Links, schedule length, and times are up to you.</p>
          <p className="hint">This creates a local draft only. It does not contact or schedule posts on a social platform.</p>
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
                  <td><input aria-label={`Post ${index + 1} time (24-hour format)`} type="time" value={post.time} onChange={(event) => updatePost(post.id, "time", event.target.value)} /></td>
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
