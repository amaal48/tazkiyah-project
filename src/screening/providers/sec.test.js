// src/screening/providers/sec.test.js — ausführen mit: node --test src/screening/providers/sec.test.js
// Keine echten Netzaufrufe: gekürzte Beispielantworten in ./fixtures/sec-sample.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONCEPTS,
  CATCH_ALL,
  RECONCILIATION_NOTE,
  applyBalanceReconciliation,
  balanceLeavesFromCalc,
  balanceValueOf,
  buildTickerIndex,
  createSecProvider,
  listFilings,
  lookupCik,
  mapSecFinancials,
  mapSecProfile,
  tickerVariants,
} from "./sec.js";
import { applyFmpPrices } from "./secFmp.js";

const SAMPLE = JSON.parse(readFileSync(new URL("./fixtures/sec-sample.json", import.meta.url), "utf8"));
const CIK = "0001234567";
const map = (facts = SAMPLE.companyfacts) => mapSecFinancials(facts, listFilings(SAMPLE.submissions), CIK);
const r = map();
const q = (end) => r.quarters.find((x) => x.periodEnd === end);

test("Perioden: letzter 10-K als Jahr, vier Quartale neuestes zuerst, 8-K ignoriert", () => {
  assert.equal(r.annual.periodType, "annual");
  assert.equal(r.annual.periodEnd, "2025-09-30");
  assert.deepEqual(r.quarters.map((x) => x.periodEnd), ["2025-12-31", "2025-09-30", "2025-06-30", "2025-03-31"]);
  assert.equal(r.annual.audited, true);
  assert.equal(q("2025-12-31").audited, false);
  assert.equal(r.annual.currency, "USD");
});

