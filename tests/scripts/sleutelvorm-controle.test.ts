import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast.
import {
  beoordeel,
  leesplekken,
  NUMERIEKE_LEZERS,
  ontleed,
  zonderCommentaar,
} from '../../scripts/sleutelvorm-controle.mjs';

/**
 * QS8-491 — de vorm waarin een `app.`-sleutel gelezen wordt.
 *
 * ⚠️ **Deze tests bestaan omdat de controle zelf een database nodig heeft.** Hij
 *    slaat zichzelf zonder database netjes over, en een controle die je nooit
 *    rood ziet worden is een aanname (CLAUDE.md, bij regel 18). Hier krijgt hij
 *    élke vorm los aangeboden: de vormen die hij moet vínden én de vormen die
 *    hij met rúst moet laten. Die tweede helft weegt even zwaar — een controle
 *    die alles meldt, leer je uitzetten.
 *
 * ⚠️⚠️ **De zeven veilige vormen hieronder zijn woordelijk overgenomen uit
 *    `pg_get_functiondef()`** op 14-09-2026 en niet nagetypt uit het geheugen.
 *    Een must-allow die op een verzonnen vorm leunt, bewijst niets over de code
 *    die er echt staat.
 */

/** De drie uit `guard_group_member_update()` — de reparatie van 0199. */
const COALESCE_ERVOOR = `
    v_overdracht := coalesce(
      nullif(current_setting('app.beheer_overgedragen', true), '') = old.group_id::text,
      false
    );
`;

/** Uit `archief_blijft_archief()`. */
const IS_DISTINCT = `
    if nullif(current_setting('app.heropent_groep', true), '') is distinct from old.id::text then
      raise exception 'Een gearchiveerde groep wordt heropend met heropen_groep()';
    end if;
`;

/** Uit `pin_taak()`. */
const IS_NOT_DISTINCT = `
  v_mag_delen := nullif(current_setting('app.taak_gedeeld', true), '') is not distinct from old.id::text;
`;

/** De vorm van de zeventien `rem_*`-functies. */
const NUMERIEK = `
  v_aantal := coalesce(nullif(current_setting('app.rem_doelen', true), ''), '0')::integer;
  if v_aantal >= 50 then raise exception 'te veel'; end if;
`;

describe('leesplekken — de vormen die stil moeten blijven', () => {
  it('ziet de coalesce die VOOR de current_setting staat', () => {
    const [plek] = leesplekken(COALESCE_ERVOOR);

    // ⚠️ Dit is de valkuil uit het issue: een venster dat 140 tekens vooruit
    //    keek meldde precies deze gerepareerde vorm als defect.
    expect(plek).toMatchObject({
      sleutel: 'app.beheer_overgedragen',
      klasse: 'vergelijking',
      veilig: true,
    });
  });

  it('laat `is distinct from` en `is not distinct from` met rust', () => {
    expect(leesplekken(IS_DISTINCT)[0]).toMatchObject({ veilig: true, klasse: 'vergelijking' });
    expect(leesplekken(IS_NOT_DISTINCT)[0]).toMatchObject({ veilig: true, klasse: 'vergelijking' });
  });

  it('deelt de numerieke lezer in als numeriek en niet als vergelijking', () => {
    expect(leesplekken(NUMERIEK)[0]).toMatchObject({ klasse: 'numeriek', veilig: true });
  });

  it('meldt niets over een lichaam zonder app.-sleutel', () => {
    expect(leesplekken("select current_setting('search_path');")).toEqual([]);
  });
});

describe('leesplekken — de vormen die gemeld moeten worden', () => {
  it('meldt een kale = op de weiger-kant', () => {
    const bron = `
      if nullif(current_setting('app.lid_uitgezet', true), '') = old.group_id::text then
        raise exception 'mag niet';
      end if;
    `;

    expect(leesplekken(bron)[0]).toMatchObject({
      sleutel: 'app.lid_uitgezet',
      klasse: 'vergelijking',
      veilig: false,
    });
  });

  it('meldt een kale = óók op de toelaat-kant', () => {
    // ⚠️ Met opzet. De controle eist de vorm en bepaalt de kant niet: een
    //    nullveilige vergelijking is aan beide kanten goed, dus de strengere
    //    eis kost niets. Wie hier later een uitzondering voor de toelaat-kant
    //    maakt, moet eerst de `if` uitparsen — en dán is de vraag welke tak
    //    hem omsluit, niet welk teken erachter staat.
    const bron = `
      if nullif(current_setting('app.lid_uitgezet', true), '') = old.group_id::text then
        return new;
      end if;
    `;

    expect(leesplekken(bron)[0]).toMatchObject({ veilig: false });
  });

  it('meldt <> en != net zo goed als =', () => {
    for (const op of ['<>', '!=']) {
      const bron = `if nullif(current_setting('app.x_sleutel', true), '') ${op} old.id::text then null; end if;`;
      expect(leesplekken(bron)[0]).toMatchObject({ veilig: false });
    }
  });

  it('trapt niet in een coalesce die iets ANDERS dan false teruggeeft', () => {
    // `coalesce(<vergelijking>, true)` is geen grendel maar het tegendeel: hij
    // laat een onbekende sleutel juist dóór.
    const bron = `
      v_x := coalesce(
        nullif(current_setting('app.beheer_overgedragen', true), '') = old.group_id::text,
        true
      );
    `;

    expect(leesplekken(bron)[0]).toMatchObject({ veilig: false });
  });

  it('faalt dicht op een vorm die het niet kent', () => {
    // Geen vergelijking, geen numerieke coalesce — dan weet de controle het
    // niet, en dan meldt hij het. Zelfde keuze als `sleutelzetters()`.
    const bron = `v_x := upper(current_setting('app.iets_nieuws', true));`;

    expect(leesplekken(bron)[0]).toMatchObject({ klasse: 'onbekend', veilig: false });
  });
});

