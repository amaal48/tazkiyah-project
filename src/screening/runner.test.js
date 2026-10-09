// src/screening/runner.test.js — ausführen mit: node --test src/screening/runner.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScreening, needsFreshData, needsRescreen, withDeadline, CALLS_PER_TITLE, INPUT_DATA_VERSION } from "./runner.js";
import { emptySnapshot } from "./providers/model.js";
import { germanVenuesFromMapping } from "./providers/openfigi.js";
import { STATUS } from "./engine.js";

const NOW = new Date("2026-09-30T03:00:00Z");
const DAY_MS = 86400000;

function snap(type, end) {
  const s = emptySnapshot(type, end);
  Object.assign(s, { currency: "USD", marketCapAtPeriodEnd: 1000, priceAtPeriodEnd: 100, sharesOutstanding: 10, sharesBasis: "weighted_average" });
  Object.assign(s.balance, {
    interestBearingDebtExLeases: 100, leaseLiabilities: 0, cash: 50, shortTermInvestments: 0, longTermInvestments: 0,
    netReceivables: 100, inventory: 50, goodwill: 0, intangiblesExGoodwill: 0, totalAssets: 1000, currentLiabilities: 80,
  });
  Object.assign(s.income, { revenue: 100, interestIncome: 1, otherIncome: 0, netIncome: 20, distributions: 5 });
  return s;
}

function fakeProvider({ failFor = [] } = {}) {
  const calls = [];
  return {
    id: "fake",
    calls,
    async getProfile(symbol) {
      calls.push(symbol);
      if (failFor.includes(symbol)) throw new Error("404");
      return { symbol, isin: `US${symbol}0000000`.slice(0, 12), industry: "Software - Infrastructure", description: "" };
    },
    async getFinancialPeriods() {
      return { annual: snap("annual", "2025-12-31"), quarters: ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"].map((d) => snap("quarter", d)) };
    },
    async getFxToEurSeries() {
      return { currency: "USD", series: [{ date: "2026-06-30", eurPerUnit: 0.9 }] };
    },
  };
}

function memoryRepo(securities, { reviews = [], holdings = [] } = {}) {
  const db = { securities: securities.map((s) => ({ updated_at: "2026-01-01T00:00:00Z", ...s })), runs: [], reviews, holdings, purification: [], usage: 0 };
  return {
    db,
    async loadState() {
      const currentRuns = new Map();
      for (const r of db.runs) currentRuns.set(r.security_id, r);
      const reviewsBySecurity = new Map();
      const lastReviewAt = new Map();
      for (const r of db.reviews) {
        reviewsBySecurity.set(r.security_id, [...(reviewsBySecurity.get(r.security_id) || []), r]);
        if (!lastReviewAt.get(r.security_id) || r.reviewed_at > lastReviewAt.get(r.security_id)) lastReviewAt.set(r.security_id, r.reviewed_at);
      }
      const holdingsByEtf = new Map();
      for (const h of db.holdings) holdingsByEtf.set(h.etf_id, [...(holdingsByEtf.get(h.etf_id) || []), h]);
      const purificationRate = new Map(db.purification.map((p) => [p.security_id, p.rate]));
      return { securities: db.securities.map((s) => ({ ...s })), currentRuns, reviewsBySecurity, lastReviewAt, holdingsByEtf, purificationRate, usedToday: db.usage };
    },
    async saveRun(securityId, result, inputs, fp) {
      const id = db.runs.length + 1;
      db.runs.push({ id, security_id: securityId, run_at: result.screenedAt, status: result.status, quarter_period_end: result.dataBasis.quarterPeriodEnd,
        engine_version: result.engineVersion, parameters_version: result.parametersVersion, inputs, fingerprint: fp, result });
      for (const p of result.purification?.periods || []) if (p.calculable) db.purification.push({ security_id: securityId, rate: p.ratePctOfPrice });
      return id;
    },
    async updateSecurity(id, patch) {
      Object.assign(db.securities.find((s) => s.id === id), patch, { updated_at: NOW.toISOString() });
    },
    async addUsage(_p, n) {
      db.usage += n;
      return db.usage;
    },
  };
}

/** Repo mit Sperre wie in Supabase (für Tests gleichzeitiger Läufe). */
function lockingRepo(securities) {
  const repo = memoryRepo(securities);
  let holder = null;
  repo.acquireLock = async (h) => {
    if (holder) return false;
    holder = h;
    return true;
  };
  repo.releaseLock = async (h) => {
    if (holder === h) holder = null;
  };
  return repo;
}

const stocks = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"].map((t) => ({
  id: t, ticker: t, name: t, asset_type: "stock", product_type: "standard", share_class: "common", provider_symbol: t, german_venues: ["Xetra"],
}));

