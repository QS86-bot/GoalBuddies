import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `edge-tijd.test.ts`.
import {
  checksIn,
  controleer,
  functiesZonderAanroeper,
  waardenZonderSchrijver,
  TREFFER_HOORT_ELDERS,
} from '../../scripts/dode-keten-controle.mjs';

/**
 * De ijking van `npm run keten:controle`.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Deze is er
 *    twee keer bijna ingetrapt voordat hij één keer gedraaid had: de eerste
 *    versie meldde acht functies als "zonder aanroeper" die allemaal netjes via
 *    `execute function public.…()` aan een trigger hangen, en de tweede meldde
 *    een constraint die sinds migratie 0050 niet meer bestaat. Allebei vals
 *    alarm, en allebei het soort melding waardoor je een script uitzet.
 *
 * Daarom staat elke vorm hier los: wat hij moet vinden, én wat hij met rust moet
 * laten. Die tweede helft is de belangrijkste.
 */

const mig = (naam: string, sql: string) => ({ naam, sql });

describe('functies zonder aanroeper — wat de controle moet vinden', () => {
  it('een functie die door niets wordt aangeroepen', () => {
    const sql = 'create or replace function public.spookfunctie() returns void as $$ begin end $$;';

    expect(functiesZonderAanroeper({ sql, prodBron: '' })).toEqual(['spookfunctie']);
  });

  it('een functie die alleen vanuit een test wordt aangeroepen', () => {
    // ⚠️ **De les van EPIC 9, en de reden dat tests hier niet meetellen.** Daar
    //    stonden tests omheen die het losse gedrag bewezen terwijl geen enkele
    //    knop erheen liep. Zou een test als aanroeper tellen, dan was juist dat
    //    geval groen geweest en had deze controle niets toegevoegd.
    const sql = 'create or replace function public.meld_commitment() returns trigger as $$ begin end $$;';
    const testBron = "await adminDb().rpc('meld_commitment');";

    expect(functiesZonderAanroeper({ sql, prodBron: '' })).toEqual(['meld_commitment']);
    // en ter contrast: dezelfde aanroep vanuit productiecode telt wél
    expect(functiesZonderAanroeper({ sql, prodBron: testBron })).toEqual([]);
  });
});

describe('functies zonder aanroeper — wat hij met rust moet laten', () => {
  it('een triggerfunctie die met `public.` wordt aangehangen', () => {
    // ⚠️ Dit is de vorm die de eerste versie acht keer verkeerd meldde.
    const sql = [
      'create or replace function public.noteer_commitment() returns trigger as $$ begin end $$;',
      'create trigger noteer after insert on public.commitments',
      '  for each row execute function public.noteer_commitment();',
    ].join('\n');

    expect(functiesZonderAanroeper({ sql, prodBron: '' })).toEqual([]);
  });

  it('een functie die vanuit een policy wordt aangeroepen', () => {
    const sql = [
      'create or replace function public.is_group_member(g uuid) returns boolean as $$ begin end $$;',
      'create policy groups_select on public.groups for select using (is_group_member(id));',
    ].join('\n');

    expect(functiesZonderAanroeper({ sql, prodBron: '' })).toEqual([]);
  });

  it('een functie die via .rpc() uit de app komt', () => {
    const sql = 'create or replace function public.create_group(p_naam text) returns uuid as $$ begin end $$;';
    const prodBron = "const { data } = await supabase().rpc('create_group', {\n  p_naam: naam,\n});";

    expect(functiesZonderAanroeper({ sql, prodBron })).toEqual([]);
  });

  it('een functie die eerst gedropt en daarna opnieuw gemaakt wordt', () => {
    // ⚠️ De normale vorm van een idempotente migratie in dit project — 71 van de
    //    99 functies staan zo in het bestand. Een `drop` is hier geen einde.
    const sql = [
      'drop function if exists public.zet_doelstatus(uuid, text);',
      'create or replace function public.zet_doelstatus(p uuid, s text) returns void as $$ begin end $$;',
      "select zet_doelstatus('x', 'y');",
    ].join('\n');

    expect(functiesZonderAanroeper({ sql, prodBron: '' })).toEqual([]);
  });

  it('een functie waarvan de naam in een andere functienaam zit', () => {
    // `weekdoelen_vandaag` mag niet als aanroep van `weekdoelen` gelden.
    const sql = [
      'create or replace function public.weekdoelen() returns int as $$ begin end $$;',
      'create or replace function public.weekdoelen_vandaag() returns int as $$ begin end $$;',
      'select weekdoelen_vandaag();',
    ].join('\n');

    expect(functiesZonderAanroeper({ sql, prodBron: '' })).toEqual(['weekdoelen']);
  });
});

