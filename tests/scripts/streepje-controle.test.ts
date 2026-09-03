import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `tekst-controle.test.ts`.
import { treffersIn } from '../../scripts/streepje-controle.mjs';

/**
 * QS8-218 — de controle die gedachtestreepjes in app-tekst moet vinden.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Vandaar dat
 *    `treffersIn()` geëxporteerd is en hier élke vorm los krijgt aangeboden: de
 *    vormen die hij moet vinden én de vormen die hij met rust moet laten. Die
 *    tweede helft is even belangrijk — een controle die alles meldt, leert je
 *    hem te negeren.
 *
 * ⚠️ **En dat is hier geen theorie.** De eerste versie van deze controle
 *    hergebruikte de filter van `emoji-controle`: overslaan wat begint met `*`,
 *    `//` of `/*`. Gemeten op 03-09-2026 gaf dat 104 meldingen, waarvan er 101
 *    commentaar waren — doorlopende regels van een ⚠️-kop en van een
 *    `{@literal /}* … *​/}` in JSX, die met een gewoon woord beginnen. Voor emoji
 *    is die filter genoeg omdat emoji niet in commentaar staan; voor een
 *    streepje, dat in dit project juist huisstijl is in commentaar, is hij dat
 *    niet.
 */

function gevonden(...regels: readonly string[]): readonly number[] {
  return (treffersIn([...regels]) as { regel: number; tekst: string }[]).map((t) => t.regel);
}

describe('wat de controle moet vinden', () => {
  it('een gedachtestreepje in een catalogusregel', () => {
    expect(gevonden("  'ketting.voltallig': 'Voltallig — de ketting is rond',")).toEqual([1]);
  });

  it('een streepje in een vervolgregel van een samengestelde tekst', () => {
    expect(
      gevonden("    'krijg je wél — een pas beschermt je reeks, niet je punten. ' +"),
    ).toEqual([1]);
  });

  it('een streepje in JSX-tekst', () => {
    expect(gevonden('      <Body>Voltallig — de ketting is rond</Body>')).toEqual([1]);
  });

  it('een streepje in een sjabloonstring', () => {
    // Het geval uit `app/doel/plan.tsx`: een streepje als scheidingsteken.
    expect(gevonden('        {m.target_date === null ? `` : ` — ${m.target_date}`}')).toEqual([1]);
  });

  it('een streepje als plaatshouder voor "nog niets"', () => {
    // Het geval uit `app/(tabs)/profiel.tsx`. Voor een schermlezer is dit een
    // streepje en verder niets.
    expect(gevonden("            ? '—'")).toEqual([1]);
  });

  it('tekst na het einde van een blokcommentaar op dezelfde regel', () => {
    // ⚠️ Hier glipt een naïeve regelfilter langs: de regel begint met `*`, maar
    //    wat erná staat is gewone code.
    expect(gevonden("   */ const label = 'Voltallig — rond';")).toEqual([1]);
  });

  it('geeft het regelnummer van élke treffer, niet alleen de eerste', () => {
    expect(
      gevonden("  'a': 'een — twee',", "  'b': 'geen streepje',", "  'c': 'drie — vier',"),
    ).toEqual([1, 3]);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een gewoon koppelteken', () => {
    expect(gevonden("  'profiel.weekstart': 'Je week-startdag',")).toEqual([]);
  });

  it('een regelcommentaar', () => {
    expect(gevonden('  // De week-startdag — klok 1 van domeinregel 1.')).toEqual([]);
  });

  it('een kopregel van een blokcommentaar', () => {
    expect(gevonden(' * ⚠️ De week-startdag — klok 1 van domeinregel 1.')).toEqual([]);
  });

  it('een dóórlopende commentaarregel die met een woord begint', () => {
    // ⚠️ **Dit is het geval waarop de eerste versie omviel.** In de ⚠️-blokken
    //    van dit project loopt een zin over drie regels door, en alleen de eerste
    //    begint met een `*`.
    expect(
      gevonden(
        '/**',
        ' * De week-startdag.',
        '   Klok 1 van domeinregel 1 — en geen instelling achteraf.',
        ' */',
      ),
    ).toEqual([]);
  });

  it('een JSX-commentaar over meerdere regels', () => {
    expect(
      gevonden(
        '      {/*',
        '        Het plan is een voorstel van de coach, geen dienstregeling —',
        '        de gebruiker mag ervan afwijken.',
        '      */}',
      ),
    ).toEqual([]);
  });

  it('een blokcommentaar dat op één regel begint en eindigt', () => {
    expect(gevonden("  const x = 1; /* een — twee */ const y = 2;")).toEqual([]);
  });

  it('een regelcommentaar dat een schijnbaar blok opent', () => {
    // ⚠️ Zonder de volgordecontrole zou de controle hierna denken dat hij in een
    //    blokcommentaar zit, en de rest van het bestand stilzwijgend overslaan.
    //    Dat is de gevaarlijkste vorm: hij meldt niets en lijkt groen.
    expect(
      gevonden('  // een zin /* met een schijnbaar blok', "  'a': 'een — twee',"),
    ).toEqual([2]);
  });

  it('een leeg bestand', () => {
    expect(gevonden()).toEqual([]);
  });

  it('een en-streepje en een minteken', () => {
    // Alleen de em-dash telt. Een en-dash in een reeks en een minteken in een
    // puntenmodel zijn geen AI-vingerafdruk.
    expect(gevonden("  'punt': 'week 3–5 telt mee, missen is −1',")).toEqual([]);
  });
});
