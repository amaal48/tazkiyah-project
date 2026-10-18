// src/lib/features.js
//
// Schalter für Bereiche, die zeitweise ausgeblendet sind. Gesetzt über Umgebungsvariablen in Vercel
// (bzw. .env.local), wirksam nach dem nächsten Deployment.
//
// VITE_FEATURE_TAZKIYAH30 (Standard: aus). Entscheidung 17.10.2026: Die Tazkiyah 30 werden zum Launch
// archiviert, nicht gelöscht; Tazkiyah gibt keine eigene Sharia-Einschätzung zu einzelnen Aktien ab.
// Aus: keine Seite „Tazkiyah 30“, kein Halal-Status, keine Markierung der 30, kein „Prüfung wünschen“;
// Aktiensuche und Aktienseiten bleiben für alle Titel. Nur der Wert "true" schaltet ein.
// Siehe PROJECT-CONTEXT.md, „Archiv Tazkiyah 30 (17.10.2026)“.

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const FEATURE_TAZKIYAH30 = String(env.VITE_FEATURE_TAZKIYAH30 ?? "").trim() === "true";

// VITE_AKADEMIE_ENTWURF (Standard: aus, 18.10.2026): Entwurfsmodus der Akademie. Ein: alle 25 Lektionen sind
// öffnebar, fehlende Abschnitte zeigen graue Platzhalter. Als „online“ gelten weiter nur echte Dateien in
// content/lernen/. Nur der Wert "true" schaltet ein; in Production nicht setzen.
export const FEATURE_AKADEMIE_ENTWURF = String(env.VITE_AKADEMIE_ENTWURF ?? "").trim() === "true";

/** Hinweis auf jeder Aktienseite und in der Aktiensuche, solange die Tazkiyah 30 archiviert sind. */
export const NO_SHARIA_ASSESSMENT_TEXT =
  "Tazkiyah gibt keine Sharia-Einschätzung zu einzelnen Aktien ab. Wie man selbst nach dem AAOIFI-Standard prüfen kann, erklären wir in der Akademie.";
