import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { argumentNa } from '../../scripts/kolomrechten-controle.mjs';

import { zonderCommentaar } from './roept-aan';

/**
 * Een gebruiker met twee groepen stuurt nooit per ongeluk een hulpvraag of een
 * straf naar de verkeerde groep — QS8-651, onwrikbare regel 18 vraag 6.
 *
 * ⚠️⚠️ **Waarom dit bestand naast `deling.test.ts` staat.** `enigeOfGekozen()`
 *    kán bij twee kandidaten niets kiezen zonder keuze; dat is de structurele
 *    helft en die staat daar. De andere helft is dat de schermen die functie ook
 *    echt gebruiken op het moment dat er iets de deur uitgaat — en dat is een
 *    naad. Tot QS8-651 stond er in `app/doel/[id].tsx` op vier plekken en in
 *    `app/(tabs)/lijst.tsx` op één plek letterlijk `…[0]` als standaard: de
 *    hulpvraag, de begunstigde groep en persoon van een straf, de vervangende
 *    getuige en de voorgeselecteerde groep van de deelknop. Elk onderdeel klopte:
 *    `stuurBericht()` toetst lidmaatschap, `zetStraf()` toetst de band met de
 *    begunstigde (0168), en die toetsen zijn allebei getest. Wat niemand toetste
 *    was dat de gebruiker die groep ooit had **aangewezen**.
 *
 * ⚠️ **Waarom een bronscan.** Er is in dit project geen React-testbibliotheek —
 *    zie de kop van `de-vragenlijst-wordt-niet-twee-keer-gesteld.test.ts`. Wat je
 *    zonder renderer wél kunt vastleggen is (a) dat er in heel `app/` en `src/`
 *    geen `[0]` meer op een groepen- of mensenlijst staat, op één geregistreerde
 *    plek na, (b) dat elke verzendaanroep zijn ontvanger leest uit een binding
 *    die `enigeOfGekozen()` maakte — mét de lijst en de keuze die het scherm
 *    erin stopt, want een binding die `groepen.slice(0, 1)` krijgt is de stille
 *    eerste met een omweg — en (c) dat de knop uit staat zolang die binding leeg
 *    is.
 *
 * ⚠️ **De controles staan als functie en niet als losse regex in de test**, omdat
 *    een controle die je niet kunt voeden niet te ijken is (QS8-115). Ze krijgen
 *    hieronder élke vorm los aangeboden: de vormen die ze moeten vangen én de
 *    vormen die ze met rust moeten laten.
 *
 * IJKING — met de hand gedraaid op 05-11-2026, mutatie per grendel, en per
 * mutatie staat wélke test omviel (CLAUDE.md: niet dát er een omviel). De
 * mutaties lopen over dit bestand én `deling.test.ts` (44 tests samen):
 *
 *   A  in `HulpVragen` `enigeOfGekozen(groepen, groepId, …)` terug naar
 *      `groepId === '' ? (groepen[0]?.group_id ?? '') : groepId`
 *      → drie rood: de sweep ('kent geen stille eerste buiten het register', met
 *        `groepen[0]` als vondst), de argumententoets en de bindingentelling
 *   A' dezelfde regel, maar `groepen.find(…) ?? groepen.find(() => true)` — geen
 *      `[0]`, dus de sweep ziet niets
 *      → twee rood: de argumententoets en de bindingentelling (`gekozenGroep` is
 *        dan één keer gebonden in plaats van twee; daarom telt `bindingen()`)
 *   B  `stuurBericht(gekozenGroep.group_id, …)` → `stuurBericht(groepId, …)`
 *      → alleen 'stuurt de hulpvraag naar de gebonden groep' rood
 *   C  `return items[0]` als laatste regel van `enigeOfGekozen()`
 *      → negen rood, alle in `deling.test.ts`; dit bestand blijft groen, want de
 *        bron is dan correct en de regel niet — de arbeidsdeling van de kop
 *   C' de oude QS8-56-regel terug: `if (items.length === 1) return items[0];`
 *      → alleen de twee 'overgebleven'-tests in `deling.test.ts` rood
 *   D  in `Groepskeuze` (De Lijst) `useState('')` → `useState(groepen[0]?.id ?? '')`
 *      → alleen de sweep rood, met `app/(tabs)/lijst.tsx` als treffer
 *   E  in `HulpVragen` `enigeOfGekozen(groepen.slice(0, 1), …)`
 *      → alleen 'geeft enigeOfGekozen() de hele lijst en de rauwe keuze' rood
 *   F  in `Straf` `useState(groepen?.[0]?.id ?? '')` — optionele keten
 *      → alleen de sweep rood
 *   G  de bevestigknop van de straf zonder `disabled={begunstigde === null}`
 *      → alleen 'houdt de knoppen uit zolang er niet gekozen is' rood
 */

