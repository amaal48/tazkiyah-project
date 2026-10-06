// src/lib/questionDigest.js
//
// Betreff und Text der täglichen Sammel-E-Mail (api/notify-questions.js): neue
// Akademie-Fragen und Kontaktnachrichten, deren sofortige Benachrichtigung gescheitert ist.
// Ohne Abhängigkeiten, damit es sich mit node --test prüfen lässt.

import { fmtBerlin, topicLabel } from "./contact.js";

export const DIGEST_LIMIT = 100;
export const CONTACT_HEADING = "Kontaktnachrichten ohne Benachrichtigung";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * rows:     [{ question, page, created_at }], bereits nach created_at sortiert
 * contacts: [{ topic, email, message, created_at }], bereits nach created_at sortiert
 * limit:    Höchstzahl je Lauf und Art; ist sie erreicht, folgt ein Hinweis auf den nächsten Lauf
 * Gibt null zurück, wenn es weder Fragen noch Kontaktnachrichten gibt (dann keine E-Mail).
 */
export function buildQuestionDigest(rows, { limit = DIGEST_LIMIT, contacts = [] } = {}) {
  const n = rows?.length || 0;
  const m = contacts?.length || 0;
  if (n === 0 && m === 0) return null;

  const subjectParts = [];
  if (n) subjectParts.push(`${plural(n, "neue Frage", "neue Fragen")} in der Akademie`);
  if (m) subjectParts.push(`${plural(m, "Kontaktnachricht", "Kontaktnachrichten")} ohne Benachrichtigung`);
  const subject = `Tazkiyah: ${subjectParts.join(" und ")}`;

  const parts = [];
  if (n) {
    parts.push(
      rows
        .map((r, i) => `${i + 1}. ${fmtBerlin(r.created_at)} · Seite: ${r.page || "unbekannt"}\n${String(r.question ?? "").trim()}`)
        .join("\n\n")
    );
    if (n >= limit) parts.push(`Hinweis: Das sind die ersten ${limit} Fragen. Weitere Fragen folgen beim nächsten Lauf.`);
    parts.push("Lesen und Status setzen: Supabase → Table Editor → academy_questions");
  }
  if (m) {
    parts.push(`${CONTACT_HEADING}\n${"=".repeat(CONTACT_HEADING.length)}`);
    parts.push(
      contacts
        .map(
          (c, i) =>
            `${i + 1}. ${fmtBerlin(c.created_at)} · Thema: ${topicLabel(c.topic)} · E-Mail: ${c.email}\n${String(c.message ?? "").trim()}`
        )
        .join("\n\n")
    );
    if (m >= limit) parts.push(`Hinweis: Das sind die ersten ${limit} Kontaktnachrichten. Weitere folgen beim nächsten Lauf.`);
    parts.push("Lesen und beantworten: Supabase → Table Editor → contact_messages");
  }
  return { subject, text: parts.join("\n\n") + "\n" };
}
