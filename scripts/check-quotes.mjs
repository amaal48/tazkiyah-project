#!/usr/bin/env node
// scripts/check-quotes.mjs — prüft unabhängig von der KI, ob jedes Zitat wörtlich in der Quelldatei steht
//   node scripts/check-quotes.mjs            (alle Aktien in review-work/)
//   node scripts/check-quotes.mjs AAPL MSFT  (nur diese)
// A2-Zitate werden gegen die Satzung geprüft, B3-Zitate gegen das 10-K. Zeilenumbrüche, Leerraum,
// Anführungszeichen und Striche werden vorher vereinheitlicht; der Wortlaut muss gleich sein.
// Prüft außerdem, ob die erfassten Segmente je Aufteilung zusammen den Gesamtumsatz ergeben.
// Endet mit Fehlercode 1, wenn ein Zitat nicht gefunden wird oder eine Summe nicht stimmt.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { findQuote, checkSegmentSums, CRITERIA } from "./lib/review.mjs";
import { loadSources } from "./lib/sources.mjs";

const OUT = "review-work";
const want = process.argv.slice(2).map((a) => a.toUpperCase());
const dirs = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
let missing = 0;
let warned = 0;
let badSums = 0;
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
  const sums = checkSegmentSums(draft);
  const fmt = (g) => `${g.dimension} ${(g.sum / 1e9).toFixed(3)} Mrd`;
  if (sums.status === "ok") console.log(`Summen OK   ${name}: ${sums.groups.map(fmt).join(" = ")}`);
  else if (sums.status === "mismatch") {
    badSums++;
    console.log(`Summen FEHLER ${name}: ${sums.groups.map(fmt).join(" <> ")} (Abweichung über 1 %)`);
  } else console.log(`Summen --   ${name}: weniger als zwei vollständige Aufteilungen, kein Abgleich möglich`);
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
    // A2: Das Zitat soll in der Hauptsatzung (charter.txt) stehen, nicht nur in einem weiteren Dokument (z. B. einer Tochtergesellschaft)
    const onlyElsewhere = r.found && key === "A2" && !r.files.includes("charter.txt");
    if (onlyElsewhere) warned++;
    console.log(`${r.found ? (onlyElsewhere ? "WARN" : "OK  ") : "FEHLT"} ${name} ${key} (${c.result})${r.found ? ` in ${r.files.join(", ")}${onlyElsewhere ? "  <- NICHT in charter.txt: prüfen, ob das Dokument zum börsennotierten Unternehmen gehört" : ""}` : ": Zitat nicht in den Quelldateien gefunden"}`);
  }
}
console.log(`\n${checked} Zitat(e) geprüft, ${missing} nicht gefunden, ${warned} Warnung(en), ${badSums} Summenfehler.`);
process.exit(missing || badSums ? 1 : 0);
