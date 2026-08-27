#!/usr/bin/env node
/**
 * Deploy van de webbuild naar Hostinger — QS8-100.
 *
 * Eén commando: `npm run deploy`. Bouwt, controleert, pakt in, uploadt en zet
 * live op `goalbuddies.q-projects.tech`.
 *
 * ⚠️ **De belangrijkste stap is de secret-scan, en die staat vóór de upload.**
 *    Een statische webbundel is publiek: alles wat erin zit, kan iedereen lezen.
 *    Expo neemt uitsluitend `EXPO_PUBLIC_*` mee, maar dat is een belofte van de
 *    bundler en geen controle. Deze scan leest `.env`, pakt élke variabele die
 *    níét met `EXPO_PUBLIC_` begint, en zoekt zijn waarde terug in de gebouwde
 *    bestanden. Vindt hij er één, dan stopt de deploy — er gaat niets naar
 *    buiten. Dat is acceptatiecriterium 3 van QS8-100, en het is de enige stap
 *    hier die onherstelbaar is als je hem overslaat: een service-role-key die één
 *    keer publiek heeft gestaan, is gelekt, ook als je hem een minuut later
 *    weghaalt.
 *
 * ⚠️ **Geen Vercel-specifieke API's.** Dit is een gewone statische host: een map
 *    met bestanden en een `.htaccess`. Zie `docs/DEPLOY.md` voor wat er moet
 *    veranderen als het ooit Vercel wordt.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

import { config } from 'dotenv';

import { beoordeelAntwoorden, VERPLICHTE_PADEN } from './pwa-controle.mjs';

config({ path: '.env', quiet: true });

const DOMEIN = 'goalbuddies.q-projects.tech';
const GEBRUIKER = 'u349450154';
const DIST = 'dist';

function fail(bericht, hint) {
  console.error(`\n  ✗ ${bericht}\n`);
  if (hint) console.error(`    ${hint}\n`);
  process.exit(1);
}

function stap(tekst) {
  console.log(`\n  → ${tekst}`);
}

// ---------------------------------------------------------------------------
// 1. Wat er in de bundel hoort te zitten
// ---------------------------------------------------------------------------

/**
 * De env-variabelen die de app nodig heeft, met hun rol.
 *
 * ⚠️ Deze lijst is acceptatiecriterium 2 van QS8-100: vastleggen welke waarden in
 *    welke omgeving horen. Ontbreekt er één, dan bouwt Expo gewoon door en krijg
 *    je een app die pas bij de eerste aanroep stukloopt — met een lege URL, wat
 *    leest als een storing en niet als een configuratiefout.
 */
const VEREIST = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

function controleerEnv() {
  const ontbreekt = VEREIST.filter((naam) => !(process.env[naam] ?? '').trim());

  if (ontbreekt.length > 0) {
    fail(
      `Deze variabelen ontbreken in .env: ${ontbreekt.join(', ')}`,
      'Zonder deze waarden bouwt Expo een app die pas bij het eerste verzoek stukloopt.',
    );
  }

  console.log(`    ${VEREIST.length} vereiste variabelen aanwezig.`);
}

// ---------------------------------------------------------------------------
// 2. De secret-scan
// ---------------------------------------------------------------------------

/** Elk bestand onder `map`, plat. */
function alleBestanden(map) {
  const uit = [];

  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...alleBestanden(pad));
    else uit.push(pad);
  }

  return uit;
}

/**
 * Zoekt geheimen terug in de gebouwde bestanden.
 *
 * ⚠️ Waarom de wáárde en niet de naam. Een bundler die `SUPABASE_SERVICE_ROLE_KEY`
 *    inlijnt, zet de sleutel erin en niet de variabelenaam — zoeken op de naam
 *    vindt dus niets terwijl het lek er wel is. Daarom wordt hier op de inhoud
 *    gezocht.
 *
 * ⚠️ Korte waarden worden overgeslagen. Een env-variabele van drie tekens
 *    (`TZ=UTC`) komt in élke bundel voor en zou de deploy voorgoed blokkeren op
 *    een vals alarm — en een controle die altijd afgaat, wordt uitgezet.
 */
