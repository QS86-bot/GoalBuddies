#!/usr/bin/env node
/**
 * Een migratie hernummeren, inclusief élke verwijzing — QS8-241.
 *
 * ⚠️ **Waarom dit bestaat, en waarom het níét over detectie gaat.** Op 31-08-2026
 *    botste het nummer van één branch drie keer op één dag. Dat is geen defect:
 *    een branch die uren openstaat wordt ingehaald, en `migratie-nieuw.mjs`
 *    schrijft in zijn eigen kop al op dat een nummer pas van jou is als je landt.
 *    `migraties:controle` ziet de botsing ook — met de hand gemeten, exitcode 1,
 *    beide bestandsnamen bij naam.
 *
 *    **Het gat zit in de repáratie.** Hernummeren is `git mv` plus elke
 *    verwijzing, en die staan op vier soorten plekken: de kopregel, de rest van
 *    het bestand, code-commentaar elders, en de documenten.
 *
 * ⚠️ **De fout die dit script bestaat om te voorkomen.** De reparatie van 31-08
 *    was:
 *
 *      sed -i 's/\b0134\b/0136/g' supabase/migrations/0136_….sql
 *
 *    Die laat de kopregel **stil staan**, want `_` is in GNU sed een woordteken:
 *    in `0134_een_plan` staat geen woordgrens achter de `4`. Het bestand heette
 *    daarna `0136_…` terwijl zijn eerste regel `0134_…` zei. Gevonden met het oog
 *    in een grep — en de kop is juist de regel die een lezer als eerste gelooft.
 *
 *    Vandaar `verwijzingsPatroon()` hieronder: dat staat een `_` uitdrukkelijk
 *    toe waar `\b` hem afwijst.
 *
 * ⚠️ **`kopNummer()` wordt óók door `migraties:controle` gebruikt, en dat is de
 *    kern van het ontwerp.** Zou de controle zijn eigen opvatting hebben van
 *    "wat zegt de kop", dan kunnen de herschrijver en de bewaker het oneens
 *    worden — en dan bewaakt de tweede iets anders dan de eerste schrijft. Dat
 *    is de twee-lijsten-fout uit 0032/0034. Eén definitie, twee aanroepers.
 *
 * Gebruik:
 *   npm run migratie:hernummer -- 0134 0136
 *   npm run migratie:hernummer -- 0134 0136 --droog     # laat zien, doe niets
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { nummersPerBranch } from './migratiebranches.mjs';
import { beoordeelOmgeving } from './migratieregister-omgeving.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = join(WORTEL, 'supabase', 'migrations');

/** Waar een verwijzing kan staan. `supabase/` zit erbij voor de migraties zelf. */
const DOORZOEKEN = ['src', 'app', 'scripts', 'tests', 'docs', 'supabase'];
const EXTENSIES = ['.ts', '.tsx', '.mjs', '.js', '.sql', '.md', '.json'];

/**
 * ⚠️ **Dit is de regel waar het vandaag op misging.**
 *
 *   - vóór het nummer: geen cijfer of letter, zodat `20134` niet meetelt;
 *   - ná het nummer: geen cijfer en geen kléine letter. Een `_` mág dus wél, en
 *     dát is het verschil met `\b`. Een `a` mag níét, want `0039a` is een eigen
 *     deelmigratie en geen verwijzing naar `0039`.
 */
function verwijzingsPatroon(nummer) {
  return new RegExp(`(?<![0-9a-zA-Z])${nummer}(?![0-9a-z])`, 'g');
}

/** `0134_een_plan_uit_een_zin.sql` → `0134_een_plan_uit_een_zin` */
export function basisUit(bestandsnaam) {
  const m = /^(\d{4}[a-z]?_[a-z0-9_]+)\.sql$/.exec(bestandsnaam);
  return m === null ? null : m[1];
}

