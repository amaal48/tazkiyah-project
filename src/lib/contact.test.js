import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIRMATION_TEXT, buildContactNotification, validateContact } from "./contact.js";

const ok = { email: "  Max@Example.DE ", name: " Max ", topic: "feedback", message: "  Eine Nachricht mit Inhalt.  " };

test("gültige Eingaben werden bereinigt", () => {
  const r = validateContact(ok);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { email: "max@example.de", name: "Max", topic: "feedback", message: "Eine Nachricht mit Inhalt." });
});

test("Name ist freiwillig", () => {
  assert.equal(validateContact({ ...ok, name: "" }).ok, true);
  assert.equal(validateContact({ ...ok, name: undefined }).ok, true);
});

test("E-Mail: Pflicht und grobes Format", () => {
  assert.match(validateContact({ ...ok, email: " " }).error, /E-Mail-Adresse an/);
  for (const email of ["max", "max@", "max@example", "max @example.de", "a@b@c.de"]) {
    assert.equal(validateContact({ ...ok, email }).ok, false, email);
  }
});

test("Zeilenumbrüche in E-Mail und Name verboten, in der Nachricht erlaubt", () => {
  assert.match(validateContact({ ...ok, email: "max@example.de\nBcc: x@y.de" }).error, /Zeilenumbrüche/);
  assert.match(validateContact({ ...ok, name: "Max\r\nBcc" }).error, /Zeilenumbrüche/);
  assert.equal(validateContact({ ...ok, message: "Zeile eins\nZeile zwei" }).ok, true);
});

test("Name höchstens 80 Zeichen", () => {
  assert.equal(validateContact({ ...ok, name: "a".repeat(80) }).ok, true);
  assert.match(validateContact({ ...ok, name: "a".repeat(81) }).error, /80/);
});

test("Thema nur aus der Liste", () => {
  for (const topic of ["allgemein", "fehler", "feedback", "sonstiges"]) assert.equal(validateContact({ ...ok, topic }).ok, true);
  assert.match(validateContact({ ...ok, topic: "werbung" }).error, /Thema/);
  assert.equal(validateContact({ ...ok, topic: undefined }).ok, false);
});

test("Nachricht 10 bis 2000 Zeichen (nach dem Trimmen)", () => {
  assert.equal(validateContact({ ...ok, message: "a".repeat(10) }).ok, true);
  assert.match(validateContact({ ...ok, message: "   " + "a".repeat(9) + "   " }).error, /mindestens 10/);
  assert.equal(validateContact({ ...ok, message: "a".repeat(2000) }).ok, true);
  assert.match(validateContact({ ...ok, message: "a".repeat(2001) }).error, /höchstens 2000/);
});

test("falsche Typen und leere Eingabe", () => {
  assert.equal(validateContact(null).ok, false);
  assert.equal(validateContact({ ...ok, email: 42 }).ok, false);
  assert.equal(validateContact({ ...ok, message: ["x".repeat(20)] }).ok, false);
});

test("Benachrichtigung: Betreff mit Thema und Name, sonst E-Mail; Text mit allen Angaben", () => {
  const base = { email: "max@example.de", topic: "fehler", message: "Der Link geht nicht.", created_at: "2026-10-06T08:05:00Z" };
  const withName = buildContactNotification({ ...base, name: "Max" });
  assert.equal(withName.subject, "Kontakt (Fehler auf der Seite): Max");
  assert.match(withName.text, /^Thema: Fehler auf der Seite\nName: Max\nE-Mail: max@example\.de\nDatum: 06\.10\.2026, 10:05 Uhr\n\nNachricht:\nDer Link geht nicht\.\n/);
  const noName = buildContactNotification({ ...base, name: "" });
  assert.equal(noName.subject, "Kontakt (Fehler auf der Seite): max@example.de");
  assert.match(noName.text, /Name: \(nicht angegeben\)/);
});

test("Eingangsbestätigung enthält keine Platzhalter für Name oder Nachricht", () => {
  assert.match(CONFIRMATION_TEXT, /^Hallo,\n\nvielen Dank für deine Nachricht\./);
  assert.match(CONFIRMATION_TEXT, /Du kannst direkt auf sie antworten\.\n$/);
  assert.doesNotMatch(CONFIRMATION_TEXT, /\$\{|Name|Nachricht:/);
});
