#!/usr/bin/env node
/**
 * Het VAPID-sleutelpaar maken en nakijken — QS8-114/QS8-124.
 *
 * ⚠️ **Waarom dit bestaat: de instructie was niet uit te voeren.** `.env.example`
 *    en `docs/DEPLOY.md` §6 zeiden allebei "eenmalig genereren met
 *    `genereerVapidSleutelpaar()` uit `src/modules/notifications/webpush-crypto.ts`".
 *    Die functie stond er, was getest, en had geen enkele ingang: geen script,
 *    geen commando, niets. Dat is de vorm van QS8-113 — elk schakeltje af en de
 *    keten nergens aangesloten — alleen zat de breuk hier niet in de code maar in
 *    de handleiding. Wie het toch wilde, moest zelf een script schrijven of naar
 *    een pakket van iemand anders grijpen.
 *
 * ⚠️ **Roept de échte functie aan en maakt geen tweede.** Node 22 leest
 *    TypeScript rechtstreeks (`--experimental-strip-types`), dus deze wrapper
 *    importeert `webpush-crypto.ts` zoals de app hem gebruikt. Een tweede
 *    implementatie van sleutelgeneratie in gewoon JavaScript zou precies de fout
 *    zijn die `supabase/functions/_shared/time/` ons al een keer heeft geleerd:
 *    twee kopieën die vandaag hetzelfde doen en niemand die ze zo houdt.
 *
 * ⚠️ **De privésleutel wordt getóónd en nooit weggeschreven.** Geen `.env`, geen
 *    bestand in de repo, geen logregel in een CI-uitvoer. Hij hoort alleen in de
 *    omgeving van de Edge Function (`supabase secrets set`); zou hij in `.env`
 *    belanden, dan bakt Expo hem niet in de bundel — dat doet het alleen met
 *    `EXPO_PUBLIC_`-variabelen — maar hij staat dan wel op schijf naast een
 *    bestand dat gedeeld wordt.
 *
 * ⚠️ **Opnieuw genereren is een handeling met gevolgen, dus die vraagt erom.**
 *    Een browser bindt een abonnement aan de publieke sleutel waarmee het
 *    aangemaakt is. Een nieuw paar maakt élk bestaand abonnement ongeldig, en
 *    dat merk je niet: de pushdienst geeft een 403 en de meldingen houden
 *    gewoon op. Staat er al een sleutel in de omgeving, dan weigert dit script
 *    zonder `--opnieuw`.
 *
 * Gebruik:
 *   npm run vapid:genereer          een nieuw paar, met de commando's erbij
 *   npm run vapid:genereer -- --opnieuw   ook als er al een sleutel staat
 *   npm run vapid:controle          kijkt na of de drie waarden bij elkaar horen
 */

import { pathToFileURL } from 'node:url';

const CRYPTO_PAD = new URL('../src/modules/notifications/webpush-crypto.ts', import.meta.url);

/**
 * Hoort dit drietal bij elkaar?
 *
 * ⚠️ **Dit is een naad en geen onderdeel, en daar zit de waarde.** De publieke
 *    sleutel staat in de webbundel, de privésleutel in de omgeving van de Edge
 *    Function, en het subject weer ergens anders. Drie waarden die op drie
 *    plekken gezet worden en bij elkaar moeten horen — precies de vorm waarvan
 *    `CLAUDE.md` regel 18 zegt dat elk onderdeel klopt terwijl het geheel lekt.
 *
 *    Zijn ze gekruist, dan gaat er niets kapot dat je kunt zien: WebCrypto
 *    weigert de sleutel pas op het moment van ondertekenen, in een Edge Function
 *    die eens per uur draait, en de gebruiker merkt alleen dat er geen melding
 *    komt. Geen test wordt daar rood van, want er valt lokaal niets te toetsen
 *    zolang niemand de drie naast elkaar legt.
 *
 * ⚠️ Ondertekent met het paar in plaats van de waarden te vergelijken. Uit de
 *    privésleutel alleen (`jwk.d`, de kale scalar) is de publieke helft niet af
 *    te leiden zonder puntvermenigvuldiging, en die doet WebCrypto niet voor je.
 *    Ondertekenen wél: `importKey` op een JWK met een `d` die niet bij `x`/`y`
 *    hoort, geeft `DataError: Invalid keyData`. Dat is de controle.
 */
