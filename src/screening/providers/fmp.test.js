// src/screening/providers/fmp.test.js — ausführen mit: node --test src/screening/providers/fmp.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFmpProvider, classifyFmpError, mapFmpPeriod, pickPriceAt, applyLeaseEstimate } from "./fmp.js";

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

/** Simuliert FMP: Antworten je Pfad und Periode, zählt Abrufe. */
function fakeFetch(rules) {
  const calls = [];
  const impl = async (url) => {
    const u = new URL(url);
    const key = `${u.pathname.split("/").pop()}${u.searchParams.get("period") ? ":" + u.searchParams.get("period") : ""}`;
    calls.push(key);
    const rule = rules[key] ?? rules["*"];
    return typeof rule === "function" ? rule(u) : rule;
  };
  return { impl, calls };
}

const balance = (date) => ({ date, totalAssets: 1000, cashAndCashEquivalents: 50, netReceivables: 100, goodwill: 0, reportedCurrency: "USD" });
const income = (date) => ({ date, revenue: 400, interestIncome: 4, netIncome: 20 });
const cash = (date) => ({ date, commonDividendsPaid: -5 });

test("Fehlerarten werden erkannt", () => {
  assert.equal(classifyFmpError(429, ""), "limit");
  assert.equal(classifyFmpError(200, "Limit Reach . Please upgrade your plan"), "limit");
  assert.equal(classifyFmpError(402, ""), "premium");
  assert.equal(classifyFmpError(403, "Exclusive Endpoint"), "premium");
  assert.equal(classifyFmpError(404, ""), "other");
});

test("„Limit Reach“ mit Status 200 wird als Limit-Fehler gemeldet", async () => {
  const { impl } = fakeFetch({ "*": json(200, { "Error Message": "Limit Reach . Please upgrade your plan" }) });
  const p = createFmpProvider({ apiKey: "k", fetchImpl: impl });
  await assert.rejects(() => p.getProfile("AAPL"), (err) => err.kind === "limit");
});

test("Quartale und Kursverlauf gesperrt: Jahreswerte kommen, Sperre wird gemerkt", async () => {
  const premium = json(402, { "Error Message": "Premium Query Parameter: this value set for 'period' is not available under your current subscription" });
  const { impl, calls } = fakeFetch({
    "balance-sheet-statement:annual": json(200, [balance("2025-09-27")]),
    "income-statement:annual": json(200, [income("2025-09-27")]),
    "cash-flow-statement:annual": json(200, [cash("2025-09-27")]),
    "balance-sheet-statement:quarter": premium,
    "income-statement:quarter": premium,
    "cash-flow-statement:quarter": premium,
    light: json(402, { "Error Message": "Special Endpoint : this endpoint is not available under your current subscription" }),
  });
  const p = createFmpProvider({ apiKey: "k", fetchImpl: impl });
  const r1 = await p.getFinancialPeriods("AAPL");
  assert.equal(r1.annual.periodEnd, "2025-09-27");
  assert.deepEqual(r1.quarters, []);
  assert.equal(r1.notes.length, 2);
  assert.equal(r1.annual.marketCapAtPeriodEnd, null); // ohne Kurs keine Marktkapitalisierung → B1/B2 „nicht geprüft“
  const firstCount = calls.length; // 3 Jahr + 1 Quartal + 1 Kursverlauf
  assert.equal(firstCount, 5);
  // Zweiter Titel: gesperrte Daten werden nicht mehr abgefragt
  const r2 = await p.getFinancialPeriods("MSFT");
  assert.equal(calls.length - firstCount, 3);
  assert.equal(r2.notes.length, 2);
});

test("Limit während der Quartale bricht ab (kein stilles Weiterrechnen)", async () => {
  const { impl } = fakeFetch({
    "balance-sheet-statement:annual": json(200, [balance("2025-09-27")]),
    "income-statement:annual": json(200, [income("2025-09-27")]),
    "cash-flow-statement:annual": json(200, [cash("2025-09-27")]),
    "*": json(429, { "Error Message": "Limit Reach" }),
  });
  const p = createFmpProvider({ apiKey: "k", fetchImpl: impl });
  await assert.rejects(() => p.getFinancialPeriods("AAPL"), (err) => err.kind === "limit");
});

