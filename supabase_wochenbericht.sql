-- supabase_wochenbericht.sql — Wochenbericht mit Prüfung und Freigabe (16.10.2026)
--
-- Im Supabase SQL Editor ausführen. Wiederholbar (bis auf Schritt 0, der nur einmal greift).
--
-- Ablauf: Entwurf (geplante Aufgabe in Claude, Samstag → Notion) → von Hand auf der internen Prüfseite
-- eingefügt → geprüft, Lücken geschlossen, Checkliste abgehakt → „freigegeben“ → der Cron
-- api/publish-weekly-report.js setzt ihn ab erscheint_am (Montag 12:00 Europe/Berlin) auf „veroeffentlicht“.
-- Ohne Freigabe erscheint nie etwas. Öffentlich lesbar ist nur status = 'veroeffentlicht'.
--
-- Was die Datenbank selbst sicherstellt (Trigger, auch wenn jemand an der Website vorbei schreibt):
--   * Freigabe nur ohne [eckige Klammern] im Text und mit allen 11 Punkten der Checkliste.
--   * Jede inhaltliche Änderung an einer freigegebenen Ausgabe setzt sie zurück auf „entwurf“.
--   * Änderungen an einer veröffentlichten Ausgabe sind Korrekturen: korrigiert_am wird gesetzt.
--   * „veroeffentlicht“ setzt nur der Cron (service_role) oder der SQL Editor, nie die Website.
--   * Zurückziehen nur mit Grund.
--   * Jede Speicherung landet als Version in weekly_report_versions (Änderungsprotokoll).
--
-- NACH DEM AUSFÜHREN: eigenes Konto als Admin eintragen (Schritt 5 unten, E-Mail-Adresse einsetzen).

begin;

-- 0) Alte Tabelle sichern (einmalig): Die bisherige weekly_reports (alter Generator, Demo-Format) wird
--    in weekly_reports_alt umbenannt, nichts wird gelöscht. Prüfen und später selbst entfernen:
--    drop table public.weekly_reports_alt;
do $$
begin
  if to_regclass('public.weekly_reports') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'weekly_reports' and column_name = 'drei_saetze') then
    if to_regclass('public.weekly_reports_alt') is null then
      alter table public.weekly_reports rename to weekly_reports_alt;
      revoke all on public.weekly_reports_alt from anon, authenticated;
    else
      raise exception 'weekly_reports hat das alte Format und weekly_reports_alt existiert schon. Bitte von Hand klären.';
    end if;
  end if;
end $$;

-- 1) Admins
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
-- keine Policy: niemand liest admins direkt, nur über is_admin()

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- 2) Wochenberichte
create table if not exists public.weekly_reports (
  id                   uuid primary key default gen_random_uuid(),
  jahr                 int  not null check (jahr between 2020 and 2100),
  kw                   int  not null check (kw between 1 and 53),
  zeitraum_von         date not null,
  zeitraum_bis         date not null,
  titel                text not null default '',
  drei_saetze          text not null default '',
  body_md              text not null default '',  -- Fließtext in Markdown, Abschnitte mit „## …“
  einordnung           text not null default '',  -- Kasten „Einordnung für muslimische Anleger“
  quellen              jsonb not null default '[]', -- [{ "nr": 1, "titel": "…", "url": "https://…" | null }]
  mail_kurzfassung     text not null default '',
  checkliste           jsonb not null default '{}', -- { "1": true, …, "11": true }
  status               text not null default 'entwurf'
                       check (status in ('entwurf', 'freigegeben', 'veroeffentlicht', 'zurueckgezogen')),
  erscheint_am         timestamptz,                -- Montag nach zeitraum_bis, 12:00 Europe/Berlin
  erstellt_am          timestamptz not null default now(),
  geaendert_am         timestamptz not null default now(),
  freigegeben_am       timestamptz,
  veroeffentlicht_am   timestamptz,
  korrigiert_am        timestamptz,
  zurueckgezogen_am    timestamptz,
  zurueckgezogen_grund text,
  unique (jahr, kw),
  check (zeitraum_bis >= zeitraum_von)
);
create index if not exists weekly_reports_status_idx on public.weekly_reports (status, erscheint_am);

comment on table public.weekly_reports is
  'Wochenberichte. Öffentlich nur status = veroeffentlicht. Entwürfe nur für is_admin(). Veröffentlichen nur per Cron (service_role).';

