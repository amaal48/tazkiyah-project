// src/screening/publicResult.test.js — öffentliches Ergebnis ohne B1/B2-Werte (supabase_b1_b2_binaer.sql)
//
// Führt die SQL-Datei in einer echten Postgres-Datenbank im Arbeitsspeicher aus (PGlite) und prüft
// mit Ergebnissen der Engine, dass öffentlich keine Werte bleiben, aus denen sich Kurs oder
// Marktkapitalisierung zurückrechnen lassen, und dass das binäre Ergebnis erhalten bleibt.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { screenSecurity, RESULT } from "./engine.js";
import { emptySnapshot } from "./providers/model.js";

const SQL = readFileSync(new URL("../../supabase_b1_b2_binaer.sql", import.meta.url), "utf8");

// Felder, die öffentlich nirgends im Ergebnis stehen dürfen
const FORBIDDEN_KEYS = ["marketCapAtPeriodEnd", "marketCap", "priceAtPeriodEnd", "ratePctOfPrice", "prohibitedIncome", "sharesOutstanding"];

const ANNUAL_END = "2025-12-31";
const Q_ENDS = ["2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"];

function snap(type, end, balance = {}) {
  const s = emptySnapshot(type, end);
  Object.assign(s, {
    currency: "USD",
    marketCapAtPeriodEnd: 1000,
    priceAtPeriodEnd: 100,
    sharesOutstanding: 10,
    sharesBasis: "period_end",
    sourceFiling: { form: type === "annual" ? "10-K" : "10-Q", filingDate: "2026-02-01", url: `https://www.sec.gov/Archives/edgar/data/1/${end}/` },
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
    ...balance,
  });
  Object.assign(s.income, { revenue: type === "annual" ? 400 : 100, interestIncome: type === "annual" ? 4 : 1, otherIncome: 0, netIncome: 20, distributions: 5 });
  return s;
}

const REVIEWS = ["A2", "B3_SEGMENTS"].map((criterion) => ({
  criterion,
  result: "pass",
  reviewedAt: "2026-03-01",
  basisAnnualPeriodEnd: ANNUAL_END,
  sourceUrl: "https://example.com/10k",
  verification: "full",
}));

function screen(ticker, latestQuarterBalance = {}) {
  return screenSecurity({
    security: { ticker, isin: `US${ticker.padEnd(10, "0")}`, assetType: "stock", productType: "standard", shareClass: "common", germanVenues: ["XETRA"], universeCheckedAt: "2026-09-01" },
    profile: { industry: "Software - Infrastructure" },
    annual: snap("annual", ANNUAL_END),
    quarters: Q_ENDS.map((d, i) => snap("quarter", d, i === 0 ? latestQuarterBalance : {})),
    manualReviews: REVIEWS,
    now: new Date("2026-10-11T00:00:00Z"),
  });
}

// PASS: B1 12 %, B2 10 %. FAIL: Quartal mit Schulden 300 → B1 32 %. B2 über der Grenze: Cash 400.
// Als JSON, wie gespeichert (undefined-Felder fallen weg)
const asJson = (x) => JSON.parse(JSON.stringify(x));
const RESULTS = { PASS: asJson(screen("PASS")), FAIL: asJson(screen("FAIL", { interestBearingDebtExLeases: 300, cash: 400 })) };

/** Alle Schlüssel eines JSON-Werts, auch verschachtelt. */
function allKeys(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  }
  return out;
}

const crit = (r, id) => r.criteria.find((c) => c.id === id);

let db;

async function migrate() {
  // Ergebnis der letzten Abfrage (Kontrolle am Ende der Datei)
  const res = await db.exec(SQL);
  return res[res.length - 1].rows[0];
}

