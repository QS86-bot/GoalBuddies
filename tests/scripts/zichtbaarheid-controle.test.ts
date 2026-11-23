import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `pinuitzonderingen-controle.test.ts`.
import {
  beoordeel,
  codeZonderCommentaar,
  GEEN_OPPERVLAK,
  klassementpoort,
  ontleed,
  OPPERVLAKKEN,
} from '../../scripts/zichtbaarheid-controle.mjs';

import { nl } from '../../src/shared/i18n/nl';

/**
 * De ijking van `npm run zichtbaarheid:controle`.
 *
 * ⚠️ **Wat hier bewaakt wordt is geen kolom maar een belofte.** Besluit A41 gaf
 *    een groep de keuze tussen beschermd en open, en de zin die de gebruiker
 *    daarbij leest sómt op wat er dan zichtbaar wordt. Die zin staat in de
 *    catalogus; wat er werkelijk varieert staat in de database. Niets legde die
 *    twee naast elkaar, en dat is precies hoe die zin op 24-08-2026 een derde
 *    van de waarheid ging vertellen.
 *
 * ⚠️ **De bevinding van 25-08 zei dat zo'n controle "een machineleesbare vorm
 *    van §6b" vraagt.** Dat is naar de verkeerde bron gekeken: het
 *    beslisdocument is een beschrijving, de database is de waarheid. Wat op
 *    `groups.zichtbaarheid` varieert is gewoon te tellen.
 *
 * ⚠️ **Het register is tweezijdig, en de tweede helft is geen bijvangst.** Zes
 *    plekken noemen zichtbaarheid zonder een oppervlak te zijn — de twee
 *    hulpfuncties, de setter, de pin, het aanmaken en de uitnodigingspreview.
 *    Zonder die lijst meldt de controle er zes en leer je hem te negeren; mét
 *    die lijst is élke plek geclassificeerd en valt een nieuwe naam op.
 */

describe('ontleed', () => {
  it('houdt één plek per regel over', () => {
    expect(ontleed('functie:group_overview\nview:group_visible_streaks\n')).toEqual([
      'functie:group_overview',
      'view:group_visible_streaks',
    ]);
  });

  it('laat lege regels vallen — `psql -At` sluit af met een lege regel', () => {
    expect(ontleed('\n  functie:group_overview  \n\n')).toEqual(['functie:group_overview']);
  });
});

describe('beoordeel', () => {
  const opp = new Map([['functie:een', 'varieert']]);
  const geen = new Map([['functie:twee', 'is de setter']]);

  it('meldt een vijfde oppervlak dat in geen van beide lijsten staat', () => {
    // Dit is waar de bevinding om vroeg: "wordt zwaarder als er een vijfde
    // oppervlak op `groups.zichtbaarheid` gaat variëren".
    const uit = beoordeel(['functie:een', 'functie:twee', 'functie:nieuw'], opp, geen);

    expect(uit.onbekend).toEqual(['functie:nieuw']);
    expect(uit.verdwenen).toEqual([]);
  });

  it('meldt een register-rij waarvan de code weg is', () => {
    // ⚠️ De helft die je vergeet te bouwen. Een register dat achterloopt geeft
    //    redenen voor code die er niet meer is — en dan noemt de
    //    toestemmingszin mogelijk iets dat niet meer bestaat.
    const uit = beoordeel(['functie:een'], opp, geen);

    expect(uit.verdwenen).toEqual(['functie:twee']);
    expect(uit.onbekend).toEqual([]);
  });

  it('telt een plek uit de niet-oppervlaklijst niet als bezwaar', () => {
    // Zonder deze helft meldt de controle de zes mechanismeplekken elke keer.
    expect(beoordeel(['functie:een', 'functie:twee'], opp, geen)).toEqual({
      onbekend: [],
      verdwenen: [],
    });
  });
});

describe('de twee registers', () => {
  it('overlappen niet — een plek is een oppervlak of hij is het niet', () => {
    // Stond een naam in allebei, dan is de classificatie zelf de vraag die deze
    // controle hoort te beantwoorden.
    const beide = [...(OPPERVLAKKEN as Map<string, string>).keys()].filter((k) =>
      (GEEN_OPPERVLAK as Map<string, string>).has(k),
    );

    expect(beide).toEqual([]);
  });

  it('geven bij elke plek een reden en niet alleen een vinkje', () => {
    for (const register of [OPPERVLAKKEN, GEEN_OPPERVLAK] as Map<string, string>[]) {
      for (const [plek, reden] of register) {
        expect(reden.length, `${plek} heeft geen reden`).toBeGreaterThan(30);
      }
    }
  });

  it('dragen een soortprefix, zodat een functie en een view niet botsen', () => {
    for (const register of [OPPERVLAKKEN, GEEN_OPPERVLAK] as Map<string, string>[]) {
      for (const plek of register.keys()) {
        expect(plek, `${plek} mist een soort`).toMatch(/^(functie|policy|view):/);
      }
    }
  });
});

