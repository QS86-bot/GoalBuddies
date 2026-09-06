/**
 * `deno check` en `deno lint` over `supabase/functions/`, lokaal — QS8-214.
 *
 * ⚠️ **Waarom dit bestaat.** CI draait `deno check supabase/functions/`, en op
 *    een werkplek kán dat niet: de functies importeren
 *    `jsr:@supabase/supabase-js@2`, en `jsr.io` en `npm.jsr.io` geven hier 403.
 *    Het gevolg was dat de enige plek waar deze code getypecheckt werd, CI was —
 *    en dat kostte bij de eerste twee rondes vier fouten, waarvan er één
 *    (`db` in plaats van `alsSysteem` in de doelcoach) élke AI-job stil liet
 *    omvallen met HTTP 200 erop.
 *
 * ⚠️ **De omweg was al bekend en stond als commentaar in de workflow: het
 *    jsr-pakket is dezelfde broncode als het npm-pakket, en `registry.npmjs.org`
 *    is wél bereikbaar.** Dat was precies het probleem — het was een handeling
 *    die je moest onthouden en die niets kapotmaakte als je hem oversloeg.
 *    Dezelfde vorm als het migratieregister vóór QS8-122. Hier wordt hij, net
 *    als toen, een commando.
 *
 * ⚠️ **De kopie is verbatim op één specifier na, en dat is de hele
 *    correctheidsvraag van dit script.** Wordt er méér herschreven dan die ene
 *    regel, dan typecheckt dit iets anders dan wat er gepusht wordt en is groen
 *    hier geen uitspraak over daar. Vandaar `herschrijf()` als losse, geëxporteerde
 *    functie met een eigen test die hem élke vorm aanbiedt — de vormen die hij
 *    moet raken én de vormen die hij met rust moet laten.
 *
 * ⚠️ **Nul treffers is rood en niet groen.** Verdwijnt de jsr-specifier ooit uit
 *    de bron, dan is de aanname onder dit script weg en checkt het iets waar het
 *    niets over beweert. Dat is het scenario waarin een controle stil ophoudt te
 *    bewaken — en daar is dit project al een paar keer op gaan zitten.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** De wortel van de repo, zelfde vorm als in de andere controlescripts. */
export const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** De map die CI ook meegeeft aan `deno check`. */
export const FUNCTIEMAP = 'supabase/functions';

/**
 * De specifier die hier niet op te halen is, en waar hij naartoe moet.
 *
 * ⚠️ Op de **volledige specifier inclusief versie** en niet op de scope alleen:
 *    `jsr:@supabase/supabase-js@2` en `npm:@supabase/supabase-js@2` moeten
 *    dezelfde broncode zijn, en dat is precies wat het versienummer vastlegt.
 *    Een herschrijving die de versie laat vallen, checkt een ander pakket.
 */
const JSR = /\bjsr:@supabase\/supabase-js@(\d[\w.-]*)/g;

/**
 * Herschrijft de jsr-specifier naar zijn npm-tweelingbroer.
 *
 * @param {string} bron
 * @returns {{ tekst: string, treffers: number }}
 */
export function herschrijf(bron) {
  let treffers = 0;
  const tekst = bron.replace(JSR, (_heel, versie) => {
    treffers += 1;
    return `npm:@supabase/supabase-js@${versie}`;
  });
  return { tekst, treffers };
}

/**
 * Zet een pad uit de werkkopie terug naar het pad in de repo.
 *
 * ⚠️ Zonder dit wijst elke fout naar `/tmp/...`, en dan moet de lezer zelf
 *    vertalen naar het bestand dat hij open heeft staan. Een foutmelding die je
 *    eerst moet decoderen, leest niemand twee keer.
 *
 * @param {string} regel
 * @param {string} werkmap
 */
export function naarRepoPad(regel, werkmap) {
  return regel
    .split(pathToFileURL(werkmap).href)
    .join(FUNCTIEMAP)
    .split(werkmap)
    .join(FUNCTIEMAP);
}

/**
 * Zoekt de Deno-binary.
 *
 * ⚠️ **`node_modules/.bin` vóór `PATH`**, zodat de versie uit `package.json`
 *    wint van wat er toevallig op de machine staat. Een controle die per
 *    werkplek een andere compiler gebruikt, meet per werkplek iets anders.
 */
