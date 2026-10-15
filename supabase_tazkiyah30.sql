-- supabase_tazkiyah30.sql — Die Tazkiyah 30 (Neue Ausrichtung 15.10.2026)
--
-- Im Supabase SQL Editor ausführen. Wiederholbar.
--
-- REIHENFOLGE: Diese Datei kann vor oder nach dem Merge des Branches tazkiyah-30 laufen. Die bisherige
-- Website (main) zeigt danach im Screener nur noch die 30 Titel mit Status, alle übrigen als
-- „nicht geprüft“. Deshalb am besten kurz nach dem Merge ausführen.
--
-- Was die Datei macht:
--   1. Neue Tabelle tazkiyah30 (ticker, sort_order, gruppe, kurzbegruendung, aufgenommen_am),
--      öffentlich nur lesbar, befüllt mit den 30 Start-Titeln. kurzbegruendung bleibt leer
--      (schreibt die Redaktion selbst); ein erneutes Ausführen überschreibt sie nicht.
--   2. Öffentlich liefern nur noch die 30 Titel einen Halal-Status:
--        - View screening_current: nur Titel aus tazkiyah30 (Join), für alle Rollen.
--        - screening_runs (Spalte public_result und status), screening_status_changes und
--          user_notifications: Leserecht (RLS) für anon/authenticated nur noch bei Titeln aus tazkiyah30.
--      ETFs (ISWD) stehen nicht in der Liste und sind damit ebenfalls nicht mehr öffentlich.
--   3. Intern bleibt alles gleich: Der Cron und der Wochenbericht nutzen die Service-Role (umgeht RLS)
--      und screening_current_internal (ohne Filter). Die Arbeitsliste manual_reviews_due liest jetzt
--      screening_current_internal, damit sie weiter alle Titel kennt.
--   4. Am Ende zwei Kontrollabfragen.
--
-- Die Datei wird in src/screening/tazkiyah30.test.js in einer Postgres-Datenbank im Arbeitsspeicher
-- (PGlite) ausgeführt und geprüft.

begin;

-- ------------------------------------------------------------------------- 1. Tabelle

create table if not exists public.tazkiyah30 (
  ticker           text primary key references public.securities(ticker) on update cascade,
  sort_order       int  not null,
  gruppe           text not null check (gruppe in ('beliebt', 'datenlage')),
  kurzbegruendung  text,
  aufgenommen_am   date not null default current_date
);

comment on table public.tazkiyah30 is
  'Die Tazkiyah 30: einzige Titel mit öffentlichem Halal-Status (Neue Ausrichtung 15.10.2026). '
  'gruppe: beliebt = verbreitet bei deutschen Anlegern, datenlage = wegen guter Datenlage aufgenommen.';
comment on column public.tazkiyah30.kurzbegruendung is
  'Ein Satz, warum die Aktie konform ist oder nicht. Schreibt die Redaktion; leer = Satz aus dem Prüfergebnis.';

alter table public.tazkiyah30 enable row level security;
drop policy if exists "tazkiyah30_public_read" on public.tazkiyah30;
create policy "tazkiyah30_public_read" on public.tazkiyah30 for select to anon, authenticated using (true);

