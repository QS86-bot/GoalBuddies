-- 0248_een_taak_deel_je_per_stuk_en_met_een_gekozen_groep.sql — De Lijst wordt
-- deelbaar: per taak, met één gekozen groep, en uitsluitend via een RPC
-- (QS8-381, deel 3 van QS8-378).
--
-- ROLLBACK-PAD:
--   drop trigger if exists group_members_taken_sluiten on public.group_members;
--   drop function if exists public.sluit_gedeelde_taken();
--   drop function if exists public.zet_taakzichtbaarheid(uuid, uuid);
--   drop index if exists public.todo_items_gedeeld_idx;
--   alter table public.todo_items drop constraint if exists todo_items_groep_hoort_bij_gedeeld;
--   alter table public.todo_items drop column if exists shared_group_id;
--   -- todo_items_select terug naar de eigenaar-only vorm uit 0227:
--   --   using (user_id = (select auth.uid()))
--   -- pin_taak() terug naar de versie uit 0227, dus zonder de sleuteltak en
--   --   zonder shared_group_id.
--   -- en sleutelzetters() terug naar de definitie uit 0227, dus zonder de rij
--   --   `app.taak_gedeeld`. Zie de waarschuwing bij §6.
--
-- ⚠️ De kolom is nieuw en overal `null`; hem droppen valt niet onder grens 2 van
--    de beslisbevoegdheid. De policy terugzetten is de kant die telt: dat maakt
--    de tabel weer eigenaar-only, en dat is de veilige richting.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 09-09-2026 (beslispunt 2 van QS8-378): **variant B — per
-- taak aanvinken wat de groep ziet, standaard niet openbaar.** Bewust níet C
-- ("de hele lijst met één schakelaar"), wat de wens letterlijk vroeg.
--
-- ⚠️ **Dat verschil is de hele reden dat domeinregel 7 hier niet verruimd
--    hoeft te worden.** Bij C ziet de groep ook wat er blijft liggen, en dat is
--    de achterstand van een ander. Bij B ziet de groep alleen wat de eigenaar
--    zelf heeft aangewezen — dezelfde vorm als de drie routes die domeinregel 7
--    met zoveel woorden toelaat: ze lopen alle drie via de gebruiker zelf.
--
-- 📏 Het precedent is `daily_moves.visibility` (0001), en de manier waarop dát
--    is afgelopen staat in het issue: de SELECT-policy eist
--    `weekly_goal_id is not null`, terwijl het enige scherm dat een Dagzet
--    aanmaakt `weekly_goal_id: null` hardgecodeerd meestuurt. Delen werkt daar
--    dus niet, en niets wordt daar rood van — elk schakeltje af, de keten
--    onderbroken (regel 18, vraag 5). De ketentest bij deze migratie is er
--    precies daarom: een tweede gebruiker, in dezelfde groep, met een echt
--    verzoek.
--
-- ---------------------------------------------------------------------------
-- Wélke groep — de vraag die beslispunt 2 openliet
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Een gebruiker kan in meer dan één groep zitten, en "openbaar voor je
--    groep" zegt niet welke.** Dat is onwrikbare regel 18 vraag 6 in zijn
--    zuiverste vorm: een aanname van "er is er altijd precies één" die naar "er
--    kunnen er meer zijn" getild wordt.
--
-- 📏 Gegrepen vóór het bouwen, zoals die regel voorschrijft: `groepen[0]` staat
--    op drie plekken in `app/`, en `src/modules/buddies/deling.ts` draagt de
--    reparatie ervan uit QS8-56 — *"tot QS8-56 stond hier `groepen[0]` in het
--    scherm, en dat was een keuze die niemand gemaakt had."* Die functie
--    (`beslissendeGroep()`) doet precies wat hier nodig is: bij één groep is er
--    niets te kiezen, bij twee of meer telt alleen een keuze die nog bestáát.
--
-- **Gekozen: B2 — de taak draagt de groep waarmee hij gedeeld is.** Niet "iedereen
-- met wie je een groep deelt" (B1). De reden staat in CLAUDE.md bij domeinregel 7:
-- *zit er een leidinggevende in de groep, dan beschermt de regel niet tegen
-- schaamte maar tegen een beoordelingsgesprek.* Eén vinkje dat je boodschappenlijst
-- én je werkgroep bereikt, is precies dat geval.
--
-- ---------------------------------------------------------------------------
-- 1. De kolom
-- ---------------------------------------------------------------------------

