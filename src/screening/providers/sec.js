// src/screening/providers/sec.js
//
// Adapter für die SEC (EDGAR XBRL, kostenlos). Liefert Bilanz- und Umsatzzahlen
// im neutralen Modell aus ./model.js. Marktkapitalisierung und Kurs liefert die SEC
// NICHT: marketCapAtPeriodEnd, priceAtPeriodEnd, marketCapSource und
// fxToEurAtPeriodEnd bleiben null → B1/B2 „nicht geprüft“ (außer im Modus sec_fmp,
// siehe ./secFmp.js).
//
// Quellen (jede Anfrage mit Header User-Agent = SEC_USER_AGENT, Pflicht laut SEC):
//   https://www.sec.gov/files/company_tickers.json            Ticker → CIK (1× je Lauf)
//   https://data.sec.gov/submissions/CIK##########.json       Name, SIC, Geschäftsjahresende, Einreichungen
//   https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json  alle XBRL-Werte
// Abrufe je Titel: 2 (submissions, companyfacts). Höchstens 8 Anfragen pro Sekunde
// (Grenze der SEC: 10/s); bei 429/503 kurz warten und einmal wiederholen.
//
// Regeln (Konvention aus model.js: null = unbekannt, 0 nur wenn ausdrücklich 0):
//   - Nur Formulare 10-K, 10-K/A, 10-Q, 10-Q/A. Ein Wert gehört zu einer Periode, wenn er
//     aus einer Einreichung für genau diese Periode stammt (reportDate). Pro Periode gilt
//     der Wert aus der jüngsten Einreichung: eine Berichtigung (…/A) schlägt die Erstfassung.
//     Enthält die Berichtigung den Wert nicht (z. B. 10-K/A nur mit Teil III), gilt die Erstfassung.
//   - Bilanzwerte: Stichtagswert (instant) mit end = periodEnd.
//   - Erfolgsrechnung/Cashflow: Jahr = Dauer ca. 12 Monate, Quartal = Dauer ca. 3 Monate.
//     Kumulierte Werte (6 oder 9 Monate) werden nie als Quartal verwendet.
//   - Viertes Quartal: Hat der 10-K nur den Jahreswert, gilt Jahr minus Summe Q1–Q3
//     desselben Geschäftsjahres (nur wenn alle drei vorliegen, sonst null). Gekennzeichnet in
//     sourceConcepts[feld].derived. Bilanz im Q4 = Bilanz des 10-K.
//   - Währung: Einheit des Postens Assets in der Einreichung (z. B. USD). Werte in anderen
//     Einheiten werden nicht gemischt (bleiben null).
//
// Unterschiede zu fmp.js und Unsicherheiten: in CONCEPTS je Feld unter „Hinweis“.

import { emptySnapshot, num } from "./model.js";
import { ProviderError, applyLeaseEstimate } from "./fmp.js";

