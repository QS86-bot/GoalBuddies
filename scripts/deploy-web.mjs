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
import { pathToFileURL } from 'node:url';

import { config } from 'dotenv';

import {
  bestandenMetSleutel,
  oordeel,
  sleutelUit,
  standaardDsnUit,
} from './dsn-controle.mjs';
import { beoordeelAntwoorden, VERPLICHTE_PADEN } from './pwa-controle.mjs';

config({ path: '.env', quiet: true });

const DOMEIN = 'goalbuddies.q-projects.tech';
const GEBRUIKER = 'u349450154';
const DIST = 'dist';
/** Waar de standaard-DSN vandaan komt — één waarheid, zie `standaardDsnUit()`. */
const BRON_MET_DSN = join('src', 'lib', 'env.ts');

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
 * Welke geheimen dit project kent, uit `.env.example` — QS8-242.
 *
 * ⚠️ **Afgeleid en niet met de hand bijgehouden.** Een tweede lijst in dit
 *    script zou onvermijdelijk gaan afwijken van `.env.example`, en dan bewaakt
 *    de controle iets anders dan het project heeft. Dat is de fout van 0032/0034,
 *    waar een test de app-lijst met zichzelf vergeleek.
 *
 * ⚠️ `EXPO_PUBLIC_*` valt eruit: die zijn per definitie publiek en horen in de
 *    bundel te staan.
 *
 * @param {string | undefined} voorbeeld
 * @returns {string[]}
 */
export function bewaakteNamen(voorbeeld) {
  return leesEnv(voorbeeld).namen.filter((n) => !n.startsWith('EXPO_PUBLIC_'));
}

/**
 * De namen in een env-bestand, én de regels die de parser niet kan lezen.
 *
 * ⚠️ **Een onleesbare regel is een aanwijzing en geen ruis, en dat is de kern van
 *    dit issue.** Op 31-08 stond er in `.env` een regel die letterlijk
 *    `Google OAuth secret=…` heette: spaties, kleine letters. Die kwam niet door
 *    `[A-Z0-9_]+` heen, stond dus niet in de namenlijst, en de waarde is nooit
 *    met de bundel vergeleken. De scan meldde geen fout — hij meldde dat er
 *    niets te controleren viel.
 *
 *    Diezelfde spaties lieten `source .env` struikelen. Het bestand vertelde dus
 *    wél dat er iets mis was, alleen tegen de mens en niet tegen de controle.
 *
 * @param {string | undefined} tekst
 * @returns {{namen: string[], onleesbaar: {nummer: number, regel: string}[]}}
 */
export function leesEnv(tekst) {
  const namen = [];
  const onleesbaar = [];

  String(tekst ?? '')
    .split(/\r?\n/)
    .forEach((regel, i) => {
      const kaal = regel.trim();
      if (kaal === '' || kaal.startsWith('#')) return;

      const goed = /^\s*([A-Z0-9_]+)\s*=/.exec(regel);
      if (goed) {
        namen.push(goed[1] ?? '');
        return;
      }
      // Wél een toewijzing, maar niet in een vorm die de controle kent.
      if (kaal.includes('=')) onleesbaar.push({ nummer: i + 1, regel: kaal.split('=')[0] ?? '' });
    });

  return { namen, onleesbaar };
}

/**
 * Welke waarden er in de bundel gezocht worden, en wat er met opzet afvalt.
 *
 * ⚠️ **Twee bronnen, en dat is blinde vlek 2 van QS8-242.** De oude versie
 *    filterde op `naam in leesEnvNamen()`, dus een geheim dat via de omgeving
 *    binnenkomt — een `export` in een shell, of de secrets van een CI-runner —
 *    kwam er niet doorheen, ook al stond de waarde gewoon in `process.env`.
 *    Nu telt een naam mee als hij in `.env` staat **of** in `.env.example`.
 *
 * ⚠️ **Niet de hele omgeving.** Alles uit `process.env` pakken lijkt veiliger en
 *    is het niet: op een runner staan daar honderden variabelen, en `PWD` of
 *    `PATH` komen zó in een bronverwijzing terecht. Een controle die altijd
 *    afgaat, wordt uitgezet.
 *
 * ⚠️ **Korte waarden vallen af, en die val is echt.** `TZ=UTC` zit in élke
 *    bundel en zou de deploy voorgoed blokkeren op een vals alarm.
 *
 * @param {{omgeving: Record<string, string | undefined>,
 *          envTekst?: string | undefined,
 *          voorbeeldTekst?: string | undefined,
 *          minimaleLengte?: number | undefined}} invoer
 */
