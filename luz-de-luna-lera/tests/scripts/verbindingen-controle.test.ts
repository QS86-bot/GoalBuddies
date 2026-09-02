import { describe, expect, it } from 'vitest';

import { controleer } from '../../scripts/verbindingen-controle.mjs';

/**
 * QS8-22 — connection pooling vanaf dag één.
 *
 * ⚠️ **Deze controle staat vandaag groen zonder dat iemand iets heeft
 *    ingesteld**, en dat is precies waarom hij een test nodig heeft. Hij klopt
 *    bij toeval van de architectuur: de app en de Edge Functions praten met
 *    PostgREST over HTTPS, en er zit geen Postgres-driver in `package.json`.
 *
 *    Een controle die nooit iets gevonden heeft, is niet te onderscheiden van
 *    een controle die niets kán vinden. Elk faalgeval wordt hier met de hand
 *    gebroken — de les van QS8-115, hier vanaf de eerste regel toegepast.
 */

const SCHOON = { afhankelijkheden: ['@supabase/supabase-js', 'zod'], bestanden: [] };

describe('verbindingen', () => {
  it('zwijgt over een app die alleen via PostgREST praat', () => {
    expect(controleer(SCHOON)).toEqual([]);
  });

  it('klaagt over een Postgres-driver in package.json', () => {
    // ⚠️ Het geval dat `CLAUDE.md` voorspelt: een langdraaiende Node-server op
    //    Hostinger met een eigen pool. `max_connections` staat op 60 voor de héle
    //    database — inclusief PostgREST en de Auth-server.
    const klachten = controleer({ ...SCHOON, afhankelijkheden: ['pg'] });

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('pg');
    expect(klachten[0]).toContain('6543');
  });

  it('klaagt ook over een ORM die er een meebrengt', () => {
    expect(controleer({ ...SCHOON, afhankelijkheden: ['drizzle-orm'] })).toHaveLength(1);
    expect(controleer({ ...SCHOON, afhankelijkheden: ['@prisma/client'] })).toHaveLength(1);
  });

  it('klaagt over een verbindingsstring in de app', () => {
    const klachten = controleer({
      ...SCHOON,
      bestanden: [
        { pad: 'src/lib/db.ts', inhoud: "const url = 'postgresql://user:pw@host:5432/db';" },
      ],
    });

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toContain('src/lib/db.ts:1');
  });

  it('herkent beide vormen van het schema', () => {
    for (const url of ['postgres://x', 'postgresql://x']) {
      expect(
        controleer({ ...SCHOON, bestanden: [{ pad: 'a.ts', inhoud: `const u = '${url}';` }] }),
      ).toHaveLength(1);
    }
  });

  it('laat commentaar met rust', () => {
    // ⚠️ Deze bestanden leggen juist úit waarom er geen directe verbinding is.
    //    Een controle die zijn eigen onderbouwing rood maakt, wordt uitgezet.
    const klachten = controleer({
      ...SCHOON,
      bestanden: [
        { pad: 'src/lib/supabase.ts', inhoud: '// nooit een postgres:// hier\n * postgresql://' },
      ],
    });

    expect(klachten).toEqual([]);
  });

  it('meldt elke regel apart', () => {
    const klachten = controleer({
      ...SCHOON,
      bestanden: [{ pad: 'a.ts', inhoud: "const a = 'postgres://1';\nconst b = 'postgres://2';" }],
    });

    expect(klachten).toHaveLength(2);
    expect(klachten[1]).toContain('a.ts:2');
  });
});
