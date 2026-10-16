// src/components/berichte/MarkdownBlocks.jsx
//
// Darstellung von Markdown-Blöcken aus src/lib/blog.js (parseBody) als React-Elemente, nie als HTML:
// Absätze, Zwischenüberschriften, Zitat, Listen, Kästen „Kurz erklärt“ und „Einordnung für muslimische Anleger“,
// Quellenverweise. Genutzt von Blogbeitrag und Wochenbericht.

import { ManuscriptFrame } from "../ornaments.jsx";

import { inTextLink } from "./markdownStyles.js";

/** Sprung zur Quelle ohne die Hash-Adresse (Seitenadresse) zu ändern. */
function jumpTo(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

export function Inline({ parts }) {
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

export function Blocks({ blocks, dropCap = false, inBox = false }) {
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

