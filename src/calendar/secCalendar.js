// src/calendar/secCalendar.js
//
// Termine und Berichte je Aktie, nur aus SEC EDGAR (amtlich, kostenlos, keine Lizenzfrage).
// Keine Halal-Daten. Reine Auswertung ohne Netzwerk (testbar); Abruf und Speichern: updateCalendar.js.
//
// Quelle: submissions-JSON der SEC (data.sec.gov/submissions/CIK##########.json), Feld filings.recent
// mit form, filingDate, reportDate, items (bei 8-K die Items, z. B. "2.02,9.01") und primaryDocument.
//
//   Berichte:       die letzten 10-K, 10-Q und 8-K (deutsch beschriftet) mit direktem Link.
//   Hauptversammlung: aktuellste DEF 14A. Ihr reportDate ist bei den meisten Unternehmen das Datum der
//                   Versammlung (liegt nach dem Einreichungsdatum); sonst wird das Datum aus dem Text des
//                   Proxy Statements gelesen. Ein 8-K mit Item 5.07 (Abstimmungsergebnisse) bestätigt eine
//                   vergangene Versammlung. Liegt das Datum vor heute: „letzte HV“.
//   Quartalszahlen: 8-K mit Item 2.02 (Results of Operations) = Tag der Veröffentlichung. Der nächste
//                   Termin wird aus dem Vorjahresmuster abgeleitet (gleiches Quartal + 364 Tage, gleicher
//                   Wochentag; ohne Vorjahr: letzte Veröffentlichung + 91 Tage) und als „voraussichtlich“
//                   gekennzeichnet. Kündigt eine 8-K (Item 7.01/8.01)
//                   den Termin an, gilt er als „bestätigt“.

export const REPORT_COUNT = 8;
const DAY = 86400000;

const REPORT_FORMS = {
  "10-K": "Geschäftsbericht",
  "10-K/A": "Geschäftsbericht (Berichtigung)",
  "10-Q": "Quartalsbericht",
  "10-Q/A": "Quartalsbericht (Berichtigung)",
  "8-K": "Unternehmensmeldung",
  "8-K/A": "Unternehmensmeldung (Berichtigung)",
};

// Inhalt einer 8-K nach Items (das wichtigste zuerst); 9.01 (Anlagen) wird nicht genannt
const ITEM_TEXT = [
  ["2.02", "Quartalszahlen"],
  ["5.07", "Ergebnisse der Hauptversammlung"],
  ["2.01", "Kauf oder Verkauf von Unternehmensteilen"],
  ["1.01", "Wesentlicher Vertrag"],
  ["2.03", "Finanzierung"],
  ["5.02", "Personalien in Vorstand oder Aufsichtsrat"],
  ["5.03", "Satzungsänderung"],
  ["7.01", "Mitteilung an Investoren"],
  ["8.01", "Sonstige Mitteilung"],
];

/** "2026-09-30" → "30.09.2026" (für die Hinweise, die auf der Website stehen) */
export const deDate = (iso) => (iso ? iso.split("-").reverse().join(".") : "");

export const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const hasItem = (f, item) => String(f.items || "").split(",").map((s) => s.trim()).includes(item);

