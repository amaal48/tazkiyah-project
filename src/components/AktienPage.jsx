// src/components/AktienPage.jsx
//
// Aktiensuche (#/aktien, Navigation „Aktien“; Neue Ausrichtung 15.10.2026): alle aktiven Titel aus dem
// Universum, nur Stammdaten, KEIN Halal-Status. Suche nach Name oder Ticker, Filter nach Branche.
// Titel der Tazkiyah 30 tragen nur den Link „in den Tazkiyah 30“. Nächste Zahlen aus SEC EDGAR (company_calendar).
// Archiv Tazkiyah 30 (17.10.2026, VITE_FEATURE_TAZKIYAH30 aus): keine Markierung der 30, Hinweis ohne Einschätzung.

import { useEffect, useMemo, useState } from "react";
import { useScreeningList } from "../lib/screeningData.js";
import { EARNINGS_STATUS_TEXT, useCalendarList } from "../lib/calendarData.js";
import { routes } from "../lib/hashRoute.js";
import { H1_STYLE, fmtDate } from "./screening/format.js";
import { FEATURE_TAZKIYAH30 } from "../lib/features.js";

const PAGE = 50;
const linkClass = "text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]";

// Sitzungsweiter Zustand der Suche
let saved = { query: "", sector: "" };

/** initialQuery: Suchbegriff aus der Adresse (#/aktien?suche=…, Suchfeld der Kopfleiste) */
export default function AktienPage({ initialQuery = null }) {
  const list = useScreeningList();
  const cal = useCalendarList();
  const [f, setF] = useState(saved);
  const [visible, setVisible] = useState(PAGE);
  const update = (patch) =>
    setF((prev) => {
      const next = { ...prev, ...patch };
      saved = next;
      return next;
    });

  useEffect(() => setVisible(PAGE), [f]);
  useEffect(() => {
    if (initialQuery) update({ query: initialQuery, sector: "" });
  }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const sectors = useMemo(() => [...new Set(list.rows.map((r) => r.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de")), [list.rows]);

  const filtered = useMemo(() => {
    const q = f.query.trim().toLowerCase();
    return list.rows
      .filter((r) => (!q || r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) && (!f.sector || r.sector === f.sector))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [list.rows, f]);
  const shown = filtered.slice(0, visible);

  return (
    <div className="font-body page pb-8 pt-14 text-left">
      <header className="max-w-[68ch]">
        <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(40px, 6vw, 60px)", lineHeight: 1.05 }}>
          Aktien
        </h1>
        {FEATURE_TAZKIYAH30 ? (
          <p className="mt-4 text-[19px] leading-relaxed text-[var(--muted)]">
            Kurs, Chart und Unternehmensprofil für alle Aktien unserer Liste. Eine Sharia-Prüfung bieten wir nur für die{" "}
            <a href={routes.tazkiyah30()} className={linkClass}>
              Tazkiyah 30
            </a>{" "}
            an, deshalb steht hier kein Halal-Status.
          </p>
        ) : (
          <p className="mt-4 text-[19px] leading-relaxed text-[var(--muted)]">
            Kurs, Chart, Unternehmensprofil, Termine und Berichte für alle Aktien unserer Liste. Tazkiyah gibt keine
            Sharia-Einschätzung zu einzelnen Aktien ab. Wie man selbst nach dem AAOIFI-Standard prüfen kann, erklären wir in der{" "}
            <a href={routes.lernen()} className={linkClass}>
              Akademie
            </a>
            .
          </p>
        )}
      </header>

      <div className="card mt-8">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1">
            <span className="sr-only-label">Name oder Ticker suchen</span>
            <input value={f.query} onChange={(e) => update({ query: e.target.value })} placeholder="Name oder Ticker suchen" className="field w-full" />
          </label>
          <label>
            <span className="sr-only-label">Branche</span>
            <select value={f.sector} onChange={(e) => update({ sector: e.target.value })} className="field">
              <option value="">Alle Branchen</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="mb-4 mt-6 text-[15px] text-[var(--muted)]">
        {list.loading ? "Lade Aktien…" : `${filtered.length} Titel gefunden${filtered.length > shown.length ? ` · ${shown.length} angezeigt` : ""}`}
      </p>

      {list.error && (
        <p className="card border-[var(--bad-border)] bg-[var(--bad-bg)] text-[var(--bad-strong)]">
          Die Aktien konnten nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {!list.loading && !list.error && filtered.length === 0 && <div className="card text-center text-[var(--muted)]">Keine Treffer.</div>}

      {shown.length > 0 && (
        <div className="overflow-x-auto border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[760px] text-[15px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-sm text-[var(--muted)]">
                <th scope="col" className="px-5 py-3 font-medium">Unternehmen</th>
                <th scope="col" className="px-5 py-3 font-medium">Branche</th>
                <th scope="col" className="px-5 py-3 font-medium">Börse</th>
                <th scope="col" className="px-5 py-3 font-medium">Kurs &amp; Chart</th>
                <th scope="col" className="px-5 py-3 font-medium">Nächste Zahlen</th>
                <th scope="col" className="px-5 py-3 font-medium">Berichte</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.ticker} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-3">
                    <span className="block font-semibold text-[var(--text)]">{r.name}</span>
                    <span className="block font-[IBM_Plex_Mono] text-[13px] text-[var(--muted)]">{r.ticker}</span>
                    {FEATURE_TAZKIYAH30 && r.inTazkiyah30 && (
                      <a href={routes.stock(r.ticker)} className={"mt-1 inline-block text-sm " + linkClass}>
                        in den Tazkiyah 30
                      </a>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--text-soft)]">{r.sector || "–"}</td>
                  <td className="px-5 py-3 font-[IBM_Plex_Mono] text-[13px] text-[var(--text-soft)]">{r.exchange || "–"}</td>
                  <td className="px-5 py-3">
                    <a href={routes.stock(r.ticker)} className={linkClass} aria-label={`Kurs und Chart von ${r.name}`}>
                      Kurs &amp; Chart
                    </a>
                  </td>
                  <td className="px-5 py-3">
                    {cal.byTicker.get(r.ticker)?.next_earnings_date ? (
                      <>
                        <span className="font-[IBM_Plex_Mono] text-[14px] text-[var(--text)]">{fmtDate(cal.byTicker.get(r.ticker).next_earnings_date)}</span>
                        <span className="block text-[13px] text-[var(--muted)]">{EARNINGS_STATUS_TEXT[cal.byTicker.get(r.ticker).next_earnings_status]}</span>
                      </>
                    ) : (
                      <span className="text-[var(--muted)]">{cal.loading ? "…" : "–"}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <a href={routes.stock(r.ticker)} className={linkClass} aria-label={`Berichte von ${r.name}`}>
                      Berichte
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > shown.length && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setVisible((c) => c + PAGE)} className="btn-secondary">
            Weitere {Math.min(PAGE, filtered.length - shown.length)} von {filtered.length - shown.length} laden
          </button>
        </div>
      )}

      <p className="mt-10 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
        Kurse über TradingView. Die Inhalte dienen der Information und sind keine Anlageberatung.
      </p>
    </div>
  );
}
