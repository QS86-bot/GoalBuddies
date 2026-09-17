/**
 * De pin op `groups` — QS8-264.
 *
 * ⚠️ **De belofte is niet "de trigger staat er".** Die is: *een client kan
 *    `status`, `zichtbaarheid`, `ontdekbaar`, `invite_code`, `invite_revoked`,
 *    `last_activity_at`, `tz`, `id`, `created_at` en `created_by` niet wijzigen* —
 *    ook niet met één verzoek buiten de UI om, en ook niet als er ooit per
 *    ongeluk een kolomrecht bij glipt.
 *
 * ⚠️ **`tz` kwam er met QS8-355 bij, en die had wél een kolomrecht.** De andere
 *    kolommen hier zijn "wat als er ooit een grant bij glipt"; bij `tz` was dat
 *    geen hypothese. 📏 Eén PATCH van een beheerder zette de groepsklok op
 *    `Pacific/Kiritimati` en `groepsdatum()` sprong een dag vooruit — de
 *    weekgrens van élk lid. Migratie 0202 haalt het recht weg én zet de pin.
 *
 * ⚠️⚠️ **Waarom dit bestand bestaat: er waren twee grendels en er werkte er één.**
 *    `guard_group_update()` besliste op `current_user not in ('authenticated',
 *    'anon')` terwijl hij zélf `SECURITY DEFINER` was. Binnen een definer-functie
 *    is `current_user` de eigenaar, dus daar stond altijd `postgres` — de eerste
 *    regel nam élke keer de vroege uitgang en er werd nooit iets gepind.
 *
 *    Er lekte niets, want geen van die kolommen stond in de UPDATE-kolomgrant
 *    van `authenticated`. Maar dát was de enige grendel, terwijl 0019 de trigger
 *    er met zoveel woorden naast zette als tweede — *"die vangt ook het geval
 *    waarin iemand ooit per ongeluk `grant update on groups` uitvoert"* — en
 *    `scripts/zichtbaarheid-controle.mjs` en `tests/rls/ontdekken.test.ts`
 *    schrijven allebei op dat het er twee zijn.
 *
 *    **En dat is precies het geval dat deze suite naspeelt.** Elke test geeft
 *    `authenticated` tijdelijk het kolomrecht dat hij vandaag niet heeft, en
 *    kijkt of de trigger de wijziging alsnog terugdraait. Zonder die grant zou
 *    deze suite de grant toetsen en niet de pin — groen om de verkeerde reden,
 *    en dan bewaakt hij precies niets (CLAUDE.md regel 18, vraag 3).
 *
 * ⚠️ **Waarom psql en niet de harness.** Het kolomrecht tijdelijk toekennen is
 *    DDL, en dat is geen PostgREST-oppervlak. Alles draait in één transactie die
 *    aan het eind terugrolt, dus de grant overleeft de test niet. Dezelfde vorm
 *    als `avatarbucket.test.ts`.
 *
 * ⚠️ **Draait alleen tegen de lokale stack**, want daar is een supergebruiker.
 *    Zonder stack wordt deze suite overgeslagen — en dat is *ongemeten* en niet
 *    groen.
 */
import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';
import { proefCode } from './proefid';
import { proefId } from './proefid';


const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'guard_group_update'",
  import.meta.url,
);

/** Een vaste eigenaar-id, zodat `created_by` exact te asserteren is. */
const EIGENAAR = proefId(1);

/**
 * Elke kolom die `guard_group_update()` vastpint, met een waarde die er
 * aantoonbaar anders uitziet dan wat de opstelling erin zet.
 *
 * ⚠️ **Alle negen, en niet vijf.** De eerste versie van dit bestand beloofde in
 *    zijn kop negen kolommen en toetste er vijf; `last_activity_at` viel tussen
 *    de lijst en de uitzonderingsnotitie door en werd door niets bewaakt. En bij
 *    0208 gebeurde het opnieuw met `huddle_day`, zie de regel onderaan: een
 *    kolom die in dezelfde migratie gepind wordt, komt hier niet vanzelf bij.
 *    `id` en `created_at` staan er niet bij omdat een client ze niet kán
 *    aanwijzen zonder de rij kwijt te raken — die twee zijn de sleutel zelf.
 */
