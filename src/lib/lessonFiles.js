// src/lib/lessonFiles.js
//
// Lädt die Lektionen aus content/lernen/*.md beim Bauen (Vite, import.meta.glob) und wertet sie mit
// src/lib/lessons.js aus. Dateien mit „_“ (z. B. _vorlage.md) erscheinen nicht. Eine neue Lektion ist nach
// Commit und Deployment online.

import { lessonsFromFiles } from "./lessons.js";
import { routes } from "./hashRoute.js";
import { FEATURE_AKADEMIE_ENTWURF } from "./features.js";

const files = import.meta.glob("/content/lernen/*.md", { query: "?raw", import: "default", eager: true });

/** slug → Lektion (Inhalt) */
export const LESSON_CONTENT = lessonsFromFiles(files);

/** Lektion ist online (Datei vorhanden). */
export const isOnline = (slug) => LESSON_CONTENT.has(slug);

/** Lektion kann geöffnet werden: online, im Entwurfsmodus (VITE_AKADEMIE_ENTWURF) alle. */
export const isOpenable = (slug) => FEATURE_AKADEMIE_ENTWURF || isOnline(slug);

/** Ziel der Hinweise „… erklären wir in der Akademie“: Lektion 3.3, sobald sie online ist, sonst die Übersicht. */
export const AKADEMIE_PRUEFEN_LINK = isOnline("3-3") ? routes.lesson("3-3") : routes.lernen();
