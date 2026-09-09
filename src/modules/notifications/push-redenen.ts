import { t } from '../../shared/i18n';

/**
 * De weigergronden van `registreer_push_token()` — QS8-377.
 *
 * ⚠️ **Een eigen bestand zonder één import, en dat is met opzet.** De RLS-suite
 *    legt deze lijst naast `pg_get_functiondef()`, en die draait in Node zonder
 *    React Native. Zou dit in `tokens.ts` staan, dan trekt de import
 *    `expo-notifications` en daarmee de hele React-Native-boom mee, en dan valt
 *    de test om op een Flow-bestand in `node_modules`. 📏 Precies dat gebeurde.
 *    Zelfde reden en zelfde vorm als `chat-schemas.ts`: de regels apart van de
 *    laag die ze gebruikt.
 *
 * ⚠️⚠️ **Deze lijst is een kopie van wat de database kan zeggen.**
 *    `tests/rls/pushredenen.test.ts` vergelijkt hem met de `reason`-literalen in
 *    de functie: komt er een migratie met een nieuwe grond, dan wordt die test
 *    rood in plaats van dat de gebruiker stil de algemene zin krijgt. Zo is
 *    `te_veel_tokens` er in 0214 bij gekomen zonder dat iemand het merkte.
 *
 * ⚠️ Het issue noemde er zes; 📏 het zijn er negen. `not_signed_in` en
 *    `onbekend_platform` ontbraken, en `token_te_lang`/`sleutel_te_lang` zijn er
 *    twee. Gemeten en niet overgenomen.
 */
export const PUSH_WEIGERGRONDEN = [
  'geen_expotoken',
  'geen_pushdienst',
  'geen_token',
  'geen_websleutels',
  'not_signed_in',
  'onbekend_platform',
  'sleutel_te_lang',
  'te_veel_tokens',
  'token_te_lang',
] as const;

export type PushWeigergrond = (typeof PUSH_WEIGERGRONDEN)[number];

/**
 * De zin die bij een weigergrond hoort.
 *
 * ⚠️ **Niet elke grond is eerlijk uit te leggen, en dan verzinnen we niets.**
 *    `geen_pushdienst` en `geen_expotoken` betekenen dat het apparaat iets
 *    teruggaf dat de server niet als adres herkent. Daar hoort één eerlijke
 *    algemene zin bij en geen verzonnen oorzaak.
 *
 * ⚠️ **De token zelf gaat nergens in.** Hij is geen geheim, maar hij is het adres
 *    van een apparaat, en hij hoort niet in een scherm of een logboek.
 */
export function pushWeigerMelding(grond: string | undefined): string {
  switch (grond) {
    case 'geen_websleutels':
      return t('push.geen_websleutels');
    case 'te_veel_tokens':
      return t('push.te_veel_tokens');
    case 'not_signed_in':
      return t('push.niet_ingelogd');
    // ⚠️ De overige zes zeggen allemaal hetzelfde tegen een gebruiker: het
    //    apparaat gaf iets terug waar de server niets mee kan. `geen_token`,
    //    `onbekend_platform`, `token_te_lang`, `sleutel_te_lang`,
    //    `geen_pushdienst` en `geen_expotoken` verschillen voor een ontwikkelaar
    //    en niet voor de persoon die op de knop drukte — die kan er hetzelfde
    //    aan doen, namelijk het opnieuw proberen of een ander apparaat pakken.
    default:
      return t('push.apparaat_niet_bruikbaar');
  }
}
