// src/screening/tazkiyah30.test.js — öffentlich nur die Tazkiyah 30 (supabase_tazkiyah30.sql)
//
// Führt die SQL-Datei in einer Postgres-Datenbank im Arbeitsspeicher aus (PGlite) und prüft, dass
// Besucher (anon/authenticated) Status und Ergebnis nur für Titel aus tazkiyah30 lesen können,
// während Cron (service_role) und interne Views weiter alle Titel sehen.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { TAZKIYAH30_FALLBACK } from "../data/tazkiyah30.js";

const SQL = readFileSync(new URL("../../supabase_tazkiyah30.sql", import.meta.url), "utf8");

const THIRTY = "NVDA MU QCOM TXN ADI AMAT LRCX KLAC ANET AMD CRM META PLTR ADBE SNPS FTNT WDAY LLY JNJ PFE AMGN GILD REGN VRTX BMY SYK BSX EW SHW ITW".split(" ");

let db;
let controls;

async function as(role, sql, params) {
  await db.exec(`set role ${role}`);
  try {
    return (await db.query(sql, params)).rows;
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

  const res = await db.exec(SQL);
  // Ergebnisse der beiden Kontrollabfragen (die letzten Abfragen mit Zeilen)
  const withRows = res.filter((r) => r.rows?.length);
  controls = { visitor: withRows[withRows.length - 2].rows[0], list: withRows[withRows.length - 1].rows };
});

after(async () => {
  await db?.close();
});

test("Tabelle tazkiyah30: 30 Titel, Reihenfolge 1–30, gültige Gruppe, Begründung leer", async () => {
  const rows = await as("anon", "select * from public.tazkiyah30 order by sort_order");
  assert.deepEqual(rows.map((r) => r.ticker), THIRTY);
  assert.deepEqual(rows.map((r) => r.sort_order), THIRTY.map((_, i) => i + 1));
  assert.ok(rows.every((r) => ["beliebt", "datenlage"].includes(r.gruppe)));
  assert.ok(rows.every((r) => r.kurzbegruendung === null));
});

test("Besucher: tazkiyah30 nur lesen, nicht schreiben", async () => {
  await assert.rejects(as("anon", "insert into public.tazkiyah30 (ticker, sort_order, gruppe) values ('AAPL', 31, 'beliebt')"));
  await assert.rejects(as("authenticated", "update public.tazkiyah30 set kurzbegruendung = 'x' where ticker = 'NVDA'"));
});

test("Besucher: screening_current nur mit Titeln aus der Liste, kein ETF", async () => {
  for (const role of ["anon", "authenticated"]) {
    const rows = await as(role, "select ticker, status from public.screening_current order by ticker");
    assert.deepEqual(rows, [
      { ticker: "JNJ", status: "konform" },
      { ticker: "NVDA", status: "konform" },
    ]);
  }
});

test("Auch ohne RLS (Admin im SQL Editor) liefert screening_current nur die Liste", async () => {
  const rows = (await db.query("select ticker from public.screening_current order by ticker")).rows;
  assert.deepEqual(rows.map((r) => r.ticker), ["JNJ", "NVDA"]);
});

test("Besucher: Verlauf (screening_runs) und Statuswechsel nur für Titel aus der Liste", async () => {
  const runs = await as("anon", "select s.ticker from public.screening_runs r join public.securities s on s.id = r.security_id order by s.ticker");
  assert.deepEqual(runs.map((r) => r.ticker), ["JNJ", "NVDA", "NVDA"]);
  const changes = await as("anon", "select s.ticker from public.screening_status_changes c join public.securities s on s.id = c.security_id");
  assert.deepEqual(changes.map((r) => r.ticker), ["NVDA"]);
});

test("Angemeldet: eigene Watchlist-Hinweise nur für Titel aus der Liste", async () => {
  await db.exec("set test.uid = '00000000-0000-0000-0000-000000000001'");
  const rows = await as("authenticated", "select s.ticker from public.user_notifications n join public.securities s on s.id = n.security_id");
  await db.exec("reset test.uid");
  assert.deepEqual(rows.map((r) => r.ticker), ["NVDA"]);
});

test("Stammdaten bleiben öffentlich (Aktiensuche)", async () => {
  const rows = await as("anon", "select count(*)::int as n from public.securities");
  assert.equal(rows[0].n, 32);
});

test("Cron (service_role) und interne View sehen weiter alle Titel", async () => {
  const runs = await as("service_role", "select count(*)::int as n from public.screening_runs");
  assert.equal(runs[0].n, 5);
  const internal = (await db.query("select ticker from public.screening_current_internal order by ticker")).rows;
  assert.deepEqual(internal.map((r) => r.ticker), ["AAPL", "ISWD", "JNJ", "NVDA"]);
  await assert.rejects(as("anon", "select * from public.screening_current_internal"));
});

test("Arbeitsliste manual_reviews_due kennt weiter den Abschluss von Titeln außerhalb der Liste", async () => {
  const rows = (await db.query("select ticker, current_basis from public.manual_reviews_due where ticker = 'AAPL' and criterion = 'A2'")).rows;
  assert.equal(rows.length, 1);
  assert.ok(rows[0].current_basis instanceof Date);
  await assert.rejects(as("anon", "select * from public.manual_reviews_due"));
});

test("Kontrollabfragen am Ende der Datei", () => {
  const v = controls.visitor;
  assert.equal(Number(v.liste), 30);
  assert.equal(Number(v.oeffentliche_zeilen), 2); // im Test haben nur NVDA und JNJ ein Ergebnis
  assert.equal(Number(v.ausserhalb_liste), 0);
  assert.equal(Number(v.etfs), 0);
  assert.equal(Number(v.laeufe_ausserhalb_liste), 0);
  assert.equal(Number(v.wechsel_ausserhalb_liste), 0);
  assert.equal(v.anon_liest_interne_view, false);
  assert.equal(controls.list.length, 30);
  assert.ok(!controls.list.some((r) => r.status === "fehlt in securities"));
});

test("Datei ist wiederholbar und überschreibt die Kurzbegründung nicht", async () => {
  await db.query("update public.tazkiyah30 set kurzbegruendung = 'Eigener Satz.' where ticker = 'NVDA'");
  await db.exec(SQL);
  const rows = (await db.query("select kurzbegruendung from public.tazkiyah30 where ticker = 'NVDA'")).rows;
  assert.equal(rows[0].kurzbegruendung, "Eigener Satz.");
});

test("Rückfall-Liste der Website (src/data/tazkiyah30.js) stimmt mit der SQL-Datei überein", async () => {
  const rows = (await db.query("select ticker, sort_order, gruppe from public.tazkiyah30 order by sort_order")).rows;
  assert.deepEqual(
    TAZKIYAH30_FALLBACK.map((t) => [t.ticker, t.sortOrder, t.gruppe]),
    rows.map((r) => [r.ticker, r.sort_order, r.gruppe])
  );
});
