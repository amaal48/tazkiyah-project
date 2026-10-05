// src/components/screening/ScreeningDetail.jsx
//
// Detailseite eines Titels (#/aktie/AAPL): Status, Begründung, alle Prüfungen nach Stufen
// mit Werten, Grenzen, Kennzeichnungen und Quellen, Verlauf der Statuswechsel.
// Reinigung und Zakat folgen in einem späteren Schritt.

import { useEffect, useState } from "react";
import { ETF_STAGE, EXPLANATIONS, FLAG_TEXTS, RESULT_LABELS, STAGES } from "../../screening/explanations.js";
import { loadScreeningDetail, loadStatusHistory, useScreeningList } from "../../lib/screeningData.js";
import { routes } from "../../lib/hashRoute.js";
import StatusBadge from "./StatusBadge.jsx";
import SourceLink from "./SourceLink.jsx";
import {
  BASIS_TEXT,
  H1_STYLE,
  H2_STYLE,
  NOTICE_NO_ADVICE,
  STATUS_TEXT,
  fmtAmount,
  fmtDate,
  fmtLimit,
  fmtNum,
  fmtPct,
  headlineFromCriteria,
  reasonDetails,
  safeUrl,
  shortExplanation,
} from "./format.js";

const RESULT_STYLE = {
  pass: "text-[var(--emerald-soft)]",
  fail: "text-[var(--red-soft)]",
  not_checked: "text-[var(--text-soft)]",
  not_applicable: "text-[var(--muted)]",
};

const RESULT_MARK = { pass: "✓", fail: "✕", not_checked: "–", not_applicable: "·" };

const REVIEW_RESULT = { pass: "bestanden", fail: "nicht bestanden", unclear: "unklar" };

const LEASE_SOURCE = {
  annual_estimate: "Leasing aus dem letzten Jahresabschluss übernommen (Schätzung)",
  manual_10q: "Leasing von Hand aus dem Quartalsbericht übernommen",
};

/** Dezenter Balken mit Grenzmarke. Keine Bewertungsskala, nur Lage zur Grenze. */
function LimitBar({ value, limit, comparator, pass }) {
  const scale = comparator === ">=" ? 100 : Math.max(limit * 2, value * 1.05);
  const w = Math.max(0, Math.min(100, (value / scale) * 100));
  const mark = Math.min(100, (limit / scale) * 100);
  return (
    <div aria-hidden="true" className="relative mt-2 h-1 w-full max-w-sm rounded-full bg-[var(--track)]">
      <div className={"h-full rounded-full " + (pass ? "bg-[var(--emerald)]" : "bg-[var(--red)]")} style={{ width: `${w}%` }} />
      <div className="absolute -top-1 h-3 w-px bg-[var(--text-soft)]" style={{ left: `${mark}%` }} />
    </div>
  );
}

function RatioCheck({ check }) {
  const basis = BASIS_TEXT[check.basis] || "Abschluss";
  const head = `${basis} ${fmtDate(check.periodEnd)}`;
  const bound = check.comparator === ">=" ? "mindestens" : "höchstens";
  const hasValue = typeof check.value === "number";
  const d = check.distanceToLimit;
  let distance = null;
  if (typeof d === "number") {
    if (d >= 0) distance = `Abstand zur Grenze: ${fmtNum(d, 2)} Prozentpunkte`;
    else distance = `Grenze um ${fmtNum(-d, 2)} Prozentpunkte ${check.comparator === ">=" ? "unterschritten" : "überschritten"}`;
  }
  return (
    <li className="py-2">
      <p className="text-sm text-[var(--muted)]">
        {head}
        {check.label && <span className="text-[var(--faint)]"> · {check.label}</span>}
      </p>
      {hasValue ? (
        <>
          <p className="mt-0.5 text-sm">
            <span className={"font-[IBM_Plex_Mono] " + RESULT_STYLE[check.result]}>{fmtPct(check.value)}</span>
            <span className="text-[var(--text-soft)]">
              {" "}
              von {bound} {fmtLimit(check.limit)}
            </span>
            {distance && <span className="text-[var(--muted)]"> · {distance}</span>}
          </p>
          <LimitBar value={check.value} limit={check.limit} comparator={check.comparator} pass={check.result === "pass"} />
        </>
      ) : (
        <p className="mt-0.5 text-sm text-[var(--text-soft)]">{check.reason || RESULT_LABELS[check.result]}</p>
      )}
      {hasValue && check.reason && <p className="mt-1 text-sm text-[var(--text-soft)]">{check.reason}</p>}
      {check.leaseSource && (
        <p className="mt-1 text-sm text-[var(--muted)]">
          {LEASE_SOURCE[check.leaseSource] || "Leasing"}
          {typeof check.leaseAmount === "number" && `: ${fmtAmount(check.leaseAmount)}`}
        </p>
      )}
    </li>
  );
}

