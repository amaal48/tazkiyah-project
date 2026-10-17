// src/components/screening/legalNoticeText.js
//
// Wortlaut des rechtlichen Hinweises (LegalNotice.jsx). Eigene Datei, damit Tests ihn ohne JSX lesen können.
// Vor dem Launch anwaltlich prüfen lassen.

import { FEATURE_TAZKIYAH30 } from "../../lib/features.js";

export const LEGAL_NOTICE_TEXT_TAZKIYAH30 =
  "Die Tazkiyah 30 zeigen, ob Aktien die Kriterien des AAOIFI-Standards Nr. 21 erfüllen. Die Auswahl richtet sich danach, wie verbreitet die Aktien bei Anlegern in Deutschland sind und ob genug öffentliche Angaben für eine vollständige Prüfung vorliegen, nicht nach ihren Ertragsaussichten. Die Einstufung „konform“ ist keine Empfehlung zum Kauf, Verkauf oder Halten und berücksichtigt nicht Ihre persönliche Situation. Sie ist keine Fatwa. Bitte treffen Sie Anlageentscheidungen eigenverantwortlich und holen Sie bei Bedarf fachkundigen Rat ein. Stand und Quellen sind bei jeder Aktie angegeben.";

export const LEGAL_NOTICE_TEXT_ARCHIV =
  "Tazkiyah gibt keine Sharia-Einschätzung zu einzelnen Aktien ab. Die Inhalte dienen der Information und dem Lernen. Sie sind keine Empfehlung zum Kauf, Verkauf oder Halten und berücksichtigen nicht Ihre persönliche Situation. Sie sind keine Fatwa. Bitte treffen Sie Anlageentscheidungen eigenverantwortlich und holen Sie bei Bedarf fachkundigen Rat ein.";

export const LEGAL_NOTICE_TEXT = FEATURE_TAZKIYAH30 ? LEGAL_NOTICE_TEXT_TAZKIYAH30 : LEGAL_NOTICE_TEXT_ARCHIV;
