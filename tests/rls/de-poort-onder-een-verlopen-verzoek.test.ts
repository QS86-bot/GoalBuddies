import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De belofte: **een verlopen uitstelverzoek is niet te verzilveren door je eigen
 * tijdzone te verzetten** — QS8-531, migratie 0288.
 *
 * ⚠️⚠️ **Wat er mis was.** `beslis_deadline_verzoek()` mat zijn verlooppoort aan
 *    `eigenaarsdatum(r.requester_id)` = `(now() at time zone profiles.tz)::date`,
 *    en 📏 `has_column_privilege('authenticated','public.profiles','tz','UPDATE')`
 *    is `t`. De gestrafte zette dus zelf de klok die bepaalt of zijn verzoek nog
 *    geldig is — en een verlopen verzoek zet een `due` straf terug op `set`, een
 *    toestand die de begunstigde groep al gezien heeft (`commitment_due`).
 *
 * ⚠️ **Dezelfde klasse als QS8-322 / migratie 0280**, die dit voor
 *    `wikkel_commitments_af()` sloot. 0280 verhuisde alleen de straftak van die
 *    ene functie; deze tweede aanroeper bleef staan. Dat is de reden dat deze
 *    suite bestaat naast `strafklok-ligt-vast.test.ts`: de grendel van 0280 zit
 *    in een ándere functie en zegt niets over deze route.
 *
 * ⚠️⚠️ **Besluit van Quinten (17-09-2026): bevriezen op `commitments.tz`**, niet
 *    UTC en niet laten staan. Enige optie die niemands belofte verandert. Zonder
 *    straf op het doel blijft de dag van de aanvrager de maat — er is dan geen
 *    consequentie om aan te sleutelen. Afweging in
 *    `docs/decisions/2026-09-17-de-poort-en-de-klok-eronder.md`.
 *
 * ⚠️⚠️ **Geen enkele toets hier hangt van het uur van de dag af, en dat is met
 *    opzet.** Kiritimati is `UTC+14` en Midway `UTC−11`: **25 uur** uit elkaar,
 *    en twee zones die meer dan 24 uur uit elkaar liggen staan nooit op dezelfde
 *    datum. De voorganger van dit soort toetsen telde datums op het moment van
 *    draaien en maakte CI twee uur per dag rood (QS8-529).
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'beslis_deadline_verzoek'",
  import.meta.url,
);

/** `UTC+14`. De datum hier is altijd die van {@link WEST} plus één. */
const OOST = 'Pacific/Kiritimati';
/** `UTC−11`. */
const WEST = 'Pacific/Midway';

interface Opstelling {
  /** De zone van het profiel op het moment dat de straf wordt aangegaan. */
  readonly bijAangaan: string;
  /** De zone waar het profiel daarna naartoe gaat — de aanval. */
  readonly daarna: string;
  /** Draagt het doel een straf? Zonder straf hoort de levende zone te gelden. */
  readonly metStraf: boolean;
  /** SQL-uitdrukking voor `new_date` van het verzoek. */
  readonly nieuweDatum: string;
}

/**
 * Een doel met een verstreken streefdatum, een open uitstelverzoek, en een buddy
 * die erover mag beslissen.
 *
 * ⚠️ **De straf wordt aangegaan terwijl het profiel nog eerlijk staat.**
 *    `bevries_commitmentzone()` kopieert `profiles.tz` bij de `insert`, dus een
 *    opstelling die de zone vóór die regel verzet, manipuleert óók de bevroren
 *    klok en meet daarmee niets. 📏 Dat overkwam de eerste versie van deze
 *    meting: alle zes de gevallen kwamen er identiek uit, vóór én na 0288.
 */
