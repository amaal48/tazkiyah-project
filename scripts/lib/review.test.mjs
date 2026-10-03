// scripts/lib/review.test.mjs — ausführen mit: node --test scripts/lib/review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  htmlToText, decodeEntities, findCik, pickLatest10K, filingBaseUrl, findCharterLinks, charterSlices, businessSlice,
  segmentSlices, revenueSlices, amendmentSlices, buildSlicesMarkdown, decodeBytes, fixControlChars, unwrapParagraphs, isHardWrapped, normalizeForQuote, findQuote, validateDraft, draftToSql, verificationSql, reviewSheet, sqlString,
} from "./review.mjs";

test("htmlToText: Inline-XBRL-Kopf entfernt, Zellen getrennt, Entitäten decodiert", () => {
  const html = `<html><ix:header><ix:hidden>verborgen 123</ix:hidden></ix:header><body><p>Apple&#8217;s&nbsp;net sales &amp; services</p><table><tr><td>iPhone</td><td>$ 201,183</td></tr></table><script>var x=1;</script></body></html>`;
  const t = htmlToText(html);
  assert.ok(!t.includes("verborgen"));
  assert.ok(!t.includes("var x"));
  assert.match(t, /Apple’s net sales & services/);
  assert.match(t, /iPhone \| \$ 201,183/);
  assert.equal(decodeEntities("&#x41;&#66;&amp;&unbekannt;"), "AB&&unbekannt;");
});

test("findCik: Ticker mit Punkt oder Bindestrich", () => {
  const json = { 0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, 1: { cik_str: 1067983, ticker: "BRK-B", title: "BERKSHIRE HATHAWAY INC" } };
  assert.deepEqual(findCik(json, "aapl"), { cik: "0000320193", name: "Apple Inc." });
  assert.equal(findCik(json, "BRK.B").cik, "0001067983");
  assert.equal(findCik(json, "ZZZZ"), null);
});

test("pickLatest10K: nur 10-K, jüngstes Datum", () => {
  const subs = { filings: { recent: {
    form: ["10-Q", "10-K", "10-K/A", "10-K"],
    accessionNumber: ["0000320193-26-000050", "0000320193-25-000079", "0000320193-25-000080", "0000320193-24-000123"],
    filingDate: ["2026-07-31", "2025-10-31", "2025-11-15", "2024-11-01"],
    reportDate: ["2026-06-27", "2025-09-27", "2025-09-27", "2024-09-28"],
    primaryDocument: ["q.htm", "aapl-20250927.htm", "a.htm", "aapl-20240928.htm"],
  } } };
  const k = pickLatest10K(subs);
  assert.equal(k.accession, "0000320193-25-000079");
  assert.equal(k.accessionNoDashes, "000032019325000079");
  assert.equal(k.reportDate, "2025-09-27");
  assert.equal(pickLatest10K({ filings: { recent: { form: ["10-Q"] } } }), null);
  assert.equal(filingBaseUrl("0000320193", "000032019325000079"), "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/");
});

const INDEX_HTML = `<table>
<tr><td>3.1</td><td>Restated Certificate of Incorporation of the Registrant, dated August 7, 2019.</td><td><a href="/Archives/edgar/data/320193/000119312519213001/d737029dex31.htm">8-K</a></td></tr>
<tr><td>3.2</td><td>Amended and Restated Bylaws of the Registrant</td><td><a href="/Archives/edgar/data/320193/x/bylaws.htm">8-K</a></td></tr>
<tr><td>3.3</td><td>Certificate of Amendment to the Certificate of Incorporation</td><td><a href="amend.htm">8-K</a> <a href="print.pdf">PDF</a></td></tr>
<tr><td>4.1</td><td>Indenture between the Registrant and the Trustee</td><td><a href="ind.htm">10-K</a></td></tr>
</table>`;

test("findCharterLinks: Satzung vor Änderung, Bylaws und PDFs bleiben draußen", () => {
  const links = findCharterLinks(INDEX_HTML, "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/");
  assert.equal(links[0].href, "https://www.sec.gov/Archives/edgar/data/320193/000119312519213001/d737029dex31.htm");
  assert.ok(links.every((l) => !/bylaws|\.pdf/i.test(l.href)));
  assert.ok(links.some((l) => l.href.endsWith("/amend.htm")));
  assert.ok(links[0].score > links.at(-1).score);
});

