// src/screening/providers/sec.test.js — ausführen mit: node --test src/screening/providers/sec.test.js
// Keine echten Netzaufrufe: gekürzte Beispielantworten in ./fixtures/sec-sample.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONCEPTS,
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

test("Konzept-Vorrang: Revenues vor RevenueFromContract…, ShortTermInvestments vor MarketableSecuritiesCurrent", () => {
  assert.equal(q("2025-12-31").income.revenue, 270);
  assert.equal(q("2025-12-31").sourceConcepts.revenue.concept, "Revenues");
  assert.equal(r.annual.balance.shortTermInvestments, 70);
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
  // Kein Posten: null, nicht 0
  assert.equal(q("2025-03-31").balance.interestBearingDebtExLeases, null);
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
