// src/lib/blog.test.js — Blogbeiträge aus Markdown (Kopfangaben, Text, Lesezeit, Sicherheit der Links)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTopic, parseBody, parseFrontmatter, parseInline, parsePost, parseSource, postsFromFiles, readingMinutes, safeHref } from "./blog.js";

const SAMPLE = `---
titel: Gibt es eine KI-Blase?
untertitel: "Was Anleger wissen sollten."
datum: 2026-10-20
aktualisiert: 2026-10-22
thema: Märkte & Wirtschaft
lektion: 3
quellen:
  - Bundesbank, Monatsbericht, Oktober 2026, https://www.bundesbank.de/x.
  - SEC, Form 10-K, 2026
---
Erster Absatz mit **fett** und einem Verweis.[^1]

## Zwischen

:::kurz Spekulationsblase
Kurz erklärt.

[Mehr dazu](#/lernen)
:::

> Ein Zitat
> über zwei Zeilen.

- eins
- zwei

1. erstens
2. zweitens
`;

test("Kopfangaben: Werte, Anführungszeichen, Listen", () => {
  const { meta, body } = parseFrontmatter(SAMPLE);
  assert.equal(meta.titel, "Gibt es eine KI-Blase?");
  assert.equal(meta.untertitel, "Was Anleger wissen sollten.");
  assert.equal(meta.quellen.length, 2);
  assert.ok(body.startsWith("Erster Absatz"));
});

test("Beitrag: Slug, Thema, Lektion, Quellen mit Link", () => {
  const p = parsePost("ki-blase", SAMPLE);
  assert.equal(p.slug, "ki-blase");
  assert.equal(p.thema, "maerkte");
  assert.equal(p.lektion, 3);
  assert.equal(p.aktualisiert, "2026-10-22");
  assert.deepEqual(p.quellen[0], { text: "Bundesbank, Monatsbericht, Oktober 2026", url: "https://www.bundesbank.de/x" });
  assert.deepEqual(p.quellen[1], { text: "SEC, Form 10-K, 2026", url: null });
  assert.equal(p.lesezeit, 1);
});

test("Text: Blöcke in der richtigen Reihenfolge", () => {
  const types = parsePost("x", SAMPLE).blocks.map((b) => b.type);
  assert.deepEqual(types, ["p", "h2", "kurz", "quote", "ul", "ol"]);
  const kurz = parsePost("x", SAMPLE).blocks[2];
  assert.equal(kurz.title, "Spekulationsblase");
  assert.equal(kurz.blocks.length, 2);
  const quote = parsePost("x", SAMPLE).blocks[3];
  assert.equal(quote.inline[0].text, "Ein Zitat über zwei Zeilen.");
});

test("Inline: fett, kursiv, Verweis, Link", () => {
  assert.deepEqual(parseInline("a **b** *c*[^2] [d](https://e.de)"), [
    { type: "text", text: "a " },
    { type: "strong", text: "b" },
    { type: "text", text: " " },
    { type: "em", text: "c" },
    { type: "ref", n: 2 },
    { type: "text", text: " " },
    { type: "link", text: "d", href: "https://e.de" },
  ]);
});

test("Links: nur https, mailto und Seiten der Website", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref("#/lernen"), "#/lernen");
  assert.deepEqual(parseInline("[x](javascript:alert(1))")[0].type, "text");
});

test("Lesezeit aus der Wortzahl (200 Wörter je Minute), Angabe in der Datei hat Vorrang", () => {
  const words = Array.from({ length: 1000 }, () => "Wort").join(" ");
  assert.equal(readingMinutes(words), 5);
  const p = parsePost("y", `---\ntitel: T\ndatum: 2026-01-01\nlesezeit: 9\n---\n${words}`);
  assert.equal(p.lesezeit, 9);
});

test("Ohne Titel oder Datum und mit „_“ am Anfang: kein Beitrag; neueste zuerst", () => {
  assert.equal(parsePost("z", "---\ntitel: T\n---\nText"), null);
  assert.equal(parsePost("_vorlage", SAMPLE), null);
  const posts = postsFromFiles({
    "/content/blog/alt.md": "---\ntitel: Alt\ndatum: 2026-01-01\n---\nA",
    "/content/blog/neu.md": "---\ntitel: Neu\ndatum: 2026-02-01\n---\nB",
    "/content/blog/_vorlage.md": SAMPLE,
  });
  assert.deepEqual(posts.map((p) => p.slug), ["neu", "alt"]);
});

test("Themen: Schlüssel und Bezeichnung", () => {
  assert.equal(normalizeTopic("erklaert"), "erklaert");
  assert.equal(normalizeTopic("Islamisches Finanzwesen"), "islamisches-finanzwesen");
  assert.equal(normalizeTopic("Sport"), null);
});

test("Vorlage content/blog/_vorlage.md ist gültig (als Beitrag lesbar, wenn umbenannt)", () => {
  const src = readFileSync(new URL("../../content/blog/_vorlage.md", import.meta.url), "utf8");
  const p = parsePost("beispiel", src);
  assert.ok(p);
  assert.equal(p.thema, "maerkte");
  assert.deepEqual(p.blocks.map((b) => b.type), ["p", "p", "h2", "p", "kurz", "quote", "ul", "einordnung", "h2", "p"]);
  assert.equal(parseSource("A, B, https://x.de/").url, "https://x.de/");
});

test("parseBody: leerer Text", () => {
  assert.deepEqual(parseBody(""), []);
});
