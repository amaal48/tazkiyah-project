// src/screening/engine.test.js — ausführen mit: node --test src/screening/
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenSecurity, STATUS, RESULT } from "./engine.js";
import { emptySnapshot } from "./providers/model.js";
import { mapFmpPeriod, pickMarketCapAt } from "./providers/fmp.js";

const ANNUAL_END = "2025-12-31";
const Q_ENDS = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"];

function snap(type, end, over = {}) {
  const s = emptySnapshot(type, end);
  Object.assign(s, {
    currency: "USD",
    marketCapAtPeriodEnd: 1000,
    priceAtPeriodEnd: 100,
    fxToEurAtPeriodEnd: 0.9,
    sharesOutstanding: 10,
    sharesBasis: "weighted_average",
  });
  Object.assign(s.balance, {
    interestBearingDebtExLeases: 100,
    leaseLiabilities: 20,
    cash: 50,
    shortTermInvestments: 30,
    longTermInvestments: 20,
    netReceivables: 100,
    inventory: 50,
    goodwill: 100,
    intangiblesExGoodwill: 50,
    totalAssets: 1000,
    currentLiabilities: 80,
  });
  Object.assign(s.income, { revenue: type === "annual" ? 400 : 100, interestIncome: type === "annual" ? 4 : 1, otherIncome: 0, netIncome: 20, distributions: 5 });
  if (over.balance) Object.assign(s.balance, over.balance);
  if (over.income) Object.assign(s.income, over.income);
  for (const [k, v] of Object.entries(over)) if (k !== "balance" && k !== "income") s[k] = v;
  return s;
}

const validReviews = [
  { criterion: "A2", result: "pass", reviewer: "A.", reviewedAt: "2026-03-01", basisAnnualPeriodEnd: ANNUAL_END, sourceUrl: "https://example.com/10k" },
  { criterion: "B3_SEGMENTS", result: "pass", reviewer: "A.", reviewedAt: "2026-03-01", basisAnnualPeriodEnd: ANNUAL_END, sourceUrl: "https://example.com/10k" },
];

function base(over = {}) {
  return {
    security: { ticker: "TEST", isin: "US0000000001", assetType: "stock", productType: "standard", shareClass: "common", germanVenues: ["XETRA"], universeCheckedAt: "2026-09-01" },
    profile: { industry: "Software - Infrastructure" },
    annual: snap("annual", ANNUAL_END),
    quarters: Q_ENDS.map((d) => snap("quarter", d)),
    manualReviews: validReviews,
    now: new Date("2026-09-30T00:00:00Z"),
    ...over,
  };
}

const crit = (r, id) => r.criteria.find((c) => c.id === id);

test("sauberer Titel mit gültigen Prüfungen ist konform", () => {
  const r = screenSecurity(base());
  assert.equal(r.status, STATUS.CONFORM);
  assert.equal(r.statusLabel, "konform nach AAOIFI SS 21");
  assert.equal(r.universe.included, true);
});

test("B1 zählt Leasing mit und prüft Jahr und Quartal", () => {
  const r = screenSecurity(base());
  const b1 = crit(r, "B1");
  assert.equal(b1.checks.length, 2);
  assert.equal(b1.checks[0].value, 12); // (100 + 20) / 1000
  assert.equal(b1.checks[0].distanceToLimit, 18);
});

test("Quartal über 30 % reicht für nicht konform, auch wenn Jahr ok", () => {
  const qs = Q_ENDS.map((d, i) => snap("quarter", d, i === 0 ? { balance: { interestBearingDebtExLeases: 300 } } : {}));
  const r = screenSecurity(base({ quarters: qs }));
  assert.equal(crit(r, "B1").result, RESULT.FAIL);
  assert.equal(r.status, STATUS.NON_CONFORM);
});

test("fehlende A2-Prüfung → nicht geprüft, nie konform", () => {
  const r = screenSecurity(base({ manualReviews: validReviews.filter((x) => x.criterion !== "A2") }));
  assert.equal(crit(r, "A2").result, RESULT.NOT_CHECKED);
  assert.equal(r.status, STATUS.NOT_CHECKED);
});

test("Durchfallen schlägt fehlende Daten (Rangfolge)", () => {
  const r = screenSecurity(base({ profile: { industry: "Banks - Regional" }, manualReviews: [] }));
  assert.equal(crit(r, "A1").result, RESULT.FAIL);
  assert.equal(r.status, STATUS.NON_CONFORM);
  // weitere Stufen trotzdem berechnet
  assert.ok(crit(r, "B1").checks.length > 0);
});

