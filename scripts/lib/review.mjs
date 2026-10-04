// scripts/lib/review.mjs
//
// Reine Hilfsfunktionen für die A2/B3-Vorprüfung (Satzung und Umsatzsegmente).
// Kein Netzwerk, kein Dateizugriff: alles hier ist mit Testdaten prüfbar (review.test.mjs).
//
// Ablauf im Ganzen:
//   sec-fetch.mjs   holt 10-K und Satzung von der SEC und schreibt Textdateien + slices.md
//   (Claude Code)   liest die Dateien und schreibt review-work/<TICKER>/draft.json
//   review-sheet.mjs  erzeugt den Kontrollbogen für die Nutzerin
//   review-to-sql.mjs erzeugt aus bestätigten Entwürfen eine SQL-Datei für manual_reviews

// ------------------------------------------------------------------ Text

const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", sect: "§",
};

export function decodeEntities(t) {
  return String(t)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function safeChar(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

// Ältere EDGAR-Dokumente schreiben Anführungszeichen als &#147; und &#148; (Windows-1252). Als Unicode sind das
// Steuerzeichen (U+0080 bis U+009F); hier werden sie in die richtigen Zeichen zurückübersetzt.
const CP1252 = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ",
  0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›",
  0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

export function fixControlChars(t) {
  return String(t).replace(/[\u0080-\u009f]/g, (c) => CP1252[c.charCodeAt(0)] ?? " ");
}

/** Bytes einer SEC-Datei in Text umwandeln: UTF-8, sonst Windows-1252 (oder der im Header genannte Zeichensatz). */
export function decodeBytes(buf, contentType = "") {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const decode = (label, fatal) => {
    try {
      return new TextDecoder(label, { fatal }).decode(bytes);
    } catch {
      return null;
    }
  };
  const m = /charset=([^;\s]+)/i.exec(contentType);
  const declared = m ? m[1].toLowerCase().replace(/^iso-8859-1$/, "windows-1252") : null;
  if (declared && declared !== "utf-8" && declared !== "utf8") {
    const t = decode(declared, false);
    if (t) return t;
  }
  return decode("utf-8", true) ?? decode("windows-1252", false) ?? "";
}

/** Harte Zeilenumbrüche in reinem Text (z. B. 80-Zeichen-Zeilen älterer Satzungen) zu Absätzen zusammenziehen. */
export function unwrapParagraphs(text) {
  return String(text)
    .replace(/\r/g, "")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/[ \t]*\n[ \t]*/g, " ").replace(/ {2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Ist das Dokument reiner Text mit harten Zeilenumbrüchen (kein HTML-Absatzaufbau oder <pre>)? */
export function isHardWrapped(raw) {
  const s = String(raw);
  return /<pre\b/i.test(s) || !/<\s*(p|div|br|table|tr)\b/i.test(s);
}

/** HTML aus EDGAR (auch Inline-XBRL) in lesbaren Text umwandeln; Tabellenzellen werden mit " | " getrennt. */
export function htmlToText(html) {
  let t = String(html);
  t = t.replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ");
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n");
  t = t.replace(/<\/(td|th)>/gi, " | ");
  t = t.replace(/<[^>]+>/g, "");
  t = fixControlChars(decodeEntities(t));
  t = t.replace(/[ \t\u00a0\u2009\u200b]+/g, " ");
  t = t.replace(/(\s*\|\s*){2,}/g, " | ");
  t = t
    .split("\n")
    .map((l) => l.trim().replace(/^\|\s*/, "").replace(/\s*\|$/, "").trim())
    .join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

// ------------------------------------------------------------------ SEC-Daten

/** Ticker → CIK aus der SEC-Datei company_tickers.json. "BRK.B" und "BRK-B" gelten als gleich. */
export function findCik(tickersJson, ticker) {
  const norm = (x) => String(x).toUpperCase().replace(/\./g, "-");
  const want = norm(ticker);
  const entries = Array.isArray(tickersJson) ? tickersJson : Object.values(tickersJson || {});
  const hit = entries.find((e) => norm(e.ticker) === want);
  if (!hit) return null;
  return { cik: String(hit.cik_str).padStart(10, "0"), name: hit.title };
}

/** Jüngstes 10-K aus der Einreichungsliste (data.sec.gov/submissions). Die Listen sind parallele Arrays. */
export function pickLatest10K(submissions) {
  const r = submissions?.filings?.recent;
  if (!r || !Array.isArray(r.form)) return null;
  let best = null;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== "10-K") continue;
    const item = {
      accession: r.accessionNumber[i],
      accessionNoDashes: String(r.accessionNumber[i]).replace(/-/g, ""),
      filingDate: r.filingDate[i],
      reportDate: r.reportDate?.[i] || null,
      primaryDocument: r.primaryDocument[i],
    };
    if (!best || item.filingDate > best.filingDate) best = item;
  }
  return best;
}

/** 8-K-Meldungen mit Item 5.03 (Änderung der Satzung) nach einem Stichtag, jüngste zuerst. */
export function findLaterCharterChanges(submissions, afterDate) {
  const r = submissions?.filings?.recent;
  if (!r || !Array.isArray(r.form) || !Array.isArray(r.items)) return [];
  const out = [];
  for (let i = 0; i < r.form.length; i++) {
    if (!String(r.form[i]).startsWith("8-K")) continue;
    if (!/(^|,)\s*5\.03\s*(,|$)/.test(String(r.items[i] ?? ""))) continue;
    if (!(r.filingDate[i] > afterDate)) continue;
    out.push({
      accession: r.accessionNumber[i],
      accessionNoDashes: String(r.accessionNumber[i]).replace(/-/g, ""),
      filingDate: r.filingDate[i],
      primaryDocument: r.primaryDocument[i],
    });
  }
  return out.sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1));
}

export function filingBaseUrl(cik, accessionNoDashes) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionNoDashes}/`;
}

const CHARTER_KEY = /(certificate|articles)\s+of\s+(incorporation|formation|organi[sz]ation|amendment)|restated\s+(certificate|articles)|\bcharter\b|declaration\s+of\s+trust|articles\s+of\s+association/i;

/**
 * Sucht im Exhibit-Index des 10-K die Zeilen zur Satzung und liefert ihre Links, beste zuerst.
 * Satzungen werden meist nur per Verweis auf frühere Einreichungen genannt: der Link führt dorthin.
 */
export function findCharterLinks(html, baseUrl) {
  const out = [];
  const seen = new Set();
  for (const row of String(html).split(/<\/tr>/i)) {
    const text = htmlToText(row).replace(/\s+/g, " ").trim();
    if (!text || !CHARTER_KEY.test(text)) continue;
    let score = 0;
    if (/^\(?3[.(]?\s*(0?1|i)\b/i.test(text)) score += 10;
    if (/certificate of incorporation|articles of incorporation/i.test(text)) score += 5;
    if (/restated/i.test(text)) score += 2;
    if (/amend/i.test(text) && !/restated|amended and restated/i.test(text)) score -= 3;
    for (const m of row.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      const href = m[1];
      if (href.startsWith("#") || !/\.(htm|html|txt)(#.*)?$/i.test(href)) continue;
      let abs;
      try {
        abs = new URL(href, baseUrl).href.replace(/#.*$/, "");
      } catch {
        continue;
      }
      if (seen.has(abs)) continue;
      seen.add(abs);
      out.push({ label: text.slice(0, 200), href: abs, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ Textausschnitte

export function findAll(text, re, limit = 50) {
  const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
  const rx = new RegExp(re.source, flags);
  const out = [];
  let m;
  while ((m = rx.exec(text)) && out.length < limit) {
    out.push({ index: m.index, match: m[0] });
    if (m[0].length === 0) rx.lastIndex++;
  }
  return out;
}

function windowAt(text, index, before, after) {
  const from = Math.max(0, index - before);
  return { from, to: Math.min(text.length, index + after), text: text.slice(from, Math.min(text.length, index + after)) };
}

/** Überlappende Fenster zusammenfassen, damit nichts doppelt im Ausschnitt steht. */
function mergeWindows(wins) {
  const sorted = [...wins].sort((a, b) => a.from - b.from);
  const out = [];
  for (const w of sorted) {
    const last = out.at(-1);
    if (last && w.from <= last.to) {
      last.to = Math.max(last.to, w.to);
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

/** Zweckklausel in der Satzung: Fenster um „purpose“ und „any lawful act“. */
export function charterSlices(charterText, { max = 6, before = 300, after = 700 } = {}) {
  const hits = [
    ...findAll(charterText, /purposes?\b/i, 40),
    ...findAll(charterText, /any\s+lawful\s+(act|activity|business|purpose)/i, 10),
  ].slice(0, 50);
  const wins = hits.map((h) => windowAt(charterText, h.index, before, after));
  return mergeWindows(wins)
    .slice(0, max)
    .map((w) => ({ from: w.from, to: w.to, text: charterText.slice(w.from, w.to) }));
}

/** Beschreibung des Geschäfts (Item 1) ohne das Inhaltsverzeichnis. */
export function businessSlice(tenK, length = 6000) {
  const heads = findAll(tenK, /item\s*1\s*[.:\-–—]?\s*business/i, 10);
  for (const h of heads) {
    // Im Inhaltsverzeichnis folgt unmittelbar „Item 1A“ (Verweise im Fließtext stehen weiter weg)
    // (nur Seitenzahl und Trennzeichen dazwischen, kein Text)
    const next = tenK.slice(h.index + h.match.length, h.index + h.match.length + 60);
    if (/^[\s|.\d\-–—]{0,30}item\s*1a/i.test(next)) continue;
    return { from: h.index, to: Math.min(tenK.length, h.index + length), text: tenK.slice(h.index, h.index + length) };
  }
  return null;
}

/** Segmentangaben im Anhang: Treffer in der zweiten Texthälfte, die nach Zahlen aussehen. */
export function segmentSlices(tenK, { max = 3, length = 5000 } = {}) {
  const hits = findAll(tenK, /segment information|segment reporting|reportable segments?|operating segments?/i, 80).filter(
    (h) => h.index > tenK.length * 0.4
  );
  const wins = [];
  for (const h of hits) {
    const w = tenK.slice(h.index, h.index + 3000);
    const numbers = (w.match(/\d[\d,]{2,}/g) || []).length;
    if (numbers >= 8) wins.push({ from: h.index, to: Math.min(tenK.length, h.index + length) });
    if (wins.length >= max * 3) break;
  }
  return mergeWindows(wins)
    .slice(0, max)
    .map((w) => ({ from: w.from, to: w.to, text: tenK.slice(w.from, w.to) }));
}

/**
 * Umsatz nach Produkten, Diensten, Endmärkten oder Segmenten. Nur Stellen mit mehreren Zahlen zählen,
 * und „disaggregation“ nur im Zusammenhang mit Umsatz (sonst landet man bei Steuertabellen).
 */
export function revenueSlices(tenK, { max = 3, length = 3000 } = {}) {
  const hits = findAll(
    tenK,
    /disaggregat\w*\s+of\s+(revenues?|net\s+sales|sales)|revenues?\s+by\s+(end\s+market|market|product|service|type|segment|category)|net\s+sales\s+by\s+(category|product|segment)|segment\s+revenues?/i,
    60
  );
  const wins = [];
  for (const h of hits) {
    const w = tenK.slice(h.index, h.index + length);
    if ((w.match(/\d[\d,]{2,}/g) || []).length >= 5) wins.push({ from: h.index, to: Math.min(tenK.length, h.index + length) });
  }
  return mergeWindows(wins)
    .slice(0, max)
    .map((w) => ({ from: w.from, to: w.to, text: tenK.slice(w.from, w.to) }));
}

/** Kurzfassung eines weiteren Satzungsdokuments (meist Änderungsurkunde): Anfang und Stellen zum Zweck. */
export function amendmentSlices(text, { head = 1200 } = {}) {
  const hits = findAll(text, /purposes?\b|article\s+(iii|3)\b/i, 10);
  const windows = mergeWindows(hits.map((h) => windowAt(text, h.index, 200, 500)))
    .slice(0, 3)
    .map((w) => ({ from: w.from, to: w.to, text: text.slice(w.from, w.to) }));
  return { chars: text.length, head: text.slice(0, head), mentionsPurpose: hits.length > 0, windows };
}

/** Markdown mit allen Ausschnitten; die Zeichenpositionen verweisen auf die Textdateien. */
export function buildSlicesMarkdown({ ticker, meta, tenK, charter, others = [], laterChanges = [] }) {
  const parts = [`# ${ticker}: Textausschnitte für A2 und B3`, "", `10-K: ${meta?.tenK?.url || "(nicht gefunden)"}`, ""];
  parts.push("## A2: Satzung (Zweckklausel)", "");
  if (charter?.text) {
    parts.push(`Quelle: ${charter.url}`, "");
    const wins = charterSlices(charter.text);
    if (!wins.length) parts.push("Kein Treffer für „purpose“ oder „any lawful act“ in der Satzung. Volltext: charter.txt", "");
    wins.forEach((w, i) => parts.push(`### Ausschnitt ${i + 1} (Zeichen ${w.from}–${w.to} in charter.txt)`, "", w.text, ""));
    if (others.length) {
      parts.push("### Weitere Satzungsdokumente (Änderungsurkunden)", "", "Prüfe, ob eines davon den Zweck-Artikel ändert. Wenn du es nicht beurteilen kannst: needsHumanReview.", "");
      others.forEach((o, i) => {
        const a = amendmentSlices(o.text);
        parts.push(`#### ${i + 1}. ${o.label}`, "", `Datei: ${o.file} (${a.chars} Zeichen), Quelle: ${o.url}`, `Erwähnt „purpose“ oder „Article III“: ${a.mentionsPurpose ? "ja" : "nein"}`, "", "Anfang:", "", a.head, "");
        a.windows.forEach((w) => parts.push(`Stelle (Zeichen ${w.from}–${w.to}):`, "", w.text, ""));
      });
    } else {
      parts.push("Keine weiteren Satzungsdokumente gefunden (Änderungsurkunden sind im Exhibit-Index des 10-K nicht verlinkt).", "");
    }
  } else {
    parts.push("Satzung nicht gefunden. Kandidaten stehen in meta.json (charterCandidates). A2 dann `unclear`.", "");
  }
  if (laterChanges.length) {
    parts.push(
      "### ACHTUNG: Satzungsänderungen NACH dem 10-K (8-K, Item 5.03)",
      "",
      "Die oben gezeigte Satzung kann veraltet sein. Lies diese Meldungen und prüfe, ob der Zweck-Artikel berührt wird. Gilt die neuere Satzung, zitiere aus ihr und nenne sie als Quelle. Kannst du es nicht beurteilen: needsHumanReview.",
      ""
    );
    laterChanges.forEach((c, i) => {
      parts.push(`#### ${i + 1}. Eingereicht am ${c.filingDate}`, "", `Datei: ${c.file}, Quelle: ${c.url}`, "");
      const m = /item\s*5\.03/i.exec(c.text || "");
      if (m) parts.push("Text zu Item 5.03:", "", c.text.slice(m.index, m.index + 1200), "");
      if (c.exhibit) {
        parts.push(`Anlage (Satzung bzw. Änderungsurkunde): ${c.exhibit.file}, Quelle: ${c.exhibit.url}`, "");
        const wins = charterSlices(c.exhibit.text, { max: 3 });
        wins.forEach((w) => parts.push(w.text, ""));
      }
    });
  } else if (charter?.text) {
    parts.push("Keine Satzungsänderung nach dem 10-K gemeldet (8-K Item 5.03).", "");
  }
  parts.push("## B3: Geschäftsbeschreibung (Item 1)", "");
  const biz = tenK ? businessSlice(tenK) : null;
  parts.push(biz ? `(Zeichen ${biz.from}–${biz.to} in 10k.txt)\n\n${biz.text}` : "Nicht gefunden. Volltext: 10k.txt", "");
  parts.push("## B3: Segmentangaben im Anhang", "");
  const segs = tenK ? segmentSlices(tenK) : [];
  if (!segs.length) parts.push("Keine passende Stelle gefunden. Volltext durchsuchen: 10k.txt", "");
  segs.forEach((w, i) => parts.push(`### Segmentausschnitt ${i + 1} (Zeichen ${w.from}–${w.to} in 10k.txt)`, "", w.text, ""));
  parts.push("## B3: Umsatz nach Produkten und Diensten", "");
  const revs = tenK ? revenueSlices(tenK) : [];
  if (!revs.length) parts.push("Keine passende Stelle gefunden.", "");
  revs.forEach((w, i) => parts.push(`### Umsatzausschnitt ${i + 1} (Zeichen ${w.from}–${w.to} in 10k.txt)`, "", w.text, ""));
  return parts.join("\n");
}

