// src/components/berichte/WochenberichtPage.jsx
//
// Wochenbericht (#/berichte/wochenbericht), Design B2 nach der Vorlage tazkiyah-design-b2-wochenbericht.html:
// aktuelle veröffentlichte Ausgabe im Manuskript-Rahmen (KW, Datum, Lesezeit, „Das Wichtigste in drei Sätzen“,
// Inhaltsverzeichnis), daneben das Abo-Feld, darunter frühere Ausgaben mit Jahresfilter.
// Eine Ausgabe: #/berichte/wochenbericht/2026-kw42 (WochenberichtArticle.jsx).
// Daten: nur status = 'veroeffentlicht' (supabase_wochenbericht.sql); Entwürfe sind hier nie sichtbar.
//
// Abo-Feld vorerst NUR OPTIK („folgt in Kürze“): Es wird keine E-Mail-Adresse gespeichert oder gesendet,
// bis eigene Domain, Double-Opt-in und Datenschutzerklärung stehen.

import { useEffect, useMemo, useState } from "react";
import { routes } from "../../lib/hashRoute.js";
import { usePublishedReports } from "../../lib/weeklyReportsData.js";
import { parseReportSlug, reportMinutes, reportSlug, splitSections } from "../../lib/weeklyReport.js";
import { GreenBand, ManuscriptFrame, StarOutline } from "../ornaments.jsx";
import BerichteHeader from "./BerichteHeader.jsx";
import WochenberichtArticle from "./WochenberichtArticle.jsx";

const INTRO = "Jeden Montag: was an den Märkten in der vergangenen Woche passiert ist und was es bedeutet.";
const EARLIER_LIMIT = 8;
const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";

function fmtLong(ts) {
  return new Date(ts).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
}
const issueDate = (r) => r.veroeffentlicht_am || `${r.zeitraum_bis}T12:00:00Z`;

/** Abo-Feld, nur Optik. Kein Formular, das etwas absendet. */
function SubscribeBox() {
  return (
    <GreenBand as="aside" opacity={0.2} className="min-w-0 flex-[1_1_320px]" aria-labelledby="abo-titel">
      <div className="px-8 py-10 max-[640px]:px-5 max-[640px]:py-8">
        <StarOutline />
        <h2 id="abo-titel" className="font-display" style={{ margin: "14px 0 0", fontSize: "38px", lineHeight: 1.05, fontWeight: 500 }}>
          Jeden Montag in deinem Postfach
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--on-green-soft)]">
          Die drei wichtigsten Sätze der Woche, mit Link zur ganzen Ausgabe. Kostenlos, ohne Konto.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <label htmlFor="abo-mail" className="text-[14px] font-semibold text-[var(--gold-light)]">
            E-Mail-Adresse
          </label>
          <input
            id="abo-mail"
            type="email"
            disabled
            aria-describedby="abo-hinweis"
            placeholder="name@beispiel.de"
            className="min-h-[50px] w-full cursor-not-allowed bg-[var(--paper)] px-4 text-[17px] text-[var(--text)] opacity-80 placeholder:text-[var(--muted)]"
          />
          <button type="button" disabled aria-describedby="abo-hinweis" className="min-h-[50px] cursor-not-allowed bg-[var(--gold-light)] px-4 text-[16px] font-semibold text-[var(--green-deep)] opacity-80">
            Abo folgt in Kürze
          </button>
        </div>
        <p id="abo-hinweis" className="mt-3.5 text-[14px] leading-relaxed text-[var(--on-green-soft)]">
          Das Abo startet in Kürze, mit Bestätigungsmail und Abmeldung per Klick. Bis dahin speichern wir keine E-Mail-Adressen.
        </p>
      </div>
    </GreenBand>
  );
}