function opzet(o: Opstelling): string {
  return `
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_grp uuid := gen_random_uuid();
  v_g uuid;
  v_c uuid;
  v_r uuid;
  v_oost date;
begin
  insert into auth.users (id, email) values (v_a, v_a || '@zz.test'), (v_b, v_b || '@zz.test');
  update profiles set tz = '${o.bijAangaan}' where id = v_a;
  update profiles set tz = '${OOST}'          where id = v_b;

  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Proefgroep', v_a, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status)
    values (v_grp, v_a, 'admin', 'active'), (v_grp, v_b, 'member', 'active');

  v_oost := (now() at time zone '${OOST}')::date;

  insert into goals (owner_id, title, target_date)
    values (v_a, 'Doel met een streefdatum', v_oost - 10) returning id into v_g;

  ${
    o.metStraf
      ? `insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status)
    values (v_g, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(), v_grp, 'due')
    returning id into v_c;`
      : `-- geen straf op dit doel`
  }

  -- ⚠️ **Nu pas** verzet de gestrafte zijn zone. Dat is de aanval.
  update profiles set tz = '${o.daarna}' where id = v_a;

  insert into deadline_requests (goal_id, group_id, requester_id, old_date, new_date, reason, status)
    values (v_g, v_grp, v_a, v_oost - 10, ${o.nieuweDatum}, 'Ik had meer tijd nodig', 'open')
    returning id into v_r;

  create temp table proef (request_id uuid, goal_id uuid, commitment_id uuid, buddy uuid);
  insert into proef values (v_r, v_g, v_c, v_b);
end $$;`;
}

/** Beslist als de buddy en rapporteert de uitkomst plus de stand van de straf. */
const BESLIS = `
do $$
declare v_uit jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select buddy from proef), 'role', 'authenticated')::text, true);
  v_uit := public.beslis_deadline_verzoek((select request_id from proef), true, null);
  create temp table uitslag (regel text);
  insert into uitslag values ('uitkomst=' || coalesce(v_uit ->> 'reason', (v_uit ->> 'ok')));
  insert into uitslag
    select 'straf=' || coalesce((select status from commitments where id = (select commitment_id from proef)), 'geen');
end $$;
select regel from uitslag;`;

/** Draait de opstelling plus de beslissing, rolt terug, en geeft stdout terug. */
function beslis(o: Opstelling): string {
  try {
    return psqlMetInvoer(`begin;\n${opzet(o)}\n${BESLIS}\nrollback;`);
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout);
  }
}

