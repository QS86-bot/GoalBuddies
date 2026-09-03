#!/usr/bin/env node
/**
 * aansluiting-controle — een injectiepunt dat nergens wordt aangesloten.
 *
 * ⚠️ **De bevinding van 26-08 telde vier ketens die nergens verbonden waren**:
 *    `profiles.locale` (een kolom die niemand kon vullen), `verwijderPushToken()`
 *    (aan sinds EPIC 11, door niets aangeroepen), `setErrorSink()` (34 aanroepers
 *    van `reportError()`, allemaal naar de console) en een deploy vanuit een
 *    werkmap. Alle vier dezelfde vorm: **elk onderdeel af en getoetst, de keten
 *    nergens verbonden.** Er is niets kapot, dus geen enkele test wordt rood, en
 *    alle vier zijn met de hand of bij toeval gevonden — na vijf dagen tot drie
 *    maanden.
 *
 * ⚠️ **Waarom dit smal is en niet algemeen.** De algemene vorm — "elke export uit
 *    een module-barrel wordt buiten die module gebruikt" — is op 28-08 gemeten:
 *    **174 van de 493 exports** komen er niet doorheen. Dat zijn vrijwel allemaal
 *    types en Zod-schema's die legitiem aan de buitenkant staan zonder dat een
 *    greenfield-app ze al aanroept. Een controle die 174 dingen meldt, leert je
 *    hem te negeren, en dan bewaakt hij niets meer. Deze kijkt daarom alleen naar
 *    injectiepunten: functies die er zíjn om aangesloten te worden.
 *
 * ⚠️ **De kandidaten komen uit de vórm en niet uit een naamlijst, en dat is met
 *    opzet.** De bevinding noemde vier namen, en één ervan — `zetWebPushAan()` —
 *    bestond niet: die stond in een werkboom die nooit geland is. Een lijst met
 *    namen veroudert stil; een vormzoektocht vindt de vijfde die er morgen bij
 *    komt en dwingt af dat iemand hem classificeert.
 *
 * ⚠️ **Tweezijdig, zoals `zichtbaarheid-controle` en `klokgrens-controle`.** Een
 *    register dat achterloopt geeft redenen voor code die weg is. Verdwijnt een
 *    injectiepunt, dan wordt deze controle daar ook rood van.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORTEL = process.cwd();
const MAPPEN = ['src', 'app'];

/**
 * De injectiepunten van de app, met wat er stukgaat als niemand ze aanroept.
 *
 * ⚠️ Een reden en geen vinkje. Wie hier een naam neerzet zonder het gevolg op te
 *    schrijven, heeft de controle beantwoord in plaats van de vraag.
 */
export const AANSLUITPUNTEN = {
  setErrorSink:
    'Zonder aanroep gaat élke `reportError()` naar de console en bereikt geen ' +
    'enkele fout Sentry. Dat is precies wat er drie maanden lang gebeurde: 34 ' +
    'aanroepers, allemaal in het niets.',
  zetPushBron:
    'Zonder aanroep kent de tokenlaag geen bron en registreert het toestel zich ' +
    'nooit voor meldingen. De hele push-keten hangt hieraan.',
  zetTaal:
    'Zonder aanroep blijft de catalogus op de standaardtaal staan, ongeacht wat ' +
    'er in `profiles.locale` staat — de dode keten van QS8-113, één laag hoger.',
  zetTaalUitApparaat:
    'Zonder aanroep start de app op de standaardtaal én op de standaardnotatie: ' +
    'een Engelse telefoon krijgt Nederlandse teksten, en een Britse ziet ' +
    '`12/31/2026` waar `31/12/2026` hoort te staan. Dit is de startwaarde die ' +
    '`zetTaal()` later overstemt zodra `profiles.locale` gevuld is (QS8-221).',
};

/**
 * Namen die op een injectiepunt lijken maar er geen zijn, met de reden.
 *
 * ⚠️ Leeg is hier een geldige stand en geen teken dat er niets gebeurt: vandaag
 *    is élke `zet*`/`set*`-export ook echt een injectiepunt. Zodra er een
 *    bijkomt die dat niet is, hoort hij hier met zijn reden.
 */
export const GEEN_AANSLUITPUNT = {};

/** Alle `.ts`/`.tsx` onder `dir`. */
function bronbestanden(dir, uit = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '.git', 'dist', '.expo'].includes(e.name)) bronbestanden(p, uit);
    } else if (/\.tsx?$/.test(e.name)) {
      uit.push(p);
    }
  }
  return uit;
}

/**
 * De injectiepunten die dit bestand definieert.
 *
 * ⚠️ **`zet`/`set` gevolgd door een hoofdletter, én synchroon.** Die tweede helft
 *    is nodig en is nagemeten. In het Nederlands betekent "zet" óók "schrijf deze
 *    waarde weg", en zonder die eis meldt deze controle dertien namen waarvan er
 *    tien gewone schrijfacties zijn: `zetStreefdatum`, `zetBeloning`, `zetDagzet`,
 *    `zetArchief` en zo verder.
 *
 * ⚠️ **De scheiding is op 28-08 gemeten en was volledig:** alle tien schrijvers
 *    zijn `async`, alle drie injectiepunten zijn synchroon. Dat is geen toeval —
 *    een injectiepunt zet modulestatus en is klaar; een schrijver wacht op de
 *    API. Maar het is een regelmaat en geen wet: komt er ooit een synchrone
 *    schrijver, dan meldt deze controle hem en hoort hij met zijn reden in
 *    `GEEN_AANSLUITPUNT`. Dat is precies het gedrag dat je wilt — hij vraagt om
 *    een classificatie in plaats van te raden.
 */
