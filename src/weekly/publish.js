// src/weekly/publish.js
//
// Veröffentlichen der freigegebenen Wochenberichte (Cron api/publish-weekly-report.js). Ohne Netzwerk testbar:
// Datenbank (repo) und Mailversand (sendMail) werden übergeben.
//
//   Nur status = 'freigegeben' UND erscheint_am <= jetzt → 'veroeffentlicht' (veroeffentlicht_am setzt die
//   Datenbank). Sommer-/Winterzeit steckt in erscheint_am (timestamptz, Montag 12:00 Europe/Berlin), der Cron
//   läuft nur oft genug, um den Zeitpunkt zu treffen.
//   Danach eine kurze Mail an die Redaktion („Wochenbericht KW xx ist online“, mit Link), bei Fehler eine Mail
//   mit der Fehlermeldung. Mail an Abonnenten nur mit NEWSLETTER_ENABLED (Standard aus); solange aus: keine Mails.

import { buildNewsletterMail, buildOnlineNotice, reportSlug } from "../lib/weeklyReport.js";

export function reportUrl(siteUrl, r) {
  return `${String(siteUrl).replace(/\/+$/, "")}/#/berichte/wochenbericht/${reportSlug(r)}`;
}

/**
 * repo: { dueReports(nowIso), markPublished(id) → Zeile oder null }
 * sendMail({ subject, text }) → { ok, error? }
 */
export async function publishDueReports({ repo, sendMail, siteUrl, now = new Date(), newsletterEnabled = false, dryRun = false }) {
  const summary = { due: 0, published: [], errors: [], notified: [], newsletter: newsletterEnabled ? "vorbereitet, keine Empfängerliste" : "aus" };
  let due;
  try {
    due = await repo.dueReports(now.toISOString());
  } catch (e) {
    summary.errors.push(`Laden: ${e.message}`);
    await sendMail({ subject: "Wochenbericht: Veröffentlichung fehlgeschlagen", text: `Die freigegebenen Wochenberichte konnten nicht geladen werden.\n\nFehler: ${e.message}` });
    return summary;
  }
  summary.due = due.length;
  if (dryRun) return { ...summary, dryRun: true, wouldPublish: due.map((r) => `KW ${r.kw}/${r.jahr}`) };

  for (const r of due) {
    try {
      const row = await repo.markPublished(r.id);
      if (!row) continue; // inzwischen geändert (z. B. Freigabe aufgehoben)
      summary.published.push(`KW ${row.kw}/${row.jahr}`);
      const url = reportUrl(siteUrl, row);
      const notice = buildOnlineNotice(row, url);
      const res = await sendMail(notice);
      if (res?.ok) summary.notified.push(`KW ${row.kw}`);
      else summary.errors.push(`Mail KW ${row.kw}: ${res?.error || "unbekannt"}`);
      if (newsletterEnabled) {
        // Vorbereitet: Inhalt steht fest, Versand folgt mit Empfängerliste, Double-Opt-in und Datenschutzerklärung.
        buildNewsletterMail(row, url);
      }
    } catch (e) {
      summary.errors.push(`KW ${r.kw}/${r.jahr}: ${e.message}`);
      await sendMail({
        subject: `Wochenbericht KW ${r.kw}: Veröffentlichung fehlgeschlagen`,
        text: `Der freigegebene Wochenbericht KW ${r.kw}/${r.jahr} („${r.titel}“) konnte nicht veröffentlicht werden.\n\nFehler: ${e.message}\n\nEr bleibt freigegeben; der nächste Lauf versucht es erneut.`,
      });
    }
  }
  return summary;
}

/** Repo auf Supabase (Service-Role). */
export function createPublishRepo(db) {
  return {
    async dueReports(nowIso) {
      const { data, error } = await db
        .from("weekly_reports")
        .select("id,jahr,kw,titel,erscheint_am")
        .eq("status", "freigegeben")
        .lte("erscheint_am", nowIso)
        .order("erscheint_am", { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
    async markPublished(id) {
      const { data, error } = await db
        .from("weekly_reports")
        .update({ status: "veroeffentlicht" })
        .eq("id", id)
        .eq("status", "freigegeben")
        .select("id,jahr,kw,titel,drei_saetze,mail_kurzfassung,veroeffentlicht_am");
      if (error) throw new Error(error.message);
      return data?.[0] || null;
    },
  };
}