test("manuelle Prüfung läuft bei neuem Jahresabschluss ab", () => {
  const r = screenSecurity(base({ annual: snap("annual", "2026-12-31") }));
  assert.equal(crit(r, "A2").result, RESULT.NOT_CHECKED);
  assert.equal(crit(r, "A2").review.state, "expired");
});

test("B3: fehlende Zinserträge → nicht geprüft", () => {
  const qs = Q_ENDS.map((d, i) => snap("quarter", d, i === 2 ? { income: { interestIncome: null } } : {}));
  const r = screenSecurity(base({ quarters: qs }));
  assert.equal(crit(r, "B3").result, RESULT.NOT_CHECKED);
});

test("B3: verbotene Segmente werden addiert und können durchfallen lassen", () => {
  const reviews = [
    validReviews[0],
    { criterion: "B3_SEGMENTS", result: "fail", reviewer: "A.", reviewedAt: "2026-03-01", basisAnnualPeriodEnd: ANNUAL_END, sourceUrl: "x",
      details: { prohibitedRevenueByPeriod: { [`annual:${ANNUAL_END}`]: 30, ...Object.fromEntries(Q_ENDS.map((d) => [`quarter:${d}`, 8])) } } },
  ];
  const r = screenSecurity(base({ manualReviews: reviews }));
  const b3 = crit(r, "B3");
  assert.equal(b3.checks[0].value, 8.42); // (4 + 30) / (400 + 4 + 0)
  assert.equal(b3.result, RESULT.FAIL);
});

test("C1: Goodwill zählt nicht, Forderungen zählen mit (SS 59), Schwelle 33,3 %", () => {
  const r = screenSecurity(base());
  // 1000 - 50 (Cash) - 30 - 20 (Anlagen) - 100 (Goodwill) = 800 → 80 %; Forderungen (100) bleiben drin
  assert.equal(crit(r, "C1").checks[0].value, 80);
  assert.ok(crit(r, "C1").parameterRefs.includes("operatingReceivablesCountAsReal"));
  const low = snap("annual", ANNUAL_END, { balance: { goodwill: 600 } }); // 1000-50-30-20-600 = 300 → 30 %
  const r2 = screenSecurity(base({ annual: low }));
  assert.equal(crit(r2, "C1").result, RESULT.FAIL);
});

test("C1: Hoher Forderungsanteil allein lässt C1 nicht mehr durchfallen", () => {
  const rec = (type, end) => snap(type, end, { balance: { netReceivables: 700, goodwill: 0, inventory: 0 } });
  const r = screenSecurity(base({ annual: rec("annual", ANNUAL_END), quarters: Q_ENDS.map((d) => rec("quarter", d)) }));
  // 1000 - 50 - 30 - 20 = 900 → 90 %, obwohl 70 % Forderungen sind
  assert.equal(crit(r, "C1").checks[0].value, 90);
  assert.equal(crit(r, "C1").result, RESULT.PASS);
});

test("C1: Alte Lesart (Forderungen abziehen) bleibt als Parameter möglich", () => {
  const r = screenSecurity(base({ parameters: { operatingReceivablesCountAsReal: false } }));
  assert.equal(crit(r, "C1").checks[0].value, 70);
});

test("C3: wird über C1 belegt (SS 21, 3/18; SS 59, 8/1, 8/3)", () => {
  assert.equal(crit(screenSecurity(base()), "C3").result, RESULT.PASS);
  // ohne Quartal ist C1 nicht belegbar → C3 ebenfalls nicht
  assert.equal(crit(screenSecurity(base({ quarters: [] })), "C3").result, RESULT.NOT_CHECKED);
  // C1 durchgefallen → C3 nicht belegt
  const low = snap("annual", ANNUAL_END, { balance: { goodwill: 600 } });
  assert.equal(crit(screenSecurity(base({ annual: low })), "C3").result, RESULT.NOT_CHECKED);
});

test("C2: SPAC ist ausgeschlossen", () => {
  const r = screenSecurity(base({ profile: { industry: "Shell Companies" } }));
  assert.equal(crit(r, "C2").result, RESULT.FAIL);
});

