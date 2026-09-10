import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een view die als eigenaar draait, heeft `security_barrier` — QS8-92.
 *
 * ⚠️⚠️ **`create or replace view` zet de opties niet voort.** Laat je de
 *    `with (…)`-clausule weg, dan vallen ze weg — stil, zonder fout, en zonder
 *    dat er iets rood wordt. 📏 Precies dat gebeurde in de eerste versie van
 *    migratie 0237: `mijn_profiel` was daarna de énige view in `public` zonder
 *    `security_barrier`, terwijl 0089 hem mét die vlag aanmaakte en 0143 hem
 *    keurig overnam. Het intrekken van een bestaande grendel is stiller dan het
 *    vergeten van een nieuwe, en dit is het derde geval op deze branch van
 *    dezelfde soort: een `create or replace` die meer meeneemt dan je denkt.
 *
 * ⚠️ **Waarom de vlag ertoe doet.** Een view die als eigenaar draait (`security_
 *    invoker = false`) gaat langs RLS en langs de kolomgrants heen; wat hem
 *    afgrendelt is zijn eigen `where`. Zonder `security_barrier` mag de planner
 *    een goedkope qual van de aanroeper vóór die `where` uitvoeren, en dan ziet
 *    een functie in de WHERE rijen die de view nooit had mogen teruggeven.
 *
 * ⚠️ **De regel en niet een lijst namen** (regel 18, vraag 4): élke view die als
 *    eigenaar draait moet de vlag hebben. Zo vuurt deze test ook bij de vólgende
 *    view die iemand aanmaakt, en niet alleen bij de drie van vandaag.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'mijn_profiel'",
  import.meta.url,
);

/** Elke view in `public`, met zijn `reloptions` als tekst. */
function views(): { naam: string; opties: string }[] {
  return psql(
    `select relname || '|' || coalesce(array_to_string(reloptions, ','), '')
       from pg_class
      where relkind = 'v' and relnamespace = 'public'::regnamespace`,
  )
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [naam = '', opties = ''] = r.split('|');
      return { naam, opties };
    });
}

describe.skipIf(!beschikbaar)('de opties van een view zijn geen stijlkwestie', () => {
  it(
    'vindt überhaupt views om te toetsen',
    () => {
      // ⚠️ Zonder dit is een lege catalogus een groene test.
      expect(views().length).toBeGreaterThan(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft elke view die als eigenaar draait een `security_barrier`',
    () => {
      // Een view zonder `security_invoker=true` draait als eigenaar — dat is de
      // default, dus de afwezigheid van die optie telt óók mee.
      const alsEigenaar = views().filter((v) => !v.opties.includes('security_invoker=true'));
      const zonderSlot = alsEigenaar.filter((v) => !v.opties.includes('security_barrier=true'));

      expect(
        zonderSlot.map((v) => v.naam),
        'deze views draaien als eigenaar en missen security_barrier — waarschijnlijk ' +
          'is er een `create or replace view` zonder `with (…)` overheen gegaan',
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt `mijn_profiel` op eigenaarsrechten, want dat ís zijn werking',
    () => {
      const view = views().find((v) => v.naam === 'mijn_profiel');
      expect(view?.opties).toContain('security_invoker=false');
      expect(view?.opties).toContain('security_barrier=true');
    },
    TEST_TIMEOUT,
  );
});
