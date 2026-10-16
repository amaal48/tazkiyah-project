// src/components/redaktion/RedaktionPage.jsx
//
// Interner Bereich der Redaktion (#/redaktion/wochenbericht …), nur für Admin-Konten (is_admin(), RLS).
// Grüne Leiste „Redaktion · intern“, Liste aller Entwürfe und Ausgaben mit Status, „Neuer Entwurf“
// (Entwurf aus Notion einfügen, Aufteilung prüfen und korrigieren, speichern) und die Prüfseite je Ausgabe.
// Nicht verlinkt im Hauptmenü; für Admins im Kontomenü („Redaktion“).

import { useEffect, useState } from "react";
import { routes } from "../../lib/hashRoute.js";
import { createReport, fetchIsAdmin, listReports } from "../../lib/weeklyReportsData.js";
import { parseDraft } from "../../lib/weeklyDraft.js";
import { STATUS_TEXT, findFormGaps, fmtBerlin, fmtErscheint, fromForm, toForm } from "../../lib/weeklyReport.js";
import { ManuscriptFrame, StarMark } from "../ornaments.jsx";
import ReportEditor from "./ReportEditor.jsx";
import ReportForm from "./ReportForm.jsx";

const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";

function InternBar() {
  return (
    <div className="on-green bg-[var(--green-deep)] text-[var(--paper)]">
      <div className="page flex flex-wrap items-center justify-between gap-3 py-3.5">
        <div className="flex items-center gap-3">
          <StarMark size={28} fill="var(--gold-light)" dot="var(--green-deep)" />
          <span className="font-display text-[24px] font-semibold">Tazkiyah</span>
          <span className="border-l border-[var(--on-primary-muted)]/50 pl-3 text-[13px] uppercase tracking-[0.14em] text-[var(--gold-light)]">Redaktion · intern</span>
        </div>
        <nav aria-label="Redaktion" className="flex gap-6 text-[15px]">
          <a href={routes.redaktion()} aria-current="page" className="inline-flex min-h-[44px] items-center border-b-2 border-[var(--gold-line)] text-[var(--paper)]">
            Wochenberichte
          </a>
          <a href={routes.wochenbericht()} className="inline-flex min-h-[44px] items-center text-[var(--on-green-soft)] hover:text-[var(--paper)]">
            Zur Website
          </a>
        </nav>
      </div>
    </div>
  );
}

const STATUS_CLASS = {
  entwurf: "border-[var(--control-border)] text-[var(--text-soft)]",
  freigegeben: "border-[var(--gold)] text-[var(--gold-soft)]",
  veroeffentlicht: "border-[var(--ok-text)] text-[var(--ok-text)]",
  zurueckgezogen: "border-[var(--bad-text)] text-[var(--bad-text)]",
};

function StatusTag({ status }) {
  return <span className={"inline-flex border px-2.5 py-0.5 text-[13px] font-semibold " + STATUS_CLASS[status]}>{STATUS_TEXT[status]}</span>;
}

