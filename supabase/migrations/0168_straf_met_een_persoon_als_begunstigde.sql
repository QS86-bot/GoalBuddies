-- 0168_straf_met_een_persoon_als_begunstigde.sql — een straf mag één persoon als begunstigde hebben (QS8-228)
--
-- ROLLBACK-PAD:
--   drop trigger if exists commitments_begunstigde on commitments;
--   drop function if exists bewaak_begunstigde();
--   plus `create or replace` op `noteer_commitment()` met `auth.uid()` in
--   plaats van `v_actor`. ⚠️ Dat maakt de accountverwijdering van een
--   begunstigde weer onmogelijk; zie de kop.
--   alter table commitments drop constraint if exists commitments_beneficiary_niet_allebei;
--   drop index if exists commitments_beneficiary_user_idx;
--   alter table commitments drop column if exists beneficiary_user_id;
--   alter table commitments add constraint commitments_penalty_has_beneficiary
--     check (type = 'reward' or beneficiary_group_id is not null);
--   plus `create or replace` op `commitments_select` en `commitments_insert`
--   zonder de persoonstak. ⚠️ De kolom droppen wist wie de getuige was; op een
--   gevulde tabel is dat gegevensverlies.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Review van 30-08-2026: "de gebruiker kan geen straf invullen wanneer hij geen
-- vrienden heeft of in een buddygroep zit." Dat is geen schermbeperking maar
-- `commitments_penalty_has_beneficiary` uit 0001.
--
-- Die CHECK had een reden, en die blijft staan: domeinregel 11 zegt dat de
-- begunstigde leesrecht krijgt op het moment dat de straf verschuldigd wordt.
-- Zonder begunstigde ziet niemand hem ooit, en dan is een straf een voornemen
-- in plaats van een commitment device — de werking komt uit het gezien worden.
--
-- Besluit van Quinten (30-08-2026): **één persoon in plaats van een groep.**
-- Niet: geen begunstigde.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Wat hier gemeten is en waarom de CHECK een trigger wordt
-- ---------------------------------------------------------------------------
--
-- `beneficiary_group_id` heeft `on delete set null`, en daarnaast staat de CHECK
-- die een begunstigde eist. Die twee botsen zodra de begunstigde verdwijnt: de
-- `set null` is een UPDATE, en een UPDATE hertoetst de CHECK. Voor groepen is
-- dat dood hout — 0092 archiveert ze en verwijdert ze niet meer.
--
-- **Voor een persoon is het dat niet.** `verwijder_mijn_account()` doet
-- `delete from auth.users`, dat cascadeert naar `profiles`, en daar hangen
-- dertig foreign keys aan. Zou de begunstigde-eis een CHECK blijven, dan
-- **blokkeert een openstaande straf de accountverwijdering van de getuige** —
-- en dat is een route die niets met straffen te maken heeft en die moet blijven
-- werken.
--
-- Daarom:
--   * een CHECK voor wat altijd waar blijft: nooit een groep én een persoon;
--   * een trigger voor wat alleen bij het schrijven geldt: een straf krijgt een
--     begunstigde mee.
--
-- ⚠️ **De trigger vuurt ook voor `service_role`** — een trigger is geen policy —
-- en hij toetst op INSERT én op UPDATE. Wat hij kan en een CHECK niet, is
-- onderscheid maken tussen "iemand haalt de getuige weg" en "de getuige bestaat
-- niet meer".
--
-- ⚠️⚠️ **Hier stond eerst "de trigger is niet zwakker dan de CHECK", en dat was
-- onwaar.** De eerste versie keerde in de UPDATE-tak vroeg terug, zodat de
-- begunstigde-eis daar nooit geëvalueerd werd: `insert` een beloning zonder
-- getuige, dan `update … set type = 'penalty'`, en er stond een straf die
-- niemand ooit ziet. Gemeten in de security-ronde van 06-09-2026, en de test die
-- hem zou vangen bleef groen omdat hij alleen de INSERT-kant voerde.
--
-- **Een opgeschreven grendel die niet bestaat is duurder dan geen grendel.** Die
-- zin stond in deze kop, in het beslisdocument én in het commitbericht; drie
-- plekken waar de volgende lezer op zou vertrouwen.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `add column if not exists`, `drop constraint if exists`,
-- `create or replace` op de functie, en de trigger wordt eerst gedropt.
-- ---------------------------------------------------------------------------

alter table commitments
  add column if not exists beneficiary_user_id uuid references profiles(id) on delete set null;