function CurrentIssue({ report }) {
  const sections = splitSections(report.body_md).filter((s) => s.heading);
  const toc = [...sections.map((s) => s.heading), ...(String(report.einordnung || "").trim() ? ["Einordnung für muslimische Anleger"] : [])];
  return (
    <ManuscriptFrame as="article" className="min-w-0 flex-[2_1_560px]" innerClassName="bg-[var(--surface)] px-10 pb-9 pt-10 max-[640px]:px-5 max-[640px]:pt-7" aria-labelledby="aktuell-titel">
      <div className="kicker flex flex-wrap justify-between gap-2">
        <span>Aktuelle Ausgabe · KW {report.kw}</span>
        <span>
          {fmtLong(issueDate(report))} · ca. {reportMinutes(report)} Min.
        </span>
      </div>
      <h2 id="aktuell-titel" className="font-display text-[var(--heading)]" style={{ margin: "16px 0 0", fontSize: "clamp(36px, 5vw, 48px)", lineHeight: 1.05, fontWeight: 500 }}>
        {report.titel}
      </h2>
      <div className="mt-[22px] border-l-[3px] border-[var(--gold-line)] py-1 pl-5">
        <p className="text-[13px] uppercase tracking-[0.12em] text-[var(--muted)]">Das Wichtigste in drei Sätzen</p>
        <p className="mt-2 text-[18px] leading-relaxed text-[var(--text)]">{report.drei_saetze}</p>
      </div>
      {toc.length > 0 && (
        <>
          <p className="mt-7 text-[13px] uppercase tracking-[0.12em] text-[var(--muted)]">In dieser Ausgabe</p>
          <ol className="mt-2.5 grid gap-x-8 text-[16px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))" }}>
            {toc.map((t, i) => (
              <li key={t + i} className="flex gap-3 border-b border-[var(--line)] py-2.5">
                <span className="font-display w-[22px] flex-none text-[20px] leading-none text-[var(--gold-soft)]">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <a href={routes.wochenbericht(reportSlug(report))} className="btn-primary mt-7">
        Ganze Ausgabe lesen
      </a>
    </ManuscriptFrame>
  );
}

function EmptyIssue() {
  return (
    <ManuscriptFrame className="min-w-0 flex-[2_1_560px]" innerClassName="bg-[var(--surface)] flex flex-col justify-center">
      <p className="kicker">Wochenbericht</p>
      <h2 className="font-display text-[var(--heading)]" style={{ margin: "16px 0 0", fontSize: "clamp(36px, 5vw, 48px)", lineHeight: 1.05, fontWeight: 500 }}>
        Die erste Ausgabe erscheint in Kürze.
      </h2>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-[var(--text-soft)]">
        Jede Ausgabe fasst die vergangene Woche in drei Sätzen zusammen und ordnet sie für muslimische Anleger ein, mit Quellen zu jeder Aussage.
      </p>
    </ManuscriptFrame>
  );
}

function EarlierIssues({ reports }) {
  const years = useMemo(() => [...new Set(reports.map((r) => r.jahr))].sort((a, b) => b - a), [reports]);
  const [year, setYear] = useState(years[0]);
  const [all, setAll] = useState(false);
  const inYear = reports.filter((r) => r.jahr === year);
  const shown = all ? inYear : inYear.slice(0, EARLIER_LIMIT);

  return (
    <section className="pb-[72px]" aria-labelledby="frueher">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--green-deep)] pb-3.5">
        <h2 id="frueher" className="font-display text-[var(--heading)]" style={{ margin: 0, fontSize: "40px", fontWeight: 500 }}>
          Frühere Ausgaben
        </h2>
        {years.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Nach Jahr filtern">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className="chip"
                aria-pressed={y === year}
                onClick={() => {
                  setYear(y);
                  setAll(false);
                }}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>
      {reports.length === 0 ? (
        <p className="py-5 text-[var(--text-soft)]">Noch keine früheren Ausgaben.</p>
      ) : (
        <ul>
          {shown.map((r) => (
            <li key={r.id}>
              <a
                href={routes.wochenbericht(reportSlug(r))}
                className="grid items-baseline gap-x-5 gap-y-1 border-b border-[var(--line)] py-[18px] text-[var(--text)] hover:text-[var(--primary)] min-[641px]:grid-cols-[90px_minmax(0,1fr)_150px]"
              >
                <span className="font-display text-[24px] text-[var(--gold-soft)]">KW {r.kw}</span>
                <span className="text-[18px]">{r.titel}</span>
                <span className="text-[14px] text-[var(--muted)] min-[641px]:text-right">{fmtLong(issueDate(r))}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {!all && inYear.length > EARLIER_LIMIT && (
        <button type="button" onClick={() => setAll(true)} className={"mt-5 inline-flex min-h-[44px] items-center " + linkClass}>
          Alle Ausgaben anzeigen
        </button>
      )}
    </section>
  );
}

function IssueNav({ report, reports }) {
  const i = reports.indexOf(report);
  const newer = i > 0 ? reports[i - 1] : null;
  const older = i < reports.length - 1 ? reports[i + 1] : null;
  if (!newer && !older) return null;
  const card = (r, label) => (
    <ManuscriptFrame as="div" className="min-w-0 flex-[1_1_260px] p-[5px]" innerClassName="px-5 py-4">
      <a href={routes.wochenbericht(reportSlug(r))} className="block text-[var(--text)] hover:text-[var(--primary)]">
        <span className="kicker">
          {label} · KW {r.kw}
        </span>
        <span className="font-display mt-1.5 block text-[24px] font-semibold text-[var(--heading)]">{r.titel}</span>
      </a>
    </ManuscriptFrame>
  );
  return (
    <div className="mt-8 flex flex-wrap gap-4">
      {older && card(older, "Vorherige Ausgabe")}
      {newer && card(newer, "Nächste Ausgabe")}
    </div>
  );
}

export default function WochenberichtPage({ slug = null }) {
  const { loading, reports } = usePublishedReports();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  if (slug) {
    const key = parseReportSlug(slug);
    const report = key && reports.find((r) => r.jahr === key.jahr && r.kw === key.kw);
    return (
      <div className="page pb-16">
        {loading ? (
          <p className="py-14 text-[var(--text-soft)]">Lade Ausgabe …</p>
        ) : report ? (
          <WochenberichtArticle
            report={report}
            breadcrumb={
              <nav aria-label="Brotkrumen" className="text-[14px] text-[var(--muted)]">
                <a href={routes.wochenbericht()} className={linkClass}>
                  Berichte
                </a>{" "}
                ·{" "}
                <a href={routes.wochenbericht()} className={linkClass}>
                  Wochenbericht
                </a>{" "}
                · KW {report.kw}
              </nav>
            }
            footer={<IssueNav report={report} reports={reports} />}
          />
        ) : (
          <div className="py-14">
            <p className="text-[18px] text-[var(--text-soft)]">Diese Ausgabe gibt es nicht.</p>
            <a href={routes.wochenbericht()} className={"mt-3 inline-flex min-h-[44px] items-center " + linkClass}>
              Zum aktuellen Wochenbericht
            </a>
          </div>
        )}
      </div>
    );
  }

  const [current, ...earlier] = reports;
  return (
    <div className="font-body page text-left">
      <BerichteHeader active="wochenbericht" intro={INTRO} />
      <div className="flex flex-wrap gap-8 pb-16 pt-10">
        {loading ? (
          <ManuscriptFrame className="min-w-0 flex-[2_1_560px]" innerClassName="bg-[var(--surface)]">
            <p className="text-[var(--text-soft)]">Lade Wochenbericht …</p>
          </ManuscriptFrame>
        ) : current ? (
          <CurrentIssue report={current} />
        ) : (
          <EmptyIssue />
        )}
        <SubscribeBox />
      </div>
      {!loading && current && <EarlierIssues reports={earlier} />}
    </div>
  );
}