/**
 * Het nummer dat de **kop** van zichzelf beweert.
 *
 * ⚠️ **Het nummer en niet de slug, en dat is een ijking en geen versoepeling.**
 *    De eerste versie hiervan eiste de volledige vorm `NNNN_naam.sql`, en die
 *    meldde **vijftien gezonde bestanden**. Er zijn namelijk twee kopstijlen in
 *    deze repo, allebei legitiem:
 *
 *      -- 0139_de_week_startdag_verzet_de_lopende_week_mee.sql — …   (het sjabloon)
 *      -- 0062 — Web push: de twee sleutels van een PushSubscription  (ouder)
 *
 *    Een controle die vijftien correcte bestanden meldt, leer je uitzetten —
 *    CLAUDE.md zegt dat met zoveel woorden. **En de belofte gaat ook niet over
 *    de slug**: de fout van 31-08 was een kop die `0134` zei in een bestand dat
 *    `0136` heette. Het nummer is wat liegt na een hernummering.
 *
 * ⚠️ **Het hele kopblok en niet alleen regel één**, want sommige migraties
 *    openen met een scheidingslijn (`-- ----`) en noemen zichzelf op regel twee.
 *    Het eerste nummer dat in het blok staat, is het nummer van het bestand;
 *    verwijzingen naar ándere migraties komen verderop in de prozatekst.
 */
export function kopNummer(inhoud) {
  const regels = (inhoud ?? '').split('\n');

  for (const regel of regels) {
    if (regel.trim() === '') continue;
    if (!regel.trimStart().startsWith('--')) break;

    const m = /(?<![0-9a-zA-Z])(\d{4})(?![0-9])/.exec(regel);
    if (m !== null) return m[1];
  }

  return null;
}

/**
 * Zegt de kop van dit bestand zijn eigen nummer?
 *
 * ⚠️ **Gebruikt door `migraties:controle`.** Zie de kop van dit bestand voor
 *    waarom die niet zijn eigen versie hiervan heeft.
 */
export function kopKlopt(bestandsnaam, inhoud) {
  const basis = basisUit(bestandsnaam);
  // Geen leesbare bestandsnaam is een andere fout, en die meldt stap 1 al.
  if (basis === null) return true;

  const kop = kopNummer(inhoud);
  if (kop === null) return false;

  return kop === basis.slice(0, 4);
}

/**
 * Herschrijft de kop naar het nieuwe nummer, in béíde stijlen.
 *
 * ⚠️ De volledige vorm eerst: staat er `0134_naam.sql`, dan moet de hele slug
 *    mee en niet alleen het getal. Staat er alleen `-- 0134 — titel`, dan is het
 *    getal alles wat er is.
 */
export function herschrijfKop(inhoud, nieuweBasis) {
  const regels = (inhoud ?? '').split('\n');
  const naar = nieuweBasis.slice(0, 4);

  for (let i = 0; i < regels.length; i += 1) {
    const regel = regels[i];
    if (regel.trim() === '') continue;
    if (!regel.trimStart().startsWith('--')) break;

    if (/\d{4}[a-z]?_[a-z0-9_]+\.sql/.test(regel)) {
      regels[i] = regel.replace(/\d{4}[a-z]?_[a-z0-9_]+\.sql/, `${nieuweBasis}.sql`);
      return regels.join('\n');
    }

    if (/(?<![0-9a-zA-Z])\d{4}(?![0-9])/.test(regel)) {
      regels[i] = regel.replace(/(?<![0-9a-zA-Z])\d{4}(?![0-9])/, naar);
      return regels.join('\n');
    }
  }

  return inhoud;
}

/**
 * Vervangt elke verwijzing naar `van` door `naar`, en zegt hoeveel.
 *
 * ⚠️ **Wat dit níét kan, en waarom het script alles afdrukt.** Een kaal `0134`
 *    in proza dat géén migratie bedoelt, is van een verwijzing niet te
 *    onderscheiden — er staat geen merkteken omheen. Wat wél helpt: migraties
 *    zijn altijd vier cijfers met voorloopnullen, en jaartallen en puntenaantallen
 *    zijn dat niet. De rest vangt de mens op, en daarom drukt de CLI elke
 *    vervanging af met bestand en regelnummer. Een stille vervanging in een
 *    beslisdocument is een geschiedvervalsing.
 */
