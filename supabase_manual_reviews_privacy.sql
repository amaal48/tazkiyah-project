-- supabase_manual_reviews_privacy.sql
--
-- 06.10.2026: Interne Prüfdaten nicht mehr öffentlich lesbar machen.
-- Hintergrund: Mit dem öffentlichen Schlüssel (anon) waren lesbar
--   - manual_reviews mit allen Spalten (reviewer, ai_draft, details mit kiDraft,
--     Begründung und Zitaten),
--   - manual_reviews_due (interne Arbeitsliste),
--   - in screening_runs.result die Prüfer-Angabe (criteria[].review.reviewer und
--     purification.fundInterestReview.reviewer; am 06.10.: 39 Stellen in 31 Läufen).
-- Die Website liest manual_reviews und manual_reviews_due nie; der Cron nutzt den
-- Service-Role-Schlüssel und ist nicht betroffen. Neue Ergebnisse (Engine 1.4.0) enthalten
-- reviewer nicht mehr.
--
-- Im Supabase SQL Editor ausführen, NACH supabase_manual_reviews_verification.sql.
-- Wiederholbar. Teil 1 steht genauso in supabase_schema_screening.sql.

-- ---------------------------------------------------- Teil 1: Lesezugriff entziehen

drop policy if exists "manual_reviews_public_read" on public.manual_reviews;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke select on public.manual_reviews from anon, authenticated';
    execute 'revoke select on public.manual_reviews_due from anon, authenticated';
  end if;
end $$;

-- --------------------------------- Teil 2: Prüfer-Angabe aus gespeicherten Ergebnissen
-- Entfernt nur den Schlüssel "reviewer"; alles andere im Ergebnis bleibt unverändert.
-- Die Spalte fingerprint bleibt, beim nächsten Lauf wird ohnehin neu gerechnet.

update public.screening_runs r
set result = jsonb_set(r.result, '{criteria}', (
  select coalesce(jsonb_agg(
           case when jsonb_typeof(c->'review') = 'object' then jsonb_set(c, '{review}', (c->'review') - 'reviewer')
                else c end
           order by ord), '[]'::jsonb)
  from jsonb_array_elements(r.result->'criteria') with ordinality as x(c, ord)))
where jsonb_typeof(r.result->'criteria') = 'array'
  and exists (select 1 from jsonb_array_elements(r.result->'criteria') c
              where jsonb_typeof(c->'review') = 'object' and (c->'review') ? 'reviewer');

update public.screening_runs r
set result = jsonb_set(r.result, '{purification,fundInterestReview}',
                       (r.result #> '{purification,fundInterestReview}') - 'reviewer')
where jsonb_typeof(r.result #> '{purification,fundInterestReview}') = 'object'
  and (r.result #> '{purification,fundInterestReview}') ? 'reviewer';

-- ---------------------------------------------------------------- Kontrolle
-- Erwartet: 0 Läufe mit "reviewer" und keine Lese-Policy mehr auf manual_reviews.
select count(*) as laeufe_mit_reviewer
from public.screening_runs
where result::text like '%"reviewer"%';

select policyname from pg_policies where schemaname = 'public' and tablename = 'manual_reviews';