describe.skipIf(!beschikbaar)('de poort onder een verlopen verzoek', () => {
  const TIMEOUT = 30_000;

  // -------------------------------------------------------------------------
  // De aanval
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Dit is de toets die de belofte draagt.** De straf is aangegaan in het
   *    oosten; de gevraagde datum is dáár gisteren en in het westen vandaag. Zet
   *    de gestrafte zijn profiel daarna naar het westen, dan zou de poort vóór
   *    0288 opengaan.
   *
   *    📏 Gemeten met precies deze opstelling, 17-09-2026:
   *
   *      zonder 0288   ok, straffen_teruggezet: 1   straf werd `set`
   *      met    0288   verzoek_verlopen             straf blijft `due`
   */
  it(
    'weigert een verzoek dat verlopen is in de zone waarin de straf is aangegaan',
    () => {
      const uit = beslis({
        bijAangaan: OOST,
        daarna: WEST,
        metStraf: true,
        nieuweDatum: `(now() at time zone '${WEST}')::date`,
      });

      expect(
        uit,
        'de gestrafte verzilverde een verlopen verzoek door zijn eigen tijdzone te verzetten',
      ).toContain('uitkomst=verzoek_verlopen');
      expect(
        uit,
        'de straf kwam terug op `set` — een toestand die de begunstigde groep al gezien heeft',
      ).toContain('straf=due');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ **De spiegel: zonder de zonesprong hoort er niets te veranderen.** Zonder
   *    dit geval zou de toets hierboven ook groen zijn als de poort élk verzoek
   *    weigert zodra er een straf op staat.
   */
  it(
    'weigert datzelfde verzoek ook als de gestrafte zijn zone niet verzet',
    () => {
      const uit = beslis({
        bijAangaan: OOST,
        daarna: OOST,
        metStraf: true,
        nieuweDatum: `(now() at time zone '${WEST}')::date`,
      });

      expect(uit).toContain('uitkomst=verzoek_verlopen');
      expect(uit).toContain('straf=due');
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De must-allows — zonder deze helft is "alles weigeren" een geldig antwoord
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Niet optioneel.** Een verzoek dat nog geldig ís, hoort door te gaan en
   *    de straf terug te zetten. Dat is de hele reden dat deze route bestaat
   *    (QS8-308), en een poort die dichtslaat is net zo stuk als een poort die
   *    openstaat.
   */
  it(
    'laat een verzoek door dat ook in de bevroren zone nog in de toekomst ligt',
    () => {
      const uit = beslis({
        bijAangaan: OOST,
        daarna: WEST,
        metStraf: true,
        nieuweDatum: `(now() at time zone '${OOST}')::date + 1`,
      });

      expect(uit, 'een geldig uitstelverzoek werd geweigerd').toContain('uitkomst=true');
      expect(uit, 'de straf kwam niet terug op `set` terwijl zijn reden vervallen is').toContain(
        'straf=set',
      );
    },
    TIMEOUT,
  );

  /**
   * ⚠️⚠️ **Deze toets bewaakt de tweede grendel, en zonder haar bewaakte niets
   *    hem.** 0288 bepaalt `v_vandaag` één keer en gebruikt hem op twee plekken:
   *    de verlooppoort én de voorwaarde onder het terugzetten van de straf. 📏
   *    Geijkt door alléén die tweede plek terug te zetten op de levende klok:
   *    de suite bleef **groen** op vijf toetsen. De poort weigert immers alles
   *    wat in de bevroren klok verlopen is, dus de tweede vraag komt alleen aan
   *    bod als het antwoord meestal toch hetzelfde is.
   *
   *    Meestal — niet altijd. Gaat de gestrafte naar het **oosten** in plaats van
   *    naar het westen, dan loopt de levende klok vóór op de bevroren: het
   *    verzoek haalt de poort, de streefdatum verschuift, en de straf zou op
   *    `due` blijven staan terwijl zijn reden vervallen is. Dat is geen aanval
   *    maar een halve afhandeling, en het is precies wat "twee plekken die
   *    hetzelfde moeten weten" oplevert.
   *
   * ⚠️ De richting is hier omgekeerd: de straf wordt aangegaan in het **westen**
   *    en het profiel gaat daarna naar het oosten.
   */
  it(
    'zet de straf terug met dezelfde klok waarmee de poort meet',
    () => {
      const uit = beslis({
        bijAangaan: WEST,
        daarna: OOST,
        metStraf: true,
        nieuweDatum: `(now() at time zone '${WEST}')::date`,
      });

      expect(uit, 'een geldig verzoek werd geweigerd').toContain('uitkomst=true');
      expect(
        uit,
        'de straf bleef `due` terwijl de streefdatum verschoven is — de poort en de ' +
          'terugzetter meten aan verschillende klokken',
      ).toContain('straf=set');
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De terugval — zonder straf blijft de dag van de aanvrager de maat
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Deze twee bewaken de `coalesce` en niet de poort.** Staat er geen
   *    straf op het doel, dan valt 0288 terug op `eigenaarsdatum()`, en dat is
   *    met opzet: zonder commitment device is er geen consequentie om aan te
   *    sleutelen. Zonder deze helft kan iemand die terugval weghalen zonder dat
   *    er iets rood wordt — en dan weigert de poort elk verzoek op een doel
   *    zonder straf, want `max()` over nul rijen is `null`.
   *
   * ⚠️ De twee zones staan 25 uur uit elkaar, dus nooit op dezelfde datum: het
   *    ene geval is hoe dan ook morgen en het andere hoe dan ook gisteren.
   */
  it(
    'laat zonder straf een verzoek door dat in de zone van de aanvrager nog komt',
    () => {
      const uit = beslis({
        bijAangaan: OOST,
        daarna: WEST,
        metStraf: false,
        nieuweDatum: `(now() at time zone '${OOST}')::date`,
      });

      expect(uit, 'de terugval op de dag van de aanvrager is weg').toContain('uitkomst=true');
      expect(uit).toContain('straf=geen');
    },
    TIMEOUT,
  );

  it(
    'weigert zonder straf een verzoek dat in de zone van de aanvrager voorbij is',
    () => {
      const uit = beslis({
        bijAangaan: WEST,
        daarna: OOST,
        metStraf: false,
        nieuweDatum: `(now() at time zone '${WEST}')::date`,
      });

      expect(uit, 'een verlopen verzoek kwam er zonder straf gewoon doorheen').toContain(
        'uitkomst=verzoek_verlopen',
      );
    },
    TIMEOUT,
  );
});

/**
 * ⚠️⚠️ **Drie eigenschappen die deze reparatie aanneemt, en die niemand anders
 *    vastlegt.** Alle drie gevonden in de security-ronde op QS8-531: twee als een
 *    claim die stelliger was dan de meting, één als een regressie die 0288 zelf
 *    maakte.
 */
describe.skipIf(!beschikbaar)('de aannames onder de bevroren strafklok', () => {
  const TIMEOUT = 30_000;

  /**
   * ⚠️⚠️ **De bevroren zone ligt vast voor de rij, niet voor de afspraak.** Een
   *    straf is niet te verzetten, maar wél te annuleren en opnieuw aan te gaan —
   *    en dan wordt de zone opnieuw bevroren. 📏 Gemeten in de security-ronde, en
   *    hier vastgelegd zodat de volgende lezer het als een gemeten eigenschap
   *    tegenkomt en niet als een verrassing.
   *
   *    Dat is **geen verruiming** van 0288: vóór die migratie was dezelfde speling
   *    er met één PATCH op `profiles.tz`. Deze toets bewaakt dus geen grendel maar
   *    een grens — hij wordt rood zodra iemand die route dichtzet, en dán hoort de
   *    kop van 0288 mee te veranderen.
   */
  it(
    'laat de bevroren zone opnieuw kiezen door te annuleren en opnieuw aan te gaan',
    () => {
      const uit = psqlMetInvoer(`
begin;
do $$
declare v_a uuid := gen_random_uuid(); v_grp uuid := gen_random_uuid(); v_g uuid;
begin
  insert into auth.users (id, email) values (v_a, v_a || '@zz.test');
  update profiles set tz = '${OOST}' where id = v_a;
  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Proefgroep', v_a, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status) values (v_grp, v_a, 'admin', 'active');
  insert into goals (owner_id, title, target_date)
    values (v_a, 'Doel', current_date + 30) returning id into v_g;
  create temp table ids (naam text, id uuid);
  grant all on ids to authenticated;
  insert into ids values ('gebruiker', v_a), ('doel', v_g), ('groep', v_grp);
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where naam = 'gebruiker'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id)
  select id, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(),
         (select id from ids where naam = 'groep') from ids where naam = 'doel';
reset role;

update profiles set tz = '${WEST}' where id = (select id from ids where naam = 'gebruiker');
set local role authenticated;
update commitments set status = 'cancelled' where goal_id = (select id from ids where naam = 'doel');
insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id)
  select id, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(),
         (select id from ids where naam = 'groep') from ids where naam = 'doel';
reset role;

update profiles set tz = '${OOST}' where id = (select id from ids where naam = 'gebruiker');
select 'profiel=' || p.tz || ' strafklok=' ||
       (select c.tz from commitments c
         where c.goal_id = (select id from ids where naam = 'doel') and c.status = 'set')
  from profiles p where p.id = (select id from ids where naam = 'gebruiker');
rollback;`);

      expect(
        uit,
        'de route om de bevroren zone opnieuw te kiezen is dicht — dan klopt de kop van ' +
          '0288 niet meer en hoort die bijgewerkt te worden',
      ).toContain(`profiel=${OOST} strafklok=${WEST}`);
    },
    TIMEOUT,
  );

  /**
   * ⚠️⚠️ **De naad: wat de aanvraagkant accepteert, moet de beslískant kunnen
   *    beslissen.** 0288 verzette de beslisser naar de bevroren klok. Bleef de
   *    aanvrager op `mijn_datum()` staan, dan accepteert het systeem een verzoek
   *    dat onmiddellijk `verzoek_verlopen` heet. 📏 Gemeten vóór de reparatie:
   *    `indienen ok: true`, gevolgd door `beslissen verzoek_verlopen`, met het
   *    verzoek op `open` en `already_open` dat een nieuw verzoek blokkeert.
   *
   *    Sinds 0288 lopen beide kanten over `doeldatum()`. Deze toets eist dat de
   *    aanvraagkant het meteen weigert, met een reden die de gebruiker iets zegt.
   */
  it(
    'weigert bij het indienen al wat de beslisser verlopen zou noemen',
    () => {
      const uit = psqlMetInvoer(`
begin;
do $$
declare
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_grp uuid := gen_random_uuid();
  v_g uuid; v_in jsonb;
begin
  insert into auth.users (id, email) values (v_a, v_a || '@zz.test'), (v_b, v_b || '@zz.test');
  update profiles set tz = '${OOST}' where id = v_a;
  update profiles set tz = '${OOST}' where id = v_b;
  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Proefgroep', v_a, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status)
    values (v_grp, v_a, 'admin', 'active'), (v_grp, v_b, 'member', 'active');
  insert into goals (owner_id, title, target_date)
    values (v_a, 'Doel', (now() at time zone '${OOST}')::date - 3) returning id into v_g;
  insert into goal_group_links (goal_id, group_id) values (v_g, v_grp);
  insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status)
    values (v_g, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(), v_grp, 'set');

  update profiles set tz = '${WEST}' where id = v_a;

  create temp table uit (regel text);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  v_in := public.vraag_deadline_verschuiving(v_g, v_grp, (now() at time zone '${WEST}')::date,
                                             'Ik had meer tijd nodig dan gedacht');
  insert into uit values ('indienen=' || coalesce(v_in ->> 'reason', v_in ->> 'ok'));
end $$;
select regel from uit;
rollback;`);

      expect(
        uit,
        'de aanvraagkant accepteert een verzoek dat de beslisser meteen verlopen noemt — ' +
          'de twee kanten van de naad meten aan verschillende klokken',
      ).toContain('indienen=datum_in_verleden');
    },
    TIMEOUT,
  );

  /**
   * ⚠️⚠️ **Welke strafstatussen meetellen, is een keuze en geen detail.**
   *    `doeldatum()` kijkt naar `set` en `due`. Een `cancelled` of `resolved`
   *    straf is afgehandeld en hoort de klok niet meer te bepalen — anders zou een
   *    geannuleerde afspraak nog meewegen in een poort die over een levende gaat.
   *
   * ⚠️ Deze toets vraagt het aan `doeldatum()` zelf en niet aan de brontekst: hij
   *    toetst het oordeel en niet de plek waar het toevallig staat.
   *
   * ⚠️⚠️ **Wat hij níet dekt:** een straf die ooit `unlocked` zou worden. 📏 Elke
   *    plek die die status zet draagt vandaag `and type = 'reward'` (0057, 0134,
   *    0238, 0280), dus dat kan niet — maar er is geen CHECK die het vasthoudt, en
   *    `max()` over nul rijen valt stil terug op de levende klok. Die grens staat
   *    als rij in `docs/ENGINEER-REVIEW.md`.
   */
  it(
    'telt een levende straf mee en een afgehandelde niet',
    () => {
      const uit = psqlMetInvoer(`
begin;
do $$
declare v_a uuid := gen_random_uuid(); v_grp uuid := gen_random_uuid(); v_g uuid;
begin
  insert into auth.users (id, email) values (v_a, v_a || '@zz.test');
  update profiles set tz = '${WEST}' where id = v_a;
  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Proefgroep', v_a, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status) values (v_grp, v_a, 'admin', 'active');
  insert into goals (owner_id, title, target_date)
    values (v_a, 'Doel', current_date + 30) returning id into v_g;
  create temp table uit (regel text);
  create temp table ids (naam text, id uuid);
  insert into ids values ('gebruiker', v_a), ('doel', v_g), ('groep', v_grp);

  -- een straf bevroren in het OOSTEN, terwijl het profiel in het WESTEN staat
  update profiles set tz = '${OOST}' where id = v_a;
  insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status)
    values (v_g, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(), v_grp, 'set');
  update profiles set tz = '${WEST}' where id = v_a;

  insert into uit select 'set: doeldatum=' ||
    (case when public.doeldatum(v_g, v_a) = (now() at time zone '${OOST}')::date
          then 'bevroren' else 'levend' end);

  update commitments set status = 'due' where goal_id = v_g;
  insert into uit select 'due: doeldatum=' ||
    (case when public.doeldatum(v_g, v_a) = (now() at time zone '${OOST}')::date
          then 'bevroren' else 'levend' end);

  update commitments set status = 'cancelled' where goal_id = v_g;
  insert into uit select 'cancelled: doeldatum=' ||
    (case when public.doeldatum(v_g, v_a) = (now() at time zone '${WEST}')::date
          then 'levend' else 'bevroren' end);
end $$;
select regel from uit;
rollback;`);

      expect(uit, 'een straf op `set` bepaalt de klok niet').toContain('set: doeldatum=bevroren');
      expect(uit, 'een straf op `due` bepaalt de klok niet').toContain('due: doeldatum=bevroren');
      expect(
        uit,
        'een geannuleerde straf bepaalt de klok nog steeds — een afgehandelde afspraak ' +
          'hoort niet mee te wegen',
      ).toContain('cancelled: doeldatum=levend');
    },
    TIMEOUT,
  );
});
