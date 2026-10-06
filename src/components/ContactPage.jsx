// src/components/ContactPage.jsx
//
// Kontaktformular (#/kontakt). Sendet nur an die Server-Funktion api/contact.js,
// nie direkt an Supabase. Prüfung der Eingaben wie auf dem Server (src/lib/contact.js).
// Das Feld "website" ist eine Spam-Falle: für Menschen unsichtbar und nicht per Tab erreichbar.

import { useState } from "react";
import { CONTACT_TOPICS, MESSAGE_MAX, MESSAGE_MIN, NAME_MAX, validateContact } from "../lib/contact.js";

const FAILED = "Deine Nachricht konnte nicht gesendet werden. Bitte versuch es später noch einmal.";
const THROTTLED = "Gerade kommen sehr viele Nachrichten an. Bitte versuch es später noch einmal.";

const labelClass = "block text-[15px] font-semibold text-[var(--text)]";
const hintClass = "mt-1 text-sm text-[var(--muted)]";

export default function ContactPage({ onBack, onOpenPrivacy }) {
  const [form, setForm] = useState({ email: "", name: "", topic: "allgemein", message: "", website: "" });
  const [status, setStatus] = useState("ready"); // ready | sending | sent | error
  const [errorText, setErrorText] = useState("");

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (status === "error") setStatus("ready");
  };

  const messageLength = form.message.trim().length;
  const canSend = status !== "sending" && form.email.trim() !== "" && messageLength >= MESSAGE_MIN && messageLength <= MESSAGE_MAX;

  async function submit(e) {
    e.preventDefault();
    if (!canSend) return;
    const checked = validateContact(form);
    if (!checked.ok) {
      setErrorText(checked.error);
      setStatus("error");
      return;
    }
    setStatus("sending");
    setErrorText("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (response.ok) {
        setStatus("sent");
        return;
      }
      let message = "";
      if (response.status === 400) {
        try {
          message = String((await response.json())?.error || "");
        } catch {
          // Antwort ohne JSON
        }
      }
      setErrorText(response.status === 429 ? THROTTLED : message || FAILED);
    } catch {
      setErrorText(FAILED);
    }
    setStatus("error"); // Eingaben bleiben stehen
  }

  return (
    <div className="font-body">
      <header className="flex page items-center gap-3 py-6 text-sm text-[var(--muted)]">
        <button type="button" onClick={onBack} className="-my-3 inline-flex min-h-[44px] items-center hover:text-[var(--text)]">Tazkiyah</button>
        <span>/</span>
        <span className="text-[var(--text)]">Kontakt</span>
      </header>
      <main className="page pb-24">
        <h1 className="font-display text-2xl text-[var(--text)]">Kontakt</h1>
        <div className="mt-3 max-w-[62ch] space-y-2 leading-relaxed text-[var(--text-soft)]">
          <p>Wir antworten in der Regel innerhalb weniger Tage.</p>
          <p>Wir geben keine Anlageberatung und keine religiösen Rechtsgutachten (Fatwas).</p>
        </div>

        {status === "sent" ? (
          <div role="status" className="card mt-8 max-w-xl">
            <p className="leading-relaxed text-[var(--ok-text)]">Danke, deine Nachricht ist angekommen. Wir melden uns per E-Mail bei dir.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="card relative mt-8 max-w-xl space-y-6">
            <div>
              <label htmlFor="contact-email" className={labelClass}>E-Mail</label>
              <input
                id="contact-email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={set("email")}
                className="field mt-2 w-full"
              />
            </div>

            <div>
              <label htmlFor="contact-name" className={labelClass}>
                Name <span className="font-normal text-[var(--muted)]">(freiwillig)</span>
              </label>
              <input
                id="contact-name"
                type="text"
                autoComplete="name"
                maxLength={NAME_MAX}
                value={form.name}
                onChange={set("name")}
                className="field mt-2 w-full"
              />
            </div>

            <div>
              <label htmlFor="contact-topic" className={labelClass}>Thema</label>
              <select id="contact-topic" value={form.topic} onChange={set("topic")} className="field mt-2 w-full">
                {CONTACT_TOPICS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="contact-message" className={labelClass}>Nachricht</label>
              <textarea
                id="contact-message"
                required
                rows={7}
                minLength={MESSAGE_MIN}
                maxLength={MESSAGE_MAX}
                value={form.message}
                onChange={set("message")}
                aria-describedby="contact-message-count"
                className="field mt-2 w-full resize-y py-3 leading-relaxed"
              />
              <p id="contact-message-count" className={hintClass + " flex justify-between gap-4"}>
                <span>Mindestens {MESSAGE_MIN} Zeichen.</span>
                <span>{form.message.length} / {MESSAGE_MAX}</span>
              </p>
            </div>

            {/* Spam-Falle: für Menschen unsichtbar, nicht per Tab erreichbar */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: "1px", height: "1px", overflow: "hidden" }}>
              <label htmlFor="contact-website">Website</label>
              <input id="contact-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
            </div>

            <div role="status" aria-live="polite">
              {status === "error" && <p className="text-sm text-[var(--bad-text)]">{errorText}</p>}
            </div>

            <button type="submit" disabled={!canSend} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
              {status === "sending" ? "Wird gesendet …" : "Nachricht senden"}
            </button>
          </form>
        )}

        <p className="mt-6 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          Deine Angaben nutzen wir nur, um deine Nachricht zu beantworten. Nach 6 Monaten werden sie gelöscht. Mehr in der{" "}
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="-my-[10px] inline-block py-[10px] text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]"
          >
            Datenschutzerklärung
          </button>
          .
        </p>
      </main>
    </div>
  );
}