alter table public.todo_items
  add column if not exists shared_group_id uuid references public.groups (id) on delete set null;

comment on column public.todo_items.shared_group_id is
  'De groep waarmee deze taak gedeeld is (QS8-381). Alleen te zetten via '
  'zet_taakzichtbaarheid(); voor geen enkele client schrijfbaar.';

-- ⚠️⚠️ **De CHECK is een biconditionaal, en dat is een gerepareerde keuze.**
--    Mijn eerste versie stond er half — `shared_group_id is null or visibility =
--    'group'` — mét het argument erbij dat de andere helft niet kón: *"een CHECK
--    als 'group betekent een groep' zou bij het verwijderen van een `groups`-rij
--    afgaan, want de FK zet de kolom op `null` en de CHECK weigert de rij
--    daarna."*
--
--    Dat argument klopte, en het is opgelost in plaats van omzeild: `pin_taak()`
--    normaliseert in §3 een rij zonder groep terug naar `private`, en een BEFORE
--    ROW-trigger draait vóór de constraint. De `set null` van de foreign key
--    landt daardoor op `('private', null)` en niet op `('group', null)`.
--
--    Wat dat oplevert is de invariant zélf in plaats van de helft ervan:
--    **"gedeeld" is één feit dat in twee kolommen staat, en de twee kunnen niet
--    uiteenlopen.** De halve vorm liet `('group', null)` toe — een taak die
--    zégt gedeeld te zijn terwijl er niemand meeleest. De policy hieronder sloot
--    die rij netjes af, maar het scherm niet: `Deelblok` zoekt de naam van de
--    groep op en rendert *"Gedeeld met "* zonder naam. Een stand die nergens uit
--    te lezen valt, is een stand die je niet moet kunnen opslaan.
--
-- ⚠️ De faalrichting blijft dezelfde en is nu dubbel gedekt: verdwijnt een groep,
--    dan valt de taak terug op eigenaar-only (domeinregel 7). Eerst omdat de
--    policy `shared_group_id is not null` eist, en nu ook omdat er geen andere
--    stand meer bestaat.

alter table public.todo_items drop constraint if exists todo_items_groep_hoort_bij_gedeeld;
alter table public.todo_items add constraint todo_items_groep_hoort_bij_gedeeld
  check ((shared_group_id is not null) = (visibility = 'group'));

-- ⚠️ Onwrikbare regel 11: een index op elke foreign key en op elke kolom in een
--    WHERE. De policy hieronder filtert op `shared_group_id`, en zonder deze
--    index leest hij de hele tabel van élke gebruiker.
create index if not exists todo_items_gedeeld_idx
  on public.todo_items (shared_group_id)
  where shared_group_id is not null;

