import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * `group_events` heeft een dagplafond — QS8-374, migratie 0216.
 *
 * ⚠️ **De `unchanged`-toets bewaakt de herhaling en niet het aantal.** Elke
 *    schrijver naar deze tabel heeft er een, en ze doen allemaal precies wat ze
 *    beloven: dezelfde waarde nóg een keer zetten geeft
 *    `{"ok": false, "reason": "unchanged"}` en schrijft niets. Waar geen van ze
 *    over gaat is héén en weer — A → B is een verandering, B → A ook, en elke
 *    flip is dus een geldige gebeurtenis die terecht geregistreerd wordt.
 *
 * ⚠️ 📏 **Het zijn er acht en niet zeven.** Het issue noemde de zeven RPC's die
 *    `authenticated` mag aanroepen; een scan over `pg_proc.prosrc` geeft er
 *    acht. De achtste is `meld_uitzetting()`, een `after update`-trigger op
 *    `group_members`. Hij schrijft ook op `auth.uid()`, dus hij valt onder
 *    hetzelfde plafond als de handeling die hem afvuurt.
 *
 *    📏 Gemeten bij QS8-369: 200 aanroepen van `zet_groepsontdekbaarheid()` die
 *    telkens de andere kant op zetten gaven **200 rijen**, door één beheerder op
 *    één groep, in één transactie. Onwrikbare regel 18: elk onderdeel klopt en
 *    het geheel lekt.
 *
 * ⚠️ Eén van de zeven hééft er iets tegen, en dat is geen toeval:
 *    `zet_groepszichtbaarheid()` draagt een `too_soon`-afkoeling, omdat een
 *    omzetting dáár met terugwerkende kracht verandert wat er over ándere leden
 *    zichtbaar wordt (domeinregel 7, besluit A41). Daar had iemand er al over
 *    nagedacht; bij de andere zeven niet.
 *
 * ## Waarom dit meer is dan bytes
 *
 * `group_events` is de auditrij van een groep en is voor de groep leesbaar.
 * Tweehonderd rijen "X zette de groep op ontdekbaar / niet-ontdekbaar" maken elk
 * echt auditspoor onvindbaar. Dat is geen domeinregel-7-lek — er staat niets in
 * over een gemiste week — maar het is wél een auditspoor dat je met ruis kunt
 * dichtgooien.
 *
 * ## De must-allow is hier de moeilijkste helft
 *
 * ⚠️⚠️ **Een plafond dat te laag ligt, sluit een beheerder uit zijn eigen
 *    groepen.** `beslis_lidmaatschapsverzoek()` schrijft onvoorwaardelijk een
 *    rij — bij accepteren én bij weigeren — en dat is de handeling die een
 *    beheerder van een volle groep legitiem vaak doet.
 *
 *    📏 De zwaarste legitieme dag is daarom gemeten en niet geschat: **110**.
 *    Tien groepen aanmaken is het maximum (`create_group()` weigert bij tien per
 *    etmaal én bij tien lidmaatschappen), en elk tot de rand van twaalf leden
 *    vullen is 10 × 11 = 110 beslissingen.
 *
 * ⚠️ **Sinds de security-review telt die 110 niet eens meer mee.**
 *    `join_request_decided` is vrijgesteld, want een ánder bepaalt dat aantal —
 *    zie de twee tests hieronder. Wat er nog telt zijn de vier instellingen die
 *    je zélf heen en weer kunt zetten, en daarvoor is 500 zeer ruim. De
 *    zwaarste-dag-test blijft staan omdat hij bewijst dat de héle keten werkt,
 *    niet omdat 110 nog tegen het plafond aan zit.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, mutatie per grendel, en elke keer
 * eerst met `pg_get_functiondef()` of `pg_trigger` nagekeken dat de mutatie er
 * écht in stond vóór de uitslag geloofd werd:
 *
 *   A  `drop trigger groepsgebeurtenissen_dagplafond on group_events`
 *      → 5 rood: twee hier, twee in `plafonddekking.test.ts` (het gat én de
 *        zelftoets 16 → 15) en de zelftoets in `remdekking.test.ts`
 *   B  `drop trigger groepsgebeurtenissen_rem on group_events`
 *      → 2 rood: de remtest hier en de vormtoets in `remdekking.test.ts`
 *   C  de rem `after insert … for each statement` maken
 *      → 2 rood, dezelfde twee. De naam blijft kloppen, de vorm niet — en dat
 *        is de waarschijnlijkste fout van wie de vólgende rem schrijft, want de
 *        dagteller ernaast ís `after … for each statement`.
 *   D  het plafond per `group_id` tellen in plaats van per `actor_id`
 *      → 1 rood: 'telt per gebruiker en niet per groep', en alléén die
 *   E  `if v_batch = 0 then return null; end if;` eruit
 *      → 1 rood: 'laat een statement dat niets toevoegt door, ook bóven het
 *        plafond'
 *   F  `groepsgebeurtenissen_telt_mee()` overal `true` laten geven — de
 *      vrijstellingen weg, dus de eerste versie van deze migratie
 *      → 2 rood: 'sluit niemand op' en 'een ánder kan je plafond niet
 *        volschrijven'. Precies de twee gevallen die de security-review vond,
 *        en ze zijn met deze mutatie exact te reproduceren.
 *
 * ⚠️⚠️ **E was eerst groen, en dat was de leerzaamste van de vijf.** De tak is
 *    overgenomen uit 0214, waar hij een echte gebruiker uit zijn app sloot. Hier
 *    leek hij dood — geen enkele schrijver op deze tabel doet een `on conflict`,
 *    en de kop van 0216 zegt dat ook met zoveel woorden.
 *
 *    📏 Nagemeten en dat klopte niet. De tak ís bereikbaar: een
 *    `insert … on conflict do nothing` die volledig op het conflict landt, ís
 *    een INSERT-statement en vuurt de trigger af met een lége transitietabel.
 *    Bóven het plafond weigert die dan met `(0 erbij, 501 in het laatste
 *    etmaal)` — dezelfde handtekening als het geval in QS8-369.
 *
 *    De test is dáárna geschreven, en pas toen werd E rood. **Een mutatie die
 *    groen blijft is een vraag en geen resultaat**, en het antwoord was hier
 *    niet "de tak mag weg" maar "er was geen test die hem kon raken".
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 120_000;

