import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  beginwaardeVraag1,
  magOvernemenUitDagzetten,
  voorstelUitDagzetten,
} from '../../src/modules/buddies/weekafsluiting-schemas';

/**
 * Een Dagzet komt nooit in de groep zonder dat je hem er zelf in zet.
 *
 * ⚠️ **De rij van 18-08 in ENGINEER-REVIEW noemde dit "de enige plek in de app
 *    waar privé tekst in een niet-privé veld terechtkomt zonder tweede
 *    handeling".** Vraag 1 van de weekafsluiting stond voorgevuld met je eigen
 *    Dagzetten van die periode. De Dagzet is standaard privé (domeinregel 9);
 *    de weekafsluiting is dat niet.
 *
 *    Met een voorinvulling is de standaard dus **delen**, en moet de gebruiker
 *    actief wegkijken en wissen om dat níét te doen. Dat is de omgekeerde
 *    volgorde van wat dit project overal elders aanhoudt: een commitment device
 *    wordt nooit stilzwijgend geactiveerd (domeinregel 5), en voor elk nieuw
 *    groepszichtbaar oppervlak is beschermd het antwoord tot iemand het
 *    tegendeel besluit (A41).
 *
 * ⚠️ **Een hint repareerde dat niet, en de hint die er stond loog bovendien.**
 *    "Voorgevuld uit je Dagzetten van deze week" verscheen ook als er helemaal
 *    geen Dagzetten waren. De meting van 25-08 in die rij zei dat er géén hint
 *    was; dat klopte niet — hij stond er, hij was alleen onvoorwaardelijk.
 *
 * ⚠️ **Waarom dit bestand naast de unit-tests staat.** `beginwaardeVraag1()`
 *    kán het voorstel niet aannemen — er is geen parameter voor. Dat is de
 *    structurele helft. De tweede helft is dat het scherm die functie ook
 *    gebruikt en het voorstel niet alsnog als beginwaarde van `useState`
 *    doorgeeft; dat is een naad, en die staat hieronder.
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const SCHERM = 'app/groep/weekafsluiting/[id].tsx';

/** Wordt het voorstel gebruikt als beginwaarde van een `useState`? */
export function voorstelAlsBeginwaarde(inhoud: string): boolean {
  return /useState\([^)]*\bvoorstel\b/.test(inhoud);
}

describe('beginwaardeVraag1', () => {
  it('geeft een leeg veld als er nog geen antwoord bewaard is', () => {
    expect(beginwaardeVraag1(null)).toBe('');
    expect(beginwaardeVraag1(undefined)).toBe('');
  });

  it('geeft het bewaarde antwoord terug als je aan het bijwerken bent', () => {
    // Wat je zélf al gedeeld hebt, hoort er wél te staan — anders lijkt
    // bijwerken op opnieuw beginnen.
    expect(beginwaardeVraag1('Drie ochtenden geschreven.')).toBe('Drie ochtenden geschreven.');
  });
});

describe('magOvernemenUitDagzetten', () => {
  it('biedt de knop aan als er Dagzetten zijn en het veld leeg is', () => {
    expect(magOvernemenUitDagzetten({ voorstel: 'Maandag gelopen', huidig: '' })).toBe(true);
    expect(magOvernemenUitDagzetten({ voorstel: 'Maandag gelopen', huidig: '   ' })).toBe(true);
  });

  it('biedt hem niet aan als er niets over te nemen valt', () => {
    // ⚠️ Anders staat er een knop die belooft dat je Dagzetten klaarstaan
    //    terwijl er geen zijn — precies de leugen die de oude hint vertelde.
    expect(magOvernemenUitDagzetten({ voorstel: '', huidig: '' })).toBe(false);
    expect(magOvernemenUitDagzetten({ voorstel: '  \n ', huidig: '' })).toBe(false);
  });

  it('biedt hem niet aan zodra er tekst staat', () => {
    // Overnemen is een gemak en mag nooit iets weggooien: één tik zou anders
    // getypte tekst overschrijven.
    expect(magOvernemenUitDagzetten({ voorstel: 'Maandag gelopen', huidig: 'Zelf getypt' })).toBe(
      false,
    );
  });
});

describe('het scherm vult vraag 1 niet voor', () => {
  it('gebruikt het voorstel nergens als beginwaarde van useState', () => {
    const inhoud = readFileSync(join(WORTEL, SCHERM), 'utf8');

    expect(voorstelAlsBeginwaarde(inhoud), SCHERM).toBe(false);
  });

  it('en het voorstel is er nog wél — als iets dat je zelf overneemt', () => {
    // ⚠️ De positieve controle. Zonder deze helft is een scherm waar het
    //    voorstel helemáál uit verdwenen is net zo groen als een scherm dat het
    //    goed doet, en dan is het gemak stilletjes weg. Vraag 3 uit regel 18.
    const inhoud = readFileSync(join(WORTEL, SCHERM), 'utf8');

    expect(inhoud).toContain('magOvernemenUitDagzetten(');
    expect(inhoud).toContain('setDid(voorstel)');
  });

  it.each([
    ['een directe beginwaarde', "const [did, setDid] = useState(voorstel);", true],
    ['met een terugval ervoor', "useState(mijnAntwoord?.did_text ?? voorstel)", true],
    ['de goede vorm', "useState(beginwaardeVraag1(mijnAntwoord?.did_text))", false],
    ['overnemen in een handler', 'onPress={() => setDid(voorstel)}', false],
  ])('ijking: %s', (_naam, regel, verwacht) => {
    // Beide richtingen: wat hij moet vinden én wat hij met rust moet laten.
    expect(voorstelAlsBeginwaarde(regel)).toBe(verwacht);
  });
});

describe('voorstelUitDagzetten blijft doen wat het deed', () => {
  it('zet de Dagzetten op volgorde en ontdubbelt', () => {
    const uit = voorstelUitDagzetten([
      { body: 'Woensdag gelopen', local_date: '2026-08-19' },
      { body: 'Maandag geschreven', local_date: '2026-08-17' },
      { body: 'Maandag geschreven', local_date: '2026-08-18' },
    ]);

    expect(uit).toBe('Maandag geschreven\nWoensdag gelopen');
  });
});