-- Start-30 (Reihenfolge wie in PROJECT-CONTEXT.md). gruppe: VORSCHLAG, bitte prüfen und bei Bedarf
-- hier anpassen (update public.tazkiyah30 set gruppe = '…' where ticker = '…').
insert into public.tazkiyah30 (ticker, sort_order, gruppe, aufgenommen_am) values
  ('NVDA',  1, 'beliebt',   '2026-10-15'),
  ('MU',    2, 'beliebt',   '2026-10-15'),
  ('QCOM',  3, 'datenlage', '2026-10-15'),
  ('TXN',   4, 'datenlage', '2026-10-15'),
  ('ADI',   5, 'datenlage', '2026-10-15'),
  ('AMAT',  6, 'datenlage', '2026-10-15'),
  ('LRCX',  7, 'datenlage', '2026-10-15'),
  ('KLAC',  8, 'datenlage', '2026-10-15'),
  ('ANET',  9, 'datenlage', '2026-10-15'),
  ('AMD',  10, 'beliebt',   '2026-10-15'),
  ('CRM',  11, 'beliebt',   '2026-10-15'),
  ('META', 12, 'beliebt',   '2026-10-15'),
  ('PLTR', 13, 'beliebt',   '2026-10-15'),
  ('ADBE', 14, 'beliebt',   '2026-10-15'),
  ('SNPS', 15, 'datenlage', '2026-10-15'),
  ('FTNT', 16, 'datenlage', '2026-10-15'),
  ('WDAY', 17, 'datenlage', '2026-10-15'),
  ('LLY',  18, 'beliebt',   '2026-10-15'),
  ('JNJ',  19, 'beliebt',   '2026-10-15'),
  ('PFE',  20, 'beliebt',   '2026-10-15'),
  ('AMGN', 21, 'datenlage', '2026-10-15'),
  ('GILD', 22, 'datenlage', '2026-10-15'),
  ('REGN', 23, 'datenlage', '2026-10-15'),
  ('VRTX', 24, 'datenlage', '2026-10-15'),
  ('BMY',  25, 'datenlage', '2026-10-15'),
  ('SYK',  26, 'datenlage', '2026-10-15'),
  ('BSX',  27, 'datenlage', '2026-10-15'),
  ('EW',   28, 'datenlage', '2026-10-15'),
  ('SHW',  29, 'datenlage', '2026-10-15'),
  ('ITW',  30, 'datenlage', '2026-10-15')
on conflict (ticker) do update set sort_order = excluded.sort_order, gruppe = excluded.gruppe;

-- Prüft, ob ein Titel zu den Tazkiyah 30 gehört. security definer, damit die RLS-Regeln unten nicht von
-- den Leserechten auf securities abhängen; liefert nur true/false.
create or replace function public.is_tazkiyah30(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.securities s join public.tazkiyah30 t on t.ticker = s.ticker where s.id = sid
  );
$$;
revoke all on function public.is_tazkiyah30(uuid) from public;
grant execute on function public.is_tazkiyah30(uuid) to anon, authenticated, service_role;

-- ------------------------------------------------------------------------- 2. Öffentlich nur die 30

-- Verlauf aller Läufe (öffentlich lesbar war bisher public_result und status jedes Titels)
drop policy if exists "screening_runs_public_read" on public.screening_runs;
create policy "screening_runs_public_read" on public.screening_runs
  for select to anon, authenticated using (public.is_tazkiyah30(security_id));

-- Statuswechsel (Verlauf auf der Detailseite)
drop policy if exists "screening_status_changes_public_read" on public.screening_status_changes;
create policy "screening_status_changes_public_read" on public.screening_status_changes
  for select to anon, authenticated using (public.is_tazkiyah30(security_id));

-- Watchlist-Hinweise: nur eigene und nur für Titel aus der Liste
drop policy if exists "notifications_own_read" on public.user_notifications;
create policy "notifications_own_read" on public.user_notifications
  for select to authenticated using (user_id = auth.uid() and public.is_tazkiyah30(security_id));

-- Views neu anlegen (manual_reviews_due hängt an screening_current)
drop view if exists public.manual_reviews_due;
drop view if exists public.screening_current;

-- Öffentliche View: wie bisher (bereinigtes public_result als result), aber nur Titel aus tazkiyah30.
-- Der Join wirkt für jede Rolle, auch im SQL Editor; die RLS oben ist die zweite Sicherung.
create view public.screening_current
with (security_invoker = true) as
select distinct on (r.security_id)
  r.id,
  r.security_id,
  r.status,
  r.in_universe,
  r.annual_period_end,
  r.quarter_period_end,
  r.public_result as result,
  r.parameters,
  r.engine_version,
  r.parameters_version,
  r.data_provider,
  r.run_at,
  s.ticker, s.isin, s.name, s.asset_type