-- Versionen (Änderungsprotokoll): jede Speicherung als ganzer Inhalt
create table if not exists public.weekly_report_versions (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.weekly_reports(id) on delete cascade,
  saved_at    timestamptz not null default now(),
  saved_by    uuid,
  status      text not null,
  inhalt      jsonb not null
);
create index if not exists weekly_report_versions_report_idx on public.weekly_report_versions (report_id, saved_at desc);

-- 3) Regeln als Trigger
-- Lücken: [eckige Klammern], aber keine Markdown-Links [Text](https://…)
create or replace function public.weekly_report_gap_count(r public.weekly_reports) returns int
language sql immutable as $$
  select count(*)::int from regexp_matches(
    concat_ws(E'\n', r.titel, r.drei_saetze, r.body_md, r.einordnung, r.mail_kurzfassung,
              (select string_agg(concat_ws(' ', q ->> 'titel', q ->> 'url'), E'\n')
                 from jsonb_array_elements(case when jsonb_typeof(r.quellen) = 'array' then r.quellen else '[]'::jsonb end) q)),
    '\[[^\]\n]*\](?!\()', 'g');
$$;

create or replace function public.weekly_report_checks_done(r public.weekly_reports) returns boolean
language sql immutable as $$
  select bool_and(coalesce((r.checkliste ->> n::text)::boolean, false)) from generate_series(1, 11) as n;
$$;

create or replace function public.weekly_reports_guard() returns trigger
language plpgsql as $$
declare
  is_system boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
  inhalt_geaendert boolean;
begin
  -- erscheint_am: Montag nach dem Berichtszeitraum, 12:00 Uhr in Berlin (Sommer-/Winterzeit über die Zeitzone)
  if new.erscheint_am is null or (tg_op = 'UPDATE' and new.zeitraum_bis is distinct from old.zeitraum_bis and new.erscheint_am = old.erscheint_am) then
    new.erscheint_am := ((new.zeitraum_bis + (8 - extract(isodow from new.zeitraum_bis)::int)) + time '12:00') at time zone 'Europe/Berlin';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'entwurf' and not is_system then
      raise exception 'Neue Wochenberichte beginnen als Entwurf.';
    end if;
    new.erstellt_am := now();
    new.geaendert_am := now();
    return new;
  end if;

  inhalt_geaendert := (new.titel, new.drei_saetze, new.body_md, new.einordnung, new.quellen, new.mail_kurzfassung, new.checkliste,
                       new.jahr, new.kw, new.zeitraum_von, new.zeitraum_bis)
                      is distinct from
                      (old.titel, old.drei_saetze, old.body_md, old.einordnung, old.quellen, old.mail_kurzfassung, old.checkliste,
                       old.jahr, old.kw, old.zeitraum_von, old.zeitraum_bis);
  if inhalt_geaendert then
    new.geaendert_am := now();
  end if;

  -- Veröffentlichen nur durch den Cron bzw. den SQL Editor
  if new.status = 'veroeffentlicht' and old.status <> 'veroeffentlicht' then
    if not is_system then
      raise exception 'Veröffentlichen übernimmt der Cron (Montag 12:00), nicht die Website.';
    end if;
    if old.status <> 'freigegeben' then
      raise exception 'Nur freigegebene Wochenberichte können erscheinen.';
    end if;
    new.veroeffentlicht_am := coalesce(new.veroeffentlicht_am, now());
  end if;

  -- Änderung nach der Freigabe → zurück auf Entwurf
  if old.status = 'freigegeben' and new.status = 'freigegeben' and inhalt_geaendert then
    new.status := 'entwurf';
    new.freigegeben_am := null;
  end if;

  -- Freigabe nur ohne Lücken und mit allen 11 Punkten
  if new.status = 'freigegeben' and old.status <> 'freigegeben' then
    if public.weekly_report_gap_count(new) > 0 then
      raise exception 'Freigabe nicht möglich: Es stehen noch [eckige Klammern] im Text.';
    end if;
    if not public.weekly_report_checks_done(new) then
      raise exception 'Freigabe nicht möglich: Die Checkliste ist nicht vollständig abgehakt.';
    end if;
    new.freigegeben_am := now();
  end if;
  if new.status = 'entwurf' then
    new.freigegeben_am := null;
  end if;

  -- Korrektur an einer veröffentlichten Ausgabe
  if old.status = 'veroeffentlicht' and new.status = 'veroeffentlicht' and inhalt_geaendert then
    if public.weekly_report_gap_count(new) > 0 then
      raise exception 'Korrektur nicht möglich: Es stehen [eckige Klammern] im Text.';
    end if;
    new.korrigiert_am := now();
  end if;

  -- Zurückziehen nur mit Grund (nur veröffentlichte oder freigegebene Ausgaben)
  if new.status = 'zurueckgezogen' and old.status <> 'zurueckgezogen' then
    if coalesce(btrim(new.zurueckgezogen_grund), '') = '' then
      raise exception 'Zurückziehen nur mit Grund.';
    end if;
    new.zurueckgezogen_am := now();
  end if;

  -- Veröffentlichte Ausgaben nicht zurück in den Entwurf (nur korrigieren oder zurückziehen)
  if old.status = 'veroeffentlicht' and new.status in ('entwurf', 'freigegeben') then
    raise exception 'Eine veröffentlichte Ausgabe kann nur korrigiert oder zurückgezogen werden.';
  end if;
  return new;
end $$;

drop trigger if exists weekly_reports_guard on public.weekly_reports;
create trigger weekly_reports_guard before insert or update on public.weekly_reports
  for each row execute function public.weekly_reports_guard();

create or replace function public.weekly_reports_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.weekly_report_versions (report_id, saved_by, status, inhalt)
  values (new.id, auth.uid(), new.status, to_jsonb(new) - 'id');
  return null;
end $$;

drop trigger if exists weekly_reports_version on public.weekly_reports;
create trigger weekly_reports_version after insert or update on public.weekly_reports
  for each row execute function public.weekly_reports_version();

-- 4) Rechte und RLS
alter table public.weekly_reports enable row level security;
alter table public.weekly_report_versions enable row level security;

