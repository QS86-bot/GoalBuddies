import { describe, expect, it, beforeAll } from 'vitest';

import { schoneNaam, zonderNulPixels } from '../../src/shared/tekst';

import {
  PSQL_OMGEVING,
  psqlBasisArgumenten,
  psqlParallel,
  stackBeschikbaarOfFaal,
} from './psql-stack';

import { execFileSync } from 'node:child_process';

/**
 * De naad van QS8-506: de client stelt twee bewerkingen op elkáár, de database
 * toetst twee CHECKs naást elkaar — en die twee moeten het eens zijn.
 *
 * ⚠️⚠️ **Dit is een andere naad dan die van `naamnormalisatie.test.ts`, en dat
 *    is de hele reden dat dit bestand bestaat.** Dat bestand legt één
 *    SQL-functie naast één TypeScript-functie en vraagt of ze dezelfde
 *    codepunten strijken. Hier is de vraag samengesteld:
 *
 *      client:    zonderNulPixels(x) = zonderOnzichtbaarMiddenin(zonderBidi(x))
 *      database:  x = zonder_bidi(x)  ÉN  x = zonder_onzichtbaar_middenin(x)
 *
 *    De client ketent; de database toetst twee onafhankelijke uitspraken over de
 *    **opgeslagen** waarde. Twee functies die elk perfect spiegelen, kunnen als
 *    samenstelling alsnog een waarde opleveren die de database weigert — en dan
 *    ziet de gebruiker `opslaan mislukt` op tekst die de app zojuist zelf heeft
 *    schoongemaakt. Dat is de storing die 0283 belooft niet te maken.
 *
 * ⚠️ **De belofte en niet het onderdeel** (onwrikbare regel 18, vraag 2). Deze
 *    toets vraagt niet *"bestaat er een CHECK"* — dat is een eigenschap van het
 *    onderdeel en blijft groen terwijl de belofte breekt. Hij vraagt: *is er een
 *    invoer waarvoor de uitkomst van de client door de database geweigerd
 *    wordt?*
 *
 * ⚠️ **Waarom een veeg en geen handvol gevallen.** De hazard zit per definitie
 *    in codepunten waar de twee stappen elkaars context veranderen — het
 *    wegnemen van een bidi-teken maakt twee letters buren. Welke dat zijn, is
 *    precies wat je niet vooraf weet; een lijst die je zelf verzint, toetst je
 *    eigen aanname. 📏 Eén veeg over het hele bereik kost ~74 s en vier
 *    tegelijk ook — zie `psqlParallel()`.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  'select 1',
  'tests/rls/nulpixelkolommen.test.ts',
);

/** Het bereik, identiek afgebakend aan dat van `naamnormalisatie.test.ts`. */
const BEREIK = 'from generate_series(1, 1114111) cp where (cp < 55296 or cp > 57343) ';

/**
 * De dertien kolommen die 0283 raakt, als paren tabel/kolom.
 *
 * ⚠️ **Deze lijst is de scope van het issue en niet van de regel.** Wat er
 *    buiten valt en waarom staat in de kop van 0283 en in QS8-507; die twee
 *    dragen de meting, dit bestand draagt de toets.
 */
const KOLOMMEN: readonly (readonly [string, string])[] = [
  ['groups', 'name'],
  ['groups', 'icon'],
  ['groups', 'omschrijving'],
  ['goals', 'title'],
  ['weekly_goals', 'title'],
  ['weekly_goals', 'ceiling_text'],
  ['weekly_goals', 'floor_text'],
  ['weekly_plan_steps', 'title'],
  ['weekly_plan_steps', 'ceiling_text'],
  ['weekly_plan_steps', 'floor_text'],
  ['completions', 'note'],
  ['deadline_requests', 'reason'],
  ['group_join_requests', 'bericht'],
];

/**
 * De must-allows, letterlijk zoals de acceptatiecriteria ze noemen.
 *
 * ⚠️ De gezinsemoji draagt ZWJ's *midden* in de reeks; dat is precies het geval
 *    waar `zonder_onzichtbaar_middenin()` overheen moet kijken.
 */
const MUST_ALLOW: readonly { readonly naam: string; readonly waarde: string }[] = [
  { naam: 'gezinsemoji', waarde: '\u{1F468}‍\u{1F469}‍\u{1F467}' },
  { naam: 'Perzisch', waarde: 'سلام دنیا' },
  { naam: 'Hindi', waarde: 'नमस्ते दुनिया' },
  { naam: 'Bengaals', waarde: 'হ্যালো বিশ্ব' },
  {
    naam: 'subdivisievlag',
    waarde: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  },
];

