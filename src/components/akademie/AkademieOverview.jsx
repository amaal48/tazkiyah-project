// src/components/akademie/AkademieOverview.jsx
//
// Übersicht der Akademie (#/lernen) nach dem Entwurf „Akademie – Entwurf“ (Claude Design, 18.10.2026):
// H1, Einleitung (Platzhalter), „Alle Lektionen sind kostenlos.“; Karte „Weiter, wo du warst“ (nur mit Fortschritt
// im Browser); Kasten „Wo stehst du?“; drei Kacheln zu den Stufen; je Stufe die Lektionen als Karten.
// Handy (< 640 px): statt Kacheln und Karten Reiter je Stufe (role="tablist") und Zeilen.
// focusStufe (aus #/lernen?stufe=n): springt zur Stufe und wählt den Reiter.

import { useEffect, useRef, useState } from "react";
import { LESSONS, STUFEN, lessonsOfStufe, stufeByNr } from "../../data/lernpfad.js";
import { isOnline, isOpenable } from "../../lib/lessonFiles.js";
import { routes } from "../../lib/hashRoute.js";
import { nextStufe, resumeLesson, stufeProgress } from "../../lib/akademie.js";
import { useProgress } from "../../lib/akademieProgress.js";
import { OctaStarNumber as StarNumber, StarMark } from "../ornaments.jsx";
import { H1_STYLE } from "../screening/format.js";

const ENTRIES = [
  ["Ich fange bei null an", "1-1"],
  ["Ich will mein erstes Depot eröffnen", "2-1"],
  ["Ich investiere schon und will selbst prüfen", "3-3"],
];

const entryHref = (slug) => {
  const l = LESSONS.find((x) => x.slug === slug);
  return isOpenable(slug) ? routes.lesson(slug) : routes.lernen({ stufe: l.stufe });
};

function SmallStar({ color = "var(--gold)", size = 13 }) {
  return <StarMark size={size} fill={color} dot={color} />;
}

/** Grüner Kreis mit Haken + „Gelesen“ */
function ReadMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-[var(--primary)]">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="10" style={{ fill: "var(--primary)" }} />
        <path d="M5.5 10.2l3 3 6-6.4" fill="none" stroke="var(--paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Gelesen
    </span>
  );
}

function FolgtMark() {
  return <span className="inline-flex flex-none border border-dashed border-[var(--control-border)] px-2 py-0.5 text-[13px] font-semibold text-[var(--muted)]">folgt</span>;
}

function IslamMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[14px] text-[var(--primary)]">
      <SmallStar color="var(--primary)" />
      Islamischer Blick
    </span>
  );
}

/** Karte einer Lektion (ab 640 px). */
function LessonCard({ l, read }) {
  const online = isOnline(l.slug);
  const openable = isOpenable(l.slug);
  const isRead = read.has(l.slug);
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <StarNumber n={l.nr} size={52} stroke="var(--gold)" color={online ? "var(--gold-soft)" : "var(--muted)"} />
          <span className="kicker">Lektion {l.nr}</span>
        </span>
        {!online && <FolgtMark />}
      </div>
      <h3 className={"font-display text-[25px] font-semibold leading-tight " + (online ? "text-[var(--heading)]" : "text-[var(--muted)]")}>{l.title}</h3>
      <p className="text-[16px] leading-relaxed text-[var(--text-soft)]">{l.text}</p>
      <div className="mt-auto flex min-h-[28px] flex-wrap items-center justify-between gap-2 pt-1">
        {l.islamisch ? <IslamMark /> : <span />}
        {online && (isRead ? <ReadMark /> : <span className="text-[15px] font-semibold text-[var(--primary)]">Lesen →</span>)}
        {!online && openable && <span className="text-[14px] font-semibold text-[var(--gold-soft)]">Entwurf ansehen →</span>}
      </div>
    </>
  );
  const base = "flex h-full flex-col gap-3 p-5";
  if (online)
    return (
      <a href={routes.lesson(l.slug)} className={base + " border border-[var(--gold-line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--bg-deep)]"} aria-label={`Lektion ${l.nr}: ${l.title}${isRead ? " (gelesen)" : ""}`}>
        {inner}
      </a>
    );
  if (openable)
    return (
      <a href={routes.lesson(l.slug)} className={base + " border border-dashed border-[var(--border)] text-[var(--text)] hover:bg-[var(--bg-deep)]"}>
        {inner}
      </a>
    );
  return <div className={base + " border border-dashed border-[var(--border)]"}>{inner}</div>;
}

