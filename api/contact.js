// api/contact.js
//
// Kontaktformular (#/kontakt). Besucher schreiben nur über diese Funktion, nie direkt in
// Supabase: contact_messages hat keinen Zugriff für Besucher, hier wird mit dem
// Service-Role-Key gespeichert.
//
// Ablauf: Spam-Falle → Prüfung der Eingaben → Drosseln → speichern → Benachrichtigung an uns
// (Resend) → bei Erfolg notified_at. Scheitert die Benachrichtigung, bekommt der Besucher
// trotzdem 200 (die Nachricht ist gespeichert); api/notify-questions.js meldet sie dann im
// täglichen Sammellauf. Eingangsbestätigung an den Absender nur mit CONTACT_FROM_EMAIL.
//
// Umgebungsvariablen (Vercel → Settings → Environment Variables):
//   VITE_SUPABASE_URL          — vorhanden
//   SUPABASE_SERVICE_ROLE_KEY  — vorhanden (geheim, nur serverseitig)
//   RESEND_API_KEY             — geheim, von resend.com
//   CONTACT_NOTIFY_EMAIL       — optional, Empfänger der Benachrichtigung (sonst QUESTIONS_NOTIFY_EMAIL)
//   CONTACT_FROM_EMAIL         — optional, erst nach eigener Domain bei Resend setzen; schaltet die
//                                Eingangsbestätigung an den Absender ein (höchstens eine je Adresse und 24 h)
//
// Antworten und Log enthalten nie Nachrichtentexte, E-Mail-Adressen oder Schlüssel.

import { createClient } from "@supabase/supabase-js";
import {
  CONFIRMATION_SUBJECT,
  CONFIRMATION_TEXT,
  buildContactNotification,
  validateContact,
} from "../src/lib/contact.js";
import { sendResendEmail } from "../src/lib/resend.js";

const FROM = "Tazkiyah <onboarding@resend.dev>";
const MINUTE = 60 * 1000;
const LIMIT_TOTAL = 20; // alle Nachrichten in 10 Minuten
const LIMIT_TOTAL_WINDOW = 10 * MINUTE;
const LIMIT_PER_EMAIL = 3; // je E-Mail-Adresse in 24 Stunden
const DAY = 24 * 60 * MINUTE;

const THROTTLED = "Gerade kommen sehr viele Nachrichten an. Bitte versuch es später noch einmal.";
const FAILED = "Deine Nachricht konnte nicht gesendet werden. Bitte versuch es später noch einmal.";

function log(text) {
  console.warn("contact: " + text);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

const since = (ms) => new Date(Date.now() - ms).toISOString();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Nur POST erlaubt." });
  }

  const body = readBody(req);

  // Spam-Falle: Menschen sehen das Feld nicht. Ausgefüllt → so tun, als wäre alles gut.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return res.status(200).json({ ok: true });
  }

  const checked = validateContact(body);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  const msg = checked.value;

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    log("Umgebungsvariable fehlt: VITE_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: FAILED });
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const countRows = (query) => query.then(({ count, error }) => (error ? { error } : { count: count || 0 }));

  // Drosseln
  const [total, perEmail] = await Promise.all([
    countRows(supabase.from("contact_messages").select("id", { count: "exact", head: true }).gte("created_at", since(LIMIT_TOTAL_WINDOW))),
    countRows(
      supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("email", msg.email).gte("created_at", since(DAY))
    ),
  ]);
  if (total.error || perEmail.error) {
    log(`Drossel-Abfrage fehlgeschlagen (${(total.error || perEmail.error).code || "unbekannt"})`);
    return res.status(500).json({ error: FAILED });
  }
  if (total.count >= LIMIT_TOTAL || perEmail.count >= LIMIT_PER_EMAIL) {
    log(total.count >= LIMIT_TOTAL ? "gedrosselt: insgesamt" : "gedrosselt: je Adresse");
    return res.status(429).json({ error: THROTTLED });
  }

  // Speichern
  const { data: saved, error: insertError } = await supabase
    .from("contact_messages")
    .insert({ email: msg.email, name: msg.name || null, topic: msg.topic, message: msg.message })
    .select("id,created_at")
    .single();
  if (insertError) {
    log(`Speichern fehlgeschlagen (${insertError.code || "unbekannt"})`);
    return res.status(500).json({ error: FAILED });
  }

  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const notifyTo = (process.env.CONTACT_NOTIFY_EMAIL || process.env.QUESTIONS_NOTIFY_EMAIL || "").trim();

  // Benachrichtigung an uns. Scheitert sie, bleibt notified_at leer (täglicher Sammellauf).
  if (!apiKey || !notifyTo) {
    log("Benachrichtigung übersprungen: RESEND_API_KEY oder CONTACT_NOTIFY_EMAIL/QUESTIONS_NOTIFY_EMAIL fehlt");
  } else {
    const mail = buildContactNotification({ ...msg, created_at: saved.created_at });
    const sent = await sendResendEmail({ apiKey, from: FROM, to: notifyTo, replyTo: msg.email, subject: mail.subject, text: mail.text });
    if (!sent.ok) {
      log(`Benachrichtigung fehlgeschlagen: ${sent.error}`);
    } else {
      const { error } = await supabase.from("contact_messages").update({ notified_at: new Date().toISOString() }).eq("id", saved.id);
      if (error) log(`notified_at nicht gesetzt (${error.code || "unbekannt"})`);
    }
  }

  // Eingangsbestätigung nur mit eigener Absenderadresse und höchstens eine je Adresse in 24 Stunden.
  const confirmFrom = (process.env.CONTACT_FROM_EMAIL || "").trim();
  if (confirmFrom && apiKey) {
    const recent = await countRows(
      supabase
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .eq("email", msg.email)
        .gte("confirmation_sent_at", since(DAY))
    );
    if (recent.error) {
      log(`Bestätigungs-Abfrage fehlgeschlagen (${recent.error.code || "unbekannt"})`);
    } else if (recent.count === 0) {
      const sent = await sendResendEmail({
        apiKey,
        from: confirmFrom,
        to: msg.email,
        replyTo: confirmFrom,
        subject: CONFIRMATION_SUBJECT,
        text: CONFIRMATION_TEXT,
      });
      if (!sent.ok) {
        log(`Eingangsbestätigung fehlgeschlagen: ${sent.error}`);
      } else {
        const { error } = await supabase.from("contact_messages").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", saved.id);
        if (error) log(`confirmation_sent_at nicht gesetzt (${error.code || "unbekannt"})`);
      }
    }
  }

  return res.status(200).json({ ok: true });
}
