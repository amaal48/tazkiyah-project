// src/screening/runner.js
//
// Steuert einen Screening-Durchlauf (vom Cron api/run-screening.js aufgerufen).
// Kennt weder Supabase noch FMP direkt: Datenbank über `repo`
// (./supabaseRepo.js), Finanzdaten über `provider` (./providers/*), Handels-
// plätze über `venues` (./providers/openfigi.js). Dadurch testbar und
// Anbieter austauschbar.
//
// Ablauf pro Durchlauf:
//   1. Aktien mit fälligen Daten (nie geprüft / neues Quartal zu erwarten)
//      → Finanzdaten holen (8 Abrufe je Titel), rechnen, speichern.
//      Begrenzt durch das Tagesbudget an API-Abrufen.
//   2. Aktien, bei denen sich seit dem letzten Lauf manuelle Prüfungen,
//      Stammdaten, Engine- oder Parameterversion geändert haben
//      → aus den gespeicherten Daten neu rechnen (0 Abrufe).
//   3. ETFs → aus Holdings und manuellen Prüfungen rechnen (0 Abrufe).
//   4. Universum: deutsche Handelsplätze per ISIN prüfen (OpenFIGI).
// Ein neues Ergebnis wird nur gespeichert, wenn es sich vom letzten
// unterscheidet — die Historie enthält also nur echte Änderungen.
//
// Schutz (seit 01.10.2026):
//   - Sperre: Es läuft immer nur ein Durchlauf gleichzeitig (repo.acquireLock).
//     Ein zweiter Aufruf beendet sich sofort.
//   - Budget: Abrufe werden vor jedem Titel in der Datenbank reserviert. Ist
//     das Tagesbudget erreicht, werden keine weiteren Titel abgerufen — auch
//     wenn mehrere Läufe am selben Tag stattfinden.
//   - Tageslimit des Anbieters: Meldet der Anbieter „Limit erreicht“, bricht
//     der Abruf ab. Betroffene Titel werden NICHT als fehlerhaft markiert und
//     beim nächsten Lauf wieder versucht.

import { createHash } from "node:crypto";
import { screenSecurity, ENGINE_VERSION } from "./engine.js";
import { PARAMETERS_VERSION } from "./parameters.js";

// Profil (1) + Bilanz/GuV/Cashflow je Jahr und Quartal (6) + Kursverlauf (1)
export const CALLS_PER_TITLE = 8;
// Stand der Datenaufbereitung im Adapter. Ergebnisse mit älterem Stand werden einmal neu abgerufen,
// auch wenn die Daten jünger als 7 Tage sind (z. B. 30.09.: Ergebnisse ohne Marktkapitalisierung).
// Bei jeder Änderung, die gespeicherte Eingangsdaten unbrauchbar macht, hochzählen.
export const INPUT_DATA_VERSION = 2;
const DAY = 86400000;
const REFETCH_MIN_DAYS = 7; // frühestens nach 7 Tagen erneut abrufen
const FILING_LAG_DAYS = 45; // neues Quartal ca. 45 Tage nach Quartalsende veröffentlicht
const UNIVERSE_RECHECK_DAYS = 90;
const ANNUAL_FILING_LAG_DAYS = 75; // Jahresbericht ca. 60–90 Tage nach Geschäftsjahresende
const LOCK_TTL_SECONDS = 120; // länger als die maximale Laufzeit (60 s)

// ------------------------------------------------------------------ Helfer

