// src/lib/akademieProgress.js
//
// Lesefortschritt der Akademie, NUR im Browser (localStorage), nichts geht an Supabase oder einen Server.
//   tazkiyah-akademie-gelesen  JSON-Liste der gelesenen slugs (z. B. ["1-1","1-3"])
//   tazkiyah-akademie-zuletzt  slug der zuletzt geöffneten Lektion
// Alle Zugriffe in try/catch: Ohne Speicher (privates Fenster, gesperrt) gibt es einfach keinen Fortschritt.
// Für die Datenschutzerklärung vermerkt (PROJECT-CONTEXT, „Akademie“).

import { useEffect, useState } from "react";

export const READ_KEY = "tazkiyah-akademie-gelesen";
export const LAST_KEY = "tazkiyah-akademie-zuletzt";
const EVENT = "tazkiyah-akademie-fortschritt";

const SLUG = /^\d-\d{1,2}$/;

function storage(store) {
  if (store) return store;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** { read: Set, last: slug|null }; leer, wenn kein Speicher. */
export function readProgress(store) {
  let read = new Set();
  let last = null;
  try {
    const s = storage(store);
    const list = JSON.parse(s?.getItem(READ_KEY) || "[]");
    if (Array.isArray(list)) read = new Set(list.filter((x) => typeof x === "string" && SLUG.test(x)));
    const l = s?.getItem(LAST_KEY);
    last = l && SLUG.test(l) ? l : null;
  } catch {
    // kein Speicher oder unlesbar: ohne Fortschritt
  }
  return { read, last };
}

function notify() {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // außerhalb des Browsers (Tests)
  }
}

export function markRead(slug, store) {
  try {
    const s = storage(store);
    if (!s) return;
    const { read } = readProgress(s);
    if (read.has(slug)) return;
    read.add(slug);
    s.setItem(READ_KEY, JSON.stringify([...read]));
    notify();
  } catch {
    // Speicher voll oder gesperrt
  }
}

export function setLast(slug, store) {
  try {
    const s = storage(store);
    if (!s || s.getItem(LAST_KEY) === slug) return;
    s.setItem(LAST_KEY, slug);
    notify();
  } catch {
    // Speicher gesperrt
  }
}

/** Fortschritt als React-Zustand, aktualisiert bei Änderungen (auch aus anderen Tabs). */
export function useProgress() {
  const [p, setP] = useState(() => readProgress());
  useEffect(() => {
    const update = () => setP(readProgress());
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return p;
}
