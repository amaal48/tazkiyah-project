#!/usr/bin/env node
// scripts/sic-check.mjs — Gegenprobe der A1-Zuordnung über SIC-Codes (nur lesen, schreibt nur docs/sic-check.md)
//
// Aufruf (im Projektordner):
//   node scripts/sic-check.mjs
//   node scripts/sic-check.mjs rows.json   → zusätzlich alle Zeilen als JSON (zum Nachsehen)
//
// Lädt für alle Aktien im Universum (Tabelle securities) den SIC-Code von der SEC (submissions, gedrosselt
// auf 8 Abrufe je Sekunde), ermittelt die Gruppe nach SIC (industryRules.js, classifySic) und vergleicht mit
// der Gruppe nach dem heutigen FMP-Stand (A1 im letzten gespeicherten Ergebnis), soweit vorhanden.
//
// Braucht SEC_USER_AGENT sowie VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY (öffentlicher Schlüssel),
// gelesen aus .env.local bzw. .env. Schlüsselwerte werden nie ausgegeben.

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createSecProvider } from "../src/screening/providers/sec.js";
import { classifySic, isShellSic, needsGoldDealerReviewSic, PAYMENT_NETWORK_TICKERS } from "../src/screening/industryRules.js";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const UA = (process.env.SEC_USER_AGENT || "").trim();
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const missing = [!UA.includes("@") && "SEC_USER_AGENT", !SB_URL && "VITE_SUPABASE_URL", !SB_KEY && "VITE_SUPABASE_ANON_KEY"].filter(Boolean);
if (missing.length) {
  console.error(`Es fehlt: ${missing.join(", ")}. Bitte selbst in .env.local eintragen.`);
  process.exit(1);
}

const OUT = "docs/sic-check.md";
const HANDLINGS = ["exclude", "review", "b3_focus", "allow", "unknown"];
const HANDLING_DE = { exclude: "Ausschluss", review: "manuelle Prüfung", b3_focus: "über B3", allow: "erlaubt", unknown: "ohne SIC" };

// Hinweise auf mögliche Fehlzuordnungen bei „erlaubt“ (Name oder SIC-Beschreibung)
const SUSPICIOUS = [
  ["Alkohol", /\b(alcohol|beer|brew|wine|winer|spirits|distill|liquor|beverage)/i],
  ["Casino", /\b(casino|gaming|gambl|resorts?|entertainment|amusement|racing|lotter)/i],
  ["Bank/Kredit", /\b(bank|bancorp|credit|lend|loan|financ|capital one|express)/i],
  ["Versicherung", /\b(insur|assurance|reinsur|underwrit)/i],
  ["Rüstung", /\b(defen[cs]e|aerospace|ordnance|missile|weapon|arms|military|dynamics|northrop|lockheed|raytheon|l3harris)/i],
  ["Tabak", /\b(tobacco|cigar|philip morris|altria)/i],
  ["Fleisch", /\b(meat|pork|food|foods|tyson|hormel|packing)/i],
  ["Film", /\b(motion picture|film|pictures|studios|media|broadcast|television|tv|cable|stream|netflix)/i],
  ["Musik", /\b(music|record|phonograph|audio|live nation)/i],
  ["Games", /\b(games?|gaming|interactive|electronic arts|take-two|activision|toy)/i],
];

async function supabase(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SB_URL}/rest/v1/${query}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} bei ${query.split("?")[0]}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const securities = await supabase("securities?select=id,ticker,name,provider_symbol&asset_type=eq.stock&order=ticker");
const current = await supabase("screening_current?select=security_id,result");
const fmpBySecurity = new Map();
for (const r of current) {
  const a1 = r.result?.criteria?.find((c) => c.id === "A1");
  const provider = r.result?.dataBasis?.provider ?? null;
  if (!a1 || (provider && provider !== "fmp")) continue;
  const check = a1.checks?.[0] || {};
  fmpBySecurity.set(r.security_id, { handling: check.classification ?? null, group: check.group ?? null, industry: check.value ?? null, result: a1.result });
}

const sec = createSecProvider({ userAgent: UA });
const rows = [];
let i = 0;
for (const s of securities) {
  i++;
  const symbol = s.provider_symbol || s.ticker;
  let profile = null;
  let error = null;
  try {
    profile = await sec.getProfile(symbol);
  } catch (err) {
    error = err.message;
  }
  const cls = classifySic(profile?.sic, { symbol, sicDescription: profile?.sicDescription });
  rows.push({
    ticker: s.ticker,
    name: s.name || profile?.name || "",
    sic: profile?.sic ?? null,
    sicDescription: profile?.sicDescription ?? null,
    handling: cls.class,
    group: cls.group?.id ?? null,
    interpretation: Boolean(cls.interpretation),
    payment: Object.hasOwn(PAYMENT_NETWORK_TICKERS, String(symbol).toUpperCase()),
    shell: isShellSic(profile?.sic),
    a3Review: needsGoldDealerReviewSic(profile?.sic),
    error,
    fmp: fmpBySecurity.get(s.id) ?? null,
  });
  if (i % 50 === 0) console.log(`${i}/${securities.length} …`);
}

