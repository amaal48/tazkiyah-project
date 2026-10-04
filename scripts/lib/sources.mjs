// scripts/lib/sources.mjs — lädt die Quelltexte eines Ordners review-work/<TICKER>/ (für die Zitatprüfung)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** A2 prüft gegen die Satzung (charter.txt, charter-weitere-N.txt), B3 gegen das 10-K (10k.txt). */
export async function loadSources(dir) {
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return { A2: {}, B3: {} };
  }
  const read = async (n) => [n, await readFile(path.join(dir, n), "utf8")];
  // Hauptsatzung zuerst, danach die weiteren Dokumente in Zahlenreihenfolge
  const charter = names
    .filter((n) => n === "charter.txt" || /^charter-(weitere|spaeter)-\d+(-anlage)?\.txt$/.test(n))
    .sort((a, b) => (a === "charter.txt" ? -1 : b === "charter.txt" ? 1 : a.localeCompare(b, "de", { numeric: true })));
  const tenK = names.filter((n) => n === "10k.txt");
  return {
    A2: Object.fromEntries(await Promise.all(charter.map(read))),
    B3: Object.fromEntries(await Promise.all(tenK.map(read))),
  };
}
