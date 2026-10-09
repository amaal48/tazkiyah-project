// src/screening/engine.test.js — ausführen mit: node --test src/screening/
import { test } from "node:test";
import assert from "node:assert/strict";
import { screenSecurity, STATUS, RESULT } from "./engine.js";
import { emptySnapshot } from "./providers/model.js";
import { mapFmpPeriod, pickMarketCapAt } from "./providers/fmp.js";
import { readFileSync } from "node:fs";
import { EXPLANATIONS, STAGES, ETF_STAGE, FLAG_TEXTS, fillParams, splitSources } from "./explanations.js";
import { DEFAULT_PARAMETERS } from "./parameters.js";

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

test("manuelle Prüfung im Ergebnis: verification ja, Prüfer-Kürzel und ai_draft nie", () => {
  const reviews = validReviews.map((r) => ({ ...r, reviewer: "AMI", aiDraft: true, verification: "full" }));
  const r = screenSecurity(base({ manualReviews: reviews }));
  const review = crit(r, "A2").review;
  assert.equal(review.verification, "full");
  assert.equal("reviewer" in review, false);
  assert.doesNotMatch(JSON.stringify(r), /AMI|aiDraft|ai_draft/);
  // Altbestand ohne verification
  assert.equal(crit(screenSecurity(base()), "A2").review.verification, null);
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

test("B3-Nenner ohne fehlende sonstige Erträge: < 5 % bestanden, ≥ 5 % nicht geprüft, nie nicht konform (08.10.2026)", () => {
  const noOther = (x) => Object.assign(x, { income: { ...x.income, otherIncome: null } });
  // 4 / (400 + 4) = 0,99 % → bestanden, gekennzeichnet
  const ok = crit(screenSecurity(base({ annual: noOther(snap("annual", ANNUAL_END)) })), "B3");
  assert.equal(ok.result, RESULT.PASS);
  assert.equal(ok.checks[0].denominatorWithoutOtherIncome, true);
  assert.equal(ok.checks[1].denominatorWithoutOtherIncome, undefined); // Quartale haben sonstige Erträge
  assert.ok(ok.flags.includes("nenner_ohne_sonstige_ertraege"));
  // 30 / (400 + 30) = 6,98 % → nicht geprüft statt nicht konform
  const high = crit(screenSecurity(base({ annual: noOther(snap("annual", ANNUAL_END, { income: { interestIncome: 30 } })) })), "B3");
  assert.equal(high.checks[0].result, RESULT.NOT_CHECKED);
  assert.equal(high.checks[0].reason, "Sonstige Erträge nicht ausgewiesen, Nenner vorsichtig ohne sie");
  assert.equal(high.result, RESULT.NOT_CHECKED);
  // Mit sonstigen Erträgen wie bisher: 30 / (400 + 30 + 0) über 5 % → nicht konform
  assert.equal(crit(screenSecurity(base({ annual: snap("annual", ANNUAL_END, { income: { interestIncome: 30 } }) })), "B3").result, RESULT.FAIL);
  // TTM: fehlt in einem Quartal der Wert, bleibt er für alle vier weg
  const qs = Q_ENDS.map((d, i) => (i === 2 ? noOther(snap("quarter", d)) : snap("quarter", d, { income: { otherIncome: 50 } })));
  const ttm = crit(screenSecurity(base({ quarters: qs })), "B3").checks[1];
  assert.equal(ttm.denominatorWithoutOtherIncome, true);
  assert.equal(ttm.value, 0.99); // 4 / (400 + 4), ohne die 150 sonstigen Erträge der anderen Quartale
});

test("C1 nur mit eindeutig belegten realen Werten, wenn Posten fehlen: ≥ 33,3 % bestanden, sonst nicht geprüft (08.10.2026)", () => {
  const withIdentified = (tangible, receivables, rights) =>
    snap("annual", ANNUAL_END, { balance: { goodwill: null, identifiedRealAssets: { tangible, receivables, rights } } });
  // (250 + 100 + 0) / 1000 = 35 % → bestanden, gekennzeichnet
  const ok = crit(screenSecurity(base({ annual: withIdentified(250, 100, 0) })), "C1");
  assert.equal(ok.checks[0].result, RESULT.PASS);
  assert.equal(ok.checks[0].identifiedOnly, true);
  assert.ok(ok.flags.includes("sammelzeilen_nicht_mitgezaehlt"));
  // 30 % → nicht geprüft, nie nicht konform
  const low = crit(screenSecurity(base({ annual: withIdentified(200, 100, 0) })), "C1");
  assert.equal(low.checks[0].result, RESULT.NOT_CHECKED);
  assert.match(low.checks[0].reason, /Sammelzeilen/);
  // Ohne belegte Werte bleibt es wie bisher „nicht geprüft“ (Datenfeld fehlt)
  const none = crit(screenSecurity(base({ annual: snap("annual", ANNUAL_END, { balance: { goodwill: null } }) })), "C1");
  assert.match(none.checks[0].reason, /goodwill/);
  // Vollständige Daten: normale Rechnung, keine Kennzeichnung
  assert.ok(!crit(screenSecurity(base()), "C1").flags.includes("sammelzeilen_nicht_mitgezaehlt"));
});

test("Belegte reale Werte gelten nur für C1, nicht für B2 und Zakat", () => {
  const a = snap("annual", ANNUAL_END, { balance: { cash: null, identifiedRealAssets: { tangible: 900, receivables: 0, rights: 0 } } });
  const r = screenSecurity(base({ annual: a }));
  assert.equal(crit(r, "B2").checks[0].result, RESULT.NOT_CHECKED);
  assert.equal(crit(r, "C1").checks[0].identifiedOnly, true);
});

test("B3: Zinserträge laut Anhang aus der B3-Prüfung, wenn der Datenwert fehlt (08.10.2026)", () => {
  const noInterest = (x) => Object.assign(x, { income: { ...x.income, interestIncome: null } });
  const annual = noInterest(snap("annual", ANNUAL_END));
  const quarters = Q_ENDS.map((d) => noInterest(snap("quarter", d)));
  // Ohne Anhang-Werte: nicht geprüft
  assert.equal(crit(screenSecurity(base({ annual, quarters })), "B3").result, RESULT.NOT_CHECKED);
  // Mit Anhang-Werten für Jahr und alle vier Quartale: gerechnet und gekennzeichnet
  const notes = { [`annual:${ANNUAL_END}`]: { amount: 4, source: "10-K, Note 5" } };
  for (const d of Q_ENDS) notes[`quarter:${d}`] = { amount: 1, source: "10-Q, Note 4" };
  const reviews = [validReviews[0], { ...validReviews[1], interestIncomeNotes: notes }];
  const b3 = crit(screenSecurity(base({ annual, quarters, manualReviews: reviews })), "B3");
  assert.equal(b3.result, RESULT.PASS);
  assert.equal(b3.checks[0].value, 0.99); // 4 / (400 + 4 + 0), gerundet
  assert.ok(b3.flags.includes("zinsertraege_aus_anhang"));
  // Datenwert hat Vorrang vor dem Anhang-Wert
  const withData = crit(screenSecurity(base({ manualReviews: reviews })), "B3");
  assert.ok(!withData.flags.includes("zinsertraege_aus_anhang"));
  // Anhang-Wert einer abgelaufenen Prüfung gilt nicht
  const expired = [validReviews[0], { ...validReviews[1], basisAnnualPeriodEnd: "2024-12-31", interestIncomeNotes: notes }];
  assert.equal(crit(screenSecurity(base({ annual, quarters, manualReviews: expired })), "B3").result, RESULT.NOT_CHECKED);
});

test("B3: Zinserträge mit Dividenden (vorsichtig vollständig gezählt) werden gekennzeichnet", () => {
  const annual = snap("annual", ANNUAL_END, { sourceConcepts: { interestIncome: { concept: "InvestmentIncomeNet", inclusive: true } } });
  assert.ok(crit(screenSecurity(base({ annual })), "B3").flags.includes("zinsertraege_vorsichtig"));
  assert.ok(!crit(screenSecurity(base()), "B3").flags.includes("zinsertraege_vorsichtig"));
});

test("C1/B2: Posten per Bilanz-Abgleich 0 → Kennzeichnung", () => {
  const annual = snap("annual", ANNUAL_END, { balance: { goodwill: 0 }, sourceConcepts: { goodwill: { concept: null, note: "0 per Bilanz-Abgleich" } } });
  const r = screenSecurity(base({ annual }));
  assert.ok(crit(r, "C1").flags.includes("posten_null_bilanzabgleich"));
  assert.ok(!crit(r, "B2").flags.includes("posten_null_bilanzabgleich"));
  assert.ok(!crit(screenSecurity(base()), "C1").flags.includes("posten_null_bilanzabgleich"));
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

test("A1 über SIC (sec, sec_fmp): Code statt FMP-Branche, Prüfwert „SIC-Code“", () => {
  const profile = { symbol: "TEST", industry: "Software - Infrastructure", sic: "6021", sicDescription: "NATIONAL COMMERCIAL BANKS" };
  for (const dataProvider of ["sec", "sec_fmp"]) {
    const a1 = crit(screenSecurity(base({ profile, dataProvider })), "A1");
    assert.equal(a1.result, RESULT.FAIL, dataProvider);
    assert.equal(a1.checks[0].label, "SIC-Code");
    assert.equal(a1.checks[0].value, "SIC 6021 NATIONAL COMMERCIAL BANKS");
    assert.equal(a1.checks[0].group, "riba");
  }
  // FMP-Modus unverändert: Branche zählt, SIC-Code wird ignoriert
  const fmp = screenSecurity(base({ profile, dataProvider: "fmp" }));
  assert.equal(crit(fmp, "A1").result, RESULT.PASS);
  assert.equal(crit(fmp, "A1").checks[0].label, "Branche");
  assert.equal(fmp.status, STATUS.CONFORM);
});

test("A1 über SIC: fehlender Code → nicht geprüft; Pharma erlaubt; Zahlungsnetzwerk B3 mit Auslegung", () => {
  const none = crit(screenSecurity(base({ profile: { industry: "Banks" }, dataProvider: "sec" })), "A1");
  assert.equal(none.result, RESULT.NOT_CHECKED);
  assert.equal(none.reason, "SIC-Code fehlt");
  assert.equal(crit(screenSecurity(base({ profile: { sic: "2834" }, dataProvider: "sec" })), "A1").result, RESULT.PASS);
  const visa = crit(screenSecurity(base({ security: { ...base().security, ticker: "V" }, profile: { sic: "7389" }, dataProvider: "sec" })), "A1");
  assert.equal(visa.result, RESULT.PASS);
  assert.ok(visa.flags.includes("b3_schwerpunkt"));
  assert.ok(visa.flags.includes("auslegungsfrage"));
  const aero = crit(screenSecurity(base({ profile: { sic: "3721" }, dataProvider: "sec" })), "A1");
  assert.equal(aero.result, RESULT.NOT_CHECKED);
});

test("A1 über SIC: Ticker-Listen (STZ Ausschluss, LYV Prüfung + Musik), FMP-Modus ignoriert Listen", () => {
  const sec = (ticker, sic) => base({ security: { ...base().security, ticker }, profile: { sic }, dataProvider: "sec" });
  const stz = crit(screenSecurity(sec("STZ", "2080")), "A1");
  assert.equal(stz.result, RESULT.FAIL);
  assert.equal(stz.checks[0].tickerList, "ALCOHOL_TICKERS");
  const lyv = crit(screenSecurity(sec("LYV", "7900")), "A1");
  assert.equal(lyv.result, RESULT.NOT_CHECKED);
  assert.deepEqual(lyv.checks[0].alsoGroups, ["music"]);
  assert.ok(lyv.flags.includes("b3_schwerpunkt"));
  const efx = crit(screenSecurity(sec("EFX", "7320")), "A1");
  assert.equal(efx.result, RESULT.PASS);
  assert.ok(efx.flags.includes("auslegungsfrage"));
  // FMP-Modus: gleiche Ticker, Branche zählt
  const fmp = screenSecurity(base({ security: { ...base().security, ticker: "STZ" }, profile: { industry: "Beverages - Non-Alcoholic", sic: "2080" }, dataProvider: "fmp" }));
  assert.equal(crit(fmp, "A1").result, RESULT.PASS);
  assert.equal(crit(fmp, "A1").checks[0].tickerList, undefined);
});

test("C2 und A3 über SIC: 6770 Blank Check → C2 nicht bestanden; 5094 → A3 manuell", () => {
  assert.equal(crit(screenSecurity(base({ profile: { sic: "6770" }, dataProvider: "sec" })), "C2").result, RESULT.FAIL);
  assert.equal(crit(screenSecurity(base({ profile: { sic: "7372" }, dataProvider: "sec" })), "C2").result, RESULT.PASS);
  const a3 = crit(screenSecurity(base({ profile: { sic: "5094" }, dataProvider: "sec" })), "A3");
  assert.equal(a3.result, RESULT.NOT_CHECKED);
  const reviewed = [...validReviews, { criterion: "A3", result: "pass", reviewer: "A.", reviewedAt: "2026-03-01", basisAnnualPeriodEnd: ANNUAL_END, sourceUrl: "x" }];
  assert.equal(crit(screenSecurity(base({ profile: { sic: "5094" }, dataProvider: "sec", manualReviews: reviewed })), "A3").result, RESULT.PASS);
  // FMP-Modus: SIC 6770 ohne Branche „Shell“ ändert C2 nicht
  assert.equal(crit(screenSecurity(base({ profile: { industry: "Software", sic: "6770" }, dataProvider: "fmp" })), "C2").result, RESULT.PASS);
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

// ------------------------------------------------ Leasing im Quartal (Schätzung)

const EST = { source: "annual", periodEnd: ANNUAL_END, amount: 100 };
function withLatestQuarter(balance, extra = {}) {
  return Q_ENDS.map((d, i) => (i === 0 ? snap("quarter", d, { balance, ...extra }) : snap("quarter", d)));
}
const leaseReview = (over = {}) => ({
  criterion: "B1_LEASE", result: "pass", reviewer: "A.", reviewedAt: "2026-10-02", basisAnnualPeriodEnd: ANNUAL_END, sourceUrl: "https://example.com/10q",
  details: { quarterPeriodEnd: Q_ENDS[0], leaseLiabilities: 40 }, ...over,
});

test("Leasing-Schätzung ohne Einfluss auf das Ergebnis: bestanden, als Schätzung gekennzeichnet", () => {
  const quarters = withLatestQuarter({ interestBearingDebtExLeases: 100, leaseLiabilities: 20, leaseEstimate: EST });
  const b1 = crit(screenSecurity(base({ quarters })), "B1");
  assert.equal(b1.result, RESULT.PASS);
  assert.equal(b1.checks[1].leaseSource, "annual_estimate");
  assert.ok(b1.flags.includes("leasing_geschaetzt"));
});

test("Leasing-Schätzung entscheidet (mit > 30 %, ohne ≤ 30 %): nicht geprüft, 10-Q manuell prüfen", () => {
  const quarters = withLatestQuarter({ interestBearingDebtExLeases: 250, leaseLiabilities: 100, leaseEstimate: EST });
  const b1 = crit(screenSecurity(base({ quarters })), "B1");
  assert.equal(b1.checks[1].value, 35);
  assert.equal(b1.checks[1].result, RESULT.NOT_CHECKED);
  assert.equal(b1.checks[1].leaseEstimateDecisive, true);
  assert.match(b1.checks[1].reason, /10-Q/);
  assert.equal(b1.result, RESULT.NOT_CHECKED);
  assert.ok(b1.flags.includes("leasing_schaetzung_entscheidend"));
});

test("Schulden allein schon über der Grenze: nicht konform, Schätzung ändert nichts", () => {
  const quarters = withLatestQuarter({ interestBearingDebtExLeases: 350, leaseLiabilities: 100, leaseEstimate: EST });
  assert.equal(crit(screenSecurity(base({ quarters })), "B1").result, RESULT.FAIL);
});

test("Manuelle 10-Q-Prüfung ersetzt die Schätzung (bestanden und durchgefallen)", () => {
  const quarters = withLatestQuarter({ interestBearingDebtExLeases: 250, leaseLiabilities: 100, leaseEstimate: EST });
  const ok = crit(screenSecurity(base({ quarters, manualReviews: [...validReviews, leaseReview()] })), "B1"); // (250+40)/1000 = 29 %
  assert.equal(ok.checks[1].value, 29);
  assert.equal(ok.checks[1].result, RESULT.PASS);
  assert.equal(ok.checks[1].leaseSource, "manual_10q");
  assert.ok(ok.flags.includes("leasing_manuell_geprueft"));
  const fail = crit(screenSecurity(base({ quarters, manualReviews: [...validReviews, leaseReview({ details: { quarterPeriodEnd: Q_ENDS[0], leaseLiabilities: 60 } })] })), "B1");
  assert.equal(fail.checks[1].result, RESULT.FAIL); // (250+60)/1000 = 31 %
});

test("Prüfung eines älteren Quartals wird ignoriert", () => {
  const quarters = withLatestQuarter({ interestBearingDebtExLeases: 250, leaseLiabilities: 100, leaseEstimate: EST });
  const stale = leaseReview({ details: { quarterPeriodEnd: "2026-03-31", leaseLiabilities: 40 } });
  const b1 = crit(screenSecurity(base({ quarters, manualReviews: [...validReviews, stale] })), "B1");
  assert.equal(b1.checks[1].leaseEstimateDecisive, true);
});

test("Schätzung abgeschaltet: Leasing im Quartal gilt als unbekannt", () => {
  const quarters = withLatestQuarter({ interestBearingDebtExLeases: 100, leaseLiabilities: 20, leaseEstimate: EST });
  const b1 = crit(screenSecurity(base({ quarters, parameters: { leaseQuarterEstimate: false } })), "B1");
  assert.equal(b1.checks[1].result, RESULT.NOT_CHECKED);
  assert.match(b1.checks[1].reason, /leaseLiabilities/);
});

// ------------------------------------------------ Marktkapitalisierung aus Kurs, mehrere Gattungen

test("Selbst gebildete Marktkapitalisierung: gekennzeichnet, bei Durchschnitts-Aktienzahl als Datenabweichung", () => {
  const derived = (type, end, basis) => snap(type, end, { marketCapSource: "price_x_weighted_avg_shares", sharesBasis: basis });
  const r = screenSecurity(base({ annual: derived("annual", ANNUAL_END, "weighted_average"), quarters: Q_ENDS.map((d) => derived("quarter", d, "weighted_average")) }));
  for (const id of ["B1", "B2"]) {
    assert.ok(crit(r, id).flags.includes("marktkapitalisierung_aus_kurs"));
    assert.ok(crit(r, id).flags.includes("datenabweichung"));
  }
  // Bestand am Periodenende → keine Datenabweichung
  const pe = (type, end) => snap(type, end, { marketCapSource: "price_x_period_end_shares", sharesBasis: "period_end" });
  const r2 = screenSecurity(base({ annual: pe("annual", ANNUAL_END), quarters: Q_ENDS.map((d) => pe("quarter", d)) }));
  assert.ok(crit(r2, "B1").flags.includes("marktkapitalisierung_aus_kurs"));
  assert.ok(!crit(r2, "B1").flags.includes("datenabweichung"));
  // Wert vom Anbieter → keine Kennzeichnung
  assert.deepEqual(crit(screenSecurity(base()), "B1").flags, []);
});

test("Mehrere Aktiengattungen: selbst gebildeter Wert gilt nicht → B1/B2 nicht geprüft; Anbieterwert gilt", () => {
  const derived = (type, end) => snap(type, end, { marketCapSource: "price_x_weighted_avg_shares", sharesBasis: "weighted_average" });
  const multi = { ...base().security, multiClassIssuer: true };
  const r = screenSecurity(base({ security: multi, annual: derived("annual", ANNUAL_END), quarters: Q_ENDS.map((d) => derived("quarter", d)) }));
  assert.equal(crit(r, "B1").result, RESULT.NOT_CHECKED);
  assert.equal(crit(r, "B2").result, RESULT.NOT_CHECKED);
  assert.match(crit(r, "B1").checks[0].reason, /mehrere Aktiengattungen/);
  // Marktkapitalisierung vom Anbieter (ganzes Unternehmen) → normal geprüft
  const r2 = screenSecurity(base({ security: multi }));
  assert.equal(crit(r2, "B1").result, RESULT.PASS);
});

// ------------------------------------------------ Kurzfassung für die Listenansicht

test("headline: durchgefallene Prüfung mit Wert, offene Prüfung mit Grund", () => {
  const quarters = Q_ENDS.map((d, i) => (i === 0 ? snap("quarter", d, { balance: { interestBearingDebtExLeases: 400, leaseLiabilities: 0 } }) : snap("quarter", d)));
  const r = screenSecurity(base({ quarters, manualReviews: [] }));
  const b1 = r.headline.failed.find((x) => x.criterion === "B1");
  assert.equal(b1.name, "Zinstragende Schulden");
  assert.equal(b1.check.basis, "quarter");
  assert.equal(b1.check.value, 40);
  assert.equal(b1.check.limit, 30);
  assert.equal(b1.check.comparator, "<=");
  const a2 = r.headline.notChecked.find((x) => x.criterion === "A2");
  assert.match(a2.reason, /manuell/);
  // headline spiegelt summary
  assert.deepEqual(r.headline.failed.map((x) => x.criterion), r.summary.failed);
  assert.deepEqual(r.headline.notChecked.map((x) => x.criterion), r.summary.notChecked);
});

// ------------------------------------------------ Erklärtexte stimmen mit der Engine überein

function allEngineCriteria() {
  const stock = screenSecurity({ security: { ticker: "X", assetType: "stock", productType: "standard", shareClass: "common" }, profile: { industry: "Software - Infrastructure" }, annual: null, quarters: [] });
  const etf = screenSecurity({ security: { ticker: "E", assetType: "etf", productType: "standard", isUcits: true, hasKid: true }, holdings: [] });
  const byId = new Map();
  for (const c of [...stock.criteria, ...etf.criteria]) byId.set(c.id, c);
  return byId;
}

test("Erklärtexte: Name, Quelle und Parameterverweise entsprechen der Engine", () => {
  const criteria = allEngineCriteria();
  for (const [id, c] of criteria) {
    const e = EXPLANATIONS[id];
    assert.ok(e, `Erklärung für ${id} fehlt`);
    assert.equal(e.name, c.name, `Name ${id}`);
    assert.equal(e.source, c.source, `Quelle ${id}`);
    assert.deepEqual(e.parameterRefs, c.parameterRefs, `Parameterverweise ${id}`);
  }
  for (const id of Object.keys(EXPLANATIONS)) assert.ok(criteria.has(id), `${id} gibt es in der Engine nicht`);
});

test("Erklärtexte: Parameterverweise existieren, Platzhalter lassen sich einsetzen, Stufen sind vollständig", () => {
  for (const [id, e] of Object.entries(EXPLANATIONS)) {
    for (const ref of e.parameterRefs) assert.ok(ref === "industryGroups" || ref in DEFAULT_PARAMETERS, `${id}: ${ref}`);
    for (const t of e.simple) assert.ok(!/\{\w+\}/.test(fillParams(t)), `${id}: Platzhalter nicht ersetzt`);
    assert.ok(splitSources(e.source).length >= 1);
  }
  assert.equal(fillParams("höchstens {debtMaxPct} %"), "höchstens 30 %");
  assert.equal(fillParams("mindestens {realAssetsMinPct} %"), "mindestens 33,3 %");
  for (const stage of [...STAGES, ETF_STAGE]) for (const id of stage.criteria) assert.ok(EXPLANATIONS[id], `${stage.id}: ${id}`);
});

test("Kennzeichnungen: jede Kennzeichnung der Engine hat einen Klartext", () => {
  const source = readFileSync(new URL("./engine.js", import.meta.url), "utf8");
  const flags = new Set([...source.matchAll(/flags\.push\("([a-z0-9_]+)"\)/g)].map((m) => m[1]));
  assert.ok(flags.size >= 6);
  for (const f of flags) {
    assert.ok(FLAG_TEXTS[f], `Text für Kennzeichnung ${f} fehlt`);
    assert.ok(EXPLANATIONS[FLAG_TEXTS[f].criterion], `Zielseite für ${f}`);
  }
});
