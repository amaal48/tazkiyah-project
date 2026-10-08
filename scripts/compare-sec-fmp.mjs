#!/usr/bin/env node
// scripts/compare-sec-fmp.mjs — Vergleich SEC-Adapter gegen FMP-Adapter (nur lesen, schreibt nichts)
//
// Aufruf (im Projektordner):
//   node scripts/compare-sec-fmp.mjs            → AAPL, MSFT, KO
//   node scripts/compare-sec-fmp.mjs NVDA JNJ   → andere Ticker
//
// Braucht SEC_USER_AGENT (Format "Tazkiyah kontakt@…"), gelesen aus .env.local bzw. .env im
// Projektordner (oder aus der Umgebung). FMP-Werte: mit FMP_API_KEY live abgerufen; ohne Schlüssel
// die zuletzt gespeicherten FMP-Eingangsdaten aus Supabase (screening_current.inputs, öffentlicher
// Schlüssel VITE_SUPABASE_ANON_KEY). Schlüsselwerte werden nie ausgegeben.
//
// Ausgabe je Ticker: neueste Jahres- und Quartalsperiode beider Adapter, Tabelle
// Feld | FMP | SEC | Abweichung in %, Abweichungen über 2 % mit „!!“ markiert.
// Danach B3 und C1 über die Engine mit beiden Datensätzen. B3 unter der Annahme
// „keine verbotenen Segmente“ (künstliche B3-Prüfung „pass“), damit nur die Zahlen zählen.

import { existsSync } from "node:fs";
import { createFmpProvider } from "../src/screening/providers/fmp.js";
import { createSecProvider } from "../src/screening/providers/sec.js";
import { screenSecurity } from "../src/screening/engine.js";

