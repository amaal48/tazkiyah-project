#!/usr/bin/env node
// scripts/export-universum.mjs — erzeugt docs/universum-pruefung.xlsx (nur lesen, schreibt nur diese Datei)
//
// Aufruf (im Projektordner):
//   node scripts/export-universum.mjs
//
// Eine Zeile je Titel aus securities (Aktien und ETFs), sortiert nach Behandlung, dann Ticker. Graue Spalten
// sind Information (SIC-Code von der SEC, Zuordnung nach industryRules.js, aktuelles Ergebnis), gelbe Spalten
// bearbeitest du. Zurück mit: node scripts/import-universum.mjs (erzeugt SQL und einen Vorschlag, führt nichts aus).
//
// Braucht SEC_USER_AGENT, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY aus .env.local (Werte werden nie ausgegeben).

import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { createSecProvider } from "../src/screening/providers/sec.js";
import { classifySic, isShellSic, needsGoldDealerReviewSic } from "../src/screening/industryRules.js";
import { COLUMNS, EXCHANGES, HANDLINGS, STATUS_DE, sortRows } from "./lib/universum.mjs";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);
const UA = (process.env.SEC_USER_AGENT || "").trim();
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!UA.includes("@") || !SB_URL || !SB_KEY) {
  console.error("Es fehlt SEC_USER_AGENT, VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY in .env.local.");
  process.exit(1);
}

const OUT = "docs/universum-pruefung.xlsx";
const CHECKED = "09.10.2026";

// Stand bei der SEC, geprüft am 09.10.2026 (submissions, Form 25/15, 8-K). Vorbelegung der gelben Spalten.
const KNOWN = {
  AVB: { hint: `delistet 17.08.2026 (Form 25-NSE), SEC-Registrierung beendet (Form 15, 27.08.2026); Stand ${CHECKED}`, active: "nein" },
  EA: { hint: `delistet 04.08.2026 (Form 25-NSE), SEC-Registrierung beendet (Form 15, 14.08.2026); Stand ${CHECKED}`, active: "nein" },
  EQR: {
    hint: `umbenannt 12.08.2026 in Vivmark Residential, Ticker VMRK an der NYSE, gleiche CIK; Stand ${CHECKED}`,
    secSymbol: "VMRK",
    newTicker: "VMRK",
    newName: "Vivmark Residential",
    newExchange: "NYSE",
  },
  PSKY: {
    hint: `umbenannt 06.10.2026 in Skydance Corp, Ticker SKYD an der NYSE (vorher Nasdaq), gleiche CIK; Stand ${CHECKED}`,
    secSymbol: "SKYD",
    newTicker: "SKYD",
    newName: "Skydance Corp",
    newExchange: "NYSE",
  },
  WBD: { hint: `am 06.10.2026 von Skydance übernommen; Abmeldung von der Börse bei der SEC noch nicht sichtbar; Stand ${CHECKED}` },
};

async function supabase(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SB_URL}/rest/v1/${query}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${from}-${from + 999}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status} bei ${query.split("?")[0]}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const securities = await supabase("securities?select=*&order=ticker");
const current = await supabase("screening_current?select=security_id,status");
const statusOf = new Map(current.map((r) => [r.security_id, STATUS_DE[r.status] ?? r.status]));