function scanOpGeheimen(bestanden) {
  const MINIMALE_LENGTE = 12;

  const geheimen = Object.entries(process.env)
    .filter(([naam]) => !naam.startsWith('EXPO_PUBLIC_'))
    .filter(([naam]) => naam in leesEnvNamen())
    .map(([naam, waarde]) => ({ naam, waarde: (waarde ?? '').trim() }))
    .filter(({ waarde }) => waarde.length >= MINIMALE_LENGTE);

  if (geheimen.length === 0) {
    console.log('    Geen te controleren geheimen in .env gevonden.');
    return;
  }

  const gevonden = [];

  for (const pad of bestanden) {
    let inhoud;
    try {
      inhoud = readFileSync(pad, 'utf8');
    } catch {
      continue; // Binair bestand (een plaatje, een lettertype). Slaat niets over dat tekst is.
    }

    for (const { naam, waarde } of geheimen) {
      if (inhoud.includes(waarde)) gevonden.push({ naam, pad });
    }
  }

  if (gevonden.length > 0) {
    console.error('\n  ✗ GEHEIMEN IN DE BUNDEL — er is niets geüpload.\n');
    for (const { naam, pad } of gevonden) console.error(`    ${naam} staat in ${pad}`);
    console.error(
      '\n    Een statische bundel is publiek. Haal de variabele uit de client-code,\n' +
        '    hernoem hem niet naar EXPO_PUBLIC_*, en ververs de sleutel — hij moet als\n' +
        '    gelekt beschouwd worden zodra hij in een build heeft gezeten.\n',
    );
    process.exit(1);
  }

  console.log(`    ${geheimen.length} geheimen gecontroleerd, geen ervan staat in de bundel.`);
}

/** De namen die écht in `.env` staan — niet de hele omgeving van de shell. */
function leesEnvNamen() {
  if (!existsSync('.env')) return {};

  const namen = {};
  for (const regel of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(regel);
    if (match) namen[match[1]] = true;
  }

  return namen;
}

// ---------------------------------------------------------------------------
// 3. SPA-routing
// ---------------------------------------------------------------------------

/**
 * Schrijft een `.htaccess` die diepe links laat werken — acceptatiecriterium 4.
 *
 * ⚠️ **Waarom dit nodig is.** `expo export` met `output: "static"` schrijft een
 *    dynamische route weg als een bestand met de haakjes in de naam:
 *    `groep/[id].html`. Apache zoekt bij `/groep/abc-123` naar een bestand
 *    `groep/abc-123` en vindt niets — dus zonder deze regels geeft élke diepe
 *    link een 404. Dat is precies de uitnodigingslink uit QS8-59.
 *
 * ⚠️ **De regels worden gegenereerd uit wat er écht in `dist/` staat** en niet
 *    met de hand bijgehouden. Een route erbij betekent dan alleen opnieuw
 *    deployen; een handgeschreven lijst zou stilletjes achterlopen, en dat merk
 *    je pas als iemand een link deelt die niet werkt.
 */
function schrijfHtaccess() {
  const dynamisch = alleBestanden(DIST)
    .map((pad) => relative(DIST, pad).split(sep).join('/'))
    .filter((pad) => /\[[^/]+\]\.html$/.test(pad));

  const inhoud = htaccessInhoud(dynamisch);
  writeFileSync(join(DIST, '.htaccess'), inhoud, 'utf8');
  console.log(`    .htaccess geschreven, met ${dynamisch.length} regels voor dynamische routes.`);
}

/**
 * De inhoud van `dist/.htaccess`.
 *
 * ⚠️ Apart en geëxporteerd omdat dit bestand eisen draagt die nergens anders
 *    afgedwongen worden: de service worker mag niet gecachet worden en het
 *    manifest heeft een eigen content-type. Die eisen stonden tot 25-08-2026
 *    alleen in `docs/DEPLOY.md`, terwijl dat document zélf verbiedt om
 *    `dist/.htaccess` met de hand bij te werken — deze generator overschrijft
 *    hem bij elke deploy. Zie `tests/scripts/deploy-htaccess.test.ts`.
 */
