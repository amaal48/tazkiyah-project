// src/screening/providers/secFmp.js
//
// Modus "sec_fmp" (SCREENING_FUNDAMENTALS_PROVIDER), nur für Entwicklung und Vergleich:
// Bilanz- und Umsatzzahlen von der SEC (./sec.js), nur Kurs und daraus die
// Marktkapitalisierung von FMP (Schlusskurs am Stichtag × Aktienzahl der SEC).
// Profil: FMP-Profil, ergänzt um SIC-Code und CIK der SEC. A1 läuft auch hier über den SIC-Code
// (nicht über die FMP-Branche), damit "sec" und "sec_fmp" gleich prüfen.
//
// FMP-Abrufe je Titel: 2 (Profil, Kursverlauf); dazu 1 je Lauf für EUR/USD.
// Das Tagesbudget zählt nur diese FMP-Abrufe (usageKey "fmp"). SEC-Abrufe werden
// gedrosselt, aber nicht gegen das Budget gezählt (getCallCount).

import { pickPriceAt } from "./fmp.js";

function shiftDays(iso, d) {
  const x = new Date(iso);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

/** Kurs und Marktkapitalisierung aus FMP-Kursen in SEC-Perioden eintragen (ohne Netzwerk, testbar). */
export function applyFmpPrices(snapshots, priceHistory) {
  for (const s of snapshots) {
    if (!s?.periodEnd || !s.sharesOutstanding) continue;
    const price = pickPriceAt(priceHistory, s.periodEnd);
    if (price === null) continue;
    s.priceAtPeriodEnd = price;
    s.marketCapAtPeriodEnd = price * s.sharesOutstanding;
    s.marketCapSource = s.sharesBasis === "period_end" ? "price_x_period_end_shares" : "price_x_cover_page_shares";
  }
}

export const PRICE_PENDING_NOTE = "Kurs noch nicht abgerufen (FMP-Tagesbudget aufgebraucht), wird nachgeholt";

/**
 * Variante ohne FMP-Abrufe für den Fall, dass das FMP-Tagesbudget aufgebraucht ist: Zahlen und Profil
 * nur von der SEC, kein Kurs → B1/B2 „nicht geprüft“ mit Vermerk. Jede Periode trägt priceStatus "pending";
 * der Runner merkt den Titel für den Kursabruf vor (inputs.pricesPending).
 */
export function createSecOnlyFallback(sec) {
  return {
    id: "sec_fmp", // gleiche Prüfung wie sec_fmp (A1 über SIC); der Kurs fehlt nur vorübergehend
    usageKey: "fmp",
    callsPerTitle: 0,
    pricesPending: true,
    async getProfile(symbol) {
      const s = await sec.getProfile(symbol);
      return s ? { ...s, profileSource: "sec" } : null;
    },
    async getFinancialPeriods(symbol) {
      const periods = await sec.getFinancialPeriods(symbol);
      for (const s of [periods.annual, ...periods.quarters].filter(Boolean)) s.priceStatus = "pending";
      return { ...periods, notes: [...(periods.notes || []), PRICE_PENDING_NOTE] };
    },
  };
}

export function createSecFmpProvider({ sec, fmp }) {
  return {
    id: "sec_fmp",
    /** Ohne FMP-Budget weiter mit SEC-Daten (Kurs wird später nachgeholt). */
    withoutBudget: () => createSecOnlyFallback(sec),
    usageKey: "fmp",
    callsPerTitle: 2,
    getCallCount: () => sec.getCallCount?.() ?? null,
    getFxToEurSeries: (opts) => fmp.getFxToEurSeries(opts),

    async getProfile(symbol) {
      // Liefert FMP kein Profil (z. B. Fehler 402 im Free-Tarif), mit dem SEC-Profil weiter: A1 läuft
      // ohnehin über den SIC-Code. Nur „Limit erreicht“ bricht ab (Titel beim nächsten Lauf erneut).
      const [f, s] = await Promise.all([
        fmp.getProfile(symbol).catch((err) => {
          if (err?.kind === "limit") throw err;
          return null;
        }),
        sec.getProfile(symbol).catch(() => null),
      ]);
      if (!f) return s ? { ...s, profileSource: "sec" } : null;
      return { ...f, cik: f.cik || s?.cik || null, sic: s?.sic ?? null, sicDescription: s?.sicDescription ?? null, fiscalYearEnd: s?.fiscalYearEnd ?? null };
    },

    async getFinancialPeriods(symbol) {
      const periods = await sec.getFinancialPeriods(symbol);
      const snaps = [periods.annual, ...periods.quarters].filter(Boolean);
      const dates = snaps.map((s) => s.periodEnd).sort();
      const notes = [...(periods.notes || [])];
      if (dates.length) {
        try {
          const history = await fmp.getPriceHistory(symbol, { from: shiftDays(dates[0], -10), to: dates[dates.length - 1] });
          applyFmpPrices(snaps, history);
        } catch (err) {
          if (err?.kind === "limit") throw err;
          notes.push("Kursverlauf von FMP nicht verfügbar");
        }
      }
      return { ...periods, notes };
    },
  };
}
