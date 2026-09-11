import { describe, expect, it } from 'vitest';

import { KLASSE } from '../../scripts/volatiliteit-controle.mjs';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Het predicaat van `volatiliteit-controle` — QS8-433.
 *
 * ⚠️⚠️ **Dit bestand bestaat omdat de ijking van die controle hem niet raakte.**
 *    De mutaties in `tests/scripts/volatiliteit-controle.test.ts` treffen
 *    `ontleed()` en `beoordeel()` — stringverwerking en registerlogica. Het
 *    predicaat zelf, dat bepaalt wát de klasse ís, kwam daar niet in voor: je
 *    kon `provolatile = 'i'` vervangen door iets dat nooit matcht en alle acht
 *    tests bleven groen. Gevonden in de security-review.
 *
 *    `CLAUDE.md`: *een controle die je niet kunt voeden, kun je niet ijken* —
 *    en dit is de enige manier om dit predicaat te voeden: een echte functie van
 *    elke vorm, in een transactie die terugrolt.
 *
 * ⚠️ **Elke vorm hieronder is een méting en geen bedenksel.** Ze zijn stuk voor
 *    stuk door PostgREST gehaald met de bevoorrechte rol als eerste aanroeper op
 *    een verse pool; de uitslag staat per geval erbij. De vormen die lekken
 *    moeten gevonden worden, de vormen die dichtblijven moeten met rust gelaten
 *    worden — die tweede helft is wat een controle bruikbaar houdt.
 *
 * IJKING van het predicaat — met de hand gedraaid op 11-09-2026:
 *
 *   E  route A eruit                              → 2 rood
 *   F  route B eruit                              → 2 rood
 *   G  `pronargs = pronargdefaults` → `= 0`       → 1 rood (de default-grens)
 *   H  de `not prosecdef`-tak eruit               → 1 rood (must-allow)
 *   I  de `proconfig is null`-tak eruit           → 3 rood (must-allow)
 *
 * ⚠️ G viel er eerst doorheen: de mutatie raakte twee plekken en het script
 *    weigerde hem, waarna de suite groen bleef op een **ongemuteerd** bestand.
 *    Groen betekende daar "er is niets veranderd" en niet "de grendel is niet
 *    nodig". Controleer met een `grep` dát je mutatie in het bestand staat.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  // `berichten_plafond()` staat sinds 0254 op `stable`; is hij dat niet, dan
  // loopt het schema achter op de migraties en meet dit bestand niets.
  "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
    "where n.nspname = 'public' and p.proname = 'berichten_plafond' and p.provolatile = 's'",
  import.meta.url,
);

/** Maakt één functie aan, vraagt het predicaat, en rolt alles terug. */
function valtOnderDeKlasse(definitie: string): boolean {
  const uit = psql(`
    begin;
    ${definitie}
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where ${KLASSE}
      and p.proname = 'zz_proef';
    rollback;
  `);

  const laatste = uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .at(-1);

  return laatste === '1';
}

const VOUWBAAR = 'sql immutable set search_path = public, pg_temp';
const INLINEBAAR = 'sql stable';

describe.skipIf(!beschikbaar)('het predicaat vindt wat er lekt', () => {
  /** 📏 `immutable` + zoekpad + nul argumenten: anon 200 x 25 na priming. */
  it('route A — immutable zonder argumenten, óók mét zoekpad', () => {
    expect(
      valtOnderDeKlasse(`create function zz_proef() returns int language ${VOUWBAAR} as $$ select 7 $$;`),
    ).toBe(true);
  });

  /**
   * 📏 `immutable` met één default-argument, aangeroepen als `{}`: 200 x 25.
   *
   * ⚠️ Dit is de grens die *"nul argumenten"* miste: parse analysis zet de
   *    default als `Const` neer, dus er valt net zo goed te vouwen.
   */
  it('route A — immutable waarvan élk argument een default heeft', () => {
    expect(
      valtOnderDeKlasse(
        `create function zz_proef(n int default 1) returns int language ${VOUWBAAR} as $$ select n $$;`,
      ),
    ).toBe(true);
  });

  /** 📏 `stable` + `sql` + géén zoekpad + nul argumenten: 200 x 25. */
  it('route B — een sql-functie zonder zoekpad', () => {
    expect(
      valtOnderDeKlasse(`create function zz_proef() returns int language ${INLINEBAAR} as $$ select 7 $$;`),
    ).toBe(true);
  });

  /**
   * 📏 `stable` + `sql` + géén zoekpad + één écht argument, aangeroepen mét dat
   *    argument: 200 x 25.
   *
   * ⚠️ Route B heeft dus géén argumentgrens — inlining gebeurt ongeacht de
   *    arity. Dat is precies waarom het predicaat er twee takken heeft.
   */
  it('route B — óók met een argument dat de client meegeeft', () => {
    expect(
      valtOnderDeKlasse(
        `create function zz_proef(n int) returns int language ${INLINEBAAR} as $$ select n $$;`,
      ),
    ).toBe(true);
  });
});

describe.skipIf(!beschikbaar)('het predicaat laat met rust wat dicht is', () => {
  /**
   * 📏 De vorm waar 0254 alles naartoe brengt: 401 x 25. Zou deze meegemeld
   *    worden, dan meldt de controle de reparatie zelf en leer je hem negeren.
   */
  it('stable mét zoekpad — de vorm na 0254', () => {
    expect(
      valtOnderDeKlasse(
        `create function zz_proef() returns int language sql stable set search_path = public, pg_temp as $$ select 7 $$;`,
      ),
    ).toBe(false);
  });

  /** 📏 `plpgsql` wordt niet ingelined: 401 x 25, ook zonder zoekpad. */
  it('plpgsql zonder zoekpad — niet inlinebaar', () => {
    expect(
      valtOnderDeKlasse(
        `create function zz_proef() returns int language plpgsql stable as $$ begin return 7; end $$;`,
      ),
    ).toBe(false);
  });

  /**
   * Een `immutable` functie met een argument zónder default is niet zonder
   * argumenten aan te roepen, dus PostgREST geeft er een parameter aan mee en
   * er valt niets te vouwen. Het zoekpad sluit route B.
   */
  it('immutable met een verplicht argument en een zoekpad', () => {
    expect(
      valtOnderDeKlasse(
        `create function zz_proef(n int) returns int language ${VOUWBAAR} as $$ select n $$;`,
      ),
    ).toBe(false);
  });

  it('volatile met een zoekpad', () => {
    expect(
      valtOnderDeKlasse(
        `create function zz_proef() returns int language sql volatile set search_path = public, pg_temp as $$ select 7 $$;`,
      ),
    ).toBe(false);
  });

  /**
   * ⚠️ Een `security definer`-functie wordt niet ingelined, en dat is de derde
   *    voorwaarde in route B. Zonder deze tak zou elke definer-functie zonder
   *    zoekpad meegemeld worden — en die worden al door `definer_bewaking()`
   *    bewaakt, om een andere reden.
   */
  it('security definer zonder zoekpad — niet inlinebaar', () => {
    expect(
      valtOnderDeKlasse(
        `create function zz_proef() returns int language sql stable security definer as $$ select 7 $$;`,
      ),
    ).toBe(false);
  });
});
