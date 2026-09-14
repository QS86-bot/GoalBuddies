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
--    Dat verandert het waarneembare gedrag op één punt **wél**, en dat hoort hier
--    te staan: `last_activity_at` liep vroeger nog op bij een bericht in een
--    gearchiveerde groep — de oude `archief_blijft_archief()` zette alléén
--    `status` terug — en dat doet hij nu niet meer. 📏 Nagemeten: een
--    gearchiveerde groep met een `last_activity_at` van 30 dagen oud houdt die
--    datum na een `insert into chat_messages`.
--
--    Dat is inert: de enige lezer is `slaap_stille_groepen()` en die filtert op
--    `status = 'active'`, `heropen_groep()` zet de kolom zelf op `now()`, en
--    buiten `database.types.ts` leest geen enkel `.ts`-bestand hem. Maar *"het
--    gedrag verandert niet"* was te stellig — gevonden in de security-ronde.
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
-- ⚠️⚠️ **Voor acht van de elf kolommen is dit geen nieuwe grens** — ze blijven
--    gepind, alleen is de weigering nu hoorbaar. Geen enkele client kan hierna
--    méér dan hij kon.
--
--    **Voor `id`, `created_at` en `created_by` is het dat wél, en dat stond hier
--    eerst ten onrechte niet.** 0208 zette ze ná de vroege uitgang; hier staan
--    ze ervóór en gelden ze voor élke rol — `service_role`, `postgres`, elke
--    definer-functie. 📏 Nagemeten: `set local role service_role; update groups
--    set created_at = …` geeft `23514` waar het eerst gewoon landde.
--
--    Die grens is verdedigbaar (📏 geen schrijver en geen referentiële actie op
--    `id` en `created_at`; `created_by` heeft de bestaanstoets die de RI-actie
--    doorlaat) en staat sinds deze migratie onder test in
--    `tests/rls/groepspin.test.ts`. Maar hem als *"niets nieuws"* presenteren was
--    precies de fout die CLAUDE.md het duurst noemt — gevonden in de
--    security-ronde.
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

  -- ⚠️⚠️ **`created_by` hoort hier ook, en de vorm is die van
  --    `bewaak_begunstigde()` op `commitments` — gevonden in de security-ronde.**
  --
  --    📏 `groups_created_by_fkey` is `on delete set null`. Een accountverwijdering
  --    laat Postgres `update groups set created_by = null` doen, en die
  --    referentiële actie draait met `current_user = postgres`. Een kále toets
  --    boven de vroege uitgang breekt daarmee het wisrecht van iedereen die ooit
  --    een groep oprichtte — 📏 geijkt: 2 rode tests in `opruiming.test.ts`.
  --
  --    De eerste versie van deze migratie loste dat op door de toets ónder de
  --    uitgang te zetten. Dat werkt, maar het hangt de bescherming van de
  --    oprichter aan een **rolnaam**, en `docs/ENGINEER-REVIEW.md` heeft daar een
  --    open rij over: *"de deny-list op rolnaam faalt nu pas écht open"*.
  --
  --    De bestaanstoets haalt die afhankelijkheid weg. Tijdens een
  --    `on delete set null` is het ouderprofiel **al verdwenen**, dus de
  --    RI-actie komt er hoe dan ook langs — ongeacht wie hem uitvoert. Een
  --    client die het oprichterschap leegtrekt terwijl de oprichter nog bestaat,
  --    loopt er wél op stuk. Zelfde vorm en dezelfde reden als
  --    `bewaak_begunstigde()`.
  if old.created_by is not null and new.created_by is null
     and exists (select 1 from profiles p where p.id = old.created_by) then
    raise exception 'De oprichter van een groep is niet weg te halen zolang hij bestaat'
      using errcode = 'check_violation';
  end if;

  if new.created_by is distinct from old.created_by
     and new.created_by is not null then
    raise exception 'De oprichter van een groep ligt vast'
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

  return new;
end;
$$;

comment on function public.guard_group_update() is
  'De elf kolommen van groups die een client niet zelf verzet. Werpt sinds 0264 '
  'in plaats van stilzwijgend terug te zetten; id en created_at gelden voor elke '
  'rol, de rest alleen voor authenticated en anon omdat definer-functies ze '
  'legitiem bijwerken. created_by geldt ook voor elke rol, met de bestaanstoets '
  'van bewaak_begunstigde(): tijdens een on delete set null is het profiel al '
  'weg, dus de RI-actie komt erlangs zonder dat de grendel aan een rolnaam '
  'hangt. QS8-488.';

