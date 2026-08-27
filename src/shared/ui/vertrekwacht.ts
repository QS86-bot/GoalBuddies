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