describe('zonderCommentaar — de knip is zelf een grendel', () => {
  it('telt een uitgecommentarieerde vorm niet mee', () => {
    const bron = `-- nullif(current_setting('app.oud', true), '') = old.id::text
      v_x := nullif(current_setting('app.echt', true), '') is distinct from old.id::text;`;

    expect(leesplekken(bron).map((p: { sleutel: string | undefined }) => p.sleutel)).toEqual([
      'app.echt',
    ]);
  });

  it('eet niet de rest van de regel op na een streepje binnen een string', () => {
    // ⚠️⚠️ **Op één regel, en dat is het hele punt.** De eerste versie van deze
    //    toets zette de `--` en de leesplek op verschillende régels — dan valt
    //    de vorm binnen de regelgrens van de knip en is hij groen om een reden
    //    die niets met de belofte te maken heeft. 📏 Met de oude knip
    //    (één regex op `--`) houdt dit `v_x := 'a` over en vindt de controle
    //    **nul** leesplekken, dus een kale vergelijking glipt stil door.
    const bron = `v_x := 'a--b' || nullif(current_setting('app.echt', true), '') = old.id::text;`;

    const plekken = leesplekken(bron);
    expect(plekken).toHaveLength(1);
    expect(plekken[0]).toMatchObject({ sleutel: 'app.echt', veilig: false });
  });

  it('haalt een blokcommentaar weg', () => {
    expect(zonderCommentaar("/* current_setting('app.x') */ select 1;")).not.toContain('app.x');
  });
});

describe('beoordeel — de ratel slaat twee kanten op', () => {
  const numeriek = { naam: 'rem_doelen', plekken: leesplekken(NUMERIEK) };

  it('laat een numerieke leesplek mét registerrij door', () => {
    expect(beoordeel([numeriek]).defect).toEqual([]);
  });

  it('meldt een numerieke leesplek ZONDER registerrij', () => {
    const uitslag = beoordeel([{ naam: 'rem_nieuw', plekken: leesplekken(NUMERIEK) }], {});

    expect(uitslag.defect).toHaveLength(1);
    expect(uitslag.defect[0]?.reden).toContain('zonder registerrij');
  });

  it('meldt een registerrij die naar niets meer wijst', () => {
    const uitslag = beoordeel([numeriek], { rem_doelen: 'reden', rem_weg: 'reden' });

    // ⚠️ De andere kant van de ratel. Een reden voor iets dat er niet meer is,
    //    dekt ooit stilletjes een nieuwe functie met dezelfde naam.
    expect(uitslag.verdwenen).toEqual(['rem_weg']);
  });

  it('telt sleutels en leesplekken apart — één sleutel kan twee plekken hebben', () => {
    const bron = `
      if nullif(current_setting('app.huddledag_verzet', true), '') is distinct from old.group_id::text then null; end if;
      if nullif(current_setting('app.huddledag_verzet', true), '') is distinct from old.group_id::text then null; end if;
    `;
    const uitslag = beoordeel([{ naam: 'pin_week_review', plekken: leesplekken(bron) }], {});

    expect(uitslag.plekken).toBe(2);
    expect(uitslag.sleutels).toBe(1);
  });
});

describe('ontleed — de uitvoer van de vraag', () => {
  it('splitst naam en lichaam per functie', () => {
    const uitvoer = `pin_taak\u0001${IS_NOT_DISTINCT}\u0002rem_doelen\u0001${NUMERIEK}`;
    const functies = ontleed(uitvoer);

    expect(functies.map((f: { naam: string }) => f.naam)).toEqual(['pin_taak', 'rem_doelen']);
    expect(functies[1]?.plekken[0]).toMatchObject({ klasse: 'numeriek' });
  });

  it('geeft een lege lijst terug als er geen functie is', () => {
    expect(ontleed('')).toEqual([]);
  });
});

describe('het register zelf', () => {
  it('draagt de zeventien numerieke lezers, elk met een reden', () => {
    const rijen = Object.entries(NUMERIEKE_LEZERS);

    expect(rijen).toHaveLength(17);
    for (const [naam, reden] of rijen) {
      expect(naam).toMatch(/^rem_/);
      expect(reden.length).toBeGreaterThan(20);
    }
  });
});
