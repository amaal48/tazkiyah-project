// src/components/Methodik2Page.jsx
//
// Methodik, vereinfachte Fassung (#/methodik-2), Entwurf vom 16.10.2026 zum Vergleich mit der
// bestehenden Methodik-Seite. Text wörtlich nach Vorgabe der Nutzerin, nichts ergänzen.
// Nicht im Hauptmenü; erreichbar über den Startseiten-Knopf „Worauf du achten solltest“ und den
// Entwurfs-Hinweis oben auf der Methodik-Seite.

import { useEffect } from "react";
import { routes } from "../lib/hashRoute.js";
import { LegalNoticeFull } from "./screening/LegalNotice.jsx";
import { H1_STYLE, H2_STYLE } from "./screening/format.js";

const QUESTIONS = [
  {
    q: "Womit verdient das Unternehmen sein Geld?",
    a: "Das Kerngeschäft darf nicht verboten sein, zum Beispiel Zinsbanken, Alkohol, Schweinefleisch oder Glücksspiel.",
  },
  { q: "Wie viele Schulden mit Zinsen hat es?", a: "Als Grenze gelten höchstens 30 % des Börsenwerts." },
  { q: "Wie viel Geld hat es verzinst angelegt?", a: "Auch hier gelten höchstens 30 % des Börsenwerts." },
  {
    q: "Wie viel Umsatz stammt aus verbotenen Quellen?",
    a: "Höchstens 5 %. Diesen kleinen Anteil gibst du anteilig als Spende weiter. Das nennt man Reinigung (Purification).",
  },
];

const SELF = [
  "Die Zahlen stehen im Geschäftsbericht des Unternehmens.",
  "Halal-ETFs nehmen dir einen Teil der Prüfung ab. Schau trotzdem, nach welchen Regeln sie prüfen.",
  "Prüfe, ob dein Broker Zinsen auf dein Guthaben zahlt, und stelle das wenn möglich ab.",
  "Zahlen ändern sich mit jedem Quartal. Eine Prüfung gilt also nicht für immer.",
];

const linkClass = "text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]";

export default function Methodik2Page() {
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="font-body page pb-8 pt-14 text-left">
      <header className="max-w-[68ch]">
        <h1 className="font-display" style={{ ...H1_STYLE, fontSize: "clamp(32px, 4.5vw, 44px)", lineHeight: 1.15 }}>
          Worauf du als Muslim beim Investieren achten solltest
        </h1>
        <p className="mt-5 text-[19px] leading-relaxed text-[var(--text-soft)]">
          Mit einer Aktie kaufst du einen kleinen Anteil an einem Unternehmen. Deshalb kommt es darauf an, womit das Unternehmen sein
          Geld verdient und wie es sich finanziert. Viele Gelehrte und Prüfstellen orientieren sich dabei am Standard Nr. 21 der
          AAOIFI, einer internationalen Organisation für islamisches Finanzwesen. Daran orientieren auch wir uns.
        </p>
      </header>

      <section className="mt-12" aria-labelledby="vier-fragen">
        <h2 id="vier-fragen" className="font-display" style={{ ...H2_STYLE, fontSize: "28px" }}>
          Vier Fragen an jede Aktie
        </h2>
        <ol className="mt-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
          {QUESTIONS.map((item, i) => (
            <li key={item.q} className="card flex h-full flex-col gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[var(--tile)] font-[IBM_Plex_Mono] text-[18px] font-medium text-[var(--primary)]"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <h3 className="font-display text-[20px] font-medium leading-snug text-[var(--text)]">
                <span className="sr-only-label">{i + 1}. </span>
                {item.q}
              </h3>
              <p className="text-[16px] leading-relaxed text-[var(--text-soft)]">{item.a}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-[68ch] text-[17px] leading-relaxed text-[var(--text-soft)]">
          Zusätzlich sollte ein Unternehmen nicht überwiegend aus Geld und Forderungen bestehen, sondern aus echten Werten wie Gebäuden,
          Maschinen oder Vorräten.
        </p>
      </section>

      <section className="mt-12" aria-labelledby="selbst-tun">
        <h2 id="selbst-tun" className="font-display" style={{ ...H2_STYLE, fontSize: "28px" }}>
          Was du selbst tun kannst
        </h2>
        <ul className="mt-4 max-w-[68ch] list-disc space-y-2 pl-6 text-[17px] leading-relaxed text-[var(--text-soft)] marker:text-[var(--gold)]">
          {SELF.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <aside className="mt-12 max-w-[68ch] rounded-2xl border border-[var(--note-border)] bg-[var(--note-bg)] p-5" aria-labelledby="wichtig">
        <h2 id="wichtig" className="font-display" style={{ ...H2_STYLE, fontSize: "20px" }}>
          Wichtig
        </h2>
        <p className="mt-2 text-[16px] leading-relaxed text-[var(--text-soft)]">
          Zu einzelnen Punkten gibt es unter Gelehrten unterschiedliche Auffassungen. Wenn du unsicher bist, frag eine Person mit Wissen,
          der du vertraust. Diese Seite ist keine Fatwa und keine Anlageberatung.
        </p>
      </aside>

      <p className="mt-10 text-[17px] font-semibold">
        <a href={routes.methodik()} className={linkClass}>
          Ausführlich: Methodik im Detail
        </a>
      </p>

      <LegalNoticeFull className="mt-12" />
    </div>
  );
}
