import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een account is te verwijderen, hoe oud zijn rijen ook zijn — QS8-359,
 * migratie 0205.
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
 *    ⚠️⚠️ **Sinds QS8-371 zijn het er acht, en dat is deze veeg zelf.** De
 *    vertrekker is er nu ook intrekker, dus ook **beoordelaar** — en daarmee
 *    vuurt `fill_approval_subject` wél. 📏 Nagemeten: `completion_approvals
 *    _subject` is `BEFORE INSERT OR UPDATE`, en de `set null` op `approver_id` is
 *    een UPDATE. De alinea hieronder zei het omgekeerde en klopte tot die rol
 *    erbij kwam; hij blijft staan omdat de rédenering nog geldt voor de twee
 *    andere gevallen.
 *
 *    Twee van de zes uit die eerste lijst vuren dus **niet**, en kúnnen dat ook
 *    niet voor de vertrekkende gebruiker: `bewaak_begunstigde` vuurt pas als de
 *    **getuige** vertrekt, en
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
 *    meenemen zou deze test rood houden op iets dat 0205 niet repareert.
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
    create temp table o (uid uuid, buddy uuid, gid uuid, goal uuid, wg uuid, comp uuid,
                        buddy_goal uuid, buddy_wg uuid, buddy_comp uuid, buddy_appr uuid);
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

    -- ⚠️⚠️ **De vertrekker is óók intrekker, en dat ontbrak hier** (QS8-371).
    --    De veeg hierboven laat hem overal rijen achterlaten als *onderwerp* van
    --    een goedkeuring, en nooit als degene die er een introk. Precies die rol
    --    hield zijn profiel vast: approval_withdrawals.approver_id stond op
    --    NO ACTION. 📏 Zonder deze vier statements is deze test groen met de
    --    kapotte foreign key erin.
    insert into goals (owner_id, title, target_date)
      select buddy, 'Buddydoel', current_date + 90 from o;
    update o set buddy_goal = (select id from goals where owner_id = (select buddy from o) limit 1);
    insert into weekly_goals (goal_id, title, cycle_start_date)
      select buddy_goal, 'Buddyweek', date_trunc('week', current_date)::date from o;
    update o set buddy_wg =
      (select id from weekly_goals where goal_id = (select buddy_goal from o) limit 1);
    insert into completions (weekly_goal_id, user_id, achieved_level, note)
      select buddy_wg, buddy, 'ceiling', 'af' from o;
    update o set buddy_comp =
      (select id from completions where weekly_goal_id = (select buddy_wg from o) limit 1);
    insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
      select buddy_comp, uid, buddy, gid, 'approved' from o;
    update o set buddy_appr =
      (select id from completion_approvals where completion_id = (select buddy_comp from o) limit 1);

    select set_config('request.jwt.claims',
      json_build_object('sub', (select uid from o), 'role', 'authenticated')::text, true);
    set local role authenticated;
    select trek_goedkeuring_in((select buddy_appr from o));
    reset role;

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

/**
 * De vraag die beide tests hieronder stellen, één keer opgeschreven.
 *
 * ⚠️⚠️ **Hij stond eerst twee keer, en toen bewaakte de MUST-FIND een kopie.**
 *    📏 Gemeten in de security-ronde op QS8-371: knip de `n`/`d`-tak uit de
 *    query van de eerste test en alle vijf de tests blijven groen — inclusief de
 *    MUST-FIND die volgens drie documenten juist dáárvoor bestond. Dat is
 *    letterlijk *"breek de grendel die de ijking nóemt, anders is de ijking zelf
 *    de aanname"* uit `CLAUDE.md`. Eén constante, twee aanroepers.
 *
 * **Wat de query zoekt:** een foreign key die een accountverwijdering tegenhoudt.
 *
 * ⚠️ **Het bereik is transitief en niet alleen `profiles`.**
 *    `verwijder_mijn_account()` doet `delete from auth.users`; daaruit cascadeert
 *    `profiles`, daaruit `completions`, en zo verder. Een blokkerende verwijzing
 *    naar élke tabel in dat bereik houdt de verwijdering even hard tegen. 📏 De
 *    recursieve stap komt op 33 tabellen, en hij vindt er precies één geval mee
 *    dat een toets op alleen `profiles` niet ziet — zie `TOEGESTAAN`.
 *
 * ⚠️ **`set null` op een `not null`-kolom telt niet als opgelost.** Postgres
 *    schrijft dan een `null` die de kolom weigert, en de verwijdering strandt net
 *    zo hard als bij NO ACTION, alleen met een andere foutcode.
 *
 * ⚠️ **`set default` wordt hier afgekeurd, ook op een nullable kolom.** Die
 *    schrijft de kolomdefault, en is dat een literale uuid of een profiel dat er
 *    niet meer is, dan faalt de foreign key alsnog. 📏 Vandaag staan er nul in het
 *    schema (23 cascade, 16 set null), dus dit kost niets — en zo blijft de tak
 *    een toets in plaats van een belofte.
 */
