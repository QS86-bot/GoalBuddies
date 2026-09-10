import { describe, expect, it } from 'vitest';

import {
  AANVAARD,
  registersIn,
  verliezen,
} from '../../scripts/registerdrift-controle.mjs';

/**
 * De zeef van `registerdrift:controle`, elke vorm los aangeboden — QS8-358.
 *
 * ⚠️ **De helft die het meeste doet is de tweede helft**: de vormen die hij met
 *    rust moet laten. Een controle die elke verwijdering meldt, ook de bedoelde,
 *    leer je uitzetten — en dan bewaakt hij de volgende óók niet meer.
 *
 * IJKING — met de hand, 08-09-2026, op de échte migratiemap:
 *
 *   D  de drie sleutels van 0199 uit het lichaam van 0200 halen (het geval dat
 *      op 08-09 gebeurde) → 3 rood, met migratie, functie en sleutel
 *   E  `app.hervat_lidmaatschap` uit `AANVAARD` halen → 1 rood. De aanvaarde
 *      verwijdering is dus een uitzondering en geen blinde vlek
 *   F  een sleutel wégnemen sámen met zijn `set_config`-regel → deze controle
 *      rood, en 📏 de RLS-suite blijft groen. Dat is de tak die de derde tak van
 *      `sleutelzetters()` níét ziet: die meldt een zetter zónder registratie, en
 *      hier is er geen zetter meer om te melden
 */

const REGISTER = (rijen: string) =>
  `create or replace function public.sleutelzetters()\nreturns table(naam text)\nas $function$\n  with sleutel(instelling, toegestaan) as (\n    values\n${rijen}\n  )\n  select 1;\n$function$;`;

describe('registersIn — de vormen die hij moet vinden', () => {
  it('leest de sleutels van een register', () => {
    const bron = REGISTER("      ('app.een', array['f']),\n      ('app.twee', array['g'])");
    expect(registersIn(bron)).toEqual([
      { functie: 'sleutelzetters', sleutels: ['app.een', 'app.twee'] },
    ]);
  });

  it('vindt meer dan één functie in hetzelfde bestand', () => {
    const bron = `${REGISTER("      ('app.een', array['f'])")}\n${REGISTER(
      "      ('app.twee', array['g'])",
    ).replace('sleutelzetters', 'andere_bewaking')}`;
    expect(registersIn(bron).map((d) => d.functie)).toEqual(['sleutelzetters', 'andere_bewaking']);
  });

  /**
   * ⚠️ Dezelfde reden als in `onveranderlijkheid_bewaking()` sinds 0221: een rij
   *    die alleen in een uitleg staat, staat niet in het register. Hij hóórt dus
   *    als verlies te tellen.
   */
  it('telt een uitgecommentarieerde rij niet mee', () => {
    const bron = REGISTER("      -- ('app.een', array['f']),\n      ('app.twee', array['g'])");
    expect(registersIn(bron)[0]?.sleutels).toEqual(['app.twee']);
  });

  it('laat een functie zonder register weg', () => {
    const bron = 'create or replace function public.iets()\nas $function$\n  select 1;\n$function$;';
    expect(registersIn(bron)).toEqual([]);
  });
});

describe('verliezen — wat er rood van wordt', () => {
  const eerder = { migratie: '0199_a.sql', functie: 'sleutelzetters', sleutels: ['a', 'b', 'c'] };

  it('meldt een sleutel die een latere definitie laat vallen', () => {
    const later = { migratie: '0200_b.sql', functie: 'sleutelzetters', sleutels: ['a'] };
    expect(verliezen([eerder, later], [])).toEqual([
      { migratie: '0200_b.sql', functie: 'sleutelzetters', sleutel: 'b' },
      { migratie: '0200_b.sql', functie: 'sleutelzetters', sleutel: 'c' },
    ]);
  });

  it('houdt de volgorde van de migraties aan en niet die van de map', () => {
    const later = { migratie: '0200_b.sql', functie: 'sleutelzetters', sleutels: ['a', 'b', 'c', 'd'] };
    const nog_later = { migratie: '0201_c.sql', functie: 'sleutelzetters', sleutels: ['a', 'b', 'c'] };
    expect(verliezen([eerder, later, nog_later], [])).toEqual([
      { migratie: '0201_c.sql', functie: 'sleutelzetters', sleutel: 'd' },
    ]);
  });
});

describe('verliezen — de vormen die hij met rust moet laten', () => {
  it('laat een uitbreiding met rust', () => {
    const a = { migratie: '0199_a.sql', functie: 'f', sleutels: ['a'] };
    const b = { migratie: '0200_b.sql', functie: 'f', sleutels: ['a', 'b'] };
    expect(verliezen([a, b], [])).toEqual([]);
  });

  it('laat twee verschillende functies met rust', () => {
    const a = { migratie: '0199_a.sql', functie: 'f', sleutels: ['a'] };
    const b = { migratie: '0200_b.sql', functie: 'g', sleutels: ['b'] };
    expect(verliezen([a, b], [])).toEqual([]);
  });

  /**
   * ⚠️ **De uitzondering is per verwijdering en niet per functie.** Zou hij op
   *    functieniveau staan, dan lift de vólgende verwijdering in diezelfde
   *    functie er stilzwijgend op mee — precies de fout die dit issue beschrijft.
   */
  it('laat een aanvaarde verwijdering met rust, en alleen die ene', () => {
    const a = { migratie: '0199_a.sql', functie: 'f', sleutels: ['a', 'b'] };
    const b = { migratie: '0200_b.sql', functie: 'f', sleutels: [] };
    const aanvaard = [{ migratie: '0200_b.sql', functie: 'f', sleutel: 'a', reden: 'bedoeld' }];

    expect(verliezen([a, b], aanvaard)).toEqual([
      { migratie: '0200_b.sql', functie: 'f', sleutel: 'b' },
    ]);
  });

  it('laat dezelfde sleutel in een ándere migratie niet meelifen op de uitzondering', () => {
    const a = { migratie: '0199_a.sql', functie: 'f', sleutels: ['a'] };
    const b = { migratie: '0200_b.sql', functie: 'f', sleutels: [] };
    const aanvaard = [{ migratie: '0300_c.sql', functie: 'f', sleutel: 'a', reden: 'elders' }];

    expect(verliezen([a, b], aanvaard)).toHaveLength(1);
  });
});

describe('AANVAARD', () => {
  it('draagt bij elke uitzondering een reden', () => {
    for (const rij of AANVAARD) {
      expect(rij.reden.length, `${rij.functie}/${rij.sleutel} zonder reden`).toBeGreaterThan(20);
    }
  });
});
