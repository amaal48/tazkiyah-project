#!/usr/bin/env node
// scripts/calendar-refresh.mjs — Termine und Berichte von SEC EDGAR sofort abrufen (wie der Cron api/update-calendar.js)
//
// Aufruf (im Projektordner):
//   node scripts/calendar-refresh.mjs              → wie ein Cron-Lauf (Tazkiyah 30 + 80 weitere), speichert
//   node scripts/calendar-refresh.mjs --all        → alle Aktien (ca. 1–2 Minuten), speichert
//   node scripts/calendar-refresh.mjs NVDA JNJ     → nur diese Ticker
//   --dry                                          → nur anzeigen, nichts speichern
//
// Braucht VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (geheimer Schlüssel, nur lokal) und SEC_USER_AGENT
// in .env.local. Schlüsselwerte werden nie ausgegeben.

import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createCalendarRepo, createSecFetcher, runCalendarUpdate } from "../src/calendar/updateCalendar.js";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ua = (process.env.SEC_USER_AGENT || "").trim();
if (!url || !key || !ua.includes("@")) {
  console.error("Es fehlt VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY oder SEC_USER_AGENT in .env.local.");
  process.exit(1);
}
if (key === process.env.VITE_SUPABASE_ANON_KEY || key.startsWith("sb_publishable_")) {
  console.error("SUPABASE_SERVICE_ROLE_KEY ist der öffentliche Schlüssel. Nötig ist der geheime Schlüssel (sb_secret_… bzw. service_role).");
  process.exit(1);
}

const args = process.argv.slice(2);
const tickers = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
const all = args.includes("--all");
const dryRun = args.includes("--dry");

const db = createClient(url, key, { auth: { persistSession: false } });
const repo = createCalendarRepo(db);
// Vor dem Speichern prüfen, ob die Tabelle da ist (SQL-Datei ausgeführt?)
const { error } = await db.from("company_calendar").select("security_id").limit(1);
if (error) {
  console.error(`Tabelle company_calendar nicht lesbar (${error.message}). Erst supabase_company_calendar.sql ausführen.`);
  process.exit(1);
}

const summary = await runCalendarUpdate({
  repo,
  sec: createSecFetcher({ userAgent: ua }),
  tickers: tickers.length ? tickers : null,
  limit: all || tickers.length ? 10000 : 110,
  dryRun,
});
console.log(`${dryRun ? "Nur angezeigt" : "Gespeichert"}: ${summary.updated.length} von ${summary.due} Titeln, ${summary.secCalls} Abrufe bei der SEC.`);
if (summary.noCik.length) console.log(`Ticker bei der SEC nicht gefunden: ${summary.noCik.join(", ")}`);
if (summary.errors.length) console.log(`Fehler:\n  ${summary.errors.join("\n  ")}`);

// Kontrolle: die Tazkiyah 30 mit nächstem Termin
const { data } = await db
  .from("company_calendar")
  .select("ticker,next_earnings_date,next_earnings_status,hv_date,hv_status,filings")
  .in("ticker", (await repo.loadTazkiyah30()).length ? await repo.loadTazkiyah30() : ["NVDA"])
  .order("next_earnings_date");
for (const r of data || []) {
  console.log(`${r.ticker.padEnd(5)} Zahlen: ${r.next_earnings_date ?? "–"} (${r.next_earnings_status ?? "–"})  HV: ${r.hv_date ?? "–"} (${r.hv_status ?? "–"})  Berichte: ${r.filings?.length ?? 0}`);
}
