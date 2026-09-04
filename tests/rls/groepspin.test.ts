/**
 * De pin op `groups` — QS8-264.
 *
 * ⚠️ **De belofte is niet "de trigger staat er".** Die is: *een client kan
 *    `status`, `zichtbaarheid`, `ontdekbaar`, `invite_code`, `invite_revoked`,
 *    `last_activity_at`, `id`, `created_at` en `created_by` niet wijzigen* — ook
 *    niet met één verzoek buiten de UI om, en ook niet als er ooit per ongeluk
 *    een kolomrecht bij glipt.
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

import { psql, schemaHeeft, stackBeschikbaar } from './psql';

// ⚠️ De verbindingsgegevens staan in `./psql` en niet hier — zie de kop van dat
//    bestand: dit blok stond vier keer en was drie keer fout (QS8-270).

const beschikbaar = stackBeschikbaar(
  schemaHeeft("select count(*) from pg_proc where proname = 'guard_group_update'"),
);

/** Een vaste eigenaar-id, zodat `created_by` exact te asserteren is. */
const EIGENAAR = '00000000-0000-4000-8000-000000000264';

/**
 * Elke kolom die `guard_group_update()` vastpint, met een waarde die er
 * aantoonbaar anders uitziet dan wat de opstelling erin zet.
 *
 * ⚠️ **Alle negen, en niet vijf.** De eerste versie van dit bestand beloofde in
 *    zijn kop negen kolommen en toetste er vijf; `last_activity_at` viel tussen
 *    de lijst en de uitzonderingsnotitie door en werd door niets bewaakt.
 *    `id` en `created_at` staan er niet bij omdat een client ze niet kán
 *    aanwijzen zonder de rij kwijt te raken — die twee zijn de sleutel zelf.
 */
const GEPIND: readonly { kolom: string; nieuw: string; hoortTeBlijven: string }[] = [
  { kolom: 'status', nieuw: "'sleeping'", hoortTeBlijven: 'active' },
  { kolom: 'ontdekbaar', nieuw: 'true', hoortTeBlijven: 'false' },
  { kolom: 'zichtbaarheid', nieuw: "'open'", hoortTeBlijven: 'beschermd' },
  { kolom: 'invite_code', nieuw: "'GEKAAPT1'", hoortTeBlijven: 'PINCODE1' },
  { kolom: 'invite_revoked', nieuw: 'true', hoortTeBlijven: 'false' },
  { kolom: 'last_activity_at', nieuw: 'now()', hoortTeBlijven: '2020-01-01' },
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
function naClientUpdate(kolom: string, nieuw: string): { geraakt: number; waarde: string } {
  const uit = psql(`
    begin;
    create temp table t as select '${EIGENAAR}'::uuid eig, gen_random_uuid() grp;
    grant select on t to authenticated;
    insert into auth.users (id, email) select eig, 'pin@x.nl' from t;
    -- categorie staat er meteen in, want groups_ontdekbaar_heeft_categorie
    -- weigert een ontdekbare groep zonder categorie. Zonder die waarde wordt de
    -- test rood op een CHECK in plaats van op de pin.
    insert into groups (id, name, created_by, status, invite_code, categorie, last_activity_at)
      select grp, 'Pin', eig, 'active', 'PINCODE1', 'other', '2020-01-01' from t;
    insert into group_members (group_id, user_id, role, status)
      select grp, eig, 'admin', 'active' from t;

    -- Het recht dat hij vandaag niet heeft. Zonder deze regel toetst de test de
    -- grant en niet de pin.
    grant update (${kolom}) on groups to authenticated;

    select set_config('request.jwt.claims',
      json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;
    set local role authenticated;
    with u as (
      update groups set ${kolom} = ${nieuw} where id = (select grp from t) returning 1
    )
    select set_config('pin.geraakt', (select count(*)::text from u), true);
    reset role;

    select current_setting('pin.geraakt') || '|' || coalesce(${kolom}::text, 'NULL')
      from groups where id = (select grp from t);
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  const [geraakt, waarde] = uit.split('|');
  return { geraakt: Number(geraakt), waarde: waarde as string };
}

describe.skipIf(!beschikbaar)('de pin op groups houdt een client tegen', () => {
  for (const { kolom, nieuw, hoortTeBlijven } of GEPIND) {
    it(
      `${kolom} is niet door een client te wijzigen, ook niet mét het kolomrecht`,
      () => {
        const { geraakt, waarde } = naClientUpdate(kolom, nieuw);

        // ⚠️ Eerst: raakte de UPDATE überhaupt een rij? Zonder deze regel kan
        //    `groups_update` de test groen houden terwijl de pin kapot is.
        expect(
          geraakt,
          `${kolom}: de UPDATE raakte geen enkele rij, dus deze test bewijst ` +
            'niets over de pin — hij bewijst dat `groups_update` filterde',
        ).toBe(1);

        // ⚠️ `startsWith` en niet `toBe`, want `last_activity_at` komt terug als
        //    volledige tijdstempel terwijl alleen de dátum ertoe doet. Voor de
        //    andere zes is de verwachte waarde de hele waarde.
        expect(
          waarde.startsWith(hoortTeBlijven),
          `${kolom}: de trigger hoort dit terug te draaien — met alleen de ` +
            `kolomgrant als slot is dit één grendel en geen twee. Kreeg: ${waarde}`,
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
          select grp, 'Pin2', eig, 'active', 'PINCODE2' from t;
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
