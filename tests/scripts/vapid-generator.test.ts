import { describe, expect, it } from 'vitest';

import {
  genereerVapidSleutelpaar as genereerUitScript,
  naarBase64url as base64urlUitScript,
} from '../../scripts/vapid-genereer.mjs';
import {
  genereerVapidSleutelpaar as genereerCanoniek,
  vapidAuthorization,
} from '../../src/modules/notifications/webpush-crypto';

/**
 * Het generatiescript en de canonieke module leveren uitwisselbare sleutels — QS8-222.
 *
 * ⚠️ **De belofte is niet "deze tien regels zijn correct".** `vapid-genereer.mjs`
 *    implementeert ECDSA P-256, de ruwe publieke sleutel en de JWK-`d` opnieuw,
 *    naast `genereerVapidSleutelpaar()` in `webpush-crypto.ts`. Die keuze is
 *    bewust genomen en blijft staan. Wat eraan ontbrak is wat de dossierrij van
 *    26-08 al noemde: **niets hield de twee gelijk.** Dezelfde vorm als
 *    `supabase/functions/_shared/time/`, alleen stond daar wél een controle op.
 *
 * ⚠️ **Dus toetst dit bestand de naad en niet de helften.** De belofte die telt
 *    is *"een paar uit het script wordt door de verzendkant geaccepteerd"*. Loopt
 *    het curve- of exportformaat uit elkaar, dan weigert
 *    `crypto.subtle.importKey()` binnen `vapidAuthorization()` — en dat is
 *    precies het faalbeeld uit de rij: anders merk je het pas als er een melding
 *    niet aankomt, in een job die eens per uur draait.
 *
 * ⚠️ **De tegenproef hoort erbij.** Zonder een paar uit de canonieke functie door
 *    dezelfde molen te halen, is "het script deugt" niet te onderscheiden van
 *    "`vapidAuthorization()` accepteert alles". Beide staan hieronder.
 *
 * ## De ijking, per grendel en gemeten
 *
 * Vier vormen van drift, elk apart in het script gezet:
 *
 * | drift | rood |
 * | -- | -- |
 * | een andere curve (P-384) | de belofte-test en de vormtest |
 * | `spki` in plaats van `raw` voor de publieke sleutel | de belofte-test en de vormtest |
 * | base64 mét opvulling en `+`/`/` — de fout van de oude one-liner | de vormtest en de coderingstest |
 * | de `d` uit een ánder sleutelpaar | **alleen** de belofte-test |
 *
 * ⚠️ **De laatste rij is waar dit bestand voor bestaat.** Twee helften die elk
 *    perfect ogen en niet bij elkaar horen, komen door elke vormtest heen; het
 *    is precies het paar dat je uitrolt en waarna er stil geen melding meer
 *    aankomt.
 *
 * ⚠️ **En de derde rij zegt waarom de belofte-test alléén niet genoeg is.**
 *    Gemeten: met opvulling erin blijft de belofte-test grôen — `importKey()`
 *    accepteert die base64 gewoon. De codering glipt er dus doorheen, en daar
 *    staan die twee andere tests voor. Eén test per grendel, en niet één test
 *    die alles zou moeten vangen.
 *
 * ⚠️ **Het script was hiervóór niet te voeden en dus niet te ijken.** Alles stond
 *    op modulehoogte en werd bij importeren meteen uitgevoerd. De generator is nu
 *    geëxporteerd en het printen staat achter de `import.meta.url`-grendel die de
 *    andere scripts hier ook gebruiken — dezelfde afspraak als in CLAUDE.md bij
 *    regel 18: *een controle die je niet kunt voeden, kun je niet ijken.*
 */

/** Een endpoint van de vorm die een pushdienst aanlevert. */
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const SUBJECT = 'mailto:jij@voorbeeld.nl';
const NU = new Date('2026-09-05T12:00:00.000Z');

/** Haalt het JWT uit de `vapid t=…, k=…`-header terug. */
function tokenUit(header: string): string {
  const gevonden = /vapid t=([^,]+), k=(.+)$/.exec(header);
  if (gevonden === null) throw new Error(`onverwachte header: ${header}`);
  return gevonden[1] as string;
}