/**
 * De poort van het klassement sinds A57 (QS8-666, 0333) — QS8-802.
 *
 * ⚠️ De vormen zijn uitgekleed naar de regels waar het om gaat, maar volgen de
 *    `where` van beide functies zoals `pg_get_functiondef()` hem op een lokaal
 *    opgebouwd schema teruggeeft — met het commentaar erin, want dat commentaar
 *    is precies waarom de zoekvraag `groep_klassement()` vindt.
 *
 * ⚠️ Dezelfde `klassementpoort()` draait ook in `tests/beloftes/klassementpoort.test.ts`,
 *    daar op de migratiebestanden. Hier gaat het om de vormen die hij moet vinden
 *    en de vormen die hij met rust moet laten.
 */
const GROEP_A57 = `
  from gerangschikt g
  join group_members m on m.status <> 'inactive'
  where lid_van_levende_groep(p_group_id)
    -- ⚠️ A57 (QS8-666): het klassement hangt aan een eigen schakelaar op de groep en niet
    --    meer aan de zichtbaarheid. Drie voorwaarden naast elkaar, elk zichtbaar:
    and exists (select 1 from groups gr
                 where gr.id = p_group_id and gr.klassement_aan)
    and not exists (select 1 from groups gr
                     where gr.id = p_group_id and gr.organization_id is not null)
`;

const MIJN_A57 = `
    where lid_van_levende_groep(g.id)
      and g.klassement_aan
      and g.organization_id is null
      -- Hier expliciet, waar \`groep_klassement()\` op de CHECK leunt.
      and not g.automatisch
    join group_members lm on lm.group_id = mj.gid and lm.status <> 'inactive'
`;

/** De poort van A54 (0141), zoals hij tot 0333 stond. */
const GROEP_A54 = `
  from gerangschikt g
  join group_members m on m.status <> 'inactive'
  where lid_van_open_groep(p_group_id)
    and not exists (select 1 from groups gr
                     where gr.id = p_group_id and gr.organization_id is not null)
`;

describe('klassementpoort', () => {
  it('laat de poort van A57 met rust, ook met "zichtbaarheid" in het commentaar', () => {
    expect(klassementpoort('groep_klassement', GROEP_A57)).toEqual([]);
    expect(klassementpoort('mijn_klassementen', MIJN_A57)).toEqual([]);
  });

  it('meldt de oude poort van A54 — de terugval die het issue noemt', () => {
    const bezwaren = klassementpoort('groep_klassement', GROEP_A54);

    expect(bezwaren.some((b) => b.includes('`open_groep`'))).toBe(true);
    expect(bezwaren.some((b) => b.includes('`klassement_aan`'))).toBe(true);
    expect(bezwaren.some((b) => b.includes('`lid_van_levende_groep(`'))).toBe(true);
  });

  it('meldt een poort die naast de schakelaar ook nog op open filtert', () => {
    // De sluwe variant: alle eisen staan er, en de oude toets erbij.
    const beide = GROEP_A57.replace(
      'and gr.klassement_aan)',
      "and gr.klassement_aan and gr.zichtbaarheid = 'open')",
    );

    expect(beide).not.toBe(GROEP_A57);
    expect(klassementpoort('groep_klassement', beide)).toEqual([
      'groep_klassement: filtert op `zichtbaarheid`: de zichtbaarheid van de groep — sinds A57 niet meer de poort',
    ]);
  });

  /** Mutatie per poortdeel, niet één mutatie voor de hele toets. */
  it.each([
    ['groep_klassement', GROEP_A57, 'lid_van_levende_groep(p_group_id)', 'true', 'lid_van_levende_groep('],
    ['groep_klassement', GROEP_A57, 'and gr.klassement_aan', '', 'klassement_aan'],
    ['groep_klassement', GROEP_A57, "status <> 'inactive'", 'status is not null', "status <> 'inactive'"],
    ['groep_klassement', GROEP_A57, 'gr.organization_id is not null', 'false', 'organization_id is not null'],
    ['mijn_klassementen', MIJN_A57, 'lid_van_levende_groep(g.id)', 'true', 'lid_van_levende_groep('],
    ['mijn_klassementen', MIJN_A57, 'and g.klassement_aan', '', 'klassement_aan'],
    ['mijn_klassementen', MIJN_A57, "lm.status <> 'inactive'", 'true', "status <> 'inactive'"],
    ['mijn_klassementen', MIJN_A57, 'g.organization_id is null', 'g.organization_id is not null', 'g.organization_id is null'],
    ['mijn_klassementen', MIJN_A57, 'and not g.automatisch', '', 'not g.automatisch'],
  ])('%s: zonder `%s` precies één bezwaar', (functie, vorm, weg, ervoor, eis) => {
    const gebroken = vorm.replace(weg, ervoor);

    expect(gebroken).not.toBe(vorm);
    const bezwaren = klassementpoort(functie, gebroken);
    expect(bezwaren).toHaveLength(1);
    expect(bezwaren[0]).toContain(`mist \`${eis}\``);
  });

  it('telt een eis die alleen in commentaar staat niet als aanwezig', () => {
    const inCommentaar = MIJN_A57.replace('and g.klassement_aan', '-- and g.klassement_aan');

    expect(klassementpoort('mijn_klassementen', inCommentaar)).toEqual([
      'mijn_klassementen: mist `klassement_aan`: de schakelaar op de groep (A57, 0333)',
    ]);
  });

  it('meldt een functie die er niet is, of geen poort heeft, in plaats van groen te zwijgen', () => {
    expect(klassementpoort('groep_klassement', '')).toHaveLength(1);
    expect(klassementpoort('mijn_klassementen', '\n')).toHaveLength(1);
    expect(klassementpoort('iets_anders', GROEP_A57)).toHaveLength(1);
  });
});

