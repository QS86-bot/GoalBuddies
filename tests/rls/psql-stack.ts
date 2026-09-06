import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Eén psql-omgeving voor de RLS-tests die de database rechtstreeks lezen.
 *
 * ⚠️ **Waarom dit bestaat.** Vier testbestanden hadden ieder hun eigen kopie van
 *    dezelfde vijftien regels, en drie ervan stonden op poort **5432** terwijl
 *    `scripts/lokale-stack.sh` op `${PGPORT:-5433}` draait. Zonder `PGPORT` in de
 *    omgeving verbond geen van die drie ergens mee, sloegen ze zichzelf over, en
 *    gaf de suite **exitcode 0**: dertig tests weg, en de poort las groen.
 *    Gemeten: 863 geslaagd / 31 overgeslagen zonder `PGPORT`, tegen 893 / 1
 *    ermee. QS8-270.
 *
 * ⚠️ **Het poortnummer was de oorzaak, maar de skip is het defect.** `CLAUDE.md`
 *    zegt dat een controle zonder database niet groen is maar *ongemeten*, en de
 *    poort houdt die twee uit elkaar — voor de `*:controle`-scripts. Voor vitest
 *    doet niemand dat: een overgeslagen bestand verdwijnt in de telling. Daarom
 *    **werpt** `stackBeschikbaarOfFaal()` zodra `RLS_DOEL` gezet is. Wie zegt dat
 *    hij de RLS-suite draait, hoort niet stil dertig tests te kunnen overslaan.
 *
 * ⚠️ **Zelfde familie als QS8-268, andere helft.** Daar noemden zes scripts een
 *    verkeerde reden ("start de stack" terwijl die draaide); hier noemt niemand
 *    een reden. Vandaar dat de melding hieronder de twee gevallen uit elkaar
 *    houdt: geen verbinding tegenover een schema dat het gezochte object mist.
 */

/**
 * De omgeving waarin `psql` draait.
 *
 * ⚠️ **5433 en niet 5432.** `scripts/lokale-stack.sh` draait op `${PGPORT:-5433}`;
 *    een andere standaard hier betekent dat de tests naar een database wijzen die
 *    er niet is. Dit getal staat nog op precies één plek in de testboom, en dat
 *    is de reparatie: vier kopieën is hoe het misging.
 *
 * ⚠️ **`PGUSER` met een standaard**, om dezelfde reden als in `scripts/psql.mjs`
 *    (QS8-268): zonder valt psql terug op de OS-gebruiker, en die heet in een
 *    bouwomgeving `root`.
 */
export const PSQL_OMGEVING: NodeJS.ProcessEnv = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? '127.0.0.1',
  PGPORT: process.env.PGPORT ?? '5433',
  PGUSER: process.env.PGUSER ?? 'postgres',
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
};

/** De database die de lokale stack opbouwt. */
export const PSQL_DB = process.env.PGDATABASE ?? 'goalbuddies_rls';

/**
 * Voert SQL uit en geeft de kale uitvoer terug.
 *
 * `verbose` zet `VERBOSITY=verbose` aan, wat de foutmeldingen van Postgres
 * uitgebreider maakt. Standaard uit, want een test die op een foutregel let,
 * krijgt er anders ongevraagd andere tekst.
 */
export function psql(sql: string, { verbose = false } = {}): string {
  const args = [
    '-U',
    PSQL_OMGEVING.PGUSER as string,
    '-d',
    PSQL_DB,
    '-q',
    '-w',
    '-v',
    'ON_ERROR_STOP=1',
    ...(verbose ? ['-v', 'VERBOSITY=verbose'] : []),
    '-tAc',
    sql,
  ];

  return execFileSync('psql', args, { env: PSQL_OMGEVING, encoding: 'utf8' }).trim();
}

/** Wat er met deze suite moet gebeuren. */
export type Stackoordeel = 'meten' | 'overslaan' | 'geen-verbinding' | 'schema-loopt-achter';

