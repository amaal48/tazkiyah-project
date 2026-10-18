// src/lib/akademie.js
//
// Reihenfolge und Fortschritt der Akademie, reine Funktionen (getestet in akademie.test.js).
// openable(slug): Lektion kann geöffnet werden (online, im Entwurfsmodus alle). read: Set der gelesenen slugs.

import { LESSONS, STUFEN, lessonsOfStufe } from "../data/lernpfad.js";

const indexOf = (slug) => LESSONS.findIndex((l) => l.slug === slug);

/** Nächste öffnebare Lektion nach slug, auch über Stufengrenzen (1.7 → 2.1). */
export function nextLesson(slug, openable) {
  return LESSONS.slice(indexOf(slug) + 1).find((l) => openable(l.slug)) || null;
}

/** Vorherige öffnebare Lektion vor slug. */
export function prevLesson(slug, openable) {
  return LESSONS.slice(0, Math.max(0, indexOf(slug))).reverse().find((l) => openable(l.slug)) || null;
}

/** Erste öffnebare Lektion einer Stufe. */
export function firstOfStufe(nr, openable) {
  return lessonsOfStufe(nr).find((l) => openable(l.slug)) || null;
}

/** Letzte Lektion der Stufe (laut Liste, unabhängig vom Online-Status)? */
export function isLastOfStufe(lesson) {
  const list = lessonsOfStufe(lesson.stufe);
  return list[list.length - 1].slug === lesson.slug;
}

/** { read, total } für eine Stufe */
export function stufeProgress(nr, read) {
  const list = lessonsOfStufe(nr);
  return { read: list.filter((l) => read.has(l.slug)).length, total: list.length };
}

export function nextStufe(nr) {
  return STUFEN.find((s) => s.nr === nr + 1) || null;
}

/**
 * Karte „Weiter, wo du warst“: zuletzt geöffnete, noch nicht gelesene Lektion; sonst die nächste öffnebare
 * Lektion danach (bzw. die erste ungelesene). null, wenn noch nichts gelesen oder geöffnet wurde oder nichts offen ist.
 */
export function resumeLesson({ read, last }, openable) {
  if (!read.size && !last) return null;
  const lastLesson = last ? LESSONS.find((l) => l.slug === last) : null;
  if (lastLesson && openable(lastLesson.slug) && !read.has(lastLesson.slug)) return lastLesson;
  const after = lastLesson ? LESSONS.slice(indexOf(lastLesson.slug) + 1) : LESSONS;
  return after.find((l) => openable(l.slug) && !read.has(l.slug)) || LESSONS.find((l) => openable(l.slug) && !read.has(l.slug)) || null;
}

/** Ziel der Links „Wo stehst du?“: die Lektion, wenn öffnebar, sonst der Abschnitt ihrer Stufe. */
export function entryTarget(slug, openable) {
  const l = LESSONS.find((x) => x.slug === slug);
  return openable(slug) ? { lesson: l } : { stufe: l.stufe };
}
