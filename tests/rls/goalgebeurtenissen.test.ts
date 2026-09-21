
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
 *    (`created` met een titel van 200, het maximum) en **109**
 *    (`deadline_moved` in zijn echte vorm) — ruwweg 25.000× speling. Deze tabel
 *    is append-only, dus het gaat er nooit meer uit, en de tier is gratis.
 *
 * ⚠️ Twee grenzen en niet één: een omvangsgrens houdt een vrije-tekstveld
 *    `reden` niet tegen, en een sleutelgrens laat een toegestane sleutel met een
 *    megabyte erin staan.
 *
 * ⚠️⚠️ **En twee waren er nog altijd te weinig, want een `string` heeft geen
 *    lengte.** 📏 Met sleutel én soort op hun plek ging dit er nog gewoon in, als
 *    gewone `authenticated`, en een lid van een **beschermde** groep las het
 *    terug:
 *
 *      new_value = {"title": "<3976 tekens vrije tekst>"}
 *
 *    De bronkolom `goals_title_len` staat op 200. **Geen enkele toets zag dat**,
 *    en dat is de leerzame kant: de must-allow zat op 1213 tekens json en de
 *    must-block op vijf miljoen, dus de band ertussen was leeg. Regel 18 vraag 3
 *    letterlijk — groen terwijl de belofte breekt. Sinds die bevinding draagt het
 *    register een `maxlengte`, en staan de toetsen hieronder aan wéérszijden van
 *    de 200 in plaats van alleen aan de uiteinden.
 */
