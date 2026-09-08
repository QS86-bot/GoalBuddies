import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een account is te verwijderen, hoe oud zijn rijen ook zijn — QS8-359,
 * migratie 0203.
 *
 * ⚠️ **De belofte is niet "de trigger heeft een vroege uitgang".** Dat is een
 *    eigenschap van het onderdeel. De belofte is: *een gebruiker kan zijn account
 *    verwijderen*, en dat is een AVG-verplichting. Daarom staat hier één test die
 *    de échte RPC aanroept met een gebruiker die overal rijen heeft, en niet een
 *    rijtje toetsen op losse triggers.
 *
 * ⚠️⚠️ **Wat er misging, en waarom geen enkele bestaande test het zag.** Een
 *    `on delete set null` is geen verwijdering maar een **UPDATE**
 *    (`UPDATE ONLY week_reviews SET user_id = NULL`), en die vuurt een
 *    BEFORE-trigger opnieuw af — op een rij die jaren oud kan zijn. 📏 Gemeten
 *    met een weekafsluiting van 65 dagen:
 *
 *      select verwijder_mijn_account()
 *      ERROR: group_period_start 2026-07-05 ligt buiten het toegestane venster
 *
 *    Er zijn groene tests op `verwijder_mijn_account()` (`besluiten.test.ts:1255`
 *    en `:1276`) en ze zijn groen omdat ze gebruikers verwijderen die seconden
 *    oud zijn. **Geen enkele test in dit project laat een rij verouderen** — dat
 *    is de blinde vlek, en ze staat als dossierrij van 08-09-2026.
 *
 * ⚠️ **Daarom veegt deze test in plaats van te wijzen**: de opstelling zet rijen
 *    neer in alles wat bij een accountverwijdering meegaat, en roept dan de échte
 *    RPC aan.
 *
 * ⚠️⚠️ **De dekking hieronder is gemeten en niet afgeleid, want de eerste versie
 *    klopte niet.** Die noemde zes tabellen op grond van "doelwit van een
 *    `set null`-FK én een BEFORE UPDATE-rijtrigger". 📏 De security-review heeft
 *    elke triggerfunctie om beurten vergiftigd en geteld welke er tijdens
 *    `verwijder_mijn_account()` daadwerkelijk vuren — **7 van de 62**:
 *
 *      archief_blijft_archief      bewaak_week_review_periode  <- het gemeten geval
 *      guard_group_update          noteer_beoordelaar_weg_lid
 *      noteer_ontkoppeling         recalc_goal_max_points
 *      stamp_chat_message
 *
 *    Drie van de zes uit die eerste lijst vuren dus **niet**, en kúnnen dat ook
 *    niet voor de vertrekkende gebruiker: `fill_approval_subject` vuurt pas als de
 *    **beoordelaar** vertrekt (`subject_id` is CASCADE, alleen `approver_id` is
 *    set-null), `bewaak_begunstigde` pas als de **getuige** vertrekt, en
 *    `beoordeelbaar_blijft_staan` alleen als een mijlpaal sterft terwijl het
 *    weekdoel blijft — bij een accountverwijdering cascaderen die samen.
 *    `bewaak_tijdzone` stond er helemaal ten onrechte in: die trigger is
 *    `BEFORE INSERT OR UPDATE **OF tz**` en kan op een `created_by`-set-null niet
 *    afgaan.
 *
 *    Het criterium was bovendien te smal: een `AFTER`-trigger breekt een
 *    verwijdering even hard als een `BEFORE`. Drie die wél vuren
 *    (`recalc_goal_max_points`, `noteer_ontkoppeling`,
 *    `noteer_beoordelaar_weg_lid`) zijn `AFTER DELETE` en vielen buiten de lijst.
 *    Ze doen vandaag alleen `update goals`, dus geen van drieën kan werpen — maar
 *    ze zaten wel in de blast radius.
 *
 *    De **beoordelaar** vertrekt hieronder in een eigen geval. De getuige zit in
 *    QS8-361 en staat daarom buiten deze veeg.
 *
 * ⚠️⚠️ **`commitments` staat er met opzet níet in, en dat is geen gemak.** 📏 De
 *    veeg vond daar meteen een tweede breuk, met een ándere oorzaak: een
 *    gebruiker met een goedgekeurde voltooiing én een bevestigde straf krijgt
 *    `commitment_events_commitment_id_fkey` — een auditrij die geschreven wordt
 *    voor een commitment dat dezelfde cascade al weggehaald heeft. Dat is een
 *    andere belofte (*een auditspoor overleeft zijn onderwerp niet*), raakt
 *    domeinregel 5, en staat als QS8-361 in Linear. Hem hier
 *    meenemen zou deze test rood houden op iets dat 0203 niet repareert.
 *
 * ⚠️ **Waarom psql en niet de harness.** De rij moet écht oud zijn, en met de
 *    trigger aan is zo'n rij niet te maken — dat is meteen het bewijs dat een
 *    geldige rij vanzelf ongeldig wordt. Even uitzetten is DDL, en dat is geen
 *    PostgREST-oppervlak. Alles draait in één transactie die terugrolt.
 *
 * IJKING — met de hand gedraaid op 08-09-2026:
 *
 *   A  de vroege uitgang uit `bewaak_week_review_periode()` halen
 *      → 1 rood: 'een account met een verouderde weekafsluiting gaat weg'
 *   B  de uitgang verruimen tot alleen de periode en de groep (de eerste versie)
 *      → 1 rood: 'een oude weekafsluiting is niet meer te herschrijven'
 *   C  dezelfde mutatie als A, maar met een vérse weekafsluiting
 *      → groen, en dát is de reden dat de leeftijd hier een parameter is en geen
 *        detail: een verse rij loopt door de vensterttoets heen zonder iets te
 *        bewijzen. Precies de val die het issue noemt.
 *
 * ⚠️⚠️ **Bij het ijken bleek de must-allow eerst niets waard.** De periodestart
 *    stond op `date_trunc('week', …) + 6 dagen`, en dat is voor `dagenOud = 0`
 *    de kómende zondag — 2026-09-13 op een dag dat het 2026-09-08 was. Die rij
 *    lag dus buiten het venster aan de **toekomstkant**, en overleefde alleen
 *    dankzij de vroege uitgang. Mutatie A maakte daardoor béide tests rood, en
 *    dat verschil is het hele punt van deze ijking: een must-allow die met de
 *    grendel meesterft, toetst de grendel en niet de must-allow. Nu
 *    `- 1 dag`, wat de zondag vóór vandaag geeft.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'bewaak_week_review_periode'",
  import.meta.url,
);

