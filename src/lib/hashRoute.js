// src/lib/hashRoute.js
//
// Hash-Adressen ohne Router-Bibliothek. Nur Adressen, die mit "#/" beginnen,
// sind Seiten; alles andere (z. B. "#screener") ist eine Sprungmarke und wird
// hier ignoriert.
//
//   #/                 Startseite (Überblick)
//   #/tazkiyah-30      Die Tazkiyah 30 (Liste mit Halal-Status; #/screener führt ebenfalls dorthin)
//   #/aktien           Aktiensuche (alle Titel, ohne Status)
//   #/aktie/AAPL       Detailseite (Tazkiyah 30) bzw. Aktienseite ohne Status (alle übrigen)
//   #/kriterium/b1     Erklärseite je Prüfung (ID klein)
//   #/methodik         Methodik-Übersicht
//   #/kontakt          Kontaktformular, optional vorausgefüllt: #/kontakt?thema=fehler&aktie=AAPL

import { useEffect, useState } from "react";

/** Liest eine Hash-Adresse. null = keine Seitenadresse (Sprungmarke). */
export function parseHash(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const full = String(hash || "").replace(/^#/, "");
  if (full === "") return { name: "home" };
  if (!full.startsWith("/")) return null;
  const [h, query = ""] = full.split("?");
  const parts = h
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  if (parts[0] === "aktie" && parts[1]) return { name: "stock", ticker: parts[1].toUpperCase() };
  if (parts[0] === "kriterium" && parts[1]) return { name: "criterion", id: parts[1].toUpperCase() };
  if (parts[0] === "methodik") return { name: "methodik" };
  if (parts[0] === "screener" || parts[0] === "tazkiyah-30") return { name: "tazkiyah30" };
  if (parts[0] === "aktien") return { name: "aktien" };
  if (parts[0] === "kontakt") {
    const q = new URLSearchParams(query);
    return { name: "kontakt", topic: q.get("thema") || null, ticker: (q.get("aktie") || "").toUpperCase() || null };
  }
  return { name: "home" };
}

export const routes = {
  home: () => "#/",
  tazkiyah30: () => "#/tazkiyah-30",
  // Alte Adresse, führt auf die Tazkiyah 30
  screener: () => "#/tazkiyah-30",
  aktien: () => "#/aktien",
  stock: (ticker) => `#/aktie/${encodeURIComponent(ticker)}`,
  criterion: (id) => `#/kriterium/${String(id).toLowerCase()}`,
  methodik: () => "#/methodik",
  /** Kontaktformular; topic: Thema im Formular (z. B. "pruefung", "fehler"), ticker: Aktie für den Text */
  kontakt: ({ topic, ticker } = {}) => {
    const q = new URLSearchParams();
    if (topic) q.set("thema", topic);
    if (ticker) q.set("aktie", ticker);
    const qs = q.toString();
    return `#/kontakt${qs ? `?${qs}` : ""}`;
  },
};

/** Wechselt die Adresse (neuer Verlaufseintrag, löst "hashchange" aus). */
export function navigate(hash) {
  if (window.location.hash !== hash) window.location.hash = hash;
}

/**
 * Setzt die Adresse ohne "hashchange" (für Seiten, die nur über den page-Zustand laufen),
 * damit die Zurück-Taste von dort auf die vorige Seitenadresse führt.
 */
export function pushHashSilently(hash) {
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
}

/** Aktuelle Seitenadresse als React-Zustand. */
export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
