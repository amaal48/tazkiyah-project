// src/components/akademie/LessonPage.jsx
//
// Lektionsseite der Akademie (#/lernen/<slug>), nach dem Entwurf „Akademie – Entwurf“ (Claude Design, 18.10.2026):
// Brotkrume, Kopf (Stufe, Lektion n.n von y, Titel, Satz, Lesezeit, Stand, Die Redaktion, Sternlinie), „Kurz erklärt“,
// „Erklärung“ (Lesespalte max. 680 px, Source Serif 4), „Islamischer Blick“ (nur wenn vorhanden), „Häufige Fehler“,
// „Merke“, „Kurzes Quiz“, „Quellen“, Abschluss-Kasten (gelesen, sobald er sichtbar wird), Navigation, Hinweis,
// „Etwas unklar geblieben?“. Lange Lektionen bekommen „Auf dieser Seite“ (Desktop rechts, sonst aufklappbar).
// Im Entwurfsmodus (VITE_AKADEMIE_ENTWURF) zeigen fehlende Abschnitte graue Platzhalter.

import { useEffect, useRef, useState } from "react";
import { lessonBySlug, lessonsOfStufe, stufeByNr } from "../../data/lernpfad.js";
import { LESSON_CONTENT, isOpenable } from "../../lib/lessonFiles.js";
import { FEATURE_AKADEMIE_ENTWURF } from "../../lib/features.js";
import { routes } from "../../lib/hashRoute.js";
import { isLastOfStufe, firstOfStufe, nextLesson, nextStufe, prevLesson, stufeProgress } from "../../lib/akademie.js";
import { markRead, setLast, useProgress } from "../../lib/akademieProgress.js";
import { SECTIONS } from "../../lib/lessons.js";
import { ManuscriptFrame, StarMark, StarRule } from "../ornaments.jsx";
import { LegalNoticeFull, LegalNoticeShort } from "../screening/LegalNotice.jsx";
import AskQuestionBox from "../AskQuestionBox.jsx";
import { SERIF, inTextLink } from "../berichte/markdownStyles.js";
import { LessonBlocks, LessonInline, PlaceholderBars } from "./LessonText.jsx";
import Quiz from "./Quiz.jsx";

const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";
const H2 = { margin: 0, fontSize: "32px", lineHeight: 1.15, fontWeight: 600 };
const TITLE = Object.fromEntries(SECTIONS.map((s) => [s.key, s.title]));

const DRAFT_QUIZ = [
  {
    frage: "[Frage]",
    antworten: [
      { text: "[Antwort A]", richtig: false },
      { text: "[Antwort B, richtig]", richtig: true },
      { text: "[Antwort C]", richtig: false },
    ],
    erklaerung: "[Erklärung zur Antwort]",
  },
];

function fmtDate(iso) {
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
}

/** Kleiner gefüllter Stern (Kicker „Islamischer Blick“, Abschluss). */
function SmallStar({ color = "var(--gold)", size = 14 }) {
  return <StarMark size={size} fill={color} dot={color} />;
}

/** Abschnitt mit Anker (für „Auf dieser Seite“). */
function Section({ id, children, className = "" }) {
  return (
    <section id={`abschnitt-${id}`} aria-labelledby={`titel-${id}`} className={"scroll-mt-24 " + className}>
      {children}
    </section>
  );
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={`titel-${id}`} className="font-display text-[var(--heading)]" style={H2}>
      {children}
    </h2>
  );
}