test("Konzept-Vorrang: Revenues vor RevenueFromContract…; Anlagen: getrennte Bilanzzeilen werden addiert", () => {
  assert.equal(q("2025-12-31").income.revenue, 270);
  assert.equal(q("2025-12-31").sourceConcepts.revenue.concept, "Revenues");
  // ShortTermInvestments (Gruppe 1) + MarketableSecuritiesCurrent (Gruppe 2)
  assert.equal(r.annual.balance.shortTermInvestments, 70 + 50);
  assert.equal(r.annual.sourceConcepts.shortTermInvestments.concept, "ShortTermInvestments + MarketableSecuritiesCurrent");
  assert.deepEqual(CONCEPTS.revenue.concepts.slice(0, 2), ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"]);
});

test("Berichtigung (10-K/A) schlägt Erstfassung; fehlt der Wert in der Berichtigung, gilt die Erstfassung", () => {
  assert.equal(r.annual.income.revenue, 1010);
  assert.equal(r.annual.balance.totalAssets, 5050);
  assert.equal(r.annual.sourceConcepts.totalAssets.form, "10-K/A");
  assert.equal(r.annual.balance.cash, 300); // nur in der Erstfassung
  assert.equal(r.annual.sourceConcepts.cash.form, "10-K");
});

test("Kumulierte Werte (6/9 Monate) werden nie als Quartal verwendet", () => {
  assert.equal(q("2025-03-31").income.revenue, 250); // nicht 490
  assert.equal(q("2025-06-30").income.netIncome, null); // nur 9 Monate vorhanden
  assert.equal(q("2025-03-31").income.distributions, null); // nur 6 Monate vorhanden
});

test("Viertes Quartal: Jahr minus Q1–Q3, gekennzeichnet; null, wenn ein Quartal fehlt", () => {
  const q4 = q("2025-09-30");
  assert.equal(q4.income.revenue, 1010 - (240 + 250 + 260));
  assert.equal(q4.sourceConcepts.revenue.derived, "abgeleitet aus Jahres- und Quartalswerten");
  assert.equal(q4.income.interestIncome, 22 - (4 + 5 + 6));
  assert.equal(q4.income.netIncome, null); // Q3 nur kumuliert → nicht ableitbar
  assert.equal(q4.income.distributions, null);
  // Bilanz Q4 = Bilanz des 10-K
  assert.equal(q4.balance.totalAssets, 5050);
  assert.equal(q4.audited, true);
});

test("Finanzschulden: DebtCurrent ersetzt LongTermDebtCurrent und CommercialPaper (keine Doppelzählung)", () => {
  assert.equal(r.annual.balance.interestBearingDebtExLeases, 900 + 300);
  assert.equal(r.annual.sourceConcepts.interestBearingDebtExLeases.concept, "LongTermDebtNoncurrent + DebtCurrent");
  // Ohne DebtCurrent: Summe der Einzelposten
  assert.equal(q("2025-06-30").balance.interestBearingDebtExLeases, 850 + 100 + 120);
  // Nur Commercial Paper, kein langfristiger Teil: null statt Teilsumme (sonst Schulden unterschätzt)
  assert.equal(q("2025-03-31").balance.interestBearingDebtExLeases, null);
});

test("Einreichung noch nicht in companyfacts: Periode übersprungen, Hinweis", () => {
  assert.equal(r.quarters[0].periodEnd, "2025-12-31"); // nicht der leere 10-Q zum 31.03.2026
  assert.ok(r.notes.some((n) => /10-Q vom 2026-05-01 .*noch nicht in den XBRL-Daten/.test(n)));
});

test("Fehlende Felder bleiben null (nie 0); andere Währung wird nicht gemischt", () => {
  assert.equal(r.annual.balance.goodwill, null);
  assert.equal(r.annual.balance.intangiblesExGoodwill, null);
  assert.equal(r.annual.income.otherIncome, null);
  assert.equal(r.annual.balance.inventory, null); // nur in EUR vorhanden
  assert.equal(r.annual.marketCapAtPeriodEnd, null);
  assert.equal(r.annual.priceAtPeriodEnd, null);
  assert.equal(r.annual.marketCapSource, null);
  assert.equal(r.annual.fxToEurAtPeriodEnd, null);
});

test("Forderungen inkl. NontradeReceivablesCurrent; Leasing kurz + lang, Schätzung im Quartal", () => {
  assert.equal(r.annual.balance.netReceivables, 425);
  assert.equal(q("2025-06-30").balance.netReceivables, 380);
  assert.equal(r.annual.balance.leaseLiabilities, 100);
  assert.equal(r.annual.balance.leaseSeparateFromDebt, true);
  assert.equal(q("2025-06-30").balance.leaseLiabilities, 100);
  assert.equal(q("2025-06-30").balance.leaseEstimate.source, "annual");
});

test("Aktienzahl: Stichtag (us-gaap) vor Deckblatt; mehrere Gattungen werden addiert", () => {
  assert.equal(q("2025-06-30").sharesOutstanding, 990000000);
  assert.equal(q("2025-06-30").sharesBasis, "period_end");
  assert.equal(r.annual.sharesOutstanding, 1000000000); // 700 Mio. + 300 Mio.
  assert.equal(r.annual.sharesBasis, "cover_page");
  assert.equal(r.annual.sharesAsOf, "2025-10-20");
  assert.equal(r.annual.sourceConcepts.sharesOutstanding.classesSummed, 2);
});

test("Fundstelle je Periode: Einreichung mit Link ins EDGAR-Archiv", () => {
  assert.deepEqual(r.annual.sourceFiling, {
    accessionNumber: "0001234567-25-000040",
    form: "10-K",
    filingDate: "2025-11-01",
    reportDate: "2025-09-30",
    url: "https://www.sec.gov/Archives/edgar/data/1234567/000123456725000040/0001234567-25-000040-index.htm",
  });
  assert.equal(r.annual.filingDate, "2025-11-01");
  assert.equal(q("2025-12-31").sourceFiling.form, "10-Q");
});

test("Profil: Name, SIC, Geschäftsjahresende; ISIN, Branche, Beschreibung null", () => {
  const p = mapSecProfile(SAMPLE.submissions, "BSPL");
  assert.equal(p.name, "Beispiel Holdings Inc");
  assert.equal(p.cik, "0001234567");
  assert.equal(p.sic, "3571");
  assert.equal(p.sicDescription, "Electronic Computers");
  assert.equal(p.fiscalYearEnd, "09-30");
  assert.equal(p.isin, null);
  assert.equal(p.industry, null);
  assert.equal(p.description, null);
});

test("Ticker mit Punkt oder Bindestrich: BRK-B = BRK.B = BRKB", () => {
  const idx = buildTickerIndex(SAMPLE.tickers);
  assert.equal(lookupCik(idx, "BRK-B"), "0001067983");
  assert.equal(lookupCik(idx, "BRK.B"), "0001067983");
  assert.equal(lookupCik(idx, "brkb"), "0001067983");
  assert.equal(lookupCik(idx, "XYZ-A"), "0007654321");
  assert.equal(lookupCik(idx, "NOPE"), null);
  assert.deepEqual(tickerVariants("BRK.B"), ["BRK.B", "BRK-B", "BRKB"]);
});

// ------------------------------------------------------------ Abrufe (simuliert)

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

function fakeSec(overrides = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, ua: init?.headers?.["User-Agent"] });
    if (overrides[url]) return overrides[url].shift();
    if (url.endsWith("company_tickers.json")) return json(200, SAMPLE.tickers);
    if (url.includes("/submissions/CIK0001234567")) return json(200, SAMPLE.submissions);
    if (url.includes("/companyfacts/CIK0001234567")) return json(200, SAMPLE.companyfacts);
    return json(404, {});
  };
  return { impl, calls };
}

