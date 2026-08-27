import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `klokgrens-controle.test.ts`.
import {
  beoordeel,
  ontleed,
  REGISTER,
  schrijftNaarGroups,
  schrijvers,
  zonderCommentaar,
} from '../../scripts/pinuitzonderingen-controle.mjs';

/**
 * De ijking van `npm run pin:controle`.
 *
 * ⚠️ Wat dit script bewaakt is geen kolom en geen policy maar een **uitzondering**:
 *    `guard_group_update()` stapt opzij voor elke rol die geen client is, en een
 *    `SECURITY DEFINER`-functie draait als zijn eigenaar. Vijf functies maken
 *    daar met opzet gebruik van. De zesde die er ooit bijkomt, erft dat recht
 *    zonder dat iemand het merkt — er gaat niets kapot, er wordt niets rood, en
 *    dat is precies de vorm die dit project telkens duur betaalt.
 *
 * ⚠️ **De blokken over `schrijftNaarGroups()` zijn er op 27-08-2026 bij gekomen,
 *    en ze bewaken de helft die tot dan toe helemaal niet te ijken was.** Wie er
 *    langs de pin mag, werd gekozen door één regex in SQL over
 *    `pg_get_functiondef()` — inclusief commentaar. Die sloeg op 27-08 aan op
 *    een zin die uitlegde wat een functie juist **niet** doet, en de reparatie
 *    was toen de zin herschrijven in plaats van de code.
 *
 *    De valse positief was het kleine probleem. Het grote was dat niemand wist
 *    hoeveel valse negatieven eronder zaten, en dat je dat aan een heuristiek in
 *    SQL niet kúnt vragen zonder de database te wijzigen. Dezelfde zwakte als
 *    `tekst:controle` vóór QS8-115, op een script dat de gevoeligste tabel van
 *    het schema bewaakt.
 */

const REGISTERTJE = new Map([['rotate_invite_code', 'vervangt de uitnodigingscode']]);

describe('lezen', () => {
  it('houdt één functienaam per regel over', () => {
    expect(ontleed('archiveer_groep\nrotate_invite_code\n')).toEqual([
      'archiveer_groep',
      'rotate_invite_code',
    ]);
  });

  it('laat lege regels vallen — `psql -At` sluit af met een lege regel', () => {
    expect(ontleed('\n  archiveer_groep  \n\n')).toEqual(['archiveer_groep']);
  });
});

describe('het register', () => {
  it('meldt een functie die er niet in staat', () => {
    // De zesde uitzondering, die niemand als uitzondering herkent.
    const uit = beoordeel(['rotate_invite_code', 'nieuwe_functie'], REGISTERTJE);

    expect(uit.onbekend).toEqual(['nieuwe_functie']);
    expect(uit.verdwenen).toEqual([]);
  });

  it('meldt een reden voor een functie die weg is', () => {
    // ⚠️ De helft die je vergeet te bouwen. Zonder deze tak vult het register
    //    zich met redenen voor code die niet meer bestaat, en dan bewaakt het
    //    niets meer.
    const uit = beoordeel([], REGISTERTJE);

    expect(uit.verdwenen).toEqual(['rotate_invite_code']);
    expect(uit.onbekend).toEqual([]);
  });

  it('is stil als beide kanten kloppen', () => {
    const uit = beoordeel(['rotate_invite_code'], REGISTERTJE);

    expect(uit.onbekend).toEqual([]);
    expect(uit.verdwenen).toEqual([]);
  });
});

describe('het echte register', () => {
  it('geeft bij elke functie een reden en niet alleen een vinkje', () => {
    // Een register zonder redenen is een lijst uitzonderingen. De volgende lezer
    // moet kunnen zien waaróm deze functie langs de pin mag.
    for (const [functie, reden] of REGISTER as Map<string, string>) {
      expect(reden.length, `${functie} heeft geen reden`).toBeGreaterThan(40);
    }
  });
});

const DEFINITIE = (romp: string) =>
  `CREATE OR REPLACE FUNCTION public.iets()\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\nbegin\n${romp}\nend;\n$function$`;

