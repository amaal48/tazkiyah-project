// api/update-calendar.js
//
// Täglicher Cron (siehe vercel.json): Termine (Quartalszahlen, Hauptversammlung) und Berichte je Aktie
// von SEC EDGAR abrufen und in company_calendar speichern (src/calendar/updateCalendar.js). Keine Halal-Daten.
// Je Lauf zuerst die Tazkiyah 30, dann die übrigen Aktien, die am längsten nicht abgerufen wurden.
//
// Umgebungsvariablen: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, SEC_USER_AGENT.
// Manuell (nur mit CRON_SECRET): /api/update-calendar?limit=10&dryRun=1  bzw.  ?tickers=AAPL,MSFT

import { createClient } from "@supabase/supabase-js";
import { createCalendarRepo, createSecFetcher, runCalendarUpdate } from "../src/calendar/updateCalendar.js";

export default async function handler(req, res) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = String(req.headers.authorization || "").trim();
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!secret || !/^Bearer\s+/i.test(header) || token !== secret) return res.status(401).json({ error: "Unauthorized" });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userAgent = (process.env.SEC_USER_AGENT || "").trim();
  const missing = [!url && "SUPABASE_URL/VITE_SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY", !userAgent.includes("@") && "SEC_USER_AGENT"].filter(Boolean);
  if (missing.length) return res.status(500).json({ error: `Umgebungsvariablen fehlen: ${missing.join(", ")}` });

  const limit = req.query.limit ? Math.max(0, parseInt(req.query.limit, 10) || 0) : 80;
  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const tickers = String(req.query.tickers || "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  try {
    const summary = await runCalendarUpdate({
      repo: createCalendarRepo(createClient(url, serviceKey, { auth: { persistSession: false } })),
      sec: createSecFetcher({ userAgent }),
      tickers: tickers.length ? tickers : null,
      limit,
      dryRun,
      deadlineMs: 50000,
    });
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: "Kalender-Lauf fehlgeschlagen", detail: String(err.message || err) });
  }
}