export function htaccessInhoud(dynamisch) {
  const regels = dynamisch.map((pad) => {
    const map = pad.replace(/\/[^/]+$/, '');
    // Eén segment achter de map, geen schuine streep erin: dat is de parameter.
    const patroon = map === pad ? '^([^/]+)/?$' : `^${map}/[^/]+/?$`;
    return `  RewriteRule ${patroon} /${pad} [L]`;
  });

  const inhoud = `# Gegenereerd door scripts/deploy-web.mjs — niet met de hand bijwerken.
#
# Diepe links naar een dynamische route. \`expo export\` schrijft die weg als
# bijvoorbeeld groep/[id].html; Apache zoekt bij /groep/abc-123 naar een bestand
# dat zo heet en vindt niets. Zonder deze regels geeft elke uitnodigingslink 404.

<IfModule mod_rewrite.c>
  RewriteEngine On

  # Bestaat het bestand of de map echt? Dan die, en verder niets doen.
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Een route zonder parameter: /doelen -> doelen.html
  RewriteCond %{REQUEST_FILENAME}.html -f
  RewriteRule ^(.+?)/?$ /$1.html [L]

${regels.join('\n')}

  # Alles wat overblijft: de app zelf, die zijn eigen "niet gevonden" toont.
  RewriteRule ^ /index.html [L]
</IfModule>

# Een statische bundel met een hash in de naam mag lang gecachet worden; de
# HTML niet, anders blijft een bezoeker op een oude versie hangen na een deploy.
<IfModule mod_headers.c>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "\\.(js|css|woff2|png|jpg|svg)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>

  # ⚠️ De service worker is de uitzondering op de regel hierboven, en sw.js
  #    eindigt op .js — dus zonder dit blok werd hij een jaar onveranderlijk
  #    gecachet. Een browser die een oude sw.js vasthoudt, blijft die draaien
  #    tot hij vanzelf verloopt, en levert meldingen af via code van vorige week.
  #    <Files> staat hier na <FilesMatch>: de laatste Header set wint.
  #
  #    Dit stond als eis in docs/DEPLOY.md en niet in dit script, terwijl datzelfde
  #    document verbiedt om dist/.htaccess met de hand te repareren — die wordt
  #    bij elke deploy opnieuw geschreven. Een eis in een document dat door een
  #    generator wordt overschreven, is geen eis maar een wens.
  <Files "sw.js">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
  </Files>
</IfModule>

# ⚠️ Sommige Apache-installaties kennen manifest.json niet en sturen
#    text/plain. Safari negeert het manifest dan stil, en dan is er op iOS geen
#    "zet op beginscherm" — en zonder beginscherm geen push (QS8-117).
<IfModule mod_mime.c>
  AddType application/manifest+json .webmanifest
</IfModule>
<Files "manifest.json">
  ForceType application/manifest+json
</Files>
`;

  return inhoud;
}

// ---------------------------------------------------------------------------
// 3b. Source maps — QS8-24, criterium 2
// ---------------------------------------------------------------------------

/**
 * ⚠️ **Vastgepind, en bewust géén devDependency.** Dit gereedschap wordt door
 *    precies één script gebruikt, op één machine, af en toe. In `package.json`
 *    zetten zou betekenen dat élke `npm ci` — ook elke CI-run die niets
 *    deployt — een platformbinary downloadt. `npx` met een exacte versie is
 *    reproduceerbaar en kost de rest van het project niets.
 */
const SENTRY_CLI = '@sentry/cli@3.6.2';

/**
 * De naam waaronder deze build zich bij Sentry meldt.
 *
 * ⚠️ **Moet letterlijk gelijk zijn aan wat de app meestuurt.** Die bouwt hem in
 *    `src/lib/observability/release.ts`; hier staat de tweede helft, want een
 *    `.mjs`-script kan die TypeScript niet importeren. Lopen ze uiteen, dan
 *    hangen de maps aan een release die geen enkele gebeurtenis draagt: alles
 *    lijkt te werken en geen stack wordt leesbaar.
 *
 *    `tests/scripts/release-naam.test.ts` roept beide aan en vergelijkt de
 *    uitkomst. Dat is de naadtest die deze duplicatie draaglijk maakt.
 */
export function releaseVoor(versie) {
  if (typeof versie !== 'string') return undefined;

  const schoon = versie.trim();
  return schoon === '' ? undefined : `goalbuddies@${schoon}`;
}

/** Leest de versie uit `app.json` en maakt er de releasenaam van. */
function releaseNaam() {
  let versie;
  try {
    versie = JSON.parse(readFileSync('app.json', 'utf8'))?.expo?.version;
  } catch {
    versie = undefined;
  }

  const naam = releaseVoor(versie);
  if (naam === undefined) {
    fail(
      'app.json heeft geen bruikbare `expo.version`.',
      'De source maps hebben een release nodig om aan te hangen, en de app stuurt dezelfde naam mee.',
    );
  }

  return naam;
}