const BLOKKERENDE_VERWIJZINGEN_SQL = `
  with recursive bereik as (
    select 'public.profiles'::regclass as rel
    union
    select 'auth.users'::regclass
    union
    select c.conrelid
      from pg_constraint c
      join bereik b on c.confrelid = b.rel
     where c.contype = 'f' and c.confdeltype = 'c'
  )
  select coalesce(string_agg(t.regel, ' / ' order by t.regel), '')
  from (
    select c.conrelid::regclass::text || '.' || c.conname ||
           ' (delete=' || c.confdeltype::text || ')' as regel
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid in (select rel from bereik)
       and (
         -- NO ACTION en RESTRICT blokkeren altijd; set default keuren we af.
         c.confdeltype not in ('c', 'n')
         -- set null op een kolom die geen null verdraagt ook.
         or (c.confdeltype = 'n' and exists (
               select 1
                 from unnest(c.conkey) k
                 join pg_attribute a
                   on a.attrelid = c.conrelid and a.attnum = k
                where a.attnotnull
             ))
       )
  ) t
`;

/** De laatste regel van een psql-uitvoer, ontdaan van lege regels. */
function laatsteRegel(uit: string): string {
  return (
    uit
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== '')
      .at(-1) ?? ''
  );
}

/**
 * Geen enkele **foreign key** houdt een vertrekkende gebruiker vast — QS8-371,
 * migratie 0212.
 *
 * ⚠️ **De naam noemt met opzet "foreign key" en niet "niets".** Deze describe
 *    dekt één klasse: de referentiële actie van een verwijzing. Een trigger die
 *    werpt tijdens de opruiming blokkeert net zo goed, en dáár staat vandaag een
 *    bekend geval open — QS8-361/QS8-333, `commitments` met drie triggers, met
 *    opzet buiten de veeg hierboven gehouden (zie regels 64-71). Er is dus
 *    vandaag een gebruiker die zijn account niet kan verwijderen. Groen hier is
 *    bewijs voor de FK-klasse en voor niets anders; een bredere naam zou dat
 *    verschil wegpoetsen.
 *
 * ⚠️⚠️ **Dit is de helft die de veeg hierboven niet kan geven.** Die toetst de
 *    belofte voor de tabellen die de opstelling toevallig aanraakt. 📏 Gemeten:
 *    12 van de 39 persoonskolommen krijgen een rij; 27 blijven leeg.
 *    `approval_withdrawals` zat er niet bij, en dáárom stond die veeg groen
 *    terwijl de belofte kapot was. Voeg morgen een tabel toe met
 *    `references profiles (id)` zonder `on delete`, en dezelfde veeg blijft
 *    opnieuw groen. Deze toets niet.
 */
