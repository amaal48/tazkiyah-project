// src/screening/providers/openfigi.js
//
// Prüft per ISIN, an welchen deutschen Handelsplätzen eine Aktie gelistet ist
// (Universum, Punkt 9). Quelle: OpenFIGI (kostenlos, von Bloomberg betrieben).
//   Ohne API-Key: 10 ISINs pro Anfrage, 25 Anfragen pro Minute.
//   Mit kostenlosem Key (OPENFIGI_API_KEY): 100 ISINs pro Anfrage.
//
// Börsenkennungen (exchCode) aus der Bloomberg-Systematik. Belegt am 15.10.2026 per Abfrage mit
// MIC-Filter (NVDA, JNJ): XGAT → TH (Tradegate), XETR → GY, XFRA → GF, XMUN → GM.
// gettex (MIC MUNC) kennt OpenFIGI nicht („No identifier found“), deshalb nicht ausgewertet.

export const GERMAN_EXCH_CODES = {
  GR: "Deutschland (alle Plätze)",
  GY: "Xetra",
  GF: "Frankfurt",
  GS: "Stuttgart",
  GM: "München",
  GD: "Düsseldorf",
  GH: "Hamburg",
  GI: "Hannover",
  GB: "Berlin",
  TH: "Tradegate",
};

const URL = "https://api.openfigi.com/v3/mapping";

/** Reine Auswertung einer OpenFIGI-Antwort — testbar ohne Netzwerk. */
export function germanVenuesFromMapping(entry) {
  if (!entry || entry.error) return undefined; // Fehler → später erneut versuchen
  if (entry.warning) return []; // „No identifier found“ → kein Listing bekannt
  const codes = new Set((entry.data || []).map((d) => d.exchCode).filter((c) => GERMAN_EXCH_CODES[c]));
  return [...codes].sort().map((c) => GERMAN_EXCH_CODES[c]);
}

export function createOpenFigiClient({ apiKey = null, fetchImpl = fetch } = {}) {
  const batchSize = apiKey ? 100 : 10;
  return {
    id: "openfigi",
    maxPerRun: apiKey ? 200 : 50,
    /** @returns {Promise<Map<string, string[]|undefined>>} ISIN → Handelsplätze */
    async lookup(isins) {
      const out = new Map();
      for (let i = 0; i < isins.length; i += batchSize) {
        const batch = isins.slice(i, i + batchSize);
        const res = await fetchImpl(URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(apiKey ? { "X-OPENFIGI-APIKEY": apiKey } : {}) },
          body: JSON.stringify(batch.map((isin) => ({ idType: "ID_ISIN", idValue: isin }))),
          signal: AbortSignal.timeout(10000), // Zeitgrenze je Anfrage
        });
        if (!res.ok) throw new Error(`OpenFIGI ${res.status}`);
        const data = await res.json();
        batch.forEach((isin, j) => out.set(isin, germanVenuesFromMapping(data[j])));
      }
      return out;
    },
  };
}