/** Sprunglinks zu den vorhandenen Abschnitten; aktueller Abschnitt hervorgehoben. */
function Toc({ keys, active, onJump }) {
  return (
    <ul className="space-y-0.5">
      {keys.map((k) => (
        <li key={k}>
          <a
            href={`#abschnitt-${k}`}
            onClick={(e) => onJump(e, k)}
            aria-current={active === k ? "location" : undefined}
            className={
              "flex min-h-[40px] items-center border-l-[3px] pl-3 text-[15px] " +
              (active === k ? "border-[var(--gold-line)] font-semibold text-[var(--green-deep)]" : "border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--green-deep)]")
            }
          >
            {TITLE[k]}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Segmentleiste: ein Segment je Lektion der Stufe, gelesen = Link-Grün. */
function Segments({ stufe, read }) {
  return (
    <div className="mt-3 flex gap-1" aria-hidden="true">
      {lessonsOfStufe(stufe).map((l) => (
        <span key={l.slug} className={"h-2 flex-1 " + (read.has(l.slug) ? "bg-[var(--primary)]" : "bg-[var(--border)]")} />
      ))}
    </div>
  );
}

export default function LessonPage({ slug }) {
  const lesson = lessonBySlug(slug);
  const content = LESSON_CONTENT.get(slug) || null;
  const draft = FEATURE_AKADEMIE_ENTWURF;
  const progress = useProgress();
  const doneRef = useRef(null);
  const [active, setActive] = useState("kurz");

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (lesson) setLast(slug);
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gelesen, sobald der Abschluss-Kasten sichtbar wird
  useEffect(() => {
    const el = doneRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && markRead(slug), { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [slug]);

  // Vorhandene Abschnitte (im Entwurfsmodus alle außer „Islamischer Blick“, der nur mit Text erscheint)
  const has = (k) => {
    const v = content?.[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  };
  const keys = SECTIONS.map((s) => s.key).filter((k) => has(k) || (draft && (k !== "islamisch" || lesson?.islamisch)));
  const showToc = !!content?.toc;

  // Aktueller Abschnitt für „Auf dieser Seite“
  useEffect(() => {
    if (!showToc) return undefined;
    const onScroll = () => {
      let cur = keys[0];
      for (const k of keys) {
        const el = document.getElementById(`abschnitt-${k}`);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.3) cur = k;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showToc, keys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lesson) return null;

  const stufe = stufeByNr(lesson.stufe);
  const inStufe = lessonsOfStufe(lesson.stufe);
  const next = nextLesson(slug, isOpenable);
  const prev = prevLesson(slug, isOpenable);
  const sp = stufeProgress(lesson.stufe, progress.read);
  const stufeDone = isLastOfStufe(lesson) && sp.read === sp.total;
  const followStufe = nextStufe(lesson.stufe);
  const followFirst = followStufe ? firstOfStufe(followStufe.nr, isOpenable) : null;

  const jump = (e, k) => {
    e.preventDefault();
    const el = document.getElementById(`abschnitt-${k}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.querySelector("h2")?.setAttribute("tabindex", "-1");
    el?.querySelector("h2")?.focus({ preventScroll: true });
  };

  const body = (k, render, lines) => (has(k) ? render() : <PlaceholderBars label={TITLE[k]} lines={lines} />);

  return (
    <article className="font-body page pb-12 pt-8 text-left" aria-labelledby="lektion-titel">
      <div className={"mx-auto " + (showToc ? "max-w-[680px] min-[1200px]:grid min-[1200px]:max-w-[948px] min-[1200px]:grid-cols-[minmax(0,680px)_220px] min-[1200px]:gap-12" : "max-w-[680px]")}>
        <div className="min-w-0">
          {/* Kopf */}
          <nav aria-label="Brotkrumen" className="text-[14px] text-[var(--muted)]">
            <a href={routes.lernen()} className={linkClass}>
              Akademie
            </a>
            <span aria-hidden="true"> / </span>
            <a href={routes.lernen({ stufe: lesson.stufe })} className={linkClass}>
              Stufe {lesson.stufe} · {stufe.name}
            </a>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">Lektion {lesson.nr}</span>
          </nav>
          <header className="pt-8">
            <p className="kicker">
              Stufe {lesson.stufe} · Lektion {lesson.nr} von {inStufe.length}
            </p>
            <h1 id="lektion-titel" className="font-display mt-3 text-[var(--heading)]" style={{ margin: "12px 0 0", fontSize: "clamp(38px, 7vw, 56px)", lineHeight: 1.05, fontWeight: 500 }}>
              {lesson.title}
            </h1>
            <p className="mt-4 text-[20px] italic leading-normal text-[var(--text-soft)] max-[640px]:text-[18px]" style={SERIF}>
              {lesson.text}
            </p>
            <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[15px] text-[var(--muted)]">
              <span>ca. {content ? content.lesezeit : "[x]"} Min. Lesezeit</span>
              <span aria-hidden="true">·</span>
              <span>Zuletzt aktualisiert {content?.aktualisiert ? fmtDate(content.aktualisiert) : "[TT.MM.JJJJ]"}</span>
              <span aria-hidden="true">·</span>
              <span>Die Redaktion</span>
            </p>
            {draft && !content && <p className="mt-3 text-[14px] font-semibold text-[var(--gold-soft)]">Entwurfsansicht: Für diese Lektion gibt es noch keinen Text.</p>}
            <StarRule className="mt-7" />
          </header>

          {showToc && (
            <details className="mt-6 border border-[var(--border)] bg-[var(--surface)] px-4 min-[1200px]:hidden">
              <summary className="flex min-h-[48px] cursor-pointer items-center font-semibold text-[var(--green-deep)]">Auf dieser Seite</summary>
              <div className="pb-3">
                <Toc keys={keys} active={active} onJump={jump} />
              </div>
            </details>
          )}

          {/* Kurz erklärt */}
          {keys.includes("kurz") && (
            <Section id="kurz" className="mt-8">
              <div className="border border-[var(--gold-line)] bg-[var(--surface)] px-6 py-5 max-[640px]:px-4">
                <h2 id="titel-kurz" className="kicker" style={{ margin: 0 }}>
                  Kurz erklärt
                </h2>
                <div className="mt-2 text-[18px] leading-[1.65] text-[var(--text)]" style={SERIF}>
                  {body("kurz", () => <LessonBlocks blocks={content.kurz} inBox />, 3)}
                </div>
              </div>
            </Section>
          )}

          {/* Erklärung */}
          {keys.includes("erklaerung") && (
            <Section id="erklaerung" className="mt-12">
              <SectionTitle id="erklaerung">Erklärung</SectionTitle>
              <div className="mt-4 text-[19px] leading-[1.7] text-[var(--text)] max-[640px]:text-[18px]" style={SERIF}>
                {body("erklaerung", () => <LessonBlocks blocks={content.erklaerung} />, 8)}
              </div>
            </Section>
          )}

          {/* Islamischer Blick */}
          {keys.includes("islamisch") && (
            <Section id="islamisch" className="mt-12">
              <div className="border-t-[3px] border-[var(--primary)] bg-[var(--tile)] px-6 py-5 max-[640px]:px-4">
                <h2 id="titel-islamisch" className="kicker flex items-center gap-2 text-[var(--primary)]" style={{ margin: 0 }}>
                  <SmallStar color="var(--primary)" />
                  Islamischer Blick
                </h2>
                <div className="mt-2 text-[18px] leading-[1.65] text-[var(--text)]" style={SERIF}>
                  {body("islamisch", () => <LessonBlocks blocks={content.islamisch} inBox />, 4)}
                </div>
              </div>
            </Section>
          )}

          {/* Häufige Fehler */}
          {keys.includes("fehler") && (
            <Section id="fehler" className="mt-12">
              <SectionTitle id="fehler">Häufige Fehler</SectionTitle>
              <div className="mt-3 text-[18px] leading-[1.65] text-[var(--text)]" style={SERIF}>
                {body("fehler", () => <LessonBlocks blocks={content.fehler} />, 3)}
              </div>
            </Section>
          )}

          {/* Merke */}
          {keys.includes("merke") && (
            <Section id="merke" className="mt-12">
              <ManuscriptFrame innerClassName="bg-[var(--surface)] px-6 py-6 max-[640px]:px-4">
                <SectionTitle id="merke">Merke</SectionTitle>
                {has("merke") ? (
                  <ol className="mt-4 space-y-3">
                    {content.merke.map((m, i) => (
                      <li key={i} className="flex gap-3 text-[18px] leading-[1.55] text-[var(--text)]" style={SERIF}>
                        <span className="font-display w-6 flex-none text-[26px] leading-none text-[var(--gold-soft)]">{i + 1}</span>
                        <span className="min-w-0">
                          <LessonInline parts={m} />
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="mt-4">
                    <PlaceholderBars label="Merke: drei Punkte" lines={3} />
                  </div>
                )}
              </ManuscriptFrame>
            </Section>
          )}

          {/* Quiz */}
          {keys.includes("quiz") && (
            <Section id="quiz" className="mt-12">
              <SectionTitle id="quiz">Kurzes Quiz</SectionTitle>
              <div className="mt-4">
                <Quiz fragen={has("quiz") ? content.quiz : DRAFT_QUIZ} />
              </div>
            </Section>
          )}

          {/* Quellen */}
          {keys.includes("quellen") && (
            <Section id="quellen" className="mt-12 border-t border-[var(--green-deep)] pt-[18px]">
              <h2 id="titel-quellen" className="kicker font-semibold" style={{ margin: 0 }}>
                Quellen
              </h2>
              {has("quellen") ? (
                <ol className="mt-3 list-decimal pl-[22px] text-[15px] leading-relaxed text-[var(--text-soft)]">
                  {content.quellen.map((q, i) => (
                    <li key={i} id={`quelle-${i + 1}`} tabIndex={-1} className="scroll-mt-24 py-1">
                      {q.text}
                      {q.url && (
                        <>
                          {q.text ? ", " : ""}
                          <a href={q.url} target="_blank" rel="noopener noreferrer" className={inTextLink + " break-all"}>
                            {q.url.replace(/^https?:\/\//, "")}
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-3">
                  <PlaceholderBars label="Quellen" lines={2} />
                </div>
              )}
            </Section>
          )}

          {/* Abschluss */}
          <div ref={doneRef} className="mt-14">
            {stufeDone ? (
              <section className="on-green fade-in border-b-[3px] border-[var(--gold-line)] bg-[var(--green-deep)] px-7 py-7 text-[var(--on-green-soft)] max-[640px]:px-5" aria-labelledby="abschluss-titel">
                <SmallStar color="var(--gold-light)" size={28} />
                <h2 id="abschluss-titel" className="font-display mt-3 text-[var(--gold-light)]" style={H2}>
                  Stufe {lesson.stufe} abgeschlossen
                </h2>
                <p className="mt-2 text-[17px] leading-relaxed">{content?.abschluss || "[Satz zum Abschluss der Stufe, Kopfangabe „abschluss“]"}</p>
                {followStufe && (
                  <a
                    href={followFirst ? routes.lesson(followFirst.slug) : routes.lernen({ stufe: followStufe.nr })}
                    className="mt-5 inline-flex min-h-[48px] items-center justify-center border border-[var(--gold-light)] bg-[var(--gold-light)] px-6 py-3 text-[17px] font-semibold text-[var(--green-deep)]"
                  >
                    Weiter mit Stufe {followStufe.nr}: {followStufe.name} →
                  </a>
                )}
                {!followStufe && (
                  <a href={routes.lernen()} className="mt-5 inline-flex min-h-[48px] items-center justify-center border border-[var(--gold-light)] bg-[var(--gold-light)] px-6 py-3 text-[17px] font-semibold text-[var(--green-deep)]">
                    Zur Übersicht →
                  </a>
                )}
              </section>
            ) : (
              <section className="fade-in border border-[var(--gold-line)] bg-[var(--surface)] px-7 py-6 max-[640px]:px-5" aria-labelledby="abschluss-titel">
                <h2 id="abschluss-titel" className="font-display flex items-center gap-2.5 text-[var(--heading)]" style={{ ...H2, fontSize: "28px" }}>
                  <SmallStar color="var(--gold)" size={22} />
                  Lektion geschafft
                </h2>
                <p className="mt-2 text-[17px] text-[var(--text-soft)]">
                  Du hast {sp.read} von {sp.total} Lektionen in Stufe {lesson.stufe} gelesen.
                </p>
                <Segments stufe={lesson.stufe} read={progress.read} />
                {next && (
                  <a href={routes.lesson(next.slug)} className="btn-primary mt-5 max-[640px]:w-full">
                    Weiter: {next.nr} {next.title} →
                  </a>
                )}
              </section>
            )}
          </div>

          {/* Navigation */}
          <nav aria-label="Lektionen" className="mt-8 flex flex-wrap items-start justify-between gap-4 border-t border-[var(--border)] pt-5 max-[640px]:flex-col">
            {prev ? (
              <a href={routes.lesson(prev.slug)} className="group min-w-0 text-[var(--text)]">
                <span className="block text-[14px] text-[var(--muted)]">← Vorherige Lektion</span>
                <span className="font-display block text-[22px] font-semibold leading-tight text-[var(--heading)] group-hover:text-[var(--primary)]">
                  {prev.nr} {prev.title}
                </span>
              </a>
            ) : (
              <span />
            )}
            <a href={routes.lernen()} className="min-w-0 text-left min-[641px]:text-right">
              <span className="block text-[14px] text-[var(--muted)]">Übersicht</span>
              <span className={"block text-[17px] " + linkClass}>Alle Lektionen</span>
            </a>
          </nav>

          <div className="mt-10">
            <LegalNoticeShort />
            <LegalNoticeFull className="mt-4" />
          </div>

          <AskQuestionBox label="Etwas unklar geblieben?" page={`lernen/${slug}`} />
        </div>

        {showToc && (
          <aside className="hidden min-[1200px]:block" aria-label="Auf dieser Seite">
            <div className="sticky top-8 pt-[118px]">
              <p className="kicker mb-3">Auf dieser Seite</p>
              <Toc keys={keys} active={active} onJump={jump} />
            </div>
          </aside>
        )}
      </div>
    </article>
  );
}
