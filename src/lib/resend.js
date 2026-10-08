// src/lib/resend.js
//
// E-Mail-Versand über die Resend-API (nur serverseitig, aus api/*). Kein zusätzliches Paket.
// Gibt { ok: true } oder { ok: false, error } zurück; error enthält nur Statuscode und
// Fehlerart von Resend, nie Empfänger, Inhalte oder den Schlüssel.

export async function sendResendEmail({ apiKey, from, to, replyTo, subject, text }) {
  const body = { from, to: [to], subject, text };
  if (replyTo) body.reply_to = replyTo;
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Resend nicht erreichbar" };
  }
  if (response.ok) return { ok: true };
  let name = "";
  try {
    name = String((await response.json())?.name || "");
  } catch {
    // Antwort ohne JSON
  }
  return { ok: false, error: `Resend ${response.status}${name ? ` (${name})` : ""}` };
}