const WORTEL = fileURLToPath(new URL('../..', import.meta.url));
const DOEL = join(WORTEL, 'app/doel/[id].tsx');
const LIJST = join(WORTEL, 'app/(tabs)/lijst.tsx');

/**
 * De ene plek buiten de schermen waar een lijst op zijn eerste wordt aangesproken,
 * met de reden. ⚠️ Een register van één rij; een tweede rij is een gesprek en geen
 * toevoeging — zie `docs/decisions/2026-11-05-de-eerste-groep-is-geen-keuze.md` §4.
 */
const GEREGISTREERD: Readonly<Record<string, string>> = {
  'src/modules/buddies/samen.ts':
    'beginfase(): toont bij terugkomst "gekoppeld aan <naam>" met je eigen uitnodigingslink; verstuurt niets naar een groep',
};

/**
 * Elke plek waar een lijst van groepen of mensen op zijn eerste wordt aangesproken.
 *
 * ⚠️ `.at(0)` telt mee: dat is `[0]` met een andere spelling. `.find(` niet, want
 *    `find` met een predicaat op de keuze is precies wat de reparatie doet.
 */
export function stilleEerste(inhoud: string): readonly string[] {
  return (
    inhoud.match(/\b(?:groepen|mensen|gekoppeld|kandidaten|leden)\s*(?:\?\.)?(?:\[0\]|\.at\(\s*0\s*\))/g) ?? []
  );
}

/** Elk `.ts`/`.tsx`-bronbestand onder `map`, zonder tests, relatief aan de wortel. */
function bronbestanden(map: string): readonly string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bronbestanden(pad));
    else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) uit.push(relative(WORTEL, pad));
  }
  return uit;
}

/**
 * Hoe vaak `naam` in de bron gebonden wordt aan een aanroep van `enigeOfGekozen()`.
 *
 * ⚠️ Een aantal en geen ja/nee, want `gekozenGroep` heet op het doelscherm twee
 *    keer zo — in de hulpvraag én in de straf. Een ja/nee was al waar als één van
 *    de twee het goed deed, en dan kon de andere stil terugvallen op een eigen
 *    `find` zonder dat hier iets rood werd.
 */
export function bindingen(inhoud: string, naam: string): number {
  return (inhoud.match(new RegExp(`\\bconst\\s+${naam}\\s*=\\s*enigeOfGekozen\\(`, 'g')) ?? []).length;
}

/**
 * Het `index`-de argument van élke aanroep van `functie(` in de bron.
 *
 * ⚠️ **Op `argumentNa()` uit `scripts/kolomrechten-controle.mjs`**, dat haakjes,
 *    accolades, blokhaken én strings meetelt — een eigen teller hier was de
 *    zesde in dit project en de enige die `f(x, ')')` verkeerd knipte.
 *
 * ⚠️ **Élke aanroep en niet de eerste**, want `onDeel(null)` (niet meer delen)
 *    staat in hetzelfde bestand vóór `onDeel(enige.id)`; een toets die de eerste
 *    leest, keurt de tweede nooit. Een aanroep zonder dat argument levert `null`.
 */
export function argumentenVan(inhoud: string, functie: string, index: number): readonly (string | null)[] {
  const uitkomst: (string | null)[] = [];
  const aanroep = new RegExp(`(?<![\\w$.])${functie}\\s*\\(`, 'g');

  for (let start = aanroep.exec(inhoud); start !== null; start = aanroep.exec(inhoud)) {
    uitkomst.push(argumentOpPositie(inhoud, start.index + start[0].length, index));
  }

  return uitkomst;
}