before(async () => {
  db = new PGlite();
  // Nachbau des nötigen Supabase-Teils: Rollen, Tabellen und die Standard-Leserechte von Supabase
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create table public.securities (
      id uuid primary key default gen_random_uuid(), ticker text unique not null, isin text, name text not null,
      asset_type text not null, fund_annual_report_date date);
    create table public.screening_runs (
      id bigint generated always as identity primary key,
      security_id uuid not null references public.securities(id),
      status text not null, in_universe boolean not null, annual_period_end date, quarter_period_end date,
      result jsonb not null, parameters jsonb not null, engine_version text not null, parameters_version text not null,
      data_provider text, run_at timestamptz not null default now(), inputs jsonb, fingerprint text);
    create table public.manual_reviews (
      id bigint generated always as identity primary key, security_id uuid not null, criterion text not null,
      result text not null, reviewed_at timestamptz not null default now(), basis_annual_period_end date not null);
    create view public.screening_current as select * from public.screening_runs;
    grant usage on schema public to anon, authenticated, service_role;
    grant select on all tables in schema public to anon, authenticated, service_role;
  `);
  await migrate();
  for (const [ticker, r] of Object.entries(RESULTS)) {
    await db.query(
      `with s as (insert into public.securities (ticker, name, asset_type) values ($1, $1, 'stock') returning id)
       insert into public.screening_runs (security_id, status, in_universe, annual_period_end, quarter_period_end, result,
                                          parameters, engine_version, parameters_version, data_provider, inputs)
       select s.id, $2, true, $3, $4, $5, $6, $7, $8, 'sec_fmp', '{"raw": true}' from s`,
      [ticker, r.status, r.dataBasis.annualPeriodEnd, r.dataBasis.quarterPeriodEnd, JSON.stringify(r), JSON.stringify(r.parameters), r.engineVersion, r.parametersVersion]
    );
  }
});

after(async () => {
  await db?.close();
});

async function publicResult(ticker) {
  const { rows } = await db.query("select result from public.screening_current where ticker = $1", [ticker]);
  return rows[0].result;
}

test("Ausgangslage: Die Engine liefert intern B1/B2-Werte, Kurs und Reinigungsquote", () => {
  const r = RESULTS.FAIL;
  assert.equal(typeof crit(r, "B1").checks[1].value, "number");
  assert.equal(crit(r, "B1").checks[1].result, RESULT.FAIL);
  assert.equal(crit(r, "B2").checks[1].result, RESULT.FAIL);
  assert.ok(r.headline.failed.some((f) => f.criterion === "B1" && typeof f.check.value === "number"));
  assert.ok(r.purification.periods.some((p) => typeof p.ratePctOfPrice === "number"));
  assert.equal(r.zakat.trading.priceAtPeriodEnd, 100);
});

test("Öffentlich: B1/B2 ohne Wert, ohne Abstand zur Grenze, mit Ergebnis je Periode", async () => {
  for (const ticker of Object.keys(RESULTS)) {
    const pub = await publicResult(ticker);
    for (const id of ["B1", "B2"]) {
      const full = crit(RESULTS[ticker], id);
      const c = crit(pub, id);
      assert.equal(c.result, full.result);
      assert.equal(c.checks.length, full.checks.length);
      c.checks.forEach((x, i) => {
        assert.equal(x.value, undefined, `${ticker} ${id} value`);
        assert.equal(x.distanceToLimit, undefined, `${ticker} ${id} distanceToLimit`);
        assert.equal(x.result, full.checks[i].result);
        assert.equal(x.basis, full.checks[i].basis);
        assert.equal(x.periodEnd, full.checks[i].periodEnd);
        assert.equal(x.limit, 30);
        assert.equal(x.comparator, "<=");
      });
    }
  }
});

test("Öffentlich: Begründungszeile ohne B1/B2-Wert", async () => {
  const pub = await publicResult("FAIL");
  const b1 = pub.headline.failed.find((f) => f.criterion === "B1");
  assert.deepEqual(Object.keys(b1.check).sort(), ["basis", "comparator", "limit", "periodEnd"]);
  assert.equal(b1.check.basis, "quarter");
});

test("Öffentlich: kein Feld mit Kurs, Marktkapitalisierung oder Reinigung in % des Kurses", async () => {
  for (const ticker of Object.keys(RESULTS)) {
    const keys = allKeys(await publicResult(ticker));
    for (const k of FORBIDDEN_KEYS) assert.ok(!keys.has(k), `${ticker}: ${k}`);
  }
});

test("Öffentlich unverändert: B3, C1, Reinigungsbetrag je Aktie, Zakat, Status", async () => {
  const full = RESULTS.PASS;
  const pub = await publicResult("PASS");
  assert.equal(pub.status, full.status);
  assert.deepEqual(pub.summary, full.summary);
  assert.deepEqual(pub.dataBasis, full.dataBasis);
  for (const c of full.criteria.filter((x) => !["B1", "B2"].includes(x.id))) assert.deepEqual(crit(pub, c.id), c, c.id);
  assert.equal(typeof crit(pub, "B3").checks[0].value, "number");
  assert.equal(typeof crit(pub, "C1").checks[0].value, "number");
  pub.purification.periods.forEach((p, i) => assert.equal(p.amountPerShare, full.purification.periods[i].amountPerShare));
  assert.deepEqual(pub.zakat.longTerm, full.zakat.longTerm);
});

test("Intern: screening_current_internal und screening_runs.result behalten alle Werte", async () => {
  const { rows } = await db.query("select result, inputs from public.screening_current_internal where ticker = 'FAIL'");
  assert.deepEqual(rows[0].result, RESULTS.FAIL);
  assert.deepEqual(rows[0].inputs, { raw: true });
});

test("Rolle anon: liest die öffentliche View und public_result, aber nicht result, inputs oder die interne View", async () => {
  await db.exec("set role anon");
  try {
    const { rows } = await db.query("select result from public.screening_current where ticker = 'FAIL'");
    assert.equal(crit(rows[0].result, "B1").checks[1].value, undefined);
    assert.equal(crit(rows[0].result, "B1").checks[1].result, RESULT.FAIL);
    const hist = await db.query("select public_result from public.screening_runs");
    assert.equal(hist.rows.length, 2);
    await assert.rejects(db.query("select result from public.screening_runs"), /permission denied/);
    await assert.rejects(db.query("select inputs from public.screening_runs"), /permission denied/);
    await assert.rejects(db.query("select * from public.screening_current_internal"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("Neue Läufe werden beim Speichern bereinigt (berechnete Spalte)", async () => {
  const later = screen("FAIL", { interestBearingDebtExLeases: 500 });
  await db.query(
    `insert into public.screening_runs (security_id, status, in_universe, result, parameters, engine_version, parameters_version, run_at)
     select id, $1, true, $2, '{}', 'x', 'x', now() + interval '1 day' from public.securities where ticker = 'FAIL'`,
    [later.status, JSON.stringify(later)]
  );
  const pub = await publicResult("FAIL");
  assert.equal(crit(pub, "B1").checks[1].value, undefined);
  assert.equal(crit(pub, "B1").checks[1].result, RESULT.FAIL);
});

test("Kontrollabfrage am Ende der SQL-Datei, Datei erneut ausführbar", async () => {
  const k = await migrate();
  assert.equal(Number(k.titel_mit_ergebnis), 2);
  assert.equal(Number(k.b1_b2_mit_wert), 0);
  assert.equal(Number(k.marktkap_oder_kurs), 0);
  assert.equal(Number(k.reinigung_in_prozent_vom_kurs), 0);
  assert.equal(Number(k.b1_b2_bestanden_oder_nicht), 2);
  assert.equal(k.anon_liest_result, false);
  assert.equal(k.anon_liest_inputs, false);
  assert.equal(k.anon_liest_public_result, true);
  assert.equal(k.anon_liest_interne_view, false);
  // Nach erneutem Ausführen weiter bereinigt
  assert.equal(crit(await publicResult("PASS"), "B2").checks[0].value, undefined);
});

test("Kontrollabfrage erkennt Werte, wenn die Bereinigung fehlt", async () => {
  // Gegenprobe: dieselben Bedingungen auf dem vollen Ergebnis müssen anschlagen
  const { rows } = await db.query(`
    select
      count(*) filter (where exists (
        select 1 from jsonb_array_elements(result -> 'criteria') c, jsonb_array_elements(c -> 'checks') x
        where c ->> 'id' in ('B1', 'B2') and x ? 'value')) as mit_wert,
      count(*) filter (where jsonb_path_exists(result, 'strict $.**.marketCapAtPeriodEnd')
                          or jsonb_path_exists(result, 'strict $.**.priceAtPeriodEnd')) as kurs
    from public.screening_current_internal`);
  assert.equal(Number(rows[0].mit_wert), 2);
  assert.equal(Number(rows[0].kurs), 2);
});

test("supabase_schema_screening.sql: gleiche Funktion, wiederholbar, danach supabase_b1_b2_binaer.sql ausführbar", async () => {
  const SCHEMA = readFileSync(new URL("../../supabase_schema_screening.sql", import.meta.url), "utf8");
  const fn = (sql) => sql.slice(sql.indexOf("-- >>> screening_public_result"), sql.indexOf("-- <<< screening_public_result"));
  assert.ok(fn(SQL).length > 100);
  assert.equal(fn(SCHEMA), fn(SQL));

  const fresh = new PGlite();
  try {
    // Ersatz für die Supabase-eigenen Teile, auf die das Schema verweist
    await fresh.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select null::uuid';`);
    await fresh.exec(SCHEMA);
    await fresh.exec(SCHEMA);
    const { rows } = await fresh.query(
      `select has_column_privilege('anon', 'public.screening_runs', 'result', 'select') as result,
              has_column_privilege('anon', 'public.screening_runs', 'public_result', 'select') as public_result`
    );
    assert.deepEqual(rows[0], { result: false, public_result: true });
    await fresh.exec(SQL);
  } finally {
    await fresh.close();
  }
});
