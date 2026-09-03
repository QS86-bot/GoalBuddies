import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');

/**
 * Datalaagfuncties die een knop hóren te hebben, met de reden erbij.
 *
 * ⚠️ **Een lijst met redenen en geen lijst met namen** — zelfde vorm als
 *    `BEWUST_ONGESCHREVEN` in `dode-keten-controle.mjs`. Wie hier iets aan
 *    toevoegt zonder op te schrijven wat de gebruiker eraan heeft, heeft een
 *    naam geparkeerd in plaats van een belofte vastgelegd.
 */
const MOET_EEN_SCHERM_HEBBEN: Readonly<Record<string, string>> = {
  wijzigDoel:
    'Zonder scherm is een doel na aanmaken niet meer te wijzigen — ook een ' +
    'typefout in de titel niet.',
  wijzigMijlpaal:
    'Aanmaken, verwijderen, herordenen en op gehaald zetten konden allemaal; ' +
    'alleen de tekst van een mijlpaal was permanent.',
  dagenUitKeuze:
    'De belofte van A53: een weekdoel dat in dagen telt. Zonder scherm dat deze ' +
    'functie aanroept blijft `ceiling_days` altijd NULL en gedraagt élk weekdoel ' +
    'zich zoals vóór A53 — precies de toestand die QS8-260 heeft opgelost. ⚠️ ' +
    'Deze regel staat er omdat de mutatie het aantoonde: het scherm de twee ' +
    'velden op `null` laten zetten maakte géén enkele test rood, want ' +
    '`kolomrechten:controle` kijkt naar kolomnamen in `maakWeekdoel()` en niet ' +
    'naar wat een scherm meegeeft.',
  fetchCommitmentSpoor:
    'Domeinregel 5 eist dat een commitment auditeerbaar is. Een spoor dat ' +
    'niemand kan opvragen is precies zo goed als geen spoor.',
};

/**
 * Een datalaagfunctie zonder scherm is dood hout dat geen enkele test ziet.
 *
 * ⚠️ **Dit is de variant van onwrikbare regel 18 zonder kapot onderdeel.** Elk
 *    schakeltje is af: de functie is geschreven, het schema klopt, de policy
 *    staat. Er is niets rood te maken, want er is niets stuk — de keten is
 *    alleen nergens verbonden. Vraag 5 van regel 18 vraagt daar met zoveel
 *    woorden naar: *kan een gebruiker hier daadwerkelijk bij, en langs welke
 *    knop?*
 *
 * ⚠️ **Drie keer eerder gebeurd, en drie keer pas achteraf gezien.** QS8-112
 *    (`maakWeekdoel()` had geen aanroeper terwijl twee issues op Done stonden),
 *    QS8-113 (`profiles.locale` had kolom, CHECK, grant, leeskant én catalogus,
 *    en geen schrijfpad), en QS8-106 (vier datalaagfuncties zonder scherm). De
 *    controleronde van 28-08 vond de vierde ronde: deze drie.
 *
 * ⚠️ **Waarom een lijst en geen algemene detector.** Een export die nergens
 *    buiten zijn module wordt gebruikt, is generiek te vinden — maar niet met een
 *    grep: schema's en constanten worden vaak rechtstreeks geïmporteerd in plaats
 *    van via de barrel, en een ruwe telling gaf tientallen valse meldingen. Dat
 *    vraagt een echte parser, en dat is eigen werk; het staat als rij in
 *    `docs/ENGINEER-REVIEW.md`. Wat je zónder parser wél kunt vastleggen is de
 *    belofte per functie, en dat is deze lijst.
 */