export function teControleren({ omgeving, envTekst, voorbeeldTekst, minimaleLengte = 12 }) {
  const uitEnv = leesEnv(envTekst).namen;
  const uitVoorbeeld = bewaakteNamen(voorbeeldTekst);
  const bekend = new Set([...uitEnv, ...uitVoorbeeld]);

  const geheimen = [];
  const overgeslagen = [];

  for (const naam of [...bekend].sort()) {
    const waarde = (omgeving[naam] ?? '').trim();

    if (naam.startsWith('EXPO_PUBLIC_')) {
      overgeslagen.push({ naam, reden: 'publiek' });
      continue;
    }
    if (waarde === '') {
      overgeslagen.push({ naam, reden: 'niet gezet' });
      continue;
    }
    if (waarde.length < minimaleLengte) {
      overgeslagen.push({ naam, reden: `korter dan ${minimaleLengte} tekens` });
      continue;
    }
    geheimen.push({ naam, waarde });
  }

  return { geheimen, overgeslagen };
}

/**
 * Welke geheimen in welke bestanden staan.
 *
 * `inhoud` is een `Map` van pad naar tekst, zodat dit los te voeden is — het
 * lezen van schijf hoort niet in de beslissing.
 *
 * @param {{naam: string, waarde: string}[]} geheimen
 * @param {Map<string, string>} inhoud
 */
