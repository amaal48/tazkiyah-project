#!/usr/bin/env node
// scripts/venues-refresh.mjs — deutsche Handelsplätze sofort bei OpenFIGI abfragen (unabhängig vom 90-Tage-Rhythmus)
//
// Aufruf (im Projektordner):
//   node scripts/venues-refresh.mjs              → die Tazkiyah 30, nur abfragen und anzeigen (schreibt nichts)
//   node scripts/venues-refresh.mjs --write      → zusätzlich german_venues und universe_checked_at speichern
//   node scripts/venues-refresh.mjs AAPL MSFT    → nur diese Ticker
//
// Gleiche Abfrage und Auswertung wie der Cron (src/screening/providers/openfigi.js). Titel ohne ISIN werden
// gemeldet und übersprungen. Lesen mit dem öffentlichen Schlüssel; --write braucht SUPABASE_SERVICE_ROLE_KEY
// in .env.local (nur lokal, nie mit VITE_-Präfix). OPENFIGI_API_KEY ist freiwillig. Schlüsselwerte werden nie
// ausgegeben.

import { existsSync } from "node:fs";
import { createOpenFigiClient, GERMAN_EXCH_CODES } from "../src/screening/providers/openfigi.js";
import { TAZKIYAH30_FALLBACK } from "../src/data/tazkiyah30.js";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
const SB_URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const write = process.argv.includes("--write");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());

if (!SB_URL || !ANON) {
  console.error("Es fehlt VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY in .env.local.");
  process.exit(1);
}
if (write && !SERVICE) {
  console.error("--write braucht SUPABASE_SERVICE_ROLE_KEY in .env.local. Ohne --write wird nur abgefragt.");
  process.exit(1);
}

async function rest(path, { method = "GET", key = ANON, body } = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return method === "GET" ? res.json() : null;
}

// Ticker: Argumente, sonst Tabelle tazkiyah30 (Rückfall: feste Liste)
let tickers = args;
if (!tickers.length) {
  try {
    tickers = (await rest("tazkiyah30?select=ticker&order=sort_order")).map((r) => r.ticker);
  } catch {
    tickers = [];
  }
  if (!tickers.length) tickers = TAZKIYAH30_FALLBACK.map((t) => t.ticker);
}

const rows = await rest(`securities?select=id,ticker,name,isin,german_venues,universe_checked_at&ticker=in.(${tickers.join(",")})`);
const byTicker = new Map(rows.map((r) => [r.ticker, r]));

const withIsin = tickers.map((t) => byTicker.get(t)).filter((r) => r?.isin);
const figi = createOpenFigiClient({ apiKey: process.env.OPENFIGI_API_KEY || null });
const found = await figi.lookup(withIsin.map((r) => r.isin));

const now = new Date().toISOString();
const report = [];
for (const t of tickers) {
  const r = byTicker.get(t);
  if (!r) {
    report.push({ t, name: "–", isin: "–", before: "–", after: null, note: "nicht in securities" });
    continue;
  }
  const before = r.german_venues?.length ? `${r.german_venues.length} Plätze` : r.universe_checked_at ? "leer (abgefragt)" : "leer (nie abgefragt)";
  if (!r.isin) {
    report.push({ t, name: r.name, isin: "–", before, after: null, note: "ISIN fehlt, übersprungen" });
    continue;
  }
  const v = found.get(r.isin);
  if (v === undefined) {
    report.push({ t, name: r.name, isin: r.isin, before, after: null, note: "OpenFIGI-Fehler, nicht gespeichert" });
    continue;
  }
  if (write) await rest(`securities?id=eq.${r.id}`, { method: "PATCH", key: SERVICE, body: { german_venues: v, universe_checked_at: now } });
  report.push({ t, name: r.name, isin: r.isin, before, after: v, note: v.length ? "" : "OpenFIGI kennt kein deutsches Listing" });
}

console.log(`OpenFIGI-Abfrage ${now.slice(0, 16).replace("T", " ")} UTC · ${write ? "gespeichert" : "nur angezeigt (ohne --write)"}`);
console.log(`Ausgewertete Börsenkennungen: ${Object.entries(GERMAN_EXCH_CODES).map(([c, n]) => `${c}=${n}`).join(", ")}\n`);
for (const x of report) {
  const after = x.after === null ? "–" : x.after.length ? x.after.join(", ") : "keine";
  console.log(`${x.t.padEnd(5)} ${x.isin.padEnd(12)} vorher: ${x.before.padEnd(20)} jetzt: ${after}${x.note ? `  (${x.note})` : ""}`);
}
const ok = report.filter((x) => x.after?.length).length;
console.log(`\n${ok} von ${tickers.length} mit deutschem Handelsplatz.`);