test("Budget begrenzt die Zahl der Titel; Abrufe werden gezählt", async () => {
  const repo = memoryRepo(stocks);
  const provider = fakeProvider();
  const s = await runScreening({ repo, provider, now: NOW, dailyCallBudget: 33 });
  assert.equal(s.fetched.length, 4); // (33 - 1 FX-Abruf) / 8 = 4
  assert.equal(repo.db.usage, 1 + 4 * CALLS_PER_TITLE);
  assert.equal(s.pending.fetch, 2);
  assert.equal(repo.db.runs.length, 4);
  // Ohne A2/B3-Prüfungen: nicht geprüft
  assert.ok(repo.db.runs.every((r) => r.status === STATUS.NOT_CHECKED));
  // ISIN aus dem Profil übernommen, EUR-Kurs gesetzt
  assert.ok(repo.db.securities.find((x) => x.id === "AAA").isin);
  assert.equal(repo.db.runs[0].inputs.quarters[0].fxToEurAtPeriodEnd, 0.9);
  // Purification erst mit gültiger B3-Segmentprüfung berechenbar
  assert.equal(repo.db.runs[0].result.purification.periods[0].calculable, false);
});

test("Budget je Anbieter: eigene Abrufzahl je Titel (callsPerTitle) und eigener Zähler (usageKey)", async () => {
  const repo = memoryRepo(stocks);
  const keys = [];
  const loadState = repo.loadState;
  repo.loadState = async (args) => {
    keys.push(["load", args.provider]);
    return loadState(args);
  };
  const addUsage = repo.addUsage;
  repo.addUsage = async (key, n) => {
    keys.push(["add", key]);
    return addUsage(key, n);
  };
  const { getFxToEurSeries: _noFx, ...base } = fakeProvider();
  const provider = { ...base, id: "sec", usageKey: "sec", callsPerTitle: 2, getCallCount: () => 99 };
  const s = await runScreening({ repo, provider, now: NOW, dailyCallBudget: 7 });
  assert.equal(s.fetched.length, 3); // 7 / 2 = 3 Titel, kein EUR-Abruf
  assert.equal(repo.db.usage, 6);
  assert.ok(keys.every(([, k]) => k === "sec"));
  assert.equal(s.provider, "sec");
  assert.equal(s.providerCalls, 99);
  assert.equal(repo.db.runs[0].inputs.provider, "sec");
});

test("Gespeicherte FMP-Daten: Zinserträge 0 bei vorhandenen Anlagen werden bei der Neuberechnung null", async () => {
  const repo = memoryRepo([stocks[0]]);
  await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 100 });
  const run = repo.db.runs[0];
  run.inputs.provider = "fmp";
  run.inputs.annual.income.interestIncome = 0;
  run.engine_version = "0.0.0"; // erzwingt Neuberechnung ohne Abruf
  const s = await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 100 });
  assert.equal(s.rescreened.length, 1);
  assert.equal(repo.db.runs.at(-1).inputs.annual.income.interestIncome, null);
});

test("Zweiter Lauf am selben Tag: kein Budget mehr, nichts doppelt", async () => {
  const repo = memoryRepo(stocks);
  await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 33 });
  const s2 = await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 33 });
  assert.equal(s2.fetched.length, 0);
  assert.equal(repo.db.runs.length, 4);
});

