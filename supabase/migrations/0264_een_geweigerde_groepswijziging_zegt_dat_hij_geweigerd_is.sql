-- 0264_een_geweigerde_groepswijziging_zegt_dat_hij_geweigerd_is.sql — twee
-- triggers op `groups` zetten stil terug; voortaan weigeren ze hoorbaar.
--
-- ROLLBACK-PAD:
--   -- guard_group_update()    terug naar de versie van 0208
--   -- archief_blijft_archief() terug naar de versie van 0153
--   -- wek_groep()             terug naar de versie van 0092
--   -- wek_groep_via_review()  terug naar de versie van 0092
--   (alles `create or replace`; geen kolom en geen trigger wordt geraakt)
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten op 14-09-2026 (QS8-488) tegen `pg_get_functiondef()`**, niet
--    tegen het migratiebestand:
--
--      groups_guard           -> guard_group_update()     zet 11 kolommen terug, werpt niet
--      archief_blijft_archief -> archief_blijft_archief()  zet `status` terug, werpt niet
--      groups_tijdzone        -> bewaak_tijdzone()         wérpt, 22023
--
-- ⚠️ **De dossierrij zei negen kolommen; het zijn er elf.** `tz` (0208) en
--    `huddle_day` (0208) zijn erbij gekomen terwijl de rij openstond. Dat is
--    letterlijk wat CLAUDE.md bij regel 19 voorspelt — *wat je uitstelt groeit
--    mee met wat je erop bouwt* — en het is de reden dat deze rij niet nóg een
--    keer blijft staan.
--
-- ⚠️⚠️ **De derde trigger op dezelfde tabel doet het al goed.** `bewaak_tijdzone()`
--    werpt `22023` bij een onbekende tijdzone. De huisvorm stond dus op
--    armlengte afstand van de twee die hem niet volgden.
--
-- **Wat een stille terugzetting kost:** een client krijgt `200 OK` met de óude
-- waarde terug. Hij heeft geen manier om te weten dat zijn wijziging niet is
-- doorgekomen, en wie dit pad bouwt ziet een geslaagde call. Dat is het verschil
-- tussen *"dit mag niet"* en *"dit is gebeurd"*, en het is dezelfde klasse als
-- QS8-314 en QS8-326.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ De naad: `wek_groep()` leunde op die stilte
-- ---------------------------------------------------------------------------
--
-- Dit is het deel dat niet in de dossierrij stond en dat het meeste werk was.
--
-- `wek_groep()` hangt onder `chat_messages`, `chain_links` en `week_reviews` en
-- doet onvoorwaardelijk `set status = 'active'`. Op een **gearchiveerde** groep
-- is dat een ontarchivering, en die werd tot nu toe stilzwijgend teruggedraaid
-- door `archief_blijft_archief()`. Laat je die laatste werpen zonder de eerste
-- aan te passen, dan klapt het wekken.
--
-- 📏 Gemeten of dat pad echt bereikbaar is, in een teruggedraaide transactie op
--    een gearchiveerde groep:
--
--      als `authenticated`   -> insert in chat_messages GEWEIGERD, 42501 (RLS)
--      als tabeleigenaar     -> insert GELUKT, wek_groep vuurt,
--                               status ná afloop nog steeds `archived`
--
--    De clientkant is dus dicht en de definer-kant leunt op de stilte. Daarom
--    **eerst het leunen weghalen en dan pas werpen**: `wek_groep()` en
--    `wek_groep_via_review()` wekken voortaan geen gearchiveerde groep meer.
--    Dat verandert het waarneembare gedrag niet — de groep bleef al archived —
--    maar het haalt de afhankelijkheid weg.
--
-- ⚠️ De andere schrijvers zijn nagelopen en hebben dit niet nodig:
--    `join_group_with_code()` weigert een gearchiveerde groep zelf
--    (`reason: 'archived'`), en `slaap_stille_groepen()` raakt alleen groepen
--    met `status = 'active'`.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Waarom `created_by` ná de vroege uitgang blijft staan
-- ---------------------------------------------------------------------------
--
-- QS8-314 schrijft op dat een rolfilter geen grendel is: *"élke SECURITY
-- DEFINER-functie komt er langs"*, en zet de sleuteltoets daarom vóór de vroege
-- uitgang. Dat klopt, en het geldt hier voor `id` en `created_at`.
--
-- Voor `created_by` geldt het **niet**, en dat is gemeten en niet aangenomen:
-- 📏 `groups_created_by_fkey` is `on delete set null`. Een accountverwijdering
-- laat Postgres dus `update groups set created_by = null` doen, en die
-- referentiële actie draait met `current_user = postgres`. Een toets vóór de
-- vroege uitgang zou daarmee **het wisrecht breken van iedereen die ooit een
-- groep heeft opgericht**.
--
-- ⚠️ Dat is binnen één dag de **derde** keer dat deze klasse zich meldt —
--    QS8-371 (`approval_withdrawals.approver_id`), QS8-480
--    (`completion_approvals.approver_id`) en nu deze. **Een referentiële actie
--    is een UPDATE, en hij draait als de eigenaar.** Bij elke trigger die op
--    UPDATE werpt is de eerste vraag dus: welke `on delete`/`on update`-acties
--    schrijven in deze tabel, en wat zetten ze?
--
-- ---------------------------------------------------------------------------
-- Wat dit niet is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen nieuwe grens.** Elke kolom die vandaag gepind is, blijft gepind; het
--    enige verschil is dat de weigering nu hoorbaar is. Geen enkele client kan
--    hierna méér dan hij kon.
--
-- ⚠️ **Geen orakel.** Eén errcode, en de melding noemt de kolom die de aanvrager
--    zélf heeft meegestuurd — dat verklapt niets wat hij niet al wist. De les van
--    QS8-480 gaat over meldingen die verschillen op een feit dat de aanvrager
--    níet mag weten; dat is hier niet aan de orde.

