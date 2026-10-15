// src/components/screening/LegalNotice.jsx
//
// Rechtlicher Hinweis der Tazkiyah 30 (Liste und Detailseite): kurz sichtbar „Keine Anlageberatung,
// keine Fatwa.“ mit Link „Mehr dazu“, der volle Text eingeklappt (<details>) unten auf der Seite.
// Wortlaut festgelegt am 15.10.2026; vor dem Launch anwaltlich prüfen lassen.

export const LEGAL_NOTICE_ID = "rechtlicher-hinweis";

export const LEGAL_NOTICE_TITLE = "Keine Anlageberatung · rechtlicher Hinweis";

export const LEGAL_NOTICE_TEXT =
  "Die Tazkiyah 30 zeigen, ob Aktien die Kriterien des AAOIFI-Standards Nr. 21 erfüllen. Die Auswahl richtet sich danach, wie verbreitet die Aktien bei Anlegern in Deutschland sind und ob genug öffentliche Angaben für eine vollständige Prüfung vorliegen, nicht nach ihren Ertragsaussichten. Die Einstufung „konform“ ist keine Empfehlung zum Kauf, Verkauf oder Halten und berücksichtigt nicht Ihre persönliche Situation. Sie ist keine Fatwa. Bitte treffen Sie Anlageentscheidungen eigenverantwortlich und holen Sie bei Bedarf fachkundigen Rat ein. Stand und Quellen sind bei jeder Aktie angegeben.";

/** Öffnet den eingeklappten vollen Text und scrollt dorthin (ohne die Hash-Adresse zu ändern). */
function openFull(e) {
  e.preventDefault();
  const el = document.getElementById(LEGAL_NOTICE_ID);
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.querySelector("summary")?.focus({ preventScroll: true });
}

/** Kurzer Hinweis, immer sichtbar. */
export function LegalNoticeShort({ className = "" }) {
  return (
    <p className={"text-[15px] text-[var(--muted)] " + className}>
      Keine Anlageberatung, keine Fatwa.{" "}
      <a href={`#${LEGAL_NOTICE_ID}`} onClick={openFull} className="text-[var(--primary)] underline underline-offset-2 hover:text-[var(--primary-hover)]">
        Mehr dazu
      </a>
    </p>
  );
}

/** Voller Text, eingeklappt. */
export function LegalNoticeFull({ className = "" }) {
  return (
    <details id={LEGAL_NOTICE_ID} className={"card scroll-mt-24 " + className}>
      <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold text-[var(--text)]">{LEGAL_NOTICE_TITLE}</summary>
      <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-[var(--text-soft)]">{LEGAL_NOTICE_TEXT}</p>
    </details>
  );
}