// ---------------------------------------------------------------- Feldzuordnung
//
// Reihenfolge der Konzepte = Vorrang: das erste Konzept mit einem Wert für die Periode gilt.
// kind: "instant" (Bilanz, Stichtag), "flow" (Erfolgsrechnung/Cashflow, Zeitraum).
// Felder mit eigener Regel (rule) werden in mapSecFinancials gesondert berechnet.
export const CONCEPTS = {
  // Umsatz. Hinweis: „Revenues“ kann bei einzelnen Unternehmen neben Umsatzerlösen auch
  // sonstige Erlöse enthalten; FMP „revenue“ ist meist der Gesamtumsatz der GuV.
  revenue: {
    kind: "flow",
    concepts: [
      "Revenues",
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
    ],
  },
  // Zinserträge (FMP: interestIncome = Zinserträge der GuV, ohne Zinsaufwand).
  // Hinweis: InterestAndDividendIncomeOperating enthält auch Dividenden → eher zu hoch
  // (strenger); nur als letzte Möglichkeit. Viele Unternehmen weisen Zinserträge nur im
  // Saldo („Other income/(expense), net“) aus → dann null → B3 „nicht geprüft“.
  interestIncome: {
    kind: "flow",
    concepts: ["InvestmentIncomeInterest", "InterestIncomeOther", "InterestAndDividendIncomeOperating"],
  },
  // Sonstige Erträge (≥ 0) für den B3-Nenner „Gesamteinnahmen“. Nur eindeutige Erträge,
  // NICHT der Saldo NonoperatingIncomeExpense (fmp.js nimmt den positiven Saldo).
  // Hinweis: OtherNonoperatingIncome wird selten getaggt → oft null → B3 „nicht geprüft“.
  // Ein negativer Wert gilt nicht als eindeutig → null.
  otherIncome: { kind: "flow", concepts: ["OtherNonoperatingIncome"], nonNegativeOnly: true },
  netIncome: { kind: "flow", concepts: ["NetIncomeLoss"] },
  // Ausschüttungen (positiv). Hinweis: 10-Q-Cashflows sind meist nur kumuliert (6/9 Monate)
  // → Quartalswerte meist null (fmp.js liefert Quartalswerte).
  distributions: { kind: "flow", concepts: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"], absolute: true },

  cash: { kind: "instant", concepts: ["CashAndCashEquivalentsAtCarryingValue"] },
  // Hinweis: Weist ein Unternehmen mehrere dieser Posten getrennt aus (z. B. „Short-term
  // investments“ UND „Marketable securities“), zählt nur der erste → evtl. zu niedrig.
  // Fehlt der Posten (weil das Unternehmen keine hat), bleibt er null → B2/C1 „nicht geprüft“
  // (FMP liefert in diesem Fall 0).
  shortTermInvestments: {
    kind: "instant",
    concepts: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
  },
  longTermInvestments: {
    kind: "instant",
    concepts: ["LongTermInvestments", "MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent"],
  },
  // Forderungen: AccountsReceivableNetCurrent, dazu NontradeReceivablesCurrent, falls vorhanden
  // (fmp.js netReceivables = Forderungen aus Lieferungen und Leistungen + sonstige Forderungen).
  netReceivables: { kind: "instant", rule: "receivables", concepts: ["AccountsReceivableNetCurrent", "NontradeReceivablesCurrent"] },
  inventory: { kind: "instant", concepts: ["InventoryNet"] },
  // Hinweis: Unternehmen ohne Firmenwert taggen Goodwill oft gar nicht → null → C1 „nicht geprüft“.
  goodwill: { kind: "instant", concepts: ["Goodwill"] },
  // Hinweis: Manche Unternehmen taggen nur FiniteLivedIntangibleAssetsNet (nicht in der Liste) → null.
  intangiblesExGoodwill: { kind: "instant", concepts: ["IntangibleAssetsNetExcludingGoodwill"] },
  totalAssets: { kind: "instant", concepts: ["Assets"] },
  currentLiabilities: { kind: "instant", concepts: ["LiabilitiesCurrent"] },

  // Finanzschulden ohne Leasing = langfristig + kurzfristig.
  // Kurzfristig: DebtCurrent, falls vorhanden (enthält oft LongTermDebtCurrent, CommercialPaper und
  // ShortTermBorrowings → dann nur DebtCurrent, keine Doppelzählung); sonst Summe aus
  // LongTermDebtCurrent, CommercialPaper, ShortTermBorrowings. Fehlt alles: null.
  // Fehlt LongTermDebtNoncurrent, ist der Wert null (nicht die Teilsumme): Beispiel KO taggt die
  // langfristigen Schulden als LongTermDebtAndCapitalLeaseObligations (inkl. Finanzierungsleasing);
  // nur Commercial Paper (1,5 Mrd. statt ca. 44 Mrd. $) würde B1 stark unterschätzen (falsches „konform“).
  // Hinweis: Unternehmen, die nur LongTermDebt (gesamt) oder LongTermDebtAndCapitalLeaseObligations
  // taggen, bleiben damit null → B1 „nicht geprüft“.
  interestBearingDebtExLeases: {
    kind: "instant",
    rule: "debt",
    concepts: ["LongTermDebtNoncurrent", "DebtCurrent", "LongTermDebtCurrent", "CommercialPaper", "ShortTermBorrowings"],
  },
  // Leasing = operatives Leasing + Finanzierungsleasing, jeweils gesamt oder kurz- + langfristig.
  // leaseSeparateFromDebt: true, wenn nur operatives Leasing vorliegt (nach ASC 842 nie in den
  // Finanzschulden); bei Finanzierungsleasing null (kann in LongTermDebt enthalten sein).
  leaseLiabilities: {
    kind: "instant",
    rule: "lease",
    concepts: [
      "OperatingLeaseLiability",
      "OperatingLeaseLiabilityCurrent",
      "OperatingLeaseLiabilityNoncurrent",
      "FinanceLeaseLiability",
      "FinanceLeaseLiabilityCurrent",
      "FinanceLeaseLiabilityNoncurrent",
    ],
  },
  // Aktienzahl: Bestand zum Stichtag (us-gaap), sonst Deckblatt (dei, Datum kurz nach dem Stichtag).
  // Mehrere Aktiengattungen: alle Werte derselben Einreichung und desselben Datums werden addiert.
  // Hinweis: companyfacts enthält keine Werte mit Dimension (Gattung); ob die Gattungen einzeln
  // erscheinen, ist je Unternehmen zu prüfen (z. B. GOOGL).
  sharesOutstanding: { kind: "instant", rule: "shares", concepts: ["us-gaap:CommonStockSharesOutstanding", "dei:EntityCommonStockSharesOutstanding"] },
};

export const ALLOWED_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A"]);
const ANNUAL_FORMS = new Set(["10-K", "10-K/A"]);
const QUARTER_FORMS = new Set(["10-Q", "10-Q/A"]);
const DERIVED_Q4 = "abgeleitet aus Jahres- und Quartalswerten";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const DATA_URL = "https://data.sec.gov";
const MAX_PER_SECOND = 8;

// ---------------------------------------------------------------- Helfer

const DAY = 86400000;
const days = (start, end) => Math.round((Date.parse(end) - Date.parse(start)) / DAY);
const isAnnualDuration = (e) => e.start && days(e.start, e.end) >= 340 && days(e.start, e.end) <= 380;
const isQuarterDuration = (e) => e.start && days(e.start, e.end) >= 80 && days(e.start, e.end) <= 100;

export function padCik(cik) {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

/** Schreibweisen eines Tickers: BRK-B, BRK.B, BRKB. */
export function tickerVariants(symbol) {
  const t = String(symbol || "").trim().toUpperCase();
  return [...new Set([t, t.replace(/\./g, "-"), t.replace(/-/g, "."), t.replace(/[.-]/g, "")])].filter(Boolean);
}

/** company_tickers.json → Map(Ticker → CIK, 10-stellig). Einträge ohne Trennzeichen zusätzlich. */
export function buildTickerIndex(json) {
  const map = new Map();
  for (const row of Object.values(json || {})) {
    if (!row?.ticker || row.cik_str === undefined) continue;
    const t = String(row.ticker).toUpperCase();
    const cik = padCik(row.cik_str);
    if (!map.has(t)) map.set(t, cik);
    const plain = t.replace(/[.-]/g, "");
    if (!map.has(plain)) map.set(plain, cik);
  }
  return map;
}

export function lookupCik(index, symbol) {
  for (const v of tickerVariants(symbol)) if (index.has(v)) return index.get(v);
  return null;
}

/** submissions → Liste der Einreichungen (nur die zuletzt veröffentlichten, „recent“). */
export function listFilings(submissions) {
  const r = submissions?.filings?.recent;
  if (!r?.accessionNumber) return [];
  return r.accessionNumber.map((accn, i) => ({
    accn,
    form: r.form?.[i] ?? null,
    filed: r.filingDate?.[i] ?? null,
    reportDate: r.reportDate?.[i] || null,
    primaryDocument: r.primaryDocument?.[i] ?? null,
  }));
}

export function filingUrl(cik, accn) {
  const cikInt = String(Number(String(cik).replace(/\D/g, "")));
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accn.replace(/-/g, "")}/${accn}-index.htm`;
}

export function mapSecProfile(submissions, symbol) {
  if (!submissions) return null;
  const fye = submissions.fiscalYearEnd ? String(submissions.fiscalYearEnd) : null;
  return {
    symbol: symbol ?? null,
    name: submissions.name ?? null,
    isin: null, // ISIN kommt weiter von OpenFIGI
    cik: submissions.cik !== undefined ? padCik(submissions.cik) : null,
    // Branche bleibt null, bis die SIC → Branchengruppen-Zuordnung steht (A1 dann „nicht geprüft“)
    industry: null,
    sector: null,
    description: null,
    currency: null,
    sic: submissions.sic ? String(submissions.sic) : null,
    sicDescription: submissions.sicDescription ?? null,
    fiscalYearEnd: fye && /^\d{4}$/.test(fye) ? `${fye.slice(0, 2)}-${fye.slice(2)}` : null, // "MM-TT"
  };
}

function conceptEntries(facts, qualified, unit) {
  const [ns, name] = qualified.includes(":") ? qualified.split(":") : ["us-gaap", qualified];
  const units = facts?.[ns]?.[name]?.units;
  if (!units) return [];
  return units[unit] || [];
}

/** Erster Wert nach Vorrang der Einreichungen (filings: jüngste zuerst). */
function pickEntry(entries, { end, accnRank, test }) {
  let best = null;
  for (const e of entries) {
    if (e.end !== end || !accnRank.has(e.accn) || !test(e)) continue;
    const v = num(e.val);
    if (v === null) continue;
    if (!best || accnRank.get(e.accn) < accnRank.get(best.accn)) best = e;
  }
  return best;
}

// ---------------------------------------------------------------- Hauptabbildung

/**
 * Reine Übersetzungsfunktion — ohne Netzwerk, daher testbar.
 * @param {object} companyfacts  Antwort von /api/xbrl/companyfacts
 * @param {Array}  filings       aus listFilings(submissions)
 * @param {string} cik
 * @returns {{ annual: Snapshot|null, quarters: Snapshot[], notes: string[] }}
 */
export function mapSecFinancials(companyfacts, filings, cik) {
  const facts = companyfacts?.facts || {};
  const notes = [];
  // Nur Einreichungen, deren Werte schon in companyfacts stehen. Neue Einreichungen erscheinen dort
  // erst mit Verzögerung; ohne diesen Filter wäre die jüngste Periode komplett leer.
  const accnsWithFacts = new Set();
  for (const ns of Object.values(facts)) {
    for (const c of Object.values(ns || {})) for (const list of Object.values(c?.units || {})) for (const e of list) accnsWithFacts.add(e.accn);
  }
  const candidates = (filings || []).filter((f) => ALLOWED_FORMS.has(f.form) && f.reportDate && f.filed);
  const usable = candidates.filter((f) => accnsWithFacts.has(f.accn));
  const pending = candidates.filter((f) => !accnsWithFacts.has(f.accn) && (!usable.length || f.filed > usable.map((u) => u.filed).sort().reverse()[0]));
  for (const f of pending) notes.push(`SEC: ${f.form} vom ${f.filed} (Periode ${f.reportDate}) noch nicht in den XBRL-Daten, nicht berücksichtigt`);

  // Einreichungen je Periode, jüngste zuerst
  const byEnd = new Map();
  for (const f of usable) {
    if (!byEnd.has(f.reportDate)) byEnd.set(f.reportDate, []);
    byEnd.get(f.reportDate).push(f);
  }
  for (const list of byEnd.values()) list.sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0));

  const annualEnds = [...byEnd.entries()].filter(([, l]) => l.some((f) => ANNUAL_FORMS.has(f.form))).map(([e]) => e).sort().reverse();
  const quarterEnds = [...byEnd.entries()]
    .filter(([, l]) => l.some((f) => ALLOWED_FORMS.has(f.form)))
    .map(([e]) => e)
    .sort()
    .reverse()
    .slice(0, 4);

  const filingsFor = (end, forms) => (byEnd.get(end) || []).filter((f) => forms.has(f.form));

  const annual = annualEnds[0] ? buildSnapshot("annual", annualEnds[0], filingsFor(annualEnds[0], ANNUAL_FORMS)) : null;
  const quarters = quarterEnds.map((end) => {
    const isFy = annualEnds.includes(end);
    return buildSnapshot("quarter", end, filingsFor(end, isFy ? ANNUAL_FORMS : QUARTER_FORMS), { fiscalYearEnd: isFy });
  });

  if (!annual) notes.push("SEC: kein Jahresabschluss (10-K) mit XBRL-Daten gefunden");
  applyLeaseEstimate(annual, quarters);
  return { annual, quarters, notes };

  // ---------------------------------------------------------- je Periode
  function buildSnapshot(periodType, end, periodFilings, { fiscalYearEnd = false } = {}) {
    const s = emptySnapshot(periodType, end);
    const accnRank = new Map(periodFilings.map((f, i) => [f.accn, i]));
    const filingOf = new Map(periodFilings.map((f) => [f.accn, f]));
    const sourceConcepts = {};
    const used = new Map(); // accn → Anzahl verwendeter Werte

    // Berichtswährung: Einheit von Assets in einer Einreichung dieser Periode
    const assetUnits = facts["us-gaap"]?.Assets?.units || {};
    const currency =
      Object.keys(assetUnits).find((u) => assetUnits[u].some((e) => e.end === end && accnRank.has(e.accn) && !e.start)) || null;
    s.currency = currency;

    const note = (field, entry, concept, extra = {}) => {
      const f = filingOf.get(entry.accn);
      sourceConcepts[field] = { concept, accn: entry.accn, form: f?.form ?? entry.form ?? null, filed: f?.filed ?? entry.filed ?? null, ...extra };
      used.set(entry.accn, (used.get(entry.accn) || 0) + 1);
    };

    // Ein Konzept → Wert (Bilanz: Stichtag; Fluss: Jahr oder echtes Quartal)
    const one = (concept, unit = currency) => {
      if (!unit) return null;
      const test = (e) => {
        if (CONCEPT_KIND(concept) === "instant") return !e.start;
        return periodType === "annual" ? isAnnualDuration(e) : isQuarterDuration(e);
      };
      return pickEntry(conceptEntries(facts, concept, unit), { end, accnRank, test });
    };
    const CONCEPT_KIND = (concept) => (FLOW_CONCEPTS.has(concept) ? "flow" : "instant");

    // Einfache Felder nach Vorrang
    const simple = (field) => {
      const def = CONCEPTS[field];
      for (const c of def.concepts) {
        const e = one(c);
        if (!e) continue;
        let v = num(e.val);
        if (def.nonNegativeOnly && v < 0) {
          return null; // nicht eindeutig → unbekannt
        }
        if (def.absolute) v = Math.abs(v);
        note(field, e, c);
        return v;
      }
      // Viertes Quartal aus Jahr minus Q1–Q3
      if (def.kind === "flow" && periodType === "quarter" && fiscalYearEnd) return deriveQ4(field, def);
      return null;
    };

    function deriveQ4(field, def) {
      for (const c of def.concepts) {
        const units = conceptEntries(facts, c, currency);
        const year = pickEntry(units, { end, accnRank, test: isAnnualDuration });
        if (!year) continue;
        // Q1–Q3 desselben Geschäftsjahres: echte Quartalswerte aus den 10-Q dieser Perioden
        const qEnds = [...byEnd.keys()].filter((e) => e > year.start && e < end).sort();
        const parts = [];
        for (const qEnd of qEnds) {
          const qFilings = (byEnd.get(qEnd) || []).filter((f) => QUARTER_FORMS.has(f.form));
          if (!qFilings.length) continue;
          const rank = new Map(qFilings.map((f, i) => [f.accn, i]));
          const q = pickEntry(units, { end: qEnd, accnRank: rank, test: (e) => isQuarterDuration(e) && e.start >= year.start });
          parts.push(q);
        }
        if (parts.length !== 3 || parts.some((p) => !p)) return null; // nicht alle drei Quartale → unbekannt
        let v = num(year.val) - parts.reduce((a, p) => a + num(p.val), 0);
        if (def.nonNegativeOnly && v < 0) return null;
        if (def.absolute) v = Math.abs(v);
        note(field, year, c, { derived: DERIVED_Q4, quarterAccns: parts.map((p) => p.accn) });
        return v;
      }
      return null;
    }

    for (const field of ["revenue", "interestIncome", "otherIncome", "netIncome", "distributions"]) {
      s.income[field] = simple(field);
    }
    for (const field of ["cash", "shortTermInvestments", "longTermInvestments", "inventory", "goodwill", "intangiblesExGoodwill", "totalAssets", "currentLiabilities"]) {
      s.balance[field] = simple(field);
    }

    // Forderungen: AccountsReceivableNetCurrent (+ NontradeReceivablesCurrent)
    {
      const ar = one("AccountsReceivableNetCurrent");
      if (ar) {
        const nt = one("NontradeReceivablesCurrent");
        s.balance.netReceivables = num(ar.val) + (nt ? num(nt.val) : 0);
        note("netReceivables", ar, nt ? "AccountsReceivableNetCurrent + NontradeReceivablesCurrent" : "AccountsReceivableNetCurrent");
      }
    }

    // Finanzschulden ohne Leasing
    {
      const get = (c) => one(c);
      const longNc = get("LongTermDebtNoncurrent");
      const debtCurrent = get("DebtCurrent");
      const parts = debtCurrent ? [debtCurrent] : ["LongTermDebtCurrent", "CommercialPaper", "ShortTermBorrowings"].map(get).filter(Boolean);
      const all = [longNc, ...parts].filter(Boolean);
      if (longNc) {
        s.balance.interestBearingDebtExLeases = all.reduce((a, e) => a + num(e.val), 0);
        const names = [longNc && "LongTermDebtNoncurrent", ...(debtCurrent ? ["DebtCurrent"] : ["LongTermDebtCurrent", "CommercialPaper", "ShortTermBorrowings"].filter((c) => get(c)))].filter(Boolean);
        note("interestBearingDebtExLeases", all[0], names.join(" + "));
      }
    }

    // Leasing
    {
      const pair = (total, cur, nonCur) => {
        const t = one(total);
        if (t) return { value: num(t.val), entry: t, names: [total] };
        const c = one(cur);
        const n = one(nonCur);
        if (!c && !n) return null;
        return { value: (c ? num(c.val) : 0) + (n ? num(n.val) : 0), entry: c || n, names: [c && cur, n && nonCur].filter(Boolean) };
      };
      const op = pair("OperatingLeaseLiability", "OperatingLeaseLiabilityCurrent", "OperatingLeaseLiabilityNoncurrent");
      const fin = pair("FinanceLeaseLiability", "FinanceLeaseLiabilityCurrent", "FinanceLeaseLiabilityNoncurrent");
      if (op || fin) {
        s.balance.leaseLiabilities = (op?.value ?? 0) + (fin?.value ?? 0);
        s.balance.leaseSeparateFromDebt = fin && fin.value !== 0 ? null : true;
        note("leaseLiabilities", (op || fin).entry, [...(op?.names || []), ...(fin?.names || [])].join(" + "));
      }
    }

    // Aktienzahl
    {
      const sumSameFiling = (entries, filter) => {
        const hits = entries.filter((e) => accnRank.has(e.accn) && filter(e) && num(e.val) !== null);
        if (!hits.length) return null;
        const bestAccn = hits.reduce((b, e) => (accnRank.get(e.accn) < accnRank.get(b.accn) ? e : b)).accn;
        const sameFiling = hits.filter((e) => e.accn === bestAccn);
        const asOf = sameFiling.map((e) => e.end).sort().reverse()[0];
        const distinct = new Map(sameFiling.filter((e) => e.end === asOf).map((e) => [num(e.val), e]));
        return { value: [...distinct.keys()].reduce((a, v) => a + v, 0), entry: distinct.values().next().value, asOf, classes: distinct.size };
      };
      const pe = sumSameFiling(conceptEntries(facts, "us-gaap:CommonStockSharesOutstanding", "shares"), (e) => e.end === end && !e.start);
      const cover = pe ? null : sumSameFiling(conceptEntries(facts, "dei:EntityCommonStockSharesOutstanding", "shares"), (e) => !e.start);
      const hit = pe || cover;
      if (hit) {
        s.sharesOutstanding = hit.value;
        s.sharesBasis = pe ? "period_end" : "cover_page";
        s.sharesAsOf = hit.asOf;
        note("sharesOutstanding", hit.entry, pe ? "us-gaap:CommonStockSharesOutstanding" : "dei:EntityCommonStockSharesOutstanding", hit.classes > 1 ? { classesSummed: hit.classes } : {});
      }
    }

    // Fundstelle: Einreichung, aus der die meisten Werte stammen (sonst die jüngste)
    const primaryAccn = [...used.entries()].sort((a, b) => b[1] - a[1] || accnRank.get(a[0]) - accnRank.get(b[0]))[0]?.[0] ?? periodFilings[0]?.accn;
    const primary = filingOf.get(primaryAccn) || null;
    s.filingDate = primary?.filed ?? null;
    s.audited = primary ? ANNUAL_FORMS.has(primary.form) : null;
    s.sourceFiling = primary
      ? { accessionNumber: primary.accn, form: primary.form, filingDate: primary.filed, reportDate: primary.reportDate, url: filingUrl(cik, primary.accn) }
      : null;
    s.sourceConcepts = sourceConcepts;
    return s;
  }
}

const FLOW_CONCEPTS = new Set(
  Object.values(CONCEPTS)
    .filter((d) => d.kind === "flow")
    .flatMap((d) => d.concepts)
);

// ---------------------------------------------------------------- Abrufe

export function createSecProvider({ userAgent, fetchImpl = fetch, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!userAgent || !/@/.test(userAgent)) {
    throw new Error("SEC_USER_AGENT fehlt oder enthält keine E-Mail-Adresse (Format: \"Tazkiyah kontakt@…\")");
  }

  let calls = 0;
  let nextSlot = 0;
  async function throttle() {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + Math.ceil(1000 / MAX_PER_SECOND);
    if (wait) await sleepImpl(wait);
  }

  async function getJson(url, what) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await throttle();
      calls++;
      let res;
      try {
        res = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" } });
      } catch (err) {
        throw new ProviderError(`SEC ${what}: Netzwerkfehler (${String(err?.message || err).slice(0, 120)})`, "other");
      }
      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        await sleepImpl(1500);
        continue;
      }
      if (!res.ok) {
        const kind = res.status === 429 ? "limit" : "other";
        const hint = res.status === 404 ? " (keine Daten bei der SEC)" : "";
        throw new ProviderError(`SEC ${what} ${res.status}${hint}`, kind);
      }
      try {
        return JSON.parse(await res.text());
      } catch {
        throw new ProviderError(`SEC ${what}: Antwort ist kein JSON`, "other");
      }
    }
    throw new ProviderError(`SEC ${what}: keine Antwort`, "other");
  }

  let tickerIndex = null; // Promise, einmal je Lauf
  const submissionsCache = new Map(); // CIK → Promise

  async function cikFor(symbol) {
    if (!tickerIndex) tickerIndex = getJson(TICKERS_URL, "company_tickers").then(buildTickerIndex);
    let index;
    try {
      index = await tickerIndex;
    } catch (err) {
      tickerIndex = null; // beim nächsten Titel erneut versuchen
      throw err;
    }
    const cik = lookupCik(index, symbol);
    if (!cik) throw new ProviderError(`SEC: Ticker ${symbol} nicht in company_tickers.json`, "other");
    return cik;
  }

  function submissions(cik) {
    if (!submissionsCache.has(cik)) {
      const p = getJson(`${DATA_URL}/submissions/CIK${cik}.json`, "submissions");
      p.catch(() => submissionsCache.delete(cik));
      submissionsCache.set(cik, p);
    }
    return submissionsCache.get(cik);
  }

  return {
    id: "sec",
    usageKey: "sec",
    callsPerTitle: 2, // submissions + companyfacts (company_tickers.json 1× je Lauf)
    getCallCount: () => calls,

    async getProfile(symbol) {
      const cik = await cikFor(symbol);
      return mapSecProfile(await submissions(cik), symbol);
    },

    async getFinancialPeriods(symbol) {
      const cik = await cikFor(symbol);
      const [subs, facts] = await Promise.all([submissions(cik), getJson(`${DATA_URL}/api/xbrl/companyfacts/CIK${cik}.json`, "companyfacts")]);
      return mapSecFinancials(facts, listFilings(subs), cik);
    },
  };
}
