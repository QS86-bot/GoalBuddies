/**
 * Genereert een VAPID-sleutelpaar voor web-push — QS8-114.
 *
 *   npm run vapid:genereer
 *
 * ⚠️ **Waarom dit de raw `node -e` uit de begindagen vervangt.** Eén commando dat
 *    overal hetzelfde doet, in plaats van een one-liner die per shell anders
 *    ontsnapt moet worden. De vorige versie stripte de base64-opvulling alleen
 *    doordat de shell `\$` naar `$` maakte; in een andere shell leverde datzelfde
 *    commando een subtiel kapotte sleutel op.
 *
 * ⚠️ **Waarom de logica hier staat en niet uit `webpush-crypto.ts` komt.** Dat
 *    bestand is de kanonieke generator (`genereerVapidSleutelpaar()`). Dit is
 *    dezelfde standaard-WebCrypto in ~10 regels — ECDSA P-256, ruwe publieke
 *    sleutel, `d` uit de JWK-privésleutel — bewust identiek gehouden. Verandert
 *    het formaat daar ooit, dan hier ook.
 *
 *    ⚠️ **Hier stond dat er "geen `tsx`/`ts-node`" is om de `.ts` te importeren,
 *       en dat klopt niet.** Node leest TypeScript rechtstreeks sinds 22.6
 *       (`--experimental-strip-types`); op 26-08-2026 gemeten door de echte
 *       module te importeren en er een paar mee te genereren. De keuze voor een
 *       eigen implementatie is bewust genomen en blijft staan — alleen de
 *       onderbouwing was onjuist. Wat die keuze kost, staat als open bevinding
 *       in `docs/ENGINEER-REVIEW.md` bij 26-08-2026, met de voorwaarde waaronder
 *       hij zwaarder wordt.
 *
 *    ⚠️ Er is géén controle die zegt of de publieke sleutel, de privésleutel en
 *       het subject bij elkaar horen. Ze staan op drie plekken en gekruist ziet
 *       elk van de drie er perfect uit; WebCrypto weigert pas bij het
 *       ondertekenen, in een job die eens per uur draait. Zelfde rij.
 *
 * ⚠️ Schrijft **niets** naar `.env` of naar de secrets. Het print alleen, want de
 *    twee helften horen op verschillende plekken: de publieke in `.env` (client),
 *    de privé alléén als Edge Function-secret. Automatisch wegschrijven is precies
 *    hoe een privésleutel per ongeluk in de webbuild belandt.
 */

import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

/** base64url zonder opvulling, gelijk aan `naarBase64url` in webpush-crypto.ts. */
function naarBase64url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function genereerVapidSleutelpaar() {
  const paar = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);

  const publiek = new Uint8Array(await subtle.exportKey('raw', paar.publicKey));
  const jwk = await subtle.exportKey('jwk', paar.privateKey);
  if (jwk.d === undefined) throw new Error('Sleutelpaar zonder privédeel.');

  return { publiek: naarBase64url(publiek), prive: jwk.d };
}

const { publiek, prive } = await genereerVapidSleutelpaar();

process.stdout.write(
  [
    '',
    'vapid: een nieuw sleutelpaar (P-256, RFC 8292).',
    '',
    '  .env — alleen de publieke helft (die gaat de webbundel in):',
    `    EXPO_PUBLIC_VAPID_PUBLIC_KEY=${publiek}`,
    '',
    '  Edge Function — nooit in .env of de webbuild:',
    '    npx supabase secrets set \\',
    `      EXPO_PUBLIC_VAPID_PUBLIC_KEY='${publiek}' \\`,
    `      VAPID_PRIVATE_KEY='${prive}' \\`,
    "      VAPID_SUBJECT='mailto:jij@voorbeeld.nl'",
    '',
    '  let op: dit paar verklaart elk bestaand webabonnement ongeldig — roteer bewust.',
    '',
  ].join('\n'),
);
