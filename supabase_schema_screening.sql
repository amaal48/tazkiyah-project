-- supabase_schema_screening.sql
--
-- Schema für den AAOIFI-Screener (Engine: src/screening/engine.js).
-- Manuell im Supabase SQL Editor ausführen (nicht über Claude Code).
-- Das Skript ist wiederholbar (if not exists / or replace).
--
-- Tabellen:
--   securities                — Titel-Stammdaten inkl. Universum (ISIN, dt. Handelsplätze, UCITS/KID)
--   screening_runs            — jedes Screening-Ergebnis (= Statushistorie, E3)
--   screening_status_changes  — Statuswechsel, automatisch per Trigger (E2)
--   user_notifications        — In-App-Hinweise für Nutzer mit dem Titel auf der Watchlist (E2)
--   manual_reviews            — manuelle Prüfungen (A1, A2, A3, B3-Segmente, G2–G4, Fondszinsen G5)
--   etf_holdings              — ETF-Bestandteile mit Gewichtung (G1, G5)
--   purification_amounts      — Reinigungsbetrag pro Aktie und Quartal (F)
--   screening_api_usage       — API-Abrufe pro Tag (Tageslimit des Datenanbieters)
-- Views:
--   screening_current         — jeweils letztes Ergebnis pro Titel
--   manual_reviews_due        — Arbeitsliste: fehlende oder abgelaufene manuelle Prüfungen
--
-- Schreiben dürfen nur der Service-Role-Key (Cron) und du im Dashboard.
-- Lesen ist öffentlich — Transparenz ist Teil des Produkts.

-- ------------------------------------------------------------------ securities

create table if not exists public.securities (
  id                      uuid primary key default gen_random_uuid(),
  ticker                  text not null unique,
  isin                    text unique,
  name                    text not null,
  asset_type              text not null check (asset_type in ('stock', 'etf')),
  product_type            text not null default 'standard',   -- H: z. B. 'leveraged_etf'
  share_class             text check (share_class in (
                            'common', 'preferred_voting_only',
                            'preferred_financial_priority', 'tamattu')),  -- D1/D2
  -- Universum (9)
  german_venues           text[] not null default '{}',       -- z. B. {'XETRA','Tradegate','Frankfurt'}
  is_ucits                boolean,                            -- nur ETFs
  has_kid                 boolean,                            -- nur ETFs: Basisinformationsblatt
  universe_checked_at     timestamptz,
  -- ETFs: Datum des letzten Fonds-Jahresberichts (Ablauf manueller Prüfungen G2–G4)
  fund_annual_report_date date,
  -- Datenanbieter
  data_provider           text,                               -- z. B. 'fmp'
  provider_symbol         text,                               -- Symbol beim Anbieter
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Ergänzt für den Cron (auch bei bereits angelegter Tabelle)
alter table public.securities add column if not exists data_fetched_at timestamptz;
alter table public.securities add column if not exists last_error      text;

drop trigger if exists securities_touch on public.securities;
create trigger securities_touch before update on public.securities
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------- screening_runs

create table if not exists public.screening_runs (
  id                 bigint generated always as identity primary key,
  security_id        uuid not null references public.securities(id) on delete cascade,
  status             text not null check (status in ('konform', 'nicht_konform', 'nicht_geprueft')),
  in_universe        boolean not null,
  annual_period_end  date,
  quarter_period_end date,
  result             jsonb not null,          -- vollständige Engine-Ausgabe (Kriterien, Quellen, Werte)
  parameters         jsonb not null,          -- Parameter-Schnappschuss dieser Runde
  engine_version     text not null,
  parameters_version text not null,
  data_provider      text,
  run_at             timestamptz not null default now()
);

-- Ergänzt 05.10.2026: US-Börse für die Kurs-Widgets (NASDAQ, NYSE, CBOE). Befüllt mit
-- supabase_securities_exchange.sql (aus scripts/sec-exchanges.mjs). Leer = kein Widget.
alter table public.securities add column if not exists exchange text;

-- Ergänzt für den Cron: verwendete Eingangsdaten (für Nachvollziehbarkeit und
-- Neuberechnung ohne API-Abruf) und Prüfsumme des Ergebnisses.
alter table public.screening_runs add column if not exists inputs      jsonb;
alter table public.screening_runs add column if not exists fingerprint text;

create index if not exists screening_runs_security_run_idx
  on public.screening_runs (security_id, run_at desc, id desc);

-- Views werden neu angelegt, damit neue Spalten enthalten sind.
drop view if exists public.manual_reviews_due;
drop view if exists public.screening_current;

create view public.screening_current
with (security_invoker = true) as
select distinct on (r.security_id)
  r.*, s.ticker, s.isin, s.name, s.asset_type
from public.screening_runs r
join public.securities s on s.id = r.security_id
order by r.security_id, r.run_at desc, r.id desc;

-- ---------------------------------------------------- screening_status_changes

create table if not exists public.screening_status_changes (
  id                 bigint generated always as identity primary key,
  security_id        uuid not null references public.securities(id) on delete cascade,
  run_id             bigint not null references public.screening_runs(id) on delete cascade,
  from_status        text,                    -- null = erstes Screening
  to_status          text not null,
  annual_period_end  date,
  quarter_period_end date,
  changed_at         timestamptz not null default now()
);

create index if not exists screening_status_changes_security_idx
  on public.screening_status_changes (security_id, changed_at desc);

create or replace function public.log_screening_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  prev text;
begin
  select status into prev
  from public.screening_runs
  where security_id = new.security_id and id <> new.id
  order by run_at desc, id desc
  limit 1;

  if prev is distinct from new.status then
    insert into public.screening_status_changes
      (security_id, run_id, from_status, to_status, annual_period_end, quarter_period_end)
    values
      (new.security_id, new.id, prev, new.status, new.annual_period_end, new.quarter_period_end);
  end if;
  return new;
end $$;

drop trigger if exists screening_runs_status_change on public.screening_runs;
create trigger screening_runs_status_change after insert on public.screening_runs
  for each row execute function public.log_screening_status_change();

-- ---------------------------------------------------------- user_notifications
-- Vorerst nur Watchlist + Hinweis in der App. Der Text wird in der Oberfläche
-- neutral erzeugt, z. B. „erfüllt die Kriterien nach AAOIFI SS 21 nicht mehr
-- (SS 21, 3/4/8)“. E-Mail folgt mit der E-Mail-Infrastruktur.

create table if not exists public.user_notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  security_id  uuid not null references public.securities(id) on delete cascade,
  change_id    bigint not null references public.screening_status_changes(id) on delete cascade,
  kind         text not null default 'status_change',
  from_status  text,
  to_status    text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  unique (user_id, change_id)
);

