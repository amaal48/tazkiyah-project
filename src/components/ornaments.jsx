// src/components/ornaments.jsx
//
// Bausteine von Design B2 „Das Muster, hell“ (16.10.2026), alle als inline SVG mit aria-hidden,
// keine Bilddateien: Fries (goldenes Rautenband), Rosettenmuster für grüne Flächen, Spitzbogen-Rahmen,
// Manuskript-Rahmen (außen Gold, innen helle Linie) und der achtzackige Stern (Logo, Nummern).
// Farben über die CSS-Variablen aus App.jsx (:root).

import { useId } from "react";

/** Eindeutige, in url(#…) gültige ID (useId liefert Doppelpunkte). */
function usePatternId(prefix) {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Pfad des achtzackigen Sterns im 64er-Raster. */
const STAR_PATH = "M32 4 L39 25 L60 32 L39 39 L32 60 L25 39 L4 32 L25 25 Z";

/** Rosette als Musterkachel (64 × 64). */
function RosettePattern({ id }) {
  return (
    <pattern id={id} width="64" height="64" patternUnits="userSpaceOnUse">
      <g fill="none" style={{ stroke: "var(--gold-line)" }} strokeWidth="1">
        <path d="M32 8 L38 26 L56 32 L38 38 L32 56 L26 38 L8 32 L26 26 Z" />
        <circle cx="32" cy="32" r="6" />
        <path d="M0 0 L8 8 M64 0 L56 8 M0 64 L8 56 M64 64 L56 56" />
      </g>
    </pattern>
  );
}

/** Goldenes Rautenband über die volle Breite (unter dem Kopf, über der Fußzeile). */
export function Frieze({ className = "" }) {
  const id = usePatternId("fries");
  return (
    <svg aria-hidden="true" focusable="false" width="100%" height="24" className={"block " + className}>
      <defs>
        <pattern id={id} width="40" height="24" patternUnits="userSpaceOnUse">
          <g fill="none" style={{ stroke: "var(--gold)" }} strokeWidth="1">
            <path d="M0 12 L10 2 L20 12 L10 22 Z M20 12 L30 2 L40 12 L30 22 Z" />
            <circle cx="20" cy="12" r="2" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="24" fill={`url(#${id})`} />
    </svg>
  );
}

/** Rosettenmuster als Hintergrund einer grünen Fläche (Eltern-Element braucht position: relative). */
export function RosetteOverlay({ opacity = 0.2 }) {
  const id = usePatternId("rosette");
  return (
    <svg aria-hidden="true" focusable="false" width="100%" height="100%" className="pointer-events-none absolute inset-0" style={{ opacity }}>
      <defs>
        <RosettePattern id={id} />
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** Grüne Fläche mit Rosettenmuster; Inhalt liegt darüber. */
export function GreenBand({ children, className = "", opacity = 0.18, as: Tag = "div", ...rest }) {
  return (
    <Tag className={"on-green relative bg-[var(--green-deep)] text-[var(--on-green)] " + className} {...rest}>
      <RosetteOverlay opacity={opacity} />
      <div className="relative">{children}</div>
    </Tag>
  );
}

/**
 * Spitzbogen: grüne Fläche mit Rosette und goldener Innenlinie. Die Grafik dehnt sich mit dem Inhalt
 * (preserveAspectRatio none); der Inhalt sitzt unten im Bogen. paddingTop hält den Bogenscheitel frei.
 */
export function ArchFrame({ children, className = "", minHeight = 520, paddingTop = 220, double = false, rosette = 0.35 }) {
  const id = usePatternId("bogen");
  return (
    <div className={"on-green relative " + className} style={{ minHeight }}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 400 560" preserveAspectRatio="none" width="100%" height="100%" className="absolute inset-0">
        <defs>
          <RosettePattern id={id} />
        </defs>
        <path d="M0 560 V200 Q0 60 200 0 Q400 60 400 200 V560 Z" style={{ fill: "var(--green-deep)" }} />
        {rosette > 0 && <path d="M0 560 V200 Q0 60 200 0 Q400 60 400 200 V560 Z" fill={`url(#${id})`} opacity={rosette} />}
        <path d="M18 560 V206 Q18 78 200 22 Q382 78 382 206 V560" fill="none" style={{ stroke: "var(--gold-line)" }} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {double && (
          <path d="M34 560 V212 Q34 94 200 42 Q366 94 366 212 V560" fill="none" style={{ stroke: "var(--gold-line)" }} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="relative flex h-full flex-col justify-end" style={{ minHeight, paddingTop }}>
        {children}
      </div>
    </div>
  );
}

/** Manuskript-Rahmen: doppelter Rahmen, außen Gold, innen helle Linie. */
export function ManuscriptFrame({ children, className = "", innerClassName = "", as: Tag = "div", ...rest }) {
  return (
    <Tag className={"manuscript " + className} {...rest}>
      <div className={"manuscript-inner " + innerClassName}>{children}</div>
    </Tag>
  );
}

/** Achtzackiger Stern als Logo-Zeichen (gefüllt, mit Punkt in der Mitte). */
export function StarMark({ size = 36, fill = "var(--green-deep)", dot = "var(--gold-light)", className = "" }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className={"flex-none " + className}>
      <path d={STAR_PATH} style={{ fill }} />
      <circle cx="32" cy="32" r="6" style={{ fill: dot }} />
    </svg>
  );
}

/** Stern-Umriss mit Nummer (z. B. „1“ für Schritte). Die Nummer ist Teil der Grafik, daher aria-hidden; Text daneben nennen. */
export function StarNumber({ n, size = 72, stroke = "var(--gold-light)", color = "var(--gold-light)", className = "" }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className={"flex-none " + className}>
      <path d={STAR_PATH} fill="none" style={{ stroke }} strokeWidth="1.4" />
      <text x="32" y="38.5" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fontWeight="600" style={{ fill: color }}>
        {n}
      </text>
    </svg>
  );
}
