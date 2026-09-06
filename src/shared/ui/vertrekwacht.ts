/**
 * Weglopen met onopgeslagen tekst kost een tweede handeling — ook langs de
 * uitgangen die niet van de app zijn.
 *
 * ⚠️ **Waarom dit bestaat.** De weekafsluiting dekte sinds EPIC 7 alleen zijn
 *    eigen knop: staat er tekst, dan wordt "Terug naar de groep" eerst een
 *    waarschuwing. Alle úitgangen daarbuiten waren open — verversen, het tabblad
 *    sluiten, de hardwareknop op Android — en juist vraag 2 is de enige plek in
 *    de app waar iemand zijn eigen tegenslag opschrijft. Dat is precies de tekst
 *    die je niet nog een keer typt.
 *
 * ⚠️ **En waarom er géén concept wordt bewaard.** De andere uitweg was een
 *    lokaal concept in `AsyncStorage`. Op web is dat `localStorage`: onversleuteld,
 *    leesbaar voor elk script op de origin, en het blijft staan na uitloggen. Dan
 *    ligt de zwaarste zin uit de app op een gedeelde computer. Waarschuwen kost
 *    de gebruiker één tik; bewaren kost hem een belofte. Zie
 *    `docs/decisions/2026-08-27-de-uitgangen-van-de-weekafsluiting.md`.
 *
 * ⚠️ **De terugknop van de browser is er op 04-09-2026 bijgekomen.** Die uitgang
 *    stond bijna een week open omdat expo-router geen manier leek te bieden om een
 *    navigatie tegen te houden. Dat klopte niet meer: `expo-router/react-navigation`
 *    is een gepubliceerd toegangspunt en exporteert `usePreventRemove`. Het
 *    aansluiten gebeurt in `useVertrekwacht.ts`, want het is een hook en geen
 *    luisteraar — de volgorde die daarbij hoort staat bij `vertrekstap()` hieronder.
 *    Zie `docs/decisions/2026-09-04-de-terugknop-van-de-browser.md`.
 */

/** Het stukje van een `beforeunload`-gebeurtenis dat er hier toe doet. */
export interface VertrekGebeurtenis {
  preventDefault: () => void;
  returnValue: unknown;
}

/** Het stukje van `window` dat er hier toe doet. */
export interface Venster {
  readonly addEventListener: (
    naam: 'beforeunload',
    luisteraar: (gebeurtenis: VertrekGebeurtenis) => void,
  ) => void;
  readonly removeEventListener: (
    naam: 'beforeunload',
    luisteraar: (gebeurtenis: VertrekGebeurtenis) => void,
  ) => void;
}

/** Het stukje van `BackHandler` dat er hier toe doet. */
export interface Terugknop {
  readonly addEventListener: (
    naam: 'hardwareBackPress',
    luisteraar: () => boolean,
  ) => { readonly remove: () => void };
}

export interface Vertrekwacht {
  /** Staat er iets te verliezen? Zo niet, dan registreert deze wacht niets. */
  readonly actief: boolean;
  /**
   * Wordt aangeroepen als de terugknop is tegengehouden.
   *
   * ⚠️ Nodig, want tegenhouden alleen ziet eruit als een kapotte knop. Het scherm
   *    zegt daarna zelf waaróm er niets gebeurde en welke knop wél weggaat.
   */
  readonly opGeblokkeerd: () => void;
  /** `window` op web, `null` op native. */
  readonly venster: Venster | null;
  /** `BackHandler` op Android, `null` daarbuiten. */
  readonly terugknop: Terugknop | null;
}

/**
 * Registreert de wacht en geeft terug hoe je hem weer opheft.
 *
 * ⚠️ **Bij `actief === false` wordt er niets geregistreerd, en dat is geen
 *    optimalisatie.** Een `beforeunload`-luisteraar die er staat, zet de
 *    back/forward-cache van de browser uit — óók een luisteraar die niets doet.
 *    Altijd registreren en binnenin beslissen zou dus elke terugnavigatie in de
 *    hele app trager maken voor een scherm dat meestal niets te beschermen heeft.
 *
 * ⚠️ **De handler doet twee dingen die allebei nodig zijn.** `preventDefault()`
 *    is wat de standaard voorschrijft; `returnValue` zetten is wat oudere
 *    Chromium-versies daadwerkelijk lezen. Eén van de twee is in een deel van de
 *    browsers stil geen dialoog.
 */
export function bindVertrekwacht(wacht: Vertrekwacht): () => void {
  if (!wacht.actief) return () => {};

  const opheffers: (() => void)[] = [];

  if (wacht.venster !== null) {
    const venster = wacht.venster;
    const opVertrek = (gebeurtenis: VertrekGebeurtenis): void => {
      gebeurtenis.preventDefault();
      gebeurtenis.returnValue = '';
    };
    venster.addEventListener('beforeunload', opVertrek);
    opheffers.push(() => venster.removeEventListener('beforeunload', opVertrek));
  }

  if (wacht.terugknop !== null) {
    const abonnement = wacht.terugknop.addEventListener('hardwareBackPress', () => {
      wacht.opGeblokkeerd();
      // `true` betekent: afgehandeld. Zonder dit sluit Android het scherm alsnog.
      return true;
    });
    opheffers.push(() => abonnement.remove());
  }

  return () => {
    for (const hef of opheffers) hef();
  };
}

/** Wat er met een vertrekwens moet gebeuren. */
export type Vertrekstap = 'niets' | 'wachten' | 'gaan';

/**
 * De volgorde waarin je je eigen wacht verlaat: **eerst de slagboom omlaag, dan
 * pas rijden.**
 *
 * ⚠️ **Waarom dit een eigen beslissing is en geen `if` in het scherm.** Sinds de
 *    routerwacht erbij zit, houdt de wacht óók een navigatie bínnen de app tegen.
 *    "Toch weg, zonder delen" is zelf zo'n navigatie. Wie die knop rechtstreeks
 *    op `router.replace()` zet, laat de wacht zijn eigen nooduitgang
 *    dichthouden — de knop doet dan zichtbaar niets en de gebruiker zit vast met
 *    de tekst die hij juist wilde weggooien.
 *
 *    De uitweg is niet "de wacht even overslaan" maar een render ertussen: de
 *    wens wordt onthouden, daardoor valt `actief` weg, en pas in de commit dáárna
 *    wordt er genavigeerd. Dat is wat deze functie uitspreekt.
 *
 * ⚠️ **`wachten` is geen foutgeval.** Het is de tussenstand van precies één
 *    render, en het is de enige stand waarin je níets mag doen. Wie hem
 *    gelijkstelt aan `gaan`, heeft de volgorde weer weg.
 */
export function vertrekstap(wachtStaatNog: boolean, wens: unknown): Vertrekstap {
  if (wens === null || wens === undefined) return 'niets';
  return wachtStaatNog ? 'wachten' : 'gaan';
}
