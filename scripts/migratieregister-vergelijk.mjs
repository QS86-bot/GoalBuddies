/**
 * De vergelijking achter `migratieregister-controle` — QS8-122.
 *
 * ⚠️ **Waarom dit een eigen bestand is en niet drie lussen in het script.** Een
 *    controle die alleen tegen het échte project kan draaien, is een controle
 *    die je nooit rood ziet worden — en CLAUDE.md is daar stellig over: een
 *    controle die nog nooit rood is geweest, is een aanname. Zo staat de
 *    vergelijking los van de verbinding en toetst `tests/scripts/migratieregister.test.ts`
 *    élk faalgeval met de hand.
 *
 *    ⚠️ Die naam stond hier tot 17-09-2026 als `migratieregister-vergelijk.test.ts`,
 *    en zo heet dat bestand niet. `padverwijzing:controle` zag het niet: hij
 *    leest repo-**paden** en een kale bestandsnaam zonder `/` is er geen. Dat is
 *    de restklasse die QS8-412 zelf benoemt — hij vindt dát een grendel er niet
 *    is, alleen niet in deze vorm.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {{ versie: string, naam: string, bestand?: string }} Migratie
 */

/**
 * De migraties zoals ze in de repo staan: `0057_commitments_afwikkelen.sql`.
 *
 * ⚠️ **Dit stond tot 11-09-2026 in `migratieregister-controle.mjs` zelf**
 *    (QS8-426). Het staat hier omdat er sindsdien een tweede lezer is: de
 *    RLS-suite toetst of de **testdatabase** op hetzelfde niveau staat als deze
 *    map. Twee lezers van dezelfde map die elk hun eigen `readdirSync` doen,
 *    zijn twee plekken waar de vorm van een bestandsnaam vastligt — en de
 *    letterversies (`0039a`) zijn precies de vorm die je in de tweede kopie
 *    vergeet.
 *
 * @param {string} wortel De repo-wortel.
 * @returns {Migratie[]}
 */
export function migratiesInMap(wortel) {
  return readdirSync(join(wortel, 'supabase', 'migrations'))
    .filter((naam) => naam.endsWith('.sql'))
    .map((naam) => {
      const stam = naam.slice(0, -4);
      const scheiding = stam.indexOf('_');
      return { versie: stam.slice(0, scheiding), naam: stam.slice(scheiding + 1), bestand: naam };
    })
    .sort((a, b) => a.versie.localeCompare(b.versie));
}

/** Eén nummering: vier cijfers, eventueel met een letter erachter (`0052a`). */
const GENUMMERD = /^\d{4}[a-z]?$/;

/**
 * Wat er niet klopt tussen de repo en het project. Lege lijst is goed nieuws.
 *
 * @param {readonly Migratie[]} repo
 * @param {readonly Migratie[]} project
 * @returns {string[]}
 */
export function vergelijk(repo, project) {
  const inRepo = new Map(repo.map((m) => [m.versie, m]));
  const inProject = new Map(project.map((m) => [m.versie, m]));

  const klachten = [];

  for (const m of repo) {
    if (!inProject.has(m.versie)) {
      klachten.push(
        `${m.bestand ?? m.versie} staat in de repo maar is niet toegepast op het project`,
      );
    }
  }

  // ⚠️ Dít is het geval dat een schema elders onherbouwbaar maakt, en het is
  //    twee keer bij toeval gevonden vóór QS8-122: `0036`, `0037` en later
  //    `0057` t/m `0061` waren toegepast zonder dat er een bestand van bestond.
  for (const m of project) {
    if (!inRepo.has(m.versie)) {
      klachten.push(
        `versie ${m.versie} (${m.naam}) is toegepast op het project maar heeft geen ` +
          'bestand in de repo — dít is het geval dat een schema elders onherbouwbaar maakt',
      );
    }
  }

  // ⚠️ De naam telt mee: twee migraties met hetzelfde nummer en een andere
  //    inhoud is de stille variant van hetzelfde probleem.
  for (const m of repo) {
    const daar = inProject.get(m.versie);
    if (daar && daar.naam !== m.naam) {
      klachten.push(`versie ${m.versie} heet hier "${m.naam}" en daar "${daar.naam}"`);
    }
  }

  // ⚠️ Eén nummering, de kern van QS8-122. Een tijdstempel in het register
  //    betekent dat er een migratie is toegepast buiten de werkwijze om — de
  //    MCP-tool kiest zelf een tijdstempel, ongeacht hoe het bestand heet.
  for (const m of project) {
    if (!GENUMMERD.test(m.versie)) {
      klachten.push(
        `versie ${m.versie} (${m.naam}) is een tijdstempel en geen nummer — toegepast ` +
          'buiten de werkwijze om; lijn hem uit zoals docs/DEPLOY.md beschrijft',
      );
    }
  }

  return klachten;
}

/**
 * De meting als gegeven — de vorm die `supabase/uitgerold.json` draagt.
 *
 * ⚠️⚠️ **Waarom dit hier staat en niet in `migratieregister-controle.mjs`.** Daar
 *    zou het alleen draaien mét de productiesleutel, en dus nooit in de poort en
 *    nooit in CI. Dit is de **naad** tussen twee onderdelen die elk apart
 *    kloppen: dit script schrijft het bestand en `uitrolstand-controle.mjs` leest
 *    het. Schrijft de een een vorm die de ander afkeurt, dan valt dat om op het
 *    slechtst denkbare moment — midden in een uitrol, ná `supabase db push`.
 *    `tests/scripts/migratieregister.test.ts` legt de uitvoer hiervan daarom
 *    rechtstreeks aan `beoordeel()` voor. Onwrikbare regel 18, vraag 1.
 *
 * ⚠️ `hoogste` is de laatste van de gesorteerde versies en niet `length`: de
 *    letterversies (`0039a`) maken die twee ongelijk, en juist op dat onderscheid
 *    leunt de controle die dit bestand leest.
 *
 * @param {readonly Migratie[]} project Het register zoals het project het geeft.
 * @param {string} projectRef De projectverwijzing, voor wie het nameet.
 * @param {string} gemeten ISO-datum; meegegeven en niet zelf bepaald, anders is
 *   de uitvoer van deze functie niet vast te leggen in een test.
 * @returns {{ $toelichting: string, project: string, hoogste: string, registerrijen: number, gemeten: string, bron: string }}
 */
export function standUitRegister(project, projectRef, gemeten) {
  const versies = project.map((m) => m.versie).sort();
  return {
    $toelichting:
      'De migratiestand van het productieproject, geschreven door `npm run ' +
      'register:controle` (dat is de kant die de service-role-key heeft). Met de hand ' +
      'bijwerken mag, maar dan meet je het ook echt — zie ' +
      'docs/decisions/2026-09-17-de-uitrolstand-is-een-gegeven-en-geen-alinea.md.',
    project: projectRef,
    hoogste: versies[versies.length - 1],
    registerrijen: versies.length,
    gemeten,
    bron: 'migratieregister() via npm run register:controle',
  };
}
