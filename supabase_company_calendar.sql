-- supabase_company_calendar.sql — Termine und Berichte je Aktie aus SEC EDGAR (16.10.2026)
--
-- Im Supabase SQL Editor ausführen. Wiederholbar.
--
-- Tabelle company_calendar: eine Zeile je Aktie mit den letzten Berichten (10-K, 10-Q, 8-K), dem nächsten
-- Termin für Quartalszahlen (voraussichtlich / bestätigt) und der Hauptversammlung. Quelle ausschließlich
-- SEC EDGAR (amtlich, kostenlos). Enthält KEINE Halal-Daten und ist deshalb für alle Titel öffentlich lesbar.
-- Schreiben nur mit der Service-Role (Cron api/update-calendar.js, lokales Skript scripts/calendar-refresh.mjs).
--
-- Danach einmal befüllen (lokal, braucht SUPABASE_SERVICE_ROLE_KEY und SEC_USER_AGENT in .env.local):
--   node scripts/calendar-refresh.mjs --all

begin;

create table if not exists public.company_calendar (
  security_id           uuid primary key references public.securities(id) on delete cascade,
  ticker                text not null,
  cik                   text,
  -- letzte Berichte: [{ form, label, filed, reportDate, url }], neueste zuerst
  filings               jsonb not null default '[]',
  next_earnings_date    date,
  next_earnings_status  text check (next_earnings_status in ('voraussichtlich', 'bestaetigt')),
  next_earnings_url     text,     -- nur bei „bestätigt“: 8-K mit der Ankündigung
  next_earnings_note    text,     -- Herleitung, z. B. „abgeleitet aus dem Vorjahr (Quartalszahlen am …)“
  hv_date               date,
  hv_status             text check (hv_status in ('kommend', 'vergangen')),
  hv_url                text,     -- Proxy Statement (DEF 14A)
  hv_accession          text,     -- DEF 14A, deren Text schon gelesen wurde (intern, kein erneuter Abruf)
  hv_note               text,
  checked_accessions    text[] not null default '{}',  -- schon geprüfte 8-K (Ankündigungen), intern
  fetched_at            timestamptz,
  error                 text
);

comment on table public.company_calendar is
  'Termine (Quartalszahlen, Hauptversammlung) und Berichte je Aktie, nur aus SEC EDGAR. Keine Halal-Daten, öffentlich lesbar.';

create index if not exists company_calendar_earnings_idx on public.company_calendar (next_earnings_date);
create index if not exists company_calendar_hv_idx on public.company_calendar (hv_date);

alter table public.company_calendar enable row level security;
drop policy if exists "company_calendar_public_read" on public.company_calendar;
create policy "company_calendar_public_read" on public.company_calendar for select to anon, authenticated using (true);

-- Besucher: nur lesen. Schreiben nur Service-Role (umgeht RLS).
revoke all on public.company_calendar from anon, authenticated;
grant select on public.company_calendar to anon, authenticated;
grant select, insert, update, delete on public.company_calendar to service_role;

commit;

-- Kontrolle. Erwartet: tabelle_da = true, anon_liest = true, anon_schreibt = false, zeilen = 0 (vor dem Befüllen)
select
  to_regclass('public.company_calendar') is not null as tabelle_da,
  has_table_privilege('anon', 'public.company_calendar', 'select') as anon_liest,
  has_table_privilege('anon', 'public.company_calendar', 'insert') as anon_schreibt,
  (select count(*) from public.company_calendar) as zeilen;
