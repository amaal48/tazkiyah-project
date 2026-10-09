#!/usr/bin/env node
// scripts/keyword-scan.mjs — sucht in den vorhandenen 10-K-Texten nach Stichwörtern zu verbotenen Kategorien
//   node scripts/keyword-scan.mjs            (alle Aktien in review-work/)
//   node scripts/keyword-scan.mjs KO MSFT    (nur diese)
// Schreibt je Aktie review-work/<TICKER>/keyword-hits.md und keyword-hits.json und zeigt eine Übersicht.
// Gedacht gegen die Behauptung "steht nicht im 10-K": Treffer sind Hinweise, keine Urteile.
// Abschnitt "A1-Hinweise" in keyword-hits.md: Stichworte zum Kerngeschäft (industryRules.js, A1_TEXT_KEYWORDS),
// weil SEC-Daten keine Unternehmensbeschreibung haben. Jeder A1-Treffer wird in der A2/B3-Prüfung bewertet.
// (sec-fetch.mjs macht das für neu geholte Aktien automatisch.)

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { keywordHits, a1KeywordHits, keywordCounts, keywordHitsMarkdown, KEYWORD_CATEGORIES } from "./lib/review.mjs";

const OUT = "review-work";
const want = process.argv.slice(2).map((a) => a.toUpperCase());
const dirs = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const cats = Object.keys(KEYWORD_CATEGORIES);
console.log(["Aktie".padEnd(7), ...cats.map((c) => c.slice(0, 9).padEnd(10))].join(""));
for (const name of dirs) {
  if (want.length && !want.includes(name)) continue;
  let text;
  try {
    text = await readFile(path.join(OUT, name, "10k.txt"), "utf8");
  } catch {
    continue;
  }
  const hits = keywordHits(text);
  const a1 = a1KeywordHits(text);
  await writeFile(path.join(OUT, name, "keyword-hits.md"), keywordHitsMarkdown(name, hits, a1));
  await writeFile(path.join(OUT, name, "keyword-hits.json"), JSON.stringify(keywordCounts(hits), null, 2));
  const a1Text = Object.values(a1).filter((v) => v.count).map((v) => `${v.id} ${v.count}`).join(", ");
  console.log([name.padEnd(7), ...cats.map((c) => String(hits[c].count).padEnd(10)), a1Text ? `A1: ${a1Text}` : ""].join(""));
}
console.log("\nEinzelheiten: review-work/<TICKER>/keyword-hits.md");
