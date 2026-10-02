// src/components/screening/format.js
//
// Zahlen-, Datums- und Begründungstexte für die Screening-Oberfläche.
// Grenzwerte und Erklärungen kommen aus src/screening/*; hier wird nur formatiert.

import { EXPLANATIONS, fillParams } from "../../screening/explanations.js";
import { USER_NOTICES } from "../../screening/parameters.js";

/** Hinweis auf Hauptseite und Detailseite: keine Anlageberatung, kein Rechtsgutachten (Fatwa). */
export const NOTICE_NO_ADVICE = `Keine Anlageberatung und kein Rechtsgutachten (Fatwa). ${USER_NOTICES.noFatwa}`;

// src/index.css setzt globale h1/h2-Regeln außerhalb der Tailwind-Layer;
// Überschriften deshalb mit Inline-Stil (wie MethodikPage.jsx).
export const H1_STYLE = { fontSize: "2rem", color: "var(--text)", margin: 0, letterSpacing: 0, fontWeight: 500, lineHeight: 1.2 };
export const H2_STYLE = { fontSize: "1.375rem", color: "var(--text)", margin: 0, letterSpacing: 0, fontWeight: 500, lineHeight: 1.25 };

export const STATUS_TEXT = {
  konform: "Konform",
  nicht_konform: "Nicht konform",
  nicht_geprueft: "Nicht geprüft",
};

export const STATUS_ORDER = ["konform", "nicht_konform", "nicht_geprueft"];

/** Ein Satz je Status (Legende, Startseite, Tooltips im Screener). */
export const STATUS_EXPLANATIONS = {
  konform: "Alle Prüfungen sind bestanden.",
  nicht_konform: "Mindestens eine Prüfung ist nicht bestanden.",
  nicht_geprueft: "Mindestens eine Prüfung steht noch aus oder ließ sich mit den Daten nicht abschließen; keine ist nicht bestanden.",
};


/** Zahl mit Komma, ohne Tausenderpunkt bei kleinen Werten. */
export function fmtNum(n, digits) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  return n.toLocaleString("de-DE", digits == null ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Grenzwert wie in den Parametern (30 → „30 %“, 33.3 → „33,3 %“). */
export const fmtLimit = (n) => `${fmtNum(n)} %`;

/** Prozentwert mit fester Nachkommazahl, geschütztes Leerzeichen vor „%“. */
export const fmtPct = (n, digits = 2) => `${fmtNum(n, digits)} %`;

/** Große Beträge kurz, z. B. „12,3 Mrd.“. */
export function fmtAmount(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  return new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** "2026-06-27" oder ISO-Zeitstempel → "27.06.2026". */
export function fmtDate(v) {
  if (!v) return "–";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}.${m}.${y}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
}

export const BASIS_TEXT = {
  annual: "Jahresabschluss",
  quarter: "Quartal",
  ttm: "Letzte 4 Quartale bis",
};

/** Kurzname für „noch offen“: A2 → Satzung, B3 → Umsatzsegmente, sonst Name der Prüfung. */
const OPEN_NAMES = { A2: "Satzung", B3: "Umsatzsegmente" };

/** "A", "A und B", "A, B und C" */
export function joinDe(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} und ${items[items.length - 1]}`;
}

/** Wert gegen Grenze in der Liste: eine Nachkommastelle, außer die Rundung verwischt die Grenze. */
function listPct(value, limit) {
  const one = Math.round(value * 10) / 10;
  return fmtPct(value, one === limit ? 2 : 1);
}

function failedText(f) {
  const c = f.check;
  if (c && typeof c.value === "number" && typeof c.limit === "number") {
    const bound = c.comparator === ">=" ? "mindestens" : "höchstens";
    const basis = BASIS_TEXT[c.basis] || "Abschluss";
    return `${f.name} ${listPct(c.value, c.limit)} (${bound} ${fmtLimit(c.limit)}), ${basis} ${fmtDate(c.periodEnd)}`;
  }
  return f.reason || f.name;
}

/**
 * Ergebnisse älterer Läufe haben noch keine `headline`. Ersatz aus `summary`
 * (nur IDs, ohne Werte) bzw. auf der Detailseite aus den Prüfungen selbst.
 */
export function headlineFromSummary(summary) {
  const name = (id) => EXPLANATIONS[id]?.name || id;
  return {
    failed: (summary?.failed || []).map((id) => ({ criterion: id, name: name(id), reason: null, check: null })),
    notChecked: (summary?.notChecked || []).map((id) => ({ criterion: id, name: name(id), reason: null })),
  };
}

export function headlineFromCriteria(criteria) {
  const failed = [];
  const notChecked = [];
  for (const c of criteria || []) {
    if (c.result === "fail") {
      const bad = (c.checks || []).find((x) => x.result === "fail");
      failed.push({ criterion: c.id, name: c.name, reason: c.reason ?? null, check: bad && typeof bad.limit === "number" ? bad : null });
    } else if (c.result === "not_checked") {
      const open = (c.checks || []).find((x) => x.result === "not_checked");
      notChecked.push({ criterion: c.id, name: c.name, reason: c.reason ?? open?.reason ?? null });
    }
  }
  return { failed, notChecked };
}

/** Ein Satz für die Liste (6.2). */
export function reasonLine(row) {
  if (!row.hasResult) return "Wird demnächst geprüft.";
  const h = row.headline || headlineFromSummary(row.summary);
  if (row.status === "nicht_konform") {
    const failed = h.failed || [];
    if (!failed.length) return "Mindestens eine Prüfung ist nicht bestanden.";
    const more = failed.length - 1;
    return failedText(failed[0]) + (more > 0 ? ` und ${more} weitere` : "") + ".";
  }
  if (row.status === "nicht_geprueft") {
    const names = [...new Set((h.notChecked || []).map((n) => OPEN_NAMES[n.criterion] || n.name))];
    if (!names.length) return "Wird demnächst geprüft.";
    return `${joinDe(names)} ${names.length > 1 ? "werden" : "wird"} noch geprüft.`;
  }
  return `Alle Prüfungen nach AAOIFI SS 21 bestanden. Ergebnis vom ${fmtDate(row.runAt)}.`;
}

/** Ausführliche Begründung für die Detailseite (alle durchgefallenen und offenen Prüfungen). */
export function reasonDetails(headline) {
  const h = headline || { failed: [], notChecked: [] };
  return {
    failed: (h.failed || []).map((f) => ({ criterion: f.criterion, text: failedText(f) })),
    notChecked: (h.notChecked || []).map((n) => ({ criterion: n.criterion, name: n.name, text: n.reason || "Noch nicht geprüft" })),
  };
}

// Abkürzungen, nach denen kein Satz endet
const ABBREVIATIONS = ["z. B.", "z.B.", "u. a.", "d. h.", "bzw.", "ca.", "Nr.", "vgl."];

/** Erster Satz eines Textes. */
export function firstSentence(text) {
  let t = String(text || "");
  ABBREVIATIONS.forEach((a, i) => (t = t.split(a).join(`\u0000${i}\u0000`)));
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  let s = m ? m[0] : t;
  ABBREVIATIONS.forEach((a, i) => (s = s.split(`\u0000${i}\u0000`).join(a)));
  return s;
}

/** Kurzsatz einer Prüfung mit eingesetzten Grenzwerten. */
export function shortExplanation(id, parameters) {
  const e = EXPLANATIONS[id];
  if (!e?.simple?.length) return "";
  return firstSentence(fillParams(e.simple[0], parameters));
}

/** Nur http(s)-Adressen als Link zulassen. */
export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