test("Neue manuelle Prüfung → Neuberechnung ohne API-Abruf", async () => {
  const repo = memoryRepo(stocks.slice(0, 1));
  await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 200 });
  const later = new Date("2026-10-02T03:00:00Z");
  for (const c of ["A2", "B3_SEGMENTS"]) {
    repo.db.reviews.push({ security_id: "AAA", criterion: c, result: "pass", details: {}, source_url: "x", reviewer: "A.", reviewed_at: "2026-10-01T10:00:00Z", basis_annual_period_end: "2025-12-31" });
  }
  const provider = fakeProvider();
  const s = await runScreening({ repo, provider, now: later, dailyCallBudget: 200 });
  assert.equal(provider.calls.length, 0);
  assert.equal(s.rescreened.length, 1);
  assert.equal(repo.db.runs.at(-1).status, STATUS.CONFORM);
  // Ohne Änderung: kein weiterer Eintrag
  await runScreening({ repo, provider, now: new Date("2026-10-03T03:00:00Z"), dailyCallBudget: 200 });
  assert.equal(repo.db.runs.length, 2);
});

test("Abruffehler wird vermerkt, Titel nicht täglich erneut versucht", async () => {
  const repo = memoryRepo(stocks.slice(0, 2));
  const s = await runScreening({ repo, provider: fakeProvider({ failFor: ["BBB"] }), now: NOW, dailyCallBudget: 200 });
  assert.equal(s.fetchErrors.length, 1);
  assert.equal(repo.db.securities.find((x) => x.id === "BBB").last_error, "404");
  const p2 = fakeProvider();
  await runScreening({ repo, provider: p2, now: new Date("2026-10-01T03:00:00Z"), dailyCallBudget: 200 });
  assert.equal(p2.calls.length, 0);
});

test("dryRun speichert nichts", async () => {
  const repo = memoryRepo(stocks.slice(0, 2));
  const s = await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 200, dryRun: true });
  assert.equal(s.results.length, 2);
  assert.equal(repo.db.runs.length, 0);
});

test("Fälligkeit neuer Daten: erst ca. 45 Tage nach erwartetem Quartalsende", () => {
  const run = { quarter_period_end: "2026-06-30", inputs: { fetchedAt: "2026-08-20T00:00:00Z", dataVersion: INPUT_DATA_VERSION } };
  assert.equal(needsFreshData({}, run, Date.parse("2026-10-15T00:00:00Z")), false);
  assert.equal(needsFreshData({}, run, Date.parse("2026-11-20T00:00:00Z")), true);
  assert.equal(needsFreshData({}, null, NOW.getTime()), true);
});

test("Neue Engine-Version → Neuberechnung", () => {
  assert.equal(needsRescreen({}, { engine_version: "0.9", parameters_version: "x", run_at: NOW.toISOString() }, null), true);
});

test("ETF: Holdings-Status und Reinigungsquote aus den Aktien-Ergebnissen", async () => {
  const secs = [
    { ...stocks[0], isin: "US1" },
    { id: "ETF", ticker: "ETF", name: "ETF", asset_type: "etf", product_type: "standard", isin: "IE1", is_ucits: true, has_kid: true, fund_annual_report_date: "2026-05-31" },
  ];
  const reviews = ["A2", "B3_SEGMENTS"].map((c) => ({ security_id: "AAA", criterion: c, result: "pass", details: {}, source_url: "x", reviewer: "A.", reviewed_at: "2026-09-01T00:00:00Z", basis_annual_period_end: "2025-12-31" }));
  const repo = memoryRepo(secs, { reviews, holdings: [{ etf_id: "ETF", holding_isin: "US1", weight: 100, as_of: "2026-09-01" }] });
  const s = await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 200 });
  const etfRun = repo.db.runs.find((r) => r.security_id === "ETF");
  const g1 = etfRun.result.criteria.find((c) => c.id === "G1");
  assert.equal(g1.result, "pass"); // enthaltene Aktie ist konform
  assert.equal(repo.db.runs.find((r) => r.security_id === "AAA").result.purification.periods[0].amountPerShareEur, 0.09);
  assert.equal(etfRun.result.purification.coveragePct, 100);
  assert.equal(s.etfs.length, 1);
});

test("Universum: deutsche Handelsplätze werden gespeichert", async () => {
  const repo = memoryRepo([{ ...stocks[0], isin: "US1", german_venues: [] }]);
  const venues = { maxPerRun: 50, async lookup(isins) { return new Map(isins.map((i) => [i, ["Xetra"]])); } };
  const s = await runScreening({ repo, provider: fakeProvider(), venues, now: NOW, dailyCallBudget: 0 });
  assert.equal(s.universeChecked, 1);
  assert.deepEqual(repo.db.securities[0].german_venues, ["Xetra"]);
});

