// src/components/berichte/BlogArticle.jsx
//
// Blogbeitrag (#/berichte/blog/<slug>), Design B2 nach der Vorlage tazkiyah-design-b2-blogartikel.html:
// Titel, Untertitel, „Die Redaktion“, Datum, Lesezeit, Lesespalte (max. 680 px, Source Serif 4),
// Kästen „Kurz erklärt“ und „Einordnung für muslimische Anleger“, Zitat, nummerierte Quellen,
// „Zuletzt aktualisiert“, „Passt dazu“ (Lernpfad), „Nächster Beitrag“, Hinweis „Keine Anlageberatung, keine Fatwa“.
// Der Text kommt aus src/lib/blog.js als Blöcke; hier werden nur React-Elemente gebaut, nie HTML eingefügt.

import { useEffect } from "react";
import { routes } from "../../lib/hashRoute.js";
import { POSTS, postBySlug } from "../../lib/blogPosts.js";
import { fmtPostDate, topicLabel } from "../../lib/blog.js";
import { LESSONS } from "../../data/lernpfad.js";
import { ManuscriptFrame, StarRule } from "../ornaments.jsx";
import { Blocks } from "./MarkdownBlocks.jsx";
import { SERIF, inTextLink } from "./markdownStyles.js";

const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";

export default function BlogArticle({ slug }) {
  const post = postBySlug(slug);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  if (!post) {
    return (
      <div className="font-body page py-14 text-left">
        <p className="text-[18px] text-[var(--text-soft)]">Diesen Beitrag gibt es nicht.</p>
        <a href={routes.blog()} className={"mt-3 inline-flex min-h-[44px] items-center " + linkClass}>
          Zum Blog
        </a>
      </div>
    );
  }

  const idx = POSTS.indexOf(post);
  const next = POSTS[idx + 1] || null; // nächstälterer Beitrag
  const lesson = post.lektion ? LESSONS.find((l) => l.nr === post.lektion) : null;

  return (
    <article className="font-body page text-left" aria-labelledby="beitrag-titel">
      <header className="mx-auto max-w-[760px] pt-14 text-center">
        <nav aria-label="Brotkrumen" className="text-[14px] text-[var(--muted)]">
          <a href={routes.wochenbericht()} className={linkClass}>
            Berichte
          </a>{" "}
          ·{" "}
          <a href={routes.blog()} className={linkClass}>
            Blog
          </a>
          {post.thema && <> · {topicLabel(post.thema)}</>}
        </nav>
        <h1 id="beitrag-titel" className="font-display text-[var(--heading)]" style={{ margin: "22px 0 0", fontSize: "clamp(46px, 8vw, 72px)", lineHeight: 1, fontWeight: 500 }}>
          {post.titel}
        </h1>
        {post.untertitel && (
          <p className="mx-auto mt-5 max-w-[620px] text-[22px] italic leading-normal text-[var(--text-soft)] max-[640px]:text-[19px]" style={SERIF}>
            {post.untertitel}
          </p>
        )}
        <p className="mt-6 flex flex-wrap justify-center gap-x-[18px] gap-y-1.5 text-[15px] text-[var(--muted)]">
          <span>Die Redaktion</span>
          <span aria-hidden="true">·</span>
          <span>{fmtPostDate(post.datum)}</span>
          <span aria-hidden="true">·</span>
          <span>ca. {post.lesezeit} Min. Lesezeit</span>
        </p>
        <StarRule className="mx-auto mt-8" />
      </header>

      <div className="mx-auto max-w-[680px] pt-7 text-[20px] leading-[1.75] text-[var(--text)] max-[640px]:text-[18px]" style={SERIF}>
        <Blocks blocks={post.blocks} dropCap />
      </div>

      <footer className="mx-auto max-w-[680px] pb-[72px] pt-12">
        <div className="border-t border-[var(--green-deep)] pt-[18px]">
          {post.quellen.length > 0 && (
            <>
              <h2 className="kicker font-semibold" style={{ margin: 0 }}>
                Quellen
              </h2>
              <ol className="mt-3 list-decimal pl-[22px] text-[15px] leading-relaxed text-[var(--text-soft)]">
                {post.quellen.map((q, i) => (
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
            </>
          )}
          <p className="mt-[18px] text-[14px] text-[var(--muted)]">
            Zuletzt aktualisiert: {fmtPostDate(post.aktualisiert || post.datum)}. Keine Anlageberatung, keine Fatwa.
          </p>
        </div>

        {(lesson || next) && (
          <div className="mt-9 flex flex-wrap gap-4">
            {lesson && (
              <a href={routes.lernen()} className="group min-w-0 flex-[1_1_280px] text-[var(--text)]">
                <ManuscriptFrame className="h-full p-[5px]" innerClassName="px-5 py-[18px]">
                  <span className="kicker">Passt dazu · Lernpfad</span>
                  <span className="font-display mt-1.5 block text-[24px] font-semibold text-[var(--heading)] group-hover:text-[var(--primary)]">
                    Lektion {lesson.nr}: {lesson.title}
                  </span>
                </ManuscriptFrame>
              </a>
            )}
            {next && (
              <a href={routes.blogPost(next.slug)} className="group min-w-0 flex-[1_1_280px] text-[var(--text)]">
                <ManuscriptFrame className="h-full p-[5px]" innerClassName="px-5 py-[18px]">
                  <span className="kicker">Nächster Beitrag</span>
                  <span className="font-display mt-1.5 block text-[24px] font-semibold text-[var(--heading)] group-hover:text-[var(--primary)]">{next.titel}</span>
                </ManuscriptFrame>
              </a>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}
