// src/components/screening/LimitBar.jsx
//
// Balken mit Grenzmarke: zeigt nur die Lage eines Werts zur Grenze, keine Bewertungsskala.
// Die Skala ist so gewählt, dass der Grenzwert bei 60 % der Balkenbreite liegt.

const FILL = {
  pass: "bg-[var(--emerald)]",
  fail: "bg-[var(--red)]",
  not_checked: "bg-[var(--faint)]",
};

export default function LimitBar({ value, limit, result = "not_checked", className = "" }) {
  if (typeof value !== "number" || typeof limit !== "number" || limit <= 0) return null;
  const scale = limit / 0.6;
  const width = Math.max(0, Math.min(100, (value / scale) * 100));
  return (
    <div aria-hidden="true" className={"relative h-[6px] w-full rounded-full bg-[var(--track)] " + className}>
      <div className={"h-full rounded-full " + (FILL[result] || FILL.not_checked)} style={{ width: `${width}%` }} />
      <div className="absolute top-1/2 h-[14px] w-[2px] -translate-y-1/2 rounded-sm bg-[var(--gold)]" style={{ left: "60%" }} />
    </div>
  );
}