describe('CHECK-waarden zonder schrijver — wat de controle moet vinden', () => {
  it('een waarde die geen enkel pad ooit zet', () => {
    const bestanden = [
      mig(
        '0001_schema.sql',
        [
          'create table public.goals (',
          '  status text not null,',
          "  constraint goals_status_valid check (status in ('active', 'archived', 'missed'))",
          ');',
          "update public.goals set status = 'active';",
          "update public.goals set status = 'archived';",
        ].join('\n'),
      ),
    ];

    expect(waardenZonderSchrijver({ bestanden, prodBron: '' })).toEqual([
      {
        constraint: 'goals_status_valid',
        kolom: 'status',
        waarde: 'missed',
        bestand: '0001_schema.sql',
        tabel: 'goals',
      },
    ]);
  });

  it('de tabelnaam komt uit de `create table` erboven, niet uit de constraintnaam', () => {
    // ⚠️ `groups_approval_rule_valid` levert met elke denkbare afkapregel
    //    `groups_approval` op. Dan zoekt de uitzonderingenlijst naar een sleutel
    //    die niemand ooit intikt, en staat de controle permanent rood.
    const bestanden = [
      mig(
        '0001_schema.sql',
        [
          'create table public.groups (',
          "  constraint groups_approval_rule_valid check (approval_rule in ('any', 'majority'))",
          ');',
          "insert into public.groups (approval_rule) values ('any');",
        ].join('\n'),
      ),
    ];

    const [eerste] = waardenZonderSchrijver({ bestanden, prodBron: '' });
    expect(eerste?.tabel).toBe('groups');
  });
});

describe('CHECK-waarden zonder schrijver — wat hij met rust moet laten', () => {
  const tabel = (extra = '') =>
    [
      'create table public.chat_messages (',
      "  constraint chat_messages_type_valid check (type in ('text', 'system'))",
      ');',
      extra,
    ].join('\n');

  it('een waarde die een migratie schrijft', () => {
    const bestanden = [
      mig('0001_schema.sql', tabel("insert into public.chat_messages (type) values ('text');")),
      mig('0002_systeem.sql', "insert into public.chat_messages (type) values ('system');"),
    ];

    expect(waardenZonderSchrijver({ bestanden, prodBron: '' })).toEqual([]);
  });

  it('een waarde die alleen de app schrijft', () => {
    const bestanden = [mig('0001_schema.sql', tabel("insert into chat_messages values ('system');"))];
    const prodBron = "await supabase().from('chat_messages').insert({ type: 'text' });";

    expect(waardenZonderSchrijver({ bestanden, prodBron })).toEqual([]);
  });

  it('een constraint die bij naam gedropt is', () => {
    const bestanden = [
      mig('0001_schema.sql', tabel()),
      mig('0002_weg.sql', 'alter table public.chat_messages drop constraint chat_messages_type_valid;'),
    ];

    expect(waardenZonderSchrijver({ bestanden, prodBron: '' })).toEqual([]);
  });

  it('een constraint waarvan de kólom gedropt is', () => {
    // ⚠️ Precies wat 0050 deed: de risicokolommen verhuisden naar `goal_risk`
    //    met `drop column`, en `goals_risk_status_valid` verdween mee zonder ooit
    //    bij naam genoemd te zijn. De tweede versie van deze controle meldde die
    //    constraint als dood terwijl hij al maanden weg was.
    const bestanden = [
      mig(
        '0001_schema.sql',
        [
          'create table public.goals (',
          "  constraint goals_risk_status_valid check (risk_status in ('on_track', 'watch'))",
          ');',
        ].join('\n'),
      ),
      mig('0050_risico.sql', 'alter table public.goals drop column if exists risk_status;'),
    ];

    expect(waardenZonderSchrijver({ bestanden, prodBron: '' })).toEqual([]);
    expect(checksIn(bestanden).has('goals_risk_status_valid')).toBe(false);
  });

  it('een CHECK die geen waardenlijst is', () => {
    // Een bereikcontrole heeft geen waarden om te missen; die hoort geen melding
    // op te leveren.
    const bestanden = [
      mig(
        '0001_schema.sql',
        'create table public.points_ledger (\n  constraint punten_bereik check (delta between -1 and 2)\n);',
      ),
    ];

    expect(waardenZonderSchrijver({ bestanden, prodBron: '' })).toEqual([]);
  });

  it('een waarde die met reden op de uitzonderingenlijst staat', () => {
    const bestanden = [
      mig(
        '0001_schema.sql',
        [
          'create table public.groups (',
          "  constraint groups_approval_rule_valid check (approval_rule in ('any', 'majority'))",
          ');',
          "insert into public.groups (approval_rule) values ('any');",
        ].join('\n'),
      ),
    ];
    const bewust = { 'groups.approval_rule=majority': 'Wacht op de goedkeuringsregels.' };

    expect(controleer({ bestanden, prodBron: '', bewust }).waarden).toEqual([]);
    // en zonder die reden is hij wél rood
    expect(controleer({ bestanden, prodBron: '', bewust: {} }).waarden).toHaveLength(1);
  });
});

