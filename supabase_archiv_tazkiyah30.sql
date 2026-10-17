-- supabase_archiv_tazkiyah30.sql — Archiv Tazkiyah 30 (Entscheidung 17.10.2026)
--
-- Die Tazkiyah 30 werden zum Launch archiviert, nicht gelöscht. Tazkiyah gibt zum Launch keine eigene
-- Sharia-Einschätzung zu einzelnen Aktien ab. Diese Datei entzieht Besuchern (anon) und angemeldeten
-- Nutzern (authenticated) den Lesezugriff auf alles, was einen Halal-Status enthält. Es wird nichts
-- gelöscht: Tabellen, Views, Daten, RLS-Regeln und Funktionen bleiben, wie sie sind.
--
-- Im Supabase SQL Editor ausführen (die ganze Datei). Abschnitt 2 „Rückgängig machen“ ist auskommentiert
-- und läuft dabei NICHT mit.
--
-- REIHENFOLGE: erst den Branch archiv-tazkiyah30 auf main mergen und das Production-Deployment abwarten,
-- DANN diese Datei ausführen. Der bisherige Stand auf main liest screening_current für die Aktiensuche;
-- ohne Zugriff zeigt er „Die Aktien konnten nicht geladen werden“. Der neue Stand fragt bei
-- ausgeschaltetem Schalter (VITE_FEATURE_TAZKIYAH30) weder screening_current noch tazkiyah30 ab.
--
-- ------------------------------------------------------------------------------------------------
-- Vorab geprüft: Brauchen Aktiensuche oder Aktienseiten eine dieser Views?
--
--   Nein. Aktiensuche (#/aktien), Aktienseiten (#/aktie/TICKER), Kalender, Watchlist und Startseite
--   lesen Name, Ticker, Art (Aktie/ETF), US-Börse (für TradingView) und „aktiv“ aus der Tabelle
--   securities (öffentlich lesbar, ohne Status), Termine und Berichte aus company_calendar (öffentlich,
--   keine Halal-Daten), die Branche aus src/data/stocks.js. ISIN und deutsche Handelsplätze werden
--   öffentlich nirgends angezeigt. Eine eigene öffentliche View ohne Status-Spalten ist deshalb nicht
--   nötig; securities und company_calendar bleiben unverändert öffentlich.
--
-- Zusätzlich entzogen (sonst wäre der Status über die Daten-API weiter lesbar):
--   - screening_runs: Die View screening_current ist „security_invoker“ und liest diese Tabelle; Besucher
--     dürfen sie für die 30 bisher auch direkt lesen (Spalten status und public_result).
--   - screening_status_changes: Verlauf der Statuswechsel (from_status, to_status) der 30.
--   - user_notifications: eigene Watchlist-Hinweise mit from_status/to_status (die Website liest sie nicht).
--
-- Unverändert:
--   - Cron und Skripte (service_role): behalten alle Rechte, auch auf tazkiyah30 (Kalender-Cron liest die
--     Liste) und screening_current_internal.
--   - Interne Views screening_current_internal und manual_reviews_due (waren schon nicht öffentlich).
--   - Trigger (Statuswechsel, Watchlist-Hinweise) laufen als security definer weiter.
--   - Funktion is_tazkiyah30() und alle RLS-Regeln (Policies) bleiben; ohne Leserecht greifen sie nicht.
--     Deshalb stellt Abschnitt 2 den alten Zustand mit wenigen grant-Befehlen wieder her.
-- ------------------------------------------------------------------------------------------------

-- ----------------------------------------------------------------- 1. Öffentlichen Zugriff entziehen
begin;

revoke all on public.screening_current from anon, authenticated;
revoke all on public.tazkiyah30 from anon, authenticated;
-- Entzieht auch die Spaltenrechte (seit supabase_b1_b2_binaer.sql nur einzelne Spalten freigegeben)
revoke all on public.screening_runs from anon, authenticated;
revoke all on public.screening_status_changes from anon, authenticated;
revoke select on public.user_notifications from anon, authenticated;

commit;

-- ------------------------------------------------------------------------------------- Kontrolle
-- Erwartet: alle Spalten mit anon_… und auth_… = false, alle mit service_… und …_bleibt_oeffentlich = true.
select
  has_table_privilege('anon', 'public.screening_current', 'select')              as anon_screening_current,
  has_table_privilege('authenticated', 'public.screening_current', 'select')     as auth_screening_current,
  has_table_privilege('anon', 'public.tazkiyah30', 'select')                     as anon_tazkiyah30,
  has_table_privilege('authenticated', 'public.tazkiyah30', 'select')            as auth_tazkiyah30,
  has_any_column_privilege('anon', 'public.screening_runs', 'select')            as anon_screening_runs,
  has_any_column_privilege('authenticated', 'public.screening_runs', 'select')   as auth_screening_runs,
  has_table_privilege('anon', 'public.screening_status_changes', 'select')       as anon_statuswechsel,
  has_table_privilege('authenticated', 'public.screening_status_changes', 'select') as auth_statuswechsel,
  has_table_privilege('authenticated', 'public.user_notifications', 'select')    as auth_watchlist_hinweise,
  has_table_privilege('service_role', 'public.tazkiyah30', 'select')             as service_tazkiyah30,
  has_table_privilege('service_role', 'public.screening_current_internal', 'select') as service_interne_view,
  has_table_privilege('service_role', 'public.screening_runs', 'select')         as service_liest_laeufe,
  has_table_privilege('anon', 'public.securities', 'select')                     as securities_bleibt_oeffentlich,
  has_table_privilege('anon', 'public.company_calendar', 'select')               as kalender_bleibt_oeffentlich;

-- Probe als Besucher (optional, einzeln ausführen): beide Abfragen müssen mit
-- „permission denied for view screening_current“ bzw. „… for table tazkiyah30“ abbrechen.
--   begin; set local role anon; select count(*) from public.screening_current; rollback;
--   begin; set local role anon; select count(*) from public.tazkiyah30; rollback;


-- ------------------------------------------------------------------------- 2. Rückgängig machen
-- Stellt den Zustand vor dieser Datei wieder her (öffentlich wieder: die 30 mit Status). Nur zusammen mit
-- VITE_FEATURE_TAZKIYAH30 = true in Vercel und einem neuen Deployment sinnvoll.
-- Zum Ausführen die Zeilen zwischen „begin“ und „commit“ markieren, die führenden „-- “ entfernen
-- (bzw. die Zeilen ohne „-- “ in eine neue Abfrage kopieren) und ausführen; danach die Kontrolle oben
-- erneut ausführen (dann alle anon_…/auth_… = true).
--
-- begin;
-- grant select on public.screening_current to anon, authenticated;
-- grant select on public.tazkiyah30 to anon, authenticated;
-- grant select (id, security_id, status, in_universe, annual_period_end, quarter_period_end, public_result,
--               parameters, engine_version, parameters_version, data_provider, run_at)
--   on public.screening_runs to anon, authenticated;
-- grant select on public.screening_status_changes to anon, authenticated;
-- grant select on public.user_notifications to anon, authenticated;
-- commit;
