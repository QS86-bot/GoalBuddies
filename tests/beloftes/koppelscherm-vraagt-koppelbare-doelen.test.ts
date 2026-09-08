/**
 * QS8-342 — het koppelscherm vraagt de koppelbare doelen en niet pagina 0.
 *
 * ⚠️ **Waarom dit bestand naast `tests/rls/koppelbare-doelen.test.ts` staat.**
 *    Die test bewijst dat de *vraag* klopt: eenentwintig doelen, twintig
 *    gekoppeld, één over. Wat hij niet kan bewijzen is dat het schérm die vraag
 *    ook stelt — hij draait met de client van de harnas, en
 *    `fetchKoppelbareDoelen()` leunt op `supabase()`, de client van de app.
 *
 *    Dat is precies de naad uit onwrikbare regel 18 vraag 1: twee correcte
 *    onderdelen, en de belofte zit ertussen. Zonder dit bestand kan iemand het
 *    scherm terugzetten op `fetchDoelen(userId)` met een aftrekking, en blijft de
 *    RLS-test vrolijk groen.
 *
 * ⚠️ **Dit is een bronbewaking en geen render**, zoals `uitkomst-niet-weggooien`
 *    en `aanmeldscherm` — er is geen renderer in dit project.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const SCHERM = join(WORTEL, 'app', 'groep', '[id].tsx');

const bron = readFileSync(SCHERM, 'utf8');

/**
 * De bron zonder commentaar.
 *
 * ⚠️ De kop van het koppelblok noemt `fetchDoelen` met zoveel woorden, om uit te
 *    leggen wat er misging. Zonder deze stap zou die uitleg de test rood maken —
 *    en dan leert de volgende lezer dat hij de uitleg moet weghalen in plaats van
 *    de fout.
 */
function zonderCommentaar(tekst: string): string {
  return tekst
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((r) => r.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const code = zonderCommentaar(bron);

describe('het koppelscherm vraagt de koppelbare doelen', () => {
  it('roept `fetchKoppelbareDoelen` aan', () => {
    expect(
      code,
      'het koppelblok hoort de serverzijdig uitgesloten lijst te vragen — zie QS8-342',
    ).toContain('fetchKoppelbareDoelen(');
  });

  it('vraagt nergens meer `fetchDoelen` op, want dat gaf pagina 0', () => {
    // ⚠️ **Dit is de eigenlijke grendel.** `fetchDoelen(userId)` geeft twintig
    //    doelen; wie daar de gekoppelde vanaf trekt, krijgt bij eenentwintig
    //    doelen een lege lijst en toont "je hebt nog geen doel om te delen".
    expect(
      code.includes('fetchDoelen('),
      'dit scherm hoort `fetchDoelen()` niet meer te gebruiken — het gaf pagina 0 en dat is de bug van QS8-342',
    ).toBe(false);
  });

  it('haalt de lijst opnieuw op na een geslaagde koppeling', () => {
    // ⚠️ **Criterium 3 van QS8-342, en het is een náád — regel 18 vraag 1.**
    //    `koppelDoelAanGroep` klopt (de rij landt) en `fetchKoppelbareDoelen`
    //    klopt (de vraag sluit uit). Wat ertussen zat was niets: `onGekoppeld` is
    //    de `herlaad` van het gróepsscherm, en de lijst hangt aan een eigen
    //    `useAsync` met `[userId, groupId]` als deps. Die veranderen daar niet
    //    van, en `AsyncView` houdt zijn kinderen staan zolang er data is — dus
    //    bleef het zojuist gekoppelde doel in de lijst staan. Tikken gaf succes
    //    en veranderde niets zichtbaars; nog eens tikken gaf opnieuw succes, want
    //    `ignoreDuplicates` maakt van de tweede poging een stille no-op.
    const koppelFunctie = code.slice(code.indexOf('async function koppel('));
    const totHetEinde = koppelFunctie.slice(0, koppelFunctie.indexOf('\n  }'));

    expect(
      totHetEinde,
      'na een geslaagde koppeling hoort de koppelbare lijst zichzelf opnieuw op te halen — anders meldt het scherm succes zonder dat er iets verandert',
    ).toContain('herlaadLijst()');
  });

  it('heeft die herlaadfunctie van zijn eigen `useAsync`', () => {
    // ⚠️ Zonder deze regel is `herlaadLijst` de `herlaad` van het gróepsscherm
    //    onder een andere naam, en dan bewaakt de test hierboven niets: die
    //    herlaadt de stand van de groep en niet de lijst met koppelbare doelen.
    expect(
      code,
      'de lijst hoort zijn eigen `herlaad` te gebruiken, niet die van het groepsscherm',
    ).toMatch(/herlaad:\s*herlaadLijst\s*}\s*=\s*useAsync\(/);
  });

  it('trekt de gekoppelde doelen niet meer in het scherm zelf af', () => {
    // ⚠️ De aftrekking wás de fout: hij werkt alleen op de doelen die je toevallig
    //    al had opgehaald. Serverzijdig uitsluiten is wat de lege staat waar maakt.
    expect(
      code.includes('fetchGekoppeldeDoelIds('),
      'de uitsluiting hoort in de query te zitten, niet in een filter op pagina 0',
    ).toBe(false);
  });
});