function vanBase64url(waarde: string): Uint8Array {
  const opgevuld = waarde.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(Buffer.from(opgevuld, 'base64'));
}

/**
 * Controleert de handtekening met de publieke sleutel uit hetzelfde paar.
 *
 * ⚠️ **Dit is de helft die `vapidAuthorization()` zelf niet doet.** Die
 *    ondertekent met de privésleutel en zet de publieke ernaast in `k=`; of die
 *    twee bij elkaar horen, blijkt pas bij de pushdienst. Hier wordt dat
 *    nagerekend, want juist dát is wat uit elkaar loopt als de twee generatoren
 *    uit elkaar lopen.
 */
async function handtekeningKlopt(token: string, publiek: string): Promise<boolean> {
  const [kop, claims, handtekening] = token.split('.');
  const rauw = vanBase64url(publiek);
  const sleutel = await crypto.subtle.importKey(
    'raw',
    rauw as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    sleutel,
    vanBase64url(handtekening as string) as BufferSource,
    new TextEncoder().encode(`${kop as string}.${claims as string}`) as BufferSource,
  );
}

describe('Het VAPID-generatiescript levert wat de verzendkant accepteert', () => {
  it('maakt een paar waarmee vapidAuthorization een geldig token ondertekent', async () => {
    const paar = await genereerUitScript();

    const header = await vapidAuthorization({
      endpoint: ENDPOINT,
      publiekeSleutel: paar.publiek,
      priveSleutel: paar.prive,
      subject: SUBJECT,
      nu: NU,
    });

    expect(
      await handtekeningKlopt(tokenUit(header.Authorization), paar.publiek),
      'de verzendkant zette dit paar in elkaar tot een JWK en ondertekende ermee; ' +
        'klopt de handtekening niet tegen dezelfde publieke sleutel, dan horen de ' +
        'twee helften die dit script print niet bij elkaar',
    ).toBe(true);
  });

  it('doet dat op dezelfde manier als de canonieke functie', async () => {
    // ⚠️ De tegenproef. Zonder haar bewijst de test hierboven alleen dat
    //    `vapidAuthorization()` iets accepteert, niet dat het script het goede
    //    levert.
    const paar = await genereerCanoniek();

    const header = await vapidAuthorization({
      endpoint: ENDPOINT,
      publiekeSleutel: paar.publiek,
      priveSleutel: paar.prive,
      subject: SUBJECT,
      nu: NU,
    });

    expect(await handtekeningKlopt(tokenUit(header.Authorization), paar.publiek)).toBe(true);
  });

  it('levert dezelfde vorm als de canonieke functie', async () => {
    const uitScript = await genereerUitScript();
    const canoniek = await genereerCanoniek();

    // Een ongecomprimeerd P-256-punt is 65 octetten; `d` is er 32.
    expect(vanBase64url(uitScript.publiek)).toHaveLength(65);
    expect(vanBase64url(uitScript.prive)).toHaveLength(32);

    expect(
      uitScript.publiek.length,
      'de lengtes lopen uiteen zodra een van de twee de base64-opvulling anders ' +
        'behandelt — en dat is precies de fout die de vorige one-liner maakte',
    ).toBe(canoniek.publiek.length);
    expect(uitScript.prive.length).toBe(canoniek.prive.length);

    for (const waarde of [uitScript.publiek, uitScript.prive]) {
      expect(waarde, 'base64url is zonder opvulling en zonder + of /').toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('codeert base64url gelijk aan de canonieke helper', async () => {
    // ⚠️ Een eigen grendel, want de twee vorige tests lopen allebei door
    //    `crypto.subtle` en zouden een verschil in de codering alleen indirect
    //    zien. Deze byte-reeks draagt met opzet een `+`, een `/` en opvulling in
    //    gewone base64.
    const bytes = Uint8Array.from([0xfb, 0xff, 0xbe, 0x3f, 0x00, 0x01]);

    expect(base64urlUitScript(bytes)).toBe('-_--PwAB');
  });
});