test("Ohne SEC_USER_AGENT: klarer Fehler, keine Anfrage", () => {
  const { impl, calls } = fakeSec();
  assert.throws(() => createSecProvider({ userAgent: "", fetchImpl: impl }), /SEC_USER_AGENT/);
  assert.throws(() => createSecProvider({ userAgent: "Tazkiyah", fetchImpl: impl }), /SEC_USER_AGENT/);
  assert.equal(calls.length, 0);
});

test("Abruf: User-Agent bei jeder Anfrage, Tickerliste 1× je Lauf, Profil und Perioden", async () => {
  const { impl, calls } = fakeSec();
  const p = createSecProvider({ userAgent: "Tazkiyah test@example.org", fetchImpl: impl, sleepImpl: async () => {} });
  const [profile, periods] = await Promise.all([p.getProfile("BSPL"), p.getFinancialPeriods("BSPL")]);
  assert.equal(profile.sic, "3571");
  assert.equal(periods.annual.periodEnd, "2025-09-30");
  await p.getProfile("BSPL");
  assert.ok(calls.every((c) => c.ua === "Tazkiyah test@example.org"));
  assert.equal(calls.filter((c) => c.url.endsWith("company_tickers.json")).length, 1);
  assert.equal(calls.filter((c) => c.url.includes("/submissions/")).length, 1); // zwischengespeichert
  assert.equal(p.getCallCount(), calls.length);
  assert.equal(p.id, "sec");
});

test("Drosselung: höchstens 8 Anfragen pro Sekunde", async () => {
  const { impl } = fakeSec();
  const waits = [];
  const p = createSecProvider({ userAgent: "Tazkiyah test@example.org", fetchImpl: impl, sleepImpl: async (ms) => waits.push(ms) });
  await p.getFinancialPeriods("BSPL"); // 3 Anfragen direkt hintereinander
  assert.ok(waits.length >= 2);
  assert.ok(waits.every((ms) => ms > 0 && ms <= 1000));
  assert.ok(waits[1] >= 125);
});

test("429/503: einmal warten und wiederholen; danach Fehler mit Art", async () => {
  const url = "https://data.sec.gov/submissions/CIK0001234567.json";
  const once = fakeSec({ [url]: [json(503, {}), json(200, SAMPLE.submissions)] });
  const p1 = createSecProvider({ userAgent: "Tazkiyah test@example.org", fetchImpl: once.impl, sleepImpl: async () => {} });
  assert.equal((await p1.getProfile("BSPL")).name, "Beispiel Holdings Inc");

  const twice = fakeSec({ [url]: [json(429, {}), json(429, {})] });
  const p2 = createSecProvider({ userAgent: "Tazkiyah test@example.org", fetchImpl: twice.impl, sleepImpl: async () => {} });
  await assert.rejects(() => p2.getProfile("BSPL"), (err) => err.kind === "limit");

  const p3 = createSecProvider({ userAgent: "Tazkiyah test@example.org", fetchImpl: fakeSec().impl, sleepImpl: async () => {} });
  await assert.rejects(() => p3.getProfile("UNBEKANNT"), /nicht in company_tickers/);
});

