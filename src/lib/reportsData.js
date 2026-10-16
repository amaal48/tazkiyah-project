// src/lib/reportsData.js
//
// Lädt die Wochenberichte aus Supabase (weekly_reports), einmal je Sitzung. Fehler oder leere Tabelle →
// leere Liste (die Seite zeigt dann „Die erste Ausgabe erscheint in Kürze.“).

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { visibleReports } from "./reports.js";

let promise = null;

export function loadReports() {
  if (!promise) {
    promise = supabase
      .from("weekly_reports")
      .select("week_label,report_date,tldr,makro_politik,indices,aktien_fokus,ausblick,source_note")
      .order("report_date", { ascending: false })
      .then(({ data, error }) => (error ? [] : visibleReports(data)))
      .catch(() => []);
  }
  return promise;
}

/** { loading, reports } */
export function useReports() {
  const [state, setState] = useState({ loading: true, reports: [] });
  useEffect(() => {
    let cancelled = false;
    loadReports().then((reports) => !cancelled && setState({ loading: false, reports }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