create index if not exists user_notifications_user_idx
  on public.user_notifications (user_id, created_at desc);

create or replace function public.notify_watchers_of_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Erstes Screening eines Titels ist kein Statuswechsel für Nutzer.
  if new.from_status is null then
    return new;
  end if;

  insert into public.user_notifications (user_id, security_id, change_id, from_status, to_status)
  select distinct w.user_id, new.security_id, new.id, new.from_status, new.to_status
  from public.watchlist_items w
  join public.securities s on s.ticker = w.ticker
  where s.id = new.security_id
  on conflict (user_id, change_id) do nothing;

  return new;
end $$;

drop trigger if exists status_change_notify on public.screening_status_changes;
create trigger status_change_notify after insert on public.screening_status_changes
  for each row execute function public.notify_watchers_of_status_change();

-- -------------------------------------------------------------- manual_reviews
-- Eine Zeile pro Prüfung. Die jüngste Zeile je Titel und Kriterium zählt.
-- Gültig nur, solange basis_annual_period_end dem aktuellen Jahresabschluss
-- entspricht (bei ETFs: fund_annual_report_date). Neuer Abschluss → abgelaufen.
--
-- details (jsonb), nur bei criterion = 'B3_SEGMENTS' und result = 'fail':
--   {"prohibitedRevenueByPeriod": {
--      "annual:2025-12-31":  {"music": 1200000, "derivatives": 50000},
--      "quarter:2026-06-30": {"music": 310000},
--      ...}}
--   Je Periode entweder eine Summe (Zahl) oder Beträge nach Kategorie.
--   Kategorien (src/screening/industryRules.js, PROHIBITED_INCOME_CATEGORIES):
--   interest_in_revenue, riba_other, derivatives, securities_lending,
--   conventional_fund_fees, alcohol, pork, gambling, adult, drugs, tobacco,
--   weapons, music, other. Zinserträge aus der GuV-Zeile NICHT eintragen —
--   die zählt die Engine automatisch. Beträge in Berichtswährung.
--   Fehlt eine Periode oder ist eine Kategorie unbekannt → „nicht geprüft“.
--
-- details bei criterion = 'B1_LEASE' (Leasing im letzten Quartal laut Quartalsbericht, 10-Q),
-- nur nötig, wenn B1 wegen einer Leasing-Schätzung „nicht geprüft“ ist:
--   {"quarterPeriodEnd": "2026-06-27", "leaseLiabilities": 13720000000}
--   Betrag in Berichtswährung, ohne bereits in den Schuldenposten enthaltenes Leasing.
--   result = 'pass' bestätigt den Wert; gilt nur für dieses Quartal und den aktuellen Jahresabschluss.
--
-- details bei criterion = 'G5_FUND_INCOME' (fondseigene Zinserträge, ETF):
--   {"interestIncomePctOfAssets": 0.02}   -- in % des Fondsvermögens, laut Jahresbericht

