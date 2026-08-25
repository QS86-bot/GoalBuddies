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
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
</IfModule>
`;

  writeFileSync(join(DIST, '.htaccess'), inhoud, 'utf8');
  console.log(`    .htaccess geschreven, met ${regels.length} regels voor dynamische routes.`);
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
    stap('Bouwen');
    const bouw = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
    if (bouw.status !== 0) fail('De build faalde. Er is niets geüpload.');
  }

  if (!existsSync(DIST)) fail(`\`${DIST}\` bestaat niet na de build.`);

  stap('SPA-routing schrijven');
  schrijfHtaccess();

  stap('Bundel controleren op geheimen');
  scanOpGeheimen(alleBestanden(DIST));

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

await main();
