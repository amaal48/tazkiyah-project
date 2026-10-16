// src/components/berichte/BlogPage.jsx
//
// Blog (#/berichte/blog), Design B2 nach der Vorlage tazkiyah-design-b2-blog.html: Themenfilter, neuester
// Beitrag groß (grüne Fläche mit Rosette und Spitzbogen-Linien), darunter weitere Beiträge.
// Beiträge: Markdown-Dateien in content/blog/ (src/lib/blogPosts.js). Ohne Beiträge ein Leer-Zustand.

import { useEffect, useState } from "react";
import { routes } from "../../lib/hashRoute.js";
import { POSTS } from "../../lib/blogPosts.js";
import { TOPICS, fmtPostDate, topicLabel } from "../../lib/blog.js";
import { ManuscriptFrame, RosetteOverlay } from "../ornaments.jsx";
import BerichteHeader from "./BerichteHeader.jsx";

const INTRO = "Eigene Texte der Redaktion: Zusammenhänge in Ruhe erklärt, mit Quellen. Zwei- bis dreimal im Monat.";
const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";

// Filter bleibt für die Sitzung erhalten
let savedTopic = null;

/** Spitzbogen-Linien auf grüner Fläche (Schmuck des neuesten Beitrags). */
function ArchLines() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 300 340" preserveAspectRatio="xMidYMax meet" width="100%" height="100%" className="absolute inset-0">
      <path d="M70 340 V150 Q70 70 150 36 Q230 70 230 150 V340" fill="none" style={{ stroke: "var(--gold-light)" }} strokeWidth="1.5" />
      <path d="M86 340 V156 Q86 84 150 54 Q214 84 214 156 V340" fill="none" style={{ stroke: "var(--gold-line)" }} strokeWidth="0.8" />
    </svg>
  );
}

function FeaturedPost({ post }) {
  return (
    <a href={routes.blogPost(post.slug)} className="group mt-8 flex flex-wrap border border-[var(--gold)] p-1.5 text-[var(--text)]">
      <div className="on-green relative min-h-[300px] min-w-0 flex-[1_1_340px] overflow-hidden bg-[var(--green-deep)] max-[640px]:min-h-[200px]">
        <RosetteOverlay opacity={0.22} />
        <ArchLines />
        <span className="kicker absolute left-6 top-[22px] text-[var(--gold-light)]">Neuester Beitrag</span>
      </div>
      <div className="flex min-w-0 flex-[1.4_1_420px] flex-col justify-center bg-[var(--surface)] px-11 py-10 max-[640px]:px-5 max-[640px]:py-7">
        {post.thema && <p className="kicker">{topicLabel(post.thema)}</p>}
        <h2 className="font-display text-[var(--heading)] group-hover:text-[var(--primary)]" style={{ margin: "12px 0 0", fontSize: "clamp(38px, 5vw, 52px)", lineHeight: 1.02, fontWeight: 500 }}>
          {post.titel}
        </h2>
        {post.anriss && <p className="mt-4 text-[18px] leading-relaxed text-[var(--text-soft)]">{post.anriss}</p>}
        <p className="mt-5 text-[14px] text-[var(--muted)]">
          Die Redaktion · {fmtPostDate(post.datum)} · ca. {post.lesezeit} Min. Lesezeit
        </p>
        <span className="mt-5 font-semibold text-[var(--primary)] group-hover:underline">Weiterlesen</span>
      </div>
    </a>
  );
}

function PostCard({ post }) {
  return (
    <a href={routes.blogPost(post.slug)} className="group block border-t-[3px] border-[var(--green-deep)] pt-[18px] text-[var(--text)]">
      {post.thema && <p className="kicker">{topicLabel(post.thema)}</p>}
      <h3 className="font-display text-[30px] font-semibold leading-[1.1] text-[var(--heading)] group-hover:text-[var(--primary)]" style={{ margin: "10px 0 0" }}>
        {post.titel}
      </h3>
      {post.anriss && <p className="mt-2.5 text-[16px] leading-relaxed text-[var(--text-soft)]">{post.anriss}</p>}
      <p className="mt-3 text-[14px] text-[var(--muted)]">
        {fmtPostDate(post.datum)} · ca. {post.lesezeit} Min.
      </p>
    </a>
  );
}

function EmptyBlog() {
  return (
    <ManuscriptFrame className="mt-8" innerClassName="bg-[var(--surface)]">
      <p className="kicker">Blog</p>
      <h2 className="font-display text-[var(--heading)]" style={{ margin: "12px 0 0", fontSize: "clamp(34px, 5vw, 44px)", lineHeight: 1.05, fontWeight: 500 }}>
        Der erste Beitrag ist in Arbeit.
      </h2>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-[var(--text-soft)]">
        Hier erscheinen bald eigene Texte der Redaktion zu Märkten, islamischem Finanzwesen und Grundbegriffen, jeweils mit Quellen. Bis dahin
        findest du die Grundlagen im Lernpfad und jeden Montag den Wochenbericht.
      </p>
      <div className="mt-5 flex flex-wrap gap-x-6">
        <a href={routes.lernen()} className={"inline-flex min-h-[44px] items-center " + linkClass}>
          Zum Lernpfad
        </a>
        <a href={routes.wochenbericht()} className={"inline-flex min-h-[44px] items-center " + linkClass}>
          Zum Wochenbericht
        </a>
      </div>
    </ManuscriptFrame>
  );
}

export default function BlogPage({ posts = POSTS }) {
  const [topic, setTopic] = useState(savedTopic);
  const choose = (t) => {
    savedTopic = t;
    setTopic(t);
  };
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  const filtered = topic ? posts.filter((p) => p.thema === topic) : posts;
  const [featured, ...rest] = filtered;

  return (
    <div className="font-body page pb-20 text-left">
      <BerichteHeader active="blog" intro={INTRO} />

      {posts.length === 0 ? (
        <EmptyBlog />
      ) : (
        <>
          <div role="group" aria-label="Nach Thema filtern" className="mt-7 flex flex-wrap gap-2">
            <button type="button" className="chip" aria-pressed={topic === null} onClick={() => choose(null)}>
              Alle
            </button>
            {TOPICS.map((t) => (
              <button key={t.key} type="button" className="chip" aria-pressed={topic === t.key} onClick={() => choose(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          {featured ? (
            <>
              <FeaturedPost post={featured} />
              {rest.length > 0 && (
                <div className="grid gap-7 pt-10" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
                  {rest.map((p) => (
                    <PostCard key={p.slug} post={p} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-8 border-t border-[var(--line)] pt-5 text-[17px] text-[var(--text-soft)]">
              Zu diesem Thema gibt es noch keinen Beitrag.{" "}
              <button type="button" onClick={() => choose(null)} className={linkClass}>
                Alle Beiträge zeigen
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
