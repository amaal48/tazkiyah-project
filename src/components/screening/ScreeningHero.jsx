// src/components/screening/ScreeningHero.jsx
//
// Kopfbereich der Hauptseite: was Tazkiyah prüft, die Grundlage (AAOIFI SS 21, 27, 35)
// mit Link auf die Methodik, keine Verbindung zur AAOIFI, kein Rechtsgutachten.

import { routes } from "../../lib/hashRoute.js";
import { H1_STYLE, NOTICE_NO_ADVICE } from "./format.js";

export default function ScreeningHero() {
  return (
    <section className="bg-lattice mx-auto max-w-[1440px] px-6 pb-12 pt-10 text-left">
      <p className="mb-4 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Aktien- und ETF-Prüfung</p>
      <h1 className="font-display max-w-3xl" style={{ ...H1_STYLE, fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1.15 }}>
        Tazkiyah prüft Aktien und ETFs darauf, ob sie den Sharia-Standards der AAOIFI entsprechen.
      </h1>
      <p className="mt-6 text-[15px] text-[var(--text-soft)]">
        Grundlage:{" "}
        <a href={routes.methodik()} className="text-[var(--gold-soft)] underline decoration-[var(--gold)]/40 underline-offset-2 hover:decoration-[var(--gold-soft)]">
          AAOIFI Shari'ah Standards Nr. 21, 27 und 35
        </a>
      </p>
      <p className="mt-2 text-sm text-[var(--muted)]">Tazkiyah prüft nach den Standards der AAOIFI und ist nicht mit der AAOIFI verbunden.</p>
      <p className="mt-4 max-w-2xl rounded-xl border border-[var(--border)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
        {NOTICE_NO_ADVICE}
      </p>
    </section>
  );
}
