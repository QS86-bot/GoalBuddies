import { describe, expect, it } from 'vitest';

import { INTREKVENSTER_MINUTEN } from '../../src/modules/completions/approval-schemas';

import { adminDb, rlsTestsConfigured } from './harness';

const TEST_TIMEOUT = 30_000;

/**
 * Het intrekvenster staat één keer — migratie 0099.
 *
 * ⚠️ **Het stond twee keer, in twee talen, met een comment als enige verband.**
 *    In `trek_goedkeuring_in()` als `interval '15 minutes'`, en in
 *    `approvals.ts` als `INTREKVENSTER_MINUTEN = 15` met erboven: *"Zolang je
 *    een goedkeuring nog kunt intrekken — gelijk aan de RPC."* Grep op beide in
 *    `tests/` gaf op 27-08-2026 nul treffers: die gelijkheid was een aanname.
 *
 * ⚠️ **Wat het kost als ze uit elkaar lopen.** Het getal staat in de tekst die
 *    de gebruiker leest terwijl hij een vergissing terugdraait —
 *    `beoordeling.terugdraai_venster` zegt "je hebt nog {minuten} minuten". Zet
 *    iemand de SQL op tien, dan belooft het scherm vijftien en krijgt de
 *    gebruiker `window_closed` terwijl hij dacht nog tijd te hebben. Precies bij
 *    de handeling die bedoeld is om een fout te herstellen.
 *
 * ⚠️ Zelfde vorm en zelfde reden als `check_waarden()` uit migratie 0082: maak
 *    de database-kant leesbaar vanuit een test, zodat app en afdwinging in
 *    béide richtingen vergeleken worden.
 */
describe.skipIf(!rlsTestsConfigured)('Het intrekvenster', () => {
  it(
    'is in de database hetzelfde getal als in de app',
    async () => {
      const { data, error } = await adminDb().rpc('intrekvenster_minuten');

      expect(error).toBeNull();
      expect(data).toBe(INTREKVENSTER_MINUTEN);
    },
    TEST_TIMEOUT,
  );

  it(
    'wordt door trek_goedkeuring_in() ook echt gebruikt',
    async () => {
      // ⚠️ De positieve controle, en niet de flauwe. Zonder deze helft is een
      //    `intrekvenster_minuten()` die door niemand aangeroepen wordt net zo
      //    groen als eentje die de afdwinging stuurt — en dan staat het getal
      //    weer op twee plekken, alleen met een extra functie ernaast.
      //    Vraag 3 uit regel 18.
      const { data, error } = await adminDb().rpc('intrekvenster_bewaking');

      expect(error).toBeNull();
      // Twee bevindingen mogelijk: hij gebruikt de bron niet, of hij draagt nog
      // een eigen interval. Allebei betekenen dat het getal weer twee keer staat.
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
