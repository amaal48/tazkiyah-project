#!/usr/bin/env node
// scripts/sec-exchanges.mjs — US-Börse je Aktie aus der SEC-Liste, als SQL-Datei für den SQL Editor
//
// Aufruf (im Projektordner, in der normalen Terminal-App):
//   export SEC_USER_AGENT="Tazkiyah Vorname Nachname deine@mail.de"
//   node scripts/sec-exchanges.mjs
//
// Ergebnis: supabase_securities_exchange.sql im Projektordner. Diese Datei im Supabase
// SQL Editor ausführen. Jederzeit wiederholbar: legt die Spalte securities.exchange an,
// falls sie fehlt, und füllt nur leere Felder.
// Tickerliste: Aktien aus src/data/stocks.js (dieselben wie in supabase_seed_securities.sql).
// Es werden keine Geheimwörter gebraucht und nichts direkt in die Datenbank geschrieben.

import { writeFile } from "node:fs/promises";
import { ALL_STOCKS } from "../src/data/stocks.js";
import { SEC_EXCHANGES_URL, parseSecExchanges, matchExchanges, exchangesToSql } from "./lib/exchanges.mjs";

const UA = process.env.SEC_USER_AGENT || "";
const OUT = "supabase_securities_exchange.sql";

if (!/@/.test(UA)) {
  console.error("Die Umgebungsvariable SEC_USER_AGENT fehlt oder enthält keine E-Mail-Adresse.");
  console.error("Setze sie zuerst im selben Terminal-Fenster, zum Beispiel:");
  console.error('  export SEC_USER_AGENT="Tazkiyah Vorname Nachname deine@mail.de"');
  process.exit(1);
}

const res = await fetch(SEC_EXCHANGES_URL, { headers: { "User-Agent": UA, Accept: "application/json" } });
if (!res.ok) {
  console.error(`SEC-Liste nicht abrufbar: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const secMap = parseSecExchanges(await res.json());

const tickers = ALL_STOCKS.filter((s) => s.assetType === "Aktie").map((s) => s.ticker);
const result = matchExchanges(tickers, secMap);
const fetchedAt = new Date().toISOString().slice(0, 10);
await writeFile(OUT, exchangesToSql({ ...result, fetchedAt }));

const count = (ex) => result.found.filter(([, e]) => e === ex).length;
console.log(`Aktien in stocks.js:      ${tickers.length}`);
console.log(`Mit Börse:                ${result.found.length} (NYSE ${count("NYSE")}, NASDAQ ${count("NASDAQ")}, CBOE ${count("CBOE")})`);
if (result.unknown.length) console.log(`Andere Börse (bleibt leer): ${result.unknown.map(([t, e]) => `${t} (${e ?? "leer"})`).join(", ")}`);
if (result.missing.length) console.log(`Nicht in der SEC-Liste:   ${result.missing.join(", ")}`);
console.log(`\nSQL geschrieben:          ${OUT}`);