test("Marktkapitalisierung aus Schlusskurs × Aktienzahl, Stichtag am Samstag → letzter Handelstag", () => {
  const priceHistory = [
    { date: "2025-09-29", price: 254.43 },
    { date: "2025-09-26", price: 255.46 },
    { date: "2025-09-25", price: 256.87 },
  ];
  const s = mapFmpPeriod({
    balance: balance("2025-09-27"),
    income: { ...income("2025-09-27"), weightedAverageShsOut: 14_900_000_000 },
    cashflow: cash("2025-09-27"),
    priceHistory,
    periodType: "annual",
  });
  assert.equal(s.priceAtPeriodEnd, 255.46);
  assert.equal(s.marketCapAtPeriodEnd, 255.46 * 14_900_000_000);
  assert.equal(s.marketCapSource, "price_x_weighted_avg_shares");
});

test("Marktkapitalisierung vom Anbieter hat Vorrang vor der Näherung", () => {
  const s = mapFmpPeriod({
    balance: balance("2025-09-27"),
    income: { ...income("2025-09-27"), weightedAverageShsOut: 10 },
    cashflow: cash("2025-09-27"),
    marketCapHistory: [{ date: "2025-09-26", marketCap: 5000 }],
    priceHistory: [{ date: "2025-09-26", price: 1 }],
    periodType: "annual",
  });
  assert.equal(s.marketCapAtPeriodEnd, 5000);
  assert.equal(s.marketCapSource, null);
});

test("Kurs zu weit vom Stichtag entfernt oder Aktienzahl fehlt → unbekannt statt geraten", () => {
  assert.equal(pickPriceAt([{ date: "2025-09-10", price: 200 }], "2025-09-27"), null);
  const s = mapFmpPeriod({
    balance: balance("2025-09-27"),
    income: income("2025-09-27"), // ohne weightedAverageShsOut
    cashflow: cash("2025-09-27"),
    priceHistory: [{ date: "2025-09-26", price: 255.46 }],
    periodType: "annual",
  });
  assert.equal(s.marketCapAtPeriodEnd, null);
});

// ------------------------------------------------ Aktienzahl und Leasing

test("Aktienzahl am Periodenende hat Vorrang vor dem Durchschnitt", () => {
  const s = mapFmpPeriod({
    balance: balance("2025-09-27"),
    income: { ...income("2025-09-27"), weightedAverageShsOut: 15_000 },
    cashflow: cash("2025-09-27"),
    priceHistory: [{ date: "2025-09-26", price: 10 }],
    sharesAtPeriodEnd: 14_800,
    periodType: "annual",
  });
  assert.equal(s.sharesBasis, "period_end");
  assert.equal(s.marketCapAtPeriodEnd, 148_000);
  assert.equal(s.marketCapSource, "price_x_period_end_shares");
});

function period(date, type, over) {
  return mapFmpPeriod({
    balance: { date, totalAssets: 1000, cashAndCashEquivalents: 50, ...over },
    income: income(date),
    cashflow: cash(date),
    periodType: type,
  });
}

const annualApple = () =>
  period("2025-09-27", "annual", { shortTermDebt: 20, longTermDebt: 80, capitalLeaseObligationsCurrent: 2, capitalLeaseObligationsNonCurrent: 11, totalDebt: 113 });
const quarterNoLease = () => period("2026-06-27", "quarter", { shortTermDebt: 15, longTermDebt: 70, capitalLeaseObligationsCurrent: 0, capitalLeaseObligationsNonCurrent: 0, totalDebt: 85 });

