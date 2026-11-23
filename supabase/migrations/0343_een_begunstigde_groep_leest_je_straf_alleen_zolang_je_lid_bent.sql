-- 0343_een_begunstigde_groep_leest_je_straf_alleen_zolang_je_lid_bent.sql — een
-- begunstigde groep leest je straf niet meer na je vertrek of uitzetting, en de
-- straf zit je dan niet meer vast (QS8-820, meting QS8-818).
--
-- ROLLBACK-PAD (alleen policies en functielichamen, geen gegevens):
--   commitments_select terugzetten uit 0325 (het lichaam hieronder zonder de
--     regel met `straf_groepsband_klopt_voor_mij`);
--   commitments_update terugzetten uit 0168 (de WITH CHECK hieronder zonder
--     `or status = 'cancelled'`);
--   meld_commitment() terugzetten uit 0325 (het lichaam hieronder zonder de
--     twee regels met QS8-820);
--   herstel_stuurloze_straf() terugzetten uit 0244;
--   bewaak_begunstigde() terugzetten uit `pg_get_functiondef()` van vóór deze
--     migratie (het lichaam hieronder zonder de twee blokken met QS8-820);
--   drop function if exists public.straf_groepsband_klopt_voor_mij(uuid, uuid);
--   drop function if exists public.straf_groepsband_klopt(uuid, uuid);
--   drop trigger if exists commitments_intrekking on public.commitments;
--   drop function if exists public.bewaak_intrekking();
--
-- laat bewust vallen: and (beneficiary_group_id is null or is_group_member(beneficiary_group_id))
-- laat bewust vallen: and (beneficiary_user_id is null or shares_group_with_user(beneficiary_user_id))
--   (beide staan er nog, met `or status = 'cancelled'` erachter: intrekken hoeft geen band, blok 3)
-- laat bewust vallen: if exists (select 1 from groups g where g.id = old.beneficiary_group_id) then
--   (staat er nog als `elsif exists …`, na de uitzondering van blok 5a)
-- laat bewust vallen: set search_path = public, pg_temp
--   (bewaak_begunstigde() is gekopieerd uit `pg_get_functiondef()`, en dat spelt hetzelfde pad als
--   `SET search_path TO 'public', 'pg_temp'`)
--
--   ⚠️ Terugdraaien opent weer wat QS8-818 mat: een groep die je verliet, of die
--      jou eruit zette, leest je straf zodra hij verschuldigd is, en ook wie pas
--      ná je vertrek toetrad.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten in QS8-818 (23-11-2026), lokaal op 345 migraties.** Alice zet een
--    straf met groep X als begunstigde en verlaat X. Daarna:
--      - de straf blijft `set` met X als begunstigde. `verlaat_groep()` raakt
--        `commitments` niet;
--      - Alice kan hem niet meer intrekken: de WITH CHECK van
--        `commitments_update` eist `is_group_member(beneficiary_group_id)`. Bij
--        uitzetting (`verwijder_lid(…, true)`) is dat ook zo, en dan kan ze ook
--        niet terug;
--      - wordt de straf `due`, dan lezen alle actieve leden van X tekst, foto en
--        stand. Dat geldt ook voor een lid dat pas ná haar vertrek toetrad;
--      - `meld_commitment()` plaatst `commitment_due` in X.
--
-- **Besluit van Quinten (23-11-2026, meerkeuze via de hoofdorchestrator): optie
-- C, gelijktrekken met de getuige (QS8-306) en de teamstraf (M1, 0325). Een straf
-- die nog niet verschuldigd is, blijft bij vertrek staan.** Er komt geen
-- automatische intrekking.
--
-- En drie open punten, door Quinten beslist per meerkeuze op 23-11 (QS8-820):
--
--   (a) **Een straf die al verschuldigd is, wordt ook verborgen.** X leest hem
--       niet meer zodra de eigenaar geen actief lid meer is, welke stand hij ook
--       heeft. Dat is de vorm van de getuige en de teamstraf. Keert de eigenaar
--       terug, dan leest X weer. Een `commitment_due`-bericht dat al geplaatst
--       is, blijft staan: een systeembericht is een onveranderlijke kopie
--       (domeinregel 7, tweede slot).
--   (b) **Een archief verbreekt de band niet.** De eigenaar is nog lid van een
--       gearchiveerde X, dus X leest zoals nu (een archief is leesbaar, 0153).
--       Wel kan de eigenaar een straf die nog niet verschuldigd is ook in een
--       gearchiveerde X intrekken, en er komt in een gearchiveerde X geen nieuw
--       `commitment_due`-bericht.
--   (c) **Vertrek ná `due`: de straf is stuurloos.** Is de eigenaar geen actief
--       lid meer van de begunstigde groep, dan behandelt
--       `herstel_stuurloze_straf()` de straf zoals een straf waarvan de getuige
--       verdween (0244). De eigenaar kan hem zelf afwikkelen (met bevestiging),
--       of een nieuwe persoonlijke getuige kiezen.
--   (K2) **Afwikkelen haalt de groep van de straf** (besluit van Quinten, 23-11,
--       op een bevinding van de security-review). Anders leest de groep na een
--       terugkeer "voldaan" op het woord van de eigenaar.
--   (aanvulling, 17:16 UTC) **Intrekken kan ook als de persoonlijke getuige geen
--       groep meer met de eigenaar deelt.**
--
-- ⚠️ **Ook een beloning volgt de band** (security-review L3). De groepstak van
--    `commitments_select` filtert niet op `type`: een `unlocked` beloning met een
--    begunstigde groep is na het vertrek van de eigenaar ook onzichtbaar voor die
--    groep. Dat is dezelfde regel, en geen tweede besluit.
--
-- ⚠️ **"Actief lid" is hier `status <> 'inactive'`, precies zoals
--    `deelt_groep_met_eigenaar()` en `straf_teamband_klopt()` hem trekken.** Een
--    lid met een adempauze (`paused`) is nog lid. En er staat geen archieftoets
--    in, want dat is besluit (b).
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De band tussen eigenaar en begunstigde groep
-- ---------------------------------------------------------------------------