test("sec_fmp: Kurs von FMP × Aktienzahl der SEC, als gebildeter Wert gekennzeichnet", () => {
  const snaps = [structuredClone(r.annual), structuredClone(q("2025-06-30")), structuredClone(q("2025-03-31"))];
  applyFmpPrices(snaps, [
    { date: "2025-09-30", price: 10 },
    { date: "2025-06-27", price: 9 },
  ]);
  assert.equal(snaps[0].marketCapAtPeriodEnd, 10 * 1000000000);
  assert.equal(snaps[0].marketCapSource, "price_x_cover_page_shares");
  assert.equal(snaps[1].marketCapAtPeriodEnd, 9 * 990000000);
  assert.equal(snaps[1].marketCapSource, "price_x_period_end_shares");
  assert.equal(snaps[2].marketCapAtPeriodEnd, null); // keine Aktienzahl → nichts gebildet
});

// ------------------------------------------------------------ Einzelfälle mit kleinen Beispieldaten (08.10.2026)

const ACC = "0000000001-26-000001";
const FILINGS = [{ accn: ACC, form: "10-K", filed: "2026-02-20", reportDate: "2025-12-31", primaryDocument: "x.htm" }];
/** companyfacts mit einer Einreichung; values: { Konzept: Zahl } (Bilanz) bzw. { Konzept: [Zahl, "flow"] } */
function facts(values) {
  const g = {};
  for (const [c, v] of Object.entries(values)) {
    const flow = Array.isArray(v);
    const val = flow ? v[0] : v;
    g[c] = { units: { USD: [{ ...(flow ? { start: "2025-01-01" } : {}), end: "2025-12-31", val, accn: ACC, form: "10-K", filed: "2026-02-20" }] } };
  }
  return { facts: { "us-gaap": { Assets: { units: { USD: [{ end: "2025-12-31", val: 1000, accn: ACC, form: "10-K", filed: "2026-02-20" }] } }, ...g } } };
}
const annualOf = (values) => mapSecFinancials(facts(values), FILINGS, "0000000001").annual;

test("Schulden wie KO: LongTermDebtAndCapitalLeaseObligations + kurzfristig + CP + sonstige kurzfristige Kredite", () => {
  const a = annualOf({ LongTermDebtAndCapitalLeaseObligations: 42119, LongTermDebtAndCapitalLeaseObligationsCurrent: 1822, CommercialPaper: 1495, OtherShortTermBorrowings: 56 });
  assert.equal(a.balance.interestBearingDebtExLeases, 45492);
  assert.equal(a.sourceConcepts.interestBearingDebtExLeases.financeLeaseIncluded, undefined);
});

test("Schulden: Finanzierungsleasing wird herausgerechnet; nicht trennbar → vorsichtig enthalten", () => {
  const a = annualOf({ LongTermDebtAndCapitalLeaseObligations: 500, LongTermDebtAndCapitalLeaseObligationsCurrent: 60, FinanceLeaseLiabilityNoncurrent: 40, FinanceLeaseLiabilityCurrent: 10 });
  assert.equal(a.balance.interestBearingDebtExLeases, 500 - 40 + 60 - 10);
  assert.equal(a.balance.leaseLiabilities, 50);
  const b = annualOf({ LongTermDebtAndCapitalLeaseObligations: 500, FinanceLeaseLiability: 50 });
  assert.equal(b.balance.interestBearingDebtExLeases, 500);
  assert.equal(b.sourceConcepts.interestBearingDebtExLeases.financeLeaseIncluded, true);
});

test("Schulden: nur kurzfristige Posten ohne langfristigen Teil → null", () => {
  assert.equal(annualOf({ CommercialPaper: 1495, OtherShortTermBorrowings: 56 }).balance.interestBearingDebtExLeases, null);
});

test("Anlagen wie KO: OtherShortTermInvestments + MarketableSecurities; EquityMethodInvestments nur ohne Gesamtzeile", () => {
  const ko = annualOf({ OtherShortTermInvestments: 3602, MarketableSecurities: 1934, EquityMethodInvestments: 20235 });
  assert.equal(ko.balance.shortTermInvestments, 5536);
  assert.equal(ko.balance.longTermInvestments, 20235);
  // MSFT: Gesamtzeile LongTermInvestments enthält die Beteiligungen schon
  const msft = annualOf({ LongTermInvestments: 36348, EquityMethodInvestments: 12000 });
  assert.equal(msft.balance.longTermInvestments, 36348);
  // MarketableSecurities ohne Current/Noncurrent nur, wenn keine Aufteilung gemeldet ist
  const split = annualOf({ MarketableSecuritiesCurrent: 100, MarketableSecuritiesNoncurrent: 300, MarketableSecurities: 400 });
  assert.equal(split.balance.shortTermInvestments, 100);
  assert.equal(split.balance.longTermInvestments, 300);
});