-- ---------------------------------------------------------------------------
-- 📏 De ijking
-- ---------------------------------------------------------------------------
--
-- Met de hand gedraaid op 14-09-2026, één mutatie per grendel, en van élke
-- mutatie eerst op de gedeployde definitie bevestigd dát hij erin zat.
-- Vooraf 132 groen (archief, groepspin, opruiming, policies), na herstel 132.
--
--   A  `archief_blijft_archief()` terug naar `new.status := old.status`
--      -> 1 rood: "een kale ontarchivering wordt hoorbaar geweigerd"
--   B  `and status <> 'archived'` uit `wek_groep()` halen
--      -> 1 rood: "een bericht in een gearchiveerde groep loopt niet stuk"
--         — dat is de naad: zonder A zou B nooit opvallen, en zonder B
--         breekt A het wekken
--   C  `guard_group_update()` terug naar `new.status := old.status`
--      -> 1 rood: "status is niet door een client te wijzigen"
--   D  `created_by` vóór de vroege uitgang zetten
--      -> **2 rood in `tests/rls/opruiming.test.ts`**: het verwijderen van een
--         account loopt stuk. Dat is de meting die de plaatsing draagt, en het
--         is dezelfde klasse als QS8-371 en QS8-480 — binnen één dag de derde.
--
-- ⚠️ De mutaties A en C zijn met een échte `create or replace` op de draaiende
--    database gedaan en niet met een bewerking van dit bestand, want dan zou de
--    ijking de migratie toetsen in plaats van de functie die er staat.

begin;

-- ---------------------------------------------------------------------------
-- 1. Eerst het leunen weghalen: een gearchiveerde groep wordt niet gewekt
-- ---------------------------------------------------------------------------

create or replace function public.wek_groep()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  -- ⚠️ Systeemberichten wekken niet. Zonder deze regel maakt het afscheidsbericht
  --    van slaap_stille_groepen() de groep in dezelfde transactie weer wakker, en
  --    dan slaapt er nooit iets — een bug die zich als "werkt niet" voordoet en
  --    waar je een avond naar zoekt.
  --
  -- ⚠️ Via `to_jsonb(new)` en niet via `new.type`. Deze functie hangt onder drie
  --    tabellen en twee daarvan hebben helemaal geen kolom `type`; een directe
  --    veldverwijzing geeft daar "record new has no field type", ook binnen een
  --    if die er niet langskomt.
  if (to_jsonb(new) ->> 'type') = 'system' then
    return new;
  end if;

  -- ⚠️⚠️ **`status <> 'archived'` is nieuw in 0264 en verandert geen gedrag.**
  --    Een gearchiveerde groep werd hier al niet wakker: `archief_blijft_archief()`
  --    draaide de ontarchivering stilzwijgend terug. Die stilte verdwijnt in
  --    stap 2, en zonder deze regel zou het wekken daar dan op klappen.
  update groups
  set status = 'active', last_activity_at = now()
  where id = new.group_id
    and status <> 'archived';

  return new;