/** Wat er nodig is om te uploaden. Zonder deze drie slaat de stap zichzelf over. */
export const SENTRY_VARS = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];

/**
 * Welke van de drie ontbreken. Leeg betekent: uploaden kan.
 *
 * ⚠️ Puur, zodat de test hem elke combinatie kan voeren. De overslaan-stap moet
 *    namelijk precies zeggen wát er mist — "Sentry niet geconfigureerd" laat je
 *    zoeken naar welke van de drie het was.
 */
export function ontbrekendeSentryVars(omgeving) {
  return SENTRY_VARS.filter((naam) => (omgeving[naam] ?? '').trim() === '');
}

/**
 * Haalt de verwijzing naar de source map uit een gebouwd bestand.
 *
 * ⚠️ **De map zelf gaat weg, dus de verwijzing ook.** Blijft hij staan, dan
 *    vraagt elke browser met de devtools open een bestand op dat er niet is —
 *    een 404 per paginabezoek, en een lezer die denkt dat de deploy stuk is.
 *
 * ⚠️ Alleen de `//# sourceMappingURL=`-regel aan het eind, en niets anders.
 *    Verder in een geminificeerde bundel snijden is vragen om moeilijkheden.
 */
export function stripSourceMapVerwijzing(inhoud) {
  return inhoud.replace(/\n?\/\/[#@]\s*sourceMappingURL=[^\n]*/g, '');
}

/**
 * Stuurt de source maps naar Sentry, of slaat zichzelf over met uitleg.
 *
 * ⚠️ **Overslaan is een uitkomst en geen fout.** Zonder token kan niemand
 *    uploaden, en een deploy laten falen omdat de foutrapportage niet compleet
 *    is, zou de app onbereikbaar maken om een leesbaarheidsprobleem. Zelfde
 *    keuze als `meldEdgeFout()` zonder DSN.
 *
 * ⚠️ **`inject` vóór `upload`, en dat is geen volgorde die je mag omdraaien.**
 *    `inject` schrijft debug-id's in de bundel én in de map; daarop koppelt
 *    Sentry ze aan elkaar. Upload je zonder inject, dan komen de maps aan en
 *    matcht er niets — het stille geval waar dit project vandaag genoeg van
 *    gezien heeft.
 */
function stuurSourceMapsNaarSentry(release) {
  const ontbreekt = ontbrekendeSentryVars(process.env);

  if (ontbreekt.length > 0) {
    console.log(`    Overgeslagen: ${ontbreekt.join(', ')} ${ontbreekt.length === 1 ? 'ontbreekt' : 'ontbreken'}.`);
    console.log('    De maps worden hierna gewoon verwijderd; de bundel gaat schoon de deur uit.');
    console.log('    Zie docs/DEPLOY.md voor het aanzetten.');
    return false;
  }

  for (const argumenten of [
    ['sourcemaps', 'inject', DIST],
    ['sourcemaps', 'upload', DIST, '--release', release],
  ]) {
    const uit = spawnSync('npx', ['--yes', SENTRY_CLI, ...argumenten], {
      stdio: 'inherit',
      shell: true,
    });

    if (uit.status !== 0) {
      // ⚠️ Niet fataal. Zie de kop: de app moet live kunnen, ook als Sentry
      //    hapert. Wel luid, want stil mislukken is hier het ergste.
      console.error(`\n  ! sentry-cli ${argumenten.join(' ')} faalde. De deploy gaat door.`);
      console.error('    De maps zijn niet geüpload; stacks blijven onleesbaar tot dit lukt.\n');
      return false;
    }
  }

  return true;
}

/**
 * Haalt elke source map uit de bundel en controleert dat er geen achterblijft.
 *
 * ⚠️ **Dit is de veiligheidsstap van deze hele feature, en hij is niet
 *    overslaanbaar.** Een `.map` naast een publieke bundel geeft iedereen je
 *    volledige broncode — inclusief commentaar. Hij hoort naar Sentry en nooit
 *    naar de webserver.
 *
 * ⚠️ De controle achteraf staat er omdat verwijderen kán mislukken (een
 *    vergrendeld bestand, een pad dat de glob niet zag). Bij twijfel stopt de
 *    deploy: liever niet live dan met je bron erbij.
 */
export function verwijderSourceMaps(map) {
  const bestanden = alleBestanden(map);
  let verwijderd = 0;

  for (const pad of bestanden) {
    if (pad.endsWith('.map')) {
      // ⚠️ In een `try`: een verwijdering die mislukt mag de deploy niet laten
      //    crashen maar moet door de controle hieronder gevonden worden. Anders
      //    is de foutmelding een stacktrace in plaats van "je bron staat er nog".
      try {
        rmSync(pad, { force: true });
        verwijderd += 1;
      } catch {
        // Blijft staan; `achtergeblevenMaps()` ziet hem zo meteen.
      }
      continue;
    }

    if (!pad.endsWith('.js') && !pad.endsWith('.css')) continue;

    try {
      const inhoud = readFileSync(pad, 'utf8');
      const schoon = stripSourceMapVerwijzing(inhoud);
      if (schoon !== inhoud) writeFileSync(pad, schoon);
    } catch {
      continue; // Binair of onleesbaar; dan staat er geen verwijzing in.
    }
  }

  // ⚠️ Opnieuw kijken en niet aannemen dat het verwijderen lukte. Een
  //    vergrendeld bestand of een pad dat de eerste ronde niet zag, is precies
  //    het geval waarin je je bron publiceert terwijl het script zegt dat het
  //    goed ging.
  return { verwijderd, achtergebleven: achtergeblevenMaps(alleBestanden(map)) };
}

/**
 * Welke source maps er nog in een bundel staan.
 *
 * ⚠️ **Losgetrokken omdat de rest niet te voeden is.** Een verwijdering laten
 *    mislukken vraagt een bestandssysteem dat weigert, en dat is in een
 *    testomgeving die als root draait niet na te bootsen. Deze functie is wél te
 *    voeden, en hij draagt de beslissing die telt: staat hier iets in, dan gaat
 *    de bundel niet de deur uit.
 */
export function achtergeblevenMaps(bestanden) {
  return bestanden.filter((pad) => pad.endsWith('.map'));
}

/**
 * Voert het verwijderen uit en breekt de deploy af als er iets achterblijft.
 *
 * ⚠️ Losgetrokken van `verwijderSourceMaps()` zodat die laatste getoetst kan
 *    worden. Een functie die `process.exit()` aanroept is niet te voeden, en een
 *    veiligheidsstap die je niet kunt ijken is er geen — dat is dezelfde regel
 *    die dit project vandaag twee keer heeft moeten leren.
 */
function eisEenSchoneBundel() {
  const { verwijderd, achtergebleven } = verwijderSourceMaps(DIST);

  if (achtergebleven.length > 0) {
    console.error('\n  ✗ ER STAAN NOG SOURCE MAPS IN DE BUNDEL — er is niets geüpload.\n');
    for (const pad of achtergebleven) console.error(`    ${pad}`);
    console.error(
      '\n    Een source map naast een publieke bundel geeft iedereen je volledige\n' +
        '    broncode. Los dit op voordat je opnieuw deployt.\n',
    );
    process.exit(1);
  }

  console.log(`    ${verwijderd} source maps uit de bundel gehaald; er staat er geen meer in.`);
}

// ---------------------------------------------------------------------------
// 4. Inpakken en uploaden
// ---------------------------------------------------------------------------

function pakIn() {
  const map = mkdtempSync(join(tmpdir(), 'goalbuddies-deploy-'));
  const archief = join(map, 'goalbuddies.zip');

  // ⚠️ PowerShell en niet `zip`: die staat niet op deze machine. `Compress-Archive`
  //    hoort bij Windows zelf, dus er komt geen dependency bij (CLAUDE.md).
  //
  // ⚠️ `dist/*` en niet `dist`, want anders zit de map zelf in het archief en
  //    komt de site één niveau te diep te staan.
  const uit = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${process.cwd()}\\${DIST}\\*' -DestinationPath '${archief}' -Force`,
    ],
    { encoding: 'utf8' },
  );

  if (uit.status !== 0) fail(`Inpakken mislukte: ${uit.stderr || uit.stdout}`);
  if (!existsSync(archief)) fail('Inpakken leverde geen archief op.');

  const mb = (statSync(archief).size / 1024 / 1024).toFixed(2);
  console.log(`    ${archief} — ${mb} MB`);

  return archief;
}

