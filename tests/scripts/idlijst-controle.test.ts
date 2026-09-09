import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `uitgang-controle.test.ts`.
//    TypeScript leest de JSDoc ernaast.
import {
  beoordeelBestand,
  GRENZEN,
  inFilters,
  zonderCommentaar,
} from '../../scripts/idlijst-controle.mjs';

/**
 * De ijking van `idlijst:controle` — QS8-368.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken** (CLAUDE.md,
 *    regel 18). Vandaar de losse `beoordeelBestand({ pad, bron, grenzen })`: het
 *    register gaat als argument mee, zodat deze tests niet meebewegen met de
 *    echte lijst — en niet groen worden doordat er toevallig een regel bij komt.
 *
 * ⚠️ **De tweede helft is even belangrijk als de eerste.** Een controle die
 *    alles meldt, leer je uitzetten. De helft van de gevallen hieronder is
 *    daarom een must-allow.
 */

const REGISTER: Record<string, string> = {
  'src/proef.ts#goal_id': '20 — komt uit een pagina van twintig.',
};

function beoordeel(bron: string, pad = 'src/proef.ts'): string[] {
  return beoordeelBestand({ pad, bron, grenzen: REGISTER } as never) as string[];
}

describe('idlijst-controle — de vormen die hetzelfde verzoek opleveren', () => {
  it('vindt `.filter(kolom, \'in\', …)`, dezelfde GET in een andere schrijfwijze', () => {
    // 📏 Gemeten in de security-review: deze vorm kwam op exitcode 0 langs.
    const fouten = beoordeel(`db.filter('milestone_id', 'in', lijst);`);

    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('#milestone_id');
  });

  it('vindt `.or()`, die het nóg eerder begeeft', () => {
    // 📏 `goals?select=id`: `.in()` valt om bij 416 id's, `.or()` al bij 361.
    const fouten = beoordeel(`db.or(ids.map((i) => \`goal_id.eq.\${i}\`).join(','));`);

    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('#or');
  });

  it('laat een `.or()` in commentaar met rust', () => {
    expect(beoordeel(`// vroeger: db.or(…)\nconst x = 1;`)).toEqual([]);
  });
});

describe('idlijst-controle — wat hij moet vinden', () => {
  it('meldt een `.in()` die niet in het register staat', () => {
    const fouten = beoordeel(`db.from('milestones').select('id').in('milestone_id', ids);`);

    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('src/proef.ts#milestone_id');
  });

  it('meldt elke ongeregistreerde kolom apart', () => {
    const fouten = beoordeel(`
      a.in('alpha', x);
      b.in('beta', y);
    `);

    expect(fouten).toHaveLength(2);
  });

  it('meldt een bekende kolom in een ánder bestand', () => {
    // ⚠️ De sleutel is pad + kolom en niet de kolom alleen. Een `.in('goal_id')`
    //    die verhuist, is een nieuwe lijst met een nieuwe herkomst — en dus een
    //    nieuwe grens die iemand moet meten.
    const fouten = beoordeel(`db.in('goal_id', ids);`, 'src/ergens-anders.ts');

    expect(fouten).toHaveLength(1);
  });
});

describe('idlijst-controle — wat hij met rust moet laten', () => {
  it('zwijgt over een `.in()` die in het register staat', () => {
    expect(beoordeel(`db.from('goal_risk').in('goal_id', ids);`)).toEqual([]);
  });

  it('zwijgt over een bestand zonder `.in()`', () => {
    expect(beoordeel(`const x = 1; db.from('goals').select('id').eq('id', x);`)).toEqual([]);
  });

  it('meldt dezelfde kolom niet twee keer in één bestand', () => {
    // Twee verzoeken op dezelfde kolom hebben één herkomst en één grens.
    const fouten = beoordeel(`db.in('nieuw', a); db.in('nieuw', b);`);
    expect(fouten).toHaveLength(1);
  });

  it('zwijgt over een `.in()` in commentaar', () => {
    // ⚠️⚠️ **Dit is het geval waar de eerste versie op stukging.** Die telde de
    //    `.in(`-posities in de bron zónder commentaar, maar zocht de kolomnamen
    //    daarna in de rúwe bron — dus één echte `.in()` sleepte élke `.in()` uit
    //    het commentaar eromheen mee. Een uitleg-blok dat een voorbeeld noemt,
    //    is geen verzoek.
    const fouten = beoordeel(`
      // Vroeger stond hier .in('oud', ids) en dat was fout.
      /* Zie ook .in('nog_ouder', ids). */
      db.from('goal_risk').in('goal_id', ids);
    `);

    expect(fouten).toEqual([]);
  });

  it('laat een `//` binnen een string met rust', () => {
    // Een URL in een string mag de rest van het bestand niet opeten.
    const fouten = beoordeel(`
      const url = 'https://voorbeeld.test/pad';
      db.in('goal_id', ids);
    `);

    expect(fouten).toEqual([]);
  });
});

describe('zonderCommentaar()', () => {
  it('houdt de kolomnaam en gooit het commentaar weg', () => {
    const uit = zonderCommentaar(`db.in('goal_id', x); // .in('weg', y)`) as string;

    expect(uit).toContain("'goal_id'");
    expect(uit).not.toContain("'weg'");
  });
});

describe('het echte register', () => {
  it('draagt bij elke regel een gemeten grens en niet alleen tekst', () => {
    // ⚠️⚠️ **De eerste versie eiste alleen `length > 30`, en dat was te weinig.**
    //    📏 Gemeten in de security-review: met de reden `'ok ok ok ok ok ok ok ok
    //    ok ok ok ok ok ok ok'` bleef zowel de controle als deze test groen —
    //    het register was dus met eenendertig nietszeggende tekens het zwijgen
    //    op te leggen, precies wat zijn eigen kop verbiedt.
    //
    //    `review:controle` eist een lítterale zin (`**Wordt zwaarder als:**`) en
    //    geen lengte, en om dezelfde reden staat hier nu een eis op de ínhoud:
    //    een getal of een naam van het mechanisme dat de grens afdwingt.
    const AFDWINGERS = /\d|brokken\(|IDS_PER_VERZOEK|\.limit\(|\.slice\(/;

    for (const [sleutel, reden] of Object.entries(GRENZEN as Record<string, string>)) {
      expect(sleutel, 'de sleutel is <pad>#<kolom>').toMatch(/^[^#]+#[a-z_]+$/);
      expect(reden.length, `${sleutel} heeft een te korte reden`).toBeGreaterThan(30);
      expect(reden, `${sleutel} noemt geen grens en geen mechanisme`).toMatch(AFDWINGERS);
      expect(
        reden,
        `${sleutel} noemt niet waar de grens vandaan komt`,
      ).toMatch(/\.ts|\(\)|literal/);
    }
  });

  it('vindt in elk geregistreerd bestand ook werkelijk die kolom', async () => {
    // De naad: het register en de scanner moeten het over dezelfde bestanden
    // eens zijn. Loopt er één uit de pas, dan bewaakt het register een `.in()`
    // die er niet is — en dekt hij straks een nieuwe af die wél stuk is.
    const { readFileSync } = await import('node:fs');

    for (const sleutel of Object.keys(GRENZEN as Record<string, string>)) {
      const [pad, kolom] = sleutel.split('#');
      const kolommen = inFilters(readFileSync(pad as string, 'utf8')) as string[];
      expect(kolommen, `${sleutel} staat in het register`).toContain(kolom);
    }
  });
});
