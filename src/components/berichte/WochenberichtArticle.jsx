// src/components/berichte/WochenberichtArticle.jsx
//
// Eine Ausgabe des Wochenberichts (öffentliche Seite und Vorschau auf der Prüfseite, gleiche Darstellung):
// Titel, „Wochenbericht KW … · Zeitraum · Lesezeit · Die Redaktion“, „Das Wichtigste in drei Sätzen“,
// Fließtext aus Markdown, Kasten „Einordnung für muslimische Anleger“, nummerierte Quellen, Hinweis,
// ggf. „Korrigiert am …“. Lücken ([eckige Klammern]) werden in der Vorschau farbig markiert.

import { parseBody } from "../../lib/blog.js";
import { REPORT_NOTICE, fmtBerlin, fmtRange, reportMinutes } from "../../lib/weeklyReport.js";
import { StarRule } from "../ornaments.jsx";
import { Blocks } from "./MarkdownBlocks.jsx";
import { SERIF, inTextLink } from "./markdownStyles.js";

const H2 = { margin: "44px 0 0", fontSize: "36px", lineHeight: 1.15, fontWeight: 600 };

/** Text mit hervorgehobenen [Lücken] (nur Vorschau). */
function WithGaps({ text, mark }) {
  if (!mark) return text;
  const parts = String(text).split(/(\[[^\]\n]*\](?!\())/g);
  return parts.map((p, i) =>
    /^\[[^\]\n]*\]$/.test(p) ? (
      <mark key={i} className="bg-[var(--gap-bg)] px-1 text-[var(--gap-text)]">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function WochenberichtArticle({ report, preview = false, breadcrumb = null, footer = null }) {
  const blocks = parseBody(report.body_md || "");
  const einordnung = String(report.einordnung || "").trim();
  const quellen = Array.isArray(report.quellen) ? report.quellen : [];

  return (
    <article className="font-body text-left" aria-labelledby="ausgabe-titel">
      <header className="mx-auto max-w-[760px] pt-14 text-center max-[640px]:pt-8">
        {breadcrumb}
        <h1 id="ausgabe-titel" className="font-display text-[var(--heading)]" style={{ margin: "22px 0 0", fontSize: "clamp(42px, 7vw, 64px)", lineHeight: 1.02, fontWeight: 500 }}>
          <WithGaps text={report.titel || "Ohne Titel"} mark={preview} />
        </h1>
        <p className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[15px] text-[var(--muted)]">
          <span>Wochenbericht KW {report.kw}</span>
          <span aria-hidden="true">·</span>
          {report.zeitraum_von && report.zeitraum_bis && (
            <>
              <span>{fmtRange(report.zeitraum_von, report.zeitraum_bis)}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>ca. {reportMinutes(report)} Min. Lesezeit</span>
          <span aria-hidden="true">·</span>
          <span>Die Redaktion</span>
        </p>
        <StarRule className="mx-auto mt-8" />
      </header>

      <div className="mx-auto max-w-[680px] pt-7">
        <div className="border-l-[3px] border-[var(--gold-line)] py-1 pl-5">
          <p className="text-[13px] uppercase tracking-[0.12em] text-[var(--muted)]">Das Wichtigste in drei Sätzen</p>
          <p className="mt-2 text-[19px] leading-relaxed text-[var(--text)]" style={SERIF}>
            <WithGaps text={report.drei_saetze} mark={preview} />
          </p>
        </div>

        <div className="mt-8 text-[20px] leading-[1.75] text-[var(--text)] max-[640px]:text-[18px]" style={SERIF}>
          {preview ? (
            // Vorschau: Lücken markieren (eigene, einfache Darstellung der Absätze)
            blocks.map((b, i) =>
              b.type === "h2" ? (
                <h2 key={i} className="font-display text-[var(--heading)]" style={H2}>
                  <WithGaps text={b.text} mark />
                </h2>
              ) : (
                <BlocksWithGaps key={i} block={b} first={i === 0} />
              )
            )
          ) : (
            <Blocks blocks={blocks} />
          )}
        </div>

        {einordnung && (
          <aside className="on-green my-10 border-b-[3px] border-[var(--gold-line)] bg-[var(--green-deep)] px-7 py-[26px] max-[640px]:px-5" aria-label="Einordnung für muslimische Anleger">
            <p className="kicker text-[var(--gold-light)]">Einordnung für muslimische Anleger</p>
            {einordnung.split(/\n{2,}/).map((p, i) => (
              <p key={i} className={(i ? "mt-3 " : "mt-2.5 ") + "text-[17px] leading-[1.65] text-[var(--on-green-soft)]"}>
                <WithGaps text={p.replace(/\n/g, " ")} mark={preview} />
              </p>
            ))}
          </aside>
        )}

        <footer className="mt-12 border-t border-[var(--green-deep)] pt-[18px] pb-4">
          {quellen.length > 0 && (
            <>
              <h2 className="kicker font-semibold" style={{ margin: 0 }}>
                Quellen
              </h2>
              <ol className="mt-3 text-[15px] leading-relaxed text-[var(--text-soft)]">
                {quellen.map((q, i) => (
                  <li key={i} id={`quelle-${q.nr ?? i + 1}`} className="flex gap-2 py-1">
                    <span className="w-6 flex-none text-right font-[IBM_Plex_Mono] text-[14px]">{q.nr ?? i + 1}.</span>
                    <span className="min-w-0">
                      <WithGaps text={q.titel} mark={preview} />
                      {q.url && (
                        <>
                          {q.titel ? " – " : ""}
                          <a href={q.url} target="_blank" rel="noopener noreferrer" className={inTextLink + " break-all"}>
                            {String(q.url).replace(/^https?:\/\//, "")}
                          </a>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          <p className="mt-5 text-[14px] leading-relaxed text-[var(--muted)]">
            Hinweis: {REPORT_NOTICE}
            {report.veroeffentlicht_am && <> Veröffentlicht am {fmtBerlin(report.veroeffentlicht_am)} Uhr.</>}
            {report.korrigiert_am && <> Korrigiert am {fmtBerlin(report.korrigiert_am)} Uhr.</>}
          </p>
          {footer}
        </footer>
      </div>
    </article>
  );
}

function BlocksWithGaps({ block, first }) {
  const text = (parts) => parts.map((p) => p.text ?? "").join("");
  if (block.type === "p")
    return (
      <p className={first ? "" : "mt-[22px]"}>
        <WithGaps text={text(block.inline)} mark />
      </p>
    );
  if (block.type === "quote")
    return (
      <blockquote className="font-display my-10 text-center text-[34px] italic leading-[1.25] text-[var(--heading)]">
        „<WithGaps text={text(block.inline)} mark />“
      </blockquote>
    );
  if (block.type === "ul" || block.type === "ol")
    return (
      <ul className="mt-4 list-disc space-y-1.5 pl-6 marker:text-[var(--gold)]">
        {block.items.map((it, k) => (
          <li key={k}>
            <WithGaps text={text(it)} mark />
          </li>
        ))}
      </ul>
    );
  return <Blocks blocks={[block]} />;
}
