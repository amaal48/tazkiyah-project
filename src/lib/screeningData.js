// src/lib/screeningData.js
//
// Lädt die Screening-Ergebnisse aus Supabase (nur Lesen, Anon-Key).
//
//   Liste:   screening_current schlank (ohne inputs, ohne volles result) + securities,
//            einmal pro Sitzung (Modul-Cache).
//   Detail:  screening_current mit result für einen Ticker. inputs wird nie geladen.
//   Verlauf: screening_status_changes je security_id.
//
// Stammdaten wie Sektor kommen vorerst aus src/data/stocks.js (Zuordnung über ticker),
// der Status nie. Die US-Börse (für die Kurs-Widgets) kommt aus securities.exchange.

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ALL_STOCKS } from "../data/stocks";

const PAGE_SIZE = 1000; // Supabase-Grenze je Abfrage

const LIST_COLUMNS =
  "security_id,ticker,name,asset_type,status,run_at,annual_period_end,quarter_period_end," +
  "headline:result->headline,summary:result->summary";

// B1/B2-Werte werden nicht geladen und nicht angezeigt (Lizenz der Kursdaten, 11.10.2026);
// seit supabase_b1_b2_binaer.sql stehen sie auch nicht mehr im öffentlichen Ergebnis.

const SECTOR_BY_TICKER = new Map(ALL_STOCKS.map((s) => [s.ticker, s.sector]));

async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function fetchList() {
  let securities;
  try {
    securities = await fetchAll(() => supabase.from("securities").select("id,ticker,name,asset_type,exchange,active").order("ticker"));
  } catch {
    try {
      // Spalte active noch nicht angelegt (SQL aus scripts/import-universum.mjs): ohne weiter
      securities = await fetchAll(() => supabase.from("securities").select("id,ticker,name,asset_type,exchange").order("ticker"));
    } catch {
      // Spalte exchange noch nicht angelegt (supabase_securities_exchange.sql): ohne Börse weiter
      securities = await fetchAll(() => supabase.from("securities").select("id,ticker,name,asset_type").order("ticker"));
    }
  }
  // Inaktive Titel (delistet o. Ä.) nicht anzeigen
  securities = securities.filter((s) => s.active !== false);

  const current = await fetchAll(() => supabase.from("screening_current").select(LIST_COLUMNS).order("ticker"));

  const byId = new Map(current.map((r) => [r.security_id, r]));
  const rows = securities.map((s) => {
    const r = byId.get(s.id) || null;
    return {
      securityId: s.id,
      ticker: s.ticker,
      name: s.name,
      assetType: s.asset_type,
      exchange: s.exchange ?? null,
      sector: SECTOR_BY_TICKER.get(s.ticker) ?? null,
      hasResult: !!r,
      // Kein Ergebnis in der Datenbank = für Nutzer „nicht geprüft“ (kein vierter Status)
      status: r?.status ?? "nicht_geprueft",
      runAt: r?.run_at ?? null,
      annualPeriodEnd: r?.annual_period_end ?? null,
      quarterPeriodEnd: r?.quarter_period_end ?? null,
      headline: r?.headline ?? null,
      summary: r?.summary ?? null,
    };
  });
  return { rows };
}

let listPromise = null;

/** Liste einmal pro Sitzung laden; bei Fehler beim nächsten Aufruf erneut versuchen. */
export function loadScreeningList() {
  if (!listPromise) {
    listPromise = fetchList().catch((e) => {
      listPromise = null;
      throw e;
    });
  }
  return listPromise;
}

/** { loading, error, rows, byTicker } */
export function useScreeningList() {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  useEffect(() => {
    let cancelled = false;
    loadScreeningList().then(
      ({ rows }) => !cancelled && setState({ loading: false, error: null, rows }),
      (error) => !cancelled && setState({ loading: false, error, rows: [] })
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const byTicker = new Map(state.rows.map((r) => [r.ticker, r]));
  return { ...state, byTicker };
}

const detailCache = new Map();

/** Letztes Ergebnis eines Titels mit allen Prüfungen (ohne inputs). null = kein Ergebnis. */
export function loadScreeningDetail(ticker) {
  if (!detailCache.has(ticker)) {
    const p = supabase
      .from("screening_current")
      .select("security_id,ticker,name,asset_type,status,run_at,result")
      .eq("ticker", ticker)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        return data;
      })
      .catch((e) => {
        detailCache.delete(ticker);
        throw e;
      });
    detailCache.set(ticker, p);
  }
  return detailCache.get(ticker);
}

/** Statuswechsel eines Titels, neueste zuerst. */
export async function loadStatusHistory(securityId) {
  if (!securityId) return [];
  const { data, error } = await supabase
    .from("screening_status_changes")
    .select("from_status,to_status,changed_at")
    .eq("security_id", securityId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