export function treffersIn(geheimen, inhoud) {
  const uit = [];
  for (const [pad, tekst] of inhoud) {
    for (const { naam, waarde } of geheimen) {
      if (tekst.includes(waarde)) uit.push({ naam, pad });
    }
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
 * ⚠️ **"Nul gecontroleerd" is sinds QS8-242 een andere uitkomst dan "schoon".**
 *    De oude versie printte *"Geen te controleren geheimen in .env gevonden"* en
 *    liet de deploy doorlopen. Dat is exact de val die `docs/DEPLOY.md` elders
 *    zelf benoemt bij `functies:controle`: ongemeten ziet er hetzelfde uit als
 *    groen, en wie naar de exitcode kijkt telt het als bewijs.
 */
function scanOpGeheimen(bestanden) {
  const envTekst = existsSync('.env') ? readFileSync('.env', 'utf8') : undefined;
  const voorbeeldTekst = existsSync('.env.example')
    ? readFileSync('.env.example', 'utf8')
    : undefined;

  const { onleesbaar } = leesEnv(envTekst);
  const { geheimen, overgeslagen } = teControleren({
    omgeving: process.env,
    envTekst,
    voorbeeldTekst,
  });

  // ⚠️ Blinde vlek 1: een regel die de parser niet kan lezen, bestaat niet voor
  //    de controle. Melden en niet overslaan.
  if (onleesbaar.length > 0) {
    console.error('\n  ✗ .env heeft regels die deze controle niet kan lezen:\n');
    for (const { nummer, regel } of onleesbaar) {
      console.error(`    regel ${nummer}: ${regel.slice(0, 40)}…`);
    }
    console.error(
      '\n    Een naam met spaties of kleine letters valt buiten de scan, en dat is\n' +
        '    niet aan de uitvoer te zien. Gebruik SCREAMING_SNAKE_CASE.\n',
    );
    process.exit(1);
  }

  if (geheimen.length === 0) {
    console.error('\n  ✗ NUL geheimen gecontroleerd — dat is niet hetzelfde als schoon.\n');
    console.error(`    ${overgeslagen.length} naam/namen bekend, geen enkele met een waarde`);
    console.error('    van voldoende lengte. Zonder .env is deze deploy ongemeten.\n');
    process.exit(1);
  }

  const inhoud = new Map();
  for (const pad of bestanden) {
    try {
      inhoud.set(pad, readFileSync(pad, 'utf8'));
    } catch {
      // Binair bestand (een plaatje, een lettertype). Slaat niets over dat tekst is.
    }
  }

  const gevonden = treffersIn(geheimen, inhoud);

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

  console.log(
    `    ${geheimen.length} geheimen gecontroleerd in ${inhoud.size} bestanden, ` +
      `geen ervan staat in de bundel.`,
  );
  console.log(`    ${overgeslagen.length} naam/namen overgeslagen (publiek, leeg of te kort).`);
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

/**
 * Eist dat de Sentry-DSN daadwerkelijk in de gebouwde bundel staat.
 *
 * ⚠️ **Dit is de eerste van de vier schakels tussen een fout in de app en een
 *    regel in Sentry**, en tot 30-08-2026 was hij nooit gemeten. Er was in vier
 *    dagen geen enkele gebeurtenis uit de app aangekomen en niemand kon zien
 *    waar het spaak liep. Deze stap maakt dat zichtbaar op het moment dat het
 *    nog gratis is: de bundel ligt er, er is nog niets geüpload.
 *
 * ⚠️ **Alleen "wél een DSN, niet in de bundel" breekt af.** Dat is het geval
 *    waarin je dénkt dat je bewaakt wordt — dezelfde vorm als `setErrorSink()`
 *    dat nergens werd aangeroepen. Geen DSN is een keuze en mag door, want een
 *    app onbereikbaar maken om een leesbaarheidsprobleem is de verkeerde ruil;
 *    zie `stuurSourceMapsNaarSentry()`, dat om dezelfde reden overslaat.
 *
 * ⚠️ Draait óók in `--droog`, met opzet: anders is de enige manier om hem te
 *    zien draaien een echte deploy, en dat is precies wat een controle
 *    onijkbaar maakt.
 */
function eisDeDsnInDeBundel() {
  // ⚠️ Dezelfde volgorde als `clientEnv()`: een expliciet gezette waarde wint,
  //    ook als hij leeg is (dat betekent "uit"). Alleen als hij níét gezet is,
  //    telt de standaard uit de bron.
  const standaard = standaardDsnUit(readFileSync(BRON_MET_DSN, 'utf8'));
  if (standaard === null) {
    fail(
      `Kon STANDAARD_SENTRY_DSN niet vinden in ${BRON_MET_DSN}.`,
      'Is de constante hernoemd? Werk `standaardDsnUit()` in scripts/dsn-controle.mjs bij — deze controle meet anders niets.',
    );
  }
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? standaard;
  const sleutel = sleutelUit(dsn);
  const bestanden = alleBestanden(DIST)
    .filter((pad) => pad.endsWith('.js') || pad.endsWith('.html'))
    .map((pad) => ({ pad, inhoud: leesOfLeeg(pad) }));

  const gevonden = bestandenMetSleutel(sleutel, bestanden);
  const uitkomst = oordeel({ dsn, gevonden });

  if (uitkomst === 'aanwezig') {
    console.log(`    De DSN staat in ${gevonden.length} bestand(en); de app kan melden.`);
    return;
  }

  if (uitkomst === 'uit') {
    console.log('    Geen DSN geconfigureerd — deze bundel meldt geen fouten.');
    console.log('    Dat mag, maar je hoort er niets van als er iets omvalt.');
    return;
  }

  console.error('\n  ✗ DE BUNDEL MELDT GEEN FOUTEN, TERWIJL ER EEN DSN IS.\n');
  if (uitkomst === 'onbruikbaar') {
    console.error('    EXPO_PUBLIC_SENTRY_DSN is gezet maar er is geen sleutel uit te halen.');
    console.error('    Verwacht: https://<sleutel>@<host>/<project-id>\n');
  } else {
    console.error(`    De sleutel ${sleutel} komt in geen enkel bestand in ${DIST}/ voor.`);
    console.error('    De DSN is dus niet in de build beland — controleer of `.env` gelezen');
    console.error('    is vóór `expo export`, en niet pas daarna gewijzigd.\n');
  }
  console.error('    Dit is het geval waarin je dénkt dat je bewaakt wordt. Er gaat');
  console.error('    daarom niets de deur uit.\n');
  process.exit(1);
}

/** Leest een bestand, of geeft een lege string als dat niet lukt (binair). */
function leesOfLeeg(pad) {
  try {
    return readFileSync(pad, 'utf8');
  } catch {
    return '';
  }
}

  stap('De DSN in de bundel natrekken');
  eisDeDsnInDeBundel();

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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
