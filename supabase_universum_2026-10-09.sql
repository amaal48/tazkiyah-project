-- Universum-Anpassung vom 2026-10-09, erzeugt mit scripts/import-universum.mjs aus docs/universum-pruefung.xlsx.
-- Nicht automatisch ausgeführt: im Supabase SQL Editor ausführen und die Kontrollabfrage am Ende prüfen.
--
-- Prüfungen (manual_reviews), Verlauf (screening_runs, screening_status_changes), Reinigung und Holdings
-- hängen an securities.id, nicht am Ticker: Eine Umbenennung trennt nichts. Die Watchlist (watchlist_items)
-- speichert den Ticker und wird mit umbenannt. Nicht erreichbar: Gast-Watchlists im Browser (alter Ticker
-- bleibt dort stehen) und alte Links #/aktie/<alter Ticker>.

begin;

-- Inaktive Titel (z. B. delistet) ruft der Cron nicht mehr ab, die Website zeigt sie nicht in der Liste.
alter table public.securities add column if not exists active boolean not null default true;
comment on column public.securities.active is
  'false = nicht mehr im Universum (z. B. delistet). Cron ruft nicht ab, Website-Liste blendet aus. Historie bleibt.';
grant select (active) on public.securities to anon, authenticated;

update public.securities set active = false where ticker in ('EA', 'WBD', 'AVB');
update public.securities set active = true where active = false and ticker not in ('EA', 'WBD', 'AVB');

-- Umbenennungen
do $$ begin
  if to_regclass('public.watchlist_items') is not null then
    update public.watchlist_items set ticker = 'SKYD' where ticker = 'PSKY';
  end if;
end $$;
update public.securities set ticker = 'SKYD', provider_symbol = case when provider_symbol is null or provider_symbol = 'PSKY' then 'SKYD' else provider_symbol end, name = 'Skydance Corp', exchange = 'NYSE', updated_at = now() where ticker = 'PSKY';
do $$ begin
  if to_regclass('public.watchlist_items') is not null then
    update public.watchlist_items set ticker = 'VMRK' where ticker = 'EQR';
  end if;
end $$;
update public.securities set ticker = 'VMRK', provider_symbol = case when provider_symbol is null or provider_symbol = 'EQR' then 'VMRK' else provider_symbol end, name = 'Vivmark Residential', exchange = 'NYSE', updated_at = now() where ticker = 'EQR';

commit;

-- Kontrolle
select ticker, name, exchange, provider_symbol, active from public.securities where ticker in ('EA', 'WBD', 'AVB', 'PSKY', 'SKYD', 'EQR', 'VMRK') order by ticker;
