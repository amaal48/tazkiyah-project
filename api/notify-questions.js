// api/notify-questions.js
//
// Täglicher Cron (siehe vercel.json): schickt eine Sammel-E-Mail mit allen neuen
// Akademie-Fragen (academy_questions, status = 'neu', notified_at leer) über Resend.
// Dazu unter eigener Überschrift Kontaktnachrichten (contact_messages), deren sofortige
// Benachrichtigung aus api/contact.js gescheitert ist (notified_at leer, älter als 10 Minuten).
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
// Antworten und Log enthalten nie Fragetexte, Nachrichten, E-Mail-Adressen oder Schlüssel.

import { createClient } from "@supabase/supabase-js";
import { DIGEST_LIMIT, buildQuestionDigest } from "../src/lib/questionDigest.js";
import { sendResendEmail } from "../src/lib/resend.js";

const FROM = "Tazkiyah <onboarding@resend.dev>";
const CONTACT_GRACE_MS = 10 * 60 * 1000;

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

  // Kontaktnachrichten, deren sofortige Benachrichtigung (api/contact.js) gescheitert ist.
  // Älter als 10 Minuten, damit eine gerade laufende Anfrage nicht doppelt gemeldet wird.
  const contactCutoff = new Date(Date.now() - CONTACT_GRACE_MS).toISOString();
  const { data: contacts, error: contactError } = await supabase
    .from("contact_messages")
    .select("id,topic,email,message,created_at")
    .is("notified_at", null)
    .lt("created_at", contactCutoff)
    .order("created_at", { ascending: true })
    .limit(DIGEST_LIMIT);
  if (contactError) return fail(res, 500, `Kontaktnachrichten konnten nicht geladen werden (${contactError.code || "unbekannt"})`);

  const count = rows.length;
  const contactCount = contacts.length;
  const limitReached = count >= DIGEST_LIMIT || contactCount >= DIGEST_LIMIT;
  if (dryRun) return res.status(200).json({ dryRun: true, sent: false, count, contactCount, limitReached });

  const digest = buildQuestionDigest(rows, { limit: DIGEST_LIMIT, contacts });
  if (!digest) return res.status(200).json({ sent: false, count: 0, contactCount: 0 });

  const sent = await sendResendEmail({ apiKey, from: FROM, to, subject: digest.subject, text: digest.text });
  if (!sent.ok) return fail(res, 500, `Versand fehlgeschlagen: ${sent.error}`);

  // Erst nach erfolgreichem Versand markieren, nur genau die gesendeten Zeilen.
  const now = new Date().toISOString();
  const marks = [];
  if (count) marks.push(["academy_questions", rows.map((r) => r.id)]);
  if (contactCount) marks.push(["contact_messages", contacts.map((c) => c.id)]);
  for (const [table, ids] of marks) {
    const { error: markError } = await supabase.from(table).update({ notified_at: now }).in("id", ids);
    if (markError) {
      // E-Mail ist raus, Markierung fehlgeschlagen: beim nächsten Lauf kommen dieselben Zeilen erneut.
      return fail(res, 500, `E-Mail gesendet, aber notified_at in ${table} nicht gesetzt (${markError.code || "unbekannt"})`);
    }
  }
  return res.status(200).json({ sent: true, count, contactCount, limitReached });
}
