#!/usr/bin/env node
// scripts/import-universum.mjs — liest die bearbeitete docs/universum-pruefung.xlsx und erzeugt
//   (a) supabase_universum_<Datum>.sql   securities: aktiv/inaktiv, Umbenennungen (+ watchlist_items)
//   (b) docs/universum-overrides-vorschlag.md   abweichende Behandlungen als Vorschlag MANUAL_OVERRIDES
// Führt nichts aus. Bei Fehlern (z. B. Abweichung ohne Begründung) wird nichts geschrieben.
//
// Aufruf (im Projektordner):
//   node scripts/import-universum.mjs
//   node scripts/import-universum.mjs pfad/zur/datei.xlsx --datum 2026-10-12

import { writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { COLUMNS, clean, validateEdits, universeSql, overridesProposal } from "./lib/universum.mjs";

const args = process.argv.slice(2);
const dateIdx = args.indexOf("--datum");
const date = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);
const file = args.find((a, i) => !a.startsWith("--") && (dateIdx < 0 || i !== dateIdx + 1)) || "docs/universum-pruefung.xlsx";
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
  console.error("--datum im Format JJJJ-MM-TT angeben");
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.getWorksheet("Universum") || wb.worksheets[0];

// Spalten über die Kopfzeile finden (Reihenfolge darf sich ändern)
const header = new Map();
ws.getRow(1).eachCell((cell, col) => header.set(clean(cell.value), col));
const missing = COLUMNS.filter((c) => !header.has(c.header)).map((c) => c.header);
if (missing.length) {
  console.error(`Spalten fehlen in ${file}: ${missing.join(", ")}`);
  process.exit(1);
}

const rows = [];
ws.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const get = (key) => clean(row.getCell(header.get(COLUMNS.find((c) => c.key === key).header)).value);
  const r = { row: rowNumber };
  for (const c of COLUMNS) r[c.key] = get(c.key);
  if (Object.values(r).every((v, i) => i === 0 || v === "")) return; // leere Zeile
  rows.push(r);
});

const result = validateEdits(rows);
for (const w of result.warnings) console.warn(`Hinweis: ${w}`);
if (result.errors.length) {
  console.error(`\n${result.errors.length} Fehler, nichts geschrieben:`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}

const sqlFile = `supabase_universum_${date}.sql`;
const proposalFile = "docs/universum-overrides-vorschlag.md";
await writeFile(sqlFile, universeSql(result, { date, source: file }));
await writeFile(proposalFile, overridesProposal(result.overrides, { date, source: file }));

console.log(`${rows.length} Zeilen gelesen.`);
console.log(`Inaktiv: ${result.deactivate.join(", ") || "keine"}`);
console.log(`Umbenennungen: ${result.renames.map((r) => `${r.ticker} → ${r.newTicker || r.ticker}${r.newName ? ` (${r.newName})` : ""}`).join(", ") || "keine"}`);
console.log(`Abweichende Behandlungen: ${result.overrides.map((o) => `${o.ticker} ${o.from} → ${o.handling}`).join(", ") || "keine"}`);
console.log(`\nGeschrieben: ${sqlFile} (im Supabase SQL Editor selbst ausführen) und ${proposalFile}. Nichts wurde ausgeführt.`);
