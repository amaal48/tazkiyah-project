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

const SERIF = { fontFamily: "'Source Serif 4', Georgia, serif" };
const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";
const inTextLink = "text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]";

/** Sprung zur Quelle ohne die Hash-Adresse (Seitenadresse) zu ändern. */
function jumpTo(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

function Inline({ parts }) {
  return parts.map((p, i) => {
    if (p.type === "strong") return <strong key={i}>{p.text}</strong>;
    if (p.type === "em") return <em key={i}>{p.text}</em>;
    if (p.type === "link") {
      const external = /^https?:/i.test(p.href);
      return (
        <a key={i} href={p.href} className={inTextLink} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {p.text}
        </a>
      );
    }
    if (p.type === "ref")
      return (
        <sup key={i} className="font-body text-[12px]">
          <a href={`#quelle-${p.n}`} onClick={(e) => jumpTo(e, `quelle-${p.n}`)} className={inTextLink} aria-label={`Quelle ${p.n}`}>
            {p.n}
          </a>
        </sup>
      );
    return <span key={i}>{p.text}</span>;
  });
}

const H2 = { margin: "44px 0 0", fontSize: "36px", lineHeight: 1.15, fontWeight: 600 };

function Blocks({ blocks, dropCap = false, inBox = false }) {
  let firstP = dropCap;
  return blocks.map((b, i) => {
    switch (b.type) {
      case "h2":
        return (
          <h2 key={i} className="font-display text-[var(--heading)]" style={H2}>
            {b.text}
          </h2>
        );
      case "quote":
        return (
          <blockquote key={i} className="font-display my-10 text-center text-[34px] italic leading-[1.25] text-[var(--heading)] max-[640px]:text-[28px]">
            „<Inline parts={b.inline} />“
          </blockquote>
        );
      case "ul":
      case "ol": {
        const Tag = b.type;
        return (
          <Tag key={i} className={"mt-4 space-y-1.5 pl-6 " + (b.type === "ul" ? "list-disc marker:text-[var(--gold)]" : "list-decimal marker:text-[var(--gold-soft)]")}>
            {b.items.map((it, k) => (
              <li key={k}>
                <Inline parts={it} />
              </li>
            ))}
          </Tag>
        );
      }
      case "kurz":
        return (
          <ManuscriptFrame key={i} as="aside" className="font-body my-9 p-[5px]" innerClassName="bg-[var(--surface)] px-6 py-[22px] max-[640px]:px-4">
            <p className="kicker">Kurz erklärt</p>
            {b.title && <p className="font-display mt-1.5 text-[26px] font-semibold leading-tight text-[var(--heading)]">{b.title}</p>}
            <div className="mt-2 text-[17px] leading-relaxed text-[var(--text-soft)]">
              <Blocks blocks={b.blocks} inBox />
            </div>
          </ManuscriptFrame>
        );
      case "einordnung":
        return (
          <aside key={i} className="font-body on-green my-9 border-b-[3px] border-[var(--gold-line)] bg-[var(--green-deep)] px-7 py-[26px] max-[640px]:px-5">
            <p className="kicker text-[var(--gold-light)]">Einordnung für muslimische Anleger</p>
            <div className="mt-2.5 text-[17px] leading-[1.65] text-[var(--on-green-soft)] [&_a]:text-[var(--gold-light)]">
              <Blocks blocks={b.blocks} inBox />
            </div>
          </aside>
        );
      default: {
        const cap = firstP && !inBox;
        firstP = false;
        return (
          <p key={i} className={inBox ? (i > 0 ? "mt-2.5" : "") : i === 0 ? "" : "mt-[22px]"}>
            {cap ? <DropCap parts={b.inline} /> : <Inline parts={b.inline} />}
          </p>
        );
      }
    }
  });
}

/** Erster Absatz mit großem Anfangsbuchstaben. */
function DropCap({ parts }) {
  const [first, ...rest] = parts;
  if (!first || first.type !== "text" || !first.text) return <Inline parts={parts} />;
  const letter = first.text.trimStart()[0];
  const remainder = first.text.trimStart().slice(1);
  return (
    <>
      <span aria-hidden="true" className="font-display float-left pr-2.5 pt-2 text-[84px] leading-[0.8] text-[var(--heading)]">
        {letter}
      </span>
      <span className="sr-only-label">{letter}</span>
      <Inline parts={[{ type: "text", text: remainder }, ...rest]} />
    </>
  );
}

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
