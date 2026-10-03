#!/usr/bin/env node
// scripts/sec-fetch.mjs — holt für Aktien das jüngste 10-K und die Satzung von der SEC (EDGAR)
//
// Aufruf (im Projektordner, in der normalen Terminal-App):
//   export SEC_USER_AGENT="Tazkiyah Vorname Nachname deine@mail.de"
//   node scripts/sec-fetch.mjs AAPL MSFT
//   node scripts/sec-fetch.mjs AAPL --force        (vorhandene Dateien neu holen)
//
// Die SEC verlangt in jeder Anfrage einen User-Agent mit Namen und E-Mail-Adresse
// und höchstens 10 Anfragen pro Sekunde. Dieses Skript wartet zwischen den Anfragen.
//
// Ergebnis je Aktie in review-work/<TICKER>/:
//   meta.json        CIK, 10-K (Datum, Link), Kandidaten für die Satzung
//   10k.txt          Volltext des 10-K
//   charter.txt      Volltext der Satzung (falls gefunden), charter-source.json mit Link
//   charter-weitere-N.txt  weitere Satzungsdokumente (meist Änderungsurkunden)
//   slices.md        Textausschnitte für A2 und B3 (hier fängt die Prüfung an)
//   fetch-log.txt    was nicht geklappt hat
// Es werden keine Geheimwörter gebraucht und nichts in die Datenbank geschrieben.

import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { findCik, pickLatest10K, filingBaseUrl, findCharterLinks, htmlToText, buildSlicesMarkdown, decodeBytes, unwrapParagraphs, isHardWrapped } from "./lib/review.mjs";

const UA = process.env.SEC_USER_AGENT || "";
const args = process.argv.slice(2);
const force = args.includes("--force");
const tickers = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
const OUT = "review-work";

if (!tickers.length) {
  console.error('Aufruf: node scripts/sec-fetch.mjs AAPL MSFT [--force]');
  process.exit(1);
}
if (!/@/.test(UA)) {
  console.error('Die Umgebungsvariable SEC_USER_AGENT fehlt oder enthält keine E-Mail-Adresse.');
  console.error('Setze sie zuerst im selben Terminal-Fenster, zum Beispiel:');
  console.error('  export SEC_USER_AGENT="Tazkiyah Vorname Nachname deine@mail.de"');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

async function get(url, asJson = false) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const wait = Math.max(0, 250 - (Date.now() - last));
    if (wait) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
    if (res.ok) {
      if (asJson) return res.json();
      return decodeBytes(await res.arrayBuffer(), res.headers.get("content-type") || "");
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} bei ${url}`);
  }
}

const exists = (p) => access(p).then(() => true, () => false);

async function processTicker(t, tickersJson) {
  const dir = path.join(OUT, t);
  if (!force && (await exists(path.join(dir, "meta.json")))) return { ticker: t, status: "schon vorhanden (mit --force neu holen)" };
  await mkdir(dir, { recursive: true });
  const log = [];
  const meta = { ticker: t, fetchedAt: new Date().toISOString() };

  const hit = findCik(tickersJson, t);
  if (!hit) throw new Error(`Ticker ${t} steht nicht in company_tickers.json der SEC`);
  meta.cik = hit.cik;
  meta.name = hit.name;

  const subs = await get(`https://data.sec.gov/submissions/CIK${hit.cik}.json`, true);
  const k = pickLatest10K(subs);
  if (!k) throw new Error("Kein 10-K unter den jüngsten Einreichungen (ausländische Emittenten reichen 20-F ein)");
  const base = filingBaseUrl(hit.cik, k.accessionNoDashes);
  meta.tenK = { ...k, url: base + k.primaryDocument };

  const html = await get(meta.tenK.url);
  const tenK = htmlToText(html);
  await writeFile(path.join(dir, "10k.txt"), tenK);

  const candidates = findCharterLinks(html, base);
  meta.charterCandidates = candidates;
  if (!candidates.length) log.push("Im Exhibit-Index des 10-K wurde keine Zeile zur Satzung gefunden.");
  // Alle Kandidaten (höchstens fünf) holen: der beste ist die Satzung, die übrigen meist Änderungsurkunden
  let charter = null;
  const others = [];
  meta.charterDocs = [];
  for (const c of candidates.slice(0, 5)) {
    try {
      const raw = await get(c.href);
      let text = htmlToText(raw);
      if (isHardWrapped(raw)) text = unwrapParagraphs(text); // alte Satzungen: harte Zeilenumbrüche zu Absätzen
      if (text.length < 300) {
        log.push(`Satzungsdokument zu kurz (${text.length} Zeichen): ${c.href}`);
        continue;
      }
      if (!charter) {
        charter = { url: c.href, label: c.label, text };
        meta.charterDocs.push({ file: "charter.txt", url: c.href, label: c.label, chars: text.length, role: "satzung" });
      } else {
        const file = `charter-weitere-${others.length + 1}.txt`;
        await writeFile(path.join(dir, file), text);
        others.push({ file, url: c.href, label: c.label, text });
        meta.charterDocs.push({ file, url: c.href, label: c.label, chars: text.length, role: "weiteres" });
      }
    } catch (e) {
      log.push(`Satzungsdokument nicht abrufbar: ${e.message}`);
    }
  }
  if (charter) {
    await writeFile(path.join(dir, "charter.txt"), charter.text);
    await writeFile(path.join(dir, "charter-source.json"), JSON.stringify({ url: charter.url, label: charter.label }, null, 2));
  }
  await writeFile(path.join(dir, "slices.md"), buildSlicesMarkdown({ ticker: t, meta, tenK, charter, others }));
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  await writeFile(path.join(dir, "fetch-log.txt"), log.join("\n") + (log.length ? "\n" : ""));
  return {
    ticker: t,
    status: "ok",
    tenK: `${meta.tenK.filingDate} (Berichtsjahr bis ${meta.tenK.reportDate})`,
    satzung: charter ? `gefunden${others.length ? `, ${others.length} weitere Dokument(e)` : ""}` : "NICHT gefunden",
    zeichen: tenK.length,
  };
}

const tickersJson = await get("https://www.sec.gov/files/company_tickers.json", true);
const rows = [];
for (const t of tickers) {
  process.stdout.write(`${t} … `);
  try {
    const r = await processTicker(t, tickersJson);
    rows.push(r);
    console.log(r.status);
  } catch (e) {
    rows.push({ ticker: t, status: `FEHLER: ${e.message}` });
    console.log(`FEHLER: ${e.message}`);
  }
}
console.log("\nZusammenfassung:");
for (const r of rows) console.log(`- ${r.ticker}: ${r.status}${r.tenK ? `, 10-K ${r.tenK}, Satzung ${r.satzung}, ${r.zeichen} Zeichen` : ""}`);
console.log(`\nDateien liegen in ${OUT}/<TICKER>/ (slices.md ist der Einstieg).`);