async function upload(archief, token) {
  const url = `https://developers.hostinger.com/api/hosting/v1/websites/${GEBRUIKER}/${encodeURIComponent(DOMEIN)}/upload-url`;

  const sleutels = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!sleutels.ok) {
    fail(`Upload-URL opvragen mislukte: HTTP ${sleutels.status} ${await sleutels.text()}`);
  }

  const { url: basis, auth_key: auth, rest_auth_key: rest } = await sleutels.json();
  const bytes = readFileSync(archief);
  const doel = `${basis}/goalbuddies.zip?override=true`;

  const koppen = {
    'X-Auth': auth,
    'X-Auth-Rest': rest,
    'Tus-Resumable': '1.0.0',
  };

  const aangemaakt = await fetch(doel, {
    method: 'POST',
    headers: { ...koppen, 'Upload-Length': String(bytes.length), 'Upload-Offset': '0' },
  });

  if (aangemaakt.status !== 201) {
    fail(`Upload aanmaken mislukte: HTTP ${aangemaakt.status} ${await aangemaakt.text()}`);
  }

  const geschreven = await fetch(doel, {
    method: 'PATCH',
    headers: {
      ...koppen,
      'Content-Type': 'application/offset+octet-stream',
      'Upload-Offset': '0',
    },
    body: bytes,
  });

  if (geschreven.status !== 204) {
    fail(`Uploaden mislukte: HTTP ${geschreven.status} ${await geschreven.text()}`);
  }

  console.log(`    ${(bytes.length / 1024 / 1024).toFixed(2)} MB geüpload.`);
}

