// src/components/akademie/LessonText.jsx
//
// Darstellung des Lektionstexts (Blöcke aus src/lib/lessons.js) als React-Elemente, nie als HTML:
// Absätze, „### “-Zwischenüberschriften, Listen, Zitat, Kasten „Beispiel“ mit Rechentabelle, Glossar-Begriffe.
// [[Begriff]] wird zu einem Knopf; Antippen öffnet direkt darunter einen dunkelgrünen Kasten mit der Erklärung
// aus src/data/glossar.js. Esc oder erneutes Antippen schließt. Unbekannte Begriffe bleiben normaler Text.

import { useEffect, useId, useRef, useState } from "react";
import { Inline } from "../berichte/MarkdownBlocks.jsx";
import { findGlossar, shortDef } from "../../data/glossar.js";
import { routes } from "../../lib/hashRoute.js";

function GlossarTerm({ term, text }) {
  const entry = findGlossar(term);
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!entry) return <span>{text}</span>;
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="inline cursor-pointer p-0 text-left text-[var(--primary)] underline decoration-dotted decoration-2 underline-offset-4 hover:text-[var(--primary-hover)]"
        style={{ font: "inherit" }}
      >
        {text}
      </button>
      {open && (
        <span id={id} className="on-green font-body my-3 block border-b-[3px] border-[var(--gold-line)] bg-[var(--green-deep)] px-5 py-4 text-[16px] leading-relaxed text-[var(--on-green-soft)]">
          <span className="font-display block text-[22px] font-semibold text-[var(--gold-light)]">{entry.term}</span>
          <span className="mt-1 block">{shortDef(entry.def)}</span>
          <a href={routes.lernen({ glossar: entry.term })} className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-[var(--gold-light)] underline underline-offset-2">
            Im Glossar ansehen
          </a>
        </span>
      )}
    </>
  );
}

/** Zeile mit Glossar-Verweisen; alles andere wie im Blog. */
export function LessonInline({ parts }) {
  return parts.map((p, i) => (p.type === "glossar" ? <GlossarTerm key={i} term={p.term} text={p.text} /> : <Inline key={i} parts={[p]} />));
}

const H3 = { margin: "36px 0 0", fontSize: "28px", lineHeight: 1.2, fontWeight: 600 };

function Table({ rows }) {
  return (
    <table className="font-body mt-3 w-full border-collapse text-[16px]">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.result ? "border-t-2 border-[var(--green-deep)] font-semibold text-[var(--text)]" : "text-[var(--text-soft)]"}>
            {r.cells.map((c, k) => (
              <td key={k} className={"py-1.5 align-top " + (k === r.cells.length - 1 && r.cells.length > 1 ? "pl-4 text-right font-[IBM_Plex_Mono] text-[15px]" : "")}>
                <LessonInline parts={c} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LessonBlocks({ blocks, inBox = false }) {
  return blocks.map((b, i) => {
    const gap = i === 0 ? "" : inBox ? "mt-2.5" : "mt-5";
    switch (b.type) {
      case "h2":
      case "h3":
        return (
          <h3 key={i} className="font-display text-[var(--heading)]" style={H3}>
            {b.text}
          </h3>
        );
      case "quote":
        return (
          <blockquote key={i} className={"border-l-[3px] border-[var(--gold-line)] pl-5 italic text-[var(--text-soft)] " + gap}>
            <LessonInline parts={b.inline} />
          </blockquote>
        );
      case "ul":
      case "ol": {
        const Tag = b.type;
        return (
          <Tag key={i} className={"space-y-1.5 pl-6 " + (gap || "") + (b.type === "ul" ? " list-disc marker:text-[var(--gold)]" : " list-decimal marker:text-[var(--gold-soft)]")}>
            {b.items.map((it, k) => (
              <li key={k}>
                <LessonInline parts={it} />
              </li>
            ))}
          </Tag>
        );
      }
      case "table":
        return <Table key={i} rows={b.rows} />;
      case "beispiel":
        return (
          <aside key={i} className="my-8 border border-[var(--gold-line)] bg-[var(--tile-gold)] px-6 py-5 max-[640px]:px-4" aria-label="Beispiel">
            <p className="kicker font-body">Beispiel{b.title ? ` · ${b.title}` : ""}</p>
            <div className="mt-2 text-[17px] leading-[1.65]">
              <LessonBlocks blocks={b.blocks} inBox />
            </div>
          </aside>
        );
      default:
        return (
          <p key={i} className={gap}>
            <LessonInline parts={b.inline} />
          </p>
        );
    }
  });
}

/** Graue Platzhalter-Balken (Entwurfsmodus) mit [Abschnittsname]. */
export function PlaceholderBars({ label, lines = 4 }) {
  const widths = ["100%", "96%", "88%", "92%", "70%", "98%", "84%", "60%"];
  return (
    <div className="font-body">
      <p className="text-[15px] text-[var(--muted)]">[{label}]</p>
      <div aria-hidden="true" className="mt-2 space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-3 bg-[var(--border)]" style={{ width: widths[i % widths.length] }} />
        ))}
      </div>
    </div>
  );
}
