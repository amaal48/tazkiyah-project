// src/components/StartPage.jsx
//
// Startseite (#/), Design B2 „Das Muster, hell“ (16.10.2026), Aufbau nach der Vorlage
// tazkiyah-design-b2-startseite.html: Aufmacher mit Spitzbogen und Wochenbericht, grünes Band
// „Drei Wege durch Tazkiyah“ (Lernen → Selbst prüfen → Dranbleiben; seit 18.10.2026 hell, Entwurf „Startseite ruhiger“), die Tazkiyah 30 und „Diese Woche“
// in Manuskript-Rahmen, darunter der rechtliche Hinweis. Platzhalter der Vorlage sind durch echte Daten
// ersetzt (Wochenbericht: neueste veröffentlichte Ausgabe aus weekly_reports, Endergebnisse der Tazkiyah 30, Termine aus company_calendar)
// oder durch „folgt“. Die Legende (konform / nicht konform) steht nur auf der Seite der Tazkiyah 30.
// Archiv Tazkiyah 30 (17.10.2026, VITE_FEATURE_TAZKIYAH30 aus): Kasten „Die Tazkiyah 30“ und der Link
// darauf ausgeblendet, „Diese Woche“ steht allein.

import { useMemo } from "react";
import { routes } from "../lib/hashRoute.js";
import { usePublishedReports } from "../lib/weeklyReportsData.js";
import { reportSlug } from "../lib/weeklyReport.js";
import { useScreeningList } from "../lib/screeningData.js";
import { todayIso, upcomingEvents, useCalendarList } from "../lib/calendarData.js";
import { addDays } from "../calendar/secCalendar.js";
import { TAZKIYAH30_SIZE } from "../data/tazkiyah30.js";
import { FEATURE_TAZKIYAH30 } from "../lib/features.js";
import { LegalNoticeFull } from "./screening/LegalNotice.jsx";
import { ArchFrame, Frieze, ManuscriptFrame, OctaStarNumber, StarRule } from "./ornaments.jsx";
import { AKADEMIE_PRUEFEN_LINK } from "../lib/lessonFiles.js";
import { SOON_KEYS } from "./Sidebar.jsx";
import { POSTS } from "../lib/blogPosts.js";
import { topicLabel } from "../lib/blog.js";

const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";
const wayLink = "inline-flex min-h-[44px] items-center font-semibold text-[var(--primary)] underline-offset-4 hover:text-[var(--primary-hover)] hover:underline";
// Zweiter, kleinerer Link unter dem Hauptlink (höchstens einer je Weg)
const waySubLink = "-mt-2 inline-flex min-h-[44px] items-center text-[15px] text-[var(--text-soft)] underline underline-offset-4 decoration-[var(--border)] hover:text-[var(--green-deep)] hover:decoration-[var(--text-soft)]";

/** Link auf eine Seite mit Adresse (href) oder über den page-Zustand (page → onGo). */
function NavLink({ link, onGo, className }) {
  return link.href ? (
    <a href={link.href} className={className}>
      {link.label}
    </a>
  ) : (
    <button type="button" onClick={() => onGo(link.page)} className={className}>
      {link.label}
    </button>
  );
}

const WAYS = [
  {
    n: 1,
    title: "Lernen",
    text: "Die Grundlagen, kurz erklärt – von der ersten Aktie bis zur Reinigung.",
    link: { label: "Zur Akademie →", href: routes.lernen() },
  },
  {
    n: 2,
    title: "Selbst prüfen",
    // Archiv Tazkiyah 30 (17.10.2026): ohne „30 Beispiele“ und ohne Link auf die Tazkiyah 30
    text: FEATURE_TAZKIYAH30
      ? "Wie du erkennst, ob eine Aktie zu deinen Werten passt – mit Methodik, 30 Beispielen und der Aktiensuche."
      : "Wie du erkennst, ob eine Aktie zu deinen Werten passt – mit der Methodik und der Aktiensuche.",
    link: { label: "So prüfst du selbst →", href: AKADEMIE_PRUEFEN_LINK },
    sub: { label: "Aktie nachschlagen", href: routes.aktien() },
  },
  {
    n: 3,
    title: "Dranbleiben",
    text: "Wochenbericht und Kalender: was an den Märkten passiert und welche Termine anstehen.",
    link: { label: "Zum Wochenbericht →", href: routes.wochenbericht() },
    // Kalender erst, wenn er in der Seitenleiste freigeschaltet ist (SOON_KEYS in Sidebar.jsx)
    sub: SOON_KEYS.has("kalender") ? null : { label: "Kalender", page: "calendar" },
  },
];

