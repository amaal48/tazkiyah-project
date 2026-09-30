// src/screening/providers/fmp.js
//
// Adapter für Financial Modeling Prep (Stable API). Übersetzt FMP-Antworten
// ins neutrale Modell aus ./model.js. Nur diese Datei kennt FMP-Feldnamen.
//
// Tarif: Free-Tarif für Entwicklung/Test. Vor dem öffentlichen Launch Tarif
// mit Erlaubnis zu öffentlicher Anzeige und kommerzieller Nutzung wählen.
// Ein Wechsel von Tarif oder Anbieter berührt die Engine nicht.
//
// Zusätzlich 1 Abruf pro Durchlauf für den EUR/USD-Kurs (getFxToEurSeries).
// Abrufe pro Titel: 7 (Profil, Bilanz/GuV/Cashflow je Jahr + Quartal,
// historische Marktkapitalisierung). Free-Tarif: 250/Tag → ca. 35 Titel/Tag.
// Der Runner muss deshalb gestaffelt arbeiten (nur Titel mit neuem Abschluss
// bzw. ohne aktuelles Ergebnis).
//
// ZU VERIFIZIEREN, bevor Ergebnisse veröffentlicht werden:
//   1. Enthalten FMPs shortTermDebt/longTermDebt bereits Leasingverbindlich-
//      keiten? Einstellung unten: debtFieldsIncludeLeases. Standard false →
//      Leasing wird addiert. Stimmt das nicht, wird Leasing doppelt gezählt
//      (zu streng). An 2–3 Unternehmen gegen den 10-K prüfen.
//   2. Liefert FMP interestIncome = 0, wenn es nicht gesondert ausgewiesen
//      ist? Dann wäre 0 nicht „ausdrücklich null“. Stichprobe gegen 10-K.
//   3. Sonstige Erträge (für den B3-Nenner „Gesamteinnahmen“): FMP liefert
//      nur einen Saldo (nonOperatingIncomeExcludingInterest), der Aufwendungen
//      enthalten kann. Positiver Saldo → sonstige Erträge, negativer → 0.
//      Gegen den 10-K prüfen, ob das die Bruttoerträge ausreichend abbildet.
//   4. Anzahl Aktien: FMP liefert hier den gewichteten Durchschnitt der
//      Periode, nicht den Bestand zum Stichtag. Wird in der Ausgabe als
//      sharesBasis angezeigt.

import { emptySnapshot, num } from "./model.js";

const BASE_URL = "https://financialmodelingprep.com/stable";

function firstNum(obj, keys) {
  for (const k of keys) {
    const v = num(obj?.[k]);
    if (v !== null) return v;
  }
  return null;
}

function sumOrNull(...vals) {
  if (vals.some((v) => v === null)) return null;
  return vals.reduce((a, b) => a + b, 0);
}

