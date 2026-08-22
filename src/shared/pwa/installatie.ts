/**
 * Wanneer krijgt iemand uitleg over "zet op je beginscherm"? — QS8-117.
 *
 * ⚠️ **Waarom dit bestaat.** Chrome en Edge geven `beforeinstallprompt` en dus
 *    een knop. Safari heeft dat niet: daar moet de gebruiker zélf op Deel tikken
 *    en *Zet op beginscherm* kiezen, en niemand doet dat uit zichzelf. Op iOS is
 *    dat geen luxe maar de voorwaarde — Safari levert geen pushmeldingen aan een
 *    gewoon tabblad.
 *
 * ⚠️ **Waarom het een pure functie is en geen component.** De drie voorwaarden
 *    zijn precies waar dit misgaat: een Android-gebruiker uitleg geven over een
 *    menu dat hij niet heeft, of iemand die de app al geïnstalleerd heeft blijven
 *    lastigvallen. Dat hoort onder test te staan, en een component dat
 *    `navigator` leest is niet te testen zonder browser.
 */

/** Wat de app moet tonen. */
export type Installatieadvies =
  /** Niets. Andere browser, of de app draait al zelfstandig. */
  | 'verbergen'
  /** iOS-Safari, nog niet geïnstalleerd: leg Deel → Zet op beginscherm uit. */
  | 'toon-beginscherm-uitleg'
  /**
   * iOS, maar niet in Safari. Chrome en Firefox op iOS draaien op WebKit maar
   * hebben geen "zet op beginscherm" en dus ook geen push. Doorsturen naar
   * Safari is hier het enige nuttige antwoord.
   */
  | 'toon-open-in-safari';

export interface Omgeving {
  readonly userAgent: string;
  /** `navigator.standalone` — bestaat alleen op iOS. */
  readonly navigatorStandalone: boolean | undefined;
  /** `matchMedia('(display-mode: standalone)').matches`. */
  readonly displayModeStandalone: boolean;
  /**
   * `navigator.maxTouchPoints`.
   *
   * ⚠️ Nodig omdat een iPad sinds iPadOS 13 zichzelf als "Macintosh" aankondigt.
   *    Zonder deze controle valt elke iPad buiten de detectie en krijgt de
   *    eigenaar nooit te horen waarom hij geen meldingen krijgt.
   */
  readonly maxTouchPoints: number;
}

function isIos(omgeving: Omgeving): boolean {
  if (/iPhone|iPod/.test(omgeving.userAgent)) return true;
  if (/iPad/.test(omgeving.userAgent)) return true;
  // iPadOS 13+ doet zich voor als een Mac; alleen het aanraakscherm verraadt hem.
  return /Macintosh/.test(omgeving.userAgent) && omgeving.maxTouchPoints > 1;
}

/**
 * ⚠️ Alle browsers op iOS zetten "Safari" in hun user-agent, want ze draaien
 *    allemaal op WebKit. Wie er níét Safari is, zegt dat met een eigen merkje —
 *    daarom wordt hier op de uitzonderingen getoetst en niet op "Safari".
 */
function isSafari(userAgent: string): boolean {
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(userAgent);
}

function draaitZelfstandig(omgeving: Omgeving): boolean {
  return omgeving.navigatorStandalone === true || omgeving.displayModeStandalone;
}

/**
 * Het advies voor deze omgeving.
 *
 * De aanroeper bepaalt nog wáár het getoond wordt: dit hoort op de plek waar het
 * ertoe doet — bij het aanzetten van meldingen — en niet als banner op elk scherm.
 */
export function installatieadvies(omgeving: Omgeving): Installatieadvies {
  if (!isIos(omgeving)) return 'verbergen';
  if (draaitZelfstandig(omgeving)) return 'verbergen';
  return isSafari(omgeving.userAgent) ? 'toon-beginscherm-uitleg' : 'toon-open-in-safari';
}

/**
 * Leest de omgeving uit de browser. Geeft `verbergen` buiten een browser — op
 * native is er niets te installeren.
 */
export function huidigInstallatieadvies(): Installatieadvies {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'verbergen';

  const nav = navigator as Navigator & { standalone?: boolean };

  return installatieadvies({
    userAgent: nav.userAgent,
    navigatorStandalone: nav.standalone,
    displayModeStandalone:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
  });
}
