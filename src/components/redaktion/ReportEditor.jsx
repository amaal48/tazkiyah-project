// src/components/redaktion/ReportEditor.jsx
//
// Interne Prüfseite einer Ausgabe (#/redaktion/wochenbericht/<id>), Design nach tazkiyah-design-b2-pruefseite.html.
// Tabs: Bearbeiten | Vorschau Website (Desktop und Handy) | Vorschau Mail. Rechts: Erscheint-Termin,
// „Lücken im Text“ (automatisch alle [eckigen Klammern], Klick springt zur Stelle), Checkliste (11 Punkte,
// je Ausgabe gespeichert), Freigabe. Die Datenbank prüft dieselben Regeln noch einmal (Trigger).
//
//   Entwurf → „Freigeben für Montag 12:00“ (nur bei 0 Lücken und 11 Haken)
//   Freigegeben → jede Änderung setzt automatisch zurück auf Entwurf (Trigger)
//   Veröffentlicht → Speichern ist eine Korrektur („Korrigiert am …“), Zurückziehen nur mit Grund

import { useEffect, useMemo, useRef, useState } from "react";
import { routes } from "../../lib/hashRoute.js";
import { getReport, listVersions, updateReport } from "../../lib/weeklyReportsData.js";
import {
  CHECKLIST, STATUS_TEXT, buildNewsletterMail, checkCount, checksDone, findFormGaps, fmtBerlin, fmtErscheint, fromForm, reportSlug, toForm,
} from "../../lib/weeklyReport.js";
import { ManuscriptFrame } from "../ornaments.jsx";
import WochenberichtArticle from "../berichte/WochenberichtArticle.jsx";
import ReportForm from "./ReportForm.jsx";

const linkClass = "font-semibold text-[var(--primary)] underline-offset-2 hover:text-[var(--primary-hover)] hover:underline";
const TABS = [
  ["edit", "Bearbeiten"],
  ["web", "Vorschau Website"],
  ["mail", "Vorschau Mail"],
];