const RUN = Math.random().toString(36).slice(2, 10);

/**
 * Een `event_type` die de allowlist van `group_events_type_valid` kent.
 *
 * ⚠️ **Geen verzonnen waarde.** De eerste versie van deze tests schreef
 *    `'proef'` en liep op die CHECK vast — en de melding leek op een plafond dat
 *    weigerde. Een opstelling die op een ándere grendel stukloopt, meet niets
 *    van wat ze belooft.
 */
const GELDIG_TYPE = 'huddle_day_changed';

let alice: TestUser;
let groep: string;

/** Het plafond zoals de dátabase het kent — niet als getal in dit bestand. */
function grensUitDeDatabase(): number {
  return Number(psql('select public.groepsgebeurtenissen_plafond()').trim());
}

/** Schrijft `aantal` gebeurtenissen als `gebruiker`, langs de RPC's heen. */
function schrijfAls(gebruiker: string, aantal: number): string | null {
  try {
    psql(`
      begin;
      select set_config('request.jwt.claims',
                        json_build_object('sub', '${gebruiker}')::text, true);
      insert into public.group_events (group_id, actor_id, event_type)
      select '${groep}'::uuid, '${gebruiker}'::uuid, '${GELDIG_TYPE}'
        from generate_series(1, ${aantal});
      commit;
    `);
    return null;
  } catch (fout) {
    return String((fout as { stderr?: string }).stderr ?? fout);
  }
}

function aantalVan(gebruiker: string): number {
  return Number(
    psql(`select count(*) from public.group_events
           where actor_id = '${gebruiker}'
             and created_at > now() - interval '1 day'`).trim(),
  );
}

/**
 * ⚠️ De beschikbaarheidsvraag noemt met opzet niet de trigger of de functie die
 *    de ijkingen breken — dat was de les van mutatie A in
 *    `pushtokengrens.test.ts`: een probe die het ding toetst dat je gaat breken,
 *    zet je eigen ijking uit en levert "no tests" op in plaats van rood.
 */
const meetbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'group_events' and relkind = 'r' and relnamespace = 'public'::regnamespace",
  import.meta.url,
);

describe.skipIf(!rlsTestsConfigured)('group_events heeft een dagplafond', () => {
  beforeAll(async () => {
    alice = await createTestUser('groepsgeb-alice');
    groep = psql(`
      select (public.create_group('Plafondgroep ${RUN}') -> 'group' ->> 'id')
        from (select set_config('request.jwt.claims',
                                json_build_object('sub', '${alice.id}')::text, true)) x
    `).trim();
    registreerGroep(groep);
    psql(`delete from public.group_events where actor_id = '${alice.id}'`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it.skipIf(!meetbaar)(
    'laat een batch precies op het plafond door',
    () => {
      // ⚠️ De must-allow. Zonder deze helft is "niemand mag er meer bij" ook te
      //    halen met een plafond van nul, en dat is een dichtgeslagen app.
      const grens = grensUitDeDatabase();
      const fout = schrijfAls(alice.id, grens);

      expect(fout, `precies het plafond (${grens}) hoort te mogen`).toBeNull();
      expect(aantalVan(alice.id)).toBe(grens);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!meetbaar)(
    'weigert de eerste erboven, en telt daarbij de rijen die er al staan',
    () => {
      // ⚠️ **De naad.** De vorige test heeft er precies het plafond neergezet.
      //    Eén rij erbij is op zichzelf ver onder elk plafond; alleen een teller
      //    die de bestáánde rijen meeneemt, ziet dit. Een trigger die
      //    `count(*) from nieuw` toetst in plaats van de tabel, blijft groen.
      const grens = grensUitDeDatabase();
      expect(aantalVan(alice.id), 'de vorige test hoort het plafond vol te hebben gezet').toBe(grens);

      const fout = schrijfAls(alice.id, 1);

      expect(fout, 'de eerste erboven hoort te stuiten, ook als hij alleen komt').not.toBeNull();
      expect(fout).toMatch(/Te veel groepsgebeurtenissen in één dag/);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!meetbaar)(
    'telt per gebruiker en niet per groep',
    () => {
      // ⚠️⚠️ **Dit is de test die de vorm van het plafond vastlegt.** Een
      //    beheerder van tien groepen is één `auth.uid()`; telde de trigger per
      //    `group_id`, dan had diezelfde persoon tien keer zoveel ruimte en bleef
      //    de flip-flop uit de kop onbegrensd — precies het gat dat deze
      //    migratie dicht.
      //
      //    Alice zit op het plafond uit de vorige tests. Een tweede groep van
      //    háár mag daar niets aan veranderen.
      const tweede = psql(`
        select (public.create_group('Tweede groep ${RUN}') -> 'group' ->> 'id')
          from (select set_config('request.jwt.claims',
                                  json_build_object('sub', '${alice.id}')::text, true)) x
      `).trim();

      registreerGroep(tweede);

      let fout: string | null = null;
      try {
        psql(`
          begin;
          select set_config('request.jwt.claims',
                            json_build_object('sub', '${alice.id}')::text, true);
          insert into public.group_events (group_id, actor_id, event_type)
          values ('${tweede}'::uuid, '${alice.id}'::uuid, '${GELDIG_TYPE}');
          commit;
        `);
      } catch (e) {
        fout = String((e as { stderr?: string }).stderr ?? e);
      }

      expect(fout, 'een tweede groep hoort geen nieuwe ruimte te geven').not.toBeNull();
      expect(fout).toMatch(/Te veel groepsgebeurtenissen in één dag/);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!meetbaar)(
    'laat de rem een grote batch tegenhouden vóórdat de grendel eraan toekomt',
    () => {
      // ⚠️ **De rem en de grendel zijn niet inwisselbaar.** Allebei weigeren ze
      //    deze batch; het verschil is dat de grendel hem éérst fysiek laat
      //    schrijven. 📏 240 kB tegen 3440 kB, zie de kop van 0216. Dat verschil
      //    is met een assertie op "geweigerd" niet te zien, dus deze test kijkt
      //    naar wélke van de twee gesproken heeft.
      const bob = psql(
        `select public.shim_maak_gebruiker('groepsgeb-bob-${RUN}@example.com', 'geheim123')`,
      ).trim();
      try {
        const fout = schrijfAls(bob, grensUitDeDatabase() * 2 + 1);
        expect(fout).not.toBeNull();
        expect(fout, 'de rem hoort te spreken, niet het dagplafond').toMatch(
          /Te veel groepsgebeurtenissen in één verzoek/,
        );
      } finally {
        psql(`select public.shim_verwijder_gebruiker('${bob}')`);
      }
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!meetbaar)(
    'laat een statement dat niets toevoegt door, ook bóven het plafond',
    () => {
      // ⚠️⚠️ **Deze test is er gekomen doordat de ijking van deze tak groen
      //    bleef, en dat was een vraag en geen resultaat.** `v_batch = 0` is
      //    overgenomen uit 0214, waar hij een echte gebruiker uit zijn app
      //    sloot; hier leek hij dood, want geen enkele schrijver op deze tabel
      //    doet vandaag een `on conflict`.
      //
      //    📏 Nagemeten en dat klopte niet: de tak ís bereikbaar. Een
      //    `insert … on conflict do nothing` die volledig op het conflict landt,
      //    ís een INSERT-statement en vuurt de `after insert … for each
      //    statement`-trigger af met een lége transitietabel. Zonder de tak
      //    weigert die dan op de tábel in plaats van op de toevoeging:
      //    `Te veel groepsgebeurtenissen in één dag (0 erbij, 501 …)`.
      //
      // ⚠️ Bóven het plafond komen vraagt een schrijver zonder claim — via de
      //    RPC's is 501 niet te bereiken. Dat is geen kunstgreep: een backfill,
      //    een tweede schrijver of een later verláágd plafond brengt een echte
      //    gebruiker er net zo goed boven, en dán is dit het verschil tussen een
      //    werkende app en iemand die vastzit.
      const dave = psql(
        `select public.shim_maak_gebruiker('groepsgeb-dave-${RUN}@example.com', 'geheim123')`,
      ).trim();
      try {
        const grens = grensUitDeDatabase();
        psql(`insert into public.group_events (group_id, actor_id, event_type)
              select '${groep}'::uuid, '${dave}'::uuid, '${GELDIG_TYPE}'
                from generate_series(1, ${grens + 1})`);
        expect(aantalVan(dave), 'de opstelling hoort hem bóven het plafond te zetten').toBe(
          grens + 1,
        );

        let fout: string | null = null;
        try {
          psql(`
            begin;
            select set_config('request.jwt.claims',
                              json_build_object('sub', '${dave}')::text, true);
            insert into public.group_events (id, group_id, actor_id, event_type)
            select id, group_id, actor_id, event_type
              from public.group_events where actor_id = '${dave}' limit 1
            on conflict (id) do nothing;
            commit;
          `);
        } catch (e) {
          fout = String((e as { stderr?: string }).stderr ?? e);
        }

        expect(
          fout,
          'een statement dat nul rijen toevoegt, kan het plafond niet doorbroken hebben',
        ).toBeNull();
      } finally {
        psql(`select public.shim_verwijder_gebruiker('${dave}')`);
      }
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!meetbaar)(
    'sluit niemand op: verlaten, overdragen en archiveren blijven werken op het plafond',
    () => {
      // ⚠️⚠️ **De zwaarste bevinding van de security-review op deze branch, en de
      //    reden dat `groepsgebeurtenissen_telt_mee()` bestaat.** De eerste
      //    versie telde élk event_type mee, en dan valt `verlaat_groep()` op het
      //    plafond om met een exception die de hele transactie terugdraait —
      //    ook voor een gewoon lid.
      //
      //    De groep verlaten is in deze app de manier waarop iemand zijn
      //    toestemming intrekt; de onderbouwing van domeinregel 7 noemt met
      //    zoveel woorden de leidinggevende die in de groep zit. Iemand die
      //    eruit wil en er een etmaal lang niet uit kán, is precies het geval
      //    waarvoor die regel bestaat — en dat slot bestond vóór deze migratie
      //    niet. **Een plafond dat de uitgang meebegrenst is erger dan het lek
      //    dat het dicht.**
      //
      // ⚠️ Twee uitgangen, want de énige beheerder loopt langs een ánder pad:
      //    `verlaat_groep()` roept dan `archiveer_groep()` aan, en dát schrijft
      //    `group_archived`. Een test die alleen het gewone lid draait, mist de
      //    helft — precies de vorm van regel 18 vraag 1.
      const admin = psql(
        `select public.shim_maak_gebruiker('uitgang-admin-${RUN}@example.com', 'geheim123')`,
      ).trim();
      const lid = psql(
        `select public.shim_maak_gebruiker('uitgang-lid-${RUN}@example.com', 'geheim123')`,
      ).trim();
      try {
        const grens = grensUitDeDatabase();
        const eigenGroep = psql(`
          select (public.create_group('Uitgangsgroep ${RUN}') -> 'group' ->> 'id')
            from (select set_config('request.jwt.claims',
                                    json_build_object('sub', '${admin}')::text, true)) x
        `).trim();
        registreerGroep(eigenGroep);
        psql(`update public.groups set categorie = 'fitness', ontdekbaar = true
               where id = '${eigenGroep}'`);

        // het lid treedt toe langs de gewone weg
        psql(`
          select set_config('request.jwt.claims',
                            json_build_object('sub', '${lid}')::text, true);
          select public.vraag_lidmaatschap_aan('${eigenGroep}'::uuid, null);
        `);
        psql(`
          select set_config('request.jwt.claims',
                            json_build_object('sub', '${admin}')::text, true);
          select public.beslis_lidmaatschapsverzoek(
                   (select id from public.group_join_requests
                     where group_id = '${eigenGroep}' and user_id = '${lid}'), 'accepted');
        `);

        // allebei op het plafond, met een schrijver zonder claim
        for (const wie of [lid, admin]) {
          psql(`insert into public.group_events (group_id, actor_id, event_type)
                select '${eigenGroep}'::uuid, '${wie}'::uuid, '${GELDIG_TYPE}'
                  from generate_series(1, ${grens})`);
        }

        // ⚠️ De grendel moet nog wél bijten — anders is deze hele test ook groen
        //    met een plafond dat niets doet.
        expect(schrijfAls(admin, 1), 'een instelling erbij hoort nog steeds te stuiten').not.toBeNull();

        // het gewone lid eruit
        const lidEruit = psql(`
          select (public.verlaat_groep('${eigenGroep}'::uuid, true, null) ->> 'ok')
            from (select set_config('request.jwt.claims',
                                    json_build_object('sub', '${lid}')::text, true)) x
        `).trim();
        expect(lidEruit, 'een lid hoort op het plafond nog steeds weg te kunnen').toBe('true');

        // en de énige beheerder, die via archiveer_groep loopt
        const adminEruit = psql(`
          select (public.verlaat_groep('${eigenGroep}'::uuid, true, null) ->> 'gearchiveerd')
            from (select set_config('request.jwt.claims',
                                    json_build_object('sub', '${admin}')::text, true)) x
        `).trim();
        expect(
          adminEruit,
          'de énige beheerder hoort eruit te kunnen, en dat archiveert de groep',
        ).toBe('true');
      } finally {
        psql(`select public.shim_verwijder_gebruiker('${lid}')`);
        psql(`select public.shim_verwijder_gebruiker('${admin}')`);
      }
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!meetbaar)(
    'een ánder kan je plafond niet volschrijven met lidmaatschapsverzoeken',
    () => {
      // ⚠️⚠️ **De tweede helft van diezelfde bevinding.** `join_request_decided`
      //    is de énige soort waarvan een ánder het aantal bepaalt: elke keer dat
      //    je een verzoek weigert, ging dat van jóuw quotum af.
      //
      //    📏 Gemeten: één aanvallersaccount levert **tien** rijen op naam van de
      //    beheerder per etmaal — `lidmaatschapsverzoeken_over()` staat tien
      //    verzoeken per aanvrager toe, en ná een weigering mag dezelfde persoon
      //    opnieuw aanvragen. Vijftig nepaccounts vulden dus een plafond van 500,
      //    en de beheerder zat daarna een etmaal vast in al zijn groepen.
      //
      // ⚠️ De test toetst de belófte en niet de vrijstellingslijst: een beheerder
      //    op zijn plafond kan nog steeds beslissen. Verhuist die vrijstelling
      //    ooit naar een andere plek, dan blijft deze test kloppen.
      const admin = psql(
        `select public.shim_maak_gebruiker('spam-admin-${RUN}@example.com', 'geheim123')`,
      ).trim();
      const spammer = psql(
        `select public.shim_maak_gebruiker('spam-vreemde-${RUN}@example.com', 'geheim123')`,
      ).trim();
      try {
        const grens = grensUitDeDatabase();
        const g = psql(`
          select (public.create_group('Spamgroep ${RUN}') -> 'group' ->> 'id')
            from (select set_config('request.jwt.claims',
                                    json_build_object('sub', '${admin}')::text, true)) x
        `).trim();
        registreerGroep(g);
        psql(`update public.groups set categorie = 'fitness', ontdekbaar = true where id = '${g}'`);

        psql(`insert into public.group_events (group_id, actor_id, event_type)
              select '${g}'::uuid, '${admin}'::uuid, '${GELDIG_TYPE}'
                from generate_series(1, ${grens})`);

        psql(`
          select set_config('request.jwt.claims',
                            json_build_object('sub', '${spammer}')::text, true);
          select public.vraag_lidmaatschap_aan('${g}'::uuid, null);
        `);
        const besluit = psql(`
          select (public.beslis_lidmaatschapsverzoek(
                   (select id from public.group_join_requests
                     where group_id = '${g}' and user_id = '${spammer}'), 'declined') ->> 'ok')
            from (select set_config('request.jwt.claims',
                                    json_build_object('sub', '${admin}')::text, true)) x
        `).trim();

        expect(
          besluit,
          'een beheerder op zijn plafond hoort een verzoek nog te kunnen weigeren — ' +
            'anders bepaalt de spammer wanneer hij vastzit',
        ).toBe('true');
      } finally {
        psql(`select public.shim_verwijder_gebruiker('${spammer}')`);
        psql(`select public.shim_verwijder_gebruiker('${admin}')`);
      }
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!meetbaar)(
    'raakt een achtergrondschrijver zonder ingelogde gebruiker niet',
    () => {
      // ⚠️ De tweede must-allow, dezelfde afweging als bij de vijftien tellers
      //    ervoor: de rollover en de meldingenjob draaien onder `service_role`
      //    zonder claim. Een plafond dat hén raakt, legt de app stil op precies
      //    het moment dat er iets moet gebeuren.
      const carol = psql(
        `select public.shim_maak_gebruiker('groepsgeb-carol-${RUN}@example.com', 'geheim123')`,
      ).trim();
      try {
        const teveel = grensUitDeDatabase() + 50;
        psql(`insert into public.group_events (group_id, actor_id, event_type)
              select '${groep}'::uuid, '${carol}'::uuid, '${GELDIG_TYPE}'
                from generate_series(1, ${teveel})`);
        expect(
          Number(psql(`select count(*) from public.group_events where actor_id = '${carol}'`).trim()),
          'zonder auth.uid() hoort het plafond niet te gelden',
        ).toBe(teveel);
      } finally {
        psql(`select public.shim_verwijder_gebruiker('${carol}')`);
      }
    },
    TEST_TIMEOUT,
  );
});

describe.skipIf(!rlsTestsConfigured)('de zwaarste legitieme dag past er nog in', () => {
  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it.skipIf(!meetbaar)(
    'een beheerder vult tien groepen tot de rand zonder het plafond te raken',
    () => {
      // ⚠️⚠️ **De belangrijkste test in dit bestand, en de reden dat het plafond
      //    op 500 staat en niet op 100.** Dit is geen verzonnen bovengrens maar
      //    de maximale dag die de andere grenzen toestaan: `create_group()`
      //    weigert bij tien groepen per etmaal én bij tien lidmaatschappen, en
      //    `join_group_with_code()` bij twaalf leden. Tien × elf = 110.
      //
      //    Zou het plafond daaronder liggen, dan sluit deze migratie een
      //    beheerder uit zijn eigen groepen — een dichtgeslagen app in plaats
      //    van een gesloten gat, en dat is erger dan het lek.
      //
      // ⚠️ Hij draait de échte RPC's en niet een insert. De belofte is "een
      //    beheerder kan zijn werk doen", en dat is een eigenschap van de keten
      //    en niet van de trigger. Regel 18, vraag 2.
      const uit = psql(`
        do $proef$
        declare v_admin uuid; v_lid uuid; v_gid uuid; g int; m int; r jsonb;
        begin
          v_admin := public.shim_maak_gebruiker('zwaarste-${RUN}@example.com', 'geheim123');
          for g in 1..10 loop
            perform set_config('request.jwt.claims',
                               json_build_object('sub', v_admin)::text, true);
            r := public.create_group('Zwaarste dag ${RUN}-' || g);
            v_gid := ((r -> 'group') ->> 'id')::uuid;
            update public.groups set categorie = 'fitness', ontdekbaar = true where id = v_gid;
            for m in 1..11 loop
              v_lid := public.shim_maak_gebruiker(
                         'zwaarste-${RUN}-' || g || '-' || m || '@example.com', 'geheim123');
              perform set_config('request.jwt.claims',
                                 json_build_object('sub', v_lid)::text, true);
              r := public.vraag_lidmaatschap_aan(v_gid, null);
              perform set_config('request.jwt.claims',
                                 json_build_object('sub', v_admin)::text, true);
              r := public.beslis_lidmaatschapsverzoek(
                     (select id from public.group_join_requests
                       where group_id = v_gid and user_id = v_lid), 'accepted');
              if r ->> 'ok' <> 'true' then
                raise exception 'beslissing geweigerd bij groep % lid %: %', g, m, r;
              end if;
            end loop;
          end loop;
        end $proef$;
      `);

      // ⚠️ **De telling komt uit een `select` en niet uit een `raise notice`.**
      //    Die laatste schrijft naar stderr, en `psql()` geeft alleen stdout
      //    terug — de eerste versie van deze test vergeleek dus een lege string
      //    met een getal. Hij werd rood en had gelijk; het is wél precies de
      //    vorm waarin een test kan slágen zonder iets gemeten te hebben, als de
      //    assertie de andere kant op had gestaan.
      const gemeten = psql(`
        select count(*) from public.group_events e
          join auth.users u on u.id = e.actor_id
         where u.email = 'zwaarste-${RUN}@example.com'
      `).trim();

      // ⚠️ Het getal staat er hard in en niet als ondergrens. Zakt het, dan is
      //    er onderweg iets stilletjes gaan weigeren — en dat is precies het
      //    soort stilte dat deze test moet vinden.
      expect(uit).toBeDefined();
      expect(Number(gemeten), 'de zwaarste legitieme dag hoort 110 gebeurtenissen te geven').toBe(
        110,
      );

      // ⚠️⚠️ **Dit blok ruimt zichzelf op, en dat is geen netheid maar een
      //    meting.** De 111 gebruikers en 10 groepen worden met
      //    `shim_maak_gebruiker` in een `do`-blok gemaakt, en `removeTestUsers()`
      //    kent alleen wat via `createTestUser()` liep. 📏 De security-review op
      //    deze branch mat het residu na drie runs: **333 gebruikers, 30 groepen
      //    en 330 `group_events`**. Elke volgende run legt er 111 bij, en dan
      //    gaat een test die iets over aantallen zegt op een dag om op iets dat
      //    niets met zijn onderwerp te maken heeft.
      psql(`
        do $op$
        declare v_id uuid;
        begin
          for v_id in
            select id from auth.users where email like 'zwaarste-${RUN}-%'
                                         or email = 'zwaarste-${RUN}@example.com'
          loop
            perform public.shim_verwijder_gebruiker(v_id);
          end loop;
          delete from public.groups where name like 'Zwaarste dag ${RUN}-%';
        end $op$;
      `);
    },
    600_000,
  );
});
