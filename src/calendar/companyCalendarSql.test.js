// src/calendar/companyCalendarSql.test.js — supabase_company_calendar.sql in PGlite: öffentlich lesbar, nur Service-Role schreibt

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SQL = readFileSync(new URL("../../supabase_company_calendar.sql", import.meta.url), "utf8");
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
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create table public.securities (id uuid primary key default gen_random_uuid(), ticker text unique not null);
    grant usage on schema public to anon, authenticated, service_role;
    insert into public.securities (ticker) values ('NVDA');
  `);
  const res = await db.exec(SQL);
  control = res[res.length - 1].rows[0];
  await db.exec(`insert into public.company_calendar (security_id, ticker, next_earnings_date, next_earnings_status)
                 select id, ticker, '2026-11-18', 'voraussichtlich' from public.securities`);
});

after(async () => db?.close());

test("Kontrollabfrage der Datei", () => {
  assert.equal(control.tabelle_da, true);
  assert.equal(control.anon_liest, true);
  assert.equal(control.anon_schreibt, false);
});

test("Besucher lesen, schreiben nicht; Service-Role schreibt", async () => {
  assert.equal((await as("anon", "select ticker from public.company_calendar"))[0].ticker, "NVDA");
  await assert.rejects(as("anon", "update public.company_calendar set error = 'x'"));
  await assert.rejects(as("authenticated", "delete from public.company_calendar"));
  await as("service_role", "update public.company_calendar set hv_date = '2027-06-23', hv_status = 'kommend'");
  assert.equal((await db.query("select hv_status from public.company_calendar")).rows[0].hv_status, "kommend");
});

test("Status nur mit erlaubten Werten", async () => {
  await assert.rejects(db.query("update public.company_calendar set next_earnings_status = 'sicher'"));
});