test("Zinserträge: Vorrang, Konzept mit Dividenden vorsichtig vollständig gezählt, Saldo nie, negativ → null", () => {
  const ko = annualOf({ InvestmentIncomeInterest: [786], InvestmentIncomeNet: [900] });
  assert.equal(ko.income.interestIncome, 786);
  assert.equal(ko.sourceConcepts.interestIncome.inclusive, undefined);
  const msft = annualOf({ InvestmentIncomeNet: [3301] });
  assert.equal(msft.income.interestIncome, 3301);
  assert.equal(msft.sourceConcepts.interestIncome.inclusive, true);
  assert.equal(msft.sourceConcepts.interestIncome.note, "vorsichtig vollständig gezählt");
  assert.equal(annualOf({ NonoperatingIncomeExpense: [670], OtherNonoperatingIncomeExpense: [120] }).income.interestIncome, null);
  assert.equal(annualOf({ InvestmentIncomeNet: [-50] }).income.interestIncome, null);
  for (const c of ["InvestmentIncomeInterest", "InterestIncomeOther", "InvestmentIncomeInterestAndDividend", "InterestAndOtherIncome"]) {
    assert.ok(CONCEPTS.interestIncome.concepts.includes(c), c);
  }
});

// Bilanz-Abgleich
const CAL = `<?xml version="1.0"?><link:linkbase xmlns:link="http://www.xbrl.org/2003/linkbase">
<link:calculationLink xlink:role="http://example.com/role/BALANCESHEET" xlink:type="extended">
 <link:loc xlink:type="locator" xlink:href="https://xbrl.fasb.org/us-gaap-2025.xsd#us-gaap_Assets" xlink:label="a"/>
 <link:loc xlink:type="locator" xlink:href="https://xbrl.fasb.org/us-gaap-2025.xsd#us-gaap_AssetsCurrent" xlink:label="ac"/>
 <link:loc xlink:type="locator" xlink:href="https://xbrl.fasb.org/us-gaap-2025.xsd#us-gaap_CashAndCashEquivalentsAtCarryingValue" xlink:label="cash"/>
 <link:loc xlink:type="locator" xlink:href="https://xbrl.fasb.org/us-gaap-2025.xsd#us-gaap_AccountsReceivableNetCurrent" xlink:label="ar"/>
 <link:loc xlink:type="locator" xlink:href="https://xbrl.fasb.org/us-gaap-2025.xsd#us-gaap_PropertyPlantAndEquipmentNet" xlink:label="ppe"/>
 <link:calculationArc xlink:type="arc" xlink:from="a" xlink:to="ac" weight="1.0"/>
 <link:calculationArc xlink:type="arc" xlink:from="a" xlink:to="ppe" weight="1.0"/>
 <link:calculationArc xlink:type="arc" xlink:from="ac" xlink:to="cash" weight="1.0"/>
 <link:calculationArc xlink:type="arc" xlink:from="ac" xlink:to="ar" weight="1.0"/>
</link:calculationLink>
<link:calculationLink xlink:role="http://example.com/role/OTHER" xlink:type="extended"></link:calculationLink>
</link:linkbase>`;

test("Rechenstruktur: Bilanzzeilen unter Assets, Zwischensummen aufgelöst (auch ohne Präfix, eingebettet in .xsd)", () => {
  const leaves = balanceLeavesFromCalc(CAL);
  assert.deepEqual(leaves.map((l) => l.concept).sort(), ["us-gaap:AccountsReceivableNetCurrent", "us-gaap:CashAndCashEquivalentsAtCarryingValue", "us-gaap:PropertyPlantAndEquipmentNet"]);
  const xsd = `<xs:schema><xs:annotation><xs:appinfo>${CAL.replace(/<(\/?)link:/g, "<$1")}</xs:appinfo></xs:annotation></xs:schema>`;
  assert.equal(balanceLeavesFromCalc(xsd).length, 3);
  assert.equal(balanceLeavesFromCalc("<x/>"), null);
});

