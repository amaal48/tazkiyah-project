// src/lib/wochenberichtSql.test.js — supabase_wochenbericht.sql in PGlite
//
// Prüft: Besucher sehen nur veröffentlichte Ausgaben; Entwürfe nur Admins; Freigabe nur ohne Lücken und
// mit allen 11 Punkten; Änderung nach Freigabe → Entwurf; Veröffentlichen nur durch den Cron (service_role);
// Korrektur setzt korrigiert_am; Zurückziehen nur mit Grund; Versionen; erscheint_am = Montag 12:00 Berlin.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const SQL = readFileSync(new URL("../../supabase_wochenbericht.sql", import.meta.url), "utf8");
const ADMIN = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const ALL_CHECKS = JSON.stringify(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i + 1), true])));

let db;
let control;

/** Abfrage als Rolle (anon, authenticated mit uid, service_role); Fehlertext statt Ausnahme. */
async function as(role, sql, uid = "") {
  await db.exec(`set test.uid = '${uid}'`);
  await db.exec(`set role ${role}`);
  try {
    return { rows: (await db.query(sql)).rows };
  } catch (e) {
    return { error: String(e.message) };
  } finally {
    await db.exec("reset role");
  }
}
const admin = (sql) => as("authenticated", sql, ADMIN);

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users values ('${ADMIN}', 'admin@test.de'), ('${USER}', 'user@test.de');
    -- alte Tabelle wie vor der Datei (Demo-Format)
    create table public.weekly_reports (id bigint generated always as identity primary key, week_label text, report_date date, tldr text);
    insert into public.weekly_reports (week_label, report_date, tldr) values ('Wochenbericht KW 41', '2026-10-05', '');
  `);
  const res = await db.exec(SQL);
  control = res[res.length - 1].rows[0];
  await db.exec(`insert into public.admins (user_id) values ('${ADMIN}')`);
});

after(async () => db?.close());

test("Alte Tabelle gesichert, Kontrollabfrage", () => {
  assert.equal(control.tabelle_da, true);
  assert.equal(control.alte_tabelle_gesichert, true);
  assert.equal(control.anon_liest_nur_veroeffentlicht, true);
});

test("Datei ist wiederholbar", async () => {
  await db.exec(SQL);
});

test("Entwurf anlegen nur als Admin; erscheint_am = Montag 12:00 Berlin (Sommer- und Winterzeit)", async () => {
  const denied = await as("authenticated", `insert into public.weekly_reports (jahr, kw, zeitraum_von, zeitraum_bis, titel) values (2026, 40, '2026-09-28', '2026-10-02', 'X')`, USER);
  assert.match(denied.error, /row-level security/);
  const ok = await admin(`insert into public.weekly_reports (jahr, kw, zeitraum_von, zeitraum_bis, titel, drei_saetze, body_md)
    values (2026, 42, '2026-10-12', '2026-10-16', 'Teure Energie', 'Drei Sätze.', '## Abschnitt\nText [Lücke].') returning erscheint_am, status`);
  assert.equal(ok.rows[0].status, "entwurf");
  assert.equal(new Date(ok.rows[0].erscheint_am).toISOString(), "2026-10-19T10:00:00.000Z"); // Sommerzeit
  const winter = await admin(`insert into public.weekly_reports (jahr, kw, zeitraum_von, zeitraum_bis, titel) values (2026, 45, '2026-11-02', '2026-11-06', 'W') returning erscheint_am`);
  assert.equal(new Date(winter.rows[0].erscheint_am).toISOString(), "2026-11-09T11:00:00.000Z"); // Winterzeit
  const dup = await admin(`insert into public.weekly_reports (jahr, kw, zeitraum_von, zeitraum_bis) values (2026, 42, '2026-10-12', '2026-10-16')`);
  assert.match(dup.error, /duplicate key|unique/);
});

test("Ohne Anmeldung und als normales Konto keine Entwürfe sichtbar", async () => {
  assert.equal((await as("anon", "select * from public.weekly_reports")).rows.length, 0);
  assert.equal((await as("authenticated", "select * from public.weekly_reports", USER)).rows.length, 0);
  assert.equal((await admin("select * from public.weekly_reports")).rows.length, 2);
  assert.match((await as("anon", "select * from public.weekly_report_versions")).error, /permission denied/);
  assert.equal((await as("authenticated", "select * from public.weekly_report_versions", USER)).rows.length, 0);
  assert.match((await as("anon", "select * from public.admins")).error, /permission denied/);
  assert.match((await as("anon", "select * from public.weekly_reports_alt")).error, /permission denied/);
});

test("Freigabe gesperrt bei Lücken und unvollständiger Checkliste", async () => {
  const gap = await admin(`update public.weekly_reports set status = 'freigegeben', checkliste = '${ALL_CHECKS}' where kw = 42`);
  assert.match(gap.error, /eckige Klammern/);
  await admin(`update public.weekly_reports set body_md = '## Abschnitt\nText mit [Link](https://example.org).' where kw = 42`);
  const checks = await admin(`update public.weekly_reports set status = 'freigegeben', checkliste = '{"1": true}' where kw = 42`);
  assert.match(checks.error, /Checkliste/);
  const ok = await admin(`update public.weekly_reports set status = 'freigegeben', checkliste = '${ALL_CHECKS}' where kw = 42 returning status, freigegeben_am`);
  assert.equal(ok.rows[0].status, "freigegeben");
  assert.ok(ok.rows[0].freigegeben_am);
});

test("Änderung nach der Freigabe setzt zurück auf Entwurf", async () => {
  const r = await admin(`update public.weekly_reports set drei_saetze = 'Geändert.' where kw = 42 returning status, freigegeben_am`);
  assert.equal(r.rows[0].status, "entwurf");
  assert.equal(r.rows[0].freigegeben_am, null);
  const again = await admin(`update public.weekly_reports set status = 'freigegeben' where kw = 42 returning status`);
  assert.equal(again.rows[0].status, "freigegeben");
});

test("Veröffentlichen nur durch den Cron, und nur Freigegebenes", async () => {
  const web = await admin(`update public.weekly_reports set status = 'veroeffentlicht' where kw = 42`);
  assert.match(web.error, /Cron/);
  const draft = await as("service_role", `update public.weekly_reports set status = 'veroeffentlicht' where kw = 45`);
  assert.match(draft.error, /freigegebene/);
  const cron = await as("service_role", `update public.weekly_reports set status = 'veroeffentlicht' where kw = 42 and status = 'freigegeben' returning veroeffentlicht_am`);
  assert.ok(cron.rows[0].veroeffentlicht_am);
  const pub = await as("anon", "select kw, titel from public.weekly_reports");
  assert.deepEqual(pub.rows, [{ kw: 42, titel: "Teure Energie" }]);
});

test("Korrektur setzt korrigiert_am; zurück in den Entwurf nicht möglich; Zurückziehen nur mit Grund", async () => {
  const k = await admin(`update public.weekly_reports set drei_saetze = 'Korrigiert.' where kw = 42 returning status, korrigiert_am`);
  assert.equal(k.rows[0].status, "veroeffentlicht");
  assert.ok(k.rows[0].korrigiert_am);
  const gapFix = await admin(`update public.weekly_reports set drei_saetze = 'Mit [Lücke].' where kw = 42`);
  assert.match(gapFix.error, /eckige Klammern/);
  const back = await admin(`update public.weekly_reports set status = 'entwurf' where kw = 42`);
  assert.match(back.error, /korrigiert oder zurückgezogen/);
  const noReason = await admin(`update public.weekly_reports set status = 'zurueckgezogen' where kw = 42`);
  assert.match(noReason.error, /Grund/);
  const w = await admin(`update public.weekly_reports set status = 'zurueckgezogen', zurueckgezogen_grund = 'Test' where kw = 42 returning zurueckgezogen_am`);
  assert.ok(w.rows[0].zurueckgezogen_am);
  assert.equal((await as("anon", "select * from public.weekly_reports")).rows.length, 0);
});

test("Jede Speicherung ist eine Version", async () => {
  const v = await admin(`select v.status from public.weekly_report_versions v join public.weekly_reports r on r.id = v.report_id where r.kw = 42 order by v.id`);
  assert.ok(v.rows.length >= 6);
  assert.equal(v.rows[0].status, "entwurf");
  assert.equal(v.rows.at(-1).status, "zurueckgezogen");
});
