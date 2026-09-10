#!/usr/bin/env node
/**
 * Bewaakt dat een bestand geen repo-pad noemt dat niet bestaat — QS8-412.
 *
 * ⚠️⚠️ **Waarom dit een eigen controle is en geen dode verwijzing.** De vorm die
 *    dit project geld kost, is een comment dat een grendel noemt die er niet is:
 *
 *      ⚠️ De belofte staat hier, bij de code, en tests/ui/foto.test.tsx
 *         toetst hem op deze plek.
 *
 *    Dat bestand bestond niet, en de belofte was onbewaakt. **Een ontbrekende
 *    test valt op; een test waarvan in de bron staat dát hij er is, valt niet
 *    op** — de zin is precies de reden dat de volgende lezer er geen schrijft.
 *
 *    ⚠️ Let op de aanhalingstekens die om dat voorbeeld níet staan: met
 *       backticks zou dit script zijn eigen uitleg melden. Zelfde reden als
 *       waarom de documenttest zijn commentaar wegknipt voordat hij op
 *       `Linking.openURL` toetst — een controle die de uitleg van een regel
 *       meldt in plaats van een schending ervan, leer je negeren.
 *
 * ⚠️ **De aanleiding is elke keer een verhuizing**, de beweging die CLAUDE.md
 *    twee keer de gevaarlijkste noemt. De belofte verhuist mee met de code, de
 *    verwijzing naar de toets blijft achter bij een naam die niemand meer
 *    gebruikt. 📏 Gemeten op 10-09-2026: 1314 verwijzingen in 973 bestanden,
 *    dertien kapot, waarvan negen naar een testbestand.
 *
 * ⚠️ **De drie bestaande sporten dekken dit niet.** `exports:controle`,
 *    `keten:controle` en `schermingang:controle` zoeken code zónder aanroeper;
 *    dit is een aanroeper die naar niets wijst. Andere kant van dezelfde naad.
 *
 * ⚠️ **De vorm is smal met opzet: backtick, repo-map, bestandsextensie.** Een
 *    pad zonder aanhalingstekens of zonder extensie is niet betrouwbaar van
 *    proza te scheiden, en een controle die proza meldt leer je uitzetten. Wat
 *    hier overblijft is geen verwijzing maar een **bewering over de repo**, en
 *    die is te toetsen.
 *
 * ⚠️⚠️ **`docs/decisions/` valt erbuiten, en dat is geen gemak.** Een
 *    beslisdocument is een gedateerd verslag van wat er tóen was: dat
 *    supabase/functions/_shared/sentry/index.ts op 26-08-2026 gedeployd stond
 *    zonder ooit in een branch te staan, is waar, en het bestand hoort er
 *    vandaag juist níet te zijn. Zo'n zin repareren zou het verslag onwaar
 *    maken. `docs/DEPLOY.md`, `docs/ENGINEER-REVIEW.md` en `docs/WERKVOORRAAD.md`
 *    vallen er wél onder: die beschrijven het heden.
 *
 * Draaien: `npm run padverwijzing:controle`. Hoort mee in de poort.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Waar gescand wordt. */
const MAPPEN = ['src', 'app', 'scripts', 'supabase', 'tests', 'docs'];

/** Wat er binnen die mappen buiten valt — zie de kop. */
const BUITEN = ['docs/decisions'];

/**
 * Het ene bestand dat deze controle **voedt** en er daarom buiten valt.
 *
 * ⚠️⚠️ **Niet "testbestanden tellen niet mee".** Die vrijstelling zou te breed
 *    zijn: 📏 één van de dertien bevindingen van 10-09-2026 stond juist in een
 *    test (`tests/rls/koppelbare-doelen.test.ts` wees naar een grendel die
 *    hernoemd was). Alleen de ijking valt erbuiten, en die noemt met opzet paden
 *    die niet bestaan — dat is precies zijn werk. Zou hij ze moeten vermijden,
 *    dan voert hij zijn geval langs de grendel heen en bewaakt hij niets, en dat
 *    is de fout waar CLAUDE.md bij regel 18 voor waarschuwt.
 */
const IJKING = 'tests/scripts/padverwijzing-controle.test.ts';

/** Welke bestandssoorten commentaar of proza kunnen dragen. */
const SOORTEN = /\.(ts|tsx|mjs|sql|md)$/;

/**
 * Een backtick-geciteerd pad dat op een repo-map begint en een extensie draagt.
 *
 * ⚠️ De extensielijst is ruimer dan `SOORTEN`: je mág naar een `.json` of een
 *    `.yml` verwijzen, ze worden alleen zelf niet gescand.
 */
const VERWIJZING =
  /`((?:src|app|scripts|docs|supabase|tests)\/[A-Za-z0-9._/[\]()-]+\.(?:ts|tsx|mjs|sql|md|json|yml|yaml))`/g;

/**
 * De verwijzingen die met opzet naar een bestand wijzen dat er niet is.
 *
 * ⚠️ **Een register met een reden per rij, en de reden is het punt.** Zonder
 *    reden groeit dit tot de plek waar een echte bevinding zich verstopt.
 *
 * ⚠️ **Sleutel is het paar (pad, in).** Dezelfde kapotte verwijzing in een ánder
 *    bestand is een nieuwe bevinding en geen erfenis.
 */