export async function controleerPaar(
  waarden,
  ondertekenen,
) {
  const klachten = [];

  const publiek = (waarden.publiek ?? '').trim();
  const prive = (waarden.prive ?? '').trim();
  const subject = (waarden.subject ?? '').trim();

  if (publiek === '') klachten.push('EXPO_PUBLIC_VAPID_PUBLIC_KEY is leeg.');
  if (prive === '') klachten.push('VAPID_PRIVATE_KEY is leeg.');
  if (subject === '') klachten.push('VAPID_SUBJECT is leeg.');

  // ⚠️ Deze eis komt uit RFC 8292 §2.1 en staat óók in `vapidAuthorization()`.
  //    Hier herhaald omdat een fout adres anders pas bij de eerste echte
  //    verzending opvalt, en dat is uren later in een log dat niemand leest.
  if (subject !== '' && !/^(mailto:|https:)/.test(subject)) {
    klachten.push('VAPID_SUBJECT moet met mailto: of https: beginnen (RFC 8292).');
  }

  if (klachten.length > 0) return klachten;

  try {
    await ondertekenen({ publiek, prive, subject });
  } catch (fout) {
    const melding = fout instanceof Error ? fout.message : String(fout);
    klachten.push(
      `De publieke en de privésleutel horen niet bij elkaar (${melding}). ` +
        'Zet ze allebei opnieuw uit één `npm run vapid:genereer`.',
    );
  }

  return klachten;
}

/** De regels die je na het genereren nodig hebt. Geen bestand, alleen tekst. */
export function instructies(paar, subject) {
  return [
    '',
    '  1. In .env (en op Hostinger als omgevingsvariabele):',
    '',
    `     EXPO_PUBLIC_VAPID_PUBLIC_KEY=${paar.publiek}`,
    '',
    '  2. In de omgeving van de Edge Functions — alle drie:',
    '',
    `     npx supabase secrets set EXPO_PUBLIC_VAPID_PUBLIC_KEY=${paar.publiek}`,
    `     npx supabase secrets set VAPID_PRIVATE_KEY=${paar.prive}`,
    `     npx supabase secrets set VAPID_SUBJECT=${subject}`,
    '',
    '  3. Daarna opnieuw uitrollen, anders draait er nog oude code:',
    '',
    '     npm run edge:sync && npm run edge:controle',
    '     npx supabase functions deploy notificaties',
    '     npx supabase functions deploy rollover',
    '     npx supabase functions deploy doelcoach',
    '     npm run build && npm run deploy',
    '',
    '  4. Nakijken of de drie bij elkaar horen:',
    '',
    '     npm run vapid:controle',
    '',
  ];
}

async function laadCrypto() {
  return import(CRYPTO_PAD.href);
}

async function genereer(opnieuw) {
  const bestaand = (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();

  if (bestaand !== '' && !opnieuw) {
    console.error(
      'vapid: er staat al een sleutel in de omgeving.\n\n' +
        '  Een nieuw paar maakt élk bestaand abonnement ongeldig — de browser bindt\n' +
        '  een abonnement aan de publieke sleutel waarmee het is aangemaakt, en een\n' +
        '  vervangen sleutel geeft een 403 zonder dat iemand iets merkt.\n\n' +
        '  Weet je het zeker, dan:  npm run vapid:genereer -- --opnieuw\n',
    );
    process.exit(1);
  }

  const { genereerVapidSleutelpaar } = await laadCrypto();
  const paar = await genereerVapidSleutelpaar();
  const subject = (process.env.VAPID_SUBJECT ?? '').trim() || 'mailto:jouw-adres@voorbeeld.nl';

  console.log('vapid: een nieuw sleutelpaar (P-256, RFC 8292).\n');
  console.log('  ⚠️ De privésleutel staat hieronder en wordt nergens weggeschreven.');
  console.log('     Hij hoort ALLEEN in de omgeving van de Edge Function, nooit in .env');
  console.log('     van de webbuild en nooit in de repo.\n');
  console.log(`  publiek : ${paar.publiek}`);
  console.log(`  privé   : ${paar.prive}`);
  console.log(instructies(paar, subject).join('\n'));
}

async function controle() {
  const { vapidAuthorization } = await laadCrypto();

  const klachten = await controleerPaar(
    {
      publiek: process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY,
      prive: process.env.VAPID_PRIVATE_KEY,
      subject: process.env.VAPID_SUBJECT,
    },
    async ({ publiek, prive, subject }) => {
      await vapidAuthorization({
        // Een willekeurig echt pushdienst-adres; er gaat niets de deur uit.
        endpoint: 'https://fcm.googleapis.com/fcm/send/controle',
        publiekeSleutel: publiek,
        priveSleutel: prive,
        subject,
        nu: new Date(),
      });
    },
  );

  if (klachten.length === 0) {
    console.log('vapid-controle: de drie waarden horen bij elkaar en het subject klopt.');
    process.exit(0);
  }

  console.error(`vapid-controle: ${klachten.length} bevinding(en).\n`);
  for (const k of klachten) console.error(`  ${k}`);
  console.error('\nZie docs/DEPLOY.md §6.');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--controle')) return controle();
  return genereer(args.includes('--opnieuw'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