/** Het `index`-de argument vanaf `van` (net na het openingshaakje), of `null`. */
function argumentOpPositie(inhoud: string, van: number, index: number): string | null {
  let positie = van;
  for (let i = 0; ; i += 1) {
    const ruw = argumentNa(inhoud, positie);
    if (ruw === null) return null;
    const argument = ruw.trim();
    if (i === index) return argument === '' ? null : argument;
    positie += ruw.length;
    // Een `)` sluit de aanroep af: er komt geen argument meer.
    if (inhoud[positie] !== ',') return null;
    positie += 1;
  }
}

describe('stilleEerste', () => {
  it('vindt de vormen die er tot QS8-651 stonden', () => {
    expect(stilleEerste("groepId === '' ? (groepen[0]?.group_id ?? '') : groepId")).toEqual(['groepen[0]']);
    expect(stilleEerste("useState(groepen[0]?.id ?? '')")).toEqual(['groepen[0]']);
    expect(stilleEerste("gekozen !== '' ? gekozen : (mensen[0]?.id ?? '')")).toEqual(['mensen[0]']);
    expect(stilleEerste('const eerste = gekoppeld[0];')).toEqual(['gekoppeld[0]']);
  });

  it('vindt de andere spellingen van hetzelfde', () => {
    expect(stilleEerste('groepen.at(0)?.id')).toEqual(['groepen.at(0)']);
    expect(stilleEerste('groepen?.[0]?.id')).toEqual(['groepen?.[0]']);
  });

  it('laat een keuze op predicaat met rust', () => {
    expect(stilleEerste('groepen.find((g) => g.id === groepId)')).toEqual([]);
    expect(stilleEerste('groepen.map((g) => ({ waarde: g.id, label: g.name }))')).toEqual([]);
    // Een andere lijst is niet deze belofte: `stappen[0]` is een weekplan, geen groep.
    expect(stilleEerste('const eerste = stappen[0];')).toEqual([]);
  });
});

describe('bindingen', () => {
  it('telt de bindingen', () => {
    expect(bindingen('const gekozenGroep = enigeOfGekozen(groepen, groepId, (g) => g.id);', 'gekozenGroep')).toBe(1);
    expect(bindingen('  const persoon = enigeOfGekozen(\n    mensen,\n    keuze,\n    (m) => m.id,\n  );', 'persoon')).toBe(1);
    expect(
      bindingen('const gekozenGroep = enigeOfGekozen(a, b, c);\n\nconst gekozenGroep = enigeOfGekozen(d, e, f);', 'gekozenGroep'),
    ).toBe(2);
  });

  it('telt niets als het scherm zelf kiest', () => {
    expect(bindingen("const gekozenGroep = groepId === '' ? groepen[0] : groepId;", 'gekozenGroep')).toBe(0);
    expect(bindingen('const gekozenGroep = groepen.find((g) => g.id === groepId);', 'gekozenGroep')).toBe(0);
    // Een andere naam is een andere binding.
    expect(bindingen('const andere = enigeOfGekozen(groepen, groepId, (g) => g.id);', 'gekozenGroep')).toBe(0);
    // De import alleen is geen binding.
    expect(bindingen("import { enigeOfGekozen } from '@/modules/buddies';", 'gekozenGroep')).toBe(0);
  });
});