end;
$$;

create or replace function public.wek_groep_via_review()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  -- ⚠️ Zie `wek_groep()`: dezelfde reden, dezelfde regel.
  update groups g
  set status = 'active', last_activity_at = now()
  where g.id = (select r.group_id from week_reviews r where r.id = new.week_review_id)
    and g.status <> 'archived';

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Het archief weigert hoorbaar
-- ---------------------------------------------------------------------------
--
-- ⚠️ Deze trigger heeft met opzet **geen** vroege uitgang op de rol, en dat
--    blijft zo: alleen `heropen_groep()` mag ontarchiveren, en die identificeert
--    zich met `app.heropent_groep`. Een rolfilter zou daar een gat in maken.

create or replace function public.archief_blijft_archief()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if old.status = 'archived' and new.status is distinct from 'archived' then
    -- ⚠️ De sleutel draagt het groeps-id. Een booleaan zou binnen deze
    --    transactie élke gearchiveerde groep ontgrendelen die langskomt; zo is
    --    het er precies één. `nullif` want een niet-gezette instelling komt als
    --    lege string terug en niet als NULL.
    if nullif(current_setting('app.heropent_groep', true), '') is distinct from old.id::text then
      raise exception 'Een gearchiveerde groep wordt heropend met heropen_groep(), niet met een wijziging van status'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.archief_blijft_archief() is
  'Een gearchiveerde groep blijft gearchiveerd tenzij heropen_groep() zich '
  'meldt via app.heropent_groep. Werpt sinds 0264 in plaats van stilzwijgend '
  'terug te zetten — QS8-488.';

-- ---------------------------------------------------------------------------
-- 3. De elf gepinde kolommen weigeren hoorbaar
-- ---------------------------------------------------------------------------

