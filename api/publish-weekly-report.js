// api/publish-weekly-report.js
//
// Cron (vercel.json, montags 10:00 und 11:00 UTC = 12:00 Berlin in Sommer- bzw. Winterzeit; der Vercel-Tarif
// erlaubt keine stündlichen Crons): veröffentlicht freigegebene Wochenberichte, deren erscheint_am
// (Montag 12:00 Europe/Berlin) erreicht ist, und schickt der Redaktion eine kurze Mail (src/weekly/publish.js).
// Ohne Freigabe erscheint nichts. Keine KI, kein Generator.
//
// Umgebungsvariablen:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET — vorhanden
//   RESEND_API_KEY        — vorhanden (Akademie-Fragen)
//   REPORT_NOTIFY_EMAIL   — Empfänger der Mail „ist online“ (sonst QUESTIONS_NOTIFY_EMAIL)
//   SITE_URL              — optional, Adresse der Website für den Link (sonst die Production-Adresse von Vercel)
//   NEWSLETTER_ENABLED    — optional, Standard aus. Erst einschalten, wenn Domain, Double-Opt-in und
//                           Datenschutzerklärung stehen; bis dahin keine Mails an Abonnenten.
//
// Manuell, nur mit CRON_SECRET: /api/publish-weekly-report?dryRun=1 (zeigt nur, was erscheinen würde)
//   curl -s -H "Authorization: Bearer $CRON_SECRET" "https://DEINE-ADRESSE/api/publish-weekly-report?dryRun=1"

import { createClient } from "@supabase/supabase-js";
import { sendResendEmail } from "../src/lib/resend.js";
import { createPublishRepo, publishDueReports } from "../src/weekly/publish.js";

const FROM = "Tazkiyah <onboarding@resend.dev>";

export default async function handler(req, res) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = String(req.headers.authorization || "").trim();
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!secret || !/^Bearer\s+/i.test(header) || token !== secret) return res.status(401).json({ error: "Unauthorized" });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const to = (process.env.REPORT_NOTIFY_EMAIL || process.env.QUESTIONS_NOTIFY_EMAIL || "").trim();
  const missing = [!url && "VITE_SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  if (missing.length) return res.status(500).json({ error: `Umgebungsvariablen fehlen: ${missing.join(", ")}` });

  const siteUrl =
    (process.env.SITE_URL || "").trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://tazkiyah-project-kohl.vercel.app");

  const sendMail = async ({ subject, text }) => {
    if (!apiKey || !to) return { ok: false, error: "RESEND_API_KEY oder REPORT_NOTIFY_EMAIL fehlt" };
    return sendResendEmail({ apiKey, from: FROM, to, subject, text });
  };

  const summary = await publishDueReports({
    repo: createPublishRepo(createClient(url, serviceKey, { auth: { persistSession: false } })),
    sendMail,
    siteUrl,
    newsletterEnabled: String(process.env.NEWSLETTER_ENABLED || "").toLowerCase() === "true",
    dryRun: req.query.dryRun === "1" || req.query.dryRun === "true",
  });
  return res.status(summary.errors.length ? 500 : 200).json(summary);
}
