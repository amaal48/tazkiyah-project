import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestionDigest } from "./questionDigest.js";

const row = (question, created_at = "2026-10-06T08:05:00Z", page = "akademie") => ({ question, page, created_at });

test("keine Fragen: keine E-Mail", () => {
  assert.equal(buildQuestionDigest([]), null);
  assert.equal(buildQuestionDigest(null), null);
});

test("eine Frage: Einzahl, Datum in Berliner Zeit, Seite und Fußzeile", () => {
  const d = buildQuestionDigest([row("  Was ist Riba?  ")]);
  assert.equal(d.subject, "Tazkiyah: 1 neue Frage in der Akademie");
  assert.match(d.text, /^1\. 06\.10\.2026, 10:05 Uhr · Seite: akademie\nWas ist Riba\?\n/);
  assert.match(d.text, /Lesen und Status setzen: Supabase → Table Editor → academy_questions\n$/);
  assert.doesNotMatch(d.text, /nächsten Lauf/);
});

test("mehrere Fragen: Mehrzahl, nummeriert in Reihenfolge", () => {
  const d = buildQuestionDigest([row("Erste Frage", "2026-01-15T23:30:00Z"), row("Zweite Frage"), row("Dritte", undefined, null)]);
  assert.equal(d.subject, "Tazkiyah: 3 neue Fragen in der Akademie");
  assert.match(d.text, /1\. 16\.01\.2026, 00:30 Uhr · Seite: akademie\nErste Frage/);
  assert.match(d.text, /2\. .*\nZweite Frage/);
  assert.match(d.text, /3\. .* · Seite: unbekannt\nDritte/);
  assert.ok(d.text.indexOf("Erste") < d.text.indexOf("Zweite"));
});

test("Limit erreicht: Hinweis auf den nächsten Lauf", () => {
  const rows = Array.from({ length: 3 }, (_, i) => row(`Frage ${i + 1}`));
  const d = buildQuestionDigest(rows, { limit: 3 });
  assert.match(d.text, /Weitere Fragen folgen beim nächsten Lauf\./);
  assert.doesNotMatch(buildQuestionDigest(rows.slice(0, 2), { limit: 3 }).text, /nächsten Lauf/);
});

const contact = (message, created_at = "2026-10-06T06:00:00Z") => ({ topic: "fehler", email: "max@example.de", message, created_at });

test("nur Kontaktnachrichten: eigene Überschrift, Thema, E-Mail, Datum, Nachricht", () => {
  const d = buildQuestionDigest([], { contacts: [contact("Der Link geht nicht.")] });
  assert.equal(d.subject, "Tazkiyah: 1 Kontaktnachricht ohne Benachrichtigung");
  assert.match(d.text, /^Kontaktnachrichten ohne Benachrichtigung\n=+\n\n1\. 06\.10\.2026, 08:00 Uhr · Thema: Fehler auf der Seite · E-Mail: max@example\.de\nDer Link geht nicht\.\n/);
  assert.match(d.text, /contact_messages\n$/);
  assert.doesNotMatch(d.text, /academy_questions/);
});

test("Fragen und Kontaktnachrichten zusammen: Fragen zuerst, beide Fußzeilen", () => {
  const d = buildQuestionDigest([row("Was ist Riba?")], { contacts: [contact("Eins"), contact("Zwei")] });
  assert.equal(d.subject, "Tazkiyah: 1 neue Frage in der Akademie und 2 Kontaktnachrichten ohne Benachrichtigung");
  assert.ok(d.text.indexOf("Was ist Riba?") < d.text.indexOf("Kontaktnachrichten ohne Benachrichtigung"));
  assert.ok(d.text.indexOf("academy_questions") < d.text.indexOf("Kontaktnachrichten ohne Benachrichtigung"));
  assert.match(d.text, /2\. .*\nZwei\n/);
});

test("Limit bei Kontaktnachrichten erreicht: eigener Hinweis", () => {
  const d = buildQuestionDigest([], { limit: 2, contacts: [contact("Eins"), contact("Zwei")] });
  assert.match(d.text, /ersten 2 Kontaktnachrichten\. Weitere folgen beim nächsten Lauf\./);
});
