// scripts/lib/review.test.mjs — ausführen mit: node --test scripts/lib/review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  htmlToText, decodeEntities, findCik, pickLatest10K, filingBaseUrl, findCharterLinks, charterSlices, businessSlice,
  segmentSlices, revenueSlices, amendmentSlices, buildSlicesMarkdown, decodeBytes, fixControlChars, unwrapParagraphs, isHardWrapped, normalizeForQuote, findQuote, findLaterCharterChanges, checkSegmentSums, keywordHits, a1KeywordHits, keywordCounts, keywordHitsMarkdown, validateDraft, validateInterestIncomeNotes, draftToSql, verificationSql, reviewSheet, sqlString,
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
  A2: { result: "pass", quote: "to engage in any lawful act or activity.", sourceUrl: "https://x/c.htm", sourceNote: "Art. III", confidence: "high", confirmed: true, verification: "full" },
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
  const { statements, skipped } = draftToSql(d, { reviewer: "AMI", currentAnnual: null });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /'A2', 'pass'/);
  assert.match(statements[0], /'AMI', '2025-09-27'::date, 'full', true\nfrom/);
  assert.match(statements[0], /verification, ai_draft\)/);
  assert.doesNotMatch(statements[0], /kiDraft|KI-Entwurf|Claude/);
  assert.match(statements[0], /Company''s purpose/);
  assert.doesNotMatch(statements[0], /coalesce/);
  assert.match(statements[0], /, '2025-09-27'::date, 'full', true\nfrom/);
  assert.match(statements[0], /not exists/);
  assert.match(statements[0], /where s\.ticker = 'AAPL'/);
  assert.ok(skipped.some((x) => /B3: nicht bestätigt/.test(x)));
  // unklar bleibt draußen, auch wenn bestätigt
  d.B3.confirmed = true;
  assert.ok(draftToSql(d, { reviewer: "AMI", currentAnnual: null }).skipped.some((x) => /unklar/.test(x)));
  // B3 fail ohne vollständige Beträge wird nicht ausgegeben
  d.B3 = { result: "fail", quote: "q.", sourceUrl: "u", confirmed: true, verification: "sample", prohibitedRevenueByPeriod: { "annual:2025-09-27": { music: 5 } } };
  const r = draftToSql(d, { reviewer: "AMI", currentAnnual: null });
  assert.equal(r.statements.length, 1); // nur A2
  assert.ok(r.skipped.some((x) => /B3/.test(x) && /Quartale/.test(x)));
  assert.throws(() => draftToSql(d, { reviewer: "", currentAnnual: null }));
  // Prüfer-Angabe nur als Kürzel, der alte lange Wortlaut wird abgelehnt
  assert.throws(() => draftToSql(good(), { reviewer: "KI-Entwurf (Claude), kontrolliert von Test", currentAnnual: null }), /Kürzel/);
  assert.throws(() => draftToSql(good(), { reviewer: "ami", currentAnnual: null }), /Kürzel/);
  assert.equal(sqlString("a'b"), "'a''b'");
  assert.equal(sqlString(null), "null");
});

test("draftToSql: Jahresabschluss gleich, abweichend, kein Ergebnis", () => {
  // gleich: Eintrag mit dem Entwurfsdatum, SQL sichert gegen spätere Änderung ab
  const same = draftToSql(good(), { reviewer: "AMI", currentAnnual: "2025-09-27" });
  assert.equal(same.statements.length, 1);
  assert.match(same.statements[0], /'2025-09-27'::date, 'full', true\nfrom/);
  assert.match(same.statements[0], /and \(sc\.annual_period_end is null or sc\.annual_period_end = '2025-09-27'::date\)/);
  assert.match(same.statements[0], /m\.basis_annual_period_end = '2025-09-27'::date/);
  assert.deepEqual(same.notes, []);

  // abweichend: übersprungen und gemeldet, kein Eintrag
  const diff = draftToSql(good(), { reviewer: "AMI", currentAnnual: "2026-09-26" });
  assert.equal(diff.statements.length, 0);
  assert.ok(diff.skipped.some((x) => /AAPL A2: Jahresabschluss im Entwurf 2025-09-27, in screening_current 2026-09-26/.test(x)));
  assert.deepEqual(diff.notes, []);

  // kein Ergebnis: Eintrag mit dem Entwurfsdatum, Aktie wird gemeldet
  const none = draftToSql(good(), { reviewer: "AMI", currentAnnual: null });
  assert.equal(none.statements.length, 1);
  assert.match(none.statements[0], /'2025-09-27'::date, 'full', true\nfrom/);
  assert.ok(none.notes.some((x) => /AAPL: noch kein Ergebnis in screening_current, Datum aus dem Entwurf \(2025-09-27\)/.test(x)));

  // ohne Angabe oder mit ungültigem Datum: Fehler statt still weiter
  assert.throws(() => draftToSql(good(), { reviewer: "AMI" }), /currentAnnual fehlt/);
  assert.throws(() => draftToSql(good(), { reviewer: "AMI", currentAnnual: "gestern" }), /kein Datum/);

  // Entwurf ohne gültiges Datum: übersprungen
  const bad = good();
  bad.annualPeriodEnd = "2025";
  const r = draftToSql(bad, { reviewer: "AMI", currentAnnual: null });
  assert.equal(r.statements.length, 0);
  assert.ok(r.skipped.some((x) => /annualPeriodEnd fehlt im Entwurf/.test(x)));
});