function Panel({ title, aside, children }) {
  return (
    <ManuscriptFrame className="p-[5px]" innerClassName="bg-[var(--surface)] px-5 py-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[24px] font-semibold text-[var(--heading)]" style={{ margin: 0 }}>
          {title}
        </h2>
        {aside && <span className="text-[14px] text-[var(--muted)]">{aside}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </ManuscriptFrame>
  );
}

/** Handy-Vorschau: eigene Seite im iframe (390 px), damit die Handy-Darstellung der Website greift. */
function PhonePreview({ report }) {
  const ref = useRef(null);
  const send = () => ref.current?.contentWindow?.postMessage({ type: "tazkiyah-vorschau", report }, window.location.origin);
  useEffect(send); // bei jeder Änderung neu senden
  useEffect(() => {
    // Die Vorschau meldet sich, sobald sie bereit ist
    const onReady = (e) => {
      if (e.origin === window.location.origin && e.source === ref.current?.contentWindow && e.data?.type === "tazkiyah-vorschau-bereit") send();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  });
  return (
    <iframe
      ref={ref}
      title="Vorschau Handy (390 px)"
      src={`${window.location.pathname}${routes.redaktionVorschau()}`}
      onLoad={send}
      className="mx-auto block h-[760px] w-[390px] max-w-full border border-[var(--control-border)] bg-[var(--paper)]"
    />
  );
}

function MailPreview({ report }) {
  const url = `${window.location.origin}${window.location.pathname}${routes.wochenbericht(reportSlug(report))}`;
  const mail = buildNewsletterMail(report, url);
  const intro = mail.intro;
  return (
    <div className="mx-auto max-w-[640px]">
      <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-y-1 border-b border-[var(--line)] pb-3 text-[15px]">
        <dt className="text-[var(--muted)]">Von</dt>
        <dd>Tazkiyah</dd>
        <dt className="text-[var(--muted)]">Betreff</dt>
        <dd className="font-semibold">{mail.subject}</dd>
      </dl>
      <div className="mt-5 whitespace-pre-line text-[17px] leading-relaxed text-[var(--text)]">{intro}</div>
      <span className="btn-primary btn-gold-edge mt-6">Ganzen Bericht lesen</span>
      <p className="mt-6 text-[13px] leading-relaxed text-[var(--muted)]">
        Keine Anlageberatung, keine Fatwa. Abmelden: Der Abmeldelink folgt mit dem Start des Newsletters.
      </p>
      <p className="mt-6 border-t border-[var(--line)] pt-3 text-[13px] text-[var(--muted)]">
        Der Versand an Abonnenten ist ausgeschaltet (NEWSLETTER_ENABLED), bis Domain, Double-Opt-in und Datenschutzerklärung stehen.
      </p>
    </div>
  );
}

export default function ReportEditor({ id }) {
  const [saved, setSaved] = useState(null); // Stand in der Datenbank
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("edit");
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok" | "error", text }
  const [versions, setVersions] = useState([]);
  const [reason, setReason] = useState("");
  const [loadError, setLoadError] = useState(null);
  const fields = useRef({});

  const load = async () => {
    try {
      const r = await getReport(id);
      if (!r) throw new Error("Diese Ausgabe gibt es nicht oder du hast keinen Zugriff.");
      setSaved(r);
      setForm(toForm(r));
      setVersions(await listVersions(id).catch(() => []));
    } catch (e) {
      setLoadError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(() => (form ? { ...saved, ...fromForm(form), checkliste: saved.checkliste } : null), [form, saved]);
  const gaps = useMemo(() => (form ? findFormGaps(form) : []), [form]);
  const dirty = useMemo(() => {
    if (!form || !saved) return false;
    const a = fromForm(form);
    const b = fromForm(toForm(saved));
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [form, saved]);

  if (loadError) return <p className="py-10 text-[var(--bad-text)]">{loadError}</p>;
  if (!form) return <p className="py-10 text-[var(--text-soft)]">Lade Ausgabe …</p>;

  const status = saved.status;
  const published = status === "veroeffentlicht";
  const withdrawn = status === "zurueckgezogen";
  const checks = saved.checkliste || {};
  const ready = status === "entwurf" && !dirty && gaps.length === 0 && checksDone(checks);

  // keepForm: ungespeicherte Änderungen im Formular behalten (z. B. beim Abhaken der Checkliste)
  const run = async (patch, okText, keepForm = false) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await updateReport(id, patch);
      setSaved(r);
      if (!keepForm) setForm(toForm(r));
      setVersions(await listVersions(id).catch(() => versions));
      setMessage({ kind: "ok", text: okText(r) });
    } catch (e) {
      setMessage({ kind: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(fromForm(form), (r) =>
      published ? "Korrektur gespeichert. Öffentlich steht jetzt „Korrigiert am …“." : status === "freigegeben" && r.status === "entwurf" ? "Gespeichert. Die Freigabe ist zurückgesetzt." : "Gespeichert."
    );
  const toggleCheck = (nr) => run({ checkliste: { ...checks, [nr]: !checks[nr] } }, (r) => (status === "freigegeben" && r.status === "entwurf" ? "Freigabe zurückgesetzt (Checkliste geändert)." : "Checkliste gespeichert."), true);
  const release = () => run({ status: "freigegeben" }, (r) => `Freigegeben. Erscheint ${fmtErscheint(r.erscheint_am)} Uhr.`);
  const unrelease = () => run({ status: "entwurf" }, () => "Freigabe aufgehoben.");
  const withdraw = () => run({ status: "zurueckgezogen", zurueckgezogen_grund: reason.trim() }, () => "Zurückgezogen. Die Ausgabe ist nicht mehr öffentlich.");
  const reopen = () => run({ status: "entwurf" }, () => "Wieder als Entwurf geöffnet.");

  const jump = (g) => {
    setTab("edit");
    const key =
      g.field === "body" ? `body:${g.section}` : g.field === "bodyHeading" ? `bodyHeading:${g.section}` : g.field === "quellen" ? `quelle:${g.source}:${g.part}` : g.field;
    requestAnimationFrame(() => {
      const el = fields.current[key];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
      el.setSelectionRange?.(g.index, g.index + g.length);
    });
  };

  const groups = [...new Set(CHECKLIST.map((c) => c.group))];
  const releaseLabel = status === "freigegeben" ? "Freigegeben" : ready ? "Freigeben für Montag 12:00" : "Freigeben (noch nicht möglich)";

  return (
    <div className="pb-16 pt-8">
      <a href={routes.redaktion()} className={"inline-flex min-h-[44px] items-center text-[15px] " + linkClass}>
        ← Alle Wochenberichte
      </a>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">
            {STATUS_TEXT[status]} · erstellt {fmtBerlin(saved.erstellt_am)} · geändert {fmtBerlin(saved.geaendert_am)}
          </p>
          <h1 className="font-display text-[var(--heading)]" style={{ margin: "8px 0 0", fontSize: "clamp(36px, 5vw, 48px)", lineHeight: 1.05, fontWeight: 500 }}>
            Wochenbericht KW {saved.kw} prüfen
          </h1>
        </div>
        <div role="tablist" aria-label="Ansicht" className="flex border border-[var(--green-deep)]">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={"min-h-[44px] px-[18px] text-[15px] font-semibold " + (tab === key ? "bg-[var(--green-deep)] text-[var(--paper)]" : "text-[var(--green-deep)] hover:bg-[var(--bg-deep)]")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p role="status" className={"mt-4 border-l-[3px] px-4 py-2.5 text-[15px] " + (message.kind === "ok" ? "border-[var(--ok-text)] bg-[var(--ok-bg)] text-[var(--ok-text)]" : "border-[var(--bad-text)] bg-[var(--bad-bg)] text-[var(--bad-text)]")}>
          {message.text}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-start gap-7">
        <div className="min-w-0 flex-[999_1_560px]">
          {tab === "edit" && (
            <ManuscriptFrame className="p-[5px]" innerClassName="bg-[var(--surface)] px-10 pb-10 pt-9 max-[640px]:px-4 max-[640px]:pt-6">
              {status === "freigegeben" && (
                <p className="mb-5 border border-dashed border-[var(--control-border)] px-4 py-3 text-[15px] text-[var(--text-soft)]">
                  Freigegeben. Jede Änderung setzt die Ausgabe beim Speichern zurück auf Entwurf.
                </p>
              )}
              {published && (
                <p className="mb-5 border border-dashed border-[var(--control-border)] px-4 py-3 text-[15px] text-[var(--text-soft)]">
                  Veröffentlicht. Speichern ist eine Korrektur: Öffentlich erscheint dann „Korrigiert am …“.
                </p>
              )}
              <ReportForm value={form} onChange={setForm} disabled={busy || withdrawn} registerField={(k, el) => (fields.current[k] = el)} />
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5">
                <button type="button" onClick={save} disabled={busy || !dirty || withdrawn} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? "Speichert …" : published ? "Korrektur speichern" : "Speichern"}
                </button>
                <button type="button" onClick={() => setForm(toForm(saved))} disabled={busy || !dirty} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Änderungen verwerfen
                </button>
                <span className="text-[14px] text-[var(--muted)]">{dirty ? "Ungespeicherte Änderungen" : "Alles gespeichert"}</span>
              </div>
            </ManuscriptFrame>
          )}
          {tab === "web" && (
            <ManuscriptFrame className="p-[5px]" innerClassName="bg-[var(--paper)] px-6 py-6 max-[640px]:px-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-[var(--muted)]">Zeigt den aktuellen Stand im Formular, Lücken markiert.</p>
                <div className="flex gap-2" role="group" aria-label="Breite der Vorschau">
                  <button type="button" className="chip" aria-pressed={!phone} onClick={() => setPhone(false)}>
                    Desktop
                  </button>
                  <button type="button" className="chip" aria-pressed={phone} onClick={() => setPhone(true)}>
                    Handy
                  </button>
                </div>
              </div>
              <div className="mt-4">{phone ? <PhonePreview report={current} /> : <WochenberichtArticle report={current} preview />}</div>
            </ManuscriptFrame>
          )}
          {tab === "mail" && (
            <ManuscriptFrame className="p-[5px]" innerClassName="bg-[var(--surface)] px-8 py-8 max-[640px]:px-4">
              <MailPreview report={current} />
            </ManuscriptFrame>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <div className="on-green border-b-[3px] border-[var(--gold-line)] bg-[var(--green-deep)] px-6 py-[22px] text-[var(--paper)]">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--gold-light)]">{published ? "Erschienen" : "Erscheint"}</p>
            <p className="font-display mt-1 text-[30px] font-semibold leading-tight">{fmtErscheint(published ? saved.veroeffentlicht_am : saved.erscheint_am)}</p>
            <p className="mt-1 text-[14px] text-[var(--on-green-soft)]">Website und Mail gleichzeitig · nur nach Freigabe</p>
            {status === "freigegeben" && (
              <p role="status" className="mt-3.5 bg-[var(--paper)] px-3 py-2.5 text-[15px] font-semibold text-[var(--green-deep)]">
                Freigegeben. Erscheint {fmtErscheint(saved.erscheint_am)} Uhr.
              </p>
            )}
            {published && saved.korrigiert_am && <p className="mt-3 text-[14px] text-[var(--on-green-soft)]">Korrigiert am {fmtBerlin(saved.korrigiert_am)}</p>}
            {withdrawn && (
              <p className="mt-3.5 bg-[var(--paper)] px-3 py-2.5 text-[15px] text-[var(--bad-text)]">
                Zurückgezogen am {fmtBerlin(saved.zurueckgezogen_am)}. Grund: {saved.zurueckgezogen_grund}
              </p>
            )}
          </div>

          <Panel title="Lücken im Text" aside={gaps.length === 0 ? "alle geschlossen" : `${gaps.length} offen`}>
            {gaps.length === 0 ? (
              <p className="py-2 text-[15px] text-[var(--text-soft)]">Keine [eckigen Klammern] mehr im Text.</p>
            ) : (
              <ul>
                {gaps.map((g, i) => (
                  <li key={i} className="border-b border-[var(--line)]">
                    <button type="button" onClick={() => jump(g)} className="flex min-h-[44px] w-full flex-col items-start py-2 text-left text-[15px] leading-snug hover:text-[var(--primary)]">
                      <span className="text-[13px] text-[var(--muted)]">{g.label}</span>
                      <span className="bg-[var(--gap-bg)] px-1 text-[var(--gap-text)]">{g.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Checkliste" aside={`${checkCount(checks)} von ${CHECKLIST.length}`}>
            {groups.map((group) => (
              <div key={group}>
                <p className="kicker mt-3">{group}</p>
                {CHECKLIST.filter((c) => c.group === group).map((c) => (
                  <label key={c.nr} className="flex cursor-pointer items-start gap-2.5 py-[7px] text-[15px] leading-snug">
                    <input
                      type="checkbox"
                      checked={checks[c.nr] === true}
                      disabled={busy || withdrawn || published}
                      onChange={() => toggleCheck(c.nr)}
                      className="mt-0.5 h-[18px] w-[18px] flex-none accent-[var(--green-deep)]"
                    />
                    <span>
                      {c.nr}. {c.label}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </Panel>

          {!published && !withdrawn && (
            <>
              <button
                type="button"
                onClick={release}
                disabled={!ready || busy}
                className={
                  "min-h-[56px] w-full px-4 text-[18px] font-semibold " +
                  (status === "freigegeben"
                    ? "cursor-default bg-[var(--gold-light)] text-[var(--green-deep)]"
                    : ready
                      ? "border-b-[3px] border-[var(--gold-line)] bg-[var(--green-deep)] text-[var(--paper)] hover:bg-[var(--primary-hover)]"
                      : "cursor-not-allowed bg-[var(--bg-deep)] text-[var(--muted)]")
                }
              >
                {releaseLabel}
              </button>
              <p className="-mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
                {dirty
                  ? "Erst speichern, dann freigeben."
                  : "Der Knopf wird erst aktiv, wenn alle Lücken geschlossen und alle Punkte abgehakt sind. Ohne Freigabe erscheint nichts."}
              </p>
              {status === "freigegeben" && (
                <button type="button" onClick={unrelease} disabled={busy} className="btn-secondary w-full">
                  Freigabe aufheben
                </button>
              )}
            </>
          )}

          {published && (
            <Panel title="Zurückziehen">
              <label htmlFor="rz-grund" className="field-label">
                Grund (Pflicht)
              </label>
              <textarea id="rz-grund" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="field mt-1.5 block w-full py-2.5" />
              <button type="button" onClick={withdraw} disabled={busy || !reason.trim()} className="btn-secondary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50">
                Ausgabe zurückziehen
              </button>
              <p className="mt-2 text-[13px] text-[var(--muted)]">Die Ausgabe ist danach nicht mehr öffentlich. Korrekturen gehen über „Korrektur speichern“.</p>
            </Panel>
          )}
          {withdrawn && (
            <button type="button" onClick={reopen} disabled={busy} className="btn-secondary w-full">
              Wieder als Entwurf öffnen
            </button>
          )}

          <Panel title="Änderungsprotokoll" aside={`${versions.length} Versionen`}>
            <ul className="max-h-[220px] overflow-y-auto text-[14px]">
              {versions.map((v) => (
                <li key={v.id} className="flex justify-between gap-3 border-b border-[var(--line)] py-1.5">
                  <span>{fmtBerlin(v.saved_at)}</span>
                  <span className="text-[var(--muted)]">{STATUS_TEXT[v.status]}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