drop policy if exists "weekly_reports_public_read" on public.weekly_reports;
drop policy if exists "weekly_reports_admin_all" on public.weekly_reports;
-- alte Policies aus der Zeit vor dieser Datei (Namen unbekannt) gehören zur umbenannten Tabelle weekly_reports_alt
create policy "weekly_reports_public_read" on public.weekly_reports
  for select to anon, authenticated using (status = 'veroeffentlicht');
create policy "weekly_reports_admin_all" on public.weekly_reports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "weekly_report_versions_admin_read" on public.weekly_report_versions;
create policy "weekly_report_versions_admin_read" on public.weekly_report_versions
  for select to authenticated using (public.is_admin());

revoke all on public.weekly_reports, public.weekly_report_versions from anon, authenticated;
grant select on public.weekly_reports to anon, authenticated;
grant insert, update, delete on public.weekly_reports to authenticated;   -- wirksam nur über die Admin-Policy
grant select on public.weekly_report_versions to authenticated;          -- nur Admins (Policy)
grant select, insert, update, delete on public.weekly_reports, public.weekly_report_versions to service_role;
grant usage on sequence public.weekly_report_versions_id_seq to authenticated, service_role;

commit;

-- 5) Eigenes Konto als Admin eintragen (E-Mail-Adresse einsetzen, dann diese Zeile allein ausführen):
-- insert into public.admins (user_id) select id from auth.users where email = 'DEINE-ADRESSE@beispiel.de' on conflict do nothing;

-- 6) Kontrolle. Erwartet: tabelle_da = true, alte_tabelle_gesichert = true (falls es eine gab),
--    anon_liest_nur_veroeffentlicht = true, admins_eingetragen ≥ 1 (nach Schritt 5)
select
  to_regclass('public.weekly_reports') is not null as tabelle_da,
  to_regclass('public.weekly_reports_alt') is not null as alte_tabelle_gesichert,
  exists (select 1 from pg_policies where tablename = 'weekly_reports' and policyname = 'weekly_reports_public_read'
          and qual like '%veroeffentlicht%') as anon_liest_nur_veroeffentlicht,
  (select count(*) from public.admins) as admins_eingetragen;

-- Test des Crons (in der Vorschau), nur bei einer FREIGEGEBENEN Test-Ausgabe, Erscheinungszeit in die Vergangenheit legen:
-- update public.weekly_reports set erscheint_am = now() - interval '1 minute' where jahr = 2026 and kw = 42 and status = 'freigegeben';
-- Achtung: Vorschau und Website nutzen dieselbe Datenbank. Danach auf der Prüfseite „Zurückziehen“.
