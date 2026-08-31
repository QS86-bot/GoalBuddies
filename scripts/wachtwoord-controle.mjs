#!/usr/bin/env node
/**
 * Zegt de server hetzelfde over wachtwoorden als het formulier? — QS8-234.
 *
 * ⚠️ **Waarom dit bestaat.** `src/modules/auth/schemas.ts` eist twaalf tekens.
 *    Dat is Zod, in de browser. Supabase Auth heeft zijn éígen
 *    `password_min_length` in het dashboard, standaard **6**. Staat die lager
 *    dan het schema, dan is die twaalf een suggestie: één POST naar
 *    `/auth/v1/signup` met de anon-sleutel — die per definitie in elke bundel
 *    zit — maakt een account met zes tekens aan.
 *
 * ⚠️ **Regel 18 in zijn zuiverste vorm.** Het onderdeel klopte: het schema is
 *    getest, de melding is vertaald, de teller telt codepunten. De belófte —
 *    "een wachtwoord is hier minstens twaalf tekens" — hangt aan een naad tussen
 *    client en server waar tot 31-08-2026 niets stond. Er was geen test die
 *    groen bleef terwijl de belofte brak; er was geen test die de belofte kón
 *    raken.
 *
 * ⚠️ **Waarom een controle en geen test.** Een `signUp()`-test bewijst meer,
 *    maar kan alleen tegen productie draaien: de lokale stack heeft een shim
 *    voor `auth.users` en geen GoTrue, dus daar valt niets te weigeren. Een
 *    controle die de ínstelling opvraagt, draait overal waar een token is en
 *    zegt hetzelfde over de grens — in beide richtingen, ook als iemand het
 *    schema verlaagt zonder de schakelaar.
 *
 * ⚠️ **Zonder token slaat hij zichzelf over — zichtbaar.** Zelfde afspraak en
 *    dezelfde vorm als `functies:controle` en `adviseur:controle`. De poort telt
 *    dat sinds QS8-239 als *ongemeten* en niet als groen.
 *
 * Draaien: `npm run wachtwoord:controle`.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { config } from 'dotenv';

config({ path: '.env', quiet: true });

const PROJECT_REF = 'wehgocadxehottiiyvsc';
const SCHEMA = fileURLToPath(new URL('../src/modules/auth/schemas.ts', import.meta.url));

/**
 * Leest `WACHTWOORD_MINIMUM` uit het schema-bestand.
 *
 * ⚠️ **Op de benoemde constante en niet op `.min(` in de keten.** Die keten
 *    draagt er twee (`min` en `max`) en `inloggenSchema` draagt er nog een derde
 *    (`.min(1)`, want inloggen stelt geen eisen). Een regex op `.min(` pakt de
 *    verkeerde zodra iemand de volgorde wijzigt, en dan bewaakt deze controle
 *    stil een ander getal dan het formulier gebruikt.
 */
export function minimumUit(bron) {
  const gevonden = /export\s+const\s+WACHTWOORD_MINIMUM\s*=\s*(\d+)\s*;/.exec(bron);
  if (!gevonden) {
    throw new Error(
      'WACHTWOORD_MINIMUM niet gevonden in src/modules/auth/schemas.ts. ' +
        'Is de constante hernoemd of weggehaald? Deze controle bewaakt dan niets meer.',
    );
  }
  return Number(gevonden[1]);
}

/**
 * Vergelijkt het schema met de serverinstelling.
 *
 * Geeft `null` als het klopt, anders een uitleg.
 */
export function vergelijk({ schema, server }) {
  if (typeof server !== 'number' || Number.isNaN(server)) {
    return {
      soort: 'onbekend',
      melding:
        'De Auth-configuratie gaf geen password_min_length terug. Dat is niet ' +
        'hetzelfde als "hij klopt" — er is niets gemeten.',
    };
  }

  if (server < schema) {
    return {
      soort: 'server-lager',
      melding:
        `Het formulier eist ${schema} tekens, de server accepteert er ${server}. ` +
        'Die twaalf is dan een suggestie: een POST rechtstreeks naar /auth/v1/signup ' +
        'met de publieke anon-sleutel omzeilt hem. Zet password_min_length in het ' +
        `Supabase-dashboard op ${schema} (Authentication → Policies).`,
    };
  }

  if (server > schema) {
    return {
      soort: 'server-hoger',
      melding:
        `De server eist ${server} tekens en het formulier maar ${schema}. Dat lekt ` +
        'niets, maar het is een storingsmelding na een formulier dat "goed" zei — ' +
        'de gebruiker krijgt de afwijzing pas van de server. Trek ze gelijk.',
    };
  }

  return null;
}

/* c8 ignore start */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const streng = process.argv.includes('--streng');

  const ONTBREEKT =
    'geen SUPABASE_ACCESS_TOKEN in de omgeving.\n' +
    '  Deze controle vraagt de Auth-configuratie op via de Management API; zie QS8-234.';

  if (!token) {
    console.error(
      streng
        ? `✗ wachtwoord-controle kon niet draaien — ${ONTBREEKT}`
        : `⚠ wachtwoord-controle: OVERGESLAGEN — ${ONTBREEKT}`,
    );
    process.exit(streng ? 1 : 0);
  }

  const schema = minimumUit(readFileSync(SCHEMA, 'utf8'));

  let instellingen;
  try {
    const antwoord = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
      {
        headers: { Authorization: `Bearer ${token}` },
        // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!antwoord.ok) {
      console.error(`✗ wachtwoord-controle: de API gaf ${antwoord.status}.`);
      process.exit(1);
    }
    instellingen = await antwoord.json();
  } catch (fout) {
    console.error(`✗ wachtwoord-controle: ophalen mislukt — ${fout.message}`);
    process.exit(1);
  }

  const klacht = vergelijk({ schema, server: instellingen?.password_min_length });

  if (klacht === null) {
    console.log(
      `wachtwoord-controle: formulier en server eisen allebei ${schema} tekens.`,
    );
    process.exit(0);
  }

  console.error(`wachtwoord-controle: ${klacht.melding}`);
  process.exit(1);
}
/* c8 ignore stop */
