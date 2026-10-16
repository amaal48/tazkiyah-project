// src/components/StartPage.jsx
//
// Startseite (#/), Neue Ausrichtung 16.10.2026: Tazkiyah als Begleiter für Einsteiger mit drei Säulen
// Lernen → Selbst prüfen → Dranbleiben. Aufmacher mit Karte „Aktueller Wochenbericht“, darunter drei
// gleich große Blöcke, unten der rechtliche Hinweis. Die Tazkiyah 30 sind ein Bereich unter mehreren;
// ihre Legende (konform / nicht konform) steht nur noch auf der Seite der Tazkiyah 30.

import { useEffect, useState } from "react";
import { routes } from "../lib/hashRoute.js";
import { supabase } from "../lib/supabaseClient";
import { LegalNoticeFull } from "./screening/LegalNotice.jsx";
import { H1_STYLE, H2_STYLE } from "./screening/format.js";

// Einheitliche Linien-Icons (24 × 24, Strich in currentColor)
const ICONS = {
  lernen: (
    <>
      <path d="M3 9l9-5 9 5-9 5z" />
      <path d="M7 11.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5" />
    </>
  ),
  pruefen: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  dranbleiben: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
};

// Links je Block: href = Seite mit Adresse, page = Seite über den page-Zustand (onGo)
const PILLARS = [
  {
    key: "lernen",
    title: "Lernen",
    text: "Die Grundlagen, kurz erklärt – von der ersten Aktie bis zur Reinigung.",
    links: [{ label: "Zum Lernpfad", href: routes.lernen() }],
  },
  {
    key: "pruefen",
    title: "Selbst prüfen",
    text: "Wie du erkennst, ob eine Aktie zu deinen Werten passt. Mit der Methodik, 30 durchgerechneten Beispielen und der Aktiensuche.",
    links: [
      { label: "Methodik", href: routes.methodik() },
      { label: "Tazkiyah 30", href: routes.tazkiyah30() },
      { label: "Aktien", href: routes.aktien() },
    ],
  },
  {
    key: "dranbleiben",
    title: "Dranbleiben",
    text: "Wochenbericht und Kalender: was an den Märkten passiert und welche Termine anstehen.",
    links: [
      { label: "Berichte", page: "reports" },
      { label: "Kalender", page: "calendar" },
    ],
  },
];

const linkClass =
  "inline-flex min-h-[44px] items-center text-[16px] font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";

function PillarLink({ link, onGo }) {
  return link.href ? (
    <a href={link.href} className={linkClass}>
      {link.label} →
    </a>
  ) : (
    <button type="button" onClick={() => onGo(link.page)} className={linkClass}>
      {link.label} →
    </button>
  );
}

function PillarCard({ pillar, onGo }) {
  return (
    <section className="card flex h-full flex-col" aria-labelledby={`saeule-${pillar.key}`}>
      <span className="icon-tile">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICONS[pillar.key]}
        </svg>
      </span>
      <h2 id={`saeule-${pillar.key}`} className="font-display mt-4" style={{ ...H2_STYLE, fontSize: "24px" }}>
        {pillar.title}
      </h2>
      <p className="mt-2 flex-1 text-[16px] leading-relaxed text-[var(--muted)]">{pillar.text}</p>
      <ul className="mt-4 flex flex-wrap gap-x-5 border-t border-[var(--line)] pt-2">
        {pillar.links.map((l) => (
          <li key={l.label}>
            <PillarLink link={l} onGo={onGo} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Neuester Wochenbericht mit Inhalt (leere Einträge zählen nicht). null = keiner, undefined = lädt. */
function useLatestReport() {
  const [report, setReport] = useState(undefined);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("weekly_reports")
      .select("week_label,report_date,tldr")
      .order("report_date", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (cancelled) return;
        const first = !error && (data || []).find((r) => String(r.tldr || "").trim());
        setReport(first || null);
      })
      .catch(() => !cancelled && setReport(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return report;
}

function WeeklyReportCard({ onGo }) {
  const report = useLatestReport();
  return (
    <section className="card space-y-3 text-left" aria-labelledby="wochenbericht">
      <h2 id="wochenbericht" className="text-[18px] font-semibold text-[var(--text)]">
        Aktueller Wochenbericht
      </h2>
      {report === undefined ? (
        <p className="text-[16px] text-[var(--muted)]">Lade …</p>
      ) : report === null ? (
        <p className="text-[16px] leading-relaxed text-[var(--muted)]">Die erste Ausgabe folgt in Kürze.</p>
      ) : (
        <>
          <p className="font-display text-[20px] text-[var(--text)]">{report.week_label}</p>
          <p className="font-[IBM_Plex_Mono] text-[14px] text-[var(--muted)]">
            {new Date(report.report_date).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
          <p className="line-clamp-4 text-[16px] leading-relaxed text-[var(--text-soft)]">{report.tldr}</p>
          <button type="button" onClick={() => onGo("reports")} className={linkClass}>
            Zum Bericht →
          </button>
        </>
      )}
    </section>
  );
}

export default function StartPage({ onGo }) {
  return (
    <div className="font-body page pb-8 pt-20">
      {/* a) Aufmacher */}
      <section className="grid items-center gap-10 min-[1000px]:grid-cols-[1.4fr_1fr] min-[1000px]:gap-14">
        <div>
          <p className="text-[15px] font-semibold text-[var(--gold-soft)]">Halal investieren auf Deutsch</p>
          <h1 className="font-display mt-3" style={{ ...H1_STYLE, fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.1 }}>
            Investieren verstehen. Schritt für Schritt.
          </h1>
          <p className="mt-5 max-w-[62ch] text-[19px] leading-relaxed text-[var(--muted)]">
            Was ist Investieren, wie geht das in Deutschland und worauf solltest du als Muslim achten? Verständlich erklärt, sorgfältig
            belegt, unabhängig.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={routes.lernen()} className="btn-primary">
              Mit den Grundlagen starten
            </a>
            <a href={routes.methodik2()} className="btn-secondary">
              Worauf du achten solltest
            </a>
          </div>
        </div>
        <WeeklyReportCard onGo={onGo} />
      </section>

      {/* b) Drei Säulen, gleich groß */}
      <section className="mt-[80px]" aria-label="Lernen, selbst prüfen, dranbleiben">
        <div className="grid gap-4 min-[900px]:grid-cols-3">
          {PILLARS.map((p) => (
            <PillarCard key={p.key} pillar={p} onGo={onGo} />
          ))}
        </div>
      </section>

      {/* d) Rechtlicher Hinweis */}
      <LegalNoticeFull className="mt-[80px]" />
    </div>
  );
}