from public.screening_runs r
join public.securities s on s.id = r.security_id
join public.tazkiyah30 t on t.ticker = s.ticker
order by r.security_id, r.run_at desc, r.id desc;

-- Arbeitsliste (intern, gesperrt) liest jetzt die interne View, damit sie weiter alle Titel kennt
create view public.manual_reviews_due
with (security_invoker = true) as
with required as (
  select s.id as security_id, s.ticker, s.name, s.asset_type, c.criterion,
         case when s.asset_type = 'etf' then s.fund_annual_report_date
              else sc.annual_period_end end as current_basis
  from public.securities s
  left join public.screening_current_internal sc on sc.security_id = s.id
  cross join lateral (
    select unnest(case when s.asset_type = 'etf'
                       then array['G2', 'G3', 'G4', 'G5_FUND_INCOME']
                       else array['A2', 'B3_SEGMENTS'] end) as criterion
  ) c
),
latest as (
  select distinct on (security_id, criterion)
    security_id, criterion, result, reviewed_at, basis_annual_period_end
  from public.manual_reviews
  order by security_id, criterion, reviewed_at desc, id desc
)
select r.ticker, r.name, r.asset_type, r.criterion, r.current_basis,
       l.result as last_result, l.reviewed_at as last_reviewed_at,
       l.basis_annual_period_end as last_basis,
       case
         when l.security_id is null then 'fehlt'
         when r.current_basis is null then 'kein Abschluss bekannt'
         when l.basis_annual_period_end <> r.current_basis then 'abgelaufen'
         when l.result = 'unclear' then 'unklar'
         else 'gültig'
       end as state,
       r.security_id
from required r
left join latest l on l.security_id = r.security_id and l.criterion = r.criterion;

-- Rechte ausdrücklich setzen (neue Objekte bekommen in Supabase automatisch Rechte für anon/authenticated)
revoke all on public.tazkiyah30 from anon, authenticated;
grant select on public.tazkiyah30 to anon, authenticated;
grant select on public.tazkiyah30 to service_role;
grant select on public.screening_current to anon, authenticated;
revoke all on public.manual_reviews_due from anon, authenticated;

commit;

-- ------------------------------------------------------------------------------- Kontrolle 1
-- Als Besucher (Rolle anon), eine Zeile. Erwartet:
--   liste                      = 30
--   oeffentliche_zeilen        = 30   (jeder der 30 hat ein Ergebnis; weniger = Titel noch ohne Lauf)
--   ausserhalb_liste           = 0    (screening_current)
--   etfs                       = 0
--   laeufe_ausserhalb_liste    = 0    (screening_runs)
--   wechsel_ausserhalb_liste   = 0    (screening_status_changes)
--   anon_liest_interne_view    = false
begin;
set local role anon;
select
  (select count(*) from public.tazkiyah30) as liste,
  (select count(*) from public.screening_current) as oeffentliche_zeilen,
  (select count(*) from public.screening_current sc
    where not exists (select 1 from public.tazkiyah30 t where t.ticker = sc.ticker)) as ausserhalb_liste,
  (select count(*) from public.screening_current where asset_type = 'etf') as etfs,
  (select count(*) from public.screening_runs r where not public.is_tazkiyah30(r.security_id)) as laeufe_ausserhalb_liste,
  (select count(*) from public.screening_status_changes c where not public.is_tazkiyah30(c.security_id)) as wechsel_ausserhalb_liste,
  has_table_privilege('anon', 'public.screening_current_internal', 'select') as anon_liest_interne_view;
commit;

-- ------------------------------------------------------------------------------- Kontrolle 2
-- Die 30 mit aktuellem Status (als Admin). Erwartet: 30 Zeilen, keine mit "fehlt in securities".
select t.sort_order, t.ticker, t.gruppe,
       coalesce(sc.status, case when s.id is null then 'fehlt in securities' else 'noch kein Ergebnis' end) as status
from public.tazkiyah30 t
left join public.securities s on s.ticker = t.ticker
left join public.screening_current sc on sc.ticker = t.ticker
order by t.sort_order;
