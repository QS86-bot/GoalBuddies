import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Elk scherm heeft een ingang — QS8-383.
 *
 * ⚠️⚠️ **Dit bestaat omdat `/doel/plan` er twee weken lag zonder knop.** Dat
 *    scherm is de kern van epic QS8-200 (Urgent): een doel uit één zin, de
 *    Doelcoach leidt de rest af. Het was gebouwd, gemerged, en 📏 er verwees
 *    níets naar — beide ingangen stuurden nog naar het formulier van zes velden
 *    dat het epic juist wilde wegnemen. Elk schakeltje was af en de keten was
 *    los.
 *
 * ⚠️ **`keten:controle` dekt deze klasse niet.** Die kijkt naar databasefuncties
 *    en -waarden zonder aanroeper. Een scherm zonder ingang valt er volledig
 *    buiten, en dat verschil is precies waar dit script voor is: dezelfde vraag,
 *    één laag hoger. Onwrikbare regel 18, vraag 5 — *kan een gebruiker hier
 *    daadwerkelijk bij, en langs welke knop?*
 *
 * ⚠️ **Testbestanden tellen niet mee als ingang.** Een route die alleen in een
 *    test voorkomt, is voor een gebruiker net zo onbereikbaar. 📏 Zonder die
 *    uitsluiting leek `/(tabs)/profiel` bereikbaar via `taalkeuze.test.ts` — een
 *    bewijs dat niets bewijst.
 */

/** Mappen waarin een verwijzing naar een route kan staan. */
const BRONMAPPEN = ['app', 'src'];

/**
 * Routes die met reden geen `router.push` nodig hebben, met de meting erbij.
 *
 * ⚠️ Eén klasse, en die is smal gehouden: wie hier iets aan toevoegt, zegt dat
 *    een scherm onbereikbaar mág zijn. Dat is bijna nooit waar.
 */
/** @type {Record<string, string>} */
export const ZONDER_PUSH = {
  // ⚠️ `app/(tabs)/index.tsx` heet hier `/(tabs)` en niet `/(tabs)/index`:
  //    Expo Router laat `index` uit het pad vallen, en `routesIn()` doet dat na.
  //    Een regel op de bestandsnaam dekt dus niets — 📏 dat was de eerste
  //    uitslag van dit script.
  '/(tabs)':
    '📏 Staat als `<Tabs.Screen name="index">` in `app/(tabs)/_layout.tsx`: de tabbalk is de ingang.',
  '/(tabs)/doelen':
    '📏 Staat als `<Tabs.Screen name="doelen">` in `app/(tabs)/_layout.tsx`: de tabbalk is de ingang.',
  '/(tabs)/groep':
    '📏 Staat als `<Tabs.Screen name="groep">` in `app/(tabs)/_layout.tsx`: de tabbalk is de ingang.',
  '/(tabs)/profiel':
    '📏 Staat als `<Tabs.Screen name="profiel">` in `app/(tabs)/_layout.tsx`: de tabbalk is de ingang.',
};

/** Alle `.tsx`-bestanden onder een map, recursief. */
function bestandenIn(map) {
  const uit = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestandenIn(pad));
    else uit.push(pad);
  }
  return uit;
}

/**
 * De routes die Expo Router uit `app/` afleidt.
 *
 * ⚠️ `_layout` en `+html` zijn geen schermen, en `index` valt weg uit het pad —
 *    `app/(tabs)/index.tsx` is `/(tabs)`.
 */
export function routesIn(wortel = 'app') {
  return bestandenIn(wortel)
    .filter((p) => p.endsWith('.tsx'))
    .filter((p) => !basename(p).startsWith('_') && !basename(p).startsWith('+'))
    .map((p) => ({
      bestand: p,
      pad: `/${relative(wortel, p).slice(0, -'.tsx'.length)}`.replace(/\/index$/, ''),
    }))
    .sort((a, b) => a.pad.localeCompare(b.pad));
}

/**
 * Haalt commentaar uit een bronbestand weg.
 *
 * ⚠️⚠️ **Dit is de fout waar dit script zelf in liep.** Bij het ijken zijn beide
 *    knoppen naar `/doel/plan` met de hand teruggezet naar `/doel/nieuw` — de
 *    belofte dus gebroken — en 📏 de controle bleef groen. De reden: de
 *    toelichting boven de knop noemt `/doel/plan` met zoveel woorden, en een
 *    zin over een route telde als ingang. Een controle die op zijn eigen
 *    commentaar leunt, bewaakt precies niets.
 *
 * ⚠️ `//` na een dubbele punt blijft staan — dat is `https://`, geen commentaar.
 */
