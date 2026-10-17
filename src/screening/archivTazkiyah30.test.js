// src/screening/archivTazkiyah30.test.js — Archiv Tazkiyah 30 (supabase_archiv_tazkiyah30.sql, 17.10.2026)
//
// Baut den Stand nach supabase_tazkiyah30.sql in PGlite nach, führt die Archiv-Datei aus und prüft:
// Besucher und angemeldete Nutzer lesen keinen Status mehr (screening_current, tazkiyah30, screening_runs,
// Statuswechsel, Watchlist-Hinweise), Stammdaten und Kalender bleiben öffentlich, Cron (service_role) und
// interne View unverändert. Danach stellt der auskommentierte Abschnitt „Rückgängig machen“ alles wieder her.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const T30_SQL = readFileSync(new URL("../../supabase_tazkiyah30.sql", import.meta.url), "utf8");
const SQL = readFileSync(new URL("../../supabase_archiv_tazkiyah30.sql", import.meta.url), "utf8");

/** Abschnitt 2 der Datei ohne die führenden „-- “ (so, wie die Nutzerin ihn ausführt). */
function undoSql() {
  const part = SQL.slice(SQL.indexOf("2. Rückgängig machen"));
  const lines = part.split("\n").filter((l) => /^-- (begin;|grant |\s+|commit;)/.test(l) && !/^--\s*$/.test(l));
  const body = lines.map((l) => l.replace(/^-- /, "")).join("\n");
  const from = body.indexOf("begin;");
  return body.slice(from, body.indexOf("commit;", from) + "commit;".length);
}

const THIRTY = "NVDA MU QCOM TXN ADI AMAT LRCX KLAC ANET AMD CRM META PLTR ADBE SNPS FTNT WDAY LLY JNJ PFE AMGN GILD REGN VRTX BMY SYK BSX EW SHW ITW".split(" ");

let db;
let control;

