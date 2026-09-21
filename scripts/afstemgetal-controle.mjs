#!/usr/bin/env node
/**
 * afstemgetal-controle — een getal dat de database bezit, mag geen kopie in de
 * app krijgen.
 *
 * ⚠️ **Drie migraties leggen dit met zoveel woorden vast, en niets bewaakte het.**
 *    0039 over `weekpas_maximum()`: *"Een functie en geen constante in twee
 *    talen. De app leest dit getal via `weekpas_stand()` en houdt er dus geen
 *    eigen kopie van. Twee kopieën die gelijk moeten blijven zijn in deze
 *    codebase één keer geruisloos uit elkaar gelopen."* 0046 en 0182 zeggen
 *    hetzelfde over `bedenktijd()` en het AI-voorschot.
 *
 * ⚠️ **Waarom dat een grendel verdient (QS8-204).** Deze getallen zijn stuk voor
 *    stuk beredeneerde gokken zonder gebruikersdata — de weekpasvoorraad staat op
 *    2 "omdat hoger de pas waardeloos maakt en lager hem tot een fooi maakt".
 *    Zulke getallen zijn *bedoeld* om herzien te worden zodra er data is, en de
 *    hele reden dat ze geparkeerd kunnen worden is dat herzien **één regel SQL**
 *    is en geen release. Glipt er een kopie in TypeScript bij, dan is die
 *    aanname stil onwaar geworden en is het parkeren achteraf onterecht geweest.
 *
 * ⚠️ **Op de naam en niet op het getal, en dat is geen luiheid.** Zoeken naar de
 *    waarde `2` in `src/` levert honderden treffers en leert je de controle te
 *    negeren; de belofte gaat bovendien niet over een waarde maar over een
 *    begríp. Een constante die dit begrip benoemt, is een tweede bron — ook als
 *    hij vandaag toevallig hetzelfde getal draagt. Juist dán.
 *
 * ⚠️ **Tweezijdig, zoals `zichtbaarheid-controle` en `aansluiting-controle`.**
 *    Verdwijnt de functie uit de migraties, dan wordt deze controle daar óók rood
 *    van: een register dat een functie noemt die niet bestaat, is een lijst die
 *    liegt.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORTEL = process.cwd();
const MAPPEN = ['src', 'app', join('supabase', 'functions')];

/**
 * De getallen die de database bezit.
 *
 * ⚠️ Een reden en geen vinkje. Wie hier een naam neerzet zonder op te schrijven
 *    wát er stukgaat bij een tweede bron, heeft de controle beantwoord in plaats
 *    van de vraag.
 */
export const REGISTER = Object.freeze([
  {
    functie: 'weekpas_maximum',
    patroon: 'weekpas[a-z_]*max|max[a-z_]*weekpas',
    reden:
      'De voorraad staat op 2 als beredeneerde gok zonder gebruikersdata (QS8-204). ' +
      'Dat is te parkeren omdat herzien één regel SQL is; met een kopie in de app ' +
      'kost het een release, en dan is het parkeren achteraf onterecht geweest.',
  },
  {
    functie: 'bedenktijd',
    patroon: 'bedenktijd',
    reden:
      'Het venster waarin een per ongeluk aangemaakt doel nog weg mag (0046). Loopt ' +
      'een kopie voor, dan biedt het scherm een knop aan die de database weigert; ' +
      'loopt hij achter, dan verbergt het scherm een recht dat de gebruiker heeft.',
  },
  {
    functie: 'ai_job_voorschot_cent',
    patroon: 'voorschot',
    reden:
      'Het voorschot per AI-job in dollarcent (0182). Het dagbudget is ervan afgeleid, ' +
      'dus een tweede bron laat de poort en de melding uiteenlopen over hoeveel een ' +
      'gebruiker vandaag nog mag.',
  },
  {
    functie: 'ai_dag_budget_cent',
    patroon: 'dag[a-z_]*budget|budget[a-z_]*dag',
    reden:
      'Afgeleid uit ai_dag_limiet() × ai_job_voorschot_cent(), met zoveel woorden zo ' +
      'gebouwd "zodat het getal 10 op één plek blijft staan" (0182). Een eigen ' +
      'constante in de app maakt precies die afleiding ongedaan.',
  },
]);

