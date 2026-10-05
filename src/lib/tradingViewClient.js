// src/lib/tradingViewClient.js
//
// Browser-Teil der TradingView-Einbindung: Zustimmung (nur im Arbeitsspeicher) und Farben.

import { useEffect, useState } from "react";

// ---------------------------------------------------------------- Zustimmung

let consentGiven = false; // nur im Arbeitsspeicher, bis zum Neuladen der Seite
const consentListeners = new Set();

/** [zugestimmt, zustimmen] — gemeinsam für alle Widgets der Sitzung */
export function useTradingViewConsent() {
  const [given, setGiven] = useState(consentGiven);
  useEffect(() => {
    consentListeners.add(setGiven);
    setGiven(consentGiven);
    return () => consentListeners.delete(setGiven);
  }, []);
  const give = () => {
    consentGiven = true;
    consentListeners.forEach((fn) => fn(true));
  };
  return [given, give];
}

// ---------------------------------------------------------------- Farben

// Die Widgets laufen in einem iframe und brauchen feste Farbwerte, deshalb werden die
// Variablen --tv-* (siehe :root in App.jsx) beim Laden ausgelesen.

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Farben aus den Variablen --tv-* (siehe :root in App.jsx) */
export function tradingViewColors() {
  return {
    line: cssVar("--tv-line", "#1F5A43"),
    areaTop: cssVar("--tv-area-top", "rgba(31, 90, 67, 0.16)"),
    areaBottom: cssVar("--tv-area-bottom", "rgba(31, 90, 67, 0.01)"),
    grid: cssVar("--tv-grid", "rgba(27, 36, 31, 0.06)"),
    scaleText: cssVar("--tv-scale-text", "#4F5751"),
    text: cssVar("--tv-text", "#1B241F"),
    background: cssVar("--tv-bg", "#FFFFFF"),
    up: cssVar("--tv-up", "#2E7A55"),
    down: cssVar("--tv-down", "#C0533F"),
  };
}