/** Marktkapitalisierung zum Stichtag: letzter Wert am oder vor periodEnd. */
export function pickMarketCapAt(history, periodEnd) {
  if (!Array.isArray(history)) return null;
  const candidates = history
    .filter((h) => h?.date && h.date <= periodEnd && num(h.marketCap) !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const hit = candidates[0];
  if (!hit) return null;
  // Mehr als 7 Tage Abstand (Wochenende/Feiertage) → lieber „unbekannt“.
  const gapDays = (new Date(periodEnd) - new Date(hit.date)) / 86400000;
  return gapDays <= 7 ? num(hit.marketCap) : null;
}

/** Reine Übersetzungsfunktion — ohne Netzwerk, daher testbar. */
export function mapFmpPeriod({ balance, income, cashflow, marketCapHistory, periodType, options = {} }) {
  const { debtFieldsIncludeLeases = false } = options;
  const s = emptySnapshot(periodType, balance?.date ?? null);

  s.filingDate = balance?.filingDate ?? balance?.fillingDate ?? null;
  s.audited = periodType === "annual" ? true : false;
  s.currency = balance?.reportedCurrency ?? null;
  s.marketCapAtPeriodEnd = s.periodEnd ? pickMarketCapAt(marketCapHistory, s.periodEnd) : null;
  s.sharesOutstanding = firstNum(income, ["weightedAverageShsOut"]);
  s.sharesBasis = s.sharesOutstanding !== null ? "weighted_average" : null;
  if (s.marketCapAtPeriodEnd !== null && s.sharesOutstanding) {
    s.priceAtPeriodEnd = s.marketCapAtPeriodEnd / s.sharesOutstanding;
  }

  const shortDebt = firstNum(balance, ["shortTermDebt"]);
  const longDebt = firstNum(balance, ["longTermDebt"]);
  const leaseCurrent = firstNum(balance, ["capitalLeaseObligationsCurrent"]);
  const leaseNonCurrent = firstNum(balance, ["capitalLeaseObligationsNonCurrent"]);
  const leaseTotal =
    leaseCurrent !== null || leaseNonCurrent !== null
      ? (leaseCurrent ?? 0) + (leaseNonCurrent ?? 0)
      : firstNum(balance, ["capitalLeaseObligations"]);

  const debt = sumOrNull(shortDebt, longDebt);
  s.balance.leaseLiabilities = leaseTotal;
  s.balance.interestBearingDebtExLeases =
    debt === null ? null : debtFieldsIncludeLeases && leaseTotal !== null ? debt - leaseTotal : debt;

  s.balance.cash = firstNum(balance, ["cashAndCashEquivalents"]);
  s.balance.shortTermInvestments = firstNum(balance, ["shortTermInvestments"]);
  s.balance.longTermInvestments = firstNum(balance, ["longTermInvestments"]);
  s.balance.netReceivables = firstNum(balance, ["netReceivables"]);
  s.balance.inventory = firstNum(balance, ["inventory"]);
  s.balance.goodwill = firstNum(balance, ["goodwill"]);
  s.balance.intangiblesExGoodwill = firstNum(balance, ["intangibleAssets"]);
  s.balance.totalAssets = firstNum(balance, ["totalAssets"]);
  s.balance.currentLiabilities = firstNum(balance, ["totalCurrentLiabilities"]);

  s.income.revenue = firstNum(income, ["revenue"]);
  s.income.interestIncome = firstNum(income, ["interestIncome"]);
  const other = firstNum(income, ["nonOperatingIncomeExcludingInterest"]);
  s.income.otherIncome = other === null ? null : Math.max(0, other);
  s.income.netIncome = firstNum(income, ["netIncome"]);
  const div = firstNum(cashflow, ["commonDividendsPaid", "netDividendsPaid", "dividendsPaid"]);
  s.income.distributions = div === null ? null : Math.abs(div);

  return s;
}

export function mapFmpProfile(p) {
  if (!p) return null;
  return {
    symbol: p.symbol ?? null,
    name: p.companyName ?? null,
    isin: p.isin || null,
    industry: p.industry ?? null,
    sector: p.sector ?? null,
    description: p.description ?? null,
    currency: p.currency ?? null,
  };
}

export function createFmpProvider({ apiKey, fetchImpl = fetch, options = {} } = {}) {
  if (!apiKey) throw new Error("FMP_API_KEY fehlt");

  async function get(path, params) {
    const qs = new URLSearchParams({ ...params, apikey: apiKey });
    const res = await fetchImpl(`${BASE_URL}/${path}?${qs}`);
    if (!res.ok) throw new Error(`FMP ${path} ${res.status}`);
    const data = await res.json();
    if (data && !Array.isArray(data) && data["Error Message"]) {
      throw new Error(`FMP ${path}: ${data["Error Message"]}`);
    }
    return data;
  }

  return {
    id: "fmp",

    /** EUR je USD für die letzten `days` Tage (1 Abruf). Für EUR-Beträge der Purification. */
    async getFxToEurSeries({ days = 800 } = {}) {
      const to = new Date().toISOString().slice(0, 10);
      const data = await get("historical-price-eod/light", { symbol: "EURUSD", from: shiftDays(to, -days), to });
      const series = (Array.isArray(data) ? data : [])
        .filter((d) => d?.date && num(d.price) > 0)
        .map((d) => ({ date: d.date, eurPerUnit: 1 / num(d.price) }));
      return { currency: "USD", series };
    },

    async getProfile(symbol) {
      const data = await get("profile", { symbol });
      return mapFmpProfile(Array.isArray(data) ? data[0] : null);
    },

    async getFinancialPeriods(symbol) {
      const [bA, iA, cA, bQ, iQ, cQ] = await Promise.all([
        get("balance-sheet-statement", { symbol, period: "annual", limit: 1 }),
        get("income-statement", { symbol, period: "annual", limit: 1 }),
        get("cash-flow-statement", { symbol, period: "annual", limit: 1 }),
        get("balance-sheet-statement", { symbol, period: "quarter", limit: 4 }),
        get("income-statement", { symbol, period: "quarter", limit: 4 }),
        get("cash-flow-statement", { symbol, period: "quarter", limit: 4 }),
      ]);

      const dates = [bA?.[0]?.date, ...(bQ || []).map((b) => b.date)].filter(Boolean).sort();
      const mcHistory = dates.length
        ? await get("historical-market-capitalization", {
            symbol,
            from: shiftDays(dates[0], -10),
            to: dates[dates.length - 1],
          })
        : [];

      const byDate = (arr, date) => (arr || []).find((x) => x.date === date) || null;

      const annual = bA?.[0]
        ? mapFmpPeriod({
            balance: bA[0],
            income: byDate(iA, bA[0].date),
            cashflow: byDate(cA, bA[0].date),
            marketCapHistory: mcHistory,
            periodType: "annual",
            options,
          })
        : null;

      const quarters = (bQ || [])
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 4)
        .map((b) =>
          mapFmpPeriod({
            balance: b,
            income: byDate(iQ, b.date),
            cashflow: byDate(cQ, b.date),
            marketCapHistory: mcHistory,
            periodType: "quarter",
            options,
          })
        );

      return { annual, quarters };
    },
  };
}

function shiftDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
