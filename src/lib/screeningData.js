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
//
// Die Tazkiyah 30 (Neue Ausrichtung 15.10.2026): Nur Titel aus der Tabelle tazkiyah30 tragen öffentlich
// einen Halal-Status. Die Datenbank liefert seit supabase_tazkiyah30.sql nichts anderes mehr; hier wird
// zusätzlich gefiltert (für die Zeit vor dem Ausführen der SQL-Datei). Alle übrigen Titel haben
// status: null und inTazkiyah30: false.
//
// Archiv (17.10.2026, VITE_FEATURE_TAZKIYAH30 aus, siehe src/lib/features.js): screening_current,
// tazkiyah30 und screening_status_changes werden gar nicht abgefragt (öffentlicher Zugriff wird mit
// supabase_archiv_tazkiyah30.sql entzogen). Alle Titel kommen aus securities, ohne Status.

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ALL_STOCKS } from "../data/stocks";
import { FINAL_STATUSES, TAZKIYAH30_FALLBACK } from "../data/tazkiyah30.js";
import { FEATURE_TAZKIYAH30 } from "./features.js";

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

/** Tabelle tazkiyah30 (Rückfall: feste Liste aus src/data/tazkiyah30.js, solange die Tabelle fehlt). */
async function fetchTazkiyah30() {
  try {
    const { data, error } = await supabase
      .from("tazkiyah30")
      .select("ticker,sort_order,gruppe,kurzbegruendung,aufgenommen_am")
      .order("sort_order");
    if (error) throw error;
    if (!data?.length) return TAZKIYAH30_FALLBACK;
    return data.map((r) => ({
      ticker: r.ticker,
      sortOrder: r.sort_order,
      gruppe: r.gruppe,
      kurzbegruendung: r.kurzbegruendung || null,
      aufgenommenAm: r.aufgenommen_am,
    }));
  } catch {
    return TAZKIYAH30_FALLBACK;
  }
}

let t30Promise = null;

/** Die Tazkiyah 30, einmal pro Sitzung geladen. */
export function loadTazkiyah30() {
  if (!FEATURE_TAZKIYAH30) return Promise.resolve([]);
  if (!t30Promise) t30Promise = fetchTazkiyah30();
  return t30Promise;
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

  // Archiv: keine Status-Abfrage, keine Liste der 30
  const [current, t30] = FEATURE_TAZKIYAH30
    ? await Promise.all([fetchAll(() => supabase.from("screening_current").select(LIST_COLUMNS).order("ticker")), loadTazkiyah30()])
    : [[], []];
  const t30ByTicker = new Map(t30.map((t) => [t.ticker, t]));

  const byId = new Map(current.map((r) => [r.security_id, r]));
  const rows = securities.map((s) => {
    const t = t30ByTicker.get(s.ticker) || null;
    // Status nur für die Tazkiyah 30, sonst kein Ergebnis (auch wenn die Datenbank noch eines liefert)
    const r = t ? byId.get(s.id) || null : null;
    return {
      securityId: s.id,
      ticker: s.ticker,
      name: s.name,
      assetType: s.asset_type,
      exchange: s.exchange ?? null,
      sector: SECTOR_BY_TICKER.get(s.ticker) ?? null,
      inTazkiyah30: !!t,
      tazkiyah30: t,
      hasResult: !!r,
      // Tazkiyah 30 ohne Ergebnis = „nicht geprüft“; Titel außerhalb der Liste: kein Status (null)
      status: t ? r?.status ?? "nicht_geprueft" : null,
      // Öffentlich angezeigt wird nur ein Endergebnis (konform / nicht konform)
      hasFinalResult: !!t && FINAL_STATUSES.has(r?.status),
      runAt: r?.run_at ?? null,
      annualPeriodEnd: r?.annual_period_end ?? null,
      quarterPeriodEnd: r?.quarter_period_end ?? null,
      headline: r?.headline ?? null,
      summary: r?.summary ?? null,
    };
  });
  return { rows, tazkiyah30: t30 };
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

/** { loading, error, rows, byTicker, tazkiyah30 } */
export function useScreeningList() {
  const [state, setState] = useState({ loading: true, error: null, rows: [], tazkiyah30: [] });
  useEffect(() => {
    let cancelled = false;
    loadScreeningList().then(
      ({ rows, tazkiyah30 }) => !cancelled && setState({ loading: false, error: null, rows, tazkiyah30 }),
      (error) => !cancelled && setState({ loading: false, error, rows: [], tazkiyah30: [] })
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const byTicker = new Map(state.rows.map((r) => [r.ticker, r]));
  return { ...state, byTicker };
}

const detailCache = new Map();

/** Letztes Ergebnis eines Titels mit allen Prüfungen (ohne inputs). null = kein Ergebnis oder nicht in den Tazkiyah 30. */
export function loadScreeningDetail(ticker) {
  if (!FEATURE_TAZKIYAH30) return Promise.resolve(null);
  if (!detailCache.has(ticker)) {
    const p = loadTazkiyah30()
      .then((t30) => {
        if (!t30.some((t) => t.ticker === ticker)) return null;
        return supabase
          .from("screening_current")
          .select("security_id,ticker,name,asset_type,status,run_at,result")
          .eq("ticker", ticker)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error;
            return data;
          });
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
  if (!securityId || !FEATURE_TAZKIYAH30) return [];
  const { data, error } = await supabase
    .from("screening_status_changes")
    .select("from_status,to_status,changed_at")
    .eq("security_id", securityId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