-- Onwrikbare regel 11: index op elke foreign key.
create index if not exists commitments_beneficiary_user_idx
  on commitments (beneficiary_user_id)
  where beneficiary_user_id is not null;

-- ⚠️ Deze CHECK blijft een CHECK, want hij is waar in élke toestand — ook nadat
--    een `set null` langs is geweest. Twee begunstigden is geen vrijheid maar
--    een ongeldige toestand: dan is niet te zeggen wie de getuige is.
alter table commitments drop constraint if exists commitments_beneficiary_niet_allebei;
alter table commitments add constraint commitments_beneficiary_niet_allebei
  check (beneficiary_group_id is null or beneficiary_user_id is null);

-- ⚠️ **Een persoon als begunstigde hoort alleen bij een straf.** Een beloning is
--    voor jezelf; er is niemand die hem hoort te zien. Vandaag onschadelijk —
--    niets zet een beloning op `due` of `resolved` — maar
--    `commitment_zichtbaar_voor_persoon()` bevat `resolved`, dus het wordt een
--    lek zodra iemand die twee lijsten gelijktrekt. Uit de security-ronde van
--    06-09-2026.
alter table commitments drop constraint if exists commitments_persoon_alleen_bij_straf;
alter table commitments add constraint commitments_persoon_alleen_bij_straf
  check (beneficiary_user_id is null or type = 'penalty');

alter table commitments drop constraint if exists commitments_penalty_has_beneficiary;

/**
 * De begunstigde-eis, en de enige uitzondering erop.
 *
 * ⚠️ **De uitzondering is precies één geval en die is nagemeten:** de
 *    begunstigde bestaat niet meer. Dan heeft de foreign key de kolom leeg
 *    gemaakt, niet een gebruiker. Het verschil is direct te zien — staat er nog
 *    een profiel met dat id, dan was het geen `set null` maar iemand die de
 *    getuige wegpoetst, en dat is precies wat domeinregel 5 verbiedt: een
 *    commitment device gaat niet stilzwijgend uit.
 */
create or replace function bewaak_begunstigde()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verdwenen boolean := false;
begin
  if tg_op = 'UPDATE' then
    -- ⚠️ **Precies één geval waarin de getuige leeg mág worden: hij bestaat
    --    niet meer.** Dan heeft de foreign key de kolom gewist, niet een
    --    gebruiker. Staat er nog een profiel of een groep met dat id, dan was
    --    het iemand die de getuige wegpoetst, en dat is wat domeinregel 5
    --    verbiedt: een commitment device gaat niet stilzwijgend uit.
    if old.beneficiary_user_id is not null and new.beneficiary_user_id is null then
      if exists (select 1 from profiles p where p.id = old.beneficiary_user_id) then
        raise exception 'De begunstigde van een commitment is niet weg te halen zolang hij bestaat'
          using errcode = 'check_violation';
      end if;
      v_verdwenen := true;
    end if;

    if old.beneficiary_group_id is not null and new.beneficiary_group_id is null then
      if exists (select 1 from groups g where g.id = old.beneficiary_group_id) then
        raise exception 'De begunstigde van een commitment is niet weg te halen zolang hij bestaat'
          using errcode = 'check_violation';
      end if;
      v_verdwenen := true;
    end if;
  end if;

  -- ⚠️⚠️ **Deze toets stond eerst alleen op INSERT, en dat maakte de trigger
  --    strikt zwákker dan de CHECK die hij verving** — terwijl de kop hierboven
  --    het tegendeel beweerde. Gemeten in de security-ronde van 06-09-2026:
  --    `insert` een beloning zonder getuige, dan `update … set type = 'penalty'`,
  --    en er stond een straf die niemand ooit ziet. Precies de toestand die deze
  --    migratie bestaat om te verbieden, en de test die hem zou vangen bleef
  --    groen omdat hij alleen de INSERT-kant voerde.
  --
  --    Een opgeschreven grendel die niet bestaat is duurder dan geen grendel:
  --    de volgende lezer bouwt erop.
  if new.type = 'penalty'
     and new.beneficiary_group_id is null
     and new.beneficiary_user_id is null
     and not v_verdwenen then
    raise exception 'Een straf heeft een begunstigde nodig'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ **Jezelf aanwijzen is geen getuige hebben.** `shares_group_with_user()`
  --    is waar voor je eigen id zodra je in één groep zit — die functie joint
  --    `group_members` op zichzelf, en je eigen rij voldoet aan beide kanten.
  --    Gemeten in dezelfde ronde: één gewoon API-verzoek en je hebt een straf
  --    die aan elke grendel voldoet en die letterlijk niemand ziet. Dat is de
  --    lege kring waar de kop van deze migratie over gaat.
  --
  --    Staat hier én in `commitments_insert`: de policy houdt de client tegen,
  --    de trigger ook `service_role`.
  --    Het anker is `goals.owner_id` en niet `auth.uid()`: een straf hoort bij
  --    een doel, en de eigenaar daarvan is degene die de consequentie draagt.
  --    `auth.uid()` is leeg in de rollover en zou de toets daar stilzwijgend
  --    uitzetten.
  if new.beneficiary_user_id is not null
     and exists (
       select 1 from goals g
       where g.id = new.goal_id and g.owner_id = new.beneficiary_user_id
     ) then
    raise exception 'Je kunt niet je eigen getuige zijn'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function bewaak_begunstigde() from public, anon, authenticated;

