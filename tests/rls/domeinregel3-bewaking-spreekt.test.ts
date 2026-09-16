import { describe, expect, it } from 'vitest';

import { psql, psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De bewaking van domeinregel 3 laten **spreken** — reviewrij 15-09-2026.
 *
 * ⚠️⚠️ **Dit bestand bestaat omdat `domeinregel3.test.ts` alleen stilte eist.**
 *    Die suite toetst de bewaking op twee plekken, en allebei de keren zo:
 *
 *        expect(data ?? []).toEqual([]);          // regel 56
 *        expect((data ?? []) as unknown[]).toHaveLength(0);   // regel 926
 *
 *    Dat is `toHaveLength(0)` op een functie die zélf de grendel is. Vervang het
 *    lichaam van `domeinregel3_bewaking()` door `select where false` en beide
 *    blijven groen — de bewaking bewaakt de policy en de trigger, en niets
 *    bewaakt de bewaking. Regel 18 vraag 3 in zijn zuiverste vorm: *kan deze
 *    test groen blijven terwijl de belofte breekt?*
 *
 * ⚠️ **Wat er wél al was, en waarom dat niet genoeg is.** De kop van
 *    `domeinregel3.test.ts` draagt een uitgeschreven ijking — M9a, M9b en M10 —
 *    waarin de bewaking met de hand gemuteerd is en netjes rood werd. Dat is de
 *    standaard van dit project en het is goed werk. Maar **een handmeting is een
 *    meting van één moment**; wat er daarna elke dag draait is de stilte-eis.
 *    Raakt de bewaking later een tak kwijt, dan is er niets dat dat ziet.
 *    Dit bestand zet die ijking om in tests die meedraaien.
 *
 * ⚠️ **Elke tak krijgt zijn eigen mutatie.** `CLAUDE.md`: *mutatie per grendel,
 *    en niet één mutatie voor de hele controle.* Eén mutatie die alle acht takken
 *    tegelijk laat melden bewijst dat er íets spreekt, niet dat déze tak dat doet
 *    — en dat verschil is in dit project al een keer een grendel geweest die
 *    niets vond.
 *
 * ⚠️ **Alles in een teruggedraaide transactie.** Postgres kent transactionele
 *    DDL, dus de mutatie bestaat alleen binnen de `begin … rollback` en de
 *    database ziet hem nooit. Daarom mag dit bestand DDL doen waar de rest van de
 *    suite dat niet doet.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  // De tak `clausule4-actieve-voltooiing` komt uit 0275. Staat hij er niet, dan
  // loopt het schema achter op de migraties en meet dit bestand een andere
  // bewaking dan de repo beschrijft.
  "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
    "where n.nspname = 'public' and p.proname = 'domeinregel3_bewaking' " +
    "and pg_get_functiondef(p.oid) like '%clausule4-actieve-voltooiing%'",
  import.meta.url,
);

/** De acht sloten die de bewaking hoort te kennen. */
const SLOTEN = [
  'clausule2-koppeling',
  'clausule2-lidmaatschap',
  'clausule4-actieve-voltooiing',
  'constraint',
  'eigenaar-fk',
  'rls',
  'rls-superseded',
  'trigger',
] as const;

/** Wat de bewaking meldt nádat `ddl` is uitgevoerd — in een transactie die terugrolt. */
function bewakingNa(ddl: string): string[] {
  const uit = psqlMetInvoer(`
    begin;
    ${ddl}
    select slot from public.domeinregel3_bewaking() order by slot;
    rollback;
  `);
  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '' && !r.startsWith('BEGIN') && !r.startsWith('ROLLBACK'));
}

/**
 * Het lichaam van `fill_approval_subject()` met één clausule ánders gespeld.
 *
 * ⚠️ **De échte definitie als vertrekpunt, en niet een zelfgeschreven stub.** Een
 *    stub mist álle drie de gezochte clausules en laat dus drie takken tegelijk
 *    melden; dan toetst elke test hetzelfde. Door precies één fragment in de
 *    levende definitie te vervangen blijft de mutatie bij één tak.
 *
 * ⚠️⚠️ **De vervanging betekent hetzelfde en is geldige SQL — en dát is wat deze
 *    drie takken werkelijk toetsen.** 0262 koos voor een tekstzoektocht in het
 *    functielichaam, dus wat zo'n tak bewaakt is de **spelling** van een clausule
 *    en niet haar aanwezigheid. `from public.group_members` doet precies wat
 *    `from group_members` doet; de tak meldt er niettemin op. Het fragment
 *    wégknippen is geen bruikbare mutatie gebleken — dan blijft er een losse
 *    alias of een lege `if`-voorwaarde staan en weigert Postgres de functie, en
 *    dan meet je de parser in plaats van de bewaking.
 *
 *    Dat die takken op spelling matchen is een eigenschap om te kennen, geen
 *    reden om ze niet te ijken: een tak die op géén enkele herschrijving reageert
 *    is stuk, en dat is wat hier gemeten wordt. De keerzijde — een tak die zwijgt
 *    terwijl de clausule in dode code staat — staat als eigen rij op de agenda.
 */