describe.skipIf(!beschikbaar)('geen foreign key houdt een vertrekkende gebruiker vast', () => {
  /**
   * Verwijzingen die met opzet mogen blijven staan, met de meting erbij.
   *
   * ⚠️ Een uitzondering is hier duurder dan elders: hij kan betekenen dat één
   *    gebruiker zijn account niet kan verwijderen, en dat is een AVG-verplichting
   *    (art. 17) en geen smaakkwestie. Vandaar de reden per regel.
   */
  const TOEGESTAAN: readonly { readonly fk: string; readonly waarom: string }[] = [
    {
      fk: 'completions.completions_superseded_by_fkey',
      waarom:
        'NO ACTION binnen het cascadebereik, en vandaag onbereikbaar: dien_opnieuw_in() ' +
        'koppelt alleen twee voltooiingen van dezelfde auth.uid(), dus beide verdwijnen in ' +
        'hetzelfde `delete from completions where user_id = …` en de toets aan het eind van ' +
        'dat statement is tevreden. 📏 Nagemeten met een echte ketting via de RPC: ' +
        'verwijder_mijn_account() geeft {"ok": true}. Wordt een probleem zodra superseded_by ' +
        'ooit twee voltooiingen van verschillende eigenaren koppelt.',
    },
  ];

  it('elke verwijzing naar het cascadebereik laat los bij een verwijdering', () => {
    const gevonden = psql(BLOKKERENDE_VERWIJZINGEN_SQL).trim();
    const open = gevonden === '' ? [] : gevonden.split(' / ');
    const onverwacht = open.filter((r) => !TOEGESTAAN.some((t) => r.startsWith(t.fk)));

    expect(
      onverwacht,
      `deze verwijzing(en) blokkeren een accountverwijdering: ${onverwacht.join(', ')}`,
    ).toEqual([]);

    // ⚠️ De keerzijde: een uitzondering die er niet meer is, hoort uit de lijst.
    //    Anders groeit `TOEGESTAAN` tot hij alles toestaat.
    const verouderd = TOEGESTAAN.filter((t) => !open.some((r) => r.startsWith(t.fk)));
    expect(
      verouderd.map((t) => t.fk),
      'deze uitzondering is niet meer nodig en hoort uit TOEGESTAAN',
    ).toEqual([]);
  }, 120_000);

  it('MUST-FIND: hij ziet een set null op een kolom die geen null toestaat', () => {
    // ⚠️⚠️ **De ijking van de tweede tak, en die roept nu de échte query aan.**
    //    De vorm — `on delete set null` op een `not null`-kolom — komt in dit
    //    schema nergens voor, dus die tak zou anders nooit gedraaid hebben. Het
    //    geval wordt hier gemaakt in een transactie die terugrolt.
    //
    //    📏 Knip de `n`-tak uit `BLOKKERENDE_VERWIJZINGEN_SQL` en deze test wordt
    //    rood. Dat was vóór QS8-371 niet zo: toen droeg deze test een eigen kopie
    //    van de query en bewaakte hij die kopie.
    const gevonden = laatsteRegel(
      psql(`
        begin;
        create table proef_371 (
          id uuid primary key default gen_random_uuid(),
          wie uuid not null references public.profiles (id) on delete set null
        );
        ${BLOKKERENDE_VERWIJZINGEN_SQL};
        rollback;
      `),
    );

    // ⚠️ `toContain` en niet `toBe`: dat het schema verder schoon is, is de taak
    //    van de test hierboven. Deze zegt alleen dat de tak zijn eigen geval
    //    vindt — anders worden beide rood om dezelfde reden.
    expect(gevonden, 'de nullable-tak vindt zijn eigen geval niet').toContain('proef_371');
  }, 120_000);

  it('MUST-FIND: hij ziet een NO ACTION diep in het cascadebereik', () => {
    // ⚠️⚠️ **De ijking van het transitieve bereik.** Een tabel die niet naar
    //    `profiles` wijst maar naar `completions` — en `completions` cascadeert
    //    zelf uit `profiles`, dus een NO ACTION hierheen blokkeert de verwijdering
    //    net zo goed. 📏 Zonder de recursieve stap in de query vindt deze test
    //    niets, en dan is `completions.completions_superseded_by_fkey` onzichtbaar
    //    — precies het geval dat de security-ronde vond.
    const gevonden = laatsteRegel(
      psql(`
        begin;
        create table proef_371_diep (
          id uuid primary key default gen_random_uuid(),
          waarvan uuid references public.completions (id)
        );
        ${BLOKKERENDE_VERWIJZINGEN_SQL};
        rollback;
      `),
    );

    expect(gevonden, 'het cascadebereik reikt niet verder dan de eerste stap').toContain(
      'proef_371_diep',
    );
  }, 120_000);
});

/**
 * Een vertrokken goedkeurder laat zijn goedkeuring niet aan een ander na —
 * QS8-371, migratie 0212, tweede helft.
 *
 * ⚠️⚠️ **Dit is de weiger-kant van dezelfde nul.** De migratie maakt
 *    `approval_withdrawals.approver_id` nullable zodat een intrekker weg kan. Op
 *    de toesta-kant sluit zo'n nul: `approval_withdrawals_select` laat de rij
 *    alleen nog aan de doeleigenaar zien. Maar `trek_goedkeuring_in()` toetste
 *    eigendom met `a.approver_id <> auth.uid()`, en `completion_approvals
 *    .approver_id` stond al langer op `on delete set null`. `null <> uid` is
 *    `null`, dus die `then`-tak vuurde niet en de toets weigerde niemand meer.
 *
 * 📏 **Gemeten waar het strandde, en dat verschoof mét deze migratie:**
 *
 *      vóór 0212   23502 op approval_withdrawals.approver_id
 *      na 0212     23502 op points_ledger.user_id
 *
 *    Twee muren werden er één, en de overgebleven muur hoort bij de puntenboeking
 *    en niet bij deze belofte. Er was geen toestandswijziging mogelijk — nul
 *    intrekkingen, beide keren — maar een toevallige `not null` in een andere
 *    tabel is geen autorisatie.
 *
 * ⚠️ **De test toetst het antwoord en niet de afwezigheid van een fout.** Vóór de
 *    reparatie kwam er een exception; erna een nette `{"ok": false}`. Een test die
 *    alleen kijkt of er iets geworpen wordt, keurt de kapotte versie goed én de
 *    gerepareerde af.
 */
