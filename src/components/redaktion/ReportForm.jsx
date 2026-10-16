// src/components/redaktion/ReportForm.jsx
//
// Formular eines Wochenberichts (Prüfseite und „Entwurf einfügen“), Design B2 nach
// tazkiyah-design-b2-pruefseite.html: Titel, KW/Zeitraum, drei Sätze, Fließtext abschnittsweise,
// Einordnung, Quellen, Mail-Kurzfassung. Felder registrieren sich über registerField, damit
// „Lücken im Text“ zur Stelle springen kann (Feld fokussieren, Lücke markieren).


const LABEL = "block text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]";
const AREA = "field mt-1.5 block w-full py-3 leading-[1.65]";
const SERIF = { fontFamily: "'Source Serif 4', Georgia, serif", fontSize: "17px" };

function rows(text, min = 3) {
  return Math.max(min, Math.min(30, Math.ceil(String(text || "").length / 85) + String(text || "").split("\n").length));
}

export default function ReportForm({ value, onChange, registerField = () => {}, disabled = false }) {
  const set = (patch) => onChange({ ...value, ...patch });
  // Abschnitte werden während der Bearbeitung als Liste gehalten (toForm/fromForm in src/lib/weeklyReport.js)
  const sections = value.sections || [];
  const setSections = (next) => set({ sections: next });
  const quellen = Array.isArray(value.quellen) ? value.quellen : [];
  const setQuelle = (i, patch) => set({ quellen: quellen.map((q, k) => (k === i ? { ...q, ...patch } : q)) });

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-7 border-0 p-0">
      <div>
        <label htmlFor="rf-titel" className={LABEL}>
          Titel
        </label>
        <textarea
          id="rf-titel"
          ref={(el) => registerField("titel", el)}
          rows={2}
          value={value.titel}
          onChange={(e) => set({ titel: e.target.value.replace(/\n/g, " ") })}
          className="font-display mt-1.5 block w-full resize-none border-0 border-b border-dashed border-[var(--control-border)] bg-transparent py-1.5 text-[36px] leading-tight text-[var(--heading)] max-[640px]:text-[28px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-[90px_80px_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="rf-jahr" className={LABEL}>
            Jahr
          </label>
          <input id="rf-jahr" type="number" min="2020" max="2100" value={value.jahr ?? ""} onChange={(e) => set({ jahr: Number(e.target.value) || null })} className="field mt-1.5 w-full" />
        </div>
        <div>
          <label htmlFor="rf-kw" className={LABEL}>
            KW
          </label>
          <input id="rf-kw" type="number" min="1" max="53" value={value.kw ?? ""} onChange={(e) => set({ kw: Number(e.target.value) || null })} className="field mt-1.5 w-full" />
        </div>
        <div>
          <label htmlFor="rf-von" className={LABEL}>
            Zeitraum von
          </label>
          <input id="rf-von" type="date" value={value.zeitraum_von ?? ""} onChange={(e) => set({ zeitraum_von: e.target.value || null })} className="field mt-1.5 w-full" />
        </div>
        <div>
          <label htmlFor="rf-bis" className={LABEL}>
            bis
          </label>
          <input id="rf-bis" type="date" value={value.zeitraum_bis ?? ""} onChange={(e) => set({ zeitraum_bis: e.target.value || null })} className="field mt-1.5 w-full" />
        </div>
      </div>

      <div>
        <label htmlFor="rf-drei" className={LABEL}>
          Das Wichtigste in drei Sätzen
        </label>
        <textarea
          id="rf-drei"
          ref={(el) => registerField("drei_saetze", el)}
          value={value.drei_saetze}
          onChange={(e) => set({ drei_saetze: e.target.value })}
          rows={rows(value.drei_saetze, 4)}
          className={AREA + " border-l-[3px] border-l-[var(--gold-line)]"}
          style={SERIF}
        />
      </div>

      <div>
        <p className={LABEL}>Fließtext · {sections.length} Abschnitte</p>
        <div className="mt-2 space-y-5">
          {sections.map((s, i) => (
            <div key={i} className="border-t border-[var(--line)] pt-4">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`rf-h-${i}`} className="sr-only-label">
                    Zwischenüberschrift {i + 1}
                  </label>
                  <input
                    id={`rf-h-${i}`}
                    ref={(el) => registerField(`bodyHeading:${i}`, el)}
                    type="text"
                    placeholder={i === 0 && !s.heading ? "(ohne Zwischenüberschrift)" : "Zwischenüberschrift"}
                    value={s.heading}
                    onChange={(e) => setSections(sections.map((x, k) => (k === i ? { ...x, heading: e.target.value } : x)))}
                    className="font-display block w-full border-0 border-b border-dashed border-[var(--control-border)] bg-transparent py-1 text-[26px] font-semibold text-[var(--heading)]"
                  />
                </div>
                <button type="button" onClick={() => setSections(sections.filter((_, k) => k !== i))} className="chip flex-none text-[14px]" aria-label={`Abschnitt ${i + 1} entfernen`}>
                  Entfernen
                </button>
              </div>
              <label htmlFor={`rf-t-${i}`} className="sr-only-label">
                Text zu Abschnitt {i + 1}
              </label>
              <textarea
                id={`rf-t-${i}`}
                ref={(el) => registerField(`body:${i}`, el)}
                value={s.text}
                onChange={(e) => setSections(sections.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
                rows={rows(s.text, 4)}
                className={AREA}
                style={SERIF}
              />
            </div>
          ))}
          <button type="button" onClick={() => setSections([...sections, { heading: "Neuer Abschnitt", text: "" }])} className="btn-secondary min-h-[44px] px-5 py-2 text-[15px]">
            Abschnitt hinzufügen
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="rf-einordnung" className={LABEL}>
          Einordnung für muslimische Anleger
        </label>
        <textarea
          id="rf-einordnung"
          ref={(el) => registerField("einordnung", el)}
          value={value.einordnung}
          onChange={(e) => set({ einordnung: e.target.value })}
          rows={rows(value.einordnung, 5)}
          className={AREA + " bg-[var(--tile)]"}
          style={SERIF}
        />
      </div>

      <div>
        <p className={LABEL}>Quellen · {quellen.length}</p>
        <ol className="mt-2 space-y-3">
          {quellen.map((q, i) => (
            <li key={i} className="grid gap-2 border-t border-[var(--line)] pt-3 min-[700px]:grid-cols-[48px_minmax(0,1fr)_minmax(0,0.8fr)_auto] min-[700px]:items-start">
              <div>
                <label htmlFor={`rf-qn-${i}`} className="sr-only-label">
                  Nummer
                </label>
                <input id={`rf-qn-${i}`} type="number" min="1" value={q.nr ?? i + 1} onChange={(e) => setQuelle(i, { nr: Number(e.target.value) || i + 1 })} className="field w-full px-2 text-center" />
              </div>
              <div>
                <label htmlFor={`rf-qt-${i}`} className="sr-only-label">
                  Quelle {i + 1}: Herausgeber, Titel, Datum
                </label>
                <textarea
                  id={`rf-qt-${i}`}
                  ref={(el) => registerField(`quelle:${i}:titel`, el)}
                  value={q.titel || ""}
                  onChange={(e) => setQuelle(i, { titel: e.target.value })}
                  rows={2}
                  className="field block w-full py-2.5 text-[15px] leading-snug"
                  placeholder="Herausgeber, Titel, Datum"
                />
              </div>
              <div>
                <label htmlFor={`rf-qu-${i}`} className="sr-only-label">
                  Quelle {i + 1}: Link
                </label>
                <input
                  id={`rf-qu-${i}`}
                  ref={(el) => registerField(`quelle:${i}:url`, el)}
                  type="url"
                  value={q.url || ""}
                  onChange={(e) => setQuelle(i, { url: e.target.value.trim() || null })}
                  className="field w-full text-[15px]"
                  placeholder="https://…"
                />
              </div>
              <button type="button" onClick={() => set({ quellen: quellen.filter((_, k) => k !== i) })} className="chip text-[14px]" aria-label={`Quelle ${i + 1} entfernen`}>
                Entfernen
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => set({ quellen: [...quellen, { nr: quellen.length + 1, titel: "", url: null }] })}
          className="btn-secondary mt-3 min-h-[44px] px-5 py-2 text-[15px]"
        >
          Quelle hinzufügen
        </button>
      </div>

      <div>
        <label htmlFor="rf-mail" className={LABEL}>
          Mail-Kurzfassung
        </label>
        <textarea
          id="rf-mail"
          ref={(el) => registerField("mail_kurzfassung", el)}
          value={value.mail_kurzfassung}
          onChange={(e) => set({ mail_kurzfassung: e.target.value })}
          rows={rows(value.mail_kurzfassung, 4)}
          className={AREA + " text-[16px]"}
          placeholder="Leer lassen: Die Mail nimmt dann die drei Sätze."
        />
      </div>
    </fieldset>
  );
}
