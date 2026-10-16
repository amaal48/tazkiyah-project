// src/lib/weeklyReportsData.js
//
// Wochenberichte aus Supabase (supabase_wochenbericht.sql).
//   Öffentlich: nur status = 'veroeffentlicht' (RLS erzwingt das zusätzlich).
//   Redaktion:  alle Ausgaben, nur mit Admin-Konto (is_admin(), RLS). Schreiben über den Browser mit der
//               Anmeldung der Nutzerin; die Datenbank prüft Freigabe-Regeln selbst (Trigger).

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export const PUBLIC_COLUMNS = "id,jahr,kw,zeitraum_von,zeitraum_bis,titel,drei_saetze,body_md,einordnung,quellen,veroeffentlicht_am,korrigiert_am";

let publishedPromise = null;

/** Veröffentlichte Ausgaben, neueste zuerst. Fehler → leere Liste. */
export function loadPublishedReports() {
  if (!publishedPromise) {
    publishedPromise = supabase
      .from("weekly_reports")
      .select(PUBLIC_COLUMNS)
      .eq("status", "veroeffentlicht")
      .order("jahr", { ascending: false })
      .order("kw", { ascending: false })
      .then(({ data, error }) => (error ? [] : data || []))
      .catch(() => []);
  }
  return publishedPromise;
}

/** { loading, reports } */
export function usePublishedReports() {
  const [state, setState] = useState({ loading: true, reports: [] });
  useEffect(() => {
    let cancelled = false;
    loadPublishedReports().then((reports) => !cancelled && setState({ loading: false, reports }));
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/* ---------- Redaktion ---------- */

/** Ist das angemeldete Konto Admin? (false ohne Anmeldung oder bei Fehler) */
export async function fetchIsAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

const ADMIN_COLUMNS = "*";

export async function listReports() {
  const { data, error } = await supabase
    .from("weekly_reports")
    .select("id,jahr,kw,titel,status,erscheint_am,geaendert_am,veroeffentlicht_am")
    .order("jahr", { ascending: false })
    .order("kw", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getReport(id) {
  const { data, error } = await supabase.from("weekly_reports").select(ADMIN_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createReport(fields) {
  const { data, error } = await supabase.from("weekly_reports").insert(fields).select(ADMIN_COLUMNS).single();
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? `Für KW ${fields.kw}/${fields.jahr} gibt es schon eine Ausgabe.` : error.message);
  return data;
}

export async function updateReport(id, patch) {
  const { data, error } = await supabase.from("weekly_reports").update(patch).eq("id", id).select(ADMIN_COLUMNS).single();
  if (error) throw new Error(error.message);
  publishedPromise = null; // öffentliche Liste neu laden
  return data;
}

export async function listVersions(id) {
  const { data, error } = await supabase
    .from("weekly_report_versions")
    .select("id,saved_at,status")
    .eq("report_id", id)
    .order("saved_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data || [];
}
