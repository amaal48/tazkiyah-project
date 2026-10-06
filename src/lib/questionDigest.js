// src/lib/questionDigest.js
//
// Betreff und Text der täglichen Sammel-E-Mail für neue Akademie-Fragen
// (api/notify-questions.js). Ohne Abhängigkeiten, damit es sich mit node --test prüfen lässt.

export const DIGEST_LIMIT = 100;

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function fmtDateTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "unbekannt" : `${DATE_FORMAT.format(d)} Uhr`;
}

/**
 * rows:  [{ question, page, created_at }], bereits nach created_at sortiert
 * limit: Höchstzahl je Lauf; ist sie erreicht, folgt ein Hinweis auf den nächsten Lauf
 * Gibt null zurück, wenn es keine Fragen gibt (dann keine E-Mail).
 */
export function buildQuestionDigest(rows, { limit = DIGEST_LIMIT } = {}) {
  const n = rows?.length || 0;
  if (n === 0) return null;

  const subject = `Tazkiyah: ${n} neue ${n === 1 ? "Frage" : "Fragen"} in der Akademie`;
  const blocks = rows.map(
    (r, i) => `${i + 1}. ${fmtDateTime(r.created_at)} · Seite: ${r.page || "unbekannt"}\n${String(r.question ?? "").trim()}`
  );
  const parts = [blocks.join("\n\n")];
  if (n >= limit) {
    parts.push(`Hinweis: Das sind die ersten ${limit} Fragen. Weitere Fragen folgen beim nächsten Lauf.`);
  }
  parts.push("Lesen und Status setzen: Supabase → Table Editor → academy_questions");
  return { subject, text: parts.join("\n\n") + "\n" };
}