describe('argumentenVan', () => {
  it('leest het goede argument', () => {
    const bron = 'await stuurBericht(gekozenGroep.group_id, userId, tekst)';
    expect(argumentenVan(bron, 'stuurBericht', 0)).toEqual(['gekozenGroep.group_id']);
    expect(argumentenVan(bron, 'stuurBericht', 2)).toEqual(['tekst']);
  });

  it('telt een komma in een object of een geneste aanroep niet als scheiding', () => {
    const bron = "zetStraf(goalId, { body: tekst, image_url: null }, kies(a, b))";
    expect(argumentenVan(bron, 'zetStraf', 1)).toEqual(['{ body: tekst, image_url: null }']);
    expect(argumentenVan(bron, 'zetStraf', 2)).toEqual(['kies(a, b)']);
  });

  it('leest ook over meerdere regels', () => {
    const bron = `const uitkomst = await zetStraf(
      goalId,
      { body: tekst, image_url: null },
      begunstigde,
    );`;
    expect(argumentenVan(bron, 'zetStraf', 2)).toEqual(['begunstigde']);
  });

  it('vangt de stille eerste en de terugval op leeg als wat ze zijn', () => {
    expect(argumentenVan('stuurBericht(groepen[0].group_id, u, t)', 'stuurBericht', 0)).toEqual(['groepen[0].group_id']);
    expect(argumentenVan("stuurBericht(gekozenGroep?.group_id ?? '', u, t)", 'stuurBericht', 0)).toEqual(["gekozenGroep?.group_id ?? ''"]);
  });

  it('geeft niets bij een aanroep die er niet is, en null bij een argument dat er niet is', () => {
    expect(argumentenVan('niets hier', 'stuurBericht', 0)).toEqual([]);
    expect(argumentenVan('stuurBericht(a)', 'stuurBericht', 1)).toEqual([null]);
  });

  it('leest élke aanroep en niet alleen de eerste', () => {
    expect(argumentenVan('onDeel(null);\n onDeel(groepen[0].id);', 'onDeel', 0)).toEqual(['null', 'groepen[0].id']);
  });

  it('laat een haakje in een string niet meetellen', () => {
    expect(argumentenVan("stuurBericht(a, ')', b)", 'stuurBericht', 2)).toEqual(['b']);
  });

  it('verwart een functie niet met een andere die op dezelfde naam eindigt', () => {
    expect(argumentenVan('herstelStuurlozeStraf(id, actie, opties)', 'stuurBericht', 0)).toEqual([]);
    expect(argumentenVan('x.voer(a)\nvoer(b)', 'voer', 0)).toEqual(['b']);
  });
});

/**
 * ⚠️ De belofte geldt voor de hele app en niet voor de twee schermen die vandaag
 *    kiezen (regel 18 vraag 4): een zesde plek — een teamgroepscherm, zeg — valt
 *    anders buiten de toets. 📏 Op 05-11-2026 vindt deze sweep over `app/` en
 *    `src/` precies één treffer, en die staat met reden in `GEREGISTREERD`.
 */
describe('heel app/ en src/', () => {
  it('kent geen stille eerste buiten het register', () => {
    const treffers: Record<string, readonly string[]> = {};
    for (const pad of [...bronbestanden(join(WORTEL, 'app')), ...bronbestanden(join(WORTEL, 'src'))]) {
      const gevonden = stilleEerste(zonderCommentaar(readFileSync(join(WORTEL, pad), 'utf8')));
      if (gevonden.length > 0 && !(pad in GEREGISTREERD)) treffers[pad] = gevonden;
    }
    expect(treffers).toEqual({});
  });

  it('heeft elke geregistreerde plek ook echt', () => {
    for (const pad of Object.keys(GEREGISTREERD)) {
      const gevonden = stilleEerste(zonderCommentaar(readFileSync(join(WORTEL, pad), 'utf8')));
      expect(gevonden.length, `${pad} staat in het register maar heeft geen stille eerste meer`).toBeGreaterThan(0);
    }
  });
});