const CHARTER = `ARTICLE I NAME. The name of the corporation is Example Inc. ARTICLE II REGISTERED OFFICE. ${"x ".repeat(2000)} ARTICLE III PURPOSE. The purpose of the Corporation is to engage in any lawful act or activity for which corporations may be organized under the General Corporation Law of the State of Delaware. ${"y ".repeat(2000)}`;

test("charterSlices: Zweckklausel liegt im Ausschnitt", () => {
  const wins = charterSlices(CHARTER);
  assert.ok(wins.length >= 1);
  assert.ok(wins.some((w) => /any lawful act or activity/.test(w.text)));
  assert.ok(wins.every((w, i) => i === 0 || w.from >= wins[i - 1].to)); // keine Überlappung
});

test("businessSlice überspringt das Inhaltsverzeichnis", () => {
  const toc = "TABLE OF CONTENTS Item 1. Business 3 Item 1A. Risk Factors 8 Item 2. Properties 20 ";
  const body = `${"filler ".repeat(300)} Item 1. Business The Company designs, manufactures and markets smartphones. See Item 1A of this report for risks. ${"more ".repeat(1000)} Item 1A. Risk Factors`;
  const b = businessSlice(toc + body);
  assert.match(b.text, /designs, manufactures and markets smartphones/);
  assert.ok(!b.text.startsWith("Item 1. Business 3"));
});

test("segmentSlices: nimmt die Stelle mit Zahlen in der zweiten Texthälfte", () => {
  const early = "Our reportable segments are described below. ".repeat(3);
  const late = `Note 13 Segment Information and Geographic Data. ${"Americas | 167,045 | 66,000 | 12,300 | 8,100 | 7,200 | 5,000 | 4,400 | 3,300 ".repeat(5)}`;
  const text = early + "z ".repeat(8000) + late + "z ".repeat(1000);
  const wins = segmentSlices(text);
  assert.equal(wins.length, 1);
  assert.match(wins[0].text, /Segment Information and Geographic Data/);
  const rev = "Revenue by end market: Data Center 115,186 Gaming 11,350 Professional Visualization 1,878 Automotive 1,694 OEM and Other 389 ".repeat(2);
  assert.ok(revenueSlices(rev).length >= 1);
  // Steuertabelle mit „disaggregation“ darf nicht als Umsatz durchgehen
  const tax = "Disaggregation of income taxes: Federal 1,234 State 2,345 Foreign 3,456 Total 7,035 8,000 9,000 ";
  assert.equal(revenueSlices(tax).length, 0);
});

