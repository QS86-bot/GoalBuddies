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
 * ⚠️⚠️ **De eerste versie van deze test bewaakte dit níet, en dat is gemeten en
 *    niet bedacht.** Hij telde *bestanden* met een insert in plaats van
 *    *voorkomens*, en toetste alleen de positie van de eerste. 📏 Een tweede,
 *    ongepoortte insert ná de poort in hetzelfde bestand liet hem gewoon groen.
 *
 *    De ijking in de kop beweerde toen dat hij daarop rood gemaakt was. Dat was
 *    hij niet: de mutatie die ik gedraaid had zette de insert vóór de poort, en
 *    díé wordt door de ordeningsassertie hieronder gevangen — een ánder slot dan
 *    het slot dat de test belooft te bewaken. Precies de val die CLAUDE.md bij
 *    regel 18 beschrijft. Gevonden in de securityronde op QS8-92.
 *
 * ⚠️ Met de hand rood gemaakt, drie keer apart: een tweede insert **ná** de
 *    poort, een insert **vóór** de poort, en de aanroep van `meldingPoortReden`
 *    uit `stuur()` weghalen.
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
 *
 * ⚠️ **Een fábriek en geen constante.** Een `/g`-regex houdt `lastIndex` bij
 *    tussen aanroepen, dus `.test()` in een `filter()` over meerdere bestanden
 *    slaat er willekeurig eentje over. Elke aanroeper krijgt een verse.
 */
function insertRegex(): RegExp {
  return /\.from\(\s*['"]notifications_sent['"]\s*\)[\s\S]{0,200}?\.insert\(/g;
}

/** Elke plek waar dit bestand naar `notifications_sent` schrijft, als index. */
function insertPosities(bron: string): number[] {
  return [...bron.matchAll(insertRegex())].map((m) => m.index ?? -1);
}

describe('elke melding gaat langs de poort', () => {
  const alle = bestanden(FUNCTIES);

  it('vindt überhaupt bestanden om te toetsen', () => {
    // ⚠️ Zonder dit is een lege boom een groene test — de vorm van een grendel
    //    die er wel staat en niets bewaakt.
    expect(alle.length).toBeGreaterThan(3);
  });

  /**
   * ⚠️ **Voorkomens en niet bestanden.** Twee inserts in hetzelfde bestand zijn
   *    twee schrijvers; een test die bestanden telt ziet dat verschil niet.
   */
  it('schrijft `notifications_sent` op precies één plek in de hele boom', () => {
    const totaal = alle.reduce((n, pad) => n + insertPosities(readFileSync(pad, 'utf8')).length, 0);
    expect(totaal).toBe(1);
  });

  it('doet dat in een bestand dat de poort aanroept', () => {
    for (const pad of alle) {
      const bron = readFileSync(pad, 'utf8');
      if (insertPosities(bron).length === 0) continue;
      expect(bron, pad).toContain('meldingPoortReden(');
    }
  });

  /**
   * ⚠️ De poort moet vóór **elke** insert staan. Erná zou hij de melding
   *    onderdrukken én de ontdubbeling verbruiken, en dan komt hij nooit meer —
   *    ook niet als de gebruiker de soort weer aanzet. Dat is stil dataverlies.
   */
  it('roept de poort aan vóór élke rij die geschreven wordt', () => {
    for (const pad of alle) {
      const bron = readFileSync(pad, 'utf8');
      const posities = insertPosities(bron);
      if (posities.length === 0) continue;

      const poort = bron.indexOf('meldingPoortReden(');
      expect(poort, pad).toBeGreaterThan(-1);
      for (const positie of posities) {
        expect(positie, `${pad}: insert op ${positie} ligt niet ná de poort`).toBeGreaterThan(poort);
      }
    }
  });
});
