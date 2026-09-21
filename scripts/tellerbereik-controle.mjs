#!/usr/bin/env node
/**
 * tellerbereik-controle — elke schrijfactie op `dagtellers` in `tests/rls/`
 * bakent haar eigen sleutels af (QS8-442).
 *
 * ⚠️⚠️ **Waarom uitgerekend deze tabel.** `dagtellers` is met opzet gebouwd om
 *    een `delete` te overleven: hij telt de handelingen die er wáren en niet de
 *    rijen die er staan (QS8-399, migratie 0233). Dat maakt hem de enige tabel
 *    in dit schema waar de gewone fixture-opruiming níets aan doet — een rij
 *    hangt niet aan een gebruiker of een groep die `removeTestUsers()` weghaalt,
 *    maar aan een tekstsleutel die niemand bezit. Wat er blijft staan, staat er
 *    de volgende run nog.
 *
 * ⚠️⚠️ **De belofte stond er al en werd maar half afgedwongen.** De kop van
 *    `tests/rls/nevenschade.test.ts` zegt met zoveel woorden: *"Een testbestand
 *    schrijft nooit buiten zijn eigen fixture."* Alles wat dat bestand tóetst
 *    gaat over **databasefuncties** — `pg_get_functiondef()`, een `where` die de
 *    aanroeper meegeeft. De rauwe SQL van de testbestanden zelf is er nooit langs
 *    gekomen. Regel 18 in zijn zuiverste vorm: de belofte is van het geheel, de
 *    toets van een onderdeel.
 *
 * 📏 **Het gemeten geval.** `tests/rls/dagteller-overleeft-wissen.test.ts` deed
 *
 *      update dagtellers set venster_start = now() - interval '25 hours';
 *
 *    zonder `where`. Met een vreemde tellerrij ernaast gemeten op 13-09-2026:
 *
 *      VOOR:  aantal=5 start=2026-09-13 05:11:13+00
 *      NA:    aantal=5 start=2026-09-12 04:11:21+00
 *
 *    Het aantal bleef staan en het vénster ging een etmaal terug — dus de
 *    eerstvolgende `tel_dagteller()` zet de teller op 1 en het plafond vuurt
 *    niet. Dat is precies de faalsignatuur *"expected GEWEIGERD, got OK"* waar
 *    QS8-442 mee begon, en waar geen mechanisme bij stond.
 *
 * ⚠️⚠️ **En het venijn zat in het commentaar.** Vier regels boven die `update`
 *    legt `leeg()` in hetzelfde bestand uitgebreid uit waaróm een kale
 *    `delete from dagtellers` fout is. Die uitleg klopte, hij stond op de goede
 *    plek — en hij ging over het verkeerde werkwoord. **Een gevaar dat
 *    uitgeschreven naast zich staat, leest als een gevaar dat afgevangen is.**
 *
 * ## Wat deze controle wél en niet ziet
 *
 * De regel is: een `update` of `delete` op `dagtellers` heeft een `where`, en
 * die `where` noemt een waarde die per run verschilt (een `${…}`-interpolatie).
 *
 * ⚠️ **`where domein = 'chatdocs'` is dus niet genoeg, en dat is de bedoeling.**
 *    Drie bestanden schrijven in dat domein; een domeinbrede opruiming wist de
 *    teller van de andere twee. Dat is dezelfde fout als de kale delete, alleen
 *    met een kleinere straal.
 *
 * ⚠️ **Wat hij niet ziet:** `where domein = '${DOMEIN}'` met een constante
 *    erachter. De interpolatie is het signaal, niet het bewijs — om te weten of
 *    een naam per run verschilt zou je de bindingen moeten volgen, en dat is
 *    voor deze vraag meer machinerie dan hij waard is. Hij vangt de vorm die
 *    twee keer gemeten is; dat staat hier opgeschreven in plaats van
 *    weggelaten.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    voeden, kun je niet ijken. `tests/scripts/tellerbereik-controle.test.ts`
 *    biedt hem elke vorm apart aan — die hij moet vinden én die hij met rust
 *    moet laten.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { zonderCommentaar } from './zonder-commentaar.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = 'tests/rls';

/** Het begin van een schrijfactie op de tellertabel, met of zonder schema. */
export const SCHRIJFACTIE = /\b(delete\s+from|update)\s+(?:public\.)?dagtellers\b/gi;