/** Alle bestanden onder `map` met een van deze extensies. */
function bestanden(map, exts) {
  let uit = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit = uit.concat(bestanden(pad, exts));
    else if (exts.some((e) => naam.endsWith(e))) uit.push(pad);
  }
  return uit;
}

/**
 * De constantedeclaraties in `bron` die `patroon` benoemen, met regelnummer.
 *
 * ⚠️ Alleen een **declaratie**: een zin in commentaar die het begrip noemt is
 *    geen tweede bron, en een controle die daarop aanslaat leer je uitzetten.
 */
export function kopieenIn(bron, patroon) {
  const uit = [];
  const zoeker = new RegExp(`^\\s*(?:export\\s+)?const\\s+([A-Za-z_$][\\w$]*)\\s*[:=]`, 'u');
  const begrip = new RegExp(patroon, 'iu');

  bron.split('\n').forEach((regel, i) => {
    const m = zoeker.exec(regel);
    if (m !== null && begrip.test(m[1])) uit.push({ regel: i + 1, naam: m[1] });
  });
  return uit;
}

/** De functienamen die de migratiemap definieert. */
export function gedefinieerdeFuncties(migratiebronnen) {
  const uit = new Set();
  for (const bron of migratiebronnen) {
    const zoeker = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/giu;
    let m = zoeker.exec(bron);
    while (m !== null) {
      uit.add(m[1]);
      m = zoeker.exec(bron);
    }
  }
  return uit;
}

/** Elk bestand dat een tweede bron zou kunnen dragen. */
function teLezenBestanden() {
  const uit = [];
  for (const map of MAPPEN) {
    for (const pad of bestanden(join(WORTEL, map), ['.ts', '.tsx'])) {
      if (!pad.endsWith('.test.ts') && !pad.endsWith('.test.tsx')) uit.push(pad);
    }
  }
  return uit;
}

/**
 * De meldingen voor één bestand.
 *
 * ⚠️ Apart van `hoofd()` om de nesting onder de drie te houden — coderegel 15,
 *    en `max-depth` in `eslint.config.js` dwingt hem af. Vier lussen in elkaar
 *    was de eerste vorm, en die kwam de linter niet door.
 */
function tweedeBronnenIn(pad) {
  const bron = readFileSync(pad, 'utf8');
  const kort = pad.replace(WORTEL, '').replace(/\\/gu, '/');

  return REGISTER.flatMap((rij) =>
    kopieenIn(bron, rij.patroon).map(
      ({ regel, naam }) =>
        `  - ${kort}:${regel} — \`${naam}\` is een tweede bron naast ` +
        `\`${rij.functie}()\`.\n      ${rij.reden}`,
    ),
  );
}

function hoofd() {
  const migraties = join(WORTEL, 'supabase', 'migrations');
  const bronnen = readdirSync(migraties)
    .filter((n) => n.endsWith('.sql'))
    .map((n) => readFileSync(join(migraties, n), 'utf8'));
  const bekend = gedefinieerdeFuncties(bronnen);

  const fouten = [];

  for (const rij of REGISTER) {
    if (!bekend.has(rij.functie)) {
      fouten.push(
        `  - het register noemt \`${rij.functie}()\`, en die functie staat niet in de ` +
          'migratiemap. Is hij hernoemd of weggehaald, werk dan dit register bij — ' +
          'een lijst die een functie noemt die niet bestaat, liegt.',
      );
    }
  }

  for (const pad of teLezenBestanden()) {
    fouten.push(...tweedeBronnenIn(pad));
  }

  if (fouten.length > 0) {
    console.error('afstemgetal-controle: een getal van de database heeft een kopie in de app.\n');
    console.error(fouten.join('\n'));
    console.error(
      '\nLees het getal uit de database in plaats van het over te typen. Twee kopieën\n' +
        'die gelijk moeten blijven zijn in deze codebase al een keer geruisloos uit\n' +
        'elkaar gelopen — zie valkuil 18 en de koppen van 0039, 0046 en 0182.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `afstemgetal-controle: ${REGISTER.length} getal(len) staan alleen in de database, ` +
      'zonder kopie in src/, app/ of de Edge Functions.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
