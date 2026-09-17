#!/usr/bin/env node
/**
 * Draagt elke fixture zijn uitnodigingscode uit `proefCode()`? — QS8-542.
 *
 * ⚠️⚠️ **Waarom dit een controle is en geen opruimactie.** `proefCode()` bestaat
 *    sinds QS8-348 en is precies gebouwd om gedeelde fixture-codes te vermijden:
 *    `groups.invite_code` draagt een unieke index over de héle tabel, dus twee
 *    gelijktijdige runs met dezelfde letterlijke waarde botsen daar
 *    deterministisch op — in de ópbouw, dus het hele bestand valt om.
 *
 *    📏 Gemeten op 17-09-2026, zes dagen na die reparatie: zeven testbestanden
 *    gebruikten `proefCode()` en **drie** hardcodeerden er nog een. `PINCODE1`
 *    stond in twee verschillende bestanden. Het mechanisme was er; de instanties
 *    waren nooit meegegaan, en niets werd er rood van.
 *
 *    Dat is de spiegel van de les die dossierrij 611 over zijn eigen voorganger
 *    schrijft — *het ruimde de instanties op en niet het mechanisme* — en dit
 *    script is de andere helft.
 *
 * ⚠️ **Niet elke letterlijke code is een botsing, en dat verschil is gemeten.**
 *    📏 `policies.test.ts` bood `WELKOMWELKOM` aan bij een insert die hoort te
 *    falen en bij een update die hoort te falen; die waarde belandt dus nooit in
 *    de unieke index. Alleen een code die écht geschreven wordt kan botsen. Dat
 *    onderscheid is met een patroon niet te maken — of een insert slaagt, weet je
 *    pas als hij draait — dus deze controle meldt élke letterlijke code en laat
 *    het register de uitzonderingen dragen, mét hun meting.
 *
 * ⚠️ Leest de testboom en geen database: dit gaat over wat er in de fixtures
 *    staat, niet over wat er draait.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { metSchuineStrepen } from './paden.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * Letterlijke codes die er met reden staan.
 *
 * ⚠️ Een reden en een **meting**, geen vinkje. De vraag die hij hoort te
 *    beantwoorden is: *belandt deze waarde ooit in `groups.invite_code`?* Zo
 *    nee, dan kan hij niet botsen en mag hij blijven.
 *
 * @type {Record<string, string>}
 */
export const ZONDER_PROEFCODE = {
  'tests/rls/policies.test.ts': 'WELKOMWELKOM',
};

/**
 * ⚠️ De waarde hoort erbij, niet alleen het bestand — anders dekt één vrijbrief
 *    ook de vólgende letterlijke code die iemand in datzelfde bestand zet.
 */
export const REDENEN = {
  'tests/rls/policies.test.ts':
    '📏 `WELKOMWELKOM` wordt tweemaal aangeboden en nooit geschreven: de insert ' +
    'valt op `groups_insert` (`with check (false)`) en de update op het ontbrekende ' +
    'UPDATE-kolomrecht plus `groups_guard`. Beide tests verwáchten die weigering, ' +
    'dus de waarde bereikt de unieke index niet en kan niet botsen.',
};

/** Een letterlijke uitnodigingscode: hoofdletters en cijfers, minstens zes lang. */
const LETTERLIJK = /'([A-Z][A-Z0-9]{5,63})'/g;

/**
 * Regels die géén uitnodigingscode zijn, ook al zien ze er zo uit.
 *
 * ⚠️ Zonder deze filter meldt hij `'INSERT'`, `'UPDATE'`, `'SELECT'` en elke
 *    andere schreeuwende constante in de suite — en een controle die alles
 *    meldt, leer je uitzetten.
 */
const GEEN_CODE = new Set([
  'INSERT', 'UPDATE', 'SELECT', 'DELETE', 'EXECUTE', 'PUBLIC', 'SIGKILL',
  'GELUKT', 'GELAND', 'GEWEIGERD', 'OVERGESLAGEN', 'GEKAAPT', 'HERSCHREVEN',
]);

/**
 * Bestanden die deze controle zelf voeden, en die hij dus niet mag melden.
 *
 * ⚠️ 📏 Gevonden bij het ijken: zonder deze uitsluiting meldt hij zijn **eigen**
 *    testbestand zes keer — daar staan letterlijke codes als invoer, want anders
 *    is hij niet te voeden. Erger dan de ruis was het gevolg: de echte regressie
 *    die ik erbij zette, verdween tussen zes valse meldingen.
 */