describe.skipIf(!beschikbaar)('QS8-464 — de inhoud van goal_events heeft een grens', () => {
  /**
   * Eén schrijfactie langs de échte route: als `authenticated`, met claims, op
   * een eigen doel. Geeft de uitvoer terug, of de fouttekst als psql omvalt.
   *
   * ⚠️ **Dit is de naad en niet het onderdeel.** De belofte is niet "de CHECK
   *    weigert die waarde" maar "een gewone gebruiker komt hier niet doorheen en
   *    een gewone gebruiker komt er wél door". Dat zijn twee kanten van dezelfde
   *    grendel, en alleen deze route raakt ze allebei: de policy, de grant op de
   *    functie in de CHECK, en de CHECK zelf staan er samen in.
   *
   * ⚠️ `psqlMetInvoer()` draait met `ON_ERROR_STOP=1`, dus een geweigerde insert
   *    laat psql met een exitcode afsluiten en `execFileSync` wérpt. De weigering
   *    zit in de fout en niet in de uitvoer — dat is precies wat we willen meten,
   *    maar het moet wel opgevangen worden.
   *
   * ⚠️ **Geen vaste uuid's.** `gedeelde-identiteit:controle` wordt daar rood van,
   *    en terecht: twee gelijktijdige runs botsen erop. Alles komt uit
   *    `gen_random_uuid()` en blijft binnen de transactie die terugrolt.
   */
  function schrijfAlsEigenaar(waardeSql: string): string {
    try {
      return psqlMetInvoer(
        [
          'begin;',
          'create temp table v (uid uuid, goal uuid);',
          'grant select, insert, update on v to authenticated;',
          'insert into auth.users (id, email)',
          "  values (gen_random_uuid(), gen_random_uuid()::text || '@proef464.test');",
          'insert into v (uid)',
          "  select id from auth.users where email like '%@proef464.test'",
          '   order by created_at desc nulls last limit 1;',
          'insert into goals (owner_id, title, target_date)',
          "  select uid, 'Grensdoel', current_date + 30 from v;",
          'update v set goal =',
          '  (select id from goals where owner_id = (select uid from v) limit 1);',
          "select set_config('request.jwt.claims',",
          "  json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);",
          'set local role authenticated;',
          'insert into goal_events (goal_id, actor_id, event_type, new_value)',
          `  select goal, uid, 'created', ${waardeSql} from v;`,
          "select 'GELUKT';",
          'rollback;',
        ].join('\n'),
        { verbose: true },
      );
    } catch (fout) {
      return fout instanceof Error ? fout.message : String(fout);
    }
  }

  /**
   * Het oordeel van de sleuteltoets, los bevraagd — voor de gebeurtenissen die
   * geen enkele client zelf mag schrijven. `goal_events_insert` laat alleen
   * `created`, `archived` en `completed` toe, dus `deadline_moved` is langs de
   * schrijfroute niet te bereiken.
   *
   * ⚠️⚠️ **Onder `set local role authenticated`, en dat is geen franje.** 📏 De
   *    eerste versie hiervan draaide als `postgres`, want `PSQL_OMGEVING` valt
   *    terug op die gebruiker — en de eigenaar van een functie heeft EXECUTE
   *    ongeacht elke grant. De must-allow toetste de grant dus niet die hij zegt
   *    te toetsen. Gemeten, met de grant in een teruggerolde transactie weg:
   *    als `postgres` `true` (de test bleef groen), als `authenticated`
   *    `permission denied`.
   */
  function sleutelsKloppen(type: string, oud: string, nieuw: string): string {
    let uit: string;
    try {
      uit = psqlMetInvoer(
        [
          'begin;',
          'set local role authenticated;',
          `select 'UIT=' || public.goal_event_sleutels_kloppen('${type}', ${oud}, ${nieuw})::text;`,
          'rollback;',
        ].join('\n'),
      );
    } catch (fout) {
      return fout instanceof Error ? fout.message : String(fout);
    }
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
      // ⚠️ **Een getal en geen `true`.** `beslis_deadline_verzoek()` vult dit veld
      //    met `get diagnostics teruggezet = row_count`: het is het áántal
      //    vooruitgeschoven straffen. Hier stond `true`, overgeschreven uit het
      //    register in plaats van uit de schrijver — zie de kop van 0260.
      nieuw: `jsonb_build_object('target_date','2026-02-01','request_id','x','straffen_teruggezet',2)`,
    },
    { naam: 'completed zonder inhoud', type: 'completed', oud: 'null', nieuw: 'null' },
    { naam: 'archived zonder inhoud', type: 'archived', oud: 'null', nieuw: 'null' },
    // ⚠️ **Precies 200, in de drie vormen die het duurst ontsnappen.** `->>` geeft
    //    de gedecodeerde tekst, dus `char_length` telt codepunten — dezelfde
    //    eenheid als `goals_title_len`. 📏 Gemeten: alle drie landen op exact 200.
    //    Telde de grens in UTF-16-eenheden, dan viel de emoji-rij hier om.
    {
      naam: 'een titel van precies 200 gewone tekens',
      type: 'created',
      oud: 'null',
      nieuw: `jsonb_build_object('title', repeat('x', 200))`,
    },
    {
      naam: 'een titel van precies 200 emoji',
      type: 'created',
      oud: 'null',
      nieuw: `jsonb_build_object('title', repeat('😀', 200))`,
    },
    {
      naam: 'een titel van precies 200 stuurtekens',
      type: 'created',
      oud: 'null',
      nieuw: `jsonb_build_object('title', repeat(chr(1), 200))`,
    },
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
   *
   * ⚠️⚠️ **En de soort van de waarde hoort er even hard bij als de sleutel.** 📏
   *    De eerste versie woog alleen de sleutel, en toen kwam
   *    `{"title": {"reden": "…", "gemiste_week": true}}` er gewoon in —
   *    woordelijk het scenario van de reviewrij, één laagje diep weggestopt onder
   *    een sleutel die mág. `jsonb_object_keys()` geeft alleen de **buitenste**
   *    sleutels; een sleutelgrens zonder soortgrens is een grens om een deur die
   *    openstaat.
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
    { naam: 'een jsonb-null in plaats van een object', type: 'created', oud: 'null', nieuw: `'null'::jsonb` },
    // ⚠️ De vier hieronder zijn de soortgrens. Elke sleutel mág; alleen wat er
    //    onder hangt deugt niet.
    {
      naam: 'een object onder de toegestane sleutel title',
      type: 'created',
      oud: 'null',
      nieuw: `jsonb_build_object('title', jsonb_build_object('reden','ik had het te druk','gemiste_week',true))`,
    },
    {
      naam: 'een array onder de toegestane sleutel title',
      type: 'created',
      oud: 'null',
      nieuw: `jsonb_build_object('title', jsonb_build_array('a','b'))`,
    },
    { naam: 'een getal als titel', type: 'created', oud: 'null', nieuw: `jsonb_build_object('title', 5)` },
    // ⚠️⚠️ **De lengtegrens, en dit is het geval dat twee ronden lang doorkwam.**
    //    Soort `string` klopt, sleutel `title` mag, en de omvangsgrens van 4000
    //    haalt hij ruim — 3976 tekens vrije tekst, plat, in een kolom waarvan de
    //    bron op 200 staat. Zie de kop van 0260.
    {
      naam: 'een titel van 201 tekens, één boven de bronkolom',
      type: 'created',
      oud: 'null',
      nieuw: `jsonb_build_object('title', repeat('x', 201))`,
    },
    {
      naam: 'een titel van 3976 tekens onder de omvangsgrens',
      type: 'created',
      oud: 'null',
      nieuw: `jsonb_build_object('title', repeat('GEHEIM ', 568))`,
    },
    {
      naam: 'een target_date die geen datum meer is',
      type: 'deadline_moved',
      oud: 'null',
      nieuw: `jsonb_build_object('target_date', repeat('9', 33))`,
    },
    {
      naam: 'een tekst waar een getal hoort',
      type: 'deadline_moved',
      oud: 'null',
      nieuw: `jsonb_build_object('straffen_teruggezet','ja')`,
    },
    {
      naam: 'een boolean waar een getal hoort',
      type: 'deadline_moved',
      oud: 'null',
      nieuw: `jsonb_build_object('straffen_teruggezet',true)`,
    },
  ])('weigert $naam', ({ type, oud, nieuw }) => {
    expect(
      sleutelsKloppen(type, oud, nieuw),
      'een ongewogen sleutel of soort komt erdoor — dan leest elke gekoppelde groep ' +
        'mee wat voor één groep bedoeld was, en de allowlist op de naam ziet dat niet',
    ).toBe('false');
  }, TEST_TIMEOUT);

  /**
   * ⚠️ **De must-allow van de omvangsgrens, en die is het scherpst op het
   *    randgeval.** 📏 Een titel van 200 tekens is het maximum dat
   *    `goals_title_len` toestaat, maar de omvang van de **json-tekst** hangt aan
   *    het ontsnappen: 200 gewone tekens of 200 emoji geven 213, 200
   *    aanhalingstekens 413, en 200 stuurtekens **1213**, want een stuurteken
   *    kost zes tekens in de json-tekst. Dat laatste is het slechtste geval dat
   *    het schema vandaag toestaat, en het moet erdoor.
   */
  it('laat het slechtste legitieme geval door — 200 stuurtekens, 1213 tekens json', () => {
    const uit = schrijfAlsEigenaar(`jsonb_build_object('title', repeat(chr(1), 200))`);
    expect(
      uit,
      'de grens ligt onder wat het schema toestaat — dan weigert dit een titel die ' +
        '`goals_title_len` gewoon goedkeurt, en dat is een dichte deur en geen grens',
    ).toContain('GELUKT');
  }, TEST_TIMEOUT);

  it('weigert een payload die de omvangsgrens overschrijdt', () => {
    const uit = schrijfAlsEigenaar(`jsonb_build_object('title', repeat('x', 5000000))`);
    expect(
      uit,
      'een payload van vijf miljoen tekens komt er nog steeds in — deze tabel is ' +
        'append-only en de tier is gratis',
    ).toContain('goal_events_waarde_omvang');
    expect(uit, 'de insert slaagde').not.toContain('GELUKT');
  }, TEST_TIMEOUT);

  /**
   * ⚠️ Dezelfde geneste vorm nog een keer, maar nu langs de **schrijfroute** in
   *    plaats van via de functie los. Vraag 1 van regel 18: hier knopen de policy,
   *    de grant en de CHECK aan elkaar, en alleen hier is te zien dat een gewone
   *    gebruiker er niet doorheen komt.
   */
  it('weigert langs de echte schrijfroute een vrije tekst onder een toegestane sleutel', () => {
    const uit = schrijfAlsEigenaar(
      `jsonb_build_object('title', jsonb_build_object('reden','ik had het te druk','gemiste_week',true))`,
    );
    expect(
      uit,
      'een gewone gebruiker schrijft vrije tekst weg onder een sleutel die mag — ' +
        'dat is woordelijk het scenario van reviewrij 519',
    ).toContain('goal_events_waarde_sleutels');
    expect(uit, 'de insert slaagde').not.toContain('GELUKT');
  }, TEST_TIMEOUT);

  /**
   * ⚠️ **En de gewone gebruiker moet er wél doorheen.** 📏 Zonder de
   *    `grant execute` op `goal_event_sleutels_kloppen` valt precies deze insert
   *    om met `permission denied for function goal_event_sleutels_kloppen` —
   *    gemeten met de grant in een teruggerolde transactie weggehaald. Dat is de
   *    fout van QS8-453 in zijn zuiverste vorm: de grens is dan geen grens maar
   *    een dichte tabel.
   */
  it('laat een gewone created-gebeurtenis door langs de echte schrijfroute', () => {
    const uit = schrijfAlsEigenaar(`jsonb_build_object('title','mijn doel')`);
    expect(
      uit,
      'een volkomen normale gebeurtenis wordt geweigerd — kijk eerst naar de grant ' +
        'op de functie die de CHECK aanroept',
    ).toContain('GELUKT');
  }, TEST_TIMEOUT);

  /**
   * ⚠️⚠️ **Het register komt van de schrijver en niet van de naam, en deze toets
   *    is de helft die dat afdwingt.** 📏 Er zijn precies twee schrijvers van
   *    `deadline_moved` in de database — `zet_streefdatum()` en
   *    `beslis_deadline_verzoek()` — en geen enkele client schrijft dat type zelf
   *    (`goal_events_insert` laat alleen `created`, `archived` en `completed`
   *    toe). De eerste staat hieronder; de tweede vraagt een groep, een verzoek en
   *    een begunstigde en staat in `tests/rls/uitstelbeslisser-ziet-de-straf.test.ts`.
   *
   *    Dat is geen verwijzing uit gemak. Die suite is wát deze grens gered heeft:
   *    het register zei één ronde lang `boolean` voor `straffen_teruggezet` — zo
   *    léést die naam — terwijl `beslis_deadline_verzoek()` er een `row_count` in
   *    zet. De must-allow hierboven was uit datzelfde register overgeschreven en
   *    dus even fout, dus deze suite bleef groen terwijl élk akkoord op een
   *    uitstelverzoek omviel. **Een must-allow die je uit je eigen register
   *    overschrijft, toetst je register tegen zichzelf.**
   */
  it('laat de echte schrijver van deadline_moved door — zet_streefdatum()', () => {
    let uit: string;
    try {
      uit = psqlMetInvoer(
        [
          'begin;',
          'create temp table v (uid uuid, goal uuid);',
          'grant select, insert, update on v to authenticated;',
          'insert into auth.users (id, email)',
          "  values (gen_random_uuid(), gen_random_uuid()::text || '@proef464.test');",
          'insert into v (uid)',
          "  select id from auth.users where email like '%@proef464.test'",
          '   order by created_at desc nulls last limit 1;',
          'insert into goals (owner_id, title, target_date)',
          "  select uid, 'Grensdoel', current_date + 30 from v;",
          'update v set goal =',
          '  (select id from goals where owner_id = (select uid from v) limit 1);',
          "select set_config('request.jwt.claims',",
          "  json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);",
          'set local role authenticated;',
          "select 'RPC=' || public.zet_streefdatum((select goal from v), current_date + 60)::text;",
          "select 'GEBEURTENIS=' || coalesce((select new_value::text from goal_events",
          "   where goal_id = (select goal from v) and event_type = 'deadline_moved' limit 1), 'GEEN');",
          'rollback;',
        ].join('\n'),
        { verbose: true },
      );
    } catch (fout) {
      uit = fout instanceof Error ? fout.message : String(fout);
    }

    expect(
      uit,
      'de enige schrijver van deadline_moved die zonder groep werkt komt er niet ' +
        'doorheen — dan weigert deze grens het schema zelf',
    ).toContain('"ok": true');
    expect(uit, 'er is geen gebeurtenis weggeschreven').toContain('"target_date"');
  }, TEST_TIMEOUT);
});
