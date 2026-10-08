// src/lib/contact.js
//
// Kontaktformular: Prüfung der Eingaben (Browser und api/contact.js) und Aufbau der
// E-Mails. Ohne Abhängigkeiten, damit es sich mit node --test prüfen lässt.

export const CONTACT_TOPICS = [
  { value: "allgemein", label: "Allgemeine Frage" },
  { value: "fehler", label: "Fehler auf der Seite" },
  { value: "feedback", label: "Feedback" },
  { value: "sonstiges", label: "Sonstiges" },
];
export const NAME_MAX = 80;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
export const EMAIL_MAX = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINE_BREAK = /[\r\n]/;

export function topicLabel(value) {
  return CONTACT_TOPICS.find((t) => t.value === value)?.label || "Sonstiges";
}

/**
 * Prüft die Eingaben. Gibt { ok: true, value } mit bereinigten Werten zurück
 * (E-Mail klein und getrimmt, Name/Nachricht getrimmt) oder { ok: false, error }.
 */
export function validateContact(input) {
  const raw = input && typeof input === "object" ? input : {};
  const emailRaw = typeof raw.email === "string" ? raw.email : "";
  const nameRaw = typeof raw.name === "string" ? raw.name : "";
  const messageRaw = typeof raw.message === "string" ? raw.message : "";
  const topic = typeof raw.topic === "string" ? raw.topic : "";

  if (LINE_BREAK.test(emailRaw) || LINE_BREAK.test(nameRaw)) {
    return { ok: false, error: "E-Mail und Name dürfen keine Zeilenumbrüche enthalten." };
  }
  const email = emailRaw.trim().toLowerCase();
  const name = nameRaw.trim();
  const message = messageRaw.trim();

  if (!email) return { ok: false, error: "Bitte gib deine E-Mail-Adresse an." };
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return { ok: false, error: "Bitte prüfe deine E-Mail-Adresse." };
  if (name.length > NAME_MAX) return { ok: false, error: `Der Name darf höchstens ${NAME_MAX} Zeichen lang sein.` };
  if (!CONTACT_TOPICS.some((t) => t.value === topic)) return { ok: false, error: "Bitte wähle ein Thema." };
  if (message.length < MESSAGE_MIN) return { ok: false, error: `Die Nachricht muss mindestens ${MESSAGE_MIN} Zeichen lang sein.` };
  if (message.length > MESSAGE_MAX) return { ok: false, error: `Die Nachricht darf höchstens ${MESSAGE_MAX} Zeichen lang sein.` };

  return { ok: true, value: { email, name, topic, message } };
}

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtBerlin(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "unbekannt" : `${DATE_FORMAT.format(d)} Uhr`;
}

/** Benachrichtigung an uns. msg: { email, name, topic, message, created_at } */
export function buildContactNotification(msg) {
  const label = topicLabel(msg.topic);
  const subject = `Kontakt (${label}): ${msg.name || msg.email}`;
  const text = [
    `Thema: ${label}`,
    `Name: ${msg.name || "(nicht angegeben)"}`,
    `E-Mail: ${msg.email}`,
    `Datum: ${fmtBerlin(msg.created_at)}`,
    "",
    "Nachricht:",
    String(msg.message ?? "").trim(),
    "",
    "Antworten: einfach auf diese E-Mail antworten (Antwort geht an die Absenderin bzw. den Absender).",
  ].join("\n");
  return { subject, text: text + "\n" };
}

// Ohne Namen und ohne Nachrichtentext, damit das Formular nicht zum Versand
// fremder Inhalte an beliebige Adressen missbraucht werden kann.
export const CONFIRMATION_SUBJECT = "Deine Nachricht an Tazkiyah";
export const CONFIRMATION_TEXT = `Hallo,

vielen Dank für deine Nachricht. Sie ist bei uns angekommen, und wir melden uns in der Regel innerhalb weniger Tage bei dir.

Bitte beachte: Wir geben keine Anlageberatung und keine religiösen Rechtsgutachten (Fatwas).

Viele Grüße
Das Tazkiyah-Team

Diese E-Mail wurde automatisch versendet. Du kannst direkt auf sie antworten.
`;
