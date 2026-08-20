/**
 * Het feestelijke moment — QS8-76.
 *
 * Puur, zonder renderer, zelfde reden als `metrics.ts` en `acties.ts`: wát er
 * gevierd wordt en hoe hard, is een productbeslissing die je wilt kunnen testen
 * zonder een scherm te bouwen.
 *
 * ⚠️ **Gedoseerd.** De ontwerprichting van EPIC 10 zegt dat de app standaard
 *    kalm is en dat de vreugde op de verdiende momenten zit. Een app die bij
 *    elke tik juicht, juicht bij niets — en dan valt het moment dat het écht
 *    telt niet meer op. Vandaar drie niveaus en niet één.
 *
 * ⚠️ Er zit met opzet **geen niveau op "vloer gehaald"** naast "plafond
 *    gehaald". Domeinregel 8 zegt dat de vloer halen betekent dat de week telt;
 *    een zuiniger feestje bij de vloer zou dat in de UI weer terugnemen en de
 *    gebruiker leren dat de vloer tweederangs is. Het verschil zit in de punten,
 *    niet in de toon.
 */

/** Waar we een feestje voor geven, oplopend in intensiteit. */
export type VieringSoort = 'weekdoel' | 'mijlpaal' | 'doel';

export interface Viering {
  readonly soort: VieringSoort;
  /** 1 = ingetogen, 3 = het grootste moment dat de app kent. */
  readonly niveau: 1 | 2 | 3;
  readonly titel: string;
  readonly tekst: string;
  /** Hoe lang het in beeld blijft, in ms, vóór de reduced-motion-correctie. */
  readonly duurMs: number;
}

const VIERINGEN: Record<VieringSoort, Viering> = {
  /**
   * Het vaakst voorkomende moment, dus het zuinigst. Iemand die vijf doelen
   * bijhoudt, ziet dit vijf keer per week.
   */
  weekdoel: {
    soort: 'weekdoel',
    niveau: 1,
    titel: 'Je week is bevestigd',
    tekst: 'Een buddy heeft je week goedgekeurd. Die telt.',
    duurMs: 2200,
  },
  mijlpaal: {
    soort: 'mijlpaal',
    niveau: 2,
    titel: 'Mijlpaal gehaald',
    tekst: 'Een stuk van je doel staat. Dit is er een om even bij stil te staan.',
    duurMs: 3200,
  },
  /**
   * ⚠️ Het grootste moment dat de app kent, en voor de meeste gebruikers een
   *    handvol keer per jaar. Hier mag het.
   */
  doel: {
    soort: 'doel',
    niveau: 3,
    titel: 'Je doel is af',
    tekst: 'Je hebt dit van begin tot eind volgehouden. Dat doen de meeste mensen niet.',
    duurMs: 4500,
  },
};

export function viering(soort: VieringSoort): Viering {
  return VIERINGEN[soort];
}

/**
 * Hoeveel deeltjes de animatie tekent.
 *
 * ⚠️ Nul bij `prefers-reduced-motion`, en dat is geen afzwakking maar de hele
 *    voorziening: voor iemand met vestibulaire klachten is rondvliegende
 *    confetti misselijkmakend. De tekst blijft wél staan — het moment gaat niet
 *    verloren, alleen de beweging.
 */
export function aantalDeeltjes(niveau: 1 | 2 | 3, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return niveau * 12;
}

/**
 * Blijft het feestje vanzelf weg?
 *
 * Drie redenen, en ze zijn niet inwisselbaar:
 * - de gebruiker heeft vieringen uitgezet (acceptatiecriterium 3);
 * - dit exemplaar is al een keer getoond;
 * - er is niets te vieren.
 */
export function magVieren(input: {
  readonly aan: boolean;
  readonly alGezien: boolean;
}): boolean {
  return input.aan && !input.alGezien;
}
