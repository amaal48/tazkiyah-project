-- supabase_b1_b2_binaer.sql — B1/B2 öffentlich nur binär (11.10.2026)
--
-- Im Supabase SQL Editor ausführen. Wiederholbar (rechnet bei jedem Ausführen alle gespeicherten
-- Ergebnisse neu durch die Funktion unten).
--
-- REIHENFOLGE: zuerst den Branch b1-b2-binaer auf main mergen (Website zeigt bei B1/B2 keine Werte
-- mehr und braucht sie nicht), DANN diese Datei ausführen. Bis zur Ausführung sind die Werte über
-- die Datenbank-Schnittstelle noch lesbar, deshalb bald nach dem Merge ausführen.
--
-- Grund: Die Lizenz der Kursdaten (FMP Free jetzt, Tiingo Commercial später) erlaubt keine
-- öffentliche Anzeige von Werten, aus denen sich Kurs oder Marktkapitalisierung zurückrechnen
-- lassen. B1 und B2 sind Quoten mit der Marktkapitalisierung im Nenner. Öffentlich bleibt nur,
-- ob die Grenze eingehalten ist (result, limit, comparator). B3, C1, Reinigung und Zakat beruhen
-- auf Abschlusszahlen und bleiben unverändert.
--
-- Lösung: eine Funktion screening_public_result(result) entfernt die Werte. Ihr Ergebnis steht als
-- berechnete Spalte screening_runs.public_result (generated always … stored) in jeder Zeile.
--   - Die öffentliche View screening_current liefert public_result unter dem Namen result.
--     Die Website liest weiter screening_current.result, ohne Änderung an der Abfrage.
--   - Öffentlich lesbar auf screening_runs ist nur noch public_result, nicht mehr result.
--     Damit ist auch der Verlauf (alle früheren Läufe) bereinigt.
--   - Der Cron schreibt und liest wie bisher; die vollen Werte stehen in screening_runs.result und
--     in screening_current_internal (nur Service-Role).
-- Warum eine berechnete Spalte und keine Bereinigung nur in der View: Die View läuft mit den Rechten
-- der Lesenden (security_invoker). Läse sie result, müsste result für alle lesbar bleiben, und die
-- Werte wären direkt über screening_runs abrufbar. Die berechnete Spalte entsteht in der Datenbank
-- bei jedem Speichern, für alte und neue Zeilen, unabhängig vom Code des Crons.
--
-- Entfernt wird (alles andere bleibt):
--   - B1 und B2: in jeder Einzelprüfung (checks) nur noch basis, periodEnd, label, limit, comparator,
--     result, reason und die Leasing-Angaben. Also kein value, kein distanceToLimit, keine
--     Marktkapitalisierung, und auch keine Felder, die künftig dazukommen.
--   - headline.failed[] bei B1/B2: check nur noch basis, periodEnd, limit, comparator (ohne value).
--   - zakat.trading.priceAtPeriodEnd (Kurs zum Stichtag; war schon bisher ausgeblendet).
--   - purification.periods[]: prohibitedIncome und sharesOutstanding (schon bisher ausgeblendet)
--     und neu ratePctOfPrice (Reinigung in % des Kurses: zusammen mit dem Betrag je Aktie ergibt
--     sich der Kurs). Der Betrag je Aktie bleibt.
-- Die Funktion wird in src/screening/publicResult.test.js gegen echte Ergebnisse der Engine getestet
-- (PGlite). Der Teil zwischen den Markierungen >>> und <<< wird dort eingelesen, bitte beibehalten.

begin;

-- Abhängige Views zuerst entfernen (sie lesen die Spalte public_result)
drop view if exists public.manual_reviews_due;
drop view if exists public.screening_current;
drop view if exists public.screening_current_internal;

-- Spalte neu anlegen, damit alle Zeilen mit der aktuellen Fassung der Funktion berechnet werden
alter table public.screening_runs drop column if exists public_result;

