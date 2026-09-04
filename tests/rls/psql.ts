import { execFileSync } from 'node:child_process';

/**
 * De psql-kant van de RLS-suite, één keer.
 *
 * ⚠️ **Dit bestand bestaat omdat het poortnummer vier keer stond en drie keer
 *    fout was** (QS8-270). `avatarbucket`, `bewijsbijschrift` en `groepspin`
 *    droegen ieder hun eigen kopie met `PGPORT ?? '5432'`, terwijl
 *    `scripts/lokale-stack.sh` op `${PGPORT:-5433}` draait. Gemeten: zónder
 *    `PGPORT` in de omgeving gaf `RLS_DOEL=lokaal vitest run tests/rls`
 *    **863 geslaagd, 31 overgeslagen en exitcode 0**; mét de omgeving 893 en 1.
 *    Dertig tests sloegen zichzelf stil over en de poort las groen.
 *
 * ⚠️ **De vierde kopie was de goede**, en dat is het venijnige: `aanmelding.test.ts`
 *    stond op 5433 en legde in commentaar uit waaróm. De waarschuwing lag er dus
 *    al, in het bestand ernaast, en dat hielp niet — want een waarschuwing die je
 *    opschrijft in plaats van uitvoert, moet elke volgende lezer opnieuw vinden.
 *    Vandaar één module in plaats van een vierde vermaning.
 */

/** De database waar de RLS-suite tegen meet. */
export const PSQL_DB = process.env.PGDATABASE ?? 'goalbuddies_rls';

/**
 * De omgeving voor elke `psql`-aanroep in deze suite.
 *
 * ⚠️ **5433 en niet 5432.** `scripts/lokale-stack.sh` draait op `${PGPORT:-5433}`;
 *    met 5432 verbindt een bestand nergens mee en slaat het zichzelf over. Zie de
 *    kop: dat is precies wat er drie keer gebeurde.
 *
 * ⚠️ **En `-U postgres` staat hieronder in de argumenten en niet hier.** Zonder
 *    valt psql terug op de OS-gebruiker — hier `root`, waar geen rol voor bestaat
 *    — en dat is de fout die QS8-268 in zes scripts vond. Dezelfde familie als
 *    het poortnummer: een verbindingsdetail dat per bestand opnieuw bedacht werd.
 */
export const PSQL_OMGEVING: NodeJS.ProcessEnv = {
  ...process.env,
  PGHOST: process.env.PGHOST ?? '127.0.0.1',
  PGPORT: process.env.PGPORT ?? '5433',
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
};

export interface PsqlOpties {
  /** `VERBOSITY=verbose`, zodat een foutmelding ook de constraintnaam draagt. */
  readonly uitgebreid?: boolean;
}

/** Voert SQL uit als `postgres` en geeft de kale uitvoer terug. */
export function psql(sql: string, opties: PsqlOpties = {}): string {
  const args = ['-U', 'postgres', '-d', PSQL_DB, '-q', '-v', 'ON_ERROR_STOP=1'];
  if (opties.uitgebreid === true) args.push('-v', 'VERBOSITY=verbose');
  args.push('-tAc', sql);

  return execFileSync('psql', args, { env: PSQL_OMGEVING, encoding: 'utf8' }).trim();
}

/**
 * "Staat de stack er?" — en zo niet, is stil overslaan dan geoorloofd?
 *
 * ⚠️ **Overslaan mag alleen als niemand beweerde te meten.** Staat `RLS_DOEL`
 *    gezet, dan is dit een bewuste RLS-run en is een onbereikbare database geen
 *    reden om te zwijgen maar om te falen — anders is "ongemeten" niet van
 *    "groen" te onderscheiden, en dat is precies het onderscheid dat `poort.mjs`
 *    voor de `*:controle`-scripts wél maakt en voor vitest niet.
 *
 * @param probe iets dat alleen waar is als het schema er staat
 */
export function stackBeschikbaar(probe: () => boolean): boolean {
  let beschikbaar: boolean;
  try {
    beschikbaar = probe();
  } catch {
    beschikbaar = false;
  }

  if (!beschikbaar && process.env.RLS_DOEL !== undefined) {
    throw new Error(
      `Geen database op ${PSQL_OMGEVING.PGHOST}:${PSQL_OMGEVING.PGPORT}/${PSQL_DB}, ` +
        `terwijl RLS_DOEL op "${process.env.RLS_DOEL}" staat. Start de stack met ` +
        '`npm run rls:stack`. Stil overslaan zou hier als groen tellen.',
    );
  }

  return beschikbaar;
}

/** Kortste vorm van de gebruikelijke probe: bestaat dit object in het schema? */
export function schemaHeeft(vraag: string): () => boolean {
  return () => psql(vraag) === '1';
}
