// src/screening/providers/fmp.test.js — ausführen mit: node --test src/screening/providers/fmp.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFmpProvider, classifyFmpError } from "./fmp.js";

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

test("Quartale und Marktkapitalisierung gesperrt: Jahreswerte kommen, Sperre wird gemerkt", async () => {
  const premium = json(402, { "Error Message": "Premium Query Parameter: this value set for 'period' is not available under your current subscription" });
  const { impl, calls } = fakeFetch({
    "balance-sheet-statement:annual": json(200, [balance("2025-09-27")]),
    "income-statement:annual": json(200, [income("2025-09-27")]),
    "cash-flow-statement:annual": json(200, [cash("2025-09-27")]),
    "balance-sheet-statement:quarter": premium,
    "income-statement:quarter": premium,
    "cash-flow-statement:quarter": premium,
    "historical-market-capitalization": json(402, { "Error Message": "Special Endpoint : this endpoint is not available under your current subscription" }),
  });
  const p = createFmpProvider({ apiKey: "k", fetchImpl: impl });
  const r1 = await p.getFinancialPeriods("AAPL");
  assert.equal(r1.annual.periodEnd, "2025-09-27");
  assert.deepEqual(r1.quarters, []);
  assert.equal(r1.notes.length, 2);
  assert.equal(r1.annual.marketCapAtPeriodEnd, null); // → B1/B2 „nicht geprüft“
  const firstCount = calls.length; // 3 Jahr + 1 Quartal + 1 Marktkap.
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