test("Leasing im Quartal nicht ausgewiesen: Jahreswert wird übernommen und gekennzeichnet", () => {
  const annual = annualApple();
  assert.equal(annual.balance.leaseLiabilities, 13);
  assert.equal(annual.balance.leaseSeparateFromDebt, true);
  const q = quarterNoLease();
  applyLeaseEstimate(annual, [q]);
  assert.equal(q.balance.leaseLiabilities, 13);
  assert.deepEqual(q.balance.leaseEstimate, { source: "annual", periodEnd: "2025-09-27", amount: 13 });
});

test("Keine Ergänzung: Quartal weist Leasing aus, Anbieter liefert Schulden inkl. Leasing, Jahreswert 0", () => {
  const withLease = period("2026-06-27", "quarter", { shortTermDebt: 15, longTermDebt: 70, capitalLeaseObligationsCurrent: 3, capitalLeaseObligationsNonCurrent: 6, totalDebt: 94 });
  applyLeaseEstimate(annualApple(), [withLease]);
  assert.equal(withLease.balance.leaseLiabilities, 9);
  assert.equal(withLease.balance.leaseEstimate, null);

  const q1 = quarterNoLease();
  applyLeaseEstimate(annualApple(), [q1], { debtFieldsIncludeLeases: true });
  assert.equal(q1.balance.leaseLiabilities, 0);

  const noLeaseAnnual = period("2025-09-27", "annual", { shortTermDebt: 20, longTermDebt: 80, capitalLeaseObligationsCurrent: 0, capitalLeaseObligationsNonCurrent: 0, totalDebt: 100 });
  const q2 = quarterNoLease();
  applyLeaseEstimate(noLeaseAnnual, [q2]);
  assert.equal(q2.balance.leaseEstimate, null);
});

test("Doppelzählung vermeiden: Jahresabschluss zeigt Leasing erkennbar innerhalb der Schuldenposten", () => {
  // Leasing 13 ausgewiesen, aber totalDebt = nur Schuldenposten → vermutlich dort enthalten
  const annual = period("2025-09-27", "annual", { shortTermDebt: 20, longTermDebt: 80, capitalLeaseObligations: 13, totalDebt: 100 });
  assert.equal(annual.balance.leaseSeparateFromDebt, false);
  const q = quarterNoLease();
  applyLeaseEstimate(annual, [q]);
  assert.equal(q.balance.leaseEstimate, null);
  assert.equal(q.balance.leaseLiabilities, 0);
});

test("Nicht erkennbar, ob getrennt (kein totalDebt): Ergänzung wird gemacht und gekennzeichnet", () => {
  const annual = period("2025-09-27", "annual", { shortTermDebt: 20, longTermDebt: 80, capitalLeaseObligations: 13 });
  assert.equal(annual.balance.leaseSeparateFromDebt, null);
  const q = quarterNoLease();
  applyLeaseEstimate(annual, [q]);
  assert.equal(q.balance.leaseEstimate.amount, 13);
});

test("Zinserträge = 0 von FMP gelten nur ohne Cash und Anlagen als 0, sonst null (08.10.2026)", () => {
  const map = (inc, bal) => mapFmpPeriod({ balance: { date: "2025-09-27", ...bal }, income: { date: "2025-09-27", revenue: 400, ...inc }, periodType: "annual" });
  // AAPL-Fall: 0 Zinserträge, aber Cash und Wertpapiere → null (B3 nicht geprüft bzw. Anhang)
  assert.equal(map({ interestIncome: 0 }, { cashAndCashEquivalents: 35934, shortTermInvestments: 18763 }).income.interestIncome, null);
  assert.equal(map({ interestIncome: 0 }, { longTermInvestments: 5 }).income.interestIncome, null);
  // Keine Anlagen: 0 bleibt 0
  assert.equal(map({ interestIncome: 0 }, { cashAndCashEquivalents: 0, shortTermInvestments: 0, longTermInvestments: 0 }).income.interestIncome, 0);
  // Positiver Wert bleibt unverändert
  assert.equal(map({ interestIncome: 3301 }, { cashAndCashEquivalents: 20935 }).income.interestIncome, 3301);
});