// ------------------------------------------------------------------ Entwurf prüfen

export const RESULTS = ["pass", "fail", "unclear"];
export const CONFIDENCE = ["high", "medium", "low"];
export const CRITERIA = { A2: "A2", B3: "B3_SEGMENTS" };

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isText = (s) => typeof s === "string" && s.trim().length > 0;

/** Prüft die Form eines Entwurfs. Liefert eine Liste von Problemen, leer = in Ordnung. */
export function validateDraft(d) {
  const problems = [];
  if (!d || typeof d !== "object") return ["Entwurf ist leer oder kein Objekt"];
  if (!isText(d.ticker)) problems.push("ticker fehlt");
  if (!isDate(d.annualPeriodEnd)) problems.push("annualPeriodEnd fehlt oder ist kein Datum (JJJJ-MM-TT)");
  for (const key of Object.keys(CRITERIA)) {
    const c = d[key];
    if (!c) {
      problems.push(`${key} fehlt`);
      continue;
    }
    if (!RESULTS.includes(c.result)) problems.push(`${key}.result muss pass, fail oder unclear sein`);
    if (c.confidence && !CONFIDENCE.includes(c.confidence)) problems.push(`${key}.confidence ungültig`);
    if (c.result === "pass" || c.result === "fail") {
      if (!isText(c.quote)) problems.push(`${key}: ohne wörtliches Zitat kein ${c.result}`);
      else if (c.quote.length > 450) problems.push(`${key}: Zitat zu lang (${c.quote.length} Zeichen, höchstens 450)`);
      else if (!/[.!?;:”"')]\s*$/.test(c.quote.trim()) && !c.quoteIsPartial) problems.push(`${key}: Zitat endet mitten im Satz (kürzen oder vollständig zitieren; bei gewollter Kürzung quoteIsPartial: true)`);
      if (!isText(c.sourceUrl) && !isText(c.sourceNote)) problems.push(`${key}: Quelle (Link oder Fundstelle) fehlt`);
    }
  }
  const b3 = d.B3;
  if (b3?.result === "fail") {
    const by = b3.prohibitedRevenueByPeriod;
    if (!by || typeof by !== "object") {
      problems.push("B3 fail: prohibitedRevenueByPeriod fehlt");
    } else {
      const keys = Object.keys(by);
      const annual = keys.filter((k) => k.startsWith("annual:"));
      const quarters = keys.filter((k) => k.startsWith("quarter:"));
      if (!annual.includes(`annual:${d.annualPeriodEnd}`)) problems.push(`B3 fail: Schlüssel annual:${d.annualPeriodEnd} fehlt`);
      if (quarters.length < 4) problems.push("B3 fail: Beträge für die letzten vier Quartale (quarter:JJJJ-MM-TT) fehlen");
      const total = keys.reduce((sum, k) => {
        const v = by[k];
        if (typeof v === "number") return sum + v;
        if (v && typeof v === "object") return sum + Object.values(v).reduce((a, x) => a + (Number(x) || 0), 0);
        return sum;
      }, 0);
      if (!(total > 0)) problems.push("B3 fail ohne verbotene Beträge ist ein Widerspruch");
    }
  }
  return problems;
}

// ------------------------------------------------------------------ Summenprüfung der Segmente

/**
 * Jede vollständig erfasste Aufteilung (Berichtssegment, Produkt, Endmarkt, geografisch) muss zusammen den
 * Gesamtumsatz ergeben. Stimmen zwei vollständige Aufteilungen auf 1 % überein, ist die Tabelle sehr
 * wahrscheinlich richtig gelesen. status: ok | mismatch | insufficient (weniger als zwei vollständige Aufteilungen).
 */
export function checkSegmentSums(draft, tolerance = 0.01) {
  const segs = draft?.B3?.segments;
  if (!Array.isArray(segs) || !segs.length) return { status: "insufficient", groups: [] };
  const by = {};
  for (const sg of segs) (by[sg.dimension || "unbekannt"] ||= []).push(sg);
  const groups = Object.entries(by)
    .filter(([, items]) => items.length >= 2 && items.every((i) => typeof i.revenue === "number"))
    .map(([dimension, items]) => ({ dimension, sum: items.reduce((a, i) => a + i.revenue, 0) }));
  if (groups.length < 2) return { status: "insufficient", groups };
  const ref = Math.max(...groups.map((g) => Math.abs(g.sum)));
  const deviations = groups.map((g) => ({ dimension: g.dimension, deviation: ref ? Math.abs(g.sum - ref) / ref : 0 }));
  const bad = deviations.filter((d) => d.deviation > tolerance);
  return { status: bad.length ? "mismatch" : "ok", groups, deviations };
}

// ------------------------------------------------------------------ Zitate gegen die Quelle prüfen

/** Für den Vergleich: Anführungszeichen und Striche vereinheitlichen, Leerraum zu einem Leerzeichen. */
export function normalizeForQuote(s) {
  return String(s)
    .replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Steht das Zitat wörtlich in einer der Quellen? Zeilenumbrüche, Leerraum, Anführungszeichen und Striche
 * werden vorher vereinheitlicht, der Wortlaut selbst muss gleich sein. `texts` = { Dateiname: Text }.
 */
export function findQuote(quote, texts) {
  const q = normalizeForQuote(quote);
  if (!q) return { found: false, file: null, files: [] };
  const files = Object.entries(texts)
    .filter(([, text]) => normalizeForQuote(text).includes(q))
    .map(([file]) => file);
  return { found: files.length > 0, file: files[0] ?? null, files };
}

// ------------------------------------------------------------------ SQL

export const sqlString = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);

/**
 * SQL für die bestätigten Teile eines Entwurfs (nur pass/fail, nur wenn confirmed === true).
 * Setzt die Jahresbasis automatisch aus dem letzten Ergebnis der Aktie ein; gibt es noch keins,
 * gilt das Datum aus dem Entwurf. Ein zweites Ausführen fügt nichts doppelt ein.
 */
export function draftToSql(draft, { reviewer, sources = null }) {
  if (!isText(reviewer)) throw new Error("reviewer fehlt");
  const problems = validateDraft(draft);
  const statements = [];
  const skipped = [];
  for (const [key, criterion] of Object.entries(CRITERIA)) {
    const c = draft?.[key];
    if (!c) continue;
    if (c.confirmed !== true) {
      skipped.push(`${draft.ticker} ${key}: nicht bestätigt`);
      continue;
    }
    if (c.result === "unclear") {
      skipped.push(`${draft.ticker} ${key}: unklar, bleibt auf der Grenzfall-Liste`);
      continue;
    }
    const own = problems.filter((p) => p.startsWith(key));
    if (own.length || !["pass", "fail"].includes(c.result)) {
      skipped.push(`${draft.ticker} ${key}: ${own.join("; ") || "ungültiges Ergebnis"}`);
      continue;
    }
    if (key === "B3" && c.result === "pass" && checkSegmentSums(draft).status === "mismatch") {
      skipped.push(`${draft.ticker} B3: Segmentsummen stimmen nicht überein (check-quotes zeigt Einzelheiten)`);
      continue;
    }
    if (sources) {
      const texts = sources[key] || {};
      if (!findQuote(c.quote, texts).found) {
        skipped.push(`${draft.ticker} ${key}: Zitat steht nicht wörtlich in den Quelldateien (check-quotes ausführen)`);
        continue;
      }
    }
    const details = { kiDraft: true, quote: c.quote, reasoning: c.reasoning ?? null, confidence: c.confidence ?? null };
    if (key === "B3" && c.result === "fail") details.prohibitedRevenueByPeriod = c.prohibitedRevenueByPeriod;
    if (key === "B3") details.segments = c.segments ?? null;
    const basis = `coalesce(sc.annual_period_end, ${sqlString(draft.annualPeriodEnd)}::date)`;
    statements.push(
      [
        `-- ${draft.ticker} ${criterion}: ${c.result}`,
        `insert into public.manual_reviews`,
        `  (security_id, criterion, result, details, source_url, source_note, reviewer, basis_annual_period_end)`,
        `select s.id, ${sqlString(criterion)}, ${sqlString(c.result)}, ${sqlString(JSON.stringify(details))}::jsonb,`,
        `       ${sqlString(c.sourceUrl ?? null)}, ${sqlString(c.sourceNote ?? null)}, ${sqlString(reviewer)}, ${basis}`,
        `from public.securities s`,
        `left join public.screening_current sc on sc.security_id = s.id`,
        `where s.ticker = ${sqlString(draft.ticker)}`,
        `  and not exists (select 1 from public.manual_reviews m where m.security_id = s.id and m.criterion = ${sqlString(criterion)}`,
        `                  and m.basis_annual_period_end = ${basis} and m.result = ${sqlString(c.result)}`,
        `                  and m.source_url is not distinct from ${sqlString(c.sourceUrl ?? null)});`,
      ].join("\n")
    );
  }
  return { statements, skipped };
}

/** Kontrollabfrage am Ende der SQL-Datei: zeigt, welche Einträge wirklich in der Tabelle gelandet sind. */
export function verificationSql(tickers) {
  const list = [...new Set(tickers)].map(sqlString).join(", ");
  return [
    "-- Kontrolle: Diese Zeilen müssen für jeden bestätigten Eintrag erscheinen.",
    "-- Fehlt eine Aktie, gibt es ihren Ticker in public.securities nicht (z. B. BRK-B statt BRK.B).",
    "select s.ticker, m.criterion, m.result, m.basis_annual_period_end, m.reviewer, m.reviewed_at",
    "from public.manual_reviews m",
    "join public.securities s on s.id = m.security_id",
    `where s.ticker in (${list || "''"}) and m.reviewed_at > now() - interval '1 day'`,
    "order by s.ticker, m.criterion;",
  ].join("\n");
}

// ------------------------------------------------------------------ Kontrollbogen

/** Markdown-Kontrollbogen: je Aktie Ergebnis, Zitat, Link und Kästchen zum Abhaken. */
export function reviewSheet(drafts) {
  const out = ["# Kontrollbogen A2/B3", "", "Je Aktie: Link öffnen, Zitat im Dokument suchen (Strg+F), Ergebnis bestätigen oder korrigieren.", ""];
  const open = [];
  for (const d of drafts) {
    out.push(`## ${d.ticker}`, "");
    const problems = validateDraft(d);
    if (problems.length) out.push(`**Formfehler im Entwurf:** ${problems.join("; ")}`, "");
    for (const key of Object.keys(CRITERIA)) {
      const c = d[key];
      if (!c) continue;
      out.push(`### ${key}: ${c.result ?? "?"} (Sicherheit: ${c.confidence ?? "?"})`, "");
      if (c.quote) out.push(`> ${String(c.quote).replace(/\n+/g, " ")}`, "");
      out.push(`Quelle: ${c.sourceUrl ?? "–"}${c.sourceNote ? ` (${c.sourceNote})` : ""}`, "");
      if (c.reasoning) out.push(`Begründung: ${c.reasoning}`, "");
      if (key === "B3" && Array.isArray(c.segments) && c.segments.length) {
        out.push("| Segment | Art | Umsatz | Währung | Kategorie | Hinweis |", "| --- | --- | --- | --- | --- | --- |");
        for (const s of c.segments) out.push(`| ${s.name ?? ""} | ${s.dimension ?? ""} | ${s.revenue ?? ""} | ${s.currency ?? ""} | ${s.category ?? "–"} | ${s.note ?? ""} |`);
        out.push("");
      }
      if (c.needsHumanReview || c.result === "unclear") {
        out.push(`**Grenzfall:** ${c.reasonForReview || "unklar"}`, "");
        open.push(`${d.ticker} ${key}: ${c.reasonForReview || "unklar"}`);
      }
      out.push("- [ ] Link geöffnet, Zitat im Dokument gefunden", "- [ ] Ergebnis stimmt (sonst korrigieren)", `- [ ] bestätigt (in draft.json \`${key}.confirmed\` auf true setzen)`, "");
    }
  }
  if (open.length) {
    out.push("## Grenzfall-Liste (separat prüfen)", "", ...open.map((x) => `- ${x}`), "");
  }
  return out.join("\n");
}