test("OpenFIGI-Auswertung", () => {
  assert.deepEqual(germanVenuesFromMapping({ data: [{ exchCode: "US" }, { exchCode: "GY" }, { exchCode: "GF" }, { exchCode: "GY" }] }), ["Frankfurt", "Xetra"]);
  assert.deepEqual(germanVenuesFromMapping({ warning: "No identifier found." }), []);
  assert.equal(germanVenuesFromMapping({ error: "Too many requests" }), undefined);
});

test("ETF: Holdings ohne ISIN werden über Ticker + Land zugeordnet", async () => {
  const secs = [
    { ...stocks[0], id: "BRK", ticker: "BRK-B" },
    { id: "ETF", ticker: "ETF", name: "ETF", asset_type: "etf", product_type: "standard", isin: "IE1", is_ucits: true, has_kid: true, fund_annual_report_date: "2026-05-31" },
  ];
  const repo = memoryRepo(secs, { holdings: [
    { etf_id: "ETF", holding_isin: "TICKER:BRKB:United States", holding_ticker: "BRKB", holding_country: "United States", weight: 60, as_of: "2026-09-01" },
    { etf_id: "ETF", holding_isin: "TICKER:ASML:Netherlands", holding_ticker: "ASML", holding_country: "Netherlands", weight: 40, as_of: "2026-09-01" },
  ] });
  await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 200 });
  const g1 = repo.db.runs.find((r) => r.security_id === "ETF").result.criteria.find((c) => c.id === "G1");
  // BRK-B zugeordnet (Status vorhanden), ASML nicht im Universum → nicht geprüft
  assert.equal(g1.checks[0].uncheckedCount, 2); // beide „nicht geprüft“: BRK-B ohne A2/B3-Prüfung
  assert.equal(g1.result, "not_checked");
});

test("Tageslimit beim Anbieter: Abbruch, Titel nicht als fehlerhaft markiert, später erneut", async () => {
  const repo = memoryRepo(stocks.slice(0, 4));
  const provider = fakeProvider();
  let n = 0;
  provider.getProfile = async (symbol) => {
    provider.calls.push(symbol);
    if (++n > 1) throw Object.assign(new Error("FMP profile 429: Limit Reach"), { kind: "limit" });
    return { symbol, isin: null, industry: "Software - Infrastructure", description: "" };
  };
  const s = await runScreening({ repo, provider, now: NOW, dailyCallBudget: 200 });
  assert.equal(s.stoppedReason, "Tageslimit beim Datenanbieter erreicht");
  assert.equal(s.fetched.length, 1);
  assert.equal(s.fetchErrors.length, 0);
  assert.ok(repo.db.securities.every((x) => !x.last_error));
  // Nicht abgerufene Titel sind beim nächsten Lauf wieder fällig
  const skipped = repo.db.securities.filter((x) => !x.data_fetched_at);
  assert.ok(skipped.length >= 1);
  assert.ok(skipped.every((x) => needsFreshData(x, null, NOW.getTime() + 86400000)));
});

test("Sperre: Ein zweiter gleichzeitiger Lauf wird übersprungen", async () => {
  const repo = lockingRepo(stocks);
  const slow = fakeProvider();
  const orig = slow.getFinancialPeriods;
  slow.getFinancialPeriods = async (...a) => {
    await new Promise((r) => setTimeout(r, 20));
    return orig(...a);
  };
  const [a, b] = await Promise.all([
    runScreening({ repo, provider: slow, now: NOW, dailyCallBudget: 33 }),
    runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 33 }),
  ]);
  assert.equal([a, b].filter((x) => x.skipped).length, 1);
  assert.ok(repo.db.usage <= 33);
  assert.equal(repo.db.runs.filter((r) => r.security_id === "AAA").length, 1);
  // Nach dem Lauf ist die Sperre wieder frei
  const c = await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 33 });
  assert.equal(c.skipped, undefined);
});

