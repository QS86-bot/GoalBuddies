import { describe, expect, it } from 'vitest';

import { onbereikbaar } from '../../scripts/dode-exports-controle.mjs';
import {
  GEDEELDE_WAARDEN,
  functiesZonderAanroeper,
  waardenZonderSchrijver,
} from '../../scripts/dode-keten-controle.mjs';

/**
 * De les van QS8-194, gevoerd aan de grendels die eruit voortgekomen zijn.
 *
 * ⚠️ **Deze test toetst geen script, hij toetst een belofte over drie scripts
 *    samen:** *de drie gevallen die dit project deze les geleerd hebben, zouden
 *    vandaag rood worden.* Dat is een eigenschap van het gehéél, en de enige
 *    manier om hem te beantwoorden is de gevallen echt vóéren — niet erover
 *    nadenken. CLAUDE.md, onwrikbare regel 18, vraag 3.
 *
 * **De drie gevallen.** QS8-47, QS8-112 en EPIC 9 hadden dezelfde vorm: elk
 * onderdeel af en getoetst, de keten nergens verbonden, en geen enkele test die
 * het kón zien. Twee triggers stonden maandenlang in de database zonder één keer
 * af te gaan.
 *
 * | | Wat er misging | Wie het vandaag zou vangen |
 * |---|---|---|
 * | A | een databasefunctie die niemand aanroept (QS8-47) | `keten:controle` |
 * | B | een datalaagfunctie zonder scherm (QS8-112) | `exports:controle` (QS8-150) |
 * | C | een CHECK-waarde die niets ooit schrijft (EPIC 9) | `keten:controle` |
 *
 * ⚠️⚠️ **En geval C wordt vandaag níét gevangen in de vorm waarin het gebeurde.**
 *    Dat is op 10-09-2026 gemeten en het staat hieronder vastgepind. `goals.status`
 *    kon nooit `completed` worden, maar `goal_events.event_type` kent diezelfde
 *    waarde en die schríjft de app wél. `waardenZonderSchrijver()` zoekt de
 *    string in álle bronbestanden zonder te weten bij welke tabel de treffer
 *    hoort, dus hij zwijgt. `completed` staat om die reden in `GEDEELDE_WAARDEN`.
 *
 * 📏 **Een tabelbewuste reparatie is geprototypeerd en op de meting afgewezen.**
 *    Een lezer die `.from('X').insert/.update({…})`-ketens en
 *    `update <tabel> set …` uit de migraties leest, zou **47 van de 78**
 *    tabel/waarde-paren melden — waarden komen ook uit kolomdefaults, Zod-enums,
 *    functieparameters en triggerlichamen, en die dekt zo'n lezer geen van alle.
 *    Een controle die 47 dingen meldt, leer je te negeren, en dan bewaakt hij
 *    niets meer. De aantekening in `dode-keten-controle.mjs` — *"de echte
 *    reparatie is een tabelbewuste toets, en die kan niet"* — staat daarmee op
 *    een meting in plaats van op een vermoeden.
 *
 * IJKING — met de hand, 10-09-2026. Eén mutatie per grendel:
 *
 *   A  de aanroeper-toets in `functiesZonderAanroeper()` uitzetten
 *      -> 1 rood: 'een databasefunctie zonder aanroeper wordt gevonden'
 *   B  de bereikbaarheidsfilter in `onbereikbaar()` op `[]` zetten
 *      -> 1 rood: 'een datalaagfunctie zonder pad naar een scherm wordt gevonden'
 *   C  de `prodBron`-zoektocht in `waardenZonderSchrijver()` altijd laten slagen
 *      -> 1 rood: 'een CHECK-waarde die niets schrijft wordt gevonden'
 *
 * ⚠️ **Mutatie C is de tweede poging, en de eerste staat hier omdat hij de fout
 *    laat zien waar CLAUDE.md voor waarschuwt.** Eerst is de zoektocht door de
 *    migratie-romp uitgezet; de test bleef groen. Terecht: een zoektocht
 *    uitzetten meldt **méér** waarden en niet minder, en deze test leunt op de
 *    ándere zoektocht — die door `prodBron`. *Breek de grendel die de ijking
 *    noemt, niet zomaar iets* — anders is de ijking zelf de aanname.
 */