function viaPsql(sql: string): string {
  return execFileSync('psql', [...psqlBasisArgumenten(), '-c', sql], {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** Eén regel per codepunt, als getal. */
function alsCodepunten(uit: string): Set<number> {
  return new Set(
    uit
      .split('\n')
      .filter((regel) => regel.trim() !== '')
      .map((regel) => Number.parseInt(regel, 10)),
  );
}

let clientOutputGeweigerd: Set<number> | undefined;
let dbWeigert: Set<number> | undefined;
let naamOutputGeweigerd: Set<number> | undefined;

/**
 * ⚠️ **Werpen en niet leeg teruggeven** — zelfde reden als in
 *    `naamnormalisatie.test.ts`: een lege verzameling is stil groen.
 */
function geweigerdeClientUitvoer(): Set<number> {
  if (clientOutputGeweigerd === undefined) throw new Error('de veeg is niet gedraaid');
  return clientOutputGeweigerd;
}

function geweigerdDoorDeDatabase(): Set<number> {
  if (dbWeigert === undefined) throw new Error('de veeg is niet gedraaid');
  return dbWeigert;
}

function geweigerdeNaamUitvoer(): Set<number> {
  if (naamOutputGeweigerd === undefined) throw new Error('de naamveeg is niet gedraaid');
  return naamOutputGeweigerd;
}

/**
 * Eén veeg: wat de client van een codepunt maakt, langs de CHECKs van één kolom.
 *
 * ⚠️ De waarden gaan als één tijdelijke tabel naar binnen. 1.1M losse vragen zou
 *    een dag duren, en 1.1M literals in één statement past niet in een
 *    commandoregel.
 */
function veegLangsDeChecks(
  maakWaarde: (cp: number) => string,
  voorwaarde: (w: string) => string,
): Set<number> {
  const regels: string[] = [];
  for (let cp = 1; cp <= 1114111; cp += 1) {
    if (cp >= 55296 && cp <= 57343) continue;
    const uit = maakWaarde(cp);
    regels.push(`${cp}\t${Buffer.from(uit, 'utf8').toString('hex')}`);
  }

  const invoerSql =
    'create temporary table client_uitvoer (cp int primary key, hex text);\n' +
    'copy client_uitvoer (cp, hex) from stdin;\n' +
    `${regels.join('\n')}\n\\.\n` +
    "select cp from client_uitvoer, lateral (select convert_from(decode(hex, 'hex'), 'UTF8') as w) s " +
    `where ${voorwaarde('w')} order by cp;`;

  return alsCodepunten(
    execFileSync('psql', [...psqlBasisArgumenten()], {
      env: PSQL_OMGEVING,
      encoding: 'utf8',
      input: invoerSql,
      maxBuffer: 512 * 1024 * 1024,
    }),
  );
}

beforeAll(async () => {
  if (!beschikbaar) return;

  // De context waarin de hazard kán optreden: een teken tussen twee letters,
  // met een bidi-teken ernaast dat de client als eerste weghaalt.
  const uitdr = "'A' || chr(cp) || chr(8207) || 'B'";

  // Wat de database van díe waarde vindt — weigert een van beide CHECKs hem?
  const dbVraag =
    `select cp ${BEREIK}and (${uitdr} <> public.zonder_bidi(${uitdr}) ` +
    `or ${uitdr} <> public.zonder_onzichtbaar_middenin(${uitdr})) order by cp;`;

  const [dbUit] = await psqlParallel([dbVraag]);
  dbWeigert = alsCodepunten(dbUit ?? '');

  // En wat de database vindt van wat de **client** ervan maakt.
  const beideRegels = (w: string): string =>
    `${w} <> public.zonder_bidi(${w}) or ${w} <> public.zonder_onzichtbaar_middenin(${w})`;

  clientOutputGeweigerd = veegLangsDeChecks(
    (cp) => zonderNulPixels(`A${String.fromCodePoint(cp)}\u200F B`),
    beideRegels,
  );

  // ⚠️⚠️ **En `groups.name` apart, want die kolom heeft een ándere spiegel en
  //    twee CHECKs meer** — gevonden in de security-review op QS8-506. Zijn
  //    client is `schoneNaam()` en niet `zonderNulPixels()`, en hij draagt sinds
  //    0283 vier tekst-CHECKs in plaats van twee. Die samenstelling stond
  //    nergens onder toets: de veeg hierboven zou groen blijven terwijl
  //    `schoneNaam()` iets oplevert dat de contextregel weigert.
  naamOutputGeweigerd = veegLangsDeChecks(
    (cp) => schoneNaam(`A${String.fromCodePoint(cp)}\u200F B`),
    (w) =>
      `${beideRegels(w)} or ${w} <> public.zonder_onzichtbaar_tussen_letters(${w}) ` +
      `or ${w} <> public.zonder_losse_tags(${w})`,
  );
}, 1_800_000);

describe.runIf(beschikbaar)('wat de client oplevert, neemt de database aan', () => {
  it('weigert geen enkele uitkomst van `zonderNulPixels()`', () => {
    const geweigerd = [...geweigerdeClientUitvoer()];

    // ⚠️ De melding noemt de codepunten zelf: een lijst van getallen is hier het
    //    hele bewijs, en "expected 0 to be 3" stuurt de lezer nergens heen.
    expect(
      geweigerd,
      geweigerd.length === 0
        ? ''
        : `de client levert tekst op die de database weigert, bij codepunt(en): ${geweigerd
            .slice(0, 40)
            .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
            .join(', ')}`,
    ).toEqual([]);
  });

  /**
   * ⚠️ **Zonder deze toets bewaakt de vorige niets** (regel 18, vraag 3). Als de
   *    database in deze context niets zou weigeren, is "de client levert niets
   *    geweigerds op" waar om de verkeerde reden — en dan blijft hij groen
   *    zodra iemand de CHECK sloopt.
   */
  it('en de database weigert in deze context wél degelijk iets', () => {
    expect(geweigerdDoorDeDatabase().size).toBeGreaterThan(0);
  });

  /**
   * ⚠️ `groups.name` heeft een ándere spiegel (`schoneNaam()`) en twee CHECKs
   *    meer. Zie de tweede veeg in `beforeAll`.
   */
  it('weigert ook geen enkele uitkomst van `schoneNaam()` op `groups.name`', () => {
    const geweigerd = [...geweigerdeNaamUitvoer()];

    expect(
      geweigerd,
      geweigerd.length === 0
        ? ''
        : `schoneNaam() levert een groepsnaam op die de database weigert, bij ` +
          `codepunt(en): ${geweigerd
            .slice(0, 40)
            .map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
            .join(', ')}`,
    ).toEqual([]);
  });
});

describe.runIf(beschikbaar)('de dertien kolommen dragen allebei de CHECKs', () => {
  it('elk van de dertien noemt zowel de bidi- als de nul-pixelregel', () => {
    const uit = viaPsql(
      "select c.relname || '.' || a.attname || ' ' || " +
        "  (case when exists (select 1 from pg_constraint k where k.conrelid = c.oid " +
        "     and pg_get_constraintdef(k.oid) like '%zonder_bidi%' " +
        "     and pg_get_constraintdef(k.oid) like '%' || a.attname || '%') then 'bidi' else '-' end) || ' ' || " +
        "  (case when exists (select 1 from pg_constraint k where k.conrelid = c.oid " +
        "     and pg_get_constraintdef(k.oid) like '%zonder_onzichtbaar_middenin%' " +
        "     and pg_get_constraintdef(k.oid) like '%' || a.attname || '%') then 'nulpixel' else '-' end) " +
        'from pg_attribute a join pg_class c on c.oid = a.attrelid ' +
        "join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' " +
        `and (c.relname, a.attname) in (${KOLOMMEN.map(([t, k]) => `('${t}','${k}')`).join(',')}) ` +
        'order by 1;',
    );

    const rijen = uit.split('\n').filter((r) => r.trim() !== '');

    expect(rijen).toHaveLength(KOLOMMEN.length);
    expect(rijen.filter((r) => !r.endsWith(' bidi nulpixel'))).toEqual([]);
  });
});

describe.runIf(beschikbaar)('de must-allows overleven allebei de kanten', () => {
  it.each(MUST_ALLOW)('laat $naam heel op de client', ({ waarde }) => {
    expect(zonderNulPixels(waarde)).toBe(waarde);
  });

  it('en de database neemt ze alle vijf aan', () => {
    const vragen = MUST_ALLOW.map(({ waarde }) => {
      const hex = Buffer.from(waarde, 'utf8').toString('hex');
      return (
        `select (w = public.zonder_bidi(w) and w = public.zonder_onzichtbaar_middenin(w)) ` +
        `from (select convert_from(decode('${hex}', 'hex'), 'UTF8') as w) s;`
      );
    }).join('\n');

    const uit = execFileSync('psql', [...psqlBasisArgumenten()], {
      env: PSQL_OMGEVING,
      encoding: 'utf8',
      input: vragen,
    });

    const antwoorden = uit.split('\n').filter((r) => r.trim() !== '');
    expect(antwoorden).toEqual(MUST_ALLOW.map(() => 't'));
  });
});