export function documentUrl(cik, accession, primaryDocument) {
  const cikInt = String(Number(String(cik).replace(/\D/g, "")));
  const folder = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${String(accession).replace(/-/g, "")}`;
  return primaryDocument ? `${folder}/${primaryDocument}` : `${folder}/${accession}-index.htm`;
}

/** submissions → alle Einreichungen (neueste zuerst) mit Link. */
export function filingsFromSubmissions(sub, cik) {
  const r = sub?.filings?.recent;
  if (!r?.accessionNumber) return [];
  return r.accessionNumber
    .map((accession, i) => ({
      accession,
      form: r.form?.[i] ?? null,
      filed: r.filingDate?.[i] ?? null,
      reportDate: r.reportDate?.[i] || null,
      items: r.items?.[i] || "",
      url: documentUrl(cik, accession, r.primaryDocument?.[i]),
    }))
    .filter((f) => f.form && f.filed)
    .sort((a, b) => (a.filed < b.filed ? 1 : a.filed > b.filed ? -1 : 0));
}

/** Deutsche Beschriftung einer Einreichung, z. B. „Unternehmensmeldung · Quartalszahlen“. */
export function reportLabel(f) {
  const base = REPORT_FORMS[f.form];
  if (!base) return null;
  if (!f.form.startsWith("8-K")) return base;
  const topic = ITEM_TEXT.find(([item]) => hasItem(f, item));
  return topic ? `${base} · ${topic[1]}` : base;
}

/** Die letzten Berichte (10-K, 10-Q, 8-K) für die Aktienseite. */
export function latestReports(filings, count = REPORT_COUNT) {
  return filings
    .filter((f) => REPORT_FORMS[f.form])
    .slice(0, count)
    .map((f) => ({ form: f.form, label: reportLabel(f), filed: f.filed, reportDate: f.reportDate, url: f.url }));
}

// ---------------------------------------------------------------- Hauptversammlung

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE_RE = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi");

function toIso(month, day, year) {
  const m = MONTHS.indexOf(month.toLowerCase()) + 1;
  const d = Number(day);
  if (!m || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** HTML → Text mit einfachen Leerzeichen (für die Suche nach Datumsangaben). */
export function plainText(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/\s+/g, " ");
}

/**
 * Datum der Hauptversammlung aus dem Text eines Proxy Statements: erstes Datum höchstens 400 Zeichen nach
 * „Annual Meeting“, das zwischen Einreichung und 150 Tagen danach liegt. null, wenn nichts passt.
 */
export function meetingDateFromProxy(text, filed) {
  const t = plainText(text);
  const re = /annual meeting of (share|stock)holders|annual general meeting|annual meeting/gi;
  let m;
  while ((m = re.exec(t))) {
    const window = t.slice(m.index, m.index + 400);
    for (const d of window.matchAll(DATE_RE)) {
      const iso = toIso(d[1], d[2], d[3]);
      if (iso && diffDays(iso, filed) >= 0 && diffDays(iso, filed) <= 150) return iso;
    }
  }
  return null;
}

/**
 * Hauptversammlung aus den Einreichungen. proxyText: Text der aktuellsten DEF 14A (nur nötig, wenn ihr
 * reportDate kein Versammlungsdatum ist; sonst null). Ergebnis: { date, status, url, accession, note } oder null.
 */
export function annualMeeting(filings, today, proxyText = null) {
  const proxy = filings.find((f) => f.form === "DEF 14A");
  const voted = filings.find((f) => f.form.startsWith("8-K") && hasItem(f, "5.07"));
  if (!proxy && !voted) return null;
  let date = null;
  let note = null;
  if (proxy?.reportDate && diffDays(proxy.reportDate, proxy.filed) > 0) {
    date = proxy.reportDate;
    note = "Datum laut Proxy Statement (DEF 14A)";
  } else if (proxy && proxyText) {
    date = meetingDateFromProxy(proxyText, proxy.filed);
    if (date) note = "Datum aus dem Text des Proxy Statements (DEF 14A)";
  }
  // Abstimmungsergebnis nach dem Proxy Statement: Versammlung hat stattgefunden (Datum = reportDate der 8-K)
  if (voted?.reportDate && (!proxy || voted.filed >= proxy.filed)) {
    if (!date || date < voted.reportDate || diffDays(date, voted.reportDate) > 7) date = voted.reportDate;
    note = "Abstimmungsergebnisse gemeldet (8-K, Item 5.07)";
  }
  // Link immer auf das Proxy Statement (DEF 14A), sonst auf die 8-K mit den Abstimmungsergebnissen
  const url = proxy?.url ?? voted.url;
  if (!date) return { date: null, status: null, url, accession: proxy?.accession ?? null, note: "Datum nicht ermittelbar" };
  return { date, status: date < today ? "vergangen" : "kommend", url, accession: proxy?.accession ?? null, note };
}

// ---------------------------------------------------------------- Quartalszahlen

/** Tage der Veröffentlichung der Quartalszahlen (8-K, Item 2.02), neueste zuerst. */
export function earningsReleases(filings) {
  return filings
    .filter((f) => f.form.startsWith("8-K") && hasItem(f, "2.02"))
    .map((f) => ({ date: f.reportDate || f.filed, url: f.url, withPressRelease: hasItem(f, "9.01") }));
}

/**
 * Nächster voraussichtlicher Termin: Veröffentlichung im gleichen Quartal des Vorjahres + 364 Tage
 * (gleicher Wochentag). Grundlage sind 8-K mit Item 2.02 und Pressemitteilung als Anlage (9.01); manche
 * Unternehmen melden zusätzlich vorläufige Zahlen ohne Anlage (z. B. Regeneron), die zählen dann nicht.
 * Ohne 8-K mit Item 2.02: Einreichung von 10-Q/10-K + 364 Tage.
 * Ein Kandidat entfällt, wenn höchstens 25 Tage vor oder nach ihm schon Zahlen erschienen sind.
 */
export function estimateNextEarnings(filings, today) {
  const all = earningsReleases(filings);
  const recent = (list) => list.filter((b) => diffDays(today, b.date) <= 400);
  const withPr = all.filter((r) => r.withPressRelease);
  let basis = recent(withPr).length >= 2 ? withPr : all;
  let source = "8-K";
  if (!recent(basis).length) {
    basis = filings.filter((f) => ["10-Q", "10-K"].includes(f.form)).map((f) => ({ date: f.filed, url: f.url }));
    source = "10-Q/10-K";
  }
  const candidates = recent(basis)
    .map((b) => ({ date: addDays(b.date, 364), from: b.date }))
    .filter((c) => !basis.some((r) => r.date !== c.from && Math.abs(diffDays(r.date, c.date)) <= 25))
    .filter((c) => diffDays(c.date, today) >= -10)
    .sort((x, y) => (x.date < y.date ? -1 : 1));
  const what = source === "8-K" ? "Quartalszahlen" : "Quartals- bzw. Geschäftsbericht";
  const next = candidates[0];
  // Kein Vorjahresquartal (z. B. neue Holding oder Abspaltung mit eigener SEC-Nummer): Quartalsrhythmus,
  // letzte Veröffentlichung + 91 Tage (so oft, bis der Termin nicht mehr zurückliegt)
  const latest = recent(basis)[0];
  if ((!next || diffDays(next.date, today) > 120) && latest) {
    let date = addDays(latest.date, 91);
    while (diffDays(date, today) < -10) date = addDays(date, 91);
    if (!next || date < next.date) {
      return { date, status: "voraussichtlich", url: null, note: `abgeleitet aus dem Quartalsrhythmus (${what} am ${deDate(latest.date)} + 91 Tage)` };
    }
  }
  if (!next) return null;
  return { date: next.date, status: "voraussichtlich", url: null, note: `abgeleitet aus dem Vorjahr (${what} am ${deDate(next.from)})` };
}

/**
 * Ankündigung des Termins in einer 8-K (Item 7.01/8.01): Datum, an dem die Zahlen veröffentlicht werden.
 * Sucht „results“/„earnings“ zusammen mit „report“/„release“/„announce“/„conference call“ und ein Datum.
 */
export function announcedEarningsDate(text, filed) {
  const t = plainText(text);
  const re = /\b(results|earnings)\b/gi;
  let m;
  while ((m = re.exec(t))) {
    const window = t.slice(Math.max(0, m.index - 250), m.index + 250);
    if (!/(will (report|release|announce|host|hold)|to (report|release|announce)|scheduled)/i.test(window)) continue;
    for (const d of window.matchAll(DATE_RE)) {
      const iso = toIso(d[1], d[2], d[3]);
      if (iso && diffDays(iso, filed) > 0 && diffDays(iso, filed) <= 60) return iso;
    }
  }
  return null;
}

/** 8-Ks, die eine Ankündigung enthalten könnten: Item 7.01/8.01, nach den letzten Quartalszahlen, höchstens 60 Tage alt. */
export function announcementCandidates(filings, today) {
  const lastRelease = earningsReleases(filings)[0]?.date ?? "0000-00-00";
  return filings.filter(
    (f) => f.form === "8-K" && (hasItem(f, "7.01") || hasItem(f, "8.01")) && !hasItem(f, "2.02") && f.filed > lastRelease && diffDays(today, f.filed) <= 60
  );
}

// ---------------------------------------------------------------- Kalender

/** Termine (Quartalszahlen, Hauptversammlung) im Zeitraum [from, to], nach Datum sortiert. */
export function upcomingEvents(rows, from, to) {
  const out = [];
  for (const r of rows) {
    if (r.next_earnings_date && r.next_earnings_date >= from && r.next_earnings_date <= to) {
      out.push({ ticker: r.ticker, date: r.next_earnings_date, kind: "zahlen", status: r.next_earnings_status, url: r.next_earnings_url });
    }
    if (r.hv_date && r.hv_date >= from && r.hv_date <= to) {
      out.push({ ticker: r.ticker, date: r.hv_date, kind: "hv", status: null, url: r.hv_url });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ticker.localeCompare(b.ticker)));
}