describe('vormen die een schrijver naar `groups` zijn', () => {
  // ⚠️ De onderste vier kwamen niet door de oude SQL-regex. Dat is de reden dat
  //    deze detectie naar JavaScript is verhuisd: hier zijn ze te voeden.
  const vormen: [string, string][] = [
    ['de gewone vorm', "update groups set status = 'archived' where id = g;"],
    ['met schema ervoor', "update public.groups set status = 'archived';"],
    ['met extra witruimte', "update    groups   set status = 'x';"],
    ['over twee regels', "update\n    groups\n  set status = 'x';"],
    ['met ONLY ertussen', "update only groups set status = 'x';"],
    ['met aanhalingstekens', 'update "groups" set status = \'x\';'],
    ['schema en tabel allebei geciteerd', 'update "public"."groups" set status = \'x\';'],
    ['in hoofdletters', "UPDATE GROUPS SET STATUS = 'x';"],
    [
      'binnen een with-clausule',
      "with om as (update groups set status = 'x' returning id) select * from om;",
    ],
    ['binnen een execute', "execute 'update groups set status = ''x''';"],
  ];

  for (const [naam, romp] of vormen) {
    it(naam, () => {
      expect(schrijftNaarGroups(DEFINITIE(romp))).toBe(true);
    });
  }
});

describe('vormen die de controle met rust moet laten', () => {
  // ⚠️ Deze helft is even belangrijk. `group_members` en `goals` worden door
  //    tientallen functies bijgewerkt; sloeg de toets daarop aan, dan meldt hij
  //    de halve API en leer je hem te negeren.
  const vormen: [string, string][] = [
    [
      'een regelcommentaar dat zegt dat hij het juist niet doet',
      '-- Deze functie doet met opzet geen update groups; de pin blijft staan.\n  return;',
    ],
    [
      'een blokcommentaar met dezelfde zin erin',
      '/* Zie guard_group_update(): hier hoort geen update groups te staan. */\n  return;',
    ],
    ['een andere tabel met dezelfde stam', "update group_members set status = 'inactive';"],
    ['een tabel die met groups begint', "update groups_backup set status = 'x';"],
    ['een gewone andere tabel', "update goals set status = 'active';"],
    ['alleen lezen', 'perform 1 from groups where id = g;'],
    ['een insert', "insert into groups (name) values ('x');"],
  ];

  for (const [naam, romp] of vormen) {
    it(naam, () => {
      expect(schrijftNaarGroups(DEFINITIE(romp))).toBe(false);
    });
  }
});

describe('zonderCommentaar', () => {
  it('haalt regel- en blokcommentaar weg en laat de code staan', () => {
    const schoon = zonderCommentaar("update goals set x = 1; -- update groups\n/* update groups */");

    expect(schoon).toContain('update goals');
    expect(schoon).not.toContain('update groups');
  });

  it('laat een stringliteraal met opzet staan', () => {
    // ⚠️ `execute 'update groups ...'` schrijft écht. Die string wegpoetsen zou
    //    juist de gevaarlijkste vorm onzichtbaar maken.
    expect(zonderCommentaar("execute 'update groups set x = 1';")).toContain('update groups');
  });
});

describe('schrijvers', () => {
  /** Zoals de SQL hem levert: naam, `\x02`, en de definitie met `\x01` voor nieuwe regels. */
  const regel = (naam: string, romp: string) =>
    `${naam}\u0002${DEFINITIE(romp).replaceAll('\n', '\u0001')}`;

  it('geeft alleen de namen van functies die schrijven', () => {
    const uitvoer = [
      regel('archiveer_groep', "update groups set status = 'archived';"),
      regel('leest_alleen', 'perform 1 from groups;'),
      regel('praat_erover', '-- doet geen update groups\n  return;'),
    ].join('\n');

    expect(schrijvers(uitvoer)).toEqual(['archiveer_groep']);
  });

  it('herstelt de nieuwe regels, zodat commentaar niet de rest opslokt', () => {
    // ⚠️ Zonder die herstelstap loopt `--` door tot het einde van de héle
    //    definitie, en dan is élke functie met een commentaarregel onzichtbaar.
    //    Dat is een valse negatief op een beveiligingscontrole.
    const uitvoer = regel(
      'archiveer_groep',
      "-- eerst een uitleg\n  update groups set status = 'archived';",
    );

    expect(schrijvers(uitvoer)).toEqual(['archiveer_groep']);
  });

  it('slaat een regel zonder scheidingsteken over in plaats van te struikelen', () => {
    expect(schrijvers('rommel zonder scheiding')).toEqual([]);
  });
});