create or replace function public.straf_groepsband_klopt(p_goal_id uuid, p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from goals g
      join group_members m on m.group_id = p_group_id
                          and m.user_id  = g.owner_id
                          and m.status  <> 'inactive'
     where g.id = p_goal_id
  );
$$;
-- ⚠️ **Geen grant voor `authenticated`.** Hij vertelt of de eigenaar van een doel
--    lid is van een groep, voor elk paar uuid's. Een client die hem mag
--    aanroepen, heeft een orakel op lidmaatschap. Alleen de definer-functies
--    hieronder roepen hem aan; de policy gebruikt de variant hieronder.
revoke all on function public.straf_groepsband_klopt(uuid, uuid) from public, anon, authenticated;

create or replace function public.straf_groepsband_klopt_voor_mij(p_goal_id uuid, p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- ⚠️ **De vrager moet zelf actief lid van die groep zijn**, anders `false`. In
  --    de policy staat `mag_groep_lezen()` er al naast, dus daar kost dit niets.
  --    Rechtstreeks aangeroepen sluit het het orakel van hierboven: wie geen lid
  --    van de groep is, hoort niets over wie er lid van is.
  select exists (
           select 1 from group_members m
            where m.group_id = p_group_id
              and m.user_id  = (select auth.uid())
              and m.status  <> 'inactive')
     and public.straf_groepsband_klopt(p_goal_id, p_group_id);
$$;
revoke all on function public.straf_groepsband_klopt_voor_mij(uuid, uuid) from public, anon, authenticated;
grant execute on function public.straf_groepsband_klopt_voor_mij(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De leesroute: de groepstak eist de band (besluit C en punt a)
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het lichaam is **woordelijk** dat van 0325 (de laatste definitie op `main`,
--    nagemeten met `pg_policies` op de lokale stack), plus één regel in tak 2.
--    De `(select …)::text[]`-wikkel van 0254 §7 blijft staan.
drop policy if exists commitments_select on public.commitments;
create policy commitments_select on public.commitments
  for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    or (
      beneficiary_group_id is not null
      and status = any ((select commitment_zichtbaar_voor_groep())::text[])
      and mag_groep_lezen(beneficiary_group_id)
      and straf_teamband_klopt_voor_mij(goal_id)
      -- QS8-820: alleen zolang de eigenaar actief lid van deze groep is.
      and straf_groepsband_klopt_voor_mij(goal_id, beneficiary_group_id)
    )
    or (
      beneficiary_user_id = (select auth.uid())
      and status = any ((select commitment_zichtbaar_voor_persoon())::text[])
      and deelt_groep_met_eigenaar(goal_id)
      and straf_teamband_klopt_voor_mij(goal_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Intrekken loopt niet meer stuk op `is_group_member` (besluit C en punt b)
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Drie gevallen, één regel** (aanvulling van Quinten, 23-11 17:16 UTC, gevonden
--    bij QS8-814): de eigenaar verliet de groep of werd eruit gezet; de groep is
--    gearchiveerd; de persoonlijke getuige deelt geen groep meer met de eigenaar.
--    In alle drie liep intrekken stuk op de WITH CHECK, ook als alleen de status
--    veranderde. De auditrij schrijft `noteer_commitment()` zelf bij de
--    statuswissel.
--
-- ⚠️ **De versoepeling geldt alleen voor de stand `cancelled`.** Een straf die
--    op `set` blijft, met een nieuwe tekst of een andere begunstigde, eist nog
--    steeds dat je lid bent van de groep die erop staat. Dat is dezelfde eis als
--    `commitments_insert` stelt. Intrekken is de enige handeling die nergens een
--    groep voor nodig heeft: na `cancelled` leest niemand anders de straf
--    (`commitment_zichtbaar_voor_groep()` kent die stand niet), en de USING eist
--    `set`, dus er komt daarna niets meer.
--
-- ⚠️ **Een WITH CHECK ziet de oude rij niet.** Een intrekking die tegelijk de
--    begunstigde verzet, zou hier dus doorkomen. Een client kan dat niet: de
--    kolomgrant op `commitments` laat `authenticated` alleen `body`, `image_url`
--    en `status` bijwerken (📏 `information_schema.column_privileges`, 23-11).
--    `bewaak_begunstigde()` hieronder weigert het daarnaast voor `service_role`
--    en elke definer-functie (blok 5b), zodat de versoepeling niet aan één slot
--    hangt.
drop policy if exists commitments_update on public.commitments;
create policy commitments_update on public.commitments
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
    -- QS8-820: intrekken kan ook nadat je de groep verliet, eruit werd gezet, of
    -- als de groep gearchiveerd is.
    and (beneficiary_group_id is null or is_group_member(beneficiary_group_id) or status = 'cancelled')
    -- QS8-820, aanvulling van Quinten (23-11, 17:16 UTC): en ook als je getuige
    -- geen groep meer met je deelt.
    and (beneficiary_user_id is null or shares_group_with_user(beneficiary_user_id) or status = 'cancelled')
  );

-- ---------------------------------------------------------------------------
-- 4. Geen `commitment_due` in een groep zonder de eigenaar, of in een archief
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het lichaam is **woordelijk** dat van 0325 (de laatste definitie op `main`,
--    nagemeten met `pg_get_functiondef()`), plus twee regels. Gekopieerd en niet
--    herschreven (QS8-358).
CREATE OR REPLACE FUNCTION public.meld_commitment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner_id uuid;
begin
  begin
    if old.status = new.status then return new; end if;

    select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
    if v_owner_id is null then return new; end if;

    if new.type = 'reward' and new.status = 'unlocked' then
      perform plaats_systeembericht_in_doelgroepen(
        new.goal_id,
        'commitment_unlocked',
        'Een lid heeft een beloning vrijgespeeld.',
        v_owner_id
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_unlocked', 'bereik', 'doelgroepen'));

    elsif new.type = 'penalty'
      and new.status = 'due'
      and new.beneficiary_group_id is not null
      -- ⚠️ QS8-660, besluit V11 van Quinten (20-11-2026): een straf op een
      --    aandeel wiens eigenaar het team verliet, wordt niet meer in de
      --    teamchat gemeld. De leesroutes eisten dat al (besluit M1, 18-11);
      --    dit bericht ontsnapte eraan. Voor elk ander doel geeft de functie
      --    `true` en verandert er niets.
      and straf_teamband_klopt(new.goal_id, v_owner_id)
      -- QS8-820 (besluit C): niet in een groep waar de eigenaar geen actief lid
      -- meer van is. De groep leest de straf dan ook niet.
      and straf_groepsband_klopt(new.goal_id, new.beneficiary_group_id)
      -- QS8-820 (punt b): niet in een gearchiveerde groep. Daar komt niets meer bij.
      and exists (select 1 from groups gr
                   where gr.id = new.beneficiary_group_id and gr.status <> 'archived')
    then
      perform plaats_systeembericht(
        new.beneficiary_group_id,
        'commitment_due',
        'De inzet die een lid zelf heeft ingesteld, is verschuldigd geworden.',
        v_owner_id
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_due',
                                 'bereik', 'begunstigde_groep',
                                 'group_id', new.beneficiary_group_id));
    end if;
  exception
    when others then
      raise warning 'Systeembericht voor commitment % is niet geplaatst: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 5. `bewaak_begunstigde()`: twee blokken erbij
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het lichaam is **woordelijk** de gedéployde definitie (`pg_get_functiondef()`
--    op de lokale stack van `main` = `1d4ee96`), plus blok 5a en 5b.
--
-- 5a. **Een stuurloze groep mag plaatsmaken voor een persoon (punt c).** Tot nu
--     toe mocht de begunstigde groep alleen leeg worden als ze niet meer bestond.
--     `herstel_stuurloze_straf()` moet een nieuwe getuige kunnen zetten op een
--     straf waarvan de eigenaar geen lid meer is van de groep, en
--     `commitments_beneficiary_niet_allebei` (0168) eist dan dat de groep leeg
--     wordt. De uitzondering is smal: alleen als de band echt weg is, en dan
--     alleen `due → due` met een persoon ervoor in de plaats, of `due → resolved`
--     zonder iemand ervoor in de plaats (besluit K2). Een client komt hier niet:
--     de USING van `commitments_update` eist `set`.
--
-- 5b. **Een intrekking verzet de begunstigde niet.** De WITH CHECK van
--     `commitments_update` laat `cancelled` door zonder lidmaatschap (blok 3), en
--     ziet de oude rij niet. Voor een client is de kolomgrant het eerste slot;
--     dit is het tweede, en het enige voor `service_role`.
CREATE OR REPLACE FUNCTION public.bewaak_begunstigde()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_verdwenen boolean := false;
begin
  if tg_op = 'UPDATE' then
    -- ⚠️ QS8-820 (5b): een intrekking laat de begunstigde staan. Zonder dit blok
    --    kon een eigenaar die de groep verliet, bij het intrekken een andere
    --    groep of persoon op de straf zetten. De policy laat `cancelled` door
    --    zonder lidmaatschap, en ziet de oude rij niet.
    if new.status = 'cancelled' and old.status is distinct from 'cancelled'
       and (new.beneficiary_group_id is distinct from old.beneficiary_group_id
            or new.beneficiary_user_id is distinct from old.beneficiary_user_id) then
      raise exception 'Een intrekking verandert de begunstigde niet'
        using errcode = 'check_violation';
    end if;

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
      -- ⚠️ QS8-820 (5a): de tweede uitzondering. De groep bestaat nog, maar de
      --    eigenaar is er geen lid meer van, en er komt een persoon voor in de
      --    plaats. Alleen op een verschuldigde straf, en dus alleen via
      --    `herstel_stuurloze_straf()`. De straf gaat niet uit: hij krijgt een
      --    andere getuige.
      if old.status = 'due' and new.status = 'due'
         and old.beneficiary_user_id is null
         and new.beneficiary_user_id is not null
         and not public.straf_groepsband_klopt(old.goal_id, old.beneficiary_group_id) then
        null;
      -- ⚠️ QS8-820 (5a, besluit K2 van Quinten, 23-11): wie de straf afwikkelt
      --    terwijl hij geen lid van de groep is, haalt de groep eraf. Anders leest
      --    de groep na een terugkeer "voldaan" op het woord van de eigenaar. Net
      --    als bij een verdwenen getuige (0244) staat er dan niemand meer op.
      elsif old.status = 'due' and new.status = 'resolved'
         and old.beneficiary_user_id is null
         and new.beneficiary_user_id is null
         and not public.straf_groepsband_klopt(old.goal_id, old.beneficiary_group_id) then
        v_verdwenen := true;
      elsif exists (select 1 from groups g where g.id = old.beneficiary_group_id) then
        raise exception 'De begunstigde van een commitment is niet weg te halen zolang hij bestaat'
          using errcode = 'check_violation';
      else
        v_verdwenen := true;
      end if;
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
$function$
;

-- ---------------------------------------------------------------------------
-- 6. `herstel_stuurloze_straf()`: een groep zonder de eigenaar is stuurloos (punt c)
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het lichaam is **woordelijk** dat van 0244 (nagemeten met
--    `pg_get_functiondef()`; 0274 noemt hem alleen), met één verschil: wat
--    "stuurloos" is. Tot nu toe was dat "geen begunstigde". Nu is het óók "een
--    begunstigde groep waar de eigenaar geen actief lid meer van is". Een
--    persoonlijke getuige die geen groep meer deelt, valt hier níet onder: dat is
--    een ander besluit (QS8-306), en de getuige ziet de straf dan al niet meer.
--
-- ⚠️ **Afwikkelen haalt de groep eraf (besluit K2 van Quinten, 23-11).** De eerste
--    versie liet hem staan, en de security-review mat wat daaruit volgde: de
--    eigenaar verlaat X, wikkelt af, komt terug met de code, en X leest "deze
--    inzet is voldaan" op zijn woord. Nu staat er, net als bij een verdwenen
--    getuige (0244), niemand meer op. Het spoor noemt de groep. Een nieuwe getuige
--    vervangt de groep (5a), want een straf heeft er één (0168), maar niet op een
--    aandeel waarvan de eigenaar het team verliet: die getuige leest hem nooit.
CREATE OR REPLACE FUNCTION public.herstel_stuurloze_straf(p_commitment_id uuid, p_actie text, p_getuige uuid DEFAULT NULL::uuid, p_bevestigd boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c        commitments%rowtype;
  v_eigenaar uuid;
  -- QS8-820: de groep op de straf, als de eigenaar er geen lid meer van is.
  v_losse_groep uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if p_actie is null or p_actie not in ('nieuwe_getuige', 'afwikkelen') then
    return jsonb_build_object('ok', false, 'reason', 'onbekende_actie');
  end if;

  select * into c from commitments where id = p_commitment_id;
  if c.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select g.owner_id into v_eigenaar from goals g where g.id = c.goal_id;
  if v_eigenaar is null or v_eigenaar <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if c.type <> 'penalty' then
    return jsonb_build_object('ok', false, 'reason', 'geen_straf');
  end if;

  if c.status <> 'due' then
    return jsonb_build_object('ok', false, 'reason', 'niet_verschuldigd');
  end if;

  -- QS8-820 (punt c): een begunstigde groep zonder de eigenaar telt als stuurloos.
  if c.beneficiary_group_id is not null
     and not straf_groepsband_klopt(c.goal_id, c.beneficiary_group_id) then
    v_losse_groep := c.beneficiary_group_id;
  end if;

  -- ⚠️ Zie de kop: leeg betekent hier verdwenen, want leeg schrijven kan niemand.
  if c.beneficiary_user_id is not null
     or (c.beneficiary_group_id is not null and v_losse_groep is null) then
    return jsonb_build_object('ok', false, 'reason', 'heeft_nog_een_begunstigde');
  end if;

  if p_actie = 'nieuwe_getuige' then
    if p_getuige is null then
      return jsonb_build_object('ok', false, 'reason', 'getuige_ontbreekt');
    end if;

    if p_getuige = v_eigenaar then
      return jsonb_build_object('ok', false, 'reason', 'niet_jezelf');
    end if;

    -- `shares_group_with_user()` leest `auth.uid()`, en dat is hier de eigenaar.
    -- Dezelfde eis als `commitments_insert` stelt bij het aanmaken.
    if not shares_group_with_user(p_getuige) then
      return jsonb_build_object('ok', false, 'reason', 'geen_groepsgenoot');
    end if;

    -- ⚠️ QS8-820 (security-review M1, gemeten): een getuige die de straf niet kan
    --    lezen is geen getuige. Op een aandeel eist elke leesroute dat eigenaar én
    --    lezer nu in het team zitten (besluit M1, 0325). Heeft de eigenaar het team
    --    verlaten, dan leest geen enkele nieuwe getuige de straf, en bleef er een
    --    straf staan die niemand ziet en die de eigenaar niet meer kon afwikkelen.
    --    Dan blijft alleen afwikkelen over.
    if not straf_teamband_klopt(c.goal_id, p_getuige) then
      return jsonb_build_object('ok', false, 'reason', 'getuige_leest_hem_niet');
    end if;

    -- ⚠️ **De voorwaarden staan hier nóg een keer, en dat is geen dubbelop.**
    --    Tussen het lezen van `c` en deze update ziet elk statement onder READ
    --    COMMITTED verse gegevens. Twee keer tikken — of een retry van de client —
    --    zag anders allebei `null`, schreef allebei een `edited`-auditrij met een
    --    andere getuige, en dan noemt het spoor twee overdrachten waar er één was.
    --    In een tabel die append-only is (domeinregel 6) is dat niet te
    --    corrigeren. Onwrikbare regel 9 doet hetzelfde voor goedkeuringen, daar
    --    met een unieke constraint.
    --
    --    QS8-820: de groep in de `where` is dezelfde als die hierboven gelezen
    --    is. Is de eigenaar intussen teruggekeerd, dan vangt
    --    `bewaak_begunstigde()` (5a) het op.
    update commitments
       set beneficiary_user_id  = p_getuige,
           beneficiary_group_id = null
     where id = p_commitment_id
       and status = 'due'
       and beneficiary_user_id is null
       and beneficiary_group_id is not distinct from v_losse_groep;

    if not found then
      return jsonb_build_object('ok', false, 'reason', 'intussen_veranderd');
    end if;

    -- ⚠️ **Een tweede rij naast die van de trigger, en met opzet.**
    --    `noteer_commitment()` schrijft bij een wijziging zonder statuswissel een
    --    `edited`-rij, en die zegt niet wát er veranderde. Domeinregel 5 vraagt
    --    dat een commitment device auditeerbaar is; "er is iets bewerkt" is dat
    --    niet. Deze rij noemt de reden en de nieuwe getuige. De trigger blijft
    --    ongemoeid — die staat op de branch van QS8-361 ook onder handen, en
    --    twee migraties die hetzelfde functielichaam herschrijven geven een
    --    schone merge met een verdwenen register.
    --
    --    QS8-820: bij een groep zonder de eigenaar noemt de rij die groep en een
    --    eigen reden, zodat het spoor zegt wélke getuige er wegviel.
    insert into commitment_events (commitment_id, actor_id, event_type, payload)
    values (
      p_commitment_id,
      auth.uid(),
      'edited',
      case when v_losse_groep is null then
        jsonb_build_object(
          'reden',          'getuige_verdwenen',
          'nieuwe_getuige', p_getuige
        )
      else
        jsonb_build_object(
          'reden',          'groep_verlaten',
          'vorige_groep',   v_losse_groep,
          'nieuwe_getuige', p_getuige
        )
      end
    );

    return jsonb_build_object('ok', true, 'actie', 'nieuwe_getuige');
  end if;

  -- p_actie = 'afwikkelen'
  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'niet_bevestigd');
  end if;

  -- ⚠️ Zelfde reden als hierboven: de voorwaarde hoort in de `where` en niet
  --    alleen in de toets ervoor. QS8-820: en de band moet nog steeds weg zijn.
  --
  -- ⚠️ QS8-820, besluit K2 van Quinten (23-11): bij een groep zonder de eigenaar
  --    gaat de groep er bij het afwikkelen af. Keert de eigenaar terug, dan leest
  --    die groep geen "voldaan" op zijn woord. `bewaak_begunstigde()` (5a) laat
  --    precies deze overgang toe.
  --
  -- ⚠️ Twee takken en niet één `set … = null`: noemt de update de kolom, dan
  --    vuurt `bewaak_begunstigde()`, en bij een verdwenen getuige (beide al leeg)
  --    weigert die dan met "een straf heeft een begunstigde nodig". Gemeten in
  --    `tests/rls/stuurloze-straf.test.ts`.
  if v_losse_groep is null then
    update commitments
       set status = 'resolved'
     where id = p_commitment_id
       and status = 'due'
       and beneficiary_user_id is null
       and beneficiary_group_id is null;
  else
    update commitments
       set status = 'resolved',
           beneficiary_group_id = null
     where id = p_commitment_id
       and status = 'due'
       and beneficiary_user_id is null
       and beneficiary_group_id = v_losse_groep
       and not straf_groepsband_klopt(goal_id, v_losse_groep);
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'intussen_veranderd');
  end if;

  -- QS8-820: het spoor (alleen voor de eigenaar) noemt welke groep er afging.
  if v_losse_groep is not null then
    insert into commitment_events (commitment_id, actor_id, event_type, payload)
    values (
      p_commitment_id,
      auth.uid(),
      'edited',
      jsonb_build_object('reden', 'groep_verlaten', 'vorige_groep', v_losse_groep)
    );
  end if;

  -- Hier schrijft `noteer_commitment()` zelf een `resolved`-rij met `van` en
  -- `naar`, en die is volledig: de statuswissel ís de gebeurtenis.
  return jsonb_build_object('ok', true, 'actie', 'afwikkelen');
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 7. Intrekken laat de tekst staan (security-review L1)
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten in de security-review van 23-11: een eigenaar die de groep verliet,
--    kon `update … set status = 'cancelled', body = '…'` in één keer doen. Het
--    spoor schreef alleen `cancelled`, dus de oorspronkelijke tekst stond nergens
--    meer. Voor een actief lid kon dat al; blok 3 breidde het uit naar oud-leden,
--    en daar is de WITH CHECK het enige slot dat versoepeld is. Intrekken is één
--    handeling: de stand, en verder niets.
--
-- ⚠️ Een eigen trigger en geen blok in `bewaak_begunstigde()`: die hangt aan
--    `UPDATE OF type, beneficiary_*` en ziet een wijziging van `body` niet.

create or replace function public.bewaak_intrekking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and (new.body is distinct from old.body
          or new.image_url is distinct from old.image_url) then
    raise exception 'Een intrekking verandert de tekst of de foto niet'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.bewaak_intrekking() from public, anon, authenticated;

drop trigger if exists commitments_intrekking on public.commitments;
create trigger commitments_intrekking
  before update of status, body, image_url on public.commitments
  for each row execute function public.bewaak_intrekking();