test("A3: Währungshändler wird ausgeschlossen", () => {
  const r = screenSecurity(base({ profile: { industry: "Currency Exchange Services" } }));
  assert.equal(crit(r, "A3").result, RESULT.FAIL);
});

test("A1: Prüfbranche ohne Prüfung → nicht geprüft", () => {
  const r = screenSecurity(base({ profile: { industry: "Electronic Gaming & Multimedia" } }));
  assert.equal(crit(r, "A1").result, RESULT.NOT_CHECKED);
});

test("Purification quartalsweise mit Stichtag und EUR", () => {
  const r = screenSecurity(base());
  const p0 = r.purification.periods[0];
  assert.equal(p0.periodEnd, "2026-06-30");
  assert.equal(p0.amountPerShare, 0.1); // 1 / 10
  assert.equal(p0.amountPerShareEur, 0.09);
  assert.equal(r.purification.periods.length, 4);
});

test("Zakat ohne Abzug, mit Abzug als Info, Fallback", () => {
  const r = screenSecurity(base());
  assert.equal(r.zakat.longTerm.perShare, 20); // (50 + 100 + 50) / 10
  assert.equal(r.zakat.longTerm.perShareWithLiabilitiesDeducted, 12);
  const qs = Q_ENDS.map((d) => snap("quarter", d, { balance: { cash: 0, netReceivables: 0, inventory: 0 } }));
  const r2 = screenSecurity(base({ quarters: qs }));
  assert.equal(r2.zakat.longTerm.fallbackUsed, true);
  assert.equal(r2.zakat.longTerm.perShare, 1.5); // (20 - 5) / 10
});

test("Universum: ohne deutschen Handelsplatz nicht enthalten", () => {
  const r = screenSecurity(base({ security: { ...base().security, germanVenues: [] } }));
  assert.equal(r.universe.included, false);
});

test("ETF: synthetisch → nicht konform, unabhängig vom Look-through", () => {
  const r = screenSecurity({
    security: { ticker: "ISWD", isin: "IE00B27YCN58", assetType: "etf", productType: "standard", isUcits: true, hasKid: true, fundAnnualReportDate: "2026-05-31" },
    holdings: [],
    manualReviews: [{ criterion: "G2", result: "fail", reviewer: "A.", reviewedAt: "2026-06-10", basisAnnualPeriodEnd: "2026-05-31", sourceUrl: "x" }],
  });
  assert.equal(crit(r, "G1").result, RESULT.NOT_CHECKED);
  assert.equal(crit(r, "G2").result, RESULT.FAIL);
  assert.equal(r.status, STATUS.NON_CONFORM);
});

test("ETF: abgeschaltete Ableitungsregel hat keine Statuswirkung", () => {
  const r = screenSecurity({
    security: { ticker: "X", isin: "IE0", assetType: "etf", productType: "standard", isUcits: true, hasKid: true, fundAnnualReportDate: "2026-05-31" },
    holdings: [{ isin: "US1", weight: 100, status: STATUS.CONFORM, purificationRate: 0.5 }],
    manualReviews: [
      ...["G3", "G4"].map((c) => ({ criterion: c, result: "pass", reviewer: "A.", reviewedAt: "2026-06-10", basisAnnualPeriodEnd: "2026-05-31", sourceUrl: "x" })),
      { criterion: "G5_FUND_INCOME", result: "pass", details: { interestIncomePctOfAssets: 0.02 }, reviewer: "A.", reviewedAt: "2026-06-10", basisAnnualPeriodEnd: "2026-05-31", sourceUrl: "x" },
    ],
    parameters: { ruleG2Synthetic: false },
  });
  assert.equal(crit(r, "G2").result, RESULT.DISABLED);
  assert.equal(r.status, STATUS.CONFORM);
  assert.equal(r.purification.amountPer1000Eur, 5.2); // (0,5 + 0,02) % von 1.000 €
  assert.equal(r.purification.coveragePct, 100);
});

test("H: gehebelter ETF nie konform", () => {
  const r = screenSecurity(base({ security: { ...base().security, productType: "leveraged_etf" } }));
  assert.equal(crit(r, "H").result, RESULT.FAIL);
});

test("unbekannter Parameter wird abgelehnt", () => {
  assert.throws(() => screenSecurity(base({ parameters: { gibtsNicht: 1 } })));
});