-- >>> screening_public_result
create or replace function public.screening_public_result(r jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  out jsonb := r;
  -- B1/B2: erlaubte Felder je Einzelprüfung (alles andere fällt weg)
  ratio_keys constant text[] := array['basis', 'periodEnd', 'label', 'limit', 'comparator', 'result', 'reason',
                                      'leaseSource', 'leaseAmount', 'leaseEstimate', 'leaseEstimateDecisive'];
  headline_keys constant text[] := array['basis', 'periodEnd', 'limit', 'comparator'];
  binary_criteria constant text[] := array['B1', 'B2'];
begin
  if r is null or jsonb_typeof(r) <> 'object' then
    return r;
  end if;

  -- 1. B1/B2-Prüfungen ohne Wert
  if jsonb_typeof(out -> 'criteria') = 'array' then
    out := jsonb_set(out, '{criteria}', (
      select coalesce(jsonb_agg(
        case
          when c ->> 'id' = any (binary_criteria) and jsonb_typeof(c -> 'checks') = 'array' then
            jsonb_set(c, '{checks}', (
              select coalesce(jsonb_agg(
                case
                  when jsonb_typeof(x) = 'object' then
                    (select coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
                       from jsonb_each(x) as e(k, v)
                      where e.k = any (ratio_keys))
                  else x
                end order by t.i), '[]'::jsonb)
              from jsonb_array_elements(c -> 'checks') with ordinality as t(x, i)))
          else c
        end order by s.n), '[]'::jsonb)
      from jsonb_array_elements(out -> 'criteria') with ordinality as s(c, n)));
  end if;

  -- 2. Kurzfassung für die Liste: bei B1/B2 kein Wert
  if jsonb_typeof(out #> '{headline,failed}') = 'array' then
    out := jsonb_set(out, '{headline,failed}', (
      select coalesce(jsonb_agg(
        case
          when f ->> 'criterion' = any (binary_criteria) and jsonb_typeof(f -> 'check') = 'object' then
            jsonb_set(f, '{check}', (
              select coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
                from jsonb_each(f -> 'check') as e(k, v)
               where e.k = any (headline_keys)))
          else f
        end order by s.n), '[]'::jsonb)
      from jsonb_array_elements(out #> '{headline,failed}') with ordinality as s(f, n)));
  end if;

  -- 3. Reinigung: Rohwerte und Quote in % des Kurses entfernen
  if jsonb_typeof(out #> '{purification,periods}') = 'array' then
    out := jsonb_set(out, '{purification,periods}', (
      select coalesce(jsonb_agg(
        case
          when jsonb_typeof(p) = 'object' then p - 'prohibitedIncome' - 'sharesOutstanding' - 'ratePctOfPrice'
          else p
        end order by s.n), '[]'::jsonb)
      from jsonb_array_elements(out #> '{purification,periods}') with ordinality as s(p, n)));
  end if;

  -- 4. Zakat: Kurs zum Stichtag entfernen
  out := out #- '{zakat,trading,priceAtPeriodEnd}';

  return out;
end
$$;
-- <<< screening_public_result

alter table public.screening_runs
  add column public_result jsonb generated always as (public.screening_public_result(result)) stored;

-- Interne View (volle Werte und Rohdaten), nur Service-Role (Cron)
create view public.screening_current_internal
with (security_invoker = true) as
select distinct on (r.security_id)
  r.*, s.ticker, s.isin, s.name, s.asset_type
from public.screening_runs r
join public.securities s on s.id = r.security_id
order by r.security_id, r.run_at desc, r.id desc;

-- Öffentliche View: bereinigtes Ergebnis unter dem Namen result (Website unverändert)
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
order by r.security_id, r.run_at desc, r.id desc;

-- Arbeitsliste neu anlegen (unverändert aus supabase_schema_screening.sql), weiter gesperrt
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

-- Leserechte: screening_runs öffentlich nur ohne result, inputs und fingerprint
revoke select on public.screening_runs from anon, authenticated;
grant select (id, security_id, status, in_universe, annual_period_end, quarter_period_end, public_result,
              parameters, engine_version, parameters_version, data_provider, run_at)
  on public.screening_runs to anon, authenticated;

-- Neue Views bekommen in Supabase automatisch Rechte für anon/authenticated → ausdrücklich setzen
revoke all on public.screening_current_internal from anon, authenticated;
grant select on public.screening_current_internal to service_role;
grant select on public.screening_current to anon, authenticated;
revoke all on public.manual_reviews_due from anon, authenticated;

-- Die Funktion braucht niemand außer der Datenbank selbst
revoke all on function public.screening_public_result(jsonb) from public, anon, authenticated;

commit;

-- ------------------------------------------------------------------------------- Kontrolle
-- Eine Zeile. Erwartet:
--   titel_mit_ergebnis             = Anzahl Titel mit Ergebnis (z. B. 501)
--   b1_b2_mit_wert                 = 0   (kein Prozentwert, kein Abstand zur Grenze bei B1/B2)
--   marktkap_oder_kurs             = 0   (kein Feld mit Marktkapitalisierung oder Kurs)
--   reinigung_in_prozent_vom_kurs  = 0
--   b1_b2_bestanden_oder_nicht     > 0   (das binäre Ergebnis ist weiter da)
--   anon_liest_result              = false  (volle Werte nicht öffentlich)
--   anon_liest_inputs              = false
--   anon_liest_public_result       = true
--   anon_liest_interne_view        = false
-- Die View screening_current liefert für alle Rollen dasselbe (public_result), deshalb gilt die
-- Zählung auch für die Website mit dem öffentlichen Schlüssel.
select
  (select count(*) from public.screening_current) as titel_mit_ergebnis,
  (select count(*) from public.screening_current sc
    where exists (
      select 1 from jsonb_array_elements(sc.result -> 'criteria') c, jsonb_array_elements(c -> 'checks') x
      where c ->> 'id' in ('B1', 'B2') and (x ? 'value' or x ? 'distanceToLimit' or x ? 'denominator')
    ) or exists (
      select 1 from jsonb_array_elements(sc.result #> '{headline,failed}') f
      where f ->> 'criterion' in ('B1', 'B2') and f -> 'check' ? 'value'
    )) as b1_b2_mit_wert,
  (select count(*) from public.screening_current sc
    where jsonb_path_exists(sc.result, 'strict $.**.marketCapAtPeriodEnd')
       or jsonb_path_exists(sc.result, 'strict $.**.marketCap')
       or jsonb_path_exists(sc.result, 'strict $.**.priceAtPeriodEnd')) as marktkap_oder_kurs,
  (select count(*) from public.screening_current sc
    where jsonb_path_exists(sc.result, 'strict $.**.ratePctOfPrice')) as reinigung_in_prozent_vom_kurs,
  (select count(*) from public.screening_current sc
    where exists (
      select 1 from jsonb_array_elements(sc.result -> 'criteria') c, jsonb_array_elements(c -> 'checks') x
      where c ->> 'id' in ('B1', 'B2') and x ->> 'result' in ('pass', 'fail')
    )) as b1_b2_bestanden_oder_nicht,
  has_column_privilege('anon', 'public.screening_runs', 'result', 'select') as anon_liest_result,
  has_column_privilege('anon', 'public.screening_runs', 'inputs', 'select') as anon_liest_inputs,
  has_column_privilege('anon', 'public.screening_runs', 'public_result', 'select') as anon_liest_public_result,
  has_table_privilege('anon', 'public.screening_current_internal', 'select') as anon_liest_interne_view;