test("buildSlicesMarkdown: Abschnitte vorhanden, Satzung fehlt → klarer Hinweis", () => {
  const withCharter = buildSlicesMarkdown({ ticker: "AAPL", meta: { tenK: { url: "https://x/10k.htm" } }, tenK: "Item 1. Business Foo. ".repeat(5), charter: { url: "https://x/c.htm", text: CHARTER } });
  assert.match(withCharter, /## A2: Satzung/);
  assert.match(withCharter, /any lawful act or activity/);
  const amend = "CERTIFICATE OF AMENDMENT. Article IV is amended to increase the authorized shares to 8,000,000,000. ARTICLE III remains unchanged.";
  assert.equal(amendmentSlices(amend).mentionsPurpose, true);
  const withOthers = buildSlicesMarkdown({ ticker: "NVDA", meta: {}, tenK: "x", charter: { url: "https://x/c.htm", text: CHARTER }, others: [{ file: "charter-weitere-1.txt", url: "https://x/a.htm", label: "Certificate of Amendment 2024", text: amend }] });
  assert.match(withOthers, /Weitere Satzungsdokumente/);
  assert.match(withOthers, /Certificate of Amendment 2024/);
  assert.match(withOthers, /Erwähnt „purpose“ oder „Article III“: ja/);
  assert.match(buildSlicesMarkdown({ ticker: "AAPL", meta: {}, tenK: "x", charter: { url: "u", text: CHARTER } }), /Keine weiteren Satzungsdokumente/);
  const without = buildSlicesMarkdown({ ticker: "ZZZ", meta: {}, tenK: "", charter: null });
  assert.match(without, /Satzung nicht gefunden/);
});

const good = () => ({
  ticker: "AAPL",
  annualPeriodEnd: "2025-09-27",
  A2: { result: "pass", quote: "to engage in any lawful act or activity.", sourceUrl: "https://x/c.htm", sourceNote: "Art. III", confidence: "high", confirmed: true },
  B3: { result: "unclear", quote: "", sourceUrl: "https://x/10k.htm", confidence: "low", needsHumanReview: true, reasonForReview: "Dienstleistungen enthalten Musik, nicht getrennt ausgewiesen" },
});

test("validateDraft: Zitat und Quelle sind Pflicht, B3 fail braucht alle Perioden", () => {
  assert.deepEqual(validateDraft(good()), []);
  const d = good();
  d.A2.quote = "";
  assert.ok(validateDraft(d).some((p) => /ohne wörtliches Zitat/.test(p)));
  // Zitat mitten im Satz abgeschnitten (wie im Apple-Entwurf) wird gemeldet, gewollte Kürzung nicht
  const cut = good();
  cut.A2.quote = "to engage in any lawful act or activity other than the practice of a profession permitted to";
  assert.ok(validateDraft(cut).some((p) => /mitten im Satz/.test(p)));
  cut.A2.quoteIsPartial = true;
  assert.deepEqual(validateDraft(cut), []);
  cut.A2.quote = "x ".repeat(300);
  assert.ok(validateDraft(cut).some((p) => /zu lang/.test(p)));
  const f = good();
  f.B3 = { result: "fail", quote: "q.", sourceUrl: "u", prohibitedRevenueByPeriod: { "annual:2025-09-27": { music: 5 } } };
  assert.ok(validateDraft(f).some((p) => /vier Quartale/.test(p)));
  f.B3.prohibitedRevenueByPeriod = { "annual:2025-09-27": { music: 5 }, "quarter:2025-12-27": 1, "quarter:2026-03-28": 1, "quarter:2026-06-27": 1, "quarter:2025-09-27": 1 };
  assert.deepEqual(validateDraft(f), []);
  f.B3.prohibitedRevenueByPeriod = { "annual:2025-09-27": 0, "quarter:a": 0, "quarter:b": 0, "quarter:c": 0, "quarter:d": 0 };
  assert.ok(validateDraft(f).some((p) => /Widerspruch/.test(p)));
  assert.ok(validateDraft({}).length > 0);
});

test("draftToSql: nur Bestätigtes, Apostrophe doppelt, Wiederholung fügt nichts doppelt ein", () => {
  const d = good();
  d.A2.quote = "to engage in any lawful act or activity (the Company's purpose)";
  const { statements, skipped } = draftToSql(d, { reviewer: "KI-Entwurf (Claude), kontrolliert von Test" });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /'A2', 'pass'/);
  assert.match(statements[0], /Company''s purpose/);
  assert.match(statements[0], /coalesce\(sc\.annual_period_end, '2025-09-27'::date\)/);
  assert.match(statements[0], /not exists/);
  assert.match(statements[0], /where s\.ticker = 'AAPL'/);
  assert.ok(skipped.some((x) => /B3: nicht bestätigt/.test(x)));
  // unklar bleibt draußen, auch wenn bestätigt
  d.B3.confirmed = true;
  assert.ok(draftToSql(d, { reviewer: "x" }).skipped.some((x) => /unklar/.test(x)));
  // B3 fail ohne vollständige Beträge wird nicht ausgegeben
  d.B3 = { result: "fail", quote: "q.", sourceUrl: "u", confirmed: true, prohibitedRevenueByPeriod: { "annual:2025-09-27": { music: 5 } } };
  const r = draftToSql(d, { reviewer: "x" });
  assert.equal(r.statements.length, 1); // nur A2
  assert.ok(r.skipped.some((x) => /B3/.test(x) && /Quartale/.test(x)));
  assert.throws(() => draftToSql(d, { reviewer: "" }));
  assert.equal(sqlString("a'b"), "'a''b'");
  assert.equal(sqlString(null), "null");
});