function ReportList() {
  const [state, setState] = useState({ loading: true, rows: [], error: null });
  useEffect(() => {
    listReports()
      .then((rows) => setState({ loading: false, rows, error: null }))
      .catch((e) => setState({ loading: false, rows: [], error: e.message }));
  }, []);
  return (
    <div className="pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">Redaktion</p>
          <h1 className="font-display text-[var(--heading)]" style={{ margin: "8px 0 0", fontSize: "clamp(36px, 5vw, 48px)", lineHeight: 1.05, fontWeight: 500 }}>
            Wochenberichte
          </h1>
        </div>
        <a href={routes.redaktion("neu")} className="btn-primary">
          Neuer Entwurf
        </a>
      </div>
      <p className="mt-3 max-w-[70ch] text-[16px] leading-relaxed text-[var(--text-soft)]">
        Entwurf aus Notion einfügen, prüfen, Lücken schließen, Checkliste abhaken, freigeben. Freigegebene Ausgaben erscheinen am Montag nach dem
        Berichtszeitraum um 12:00 Uhr. Ohne Freigabe erscheint nichts.
      </p>
      <div className="mt-8 border-t border-[var(--green-deep)]">
        {state.loading && <p className="py-4 text-[var(--text-soft)]">Lade …</p>}
        {state.error && <p className="py-4 text-[var(--bad-text)]">{state.error}</p>}
        {!state.loading && !state.error && state.rows.length === 0 && <p className="py-4 text-[var(--text-soft)]">Noch keine Entwürfe.</p>}
        <ul>
          {state.rows.map((r) => (
            <li key={r.id}>
              <a
                href={routes.redaktion(r.id)}
                className="grid items-baseline gap-x-5 gap-y-1 border-b border-[var(--line)] py-4 text-[var(--text)] hover:text-[var(--primary)] min-[760px]:grid-cols-[110px_minmax(0,1fr)_150px_210px]"
              >
                <span className="font-display text-[24px] text-[var(--gold-soft)]">
                  KW {r.kw} <span className="text-[16px] text-[var(--muted)]">{r.jahr}</span>
                </span>
                <span className="text-[18px]">{r.titel || "Ohne Titel"}</span>
                <span>
                  <StatusTag status={r.status} />
                </span>
                <span className="text-[14px] text-[var(--muted)] min-[760px]:text-right">
                  {r.status === "veroeffentlicht" ? `erschienen ${fmtBerlin(r.veroeffentlicht_am)}` : `erscheint ${fmtErscheint(r.erscheint_am)}`}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** „Neuer Entwurf“: einfügen → Aufteilung prüfen und korrigieren → speichern. */
function DraftImport() {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const split = () => {
    const p = parseDraft(raw);
    setParsed(p);
    setForm(toForm(p));
    setError(null);
  };
  const save = async () => {
    const fields = fromForm(form);
    const missing = [!fields.jahr && "Jahr", !fields.kw && "KW", !fields.zeitraum_von && "Zeitraum von", !fields.zeitraum_bis && "Zeitraum bis"].filter(Boolean);
    if (missing.length) return setError(`Bitte ergänzen: ${missing.join(", ")}.`);
    setBusy(true);
    setError(null);
    try {
      const r = await createReport({ ...fields, status: "entwurf" });
      window.location.hash = routes.redaktion(r.id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="pb-16 pt-8">
      <a href={routes.redaktion()} className={"inline-flex min-h-[44px] items-center text-[15px] " + linkClass}>
        ← Alle Wochenberichte
      </a>
      <h1 className="font-display text-[var(--heading)]" style={{ margin: "8px 0 0", fontSize: "clamp(36px, 5vw, 48px)", lineHeight: 1.05, fontWeight: 500 }}>
        Neuer Entwurf
      </h1>

      {!form ? (
        <ManuscriptFrame className="mt-6 p-[5px]" innerClassName="bg-[var(--surface)] px-8 py-8 max-[640px]:px-4">
          <label htmlFor="entwurf-text" className="field-label">
            Kompletten Entwurf aus Notion einfügen (Markdown)
          </label>
          <p className="mt-1 text-[14px] text-[var(--muted)]">
            Aufbau wie die Vorlage: # Titel, darunter KW und Zeitraum, „## Das Wichtigste in drei Sätzen“, Abschnitte, Einordnung, „## Quellen“, „## Mail-Kurzfassung“.
            Hinweiskasten und offene Stellen am Anfang werden nicht übernommen.
          </p>
          <textarea id="entwurf-text" value={raw} onChange={(e) => setRaw(e.target.value)} rows={22} className="field mt-3 block w-full py-3 font-[IBM_Plex_Mono] text-[14px] leading-relaxed" />
          <button type="button" onClick={split} disabled={!raw.trim()} className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-50">
            Aufteilen und prüfen
          </button>
        </ManuscriptFrame>
      ) : (
        <div className="mt-6 flex flex-wrap items-start gap-7">
          <ManuscriptFrame className="min-w-0 flex-[999_1_560px] p-[5px]" innerClassName="bg-[var(--surface)] px-10 pb-10 pt-9 max-[640px]:px-4">
            <p className="mb-6 text-[15px] text-[var(--text-soft)]">So wurde der Entwurf aufgeteilt. Alles lässt sich hier korrigieren; was nicht erkannt wurde, steht im Fließtext.</p>
            <ReportForm value={form} onChange={setForm} disabled={busy} />
            {error && (
              <p role="alert" className="mt-6 border-l-[3px] border-[var(--bad-text)] bg-[var(--bad-bg)] px-4 py-2.5 text-[15px] text-[var(--bad-text)]">
                {error}
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--line)] pt-5">
              <button type="button" onClick={save} disabled={busy} className="btn-primary disabled:opacity-50">
                {busy ? "Speichert …" : "Als Entwurf speichern"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  setParsed(null);
                }}
                className="btn-secondary"
              >
                Zurück zum eingefügten Text
              </button>
            </div>
          </ManuscriptFrame>
          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
            <ManuscriptFrame className="p-[5px]" innerClassName="bg-[var(--surface)] px-5 py-[18px]">
              <h2 className="font-display text-[24px] font-semibold text-[var(--heading)]" style={{ margin: 0 }}>
                Erkannt
              </h2>
              <ul className="mt-2 space-y-1 text-[15px]">
                <li>KW {form.kw ?? "?"} · {form.jahr ?? "?"}</li>
                <li>{form.sections.filter((s) => s.heading).length} Abschnitte im Fließtext</li>
                <li>{form.quellen.length} Quellen</li>
                <li>{findFormGaps(form).length} Lücken [eckige Klammern]</li>
                <li>{form.einordnung ? "Einordnung gefunden" : "keine Einordnung"}</li>
                <li>{form.mail_kurzfassung ? "Mail-Kurzfassung gefunden" : "keine Mail-Kurzfassung"}</li>
              </ul>
              {parsed.warnungen.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[var(--line)] pt-3 text-[15px] text-[var(--bad-text)]">
                  {parsed.warnungen.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </ManuscriptFrame>
            {(parsed.ignoriert.vorspann || parsed.ignoriert.hinweis) && (
              <ManuscriptFrame className="p-[5px]" innerClassName="bg-[var(--surface)] px-5 py-[18px]">
                <h2 className="font-display text-[24px] font-semibold text-[var(--heading)]" style={{ margin: 0 }}>
                  Nicht übernommen
                </h2>
                {parsed.ignoriert.vorspann && (
                  <>
                    <p className="kicker mt-3">Vor dem Titel (Hinweiskasten, offene Stellen)</p>
                    <pre className="mt-1 max-h-[220px] overflow-auto whitespace-pre-wrap font-[IBM_Plex_Mono] text-[13px] text-[var(--text-soft)]">{parsed.ignoriert.vorspann}</pre>
                  </>
                )}
                {parsed.ignoriert.hinweis && (
                  <>
                    <p className="kicker mt-3">Hinweis (steht auf der Website fest)</p>
                    <pre className="mt-1 whitespace-pre-wrap font-[IBM_Plex_Mono] text-[13px] text-[var(--text-soft)]">{parsed.ignoriert.hinweis}</pre>
                  </>
                )}
              </ManuscriptFrame>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/** Zugang nur für Admins. */
export default function RedaktionPage({ id, session, onOpenAuth }) {
  const [admin, setAdmin] = useState(null); // null = prüft
  useEffect(() => {
    let cancelled = false;
    setAdmin(null);
    if (!session) {
      setAdmin(false);
      return undefined;
    }
    fetchIsAdmin().then((ok) => !cancelled && setAdmin(ok));
    return () => {
      cancelled = true;
    };
  }, [session]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  return (
    <div className="font-body text-left">
      <InternBar />
      <div className="page">
        {admin === null ? (
          <p className="py-10 text-[var(--text-soft)]">Prüfe Zugang …</p>
        ) : !admin ? (
          <div className="py-12">
            <h1 className="font-display text-[var(--heading)]" style={{ margin: 0, fontSize: "40px", fontWeight: 500 }}>
              Nur für die Redaktion
            </h1>
            <p className="mt-3 text-[17px] text-[var(--text-soft)]">{session ? "Dieses Konto hat keinen Zugang zur Redaktion." : "Bitte mit dem Redaktionskonto anmelden."}</p>
            {!session && (
              <button type="button" onClick={onOpenAuth} className="btn-primary mt-5">
                Anmelden
              </button>
            )}
          </div>
        ) : id === "neu" ? (
          <DraftImport />
        ) : id ? (
          <ReportEditor key={id} id={id} />
        ) : (
          <ReportList />
        )}
      </div>
    </div>
  );
}