-- ---------------------------------------------------------------------------
-- 4. De bewaking ziet de wérpvorm, niet alleen de toewijzing
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is de zwaarste bevinding van de security-ronde, en zonder haar was
--    deze migratie een slot dat zijn eigen rookmelder losschroeft.**
--
--    `onveranderlijkheid_bewaking()` (0221) bestaat omdat dit project vier keer
--    dezelfde fout maakte: een BEFORE-UPDATE-trigger die een `on delete set
--    null`-kolom vasthoudt, waardoor niemand zijn account nog kan verwijderen.
--    Zijn `where` eist de vorm `new.<kolom> := old.<kolom>` — de toewijzing.
--
--    📏 Gemeten ná de eerste versie van 0264:
--
--      select count(*) from onveranderlijkheid_bewaking() where tabel='groups'
--        -> 0
--
--    Niet "bewaakt", maar **weg**. De rij viel uit de resultaatset, en
--    `KAAL_MET_REDEN` in `tests/rls/policies.test.ts` werd daardoor leeg — met
--    een toelichting eronder die dat als winst uitlegde. Dat is exact de vorm
--    die CLAUDE.md het duurst noemt: een uitgeschreven argument leest de
--    volgende persoon als een reden om niet te twijfelen.
--
-- ⚠️ **En het is niet lokaal.** De huisstijl schuift van `:=` naar `raise`; elke
--    trigger die meegaat, verdwijnt uit deze teller. `groups` was de eerste.
--
--    Daarom leest de bewaking vanaf nu **allebei** de vormen, en noemt hij een
--    grendel ook als die de bestaanstoets van `bewaak_begunstigde()` gebruikt.

create or replace function public.onveranderlijkheid_bewaking()
returns table (tabel text, trigger_naam text, functie text, kolom text, heeft_grendel boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with set_null as (
    select c.conrelid::regclass::text as tabel, a.attname::text as kolom
    from pg_constraint c
    join unnest(c.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.confdeltype = 'n'                    -- ON DELETE SET NULL
      and c.connamespace = 'public'::regnamespace
  ),
  before_update as (
    select t.tgrelid::regclass::text as tabel,
           t.tgname::text            as trigger_naam,
           p.proname::text           as functie,
           regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') as bron
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and (t.tgtype & 2)  <> 0                   -- BEFORE
      and (t.tgtype & 16) <> 0                   -- UPDATE
  )
  select b.tabel, b.trigger_naam, b.functie, s.kolom,
         -- De toewijzingsvorm met zijn null-tolerante tak (0060/0221) …
         b.bron ~* ('old\.' || s.kolom || '\s+is\s+null\s+or\s+new\.'
                    || s.kolom || '\s+is\s+not\s+null')
         -- … of de werpvorm met een bestaanstoets op de óude waarde. Tijdens een
         --    `on delete set null` is de ouderrij al weg, dus de RI-actie komt
         --    erlangs zonder dat de grendel aan een rolnaam hangt. De vorm van
         --    `bewaak_begunstigde()` (0169) en sinds 0264 ook van
         --    `guard_group_update()`.
         or b.bron ~* ('exists\s*\([\s\S]{0,200}old\.' || s.kolom)
         -- … of de vorm die de RI-actie aan zijn **gedaante** herkent en
         --    overslaat: `new.x is null and old.x is not null`. Zo doet
         --    `fill_approval_subject()` het sinds 0262 (QS8-480), en 📏 die
         --    grendel is daar geijkt — hem weghalen geeft vier rode tests over
         --    het wisrecht. Zonder deze derde tak meldt de bewaking hem als kaal
         --    terwijl hij de strengste van de drie is: hij laat alléén de
         --    referentiële vorm door en niets anders.
         or b.bron ~* ('new\.' || s.kolom || '\s+is\s+null[\s\S]{0,80}old\.'
                       || s.kolom || '\s+is\s+not\s+null')
  from before_update b
  join set_null s on s.tabel = b.tabel
  where b.bron ~* ('new\.' || s.kolom || '\s*:=\s*old\.' || s.kolom)
     -- ⚠️ De werpvorm erbij: een tak die de kolom noemt en werpt. Zonder deze
     --    regel verdwijnt elke trigger die van `:=` naar `raise` gaat uit beeld,
     --    en dat is precies wat 0264 met `groups` deed.
     or b.bron ~* ('new\.' || s.kolom || '\s+is\s+distinct\s+from\s+old\.' || s.kolom)
     or b.bron ~* ('old\.' || s.kolom || '\s+is\s+not\s+null[\s\S]{0,80}new\.' || s.kolom || '\s+is\s+null')
  order by b.tabel, s.kolom;
$$;

comment on function public.onveranderlijkheid_bewaking() is
  'Elke on delete set null-kolom met een BEFORE-UPDATE-trigger erop, en of die '
  'trigger een grendel draagt die de RI-actie doorlaat. Ziet sinds 0264 zowel '
  'de toewijzingsvorm (new.x := old.x) als de werpvorm — anders verdwijnt een '
  'trigger uit beeld zodra hij van := naar raise gaat, en dat is geen winst maar '
  'blindheid. QS8-488.';

revoke all on function public.onveranderlijkheid_bewaking() from public, anon, authenticated;
grant execute on function public.onveranderlijkheid_bewaking() to service_role;

commit;