/** Zeile einer Lektion (Handy). */
function LessonRow({ l, read }) {
  const online = isOnline(l.slug);
  const openable = isOpenable(l.slug);
  const isRead = read.has(l.slug);
  const inner = (
    <>
      <StarNumber n={l.nr} size={46} stroke="var(--gold)" color={online ? "var(--gold-soft)" : "var(--muted)"} />
      <span className="min-w-0 flex-1">
        <span className={"font-display block text-[21px] font-semibold leading-tight " + (online ? "text-[var(--heading)]" : "text-[var(--muted)]")}>{l.title}</span>
        <span className="mt-0.5 block text-[15px] leading-snug text-[var(--text-soft)]">{l.text}</span>
        {l.islamisch && (
          <span className="mt-1 block">
            <IslamMark />
          </span>
        )}
      </span>
      <span className="flex-none self-center">
        {online ? isRead ? <ReadMark /> : <span className="text-[15px] font-semibold text-[var(--primary)]">Lesen →</span> : <FolgtMark />}
      </span>
    </>
  );
  const cls = "flex items-start gap-3 border-b border-[var(--line)] py-4";
  return openable ? (
    <a href={routes.lesson(l.slug)} className={cls + " text-[var(--text)]"}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function onlineCount(nr) {
  const list = lessonsOfStufe(nr);
  return { online: list.filter((l) => isOnline(l.slug)).length, total: list.length };
}

export default function AkademieOverview({ focusStufe = null }) {
  const progress = useProgress();
  const resume = resumeLesson(progress, isOpenable);
  const [tab, setTab] = useState(focusStufe || 1);
  const tabRefs = useRef([]);

  // Sprungmarke #/lernen?stufe=n: Reiter wählen und hinscrollen
  useEffect(() => {
    if (!focusStufe) return;
    setTab(focusStufe);
    const mobile = window.matchMedia?.("(max-width: 639px)").matches;
    const el = document.getElementById(mobile ? "stufen-reiter" : `stufe-${focusStufe}`);
    requestAnimationFrame(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focusStufe]);

  const onTabKey = (e, i) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? STUFEN.length - 1 : dir ? (i + dir + STUFEN.length) % STUFEN.length : null;
    if (to === null) return;
    e.preventDefault();
    setTab(STUFEN[to].nr);
    tabRefs.current[to]?.focus();
  };

  const tabStufe = stufeByNr(tab);
  const following = nextStufe(tab);

  return (
    <div>
      {/* a) Kopf */}
      <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(42px, 7vw, 64px)", lineHeight: 1.02 }}>
        Akademie
      </h1>
      <p className="mt-4 max-w-[62ch] text-[19px] leading-relaxed text-[var(--text-soft)]">[Einleitung: zwei bis drei Sätze, was die Akademie bietet und für wen sie gedacht ist.]</p>
      <p className="mt-3 flex items-center gap-2 text-[16px] font-semibold text-[var(--green-deep)]">
        <SmallStar color="var(--gold)" size={14} />
        Alle Lektionen sind kostenlos.
      </p>

      {/* b) + c) */}
      <div className="mt-10 flex flex-wrap gap-6">
        {resume && (
          <section aria-labelledby="weiter-titel" className="flex min-w-0 flex-[1_1_340px] items-start gap-4 border border-[var(--gold-line)] bg-[var(--surface)] p-6 max-[640px]:p-5">
            <StarNumber n={resume.nr} size={56} stroke="var(--gold)" color="var(--gold-soft)" />
            <div className="min-w-0 flex-1">
              <p id="weiter-titel" className="kicker">
                Weiter, wo du warst
              </p>
              <p className="font-display mt-1.5 text-[26px] font-semibold leading-tight text-[var(--heading)]">{resume.title}</p>
              <p className="mt-1.5 text-[15px] text-[var(--muted)]">
                Stufe {resume.stufe} · {stufeProgress(resume.stufe, progress.read).read} von {lessonsOfStufe(resume.stufe).length} Lektionen gelesen
              </p>
              <a href={routes.lesson(resume.slug)} className="btn-primary mt-4 max-[640px]:w-full">
                Weiterlesen →
              </a>
            </div>
          </section>
        )}
        <section aria-labelledby="wo-titel" className="on-green min-w-0 flex-[1_1_340px] border-b-[3px] border-[var(--gold-line)] bg-[var(--green-deep)] p-6 text-[var(--on-green-soft)] max-[640px]:p-5">
          <h2 id="wo-titel" className="font-display text-[var(--paper)]" style={{ margin: 0, fontSize: "32px", fontWeight: 600, lineHeight: 1.1 }}>
            Wo stehst du?
          </h2>
          <ul className="mt-4 grid gap-2.5">
            {ENTRIES.map(([label, slug]) => (
              <li key={slug}>
                <a href={entryHref(slug)} className="flex min-h-[48px] w-full items-center justify-between gap-3 border border-[var(--gold-line)] px-4 py-2.5 text-[17px] font-semibold text-[var(--paper)] hover:bg-[var(--primary-hover)]">
                  <span>{label}</span>
                  <span aria-hidden="true" className="text-[var(--gold-light)]">
                    →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* d) Kacheln (ab 640 px) */}
      <nav aria-label="Stufen" className="mt-12 grid gap-4 max-[639px]:hidden" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
        {STUFEN.map((s) => (
          <a key={s.nr} href={routes.lernen({ stufe: s.nr })} className="group block border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text)] hover:border-[var(--gold-line)]">
            <span className="kicker block">
              Stufe {s.nr} · {lessonsOfStufe(s.nr).length} Lektionen
            </span>
            <span className="font-display mt-1 block text-[28px] font-semibold leading-tight text-[var(--heading)] group-hover:text-[var(--primary)]">{s.name}</span>
            <span className="mt-1 block text-[15px] text-[var(--text-soft)]">{s.untertitel}</span>
          </a>
        ))}
      </nav>

      {/* e) Stufen mit Karten (ab 640 px) */}
      {STUFEN.map((s) => {
        const c = onlineCount(s.nr);
        return (
          <section key={s.nr} id={`stufe-${s.nr}`} aria-labelledby={`stufe-${s.nr}-titel`} className="mt-16 scroll-mt-24 max-[639px]:hidden">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-2 border-[var(--gold-line)] pb-3">
              <div>
                <p className="kicker">Stufe {s.nr}</p>
                <h2 id={`stufe-${s.nr}-titel`} className="font-display text-[var(--heading)]" style={{ margin: "4px 0 0", fontSize: "40px", fontWeight: 500, lineHeight: 1.1 }}>
                  {s.name}
                </h2>
                <p className="mt-1 text-[17px] text-[var(--text-soft)]">{s.untertitel}</p>
              </div>
              <p className="text-[15px] text-[var(--muted)]">
                {c.online} von {c.total} Lektionen online
              </p>
            </div>
            {c.online < c.total && <p className="mt-4 text-[16px] text-[var(--text-soft)]">Diese Stufe erscheint nach und nach. Die übrigen Lektionen folgen.</p>}
            <ol className="mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
              {lessonsOfStufe(s.nr).map((l) => (
                <li key={l.slug}>
                  <LessonCard l={l} read={progress.read} />
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {/* Handy: Reiter je Stufe und Zeilen */}
      <div id="stufen-reiter" className="mt-10 scroll-mt-4 min-[640px]:hidden">
        <div role="tablist" aria-label="Stufen" className="grid grid-cols-3 border-b border-[var(--border)]">
          {STUFEN.map((s, i) => {
            const sel = s.nr === tab;
            return (
              <button
                key={s.nr}
                ref={(el) => (tabRefs.current[i] = el)}
                type="button"
                role="tab"
                id={`reiter-${s.nr}`}
                aria-selected={sel}
                aria-controls="reiter-inhalt"
                tabIndex={sel ? 0 : -1}
                onClick={() => setTab(s.nr)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={
                  "flex min-h-[56px] flex-col items-center justify-center border-b-[3px] px-1 text-center leading-tight " +
                  (sel ? "border-[var(--gold-line)] bg-[var(--green-deep)] text-[var(--paper)]" : "border-transparent text-[var(--green-deep)]")
                }
              >
                <span className="text-[12px] uppercase tracking-[0.12em]">Stufe {s.nr}</span>
                <span className="text-[15px] font-semibold">{s.name}</span>
              </button>
            );
          })}
        </div>
        <div role="tabpanel" id="reiter-inhalt" aria-labelledby={`reiter-${tab}`} tabIndex={0}>
          <p className="mt-4 text-[15px] text-[var(--text-soft)]">
            {tabStufe.untertitel} · {onlineCount(tab).online} von {onlineCount(tab).total} Lektionen online
          </p>
          <ol className="mt-2">
            {lessonsOfStufe(tab).map((l) => (
              <li key={l.slug}>
                <LessonRow l={l} read={progress.read} />
              </li>
            ))}
          </ol>
          {following && (
            <button
              type="button"
              onClick={() => {
                setTab(following.nr);
                document.getElementById("stufen-reiter")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="btn-secondary mt-6 w-full"
            >
              Weiter zu Stufe {following.nr}: {following.name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