describe('het doelscherm', () => {
  // ⚠️ De knip staat op de leesplek en niet per toets — QS8-568. Een `toContain`
  //    op de ruwe bron is waar zodra de tekenreeks érgens staat, ook in een comment.
  const inhoud = zonderCommentaar(readFileSync(DOEL, 'utf8'));

  /**
   * ⚠️ Wát er in `enigeOfGekozen()` gaat, en niet alleen dát hij aangeroepen wordt
   *    (code-critic, 05-11-2026): `enigeOfGekozen(groepen.slice(0, 1), …)` is één
   *    kandidaat en dus altijd de eerste, en dat ziet een telling van bindingen
   *    niet. In de volgorde van het bestand: de vervangende getuige, de
   *    begunstigde groep, de begunstigde persoon, de hulpvraag.
   */
  it('geeft enigeOfGekozen() de hele lijst en de rauwe keuze', () => {
    expect(argumentenVan(inhoud, 'enigeOfGekozen', 0)).toEqual(['mensen', 'groepen', 'mensen', 'groepen']);
    expect(argumentenVan(inhoud, 'enigeOfGekozen', 1)).toEqual(['gekozen', 'groepId', 'gekozenPersoon', 'groepId']);
  });

  it('bindt de ontvanger van de hulpvraag, de begunstigde van de straf en de vervangende getuige aan de keuze', () => {
    // Twee: de hulpvraag en de begunstigde groep van de straf.
    expect(bindingen(inhoud, 'gekozenGroep'), 'niet elke groepskeuze is gebonden aan enigeOfGekozen()').toBe(2);
    expect(bindingen(inhoud, 'persoon'), 'de persoon is niet gebonden aan enigeOfGekozen()').toBe(1);
    expect(bindingen(inhoud, 'nieuweGetuige'), 'de nieuwe getuige is niet gebonden aan enigeOfGekozen()').toBe(1);
  });

  it('stuurt de hulpvraag naar de gebonden groep', () => {
    expect(argumentenVan(inhoud, 'stuurBericht', 0)).toEqual(['gekozenGroep.group_id']);
  });

  /**
   * ⚠️ Twee schakels, allebei getoetst: `zetStraf()` krijgt `begunstigde`, en
   *    `begunstigde` is uit de twee gebonden keuzes gemaakt — niet uit `groepId`
   *    of een eigen `find`. Zou één van beide een eigen weg kiezen, dan is de
   *    binding hierboven een naam zonder gevolg.
   */
  it('legt de straf vast bij de gebonden begunstigde', () => {
    expect(argumentenVan(inhoud, 'zetStraf', 2)).toEqual(['begunstigde']);
    expect(inhoud).toMatch(/\bconst\s+begunstigde\s*=\s*gekozenBegunstigde\(\s*soort,\s*gekozenGroep,\s*persoon\s*\)/);
  });

  it('wijst de vervangende getuige aan uit de gebonden keuze', () => {
    const stappen = argumentenVan(inhoud, 'voer', 0).filter((a) => a?.includes('nieuwe_getuige'));
    expect(stappen).toEqual(["{ actie: 'nieuwe_getuige', getuige: nieuweGetuige.id }"]);
  });

  it('houdt de knoppen uit zolang er niet gekozen is, en zegt waarom', () => {
    expect(inhoud).toMatch(/disabled=\{[^}]*gekozenGroep === undefined\}/);
    expect(inhoud).toMatch(/kanVerder\s*=\s*[^;]*begunstigde !== null/);
    // De bevestigingsstap van de straf sluit óók als de begunstigde wegvalt.
    expect(inhoud).toMatch(/disabled=\{begunstigde === null\}/);
    expect(inhoud).toMatch(/disabled=\{gekozen === undefined\}/);
    for (const sleutel of ['hulpvraag.kies_eerst', 'straf.kies_groep_eerst', 'straf.kies_persoon_eerst', 'stuurloos.kies_eerst']) {
      expect(inhoud, `${sleutel} wordt niet getoond`).toContain(`'${sleutel}'`);
    }
  });
});

describe('De Lijst', () => {
  const inhoud = zonderCommentaar(readFileSync(LIJST, 'utf8'));

  it('deelt direct alleen met de enige groep, en anders met de gekozen', () => {
    expect(bindingen(inhoud, 'enige')).toBe(1);
    expect(bindingen(inhoud, 'gekozen')).toBe(1);
    // De deelknop zonder lijst vraagt met `''` om "de enige"; de lijst geeft de keuze door.
    expect(argumentenVan(inhoud, 'enigeOfGekozen', 0)).toEqual(['groepen', 'groepen']);
    expect(argumentenVan(inhoud, 'enigeOfGekozen', 1)).toEqual(["''", 'keuze']);
    // `onDeel(null)` is "niet meer delen" en hoort erbij; elke andere aanroep
    // deelt met de enige groep. Niets anders.
    expect(argumentenVan(inhoud, 'onDeel', 0)).toEqual(['null', 'enige.id']);
    expect(argumentenVan(inhoud, 'onKies', 0)).toEqual(['gekozen.id']);
  });

  it('houdt de deelknop uit zolang er niet gekozen is, en zegt waarom', () => {
    expect(inhoud).toMatch(/disabled=\{gekozen === undefined\}/);
    expect(inhoud).toContain("'lijst.deel_kies_eerst'");
  });
});