test("draftToSql: Gegenprüfung – pass nur mit full, fail auch mit sample, fehlend wird übersprungen", () => {
  // pass + full: übernommen, verification landet in der Spalte
  const full = draftToSql(good(), { reviewer: "AMI", currentAnnual: null });
  assert.equal(full.statements.length, 1);
  assert.match(full.statements[0], /basis_annual_period_end, verification, ai_draft\)/);
  assert.match(full.statements[0], /'2025-09-27'::date, 'full', true\nfrom/);

  // pass + sample: übersprungen und gemeldet
  const d = good();
  d.A2.verification = "sample";
  const r1 = draftToSql(d, { reviewer: "AMI", currentAnnual: null });
  assert.equal(r1.statements.length, 0);
  assert.ok(r1.skipped.some((x) => /AAPL A2: pass ohne vollständige Gegenprüfung/.test(x)));

  // verification fehlt: übersprungen und gemeldet
  delete d.A2.verification;
  const r2 = draftToSql(d, { reviewer: "AMI", currentAnnual: null });
  assert.equal(r2.statements.length, 0);
  assert.ok(r2.skipped.some((x) => /AAPL A2: verification fehlt/.test(x)));

  // ungültiger Wert: übersprungen
  d.A2.verification = "teilweise";
  assert.ok(draftToSql(d, { reviewer: "AMI", currentAnnual: null }).skipped.some((x) => /verification ungültig/.test(x)));

  // fail + sample und fail + full: beide übernommen
  const quarters = { "annual:2025-09-27": { music: 5 }, "quarter:2025-12-27": 1, "quarter:2026-03-28": 1, "quarter:2026-06-27": 1, "quarter:2025-09-27": 1 };
  for (const v of ["sample", "full"]) {
    const f = good();
    f.B3 = { result: "fail", quote: "q.", sourceUrl: "u", confirmed: true, verification: v, prohibitedRevenueByPeriod: quarters };
    const r = draftToSql(f, { reviewer: "AMI", currentAnnual: null });
    assert.equal(r.statements.length, 2, v);
    assert.match(r.statements[1], new RegExp(`'B3_SEGMENTS', 'fail'[\\s\\S]*'2025-09-27'::date, '${v}', true`));
  }
});

test("verificationSql und reviewSheet", () => {
  assert.match(verificationSql(["AAPL", "AAPL", "MSFT"]), /in \('AAPL', 'MSFT'\)/);
  assert.match(verificationSql(["AAPL"]), /m\.verification/);
  assert.match(verificationSql(["AAPL"]), /m\.ai_draft/);
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
  d.B3 = { result: "pass", quote: "Our segments are Cloud and Devices.", sourceUrl: "u", confirmed: true, verification: "full" };
  const sources = { A2: { "charter.txt": "ARTICLE III to engage in any lawful act or activity." }, B3: { "10k.txt": "unrelated text only" } };
  const r = draftToSql(d, { reviewer: "AMI", sources, currentAnnual: null });
  assert.equal(r.statements.length, 1); // A2 ja, B3 nein
  assert.ok(r.skipped.some((x) => /B3: Zitat steht nicht wörtlich/.test(x)));
  sources.B3["10k.txt"] = "Note 13. Our segments are Cloud\nand Devices.";
  assert.equal(draftToSql(d, { reviewer: "AMI", sources, currentAnnual: null }).statements.length, 2);
});

// ------------------------------------------------ spätere Satzungsänderungen, Summenprüfung