test("Bilanz-Abgleich: Zeilen erklären Assets (≤ 1 %) → fehlende Posten 0 mit Vermerk", () => {
  const a = annualOf({ CashAndCashEquivalentsAtCarryingValue: 300, AccountsReceivableNetCurrent: 200, PropertyPlantAndEquipmentNet: 495 });
  const leaves = balanceLeavesFromCalc(CAL);
  const res = applyBalanceReconciliation(a, leaves, balanceValueOf(facts({ CashAndCashEquivalentsAtCarryingValue: 300, AccountsReceivableNetCurrent: 200, PropertyPlantAndEquipmentNet: 495 }), { end: "2025-12-31", accns: [ACC], unit: "USD" }), ACC);
  assert.equal(res.ok, true);
  assert.deepEqual(res.zeroed.sort(), ["goodwill", "intangiblesExGoodwill", "inventory", "longTermInvestments", "shortTermInvestments"]);
  assert.equal(a.balance.goodwill, 0);
  assert.equal(a.sourceConcepts.goodwill.note, RECONCILIATION_NOTE);
  assert.equal(a.balance.netReceivables, 200); // vorhanden, bleibt
});

test("Bilanz-Abgleich: Abweichung > 1 %, unbekannte Zeile, Zeile ohne Wert oder große Sammelzeile → null", () => {
  const leaves = balanceLeavesFromCalc(CAL);
  const run = (values, lv = leaves) => {
    const a = annualOf(values);
    const r = applyBalanceReconciliation(a, lv, balanceValueOf(facts(values), { end: "2025-12-31", accns: [ACC], unit: "USD" }), ACC);
    return { r, a };
  };
  const gap = run({ CashAndCashEquivalentsAtCarryingValue: 300, AccountsReceivableNetCurrent: 200, PropertyPlantAndEquipmentNet: 400 });
  assert.equal(gap.r.ok, false);
  assert.equal(gap.a.balance.goodwill, null);
  const unknown = run({ CashAndCashEquivalentsAtCarryingValue: 300, AccountsReceivableNetCurrent: 200, PropertyPlantAndEquipmentNet: 495 }, [...leaves, { concept: "abc:SpecialAssets", weight: 1 }]);
  assert.match(unknown.r.reason, /unbekannte Bilanzzeile/);
  const noValue = run({ CashAndCashEquivalentsAtCarryingValue: 300, PropertyPlantAndEquipmentNet: 495 });
  assert.match(noValue.r.reason, /ohne Wert/);
  // Sammelzeile „Other non-current assets“ 20 % → fehlender Firmenwert kann darin stecken
  const other = run(
    { CashAndCashEquivalentsAtCarryingValue: 300, AccountsReceivableNetCurrent: 200, PropertyPlantAndEquipmentNet: 295, OtherAssetsNoncurrent: 200 },
    [...leaves, { concept: "us-gaap:OtherAssetsNoncurrent", weight: 1 }]
  );
  assert.equal(other.r.ok, false);
  assert.match(other.r.reason, /Sammelzeilen/);
  assert.equal(other.a.balance.goodwill, null);
  assert.ok(CATCH_ALL.has("OtherAssetsNoncurrent"));
});

test("Abruf: Bilanz-Abgleich lädt die Rechenstruktur nur bei fehlenden Posten (index.json, dann *_cal.xml)", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.endsWith("company_tickers.json")) return json(200, SAMPLE.tickers);
    if (url.includes("/submissions/")) return json(200, SAMPLE.submissions);
    if (url.includes("/companyfacts/")) return json(200, SAMPLE.companyfacts);
    if (url.endsWith("/index.json")) return json(200, { directory: { item: [{ name: "bspl-20250930_cal.xml" }, { name: "bspl-20250930.xsd" }] } });
    if (url.endsWith("_cal.xml")) return { ok: true, status: 200, text: async () => CAL };
    return json(404, {});
  };
  const p = createSecProvider({ userAgent: "Tazkiyah test@example.org", fetchImpl, sleepImpl: async () => {} });
  const res = await p.getFinancialPeriods("BSPL");
  assert.ok(urls.some((u) => u.endsWith("/000123456725000052/index.json"))); // Einreichung der Bilanzsumme (10-K/A)
  assert.ok(urls.some((u) => u.endsWith("bspl-20250930_cal.xml")));
  // Beispielfirma: Zeilen erklären Assets nicht → Hinweis, Posten bleiben null
  assert.equal(res.annual.balance.goodwill, null);
  assert.ok(res.notes.some((n) => /Bilanz-Abgleich 2025-09-30 nicht möglich/.test(n)));
});
