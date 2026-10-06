// src/components/screening/ScreeningDetail.jsx
//
// Detailseite eines Titels (#/aktie/AAPL), Design B: Ergebnisfeld, je Stufe eine Karte mit
// einer Zeile pro Prüfung (Werte gegen Grenzwert, Balken mit Grenzmarke, Quelle, manuelle
// Prüfung), Kurs und Marktdaten von TradingView (nach Zustimmung), Verlauf der Statuswechsel,
// Hinweis zu Reinigung und Zakat.

import { useEffect, useState } from "react";
import { ETF_STAGE, EXPLANATIONS, FLAG_TEXTS, RESULT_LABELS, STAGES } from "../../screening/explanations.js";
import { loadScreeningDetail, loadStatusHistory, useScreeningList } from "../../lib/screeningData.js";
import { routes } from "../../lib/hashRoute.js";
import StatusBadge, { StatusIcon } from "./StatusBadge.jsx";
import SourceLink from "./SourceLink.jsx";
import LimitBar from "./LimitBar.jsx";
import MarketData from "./MarketData.jsx";
import {
  BASIS_TEXT,
  H1_STYLE,
  H2_STYLE,
  NOTICE_NO_ADVICE,
  STATUS_TEXT,
  fmtAmount,
  fmtDate,
  fmtMonthYear,
  fmtLimit,
  fmtNum,
  fmtPct,
  headlineFromCriteria,
  reasonDetails,
  reasonLine,
  safeUrl,
  shortExplanation,
} from "./format.js";

// Ergebnis einer Prüfung → Status für Symbol und Farbe
const RESULT_TO_STATUS = { pass: "konform", fail: "nicht_konform", not_checked: "nicht_geprueft", not_applicable: "nicht_geprueft" };
const RESULT_TEXT_COLOR = {
  pass: "text-[var(--ok-text)]",
  fail: "text-[var(--bad-text)]",
  not_checked: "text-[var(--none-text)]",
  not_applicable: "text-[var(--none-text)]",
};

// Öffentliche Prüfer-Angabe (Entscheidung 06.10.2026): immer „Tazkiyah-Redaktion“, Prüfmonat aus
// reviewedAt, Umfang der Gegenprüfung aus verification. Prüfer-Kürzel und ai_draft sind intern
// und kommen hier nie an.
const VERIFICATION_TEXT = { full: "vollständig geprüft", sample: "stichprobenartig geprüft" };

const LEASE_SOURCE = {
  annual_estimate: "Leasing aus dem letzten Jahresabschluss übernommen (Schätzung)",
  manual_10q: "Leasing von Hand aus dem Quartalsbericht übernommen",
};

const ASSET_TEXT = { stock: "Aktie", etf: "ETF" };

// Ergebnisfeld je Status (Farben aus Design B)
const RESULT_PANEL = {
  konform: { box: "bg-[var(--primary)] text-[var(--on-primary-soft)]", sub: "text-[var(--on-primary-muted)]", link: "text-[var(--on-primary-soft)]" },
  nicht_konform: { box: "bg-[var(--bad-bg)] border border-[var(--bad-border)] text-[var(--bad-strong)]", sub: "text-[var(--bad-strong)]", link: "text-[var(--bad-strong)]" },
  nicht_geprueft: { box: "bg-[var(--none-bg)] text-[var(--none-strong)]", sub: "text-[var(--none-strong)]", link: "text-[var(--none-strong)]" },
};

function RatioCheck({ check }) {
  const basis = BASIS_TEXT[check.basis] || "Abschluss";
  const bound = check.comparator === ">=" ? "mindestens" : "höchstens";
  const hasValue = typeof check.value === "number";
  const d = check.distanceToLimit;
  let distance = null;
  if (typeof d === "number") {
    if (d >= 0) distance = `Abstand zur Grenze: ${fmtNum(d, 2)} Prozentpunkte`;
    else distance = `Grenze um ${fmtNum(-d, 2)} Prozentpunkte ${check.comparator === ">=" ? "unterschritten" : "überschritten"}`;
  }
  return (
    <li className="mt-4 first:mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] text-[var(--muted)]">
          {basis} {fmtDate(check.periodEnd)}
          {check.label && <span className="block text-sm text-[var(--faint)]">{check.label}</span>}
        </span>
        {hasValue ? (
          <span className="font-[IBM_Plex_Mono] text-[15px] text-[var(--text)]">
            <span className={RESULT_TEXT_COLOR[check.result]}>{fmtPct(check.value)}</span> von {bound} {fmtLimit(check.limit)}
          </span>
        ) : (
          <span className="text-[15px] text-[var(--text-soft)]">{check.reason || RESULT_LABELS[check.result]}</span>
        )}
      </div>
      {hasValue && <LimitBar value={check.value} limit={check.limit} result={check.result} className="mt-2" />}
      {(distance || (hasValue && check.reason) || check.leaseSource) && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {distance}
          {hasValue && check.reason && <span className="block text-[var(--text-soft)]">{check.reason}</span>}
          {check.leaseSource && (
            <span className="block">
              {LEASE_SOURCE[check.leaseSource] || "Leasing"}
              {typeof check.leaseAmount === "number" && `: ${fmtAmount(check.leaseAmount)}`}
            </span>
          )}
        </p>
      )}
    </li>
  );
}