/** Ruim voorbij het venster van 35 dagen uit `bewaak_week_review_periode()`. */
const DAGEN_OUD = 69;

/**
 * Bouwt een gebruiker met een rij in elke tabel uit de veeg, verwijdert zijn
 * account met de échte RPC, en geeft terug wat die RPC zei. Rolt alles terug.
 */
function verwijderNaOpbouw(dagenOud: number): string {
  return psql(`
    begin;
    create temp table o (uid uuid, buddy uuid, gid uuid, goal uuid, wg uuid, comp uuid);
    grant select, insert, update on o to authenticated;
    insert into o (uid, buddy) values (
      shim_maak_gebruiker('opruiming@proef.test', 'Opruiming'),
      shim_maak_gebruiker('opruiming-buddy@proef.test', 'Buddy'));

    select set_config('request.jwt.claims',
      json_build_object('sub', (select uid from o), 'role', 'authenticated')::text, true);
    set local role authenticated;
    update o set gid = ((create_group('Opruimgroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
    insert into goals (owner_id, title, target_date)
      select uid, 'Opruimdoel', current_date + 90 from o;
    update o set goal = (select id from goals where owner_id = (select uid from o) limit 1);
    reset role;

    -- ⚠️ De weekafsluiting moet écht oud zijn, en met de trigger aan kan dat
    --    niet — dat is meteen het bewijs dat een geldige rij vanzelf ongeldig
    --    wordt. Even uitzetten is DDL en draait binnen dezelfde transactie.
    alter table week_reviews disable trigger week_reviews_periode_grens;
    insert into week_reviews (group_id, user_id, group_period_start, did_text)
      select gid, uid,
             (date_trunc('week', current_date - ${dagenOud}) - interval '1 day')::date, 'oud'
      from o;
    alter table week_reviews enable trigger week_reviews_periode_grens;

    insert into chat_messages (group_id, sender_id, body) select gid, uid, 'hallo' from o;
    insert into weekly_goals (goal_id, title, cycle_start_date)
      select goal, 'Opruimweek', date_trunc('week', current_date)::date from o;
    update o set wg = (select id from weekly_goals where goal_id = (select goal from o) limit 1);
    insert into completions (weekly_goal_id, user_id, achieved_level, note)
      select wg, uid, 'ceiling', 'af' from o;
    update o set comp = (select id from completions where weekly_goal_id = (select wg from o) limit 1);
    insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
      select comp, buddy, uid, gid, 'approved' from o;

    select set_config('request.jwt.claims',
      json_build_object('sub', (select uid from o), 'role', 'authenticated')::text, true);
    set local role authenticated;
    select verwijder_mijn_account()::text;
    rollback;
  `)
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .at(-1) as string;
}

