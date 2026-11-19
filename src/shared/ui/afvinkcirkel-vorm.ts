import type { Sleutel } from '../i18n';

/**
 * De vorm van de afvinkcirkel — QS8-727. Zuivere rekenlaag, zonder React Native,
 * zodat de belofte te toetsen is.
 *
 * ⚠️ **Vloer en plafond verschillen in vorm en niet in kleur** (voor
 *    kleurenblindheid, en omdat een kleur nooit het enige signaal mag zijn):
 *    leeg is een open ring, vloer is de onderste helft gevuld,
 *    plafond is helemaal gevuld met een vinkje én een tweede ring eromheen.
 *    Een vloer telt volledig (domeinregel 8): hij is de helft van de cirkel en
 *    geen "bijna", en zijn tekst zegt dat ook.
 *
 * ⚠️ **Twee assen, elk met een eigen teken:** de vulling is de week (niveau), het
 *    vinkje is vandaag. De tik gaat over vandaag, dus het vinkje volgt
 *    `vandaagAfgevinkt` op élk niveau; anders ziet niemand of de volgende tik
 *    afvinkt of ongedaan maakt. Bij de halve vulling staat het vinkje in de lege
 *    bovenhelft, waar het leesbaar is.
 *
 * ⚠️ **Er zit geen enkele toestand in voor "gemist".** Leeg en uitgeschakeld zijn
 *    neutraal (domeinregel 7): geen rood, geen kruis, geen waarschuwing.
 *
 * ⚠️ **Er komt geen getal in en geen puntenwaarde** (domeinregel 10): de cirkel
 *    kent alleen een niveau, en een niveau gaat nooit omlaag door tijd.
 */

/** Het kleinste aanraakdoel dat op een telefoon betrouwbaar te raken is. */
export const AANRAAK_MIN = 44;
/** De getekende cirkel; groter dan het minimum, want dit is de hoofdhandeling. */
export const CIRKEL_GROOTTE = 52;

export type Niveau = 'floor' | 'ceiling';
export type Toestand = 'leeg' | 'vloer' | 'plafond' | 'uitgeschakeld';
export type Vulling = 'geen' | 'half' | 'vol';

export interface CirkelVorm {
  readonly toestand: Toestand;
  readonly vulling: Vulling;
  /** Een tweede ring om de cirkel heen: alleen bij plafond. */
  readonly buitenring: boolean;
  /** Een onderbroken rand: alleen bij uitgeschakeld. */
  readonly streepjes: boolean;
  readonly vinkje: boolean;
  readonly grootte: number;
  /** Zijde van het aanraakdoel: nooit kleiner dan `AANRAAK_MIN`. */
  readonly aanraak: number;
}

export interface CirkelInvoer {
  /** Het niveau dat deze week al gehaald is, of `null`. */
  readonly niveau: Niveau | null;
  readonly vandaagAfgevinkt: boolean;
  readonly uitgeschakeld?: boolean;
}

export function afvinkcirkel({ niveau, vandaagAfgevinkt, uitgeschakeld = false }: CirkelInvoer): CirkelVorm {
  const basis = { grootte: CIRKEL_GROOTTE, aanraak: Math.max(CIRKEL_GROOTTE, AANRAAK_MIN) };

  if (uitgeschakeld) {
    return { ...basis, toestand: 'uitgeschakeld', vulling: 'geen', buitenring: false, streepjes: true, vinkje: false };
  }
  if (niveau === 'ceiling') {
    return { ...basis, toestand: 'plafond', vulling: 'vol', buitenring: true, streepjes: false, vinkje: vandaagAfgevinkt };
  }
  if (niveau === 'floor') {
    return { ...basis, toestand: 'vloer', vulling: 'half', buitenring: false, streepjes: false, vinkje: vandaagAfgevinkt };
  }
  // Leeg: de open ring draagt een vinkje zodra vandaag is afgevinkt. Geen vierde
  // "bijna"-toestand: de vulling is de week, het vinkje is vandaag.
  return { ...basis, toestand: 'leeg', vulling: 'geen', buitenring: false, streepjes: false, vinkje: vandaagAfgevinkt };
}

/** Wat de cirkel in tekst zegt; de catalogussleutel per toestand. */
export const CIRKEL_STAAT_SLEUTEL: Readonly<Record<Toestand, Sleutel>> = {
  leeg: 'afvinkcirkel.staat_leeg',
  vloer: 'afvinkcirkel.staat_vloer',
  plafond: 'afvinkcirkel.staat_plafond',
  uitgeschakeld: 'afvinkcirkel.staat_uitgeschakeld',
};

/** De vorm zonder kleur, als één sleutel: twee toestanden mogen die niet delen. */
export function vormSleutel(v: CirkelVorm): string {
  return [v.vulling, v.buitenring ? 'ring' : '-', v.streepjes ? 'streep' : '-', v.vinkje ? 'vink' : '-'].join('|');
}