const VOEDT_DEZE_CONTROLE = 'tests/scripts/proefcode-controle.test.ts';

/** @param {string} map @returns {string[]} */
function bestanden(map) {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return bestanden(pad);
    return pad.endsWith('.ts') ? [pad] : [];
  });
}

/**
 * Welke regels een letterlijke code in de buurt van `invite_code` zetten.
 *
 * ⚠️ **De regel moet `invite_code` noemen**, want een schreeuwende constante is
 *    op zichzelf geen uitnodigingscode. Dat maakt hem smal en daarmee bruikbaar:
 *    het meldt de vorm die botst en niet elke hoofdletterreeks in de suite.
 *
 * @param {string} tekst
 * @param {string} pad
 * @returns {{ pad: string, regel: number, code: string }[]}
 */
export function vondsten(tekst, pad) {
  const uit = [];
  let venster = 0;

  tekst.split(/\r?\n/).forEach((regel, i) => {
    const kaal = regel.trimStart();
    const commentaar = kaal.startsWith('*') || kaal.startsWith('//');

    // ⚠️⚠️ **Een venster en niet één regel, en dat is gemeten.** 📏 Bij het ijken
    //    zette ik `'PINCODE1'` terug in `taak-delen.test.ts` en de controle zweeg:
    //    daar staat de kolomlijst (`insert into groups (…, invite_code, …)`) een
    //    regel hóger dan de waarde. Een eis van `invite_code` op dezelfde regel
    //    mist dus precies de vorm die botst — een meerregelige SQL-insert.
    if (!commentaar && regel.includes('invite_code')) venster = 4;
    else if (venster > 0) venster -= 1;

    if (commentaar || venster === 0) return;

    for (const m of regel.matchAll(LETTERLIJK)) {
      if (!GEEN_CODE.has(m[1])) uit.push({ pad, regel: i + 1, code: m[1] });
    }
  });
  return uit;
}

/**
 * @param {readonly { pad: string, regel: number, code: string }[]} alle
 * @param {Record<string, string>} [register]
 */
export function beoordeel(alle, register = ZONDER_PROEFCODE) {
  const gemeld = alle.filter((v) => register[v.pad] !== v.code);
  const gedekt = new Set(alle.filter((v) => register[v.pad] === v.code).map((v) => v.pad));
  const verdwenen = Object.keys(register).filter((p) => !gedekt.has(p));
  return { gemeld, verdwenen };
}

/** @returns {number} De exitcode. */
export function hoofd() {
  const alle = bestanden(join(WORTEL, 'tests'))
    .map((pad) => ({ pad, kort: metSchuineStrepen(relative(WORTEL, pad)) }))
    .filter(({ kort }) => kort !== VOEDT_DEZE_CONTROLE)
    .flatMap(({ pad, kort }) => vondsten(readFileSync(pad, 'utf8'), kort));
  const { gemeld, verdwenen } = beoordeel(alle);

  if (gemeld.length > 0) {
    console.error(`✗ ${gemeld.length} letterlijke uitnodigingscode(s) in de testboom:\n`);
    for (const v of gemeld) console.error(`    ${v.pad}:${v.regel}  '${v.code}'`);
    console.error(
      '\n`groups.invite_code` draagt een unieke index over de héle tabel, dus twee\n' +
        'gelijktijdige runs met dezelfde letterlijke waarde botsen deterministisch —\n' +
        'in de opbouw, dus het hele bestand valt om (QS8-348). Gebruik `proefCode()`\n' +
        'uit tests/rls/proefid.ts. Belandt deze waarde nooit in de tabel omdat de\n' +
        'handeling hoort te falen, zet hem dan mét die meting in ZONDER_PROEFCODE en\n' +
        'REDENEN in scripts/proefcode-controle.mjs.',
    );
    return 1;
  }

  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} registerrij(en) dekken niets meer:\n`);
    for (const p of verdwenen) console.error(`    ${p}`);
    console.error(
      '\nGoed nieuws en toch rood: de code is weg of gebruikt nu `proefCode()`. Een\n' +
        'vrijbrief die niemand nodig heeft, dekt straks iets anders af.',
    );
    return 1;
  }

  console.log(
    `proefcode-controle: geen letterlijke uitnodigingscode buiten het register ` +
      `(${Object.keys(ZONDER_PROEFCODE).length} uitzondering(en), elk met een meting).`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
