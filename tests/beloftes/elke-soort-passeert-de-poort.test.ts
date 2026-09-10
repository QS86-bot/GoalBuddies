import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Er is één keelpunt waar elke melding langs moet — QS8-92.
 *
 * ⚠️ **Waarom een test die de boom afzoekt en niet nog een unit-test.**
 *    `meldingPoortReden()` staat onder test in `regels.test.ts`, en dat toetst
 *    dat die functie het goed doet. Dat is een eigenschap van een ónderdeel. De
 *    belofte is een eigenschap van het gehéél: *geen enkele melding verlaat dit
 *    project zonder langs die functie te zijn gegaan.*
 *
 *    Die belofte breekt op een manier die geen unit-test kan zien: iemand voegt
 *    een zesde soort toe met een eigen `insert` in `notifications_sent` ernaast,
 *    of haalt de aanroep uit `stuur()` weg omdat hij "hem daar niet nodig had".
 *    In beide gevallen blijven alle bestaande tests groen.
 *
 * ⚠️ **Deze test grijpt naar de tabelnaam en niet naar een bestandspad**
 *    (regel 18, vraag 4). Verhuist de job naar een ander bestand, dan verhuist
 *    de belofte mee via de glob. Hernoemt iemand `notifications_sent`, dan is
 *    dát een migratie en hoort deze test rood te worden.
 *
 * ⚠️ Met de hand rood gemaakt, twee keer apart: een tweede
 *    `.from('notifications_sent').insert(` in de job, en de aanroep van
 *    `meldingPoortReden` uit `stuur()` weghalen.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const FUNCTIES = join(WORTEL, 'supabase/functions');

/** Elk `.ts`-bestand onder `supabase/functions/`. */
function bestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else if (naam.endsWith('.ts')) uit.push(pad);
  }
  return uit;
}

/**
 * ⚠️ De regex staat los van de aanroepvorm met witruimte ertussen: PostgREST
 *    laat `.from('notifications_sent')\n  .insert(` toe, en een test die alleen
 *    op één regel zoekt, ziet die niet.
 */
const INSERT = /\.from\(\s*['"]notifications_sent['"]\s*\)[\s\S]{0,200}?\.insert\(/g;

describe('elke melding gaat langs de poort', () => {
  const alle = bestanden(FUNCTIES);

  it('vindt überhaupt bestanden om te toetsen', () => {
    // ⚠️ Zonder dit is een lege boom een groene test — de vorm van een grendel
    //    die er wel staat en niets bewaakt.
    expect(alle.length).toBeGreaterThan(3);
  });

  it('schrijft `notifications_sent` op precies één plek', () => {
    const plekken = alle.filter((pad) => INSERT.test(readFileSync(pad, 'utf8')));
    INSERT.lastIndex = 0;

    expect(plekken.map((p) => p.slice(WORTEL.length + 1))).toHaveLength(1);
  });

  it('doet dat in een bestand dat de poort aanroept', () => {
    const plekken = alle.filter((pad) => INSERT.test(readFileSync(pad, 'utf8')));
    INSERT.lastIndex = 0;

    for (const pad of plekken) {
      expect(readFileSync(pad, 'utf8')).toContain('meldingPoortReden(');
    }
  });

  /**
   * ⚠️ De poort moet vóór de insert staan. Erná zou hij de melding onderdrukken
   *    én de ontdubbeling verbruiken, en dan komt hij nooit meer — ook niet als
   *    de gebruiker de soort weer aanzet. Dat is stil dataverlies.
   */
  it('roept de poort aan vóór de rij geschreven wordt', () => {
    const plekken = alle.filter((pad) => INSERT.test(readFileSync(pad, 'utf8')));
    INSERT.lastIndex = 0;

    for (const pad of plekken) {
      const bron = readFileSync(pad, 'utf8');
      const poort = bron.indexOf('meldingPoortReden(');
      INSERT.lastIndex = 0;
      const insert = INSERT.exec(bron)?.index ?? -1;
      INSERT.lastIndex = 0;

      expect(poort).toBeGreaterThan(-1);
      expect(insert).toBeGreaterThan(poort);
    }
  });
});
