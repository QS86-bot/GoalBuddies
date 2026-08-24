/**
 * De vergelijking achter `migratieregister-controle` — QS8-122.
 *
 * ⚠️ **Waarom dit een eigen bestand is en niet drie lussen in het script.** Een
 *    controle die alleen tegen het échte project kan draaien, is een controle
 *    die je nooit rood ziet worden — en CLAUDE.md is daar stellig over: een
 *    controle die nog nooit rood is geweest, is een aanname. Zo staat de
 *    vergelijking los van de verbinding en toetst `migratieregister-vergelijk.test.ts`
 *    élk faalgeval met de hand.
 */

/**
 * @typedef {{ versie: string, naam: string, bestand?: string }} Migratie
 */

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