test("verificationSql und reviewSheet", () => {
  assert.match(verificationSql(["AAPL", "AAPL", "MSFT"]), /in \('AAPL', 'MSFT'\)/);
  const sheet = reviewSheet([good()]);
  assert.match(sheet, /## AAPL/);
  assert.match(sheet, /> to engage in any lawful act or activity\./);
  assert.match(sheet, /Grenzfall-Liste/);
  assert.match(sheet, /Dienstleistungen enthalten Musik/);
  assert.match(sheet, /- \[ \] bestätigt/);
});

// ------------------------------------------------ Kodierung, Zeilenumbrüche, Zitatprüfung

test("htmlToText: &#147; und &#148; werden zu echten Anführungszeichen", () => {
  assert.equal(htmlToText("<p>the General Corporation Law, as amended (the &#147;Act&#148;)</p>"), "the General Corporation Law, as amended (the “Act”)");
  assert.equal(fixControlChars("\u0093x\u0094 \u0092s \u0096"), "“x” ’s –");
});

test("decodeBytes: UTF-8, Windows-1252 und Header-Zeichensatz", () => {
  assert.equal(decodeBytes(new TextEncoder().encode("“A” – ü")), "“A” – ü");
  assert.equal(decodeBytes(Uint8Array.from([0x93, 0x41, 0x94, 0x20, 0x96])), "“A” –"); // ungültiges UTF-8 → Windows-1252
  assert.equal(decodeBytes(Uint8Array.from([0x93, 0x41]), "text/html; charset=ISO-8859-1"), "“A");
});

test("unwrapParagraphs: harte Umbrüche weg, Absätze bleiben", () => {
  const raw = "ARTICLE II. The purpose of the corporation is to engage in any\nlawful act or activity for which a corporation\nmay be organized.\n\nARTICLE III. Shares.";
  assert.equal(unwrapParagraphs(raw), "ARTICLE II. The purpose of the corporation is to engage in any lawful act or activity for which a corporation may be organized.\n\nARTICLE III. Shares.");
  assert.equal(isHardWrapped("plain text\nwith lines"), true);
  assert.equal(isHardWrapped("<p>Absatz</p><p>zwei</p>"), false);
  assert.equal(isHardWrapped("<html><pre>harte\nZeilen</pre></html>"), true);
});

test("findQuote: Umbrüche, Leerraum und typografische Zeichen egal, Wortlaut nicht", () => {
  const src = { "charter.txt": "The purpose of this corporation is to engage in any\nlawful act or activity for which a corporation may be organized under the Company’s Act." };
  assert.equal(findQuote("to engage in any lawful act or activity for which a corporation may be organized under the Company's Act.", src).found, true);
  assert.equal(findQuote("to engage in any lawful act or activity for which a corporation may be organised", src).found, false);
  assert.equal(findQuote("", src).found, false);
  // mehrere Fundorte werden alle genannt
  const two = findQuote("to engage in any lawful act", { "charter.txt": "x to engage in any lawful act y", "charter-weitere-2.txt": "to engage in any lawful act" });
  assert.deepEqual(two.files, ["charter.txt", "charter-weitere-2.txt"]);
  assert.equal(normalizeForQuote("“a” – b"), '"a" - b');
});

test("draftToSql mit Quellen: Zitat muss in der Quelldatei stehen", () => {
  const d = good();
  d.B3 = { result: "pass", quote: "Our segments are Cloud and Devices.", sourceUrl: "u", confirmed: true };
  const sources = { A2: { "charter.txt": "ARTICLE III to engage in any lawful act or activity." }, B3: { "10k.txt": "unrelated text only" } };
  const r = draftToSql(d, { reviewer: "x", sources });
  assert.equal(r.statements.length, 1); // A2 ja, B3 nein
  assert.ok(r.skipped.some((x) => /B3: Zitat steht nicht wörtlich/.test(x)));
  sources.B3["10k.txt"] = "Note 13. Our segments are Cloud\nand Devices.";
  assert.equal(draftToSql(d, { reviewer: "x", sources }).statements.length, 2);
});
