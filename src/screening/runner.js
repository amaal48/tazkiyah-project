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
//      → Finanzdaten holen (7 Abrufe je Titel), rechnen, speichern.
//      Begrenzt durch das Tagesbudget an API-Abrufen.
//   2. Aktien, bei denen sich seit dem letzten Lauf manuelle Prüfungen,
//      Stammdaten, Engine- oder Parameterversion geändert haben
//      → aus den gespeicherten Daten neu rechnen (0 Abrufe).
//   3. ETFs → aus Holdings und manuellen Prüfungen rechnen (0 Abrufe).
//   4. Universum: deutsche Handelsplätze per ISIN prüfen (OpenFIGI).
// Ein neues Ergebnis wird nur gespeichert, wenn es sich vom letzten
// unterscheidet — die Historie enthält also nur echte Änderungen.

import { createHash } from "node:crypto";
import { screenSecurity, ENGINE_VERSION } from "./engine.js";
import { PARAMETERS_VERSION } from "./parameters.js";

export const CALLS_PER_TITLE = 7;
const DAY = 86400000;
const REFETCH_MIN_DAYS = 7; // frühestens nach 7 Tagen erneut abrufen
const FILING_LAG_DAYS = 45; // neues Quartal ca. 45 Tage nach Quartalsende veröffentlicht
const UNIVERSE_RECHECK_DAYS = 90;

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
  const lastFetch = Math.max(
    run?.inputs?.fetchedAt ? Date.parse(run.inputs.fetchedAt) : 0,
    security.data_fetched_at ? Date.parse(security.data_fetched_at) : 0
  );
  if (lastFetch && now - lastFetch < REFETCH_MIN_DAYS * DAY) return false;
  if (!run || !run.inputs) return true;
  if (!run.quarter_period_end) return true;
  // Nächstes Quartal endet 3 Monate später und wird ca. 45 Tage danach veröffentlicht.
  const expected = addMonths(run.quarter_period_end, 3).getTime() + FILING_LAG_DAYS * DAY;
  return now >= expected;
}

/** Muss aus gespeicherten Daten neu gerechnet werden (ohne API-Abruf)? */
export function needsRescreen(security, run, lastReviewAt) {
  if (!run) return false;
  if (run.engine_version !== ENGINE_VERSION || run.parameters_version !== PARAMETERS_VERSION) return true;
  const runAt = Date.parse(run.run_at);
  if (lastReviewAt && Date.parse(lastReviewAt) > runAt) return true;
  if (security.updated_at && Date.parse(security.updated_at) > runAt) return true;
  return false;
}

export function toEngineSecurity(s) {
  return {
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

export async function runScreening({
  repo,
  provider,
  venues = null,
  now = new Date(),
  dailyCallBudget = 200,
  limit = Infinity,
  timeBudgetMs = 45000,
  dryRun = false,
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
    pending: { fetch: 0 },
    results: dryRun ? [] : undefined,
  };

  const stocks = state.securities.filter((s) => s.asset_type === "stock");
  const etfs = state.securities.filter((s) => s.asset_type === "etf");

  // Planen: zuerst nie geprüfte, dann älteste Daten zuerst
  const fetchDue = stocks
    .filter((s) => needsFreshData(s, state.currentRuns.get(s.id), nowMs))
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

  async function countCalls(n) {
    summary.callsUsedNow += n;
    if (!dryRun) await repo.addUsage(provider.id, n);
  }

  async function screenAndSave(sec, inputs, holdings = []) {
    const result = screenSecurity({
      security: toEngineSecurity(sec),
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
      await countCalls(1);
      try {
        fx = await provider.getFxToEurSeries({ days: 800 });
      } catch {
        fx = null; // EUR-Beträge bleiben dann leer, Rest läuft weiter
      }
    }
    await mapLimit(toFetch, 3, async (sec) => {
      if (timeLeft() < 8000) {
        summary.stoppedEarly = true;
        return;
      }
      await countCalls(CALLS_PER_TITLE);
      const symbol = sec.provider_symbol || sec.ticker;
      try {
        const [profile, periods] = await Promise.all([provider.getProfile(symbol), provider.getFinancialPeriods(symbol)]);
        if (!profile && !periods.annual) throw new Error("Keine Daten beim Anbieter");
        for (const snap of [periods.annual, ...periods.quarters].filter(Boolean)) {
          if (fx && snap.currency && fx.currency === snap.currency) snap.fxToEurAtPeriodEnd = fxAt(fx.series, snap.periodEnd);
        }
        const inputs = { provider: provider.id, fetchedAt: now.toISOString(), profile, annual: periods.annual, quarters: periods.quarters };
        const patch = { data_fetched_at: now.toISOString(), last_error: null };
        if (profile?.isin && !sec.isin) patch.isin = profile.isin;
        if (!dryRun) await repo.updateSecurity(sec.id, patch);
        Object.assign(sec, patch);
        const { result } = await screenAndSave(sec, inputs);
        summary.fetched.push({ ticker: sec.ticker, status: result.status });
      } catch (err) {
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
    if (!needsRescreen(sec, run, state.lastReviewAt.get(sec.id))) continue;
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
  if (venues && timeLeft() > 5000) {
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
