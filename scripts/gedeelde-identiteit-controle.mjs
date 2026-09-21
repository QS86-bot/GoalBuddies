#!/usr/bin/env node
/**
 * gedeelde-identiteit-controle — geen vaste uuid in een fixture die geschreven
 * wordt (QS8-336).
 *
 * ⚠️ **Waarom dit een controle is en geen opgeruimde regel.** 📏 De dossierrij
 *    van QS8-329 noemde drie bestanden. Nagemeten met een scan zijn het er
 *    **dertien met een uuid-literal, waarvan acht die hem ook echt in de
 *    database schrijven** — precies de vorm van QS8-206 (twee `console.error`
 *    bleken er elf) en QS8-315 (twee `meld()` bleken er drie). Niemand was
 *    slordig; er kwam code bij en niets bewaakte de regel.
 *
 * ⚠️ **Wat er precies fout aan is.** Draaien er twee suites tegen dezelfde
 *    lokale stack — sinds er parallel gewerkt wordt de gewone toestand — dan
 *    dragen ze allebei dezelfde uuid. Dat is dan geen identiteit meer maar een
 *    gedeelde sleutel: de één ruimt de rij van de ánder op, en de fout landt in
 *    een derde bestand.
 *
 * ⚠️ **Hij meldt níét élke uuid-literal.** Een id dat alleen gebruikt wordt om
 *    te toetsen dát iets niet bestaat, botst met niemand: er wordt nooit een rij
 *    mee geschreven. Die staan in het register hieronder, elk met een reden. Een
 *    controle die alles meldt, leert je hem te negeren — zelfde stelregel als
 *    bij `logboek-controle` en `persoon-in-jsonb-controle`.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    ijken, kun je niet vertrouwen (CLAUDE.md regel 18).
 *    `tests/scripts/gedeelde-identiteit-controle.test.ts` biedt hem elke vorm los
 *    aan — de vormen die hij moet vinden én de vormen die hij met rust moet
 *    laten.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

export const UUID = /'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'/g;

/**
 * Een uuid die in stukjes wordt samengesteld.
 *
 * ⚠️ **Deze regel bestaat omdat de eerste versie hem miste, en dat is gemeten.**
 *    `reactiepaginering.test.ts` droeg vier gedeelde id's; de literalscan vond er
 *    **één**, want de andere drie stonden als
 *    ``` `aaaaaaaa-0000-0000-0000-00000000000${i}` ```. Een uuid die door een
 *    lus in elkaar wordt gezet is net zo goed een gedeelde sleutel als een uuid
 *    die er letterlijk staat — hij ziet er alleen niet zo uit.
 *
 * ⚠️ Zelfde vorm als QS8-206 en QS8-315: tel opnieuw, met een instrument, en de
 *    lijst is langer dan de eerste telling.
 */
export const UUID_SAMENGESTELD = /`[0-9a-fA-F]{4,}-[0-9a-fA-F-]{8,}\$\{[^}]*\}[0-9a-fA-F]*`/g;

/**
 * De literals die géén gedeelde identiteit zijn, met de reden erbij.
 *
 * ⚠️ **Op waarde en niet op bestand.** Een uitzondering per bestand zou het hele
 *    bestand vrijstellen, ook voor de uuid die er morgen bijkomt. Dit register
 *    noemt de wáárde, dus een nieuwe literal in hetzelfde bestand valt gewoon op.
 */
export const GEEN_GEDEELDE_IDENTITEIT = {
  '00000000-0000-0000-0000-000000000000': 'de nul-uuid: het bewijs dát iets niet bestaat, nooit geschreven',
  '00000000-0000-4000-8000-000000000000': 'idem, in v4-vorm (`NERGENS` in aftasten.test.ts)',
  '00000000-0000-0000-0000-0000000000ff': 'doel van een update die geweigerd hoort te worden; er ontstaat geen rij',
  '3f1a7c9e-1b2d-4e5f-8a9b-0c1d2e3f4a5b': 'het subject in een JWT-testvector; raakt de database niet',
  '00000000-0000-4000-8000-00000000dead':
    'een mens die niet bestaat, doorgegeven aan `vereiste_goedkeuringen()` om te tonen dat het ' +
    'antwoord niet meer van de persoon afhangt (QS8-181); er wordt geen rij mee geschreven',
};