test("FMP-Mapping: Leasing getrennt, Marktkapitalisierung zum Stichtag", () => {
  const s = mapFmpPeriod({
    periodType: "quarter",
    balance: { date: "2026-06-30", reportedCurrency: "USD", shortTermDebt: 10, longTermDebt: 90, capitalLeaseObligationsCurrent: 5, capitalLeaseObligationsNonCurrent: 15, cashAndCashEquivalents: 7, totalAssets: 500 },
    income: { revenue: 100, interestIncome: 2, weightedAverageShsOut: 50 },
    cashflow: { commonDividendsPaid: -12 },
    marketCapHistory: [{ date: "2026-06-29", marketCap: 1000 }, { date: "2026-07-01", marketCap: 2000 }],
  });
  assert.equal(s.balance.interestBearingDebtExLeases, 100);
  assert.equal(s.balance.leaseLiabilities, 20);
  assert.equal(s.marketCapAtPeriodEnd, 1000);
  assert.equal(s.priceAtPeriodEnd, 20);
  assert.equal(s.income.distributions, 12);
  assert.equal(s.balance.goodwill, null); // nicht geliefert → unbekannt
  assert.equal(pickMarketCapAt([{ date: "2026-05-01", marketCap: 1 }], "2026-06-30"), null); // zu alt
});

test("B3-Nenner: Gesamteinnahmen inkl. Zins- und sonstige Erträge", () => {
  const a = snap("annual", ANNUAL_END, { income: { revenue: 390, interestIncome: 4, otherIncome: 6 } });
  const r = screenSecurity(base({ annual: a }));
  assert.equal(crit(r, "B3").checks[0].value, 1); // 4 / (390 + 4 + 6)
});

test("B3-Nenner: fehlende sonstige Erträge → nicht geprüft", () => {
  const a = snap("annual", ANNUAL_END, { income: { otherIncome: null } });
  const r = screenSecurity(base({ annual: a }));
  assert.equal(crit(r, "B3").result, RESULT.NOT_CHECKED);
});

test("A1-Gruppen: Tabak Ausschluss mit Auslegungs-Flag", () => {
  const r = screenSecurity(base({ profile: { industry: "Tobacco" } }));
  assert.equal(crit(r, "A1").result, RESULT.FAIL);
  assert.ok(crit(r, "A1").flags.includes("auslegungsfrage"));
});

test("A1-Gruppen: Aerospace & Defense → manuelle Prüfung, nicht Automatik", () => {
  const r = screenSecurity(base({ profile: { industry: "Aerospace & Defense" } }));
  assert.equal(crit(r, "A1").result, RESULT.NOT_CHECKED);
});

test("A1-Gruppen: Cannabis in Beschreibung → Prüfung, Pharma sonst unberührt", () => {
  const r = screenSecurity(base({ profile: { industry: "Drug Manufacturers - Specialty & Generic", description: "Producer of recreational cannabis products" } }));
  assert.equal(crit(r, "A1").result, RESULT.NOT_CHECKED);
  const r2 = screenSecurity(base({ profile: { industry: "Drug Manufacturers - General", description: "Vaccines and oncology" } }));
  assert.equal(crit(r2, "A1").result, RESULT.PASS);
});

test("A1-Gruppen: Lebensmittelhandel kein Ausschluss, B3-Schwerpunkt", () => {
  const r = screenSecurity(base({ profile: { industry: "Grocery Stores" } }));
  assert.equal(crit(r, "A1").result, RESULT.PASS);
  assert.ok(crit(r, "A1").flags.includes("b3_schwerpunkt"));
  const casino = screenSecurity(base({ profile: { industry: "Resorts & Casinos" } }));
  assert.equal(crit(casino, "A1").result, RESULT.FAIL);
});

test("A1-Gruppen: Film/Streaming (Entertainment) → manuelle Prüfung", () => {
  const r = screenSecurity(base({ profile: { industry: "Entertainment" } }));
  assert.equal(crit(r, "A1").result, RESULT.NOT_CHECKED);
});