test("findLaterCharterChanges: nur 8-K mit Item 5.03 nach dem Stichtag", () => {
  const subs = { filings: { recent: {
    form: ["8-K", "8-K", "10-K", "8-K/A", "8-K"],
    items: ["5.03,9.01", "2.02", "", "5.03", "5.07,5.03"],
    accessionNumber: ["0000354950-26-000105", "0000354950-26-000090", "0001628280-26-019436", "0000354950-26-000110", "0000354950-25-000050"],
    filingDate: ["2026-05-22", "2026-05-01", "2026-03-18", "2026-06-02", "2025-06-01"],
    primaryDocument: ["a.htm", "b.htm", "k.htm", "c.htm", "d.htm"],
  } } };
  const r = findLaterCharterChanges(subs, "2026-03-18");
  assert.deepEqual(r.map((x) => x.filingDate), ["2026-06-02", "2026-05-22"]); // jüngste zuerst; 2.02 und alte Meldung draußen
  assert.deepEqual(findLaterCharterChanges({ filings: { recent: { form: ["8-K"] } } }, "2026-01-01"), []);
  const md = buildSlicesMarkdown({ ticker: "HD", meta: {}, tenK: "x", charter: { url: "u", text: CHARTER }, laterChanges: [{ filingDate: "2026-05-22", url: "https://x/8k.htm", file: "charter-spaeter-1.txt", text: "Item 5.03 Amendments to Articles. The Restated Certificate was filed.", exhibit: { url: "https://x/ex.htm", file: "charter-spaeter-1-anlage.txt", text: CHARTER } }] });
  assert.match(md, /ACHTUNG: Satzungsänderungen NACH dem 10-K/);
  assert.match(md, /Restated Certificate was filed/);
  assert.match(md, /any lawful act or activity/);
});

test("checkSegmentSums: gleiche Summen ok, Abweichung und Lücken erkannt", () => {
  const mk = (a, b) => ({ B3: { segments: [
    { name: "A", dimension: "Berichtssegment", revenue: a[0] }, { name: "B", dimension: "Berichtssegment", revenue: a[1] },
    { name: "X", dimension: "Endmarkt", revenue: b[0] }, { name: "Y", dimension: "Endmarkt", revenue: b[1] },
  ] } });
  assert.equal(checkSegmentSums(mk([193479, 22459], [193737, 22201])).status, "ok");  // 215938 = 215938
  assert.equal(checkSegmentSums(mk([100, 50], [100, 20])).status, "mismatch");
  assert.equal(checkSegmentSums(mk([100, 50], [100, 49.9])).status, "ok");             // innerhalb 1 %
  // Berichtssegmente ohne Umsatz (wie bei BRK-B) zählen nicht
  const gap = mk([null, null], [100, 50]);
  assert.equal(checkSegmentSums(gap).status, "insufficient");
  assert.equal(checkSegmentSums({}).status, "insufficient");
});

test("draftToSql: B3 pass mit falschen Segmentsummen wird nicht übernommen", () => {
  const d = good();
  d.B3 = { result: "pass", quote: "Segmente.", sourceUrl: "u", confirmed: true, verification: "full", segments: [
    { name: "A", dimension: "Berichtssegment", revenue: 100 }, { name: "B", dimension: "Berichtssegment", revenue: 50 },
    { name: "X", dimension: "Endmarkt", revenue: 100 }, { name: "Y", dimension: "Endmarkt", revenue: 20 } ] };
  const r = draftToSql(d, { reviewer: "AMI", currentAnnual: null });
  assert.equal(r.statements.length, 1);
  assert.ok(r.skipped.some((x) => /Segmentsummen/.test(x)));
});

// ------------------------------------------------ Stichwort-Treffer