create table if not exists public.manual_reviews (
  id                     bigint generated always as identity primary key,
  security_id            uuid not null references public.securities(id) on delete cascade,
  criterion              text not null,
  result                 text not null check (result in ('pass', 'fail', 'unclear')),
  details                jsonb not null default '{}'::jsonb,
  source_url             text,            -- z. B. Link zum Jahresbericht / Prospekt
  source_note            text,            -- z. B. „10-K 2025, S. 43, Item 1“
  reviewer               text not null,
  reviewed_at            timestamptz not null default now(),
  basis_annual_period_end date not null,  -- auf welchem Jahresabschluss die Prüfung beruht
  constraint manual_reviews_source_required check (source_url is not null or source_note is not null)
);

-- Erlaubte Kriterien als benannte Constraint, damit spätere Erweiterungen
-- dieses Skript einfach erneut ausführen können.
alter table public.manual_reviews drop constraint if exists manual_reviews_criterion_check;
alter table public.manual_reviews add constraint manual_reviews_criterion_check
  check (criterion in ('A1', 'A2', 'A3', 'B1_LEASE', 'B3_SEGMENTS', 'G2', 'G3', 'G4', 'G5_FUND_INCOME'));

create index if not exists manual_reviews_lookup_idx
  on public.manual_reviews (security_id, criterion, reviewed_at desc);

-- Ergänzt 06.10.2026: Umfang der Gegenprüfung durch die Nutzerin.
--   'full'   = alle zitierten Stellen vollständig gegengeprüft (Pflicht für pass)
--   'sample' = Stichprobe (nur für fail erlaubt, siehe scripts/review-to-sql.mjs)
--   null     = Altbestand von vor dieser Regel
alter table public.manual_reviews add column if not exists verification text;
alter table public.manual_reviews drop constraint if exists manual_reviews_verification_check;
alter table public.manual_reviews add constraint manual_reviews_verification_check
  check (verification is null or verification in ('full', 'sample'));

-- Ergänzt 06.10.2026: Lag der Prüfung ein KI-Entwurf zugrunde? Nur intern, wird nie angezeigt.
-- reviewer ist seit 06.10.2026 das Kürzel der prüfenden Person (z. B. 'AMI').
alter table public.manual_reviews add column if not exists ai_draft boolean not null default false;

-- Ergänzt 08.10.2026: Zinserträge laut Anhang je Periode (nur B3_SEGMENTS), siehe
-- supabase_manual_reviews_interest_notes.sql. Nicht öffentlich lesbar (wie manual_reviews).
alter table public.manual_reviews add column if not exists interest_income_notes jsonb;
alter table public.manual_reviews drop constraint if exists manual_reviews_interest_income_notes_check;
alter table public.manual_reviews add constraint manual_reviews_interest_income_notes_check check (
  interest_income_notes is null
  or (criterion = 'B3_SEGMENTS' and jsonb_typeof(interest_income_notes) = 'object')
);

-- Arbeitsliste: welche Pflichtprüfungen fehlen oder sind abgelaufen?
-- Aktien: A2 und B3_SEGMENTS (A1 nur für Prüfbranchen — steht im Ergebnis
-- als „nicht geprüft“ mit Begründung). ETFs: G2, G3, G4, G5_FUND_INCOME.
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

-- ---------------------------------------------------------------- etf_holdings

-- holding_isin: ISIN, falls die Anbieterdatei eine enthält; sonst ein
-- Schlüssel "TICKER:<Ticker>:<Land>". Die Zuordnung zu eigenen Titeln läuft
-- dann über holding_ticker + holding_country (siehe src/screening/runner.js).
-- Befüllt über scripts/import-etf-holdings.mjs.
create table if not exists public.etf_holdings (
  etf_id        uuid not null references public.securities(id) on delete cascade,
  holding_isin  text not null,
  holding_name  text,
  weight        numeric not null check (weight >= 0 and weight <= 100),  -- in %
  as_of         date not null,
  source_url    text,
  primary key (etf_id, holding_isin, as_of)
);

alter table public.etf_holdings add column if not exists holding_ticker  text;
alter table public.etf_holdings add column if not exists holding_country text;

-- -------------------------------------------------------- purification_amounts

create table if not exists public.purification_amounts (
  security_id          uuid not null references public.securities(id) on delete cascade,
  period_end           date not null,            -- Stichtag (F2)
  currency             text,
  prohibited_income    numeric,
  shares_outstanding   numeric,
  shares_basis         text,
  amount_per_share     numeric,
  amount_per_share_eur numeric,
  rate_pct_of_price    numeric,                  -- Grundlage für ETFs (G5)
  run_id               bigint references public.screening_runs(id) on delete set null,
  computed_at          timestamptz not null default now(),
  primary key (security_id, period_end)
);

