// src/components/screening/Tazkiyah30Page.jsx
//
// Die Tazkiyah 30 (#/tazkiyah-30, ersetzt den Screener; Neue Ausrichtung 15.10.2026).
// Feste Liste aus der Tabelle tazkiyah30 mit dem öffentlichen Ergebnis. Angezeigt werden nur Titel mit
// Endergebnis (konform / nicht konform); solange nicht alle fertig sind, steht oben „x von 30 geprüft“.
// Karten nach Branche, Filter nach Status und Auswahl. Keine Rangfolge, keine Kursangaben.

import { useMemo, useState } from "react";
import { useScreeningList } from "../../lib/screeningData.js";
import { routes } from "../../lib/hashRoute.js";
import { TAZKIYAH30_SIZE } from "../../data/tazkiyah30.js";
import StatusBadge, { StatusIcon } from "./StatusBadge.jsx";
import { LegalNoticeFull, LegalNoticeShort } from "./LegalNotice.jsx";
import { H1_STYLE, H2_STYLE, STATUS_TEXT, cardReason, fmtDate } from "./format.js";

export const BELIEBT_TEXT = "Beliebt bei deutschen Anlegern";

const HERO_TEXT =
  "Aktien, die bei deutschen Brokern handelbar sind, sorgfältig geprüft und mit Quelle belegt. Eine bewusst kleine Liste von 30 Titeln, die wir nach jedem Quartalsbericht neu prüfen. Zu jeder Aktie sagen wir in einem Satz, warum sie konform ist oder nicht.";

const WHY_30 =
  "Lieber wenige Aktien gründlich als viele oberflächlich. Jede Prüfung ist von Hand nachgelesen und mit Quelle belegt. Ändert sich ein Ergebnis, steht es im Wochenbericht. Wird eine Aktie häufig gewünscht, kann sie bei der nächsten Überarbeitung einen Platz bekommen.";

const STATUS_FILTERS = [
  { key: "", label: "Alle" },
  { key: "konform", label: STATUS_TEXT.konform },
  { key: "nicht_konform", label: STATUS_TEXT.nicht_konform },
];

const GROUP_FILTERS = [
  { key: "", label: "Alle" },
  { key: "beliebt", label: BELIEBT_TEXT },
  { key: "datenlage", label: "Weitere geprüfte" },
];

// Filter bleiben für die Sitzung erhalten, damit „Zurück“ sie nicht verliert
let saved = { status: "", gruppe: "" };

const linkClass = "text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]";

function Card({ row }) {
  return (
    <a
      href={routes.stock(row.ticker)}
      className="card group flex h-full flex-col gap-3 text-left transition-colors hover:border-[var(--primary)]"
    >
      <span className="flex flex-wrap items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[18px] font-semibold leading-snug text-[var(--text)] group-hover:text-[var(--primary)]">{row.name}</span>
          <span className="mt-0.5 block font-[IBM_Plex_Mono] text-[13px] text-[var(--muted)]">{row.ticker}</span>
        </span>
        <StatusBadge status={row.status} />
      </span>
      <span className="text-[16px] leading-relaxed text-[var(--text-soft)]">{cardReason(row)}</span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
        {row.tazkiyah30?.gruppe === "beliebt" ? <span className="text-[var(--gold-soft)]">{BELIEBT_TEXT}</span> : <span />}
        {row.runAt && <span>Stand {fmtDate(row.runAt)}</span>}
      </span>
    </a>
  );
}

function InfoBox({ title, children }) {
  return (
    <section className="card h-full">
      <h2 className="font-display" style={{ ...H2_STYLE, fontSize: "22px" }}>
        {title}
      </h2>
      <div className="mt-3 text-[16px] leading-relaxed text-[var(--text-soft)]">{children}</div>
    </section>
  );
}