describe('codeZonderCommentaar', () => {
  it('haalt regel- en blokcommentaar weg en laat de code staan', () => {
    const uit = codeZonderCommentaar('a -- zichtbaarheid\nb /* open_groep */ c');

    expect(uit).not.toMatch(/zichtbaarheid|open_groep/);
    expect(uit).toMatch(/a[\s\S]*b[\s\S]*c/);
  });
});

describe('het klassement in de registers', () => {
  it('staat sinds A57 niet meer bij de oppervlakken van Open', () => {
    expect((OPPERVLAKKEN as Map<string, string>).has('functie:groep_klassement')).toBe(false);
    expect((GEEN_OPPERVLAK as Map<string, string>).get('functie:groep_klassement')).toMatch(
      /klassement_aan/,
    );
  });
});

describe('de toestemmingszin', () => {
  /**
   * ⚠️ **Dit is de naad waar de hele bevinding over gaat**, en de test kan hem
   *    niet dichttimmeren: of een zin vier oppervlakken *dekt*, is een oordeel
   *    en geen meting. Wat wél te toetsen valt, is dat de zin er is en dat hij
   *    de dingen noemt die vandaag opengaan. Verandert het aantal oppervlakken,
   *    dan wordt `zichtbaarheid:controle` rood en komt iemand hier langs.
   */
  it('bestaat en noemt de dingen die vandaag opengaan', () => {
    const zin = nl['zichtbaarheid.open_uitleg'];

    expect(zin).toBeTruthy();
    expect(zin).toMatch(/gemiste/i);
    expect(zin).toMatch(/reeks/i);
    expect(zin).toMatch(/meedeed|meedoet/i);
    expect(zin).toMatch(/punt/i);
    // ⚠️ Het zesde oppervlak, sinds 0268 (QS8-477): welke held er bij wie langs
    //    is geweest. Dat is een tegenslagsignaal — `misser` en `stilte` — en de
    //    zin waar iemand ja op zegt hoort het te noemen.
    expect(zin).toMatch(/held/i);
  });

  it('staat ook in de bevestiging, want dáár geeft iemand toestemming', () => {
    const zin = nl['bevestiging.groep_openzetten.uitleg'];

    expect(zin).toBeTruthy();
    expect(zin).toMatch(/gemiste/i);
    expect(zin).toMatch(/reeks/i);
    expect(zin).toMatch(/held/i);
  });

  /**
   * ⚠️ **De andere kant van dezelfde belofte, en die stond hier niet.** Beide
   *    zinnen hierboven sommen op wat er ópengaat; de bevestiging bij het
   *    terugzetten somt op wat er dichtgaat. Loopt die uit de pas, dan belooft de
   *    app dat er iets privé wordt terwijl het blijft staan — en dat is de
   *    gevaarlijke richting van de twee.
   */
  it('en de bevestiging bij het terugzetten noemt wat er dan weer dichtgaat', () => {
    const zin = nl['bevestiging.groep_beschermen.uitleg'];

    expect(zin).toBeTruthy();
    expect(zin).toMatch(/gemiste/i);
    expect(zin).toMatch(/held/i);
    // ⚠️ Sinds A57 gaat het klassement bij beschermen níet dicht (QS8-802): het
    //    hangt aan de schakelaar. De zin moet dat zeggen, en niet alleen het woord
    //    noemen — tot QS8-802 stond hier `/klassement/`, en dat was ook groen
    //    geweest op "dicht gaat: … het klassement".
    expect(zin).toMatch(/klassement blijft/i);
  });

  it('noemt dat het met terugwerkende kracht geldt', () => {
    // ⚠️ De duurste helft van die zin: openzetten onthult ook de weken die er
    //    al staan. Wie dat pas ná het omzetten leest, heeft toestemming gegeven
    //    voor iets anders dan hij dacht.
    expect(nl['bevestiging.groep_openzetten.uitleg']).toMatch(/al staan|terugwerkende/i);
  });
});
