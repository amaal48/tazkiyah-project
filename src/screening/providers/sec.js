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
  // Zinserträge (Festlegung 08.10.2026: zweistufig XBRL → Anhang aus der B3-Prüfung, kein Saldo).
  // Reihenfolge = Vorrang. Konzepte in INCLUSIVE_INTEREST enthalten auch Dividenden oder andere
  // Erträge: sie zählen vollständig als verboten und werden als „vorsichtig vollständig gezählt“
  // gekennzeichnet (sourceConcepts.interestIncome.inclusive). Negative Werte → null.
  // Den positiven Teil eines Saldos (NonoperatingIncomeExpense, OtherNonoperatingIncomeExpense)
  // verwenden wir NICHT. Findet sich nichts: null → Zinserträge laut Anhang aus der B3-Prüfung,
  // sonst B3 „nicht geprüft“.
  // Geprüft am 08.10.2026: KO InvestmentIncomeInterest, GOOGL InterestIncomeOther,
  // MSFT InvestmentIncomeNet (Zeile „Interest and dividends income“), AAPL keines.
  interestIncome: {
    kind: "flow",
    concepts: [
      "InvestmentIncomeInterest",
      "InterestIncomeOther",
      "InvestmentIncomeInterestAndDividend",
      "InterestAndOtherIncome",
      "InvestmentIncomeNet",
      "InterestAndDividendIncomeOperating",
    ],
    nonNegativeOnly: true,
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
  // Anlagen: Summe über Gruppen, innerhalb einer Gruppe gilt der Vorrang (erstes Konzept mit Wert).
  // Gruppen sind getrennte Bilanzzeilen (z. B. KO: „Short-term investments“ = OtherShortTermInvestments
  // UND „Marketable securities“ = MarketableSecurities). MarketableSecurities (ohne Current/Noncurrent)
  // nur, wenn weder MarketableSecuritiesCurrent noch MarketableSecuritiesNoncurrent gemeldet sind.
  // Hinweis: Meldet ein Unternehmen eine Gesamtzeile UND deren Aufschlüsselung in verschiedenen
  // Gruppen, wird doppelt gezählt (strenger für B2 und C1).
  // Fehlt der Posten, bleibt er null → Bilanz-Abgleich (applyBalanceReconciliation) kann 0 setzen.
  shortTermInvestments: {
    kind: "instant",
    rule: "groups",
    groups: [
      ["ShortTermInvestments", "OtherShortTermInvestments"],
      ["MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "MarketableSecurities"],
    ],
  },
  // EquityMethodInvestments (KO: 20,2 Mrd. $, wie FMP) nur, wenn keine Gesamtzeile LongTermInvestments /
  // OtherLongTermInvestments gemeldet ist (MSFT: „Equity and other investments“ enthält sie schon).
  longTermInvestments: {
    kind: "instant",
    rule: "groups",
    groups: [
      ["LongTermInvestments", "OtherLongTermInvestments", "EquityMethodInvestments"],
      ["MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent"],
    ],
  },
  // Forderungen: AccountsReceivableNetCurrent, dazu NontradeReceivablesCurrent, falls vorhanden
  // (fmp.js netReceivables = Forderungen aus Lieferungen und Leistungen + sonstige Forderungen).
  netReceivables: { kind: "instant", rule: "receivables", concepts: ["AccountsReceivableNetCurrent", "NontradeReceivablesCurrent"] },
  inventory: { kind: "instant", concepts: ["InventoryNet"] },
  // Hinweis: Unternehmen ohne Firmenwert taggen Goodwill oft gar nicht → null → C1 „nicht geprüft“.
  goodwill: { kind: "instant", concepts: ["Goodwill"] },
  // Hinweis: Manche Unternehmen taggen nur FiniteLivedIntangibleAssetsNet (nicht in der Liste) → null.
  // AAPL (Quartale ab 2026): Bilanzzeile als eigenes Konzept aapl:IntangibleAssetsNetExcludingGoodwillNoncurrent
  // (20.342 Mio.), nicht in companyfacts. Dieses Feld nimmt den us-gaap-Gesamtwert laut Anhang (25.417 Mio.,
  // inkl. 5.075 Mio. kurzfristig in „Other current assets“). Für C1 siehe identifiedRealAssets.
  intangiblesExGoodwill: { kind: "instant", concepts: ["IntangibleAssetsNetExcludingGoodwill"] },
  totalAssets: { kind: "instant", concepts: ["Assets"] },
  currentLiabilities: { kind: "instant", concepts: ["LiabilitiesCurrent"] },

  // Finanzschulden ohne Leasing = langfristig + kurzfristig.
  // Langfristig (Pflicht): LongTermDebtNoncurrent, sonst LongTermDebtAndCapitalLeaseObligations (KO)
  // minus FinanceLeaseLiabilityNoncurrent. Fehlt der langfristige Teil, ist der Wert null (nicht die
  // Teilsumme): nur Commercial Paper (KO: 1,5 statt 45,5 Mrd. $) würde B1 stark unterschätzen.
  // Kurzfristig: DebtCurrent, falls vorhanden (enthält oft die übrigen Posten → dann nur DebtCurrent,
  // keine Doppelzählung); sonst LongTermDebtCurrent (bzw. LongTermDebtAndCapitalLeaseObligationsCurrent
  // minus FinanceLeaseLiabilityCurrent) + CommercialPaper + ShortTermBorrowings + OtherShortTermBorrowings.
  // Ist Finanzierungsleasing in den Posten enthalten, aber nicht getrennt gemeldet, bleibt es drin
  // (vorsichtig, Vermerk in sourceConcepts.interestBearingDebtExLeases.financeLeaseIncluded).
  // Geprüft am 08.10.2026: KO 42.119 + 1.822 + 1.495 + 56 = 45.492 Mio. $ (= FMP).
  interestBearingDebtExLeases: {
    kind: "instant",
    rule: "debt",
    concepts: [
      "LongTermDebtNoncurrent",
      "LongTermDebtAndCapitalLeaseObligations",
      "DebtCurrent",
      "LongTermDebtCurrent",
      "LongTermDebtAndCapitalLeaseObligationsCurrent",
      "CommercialPaper",
      "ShortTermBorrowings",
      "OtherShortTermBorrowings",
    ],
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

// Konzepte, die neben Zinsen auch Dividenden oder andere Erträge enthalten (vorsichtig vollständig gezählt)
export const INCLUSIVE_INTEREST = new Set(["InvestmentIncomeInterestAndDividend", "InterestAndOtherIncome", "InvestmentIncomeNet", "InterestAndDividendIncomeOperating"]);
export const INCLUSIVE_NOTE = "vorsichtig vollständig gezählt";

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
        note(field, e, c, INCLUSIVE_INTEREST.has(c) && field === "interestIncome" ? { inclusive: true, note: INCLUSIVE_NOTE } : {});
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
          const test = (e) => isQuarterDuration(e) && e.start >= year.start;
          // Erst aus dem 10-Q dieses Quartals; fehlt das Konzept dort (Beispiel GOOGL: Q1 2025 als
          // RevenueFromContract…, Jahr und Q2/Q3 als Revenues), dann derselbe Wert DESSELBEN Konzepts
          // als Vergleichszahl aus einer späteren Einreichung (jüngste zuerst). Nie ein anderes Konzept.
          const q =
            pickEntry(units, { end: qEnd, accnRank: rank, test }) ||
            units
              .filter((e) => e.end === qEnd && test(e) && ALLOWED_FORMS.has(e.form) && num(e.val) !== null)
              .sort((a, b) => (a.filed < b.filed ? 1 : -1))[0] ||
            null;
          parts.push(q);
        }
        if (parts.length !== 3 || parts.some((p) => !p)) return null; // nicht alle drei Quartale → unbekannt
        let v = num(year.val) - parts.reduce((a, p) => a + num(p.val), 0);
        if (def.nonNegativeOnly && v < 0) return null;
        if (def.absolute) v = Math.abs(v);
        const extra = INCLUSIVE_INTEREST.has(c) && field === "interestIncome" ? { inclusive: true, note: INCLUSIVE_NOTE } : {};
        note(field, year, c, { derived: DERIVED_Q4, quarterAccns: parts.map((p) => p.accn), ...extra });
        return v;
      }
      return null;
    }

    for (const field of ["revenue", "interestIncome", "otherIncome", "netIncome", "distributions"]) {
      s.income[field] = simple(field);
    }
    for (const field of ["cash", "inventory", "goodwill", "intangiblesExGoodwill", "totalAssets", "currentLiabilities"]) {
      s.balance[field] = simple(field);
    }

    // Anlagen: Summe über Gruppen (je Gruppe Vorrang)
    for (const field of ["shortTermInvestments", "longTermInvestments"]) {
      const used = [];
      for (const group of CONCEPTS[field].groups) {
        for (const c of group) {
          if (c === "MarketableSecurities" && (one("MarketableSecuritiesCurrent") || one("MarketableSecuritiesNoncurrent"))) continue;
          const e = one(c);
          if (e) {
            used.push([c, e]);
            break;
          }
        }
      }
      if (used.length) {
        s.balance[field] = used.reduce((a, [, e]) => a + num(e.val), 0);
        note(field, used[0][1], used.map(([c]) => c).join(" + "));
      }
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
      const v = (c) => {
        const e = one(c);
        return e ? num(e.val) : null;
      };
      const flNc = v("FinanceLeaseLiabilityNoncurrent");
      const flC = v("FinanceLeaseLiabilityCurrent");
      const flTotal = v("FinanceLeaseLiability");
      const names = [];
      let financeLeaseIncluded = false;
      let total = null;
      let anchor = null;

      // Langfristiger Teil (Pflicht)
      const ltd = one("LongTermDebtNoncurrent");
      const ltdLease = ltd ? null : one("LongTermDebtAndCapitalLeaseObligations");
      if (ltd || ltdLease) {
        anchor = ltd || ltdLease;
        total = num(anchor.val);
        names.push(ltd ? "LongTermDebtNoncurrent" : "LongTermDebtAndCapitalLeaseObligations");
        if (ltdLease) {
          if (flNc !== null) {
            total -= flNc;
            names.push("− FinanceLeaseLiabilityNoncurrent");
          } else if (flTotal !== null && flTotal !== 0) financeLeaseIncluded = true;
        }

        // Kurzfristiger Teil
        const dc = one("DebtCurrent");
        if (dc) {
          total += num(dc.val);
          names.push("DebtCurrent");
        } else {
          const ltdc = one("LongTermDebtCurrent");
          const ltdcLease = ltdc ? null : one("LongTermDebtAndCapitalLeaseObligationsCurrent");
          if (ltdc) {
            total += num(ltdc.val);
            names.push("LongTermDebtCurrent");
          } else if (ltdcLease) {
            total += num(ltdcLease.val);
            names.push("LongTermDebtAndCapitalLeaseObligationsCurrent");
            if (flC !== null) {
              total -= flC;
              names.push("− FinanceLeaseLiabilityCurrent");
            } else if (flTotal !== null && flTotal !== 0) financeLeaseIncluded = true;
          }
          for (const c of ["CommercialPaper", "ShortTermBorrowings", "OtherShortTermBorrowings"]) {
            const e = one(c);
            if (e) {
              total += num(e.val);
              names.push(c);
            }
          }
        }
        s.balance.interestBearingDebtExLeases = total;
        note("interestBearingDebtExLeases", anchor, names.join(" + ").replace(/\+ −/g, "−"), financeLeaseIncluded ? { financeLeaseIncluded: true } : {});
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

// ---------------------------------------------------------------- Bilanz-Abgleich
//
// Festlegung 08.10.2026: Fehlt einer der Posten in BALANCE_TARGETS, gilt er nur dann als 0, wenn
// die Summe aller gemeldeten Aktivposten höchstens 1 % von Assets abweicht. Sonst bleibt er null.
// „Gemeldete Aktivposten“ = die Bilanzzeilen laut Rechenstruktur des Unternehmens (Calculation
// Linkbase der Einreichung: Kinder von Assets, Zwischensummen wie AssetsCurrent aufgelöst).
// Eine bloße Summe aller gefundenen Konzepte wäre falsch (z. B. AAPL: Nutzungsrechte und latente
// Steuern stecken in „Other non-current assets“, würden doppelt zählen).
// Zusätzlich muss jede Bilanzzeile bekannt sein (LEAF_CLASS): Eine unbekannte Zeile könnte der
// fehlende Posten unter anderem Namen sein (Beispiel KO: „Short-term investments“ als
// OtherShortTermInvestments) → dann kein 0. Zeilen ohne Wert in companyfacts (eigene Konzepte des
// Unternehmens) → Abgleich nicht möglich → null.
// Sammelzeilen (CATCH_ALL, z. B. „Other non-current assets“) können den fehlenden Posten enthalten
// (Beispiel AAPL: Firmenwert und immaterielle Werte stecken in „Other non-current assets“, 83,7 Mrd. $).
// Sie zählen deshalb als ungeklärter Betrag: 0 nur, wenn Abweichung + Sammelzeilen ≤ 1 % von Assets.
export const BALANCE_TARGETS = ["goodwill", "intangiblesExGoodwill", "shortTermInvestments", "longTermInvestments", "inventory", "netReceivables"];
export const RECONCILIATION_NOTE = "0 per Bilanz-Abgleich";
export const CATCH_ALL = new Set(["OtherAssetsCurrent", "OtherAssetsNoncurrent", "PrepaidExpenseAndOtherAssetsCurrent"]);
const RECONCILIATION_TOLERANCE = 0.01;

/** us-gaap-Bilanzzeile → Zielfeld (oder null = andere bekannte Zeile). Nicht aufgeführt = unbekannt. */
export const LEAF_CLASS = Object.fromEntries([
  ...["Goodwill"].map((c) => [c, "goodwill"]),
  ...["IntangibleAssetsNetExcludingGoodwill", "IndefiniteLivedTrademarks", "IndefiniteLivedIntangibleAssetsExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"].map((c) => [c, "intangiblesExGoodwill"]),
  ...["ShortTermInvestments", "OtherShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "MarketableSecurities", "EquitySecuritiesFvNiCurrent", "HeldToMaturitySecuritiesCurrent"].map((c) => [c, "shortTermInvestments"]),
  ...["LongTermInvestments", "OtherLongTermInvestments", "EquityMethodInvestments", "MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "EquitySecuritiesFvNiNoncurrent", "HeldToMaturitySecuritiesNoncurrent", "EquitySecuritiesWithoutReadilyDeterminableFairValueAmount"].map((c) => [c, "longTermInvestments"]),
  ...["InventoryNet"].map((c) => [c, "inventory"]),
  ...["AccountsReceivableNetCurrent", "NontradeReceivablesCurrent", "OtherReceivablesNetCurrent", "AccountsAndOtherReceivablesNetCurrent", "ReceivablesNetCurrent"].map((c) => [c, "netReceivables"]),
  ...[
    "CashAndCashEquivalentsAtCarryingValue",
    "Cash",
    "RestrictedCashCurrent",
    "RestrictedCashAndCashEquivalentsAtCarryingValue",
    "PrepaidExpenseCurrent",
    "PrepaidExpenseAndOtherAssetsCurrent",
    "OtherAssetsCurrent",
    "OtherAssetsNoncurrent",
    "PropertyPlantAndEquipmentNet",
    "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization",
    "OperatingLeaseRightOfUseAsset",
    "FinanceLeaseRightOfUseAsset",
    "DeferredIncomeTaxAssetsNet",
    "IncomeTaxesReceivable",
    "AssetsOfDisposalGroupIncludingDiscontinuedOperationCurrent",
    "AssetsOfDisposalGroupIncludingDiscontinuedOperation",
  ].map((c) => [c, null]),
]);

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1].replace(/^.*:/, "")] = m[2];
  return out;
}

/** Calculation Linkbase (XML) → Bilanzzeilen [{ concept: "us-gaap:Goodwill", weight }] unter Assets. */
export function balanceLeavesFromCalc(xml) {
  const links = String(xml || "").matchAll(/<(?:\w+:)?calculationLink\b[^>]*>([\s\S]*?)<\/(?:\w+:)?calculationLink>/g);
  for (const [, body] of links) {
    const concepts = new Map();
    for (const [tag] of body.matchAll(/<(?:\w+:)?loc\b[^>]*>/g)) {
      const a = attrs(tag);
      const frag = (a.href || "").split("#")[1] || "";
      const i = frag.indexOf("_");
      if (a.label && i > 0) concepts.set(a.label, `${frag.slice(0, i)}:${frag.slice(i + 1)}`);
    }
    const children = new Map();
    for (const [tag] of body.matchAll(/<(?:\w+:)?calculationArc\b[^>]*>/g)) {
      const a = attrs(tag);
      const from = concepts.get(a.from);
      const to = concepts.get(a.to);
      if (!from || !to) continue;
      if (!children.has(from)) children.set(from, []);
      children.get(from).push({ concept: to, weight: Number(a.weight ?? 1) });
    }
    if (!children.has("us-gaap:Assets")) continue;
    const leaves = [];
    const walk = (concept, weight, seen) => {
      const kids = children.get(concept);
      if (!kids || seen.has(concept)) {
        leaves.push({ concept, weight });
        return;
      }
      for (const k of kids) walk(k.concept, weight * k.weight, new Set([...seen, concept]));
    };
    for (const k of children.get("us-gaap:Assets")) walk(k.concept, k.weight, new Set(["us-gaap:Assets"]));
    return leaves;
  }
  return null;
}

/**
 * Setzt fehlende Posten aus BALANCE_TARGETS auf 0, wenn der Abgleich gelingt (siehe oben).
 * valueOf(concept) → Zahl oder null (Wert der Bilanzzeile zum Stichtag aus derselben Einreichung).
 * Gibt { ok, reason, zeroed } zurück.
 */
export function applyBalanceReconciliation(snapshot, leaves, valueOf, accn = null) {
  const b = snapshot?.balance;
  if (!b || !Number.isFinite(b.totalAssets) || b.totalAssets <= 0) return { ok: false, reason: "Bilanzsumme fehlt", zeroed: [] };
  const missing = BALANCE_TARGETS.filter((f) => b[f] === null || b[f] === undefined);
  if (!missing.length) return { ok: true, reason: null, zeroed: [] };
  if (!leaves?.length) return { ok: false, reason: "keine Rechenstruktur der Bilanz", zeroed: [] };
  let sum = 0;
  let catchAll = 0;
  const present = new Set();
  for (const leaf of leaves) {
    const [ns, name] = leaf.concept.split(":");
    if (ns !== "us-gaap" || !(name in LEAF_CLASS)) return { ok: false, reason: `unbekannte Bilanzzeile ${leaf.concept}`, zeroed: [] };
    const v = valueOf(name);
    if (v === null) return { ok: false, reason: `Bilanzzeile ${leaf.concept} ohne Wert`, zeroed: [] };
    sum += leaf.weight * v;
    if (CATCH_ALL.has(name)) catchAll += Math.abs(leaf.weight * v);
    if (LEAF_CLASS[name]) present.add(LEAF_CLASS[name]);
  }
  const gap = Math.abs(sum - b.totalAssets) / b.totalAssets;
  if (gap > RECONCILIATION_TOLERANCE) return { ok: false, reason: `Summe der Bilanzzeilen weicht ${(gap * 100).toFixed(1)} % von Assets ab`, zeroed: [] };
  const unexplained = gap + catchAll / b.totalAssets;
  if (unexplained > RECONCILIATION_TOLERANCE) {
    return { ok: false, reason: `Sammelzeilen („Other assets“) ${((catchAll / b.totalAssets) * 100).toFixed(1)} % der Bilanzsumme, fehlender Posten kann darin stecken`, zeroed: [] };
  }
  const zeroed = missing.filter((f) => !present.has(f));
  snapshot.sourceConcepts = snapshot.sourceConcepts || {};
  for (const f of zeroed) {
    b[f] = 0;
    snapshot.sourceConcepts[f] = { concept: null, accn, note: RECONCILIATION_NOTE, reconciliationGapPct: Math.round(gap * 10000) / 100 };
  }
  return { ok: true, reason: null, zeroed };
}

// ---------------------------------------------------------------- Eindeutig belegte reale Werte (C1)
//
// Festlegung 08.10.2026 (nur C1): Fehlen Posten für die normale Rechnung, zählen nur Bilanzzeilen,
// die eindeutig real sind. Sammelzeilen, unbekannte Zeilen und Zeilen ohne Wert zählen nicht (strenger).
// Getrennt nach Art, damit die Engine die Parameter anwenden kann (Forderungen, Rechte).
export const REAL_CLASS = Object.fromEntries([
  ...[
    "PropertyPlantAndEquipmentNet",
    "PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization",
    "PropertyPlantAndEquipmentGross",
    "AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment",
    "InventoryNet",
  ].map((c) => [c, "tangible"]),
  ...["AccountsReceivableNetCurrent", "NontradeReceivablesCurrent", "OtherReceivablesNetCurrent", "AccountsAndOtherReceivablesNetCurrent", "ReceivablesNetCurrent"].map((c) => [c, "receivables"]),
  ...[
    "IntangibleAssetsNetExcludingGoodwill",
    "IndefiniteLivedTrademarks",
    "IndefiniteLivedIntangibleAssetsExcludingGoodwill",
    "FiniteLivedIntangibleAssetsNet",
    "OperatingLeaseRightOfUseAsset",
    "FinanceLeaseRightOfUseAsset",
  ].map((c) => [c, "rights"]),
]);

/**
 * Summe der eindeutig realen Bilanzzeilen nach Art: { tangible, receivables, rights, lines }.
 * null, wenn eine abziehende Zeile (Gewicht < 0) nicht eindeutig zugeordnet oder ohne Wert ist
 * (dann wäre die Summe zu hoch).
 */
export function identifiedRealAssets(leaves, valueOf) {
  if (!leaves?.length) return null;
  const out = { tangible: 0, receivables: 0, rights: 0, lines: [] };
  const usGaapLeaves = new Set(leaves.filter((l) => l.concept.startsWith("us-gaap:")).map((l) => l.concept.slice(8)));
  const aliased = new Set();
  for (const leaf of leaves) {
    const [ns, name] = leaf.concept.split(":");
    let concept = name;
    let alias = null;
    if (ns !== "us-gaap") {
      // Eigene Bilanzzeile des Unternehmens = langfristiger oder kurzfristiger Teil eines us-gaap-Postens
      // (Beispiel AAPL: aapl:IntangibleAssetsNetExcludingGoodwillNoncurrent, 20.342 Mio.). Eigene Konzepte
      // stehen nicht in companyfacts; gezählt wird der us-gaap-Gesamtwert (AAPL 25.417 Mio. laut Anhang).
      // Keine Doppelzählung: der übrige Teil steckt in einer Sammelzeile (AAPL: 5.075 Mio. in
      // OtherAssetsCurrent), und Sammelzeilen zählen nicht; jeder Gesamtwert höchstens einmal, und nur,
      // wenn er nicht selbst als Bilanzzeile vorkommt.
      const m = /^(.+?)(Noncurrent|Current)$/.exec(name);
      if (m && REAL_CLASS[m[1]] && !usGaapLeaves.has(m[1]) && !aliased.has(m[1]) && leaf.weight > 0) {
        concept = m[1];
        alias = leaf.concept;
        aliased.add(concept);
      } else concept = null;
    }
    const cls = concept ? REAL_CLASS[concept] : undefined;
    const v = concept ? valueOf(concept) : null;
    if (leaf.weight < 0 && (!cls || v === null)) return null;
    if (!cls || v === null) continue;
    out[cls] += leaf.weight * v;
    out.lines.push({ concept, value: v, weight: leaf.weight, class: cls, ...(alias ? { line: alias, note: "Gesamtwert laut Anhang, übriger Teil in einer Sammelzeile (nicht mitgezählt)" } : {}) });
  }
  return out;
}

/**
 * Wert einer Bilanzzeile (instant, Stichtag) aus den Einreichungen dieser Periode.
 * accns: Vorrang-Reihenfolge (jüngste Einreichung zuerst, z. B. 10-K/A vor 10-K).
 */
export function balanceValueOf(companyfacts, { end, accns, unit }) {
  const order = Array.isArray(accns) ? accns : [accns];
  return (name) => {
    const list = (companyfacts?.facts?.["us-gaap"]?.[name]?.units?.[unit] || []).filter((x) => x.end === end && !x.start);
    for (const a of order) {
      const e = list.find((x) => x.accn === a);
      if (e) return num(e.val);
    }
    return null;
  };
}

/** Einreichungen, aus denen die Werte einer Periode stammen (jüngste zuerst). */
function periodAccns(snapshot) {
  const seen = new Map();
  for (const c of Object.values(snapshot.sourceConcepts || {})) if (c?.accn && !seen.has(c.accn)) seen.set(c.accn, c.filed || "");
  return [...seen.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([a]) => a);
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

  async function getText(url, what) {
    return getRaw(url, what, (res) => res.text());
  }

  async function getJson(url, what) {
    return getRaw(url, what, async (res) => {
      try {
        return JSON.parse(await res.text());
      } catch {
        throw new ProviderError(`SEC ${what}: Antwort ist kein JSON`, "other");
      }
    });
  }

  async function getRaw(url, what, read) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await throttle();
      calls++;
      let res;
      try {
        res = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json, application/xml, */*" } });
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
      return read(res);
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

  // Bilanz-Abgleich: Rechenstruktur nur laden, wenn ein Posten fehlt (2 Abrufe je Einreichung)
  const calcCache = new Map(); // accn → Promise<leaves|null>
  function calcLeaves(cik, accn) {
    if (!calcCache.has(accn)) {
      const dir = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}`;
      const p = (async () => {
        const index = await getJson(`${dir}/index.json`, "Einreichungsverzeichnis");
        const names = (index?.directory?.item || []).map((i) => i.name);
        // Eigene Datei *_cal.xml, sonst in die Schemadatei *.xsd eingebettet (z. B. MSFT)
        const cal = names.find((n) => /_cal\.xml$/i.test(n)) || names.find((n) => /\.xsd$/i.test(n));
        if (!cal) return null;
        const xml = await getText(`${dir}/${cal}`, "Calculation Linkbase");
        return balanceLeavesFromCalc(xml);
      })();
      calcCache.set(accn, p);
    }
    return calcCache.get(accn);
  }

  async function reconcile(cik, facts, snapshots, notes) {
    for (const s of snapshots) {
      if (!BALANCE_TARGETS.some((f) => s.balance[f] === null) || !Number.isFinite(s.balance.totalAssets)) continue;
      const accn = s.sourceConcepts?.totalAssets?.accn;
      if (!accn || !s.currency) continue;
      let leaves = null;
      try {
        leaves = await calcLeaves(cik, accn);
      } catch (err) {
        if (err?.kind === "limit") throw err;
        notes.push(`SEC: Bilanz-Abgleich ${s.periodEnd} nicht möglich (Rechenstruktur nicht abrufbar)`);
        continue;
      }
      const valueOf = balanceValueOf(facts, { end: s.periodEnd, accns: periodAccns(s), unit: s.currency });
      const r = applyBalanceReconciliation(s, leaves, valueOf, accn);
      if (!r.ok) notes.push(`SEC: Bilanz-Abgleich ${s.periodEnd} nicht möglich (${r.reason})`);
      // Fehlen weiter Posten für C1, die eindeutig belegten realen Werte mitgeben (nur C1 nutzt sie)
      if (["cash", "shortTermInvestments", "longTermInvestments", "goodwill"].some((f) => s.balance[f] === null)) {
        const ir = identifiedRealAssets(leaves, valueOf);
        if (ir) s.balance.identifiedRealAssets = ir;
      }
    }
  }

  return {
    id: "sec",
    usageKey: "sec",
    callsPerTitle: 2, // submissions + companyfacts (company_tickers.json 1× je Lauf; Bilanz-Abgleich bei Bedarf +2 je Einreichung)
    getCallCount: () => calls,

    async getProfile(symbol) {
      const cik = await cikFor(symbol);
      return mapSecProfile(await submissions(cik), symbol);
    },

    async getFinancialPeriods(symbol) {
      const cik = await cikFor(symbol);
      const [subs, facts] = await Promise.all([submissions(cik), getJson(`${DATA_URL}/api/xbrl/companyfacts/CIK${cik}.json`, "companyfacts")]);
      const result = mapSecFinancials(facts, listFilings(subs), cik);
      await reconcile(cik, facts, [result.annual, ...result.quarters].filter(Boolean), result.notes);
      return result;
    },
  };
}
