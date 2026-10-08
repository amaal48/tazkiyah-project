-- supabase_manual_reviews_interest_notes.sql — Zinserträge laut Anhang in der B3-Prüfung (08.10.2026)
--
-- Im Supabase SQL Editor ausführen. Wiederholbar.
--
-- Zweck: Fehlen die Zinserträge in den Finanzdaten (z. B. AAPL: nur im Saldo „Other income/(expense)“),
-- trägt die B3-Prüfung (Segmente aus dem 10-K) sie aus dem Anhang ein. Die Engine (ab 1.5.0) nutzt
-- den Wert nur, wenn der Datenwert fehlt, und kennzeichnet ihn („Zinserträge von Hand aus dem Anhang“).
--
-- Format (wie details.prohibitedRevenueByPeriod), je Periode Betrag und Fundstelle:
--   {
--     "annual:2025-09-27":  { "amount": 3500000000, "source": "10-K 2025, Note 5 Other Income, S. 34" },
--     "quarter:2026-06-27": { "amount":  900000000, "source": "10-Q Q3 2026, Note 4, S. 12" }
--   }
-- Betrag in der Berichtswährung, in Einheiten (nicht Millionen).
--
-- Die Spalte ist wie alle Prüfdaten nicht öffentlich lesbar (manual_reviews ist seit 06.10.2026
-- für anon/authenticated gesperrt). Der Cron liest sie mit dem Service-Role-Key; vor dieser
-- Datei liest er ohne die Spalte weiter (Rückfall in supabaseRepo.js).

alter table public.manual_reviews add column if not exists interest_income_notes jsonb;

alter table public.manual_reviews drop constraint if exists manual_reviews_interest_income_notes_check;
alter table public.manual_reviews add constraint manual_reviews_interest_income_notes_check check (
  interest_income_notes is null
  or (criterion = 'B3_SEGMENTS' and jsonb_typeof(interest_income_notes) = 'object')
);

comment on column public.manual_reviews.interest_income_notes is
  'Zinserträge laut Anhang je Periode ("annual:JJJJ-MM-TT"/"quarter:JJJJ-MM-TT" → {amount, source}); nur B3_SEGMENTS';

-- Kontrolle: Spalte vorhanden?
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'manual_reviews' and column_name = 'interest_income_notes';
