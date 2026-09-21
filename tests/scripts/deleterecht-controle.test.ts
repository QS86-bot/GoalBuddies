import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  clientWist,
  ontleed,
  verlopenRegels,
} from '../../scripts/deleterecht-controle.mjs';

/**
 * De ijking van `deleterecht-controle` — reviewrij 08-09-2026.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Daarom krijgt
 *    elke helft hier zijn vormen los aangeboden: de vormen die hij moet vínden
 *    én de vormen die hij met rust moet laten. Die tweede helft weegt even zwaar
 *    — een controle die onterecht meldt, leer je uitzetten, en dan is hij erger
 *    dan geen controle.
 *
 * ⚠️⚠️ **Waarom "aanroeper" twee dingen betekent.** 📏 `user_blocks` heeft géén
 *    client-`.delete()` maar wél `deblokkeer()`, een definer-functie. Zou deze
 *    controle alleen in `src/` kijken, dan meldde hij die tabel onterecht — en
 *    dat is precies het geval dat hem onbruikbaar zou maken.
 */

describe('ontleed', () => {
  it('leest de drie velden per tabel', () => {
    expect(ontleed('hero_profiles|open|f\nuser_blocks|open|t')).toEqual([
      { tabel: 'hero_profiles', open: true, gewistDoorFunctie: false },
      { tabel: 'user_blocks', open: true, gewistDoorFunctie: true },
    ]);
  });

  it('splitst op een Windows-regeleinde', () => {
    // ⚠️ psql schrijft daar `\r\n`. Een split op `\n` laat de `\r` aan het
    //    laatste veld plakken, en dan leest `f\r` niet meer als `f`. Zelfde
    //    reparatie als in kolomrechten-controle.
    expect(ontleed('a|open|f\r\nb|dicht|t\r\n')).toEqual([
      { tabel: 'a', open: true, gewistDoorFunctie: false },
      { tabel: 'b', open: false, gewistDoorFunctie: true },
    ]);
  });

  it('geeft een lege lijst op lege uitvoer', () => {
    expect(ontleed('')).toEqual([]);
  });
});

describe('clientWist', () => {
  it('vindt een .delete() een paar regels na de from()', () => {
    const bron = [
      "await supabase()",
      "  .from('todo_items')",
      "  .delete()",
      "  .eq('id', id);",
    ].join('\n');

    expect([...clientWist(bron)]).toEqual(['todo_items']);
  });

  it('laat een from() zonder delete met rust', () => {
    const bron = "await supabase().from('goals').select('id');";

    expect([...clientWist(bron)]).toEqual([]);
  });

  it('koppelt de delete aan de juiste tabel als er twee ketens onder elkaar staan', () => {
    const bron = [
      "await supabase().from('goals').select('id');",
      "'x'.repeat(500);",
      "await supabase().from('todo_items').delete().eq('id', id);",
    ].join('\n');

    const gevonden = [...clientWist(bron)];

    expect(gevonden).toContain('todo_items');
    expect(gevonden).not.toContain('goals');
  });
});

describe('beoordeel — wat hij moet vinden', () => {
  it('meldt een open tabel zonder enige aanroeper', () => {
    const tabellen = ontleed('hero_profiles|open|f');

    expect(beoordeel(tabellen, new Set(), {})).toEqual(['hero_profiles']);
  });
});

describe('beoordeel — wat hij met rust moet laten', () => {
  /**
   * ⚠️ Dit is de helft die bepaalt of iemand de controle serieus neemt. Alle vier
   *    de vormen hieronder staan vandaag in dit schema.
   */
  it('laat een tabel achter een `using (false)`-policy met rust', () => {
    // Daar is de grant dood hout en is de policy het echte slot — zes tabellen.
    expect(beoordeel(ontleed('group_members|dicht|f'), new Set(), {})).toEqual([]);
  });

  it('laat een tabel met een client-`.delete()` met rust', () => {
    expect(beoordeel(ontleed('todo_items|open|f'), new Set(['todo_items']), {})).toEqual([]);
  });

  it('laat een tabel met een definer-functie met rust', () => {
    // 📏 `user_blocks`: geen `.delete()` in `src/`, wél `deblokkeer()`.
    expect(beoordeel(ontleed('user_blocks|open|t'), new Set(), {})).toEqual([]);
  });

  it('laat een tabel met een reden in het register met rust', () => {
    const register = { hero_profiles: 'reden' };

    expect(beoordeel(ontleed('hero_profiles|open|f'), new Set(), register)).toEqual([]);
  });
});

describe('verlopenRegels', () => {
  it('meldt een registerrij die niets meer dekt', () => {
    // ⚠️ Zonder deze helft blijft een rij staan nadat de grant is ingetrokken, en
    //    dekt hij ooit stilletjes een tabel die hem wél zonder aanroeper heeft.
    //    Dezelfde ratel als bij `regel15:controle` en de CENSUS.
    const tabellen = ontleed('todo_items|open|f');

    expect(verlopenRegels(tabellen, new Set(['todo_items']), { todo_items: 'reden' })).toEqual([
      'todo_items',
    ]);
  });

  it('laat een rij staan die nog iets dekt', () => {
    const tabellen = ontleed('hero_profiles|open|f');

    expect(verlopenRegels(tabellen, new Set(), { hero_profiles: 'reden' })).toEqual([]);
  });
});
