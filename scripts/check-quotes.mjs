#!/usr/bin/env node
// scripts/check-quotes.mjs — prüft unabhängig von der KI, ob jedes Zitat wörtlich in der Quelldatei steht
//   node scripts/check-quotes.mjs            (alle Aktien in review-work/)
//   node scripts/check-quotes.mjs AAPL MSFT  (nur diese)
// A2-Zitate werden gegen die Satzung geprüft, B3-Zitate gegen das 10-K. Zeilenumbrüche, Leerraum,
// Anführungszeichen und Striche werden vorher vereinheitlicht; der Wortlaut muss gleich sein.
// Endet mit Fehlercode 1, wenn ein Zitat nicht gefunden wird.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { findQuote, CRITERIA } from "./lib/review.mjs";
import { loadSources } from "./lib/sources.mjs";

const OUT = "review-work";
const want = process.argv.slice(2).map((a) => a.toUpperCase());
const dirs = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
let missing = 0;
let checked = 0;
for (const name of dirs) {
  if (want.length && !want.includes(name)) continue;
  let draft;
  try {
    draft = JSON.parse(await readFile(path.join(OUT, name, "draft.json"), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") console.log(`${name}: draft.json nicht lesbar (${e.message})`);
    continue;
  }
  const sources = await loadSources(path.join(OUT, name));
  for (const key of Object.keys(CRITERIA)) {
    const c = draft[key];
    if (!c || !c.quote) {
      if (c) console.log(`- ${name} ${key} (${c.result}): kein Zitat${c.result === "unclear" ? " (bei unclear in Ordnung)" : " FEHLT"}`);
      continue;
    }
    checked++;
    const r = findQuote(c.quote, sources[key] || {});
    if (!r.found) missing++;
    console.log(`${r.found ? "OK  " : "FEHLT"} ${name} ${key} (${c.result})${r.found ? ` in ${r.file}` : ": Zitat nicht in den Quelldateien gefunden"}`);
  }
}
console.log(`\n${checked} Zitat(e) geprüft, ${missing} nicht gefunden.`);
process.exit(missing ? 1 : 0);