for (const f of [".env.local", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const UA = (process.env.SEC_USER_AGENT || "").trim();
const FMP_KEY = (process.env.FMP_API_KEY || "").trim();
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const missing = [!UA.includes("@") && "SEC_USER_AGENT", !FMP_KEY && !(SB_URL && SB_KEY) && "FMP_API_KEY oder VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY"].filter(Boolean);
if (missing.length) {
  console.error(`Es fehlt: ${missing.join(", ")}. Bitte selbst in .env.local eintragen, z. B.:`);
  if (missing.includes("SEC_USER_AGENT")) console.error('  SEC_USER_AGENT="Tazkiyah kontakt@deine-adresse"');
  process.exit(1);
}

/** Gespeicherte FMP-Eingangsdaten des letzten Laufs (ohne FMP-Schlüssel). */
async function storedFmp(ticker) {
  const q = `screening_current?select=ticker,run_at,inputs&ticker=eq.${encodeURIComponent(ticker)}`;
  const res = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}${res.status === 400 || res.status === 401 ? " (Rohdaten nicht öffentlich lesbar, FMP_API_KEY in .env.local nötig)" : ""}`);
  const row = (await res.json())[0];
  if (!row?.inputs) throw new Error("kein gespeicherter Lauf");
  if (row.inputs.provider !== "fmp") throw new Error(`gespeicherte Daten stammen von ${row.inputs.provider}`);
  return { annual: row.inputs.annual, quarters: row.inputs.quarters || [], notes: [`FMP-Werte gespeichert (abgerufen ${String(row.inputs.fetchedAt || row.run_at).slice(0, 10)})`] };
}

const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : ["AAPL", "MSFT", "KO"];
const LIMIT_PCT = 2;

const FIELDS = [
  ["income", "revenue"],
  ["income", "interestIncome"],
  ["income", "otherIncome"],
  ["income", "netIncome"],
  ["income", "distributions"],
  ["balance", "cash"],
  ["balance", "shortTermInvestments"],
  ["balance", "longTermInvestments"],
  ["balance", "netReceivables"],
  ["balance", "inventory"],
  ["balance", "goodwill"],
  ["balance", "intangiblesExGoodwill"],
  ["balance", "totalAssets"],
  ["balance", "currentLiabilities"],
  ["balance", "interestBearingDebtExLeases"],
  ["balance", "leaseLiabilities"],
  [null, "sharesOutstanding"],
];

const fmtNum = (v) => (v === null || v === undefined ? "—" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 0 })} Mio.` : v.toLocaleString("de-DE"));
function diff(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return { text: a === b || (a == null && b == null) ? "" : "fehlt", big: a != null || b != null };
  if (a === 0 && b === 0) return { text: "0,0 %", big: false };
  if (a === 0) return { text: "n/a", big: true };
  const pct = ((b - a) / Math.abs(a)) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`, big: Math.abs(pct) > LIMIT_PCT };
}
const val = (snap, [group, field]) => (snap ? (group ? snap[group]?.[field] : snap[field]) : undefined) ?? null;

function table(title, fmpSnap, secSnap, flagged, ticker) {
  console.log(`\n### ${ticker} — ${title}: FMP ${fmpSnap?.periodEnd ?? "—"} | SEC ${secSnap?.periodEnd ?? "—"}${secSnap?.sourceFiling ? ` (${secSnap.sourceFiling.form} vom ${secSnap.sourceFiling.filingDate})` : ""}`);
  if (fmpSnap && secSnap && fmpSnap.periodEnd !== secSnap.periodEnd) console.log("Achtung: unterschiedliche Stichtage, Vergleich nur eingeschränkt aussagekräftig.");
  console.log("| Feld | FMP | SEC | Abweichung | SEC-Konzept |");
  console.log("|---|---|---|---|---|");
  for (const f of FIELDS) {
    const a = val(fmpSnap, f);
    const b = val(secSnap, f);
    const d = diff(a, b);
    const c = secSnap?.sourceConcepts?.[f[1]];
    const concept = c ? `${c.concept}${c.derived ? " (abgeleitet)" : ""}${c.classesSummed ? ` (${c.classesSummed} Gattungen)` : ""}` : "";
    const mark = d.big ? " !!" : "";
    console.log(`| ${f[1]} | ${fmtNum(a)} | ${fmtNum(b)} | ${d.text}${mark} | ${concept} |`);
    if (d.big) flagged.push(`${ticker} ${title} ${f[1]}: FMP ${fmtNum(a)}, SEC ${fmtNum(b)} (${d.text})`);
  }
  if (secSnap?.sharesBasis || fmpSnap?.sharesBasis) console.log(`Aktienzahl-Basis: FMP ${fmpSnap?.sharesBasis ?? "—"}, SEC ${secSnap?.sharesBasis ?? "—"}${secSnap?.sharesAsOf ? ` (${secSnap.sharesAsOf})` : ""}`);
}

function engineChecks(ticker, periods) {
  if (!periods?.annual) return null;
  const result = screenSecurity({
    security: { ticker, assetType: "stock", productType: "standard", shareClass: "common" },
    profile: null,
    annual: periods.annual,
    quarters: periods.quarters || [],
    manualReviews: [{ criterion: "B3_SEGMENTS", result: "pass", details: {}, reviewedAt: new Date().toISOString(), basisAnnualPeriodEnd: periods.annual.periodEnd }],
  });
  const pick = (id) => result.criteria.find((c) => c.id === id);
  return { B3: pick("B3"), C1: pick("C1") };
}

const fmtCheck = (c) =>
  !c ? "—" : c.value === null || c.value === undefined ? `nicht geprüft (${c.reason || "fehlt"})` : `${c.value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} % → ${c.result}`;

const fmp = FMP_KEY ? createFmpProvider({ apiKey: FMP_KEY }) : { getFinancialPeriods: storedFmp };
const sec = createSecProvider({ userAgent: UA });
const flagged = [];

for (const ticker of TICKERS) {
  console.log(`\n## ${ticker}`);
  const [f, s] = await Promise.all([
    fmp.getFinancialPeriods(ticker).catch((e) => ({ error: String(e.message || e) })),
    sec.getFinancialPeriods(ticker).catch((e) => ({ error: String(e.message || e) })),
  ]);
  if (f.error) console.log(`FMP-Fehler: ${f.error}`);
  if (s.error) console.log(`SEC-Fehler: ${s.error}`);
  for (const n of [...(f.notes || []), ...(s.notes || [])]) console.log(`Hinweis: ${n}`);

  table("Jahr", f.annual, s.annual, flagged, ticker);
  table("Quartal", f.quarters?.[0], s.quarters?.[0], flagged, ticker);

  const ef = engineChecks(ticker, f);
  const es = engineChecks(ticker, s);
  console.log(`\nEngine (B3 mit Annahme „keine verbotenen Segmente“):`);
  console.log("| Prüfung | Basis | mit FMP | mit SEC |");
  console.log("|---|---|---|---|");
  for (const id of ["B3", "C1"]) {
    const bases = [...new Set([...(ef?.[id]?.checks || []), ...(es?.[id]?.checks || [])].map((c) => c.basis))];
    for (const basis of bases) {
      const cf = ef?.[id]?.checks.find((c) => c.basis === basis);
      const cs = es?.[id]?.checks.find((c) => c.basis === basis);
      console.log(`| ${id} | ${basis} | ${fmtCheck(cf)} | ${fmtCheck(cs)} |`);
    }
    console.log(`| ${id} | Ergebnis | ${ef?.[id]?.result ?? "—"} | ${es?.[id]?.result ?? "—"} |`);
  }
}

console.log(`\n## Abweichungen über ${LIMIT_PCT} % oder Wert nur bei einem Anbieter (${flagged.length})`);
for (const x of flagged) console.log(`- ${x}`);
console.log(`\nSEC-Abrufe: ${sec.getCallCount()}`);