-- ---------------------------------------------------------------------------
-- 2. De policy — de groep leest, de database beslist
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Drie voorwaarden en niet één.** `visibility = 'group'` alleen is te
--    weinig: dan zou een rij met een lege `shared_group_id` — de faalstand
--    hierboven — voor iederéén zichtbaar zijn die toevallig lid is van niets.
--    `is_group_member()` alleen is ook te weinig: dan lekt élke taak.
--
-- ⚠️⚠️ **`mag_groep_lezen()` en niet `is_group_member()`, en dat is een
--    gerepareerde keuze.** De eerste versie stond op `is_group_member()`, en die
--    sluit een gearchiveerde groep uit. `archiefleesgat()` (0153) werd daar
--    meteen rood van: *"leespolicy loopt langs `is_group_member()`; die sluit
--    een archief uit."*
--
--    De regel die 0153 vestigde is de lees/schrijf-splitsing: **een archief
--    blijft leesbaar, en alleen de schrijfkant gaat dicht.** 0092 zette de
--    archieftoets in `is_group_member()` en daarmee waren de chat, de
--    weekafsluitingen en de ledenlijst van een gearchiveerde groep voor niemand
--    meer te openen — er werd niets gewist, "archief" beloofde alleen
--    leesbaarheid die er niet was. Een gedeelde taak hoort aan diezelfde kant te
--    staan.
--
-- ⚠️ **De schrijfkant hieronder houdt wél `is_group_member()`**, en dat is de
--    splitsing en geen inconsistentie: je deelt niets meer mét een archief, maar
--    wat er al gedeeld is blijft te lezen.
--
-- ⚠️ En geen eigen EXISTS: die helpers sluiten al uit wat hier ook uitgesloten
--    hoort, en een tweede kopie van die regel gaat uiteen lopen — dan is de
--    vraag welke van de twee de waarheid is.
--
-- ⚠️ **Wat de groep ziet is de héle rij, en dat is besloten en niet ontsnapt.**
--    RLS kan geen kolommen beperken, dus een groepsgenoot leest ook `done_at`,
--    `created_at` en `order_index`. Dat is hier gewenst: *"ik zei dat ik dit zou
--    doen, en het is af"* is precies wat delen oplevert. Wat er níét bij zit is
--    een oordeel: een taak draagt geen punten, geen reeks en geen cyclus, dus er
--    valt geen gemiste week uit af te leiden. De volledige afweging staat in
--    `docs/decisions/002-domeinregel7-oppervlakken.md`.

