/**
 * De belofte: **de gedeelde SQL-knip haalt commentaar weg en laat tekst staan**
 * — QS8-574, verhuisd uit `scripts/sleutelvorm-controle.mjs` waar hij sinds
 * QS8-491 stond.
 *
 * ⚠️⚠️ **Deze knip is zelf een grendel**, net als de JS-knip ernaast. Hij
 *    bepaalt wat er in een migratie *code* heet. Knipt hij te veel weg, dan
 *    blijft de zeef erboven groen terwijl de belofte breekt — en dat is de
 *    gevaarlijke richting, want een zeef die niets meer vindt ziet er precies zo
 *    uit als een zeef die niets te vinden heeft.
 *
 * ⚠️⚠️ **De gevallen staan met opzet op één regel.** 📏 De ijking die hier bij
 *    QS8-491 aan voorafging zette de `--` en de leesplek op verschillende
 *    régels; dan valt de vorm binnen de regelgrens van de knip en is hij groen
 *    om een reden die niets met de belofte te maken heeft. Precies de val die
 *    CLAUDE.md bij regel 18 noemt: een mutatie die zijn geval langs een éérdere
 *    grendel voert, toetst die eerdere grendel.
 *
 * ⚠️ De ijking dóór `sleutelvorm-controle` heen — of een uitgecommentarieerde
 *    leesplek meetelt — blijft met opzet in
 *    `tests/scripts/sleutelvorm-controle.test.ts` staan. Dat is die controle
 *    zijn eigen belofte; dit bestand toetst de knip als knip.
 */
import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast.
import { zonderCommentaarSql } from '../../scripts/zonder-sql-commentaar.mjs';

// ---------------------------------------------------------------------------

describe('commentaar gaat eruit', () => {
  it('haalt een regelcommentaar weg', () => {
    expect(zonderCommentaarSql("-- create policy x on y;\nselect 1;")).not.toContain('create policy');
  });

  it('haalt een blokcommentaar weg', () => {
    expect(zonderCommentaarSql("/* current_setting('app.x') */ select 1;")).not.toContain('app.x');
  });

  /** Postgres nest blokcommentaar, en dus telt deze knip de diepte mee. */
  it('telt de nesting van een blok mee', () => {
    const bron = '/* buiten /* binnen */ nog steeds binnen */ select 1;';

    expect(zonderCommentaarSql(bron)).not.toContain('binnen');
    expect(zonderCommentaarSql(bron)).toContain('select 1');
  });

  it('knipt het staartcommentaar en laat de regel ervoor staan', () => {
    expect(zonderCommentaarSql("select 1; -- waarom dit zo is")).toContain('select 1;');
    expect(zonderCommentaarSql("select 1; -- waarom dit zo is")).not.toContain('waarom');
  });
});

// ---------------------------------------------------------------------------

describe('tekst blijft staan — daar hangt een belofte aan', () => {
  /**
   * ⚠️⚠️ **Dit is het verschil met `zonderCommentaarEnTekst` in
   *    `tests/migraties/idempotentie.ts`.** Een migratietoets als
   *    `expect(MIGRATIE).toMatch(/values\s*\(\s*'avatars'/)` heeft die quotes
   *    juist nodig; zou deze knip ze weghalen, dan is die toets stil groen op
   *    niets.
   */
  it('laat een enkel gequote literal ongemoeid', () => {
    const bron = "insert into storage.buckets values ('avatars', 'avatars', false);";

    expect(zonderCommentaarSql(bron)).toContain("'avatars'");
    expect(zonderCommentaarSql(bron)).toContain('false');
  });

  it('en een verdubbelde quote binnen een literal', () => {
    expect(zonderCommentaarSql("select 'het''s goed';")).toContain("het''s goed");
  });

  /**
   * 📏 **De gemeten regressie (QS8-491).** De eerste versie knipte met één regex
   *    op `--`, en op deze regel hield die `v_x := 'a` over: **nul** leesplekken
   *    waar er één hoort, dus een kale vergelijking die stil doorglipt.
   */
  it('eet niet de rest van de regel op na een streepje binnen een string', () => {
    const bron = "v_x := 'a--b' || nullif(current_setting('app.echt', true), '') = old.id::text;";

    expect(zonderCommentaarSql(bron)).toBe(bron);
  });

  /** Zelfde geval, maar dan met een dollar-quote — óók gemeten bij QS8-491. */
  it('en niet na een streepje binnen een dollar-quote', () => {
    const bron = "v_sql := $q$a--b$q$ || (nullif(current_setting('app.echt', true), '') = old.id);";

    expect(zonderCommentaarSql(bron)).toBe(bron);
  });

  it('en laat een benoemde dollar-quote met een heel functielichaam heel', () => {
    const bron = "$function$ begin -- dit is binnen de body\n  return 1; end $function$";

    expect(zonderCommentaarSql(bron)).toBe(bron);
  });
});

// ---------------------------------------------------------------------------

describe('de randen', () => {
  it('laat SQL zonder commentaar precies zoals hij is', () => {
    const bron = 'select a, b from t where a is not null;';

    expect(zonderCommentaarSql(bron)).toBe(bron);
  });

  it('overleeft een niet-afgesloten literal zonder te blijven hangen', () => {
    expect(zonderCommentaarSql("select 'open")).toBe("select 'open");
  });

  it('overleeft een niet-afgesloten blok', () => {
    expect(zonderCommentaarSql('select 1; /* nooit dicht')).toContain('select 1;');
  });

  /**
   * ⚠️ Een JS-comment is hier géén commentaar, en dat hoort zo: dit is de
   *    SQL-knip. Wie JS knipt, gebruikt `scripts/zonder-commentaar.mjs`.
   */
  it('raakt een JS-regelcommentaar niet aan', () => {
    expect(zonderCommentaarSql('// dit is JS\nselect 1;')).toContain('// dit is JS');
  });
});