function fmtLong(ts) {
  return new Date(ts).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
}

/** Karte im Spitzbogen: neueste veröffentlichte Ausgabe (nur status = veroeffentlicht). */
function WeeklyReportCard() {
  const { loading, reports } = usePublishedReports();
  const report = reports[0] || null;
  return (
    <section className="border-t-[3px] border-[var(--gold-line)] bg-[var(--paper)] px-[26px] py-7 text-[var(--text)]" aria-labelledby="wochenbericht">
      <p className="kicker">{report ? `Wochenbericht · KW ${report.kw}` : "Wochenbericht"}</p>
      {loading ? (
        <p className="mt-3 text-[15px] text-[var(--text-soft)]">Lade …</p>
      ) : !report ? (
        <>
          <h2 id="wochenbericht" className="font-display mt-2.5 text-[32px] font-semibold leading-[1.1] text-[var(--heading)]">
            Die erste Ausgabe erscheint in Kürze.
          </h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--text-soft)]">Das Wichtigste der Woche in drei Sätzen, jeden Montag.</p>
        </>
      ) : (
        <>
          <h2 id="wochenbericht" className="font-display mt-2.5 text-[32px] font-semibold leading-[1.1] text-[var(--heading)]">
            {report.titel}
          </h2>
          <p className="mt-2.5 line-clamp-3 text-[15px] leading-relaxed text-[var(--text-soft)]">{report.drei_saetze}</p>
          <div className="mt-3.5 flex flex-wrap items-baseline justify-between gap-x-4">
            <a href={routes.wochenbericht(reportSlug(report))} className={"inline-flex min-h-[44px] items-center " + linkClass}>
              Zum Bericht
            </a>
            {report.veroeffentlicht_am && <span className="text-[13px] text-[var(--muted)]">{fmtLong(report.veroeffentlicht_am)}</span>}
          </div>
        </>
      )}
    </section>
  );
}

