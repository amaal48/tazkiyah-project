// api/notify-questions.js
//
// Täglicher Cron (siehe vercel.json): schickt eine Sammel-E-Mail mit allen neuen
// Akademie-Fragen (academy_questions, status = 'neu', notified_at leer) über Resend.
// Erst nach erfolgreichem Versand wird notified_at gesetzt; scheitert der Versand,
// bleibt alles unmarkiert und die Fragen kommen beim nächsten Lauf erneut.
//
// Umgebungsvariablen (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL          — vorhanden
//   SUPABASE_SERVICE_ROLE_KEY  — vorhanden (geheim, nur serverseitig)
//   CRON_SECRET                — vorhanden
//   RESEND_API_KEY             — geheim, von resend.com
//   QUESTIONS_NOTIFY_EMAIL     — Empfänger (mit onboarding@resend.dev nur die Resend-Konto-Adresse)
//
// Manuell auslösen, nur mit CRON_SECRET:
//   /api/notify-questions?dryRun=1   — nur zählen, nichts senden, nichts markieren
//   curl -s -H "Authorization: Bearer $CRON_SECRET" "https://DEINE-DOMAIN/api/notify-questions?dryRun=1"
//
// Antworten und Log enthalten nie Fragetexte oder Schlüssel.

import { createClient } from "@supabase/supabase-js";
import { DIGEST_LIMIT, buildQuestionDigest } from "../src/lib/questionDigest.js";

const FROM = "Tazkiyah <onboarding@resend.dev>";

function fail(res, status, error) {
  console.warn("notify-questions: " + error);
  return res.status(status).json({ error });
}

export default async function handler(req, res) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = String(req.headers.authorization || "").trim();
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!secret || !/^Bearer\s+/i.test(header) || token !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fail(res, 500, "Umgebungsvariable fehlt: VITE_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY");

  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const to = (process.env.QUESTIONS_NOTIFY_EMAIL || "").trim();
  const missing = [!apiKey && "RESEND_API_KEY", !to && "QUESTIONS_NOTIFY_EMAIL"].filter(Boolean);
  if (missing.length) return fail(res, 500, `Umgebungsvariable fehlt: ${missing.join(", ")}`);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: rows, error: loadError } = await supabase
    .from("academy_questions")
    .select("id,question,page,created_at")
    .eq("status", "neu")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(DIGEST_LIMIT);
  if (loadError) return fail(res, 500, `Fragen konnten nicht geladen werden (${loadError.code || "unbekannt"})`);

  const count = rows.length;
  const limitReached = count >= DIGEST_LIMIT;
  if (dryRun) return res.status(200).json({ dryRun: true, sent: false, count, limitReached });

  const digest = buildQuestionDigest(rows, { limit: DIGEST_LIMIT });
  if (!digest) return res.status(200).json({ sent: false, count: 0 });

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: digest.subject, text: digest.text }),
    });
  } catch {
    return fail(res, 500, "Versand fehlgeschlagen: Resend nicht erreichbar");
  }
  if (!response.ok) {
    let name = "";
    try {
      name = String((await response.json())?.name || "");
    } catch {
      // Antwort ohne JSON
    }
    return fail(res, 500, `Versand fehlgeschlagen: Resend ${response.status}${name ? ` (${name})` : ""}`);
  }

  const ids = rows.map((r) => r.id);
  const { error: markError } = await supabase
    .from("academy_questions")
    .update({ notified_at: new Date().toISOString() })
    .in("id", ids);
  if (markError) {
    // E-Mail ist raus, Markierung fehlgeschlagen: beim nächsten Lauf kommen dieselben Fragen erneut.
    return fail(res, 500, `E-Mail gesendet, aber notified_at nicht gesetzt (${markError.code || "unbekannt"})`);
  }
  return res.status(200).json({ sent: true, count, limitReached });
}
