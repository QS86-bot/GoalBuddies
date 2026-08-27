/**
 * QS8-41 — "elk voorgesteld weekdoel komt mét vloer en plafond".
 *
 * ⚠️ **De belofte is niet "de zeef filtert goed" en niet "het schema eist drie
 *    velden".** Dat zijn eigenschappen van ónderdelen, en die staan al onder
 *    test in `src/modules/ai/uitvoer.test.ts`. De belofte van het gehéél is:
 *    *wat de Doelcoach voorstelt, komt met vloer en plafond in de database
 *    terecht.* Die keten loopt van het JSON-schema in de Edge Function, via de
 *    zeef, naar `weekdoelSchema` en `maakWeekdoel()` — en hij kan breken terwijl
 *    elk stuk klopt.
 *
 * ⚠️ **`supabase/functions/**` valt buiten typecheck, lint én vitest.** Er
 *    draait geen Deno-runner, dus de Edge-kant is niet úitvoerbaar te testen.
 *    Wel *leesbaar*: het bestand is tekst, en de enige eigenschap die er hier
 *    toe doet — welke velden het model verplicht moet leveren — staat er in één
 *    `required`-lijst. Dat is het maximum dat hier vandaag te bewaken valt, en
 *    dat is de eerlijke stand.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { weekdoelenUit } from '../../src/modules/ai/uitvoer';
import { weekdoelSchema } from '../../src/modules/goals/weekly-schemas';

const WORTEL = join(__dirname, '..', '..');

const EEN_UUID = '00000000-0000-4000-8000-000000000000';

describe('de naad tussen de Doelcoach en een weekdoel', () => {
  /**
   * ⚠️ **Dit is de eigenlijke naadtest.** Hij voert de úitkomst van de zeef
   *    rechtstreeks aan het schema dat `maakWeekdoel()` gebruikt. Verandert
   *    iemand de zeef, of verandert `weekdoelSchema` zijn grenzen, dan wordt hij
   *    rood — zonder dat er iets aan deze test hoeft te veranderen. Een test die
   *    de zeef en het schema los toetst, zou dat níet merken.
   */
  it('alles wat de zeef doorlaat, valideert als weekdoel met vloer en plafond', () => {
    const modeluitvoer = {
      weekly_goals: [
        // Wat er door moet.
        {
          title: 'Drie leveranciers bellen',
          floor_text: 'Eén leverancier bellen',
          ceiling_text: 'Drie bellen en de offertes vergelijken',
        },
        {
          title: 'Hoofdstuk 2 uitwerken 📗',
          floor_text: 'De opzet van hoofdstuk 2 op papier',
          ceiling_text: 'Hoofdstuk 2 af, inclusief bronnen',
        },
        // Wat er uit moet — elk een eigen vorm van half werk.
        { title: 'Zonder vloer', ceiling_text: 'Drie stuks' },
        { title: 'Zonder plafond', floor_text: 'Eén stuk' },
        { title: 'Lege vloer', floor_text: '   ', ceiling_text: 'Drie stuks' },
        { title: 'Zelfde', floor_text: 'Drie stuks', ceiling_text: 'drie stuks' },
        { title: 'ab', floor_text: 'Eén', ceiling_text: 'Drie' },
        { title: 'x'.repeat(250), floor_text: 'Eén', ceiling_text: 'Drie' },
      ],
    };

    const voorstellen = weekdoelenUit(modeluitvoer);

    // ⚠️ Eerst bewijzen dat er íets doorkomt. Zonder deze regel is de lus
    //    hieronder gratis groen op een lege lijst — dezelfde val als een
    //    controle die nul meldt omdat hij nergens keek.
    expect(voorstellen).toHaveLength(2);

    for (const voorstel of voorstellen) {
      const uitkomst = weekdoelSchema.safeParse({
        goal_id: EEN_UUID,
        milestone_id: EEN_UUID,
        title: voorstel.title,
        floor_text: voorstel.floor_text,
        ceiling_text: voorstel.ceiling_text,
      });

      expect(uitkomst.success, `${voorstel.title}: ${JSON.stringify(uitkomst.error?.issues)}`).toBe(
        true,
      );

      // En de belofte zelf: geen van beide is leeg, en ze zijn niet hetzelfde.
      expect(voorstel.floor_text.trim()).not.toBe('');
      expect(voorstel.ceiling_text.trim()).not.toBe('');
      expect(voorstel.floor_text.toLowerCase()).not.toBe(voorstel.ceiling_text.toLowerCase());
    }
  });

  /**
   * ⚠️ **De Edge-kant, gelezen als tekst.** Zou `floor_text` uit `required`
   *    vallen, dan levert het model rijen zonder vloer, gooit de zeef ze weg en
   *    krijgt de gebruiker "de coach kwam niet met bruikbare stappen" — een
   *    stille kwaliteitsdaling die geen enkele andere test ziet, want elk
   *    onderdeel blijft correct werken.
   *
   * ⚠️ **Met de hand rood gemaakt vóór hij groen verklaard werd** (CLAUDE.md,
   *    regel 18, vraag 3): `floor_text` uit `required` gehaald, test rood,
   *    teruggezet. Een controle die nog nooit rood is geweest, is een aanname.
   */
  it('het JSON-schema van de Edge Function eist vloer en plafond van het model', () => {
    const bron = readFileSync(
      join(WORTEL, 'supabase', 'functions', 'doelcoach', 'index.ts'),
      'utf8',
    );

    const blok = /const WEEKDOEL_SCHEMA = \{[\s\S]*?\n\} as const;/.exec(bron);
    expect(blok, 'WEEKDOEL_SCHEMA niet gevonden in doelcoach/index.ts').not.toBeNull();

    const required = /required: \[([^\]]*)\],\s*\n\s*additionalProperties: false,\s*\n\s*\},/.exec(
      blok?.[0] ?? '',
    );
    expect(required, 'de required-lijst van het item niet gevonden').not.toBeNull();

    const velden = (required?.[1] ?? '')
      .split(',')
      .map((deel) => deel.trim().replace(/^'|'$/g, ''))
      .filter((deel) => deel !== '');

    expect(velden).toContain('title');
    expect(velden).toContain('floor_text');
    expect(velden).toContain('ceiling_text');
  });

  /**
   * ⚠️ **Regel 18, vraag 5: is de keten ergens onderbroken terwijl elk schakeltje
   *    af is?** Dit is de variant zonder kapot onderdeel, en dus de variant die
   *    geen enkele gewone test vindt. Bij QS8-113 lag er een kolom met een grant
   *    en een policy die niemand ooit kon vullen; bij QS8-112 stond
   *    `maakWeekdoel()` klaar terwijl geen scherm hem aanriep en twee issues op
   *    Done stonden.
   *
   *    Deze test grijpt naar de belofte ("er loopt een gebruikersroute heen") en
   *    niet naar een regelnummer of een bestandsnaam, dus hij verhuist mee.
   */
  it('er loopt een route uit de app naar het genereren van weekstappen', () => {
    const schermen = bestandenOnder(join(WORTEL, 'app'));

    const roeptAan = schermen.filter((pad) =>
      readFileSync(pad, 'utf8').includes('vraagWeekdoelen('),
    );
    expect(roeptAan.length, 'geen enkel scherm roept vraagWeekdoelen() aan').toBeGreaterThan(0);

    // En een knop die naar dat scherm navigeert — anders is het scherm zelf het
    // dode hout.
    const navigeert = schermen.filter((pad) =>
      readFileSync(pad, 'utf8').includes('/doel/weekdoelen/'),
    );
    expect(
      navigeert.length,
      'geen enkel scherm navigeert naar /doel/weekdoelen/',
    ).toBeGreaterThan(0);
  });
});

function bestandenOnder(map: string): readonly string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');

  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return bestandenOnder(pad);
    return pad.endsWith('.tsx') || pad.endsWith('.ts') ? [pad] : [];
  });
}