describe('de drie gevallen die deze les geleerd hebben', () => {
  it('A — een databasefunctie zonder aanroeper wordt gevonden', () => {
    const dood = functiesZonderAanroeper({
      sql: 'create or replace function public.markeer_onvoltooide_weekdoelen() returns void language sql as $$ select 1 $$;',
      prodBron: 'export const iets = 1;',
    });

    expect(dood).toContain('markeer_onvoltooide_weekdoelen');
  });

  it('A — MUST-ALLOW: een functie mét een aanroeper blijft stil', () => {
    const dood = functiesZonderAanroeper({
      sql: 'create or replace function public.weekpas_maximum() returns integer language sql as $$ select 2 $$;',
      prodBron: "supabase.rpc('weekpas_maximum')",
    });

    expect(dood).toEqual([]);
  });

  /**
   * ⚠️ De wortels zijn `app/` en `supabase/functions/` — een gebruiker bereikt
   *    code langs een scherm of een geplande taak. Een datalaagfunctie die
   *    nergens vandaan aangeroepen wordt, is precies QS8-112.
   */
  it('B — een datalaagfunctie zonder pad naar een scherm wordt gevonden', () => {
    const gevonden = onbereikbaar(
      [
        { pad: '/p/src/modules/goals/api.ts', bron: 'export function maakWeekdoel() { return 1; }' },
        { pad: '/p/app/(tabs)/index.tsx', bron: 'export default function Start() { return null; }' },
      ],
      (pad: string) => pad.startsWith('/p/app/'),
      new Set(['maakWeekdoel']),
    );

    expect(gevonden).toContain('maakWeekdoel');
  });

  it('B — MUST-ALLOW: een functie die een scherm aanroept blijft stil', () => {
    const gevonden = onbereikbaar(
      [
        { pad: '/p/src/modules/goals/api.ts', bron: 'export function maakWeekdoel() { return 1; }' },
        { pad: '/p/app/(tabs)/index.tsx', bron: 'export default function Start() { return maakWeekdoel(); }' },
      ],
      (pad: string) => pad.startsWith('/p/app/'),
      new Set(['maakWeekdoel']),
    );

    expect(gevonden).toEqual([]);
  });

  it('C — een CHECK-waarde die niets schrijft wordt gevonden', () => {
    const dood = waardenZonderSchrijver({
      bestanden: [
        {
          naam: '0001.sql',
          sql: "alter table public.goals add constraint goals_status_ok check (status in ('active','completed'));",
        },
      ],
      prodBron: "supabase.from('goals').update({ status: 'active' })",
    });

    expect(dood.map((r: { waarde: string }) => r.waarde)).toContain('completed');
  });
});

/**
 * ⚠️⚠️ **Deze test pint een gat vast en geen eigenschap, en rood is hier goed
 *    nieuws.** Wordt hij rood, dan is `waardenZonderSchrijver()` tabelbewust
 *    geworden of is `completed` uit `GEDEELDE_WAARDEN` verdwenen — en dan hoort
 *    de rij van 21-08 in `docs/ENGINEER-REVIEW.md` bijgewerkt te worden en deze
 *    test omgezet naar een gewone must-find.
 *
 * ⚠️ **Zonder deze test is het gat alleen een zin in een commentaarblok**, en dat
 *    is in dit project precies de vorm die stil verrot — QS8-187 en QS8-204
 *    gingen daarover.
 */
describe('en het gat dat daarna nog openstaat', () => {
  it('C — in de vorm waarin EPIC 9 gebeurde, blijft de controle stil', () => {
    const dood = waardenZonderSchrijver({
      bestanden: [
        {
          naam: '0001.sql',
          sql: "alter table public.goals add constraint goals_status_ok check (status in ('active','completed'));",
        },
        {
          naam: '0002.sql',
          sql: "alter table public.goal_events add constraint ge_type_ok check (event_type in ('completed'));",
        },
      ],
      // De app schrijft `completed` alleen op `goal_events`, nooit op `goals`.
      prodBron: "supabase.from('goal_events').insert({ event_type: 'completed' })",
    });

    const opGoals = dood.filter(
      (r: { tabel: string; waarde: string }) => r.tabel === 'goals' && r.waarde === 'completed',
    );

    expect(
      opGoals,
      'de controle is tabelbewust geworden — werk de rij van 21-08 bij en maak hier een must-find van',
    ).toEqual([]);
  });

  it('en `completed` staat daarom op de lijst van tabelblinde waarden', () => {
    expect(GEDEELDE_WAARDEN).toHaveProperty('completed');
    expect(GEDEELDE_WAARDEN.completed).toEqual(expect.arrayContaining(['goals', 'goal_events']));
  });
});
