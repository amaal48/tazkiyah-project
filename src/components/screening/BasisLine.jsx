// src/components/screening/BasisLine.jsx
//
// Die Grundlage in einer kompakten Zeile: AAOIFI SS 21, 27, 35 (Link zur Methodik),
// keine Verbindung zur AAOIFI, keine Anlageberatung, kein Rechtsgutachten.

import { routes } from "../../lib/hashRoute.js";

/** variant "footer": helle Schrift auf dunkler Fußzeile */
export default function BasisLine({ className = "", variant = "default" }) {
  const onDark = variant === "footer";
  return (
    <p className={"flex flex-wrap gap-x-2 gap-y-1 text-sm leading-relaxed " + (onDark ? "text-[var(--footer-text)] " : "text-[var(--muted)] ") + className}>
      <span>
        Grundlage:{" "}
        <a
          href={routes.methodik()}
          className={
            "underline underline-offset-2 " +
            (onDark ? "text-[var(--footer-link)] decoration-[var(--footer-link)]/50 hover:decoration-[var(--footer-link)]" : "text-[var(--primary)] decoration-[var(--primary)]/40 hover:decoration-[var(--primary)]")
          }
        >
          AAOIFI Shari'ah Standards Nr. 21, 27 und 35
        </a>
      </span>
      <span aria-hidden="true">·</span>
      <span>nicht mit der AAOIFI verbunden</span>
      <span aria-hidden="true">·</span>
      <span>keine Anlageberatung, kein Rechtsgutachten (Fatwa)</span>
    </p>
  );
}
