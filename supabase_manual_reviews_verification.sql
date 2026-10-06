-- supabase_manual_reviews_verification.sql
--
-- Ergänzt 06.10.2026: Gegenprüfung und Prüfer-Angabe in manual_reviews.
--   verification: 'full'   = alle zitierten Stellen vollständig gegengeprüft (Pflicht für pass)
--                 'sample' = Stichprobe (nur für fail erlaubt, siehe scripts/review-to-sql.mjs)
--                 null     = Altbestand von vor dieser Regel
--   ai_draft:     true = der Prüfung lag ein KI-Entwurf zugrunde (nur intern, nie angezeigt)
--   reviewer:     ab jetzt das Kürzel der prüfenden Person (z. B. 'AMI'), nur intern
--
-- Einmal im Supabase SQL Editor ausführen, VOR der nächsten insert-reviews.sql.
-- Wiederholbar. Teil 1 steht genauso in supabase_schema_screening.sql.

-- ---------------------------------------------------------------- Teil 1: Spalten

alter table public.manual_reviews add column if not exists verification text;

alter table public.manual_reviews drop constraint if exists manual_reviews_verification_check;
alter table public.manual_reviews add constraint manual_reviews_verification_check
  check (verification is null or verification in ('full', 'sample'));

alter table public.manual_reviews add column if not exists ai_draft boolean not null default false;

comment on column public.manual_reviews.verification is
  'Gegenprüfung: full = alle zitierten Stellen vollständig geprüft (Pflicht für pass), sample = Stichprobe (nur für fail), null = Altbestand.';
comment on column public.manual_reviews.ai_draft is
  'true = der Prüfung lag ein KI-Entwurf zugrunde. Nur intern, wird nicht angezeigt.';
comment on column public.manual_reviews.reviewer is
  'Kürzel der prüfenden Person (seit 06.10.2026, z. B. AMI). Nur intern, wird nicht angezeigt.';

-- ------------------------------------- Teil 2: die sieben Einträge vom 04.10.2026 nachtragen
-- Die Pilot-Prüfungen A2 (HD, JNJ, KO, MSFT, NVDA) und B3 (JNJ, NVDA) stehen schon seit
-- 04.10.2026 in der Tabelle, noch mit der alten Prüfer-Angabe. Laut Nutzerin vollständig
-- geprüft (06.10.2026). Trifft nur Zeilen mit genau der alten Angabe; wiederholbar.

update public.manual_reviews m
set reviewer = 'AMI', ai_draft = true, verification = 'full'
from public.securities s
where s.id = m.security_id
  and m.reviewer = 'KI-Entwurf (Claude), kontrolliert von Amaal Ibrahim'
  and m.result = 'pass'
  and ((m.criterion = 'A2' and s.ticker in ('HD', 'JNJ', 'KO', 'MSFT', 'NVDA'))
    or (m.criterion = 'B3_SEGMENTS' and s.ticker in ('JNJ', 'NVDA')));

-- Kontrolle: Spalten vorhanden?
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'manual_reviews' and column_name in ('verification', 'ai_draft')
order by column_name;

-- Kontrolle: Stand aller manuellen Prüfungen (erwartet: 7 Zeilen mit AMI / true / full,
-- die ETF-Prüfungen von ISWD mit Tazkiyah / false / leer)
select s.ticker, m.criterion, m.result, m.reviewer, m.ai_draft, m.verification, m.reviewed_at
from public.manual_reviews m
join public.securities s on s.id = m.security_id
order by s.ticker, m.criterion;
