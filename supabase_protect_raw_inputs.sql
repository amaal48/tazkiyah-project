-- supabase_protect_raw_inputs.sql — Anbieter-Rohzahlen nur für den Server (VORSCHLAG, 08.10.2026)
--
-- NOCH NICHT AUSFÜHREN, erst nach Freigabe. Danach im Supabase SQL Editor ausführen. Wiederholbar.
--
-- Befund (08.10.2026, Test mit dem öffentlichen Schlüssel):
--   - screening_current.inputs und screening_runs.inputs (FMP-Rohzahlen: Bilanz, GuV, Kurse,
--     Marktkapitalisierung je Periode) sind für alle lesbar.
--   - Im Ergebnis (result) stehen außerdem Rohwerte, die die Website nicht anzeigt:
--     zakat.trading.priceAtPeriodEnd (Kurs zum Stichtag), purification.periods[].prohibitedIncome
--     und .sharesOutstanding.
--   - purification_amounts (verbotene Einnahmen, Aktienzahl, Satz je Periode) ist öffentlich lesbar,
--     wird von der Website aber nicht gelesen (nur vom Cron für ETFs).
--
-- Lösung:
--   1. Interne View screening_current_internal (wie bisher, mit inputs) nur für den Server.
--      Der Cron liest ab dann diese View (supabaseRepo.js, Rückfall auf screening_current, solange
--      die View fehlt).
--   2. Öffentliche View screening_current ohne inputs und fingerprint; im result werden die drei
--      Rohwerte oben entfernt. Alle Spalten, die die Website liest, bleiben gleich
--      (src/lib/screeningData.js: Liste, Sortierung, Detailseite mit result, Verlauf).
--   3. screening_runs: Lesen für anon/authenticated nur noch auf die Spalten ohne inputs/fingerprint.
--      Die Website liest screening_runs nie direkt.
--   4. purification_amounts: kein öffentliches Lesen mehr.
--   5. manual_reviews_due muss neu angelegt werden (hängt an screening_current) und bleibt gesperrt.
--
-- Danach bitte prüfen: Startseite, Screener, Detailseite (z. B. #/aktie/NVDA) laden wie vorher.
-- Hinweis: supabase_schema_screening.sql legt die alte View (mit inputs) und die alten Leserechte
-- wieder an. Nach dem Ausführen dieser Datei die Schema-Datei angleichen (Aufgabe für Claude Code).
-- scripts/compare-sec-fmp.mjs liest die gespeicherten FMP-Werte danach nicht mehr ohne FMP_API_KEY.

begin;

-- Abhängige View zuerst entfernen
drop view if exists public.manual_reviews_due;
drop view if exists public.screening_current;
drop view if exists public.screening_current_internal;

-- 1. Interne View (mit Rohdaten), nur Service-Role
create view public.screening_current_internal
with (security_invoker = true) as
select distinct on (r.security_id)
  r.*, s.ticker, s.isin, s.name, s.asset_type
from public.screening_runs r
join public.securities s on s.id = r.security_id
order by r.security_id, r.run_at desc, r.id desc;

-- 2. Öffentliche View ohne Rohdaten
create view public.screening_current
with (security_invoker = true) as
select distinct on (r.security_id)
  r.id,
  r.security_id,
  r.status,
  r.in_universe,
  r.annual_period_end,
  r.quarter_period_end,
  -- Rohwerte, die die Website nicht anzeigt, aus dem Ergebnis entfernen
  case
    when jsonb_typeof(r.result -> 'purification' -> 'periods') = 'array' then
      jsonb_set(
        r.result #- '{zakat,trading,priceAtPeriodEnd}',
        '{purification,periods}',
        (select coalesce(jsonb_agg(p - 'prohibitedIncome' - 'sharesOutstanding'), '[]'::jsonb)
           from jsonb_array_elements(r.result -> 'purification' -> 'periods') p)
      )
    else r.result #- '{zakat,trading,priceAtPeriodEnd}'
  end as result,
  r.parameters,
  r.engine_version,
  r.parameters_version,
  r.data_provider,
  r.run_at,
  s.ticker, s.isin, s.name, s.asset_type
from public.screening_runs r
join public.securities s on s.id = r.security_id
order by r.security_id, r.run_at desc, r.id desc;

-- 3. Leserechte auf screening_runs nur ohne inputs/fingerprint
--    (die öffentliche View läuft mit den Rechten der Lesenden, security_invoker)
revoke select on public.screening_runs from anon, authenticated;
grant select (id, security_id, status, in_universe, annual_period_end, quarter_period_end, result,
              parameters, engine_version, parameters_version, data_provider, run_at)
  on public.screening_runs to anon, authenticated;

-- Neue Views bekommen in Supabase automatisch Rechte für anon/authenticated → ausdrücklich setzen
revoke all on public.screening_current_internal from anon, authenticated;
grant select on public.screening_current_internal to service_role;
grant select on public.screening_current to anon, authenticated;

-- 4. purification_amounts nicht mehr öffentlich (die Website liest die Tabelle nicht)
drop policy if exists "purification_amounts_public_read" on public.purification_amounts;
revoke select on public.purification_amounts from anon, authenticated;

-- 5. Arbeitsliste neu anlegen (unverändert aus supabase_schema_screening.sql), weiter gesperrt
create view public.manual_reviews_due
with (security_invoker = true) as
with required as (
  select s.id as security_id, s.ticker, s.name, s.asset_type, c.criterion,
         case when s.asset_type = 'etf' then s.fund_annual_report_date
              else sc.annual_period_end end as current_basis
  from public.securities s
  left join public.screening_current sc on sc.security_id = s.id
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

revoke all on public.manual_reviews_due from anon, authenticated;

commit;

-- Kontrolle (als Admin im SQL Editor): Spalten der öffentlichen View — inputs darf NICHT erscheinen
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'screening_current' order by ordinal_position;
