import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De ingang naar /meldingen weet of je mag beoordelen — QS8-705, migratie 0299.
 *
 * ⚠️ **De belofte is niet "`moderatiepoort()` is uitvoerbaar".** Ze is:
 *    *de ingang staat er voor wie mag beoordelen, ook als er niets wacht, en voor
 *    niemand anders.* Dat is een eigenschap van het geheel: de uitvoerrechten, de
 *    poort zelf, en de twee routes waar `openstaande_meldingen()` op leunt. Een
 *    toets op alleen het uitvoerrecht blijft groen als de poort iedereen
 *    doorlaat; een toets op alleen de poort blijft groen als de client hem niet
 *    mag aanroepen — en dan is de ingang er nooit, zonder dat iets rood wordt.
 *
 * ⚠️ Via `psql` met `set local role`, in één teruggerolde transactie, zoals
 *    `melding-komt-aan.test.ts`. PostgREST toetst hier niets extra's.
 *
 * IJKING — met de hand, 18-11-2026, tegen een lokaal schema op `0299`. Eén
 * mutatie per grendel, vooraf en achteraf 7 groen:
 *
 *   A  `revoke execute … from authenticated` (de toestand van 0297)
 *      -> 7 rood, waaronder 'de client mag de poort aanroepen' (de proef zelf
 *         faalt dan, en elke toets leest dan niets)
 *   B  `grant execute … to anon`
 *      -> rood: 'anon mag de poort niet aanroepen'
 *   C  `moderatiepoort()` terug naar `select true`
 *      -> rood: 'een gewoon lid mag niet beoordelen' en 'iemand zonder groep …'
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'moderatiepoort'",
  import.meta.url,
);

function proef(regels: string[]): string {
  return psqlMetInvoer(
    [
      'begin;',
      "select set_config('p.beheerder', public.shim_maak_gebruiker('b705@proef.nl','Beheerder')::text, true);",
      "select set_config('p.lid',       public.shim_maak_gebruiker('l705@proef.nl','Lid')::text, true);",
      "select set_config('p.leeg',      public.shim_maak_gebruiker('z705@proef.nl','Zonder')::text, true);",
      "select set_config('p.platform',  public.shim_maak_gebruiker('x705@proef.nl','Platform')::text, true);",
      "select set_config('p.oud',       public.shim_maak_gebruiker('o705@proef.nl','Oud')::text, true);",
      "update public.profiles set platform_beheerder = true where id = current_setting('p.platform')::uuid;",
      "select set_config('request.jwt.claim.sub', current_setting('p.beheerder'), true);",
      'set local role authenticated;',
      "select set_config('p.groep', (public.create_group('Proefgroep705'::text))->'group'->>'id', true);",
      'reset role;',
      'insert into public.group_members(group_id, user_id, role, status) values',
      "  (current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, 'member', 'active'),",
      "  (current_setting('p.groep')::uuid, current_setting('p.oud')::uuid, 'admin',  'inactive');",
      ...regels,
      'rollback;',
    ].join('\n'),
  );
}

function lees(uit: string, sleutel: string): string | undefined {
  return uit
    .split('\n')
    .map((r) => r.trim())
    .find((r) => r.startsWith(`${sleutel}=`))
    ?.slice(sleutel.length + 1);
}

function als(wie: string): string[] {
  return [
    `select set_config('request.jwt.claim.sub', current_setting('p.${wie}'), true);`,
    'set local role authenticated;',
  ];
}

describe.skipIf(!beschikbaar)('de ingang naar meldingen weet of je mag beoordelen', () => {
  // ⚠️ Een geweigerd uitvoerrecht laat psql falen, en dat hoort een rode toets te
  //    geven en geen suite die bij het verzamelen omvalt: dan is "de client mag
  //    de poort aanroepen" niet meer de toets die rood wordt.
  let uit = '';
  try {
    uit = proef([
      ...als('beheerder'),
      "select 'BEHEERDER=' || public.moderatiepoort();",
      'reset role;',
      ...als('platform'),
      "select 'PLATFORM=' || public.moderatiepoort();",
      'reset role;',
      ...als('lid'),
      "select 'LID=' || public.moderatiepoort();",
      'reset role;',
      ...als('leeg'),
      "select 'ZONDER_GROEP=' || public.moderatiepoort();",
      'reset role;',
      ...als('oud'),
      "select 'OUD_BEHEERDER=' || public.moderatiepoort();",
      'reset role;',
      'set local role anon;',
      'do $$ begin perform public.moderatiepoort();',
      "  perform set_config('p.anon', 'kon', true);",
      'exception when insufficient_privilege then',
      "  perform set_config('p.anon', 'geweigerd', true);",
      'end $$;',
      "select 'ANON=' || current_setting('p.anon');",
      'reset role;',
      "select 'CLIENT_MAG=' || has_function_privilege('authenticated', 'public.moderatiepoort()', 'execute');",
    ]);
  } catch (fout) {
    uit = `FOUT=${String(fout).slice(0, 200)}`;
  }

  it('de client mag de poort aanroepen', () => {
    expect(lees(uit, 'CLIENT_MAG')).toBe('true');
  }, 60_000);

  it('een groepsbeheerder mag beoordelen, ook zonder openstaande melding', () => {
    expect(lees(uit, 'BEHEERDER')).toBe('true');
  });

  it('de platformbeheerder mag beoordelen', () => {
    expect(lees(uit, 'PLATFORM')).toBe('true');
  });

  // ⚠️ De drie must-nots. Zonder deze helft is "de beheerder ziet de ingang"
  //    ook waar als iedereen hem ziet.
  it('een gewoon lid mag niet beoordelen', () => {
    expect(lees(uit, 'LID')).toBe('false');
  });

  it('iemand zonder groep mag niet beoordelen', () => {
    expect(lees(uit, 'ZONDER_GROEP')).toBe('false');
  });

  it('een uit de groep gezette beheerder mag niet meer beoordelen', () => {
    expect(lees(uit, 'OUD_BEHEERDER')).toBe('false');
  });

  it('anon mag de poort niet aanroepen', () => {
    expect(lees(uit, 'ANON')).toBe('geweigerd');
  });
});
