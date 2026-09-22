import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de scriptijkingen.
import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

/**
 * Welke scripts moeten er mee in de kloon? — QS8-585.
 *
 * ⚠️⚠️ **Vijf harnassen typten dit met de hand, en dat is drie keer misgegaan.**
 *    Elk van de vijf integratiesuites die een script in een tijdelijke kloon
 *    draait, droeg een eigen `HULPSCRIPTS`-lijst. Niets leidde die lijst af uit
 *    de imports, dus één `import` erbij in een gekopieerd script haalde ze
 *    onderuit.
 *
 *    📏 Gemeten op 22-09-2026 tegen `2d77db03`, met één regel erbij in
 *    `scripts/paden.mjs` (dat in álle vijf de lijsten staat) die uit
 *    `zonder-commentaar.mjs` importeert (dat in géén enkele stond):
 *
 *      ervóór   36 geslaagd,  0 rood,  0 skipped
 *      erna      9 geslaagd, 14 rood, 13 skipped
 *
 * ⚠️⚠️ **En dertien is het gevaarlijke getal, niet veertien.** Twee van de vijf
 *    suites meldden **nul** rode toetsen en dertien die nooit gedraaid hebben:
 *    valt het om in `beforeAll`, dan heeft geen enkele assertie gelopen en telt
 *    vitest ze als `skipped`. Dezelfde klasse als de OVERGESLAGEN-poort
 *    (QS8-268) en als de suite die zichzelf stil oversloeg (QS8-270):
 *    **ongemeten is niet groen.**
 *
 *    📏 Wat vandaag **niet** reproduceerde, en dat hoort er eerlijk bij: de
 *    dossierrij van 21-09 zegt dat zo'n run *"geen enkele rode"* geeft. Alle
 *    vijf de bestanden kwamen hier terug als `failed`, dus de run als geheel was
 *    rood. Wat wél reproduceert is dat het aantal toetsen dát draaide stil met
 *    dertien daalt.
 *
 * ⚠️ **Drie keer eerder opgeruimd zonder het mechanisme:**
 *    `migratieregister-omgeving.mjs` ontbrak tot QS8-365, `rollbackpad.mjs` tot
 *    QS8-405, `paden.mjs` tot QS8-580. CLAUDE.md zegt wat daarvan komt — *een
 *    reparatie die de instanties opruimt en het mechanisme laat staan, groeit
 *    terug.* Dit bestand is het mechanisme.
 *
 * ⚠️ **Wat hier bewust níet gebeurt: `scripts/` in zijn geheel kopiëren.** Dat
 *    werkt, maar dan draait het script in een omgeving waar álles staat, en juist
 *    de krappe kloon is wat deze harnassen bewijzen: een script dat in CI op een
 *    verse checkout draait, heeft alleen wat hij importeert.
 */

/** De map waar de echte scripts staan. */
const SCRIPTS = join(process.cwd(), 'scripts');

/**
 * De lokale `.mjs`-imports in één bron.
 *
 * ⚠️ **Zonder commentaar gelezen**, met de gedeelde knip. Een uitgecommentarieerde
 *    import volgen kost geen fout — er komt een bestand te veel mee — maar het
 *    maakt de bewering *"dit is de sluiting"* onwaar, en dan is de volgende lezer
 *    degene die uitzoekt waarom er iets in de kloon staat wat niemand nodig heeft.
 *
 * ⚠️ Alleen `./naam.mjs`. Een bare specifier (`node:fs`, een package) hoort niet
 *    in de kloon: die komt uit `node_modules` of uit Node zelf.
 */
export function lokaleImports(bron: string): string[] {
  const schoon = zonderCommentaar(bron) as string;
  const treffers = schoon.matchAll(/(?:from|import)\s*\(?\s*'\.\/([A-Za-z0-9_-]+\.mjs)'/g);
  // ⚠️ `flatMap` en geen `map`: onder strict is een capture-groep `string |
  //    undefined`, en een `as string` zou hier een aanname verbergen die de
  //    regex toevallig waarmaakt.
  return [...new Set([...treffers].flatMap((m) => (m[1] === undefined ? [] : [m[1]])))];
}

/** Leest een script uit de echte `scripts/`-map. */
function leesUitScripts(naam: string): string {
  return readFileSync(join(SCRIPTS, naam), 'utf8');
}

/**
 * De transitieve importsluiting van een of meer entry-scripts, inclusief de
 * entries zelf. Gesorteerd, zodat twee aanroepen hetzelfde antwoord geven.
 *
 * ⚠️ **De entries blijven met de hand opgeschreven, en dat is geen inconsequentie.**
 *    Welk script een harnas drááit, is waar die test over gaat — dat hoort in de
 *    test te staan. Wat dat script nodig heeft, is een eigenschap van het script,
 *    en die hoort niet overgetypt te worden.
 *
 * @param lees haalt de bron van een script op; injecteerbaar voor de ijking,
 *        zodat die vormen kan voeden die niet op schijf hoeven te staan.
 */
export function importsluiting(entries: string[], lees = leesUitScripts): string[] {
  const gezien = new Set<string>();
  const wachtrij = [...entries];

  while (wachtrij.length > 0) {
    const naam = wachtrij.shift() as string;
    if (gezien.has(naam)) continue;
    gezien.add(naam);
    for (const volgende of lokaleImports(lees(naam))) wachtrij.push(volgende);
  }

  return [...gezien].sort();
}

/**
 * Zet de sluiting van `entries` in `<wortel>/scripts/` en geeft terug wat er
 * gekopieerd is.
 */
export function kopieerHulpscripts(wortel: string, entries: string[]): string[] {
  const namen = importsluiting(entries);
  mkdirSync(join(wortel, 'scripts'), { recursive: true });
  for (const naam of namen) {
    cpSync(join(SCRIPTS, naam), join(wortel, 'scripts', naam));
  }
  return namen;
}
