#!/usr/bin/env node
// scripts/review-to-sql.mjs — erzeugt aus bestätigten Entwürfen eine SQL-Datei für manual_reviews
//   node --env-file=.env.local scripts/review-to-sql.mjs --reviewer AMI
//   node --env-file=.env.local scripts/review-to-sql.mjs --reviewer AMI AAPL MSFT      (nur diese)
// --reviewer ist das Kürzel der prüfenden Person (2–5 Großbuchstaben). ai_draft wird für alle
// Einträge auf true gesetzt (hier liegt immer ein KI-Entwurf zugrunde). Beides nur intern.
// Schreibt review-work/insert-reviews.sql. Die Datei führst du selbst im Supabase SQL Editor aus.
// Übernommen wird nur, was in draft.json mit "confirmed": true bestätigt ist, das Ergebnis
// pass oder fail hat und dessen Zitat wörtlich in den Quelldateien steht. Unklares bleibt draußen.
// Gegenprüfung (seit 06.10.2026): Jede Prüfung braucht "verification". pass nur mit "full"
// (alle zitierten Stellen vollständig gegengeprüft), fail mit "full" oder "sample".
// Jahresabschluss: Das Skript liest annual_period_end aus screening_current (nur lesen, öffentlicher
// Schlüssel aus .env.local) und bricht ab, wenn das nicht klappt. Weicht das Datum vom Entwurf ab,
// wird der Eintrag übersprungen und gemeldet. Ohne Ergebnis gilt das Entwurfsdatum (wird gemeldet).

import { readdir, readFile, writeFile } from "node:fs/promises";
import { loadSources } from "./lib/sources.mjs";
import path from "node:path";
import { REVIEWER_CODE, draftToSql, verificationSql } from "./lib/review.mjs";

const OUT = "review-work";
const args = process.argv.slice(2);
const i = args.indexOf("--reviewer");
const reviewer = i >= 0 ? args[i + 1] : "";
if (!reviewer || reviewer.startsWith("--")) {
  console.error("Aufruf: node --env-file=.env.local scripts/review-to-sql.mjs --reviewer AMI [AAPL MSFT]");
  process.exit(1);
}
if (!REVIEWER_CODE.test(reviewer)) {
  console.error(`--reviewer muss ein Kürzel sein (2–5 Großbuchstaben, z. B. AMI), nicht: ${reviewer}`);
  process.exit(1);
}
const want = args.filter((a, idx) => !a.startsWith("--") && idx !== i + 1).map((a) => a.toUpperCase());
const dirs = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();

/** annual_period_end je Ticker aus screening_current. Bricht das Skript bei jedem Fehler ab. */
async function loadCurrentAnnual(tickers) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt. Aufruf mit: node --env-file=.env.local scripts/review-to-sql.mjs …");
    process.exit(1);
  }
  const list = tickers.map((t) => `"${t}"`).join(",");
  let rows;
  try {
    const res = await fetch(`${url}/rest/v1/screening_current?select=ticker,annual_period_end&ticker=in.(${encodeURIComponent(list)})`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    rows = await res.json();
    if (!Array.isArray(rows)) throw new Error("unerwartete Antwort");
  } catch (e) {
    console.error(`screening_current konnte nicht gelesen werden (${e.message}). Abbruch, es wurde nichts geschrieben.`);
    process.exit(1);
  }
  return new Map(rows.map((r) => [r.ticker, r.annual_period_end ?? null]));
}

const drafts = [];
const statements = [];
const skipped = [];
const notes = [];
const tickers = [];
for (const name of dirs) {
  if (want.length && !want.includes(name)) continue;
  try {
    drafts.push({ name, draft: JSON.parse(await readFile(path.join(OUT, name, "draft.json"), "utf8")) });
  } catch (e) {
    if (e.code !== "ENOENT") skipped.push(`${name}: draft.json nicht lesbar (${e.message})`);
  }
}

const currentAnnual = drafts.length ? await loadCurrentAnnual(drafts.map((d) => d.draft.ticker)) : new Map();
for (const { name, draft } of drafts) {
  const r = draftToSql(draft, {
    reviewer,
    sources: await loadSources(path.join(OUT, name)),
    currentAnnual: currentAnnual.get(draft.ticker) ?? null,
  });
  statements.push(...r.statements);
  skipped.push(...r.skipped);
  notes.push(...r.notes);
  if (r.statements.length) tickers.push(draft.ticker);
}

const header = [
  "-- Erzeugt von scripts/review-to-sql.mjs. Im Supabase SQL Editor ausführen.",
  `-- Prüfer (Kürzel, nur intern): ${reviewer}, ai_draft = true`,
  `-- ${statements.length} Eintrag/Einträge, ${skipped.length} übersprungen.`,
  ...skipped.map((s) => `-- übersprungen: ${s}`),
  ...notes.map((s) => `-- Hinweis: ${s}`),
  "",
];
const sql = [...header, ...statements, "", verificationSql(tickers), ""].join("\n");
await writeFile(path.join(OUT, "insert-reviews.sql"), sql);
console.log(`${statements.length} Eintrag/Einträge in ${OUT}/insert-reviews.sql`);
for (const s of skipped) console.log(`übersprungen: ${s}`);
for (const s of notes) console.log(`Hinweis: ${s}`);
