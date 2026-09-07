import { randomUUID } from 'node:crypto';

/**
 * Vaste id's voor een fixture, uniek per run — QS8-336.
 *
 * ⚠️ **Waarom een vaste uuid in een test überhaupt bestaat.** Sommige fixtures
 *    willen een idéntiteit die ze zelf kiezen: om een volgorde af te dwingen
 *    (`adempauze-grendels`), om in een `psql`-regel te kunnen interpoleren
 *    zonder eerst een `returning` te lezen, of om twee bestanden dezelfde rij te
 *    laten beschrijven. Dat is een geldige wens; het probleem zit in *hoe vast*
 *    hij was.
 *
 * ⚠️ **Het gemeten probleem.** 📏 Bij twee gelijktijdige suite-runs tegen
 *    dezelfde lokale stack draagt élke run dezelfde uuid, en dan is het geen
 *    identiteit meer maar een gedeelde sleutel. Wat er misgaat:
 *
 *      insert into goals (id, owner_id, …)
 *        values ('00000000-0000-4000-8000-0000000002a8', '…2a7', …)
 *      ERROR:  goals_owner_id_fkey — Key (owner_id)=(…2a7) is not present
 *
 *    De ándere run had dat profiel al opgeruimd. Zelfde familie als de fixture
 *    van `policies.test.ts` die zijn groep op *naam* terugzocht (QS8-329): twee
 *    runs delen iets dat uniek had moeten zijn.
 *
 * ⚠️ **De prefix staat per bestand vast en niet per run**, en dat is geen
 *    slordigheid maar de enige mogelijkheid: vitest isoleert de modules per
 *    testbestand, dus modulestaat leeft niet langer dan één bestand. Dat is hier
 *    precies genoeg — de botsing die dit issue beschrijft is er een tússen runs,
 *    en twee runs krijgen per bestand allebei hun eigen prefix.
 *
 * ⚠️ **De volgorde blijft.** Binnen één bestand is de prefix constant en zit het
 *    volgnummer achteraan, dus uuid's die met dit hulpmiddel gemaakt zijn,
 *    sorteren in dezelfde volgorde als hun volgnummer. Fixtures die op die
 *    volgorde leunen, blijven werken.
 */
const PREFIX = randomUUID().replaceAll('-', '').slice(0, 12);

/**
 * Een uuid die vaststaat binnen dit testbestand en nooit botst met een andere
 * run.
 *
 * ⚠️ De vorm blijft een geldige uuid: acht-vier-vier-vier-twaalf, met versie 4
 *    en variant 8 op hun plek. Postgres weigert alles wat daar niet aan voldoet,
 *    en een test die op een 22P02 valt, wijst je naar de verkeerde plek.
 *
 * @param volgnummer 0 t/m 65535. Bepaalt de sorteervolgorde binnen dit bestand.
 */
export function proefId(volgnummer: number): string {
  if (!Number.isInteger(volgnummer) || volgnummer < 0 || volgnummer > 0xffff) {
    throw new Error(`proefId: volgnummer buiten bereik: ${volgnummer}`);
  }

  const staart = volgnummer.toString(16).padStart(4, '0');

  return [
    PREFIX.slice(0, 8),
    PREFIX.slice(8, 12),
    '4000',
    '8000',
    `00000000${staart}`,
  ].join('-');
}