drop trigger if exists commitments_begunstigde on commitments;
create trigger commitments_begunstigde
  before insert or update of type, beneficiary_group_id, beneficiary_user_id
  on commitments
  for each row execute function bewaak_begunstigde();

-- ---------------------------------------------------------------------------
-- ⚠️⚠️ De tweede naad: het spoor overleefde zijn eigen actor niet
-- ---------------------------------------------------------------------------
--
-- Nadat de CHECK een trigger geworden was, viel de accountverwijdering van de
-- getuige alsnog om — één stap verder in dezelfde keten:
--
--   insert or update on table "commitment_events" violates foreign key
--   constraint "commitment_events_actor_id_fkey"
--   Key (actor_id)=(724d…) is not present in table "profiles".
--
-- De `set null` op `beneficiary_user_id` is een UPDATE op `commitments`, en die
-- vuurt `commitments_audit`. Dat schrijft een spoorregel met
-- `actor_id = auth.uid()` — en dat is precies het profiel dat op dat moment al
-- weg is. `commitment_events.actor_id` heeft zelf `on delete set null`, maar dat
-- helpt niet: de rij wordt aangemáákt terwijl het profiel er al niet meer is.
--
-- ⚠️ **Dit stond er al vóór dit issue**, voor elke andere `on delete set null`
-- die `commitments` raakt — maar er was geen kolom die naar een profiel wees, dus
-- niemand kon erop stuiten. Het is dus geen regressie maar een gat dat pas
-- bereikbaar werd.
--
-- ⚠️ **Niet oplossen door het spoor over te slaan.** Domeinregel 5 zegt dat een
-- commitment device auditeerbaar is, en "de getuige is verdwenen" is een
-- materiële wijziging aan de afspraak. De regel hoort er te staan; wat er niet
-- hoort te staan is een actor die niet bestaat. Die wordt `null`, en dat is
-- precies wat `on delete set null` een moment later zelf gedaan zou hebben.

create or replace function noteer_commitment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_soort      text;
  v_doelstatus text;
  v_actor      uuid;
begin
  if tg_op = 'INSERT' then
    v_soort := 'confirmed';
  elsif old.status is distinct from new.status then
    v_soort := case new.status
                 when 'cancelled' then 'cancelled'
                 when 'resolved'  then 'resolved'
                 else 'triggered'          -- unlocked en due
               end;
  else
    -- Alleen de tekst veranderd, of de begunstigde die verdween.
    v_soort := 'edited';
  end if;

  select g.status into v_doelstatus from goals g where g.id = new.goal_id;

  -- ⚠️ **Een actor die niet meer bestaat, is `null` en niet een foutmelding.**
  --    Zie de kop: tijdens het verwijderen van een account is `auth.uid()` een
  --    profiel dat er al niet meer is, en de foreign key weigert dan de
  --    spoorregel — waarmee de hele accountverwijdering omvalt.
  select case when exists (select 1 from profiles p where p.id = auth.uid())
              then auth.uid()
         end
    into v_actor;

  insert into commitment_events (commitment_id, actor_id, event_type, payload)
  values (
    new.id,
    v_actor,
    v_soort,
    jsonb_build_object(
      'type',       new.type,
      'van',        case when tg_op = 'INSERT' then null else old.status end,
      'naar',       new.status,
      'doelstatus', v_doelstatus
    )
  );

  return new;
end;
$function$;