async function zetLive(token) {
  const url = `https://developers.hostinger.com/api/hosting/v1/websites/${GEBRUIKER}/${encodeURIComponent(DOMEIN)}/static-deploy`;

  const antwoord = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ archive_path: 'goalbuddies.zip' }),
  });

  if (!antwoord.ok) {
    fail(`Live zetten mislukte: HTTP ${antwoord.status} ${await antwoord.text()}`);
  }

  console.log(`    ${await antwoord.text()}`);
}

// ---------------------------------------------------------------------------

async function main() {
  // ⚠️ `--droog` doet alles behalve uploaden: bouwen, de routing schrijven en de
  //    bundel op geheimen controleren. Bedoeld om vóór een release te kunnen zien
  //    wát er zou vertrekken zonder iets live te zetten — en het is de stand
  //    waarin dit script draait zonder API-token.
  const droog = process.argv.includes('--droog');

  const token = (process.env.HOSTINGER_API_TOKEN ?? '').trim();
  if (!token && !droog) {
    fail(
      'HOSTINGER_API_TOKEN ontbreekt.',
      'Maak er een in hpanel → Account → API en zet hem in .env. ⚠️ Dit token mag NOOIT in de bundel: het begint niet met EXPO_PUBLIC_, dus de scan hieronder slaat erop aan als het er ooit in belandt. Alleen kijken wat er zou vertrekken? `npm run deploy:droog`.',
    );
  }

  stap('Env controleren');
  controleerEnv();

  // ⚠️ `--geen-build` gebruikt `dist/` zoals het er staat. Twee redenen om te
  //    bestaan: opnieuw scannen zonder een minuut te wachten, en — de echte —
  //    kunnen bewijzen dát de secret-scan afgaat. Een controle die nog nooit
  //    rood is geweest, is een aanname en geen controle.
  if (process.argv.includes('--geen-build')) {
    stap('Bouwen overgeslagen (--geen-build)');
  } else {
    // ⚠️ **Mét source maps, altijd — ook zonder Sentry-token.** `expo export`
    //    maakt ze standaard niet; `npm run build` doet dat dus ook niet, en dat
    //    blijft zo voor gewone builds. Hier zijn ze nodig, en hierna worden ze
    //    zonder uitzondering uit de bundel gehaald. Altijd hetzelfde bouwen
    //    scheelt een deploy die zich anders gedraagt naargelang je `.env`.
    stap('Bouwen (met source maps)');
    const bouw = spawnSync(
      'npx',
      ['expo', 'export', '--platform', 'web', '--source-maps', 'external'],
      { stdio: 'inherit', shell: true },
    );
    if (bouw.status !== 0) fail('De build faalde. Er is niets geüpload.');
  }

  if (!existsSync(DIST)) fail(`\`${DIST}\` bestaat niet na de build.`);

  stap('SPA-routing schrijven');
  schrijfHtaccess();

  stap('Bundel controleren op geheimen');
  scanOpGeheimen(alleBestanden(DIST));

  // ⚠️ **Ná de secret-scan, met opzet.** `SENTRY_AUTH_TOKEN` begint niet met
  //    `EXPO_PUBLIC_`, dus de scan slaat erop aan als hij ooit in de bundel
  //    belandt. Die volgorde omdraaien zou betekenen dat we uploaden vóórdat we
  //    weten of de bundel schoon is.
  stap('Source maps naar Sentry');
  stuurSourceMapsNaarSentry(releaseNaam());

  // ⚠️ **Onvoorwaardelijk, ook als het uploaden overgeslagen of mislukt is.**
  //    Een `.map` naast een publieke bundel geeft iedereen je volledige
  //    broncode. Dit is de enige stap hier die de deploy afbreekt.
  stap('Source maps uit de bundel halen');
  eisEenSchoneBundel();

  stap('Inpakken');
  const archief = pakIn();

  if (droog) {
    console.log(`\n  ✓ Droge run: de bundel is schoon en ingepakt (${archief}).`);
    console.log('    Er is niets geüpload en niets live gezet.\n');
    return;
  }

  stap(`Uploaden naar ${DOMEIN}`);
  await upload(archief, token);

  stap('Live zetten');
  await zetLive(token);

  stap('De PWA-paden natrekken');
  await controleerPwa();

  console.log(`\n  ✓ https://${DOMEIN} is bijgewerkt.\n`);
}