export default function Tazkiyah30Page() {
  const list = useScreeningList();
  const [f, setF] = useState(saved);
  const update = (patch) =>
    setF((prev) => {
      const next = { ...prev, ...patch };
      saved = next;
      return next;
    });

  const members = useMemo(() => {
    const order = new Map(list.tazkiyah30.map((t) => [t.ticker, t.sortOrder]));
    return list.rows.filter((r) => r.inTazkiyah30).sort((a, b) => (order.get(a.ticker) ?? 99) - (order.get(b.ticker) ?? 99));
  }, [list.rows, list.tazkiyah30]);

  const done = members.filter((r) => r.hasFinalResult);
  const total = list.tazkiyah30.length || TAZKIYAH30_SIZE;
  const shown = done.filter((r) => (!f.status || r.status === f.status) && (!f.gruppe || r.tazkiyah30?.gruppe === f.gruppe));

  // Nach Branche gruppieren; Reihenfolge der Branchen nach dem ersten Titel der Liste
  const bySector = [];
  for (const r of shown) {
    const name = r.sector || "Weitere Branchen";
    let g = bySector.find((x) => x.name === name);
    if (!g) bySector.push((g = { name, items: [] }));
    g.items.push(r);
  }

  const active = f.status || f.gruppe;

  return (
    <div className="font-body page pb-8 pt-14 text-left">
      <header className="max-w-[68ch]">
        <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(32px, 4.5vw, 44px)", lineHeight: 1.15 }}>
          Die Tazkiyah 30
        </h1>
        <p className="mt-4 text-[19px] leading-relaxed text-[var(--muted)]">{HERO_TEXT}</p>
        <LegalNoticeShort className="mt-4" />
      </header>

      {!list.loading && !list.error && done.length < total && (
        <p className="mt-6 inline-flex rounded-full bg-[var(--tile)] px-4 py-2 text-[15px] font-semibold text-[var(--primary)]">
          {done.length} von {total} geprüft
        </p>
      )}

      {/* Filter */}
      <div className="card mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[15px] font-medium text-[var(--muted)]">Status:</span>
          {STATUS_FILTERS.map((s) => (
            <button key={s.key || "alle"} type="button" className="chip" aria-pressed={f.status === s.key} onClick={() => update({ status: s.key })}>
              {s.key && <StatusIcon status={s.key} size={14} />}
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[15px] font-medium text-[var(--muted)]">Auswahl:</span>
          {GROUP_FILTERS.map((g) => (
            <button key={g.key || "alle"} type="button" className="chip" aria-pressed={f.gruppe === g.key} onClick={() => update({ gruppe: g.key })}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px] text-[var(--muted)]">
        <span>{list.loading ? "Lade die Liste…" : `${shown.length} ${shown.length === 1 ? "Aktie" : "Aktien"}`}</span>
        {active ? (
          <button type="button" onClick={() => update({ status: "", gruppe: "" })} className={"min-h-[44px] " + linkClass}>
            Filter zurücksetzen
          </button>
        ) : null}
      </p>

      {list.error && (
        <p className="card border-[var(--bad-border)] bg-[var(--bad-bg)] text-[var(--bad-strong)]">
          Die Liste konnte nicht geladen werden. Bitte später erneut versuchen.
        </p>
      )}

      {!list.loading && !list.error && shown.length === 0 && (
        <div className="card text-center text-[var(--muted)]">
          {done.length === 0 ? "Die Prüfungen laufen noch. Die ersten Ergebnisse erscheinen hier, sobald sie fertig sind." : "Keine Aktie passt zu diesem Filter."}
        </div>
      )}

      <div className="space-y-12">
        {bySector.map((g) => (
          <section key={g.name} aria-labelledby={`branche-${g.name}`}>
            <h2 id={`branche-${g.name}`} className="font-display" style={{ ...H2_STYLE, fontSize: "24px" }}>
              {g.name}
            </h2>
            <ul className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
              {g.items.map((r) => (
                <li key={r.ticker}>
                  <Card row={r} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Erläuterungen */}
      <div className="mt-16 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
        <InfoBox title="Warum nur 30?">
          <p>{WHY_30}</p>
        </InfoBox>
        <InfoBox title="Weitere Aktien">
          <p>
            Kurse, Unternehmensprofil und Termine finden Sie für alle Aktien in der Aktiensuche, dort ohne Halal-Status.
          </p>
          <p className="mt-3">
            <a href={routes.aktien()} className={linkClass}>
              Zur Aktiensuche
            </a>
          </p>
        </InfoBox>
        <InfoBox title="So lesen Sie die Liste">
          <p>
            Jede Aktie prüfen wir nach dem AAOIFI-Standard Nr. 21: Kerngeschäft und Unternehmenszweck, zinstragende Schulden und
            Einlagen, unzulässige Einnahmen und der Anteil realer Vermögenswerte. „Konform“ heißt, alle Prüfungen sind bestanden;
            „nicht konform“, mindestens eine nicht. Andere Anbieter wie Zoya oder Musaffa nutzen teils andere Standards und können
            deshalb zu anderen Ergebnissen kommen.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            <a href={routes.methodik()} className={linkClass}>
              So prüfen wir
            </a>
            <a href={routes.methodik()} className={linkClass}>
              Änderungsprotokoll
            </a>
            <a href={routes.kontakt({ topic: "fehler" })} className={linkClass}>
              Fehler melden
            </a>
          </p>
        </InfoBox>
      </div>

      <LegalNoticeFull className="mt-12" />
    </div>
  );
}
