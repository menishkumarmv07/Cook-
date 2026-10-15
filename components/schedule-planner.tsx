"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildScheduleDraft,
  getUsEasternCalendarDate,
  isSuggestedTime,
  isValidCalendarDate,
  isValidScheduleUrl,
  parseScheduleLinks,
  SUGGESTED_TIMES,
  type ScheduledPost,
} from "@/lib/schedule";

const STORAGE_KEY = "cooking-creator-local-schedule-v1";

export default function SchedulePlanner({ prefillLinksText = "" }: { prefillLinksText?: string }) {
  const [linksText, setLinksText] = useState("");
  const [startDate, setStartDate] = useState(() => getUsEasternCalendarDate(new Date()));
  const [daysToProcess, setDaysToProcess] = useState("3");
  const [linksPerDay, setLinksPerDay] = useState("2");
  const [plan, setPlan] = useState<ScheduledPost[]>([]);
  const [message, setMessage] = useState("Add as many public Reel or video URLs as you want, one per line.");
  const [hydrated, setHydrated] = useState(false);
  const initialPrefill = useRef(prefillLinksText.trim());

  useEffect(() => {
    const nextText = prefillLinksText.trim();
    if (!nextText) return;
    const nextLinks = parseScheduleLinks(nextText);
    setLinksText(nextText);
    setPlan((current) => {
      const currentUrls = current.map((post) => post.url);
      return currentUrls.length === nextLinks.length &&
        currentUrls.every((url, index) => url === nextLinks[index])
        ? current
        : [];
    });
    setMessage("New links loaded. Build a new plan to review them.");
  }, [prefillLinksText]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { linksText?: unknown; startDate?: unknown; daysToProcess?: unknown; linksPerDay?: unknown; plan?: unknown };
        if (!initialPrefill.current && typeof saved.linksText === "string") setLinksText(saved.linksText);
        if (typeof saved.startDate === "string" && isValidCalendarDate(saved.startDate)) setStartDate(saved.startDate);
        if (typeof saved.daysToProcess === "string" && Number.isSafeInteger(Number(saved.daysToProcess)) && Number(saved.daysToProcess) > 0) setDaysToProcess(saved.daysToProcess);
        if (typeof saved.linksPerDay === "string" && Number.isSafeInteger(Number(saved.linksPerDay)) && Number(saved.linksPerDay) > 0) setLinksPerDay(saved.linksPerDay);
        if (Array.isArray(saved.plan) && saved.plan.every((item) =>
          typeof item === "object" && item !== null &&
          typeof item.id === "string" && typeof item.url === "string" && isValidScheduleUrl(item.url) &&
          typeof item.date === "string" && isValidCalendarDate(item.date) &&
          isSuggestedTime(item.time) && item.status === "Draft — approval needed"
        )) {
          const savedPlan = saved.plan as ScheduledPost[];
          const prefilledLinks = parseScheduleLinks(initialPrefill.current);
          const matchesPrefill = savedPlan.length === prefilledLinks.length &&
            savedPlan.every((post, index) => post.url === prefilledLinks[index]);
          if (!initialPrefill.current || matchesPrefill) setPlan(savedPlan);
        }
      }
    } catch {
      setMessage("Saved schedule could not be restored. You can create a new local draft.");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ linksText, startDate, daysToProcess, linksPerDay, plan }));
    } catch {
      setMessage("Browser storage is full or unavailable. Export your plan to keep a copy.");
    }
  }, [hydrated, linksText, startDate, daysToProcess, linksPerDay, plan]);

  const links = useMemo(() => parseScheduleLinks(linksText), [linksText]);
  const invalidLinks = useMemo(() => links.filter((link) => !isValidScheduleUrl(link)), [links]);

  function generateSchedule() {
    const result = buildScheduleDraft({
      links,
      startDate,
      daysToProcess: Number(daysToProcess),
      linksPerDay: Number(linksPerDay),
    });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setPlan(result.posts);
    setMessage("Created a " + daysToProcess + "-day draft with all " + links.length +
      " links kept in your original order and balanced across the selected US Eastern dates, at no more than " +
      linksPerDay + " links per day.");
  }

  function updatePost(id: string, field: "date" | "time", value: string) {
    setPlan((current) => current.map((post) => post.id === id ? { ...post, [field]: value } : post));
  }

  function exportPlan() {
    if (plan.some((post) => !isValidCalendarDate(post.date) || !isSuggestedTime(post.time))) {
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
          <input id="schedule-links-per-day" type="number" min="1" step="1" inputMode="numeric" value={linksPerDay} onChange={(event) => setLinksPerDay(event.target.value)} />
          <label htmlFor="schedule-days-count">How many days?</label>
          <input id="schedule-days-count" type="number" min="1" step="1" inputMode="numeric" value={daysToProcess} onChange={(event) => setDaysToProcess(event.target.value)} />
          <p className="schedule-capacity" aria-live="polite">Daily limit: {Number.isSafeInteger(Number(linksPerDay)) && Number(linksPerDay) > 0 ? Number(linksPerDay) : "—"} · Days: {Number.isSafeInteger(Number(daysToProcess)) && Number(daysToProcess) > 0 ? Number(daysToProcess) : "—"} · Links to schedule: {links.length}</p>
          <button className="schedule-build-button" type="button" onClick={generateSchedule}>Build my custom plan</button>
          <p className="hint">All links stay in pasted order and are balanced across your selected date range. Links per day is the maximum allowed on a date.</p>
          <p className="hint">Every valid link is included in the draft; if the plan does not have enough daily capacity, the app asks you to adjust the settings instead of dropping links.</p>
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
                  <td><select aria-label={`Post ${index + 1} time`} value={post.time} onChange={(event) => updatePost(post.id, "time", event.target.value)}>{SUGGESTED_TIMES.map((time) => <option key={time} value={time}>{time === "09:00" ? "9:00 AM" : time === "13:00" ? "1:00 PM" : "6:00 PM"}</option>)}</select></td>
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