export function zoekDeno(wortel = WORTEL, omgeving = process.env) {
  if (omgeving.DENO_BIN) return omgeving.DENO_BIN;

  const lokaal = join(wortel, 'node_modules', '.bin', 'deno');
  if (existsSync(lokaal)) return lokaal;

  // ⚠️ **De meegegeven omgeving en niet `process.env`.** Zonder dit zoekt
  //    `spawnSync` langs de PATH van het proces, en dan is de parameter een
  //    leugen: een test die "er is geen Deno" nabootst, vindt er tóch een en
  //    wordt groen zonder iets te bewijzen. Die test heeft dit gevonden.
  const uit = spawnSync('deno', ['--version'], { encoding: 'utf8', env: omgeving });
  return uit.error || uit.status !== 0 ? null : 'deno';
}

function draai(deno, argumenten, werkmap) {
  const uit = spawnSync(deno, argumenten, {
    encoding: 'utf8',
    // ⚠️ Dezelfde vlag als CI. Zonder hem loopt Deno omhoog, vindt de
    //    `package.json` van de app, en gaat de hele Node-dependencyboom
    //    installeren om drie Edge Functions te typechecken.
    env: { ...process.env, DENO_NO_PACKAGE_JSON: '1' },
  });
  const tekst = `${uit.stdout ?? ''}${uit.stderr ?? ''}`;
  return { code: uit.status ?? 1, tekst: naarRepoPad(tekst, werkmap) };
}

export function controleer(wortel = WORTEL) {
  const deno = zoekDeno(wortel);
  if (deno === null) {
    return {
      soort: /** @type {const} */ ('overgeslagen'),
      melding:
        'geen Deno gevonden. `npm ci` haalt hem binnen; anders `DENO_BIN=/pad/naar/deno`. ' +
        'Zonder Deno is deze controle niet groen maar ongemeten.',
    };
  }

  const bronmap = join(wortel, FUNCTIEMAP);
  const werkmap = mkdtempSync(join(tmpdir(), 'goalbuddies-edge-'));

  try {
    cpSync(bronmap, werkmap, { recursive: true });

    let treffers = 0;
    for (const pad of bestandenIn(werkmap)) {
      const { tekst, treffers: n } = herschrijf(readFileSync(pad, 'utf8'));
      if (n > 0) writeFileSync(pad, tekst);
      treffers += n;
    }

    if (treffers === 0) {
      return {
        soort: /** @type {const} */ ('rood'),
        melding:
          `Geen enkele jsr-specifier gevonden in ${FUNCTIEMAP}. Dit script bestaat om die ` +
          'ene regel te herschrijven; is hij weg, dan checkt het iets waar het niets over ' +
          'belooft. Werk de specifier in dit script bij, of haal het script weg.',
      };
    }

    const check = draai(deno, ['check', werkmap], werkmap);
    const lint = draai(deno, ['lint', werkmap], werkmap);

    if (check.code !== 0 || lint.code !== 0) {
      return {
        soort: /** @type {const} */ ('rood'),
        melding: [check.code !== 0 ? check.tekst : '', lint.code !== 0 ? lint.tekst : '']
          .filter((t) => t.trim().length > 0)
          .join('\n'),
      };
    }

    return {
      soort: /** @type {const} */ ('groen'),
      melding: `${treffers} specifier(s) herschreven; deno check en deno lint groen.`,
    };
  } finally {
    rmSync(werkmap, { recursive: true, force: true });
  }
}

/** Alle `.ts`-bestanden onder een map. */
function bestandenIn(map) {
  const uit = spawnSync('find', [map, '-name', '*.ts', '-type', 'f'], { encoding: 'utf8' });
  return (uit.stdout ?? '')
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

// ⚠️ De URL-vergelijking en niet `resolve()`, want dat is de vorm die
//    `tests/scripts/padvormen.test.ts` eist — een padvergelijking op strings
//    valt op Windows uit elkaar. Die grendel heeft deze regel gevonden.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uitkomst = controleer();

  if (uitkomst.soort === 'overgeslagen') {
    // ⚠️ Naar stderr en met dit woord, want op stdout leest "overgeslagen" als
    //    "gelukt". `npm run poort` herkent deze regelvorm en telt de stap als
    //    ongemeten in plaats van groen.
    console.error(`⚠ edge-typecheck: OVERGESLAGEN — ${uitkomst.melding}`);
    process.exit(0);
  }

  if (uitkomst.soort === 'rood') {
    console.error(`✗ edge-typecheck\n\n${uitkomst.melding}`);
    process.exit(1);
  }

  console.log(`edge-typecheck: ${uitkomst.melding}`);
}