export const ZONDER_BESTAND = [
  {
    pad: 'tests/beloftes/uitsluitlijst-is-alleen-van-jezelf.test.ts',
    in: 'tests/rls/koppelbare-doelen.test.ts',
    reden:
      'De zin luidt "verhuisd uit …" en gaat over een test die met QS8-345 zijn ' +
      'onderwerp verloor. Het bestand hoort weg te zijn; de belofte staat nu op ' +
      'de regel eronder. Een verhuizing die zijn herkomst noemt, is precies wat ' +
      'regel 18 vraagt.',
  },
  {
    pad: 'scripts/js-bron.mjs',
    in: 'docs/ENGINEER-REVIEW.md',
    reden:
      'Een voorstel en geen bewering: de rij van 01-09-2026 stelt vóór om de twee ' +
      'JS-literaalparsers naar één bestand te trekken. De agenda mag een bestand ' +
      'noemen dat er nog niet is — dat is waar een agenda voor dient.',
  },
];

/** De verwijzingen in één bestandstekst, met regelnummer. */
export function verwijzingenIn(tekst) {
  const gevonden = [];
  tekst.split('\n').forEach((regel, i) => {
    for (const m of regel.matchAll(VERWIJZING)) gevonden.push({ pad: m[1], regel: i + 1 });
  });
  return gevonden;
}

/**
 * De kapotte verwijzingen, plus de registerrijen die niets meer dekken.
 *
 * ⚠️ **De ratel slaat twee kanten op**, zoals bij `levend:controle` en
 *    `regel15:controle`. Een registerrij die niemand meer nodig heeft is óók
 *    rood: anders blijft er een vrijbrief liggen voor een pad dat morgen om een
 *    heel andere reden weer opduikt.
 *
 * ⚠️ Geëxporteerd en zonder bestandssysteem: `bestaat` komt van de aanroeper.
 *    Een controle die je niet kunt voeden, kun je niet ijken.
 */
export function beoordeel(bestanden, bestaat, register = ZONDER_BESTAND) {
  const gebruikt = new Set();
  const kapot = [];

  for (const { pad: bron, tekst } of bestanden) {
    for (const { pad, regel } of verwijzingenIn(tekst)) {
      if (bestaat(pad)) continue;
      const rij = register.find((r) => r.pad === pad && r.in === bron);
      if (rij === undefined) kapot.push({ bron, regel, pad });
      else gebruikt.add(`${rij.in}|${rij.pad}`);
    }
  }

  const ongebruikt = register.filter((r) => !gebruikt.has(`${r.in}|${r.pad}`));
  return { kapot, ongebruikt };
}

/**
 * Of een repo-relatief pad gescand wordt.
 *
 * ⚠️ Geëxporteerd omdat de scope zélf een besluit is en geen bijkomstigheid: dat
 *    `docs/decisions/` erbuiten valt en `docs/DEPLOY.md` erbinnen, is de kern van
 *    deze controle en hoort onder test te staan in plaats van in een `if` te
 *    verdwijnen.
 */
export function binnenScope(pad) {
  if (!SOORTEN.test(pad)) return false;
  if (pad === IJKING) return false;
  if (pad.split('/').some((deel) => deel === 'node_modules' || deel.startsWith('.'))) return false;
  if (BUITEN.some((uit) => pad === uit || pad.startsWith(`${uit}/`))) return false;
  return MAPPEN.some((map) => pad === map || pad.startsWith(`${map}/`));
}

/** Alle scanbare bestanden onder `MAPPEN`, als repo-relatieve paden. */
function bronbestanden() {
  const gevonden = [];
  const loop = (map) => {
    for (const naam of readdirSync(join(WORTEL, map))) {
      const pad = `${map}/${naam}`;
      if (naam === 'node_modules' || naam.startsWith('.')) continue;
      if (statSync(join(WORTEL, pad)).isDirectory()) {
        if (!BUITEN.includes(pad)) loop(pad);
      } else if (binnenScope(pad)) gevonden.push(pad);
    }
  };
  for (const map of MAPPEN) if (existsSync(join(WORTEL, map))) loop(map);
  return gevonden;
}

function hoofd() {
  const bestanden = bronbestanden().map((pad) => ({
    pad,
    tekst: readFileSync(join(WORTEL, pad), 'utf8'),
  }));
  const { kapot, ongebruikt } = beoordeel(bestanden, (p) => existsSync(join(WORTEL, p)));

  if (kapot.length === 0 && ongebruikt.length === 0) {
    console.log(
      `padverwijzing-controle: elk genoemd pad bestaat (${bestanden.length} bestanden).`,
    );
    process.exit(0);
  }

  if (kapot.length > 0) {
    console.error(`padverwijzing-controle: ${kapot.length} verwijzing(en) naar een bestand dat`);
    console.error('er niet is.\n');
    for (const k of kapot) console.error(`  ${k.bron}:${k.regel}  →  ${k.pad}`);
    console.error(
      '\nNoemt de zin een grendel, ga dan éérst na of die grendel bestaat onder een\n' +
        'andere naam. Bestaat hij niet, dan is de belofte onbewaakt en is de zin het\n' +
        'probleem, niet de verwijzing. Is de verwijzing met opzet kapot — een\n' +
        'verhuizing die zijn herkomst noemt, of een voorstel — zet hem dan mét reden\n' +
        'in ZONDER_BESTAND in dit script.',
    );
  }

  if (ongebruikt.length > 0) {
    console.error(`\npadverwijzing-controle: ${ongebruikt.length} registerrij(en) dekken niets`);
    console.error('meer.\n');
    for (const r of ongebruikt) console.error(`  ${r.in}  →  ${r.pad}`);
    console.error(
      '\nHet bestand is er weer, of de zin is weg. Haal de rij uit ZONDER_BESTAND:\n' +
        'een vrijbrief die niemand nodig heeft, dekt straks iets anders af.',
    );
  }

  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