test("keywordHits: Alkohol gefunden, nonalcoholic nicht; Fundstellen mit Umgebung", () => {
  const text = "We sell nonalcoholic and non-alcoholic beverages. In 2025 we entered the alcohol business through a subsidiary offering Jack Daniel's whiskey and hard seltzer. Music licensing and casino partners are described elsewhere. " + "filler ".repeat(400) + "Alcoholic beverages are regulated.";
  const h = keywordHits(text);
  assert.equal(h.alcohol.count, 3); // alcohol, whiskey, Alcoholic
  assert.match(h.alcohol.contexts[0].text, /entered the alcohol business/);
  assert.equal(h.gambling.count, 1);
  assert.equal(h.music.count, 1);
  assert.equal(h.tobacco.count, 0);
  assert.equal(keywordCounts(h).alcohol, 3);
  const md = keywordHitsMarkdown("KO", h);
  assert.match(md, /KO: Stichwort-Treffer/);
  assert.match(md, /## alcohol \(3 Treffer/);
  assert.ok(!md.includes("## tobacco"));
});

test("reviewSheet und slices zeigen die Stichwort-Treffer", () => {
  const sheet = reviewSheet([good()], { keywordCounts: { AAPL: { alcohol: 0, music: 12 } } });
  assert.match(sheet, /Stichwort-Treffer im 10-K: music 12/);
  const md = buildSlicesMarkdown({ ticker: "KO", meta: {}, tenK: "x", charter: null, keywordCounts: { alcohol: 9, gambling: 0 } });
  assert.match(md, /Treffer: alcohol 9/);
  assert.match(md, /macht aus pass ein unclear/);
});

test("keywordHits: Procter & Gamble ist kein Glücksspiel, Kredit an Kunden und Zinserträge werden gefunden", () => {
  const h = keywordHits("Director at Procter & Gamble. Customer receivables relate to credit extended directly to certain customers. Interest and dividends income was $2,000. We expect to expand our Pro Trade Credit program. Casino revenue grew.");
  assert.equal(h.gambling.count, 1); // nur "Casino"
  assert.ok(h.interest_financial.count >= 3); // customer receivables, credit extended, interest and dividends income, ...
  assert.equal(keywordHits("Procter and Gamble and the gambling industry").gambling.count, 1);
});

test("B3: Zinserträge laut Anhang werden geprüft und als eigene Spalte eingetragen (08.10.2026)", () => {
  const notes = {
    "annual:2025-09-27": { amount: 3500000000, source: "10-K 2025, Note 5, S. 34" },
    "quarter:2026-06-27": { amount: 900000000, source: "10-Q Q3 2026, Note 4, S. 12" },
  };
  assert.deepEqual(validateInterestIncomeNotes(notes), []);
  assert.deepEqual(validateInterestIncomeNotes(undefined), []);
  assert.ok(validateInterestIncomeNotes([]).length);
  assert.ok(validateInterestIncomeNotes({ "jahr:2025": { amount: 1, source: "x" } }).some((p) => /Schlüssel/.test(p)));
  assert.ok(validateInterestIncomeNotes({ "annual:2025-09-27": { amount: -1, source: "x" } }).some((p) => /amount/.test(p)));
  assert.ok(validateInterestIncomeNotes({ "annual:2025-09-27": { amount: 1 } }).some((p) => /source/.test(p)));

  const d = good();
  Object.assign(d.B3, { result: "pass", quote: "The Company reports three segments.", sourceNote: "Item 8, Note 13", confidence: "high", confirmed: true, verification: "full", interestIncomeNotes: notes });
  const { statements, skipped } = draftToSql(d, { reviewer: "AMI", currentAnnual: null });
  assert.deepEqual(skipped, []);
  const b3 = statements.find((x) => /B3_SEGMENTS/.test(x));
  assert.match(b3, /verification, ai_draft, interest_income_notes\)/);
  assert.match(b3, /"annual:2025-09-27":\{"amount":3500000000/);
  // Ohne Anhang-Werte: Spalte nicht im insert (läuft auch vor der Datenbankänderung)
  const plain = good();
  Object.assign(plain.B3, { result: "pass", quote: "The Company reports three segments.", sourceNote: "Item 8, Note 13", confidence: "high", confirmed: true, verification: "full" });
  assert.doesNotMatch(draftToSql(plain, { reviewer: "AMI", currentAnnual: null }).statements.join("\n"), /interest_income_notes/);
  // Ungültige Anhang-Werte: B3 wird nicht eingetragen
  const bad = good();
  Object.assign(bad.B3, { result: "pass", quote: "The Company reports three segments.", sourceNote: "Item 8, Note 13", confidence: "high", confirmed: true, verification: "full", interestIncomeNotes: { "annual:2025-09-27": { amount: "viel", source: "x" } } });
  assert.ok(draftToSql(bad, { reviewer: "AMI", currentAnnual: null }).skipped.some((x) => /B3.*amount/.test(x)));
});

test("a1KeywordHits: A1-Hinweise (Casino, Games, Schweinefleisch) und eigener Abschnitt in keyword-hits.md", () => {
  const text = "Our casinos in Macau grew. We publish video games. The pork segment is small. Software.";
  const a1 = a1KeywordHits(text);
  assert.equal(a1.gambling.count, 1);
  assert.equal(a1.film_streaming_games.count, 1);
  assert.equal(a1.pork.count, 1);
  assert.equal(a1.adult.count, 0);
  const md = keywordHitsMarkdown("X", keywordHits(text), a1);
  assert.match(md, /## A1-Hinweise \(Kerngeschäft\)/);
  assert.match(md, /manual_reviews, criterion A1/);
  assert.match(md, /### Glücksspiel \(1 Treffer/);
  assert.doesNotMatch(keywordHitsMarkdown("X", keywordHits(text)), /A1-Hinweise/);
});