drop policy if exists todo_items_select on public.todo_items;
create policy todo_items_select on public.todo_items
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      visibility = 'group'
      and shared_group_id is not null
      and mag_groep_lezen(shared_group_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. De pin laat één schrijver door, en die schrijver is een RPC
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de uitzondering die 0227 §3b met zoveel woorden aankondigde**, en
--    hij heeft de vorm die dat commentaar voorschreef: een sessiesleutel die
--    alléén deze RPC zet, met een rij in `sleutelzetters()` erbij. Niet een
--    versoepeling van de pin en niet een gat in de policy.
--
-- ⚠️ **De sleutel draagt het id van de táák en niet een boolean.** Een vlag zou
--    binnen dezelfde transactie élke rij doorlaten; het id laat er precies één
--    door. Dezelfde vorm als `app.huddledag_verzet` in 0208, dat het groeps-id
--    draagt.
--
-- ⚠️ **De uitdrukking staat aan de toelaat-kant, dus een ongezette sleutel
--    (`null`) betekent "niet toegelaten" en er is geen `coalesce` nodig.** Aan de
--    weiger-kant zou dat precies andersom liggen — zie de aantekening in 0199.

create or replace function public.pin_taak() returns trigger
 language plpgsql set search_path to 'public', 'pg_temp' as $$
declare v_mag_delen boolean; v_sluit boolean;
begin
  v_mag_delen := nullif(current_setting('app.taak_gedeeld', true), '') is not distinct from old.id::text;

  -- ⚠️⚠️ **Dichtdoen mag altijd, en dat is een regel met een richting.** De pin
  --    bestaat om te verhinderen dat een taak zonder de RPC **open** gaat; hij
  --    bestaat niet om te verhinderen dat hij **dicht** gaat. Elke overgang die
  --    op `('private', null)` landt, verkleint wat de groep leest — en er is
  --    geen aanvaller die daar iets aan heeft.
  --
  --    Wat het mogelijk maakt is `sluit_gedeelde_taken()` in §5: die sluit bij
  --    een vertrek de taken van één lid in één UPDATE, en kan dus geen
  --    sessiesleutel per rij zetten. Een sleutel die *alle* rijen doorlaat is
  --    precies de vorm die mutatie G hieronder afwijst.
  v_sluit := new.visibility = 'private' and new.shared_group_id is null;

  if new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id
     or (not v_mag_delen and not v_sluit and new.visibility is distinct from old.visibility)
     -- ⚠️⚠️ **Alleen het zétten van een groep is gepind, het wíssen niet — en
     --    dat is een gerepareerd defect en geen versoepeling.** 📏 Gemeten: met
     --    een onvoorwaardelijke pin bleef het opruimen van de RLS-suite met een
     --    groep zitten. De oorzaak is dat `on delete set null` op
     --    `shared_group_id` een gewone UPDATE is, en die vuurt deze trigger. De
     --    pin weigerde de foreign key zijn eigen werk, en daarmee was een groep
     --    met één gedeelde taak erin **nooit meer te verwijderen**.
     --
     --    Wissen mag daarom altijd, en dat kost geen grendel: de policy eist
     --    `shared_group_id is not null`, dus een lege kolom sluít de taak af in
     --    plaats van hem open te zetten. De faalstand valt de goede kant op.
     --
     -- ⚠️ Bewust géén toets op `current_user` om de RI-actie te herkennen. Dat
     --    is de vorm die bij `guard_group_update()` jarenlang stukstond
     --    (QS8-264): binnen een `security definer` is `current_user` de eigenaar
     --    en niet de aanroeper, en dan neemt de eerste regel élke keer de vroege
     --    uitgang. Een toets op de wáárde is niet stuk te maken door een
     --    rolwissel.
     or (
       not v_mag_delen
       and new.shared_group_id is distinct from old.shared_group_id
       and new.shared_group_id is not null
     )
  then
    raise exception 'De zichtbaarheid en de herkomst van een taak liggen vast'
      using errcode = 'check_violation',
            hint = 'visibility en shared_group_id gaan via zet_taakzichtbaarheid(); user_id, created_at en id liggen vast zodra de taak er staat.';
  end if;

  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  new.id         := old.id;

  -- ⚠️ De terugzetting geldt overal behalve op de doorgelaten weg hierboven;
  --    anders laat de `raise` hem toe en zet deze regel hem alsnog terug — de
  --    stille terugzetting van QS8-314.
  if not v_mag_delen and not v_sluit then
    new.visibility := old.visibility;

    -- ⚠️⚠️ **Deze vorm is de vorm die `onveranderlijkheid_bewaking()` herkent,
    --    en dat is geen stijl maar een gemeten reparatie.** Mijn eerste versie
    --    stond er als `if new.shared_group_id is not null then …` — semantisch
    --    hetzelfde voor alle vier de gevallen, en tóch rood: die bewaking eist
    --    letterlijk `old.<kolom> is null or new.<kolom> is not null`, precies
    --    zodat er één herkenbare vorm is voor de val die 0031, 0033 en 0059 alle
    --    drie maakten. Een eigen variant is hier een variant te veel.
    --
    --    Wat de vorm doet: een wissing door de foreign key komt hier langs, al
    --    het andere wordt teruggezet. Anders draait deze regel terug wat de
    --    `raise` hierboven net doorliet — de stille terugzetting van QS8-314, in
    --    de vorm die de groepsverwijdering vastzette.
    if old.shared_group_id is null or new.shared_group_id is not null then
      new.shared_group_id := old.shared_group_id;
    end if;
  end if;

  -- ⚠️⚠️ **De normalisatie, en die draagt de CHECK uit §1.** Een taak zonder
  --    groep is niet gedeeld; `('group', null)` is geen stand maar een half
  --    geschreven rij. De enige schrijver die hem oplevert is de foreign key:
  --    `on delete set null` raakt één kolom en weet niets van de andere.
  --
  --    Dat dit hier staat en niet in een CHECK alleen, is de volgorde: een
  --    BEFORE ROW-trigger draait vóór de constraints, dus deze regel maakt de
  --    biconditionaal haalbaar in plaats van dat hij erop stukloopt. Zonder deze
  --    regel is een groepsverwijdering een constraintfout in een tabel die er
  --    niets mee te maken heeft — precies het bezwaar dat §1 citeert.
  --
  -- ⚠️⚠️ **`old.shared_group_id is not null` is de smalle vorm, en de brede is
  --    afgewezen na de security-ronde.** `if new.shared_group_id is null` alleen
  --    dekt hetzelfde geval én een tweede: een bevoorrechte schrijver — en
  --    `service_role` hééft de kolomgrant — die `visibility = 'group'` zet
  --    zonder groep erbij. Die kreeg dan geen fout maar een stille terugzetting
  --    naar `('private', null)`, en dan zijn *"ik heb gedeeld"* en *"er is niets
  --    gebeurd"* niet uit elkaar te houden.
  --
  --    De smalle vorm normaliseert alleen wat de foreign key achterlaat — een
  --    groep die er wás en er niet meer is — en laat die tweede doorlopen naar
  --    `todo_items_groep_hoort_bij_gedeeld`, die luid weigert met de naam van de
  --    constraint erbij. Stil naar de veilige kant is nog steeds stil, en de
  --    review vroeg om een `raise warning`; dít is dezelfde reparatie een stap
  --    verder, want een waarschuwing had ook op het legitieme pad afgegaan.
  if old.shared_group_id is not null and new.shared_group_id is null then
    new.visibility := 'private';
  end if;

  return new;
end $$;

comment on function public.pin_taak() is
  'Houdt user_id, created_at en id van een taak vast, en visibility en '
  'shared_group_id behalve voor zet_taakzichtbaarheid() (QS8-379/QS8-381). De '
  'kolomgrant is de eerste grendel; dit is de tweede.';

revoke all on function public.pin_taak() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. De RPC — het enige schrijfpad, en hij gaat beide kanten op
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Beide richtingen, en dat is een acceptatiecriterium en geen vanzelfsprekendheid.**
--    📏 Bij `daily_moves` is dit misgegaan: 0197 trok UPDATE en DELETE in met als
--    reden *"een privéregel achteraf naar de groep tillen is nooit besloten"*, en
--    sindsdien is de zichtbaarheid van een Dagzet onveranderlijk. Een lijst die
--    je openbaar maakt en nooit meer privé kunt zetten, is geen keuze maar een val.
--    `p_group_id => null` zet hem terug.
--
-- ⚠️ **Géén bevestigingsargument, en dat is een afwijking van
--    `zet_groepszichtbaarheid()` met een reden.** Daar gaat een omzetting over
--    wat er met terugwerkende kracht over **andere** leden zichtbaar wordt, en
--    dan hoort de zorgvuldigheid van een commitment device erbij (domeinregel 5).
--    Hier gaat het over één eigen regel die de gebruiker voor zijn neus heeft, en
--    die hij met hetzelfde vinkje terugdraait. Een bevestigingsstap per taak is
--    dan een drempel zonder feit — precies wat `BEVESTIGING` in `acties.ts`
--    afwijst.
--
-- ⚠️ **`not_found` dekt ook "niet van jou", en dat is met opzet.** Twee
--    verschillende antwoorden maken hiervan een bestaansorakel: dan leest een
--    willekeurige uuid af óf er een taak achter zit. Dezelfde vorm die
--    `blokkeer()` en `vraag_lidmaatschap_aan()` aanhouden, en de klasse die de
--    security-review op QS8-369 in `registreer_push_token()` vond.

create or replace function public.zet_taakzichtbaarheid(p_taak uuid, p_group_id uuid)
 returns jsonb
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_mij uuid; v_raakt integer;
begin
  v_mij := (select auth.uid());
  if v_mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if not exists (select 1 from todo_items t where t.id = p_taak and t.user_id = v_mij) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- ⚠️ De lidmaatschapstoets staat vóór de sleutel: zet je die eerst, dan is er
  --    een pad waarlangs de pin openstaat terwijl het verzoek nog geweigerd kan
  --    worden. Kort, maar in dezelfde transactie kan er meer gebeuren.
  if p_group_id is not null and not is_group_member(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'geen_groepsgenoot');
  end if;

  perform set_config('app.taak_gedeeld', p_taak::text, true);

  update todo_items
     set visibility      = case when p_group_id is null then 'private' else 'group' end,
         shared_group_id = p_group_id
   where id = p_taak
     and user_id = v_mij;

  get diagnostics v_raakt = row_count;
  perform set_config('app.taak_gedeeld', '', true);

  -- ⚠️ Nul rijen kán hier niet meer — het bestaan is hierboven getoetst — maar
  --    de toets staat er omdat "kan niet" en "wordt niet gemeten" twee dingen
  --    zijn. Verandert de policy of de where hierboven, dan meldt dit het.
  if v_raakt = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'zichtbaarheid', case when p_group_id is null then 'private' else 'group' end,
    'group_id', p_group_id
  );