// ------------------------------------------------------------------ Bericht

const esc = (t) => String(t ?? "—").replace(/\|/g, "\\|");
const label = (r) => `${HANDLING_DE[r.handling]}${r.group ? ` (${r.group})` : ""}`;
const fmpLabel = (f) => `${HANDLING_DE[f.handling] ?? f.handling ?? "—"}${f.group ? ` (${f.group})` : ""}`;
const sicCell = (r) => (r.sic ? `${r.sic} ${esc(r.sicDescription)}` : r.error ? `— (${esc(r.error)})` : "—");

const counts = Object.fromEntries(HANDLINGS.map((h) => [h, rows.filter((r) => r.handling === h).length]));
const withFmp = rows.filter((r) => r.fmp);
const changed = withFmp.filter((r) => r.fmp.handling !== r.handling || (r.fmp.group ?? null) !== (r.group ?? null));
const flagged = rows
  .filter((r) => r.handling === "allow")
  .map((r) => ({ r, why: SUSPICIOUS.filter(([, re]) => re.test(`${r.name} ${r.sicDescription ?? ""}`)).map(([k]) => k) }))
  .filter((x) => x.why.length);

const lines = [
  "# Gegenprobe A1 über SIC-Codes",
  "",
  `Stand: ${new Date().toISOString().slice(0, 10)}. Erzeugt mit \`node scripts/sic-check.mjs\` (SIC-Codes von der SEC, Zuordnung nach src/screening/industryRules.js).`,
  "Gilt nur für die Datenquellen „sec“ und „sec_fmp“. Im FMP-Modus bleibt A1 bei der Branche und Beschreibung des FMP-Profils.",
  "",
  "## a) Zusammenfassung",
  "",
  `${rows.length} Aktien im Universum.`,
  "",
  "| Behandlung | Anzahl |",
  "| --- | --- |",
  ...HANDLINGS.map((h) => `| ${HANDLING_DE[h]} (${h}) | ${counts[h]} |`),
  "",
  `Zusätzlich: C2 Blank Check (SIC 6770): ${rows.filter((r) => r.shell).length}; A3 manuell (SIC 5094): ${rows.filter((r) => r.a3Review).length}; Zahlungsnetzwerke laut Liste: ${rows.filter((r) => r.payment).map((r) => r.ticker).join(", ") || "keine"}.`,
  "",
  `## b) Änderungen gegenüber FMP (${changed.length} von ${withFmp.length} Titeln mit FMP-Ergebnis)`,
  "",
  "| Ticker | Name | SIC | FMP-Branche | alt (FMP) → neu (SIC) |",
  "| --- | --- | --- | --- | --- |",
  ...changed.map((r) => `| ${r.ticker} | ${esc(r.name)} | ${sicCell(r)} | ${esc(r.fmp.industry)} | ${fmpLabel(r.fmp)} → ${label(r)} |`),
  "",
  "## c) Ausschluss und manuelle Prüfung, nach Gruppe",
  "",
];
for (const h of ["exclude", "review"]) {
  const list = rows.filter((r) => r.handling === h).sort((a, b) => (a.group + a.ticker).localeCompare(b.group + b.ticker));
  lines.push(`### ${HANDLING_DE[h]} (${list.length})`, "", "| Gruppe | Ticker | Name | SIC |", "| --- | --- | --- | --- |");
  lines.push(...list.map((r) => `| ${r.group}${r.interpretation ? " (Auslegung)" : ""} | ${r.ticker} | ${esc(r.name)} | ${sicCell(r)} |`), "");
}
lines.push(
  `## d) Auffällige „erlaubt“-Fälle (${flagged.length})`,
  "",
  "Name oder SIC-Beschreibung deutet auf Alkohol, Casino, Bank, Versicherung, Kredit, Rüstung, Tabak, Fleisch, Film, Musik oder Games hin. Grobe Wortsuche, viele Fehltreffer möglich.",
  "",
  "| Ticker | Name | SIC | Hinweis |",
  "| --- | --- | --- | --- |",
  ...flagged.map(({ r, why }) => `| ${r.ticker} | ${esc(r.name)} | ${sicCell(r)} | ${why.join(", ")} |`),
  ""
);
const noSic = rows.filter((r) => r.handling === "unknown");
if (noSic.length) {
  lines.push(`## Ohne SIC-Code (${noSic.length})`, "", "| Ticker | Name | Grund |", "| --- | --- | --- |");
  lines.push(...noSic.map((r) => `| ${r.ticker} | ${esc(r.name)} | ${esc(r.error ?? "SIC fehlt")} |`), "");
}

await writeFile(OUT, lines.join("\n"));
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(rows, null, 1));
console.log(`\n${OUT} geschrieben. SEC-Abrufe: ${sec.getCallCount?.() ?? "?"}`);
console.log(HANDLINGS.map((h) => `${h}: ${counts[h]}`).join(", "));