describe('een treffer die bij een andere tabel hoort', () => {
  /**
   * ⚠️ **De schrijverstoets is tabelblind, en dat is op 27-08-2026 een gemeten
   *    valse negatief geworden.** Hij zoekt `'waarde'` in álle bronbestanden en
   *    weet niet bij welke tabel die treffer hoort. `points_ledger.reason =
   *    'milestone_done'` wordt nergens geboekt, maar `chat_messages.system_event`
   *    kent dezelfde naam en die staat in `chat-schemas.ts` — dus de controle
   *    zweeg over een dode waarde.
   *
   * ⚠️ Veertien CHECK-waarden komen in meer dan één tabel voor, dus dit is een
   *    klasse en geen incident. `TREFFER_HOORT_ELDERS` is de gerichte versie:
   *    hij zet de tekstzoektocht uit voor de gevallen waarvan gemeten is dat de
   *    treffer elders vandaan komt.
   */
  const gedeeld = [
    mig(
      '0001_schema.sql',
      [
        'create table public.points_ledger (',
        '  reason text not null,',
        "  constraint points_ledger_reason_valid check (reason in ('correction', 'milestone_done'))",
        ');',
      ].join('\n'),
    ),
  ];

  // ⚠️ `correction` wordt écht geboekt (door `trek_goedkeuring_in`), en
  //    `milestone_done` alleen genoemd als chat-systeembericht. Twee waarden
  //    omdat de parser een CHECK met er maar één overslaat — dat is een
  //    kolomtoets en geen opsomming.
  const prodBron =
    "await db.from('points_ledger').insert({ reason: 'correction' });\n" +
    "export const SYSTEEM = ['milestone_done'] as const;";

  it('zwijgt zonder register — dit is de valse negatief zelf', () => {
    expect(waardenZonderSchrijver({ bestanden: gedeeld, prodBron, elders: {} })).toEqual([]);
  });

  it('meldt hem zodra het register zegt dat de treffer elders hoort', () => {
    const uit = waardenZonderSchrijver({
      bestanden: gedeeld,
      prodBron,
      elders: {
        'points_ledger.reason=milestone_done': 'komt uit chat_messages',
      },
    });

    expect(uit).toHaveLength(1);
    expect(uit[0]?.waarde).toBe('milestone_done');
    expect(uit[0]?.tabel).toBe('points_ledger');
  });

  it('raakt een waarde die niet in het register staat niet aan', () => {
    // ⚠️ Het register zet de zoektocht alleen uit voor wat er met naam in staat.
    //    Zou het breder werken, dan meldt de controle waarden die wél geschreven
    //    worden — en dan leer je hem te negeren.
    const anders = [
      mig(
        '0001_schema.sql',
        [
          'create table public.iets (',
          '  k text not null,',
          "  constraint iets_k_valid check (k in ('leeft', 'ook_levend'))",
          ');',
        ].join('\n'),
      ),
    ];

    expect(
      waardenZonderSchrijver({
        bestanden: anders,
        prodBron: "const x = 'leeft'; const y = 'ook_levend';",
        elders: {
          'points_ledger.reason=milestone_done': 'komt uit chat_messages',
        },
      }),
    ).toEqual([]);
  });

  it('noemt bij elke registerregel waar de treffer dan wél vandaan komt', () => {
    // Een register zonder redenen is een lijst uitzonderingen; de volgende lezer
    // moet kunnen zien waaróm die treffer geen bewijs is.
    for (const [sleutel, reden] of Object.entries(
      TREFFER_HOORT_ELDERS as Record<string, string>,
    )) {
      expect(reden.length, `${sleutel} heeft geen reden`).toBeGreaterThan(60);
    }
  });
});