export function injectiepuntenIn(bron) {
  const namen = [];
  for (const m of bron.matchAll(/export\s+function\s+((?:zet|set)[A-Z]\w*)/g)) {
    namen.push(m[1]);
  }
  // ⚠️ De witruimte staat binnen de lookahead en niet ervoor. Met `\s*(?!async)`
  //    schuift de regex-engine `\s*` terug tot de lookahead op een spatie staat,
  //    en dan slaagt hij alsnog — een async-const kwam er zo gewoon doorheen. De
  //    ijkingstest ving dat.
  for (const m of bron.matchAll(/export\s+const\s+((?:zet|set)[A-Z]\w*)\s*[:=](?!\s*async\b)/g)) {
    namen.push(m[1]);
  }
  return namen;
}

/**
 * Wordt `naam` ergens aangeroepen, buiten zijn eigen bestand en buiten tests?
 *
 * ⚠️ **Het eigen bestand telt niet mee.** Een injectiepunt dat alleen door zijn
 *    eigen module wordt aangeroepen, is nog steeds niet aangesloten — dat was de
 *    situatie van `setErrorSink()`.
 *
 * ⚠️ **Tests tellen ook niet mee, en dat is de kern van deze controle.** Alle
 *    vier de dode ketens hadden een groene test; wat ontbrak was een áánroep in
 *    de app.
 *
 * @param {string} naam
 * @param {{ pad: string, bron: string }[]} bestanden
 * @param {string} eigenBestand
 */
export function wordtAangesloten(naam, bestanden, eigenBestand) {
  const patroon = new RegExp(`\\b${naam}\\s*\\(`);
  return bestanden.some(
    (b) => b.pad !== eigenBestand && !/\.test\.tsx?$/.test(b.pad) && patroon.test(b.bron),
  );
}

/**
 * Legt de gevonden injectiepunten naast de twee registers.
 *
 * `losseDraden` — een injectiepunt dat niemand aansluit.
 * `onbekend`    — lijkt er een en staat in geen van beide registers.
 * `verdwenen`   — staat in het register maar bestaat niet meer.
 *
 * ⚠️ De typen staan hier en niet als cast in de test. Zonder deze JSDoc leidt
 *    TypeScript het type van `punten` af uit de standaardwaarde, en dan is een
 *    fixture met ándere namen een fout in plaats van een geval. Dezelfde
 *    oplossing als bij `dode-keten-controle.mjs`.
 *
 * @param {{ pad: string, bron: string }[]} bestanden
 * @param {Record<string, string>} [punten]
 * @param {Record<string, string>} [geen]
 */
export function beoordeel(bestanden, punten = AANSLUITPUNTEN, geen = GEEN_AANSLUITPUNT) {
  const gevonden = new Map();
  for (const b of bestanden) {
    if (/\.test\.tsx?$/.test(b.pad)) continue;
    for (const naam of injectiepuntenIn(b.bron)) gevonden.set(naam, b.pad);
  }

  const bekend = new Set([...Object.keys(punten), ...Object.keys(geen)]);

  return {
    losseDraden: [...gevonden.entries()]
      .filter(([naam]) => naam in punten)
      .filter(([naam, pad]) => !wordtAangesloten(naam, bestanden, pad))
      .map(([naam]) => naam),
    onbekend: [...gevonden.keys()].filter((n) => !bekend.has(n)),
    verdwenen: [...bekend].filter((n) => !gevonden.has(n)),
  };
}

function hoofd() {
  const bestanden = MAPPEN.flatMap((m) => bronbestanden(join(WORTEL, m))).map((pad) => ({
    pad,
    bron: readFileSync(pad, 'utf8'),
  }));

  const { losseDraden, onbekend, verdwenen } = beoordeel(bestanden);

  for (const naam of losseDraden) {
    console.error(
      `✗ ${naam}() wordt nergens aangeroepen buiten zijn eigen bestand en buiten tests.\n` +
        `    ${AANSLUITPUNTEN[naam]}`,
    );
  }
  for (const naam of onbekend) {
    console.error(
      `✗ ${naam}() ziet eruit als een injectiepunt en staat in geen van beide registers.`,
    );
  }
  for (const naam of verdwenen) {
    console.error(`✗ het register noemt ${naam}(), maar die bestaat niet meer.`);
  }

  if (losseDraden.length + onbekend.length + verdwenen.length > 0) {
    console.error(
      '\nDit is de klasse waar niets van rood wordt: elk onderdeel af en getoetst, de\n' +
        'keten nergens verbonden. Sluit hem aan, of zet hem met zijn reden in\n' +
        'GEEN_AANSLUITPUNT — en haal een naam eruit zodra hij niet meer bestaat.',
    );
    return 1;
  }

  console.log(
    `aansluiting-controle: ${Object.keys(AANSLUITPUNTEN).length} injectiepunten, allemaal aangesloten.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
