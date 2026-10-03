#!/usr/bin/env node
// scripts/review-to-sql.mjs — erzeugt aus bestätigten Entwürfen eine SQL-Datei für manual_reviews
//   node scripts/review-to-sql.mjs --reviewer "KI-Entwurf (Claude), kontrolliert von <Name>"
//   node scripts/review-to-sql.mjs --reviewer "…" AAPL MSFT      (nur diese)
// Schreibt review-work/insert-reviews.sql. Die Datei führst du selbst im Supabase SQL Editor aus.
// Übernommen wird nur, was in draft.json mit "confirmed": true bestätigt ist und das Ergebnis
// pass oder fail hat. Unklares bleibt draußen (Grenzfall-Liste).

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { draftToSql, verificationSql } from "./lib/review.mjs";

const OUT = "review-work";
const args = process.argv.slice(2);
const i = args.indexOf("--reviewer");
const reviewer = i >= 0 ? args[i + 1] : "";
if (!reviewer || reviewer.startsWith("--")) {
  console.error('Aufruf: node scripts/review-to-sql.mjs --reviewer "KI-Entwurf (Claude), kontrolliert von <Name>" [AAPL MSFT]');
  process.exit(1);
}
const want = args.filter((a, idx) => !a.startsWith("--") && idx !== i + 1).map((a) => a.toUpperCase());
const dirs = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();

const statements = [];
const skipped = [];
const tickers = [];
for (const name of dirs) {
  if (want.length && !want.includes(name)) continue;
  let draft;
  try {
    draft = JSON.parse(await readFile(path.join(OUT, name, "draft.json"), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") skipped.push(`${name}: draft.json nicht lesbar (${e.message})`);
    continue;
  }
  const r = draftToSql(draft, { reviewer });
  statements.push(...r.statements);
  skipped.push(...r.skipped);
  if (r.statements.length) tickers.push(draft.ticker);
}

const header = [
  "-- Erzeugt von scripts/review-to-sql.mjs. Im Supabase SQL Editor ausführen.",
  `-- Prüfer-Angabe: ${reviewer}`,
  `-- ${statements.length} Eintrag/Einträge, ${skipped.length} übersprungen.`,
  ...skipped.map((s) => `-- übersprungen: ${s}`),
  "",
];
const sql = [...header, ...statements, "", verificationSql(tickers), ""].join("\n");
await writeFile(path.join(OUT, "insert-reviews.sql"), sql);
console.log(`${statements.length} Eintrag/Einträge in ${OUT}/insert-reviews.sql`);
for (const s of skipped) console.log(`übersprungen: ${s}`);
