import { describe, expect, it } from 'vitest';

import { TIJDZONE_ALIASSEN } from '../../src/shared/ui/tijdzone-aliassen';
import { zoekTijdzones } from '../../src/shared/ui/tijdzone';
import { isGeldigeTijdzone, normaliseerZone, tijdzones } from '../../src/shared/time';

/**
 * De belofte: **wie zijn stad of land intypt, vindt zijn tijdzone** — QS8-212.
 *
 * ⚠️ **Waarom dit een belofte-test is en geen tabeltest.** De tabel zelf is
 *    data; wat bewaakt moet worden is dat de vier gemeten gevallen uit het issue
 *    er daadwerkelijk uit komen, en dat er geen alias in staat die nergens heen
 *    wijst. Dat tweede is de stille fout: een typefout in een waarde laat de
 *    zoekterm gewoon matchen, de knop verschijnt, en de gebruiker slaat een zone
 *    op die niet bestaat.
 *
 * ⚠️ **Tweezijdig.** Naast "wordt gevonden" staat "wordt niet uitgevonden": een
 *    term die nergens op slaat hoort nul treffers te geven, want een lijst die
 *    altijd iets teruggeeft is net zo onbruikbaar als een lijst die nooit iets
 *    geeft.
 */

/** De vier termen die het issue mat, met wat eruit hoort te komen. */
const GEMETEN = [
  ['Rotterdam', 'Europe/Amsterdam'],
  ['Manchester', 'Europe/London'],
  ['Osaka', 'Asia/Tokyo'],
  ['Netherlands', 'Europe/Amsterdam'],
] as const;

describe('de vier gevallen die QS8-212 mat', () => {
  for (const [term, zone] of GEMETEN) {
    it(`"${term}" geeft ${zone}`, () => {
      expect(zoekTijdzones(term)).toContain(zone);
    });
  }

  it('en die gaven vóór deze reparatie alle vier nul treffers', () => {
    // De oude staat, nagebootst: zoeken zonder aliassen over dezelfde lijst.
    const zonderAliassen = (term: string) =>
      tijdzones().filter((zone) =>
        zone.toLowerCase().replaceAll('_', ' ').replaceAll('/', ' ').includes(term.toLowerCase()),
      );

    for (const [term] of GEMETEN) expect(zonderAliassen(term)).toEqual([]);
  });
});

describe('zoeken blijft doen wat het deed', () => {
  it('vindt een zone nog steeds op zijn eigen plaatsnaam', () => {
    expect(zoekTijdzones('amsterdam')).toContain('Europe/Amsterdam');
    expect(zoekTijdzones('tokyo')).toContain('Asia/Tokyo');
  });

  it('verzint niets bij een term die nergens op slaat', () => {
    expect(zoekTijdzones('qqqzzz')).toEqual([]);
    expect(zoekTijdzones('   ')).toEqual([]);
  });

  it('zet een echte plaatsnaam bóven een alias', () => {
    // ⚠️ Dit is de eigenschap en niet één uitkomst. Bij "a" matcht
    //    `Africa/Abidjan` op zijn éigen plaatsnaam en `Europe/Brussels` alleen
    //    via de alias "antwerpen". De eerste hoort voor te gaan — anders duwt de
    //    tabel de lijst opzij in plaats van hem aan te vullen, en dat was de
    //    eerste versie van deze wijziging.
    const gevonden = zoekTijdzones('a');
    const opEigenNaam = gevonden.indexOf('Africa/Abidjan');
    const viaAlias = gevonden.indexOf('Europe/Brussels');

    expect(opEigenNaam).toBeGreaterThanOrEqual(0);
    if (viaAlias >= 0) expect(opEigenNaam).toBeLessThan(viaAlias);
  });
});

describe('de tabel zelf verrot niet', () => {
  const paren = Object.entries(TIJDZONE_ALIASSEN);

  it('wijst elke alias naar een zone die dit platform kent', () => {
    const kapot = paren.filter(([, zone]) => !isGeldigeTijdzone(zone));
    expect(kapot).toEqual([]);
  });

  it('noemt geen twee schrijfwijzen van dezelfde zone', () => {
    // ⚠️ **Dit is de dubbele-knopvraag, en hij staat met opzet niet op
    //    `normaliseerZone(zone) === zone`.** Die vergelijking is
    //    platformafhankelijk: op de Node van deze bouwomgeving gaat
    //    `Asia/Kolkata` naar `Asia/Calcutta` en `Asia/Ho_Chi_Minh` naar
    //    `Asia/Saigon` — de ICU hier canoniseert koppelzones de andere kant op
    //    dan een moderne browser. Een test op die vorm zou dus een eigenschap
    //    van déze machine vastleggen. Zie de rij van 04-09 in
    //    `docs/ENGINEER-REVIEW.md`.
    //
    //    Wat wél overal geldt: twee sleutels mogen niet naar dezelfde zone in
    //    twee schrijfwijzen wijzen, want dan staan er na het normaliseren twee
    //    identieke knoppen onder het veld.
    const perZone = new Map<string, string[]>();
    for (const [, zone] of paren) {
      const na = normaliseerZone(zone);
      const bestaand = perZone.get(na) ?? [];
      if (!bestaand.includes(zone)) perZone.set(na, [...bestaand, zone]);
    }

    const dubbel = [...perZone.entries()].filter(([, vormen]) => vormen.length > 1);
    expect(dubbel).toEqual([]);
  });

  it('heeft sleutels in de vorm waarin er gezocht wordt', () => {
    // Kleine letters, geen diakrieten, geen liggende streepjes: `zoekvorm()`
    // normaliseert de invoer zo, dus een sleutel die dat niet is, is nooit te
    // vinden. Stil, want de tabel ziet er dan gewoon goed uit.
    const scheef = paren
      .map(([term]) => term)
      .filter((term) => term !== term.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''))
      .concat(paren.map(([term]) => term).filter((term) => term.includes('_')));

    expect(scheef).toEqual([]);
  });

  it('voegt met elke alias iets toe dat de zonelijst zelf niet geeft', () => {
    // Een alias die de lijst al kan vinden, is onderhoud zonder opbrengst. Dit
    // is de rem op groei: wie er een toevoegt die niets doet, wordt rood.
    const overbodig = paren.filter(([term, zone]) => {
      const plaats = zone.slice(zone.lastIndexOf('/') + 1).toLowerCase().replaceAll('_', ' ');
      return plaats === term;
    });

    expect(overbodig).toEqual([]);
  });
});
