#!/usr/bin/env node
// scripts/review-sheet.mjs — erzeugt den Kontrollbogen aus den Entwürfen
//   node scripts/review-sheet.mjs            (alle Aktien in review-work/)
//   node scripts/review-sheet.mjs AAPL MSFT  (nur diese)
// Schreibt review-work/kontrollbogen.md

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { reviewSheet } from "./lib/review.mjs";

const OUT = "review-work";
const want = process.argv.slice(2).map((a) => a.toUpperCase());
const dirs = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const drafts = [];
for (const name of dirs) {
  if (want.length && !want.includes(name)) continue;
  try {
    drafts.push(JSON.parse(await readFile(path.join(OUT, name, "draft.json"), "utf8")));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`${name}: draft.json nicht lesbar (${e.message})`);
  }
}
const keywordCounts = {};
for (const d of drafts) {
  try {
    keywordCounts[d.ticker] = JSON.parse(await readFile(path.join(OUT, d.ticker, "keyword-hits.json"), "utf8"));
  } catch {
    /* kein keyword-hits.json: kein Hinweis im Bogen */
  }
}
await writeFile(path.join(OUT, "kontrollbogen.md"), reviewSheet(drafts, { keywordCounts }));
console.log(`Kontrollbogen für ${drafts.length} Aktie(n): ${OUT}/kontrollbogen.md`);