test("G5: Abdeckung unter 95 % → nicht geprüft, darüber hochgerechnet", () => {
  const etf = { ticker: "X", isin: "IE0", assetType: "etf", productType: "standard", isUcits: true, hasKid: true, fundAnnualReportDate: "2026-05-31" };
  const fund = { criterion: "G5_FUND_INCOME", result: "pass", details: { interestIncomePctOfAssets: 0 }, reviewer: "A.", reviewedAt: "2026-06-10", basisAnnualPeriodEnd: "2026-05-31", sourceUrl: "x" };
  const low = screenSecurity({ security: etf, manualReviews: [fund], holdings: [
    { isin: "A", weight: 90, status: STATUS.CONFORM, purificationRate: 1 },
    { isin: "B", weight: 10, status: STATUS.CONFORM, purificationRate: null },
  ] });
  assert.equal(low.purification.status, "nicht_geprueft");
  assert.equal(low.purification.coveragePct, 90);
  const ok = screenSecurity({ security: etf, manualReviews: [fund], holdings: [
    { isin: "A", weight: 96, status: STATUS.CONFORM, purificationRate: 1 },
    { isin: "B", weight: 4, status: STATUS.CONFORM, purificationRate: null },
  ] });
  assert.equal(ok.purification.status, "berechnet");
  assert.equal(ok.purification.ratePctOfValue, 1); // 0,96 hochgerechnet auf 100 %
});

test("G5: ohne fondseigene Zinserträge → nicht geprüft", () => {
  const r = screenSecurity({
    security: { ticker: "X", isin: "IE0", assetType: "etf", productType: "standard", isUcits: true, hasKid: true, fundAnnualReportDate: "2026-05-31" },
    holdings: [{ isin: "A", weight: 100, status: STATUS.CONFORM, purificationRate: 1 }],
  });
  assert.equal(r.purification.status, "nicht_geprueft");
});

test("Finanzdienstleister: kein A1-Ausschluss, B3-Schwerpunkt", () => {
  for (const industry of ["Asset Management", "Financial - Capital Markets", "Financial - Data & Stock Exchanges"]) {
    const r = screenSecurity(base({ profile: { industry } }));
    assert.equal(crit(r, "A1").result, RESULT.PASS, industry);
    assert.ok(crit(r, "A1").flags.includes("b3_schwerpunkt"), industry);
  }
});

test("Musik: kein A1-Ausschluss, Hinweis auf B3", () => {
  const r = screenSecurity(base({ profile: { industry: "Internet Content & Information", description: "Audio streaming and music platform" } }));
  assert.equal(crit(r, "A1").result, RESULT.PASS);
  assert.ok(crit(r, "A1").flags.includes("b3_schwerpunkt"));
});

function segReviewWith(byPeriod) {
  return [
    validReviews[0],
    { criterion: "B3_SEGMENTS", result: "fail", reviewer: "A.", reviewedAt: "2026-03-01", basisAnnualPeriodEnd: ANNUAL_END, sourceUrl: "x",
      details: { prohibitedRevenueByPeriod: byPeriod } },
  ];
}

test("B3: Kategorien je Periode, Musik als Auslegungsfrage gekennzeichnet", () => {
  const byPeriod = { [`annual:${ANNUAL_END}`]: { music: 300 }, ...Object.fromEntries(Q_ENDS.map((d) => [`quarter:${d}`, { music: 75 }])) };
  const r = screenSecurity(base({ manualReviews: segReviewWith(byPeriod) }));
  const b3 = crit(r, "B3");
  assert.equal(b3.result, RESULT.FAIL); // reines Musikunternehmen fällt über B3 durch
  assert.ok(b3.flags.includes("auslegungsfrage"));
  assert.deepEqual(b3.categories.map((c) => c.id), ["music"]);
});

test("B3: Derivate + Wertpapierleihe ohne Auslegungs-Flag, unbekannte Kategorie → nicht geprüft", () => {
  const ok = { [`annual:${ANNUAL_END}`]: { derivatives: 2, securities_lending: 1 }, ...Object.fromEntries(Q_ENDS.map((d) => [`quarter:${d}`, { derivatives: 0.5 }])) };
  const r = screenSecurity(base({ manualReviews: segReviewWith(ok) }));
  assert.equal(crit(r, "B3").result, RESULT.PASS); // (4 + 3) / 404 = 1,73 %
  assert.equal(crit(r, "B3").flags.includes("auslegungsfrage"), false);
  const bad = { ...ok, [`annual:${ANNUAL_END}`]: { krypto: 1 } };
  const r2 = screenSecurity(base({ manualReviews: segReviewWith(bad) }));
  assert.equal(crit(r2, "B3").result, RESULT.NOT_CHECKED);
});