const sec = createSecProvider({ userAgent: UA });
const data = [];
let i = 0;
for (const s of securities) {
  i++;
  const known = KNOWN[s.ticker] || {};
  const row = {
    ticker: s.ticker,
    name: s.name || "",
    cik: "",
    exchange: s.exchange || "",
    sic: "",
    sicDescription: "",
    group: "",
    handling: "",
    reason: "",
    status: statusOf.get(s.id) || "",
    hint: [known.hint, s.active === false ? "in der Datenbank inaktiv" : null].filter(Boolean).join("; "),
    active: known.active ?? (s.active === false ? "nein" : "ja"),
    newTicker: known.newTicker || "",
    newName: known.newName || "",
    newExchange: known.newExchange || "",
    override: "",
    overrideReason: "",
  };
  if (s.asset_type === "etf") {
    row.handling = "etf";
    row.reason = "ETF: keine A1-Prüfung über SIC (Prüfung über die enthaltenen Aktien, G1–G5)";
  } else {
    const symbol = s.provider_symbol || s.ticker;
    let profile = null;
    let error = null;
    for (const sym of [symbol, known.secSymbol].filter(Boolean)) {
      try {
        profile = await sec.getProfile(sym);
        break;
      } catch (err) {
        error = err.message;
      }
    }
    const cls = classifySic(profile?.sic, { symbol: s.ticker, sicDescription: profile?.sicDescription });
    row.cik = profile?.cik || "";
    row.sic = profile?.sic || "";
    row.sicDescription = profile?.sicDescription || "";
    row.group = [cls.group?.id, ...(cls.also || []).map((g) => g.id)].filter(Boolean).join(" + ");
    row.handling = cls.class;
    row.reason =
      cls.class === "unknown"
        ? `SIC-Code fehlt${error ? ` (${error})` : ""}`
        : cls.why || `Branche zulässig (SIC ${profile.sic}${profile.sicDescription ? ` ${profile.sicDescription}` : ""})`;
    if (cls.interpretation && !/Auslegungsfrage/.test(row.reason)) row.reason += " — Auslegungsfrage";
    const extra = [];
    if (isShellSic(profile?.sic)) extra.push("SIC 6770 Blank Check: C2 nicht bestanden");
    if (needsGoldDealerReviewSic(profile?.sic)) extra.push("SIC 5094: A3 manuell prüfen");
    if (extra.length) row.hint = [row.hint, ...extra].filter(Boolean).join("; ");
  }
  data.push(row);
  if (i % 100 === 0) console.log(`${i}/${securities.length} …`);
}

// Mehrere Aktiengattungen derselben Gesellschaft (gleiche CIK)
const byCik = new Map();
for (const r of data) if (r.cik) byCik.set(r.cik, [...(byCik.get(r.cik) || []), r.ticker]);
for (const r of data) {
  const sisters = (byCik.get(r.cik) || []).filter((t) => t !== r.ticker);
  if (sisters.length) r.hint = [r.hint, `Mehrfachgattung (gleiche CIK wie ${sisters.join(", ")})`].filter(Boolean).join("; ");
}

// ------------------------------------------------------------------ Excel

const GREY = "FFE7E6E6";
const GREY_HEAD = "FFBFBFBF";
const YELLOW = "FFFFF2CC";
const YELLOW_HEAD = "FFFFD966";
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const wb = new ExcelJS.Workbook();
wb.creator = "Tazkiyah";
wb.created = new Date();
const ws = wb.addWorksheet("Universum", { views: [{ state: "frozen", ySplit: 1 }] });
ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
for (const r of sortRows(data)) ws.addRow(r);

const lastRow = ws.rowCount;
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastRow, column: COLUMNS.length } };
COLUMNS.forEach((c, idx) => {
  const col = ws.getColumn(idx + 1);
  col.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
    if (rowNumber > lastRow) return;
    cell.fill = fill(rowNumber === 1 ? (c.kind === "edit" ? YELLOW_HEAD : GREY_HEAD) : c.kind === "edit" ? YELLOW : GREY);
    cell.alignment = { vertical: "top", wrapText: rowNumber === 1 || ["reason", "hint", "overrideReason"].includes(c.key) };
    if (rowNumber === 1) cell.font = { bold: true };
  });
  if (["cik", "sic"].includes(c.key)) col.numFmt = "@";
});
ws.getRow(1).height = 32;

const letter = (key) => ws.getColumn(COLUMNS.findIndex((c) => c.key === key) + 1).letter;
const list = (key, values, prompt) => {
  ws.dataValidations.add(`${letter(key)}2:${letter(key)}${lastRow}`, {
    type: "list",
    allowBlank: true,
    formulae: [`"${values.join(",")}"`],
    showErrorMessage: true,
    errorTitle: "Ungültiger Wert",
    error: `Erlaubt: ${values.join(", ")} oder leer`,
    showInputMessage: Boolean(prompt),
    prompt,
  });
};
list("active", ["ja", "nein"], "ja = bleibt im Universum, nein = herausnehmen (z. B. delistet)");
list("override", HANDLINGS, "Nur ausfüllen, wenn die Behandlung abweichen soll. Begründung ist dann Pflicht.");
list("newExchange", EXCHANGES, "Nur bei Börsenwechsel");

