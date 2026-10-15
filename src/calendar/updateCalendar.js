// src/calendar/updateCalendar.js
//
// Abruf der Termine und Berichte von SEC EDGAR und Speichern in der Tabelle company_calendar
// (supabase_company_calendar.sql). Genutzt vom Cron (api/update-calendar.js) und vom lokalen Skript
// (scripts/calendar-refresh.mjs). Keine Halal-Daten.
//
// Je Titel: 1 Abruf (submissions). Dazu höchstens 1 Abruf für das Proxy Statement (nur wenn dessen
// reportDate kein Versammlungsdatum ist und die DEF 14A neu ist) und höchstens 2 Abrufe für mögliche
// Ankündigungen der Quartalszahlen (8-K, Item 7.01/8.01; jede 8-K nur einmal, siehe checked_accessions).
//
// Reihenfolge: zuerst die Tazkiyah 30 (wenn älter als 20 Stunden), dann alle übrigen Aktien, die am
// längsten nicht abgerufen wurden. ETFs haben keine SEC-Einreichungen und werden übersprungen.

import {
  addDays,
  announcedEarningsDate,
  announcementCandidates,
  deDate,
  annualMeeting,
  earningsReleases,
  estimateNextEarnings,
  filingsFromSubmissions,
  latestReports,
} from "./secCalendar.js";
import { buildTickerIndex, lookupCik } from "../screening/providers/sec.js";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_URL = (cik) => `https://data.sec.gov/submissions/CIK${cik}.json`;
const MAX_PER_SECOND = 8;
const HOUR = 3600000;

/** Abrufe bei der SEC: gedrosselt (8 je Sekunde), mit User-Agent (Pflicht laut SEC). */
export function createSecFetcher({ userAgent, fetchImpl = fetch, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 15000 }) {
  if (!userAgent || !/@/.test(userAgent)) throw new Error("SEC_USER_AGENT fehlt oder enthält keine E-Mail-Adresse");
  let nextSlot = 0;
  let calls = 0;
  async function get(url) {
    const wait = Math.max(0, nextSlot - Date.now());
    nextSlot = Math.max(Date.now(), nextSlot) + Math.ceil(1000 / MAX_PER_SECOND);
    if (wait) await sleepImpl(wait);
    calls++;
    const res = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "*/*" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`SEC ${res.status} bei ${url.replace(/^https:\/\/[^/]+/, "")}`);
    return res;
  }
  return {
    getJson: async (url) => (await get(url)).json(),
    getText: async (url) => (await get(url)).text(),
    getCallCount: () => calls,
  };
}

/** Welche Titel sind dran? Tazkiyah 30 zuerst (älter als 20 h), dann die am längsten nicht abgerufenen. */
export function dueSecurities(securities, calendarById, tazkiyah30, now, { tickers = null, limit = 60 } = {}) {
  const t30 = new Set(tazkiyah30);
  const stocks = securities.filter((s) => s.asset_type === "stock" && s.active !== false && (!tickers || tickers.includes(s.ticker)));
  const age = (s) => {
    const f = calendarById.get(s.id)?.fetched_at;
    return f ? now.getTime() - Date.parse(f) : Infinity;
  };
  const first = stocks.filter((s) => t30.has(s.ticker) && (tickers || age(s) > 20 * HOUR));
  const rest = stocks.filter((s) => !first.includes(s)).filter((s) => tickers || age(s) > 20 * HOUR).sort((a, b) => age(b) - age(a));
  return [...first, ...rest].slice(0, limit);
}

