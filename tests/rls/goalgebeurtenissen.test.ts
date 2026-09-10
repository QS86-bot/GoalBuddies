
import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De allowlist van `goal_events.event_type` is beoordeeld en geen open deur — QS8-176.
 *
 * ⚠️ **De belofte is niet "deze vier staan er" maar "er staat niets bij zonder
 *    dat iemand het gewogen heeft".** `goal_events_select` volgt het **doel** en
 *    niet de **groep** — de enige uitzondering in deze feature — dus sinds een
 *    doel in meer dan één groep kan staan (QS8-56) leest elk gekoppeld lid alles
 *    wat in die allowlist staat. Dat is gemeten en aanvaard voor de vier die er
 *    zijn; het is niet aanvaard voor een vijfde die niemand bekeken heeft.
 *
 * ⚠️ **Wat `policies.test.ts` wél dekt, en waar deze suite over gaat.** Die pint
 *    op regel 3381 hardgecodeerd op precies vier waarden vóórdat hij met
 *    `DOELGEBEURTENISSEN` vergelijkt, dus een vijfde snake_case type wordt daar
 *    ook rood. Mijn eerste versie van deze kop beweerde het tegendeel; de
 *    security-review heeft dat gemeten en weerlegd.
 *
 *    Wat overblijft is smaller: een type dat de tekstontleding van
 *    `check_waarden()` niet ziet (een cijfer of hoofdletter in de naam), en een
 *    CHECK die niet meer de verwachte vorm heeft. Daar zwijgen de bestaande
 *    grendels, en daar meldt deze functie.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'goal_events_bewaking'",
  import.meta.url,
);

/** Zelfde helper en zelfde reden als in `zoekpadschaduw.test.ts`. */
function inEenSessie(sql: string): string {
  return psqlMetInvoer(sql).trim();
}

/** De vier zoals ze vandaag in de CHECK staan. */
const VIER = "'created','deadline_moved','archived','completed'";

const VORMEN = [
  {
    naam: 'de vier van vandaag',
    lijst: VIER,
    gemeld: false,
    waarom: 'stuk voor stuk gewogen op 27-08; dit is de stand die de bewaking met rust laat',
  },
  {
    naam: 'dezelfde vier in een andere volgorde',
    lijst: "'completed','archived','deadline_moved','created'",
    gemeld: false,
    waarom:
      'een volgordewijziging is geen verruiming. Een bewaking die de hele CHECK-tekst ' +
      'vergelijkt zou hier omvallen, en dat is precies het valse alarm dat QS8-177 optekende',
  },
  {
    naam: 'een vijfde type erbij',
    lijst: `${VIER},'scope_reduced'`,
    gemeld: true,
    waarom:
      'de voorwaarde uit de dossierrij. `scope_reduced` is met opzet het ijkgeval: die stond ' +
      'hier tot 25-08 in en is er met 0087 uit gehaald omdat hij tegenslag draagt',
  },
  {
    naam: 'een vijfde type dat onschuldig klinkt',
    lijst: `${VIER},'milestone_dropped'`,
    gemeld: true,
    waarom:
      'de bewaking oordeelt niet over de inhoud maar dwingt af dát er geoordeeld wordt — ' +
      'ook deze stond op VERBODEN_GEBEURTENISSEN in chat-schemas.ts',
  },
  {
    naam: 'een vijfde type met een cijfer in de naam',
    lijst: `${VIER},'goal_paused_v2'`,
    gemeld: true,
    waarom:
      'de blinde vlek die de security-review vond. De eerste versie matchte op [a-z_]+ en gaf ' +
      'hier NUL rijen — hij zweeg precies waar hij belooft te melden',
  },
  {
    naam: 'een vijfde type met een hoofdletter',
    lijst: `${VIER},'scopeReduced'`,
    gemeld: true,
    waarom: 'zelfde blinde vlek, andere vorm; ook drie keer gemeten op nul',
  },
  {
    naam: 'een van de vier weggehaald',
    lijst: "'created','deadline_moved','archived'",
    gemeld: true,
    waarom:
      'de andere kant van de ratel: een register dat een gebeurtenis noemt die niet meer ' +
      'bestaat, dekt straks stilzwijgend iets anders af',
  },
] as const;