/**
 * Zet een weekafsluiting van 69 dagen oud neer en laat de eigenaar hem
 * herschrijven. Geeft de foutcode terug, of 'GELUKT' als het gelukt is.
 */
function herschrijfOudeAfsluiting(): string {
  return psql(`
    begin;
    create temp table v (uid uuid, gid uuid);
    create temp table uitslag (code text);
    grant select, insert, update on v to authenticated;
    grant insert, select on uitslag to authenticated;
    insert into v (uid) values (shim_maak_gebruiker('opruiming-vries@proef.test', 'Vries'));
    select set_config('request.jwt.claims',
      json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);
    set local role authenticated;
    update v set gid = ((create_group('Vriesgroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
    reset role;

    alter table week_reviews disable trigger week_reviews_periode_grens;
    insert into week_reviews (group_id, user_id, group_period_start, did_text)
      select gid, uid, (date_trunc('week', current_date - ${DAGEN_OUD}) - interval '1 day')::date,
             'oorspronkelijk'
      from v;
    alter table week_reviews enable trigger week_reviews_periode_grens;

    select set_config('request.jwt.claims',
      json_build_object('sub', (select uid from v), 'role', 'authenticated')::text, true);
    set local role authenticated;
    -- ⚠️ De uitslag via een temp-tabel en niet via raise notice: een notice gaat
    --    naar stderr en de psql-helper leest alleen stdout — die test was groen
    --    noch rood maar leeg.
    do $$
    begin
      update week_reviews set did_text = 'HERSCHREVEN'
       where user_id = (select uid from v);
      insert into uitslag values ('GELUKT');
    exception when others then
      insert into uitslag values (sqlstate);
    end $$;
    reset role;
    select code from uitslag;
    rollback;
  `);
}

describe.skipIf(!beschikbaar)('een account is te verwijderen, hoe oud zijn rijen ook zijn', () => {
  it('een account met een verouderde weekafsluiting gaat weg', () => {
    // ⚠️ De assertie zit op wat de RPC teruggeeft en niet op "er kwam geen fout":
    //    `verwijder_mijn_account()` heeft een JSON-envelop, en een `ok: false`
    //    met een reden is óók een mislukking. Zonder deze regel zou een RPC die
    //    netjes `{"ok": false}` teruggeeft deze test groen laten.
    expect(
      verwijderNaOpbouw(DAGEN_OUD),
      `een weekafsluiting van ${DAGEN_OUD} dagen oud blokkeerde de verwijdering`,
    ).toContain('"ok": true');
  }, 120_000);

  it('een oude weekafsluiting is niet meer te herschrijven', () => {
    // ⚠️⚠️ **Dit slot verdween bijna stilzwijgend met deze reparatie.** De eerste
    //    versie van de vroege uitgang eiste alleen dat de periode en de groep
    //    gelijk bleven — en liet daarmee een UPDATE van de tékst door op een rij
    //    die het venster eerder weigerde. 📏 Gemeten: de eigenaar herschreef zijn
    //    weekafsluiting van 69 dagen oud. In een accountability-app is dat de rij
    //    waar zijn buddies onder gereageerd hebben.
    //
    //    Niemand had dat slot bewust opengezet, en niets werd er rood van. Dat is
    //    precies de vorm die dit project duur betaalt, dus staat hij hier nu.
    //    Gevonden in de security-review van 08-09-2026.
    expect(
      herschrijfOudeAfsluiting()
        .split('\n')
        .map((r) => r.trim())
        .filter((r) => r !== '')
        .at(-1),
      'de tekst van een weekafsluiting van 69 dagen oud was te wijzigen',
    ).toContain('22007');
  }, 120_000);

  it('MUST-ALLOW: een verse weekafsluiting blokkeert hem ook niet', () => {
    // De keerzijde. Zonder deze helft zou een grendel die álles weigert ook
    // groen zijn zodra de test alleen naar de oude rij keek.
    expect(verwijderNaOpbouw(0)).toContain('"ok": true');
  }, 120_000);
});
