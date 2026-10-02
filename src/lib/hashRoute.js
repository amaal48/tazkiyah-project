// src/lib/hashRoute.js
//
// Hash-Adressen ohne Router-Bibliothek. Nur Adressen, die mit "#/" beginnen,
// sind Seiten; alles andere (z. B. "#screener") ist eine Sprungmarke und wird
// hier ignoriert.
//
//   #/                 Startseite (Überblick)
//   #/screener         Screener (Filter und Liste)
//   #/aktie/AAPL       Detailseite
//   #/kriterium/b1     Erklärseite je Prüfung (ID klein)
//   #/methodik         Methodik-Übersicht

import { useEffect, useState } from "react";

/** Liest eine Hash-Adresse. null = keine Seitenadresse (Sprungmarke). */
export function parseHash(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const h = String(hash || "").replace(/^#/, "");
  if (h === "") return { name: "home" };
  if (!h.startsWith("/")) return null;
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
  if (parts[0] === "screener") return { name: "screener" };
  return { name: "home" };
}

export const routes = {
  home: () => "#/",
  screener: () => "#/screener",
  stock: (ticker) => `#/aktie/${encodeURIComponent(ticker)}`,
  criterion: (id) => `#/kriterium/${String(id).toLowerCase()}`,
  methodik: () => "#/methodik",
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