/**
 * De hele regel van QS8-270, los van psql en los van de omgeving.
 *
 * ⚠️ **`overslaan` is de enige stand waarin zwijgen mag**, en die geldt alleen
 *    als niemand beweerde te meten — dus zonder `RLS_DOEL`, zoals bij een kale
 *    `npm test` op een machine zonder stack. Staat `RLS_DOEL` wél, dan is er
 *    geen stand waarin een bestand zichzelf stil mag overslaan.
 *
 * ⚠️ **Twee foutstanden en niet één.** Geen verbinding is iets anders dan een
 *    database die het gezochte object mist; dat tweede betekent meestal een
 *    schema dat achterloopt op de migraties. Eén melding voor allebei stuurt de
 *    helft van de lezers de verkeerde kant op — de fout van QS8-268.
 *
 * ⚠️ **Los van `process.env` en los van psql, zodat hij te toetsen is** zonder
 *    een database en zonder de omgeving te verbouwen. De schil eronder doet
 *    alleen het aanroepen en het formuleren.
 */
export function stackOordeel(uitkomst: string | null, rlsDoel: string | undefined): Stackoordeel {
  if (uitkomst === '1') return 'meten';
  if (rlsDoel === undefined) return 'overslaan';
  return uitkomst === null ? 'geen-verbinding' : 'schema-loopt-achter';
}

/**
 * Draait de stack, en kent hij het object waar dit bestand over gaat?
 *
 * `proef` is een query die precies `'1'` teruggeeft zodra het schema er is —
 * bijvoorbeeld het bestaan van één functie of één bucket.
 *
 * `bron` is `import.meta.url` van de aanroeper. Dat is met opzet geen
 * bestandsnaam als tekst: een pad dat je overtypt, verhuist niet mee.
 *
 * ⚠️ **Deze functie werpt, en dat is de hele bedoeling.** Hij geeft alleen
 *    `false` terug als niemand beweerde te meten. De regel zelf staat in
 *    `stackOordeel()` hierboven; hier staat alleen wat je er dan van merkt.
 */
export function stackBeschikbaarOfFaal(proef: string, bron: string): boolean {
  let uitkomst: string | null = null;
  let fout: unknown = null;
  try {
    uitkomst = psql(proef);
  } catch (opgevangen) {
    fout = opgevangen;
  }

  const oordeel = stackOordeel(uitkomst, process.env.RLS_DOEL);
  if (oordeel === 'meten') return true;
  if (oordeel === 'overslaan') return false;

  const waar = `${PSQL_OMGEVING.PGHOST}:${PSQL_OMGEVING.PGPORT}/${PSQL_DB}`;
  const staart = 'Stil overslaan zou hier als groen tellen.';

  if (oordeel === 'geen-verbinding') {
    const eerste = fout instanceof Error ? (fout.message.split('\n')[0] ?? '') : String(fout);
    throw new Error(
      `${kortPad(bron)}: geen database op ${waar}, terwijl RLS_DOEL op ` +
        `"${process.env.RLS_DOEL}" staat. Start de stack met \`npm run rls:stack\`. ` +
        `${staart}\n\npsql zei: ${eerste}`,
    );
  }

  throw new Error(
    `${kortPad(bron)}: de database op ${waar} antwoordt wél, maar kent niet wat dit ` +
      'bestand toetst — het schema loopt waarschijnlijk achter op de migraties. ' +
      `Bouw hem opnieuw op met \`npm run rls:stack\`. ${staart}\n\n` +
      `De proef gaf "${uitkomst}" in plaats van "1": ${proef}`,
  );
}

/** `tests/rls/groepspin.test.ts` uit een `file://`-URL. */
function kortPad(bron: string): string {
  const pad = fileURLToPath(bron).replace(/\\/g, '/');
  const vanaf = pad.indexOf('/tests/');
  return vanaf === -1 ? pad : pad.slice(vanaf + 1);
}