describe.skipIf(!beschikbaar)('QS8-176 — de allowlist van goal_events staat onder bewaking', () => {
  it(
    'meldt vandaag niets',
    () => {
      // ⚠️ De nulmeting hoort erbij: zonder haar zegt elke rij hieronder alleen
      //    iets over een verzonnen toestand en niets over de echte.
      expect(inEenSessie('select count(*) from goal_events_bewaking();')).toBe('0');
    },
    TEST_TIMEOUT,
  );

  it.each(VORMEN)(
    'goal_events_bewaking() over $naam: gemeld = $gemeld',
    ({ lijst, gemeld, waarom }) => {
      // In een teruggedraaide transactie, dus er blijft niets van staan.
      const uit = inEenSessie(`
        begin;
        alter table goal_events drop constraint goal_events_type_valid;
        alter table goal_events add constraint goal_events_type_valid
          check (event_type = any (array[${lijst}]));

        select 'gemeld=' || case when exists (select 1 from goal_events_bewaking())
          then 'ja' else 'nee' end;
        rollback;
      `);

      const gezien = uit
        .split('\n')
        .map((r) => r.trim())
        .find((r) => r.startsWith('gemeld='))
        ?.slice('gemeld='.length);

      expect(gezien, waarom).toBe(gemeld ? 'ja' : 'nee');
    },
    TEST_TIMEOUT,
  );

  it(
    'meldt het als de CHECK er anders uitziet dan hij verwacht',
    () => {
      // ⚠️ **De belangrijkste tak, en hij ontbrak in de eerste versie.**
      //    Onparseerbaar leverde toen nul rijen op, en nul rijen betekent in deze
      //    functie "alles in orde". Een bewaking die niet zegt dat hij het niet
      //    begreep, is gevaarlijker dan geen bewaking.
      for (const mutatie of [
        'alter table goal_events drop constraint goal_events_type_valid;',
        'alter table goal_events drop constraint goal_events_type_valid;' +
          ' alter table goal_events add constraint goal_events_type_valid check (event_type is not null);',
      ]) {
        const uit = inEenSessie(`
          begin;
          ${mutatie}
          select 'aantal=' || count(*) from goal_events_bewaking();
          rollback;
        `);
        expect(uit, mutatie).toContain('aantal=1');
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een tweede CHECK op dezelfde tabel met rust',
    () => {
      // ⚠️ De eerste versie filterde op "elke CHECK die event_type noemt" en pakte
      //    dan ook de literals uit een ándere uitdrukking op — gemeten: drie valse
      //    meldingen. Een controle die meldt wat er niet is, leer je negeren.
      const uit = inEenSessie(`
        begin;
        alter table goal_events add constraint goal_events_extra
          check (event_type <> 'archived' or coalesce(new_value->>'reason','geen') <> 'opgegeven');
        select 'aantal=' || count(*) from goal_events_bewaking();
        rollback;
      `);

      expect(uit).toContain('aantal=0');
    },
    TEST_TIMEOUT,
  );

  it(
    'is niet uitvoerbaar door authenticated of anon',
    () => {
      // De les van QS8-289, dezelfde dag: een bewakingsfunctie die vertelt hoe de
      // sloten staan, is niets voor een client.
      const uit = inEenSessie(
        // ⚠️ Met een cast: `boolean || text` bestaat niet in Postgres, en zonder
        //    hem werpt psql. Dat maakte deze test rood om de verkeerde reden.
        "select has_function_privilege('authenticated', 'public.goal_events_bewaking()', 'execute')::text" +
          " || ' ' ||" +
          " has_function_privilege('anon', 'public.goal_events_bewaking()', 'execute')::text;",
      );

      // ⚠️ `false` en niet `f`: dat is de cast naar text, niet de weergave van psql.
      expect(uit.trim()).toBe('false false');
    },
    TEST_TIMEOUT,
  );
});