-- ---------------------------------------------------------- screening_api_usage
-- Zählt API-Abrufe pro Tag und Anbieter, damit das Tageslimit (FMP Free:
-- 250) auch bei mehreren Läufen am selben Tag eingehalten wird.

create table if not exists public.screening_api_usage (
  day      date not null,
  provider text not null,
  calls    integer not null default 0,
  primary key (day, provider)
);

create or replace function public.add_api_usage(p_provider text, p_calls integer)
returns integer language sql security definer set search_path = public as $$
  insert into public.screening_api_usage (day, provider, calls)
  values ((now() at time zone 'utc')::date, p_provider, p_calls)
  on conflict (day, provider) do update set calls = screening_api_usage.calls + excluded.calls
  returning calls;
$$;

revoke all on function public.add_api_usage(text, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.add_api_usage(text, integer) from anon, authenticated';
  end if;
  -- Der Cron nutzt den Service-Role-Key und muss die Funktion aufrufen dürfen.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.add_api_usage(text, integer) to service_role';
  end if;
end $$;

-- ------------------------------------------------------------ screening_lock
-- Sperre gegen gleichzeitige Screening-Läufe (seit 01.10.2026). Zwei parallele
-- Läufe hatten am 30.09. das Tagesbudget doppelt verbraucht. Eine Sperre läuft
-- nach p_ttl_seconds von selbst ab, falls ein Lauf abstürzt.

create table if not exists public.screening_lock (
  id           integer primary key default 1 check (id = 1),
  holder       text,
  locked_until timestamptz not null default 'epoch'
);
insert into public.screening_lock (id) values (1) on conflict (id) do nothing;

create or replace function public.acquire_screening_lock(p_holder text, p_ttl_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare got integer;
begin
  update public.screening_lock
     set holder = p_holder, locked_until = now() + make_interval(secs => p_ttl_seconds)
   where id = 1 and locked_until < now();
  get diagnostics got = row_count;
  return got = 1;
end $$;

create or replace function public.release_screening_lock(p_holder text)
returns void language sql security definer set search_path = public as $$
  update public.screening_lock set holder = null, locked_until = 'epoch' where id = 1 and holder = p_holder;
$$;

revoke all on function public.acquire_screening_lock(text, integer) from public;
revoke all on function public.release_screening_lock(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.acquire_screening_lock(text, integer) from anon, authenticated';
    execute 'revoke all on function public.release_screening_lock(text) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.acquire_screening_lock(text, integer) to service_role';
    execute 'grant execute on function public.release_screening_lock(text) to service_role';
  end if;
end $$;

-- ------------------------------------------------------------------------- RLS

alter table public.securities               enable row level security;
alter table public.screening_runs           enable row level security;
alter table public.screening_status_changes enable row level security;
alter table public.user_notifications       enable row level security;
alter table public.manual_reviews           enable row level security;
alter table public.etf_holdings             enable row level security;
alter table public.purification_amounts     enable row level security;
alter table public.screening_api_usage      enable row level security;  -- keine Policies: nur Service-Role
alter table public.screening_lock           enable row level security;  -- keine Policies: nur Service-Role

-- Öffentlich lesbar (keine Schreib-Policies → nur Service-Role/Dashboard schreibt)
do $$
declare t text;
begin
  foreach t in array array['securities', 'screening_runs', 'screening_status_changes',
                           'etf_holdings', 'purification_amounts']
  loop
    execute format('drop policy if exists "%s_public_read" on public.%I', t, t);
    execute format('create policy "%s_public_read" on public.%I for select to anon, authenticated using (true)', t, t);
  end loop;
end $$;

-- manual_reviews ist seit 06.10.2026 nicht mehr öffentlich lesbar (enthält Prüfer-Kürzel,
-- ai_draft und Entwurfstexte). Die Website liest die Tabelle nie, der Cron nutzt die Service-Role.
-- Auch die Arbeitsliste manual_reviews_due ist nur intern (SQL Editor).
drop policy if exists "manual_reviews_public_read" on public.manual_reviews;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke select on public.manual_reviews from anon, authenticated';
    execute 'revoke select on public.manual_reviews_due from anon, authenticated';
  end if;
end $$;

-- Benachrichtigungen: nur eigene lesen und als gelesen markieren
drop policy if exists "notifications_own_read" on public.user_notifications;
create policy "notifications_own_read" on public.user_notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_own_mark_read" on public.user_notifications;
create policy "notifications_own_mark_read" on public.user_notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke update on public.user_notifications from authenticated;
grant update (read_at) on public.user_notifications to authenticated;