/**
 * Vraagt `/manifest.json` en `/sw.js` op en toetst status én content-type.
 *
 * ⚠️ **Dit is het antwoord op de vraag uit de bevinding van 23-08**: hoort een
 *    deploy die twee paden op te vragen? Ja. Een servicewormer die 404 geeft of
 *    met het verkeerde content-type komt, maakt niets zichtbaars stuk — behalve
 *    de meldingen, en dat merk je pas als iemand klaagt dat hij niets krijgt.
 *
 * ⚠️ **Na het live zetten en niet ervoor**, en met een eigen exitcode. De bundel
 *    staat er dan al; falen betekent hier "ga kijken", niet "de upload is
 *    mislukt". Een netwerkhapering hoort een goede deploy niet ongedaan te
 *    maken, maar hij hoort ook niet stil voorbij te gaan.
 *
 * ⚠️ Het oordeel zelf staat in `pwa-controle.mjs` en is daar geijkt met
 *    verzonnen antwoorden — inclusief de 200-met-het-verkeerde-type. Deze
 *    functie doet alleen het ophalen.
 */
async function controleerPwa() {
  const antwoorden = [];

  for (const { pad } of VERPLICHTE_PADEN) {
    try {
      const antwoord = await fetch(`https://${DOMEIN}${pad}`, { redirect: 'follow' });
      antwoorden.push({
        pad,
        status: antwoord.status,
        contentType: antwoord.headers.get('content-type'),
      });
    } catch (fout) {
      antwoorden.push({ pad, status: 0, contentType: null, fout: String(fout) });
    }
  }

  const fouten = beoordeelAntwoorden(antwoorden);
  if (fouten.length === 0) {
    console.log('    /manifest.json en /sw.js geven 200 met het juiste content-type.');
    return;
  }

  console.error('\n  ✗ De bundel staat live, maar de PWA-paden kloppen niet:');
  for (const fout of fouten) console.error(`      ${fout}`);
  console.error(
    '\n    Zie docs/DEPLOY.md §3. Er gaat hierdoor niets zichtbaars stuk —\n' +
      '    alleen de meldingen werken niet, en dat merk je pas als iemand klaagt.\n',
  );
  process.exit(1);
}

// ⚠️ Alleen draaien als dit script zélf aangeroepen wordt. Zonder deze grens
//    start een `import` van dit bestand de hele deploy — en dan kan geen enkele
//    test een van zijn functies voeden. Zie `tests/scripts/deploy-htaccess.test.ts`.
if (import.meta.url === `file://${process.argv[1]}`) await main();
