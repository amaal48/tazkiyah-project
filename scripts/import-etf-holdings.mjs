// scripts/import-etf-holdings.mjs
//
// Wandelt die Holdings-CSV eines ETFs in eine SQL-Datei für den Supabase SQL Editor.
//
//   node scripts/import-etf-holdings.mjs <csv-datei> [ETF-Ticker] [Stichtag JJJJ-MM-TT]
//
// Beispiel:
//   node scripts/import-etf-holdings.mjs ~/Downloads/ISWD_holdings.csv ISWD
//
// Ergebnis: supabase_import_holdings_<Ticker>_<Stichtag>.sql im Projektordner.
// Diese Datei im SQL Editor ausführen. Wiederholbar: ersetzt den Stand des Tages.

import { readFileSync, writeFileSync } from "node:fs";
import { parseHoldingsCsv, holdingsToSql } from "../src/screening/holdingsCsv.js";

const [, , file, etfTicker = "ISWD", asOfArg] = process.argv;
if (!file) {
  console.error("Aufruf: node scripts/import-etf-holdings.mjs <csv-datei> [ETF-Ticker] [Stichtag JJJJ-MM-TT]");
  process.exit(1);
}

const parsed = parseHoldingsCsv(readFileSync(file, "utf8"));
const asOf = asOfArg || parsed.asOf;
if (!asOf) {
  console.error("Stichtag nicht in der Datei gefunden. Bitte als drittes Argument angeben, z. B. 2026-09-30.");
  process.exit(1);
}

const out = `supabase_import_holdings_${etfTicker}_${asOf}.sql`;
writeFileSync(out, holdingsToSql({ etfTicker, asOf, holdings: parsed.holdings, sourceUrl: null }));

console.log(`Stichtag:            ${asOf}`);
console.log(`Aktienpositionen:    ${parsed.holdings.length}`);
console.log(`Gewicht Aktien:      ${parsed.equityWeight.toFixed(2)} %`);
console.log(`ISIN in der Datei:   ${parsed.hasIsin ? "ja" : "nein (Zuordnung über Ticker + Land)"}`);
for (const [cls, w] of Object.entries(parsed.skipped)) console.log(`Nicht übernommen:    ${cls} (${w.toFixed(2)} %)`);
console.log(`\nSQL geschrieben:     ${out}`);