describe('een datalaagfunctie met een belofte heeft een scherm', () => {
  const schermen = schermbestanden(join(WORTEL, 'app'));

  it('vindt de schermen, anders toetst de rest niets', () => {
    // Ondergrens en geen exact getal: `app/` groeit, en dan hoort deze test niet
    // rood te worden om iets dat er niets mee te maken heeft.
    expect(schermen.length).toBeGreaterThan(10);
  });

  for (const [naam, reden] of Object.entries(MOET_EEN_SCHERM_HEBBEN)) {
    it(`${naam}() wordt vanuit een scherm aangeroepen`, () => {
      const gevonden = schermen.filter((s) => roeptAan(s.bron, naam));

      expect(
        gevonden.map((s) => s.pad),
        `${naam}() heeft geen enkel scherm. ${reden}`,
      ).not.toEqual([]);
    });
  }

  /**
   * ⚠️ **De ijking van de zeef zelf.** Zonder deze is niet te zien of
   *    `roeptAan()` überhaupt iets kán vinden — en een controle die nooit rood is
   *    geweest, is een aanname. Met de hand nagedaan: de aanroep in
   *    `app/doel/bewerk/[id].tsx` weghalen maakt de test over `wijzigDoel` rood.
   */
  describe('de zeef is geijkt', () => {
    it('herkent een echte aanroep', () => {
      expect(roeptAan('const uit = await wijzigDoel(doel.id, patch);', 'wijzigDoel')).toBe(true);
      expect(roeptAan('onPress={() => void wijzigMijlpaal(m.id, invoer)}', 'wijzigMijlpaal')).toBe(true);
    });

    it('telt een import zonder aanroep niet mee', () => {
      // ⚠️ Dit is de vorm die een naïeve tekstzoektocht doorlaat: het scherm
      //    importeert de functie en gebruikt hem nergens. Dan is er nog steeds
      //    geen knop.
      expect(roeptAan("import { wijzigDoel } from '@/modules/goals';", 'wijzigDoel')).toBe(false);
    });

    it('trapt niet in een langere naam die de kortere bevat', () => {
      expect(roeptAan('await wijzigDoelStatus(id)', 'wijzigDoel')).toBe(false);
    });

    it('en laat commentaar met rust', () => {
      expect(roeptAan('/** De knop bij wijzigDoel() ontbrak tot 28-08. */', 'wijzigDoel')).toBe(false);
      expect(roeptAan('// void wijzigDoel(id, patch);', 'wijzigDoel')).toBe(false);
    });

    /**
     * ⚠️ **Dit geval liet de eerste versie door, en het is de vorm die dit
     *    project overal gebruikt.** Een JSX-commentaarblok begint niet met een
     *    sterretje op elke regel; bij het ijken bleven daardoor twee van de drie
     *    gevallen groen terwijl de aanroep eruit was.
     */
    it('telt een JSX-commentaarblok niet mee, ook niet met een waarschuwingsteken', () => {
      const jsx = [
        '{/*',
        '  \u26a0\ufe0f **De knop bij wijzigMijlpaal(), die tot 28-08 ontbrak.**',
        '*/}',
      ].join('\n');

      expect(roeptAan(jsx, 'wijzigMijlpaal')).toBe(false);
    });
  });
});

/** Alle schermbestanden onder `app/`, met hun bron. */
function schermbestanden(
  dir: string,
  uit: { pad: string; bron: string }[] = [],
): { pad: string; bron: string }[] {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) schermbestanden(pad, uit);
    else if (/\.tsx?$/.test(naam)) uit.push({ pad, bron: readFileSync(pad, 'utf8') });
  }
  return uit;
}

/**
 * Of `bron` de functie daadwerkelijk aanroept — niet alleen noemt.
 *
 * ⚠️ **Blokcommentaar gaat er als blok af en niet per regel, en dat is een
 *    reparatie.** De eerste versie filterde regels die met `//`, `*` of `/*`
 *    beginnen. Dat dekt JSDoc, maar niet de JSX-vorm die dit project overal
 *    gebruikt:
 *
 *      {** De knop bij `wijzigMijlpaal()`, die tot 28-08 ontbrak. **}
 *
 *    Zo'n regel begint met een waarschuwingsteken en niet met een sterretje, dus
 *    hij bleef staan — en dan telde de tóelichting op de knop als de knop. Bij
 *    het ijken bleven twee van de drie gevallen groen terwijl de aanroep eruit
 *    was. **Precies de fout die deze test moet vangen, in de test zelf.**
 */
export function roeptAan(bron: string, naam: string): boolean {
  const zonderCommentaar = bron
    // Eerst blokken: /* … */ dekt zowel JSDoc als de JSX-vorm {/* … */}.
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((regel) => !regel.trimStart().startsWith('//'))
    .join('\n');

  // ⚠️ De haakjes horen erbij: een `import { wijzigDoel }` is geen knop. En de
  //    negatieve vooruitblik houdt `wijzigDoelStatus` buiten de deur.
  return new RegExp(`(?<![a-zA-Z0-9_])${naam}\\s*\\(`).test(zonderCommentaar);
}