/**
 * De schrijfacties die bewust geen eigen bereik noemen, met de reden per stuk.
 *
 * ⚠️ **Op de statement en niet op het bestand.** Een uitzondering per bestand
 *    zou ook de schrijfactie vrijstellen die er morgen bijkomt. Zelfde
 *    overweging als in `gedeelde-identiteit-controle.mjs`, en om dezelfde reden.
 */
export const ZONDER_BEREIK = {};

/**
 * ⚠️ De knip komt sinds QS8-446 uit één bron. Hij stond hier als eigen kopie —
 *    in de veilige regelvorm, maar wél als kopie, en dat is precies wat QS8-446
 *    opleverde.
 */
export { zonderCommentaar };

/**
 * Elke schrijfactie op `dagtellers` in deze bron, als losse statement.
 *
 * ⚠️ Een statement loopt tot de eerstvolgende `;` of het einde van het
 *    sjabloonliteral — precies zoals `psql` hem opknipt. Zonder die grens zou
 *    een `where` van het vólgende statement als bereik meetellen.
 */
export function schrijfacties(bron) {
  const schoon = zonderCommentaar(bron);
  const uit = [];

  for (const treffer of schoon.matchAll(SCHRIJFACTIE)) {
    const begin = treffer.index ?? 0;
    const rest = schoon.slice(begin);
    const einde = rest.search(/[;`]/);
    uit.push((einde === -1 ? rest : rest.slice(0, einde)).replace(/\s+/g, ' ').trim());
  }

  return uit;
}

/** Of deze schrijfactie haar eigen sleutels afbakent. */
export function heeftEigenBereik(statement) {
  const where = /\bwhere\b(.*)$/is.exec(statement);
  return where !== null && where[1].includes('${');
}

/** Wat er mis is aan deze bron, als leesbare regels. */
export function klachten(bron, pad) {
  return schrijfacties(bron)
    .filter((statement) => !heeftEigenBereik(statement))
    .filter((statement) => ZONDER_BEREIK[statement] === undefined)
    .map((statement) => `${pad}: schrijft op dagtellers zonder eigen bereik — ${statement}`);
}

function bestanden(map) {
  const uit = [];
  for (const naam of readdirSync(join(WORTEL, map), { withFileTypes: true })) {
    const kind = join(map, naam.name);
    if (naam.isDirectory()) uit.push(...bestanden(kind));
    else if (naam.name.endsWith('.ts')) uit.push(kind);
  }
  return uit;
}

export function hoofd() {
  const paden = bestanden(MAP);
  const gevonden = paden.flatMap((pad) =>
    klachten(readFileSync(join(WORTEL, pad), 'utf8'), relative('.', pad)),
  );

  if (gevonden.length > 0) {
    console.error('tellerbereik-controle: een schrijfactie op `dagtellers` raakt andere suites.\n');
    for (const regel of gevonden) console.error(`  ${regel}`);
    console.error(
      '\n  Noem in de `where` een waarde die per run verschilt (een proefId of een\n' +
        '  proefCode). `where domein = \'…\'` is niet genoeg: meer bestanden delen\n' +
        '  een domein. Hoort hij er echt zo te staan, zet hem dan met zijn reden in\n' +
        '  ZONDER_BEREIK in dit script.',
    );
    return 1;
  }

  console.log(`tellerbereik-controle: elke schrijfactie op \`dagtellers\` noemt haar bereik (${paden.length} bestanden).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
