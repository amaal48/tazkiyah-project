// src/screening/providers/model.js
//
// Anbieterneutrales Datenmodell. Die Engine kennt NUR dieses Format — nie die
// Rohantworten eines Anbieters. Ein Anbieterwechsel (anderer FMP-Tarif, anderer
// Anbieter) heißt: neuen Adapter schreiben, der dieses Format liefert. Die
// Engine bleibt unverändert.
//
// Konvention für alle Zahlen:
//   number — vom Anbieter geliefert (0 = ausdrücklich null)
//   null   — unbekannt / nicht geliefert → betroffene Prüfung wird „nicht geprüft“
//
// Ein Adapter implementiert:
//
//   {
//     id: "fmp",
//     getProfile(symbol)          → Promise<Profile | null>
//     getFinancialPeriods(symbol) → Promise<{ annual: Snapshot|null, quarters: Snapshot[] }>
//                                   (quarters: neuestes zuerst, max. 4)
//   }

/**
 * @typedef {Object} Profile
 * @property {string} symbol
 * @property {string|null} name
 * @property {string|null} isin
 * @property {string|null} industry
 * @property {string|null} sector
 * @property {string|null} description
 * @property {string|null} currency
 * Optional (SEC-Adapter, ./sec.js):
 * @property {string|null} [cik]             10-stellig, z. B. "0000320193"
 * @property {string|null} [sic]             SIC-Code der SEC, z. B. "3571"
 * @property {string|null} [sicDescription]  z. B. "Electronic Computers"
 * @property {string|null} [fiscalYearEnd]   Geschäftsjahresende "MM-TT"
 */

/**
 * @typedef {Object} Snapshot  Ein Abschluss (Jahr oder Quartal)
 * @property {"annual"|"quarter"} periodType
 * @property {string} periodEnd                 ISO-Datum, Ende der Finanzperiode
 * @property {string|null} filingDate          Veröffentlichungsdatum
 * @property {boolean|null} audited             Jahresabschluss testiert?
 * @property {string|null} currency             Berichtswährung
 * @property {number|null} marketCapAtPeriodEnd Marktkapitalisierung zum Stichtag
 * @property {number|null} priceAtPeriodEnd     Schlusskurs zum Stichtag
 * @property {string|null}  marketCapSource      null = vom Anbieter geliefert; "price_x_weighted_avg_shares" = aus Kurs und Aktienzahl gebildet (Näherung)
 * @property {number|null} fxToEurAtPeriodEnd   1 Einheit Berichtswährung in EUR am Stichtag
 * @property {number|null} sharesOutstanding
 * @property {string|null} sharesBasis          z. B. "weighted_average", "period_end", "cover_page" — wird angezeigt
 * @property {Object} balance
 * @property {number|null} balance.interestBearingDebtExLeases  kurz- + langfristige Finanzschulden ohne Leasing
 * @property {number|null} balance.leaseLiabilities
 * @property {number|null} balance.cash
 * @property {number|null} balance.shortTermInvestments
 * @property {number|null} balance.longTermInvestments
 * @property {number|null} balance.nonInterestBearingCashConfirmed  belegt unverzinste Mittel (sonst null)
 * @property {number|null} balance.explicitInterestBearingDeposits  nur für die Alternative zu allCashInterestBearing
 * @property {number|null} balance.netReceivables
 * @property {number|null} balance.inventory
 * @property {number|null} balance.goodwill
 * @property {number|null} balance.intangiblesExGoodwill
 * @property {number|null} balance.totalAssets
 * @property {number|null} balance.currentLiabilities
 * @property {Object} income
 * @property {number|null} income.revenue
 * @property {number|null} income.interestIncome
 * @property {number|null} income.otherIncome    sonstige Erträge ohne Zinsen (≥ 0), für die Gesamteinnahmen
 * @property {number|null} income.netIncome
 * @property {number|null} income.distributions  Ausschüttungen der Periode (positiv)
 * Optional (SEC-Adapter, ./sec.js; fehlen bei anderen Anbietern):
 * @property {string|null} [sharesAsOf]   Datum der Aktienzahl (bei sharesBasis "cover_page" nach dem Stichtag)
 * @property {Object|null} [sourceFiling] Fundstelle der Periode:
 *   { accessionNumber, form, filingDate, reportDate, url } (url = Einreichung im EDGAR-Archiv)
 * @property {Object} [sourceConcepts]    je Feld das verwendete Konzept:
 *   { [feld]: { concept, accn, form, filed, derived?, classesSummed? } }
 *   derived = "abgeleitet aus Jahres- und Quartalswerten" (viertes Quartal)
 */

export function emptySnapshot(periodType, periodEnd) {
  return {
    periodType,
    periodEnd,
    filingDate: null,
    audited: null,
    currency: null,
    marketCapAtPeriodEnd: null,
    priceAtPeriodEnd: null,
    marketCapSource: null,
    fxToEurAtPeriodEnd: null,
    sharesOutstanding: null,
    sharesBasis: null,
    balance: {
      interestBearingDebtExLeases: null,
      leaseLiabilities: null,
      leaseSeparateFromDebt: null,
      leaseEstimate: null,
      cash: null,
      shortTermInvestments: null,
      longTermInvestments: null,
      nonInterestBearingCashConfirmed: null,
      explicitInterestBearingDeposits: null,
      netReceivables: null,
      inventory: null,
      goodwill: null,
      intangiblesExGoodwill: null,
      totalAssets: null,
      currentLiabilities: null,
    },
    income: {
      revenue: null,
      interestIncome: null,
      otherIncome: null,
      netIncome: null,
      distributions: null,
    },
  };
}

/** Zahl oder null — wandelt undefined, NaN, Strings sicher um. */
export function num(x) {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}