test("Budget hält auch ohne Sperre bei parallelen Läufen (atomare Reservierung)", async () => {
  const repo = memoryRepo(stocks);
  // Beide Läufe sehen beim Start usedToday = 0 und planen je 4 Titel
  await Promise.all([
    runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 33 }),
    runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 33 }),
  ]);
  assert.ok(repo.db.usage <= 33, `verbraucht: ${repo.db.usage}`);
});

test("Quartale im Tarif gesperrt: Jahreswerte gespeichert, Abruf erst nach neuem Jahresabschluss", async () => {
  const repo = memoryRepo(stocks.slice(0, 1));
  const provider = fakeProvider();
  provider.getFinancialPeriods = async () => ({
    annual: snap("annual", "2025-12-31"),
    quarters: [],
    notes: ["Quartalsdaten im aktuellen Datentarif nicht verfügbar"],
  });
  const s = await runScreening({ repo, provider, now: NOW, dailyCallBudget: 200 });
  assert.deepEqual(s.dataNotes, ["Quartalsdaten im aktuellen Datentarif nicht verfügbar"]);
  const run = repo.db.runs[0];
  assert.equal(run.status, STATUS.NOT_CHECKED);
  assert.equal(run.inputs.quartersAvailable, false);
  // Nicht wöchentlich neu abrufen, sondern erst ca. 75 Tage nach dem nächsten Geschäftsjahresende
  assert.equal(needsFreshData({}, run, Date.parse("2026-11-01T00:00:00Z")), false);
  assert.equal(needsFreshData({}, run, Date.parse("2027-03-20T00:00:00Z")), true);
});

function derivedProvider(ciks) {
  const provider = fakeProvider();
  provider.getProfile = async (symbol) => {
    provider.calls.push(symbol);
    return { symbol, isin: null, industry: "Software - Infrastructure", description: "", cik: ciks[symbol] ?? null };
  };
  provider.getFinancialPeriods = async () => {
    const mark = (x) => Object.assign(x, { marketCapSource: "price_x_weighted_avg_shares" });
    return { annual: mark(snap("annual", "2025-12-31")), quarters: ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"].map((d) => mark(snap("quarter", d))) };
  };
  return provider;
}
const b1Of = (repo, id) => repo.db.runs.filter((r) => r.security_id === id).at(-1).result.criteria.find((c) => c.id === "B1");

test("Mehrere Aktiengattungen (gleiche CIK): B1 nicht geprüft; verschiedene CIK: normal", async () => {
  const two = [{ ...stocks[0], id: "G1", ticker: "GOOGL", provider_symbol: "GOOGL" }, { ...stocks[1], id: "G2", ticker: "GOOG", provider_symbol: "GOOG" }];
  const repo = memoryRepo(two);
  await runScreening({ repo, provider: derivedProvider({ GOOGL: "1652044", GOOG: "1652044" }), now: NOW, dailyCallBudget: 200 });
  for (const id of ["G1", "G2"]) {
    assert.equal(b1Of(repo, id).result, "not_checked");
    assert.match(b1Of(repo, id).checks[0].reason, /mehrere Aktiengattungen/);
  }
  const repo2 = memoryRepo(two);
  await runScreening({ repo: repo2, provider: derivedProvider({ GOOGL: "1", GOOG: "2" }), now: NOW, dailyCallBudget: 200 });
  assert.equal(b1Of(repo2, "G1").result, "pass");
});

test("Schwester-Titel kommt später dazu: erster Titel wird ohne Abruf neu gerechnet", async () => {
  const first = [{ ...stocks[0], id: "G1", ticker: "GOOGL", provider_symbol: "GOOGL" }];
  const repo = memoryRepo(first);
  const ciks = { GOOGL: "1652044", GOOG: "1652044" };
  await runScreening({ repo, provider: derivedProvider(ciks), now: NOW, dailyCallBudget: 200 });
  assert.equal(b1Of(repo, "G1").result, "pass"); // allein im Universum
  repo.db.securities.push({ updated_at: "2026-01-01T00:00:00Z", ...stocks[1], id: "G2", ticker: "GOOG", provider_symbol: "GOOG", data_fetched_at: null });
  const later = new Date("2026-10-08T03:00:00Z");
  const provider = derivedProvider(ciks);
  const s = await runScreening({ repo, provider, now: later, dailyCallBudget: 200 });
  assert.deepEqual(provider.calls, ["GOOG"]); // nur der neue Titel wurde abgerufen
  assert.equal(b1Of(repo, "G1").result, "not_checked");
  assert.equal(b1Of(repo, "G2").result, "not_checked");
  assert.ok(s.rescreened.some((x) => x.ticker === "GOOGL"));
});

test("Manueller Lauf für bestimmte Ticker: nur diese, mit force auch bei frischen Daten", async () => {
  const repo = memoryRepo(stocks);
  await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 200 }); // alle 6 frisch
  const next = new Date(NOW.getTime() + DAY_MS);

  const p1 = fakeProvider();
  const s1 = await runScreening({ repo, provider: p1, now: next, dailyCallBudget: 400, onlyTickers: ["bbb", "zzz"], force: true });
  assert.deepEqual(p1.calls, ["BBB"]);
  assert.deepEqual(s1.unknownTickers, ["ZZZ"]);

  // ohne force: frische Daten werden nicht erneut abgerufen
  const p2 = fakeProvider();
  await runScreening({ repo, provider: p2, now: next, dailyCallBudget: 400, onlyTickers: ["CCC"] });
  assert.equal(p2.calls.length, 0);
});

