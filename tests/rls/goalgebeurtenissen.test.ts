
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

// ---------------------------------------------------------------------------

/**
 * De belofte: **`old_value` en `new_value` dragen alleen gewogen sleutels, en
 * niet meer dan een handvol tekens** — QS8-464, migratie 0260.
 *
 * ⚠️⚠️ **De allowlist hierboven bewaakt de naam van een gebeurtenis, niet de
 *    inhoud.** Dat is de scherpste variant van oppervlak 24: zet een toekomstige
 *    feature een toelichting of reden in `new_value` van een `deadline_moved`,
 *    dan leest elke gekoppelde groep wat voor één groep bedoeld was — terwijl de
 *    allowlist onveranderd op vier staat en niets rood wordt. Deze tabel is langs
 *    precies die weg al een keer gelekt (0085).
 *
 * ⚠️ **En er stond helemaal geen grens.** 📏 Gemeten als gewone `authenticated`
 *    met eigen JWT, vóór 0260:
 *
 *      insert ... new_value = jsonb_build_object('rommel', repeat('x', 5000000))
 *      -> GELUKT: 56 kB in één rij
 *
 *    Vijf miljoen tekens. De legitieme payloads van vandaag zijn **213** tekens
 *    (`created` met een titel van 200, het maximum) en **112**
 *    (`deadline_moved` in zijn echte vorm) — ruwweg 25.000× speling. Deze tabel
 *    is append-only, dus het gaat er nooit meer uit, en de tier is gratis.
 *
 * ⚠️ Twee grenzen en niet één: een omvangsgrens houdt een vrije-tekstveld
 *    `reden` niet tegen, en een sleutelgrens laat een toegestane sleutel met een
 *    megabyte erin staan.
 */
describe.skipIf(!beschikbaar)('QS8-464 — de inhoud van goal_events heeft een grens', () => {
  /** Het oordeel van de sleuteltoets, los bevraagd. */
  function sleutelsKloppen(
    type: string,
    oud: string,
    nieuw: string,
  ): string {
    const uit = psqlMetInvoer(
      `select 'UIT=' || public.goal_event_sleutels_kloppen('${type}', ${oud}, ${nieuw})::text;`,
    );
    const regel = uit
      .split('\n')
      .map((r) => r.trim())
      .find((r) => r.startsWith('UIT='));
    if (regel === undefined) throw new Error(`geen uitslag: ${uit}`);
    return regel.slice('UIT='.length);
  }

  /**
   * ⚠️ **De must-allow staat vóór de must-block, en niet andersom.** 📏 De les van
   *    QS8-453: een CHECK die een functie aanroept waar `authenticated` geen
   *    EXECUTE op heeft, weigert **élke** schrijfactie — ook een volkomen
   *    normale. Zo'n dichte deur leest als een veilige deur.
   */
  it.each([
    { naam: 'created met een titel', type: 'created', oud: 'null', nieuw: `jsonb_build_object('title','mijn doel')` },
    {
      naam: 'deadline_moved in zijn echte vorm',
      type: 'deadline_moved',
      oud: `jsonb_build_object('target_date','2026-01-01')`,
      nieuw: `jsonb_build_object('target_date','2026-02-01','request_id','x','straffen_teruggezet',true)`,
    },
    { naam: 'completed zonder inhoud', type: 'completed', oud: 'null', nieuw: 'null' },
    { naam: 'archived zonder inhoud', type: 'archived', oud: 'null', nieuw: 'null' },
  ])('laat $naam door', ({ type, oud, nieuw }) => {
    expect(
      sleutelsKloppen(type, oud, nieuw),
      'een legitieme gebeurtenis wordt geweigerd — dan is dit een dichte deur en ' +
        'geen grens, en valt élke schrijver om',
    ).toBe('true');
  }, TEST_TIMEOUT);

  /**
   * ⚠️⚠️ **`reden` is het geval waar de reviewrij over gaat.** Een toelichting bij
   *    een verschoven streefdatum is precies het soort vrije tekst dat voor één
   *    groep bedoeld is en door alle gekoppelde groepen gelezen wordt.
   */
  it.each([
    {
      naam: 'een vrije-tekstveld reden bij deadline_moved',
      type: 'deadline_moved',
      oud: `jsonb_build_object('target_date','2026-01-01')`,
      nieuw: `jsonb_build_object('target_date','2026-02-01','reden','ik had het te druk')`,
    },
    { naam: 'inhoud bij archived', type: 'archived', oud: 'null', nieuw: `jsonb_build_object('title','x')` },
    { naam: 'een titel bij completed', type: 'completed', oud: 'null', nieuw: `jsonb_build_object('title','x')` },
    // ⚠️ Geen object: `jsonb_object_keys()` wérpt daarop, en een CHECK die werpt
    //    is een schrijffout en geen weigering. Daarom faalt hij hier dicht.
    { naam: 'een array in plaats van een object', type: 'created', oud: 'null', nieuw: `'["a","b"]'::jsonb` },
    { naam: 'een scalar in plaats van een object', type: 'created', oud: 'null', nieuw: `'"kaal"'::jsonb` },
  ])('weigert $naam', ({ type, oud, nieuw }) => {
    expect(
      sleutelsKloppen(type, oud, nieuw),
      'een ongewogen sleutel komt erdoor — dan leest elke gekoppelde groep mee wat ' +
        'voor één groep bedoeld was, en de allowlist op de naam ziet dat niet',
    ).toBe('false');
  }, TEST_TIMEOUT);

  it('weigert een payload die de omvangsgrens overschrijdt', () => {
    // ⚠️ `psqlMetInvoer()` draait met `ON_ERROR_STOP=1`, dus een geweigerde insert
    //    laat psql met een exitcode afsluiten en `execFileSync` wérpt. De
    //    weigering zit dus in de fout en niet in de uitvoer — dat is precies wat
    //    we willen meten, maar het moet wel opgevangen worden.
    let uit = '';
    try {
      uit = psqlMetInvoer(
        [
          'begin;',
          "insert into auth.users (id, email) values ('ffff0000-0000-0000-0000-0000000004a1','g464@x.com');",
          "insert into goals (id, owner_id, title, target_date) values",
          "  ('ffff0000-0000-0000-0000-0000000004a2','ffff0000-0000-0000-0000-0000000004a1','d', current_date + 30);",
          'savepoint s;',
          "insert into goal_events (goal_id, actor_id, event_type, new_value) values",
          "  ('ffff0000-0000-0000-0000-0000000004a2','ffff0000-0000-0000-0000-0000000004a1','created',",
          "   jsonb_build_object('title', repeat('x', 5000000)));",
          "select 'GELUKT';",
          'rollback;',
        ].join('\n'),
        { verbose: true },
      );
    } catch (fout) {
      uit = fout instanceof Error ? `${fout.message}` : String(fout);
    }

    expect(
      uit,
      'een payload van vijf miljoen tekens komt er nog steeds in — deze tabel is ' +
        'append-only en de tier is gratis',
    ).toContain('goal_events_waarde_omvang');
    expect(uit, 'de insert slaagde').not.toContain('GELUKT');
  }, TEST_TIMEOUT);
});