/** Schmale Leiste mit den letzten Blogbeiträgen; ohne Beiträge ausgeblendet. */
function BlogStrip() {
  const latest = POSTS.slice(0, 3);
  if (latest.length === 0) return null;
  return (
    <section className="page pb-16" aria-labelledby="aus-dem-blog">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--green-deep)] pb-3">
        <h2 id="aus-dem-blog" className="font-display text-[var(--heading)]" style={{ margin: 0, fontSize: "32px", fontWeight: 500 }}>
          Aus dem Blog
        </h2>
        <a href={routes.blog()} className={"inline-flex min-h-[44px] items-center " + linkClass}>
          Zum Blog
        </a>
      </div>
      <ul className="grid gap-x-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
        {latest.map((p) => (
          <li key={p.slug} className="border-b border-[var(--line)]">
            <a href={routes.blogPost(p.slug)} className="group block py-4 text-[var(--text)]">
              {p.thema && <span className="kicker">{topicLabel(p.thema)}</span>}
              <span className="font-display mt-1 block text-[24px] font-semibold leading-tight text-[var(--heading)] group-hover:text-[var(--primary)]">{p.titel}</span>
              <span className="mt-1 block text-[14px] text-[var(--muted)]">ca. {p.lesezeit} Min. Lesezeit</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Endergebnisse der Tazkiyah 30, alphabetisch (keine Rangfolge). */
function Tazkiyah30Box() {
  const { rows, loading, error } = useScreeningList();
  const done = rows.filter((r) => r.hasFinalResult).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const shown = done.slice(0, 6);
  return (
    <ManuscriptFrame className="min-w-0 flex-[1_1_400px]" as="section" aria-labelledby="t30-titel">
      <p className="kicker">Aus der Prüfung</p>
      <h2 id="t30-titel" className="font-display mt-2.5 text-[42px] leading-[1.05] text-[var(--heading)]">
        Die Tazkiyah 30
      </h2>
      <p className="mt-2.5 text-[17px] leading-relaxed text-[var(--text-soft)]">
        Dreißig Aktien, von Hand nach AAOIFI-Standard Nr. 21 geprüft, jede Aussage mit Fundstelle.
      </p>
      <ul className="mt-5">
        {loading && <li className="border-b border-[var(--line)] py-3 text-[var(--text-soft)]">Lade …</li>}
        {!loading && (error || shown.length === 0) && (
          <li className="border-b border-[var(--line)] py-3 text-[var(--text-soft)]">Erste Ergebnisse folgen.</li>
        )}
        {shown.map((r) => (
          <li key={r.ticker} className="border-b border-[var(--line)]">
            <a href={routes.stock(r.ticker)} className="flex min-h-[48px] items-center justify-between gap-4 py-2 text-[17px] text-[var(--text)] hover:text-[var(--primary)]">
              <span className="min-w-0">{r.name}</span>
              <span className={"flex-none font-semibold " + (r.status === "konform" ? "text-[var(--ok-text)]" : "text-[var(--bad-text)]")}>
                {r.status === "konform" ? "konform" : "nicht konform"}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <a href={routes.tazkiyah30()} className={"inline-flex min-h-[44px] items-center " + linkClass}>
          Alle 30 ansehen
        </a>
        {!loading && !error && (
          <span className="text-[14px] text-[var(--muted)]">
            {done.length} von {TAZKIYAH30_SIZE} geprüft
          </span>
        )}
      </div>
    </ManuscriptFrame>
  );
}

const KIND_TEXT = { zahlen: "Quartalszahlen", hv: "Hauptversammlung" };
const MAX_EVENTS = 5;

function dayShort(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const wd = d.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${wd} ${d.getUTCDate()}.`;
}

/** Termine der nächsten 7 Tage: Tazkiyah 30 zuerst (im Archiv ohne Vorrang), aufgefüllt mit weiteren Aktien, nach Datum. */
function ThisWeekBox({ onGo }) {
  const cal = useCalendarList();
  const list = useScreeningList();
  const from = todayIso();
  const to = addDays(from, 6);
  const { shown, total } = useMemo(() => {
    const all = upcomingEvents(cal.rows, from, to)
      .map((e) => ({ ...e, sec: list.byTicker.get(e.ticker) }))
      .filter((e) => e.sec);
    const t30 = all.filter((e) => e.sec.inTazkiyah30);
    const pick = [...t30, ...all.filter((e) => !e.sec.inTazkiyah30)].slice(0, MAX_EVENTS);
    pick.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { shown: pick, total: all.length };
  }, [cal.rows, list.rows, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const loading = cal.loading || list.loading;

  return (
    <ManuscriptFrame className="min-w-0 flex-[1_1_400px]" as="section" aria-labelledby="woche-titel">
      <p className="kicker">Kalender</p>
      <h2 id="woche-titel" className="font-display mt-2.5 text-[42px] leading-[1.05] text-[var(--heading)]">
        Diese Woche
      </h2>
      <ul className="mt-5">
        {loading && <li className="border-b border-[var(--line)] py-3 text-[var(--text-soft)]">Lade …</li>}
        {!loading && shown.length === 0 && (
          <li className="border-b border-[var(--line)] py-3 text-[var(--text-soft)]">In den nächsten sieben Tagen stehen keine Termine an.</li>
        )}
        {shown.map((e) => (
          <li key={`${e.ticker}-${e.kind}`} className="flex items-baseline gap-[18px] border-b border-[var(--line)] py-3">
            <span className="font-display w-16 flex-none text-[24px] text-[var(--gold-soft)]">{dayShort(e.date)}</span>
            <a href={routes.stock(e.ticker)} className="min-w-0 text-[17px] text-[var(--text)] hover:text-[var(--primary)]">
              {KIND_TEXT[e.kind]} · {e.sec.name}
              {e.kind === "zahlen" && e.status !== "bestaetigt" && <span className="text-[var(--muted)]"> (voraussichtlich)</span>}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <button type="button" onClick={() => onGo("calendar")} className={"inline-flex min-h-[44px] items-center " + linkClass}>
          Zum Kalender
        </button>
        {!loading && total > shown.length && <span className="text-[14px] text-[var(--muted)]">{total - shown.length} weitere Termine</span>}
      </div>
    </ManuscriptFrame>
  );
}

export default function StartPage({ onGo }) {
  return (
    <div className="font-body">
      {/* Aufmacher */}
      <div className="page">
        <section className="flex flex-wrap items-center gap-14 pb-20 pt-[72px] max-[640px]:gap-10 max-[640px]:pt-12">
          <div className="min-w-0 flex-[3_1_520px]">
            <p className="kicker text-[15px]">Halal investieren auf Deutsch</p>
            <h1
              className="font-display text-[var(--heading)]"
              style={{ fontSize: "clamp(48px, 8vw, 84px)", lineHeight: 0.98, fontWeight: 500, margin: "18px 0 0" }}
            >
              Investieren verstehen. <span className="italic text-[var(--gold-soft)]">Schritt für Schritt.</span>
            </h1>
            <p className="mt-[26px] max-w-[560px] text-[20px] leading-relaxed text-[var(--text-soft)]">
              Was ist Investieren, wie geht das in Deutschland, und worauf solltest du als Muslim achten? Verständlich erklärt, sorgfältig
              belegt, unabhängig.
            </p>
            <div className="mt-[34px] flex flex-wrap gap-3.5">
              <a href={routes.lernen()} className="btn-primary">
                Mit den Grundlagen starten
              </a>
              <a href={routes.methodik2()} className="btn-secondary">
                Worauf du achten solltest
              </a>
            </div>
          </div>

          <div className="w-full min-w-0 flex-[2_1_340px]">
            <ArchFrame minHeight={520} paddingTop={200} className="mx-auto max-w-[460px]">
              <div className="px-9 pb-9 max-[640px]:px-6 max-[640px]:pb-6">
                <WeeklyReportCard />
              </div>
            </ArchFrame>
          </div>
        </section>
      </div>

      {/* Aus dem Blog (nur mit Beiträgen) */}
      <BlogStrip />

      {/* Drei Wege: hell (18.10.2026), Grün nur noch im Bogen des Aufmachers */}
      <section aria-labelledby="drei-wege" className="border-y border-[var(--border)] bg-[var(--surface)]">
        <Frieze />
        <div className="page py-[72px] max-[640px]:py-14">
          <h2 id="drei-wege" className="font-display text-center text-[48px] leading-tight text-[var(--green-deep)] max-[640px]:text-[38px]" style={{ margin: 0, fontWeight: 500 }}>
            Drei Wege durch Tazkiyah
          </h2>
          <StarRule className="mx-auto mt-4" />
          <div className="mt-10 grid gap-10" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
            {WAYS.map((w) => (
              <section key={w.n} className="text-center" aria-labelledby={`weg-${w.n}`}>
                <OctaStarNumber n={w.n} size={72} className="mx-auto" />
                <h3 id={`weg-${w.n}`} className="font-display text-[34px] font-semibold leading-tight text-[var(--green-deep)]" style={{ margin: "14px 0 0" }}>
                  <span className="sr-only-label">Weg {w.n}: </span>
                  {w.title}
                </h3>
                <p className="mx-auto mt-2.5 max-w-[320px] text-[17px] leading-relaxed text-[var(--text-soft)]">{w.text}</p>
                <div className="mt-3 flex flex-col items-center">
                  <NavLink link={w.link} onGo={onGo} className={wayLink} />
                  {w.sub && <NavLink link={w.sub} onGo={onGo} className={waySubLink} />}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      {/* Tazkiyah 30 und Diese Woche */}
      <div className="page pb-8 pt-[72px] max-[640px]:pt-12">
        <div className="flex flex-wrap gap-8">
          {FEATURE_TAZKIYAH30 && <Tazkiyah30Box />}
          <ThisWeekBox onGo={onGo} />
        </div>
        <LegalNoticeFull className="mt-12" />
      </div>
    </div>
  );
}