test("Eingangsdaten aus älterer Datenaufbereitung werden trotz frischem Abruf neu geholt", () => {
  const now = Date.parse("2026-10-02T05:00:00Z");
  const old = { quarter_period_end: "2026-06-30", inputs: { fetchedAt: "2026-09-30T20:00:00Z" } }; // vor Engine 1.2.0
  assert.equal(needsFreshData({ data_fetched_at: "2026-09-30T20:00:00Z" }, old, now), true);
  const current = { quarter_period_end: "2026-06-30", inputs: { fetchedAt: "2026-10-01T10:00:00Z", dataVersion: INPUT_DATA_VERSION } };
  assert.equal(needsFreshData({}, current, now), false);
  // Läufe von Engine 1.2.0 ohne eigene Versionsnummer gelten als aktuell
  const v12 = { quarter_period_end: "2026-06-30", inputs: { fetchedAt: "2026-10-02T10:00:00Z", multiClassIssuer: false } };
  assert.equal(needsFreshData({}, v12, now), false);
});

test("Neu abgerufene Titel tragen die Datenversion; ein zweiter Lauf ruft sie nicht erneut ab", async () => {
  const repo = memoryRepo(stocks.slice(0, 1));
  await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 200 });
  assert.equal(repo.db.runs[0].inputs.dataVersion, INPUT_DATA_VERSION);
  const p = fakeProvider();
  await runScreening({ repo, provider: p, now: new Date(NOW.getTime() + 10 * DAY_MS), dailyCallBudget: 200 });
  assert.equal(p.calls.length, 0);
});

test("Inaktive Titel (active = false) werden nicht abgerufen", async () => {
  const repo = memoryRepo(stocks.map((x) => (x.id === "BBB" ? { ...x, active: false } : x)));
  const s = await runScreening({ repo, provider: fakeProvider(), now: NOW, dailyCallBudget: 1000 });
  assert.equal(s.fetched.length, 5);
  assert.ok(!s.fetched.some((f) => f.ticker === "BBB"));
});

test("withDeadline: hängender Abruf endet rechtzeitig mit kind „deadline“", async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 10), (e) => e.kind === "deadline");
  assert.equal(await withDeadline(Promise.resolve(7), 1000), 7);
});

test("Zeitlimit des Laufs: hängender Titel wird übersprungen, nicht als Fehler markiert", async () => {
  const repo = memoryRepo(stocks.slice(0, 1));
  const provider = { ...fakeProvider(), getFinancialPeriods: () => new Promise(() => {}) };
  const s = await runScreening({ repo, provider, now: NOW, dailyCallBudget: 1000, timeBudgetMs: 3150, titleStartReserveMs: 0 });
  assert.deepEqual(s.deadlineSkipped, ["AAA"]);
  assert.equal(s.fetchErrors.length, 0);
  assert.equal(repo.db.securities.find((x) => x.id === "AAA").last_error ?? null, null);
});
