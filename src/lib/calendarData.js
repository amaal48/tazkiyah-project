// src/lib/calendarData.js
//
// Termine und Berichte je Aktie aus der Tabelle company_calendar (Quelle SEC EDGAR, keine Halal-Daten,
// öffentlich lesbar; befüllt vom Cron api/update-calendar.js). Fehlt die Tabelle noch oder schlägt das
// Laden fehl, liefern die Funktionen leere Ergebnisse (die Seiten zeigen dann „folgt“).

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const PUBLIC_COLUMNS =
  "ticker,filings,next_earnings_date,next_earnings_status,next_earnings_url,next_earnings_note,hv_date,hv_status,hv_url,hv_note,fetched_at";

const rowCache = new Map();

/** Termine und Berichte eines Titels; null = noch nicht abgerufen. */
export function loadCalendarRow(ticker) {
  if (!rowCache.has(ticker)) {
    const p = supabase
      .from("company_calendar")
      .select(PUBLIC_COLUMNS)
      .eq("ticker", ticker)
      .maybeSingle()
      .then(({ data, error }) => (error ? null : data))
      .catch(() => null);
    rowCache.set(ticker, p);
  }
  return rowCache.get(ticker);
}

export function useCalendarRow(ticker) {
  const [state, setState] = useState({ loading: true, row: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, row: null });
    loadCalendarRow(ticker).then((row) => !cancelled && setState({ loading: false, row }));
    return () => {
      cancelled = true;
    };
  }, [ticker]);
  return state;
}

let listPromise = null;

/** Alle Titel mit nächstem Termin (für Aktiensuche und Kalender), einmal pro Sitzung. */
export function loadCalendarList() {
  if (!listPromise) {
    listPromise = (async () => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("company_calendar")
          .select("ticker,next_earnings_date,next_earnings_status,hv_date,hv_status,hv_url,next_earnings_url")
          .order("ticker")
          .range(from, from + 999);
        if (error) return rows;
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
      }
    })().catch(() => []);
  }
  return listPromise;
}

/** { loading, byTicker } */
export function useCalendarList() {
  const [state, setState] = useState({ loading: true, rows: [] });
  useEffect(() => {
    let cancelled = false;
    loadCalendarList().then((rows) => !cancelled && setState({ loading: false, rows }));
    return () => {
      cancelled = true;
    };
  }, []);
  return { loading: state.loading, rows: state.rows, byTicker: new Map(state.rows.map((r) => [r.ticker, r])) };
}

export const EARNINGS_STATUS_TEXT = { voraussichtlich: "voraussichtlich", bestaetigt: "bestätigt" };

/** Heute als JJJJ-MM-TT (Ortszeit Berlin). */
export function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

// Auswahl der Termine im Zeitraum: src/calendar/secCalendar.js (ohne Netzwerk testbar)
export { upcomingEvents } from "../calendar/secCalendar.js";