/**
 * ⚠️ **Uit `proefCode()` en niet hardgecodeerd — QS8-542.** De opzet hieronder
 *    schríjft `PIN_CODE` in `groups.invite_code`, en die kolom draagt een
 *    unieke index over de héle tabel. Twee gelijktijdige runs met dezelfde
 *    letterlijke waarde botsen daar deterministisch op — de vorm die QS8-348
 *    opruimde en die hier was blijven staan. `GEKAAPT_CODE` wordt nooit
 *    geschreven (de update hoort te falen), maar staat er voor de
 *    consistentie ook uit.
 */
const PIN_CODE = proefCode('pin', 1);
const GEKAAPT_CODE = proefCode('gekaapt', 1);

const GEPIND: readonly { kolom: string; nieuw: string; hoortTeBlijven: string }[] = [
  { kolom: 'status', nieuw: "'sleeping'", hoortTeBlijven: 'active' },
  { kolom: 'ontdekbaar', nieuw: 'true', hoortTeBlijven: 'false' },
  { kolom: 'zichtbaarheid', nieuw: "'open'", hoortTeBlijven: 'beschermd' },
  { kolom: 'invite_code', nieuw: `'${GEKAAPT_CODE}'`, hoortTeBlijven: PIN_CODE },
  { kolom: 'invite_revoked', nieuw: 'true', hoortTeBlijven: 'false' },
  { kolom: 'last_activity_at', nieuw: 'now()', hoortTeBlijven: '2020-01-01' },
  // ⚠️ **De groepsklok, sinds QS8-355 (0202).** `groups.tz` is de tweede klok van
  //    domeinregel 1 — `currentGroupPeriod()` leest hem, en dus hangen de
  //    huddledag, de weekafsluiting en De Ketting eraan, voor élk lid. Hij stond
  //    hier niet bij, en hij had wél een kolomrecht: 📏 één PATCH van een
  //    beheerder zette hem op `Pacific/Kiritimati` en `groepsdatum()` sprong een
  //    dag vooruit. Sinds 0202 is het recht weg én pint de trigger hem.
  { kolom: 'tz', nieuw: "'Pacific/Kiritimati'", hoortTeBlijven: 'Europe/Amsterdam' },
  // ⚠️⚠️ **De huddledag, sinds QS8-360 (0208), en hij kwam er bijna niet bij.**
  //    Hij bepaalt waar de groepsperiode begint. Tot 0208 had hij een kolomrecht
  //    en géén pin; sinds 0208 is het recht ingetrokken én pint de trigger hem.
  //
  //    📏 Gevonden door de security-review op die branch, en zelf nagemeten: met
  //    `new.huddle_day := old.huddle_day` uit de gedeployde trigger gehaald bleef
  //    de hele suite groen — 118 bestanden, 1332 tests. Het tweede slot was
  //    alleen mét de kolomgrant erbij geijkt, met de hand, en dat is een grendel
  //    die nooit rood is geweest. Precies de reden dat dít bestand bestaat.
  { kolom: 'huddle_day', nieuw: '3', hoortTeBlijven: '0' },
  // ⚠️ De tak van 0060 liet `not-null → null` door, en dat is precies wat een
  //    beheerder wil om zijn eigen oprichterschap te wissen. Sinds 0149 pint de
  //    regel onvoorwaardelijk; het verwijderen van een account loopt niet langs
  //    deze tak (gemeten: de RI-actie draait als `postgres`).
  { kolom: 'created_by', nieuw: 'null', hoortTeBlijven: EIGENAAR },
];

/**
 * Bouwt een groep, geeft `authenticated` tijdelijk het kolomrecht, laat hem de
 * update doen en geeft `<aantal geraakte rijen>|<waarde na afloop>` terug.
 * Rolt alles terug.
 *
 * ⚠️⚠️ **Het aantal geraakte rijen staat er sinds de security-review bij, en
 *    zonder dat getal bewaakte deze suite de verkeerde grendel.** `groups_update`
 *    heeft `using is_group_admin(id)`. Raakt de UPDATE nul rijen — omdat de
 *    gebruiker geen beheerder is, of omdat die policy ooit verandert — dan komt
 *    er geen fout, blijft de kolom op zijn oude waarde staan en is de test
 *    groen, óók met de pin volledig kapot. Gemeten: dezelfde opstelling met
 *    `role = 'member'` en `security definer` teruggezet gaf `active`, dus groen.
 *
 *    **Dat is exact de fout die deze commit in `ontdekken.test.ts` aanwijst**,
 *    één niveau dieper: twee sloten in één assertie. Nu moet de rij geraakt zijn
 *    én de waarde ongewijzigd, en dat kan alleen de pin.
 */