function InfoCheck({ check }) {
  // Prüfungen ohne Kennzahl, z. B. Branche (A1) oder Abdeckung (G1)
  if (check.label === "Abdeckung" && typeof check.holdingsCount === "number") {
    return (
      <li className="py-2 text-sm text-[var(--text-soft)]">
        {check.holdingsCount} enthaltene Aktien, davon {check.failedCount ?? 0} nicht konform und {check.uncheckedCount ?? 0} nicht geprüft
        {check.asOf && <span className="text-[var(--muted)]"> · Stand {fmtDate(check.asOf)}</span>}
      </li>
    );
  }
  if (check.value == null || typeof check.value === "object") return null;
  return (
    <li className="py-2 text-sm">
      <span className="text-[var(--muted)]">{check.label}: </span>
      <span className="text-[var(--text-soft)]">{String(check.value)}</span>
    </li>
  );
}

function Review({ review }) {
  if (!review) return null;
  const url = safeUrl(review.sourceUrl);
  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm leading-relaxed text-[var(--text-soft)]">
      <p>
        Manuelle Prüfung{review.reviewedAt && ` vom ${fmtDate(review.reviewedAt)}`}
        {review.result && `: ${REVIEW_RESULT[review.result] || review.result}`}
        {review.reviewer && <span className="text-[var(--muted)]"> · geprüft von {review.reviewer}</span>}
      </p>
      {review.state === "expired" && (
        <p className="mt-1 text-[var(--text)]">Diese Prüfung ist abgelaufen, weil ein neuer Jahresabschluss vorliegt. Sie muss erneut bestätigt werden.</p>
      )}
      {(url || review.sourceNote) && (
        <p className="mt-1 text-[var(--muted)]">
          Quelle:{" "}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline underline-offset-2">
              {review.sourceNote || "Dokument öffnen"}
            </a>
          ) : (
            review.sourceNote
          )}
        </p>
      )}
    </div>
  );
}