revoke all on function noteer_commitment() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wie mag je kiezen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **In de policy en niet in een RPC**, anders dan het issue voorstelde. Er ís
-- geen RPC: `zetStraf()` doet een gewone insert en `commitments_insert` is wat
-- hem begrenst. Een RPC erbij bouwen zou de grens verplaatsen naar een tweede
-- pad terwijl het eerste open blijft.
--
-- ⚠️ **`shares_group_with_user()` en niet "elke gebruiker".** Een vreemde als
-- begunstigde kiezen is een manier om iemand ongevraagd getuige te maken van je
-- straf. Die functie eist bovendien dat béíde kanten actief lid zijn (0102), dus
-- een uitgezet lid telt niet mee.
drop policy if exists commitments_insert on commitments;
create policy commitments_insert on commitments
  for insert to authenticated
  with check (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    and status = 'set'
    and (beneficiary_group_id is null or is_group_member(beneficiary_group_id))
    and (beneficiary_user_id is null or shares_group_with_user(beneficiary_user_id))
  );

-- ⚠️⚠️ **Hier stond ook een toets tegen zelfnominatie, en die is er weer uit —
-- niet omdat de regel niet klopt, maar omdat de ijking hem niet kon vinden.**
-- De trigger toetst hetzelfde en vuurt voor élke schrijver, dus de conjunct in
-- deze policy weghalen maakte géén enkele test rood: elk geval liep alsnog tegen
-- de trigger aan. Dat is precies wat CLAUDE.md bij regel 18 beschrijft — een
-- ijking die zijn geval door een pad voert dat een éérdere grendel al afvangt,
-- bewaakt niets van wat hij belooft.
--
-- Twee kopieën van dezelfde regel die geen van beide los te toetsen zijn, is de
-- vorm die stil uit de pas gaat lopen. Eén plek, en dat is de sterkste: de
-- trigger bindt ook `service_role`.
--
-- ⚠️ De **bandtoets** blijft wél hier en niet in de trigger, en dat is geen
-- inconsequentie: die gaat over wie een *gebruiker* mag kiezen. `service_role`
-- is het systeem en geen gebruiker.

-- ---------------------------------------------------------------------------
-- Dezelfde band op UPDATE, en niet omdat het vandaag kan
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Wat een gebruiker vandaag tegenhoudt is een kolomgrant uit 0057, niet
-- deze policy.** `authenticated` mag alleen `body`, `image_url` en `status`
-- bijwerken, dus `beneficiary_user_id` wisselen ketst af op `permission denied`
-- — gemeten in de security-ronde van 06-09-2026.
--
-- **Dat is erfenis en geen besluit.** De dag dat er een "wissel van getuige"
-- komt en die kolom aan de grant wordt toegevoegd, is de bandtoets in één regel
-- weg en wordt er niets rood van. De policy zegt het nu zelf.
drop policy if exists commitments_update on commitments;
create policy commitments_update on commitments
  for update to authenticated
  using (
    status = 'set'
    and exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
  )
  with check (
    status in ('set', 'cancelled')
    and exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    and (beneficiary_group_id is null or is_group_member(beneficiary_group_id))
    and (beneficiary_user_id is null or shares_group_with_user(beneficiary_user_id))
  );

-- ---------------------------------------------------------------------------
-- Wat de begunstigde ziet, en wanneer
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een eigen lijst en niet die van de groep.** `commitment_zichtbaar_voor_groep()`
-- begint bij `unlocked`, en dat is de beloningskant: vrijgespeeld mag gezien
-- worden. Voor één persoon als begunstigde van een **straf** geldt domeinregel 11
-- onverkort — leesrecht op het moment dat hij verschuldigd wordt, en geen seconde
-- eerder. `resolved` staat erbij omdat een straf die is afgewikkeld wél
-- verschuldigd is geweest; hem daarna weer verbergen wist de getuige achteraf.
create or replace function commitment_zichtbaar_voor_persoon()
returns text[]
language sql
immutable parallel safe
set search_path = public, pg_temp
as $$
  select array['due', 'resolved']::text[];
$$;

revoke all on function commitment_zichtbaar_voor_persoon() from public, anon, authenticated;
grant execute on function commitment_zichtbaar_voor_persoon() to authenticated, service_role;

drop policy if exists commitments_select on commitments;
create policy commitments_select on commitments
  for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    or (
      beneficiary_group_id is not null
      and status = any (commitment_zichtbaar_voor_groep())
      and mag_groep_lezen(beneficiary_group_id)
    )
    or (
      beneficiary_user_id = (select auth.uid())
      and status = any (commitment_zichtbaar_voor_persoon())
    )
  );