async function as(role, sql) {
  await db.exec(`set role ${role}`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

before(async () => {
  db = new PGlite();
  // Nachbau des nötigen Supabase-Teils (Stand vor der Datei): Rollen, Tabellen, öffentliche Leserechte
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    create table public.securities (
      id uuid primary key default gen_random_uuid(), ticker text unique not null, isin text, name text not null,
      asset_type text not null, fund_annual_report_date date);
    create table public.screening_runs (
      id bigint generated always as identity primary key,
      security_id uuid not null references public.securities(id),
      status text not null, in_universe boolean not null default true, annual_period_end date, quarter_period_end date,
      result jsonb not null default '{}', public_result jsonb, parameters jsonb not null default '{}',
      engine_version text not null default '1', parameters_version text not null default '1',
      data_provider text, run_at timestamptz not null default now(), inputs jsonb, fingerprint text);
    create table public.screening_status_changes (
      id bigint generated always as identity primary key, security_id uuid not null, run_id bigint,
      from_status text, to_status text not null, changed_at timestamptz not null default now());
    create table public.user_notifications (
      id bigint generated always as identity primary key, user_id uuid not null, security_id uuid not null,
      to_status text not null);
    create table public.manual_reviews (
      id bigint generated always as identity primary key, security_id uuid not null, criterion text not null,
      result text not null, reviewed_at timestamptz not null default now(), basis_annual_period_end date not null);

    create view public.screening_current_internal with (security_invoker = true) as
      select distinct on (r.security_id) r.*, s.ticker, s.isin, s.name, s.asset_type
      from public.screening_runs r join public.securities s on s.id = r.security_id
      order by r.security_id, r.run_at desc, r.id desc;
    create view public.screening_current with (security_invoker = true) as
      select distinct on (r.security_id) r.id, r.security_id, r.status, r.public_result as result, s.ticker, s.asset_type
      from public.screening_runs r join public.securities s on s.id = r.security_id
      order by r.security_id, r.run_at desc, r.id desc;
    create view public.manual_reviews_due as select 1 as x;
    create table public.company_calendar (ticker text primary key);
    alter table public.company_calendar enable row level security;
    create policy "company_calendar_public_read" on public.company_calendar for select to anon, authenticated using (true);

    alter table public.securities enable row level security;
    alter table public.screening_runs enable row level security;
    alter table public.screening_status_changes enable row level security;
    alter table public.user_notifications enable row level security;
    create policy "securities_public_read" on public.securities for select to anon, authenticated using (true);
    create policy "screening_runs_public_read" on public.screening_runs for select to anon, authenticated using (true);
    create policy "screening_status_changes_public_read" on public.screening_status_changes for select to anon, authenticated using (true);
    create policy "notifications_own_read" on public.user_notifications for select to authenticated using (user_id = auth.uid());

    grant usage on schema public to anon, authenticated, service_role;
    grant select on all tables in schema public to anon, authenticated, service_role;
    revoke all on public.screening_current_internal from anon, authenticated;
  `);

  // Alle 30 im Universum, dazu ein Titel außerhalb (AAPL) und ein ETF (ISWD)
  for (const t of [...THIRTY, "AAPL"]) await db.query("insert into public.securities (ticker, name, asset_type) values ($1, $1, 'stock')", [t]);
  await db.query("insert into public.securities (ticker, name, asset_type) values ('ISWD', 'ISWD', 'etf')");

  // Läufe: NVDA (2 Läufe), JNJ, AAPL, ISWD; Statuswechsel und Hinweise für NVDA und AAPL
  const runs = [
    ["NVDA", "nicht_geprueft", "2026-10-01"],
    ["NVDA", "konform", "2026-10-10"],
    ["JNJ", "konform", "2026-10-10"],
    ["AAPL", "nicht_konform", "2026-10-10"],
    ["ISWD", "nicht_konform", "2026-10-10"],
  ];
  for (const [t, status, at] of runs) {
    await db.query(
      `insert into public.screening_runs (security_id, status, annual_period_end, result, public_result, run_at)
       select id, $2, '2025-12-31', jsonb_build_object('status', $2::text), jsonb_build_object('status', $2::text), $3::timestamptz
       from public.securities where ticker = $1`,
      [t, status, at]
    );
  }
  for (const t of ["NVDA", "AAPL"]) {
    await db.query("insert into public.screening_status_changes (security_id, to_status) select id, 'konform' from public.securities where ticker = $1", [t]);
    await db.query(
      "insert into public.user_notifications (user_id, security_id, to_status) select '00000000-0000-0000-0000-000000000001', id, 'konform' from public.securities where ticker = $1",
      [t]
    );
  }

  await db.exec(T30_SQL);
  const res = await db.exec(SQL);
  control = res.filter((r) => r.rows?.length).at(-1).rows[0];
});

after(async () => {
  await db?.close();
});

const STATUS_QUERIES = [
  "select status from public.screening_current",
  "select ticker from public.tazkiyah30",
  "select status from public.screening_runs",
  "select to_status from public.screening_status_changes",
];

test("Besucher und Angemeldete lesen keinen Status mehr", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const q of STATUS_QUERIES) await assert.rejects(as(role, q), /permission denied/, `${role}: ${q}`);
  }
  await assert.rejects(as("authenticated", "select to_status from public.user_notifications"), /permission denied/);
});

test("Stammdaten und Kalender bleiben öffentlich (Aktiensuche, Aktienseiten)", async () => {
  const rows = await as("anon", "select count(*)::int as n from public.securities");
  assert.equal(rows[0].n, 32);
  await as("anon", "select * from public.company_calendar");
});

test("Cron (service_role) und interne View unverändert", async () => {
  assert.equal((await as("service_role", "select count(*)::int as n from public.tazkiyah30"))[0].n, 30);
  assert.equal((await as("service_role", "select count(*)::int as n from public.screening_runs"))[0].n, 5);
  const internal = (await db.query("select ticker from public.screening_current_internal order by ticker")).rows;
  assert.deepEqual(internal.map((r) => r.ticker), ["AAPL", "ISWD", "JNJ", "NVDA"]);
});

test("Nichts gelöscht: Liste, Läufe und View sind noch da", async () => {
  assert.equal((await db.query("select count(*)::int as n from public.tazkiyah30")).rows[0].n, 30);
  assert.deepEqual((await db.query("select ticker from public.screening_current order by ticker")).rows.map((r) => r.ticker), ["JNJ", "NVDA"]);
});

test("Kontrollabfrage am Ende von Abschnitt 1", () => {
  for (const [k, v] of Object.entries(control)) {
    if (k.startsWith("anon_") || k.startsWith("auth_")) assert.equal(v, false, k);
    else assert.equal(v, true, k);
  }
});

test("Datei ist wiederholbar", async () => {
  await db.exec(SQL);
  await assert.rejects(as("anon", "select status from public.screening_current"), /permission denied/);
});

test("Rückgängig machen stellt den bisherigen Zugriff wieder her", async () => {
  const undo = undoSql();
  assert.match(undo, /^begin;[\s\S]*commit;$/);
  await db.exec(undo);
  for (const role of ["anon", "authenticated"]) {
    const rows = await as(role, "select ticker, status from public.screening_current order by ticker");
    assert.deepEqual(rows, [
      { ticker: "JNJ", status: "konform" },
      { ticker: "NVDA", status: "konform" },
    ]);
    assert.equal((await as(role, "select count(*)::int as n from public.tazkiyah30"))[0].n, 30);
    // wie vor dem Archiv: Läufe und Statuswechsel nur für die 30
    assert.deepEqual((await as(role, "select s.ticker from public.screening_runs r join public.securities s on s.id = r.security_id order by 1")).map((r) => r.ticker), ["JNJ", "NVDA", "NVDA"]);
    assert.deepEqual((await as(role, "select s.ticker from public.screening_status_changes c join public.securities s on s.id = c.security_id")).map((r) => r.ticker), ["NVDA"]);
  }
  await db.exec("set test.uid = '00000000-0000-0000-0000-000000000001'");
  const own = await as("authenticated", "select s.ticker from public.user_notifications n join public.securities s on s.id = n.security_id");
  await db.exec("reset test.uid");
  assert.deepEqual(own.map((r) => r.ticker), ["NVDA"]);
});
