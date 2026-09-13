#!/usr/bin/env node
/**
 * Draagt een realtime-tabel op **productie** `REPLICA IDENTITY FULL`? — QS8-463.
 *
 * ⚠️ **Waarom dit bestaat, en waarom het geen hygiëne is.** Supabase past RLS toe
 *    op INSERT en UPDATE, maar **niet op DELETE**. Met de standaard replica
 *    identity gaat er bij een verwijdering alleen een uuid over de lijn; met
 *    `full` gaat de volledige oude rij mee — `status = 'missed'`, een notitie, de
 *    tekst van een privégesprek — naar iedereen die zich abonneert, lid of niet.
 *    Dat is domeinregel 7 in zijn ergste vorm, en migratie 0247 léunt er inmiddels
 *    op: die wist rijen uit `chat_messages`.
 *
 * ⚠️ **En er is geen technische rem.** `publish` is een optie van de publicatie en
 *    niet per tabel in te stellen — dat staat zo in de kop van 0027. Het verbod is
 *    dus een afspraak, en een afspraak heeft een meter nodig.
 *
 * ⚠️⚠️ **De meter bestond al; de aanroeper ontbrak.** `realtime_bewaking()`
 *    (migratie 0027) geeft precies het goede terug en kijkt naar **élke** tabel in
 *    `public` — geen vaste lijst van drie, dus een vierde die erbij komt is
 *    zichtbaar. 📏 Maar hij werd alleen aangeroepen door `tests/rls/epic7.test.ts`
 *    en `epic13.test.ts`, en die draaien tegen de **lokale stack**. Op 13-09-2026
 *    gemeten: `relreplident` kwam in heel `scripts/` niet voor. Zet iemand de
 *    instelling rechtstreeks op het project — SQL-editor, of omdat de
 *    Supabase-documentatie over `old_record` dat aanraadt — dan zag niets het.
 *
 * ## Twee uitslagen, en het verschil is opzet
 *
 *   gepubliceerd + `full`      -> **rood**. Dit lekt nu.
 *   niet gepubliceerd + `full` -> **melding**. Een geladen wapen, geen schot:
 *                                 het lekt pas zodra die tabel gepubliceerd wordt.
 *
 * 📏 Op 13-09-2026 meldde die tweede tak er **nul** op productie (40 tabellen in
 * `public`, 3 in de publicatie, geen enkele `full`). Hij kost dus geen ruis — en
 * dat is gemeten en niet gehoopt, want een controle die alles meldt leer je te
 * negeren.
 *
 * ⚠️ **Zonder productiesleutel slaat hij zichzelf zichtbaar over.** Zelfde vorm en
 *    dezelfde reden als `functies:controle`: `OVERGESLAGEN` naar stderr, want op
 *    stdout leest "overgeslagen" als "gelukt". Ongemeten is niet groen — de poort
 *    houdt die twee uit elkaar.
 *
 * Draaien: `npm run realtime-identiteit:controle`. Hoort mee in `npm run poort`,
 * en staat met reden in `ZONDER_CI`: CI heeft de productiesleutel niet.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { config } from 'dotenv';

import { beoordeelOmgeving } from './migratieregister-omgeving.mjs';

config({ path: '.env', quiet: true });

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const streng =
  process.argv.includes('--streng') || process.env.REALTIME_IDENTITEIT_STRENG === '1';

const ONTBREEKT =
  'geen EXPO_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de omgeving.\n' +
  '  Deze controle leest `realtime_bewaking()` van het échte project; zonder\n' +
  '  sleutel is er niets te meten.';

/**
 * De bevindingen in wat `realtime_bewaking()` teruggaf.
 *
 * ⚠️ Puur en geëxporteerd, want een controle die je niet kunt voeden kun je niet
 *    ijken. De vormen staan los in `tests/scripts/realtime-identiteit.test.ts`.
 *
 * ⚠️ **De vergelijking is hoofdletterongevoelig en op de hele waarde.** 0027
 *    vertaalt `relreplident` naar `default|nothing|full|index`, maar een `includes`
 *    op `'full'` zou ook een toekomstige `'full-iets'` vangen en een hoofdletter
 *    missen. Hier telt alleen de exacte waarde.
 */
export function bevindingen(rijen) {
  const uit = [];
  for (const rij of rijen) {
    const identiteit = String(rij.replica_identity ?? '').trim().toLowerCase();
    if (identiteit !== 'full') continue;
    uit.push({
      tabel: String(rij.tabel),
      soort: rij.in_publicatie === true ? 'lekt' : 'geladen',
    });
  }
  return uit.sort((a, b) => a.tabel.localeCompare(b.tabel));
}

/** Lekt er iets nú? Alleen dát maakt de controle rood. */
export function isFout(gevonden) {
  return gevonden.some((b) => b.soort === 'lekt');
}

const UITLEG = {
  lekt:
    'staat in de realtime-publicatie én draagt `full`. Bij élke DELETE gaat de\n' +
    '    volledige oude rij naar iedere abonnee — RLS geldt daar niet. Zet hem\n' +
    '    terug: `alter table public.<tabel> replica identity default;`',
  geladen:
    'draagt `full` maar staat (nog) niet in de publicatie. Lekt vandaag niets,\n' +
    '    en lekt alles op de dag dat iemand hem publiceert. Zet hem nu terug.',
};

async function uitProductie() {
  const antwoord = await fetch(`${url}/rest/v1/rpc/realtime_bewaking`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
    signal: AbortSignal.timeout(20_000),
  });

  if (!antwoord.ok) {
    throw new Error(
      `Productie lezen lukte niet (${antwoord.status}). Staat migratie 0027 op dit ` +
        'project, en draai je met de service-role-key?',
    );
  }
  return antwoord.json();
}

async function main() {
  const oordeel = beoordeelOmgeving({ url, sleutel: serviceRoleKey, streng });

  if (oordeel === 'ontbreekt') {
    console.error(`✗ realtime-identiteit-controle kon niet draaien — ${ONTBREEKT}`);
    process.exit(1);
  }
  if (oordeel === 'overslaan') {
    console.error(`⚠ realtime-identiteit-controle: OVERGESLAGEN — ${ONTBREEKT}`);
    process.exit(0);
  }

  let rijen;
  try {
    rijen = await uitProductie();
  } catch (fout) {
    console.error(`✗ ${fout instanceof Error ? fout.message : String(fout)}`);
    process.exit(1);
  }

  const gevonden = bevindingen(rijen);
  const gepubliceerd = rijen.filter((r) => r.in_publicatie === true).length;

  if (gevonden.length === 0) {
    console.log(
      `realtime-identiteit-controle: geen enkele tabel draagt REPLICA IDENTITY FULL ` +
        `(${rijen.length} tabellen in public, ${gepubliceerd} in de publicatie).`,
    );
    process.exit(0);
  }

  const schrijf = isFout(gevonden) ? console.error : console.warn;
  schrijf('realtime-identiteit-controle: REPLICA IDENTITY FULL gevonden op productie.\n');
  for (const { tabel, soort } of gevonden) {
    schrijf(`  - ${tabel}  [${soort}]\n    ${UITLEG[soort]}\n`);
  }
  schrijf(
    'Zie CLAUDE.md bij domeinregel 7 en de kop van migratie 0027: RLS geldt niet\n' +
      'voor DELETE, en `publish` is niet per tabel in te stellen — er is geen\n' +
      'technische rem, alleen deze meter.',
  );

  process.exit(isFout(gevonden) ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
