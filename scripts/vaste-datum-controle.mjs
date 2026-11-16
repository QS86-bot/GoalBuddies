#!/usr/bin/env node
/**
 * vaste-datum-controle — een RLS-toets met een vaste streefdatum die binnenkort
 * verloopt. QS8-675.
 *
 * ⚠️ **Waarom dit bestaat.** Sinds migratie 0170 weigert de database een
 *    streefdatum in het verleden (`goals_insert`, `zet_streefdatum()`,
 *    `vraag_deadline_verschuiving()`). Een toets met `target_date: '2026-11-07'`
 *    is dus een toets met een houdbaarheidsdatum. 📏 Op 09-11-2026 stond
 *    `RLS-policies` rood op `main` en op elke PR zonder dat er iets veranderd was;
 *    dat was de vierde keer dat een vaste datum in deze familie verliep.
 *
 * ⚠️ **Het venster en niet een verbod.** Een datum ver weg is geen defect, en
 *    honderd literals omzetten in een hulpfunctie zonder dat de suite ze kan
 *    meten is zelf een risico. De regel is: een vaste datum voor `target_date`,
 *    `p_new_date` of `p_date` moet minstens `VENSTER_DAGEN` dagen weg liggen.
 *    Zo wordt de controle rood **vóór** de toets dat wordt, met vier maanden
 *    voorsprong, en niet erna. `datumOver()` in `tests/rls/datums.ts` is de weg
 *    eruit die nooit verloopt.
 *
 * ⚠️ **Wat hij níet kan.** Hij kijkt naar drie sleutels. Een datum die onder een
 *    andere sleutel staat (`cycle_start_date`, `local_date`) wordt niet tegen
 *    "vandaag" gehouden door het schema en valt erbuiten; een datum die via een
 *    variabele binnenkomt (`const d = '2026-11-07'; … target_date: d`) ziet hij
 *    ook niet. Dat is een beperking van de vorm, en geen bewijs dat die plekken
 *    in orde zijn.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = 'tests/rls';

export const VENSTER_DAGEN = 120;

/** De sleutels die het schema tegen "vandaag" houdt. */
const SLEUTELS = ['target_date', 'p_new_date', 'p_date'];

/**
 * Plekken waar een vaste datum onder een van die sleutels staat zonder dat het
 * schema hem tegen "vandaag" houdt, met de reden. Sleutel: pad + ':' + de datum.
 */
/** @type {Record<string, string>} */
export const ZONDER_VERLOOP = {
  'tests/rls/policies.test.ts:2026-01-01':
    'Een waarde in de jsonb-payload van `goal_events.old_value` bij een insert die juist ' +
    'geweigerd moet worden (42501). Niemand legt hem naast "vandaag".',
  'tests/rls/policies.test.ts:2027-01-01':
    'Idem, `new_value` van dezelfde geweigerde insert.',
};

const LITERAAL = new RegExp(
  `\\b(${SLEUTELS.join('|')})['"]?\\s*:\\s*['"](\\d{4}-\\d{2}-\\d{2})['"]`,
  'g',
);

function dagenTot(datum, vandaag) {
  const [j, m, d] = datum.split('-').map(Number);
  const [vj, vm, vd] = vandaag.split('-').map(Number);
  return Math.round((Date.UTC(j, m - 1, d) - Date.UTC(vj, vm - 1, vd)) / 86_400_000);
}

/**
 * @param {{ pad: string, inhoud: string }[]} bestanden
 * @param {string} vandaag  ISO-datum, bijvoorbeeld '2026-11-09'
 * @param {number} venster
 * @param {Record<string, string>} uitzonderingen
 * @returns {{ pad: string, regel: number, sleutel: string, datum: string, dagen: number }[]}
 */
export function vindVerlopende(
  bestanden,
  vandaag,
  venster = VENSTER_DAGEN,
  uitzonderingen = ZONDER_VERLOOP,
) {
  const gevonden = [];
  for (const { pad, inhoud } of bestanden) {
    inhoud.split('\n').forEach((tekst, i) => {
      // Commentaar telt niet mee: de uitleg noemt juist de datums die verlopen.
      const regel = tekst.trim();
      if (regel.startsWith('//') || regel.startsWith('*') || regel.startsWith('/*')) return;
      for (const m of tekst.matchAll(LITERAAL)) {
        const [, sleutel, datum] = m;
        if (Object.hasOwn(uitzonderingen, `${pad}:${datum}`)) continue;
        const dagen = dagenTot(datum, vandaag);
        if (dagen < venster) gevonden.push({ pad, regel: i + 1, sleutel, datum, dagen });
      }
    });
  }
  return gevonden;
}

/** Uitzonderingen die nergens meer naar wijzen: een register dat stil vol loopt. */
export function wezen(bestanden, uitzonderingen = ZONDER_VERLOOP) {
  return Object.keys(uitzonderingen).filter((sleutel) => {
    const i = sleutel.lastIndexOf(':');
    const pad = sleutel.slice(0, i);
    const datum = sleutel.slice(i + 1);
    const bestand = bestanden.find((b) => b.pad === pad);
    return !bestand || !bestand.inhoud.includes(`'${datum}'`);
  });
}

function leesToetsen() {
  return readdirSync(join(WORTEL, MAP))
    .filter((naam) => /\.test\.ts$/.test(naam))
    .map((naam) => ({
      pad: `${MAP}/${naam}`,
      inhoud: readFileSync(join(WORTEL, MAP, naam), 'utf8'),
    }));
}

export function hoofd(bestanden = leesToetsen(), vandaag = new Date().toISOString().slice(0, 10)) {
  const klachten = vindVerlopende(bestanden, vandaag);
  const weesjes = wezen(bestanden);

  for (const k of klachten) {
    const wanneer = k.dagen < 0 ? `${-k.dagen} dagen geleden` : `over ${k.dagen} dagen`;
    console.error(
      `✗ ${k.pad}:${k.regel} zet ${k.sleutel}: '${k.datum}' (${wanneer}) — de database weigert ` +
        `een streefdatum in het verleden (0170). Gebruik datumOver() uit tests/rls/datums.ts.`,
    );
  }
  for (const w of weesjes) {
    console.error(`✗ ZONDER_VERLOOP noemt '${w}', maar die plek bestaat niet meer. Haal de rij weg.`);
  }
  if (klachten.length + weesjes.length > 0) return 1;

  console.log(
    `vaste-datum-controle: geen vaste ${SLEUTELS.join('/')} in ${MAP}/ die binnen ` +
      `${VENSTER_DAGEN} dagen verloopt (${bestanden.length} toetsbestanden).`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
