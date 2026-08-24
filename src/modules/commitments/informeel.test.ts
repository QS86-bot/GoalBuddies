import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { en } from '../../shared/i18n/en';
import { nl } from '../../shared/i18n/nl';

/**
 * QS8-85 — commitments blijven informeel in de MVP.
 *
 * ⚠️ Dit is een **controle in plaats van een zin.** "Geen echt geld in de MVP"
 *    stond in de PRD en in een issue, en dat is precies het soort afspraak dat
 *    iemand over een half jaar niet meer leest. Deze tests worden rood zodra
 *    er een betaalprovider of een bedragkolom bij komt.
 *
 * ⚠️ Als je hier komt omdat een test rood staat: dat is waarschijnlijk terecht.
 *    Echt geld verwerken is QS8-86, `phase:v3`, en dat vraagt eerst een besluit
 *    van Quinten — het raakt domeinregel 5 (een consequentie moet expliciet
 *    bevestigd zijn en auditeerbaar), plus een hele reeks juridische dingen die
 *    niets met deze codebase te maken hebben.
 */

const wortel = join(import.meta.dirname, '..', '..', '..');

function lees(pad: string): string {
  return readFileSync(join(wortel, pad), 'utf8');
}

describe('commitments blijven informeel', () => {
  /**
   * Acceptatiecriterium 1, eerste helft: geen enkele betaalintegratie.
   */
  it('heeft geen betaalprovider als dependency', () => {
    const pakket = JSON.parse(lees('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const alles = Object.keys({
      ...(pakket.dependencies ?? {}),
      ...(pakket.devDependencies ?? {}),
    });

    const verdacht = [
      'stripe',
      'mollie',
      'adyen',
      'paypal',
      'braintree',
      'square',
      'revenuecat',
      'iap',
      'in-app-purchase',
      'payment',
    ];

    for (const naam of alles) {
      for (const woord of verdacht) {
        expect(naam.toLowerCase(), `dependency ${naam}`).not.toContain(woord);
      }
    }
  });

  /**
   * Acceptatiecriterium 1, tweede helft: geen bedragen die als transactie
   * gelezen kunnen worden.
   *
   * ⚠️ Toetst op `database.types.ts` en niet op een levende database, zodat deze
   *    test in Node draait en geen Supabase-sessie kost. Dat bestand wordt
   *    gegenereerd uit het echte schema, dus het is een getrouw afschrift —
   *    maar als het verouderd is, verouderd deze test mee. Draai
   *    `types:db` (of de MCP-generator) na elke migratie; dat hoort toch al.
   */
  it('heeft geen bedrag- of valutakolom op commitments', () => {
    const types = lees('src/lib/database.types.ts');

    const blok = types.slice(types.indexOf('      commitments: {'));
    const rowBlok = blok.slice(0, blok.indexOf('Relationships'));

    for (const verdacht of ['amount', 'price', 'currency', 'cents', 'iban', 'stake_']) {
      expect(rowBlok.toLowerCase(), `kolom met "${verdacht}"`).not.toContain(verdacht);
    }

    // De positieve controle: we kijken wél naar het juiste blok. Zonder dit
    // slaagt de test ook als `commitments` helemaal niet in het bestand staat.
    expect(rowBlok).toContain('beneficiary_group_id');
    expect(rowBlok).toContain('body');
  });

  /**
   * Acceptatiecriterium 2: de UI is expliciet dat dit bijgehouden wordt en niet
   * afgerekend. Een gebruiker die "ik trakteer op een etentje" invult, hoort
   * niet te hoeven raden of de app zijn rekening gaat plunderen.
   *
   * ⚠️ **Deze test greep tot QS8-115 in het schermbestand naar de letterlijke
   *    zin, en dat is precies de fout die regel 18 beschrijft.** Toen de tekst
   *    naar de catalogus verhuisde, bewaakte hij nog steeds iets — alleen niet
   *    meer de belofte. Hij kijkt nu naar de náád: het scherm moet de sleutel
   *    gebruiken, én de sleutel moet in béide talen de belofte doen. Eén van de
   *    twee losschroeven maakt hem rood.
   *
   * ⚠️ De Engelse kant wordt op betekenis getoetst en niet op een letterlijke
   *    zin. Een vertaling mag anders lopen; hij mag alleen niet stiekem iets
   *    anders beloven dan de Nederlandse.
   */
  it('zegt in het scherm dat de app niets afrekent', () => {
    const scherm = lees('app/doel/[id].tsx');
    expect(scherm).toContain("t('commitment.geen_afrekening')");

    expect(nl['commitment.geen_afrekening']).toContain('rekent niets af');
    expect(en['commitment.geen_afrekening'].toLowerCase()).toContain('settles nothing');
  });

  /**
   * Dezelfde belofte in het strafformulier, waar hij nog een stap verder gaat:
   * daar staat er ook "verwerkt geen geld" bij.
   */
  it('zegt bij de straf dat er geen geld verwerkt wordt', () => {
    expect(nl['straf.geen_geld']).toContain('verwerkt geen geld');
    expect(en['straf.geen_geld'].toLowerCase()).toContain('no money');
  });
});
