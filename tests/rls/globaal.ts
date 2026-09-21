import { execFileSync } from 'node:child_process';

import { niveauMelding, registerVanDatabase } from './migratieniveau';
import { PSQL_DB, PSQL_OMGEVING, psqlBasisArgumenten } from './psql-stack';
import { restMelding } from './tellerrest';

/**
 * Draait één keer, vóór de hele RLS-groep — QS8-426.
 *
 * ⚠️ **Waarom `globalSetup` en niet een test of een setupFile.** Een test die
 *    het niveau toetst, is één rode test tussen duizend groene, en hij zegt niets
 *    over de duizend andere die intussen tegen het oude schema gemeten hebben.
 *    Een `setupFile` draait per bestand — honderdveertig keer dezelfde vraag.
 *    Dit hoort een voorwaarde te zijn waaronder de suite überhaupt begint.
 *
 * ⚠️ **Zwijgen mag alleen als niemand beweerde te meten**, dezelfde afspraak als
 *    `stackBeschikbaarOfFaal()` sinds QS8-270. Zonder `RLS_DOEL` doet deze
 *    controle niets: dan draait de suite niet tegen een database en valt er niets
 *    te vergelijken.
 *
 * ⚠️ **En hij zwijgt óók als de database onbereikbaar is.** Dat is niet dezelfde
 *    zaak en heeft al een uitgewerkte melding: `stackBeschikbaarOfFaal()` houdt
 *    "geen server" en "wel server, oud schema" uit elkaar en noemt per geval wat
 *    je moet doen. Die hier overdoen zou twee meldingen voor één zaak geven, en
 *    de eerste in de volgorde wint — niet de beste.
 */
export default function setup(): () => void {
  if (!process.env.RLS_DOEL) return () => {};

  const melding = niveauMelding(registerVanDatabase());
  if (melding !== null) throw new Error(melding);

  return afsluiten;
}

/**
 * Draait één keer, ná de hele RLS-groep — QS8-442.
 *
 * ⚠️⚠️ **Ook dit is een voorwaarde over het gehéél, en daarom staat hij hier en
 *    niet in een testbestand.** Of de suite een tellerrij achterlaat die de
 *    vólgende run beïnvloedt, is niet te zien vanuit één van de
 *    honderdvierenzestig bestanden — elk daarvan ruimt keurig zijn eigen
 *    sleutels op. 📏 En tóch stond er na elke volle run `groep | g = 8`, omdat
 *    één fixture zijn groep `g` noemde.
 *
 * ⚠️ Hij werpt en waarschuwt niet. Een teller die blijft staan maakt de suite
 *    dagen later rood op een ánder bestand, en dan is het verband weg — precies
 *    het geval waar QS8-442 mee begon en waar een halve dag in ging zitten.
 */
function afsluiten(): void {
  const melding = restMelding(sleutelsInDatabase());
  if (melding !== null) throw new Error(melding);
}

/**
 * De tellersleutels die nu in de database staan.
 *
 * ⚠️ Via `psqlBasisArgumenten()` en niet met een eigen aanroep — dat is zesmaal
 *    dezelfde vergeten vlag geweest (CLAUDE.md, QS8-414).
 *
 * ⚠️ De IO staat hier en het oordeel in `tellerrest.ts`, zodat dat oordeel te
 *    voeden is zonder database. Een controle die je niet kunt voeden, kun je
 *    niet ijken.
 */
function sleutelsInDatabase(): string[] {
  const uitvoer = execFileSync(
    'psql',
    [...psqlBasisArgumenten(), '-d', PSQL_DB, '-tAc', 'select sleutel from dagtellers'],
    { env: PSQL_OMGEVING, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  return uitvoer
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel.length > 0);
}