// Blatt „Legende“
const lg = wb.addWorksheet("Legende");
lg.columns = [{ width: 26 }, { width: 110 }];
const legend = [
  ["Behandlungen", ""],
  ["exclude", "Ausschluss in A1: Kerngeschäft verboten (Titel ist „nicht konform“)."],
  ["review", "Manuelle Prüfung des Kerngeschäfts (A1). Ohne gültige Prüfung „nicht geprüft“."],
  ["b3_focus", "Kein Branchenausschluss, A1 bestanden. Verbotene Anteile (z. B. Alkohol, Zinsen) werden in der B3-Segmentprüfung erfasst (max. 5 %)."],
  ["allow", "Erlaubt, A1 bestanden."],
  ["unknown", "Kein SIC-Code gefunden: A1 „nicht geprüft“."],
  ["etf", "ETF: keine A1-Prüfung über SIC, Prüfung über die enthaltenen Aktien (G1–G5)."],
  ["", ""],
  ["Graue Spalten (nur Information)", ""],
  ["Ticker, Name", "Wie in der Datenbank (securities)."],
  ["CIK", "Kennnummer der Firma bei der SEC."],
  ["Börse", "Börse für die TradingView-Widgets (securities.exchange)."],
  ["SIC, SIC-Beschreibung", "Branchencode der SEC (submissions, Stand des Exports)."],
  ["Gruppe", "Branchengruppe nach SIC-Code oder Ticker-Liste (industryRules.js); „+ music“ = zusätzlich Musik über B3."],
  ["Behandlung", "Ergebnis der Zuordnung, gilt nur bei SEC-Daten (sec, sec_fmp). Im FMP-Modus zählt die FMP-Branche."],
  ["Grund", "SIC-Code oder Ticker-Liste mit Festlegungsdatum; „Auslegungsfrage“, wo eine Festlegung nötig war."],
  ["Ergebnis im Screener", "Aktueller Status in screening_current (leer = noch nicht geprüft)."],
  ["Hinweis", "Z. B. delistet, umbenannt, Mehrfachgattung (mehrere Ticker mit gleicher CIK), Blank Check, Edelmetall-Großhandel."],
  ["", ""],
  ["Gelbe Spalten (von dir bearbeitbar)", ""],
  ["Aktiv", "ja = bleibt im Universum; nein = herausnehmen. Inaktive Titel ruft der Cron nicht mehr ab, die Liste auf der Website blendet sie aus; Prüfungen und Verlauf bleiben gespeichert."],
  ["Neuer Ticker, Neuer Name, Neue Börse", "Nur bei Umbenennung oder Börsenwechsel ausfüllen. Prüfungen und Verlauf bleiben erhalten (sie hängen an der internen ID, nicht am Ticker); die Watchlist wird mit umbenannt."],
  ["Behandlung abweichend", "Nur ausfüllen, wenn die Behandlung anders sein soll als in der grauen Spalte: exclude, review, b3_focus oder allow."],
  ["Begründung", "Pflicht, wenn „Behandlung abweichend“ ausgefüllt ist. Wird mit Datum als Festlegung übernommen."],
  ["", ""],
  ["Zurück ins Projekt", "node scripts/import-universum.mjs  → erzeugt eine SQL-Datei (securities: aktiv, Umbenennungen) und einen Vorschlag MANUAL_OVERRIDES. Nichts wird automatisch ausgeführt."],
];
for (const [a, b] of legend) {
  const row = lg.addRow([a, b]);
  row.alignment = { vertical: "top", wrapText: true };
  if (a && !b) row.font = { bold: true };
}

await wb.xlsx.writeFile(OUT);
const count = (h) => data.filter((r) => r.handling === h).length;
console.log(`\n${OUT} geschrieben: ${data.length} Titel (${["exclude", "review", "b3_focus", "allow", "unknown", "etf"].map((h) => `${h} ${count(h)}`).join(", ")})`);
