// src/components/CompanyCalendar.jsx
//
// Termine und Berichte einer Aktie (Aktienseite und Detailseite der Tazkiyah 30): nächste Quartalszahlen
// (voraussichtlich / bestätigt), Hauptversammlung (kommend / letzte) und die letzten Berichte mit Link
// zu SEC EDGAR. Quelle ausschließlich SEC EDGAR (Tabelle company_calendar), keine Halal-Daten.

import { EARNINGS_STATUS_TEXT, useCalendarRow } from "../lib/calendarData.js";
import { H2_STYLE, fmtDate, safeUrl } from "./screening/format.js";

const linkClass = "text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]";

function Card({ title, children }) {
  return (
    <section className="card h-full">
      <h3 className="font-display text-[20px] font-medium text-[var(--text)]">{title}</h3>
      <div className="mt-2 text-[16px] leading-relaxed text-[var(--text-soft)]">{children}</div>
    </section>
  );
}

function StatusPill({ status }) {
  const confirmed = status === "bestaetigt";
  return (
    <span
      className={
        "ml-2 inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold align-middle " +
        (confirmed ? "bg-[var(--ok-bg)] text-[var(--ok-text)]" : "bg-[var(--none-bg)] text-[var(--none-text)]")
      }
    >
      {EARNINGS_STATUS_TEXT[status] || status}
    </span>
  );
}

function SecLink({ url, children }) {
  const href = safeUrl(url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

export default function CompanyCalendar({ ticker, className = "mt-12" }) {
  const { loading, row } = useCalendarRow(ticker);
  const reports = Array.isArray(row?.filings) ? row.filings : [];

  return (
    <section className={className} aria-labelledby="termine-berichte">
      <h2 id="termine-berichte" className="font-display" style={{ ...H2_STYLE, fontSize: "24px" }}>
        Termine und Berichte
      </h2>
      {loading ? (
        <p className="mt-3 text-[var(--muted)]">Lade Termine…</p>
      ) : !row ? (
        <p className="mt-3 max-w-[62ch] text-[var(--muted)]">Folgt. Termine und Berichte werden von der SEC abgerufen und erscheinen hier nach dem nächsten Abruf.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
            <Card title="Nächste Quartalszahlen">
              {row.next_earnings_date ? (
                <>
                  <p className="text-[var(--text)]">
                    <span className="font-semibold">{fmtDate(row.next_earnings_date)}</span>
                    <StatusPill status={row.next_earnings_status} />
                  </p>
                  {row.next_earnings_note && <p className="mt-1 text-sm text-[var(--muted)]">{row.next_earnings_note}</p>}
                  {row.next_earnings_status === "bestaetigt" && (
                    <p className="mt-1 text-sm">
                      <SecLink url={row.next_earnings_url}>Ankündigung bei der SEC</SecLink>
                    </p>
                  )}
                  {row.next_earnings_status === "voraussichtlich" && (
                    <p className="mt-1 text-sm text-[var(--muted)]">Geschätzt, nicht vom Unternehmen bestätigt.</p>
                  )}
                </>
              ) : (
                <p className="text-[var(--muted)]">Kein Termin ermittelbar.</p>
              )}
            </Card>
            <Card title="Hauptversammlung">
              {row.hv_date ? (
                <>
                  <p className="text-[var(--text)]">
                    {row.hv_status === "vergangen" ? "Letzte Hauptversammlung: " : "Nächste Hauptversammlung: "}
                    <span className="font-semibold">{fmtDate(row.hv_date)}</span>
                  </p>
                  {row.hv_note && <p className="mt-1 text-sm text-[var(--muted)]">{row.hv_note}</p>}
                </>
              ) : (
                <p className="text-[var(--muted)]">Kein Termin ermittelbar.</p>
              )}
              {row.hv_url && (
                <p className="mt-1 text-sm">
                  <SecLink url={row.hv_url}>Einladung (Proxy Statement) bei der SEC</SecLink>
                </p>
              )}
            </Card>
          </div>

          <div className="card mt-4">
            <h3 className="font-display text-[20px] font-medium text-[var(--text)]">Berichte</h3>
            {reports.length === 0 ? (
              <p className="mt-2 text-[var(--muted)]">Keine Berichte gefunden.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {reports.map((r) => (
                  <li key={r.url} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                    <span className="min-w-0">
                      <span className="text-[var(--text)]">{r.label}</span>{" "}
                      <span className="font-[IBM_Plex_Mono] text-[13px] text-[var(--muted)]">{r.form}</span>
                    </span>
                    <span className="flex items-baseline gap-4 text-sm">
                      <span className="font-[IBM_Plex_Mono] text-[var(--muted)]">{fmtDate(r.filed)}</span>
                      <SecLink url={r.url}>bei der SEC</SecLink>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Quelle: SEC EDGAR (US-Börsenaufsicht), Stand {fmtDate(row.fetched_at)}. Berichte auf Englisch.
          </p>
        </>
      )}
    </section>
  );
}
