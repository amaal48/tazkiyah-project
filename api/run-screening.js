// api/run-screening.js
//
// Täglicher Screening-Cron (siehe vercel.json). Holt Finanzdaten, lässt die
// Engine rechnen und speichert Ergebnisse in Supabase.
//
// Umgebungsvariablen (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL           — vorhanden
//   SUPABASE_SERVICE_ROLE_KEY   — vorhanden (geheim, nur serverseitig)
//   CRON_SECRET                 — vorhanden
//   FMP_API_KEY                 — vorhanden
//   SCREENING_DAILY_CALL_BUDGET — optional, Standard 200 (FMP Free: 250/Tag;
//                                 50 bleiben für Wochenbericht und Tests frei)
//   OPENFIGI_API_KEY            — optional (ohne Key: 50 ISINs pro Lauf)
//
// Manuell auslösen (z. B. zum Testen), nur mit CRON_SECRET:
//   /api/run-screening?limit=2&dryRun=1
//   limit  — höchstens so viele Titel mit neuen Daten
//   dryRun — rechnet, speichert aber keine Ergebnisse (API-Abrufe zählen trotzdem)
//   tickers — nur diese Ticker abrufen, kommagetrennt, z. B. tickers=AAPL,MSFT
//   force   — zusammen mit tickers: auch Titel mit frischen Daten neu abrufen (force=1)
//   Beispiel (Terminal, Production-Adresse, Geheimwort nicht in den Chat kopieren):
//   curl -s -H "Authorization: Bearer $CRON_SECRET" "https://DEINE-DOMAIN/api/run-screening?tickers=AAPL,MSFT&force=1"

import { createClient } from "@supabase/supabase-js";
import { createFmpProvider } from "../src/screening/providers/fmp.js";
import { createOpenFigiClient } from "../src/screening/providers/openfigi.js";
import { createSupabaseRepo } from "../src/screening/supabaseRepo.js";
import { runScreening } from "../src/screening/runner.js";

export default async function handler(req, res) {
  // Leerzeichen/Zeilenumbrüche am Rand ignorieren (entstehen leicht beim Einfügen in Vercel)
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = String(req.headers.authorization || "").trim();
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!secret || !/^Bearer\s+/i.test(header) || token !== secret) {
    // Diagnose ohne das Geheimwort preiszugeben: nur Grund und Längen
    const reason = !secret
      ? "CRON_SECRET ist in dieser Umgebung nicht gesetzt"
      : !header
        ? "Anfrage ohne Authorization-Header (Vercel schickt ihn nur, wenn CRON_SECRET beim Deployment gesetzt war)"
        : !/^Bearer\s+/i.test(header)
          ? "Authorization-Header ohne 'Bearer'"
          : "Geheimwort stimmt nicht überein";
    console.warn(
      "run-screening abgewiesen: " +
        JSON.stringify({ reason, env: process.env.VERCEL_ENV || null, secretLength: secret.length, tokenLength: token.length })
    );
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || !process.env.FMP_API_KEY) {
    return res.status(500).json({ error: "Umgebungsvariablen fehlen (Supabase-URL, SUPABASE_SERVICE_ROLE_KEY oder FMP_API_KEY)" });
  }

  const limit = req.query.limit ? Math.max(0, parseInt(req.query.limit, 10) || 0) : Infinity;
  const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
  const onlyTickers = String(req.query.tickers || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  const force = onlyTickers.length > 0 && (req.query.force === "1" || req.query.force === "true");

  try {
    const summary = await runScreening({
      repo: createSupabaseRepo(createClient(url, serviceKey, { auth: { persistSession: false } })),
      provider: createFmpProvider({ apiKey: process.env.FMP_API_KEY }),
      venues: createOpenFigiClient({ apiKey: process.env.OPENFIGI_API_KEY || null }),
      dailyCallBudget: parseInt(process.env.SCREENING_DAILY_CALL_BUDGET || "200", 10),
      limit,
      dryRun,
      onlyTickers: onlyTickers.length ? onlyTickers : null,
      force,
      timeBudgetMs: 50000,
    });
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: "Screening-Lauf fehlgeschlagen", detail: String(err.message || err) });
  }
}