// Titel ohne ISIN in der Anbieterdatei werden über Ticker + Land zugeordnet.
// Das eigene Universum enthält bisher nur US-Aktien.
const US_COUNTRY_NAMES = new Set(["united states", "vereinigte staaten", "usa", "us"]);
export function normalizeTicker(t) {
  return String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function fingerprint(result) {
  const { screenedAt: _ignored, ...rest } = result;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function addMonths(iso, months) {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Braucht diese Aktie neue Finanzdaten? */
export function needsFreshData(security, run, now) {
  // Eingangsdaten aus älterer Datenaufbereitung: sofort neu abrufen. Läufe ab Engine 1.2.0 tragen
  // das Feld multiClassIssuer und gelten ohne eigene Versionsnummer als Version 2.
  if (run?.inputs) {
    const version = run.inputs.dataVersion ?? (run.inputs.multiClassIssuer !== undefined ? 2 : 1);
    if (version < INPUT_DATA_VERSION) return true;
  }
  const lastFetch = Math.max(
    run?.inputs?.fetchedAt ? Date.parse(run.inputs.fetchedAt) : 0,
    security.data_fetched_at ? Date.parse(security.data_fetched_at) : 0
  );
  if (lastFetch && now - lastFetch < REFETCH_MIN_DAYS * DAY) return false;
  if (!run || !run.inputs) return true;
  if (!run.quarter_period_end) {
    // Quartale waren im Datentarif gesperrt: erst wieder abrufen, wenn ein neuer
    // Jahresabschluss zu erwarten ist (nach Tarifwechsel per SQL zurücksetzen).
    const annualEnd = run.inputs?.annual?.periodEnd;
    if (run.inputs.quartersAvailable === false && annualEnd) {
      return now >= addMonths(annualEnd, 12).getTime() + ANNUAL_FILING_LAG_DAYS * DAY;
    }
    return true;
  }
  // Nächstes Quartal endet 3 Monate später und wird ca. 45 Tage danach veröffentlicht.
  const expected = addMonths(run.quarter_period_end, 3).getTime() + FILING_LAG_DAYS * DAY;
  return now >= expected;
}

/** Muss aus gespeicherten Daten neu gerechnet werden (ohne API-Abruf)? */
export function needsRescreen(security, run, lastReviewAt, multiClassNow = undefined) {
  if (!run) return false;
  if (run.engine_version !== ENGINE_VERSION || run.parameters_version !== PARAMETERS_VERSION) return true;
  // Ein Schwester-Titel (gleiche Gesellschaft, andere Aktiengattung) ist neu hinzugekommen oder weggefallen
  if (multiClassNow !== undefined && Boolean(run.inputs?.multiClassIssuer) !== multiClassNow) return true;
  const runAt = Date.parse(run.run_at);
  if (lastReviewAt && Date.parse(lastReviewAt) > runAt) return true;
  if (security.updated_at && Date.parse(security.updated_at) > runAt) return true;
  return false;
}

export function toEngineSecurity(s, { multiClassIssuer = false } = {}) {
  return {
    multiClassIssuer,
    ticker: s.ticker,
    isin: s.isin,
    name: s.name,
    assetType: s.asset_type,
    productType: s.product_type,
    shareClass: s.share_class,
    isUcits: s.is_ucits,
    hasKid: s.has_kid,
    germanVenues: s.german_venues || [],
    universeCheckedAt: s.universe_checked_at,
    fundAnnualReportDate: s.fund_annual_report_date,
  };
}

export function toEngineReview(r) {
  return {
    criterion: r.criterion,
    result: r.result,
    details: r.details || {},
    sourceUrl: r.source_url,
    sourceNote: r.source_note,
    reviewer: r.reviewer,
    reviewedAt: r.reviewed_at,
    basisAnnualPeriodEnd: r.basis_annual_period_end,
  };
}

/** EUR-Kurs zum Stichtag (letzter Wert am oder bis 7 Tage vor dem Datum). */
function fxAt(series, periodEnd) {
  if (!series?.length || !periodEnd) return null;
  const hit = series.filter((x) => x.date <= periodEnd).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!hit || Date.parse(periodEnd) - Date.parse(hit.date) > 7 * DAY) return null;
  return hit.eurPerUnit;
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// ------------------------------------------------------------ Hauptfunktion

export async function runScreening(options) {
  const { repo, dryRun = false } = options;
  // Testläufe (dryRun) schreiben nichts und brauchen keine Sperre
  if (dryRun || typeof repo.acquireLock !== "function") return runScreeningUnlocked(options);

  const holder = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const got = await repo.acquireLock(holder, LOCK_TTL_SECONDS);
  if (!got) {
    return { skipped: true, reason: "Ein anderer Screening-Lauf ist noch aktiv; dieser Aufruf wurde übersprungen." };
  }
  try {
    return await runScreeningUnlocked(options);
  } finally {
    await repo.releaseLock(holder).catch(() => {});
  }
}

async function runScreeningUnlocked({
  repo,
  provider,
  venues = null,
  now = new Date(),
  dailyCallBudget = 200,
  limit = Infinity,
  timeBudgetMs = 45000,
  dryRun = false,
  onlyTickers = null, // manueller Lauf: nur diese Ticker abrufen
  force = false, // nur zusammen mit onlyTickers: auch frische Daten neu abrufen
}) {
  const started = Date.now();
  const timeLeft = () => timeBudgetMs - (Date.now() - started);
  const nowMs = now.getTime();

  const state = await repo.loadState({ provider: provider.id, day: now.toISOString().slice(0, 10) });
  const summary = {
    dryRun,
    engineVersion: ENGINE_VERSION,
    parametersVersion: PARAMETERS_VERSION,
    callsUsedBefore: state.usedToday,
    callsUsedNow: 0,
    fetched: [],
    fetchErrors: [],
    rescreened: [],
    unchanged: 0,
    etfs: [],
    universeChecked: 0,
    stoppedEarly: false,
    stoppedReason: null,
    dataNotes: [],
    pending: { fetch: 0 },
    results: dryRun ? [] : undefined,
  };

  const stocks = state.securities.filter((s) => s.asset_type === "stock");

  // Mehrere Aktiengattungen eines Unternehmens im Universum erkennt man an der gleichen CIK
  const cikOf = new Map();
  const cikCount = new Map();
  function setCik(id, cik) {
    const next = cik ? String(cik) : null;
    const old = cikOf.get(id) ?? null;
    if (old === next) return;
    if (old) cikCount.set(old, (cikCount.get(old) || 1) - 1);
    if (next) {
      cikOf.set(id, next);
      cikCount.set(next, (cikCount.get(next) || 0) + 1);
    } else {
      cikOf.delete(id);
    }
  }
  for (const s of stocks) setCik(s.id, state.currentRuns.get(s.id)?.inputs?.profile?.cik);
  const isMultiClass = (id) => {
    const c = cikOf.get(id);
    return Boolean(c && (cikCount.get(c) || 0) > 1);
  };

  const etfs = state.securities.filter((s) => s.asset_type === "etf");

  // Planen: zuerst nie geprüfte, dann älteste Daten zuerst
  const only = onlyTickers?.length ? new Set(onlyTickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean)) : null;
  const candidates = only ? stocks.filter((s) => only.has(String(s.ticker).toUpperCase())) : stocks;
  if (only) {
    const known = new Set(candidates.map((s) => String(s.ticker).toUpperCase()));
    summary.unknownTickers = [...only].filter((t) => !known.has(t));
  }
  const fetchDue = candidates
    .filter((s) => (only && force) || needsFreshData(s, state.currentRuns.get(s.id), nowMs))
    .sort((a, b) => {
      const ra = state.currentRuns.get(a.id);
      const rb = state.currentRuns.get(b.id);
      if (!ra !== !rb) return ra ? 1 : -1;
      return (Date.parse(ra?.inputs?.fetchedAt || 0) || 0) - (Date.parse(rb?.inputs?.fetchedAt || 0) || 0);
    });

  const budgetLeft = Math.max(0, dailyCallBudget - state.usedToday);
  const fxCalls = provider.getFxToEurSeries ? 1 : 0;
  const maxTitles = Math.min(limit, Math.floor(Math.max(0, budgetLeft - fxCalls) / CALLS_PER_TITLE));
  const toFetch = fetchDue.slice(0, maxTitles);
  summary.pending.fetch = fetchDue.length - toFetch.length;

  /**
   * Reserviert Abrufe für einen Titel. Die Datenbank zählt atomar mit, damit
   * auch parallele Läufe das Tagesbudget nicht überschreiten.
   */
  async function reserveCalls(n) {
    if (dryRun) {
      if (state.usedToday + summary.callsUsedNow + n > dailyCallBudget) return false;
      summary.callsUsedNow += n;
      return true;
    }
    const total = await repo.addUsage(provider.id, n);
    if (typeof total === "number" && total > dailyCallBudget) {
      await repo.addUsage(provider.id, -n); // Reservierung zurückgeben
      return false;
    }
    summary.callsUsedNow += n;
    return true;
  }

  let stopFetching = false;
  function stop(reason) {
    if (!stopFetching) {
      stopFetching = true;
      summary.stoppedReason = reason;
    }
  }

  async function screenAndSave(sec, inputsIn, holdings = []) {
    const multi = sec.asset_type === "stock" && isMultiClass(sec.id);
    const inputs = sec.asset_type === "stock" ? { ...(inputsIn || {}), multiClassIssuer: multi } : inputsIn;
    const result = screenSecurity({
      security: toEngineSecurity(sec, { multiClassIssuer: multi }),
      profile: inputs?.profile ?? null,
      annual: inputs?.annual ?? null,
      quarters: inputs?.quarters ?? [],
      manualReviews: (state.reviewsBySecurity.get(sec.id) || []).map(toEngineReview),
      holdings,
      dataProvider: inputs?.provider ?? null,
      now,
    });
    const fp = fingerprint(result);
    const current = state.currentRuns.get(sec.id);
    if (current?.fingerprint === fp) {
      summary.unchanged++;
      return { result, saved: false };
    }
    if (dryRun) {
      summary.results.push({ ticker: sec.ticker, status: result.status, summary: result.summary });
    } else {
      const runId = await repo.saveRun(sec.id, result, inputs, fp);
      state.currentRuns.set(sec.id, { ...current, id: runId, status: result.status, fingerprint: fp, inputs, run_at: now.toISOString() });
      // Jüngste Reinigungsquote sofort verfügbar machen (für ETFs im selben Lauf)
      const latest = (result.purification?.periods || []).find((x) => x.calculable && x.ratePctOfPrice != null);
      if (latest) state.purificationRate.set(sec.id, latest.ratePctOfPrice);
    }
    return { result, saved: true };
  }

  // 1. Neue Daten holen
  if (toFetch.length) {
    let fx = null;
    if (fxCalls) {
      if (!(await reserveCalls(1))) {
        stop("Tagesbudget für API-Abrufe erreicht");
      } else {
        try {
          fx = await provider.getFxToEurSeries({ days: 800 });
        } catch (err) {
          if (err?.kind === "limit") stop("Tageslimit beim Datenanbieter erreicht");
          fx = null; // EUR-Beträge bleiben dann leer, Rest läuft weiter
        }
      }
    }
    await mapLimit(toFetch, 3, async (sec) => {
      if (stopFetching) return;
      if (timeLeft() < 8000) {
        summary.stoppedEarly = true;
        return;
      }
      if (!(await reserveCalls(CALLS_PER_TITLE))) {
        stop("Tagesbudget für API-Abrufe erreicht");
        return;
      }
      const symbol = sec.provider_symbol || sec.ticker;
      try {
        const [profile, periods] = await Promise.all([provider.getProfile(symbol), provider.getFinancialPeriods(symbol)]);
        if (!profile && !periods.annual) throw new Error("Keine Daten beim Anbieter");
        setCik(sec.id, profile?.cik);
        for (const snap of [periods.annual, ...periods.quarters].filter(Boolean)) {
          if (fx && snap.currency && fx.currency === snap.currency) snap.fxToEurAtPeriodEnd = fxAt(fx.series, snap.periodEnd);
        }
        const notes = periods.notes || [];
        for (const n of notes) if (!summary.dataNotes.includes(n)) summary.dataNotes.push(n);
        const inputs = {
          provider: provider.id,
          fetchedAt: now.toISOString(),
          dataVersion: INPUT_DATA_VERSION,
          profile,
          annual: periods.annual,
          quarters: periods.quarters,
          notes,
          quartersAvailable: !notes.some((n) => /Quartalsdaten/.test(n)),
        };
        const patch = { data_fetched_at: now.toISOString(), last_error: null };
        if (profile?.isin && !sec.isin) patch.isin = profile.isin;
        if (!dryRun) await repo.updateSecurity(sec.id, patch);
        Object.assign(sec, patch);
        const { result } = await screenAndSave(sec, inputs);
        summary.fetched.push({ ticker: sec.ticker, status: result.status });
      } catch (err) {
        if (err?.kind === "limit") {
          // Kontingent beim Anbieter erschöpft: kein Fehler des Titels → beim nächsten Lauf erneut
          stop("Tageslimit beim Datenanbieter erreicht");
          summary.limitSkipped = [...(summary.limitSkipped || []), sec.ticker];
          return;
        }
        summary.fetchErrors.push({ ticker: sec.ticker, error: String(err.message || err) });
        if (!dryRun) await repo.updateSecurity(sec.id, { data_fetched_at: now.toISOString(), last_error: String(err.message || err).slice(0, 500) });
      }
    });
  }

  // 2. Aus gespeicherten Daten neu rechnen
  const fetchedIds = new Set(toFetch.map((s) => s.id));
  for (const sec of stocks) {
    if (fetchedIds.has(sec.id) || timeLeft() < 3000) continue;
    const run = state.currentRuns.get(sec.id);
    if (!needsRescreen(sec, run, state.lastReviewAt.get(sec.id), isMultiClass(sec.id))) continue;
    const { result, saved } = await screenAndSave(sec, run.inputs);
    if (saved) summary.rescreened.push({ ticker: sec.ticker, status: result.status });
  }

  // 3. ETFs aus Holdings
  const byIsin = new Map(state.securities.filter((s) => s.isin).map((s) => [s.isin, s]));
  const byUsTicker = new Map(stocks.map((s) => [normalizeTicker(s.ticker), s]));
  const findHolding = (h) =>
    byIsin.get(h.holding_isin) ||
    (h.holding_ticker && US_COUNTRY_NAMES.has((h.holding_country || "").toLowerCase())
      ? byUsTicker.get(normalizeTicker(h.holding_ticker))
      : undefined);
  for (const etf of etfs) {
    if (timeLeft() < 3000) break;
    const holdings = (state.holdingsByEtf.get(etf.id) || []).map((h) => {
      const sec = findHolding(h);
      return {
        isin: h.holding_isin,
        weight: Number(h.weight),
        asOf: h.as_of,
        status: sec ? state.currentRuns.get(sec.id)?.status ?? null : null,
        purificationRate: sec ? state.purificationRate.get(sec.id) ?? null : null,
      };
    });
    const { result } = await screenAndSave(etf, { provider: "intern" }, holdings);
    summary.etfs.push({ ticker: etf.ticker, status: result.status });
  }

  // 4. Universum: deutsche Handelsplätze
  if (venues && !only && timeLeft() > 5000) {
    const due = state.securities
      .filter((s) => s.asset_type === "stock" && s.isin)
      .filter((s) => !s.universe_checked_at || nowMs - Date.parse(s.universe_checked_at) > UNIVERSE_RECHECK_DAYS * DAY)
      .slice(0, venues.maxPerRun ?? 50);
    if (due.length) {
      try {
        const found = await venues.lookup(due.map((s) => s.isin));
        for (const s of due) {
          const v = found.get(s.isin);
          if (v === undefined) continue; // Abfrage für diese ISIN fehlgeschlagen → nächstes Mal
          if (!dryRun) await repo.updateSecurity(s.id, { german_venues: v, universe_checked_at: now.toISOString() });
          summary.universeChecked++;
        }
      } catch (err) {
        summary.universeError = String(err.message || err);
      }
    }
  }

  return summary;
}