export function zonderCommentaar(bron) {
  return bron.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Zoekt naar een verwijzing naar `pad` in `bron`.
 *
 * ⚠️ **Een dynamische route wordt anders gezocht dan een vaste**, en dat is het
 *    hele verschil tussen een toets en een aanname. `/doel/[id]` staat in de code
 *    als `` `/doel/${goal.id}` ``, dus er wordt op het stuk vóór de haak gezocht,
 *    gevolgd door een interpolatie. Zou je alleen op dat prefix zoeken, dan telt
 *    `/doel/nieuw` als ingang voor `/doel/[id]` — en dan bewaakt de controle niets
 *    meer voor elke route met een zusje.
 */
export function verwijstNaar(bron, pad) {
  const haak = pad.indexOf('[');

  if (haak === -1) {
    return new RegExp(`${pad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-])`).test(bron);
  }

  const prefix = pad.slice(0, haak).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${prefix}(\\$\\{|'\\s*\\+|"\\s*\\+)`).test(bron);
}

/**
 * De routes zonder enkele ingang, buiten het register om.
 *
 * ⚠️ `wortel` en `bronmappen` zijn instelbaar omdat een controle die je niet
 *    kunt voeden, niet te ijken is — zie de eis onder onwrikbare regel 18. De
 *    test bouwt er een `app/` en een `src/` mee op schijf.
 */
export function schermenZonderIngang({
  wortel = 'app',
  bronmappen = BRONMAPPEN,
  register = ZONDER_PUSH,
} = {}) {
  const bronnen = bronmappen.flatMap((map) =>
    bestandenIn(map)
      .filter((p) => /\.tsx?$/.test(p))
      // ⚠️ Een test maakt een scherm niet bereikbaar. Zie de kop.
      .filter((p) => !p.includes('.test.'))
      .map((p) => ({ bestand: p, inhoud: zonderCommentaar(readFileSync(p, 'utf8')) })),
  );

  return routesIn(wortel)
    .filter((route) => !(route.pad in register))
    .filter(
      (route) =>
        !bronnen.some((b) => b.bestand !== route.bestand && verwijstNaar(b.inhoud, route.pad)),
    )
    .map((route) => route.pad);
}

/** Registerregels die niets meer afdekken. */
export function verouderdInRegister({ wortel = 'app', register = ZONDER_PUSH } = {}) {
  const paden = new Set(routesIn(wortel).map((r) => r.pad));
  return Object.keys(register).filter((pad) => !paden.has(pad));
}

function hoofd() {
  const zonder = schermenZonderIngang();
  const verouderd = verouderdInRegister();

  if (zonder.length === 0 && verouderd.length === 0) {
    const totaal = routesIn().length;
    console.log(
      `schermingang-controle: alle ${totaal} routes hebben een ingang ` +
        `(${Object.keys(ZONDER_PUSH).length} via de tabbalk, met reden).`,
    );
    return 0;
  }

  if (zonder.length > 0) {
    console.error(`✗ ${zonder.length} scherm(en) zonder ingang:\n`);
    for (const pad of zonder) console.error(`    ${pad}`);
    console.error(
      '\nEen scherm zonder knop is af en onbereikbaar — dat is hoe de kern van\n' +
        'epic QS8-200 twee weken stil bleef liggen. Geef het een ingang, of zet\n' +
        'het met een gemeten reden in ZONDER_PUSH in dit script.',
    );
  }

  if (verouderd.length > 0) {
    console.error(`\n✗ ${verouderd.length} registerregel(s) dekken geen bestaande route meer:\n`);
    for (const pad of verouderd) console.error(`    ${pad}`);
    console.error('\nHaal ze weg; een register dat meer toestaat dan er is, groeit stil dicht.');
  }

  return 1;
}

// ⚠️ `pathToFileURL` en geen naamvergelijking: die laatste breekt op Windows.
//    De vorm staat onder test in `tests/scripts/padvormen.test.ts`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