function InfoCheck({ check }) {
  // Prüfungen ohne Kennzahl, z. B. Branche (A1) oder Abdeckung (G1)
  if (check.label === "Abdeckung" && typeof check.holdingsCount === "number") {
    return (
      <li className="mt-3 text-[15px] text-[var(--text-soft)]">
        {check.holdingsCount} enthaltene Aktien, davon {check.failedCount ?? 0} nicht konform und {check.uncheckedCount ?? 0} nicht geprüft
        {check.asOf && <span className="text-[var(--muted)]"> · Stand {fmtDate(check.asOf)}</span>}
      </li>
    );
  }
  if (check.value == null || typeof check.value === "object") return null;
  return (
    <li className="mt-3 text-[15px]">
      <span className="text-[var(--muted)]">{check.label}: </span>
      <span className="text-[var(--text-soft)]">{String(check.value)}</span>
    </li>
  );
}

function Review({ review }) {
  if (!review) return null;
  const url = safeUrl(review.sourceUrl);
  const verification = VERIFICATION_TEXT[review.verification];
  const month = fmtMonthYear(review.reviewedAt);
  return (
    <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm leading-relaxed text-[var(--text-soft)]">
      <p>
        Geprüft von der Tazkiyah-Redaktion
        {month && ` · geprüft im ${month}`}
        {verification && ` · ${verification}`}
        {(url || review.sourceNote) && (
          <>
            {" · Quelle: "}
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]">
                {review.sourceNote || "Dokument öffnen"}
              </a>
            ) : (
              review.sourceNote
            )}
          </>
        )}
      </p>
      {review.state === "expired" && (
        <p className="mt-1 text-[var(--text)]">Diese Prüfung ist abgelaufen, weil ein neuer Jahresabschluss vorliegt. Sie muss erneut bestätigt werden.</p>
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
            <span aria-hidden="true" className="mt-px text-[var(--amber-soft)]">ⓘ</span>
            <span>
              {FLAG_TEXTS[f].text}{" "}
              <a href={routes.criterion(target)} className="whitespace-nowrap text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]">
                Erklärung
              </a>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CriterionRow({ c, parameters }) {
  const ratioChecks = (c.checks || []).filter((x) => typeof x.limit === "number");
  const otherChecks = (c.checks || []).filter((x) => typeof x.limit !== "number");
  const explanation = shortExplanation(c.id, parameters);
  const status = RESULT_TO_STATUS[c.result] || "nicht_geprueft";
  return (
    <li id={`pruefung-${c.id.toLowerCase()}`} className="scroll-mt-24 border-t border-[var(--line)] py-5 first:border-t-0 first:pt-1 last:pb-1">
      <div className="flex items-start gap-3">
        <span className={"mt-1 " + RESULT_TEXT_COLOR[c.result]}>
          <StatusIcon status={status} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <a href={routes.criterion(c.id)} className="-my-2.5 inline-flex min-h-[44px] items-center font-semibold text-[var(--text)] hover:text-[var(--primary)] hover:underline">
              {c.name}
            </a>
            <span className="font-[IBM_Plex_Mono] text-sm text-[var(--faint)]">{c.id}</span>
            <span className={"ml-auto text-sm font-medium " + RESULT_TEXT_COLOR[c.result]}>{RESULT_LABELS[c.result] || c.result}</span>
          </div>
          {explanation && <p className="mt-1 max-w-[62ch] text-[15px] leading-relaxed text-[var(--muted)]">{explanation}</p>}

          {(ratioChecks.length > 0 || otherChecks.length > 0) && (
            <ul>
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
            <p className="mt-2 text-[15px] text-[var(--text-soft)]">{c.reason}</p>
          )}

          <p className="mt-2 text-sm">
            <SourceLink source={c.source} criterion={c.id} />
          </p>
          <Flags flags={c.flags} criterionId={c.id} />
          <Review review={c.review} />
        </div>
      </div>
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

export default function ScreeningDetail({ ticker, onBack, watchlist, onToggleWatchlist }) {
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
  const headline = result ? result.headline || headlineFromCriteria(result.criteria) : null;
  const reasons = reasonDetails(headline);
  const groups = result ? groupCriteria(result.criteria, assetType === "etf") : [];
  const sentence = reasonLine({ hasResult: !!result, headline, status, runAt: result?.screenedAt || detail.data?.run_at });
  const panel = RESULT_PANEL[status] || RESULT_PANEL.nicht_geprueft;
  const meta = [ticker, ASSET_TEXT[assetType], row?.sector].filter(Boolean).join(" · ");

  return (
    <div className="font-body page pb-12 pt-8 text-left">
      <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center text-[16px] font-medium text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline">
        ← Zurück zum Screener
      </button>

      {loading && <p className="py-10 text-[var(--muted)]">Lade Ergebnis…</p>}

      {detail.error && (
        <p className="card mt-6 border-[var(--bad-border)] bg-[var(--bad-bg)] text-[var(--bad-strong)]">
          Das Ergebnis konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {notFound && (
        <div className="py-10">
          <p className="text-[var(--text)]">Zu „{ticker}“ gibt es keinen Titel in der Prüfliste.</p>
          <a href={routes.screener()} className="mt-3 inline-block text-[var(--primary)] underline underline-offset-2">
            Zum Screener
          </a>
        </div>
      )}

      {!loading && !detail.error && !notFound && (
        <>
          {/* 1. Kopf */}
          <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(32px, 4.5vw, 44px)", lineHeight: 1.15 }}>
                {name}
              </h1>
              <p className="mt-2 font-[IBM_Plex_Mono] text-sm text-[var(--muted)]">{meta}</p>
            </div>
            <button type="button" onClick={() => onToggleWatchlist(ticker)} aria-pressed={saved} className="btn-secondary">
              {saved ? "✓ In der Watchlist" : "+ Zur Watchlist"}
            </button>
          </header>

          {/* 2. Ergebnisfeld */}
          <section aria-label="Ergebnis" className={"mt-8 rounded-[18px] p-8 " + panel.box}>
            <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
              <StatusBadge status={status} size="lg" inverse={status === "konform"} />
              <div className="min-w-0 flex-1">
                <p className="text-[19px] font-semibold leading-snug">{sentence}</p>
                {result && (
                  <p className={"mt-2 text-[15px] " + panel.sub}>
                    {result.statusLabel} · Ergebnis vom {fmtDate(result.screenedAt || detail.data.run_at)}
                    {dataBasisText(result.dataBasis) && ` · Datenstand: ${dataBasisText(result.dataBasis)}`}
                  </p>
                )}
                {(reasons.failed.length > 0 || reasons.notChecked.length > 0) && (
                  <div className={"mt-4 space-y-3 text-[15px] leading-relaxed " + panel.sub}>
                    {reasons.failed.length > 0 && (
                      <div>
                        <p className="font-semibold">Nicht bestanden:</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {reasons.failed.map((f) => (
                            <li key={f.criterion}>
                              <a href={`#pruefung-${f.criterion.toLowerCase()}`} onClick={(e) => jumpTo(e, f.criterion)} className={"underline-offset-2 hover:underline " + panel.link}>
                                {f.text}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {reasons.notChecked.length > 0 && (
                      <div>
                        <p className="font-semibold">Noch offen:</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {reasons.notChecked.map((n) => (
                            <li key={n.criterion}>
                              <a href={`#pruefung-${n.criterion.toLowerCase()}`} onClick={(e) => jumpTo(e, n.criterion)} className={"underline-offset-2 hover:underline " + panel.link}>
                                {n.name}: {n.text}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 3. Prüfungen je Stufe */}
          {result && (
            <div className="mt-[72px] grid gap-x-8 gap-y-12 lg:grid-cols-2">
              {groups.map((g) => (
                <section key={g.id} aria-labelledby={`stufe-${g.id}`}>
                  <h2 id={`stufe-${g.id}`} className="font-display" style={{ ...H2_STYLE, fontSize: "24px" }}>
                    {g.id !== "weitere" ? `${g.id} ${g.title}` : g.title}
                  </h2>
                  {g.question && <p className="mt-1 text-[15px] text-[var(--muted)]">{g.question}</p>}
                  <ul className="card mt-4">
                    {g.items.map((c) => (
                      <CriterionRow key={c.id} c={c} parameters={result.parameters || undefined} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {/* Kurs und Marktdaten (TradingView, erst nach Zustimmung) */}
          <MarketData ticker={ticker} exchange={row?.exchange} name={name} />

          {/* Verlauf */}
          <section className="mt-[72px]">
            <h2 className="font-display" style={{ ...H2_STYLE, fontSize: "24px" }}>
              Verlauf
            </h2>
            {history.length === 0 ? (
              <p className="mt-3 text-[var(--muted)]">Noch keine Statuswechsel.</p>
            ) : (
              <ol className="card mt-4 space-y-2">
                {history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="w-28 font-[IBM_Plex_Mono] text-sm text-[var(--muted)]">{fmtDate(h.changed_at)}</span>
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

          {/* 4. Reinigung und Zakat */}
          <section className="mt-12 rounded-2xl border border-[var(--note-border)] bg-[var(--note-bg)] p-6">
            <h2 className="font-display" style={{ ...H2_STYLE, fontSize: "24px" }}>
              Reinigung und Zakat
            </h2>
            <p className="mt-2 max-w-[62ch] leading-relaxed text-[var(--text-soft)]">
              Folgt. Die Reinigungsbeträge setzen die Prüfung der Umsatzsegmente voraus und werden angezeigt, sobald sie vorliegt.
            </p>
          </section>

          {/* 5. Hinweis */}
          <p className="mt-10 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
            {NOTICE_NO_ADVICE}{" "}
            <a href={routes.methodik()} className="text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]">
              So prüft Tazkiyah
            </a>
          </p>
        </>
      )}
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
