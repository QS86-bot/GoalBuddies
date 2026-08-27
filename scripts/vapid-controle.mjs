#!/usr/bin/env node
/**
 * vapid-controle — horen de drie VAPID-waarden bij elkaar?
 *
 * ⚠️ **Het probleem is dat ze op drie plekken staan en gekruist alle drie
 *    perfect ogen.** De publieke sleutel zit in de webbundel
 *    (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`), de privésleutel in de omgeving van de
 *    Edge Function (`VAPID_PRIVATE_KEY`), en het subject weer ergens anders
 *    (`VAPID_SUBJECT`). Elk is een geldige waarde van de juiste vorm; of ze bij
 *    elkáár horen, staat nergens.
 *
 *    WebCrypto merkt het pas bij het ondertekenen — in `vapidAuthorization()`,
 *    in een job die eens per uur draait. De pushdienst geeft dan een 403 en geen
 *    rode test. Dat is de duurste helft van de bevinding van 26-08-2026.
 *
 * ⚠️ **De toets is goedkoop en hij is gemeten en niet aangenomen.** Een JWK met
 *    een `d` die niet bij `x`/`y` hoort, wordt door `crypto.subtle.importKey()`
 *    geweigerd met `DataError: Invalid keyData` — nagemeten op Node 22.22.2 met
 *    twee echte sleutelparen. Dat is de hele controle: haal `x` en `y` uit de
 *    publieke sleutel, plak de `d` ernaast, en laat WebCrypto zeggen of het een
 *    sleutel is.
 *
 * ⚠️ **Hij raakt de privésleutel niet en drukt hem nooit af.** Alleen de vraag
 *    "hoort dit bij elkaar" gaat eruit, niet het antwoord waaruit je hem zou
 *    kunnen afleiden. Bij een fout staat er wát er niet klopt en geen waarde.
 *
 * ⚠️ Zonder de drie waarden slaat hij zichtbaar over (stderr, `OVERGESLAGEN`) en
 *    met `--streng` valt hij om — dezelfde vorm als `register:controle` en
 *    `functies:controle`. Ze horen niet in CI: `VAPID_PRIVATE_KEY` is een
 *    privésleutel en die staat op de machine van de eigenaar.
 */

import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

/** De vaste lengte van een ongecomprimeerd P-256-punt: `0x04` plus twee keer 32 octetten. */
const PUNT_LENGTE = 65;

/**
 * Splitst de rauwe publieke sleutel in de JWK-coördinaten `x` en `y`.
 *
 * ⚠️ Geeft een reden terug in plaats van te gooien. Een onleesbare sleutel is
 *    een uitkomst van deze controle en geen storing erin.
 */
export function ontleedPubliekeSleutel(publiek) {
  if (typeof publiek !== 'string' || publiek.trim() === '') {
    return { ok: false, reden: 'de publieke sleutel is leeg' };
  }

  let bytes;
  try {
    bytes = Buffer.from(publiek.trim(), 'base64url');
  } catch {
    return { ok: false, reden: 'de publieke sleutel is geen base64url' };
  }

  if (bytes.length !== PUNT_LENGTE) {
    return {
      ok: false,
      reden: `de publieke sleutel is ${bytes.length} octetten en hoort er ${PUNT_LENGTE} te zijn`,
    };
  }

  if (bytes[0] !== 0x04) {
    return {
      ok: false,
      reden: 'de publieke sleutel begint niet met 0x04 (ongecomprimeerd punt)',
    };
  }

  return {
    ok: true,
    x: bytes.subarray(1, 33).toString('base64url'),
    y: bytes.subarray(33).toString('base64url'),
  };
}

/**
 * Horen deze publieke en privésleutel bij elkaar?
 *
 * ⚠️ De toets is `importKey()` zelf en geen eigen rekenwerk. Zou dit script de
 *    puntvermenigvuldiging nabootsen, dan is het een derde implementatie naast
 *    de twee die er al zijn — en precies dát is de bevinding waar deze controle
 *    bij hoort.
 */
export async function hoortBijElkaar(publiek, prive) {
  const ontleed = ontleedPubliekeSleutel(publiek);
  if (!ontleed.ok) return ontleed;

  if (typeof prive !== 'string' || prive.trim() === '') {
    return { ok: false, reden: 'de privésleutel is leeg' };
  }

  try {
    await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: ontleed.x, y: ontleed.y, d: prive.trim(), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    return { ok: true };
  } catch (fout) {
    // ⚠️ De melding van WebCrypto gaat niet mee naar buiten: hij is per runtime
    //    anders en zegt de lezer niets. Wat hij moet weten is wélke twee waarden
    //    niet bij elkaar horen.
    void fout;
    return {
      ok: false,
      reden: 'de privésleutel hoort niet bij deze publieke sleutel',
    };
  }
}

/**
 * Is dit subject bruikbaar?
 *
 * ⚠️ Dezelfde eis als in `vapidAuthorization()`: RFC 8292 wil een adres waarop
 *    de pushdienst de beheerder kan bereiken. Die functie gooit erop, en dat
 *    gebeurt in de uurjob. Hier is het een regel in een rapport.
 */
export function beoordeelSubject(subject) {
  if (typeof subject !== 'string' || subject.trim() === '') {
    return { ok: false, reden: 'het subject is leeg' };
  }

  if (!/^(mailto:|https:)/.test(subject.trim())) {
    return { ok: false, reden: 'het subject is geen mailto:- of https:-adres' };
  }

  return { ok: true };
}

/** Alle drie tegelijk, in de volgorde waarin een lezer ze wil horen. */
export async function beoordeelDrietal({ publiek, prive, subject }) {
  const klachten = [];

  const paar = await hoortBijElkaar(publiek, prive);
  if (!paar.ok) klachten.push(paar.reden);

  const sub = beoordeelSubject(subject);
  if (!sub.ok) klachten.push(sub.reden);

  return klachten;
}

const UITLEG =
  '\nDe drie waarden staan op drie plekken — de publieke sleutel in de webbundel,\n' +
  'de privésleutel in de omgeving van de Edge Function, het subject in beide — en\n' +
  'gekruist ziet elk van de drie er perfect uit. Zonder deze controle merkt\n' +
  'WebCrypto het pas bij het ondertekenen, in de uurjob, als een 403 van de\n' +
  'pushdienst.\n\n' +
  'Genereer een nieuw paar met `npm run vapid:genereer` en zet ze samen om — de\n' +
  'publieke in `.env` en de private met `supabase secrets set`. Een half omgezet\n' +
  'paar is precies wat deze controle vindt.';

async function hoofd() {
  const streng = process.argv.includes('--streng');
  const publiek = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  const prive = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publiek || !prive || !subject) {
    const melding =
      'vapid-controle: geen EXPO_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY en\n' +
      '  VAPID_SUBJECT in de omgeving. Deze controle hoort op de machine van de\n' +
      '  eigenaar te draaien; een privésleutel hoort niet in CI.';

    if (streng) {
      console.error(`✗ ${melding}`);
      return 1;
    }

    console.error(`⚠ OVERGESLAGEN — ${melding}`);
    return 0;
  }

  const klachten = await beoordeelDrietal({ publiek, prive, subject });

  if (klachten.length > 0) {
    console.error(`✗ vapid-controle: ${klachten.length} bezwaar/bezwaren.\n`);
    for (const k of klachten) console.error(`    ${k}`);
    console.error(UITLEG);
    return 1;
  }

  console.log(
    'vapid-controle: de publieke en privésleutel horen bij elkaar en het subject is bruikbaar.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await hoofd());
}