describe.skipIf(!beschikbaar)('een vertrokken goedkeurder laat niets na', () => {
  /**
   * Zet Bob (doeleigenaar), Alice (goedkeurder) en Mallory (ander lid) neer,
   * laat Alice bevestigen en vertrekken, en geeft terug wat `wie` daarna van
   * `trek_goedkeuring_in()` krijgt. Rolt alles terug.
   */
  function naVertrekVanAlice(wie: 'mallory' | 'bob'): string {
    return laatsteRegel(
      psql(`
        begin;
        create temp table r (alice uuid, bob uuid, mallory uuid, gid uuid,
                             goal uuid, wg uuid, comp uuid, appr uuid);
        create temp table uitslag (t text);
        grant select, insert, update on r to authenticated;
        grant insert, select on uitslag to authenticated;
        insert into r (alice, bob, mallory) values (
          shim_maak_gebruiker('vertrek-alice@proef.test', 'Alice'),
          shim_maak_gebruiker('vertrek-bob@proef.test', 'Bob'),
          shim_maak_gebruiker('vertrek-mallory@proef.test', 'Mallory'));

        select set_config('request.jwt.claims',
          json_build_object('sub', (select bob from r), 'role', 'authenticated')::text, true);
        set local role authenticated;
        update r set gid = ((create_group('Vertrekgroep', 0::smallint) -> 'group' ->> 'id'))::uuid;
        reset role;
        insert into group_members (group_id, user_id, role, status)
          select gid, alice, 'member', 'active' from r;
        insert into group_members (group_id, user_id, role, status)
          select gid, mallory, 'member', 'active' from r;

        insert into goals (owner_id, title, target_date)
          select bob, 'Bobdoel', current_date + 90 from r;
        update r set goal = (select id from goals where owner_id = (select bob from r) limit 1);
        insert into weekly_goals (goal_id, title, cycle_start_date)
          select goal, 'Bobweek', date_trunc('week', current_date)::date from r;
        update r set wg = (select id from weekly_goals where goal_id = (select goal from r) limit 1);
        insert into completions (weekly_goal_id, user_id, achieved_level, note)
          select wg, bob, 'ceiling', 'af' from r;
        update r set comp =
          (select id from completions where weekly_goal_id = (select wg from r) limit 1);
        insert into completion_approvals (completion_id, approver_id, subject_id, group_id, status)
          select comp, alice, bob, gid, 'approved' from r;
        update r set appr =
          (select id from completion_approvals where completion_id = (select comp from r) limit 1);

        -- Alice vertrekt. Dit is wat 0212 mogelijk maakt.
        select set_config('request.jwt.claims',
          json_build_object('sub', (select alice from r), 'role', 'authenticated')::text, true);
        set local role authenticated;
        select verwijder_mijn_account();
        reset role;

        select set_config('request.jwt.claims',
          json_build_object('sub', (select ${wie} from r), 'role', 'authenticated')::text, true);
        set local role authenticated;
        -- ⚠️ Via een temp-tabel: een exception zou anders de hele psql-aanroep
        --    afbreken, en dan is "geweigerd" niet te onderscheiden van "de
        --    opstelling klopte niet". Precies het verschil dat hier gemeten wordt.
        do $$
        declare u jsonb;
        begin
          u := trek_goedkeuring_in((select appr from r));
          insert into uitslag values (u::text);
        exception when others then
          insert into uitslag values ('WERPT ' || sqlstate);
        end $$;
        reset role;
        select t from uitslag;
        rollback;
      `),
    );
  }

  it('een ander groepslid kan zijn goedkeuring niet overnemen', () => {
    expect(
      naVertrekVanAlice('mallory'),
      'de eigendomstoets liet een willekeurig groepslid door',
    ).toContain('not_yours');
  }, 120_000);

  it('ook de doeleigenaar zelf niet — het is niet zijn goedkeuring', () => {
    // De keerzijde, en geen bijvangst: Bob heeft er het meeste belang bij dat de
    // bevestiging van zijn eigen week blijft staan. Een toets die alleen "niet
    // Mallory" zegt, laat hem er wél door.
    expect(naVertrekVanAlice('bob')).toContain('not_yours');
  }, 120_000);
});