function Flags({ flags, criterionId }) {
  const items = (flags || []).filter((f) => FLAG_TEXTS[f]);
  if (!items.length) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((f) => {
        // Bevorzugt auf die Prüfung verlinken, unter der die Kennzeichnung steht
        const target = EXPLANATIONS[criterionId] ? criterionId : FLAG_TEXTS[f].criterion;
        return (
          <li key={f} className="flex items-start gap-2 text-sm leading-relaxed text-[var(--text-soft)]">
            <span aria-hidden="true" className="mt-px text-[var(--gold-soft)]">ⓘ</span>
            <span>
              {FLAG_TEXTS[f].text}{" "}
              <a href={routes.criterion(target)} className="whitespace-nowrap text-[var(--primary)] underline underline-offset-2">
                Erklärung
              </a>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CriterionResult({ c, parameters }) {
  const ratioChecks = (c.checks || []).filter((x) => typeof x.limit === "number");
  const otherChecks = (c.checks || []).filter((x) => typeof x.limit !== "number");
  const explanation = shortExplanation(c.id, parameters);
  return (
    <li id={`pruefung-${c.id.toLowerCase()}`} className="border-t border-[var(--border)] py-5 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={routes.criterion(c.id)} className="text-[15px] text-[var(--text)] hover:underline">
          {c.name}
        </a>
        <span className="font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">{c.id}</span>
        <span className={"ml-auto text-sm " + (RESULT_STYLE[c.result] || "")}>
          <span aria-hidden="true">{RESULT_MARK[c.result]} </span>
          {RESULT_LABELS[c.result] || c.result}
        </span>
      </div>
      {explanation && <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-[var(--text-soft)]">{explanation}</p>}
      <p className="mt-1.5 text-sm">
        <SourceLink source={c.source} criterion={c.id} />
      </p>

      {(ratioChecks.length > 0 || otherChecks.length > 0) && (
        <ul className="mt-2">
          {ratioChecks.map((x, i) => (
            <RatioCheck key={`r${i}`} check={x} />
          ))}
          {otherChecks.map((x, i) => (
            <InfoCheck key={`o${i}`} check={x} />
          ))}
        </ul>
      )}

      {/* Grund in Worten, wenn er nicht schon an einer Kennzahl steht */}
      {c.reason && c.result !== "pass" && !ratioChecks.some((x) => x.reason === c.reason) && (
        <p className="mt-2 text-sm text-[var(--text-soft)]">{c.reason}</p>
      )}

      <Flags flags={c.flags} criterionId={c.id} />
      <Review review={c.review} />
    </li>
  );
}

function groupCriteria(criteria, isEtf) {
  const visible = (criteria || []).filter((c) => c.result !== "disabled");
  const stages = isEtf ? [ETF_STAGE] : STAGES;
  const used = new Set();
  const groups = stages.map((s) => {
    const items = s.criteria.map((id) => visible.find((c) => c.id === id)).filter(Boolean);
    items.forEach((c) => used.add(c.id));
    return { ...s, items };
  });
  const rest = visible.filter((c) => !used.has(c.id));
  if (rest.length) groups.push({ id: "weitere", title: "Weitere Prüfungen", question: "", items: rest });
  return groups.filter((g) => g.items.length);
}

export default function ScreeningDetail({ ticker, onBack, watchlist, onToggleWatchlist, priceSection }) {
  const list = useScreeningList();
  const row = list.byTicker.get(ticker) || null;
  const [detail, setDetail] = useState({ loading: true, error: null, data: null });
  const [history, setHistory] = useState([]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    let cancelled = false;
    setDetail({ loading: true, error: null, data: null });
    loadScreeningDetail(ticker).then(
      (data) => !cancelled && setDetail({ loading: false, error: null, data }),
      (error) => !cancelled && setDetail({ loading: false, error, data: null })
    );
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const securityId = detail.data?.security_id || row?.securityId || null;
  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    loadStatusHistory(securityId).then(
      (h) => !cancelled && setHistory(h),
      () => !cancelled && setHistory([])
    );
    return () => {
      cancelled = true;
    };
  }, [securityId]);

  const result = detail.data?.result || null;
  const name = detail.data?.name || row?.name || ticker;
  const assetType = detail.data?.asset_type || row?.assetType;
  const status = detail.data?.status || "nicht_geprueft";
  const loading = detail.loading || (list.loading && !detail.data);
  const notFound = !loading && !detail.error && !detail.data && !row && !list.error;
  const saved = watchlist.includes(ticker);
  const reasons = reasonDetails(result?.headline || headlineFromCriteria(result?.criteria));
  const groups = result ? groupCriteria(result.criteria, assetType === "etf") : [];

  return (
    <div className="font-body page text-left">
      <header className="flex items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <a href={routes.home()} className="hover:text-[var(--text)]">
          Tazkiyah
        </a>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={onBack} className="hover:text-[var(--text)]">
          Screener
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-[var(--text)]">{ticker}</span>
      </header>

      <main className="pb-24">
        {loading && <p className="py-10 text-sm text-[var(--muted)]">Lade Ergebnis…</p>}

        {detail.error && (
          <p className="rounded-2xl border border-[var(--red)]/50 px-5 py-4 text-sm text-[var(--red-soft)]">
            Das Ergebnis konnte nicht geladen werden. Bitte später erneut versuchen.
          </p>
        )}

        {notFound && (
          <div className="py-10">
            <p className="text-[var(--text)]">Zu „{ticker}“ gibt es keinen Titel in der Prüfliste.</p>
            <a href={routes.screener()} className="mt-3 inline-block text-sm text-[var(--primary)] underline underline-offset-2">
              Zum Screener
            </a>
          </div>
        )}

        {!loading && !detail.error && !notFound && (
          <>
            {/* 1. Kopf */}
            <section className="border-b border-[var(--border)] pb-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-[IBM_Plex_Mono] text-lg tracking-wide text-[var(--text)]">{ticker}</span>
                {assetType === "etf" && (
                  <span className="rounded-full border border-[var(--gold)]/40 px-1.5 py-0.5 text-sm text-[var(--gold-soft)] font-medium">ETF</span>
                )}
                <StatusBadge status={status} size="lg" />
              </div>
              <h1 className="font-display mt-2" style={H1_STYLE}>
                {name}
              </h1>
              {result ? (
                <div className="mt-3 space-y-1 text-sm text-[var(--text-soft)]">
                  <p>{result.statusLabel}</p>
                  <p className="text-[var(--muted)]">
                    Ergebnis vom {fmtDate(result.screenedAt || detail.data.run_at)}
                    {dataBasisText(result.dataBasis) && ` · Datenstand: ${dataBasisText(result.dataBasis)}`}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-soft)]">Wird demnächst geprüft.</p>
              )}
              <button
                type="button"
                onClick={() => onToggleWatchlist(ticker)}
                className={
                  "mt-5 rounded-full px-5 py-2.5 text-sm " +
                  (saved
                    ? "border border-[var(--gold)]/50 text-[var(--primary)]"
                    : "bg-[var(--primary)] font-medium text-[var(--on-primary)] hover:bg-[var(--primary-hover)]")
                }
              >
                {saved ? "In der Watchlist ✓" : "Zur Watchlist hinzufügen"}
              </button>
            </section>

            {result && (
              <>
                {/* 2. Begründung */}
                <section className="mt-10">
                  <h2 className="font-display" style={H2_STYLE}>
                    Begründung
                  </h2>
                  <div className="mt-3 max-w-[68ch] space-y-3 text-sm leading-relaxed text-[var(--text-soft)]">
                    {status === "konform" && <p>Alle Prüfungen nach AAOIFI SS 21 sind bestanden.</p>}
                    {reasons.failed.length > 0 && (
                      <div>
                        <p className="text-[var(--text)]">Nicht bestanden:</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {reasons.failed.map((f) => (
                            <li key={f.criterion}>
                              <a href={`#pruefung-${f.criterion.toLowerCase()}`} onClick={(e) => jumpTo(e, f.criterion)} className="hover:underline">
                                {f.text}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {reasons.notChecked.length > 0 && (
                      <div>
                        <p className="text-[var(--text)]">Noch offen:</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {reasons.notChecked.map((n) => (
                            <li key={n.criterion}>
                              <a href={`#pruefung-${n.criterion.toLowerCase()}`} onClick={(e) => jumpTo(e, n.criterion)} className="hover:underline">
                                {n.name}: {n.text}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>

                {/* 3. Prüfungen nach Stufen */}
                <section className="mt-10">
                  <h2 className="font-display" style={H2_STYLE}>
                    Prüfungen
                  </h2>
                  {groups.map((g) => (
                    <div key={g.id} className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 md:px-6">
                      <p className="flex flex-wrap items-baseline gap-x-3 border-b border-[var(--border)] py-4">
                        <span className="text-[var(--text)]">{g.title}</span>
                        {g.id !== "weitere" && <span className="font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">Stufe {g.id}</span>}
                        {g.question && <span className="w-full text-sm text-[var(--muted)]">{g.question}</span>}
                      </p>
                      <ul>
                        {g.items.map((c) => (
                          <CriterionResult key={c.id} c={c} parameters={result.parameters || undefined} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              </>
            )}

            {/* 4. Verlauf */}
            <section className="mt-10">
              <h2 className="font-display" style={H2_STYLE}>
                Verlauf
              </h2>
              {history.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">Noch keine Statuswechsel.</p>
              ) : (
                <ol className="mt-3 space-y-2 text-sm">
                  {history.map((h, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="w-24 font-[IBM_Plex_Mono] text-sm text-[var(--muted)]">{fmtDate(h.changed_at)}</span>
                      {h.from_status ? (
                        <span className="text-[var(--text-soft)]">
                          {STATUS_TEXT[h.from_status] || h.from_status} → {STATUS_TEXT[h.to_status] || h.to_status}
                        </span>
                      ) : (
                        <span className="text-[var(--text-soft)]">Erstes Ergebnis: {STATUS_TEXT[h.to_status] || h.to_status}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Reinigung und Zakat: folgt */}
            <section className="mt-10">
              <h2 className="font-display" style={H2_STYLE}>
                Reinigung und Zakat
              </h2>
              <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-[var(--muted)]">
                Folgt. Die Reinigungsbeträge setzen die Prüfung der Umsatzsegmente voraus und werden angezeigt, sobald sie vorliegt.
              </p>
            </section>

            {/* 5. Hinweis */}
            <p className="mt-10 rounded-xl border border-[var(--border)] px-4 py-3 text-sm leading-relaxed text-[var(--muted)]">
              {NOTICE_NO_ADVICE}{" "}
              <a href={routes.methodik()} className="text-[var(--primary)] underline underline-offset-2">
                So prüft Tazkiyah
              </a>
            </p>

            {/* 6. Platzhalter-Kurse */}
            {priceSection}
          </>
        )}
      </main>
    </div>
  );
}

/** „Jahresabschluss 27.09.2025, Quartal 27.06.2026“; bei ETFs der Fonds-Jahresbericht. */
function dataBasisText(b) {
  if (!b) return "";
  const parts = [];
  if (b.annualPeriodEnd) parts.push(`Jahresabschluss ${fmtDate(b.annualPeriodEnd)}`);
  if (b.quarterPeriodEnd) parts.push(`Quartal ${fmtDate(b.quarterPeriodEnd)}`);
  if (b.fundAnnualReportDate) parts.push(`Fonds-Jahresbericht ${fmtDate(b.fundAnnualReportDate)}`);
  return parts.join(", ");
}

// Sprung innerhalb der Seite, ohne die Hash-Adresse zu ändern
function jumpTo(e, criterion) {
  e.preventDefault();
  document.getElementById(`pruefung-${criterion.toLowerCase()}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