function fillApprovalSubjectMet(fragment: string, vervanging: string): string {
  const definitie = psql("select pg_get_functiondef('public.fill_approval_subject'::regproc)");
  const gewijzigd = definitie.replace(fragment, vervanging);
  if (gewijzigd === definitie) {
    throw new Error(
      `het fragment "${fragment}" staat niet in fill_approval_subject() — ` +
        'de mutatie zou niets veranderen en de uitslag niets bewijzen',
    );
  }
  return `${gewijzigd};`;
}

describe.skipIf(!beschikbaar)('de bewaking van domeinregel 3 spreekt per slot', () => {
  it('zwijgt als er niets mis is', () => {
    // De nulmeting. Zonder deze weet je bij een rode tak niet of hij op jouw
    // mutatie reageert of op iets dat er al stond — `CLAUDE.md`: een rood is niet
    // vanzelf jouw rood.
    expect(bewakingNa('')).toEqual([]);
  });

  it('kent precies deze acht sloten en niet minder', () => {
    // ⚠️ Deze toets vangt de vorm die de stilte-eis structureel niet kan zien:
    //    een tak die uit het lichaam verdwijnt. Hij leest de sloten uit de
    //    functie zelf, dus er is geen tweede lijst die kan gaan afwijken.
    const gevonden = psql(`
      select string_agg(m[1], ',' order by m[1])
      from regexp_matches(
             pg_get_functiondef('public.domeinregel3_bewaking'::regproc),
             'select\\s+''([a-z0-9-]+)''::text', 'g') as m
    `);

    expect(gevonden.split(',')).toEqual([...SLOTEN]);
  });

  it('meldt `rls` zodra de policy de zelfgoedkeur-clausule kwijt is', () => {
    expect(
      bewakingNa(`
        alter policy completion_approvals_insert on public.completion_approvals
          with check (true);
      `),
    ).toContain('rls');
  });

  it('meldt `rls-superseded` zodra de policy de vervangen-clausule kwijt is', () => {
    // ⚠️ De clausule `c.user_id <> auth.uid()` blijft hier juist stáán, zodat de
    //    `rls`-tak zwijgt en deze test alleen over zijn eigen slot gaat.
    expect(
      bewakingNa(`
        alter policy completion_approvals_insert on public.completion_approvals
          with check (
            exists (
              select 1 from public.completions c
              where c.id = completion_id and c.user_id <> auth.uid()
            )
          );
      `),
    ).toEqual(['rls-superseded']);
  });

  it('meldt `constraint` zodra completion_approvals_not_self weg is', () => {
    expect(
      bewakingNa(
        'alter table public.completion_approvals drop constraint completion_approvals_not_self;',
      ),
    ).toEqual(['constraint']);
  });

  it('meldt `eigenaar-fk` zodra de subject-eigenaar-fk weg is', () => {
    expect(
      bewakingNa(
        'alter table public.completion_approvals ' +
          'drop constraint completion_approvals_subject_is_eigenaar;',
      ),
    ).toEqual(['eigenaar-fk']);
  });

  it('meldt `trigger` zodra de trigger weg is', () => {
    expect(
      bewakingNa(
        'drop trigger completion_approvals_subject on public.completion_approvals;',
      ),
    ).toEqual(['trigger']);
  });

  it('meldt `trigger` ook als hij alleen in replica-modus vuurt', () => {
    // ⚠️⚠️ Dit is het geval uit de reviewrij. `tgenabled` kent vier waarden, en
    //    een trigger op `R` vuurt **niet** in een gewone sessie. De verzwakte
    //    vorm `tgenabled <> 'D'` liet die door; 0275 zette `= 'O'` terug. M9a in
    //    `domeinregel3.test.ts` muteerde naar `'D'` — precies de éne waarde die
    //    beide vormen vangen — en kon dit dus niet zien.
    expect(
      bewakingNa(
        'alter table public.completion_approvals ' +
          'enable replica trigger completion_approvals_subject;',
      ),
    ).toEqual(['trigger']);
  });

  it('meldt `clausule2-lidmaatschap` zodra de lidmaatschapstoets uit de trigger valt', () => {
    expect(
      bewakingNa(fillApprovalSubjectMet('from group_members', 'from public.group_members')),
    ).toEqual(['clausule2-lidmaatschap']);
  });

  it('meldt `clausule2-koppeling` zodra de koppelingstoets uit de trigger valt', () => {
    expect(
      bewakingNa(
        fillApprovalSubjectMet('join goal_group_links', 'join public.goal_group_links'),
      ),
    ).toEqual(['clausule2-koppeling']);
  });

  it('meldt `clausule4-actieve-voltooiing` zodra de vervangen-toets uit de trigger valt', () => {
    expect(
      bewakingNa(fillApprovalSubjectMet('superseded_by is not null', 'superseded_by notnull')),
    ).toEqual(['clausule4-actieve-voltooiing']);
  });
});