function naClientUpdate(
  kolom: string,
  nieuw: string,
): { uitslag: string; waarde: string; controle: number } {
  const uit = psql(`
    begin;
    create temp table t as select '${EIGENAAR}'::uuid eig, gen_random_uuid() grp;
    grant select on t to authenticated;
    insert into auth.users (id, email) select eig, 'pin@x.nl' from t;
    -- categorie staat er meteen in, want groups_ontdekbaar_heeft_categorie
    -- weigert een ontdekbare groep zonder categorie. Zonder die waarde wordt de
    -- test rood op een CHECK in plaats van op de pin.
    insert into groups (id, name, created_by, status, invite_code, categorie, last_activity_at, tz)
      select grp, 'Pin', eig, 'active', '${PIN_CODE}', 'other', '2020-01-01', 'Europe/Amsterdam' from t;
    insert into group_members (group_id, user_id, role, status)
      select grp, eig, 'admin', 'active' from t;

    -- Het recht dat hij vandaag niet heeft. Zonder deze regel toetst de test de
    -- grant en niet de pin.
    grant update (${kolom}) on groups to authenticated;
    -- De controlekolom: eentje die hij wél mag zetten, met hetzelfde slot
    -- eromheen. Zie de kop van deze functie.
    grant update (name) on groups to authenticated;

    select set_config('request.jwt.claims',
      json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;

    do $pin$
    declare v_grp uuid := (select grp from t); n int;
    begin
      set local role authenticated;
      begin
        update groups set ${kolom} = ${nieuw} where id = v_grp;
        perform set_config('pin.uitslag', 'GELUKT', true);
      exception when others then
        perform set_config('pin.uitslag', 'GEWEIGERD ' || sqlstate, true);
      end;
      with u as (update groups set name = 'Controle' where id = v_grp returning 1)
      select count(*) into n from u;
      perform set_config('pin.controle', n::text, true);
      reset role;
    end
    $pin$;

    select current_setting('pin.uitslag') || '|' || coalesce(${kolom}::text, 'NULL')
        || '|' || current_setting('pin.controle')
      from groups where id = (select grp from t);
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  const [uitslag, waarde, controle] = uit.split('|');
  return { uitslag: uitslag as string, waarde: waarde as string, controle: Number(controle) };
}

/**
 * ⚠️⚠️ **Sinds 0265 (QS8-488) is de belofte van dit bestand veranderd, en de
 *    oude toetsvorm kón niet meeverhuizen.** Tot dan zette `guard_group_update()`
 *    de kolom stilzwijgend terug, en deze suite bewees dat met *"de UPDATE raakte
 *    één rij én de waarde is onveranderd"*. Die rijteller bestaat niet meer: een
 *    trigger die wérpt, raakt geen rijen.
 *
 *    De vervanger is een **controlekolom**. Elke opstelling geeft `authenticated`
 *    óók `update (name)` en doet daar dezelfde UPDATE mee; raakt díé geen rij,
 *    dan filterde `groups_update` en bewijst de test niets over de pin. Dat is
 *    dezelfde bewaking als de rijteller, op een kolom die nog wél mag landen.
 *
 * IJKING — met de hand, 14-09-2026, op de draaiende database:
 *
 *   C  `guard_group_update()` terug naar `new.status := old.status`
 *      -> 1 rood hier: "status is niet door een client te wijzigen"
 */
describe.skipIf(!beschikbaar)('de pin op groups houdt een client tegen', () => {
  for (const { kolom, nieuw, hoortTeBlijven } of GEPIND) {
    it(
      `${kolom} is niet door een client te wijzigen, ook niet mét het kolomrecht`,
      () => {
        const { uitslag, waarde, controle } = naClientUpdate(kolom, nieuw);

        // ⚠️ Eerst de controlemeting: mocht deze gebruiker überhaupt iets
        //    wijzigen? Zonder deze regel kan `groups_update` de test groen
        //    houden terwijl de pin kapot is — dat is wat de rijteller hier
        //    vroeger deed, en die kan niet meer bestaan nu de pin wérpt.
        expect(
          controle,
          `${kolom}: de UPDATE op de controlekolom raakte geen enkele rij, dus ` +
            'deze test bewijst niets over de pin — hij bewijst dat ' +
            '`groups_update` filterde',
        ).toBe(1);

        // ⚠️⚠️ **Sinds 0265 is de belofte hoorbaar, en dat is de hele reparatie.**
        //    Tot dan zette de trigger de kolom stilzwijgend terug en kreeg de
        //    aanroeper `200 OK` met de oude waarde — geweigerd, en dat niet
        //    gezegd. Deze assertie eist de fout; de volgende eist dat de waarde
        //    ook echt niet verschoven is. Allebei, want een trigger die werpt
        //    nádat hij geschreven heeft, haalt de eerste moeiteloos.
        expect(
          uitslag,
          `${kolom}: de client kreeg succes te horen. Dat is de stille ` +
            'terugzetting van QS8-314/QS8-326, hier op `groups` — zie 0265.',
        ).toBe('GEWEIGERD 23514');

        // ⚠️ `startsWith` en niet `toBe`, want `last_activity_at` komt terug als
        //    volledige tijdstempel terwijl alleen de dátum ertoe doet. Voor de
        //    andere zes is de verwachte waarde de hele waarde.
        expect(
          waarde.startsWith(hoortTeBlijven),
          `${kolom}: geweigerd, maar de waarde veranderde alsnog. Kreeg: ${waarde}`,
        ).toBe(true);
      },
      30_000,
    );
  }

  /**
   * ⚠️ **De must-allow-helft, en die weegt hier even zwaar.** De pin mag de
   *    legitieme route niet dichtzetten: `archiveer_groep()` en
   *    `zet_groepszichtbaarheid()` zijn definer-functies die deze kolommen juist
   *    wél horen te veranderen, na hun eigen toetsing. Zou de reparatie ook die
   *    tegenhouden, dan kan niemand meer een groep archiveren.
   */
  it(
    'een definer-functie mag deze kolommen nog wél veranderen',
    () => {
      const uit = psql(`
        begin;
        create temp table t as select gen_random_uuid() eig, gen_random_uuid() grp;
        grant select on t to authenticated;
        insert into auth.users (id, email) select eig, 'pin2@x.nl' from t;
        insert into groups (id, name, created_by, status, invite_code)
          select grp, 'Pin2', eig, 'active', '${proefCode('pincode2', 1)}' from t;
        insert into group_members (group_id, user_id, role, status)
          select grp, eig, 'admin', 'active' from t;

        select set_config('request.jwt.claims',
          json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;
        set local role authenticated;
        select archiveer_groep(grp, true) from t;
        reset role;

        select status from groups where id = (select grp from t);
        rollback;
      `)
        .split('\n')
        .filter((r) => r.trim() !== '')
        .at(-1) as string;

      expect(uit, 'archiveer_groep() hoort de status wél te mogen zetten').toBe('archived');
    },
    30_000,
  );
});

/**
 * QS8-488 / 0265 — de drie kolommen die vóór de rolfilter staan.
 *
 * ⚠️⚠️ **Dit is de énige echt níeuwe grens van 0265, en hij had geen test.**
 *    `id`, `created_at` en `created_by` stonden tot 0208 ná de vroege uitgang
 *    `current_user not in ('authenticated','anon')` en waren dus alleen voor een
 *    client gepind. Sinds 0265 staan ze ervóór en gelden ze voor **elke** rol —
 *    `service_role`, `postgres`, elke definer-functie.
 *
 *    De suite hierboven toetst alleen `authenticated`, en 📏 geen enkel bestand
 *    in `tests/rls/` combineerde `service_role` met `groups`. Een grendel die
 *    nooit rood is geweest, bewaakt niets.
 *
 * ⚠️ **`created_by` draagt een andere vorm dan de andere twee, en met reden.**
 *    Hij mag wél op `null` gezet worden zodra het profiel verdwenen is — dat is
 *    de referentiële actie van `groups_created_by_fkey` (`on delete set null`),
 *    en die moet erlangs. De bestaanstoets van `bewaak_begunstigde()` maakt dat
 *    verschil zonder aan een rolnaam te hangen: 📏 als de oprichter nog bestaat
 *    geeft het leegtrekken `23514`, en ná `delete from profiles` wordt de kolom
 *    gewoon `NULL`.
 */
describe.skipIf(!beschikbaar)('0265 — id, created_at en created_by gelden voor elke rol', () => {
  /** Doet `sql` als tabeleigenaar — dus langs de vroege uitgang heen. */
  function alsEigenaar(sql: string): string {
    return psql(`
      begin;
      create temp table e as select gen_random_uuid() eig, gen_random_uuid() grp;
      insert into auth.users (id, email) select eig, 'rol264@x.nl' from e;
      insert into profiles (id, display_name) select eig, 'Oprichter' from e
        on conflict (id) do nothing;
      insert into groups (id, name, created_by, status, invite_code, tz)
        select grp, 'Rol264', eig, 'active', '${proefCode('rol26400', 2)}', 'Europe/Amsterdam' from e;

      do $rol$
      declare g uuid := (select grp from e); u uuid := (select eig from e);
      begin
        ${sql}
      end
      $rol$;

      select current_setting('rol.uitslag');
      rollback;
    `)
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== '')
      .at(-1) as string;
  }

  // ⚠️⚠️ **`created_at` krijgt een vaste datum en niet `now()`, en dat is een
  //    gemeten les.** De eerste versie gebruikte `now()`; binnen één transactie
  //    is dat exact de waarde die de `insert` er drie regels hoger in zette, dus
  //    `is distinct from` was onwaar en de UPDATE werd **toegelaten** — een
  //    groene mutatie die niets muteerde. Zelfde klasse als de ijkingen die in
  //    QS8-480 en QS8-485 hun eigen indicator niet lazen.
  it.each([
    ['created_at', "update groups set created_at = timestamptz '2001-01-01' where id = g;"],
    ['id', 'update groups set id = gen_random_uuid() where id = g;'],
  ])('%s ligt vast, ook voor de rol die geen client is', (_kolom, mutatie) => {
    const uit = alsEigenaar(`
      begin
        ${mutatie}
        perform set_config('rol.uitslag', 'TOEGELATEN', true);
      exception when others then
        perform set_config('rol.uitslag', 'GEWEIGERD ' || sqlstate, true);
      end;
    `);

    expect(
      uit,
      'Deze toets staat vóór `current_user not in (...)` en hoort dus ook voor ' +
        'een definer-functie te gelden — de vorm van QS8-314.',
    ).toBe('GEWEIGERD 23514');
  }, 30_000);

  it(
    'de oprichter is niet leeg te trekken zolang hij bestaat, ook niet als eigenaar',
    () => {
      const uit = alsEigenaar(`
        begin
          update groups set created_by = null where id = g;
          perform set_config('rol.uitslag', 'TOEGELATEN', true);
        exception when others then
          perform set_config('rol.uitslag', 'GEWEIGERD ' || sqlstate, true);
        end;
      `);

      expect(uit).toBe('GEWEIGERD 23514');
    },
    30_000,
  );

  it(
    'MUST-ALLOW: de referentiële actie zet hem wél op null zodra het profiel weg is',
    () => {
      // ⚠️ Zonder deze helft is de toets hierboven een grendel die het wisrecht
      //    breekt — precies wat de eerste versie van 0265 deed toen de toets nog
      //    kaal was. 📏 Geijkt: twee rode tests in `opruiming.test.ts`.
      const uit = alsEigenaar(`
        begin
          delete from profiles where id = u;
          perform set_config('rol.uitslag',
            coalesce((select created_by::text from groups where id = g), 'NULL'), true);
        exception when others then
          perform set_config('rol.uitslag', 'STUK ' || sqlstate, true);
        end;
      `);

      expect(uit, 'de on delete set null moet erlangs komen').toBe('NULL');
    },
    30_000,
  );
});
