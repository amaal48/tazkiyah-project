// src/components/CalendarPage.jsx
//
// Kalender (Navigation „Kalender“): Termine aller Aktien in den nächsten 30 Tagen, nach Datum. Quartalszahlen
// (voraussichtlich / bestätigt) und Hauptversammlungen, nur aus SEC EDGAR (Tabelle company_calendar).
// Filter „nur Tazkiyah 30“. Kein Halal-Status, keine Kurse.

import { useMemo, useState } from "react";
import { useScreeningList } from "../lib/screeningData.js";
import { EARNINGS_STATUS_TEXT, todayIso, upcomingEvents, useCalendarList } from "../lib/calendarData.js";
import { routes } from "../lib/hashRoute.js";
import { addDays } from "../calendar/secCalendar.js";
import { H1_STYLE, H2_STYLE } from "./screening/format.js";

const DAYS = 30;
const KIND_TEXT = { zahlen: "Quartalszahlen", hv: "Hauptversammlung" };
const linkClass = "text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]";

// Filter bleibt für die Sitzung erhalten
let savedOnly30 = false;

function dayLabel(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function CalendarPage() {
  const cal = useCalendarList();
  const list = useScreeningList();
  const [only30, setOnly30] = useState(savedOnly30);
  const toggle = (v) => {
    savedOnly30 = v;
    setOnly30(v);
  };

  const from = todayIso();
  const to = addDays(from, DAYS);
  const events = useMemo(() => {
    const all = upcomingEvents(cal.rows, from, to);
    return all
      .map((e) => ({ ...e, sec: list.byTicker.get(e.ticker) }))
      .filter((e) => e.sec && (!only30 || e.sec.inTazkiyah30));
  }, [cal.rows, list.rows, only30, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = [];
  for (const e of events) {
    let g = byDay.find((d) => d.date === e.date);
    if (!g) byDay.push((g = { date: e.date, items: [] }));
    g.items.push(e);
  }

  const loading = cal.loading || list.loading;

  return (
    <div className="font-body page pb-8 pt-14 text-left">
      <header className="max-w-[68ch]">
        <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(32px, 4.5vw, 44px)", lineHeight: 1.15 }}>
          Kalender
        </h1>
        <p className="mt-4 text-[19px] leading-relaxed text-[var(--muted)]">
          Quartalszahlen und Hauptversammlungen der nächsten {DAYS} Tage. Termine für Quartalszahlen leiten wir aus dem Vorjahr ab
          („voraussichtlich“), bis das Unternehmen sie ankündigt („bestätigt“).
        </p>
      </header>

      <div className="card mt-8 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[15px] font-medium text-[var(--muted)]">Auswahl:</span>
        <button type="button" className="chip" aria-pressed={!only30} onClick={() => toggle(false)}>
          Alle Aktien
        </button>
        <button type="button" className="chip" aria-pressed={only30} onClick={() => toggle(true)}>
          Nur Tazkiyah 30
        </button>
      </div>

      <p className="mb-4 mt-6 text-[15px] text-[var(--muted)]">{loading ? "Lade Termine…" : `${events.length} ${events.length === 1 ? "Termin" : "Termine"}`}</p>

      {!loading && cal.rows.length === 0 && (
        <div className="card text-[var(--muted)]">Folgt. Die Termine werden von der SEC abgerufen und erscheinen hier nach dem ersten Abruf.</div>
      )}
      {!loading && cal.rows.length > 0 && events.length === 0 && <div className="card text-center text-[var(--muted)]">Keine Termine in den nächsten {DAYS} Tagen.</div>}

      <div className="space-y-8">
        {byDay.map((d) => (
          <section key={d.date} aria-labelledby={`tag-${d.date}`}>
            <h2 id={`tag-${d.date}`} className="font-display" style={{ ...H2_STYLE, fontSize: "20px" }}>
              {dayLabel(d.date)}
            </h2>
            <ul className="card mt-3 divide-y divide-[var(--line)] py-2">
              {d.items.map((e) => (
                <li key={`${e.ticker}-${e.kind}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                  <a href={routes.stock(e.ticker)} className="group min-w-0">
                    <span className="font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">{e.sec.name}</span>{" "}
                    <span className="font-[IBM_Plex_Mono] text-[13px] text-[var(--muted)]">{e.ticker}</span>
                    {e.sec.inTazkiyah30 && <span className="ml-2 text-sm text-[var(--gold-soft)]">Tazkiyah 30</span>}
                  </a>
                  <span className="text-[15px] text-[var(--text-soft)]">
                    {KIND_TEXT[e.kind]}
                    {e.kind === "zahlen" && <span className="text-[var(--muted)]"> · {EARNINGS_STATUS_TEXT[e.status] || "voraussichtlich"}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-10 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
        Quelle: SEC EDGAR (US-Börsenaufsicht). Voraussichtliche Termine sind geschätzt und können abweichen. Die Inhalte dienen der
        Information und sind keine Anlageberatung.{" "}
        <a href={routes.aktien()} className={linkClass}>
          Zur Aktiensuche
        </a>
      </p>
    </div>
  );
}
