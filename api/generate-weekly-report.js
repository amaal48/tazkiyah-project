// api/generate-weekly-report.js
//
// Wird einmal wöchentlich von Vercel Cron aufgerufen (siehe vercel.json).
// Holt echte Marktnachrichten (FMP) und
// Screening-Statusänderungen (eigene Datenbasis + FMP-Fundamentaldaten),
// baut daraus einen Wochenbericht und speichert ihn in Supabase.
//
// WICHTIG: Nutzt den SUPABASE_SERVICE_ROLE_KEY (nicht den Publishable Key!),
// weil das Einfügen in weekly_reports bewusst NICHT über die normale
// Row-Level-Security-Policy für anon/authenticated läuft. Dieser Key ist
// GEHEIM und darf niemals im Frontend landen — er wird hier ausschließlich
// serverseitig verwendet.
//
// Sicherheit: Vercel schickt bei jedem Cron-Aufruf automatisch einen
// Authorization-Header mit CRON_SECRET. Ohne diese Prüfung könnte jeder,
// der die URL kennt, die Funktion manuell auslösen.

import { createClient } from "@supabase/supabase-js";

const FMP_BASE = "https://financialmodelingprep.com/stable";

function getCalendarWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export default async function handler(req, res) {
  // Nur Vercel Cron (oder wer den Secret kennt) darf diese Funktion auslösen
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const fmpKey = process.env.FMP_API_KEY;
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Allgemeine Marktnachrichten (für Marktüberblick + Entwicklungen)
    const newsRes = await fetch(`${FMP_BASE}/general-news?page=0&limit=10&apikey=${fmpKey}`);
    const newsData = await newsRes.json();
    const headlines = Array.isArray(newsData) ? newsData.slice(0, 5).map((n) => n.title).filter(Boolean) : [];

    // Index-Kurse (DAX, MSCI World, ISWD): Quelle beim Neubau des Generators festlegen. Twelve Data entfernt am 08.10.2026 (keine Anzeigelizenz).

    const today = new Date();
    const kw = getCalendarWeek(today);
    const dateLabel = today.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

    const report = {
      week_label: `Wochenbericht KW ${kw}`,
      report_date: today.toISOString().slice(0, 10),
      highlight: headlines[0] ? headlines[0].slice(0, 80) : "Marktüberblick verfügbar",
      marktueberblick: headlines[0] || "Keine aktuellen Marktdaten verfügbar.",
      entwicklungen: headlines.length > 0 ? headlines : ["Keine aktuellen Schlagzeilen verfügbar."],
      screening_updates: [], // TODO: Woche-zu-Woche-Vergleich der Sharia-Status, sobald
                              // die Fundamentaldaten wöchentlich mit-geloggt werden
      sektor_fokus: null, // TODO: aus Screening-Updates ableiten, sobald diese befüllt sind
      source_note: `Quelle: Financial Modeling Prep (General News) — automatisch generiert am ${dateLabel}`,
    };

    const { error } = await supabaseAdmin.from("weekly_reports").insert(report);
    if (error) throw error;

    return res.status(200).json({ success: true, report: report.week_label });
  } catch (err) {
    return res.status(500).json({ error: "Generierung fehlgeschlagen", detail: String(err) });
  }
}