end $$;

comment on function public.zet_taakzichtbaarheid(uuid, uuid) is
  'Deelt één taak met één groep, of zet hem terug op prive (QS8-381). Het enige '
  'schrijfpad naar todo_items.visibility en shared_group_id.';

-- ⚠️ `revoke` noemt `authenticated` met zoveel woorden (onwrikbare regel 4), en
--    dáárna komt de grant die er wél hoort: dit is de enige functie in deze
--    migratie die een client mag aanroepen.
revoke all on function public.zet_taakzichtbaarheid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zet_taakzichtbaarheid(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Het lidmaatschap eindigt, en de taak sluit mee
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Een gedeelde taak mag het lidmaatschap niet overleven waarop hij
--    leunt.** 📏 Gemeten op 09-09-2026, vóór deze sectie bestond:
--    `verwijder_lid(werk, carla, true)` gaf `{"ok": true}`, het lidmaatschap
--    werd `inactive`, en de taak van Carla stond daarna nog steeds op
--    `visibility = 'group', shared_group_id = werk` — waarna de beheerder hem
--    gewoon terugkreeg uit `todo_items`. Een ex-lid deelt dan door met een groep
--    die hij zelf niet meer kan zien, en kan het ook niet meer terugdraaien
--    vanuit het scherm: `fetchMijnGroepen()` geeft die groep niet meer.
--
--    Dat is precies de vorm die `verwijder_lid()` en `verlaat_groep()` voor
--    ándere oppervlakken al afhandelen: een openstaand `deadline_requests` gaat
--    naar `withdrawn` en de `goal_group_links` van de vertrekker gaan weg. De
--    Lijst was daar niet aan toegevoegd, want die functies zijn ouder dan zij.
--
-- ⚠️⚠️ **De grendel hangt aan het feit en niet aan de twee functies die vandaag
--    een lidmaatschap beëindigen.** Dat is de les uit rij 30 van
--    `docs/decisions/002-domeinregel7-oppervlakken.md`: *"de audit hangt aan een
--    trigger en niet aan de RPC, want een beheerder kan sinds 0029 met één kaal
--    verzoek `status = 'inactive'` zetten."* Hier komt er een tweede reden bij:
--    de twee routes eindigen **verschillend** — `verwijder_lid()` zet
--    `status = 'inactive'`, `verlaat_groep()` **verwijdert** de rij. Eén trigger
--    op `after delete or update` dekt ze allebei, en dekt ook de derde route die
--    er morgen bij komt.
--
--    De vorm is letterlijk die van `noteer_beoordelaar_weg_lid()` (0135), dat om
--    dezelfde reden op dezelfde tabel hangt.
--
-- ⚠️ **Niet dezelfde vraag als de gearchiveerde groep.** Een archief blijft
--    leesbaar (0153, en §2 hierboven), dus een taak die met een gearchiveerde
--    groep gedeeld is blijft gedeeld — dat is de lees/schrijf-splitsing en geen
--    lek. Wat hier sluit is het **lidmaatschap van de eigenaar**, en dat is de
--    grond waarop hij de taak überhaupt mocht delen.

create or replace function public.sluit_gedeelde_taken() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_lid   uuid := coalesce(new.user_id, old.user_id);
  v_groep uuid := coalesce(new.group_id, old.group_id);
begin
  -- ⚠️ `is_group_member()` toetst `status <> 'inactive'`, en `status` kent maar
  --    twee waarden (`group_members_status_valid`). Een UPDATE die niet op
  --    `inactive` landt, eindigt dus niets. Bewust geen toets op `old.status`:
  --    tweemaal sluiten is een lege UPDATE en geen fout, en een trigger die
  --    alleen op de overgang vuurt, mist de rij die al scheef stond.
  if tg_op = 'UPDATE' and new.status <> 'inactive' then
    return new;
  end if;

  -- ⚠️ Twee kolommen en niet één, hoewel `pin_taak()` de tweede zou aanvullen.
  --    Die normalisatie is er voor de foreign key, die maar één kolom kán
  --    schrijven; hier is de bedoeling zichtbaar in de UPDATE zelf. Werking op
  --    afstand is precies hoe een grendel stil kwijtraakt.
  update todo_items
     set visibility      = 'private',
         shared_group_id = null
   where user_id         = v_lid
     and shared_group_id = v_groep;

  return coalesce(new, old);
end $$;

comment on function public.sluit_gedeelde_taken() is
  'Zet de gedeelde taken van een vertrekkend lid terug op prive (QS8-381). '
  'Hangt aan group_members en niet aan verwijder_lid()/verlaat_groep(), want '
  'die twee eindigen een lidmaatschap op twee verschillende manieren.';

revoke all on function public.sluit_gedeelde_taken() from public, anon, authenticated;

drop trigger if exists group_members_taken_sluiten on public.group_members;
create trigger group_members_taken_sluiten
  after delete or update on public.group_members
  for each row execute function public.sluit_gedeelde_taken();

-- ---------------------------------------------------------------------------
-- 6. Het sleutelregister
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit register zit in een functielichaam, en dat is in dit project vier
--    keer bijna duur geworden.** Twee branches die allebei `create or replace`
--    doen, geven git geen conflict: de laatste wint en het register van de ander
--    verdwijnt zonder een woord (QS8-358). Het lichaam hieronder is daarom
--    gekopieerd uit **0227**, de laatste definitie die er op deze branch is, en
--    de enige toevoeging is de rij `app.taak_gedeeld`.
--
--    📏 Bij het hernummeren van 0227 ging dit bijna mis op een manier die verder
--    reikt dan een sleutel: die migratie droeg het lichaam van 0214, en `main`
--    kreeg er daarna 0215 bij die de **derde tak** herschreef. Hernummeren
--    verplaatst een migratie naar áchter migraties waar ze eerst vóór stond, en
--    dan wordt elke `create or replace` erin een terugzetting. Kijk dus bij élke
--    hernummering opnieuw waar dit lichaam vandaan moet komen.

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ Uit 0208 (QS8-360). De huddledag verzetten schuift de start van de
      --    lopende periode, en dan gaat de weekafsluiting die erbij hoort mee —
      --    langs de pin van 0206, die `group_id` en `user_id` onverkort gepind
      --    houdt.
      ('app.huddledag_verzet',    array['zet_huddledag', 'pin_week_review']),
      -- ⚠️ **Deze drie komen uit 0199 (QS8-356) en staan hier omdat een
      --    `create or replace` het hele register vervangt.** Ze zijn er bij het
      --    samenvoegen bijna uit gevallen: de RLS-suite meldde na de merge drie
      --    ongeregistreerde sleutels — `verlaat_groep`,
      --    `beslis_lidmaatschapsverzoek` en `verwijder_lid` — omdat mijn versie
      --    het register van vóór die migratie kopieerde.
      --
      --    Dat is de val van een teller die zijn eigen register in zijn lichaam
      --    draagt: twee branches breiden hem uit, de laatste `replace` wint, en
      --    de ander verdwijnt zonder een woord. Hier ving de teller zichzelf op
      --    doordat hij de weggevallen sleutels meteen als ongeregistreerd meldde.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update']),
      ('app.lid_uitgezet',          array['verwijder_lid', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen']),
      -- ⚠️⚠️ **Deze vijf komen uit 0207 (QS8-361) en waren er bij het samenvoegen
      --    uit gevallen.** Mijn versie kopieerde het register van vóór die
      --    migratie, precies zoals de aantekening bij de drie sleutels van 0199
      --    hierboven beschrijft — de val van een teller die zijn eigen register in
      --    zijn lichaam draagt: twee branches breiden hem uit, de laatste
      --    `replace` wint, en de ander verdwijnt zonder een woord.
      --
      -- 📏 De teller ving zichzelf opnieuw op: `rem_commitments`, `rem_dagzetten`,
      --    `rem_doelinterviews`, `rem_doelkoppelingen` en `rem_voltooiingen`
      --    stonden meteen als ongeregistreerd in de uitslag, en twee RLS-tests
      --    werden er rood van. Dat is de tweede keer op vier dagen; het staat als
      --    QS8-358.
      ('app.rem_commitments',        array['rem_commitments']),
      ('app.rem_voltooiingen',       array['rem_voltooiingen']),
      ('app.rem_dagzetten',          array['rem_dagzetten']),
      ('app.rem_doelkoppelingen',    array['rem_doelkoppelingen']),
      ('app.rem_doelinterviews',     array['rem_doelinterviews']),
      -- ⚠️⚠️ **Uit 0214 (QS8-369), en deze regel is er bijna uit gevallen.**
      --    Die migratie landde op `main` terwijl deze branch openstond en
      --    hernummerde mij van 0214 naar 0215 — dus deze `create or replace`
      --    draait er nu áchteraan. Het register dat ik kopieerde was van vóór hun
      --    migratie, en zonder deze regel had ik `app.rem_pushtokens` er stil
      --    weer uit gehaald.
      --
      --    Dat is exact de val van QS8-358, en de derde keer dat hij toeslaat: een
      --    teller die zijn eigen register in zijn lichaam draagt, twee branches
      --    die hem uitbreiden, en de laatste `replace` wint. 📏 Gevonden door na
      --    het samenvoegen te grepen op wat hún 0214 registreert en dat naast het
      --    mijne te leggen.
      --
      --    ⚠️ **En de teller had zichzelf ook opgevangen**, net als bij 0199 en
      --    0207: `rem_pushtokens()` zet die sleutel nog steeds, dus zonder deze
      --    regel meldt hij hem meteen als ongeregistreerd — 📏 nagemeten, de regel
      --    weghalen geeft `rem_pushtokens: noemt app.rem_pushtokens`. Dat is de
      --    hele reden dat deze grendel bestaat, en het is de derde keer dat hij
      --    zijn eigen register redt.
      ('app.rem_pushtokens',         array['rem_pushtokens']),
      -- ⚠️ Uit 0217 (QS8-374). De zestiende dagteller, en de eerste op een
      --    tabel die niemand rechtstreeks beschrijft: `group_events` is bij
      --    alle zeven schrijvers een neveneffect.
      --
      -- ⚠️⚠️ **En dit register is voor de tweede keer op rij opnieuw uitgelezen
      --    in plaats van gekopieerd.** Toen deze migratie geschreven werd stond
      --    hij op 0215; QS8-376 landde ondertussen op `main` met een 0215 die
      --    déze functie herschrijft — `ilike` in plaats van `like`, en een derde
      --    tak die per sleutel kijkt in plaats van per functie. 📏 Het verschil
      --    is nagemeten met een `diff` tussen wat ik meedroeg en wat er ná hun
      --    migratie in de database stond: mijn kopie had hun hele reparatie
      --    stilzwijgend teruggedraaid. Dat is QS8-358 voor de vierde keer.
      ('app.rem_groepsgebeurtenissen', array['rem_groepsgebeurtenissen']),
      -- ⚠️ Uit 0227 (QS8-379). De Lijst krijgt zijn eigen rem, en dus zijn eigen
      --    sleutel.
      ('app.rem_taken',                array['rem_taken']),
      -- ⚠️ Uit 0248 (QS8-381). `zet_taakzichtbaarheid()` zet hem op het id van
      --    de taak die hij deelt, en `pin_taak()` leest hem om precies díe rij
      --    door te laten. Twee functies, één sleutel: de zetter en de lezer.
      ('app.taak_gedeeld',             array['zet_taakzichtbaarheid', 'pin_taak'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc ilike '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select distinct p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt ' || m.gevonden[1] || ', een app.-sessiesleutel die in geen '
         'enkel register van deze teller staat; een nieuwe sleutel hoort er '
         'met zijn eigen regel in te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(p.prosrc, 'app\.[A-Za-z0-9_]+', 'g') as m(gevonden)
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and lower(m.gevonden[1]) not in (select s.instelling from sleutel s)

   order by 1;
$function$

;

revoke execute on function public.sleutelzetters()
  from public, anon, authenticated;
