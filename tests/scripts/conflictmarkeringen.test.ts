import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als de andere scriptijkingen.
import { markeringen, markeringenIn, OVERSLAAN } from '../../scripts/conflictmarkeringen-controle.mjs';
import { metSchuineStrepen } from '../../scripts/paden.mjs';

/**
 * De ijking van `npm run markeringen:controle`.
 *
 * ⚠️ **Deze controle bestaat omdat de fout op `main` stond.** Op 28-08-2026 droeg
 *    `docs/ENGINEER-REVIEW.md` zes markeringsregels uit twee eerdere merges, plus
 *    twee dossierrijen die er elk drie keer in stonden. Het is meegegaan door een
 *    merge, een PR en een volledige CI-run, en pas opgevallen doordat een
 *    vólgende merge geneste markeringen opleverde.
 *
 * ⚠️ **Geen enkele controle zag het, en elke controle deed zijn werk.**
 *    `review:controle` leest tabelrijen en `<<<<<<<` is er geen; `docs:controle`
 *    vergelijkt feiten en een markering is er geen; typecheck en lint kijken niet
 *    naar `.md`. Dat is regel 18 vraag 3 op de vérzameling controles in plaats
 *    van op één test: elk onderdeel klopt, en het geheel laat een klasse door.
 *
 * ⚠️ De tweede helft is hier scherper dan gewoonlijk, want de patronen lijken op
 *    dingen die in echte documenten voorkomen — een setext-kop bovenal.
 */

/** De drie markeringen, opgebouwd zoals het script ze opbouwt. */
const [KLEINER = '', GROTER = '', PIJP = ''] = markeringen() as readonly string[];

describe('wat de controle moet vinden', () => {
  it('de vorm die git bij een conflict achterlaat', () => {
    const uit = markeringenIn([
      'een gewone regel',
      `${KLEINER} HEAD`,
      'onze kant',
      '=======',
      'hun kant',
      `${GROTER} fix/een-tak`,
    ]) as { regel: number }[];

    expect(uit.map((t) => t.regel)).toEqual([2, 6]);
  });

  it('de diff3-variant met de gezamenlijke voorouder', () => {
    expect(markeringenIn([`${PIJP} merged common ancestors`])).toHaveLength(1);
  });

  it('precies de vier regels die op main stonden', () => {
    // De echte toestand van `docs/ENGINEER-REVIEW.md`, nagespeeld.
    const uit = markeringenIn([
      `${KLEINER} HEAD`,
      '| 2026-08-28 | een rij | … | Middel |',
      '=======',
      `${KLEINER} HEAD`,
      '| 2026-08-28 | dezelfde rij | … | Middel |',
      `${GROTER} fix/tekstgrenzen-en-ai-invoer`,
      '=======',
      `${GROTER} fix/auth-uid-initplan`,
    ]) as { regel: number }[];

    expect(uit.map((t) => t.regel)).toEqual([1, 4, 6, 8]);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een setext-kop in Markdown', () => {
    // ⚠️ **Deze wordt al door de naam-eis afgevangen** en niet doordat `=` buiten
    //    de lijst staat — met de hand nagemeten. Hij blijft hier als geval,
    //    maar de toets die de `=`-beslissing écht raakt is de volgende.
    expect(markeringenIn(['Een kop', '=======', '', 'tekst'])).toEqual([]);
  });

  it('een ASCII-kop met isgelijktekens eromheen', () => {
    // ⚠️ **Dít is waarom `=======` niet in de lijst staat.** Een banner als
    //    `======= CONFIG =======` heeft de vorm die git ook heeft: zeven tekens
    //    vooraan, een spatie, en iets erachter. Zet `=` erbij en deze regel is
    //    een treffer — en zulke banners staan in gewone scripts en tekstbestanden.
    //
    //    De setext-toets hierboven bewijst dit níét, want die valt al af op de
    //    naam-eis. Gevonden door `=` met de hand aan de lijst toe te voegen en te
    //    kijken welke ijking rood werd: geen enkele.
    expect(markeringenIn(['======= CONFIG =======', '======= EINDE ======='])).toEqual([]);
  });

  it('een markering zonder naam erachter', () => {
    // Git schrijft er altijd een ref achter. Een kale reeks tekens is opmaak,
    // een scheidingslijn of een tekening.
    expect(markeringenIn([KLEINER, GROTER, `${KLEINER} `])).toEqual([]);
  });

  it('een reeks tekens midden in een regel', () => {
    // De markering staat bij git altijd vooraan. Zonder die eis meldt deze
    // controle een citaat of een stuk voorbeeldcode.
    expect(markeringenIn([`prefix ${KLEINER} HEAD`, `  ${GROTER} tak`])).toEqual([]);
  });

  it('gewone punthaken in code', () => {
    expect(
      markeringenIn([
        '  const a: Promise<Resultaat> = laad();',
        '  if (n >> 2) return;',
        '  const b = x || y;',
      ]),
    ).toEqual([]);
  });
});

describe('waar hij niet kijkt', () => {
  it.each([
    ['node_modules', 'node_modules/pakket/index.js'],
    ['de git-map', '.git/MERGE_MSG'],
    ['een build', 'dist/app.js'],
  ])('slaat %s over', (_naam, pad) => {
    // ⚠️ `.git/MERGE_MSG` en `.git/rebase-merge/` staan vól markeringen tijdens
    //    een conflict. Zonder deze uitzondering is de controle rood precies op
    //    het moment dat je hem het hardst nodig hebt.
    expect(
      (OVERSLAAN as RegExp[]).some((r) => r.test(`${metSchuineStrepen(`/repo/${pad}`)}/`)),
    ).toBe(true);
  });

  it.each([
    ['een document', '/repo/docs/ENGINEER-REVIEW.md'],
    ['een scherm', '/repo/app/beoordelen.tsx'],
    ['een migratie', '/repo/supabase/migrations/0125_iets.sql'],
  ])('kijkt wél in %s', (_naam, pad) => {
    expect((OVERSLAAN as RegExp[]).some((r) => r.test(`${metSchuineStrepen(pad)}/`))).toBe(false);
  });
});
