-- supabase_isin_tazkiyah30.sql — fehlende ISINs der Tazkiyah 30 nachtragen (15.10.2026)
--
-- Im Supabase SQL Editor ausführen. Wiederholbar: setzt die ISIN nur, wo sie noch fehlt.
--
-- Herkunft: CUSIP aus der amtlichen Liste der SEC „Official List of Section 13(f) Securities“, 3. Quartal 2026
-- (https://www.sec.gov/files/investment/13flist2026q3.txt, Zeile mit Stern = Stammaktie), ISIN = „US“ + CUSIP +
-- Prüfziffer (Luhn-Verfahren nach ISO 6166). Die 21 schon vorhandenen ISINs der 30 haben eine gültige Prüfziffer
-- und stehen mit ihrer CUSIP in derselben Liste.
-- Die deutschen Handelsplätze (german_venues) trägt die Redaktion danach selbst ein. Hinweis: Der Cron fragt
-- OpenFIGI nur alle 90 Tage je Titel ab (universe_checked_at), eine leere Liste bleibt sonst bis dahin stehen.

begin;

-- Abbruch, falls eine ISIN schon bei einem anderen Titel steht (Spalte isin ist eindeutig)
do $$
declare dup text;
begin
  select string_agg(s.ticker || ' hat schon ' || s.isin, ', ') into dup
  from public.securities s
  join (values
  ('ADI', 'US0326541051'),
  ('AMAT', 'US0382221051'),
  ('AMGN', 'US0311621009'),
  ('ANET', 'US0404132054'),
  ('BMY', 'US1101221083'),
  ('BSX', 'US1011371077'),
  ('CRM', 'US79466L3024'),
  ('VRTX', 'US92532F1003'),
  ('WDAY', 'US98138H1014')
  ) v(ticker, isin) on v.isin = s.isin and v.ticker <> s.ticker;
  if dup is not null then raise exception 'ISIN bereits vergeben: %', dup; end if;
end $$;

update public.securities s
set isin = v.isin, updated_at = now()
from (values
  ('ADI', 'US0326541051'),
  ('AMAT', 'US0382221051'),
  ('AMGN', 'US0311621009'),
  ('ANET', 'US0404132054'),
  ('BMY', 'US1101221083'),
  ('BSX', 'US1011371077'),
  ('CRM', 'US79466L3024'),
  ('VRTX', 'US92532F1003'),
  ('WDAY', 'US98138H1014')
) v(ticker, isin)
where s.ticker = v.ticker and s.isin is null;

commit;

-- Kontrolle: alle 30 mit ISIN. Erwartet: 30 Zeilen, keine mit isin = null.
select t.sort_order, s.ticker, s.name, s.isin, s.german_venues
from public.tazkiyah30 t
join public.securities s on s.ticker = t.ticker
order by t.sort_order;