/** Termine und Berichte eines Titels (Abruf + Auswertung). prev: bisherige Zeile aus company_calendar. */
export async function calendarEntryFor({ security, cik, sec, prev = null, today }) {
  const filings = filingsFromSubmissions(await sec.getJson(SUBMISSIONS_URL(cik)), cik);

  // Hauptversammlung; Proxy-Text nur, wenn nötig und die DEF 14A neu ist
  const proxy = filings.find((f) => f.form === "DEF 14A");
  const proxyHasDate = proxy?.reportDate && proxy.reportDate > proxy.filed;
  let proxyText = null;
  if (proxy && !proxyHasDate && proxy.accession !== prev?.hv_accession) {
    try {
      proxyText = await sec.getText(proxy.url);
    } catch {
      proxyText = null; // nächster Lauf versucht es erneut (hv_accession bleibt alt)
    }
  }
  let meeting = annualMeeting(filings, today, proxyText);
  if (meeting && !meeting.date && prev?.hv_date && prev.hv_accession === proxy?.accession) {
    // Datum wurde früher aus demselben Proxy Statement gelesen
    meeting = { ...meeting, date: prev.hv_date, status: prev.hv_date < today ? "vergangen" : "kommend", note: prev.hv_note };
  }

  // Quartalszahlen: voraussichtlich aus dem Vorjahr, bestätigt durch Ankündigung in einer 8-K
  let earnings = estimateNextEarnings(filings, today);
  const checked = new Set(prev?.checked_accessions || []);
  let tries = 0;
  for (const f of announcementCandidates(filings, today)) {
    if (checked.has(f.accession) || tries >= 2) continue;
    tries++;
    let text;
    try {
      text = await sec.getText(f.url);
    } catch {
      continue;
    }
    checked.add(f.accession);
    const date = announcedEarningsDate(text, f.filed);
    if (date && date >= today) {
      earnings = { date, status: "bestaetigt", url: f.url, note: `angekündigt in einer Unternehmensmeldung (8-K) vom ${deDate(f.filed)}` };
      break;
    }
  }
  // Früher bestätigter Termin bleibt bestätigt, bis er vorbei ist oder die Zahlen erschienen sind
  if (earnings?.status !== "bestaetigt" && prev?.next_earnings_status === "bestaetigt" && prev.next_earnings_date >= today) {
    const released = earningsReleases(filings).some((r) => r.date >= addDays(prev.next_earnings_date, -5));
    if (!released) earnings = { date: prev.next_earnings_date, status: "bestaetigt", url: prev.next_earnings_url, note: prev.next_earnings_note };
  }

  return {
    security_id: security.id,
    ticker: security.ticker,
    cik,
    filings: latestReports(filings),
    next_earnings_date: earnings?.date ?? null,
    next_earnings_status: earnings?.status ?? null,
    next_earnings_url: earnings?.url ?? null,
    next_earnings_note: earnings?.note ?? null,
    hv_date: meeting?.date ?? null,
    hv_status: meeting?.status ?? null,
    hv_url: meeting?.url ?? null,
    hv_accession: proxyText || proxyHasDate || !proxy ? proxy?.accession ?? null : prev?.hv_accession ?? null,
    hv_note: meeting?.note ?? null,
    checked_accessions: [...checked].slice(-50),
    error: null,
  };
}

/**
 * Ein Lauf. repo: { loadSecurities, loadTazkiyah30, loadCalendar, saveCalendar(row) }.
 * Gibt eine Zusammenfassung zurück (keine Schlüssel, keine Rohdaten).
 */
export async function runCalendarUpdate({ repo, sec, now = new Date(), tickers = null, limit = 60, deadlineMs = Infinity, dryRun = false }) {
  const startedAt = Date.now();
  const today = now.toISOString().slice(0, 10);
  const [securities, tazkiyah30, calendar] = await Promise.all([repo.loadSecurities(), repo.loadTazkiyah30(), repo.loadCalendar()]);
  const calendarById = new Map(calendar.map((r) => [r.security_id, r]));
  const due = dueSecurities(securities, calendarById, tazkiyah30, now, { tickers, limit });
  const index = buildTickerIndex(await sec.getJson(TICKERS_URL));

  const summary = { due: due.length, updated: [], errors: [], noCik: [], stoppedEarly: false };
  for (const s of due) {
    if (Date.now() - startedAt > deadlineMs) {
      summary.stoppedEarly = true;
      break;
    }
    const cik = lookupCik(index, s.ticker);
    const fetchedAt = new Date().toISOString();
    if (!cik) {
      summary.noCik.push(s.ticker);
      if (!dryRun) await repo.saveCalendar({ security_id: s.id, ticker: s.ticker, fetched_at: fetchedAt, error: "Ticker bei der SEC nicht gefunden" });
      continue;
    }
    try {
      const row = await calendarEntryFor({ security: s, cik, sec, prev: calendarById.get(s.id), today });
      if (!dryRun) await repo.saveCalendar({ ...row, fetched_at: fetchedAt });
      summary.updated.push(s.ticker);
    } catch (err) {
      summary.errors.push(`${s.ticker}: ${String(err?.message || err).slice(0, 160)}`);
      if (!dryRun) await repo.saveCalendar({ security_id: s.id, ticker: s.ticker, fetched_at: fetchedAt, error: String(err?.message || err).slice(0, 300) });
    }
  }
  summary.secCalls = sec.getCallCount?.() ?? null;
  return summary;
}

/** Repo auf Supabase (supabase-js, Service-Role). */
export function createCalendarRepo(db) {
  const all = async (build) => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  };
  return {
    loadSecurities: () => all(() => db.from("securities").select("id,ticker,asset_type,active").order("ticker")),
    async loadTazkiyah30() {
      const { data, error } = await db.from("tazkiyah30").select("ticker");
      return error ? [] : (data || []).map((r) => r.ticker);
    },
    loadCalendar: () =>
      all(() =>
        db
          .from("company_calendar")
          .select("security_id,fetched_at,hv_accession,hv_date,hv_note,checked_accessions,next_earnings_date,next_earnings_status,next_earnings_url,next_earnings_note")
          .order("security_id")
      ),
    async saveCalendar(row) {
      const { error } = await db.from("company_calendar").upsert(row, { onConflict: "security_id" });
      if (error) throw new Error(error.message);
    },
  };
}