create or replace function public.guard_group_update()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  -- ⚠️⚠️ **`id` en `created_at` staan vóór de vroege uitgang en gelden dus voor
  --    élke rol, `service_role` inbegrepen.** Dat is de vorm van QS8-314: een
  --    rolfilter is geen grendel voor de sleutel en de herkomst van een rij, want
  --    elke definer-functie komt er langs. 📏 Nagemeten dat geen enkele schrijver
  --    ze aanraakt — de elf functies die `groups` bijwerken zetten `status`,
  --    `last_activity_at`, `invite_code`, `invite_revoked`, `zichtbaarheid`,
  --    `ontdekbaar` en `huddle_day`, en verder niets — en er is geen
  --    referentiële actie die op deze twee kolommen wijst.
  if new.id is distinct from old.id then
    raise exception 'Het id van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'De aanmaakdatum van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- ⚠️ Hieronder staat alles wat een definer-functie wél legitiem verzet, plus
  --    `created_by` en `tz`. Voor die eerste groep is de vroege uitgang de
  --    bedoeling: `zet_groepszichtbaarheid()`, `zet_huddledag()`,
  --    `rotate_invite_code()` en de wekpaden horen erlangs te komen.

  if new.invite_code is distinct from old.invite_code then
    raise exception 'De uitnodigingscode verzet je met rotate_invite_code()'
      using errcode = 'check_violation';
  end if;

  if new.invite_revoked is distinct from old.invite_revoked then
    raise exception 'De uitnodigingscode trek je in met set_invite_revoked()'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    raise exception 'De status van een groep verzet je met archiveer_groep() of heropen_groep()'
      using errcode = 'check_violation';
  end if;

  if new.last_activity_at is distinct from old.last_activity_at then
    raise exception 'De laatste activiteit van een groep is een servertijdstempel'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ De zichtbaarheid draagt domeinregel 7 en gaat daarom nooit buiten
  --    `zet_groepszichtbaarheid()` om — die heeft de zorgvuldigheid van een
  --    commitment device, want omzetten verandert met terugwerkende kracht wat
  --    er over ándere leden zichtbaar wordt.
  if new.zichtbaarheid is distinct from old.zichtbaarheid then
    raise exception 'De zichtbaarheid van een groep verzet je met zet_groepszichtbaarheid()'
      using errcode = 'check_violation';
  end if;

  if new.ontdekbaar is distinct from old.ontdekbaar then
    raise exception 'De ontdekbaarheid van een groep verzet je met zet_groepsontdekbaarheid()'
      using errcode = 'check_violation';
  end if;

  -- ⚠️⚠️ **De groepsklok, sinds QS8-355.** `groups.tz` is de tweede klok van
  --    domeinregel 1: `currentGroupPeriod()` leest hem, en daarmee bepaalt hij de
  --    huddledag, de weekafsluiting, De Ketting en het groepsoverzicht — voor élk
  --    lid. Eén beheerder verschoof daarmee de weekgrens van de hele groep, met
  --    één PATCH, buiten elk scherm om.
  --
  -- 📏 Nagemeten vóór 0208, met een echte sessie van de beheerder:
  --
  --      create_group('Klokgroep')                   -> tz Europe/Amsterdam
  --      update groups set tz = 'Pacific/Kiritimati' -> geaccepteerd
  --      groepsdatum(gid)                            -> 2026-09-09
  --
  --    De serverdatum was 2026-09-08. Eén PATCH, en de groep staat een dag verder.
  --
  -- ⚠️ 📏 Geen enkele functie werkt deze kolom bij; `create_group()` zet hem bij
  --    het aanmaken en daarna ligt hij stil. Hij staat toch ná de vroege uitgang
  --    omdat een beheerderspad om hem te verzetten een productvraag is en geen
  --    defect — en een slot vóór de uitgang zou dat pad later ook voor
  --    `service_role` dichthouden.
  if new.tz is distinct from old.tz then
    raise exception 'De tijdzone van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  -- ⚠️⚠️ **Nieuw in 0208 (QS8-360), en om dezelfde reden als `tz` erboven.**
  --    De huddledag verschuift de groepsperiode. 📏 Gemeten vóór die migratie:
  --    na een kale PATCH kon een lid zijn openstaande weekafsluiting nooit meer
  --    afronden, bleef het groepsoverzicht daar `false` melden — een gemiste
  --    week van iemand anders — en telde de schakel van wie wél had afgesloten
  --    niet meer mee, zodat hij er een tweede kon leggen voor dezelfde week.
  --
  --    Het verschil met `tz` is dat deze kolom een scherm hééft. Daarom een
  --    RPC ernaast en niet alleen een slot: `zet_huddledag()` verzet de dag én
  --    neemt de lopende periode mee.
  if new.huddle_day is distinct from old.huddle_day then
    raise exception 'De huddledag verzet je met zet_huddledag()'
      using errcode = 'check_violation';
  end if;

  -- ⚠️⚠️ **`created_by` staat hier en niet bovenaan, en dat is gemeten.**
  --    📏 `groups_created_by_fkey` is `on delete set null`: een
  --    accountverwijdering laat Postgres `update groups set created_by = null`
  --    doen, en die referentiële actie draait met `current_user = postgres`.
  --    Boven de vroege uitgang zou deze toets dus het wisrecht breken van
  --    iedereen die ooit een groep heeft opgericht — dezelfde klasse als
  --    QS8-371 en QS8-480, binnen één dag voor de derde keer.
  --
  --    De oude tak van 0060 (`if old.created_by is null or new.created_by is not
  --    null`) is hier weg en komt niet terug: die liet een beheerder-client het
  --    oprichterschap van zijn eigen groep leegtrekken.
  if new.created_by is distinct from old.created_by then
    raise exception 'De oprichter van een groep ligt vast'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.guard_group_update() is
  'De elf kolommen van groups die een client niet zelf verzet. Werpt sinds 0264 '
  'in plaats van stilzwijgend terug te zetten; id en created_at gelden voor elke '
  'rol, de rest alleen voor authenticated en anon omdat definer-functies ze '
  'legitiem bijwerken. created_by staat bewust na de vroege uitgang: zijn '
  'on delete set null draait als postgres. QS8-488.';

commit;