/**
 * De bron zonder commentaar.
 *
 * ⚠️ **Een uuid in commentaar schrijft niets.** Zonder deze stap meldt de
 *    controle zijn eigen uitleg: `proefid.ts` citeert de foutmelding waar dit
 *    issue mee begon, met de botsende uuid erin. Een controle die de
 *    documentatie over zichzelf rood maakt, leer je uitzetten.
 *
 * ⚠️ Bewust grof: regelcommentaar en blokcommentaar eruit, verder niets. Een
 *    uuid in een string die tóevallig `//` bevat is geen vorm die hier voorkomt,
 *    en een echte parser is voor deze vraag meer machinerie dan hij waard is.
 */
export function zonderCommentaar(bron) {
  // ⚠️ Vervangen door evenveel regeleindes en niet door niets: anders schuiven
  //    alle regelnummers op en wijst de melding naar de verkeerde regel. Dat is
  //    de eerste versie van deze functie geweest, en hij meldde `regel 14` voor
  //    iets dat op 44 stond.
  const evenveelRegels = (treffer) => '\n'.repeat((treffer.match(/\n/g) ?? []).length);

  return bron.replace(/\/\*[\s\S]*?\*\//g, evenveelRegels).replace(/^\s*\/\/.*$/gm, '');
}

/** Elke `.ts` onder `tests/rls/`. */
export function testbestanden(map = join(WORTEL, 'tests', 'rls')) {
  return readdirSync(map)
    .filter((naam) => naam.endsWith('.ts'))
    .map((naam) => join(map, naam));
}

/**
 * De gedeelde identiteiten in één bestand.
 *
 * ⚠️ Geeft regelnummers terug en niet alleen een telling: een melding zonder
 *    plek is een melding die je overslaat.
 */
export function gedeeldeIdentiteiten(bron, bestandsnaam = '') {
  const gevonden = [];

  zonderCommentaar(bron)
    .split('\n')
    .forEach((regel, index) => {
      for (const treffer of regel.match(UUID) ?? []) {
        const waarde = treffer.slice(1, -1).toLowerCase();
        if (waarde in GEEN_GEDEELDE_IDENTITEIT) continue;

        gevonden.push({ bestand: bestandsnaam, regel: index + 1, waarde });
      }

      for (const treffer of regel.match(UUID_SAMENGESTELD) ?? []) {
        gevonden.push({ bestand: bestandsnaam, regel: index + 1, waarde: treffer });
      }
    });

  return gevonden;
}

/** Klopt het register nog met wat de bestanden doen? */
export function registervormKlachten(register) {
  const klachten = [];

  for (const [waarde, reden] of Object.entries(register)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(waarde)) {
      klachten.push(`${waarde} is geen uuid in kleine letters`);
    }
    if (typeof reden !== 'string' || reden.trim().length < 20) {
      klachten.push(`${waarde} heeft geen bruikbare reden`);
    }
  }

  return klachten;
}

function draai() {
  const klachten = registervormKlachten(GEEN_GEDEELDE_IDENTITEIT);
  if (klachten.length > 0) {
    console.error('gedeelde-identiteit-controle: het register deugt niet.\n');
    for (const k of klachten) console.error(`  - ${k}`);
    process.exitCode = 1;
    return;
  }

  const gevonden = [];
  for (const pad of testbestanden()) {
    gevonden.push(...gedeeldeIdentiteiten(readFileSync(pad, 'utf8'), relative(WORTEL, pad)));
  }

  if (gevonden.length === 0) {
    console.log(
      'gedeelde-identiteit-controle: geen enkele fixture draagt een vaste uuid die ' +
        'tussen twee runs kan botsen.',
    );
    return;
  }

  console.error(
    `gedeelde-identiteit-controle: ${gevonden.length} vaste uuid(s) in een fixture.\n`,
  );
  for (const t of gevonden) console.error(`  - ${t.bestand}:${t.regel} — ${t.waarde}`);
  console.error(
    [
      '',
      'Draaien er twee suites tegen dezelfde lokale stack, dan dragen ze allebei',
      'deze uuid en ruimt de één de rij van de ánder op. Gebruik `proefId(n)` uit',
      '`tests/rls/proefid.ts`: die staat vast binnen dit bestand, houdt de volgorde',
      'aan het volgnummer, en botst tussen runs nooit.',
      '',
      '⚠️ Wordt er met deze uuid nooit een rij geschreven — een id dat alleen',
      '   bewijst dát iets niet bestaat — zet hem dan in GEEN_GEDEELDE_IDENTITEIT',
      '   mét reden. Op waarde, niet op bestand.',
    ].join('\n'),
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) draai();