export function vervangIn(tekst, van, naar) {
  const patroon = verwijzingsPatroon(van);
  let treffers = 0;
  const uit = (tekst ?? '').replace(patroon, () => {
    treffers += 1;
    return naar;
  });
  return { tekst: uit, treffers };
}

/**
 * Mag deze hernummering?
 *
 * @param aanwezig  de nummers die lokaal in de map staan (strings van 4 cijfers)
 * @param perBranch `{ branch: hoogsteNummer }` uit `migratiebranches.mjs`
 * @param register  de versies op productie, of `null` als dat ongemeten is
 */
export function beoordeelHernummering({ van, naar, aanwezig, perBranch, register }) {
  if (!/^\d{4}$/.test(van ?? '') || !/^\d{4}$/.test(naar ?? '')) {
    return { ok: false, reden: 'vorm', uitleg: 'Beide nummers zijn vier cijfers, zoals 0134.' };
  }

  if (van === naar) {
    return { ok: false, reden: 'gelijk', uitleg: 'Van en naar zijn hetzelfde nummer.' };
  }

  if (!aanwezig.includes(van)) {
    return { ok: false, reden: 'bron_ontbreekt', uitleg: `Er staat geen migratie ${van} in de map.` };
  }

  if (aanwezig.includes(naar)) {
    return {
      ok: false,
      reden: 'doel_bezet',
      uitleg: `${naar} staat al in deze map. Kies een vrij nummer.`,
    };
  }

  // ⚠️ Dezelfde bron als `migratie:nieuw`, en om dezelfde reden: een nummer dat
  //    elders al vergeven is, botst opnieuw zodra die branch landt.
  const bezet = Object.entries(perBranch ?? {})
    .filter(([, hoogste]) => Number(naar) <= (hoogste ?? 0))
    .map(([branch]) => branch);

  if (bezet.length > 0) {
    return {
      ok: false,
      reden: 'doel_bezet_elders',
      uitleg:
        `${naar} ligt niet boven wat deze branches al dragen: ${bezet.join(', ')}. ` +
        'Dat botst opnieuw zodra die landen.',
    };
  }

  // ⚠️ **De enige toets die schade voorkomt in plaats van gedoe.** Staat de
  //    migratie al op productie, dan is `git mv` de verkeerde reparatie: je houdt
  //    een map over die niet meer opbouwt wat het register zegt, en dan toetst de
  //    RLS-suite elders een ánder schema dan productie. Dat is QS8-122 en QS8-237.
  if (register === null) {
    return {
      ok: false,
      reden: 'register_ongemeten',
      uitleg:
        'Het migratieregister is niet te lezen zonder EXPO_PUBLIC_SUPABASE_URL en\n' +
        '  SUPABASE_SERVICE_ROLE_KEY. Ongemeten is hier niet hetzelfde als veilig:\n' +
        '  staat deze migratie al op productie, dan is hernummeren de verkeerde\n' +
        '  reparatie. Draai met credentials, of bevestig met --register-ongemeten.',
    };
  }

  if (register.includes(van)) {
    return {
      ok: false,
      reden: 'bron_toegepast',
      uitleg:
        `${van} staat in het register op productie. Hernummeren maakt de map dan\n` +
        '  onverenigbaar met wat er draait. Wat hier moet is een ingreep in het\n' +
        '  register (docs/DEPLOY.md §2.2), niet een hernoeming.',
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Vanaf hier: de CLI
// ---------------------------------------------------------------------------

function bestandenOnder(map) {
  const uit = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      if (naam === 'node_modules' || naam === '.git' || naam === 'dist') continue;
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (EXTENSIES.some((e) => naam.endsWith(e))) uit.push(vol);
    }
  };
  try {
    loop(map);
  } catch {
    // Een map die niet bestaat is geen fout; niet elk project heeft ze alle zes.
  }
  return uit;
}

async function leesRegister() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (beoordeelOmgeving({ url, sleutel, streng: false }) !== 'draaien') return null;

  try {
    const antwoord = await fetch(`${url}/rest/v1/rpc/migratieregister`, {
      method: 'POST',
      headers: {
        apikey: sleutel,
        Authorization: `Bearer ${sleutel}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    });
    if (!antwoord.ok) return null;
    const rijen = await antwoord.json();
    return (rijen ?? []).map((r) => String(r.version ?? r.versie ?? ''));
  } catch {
    return null;
  }
}

async function hoofd() {
  const argumenten = process.argv.slice(2);
  const droog = argumenten.includes('--droog');
  const negeerRegister = argumenten.includes('--register-ongemeten');
  const [van, naar] = argumenten.filter((a) => !a.startsWith('--'));

  if (van === undefined || naar === undefined) {
    console.error('Gebruik: npm run migratie:hernummer -- <van> <naar> [--droog]');
    process.exit(1);
  }

  const bestanden = readdirSync(MAP).filter((n) => n.endsWith('.sql'));
  const aanwezig = [...new Set(bestanden.map((n) => n.slice(0, 4)))];
  const register = negeerRegister ? [] : await leesRegister();

  const oordeel = beoordeelHernummering({
    van,
    naar,
    aanwezig,
    perBranch: nummersPerBranch(),
    register,
  });

  if (!oordeel.ok) {
    console.error(`✗ ${van} → ${naar} kan niet: ${oordeel.reden}\n  ${oordeel.uitleg}`);
    process.exit(1);
  }

  const oud = bestanden.find((n) => n.startsWith(`${van}_`));
  const oudeBasis = basisUit(oud);
  const nieuweBasis = `${naar}${oudeBasis.slice(4)}`;

  console.log(`${oudeBasis}.sql → ${nieuweBasis}.sql\n`);

  // 1. Het bestand zelf: de kop expliciet, de rest via het patroon.
  const oudPad = join(MAP, oud);
  const inhoud = readFileSync(oudPad, 'utf8');
  const metKop = herschrijfKop(inhoud, nieuweBasis);
  const { tekst: nieuweInhoud, treffers } = vervangIn(metKop, van, naar);

  console.log(`  ${relative(WORTEL, oudPad)}`);
  console.log(`    kopregel herschreven naar ${nieuweBasis}.sql`);
  console.log(`    ${treffers} verwijzing(en) in het bestand`);

  // 2. Elke andere plek.
  const elders = [];
  for (const map of DOORZOEKEN) {
    for (const pad of bestandenOnder(join(WORTEL, map))) {
      if (pad === oudPad) continue;
      const tekst = readFileSync(pad, 'utf8');
      const uit = vervangIn(tekst, van, naar);
      if (uit.treffers === 0) continue;

      const regels = tekst.split('\n');
      const nummers = regels
        .map((r, i) => (verwijzingsPatroon(van).test(r) ? i + 1 : 0))
        .filter((n) => n > 0);

      elders.push({ pad, inhoud: uit.tekst, treffers: uit.treffers, regels: nummers });
    }
  }

  for (const e of elders) {
    console.log(`  ${relative(WORTEL, e.pad)}`);
    console.log(`    ${e.treffers} verwijzing(en), regel ${e.regels.join(', ')}`);
  }

  if (droog) {
    console.log('\n(droog — er is niets gewijzigd)');
    return;
  }

  writeFileSync(oudPad, nieuweInhoud);
  execFileSync('git', ['mv', oudPad, join(MAP, `${nieuweBasis}.sql`)], { cwd: WORTEL });
  for (const e of elders) writeFileSync(e.pad, e.inhoud);

  console.log(`\n✓ hernummerd. Draai \`npm run poort\` voordat je pusht.`);
}

// ⚠️ Alleen draaien als script, niet bij het importeren vanuit een test.
//
// ⚠️ `pathToFileURL()` en niet `fileURLToPath()`, en dat is geen smaak: op
//    Windows levert de omgekeerde vergelijking een pad met backslashes tegenover
//    een `file:///C:/…`-URL, en dan is de guard altijd onwaar en draait het
//    script nooit. `tests/scripts/padvormen.test.ts` bewaakt dat — en ving deze
//    versie ook daadwerkelijk.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd().catch((fout) => {
    console.error(fout.message);
    process.exit(1);
  });
}
