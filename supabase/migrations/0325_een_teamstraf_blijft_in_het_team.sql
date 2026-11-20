-- 0325_een_teamstraf_blijft_in_het_team.sql — een commitment op een aandeel
-- heeft alleen de eigen teamgroep of een teamgenoot als begunstigde of getuige,
-- en een teamgroep is alleen begunstigde van een aandeel (QS8-660, epic QS8-650).
--
-- ⚠️ **Hernummerd van 0305 naar 0325 op 20-11-2026**, in de ketenlaan 0316–0327
--    (besluit Quinten). Bouwt op 0323 van QS8-656. Het oude nummer botste met 0299–0302 van
--    QS8-233 (QS8-641); de inhoud hangt niet aan het nummer.
--
-- ROLLBACK-PAD (alleen een weigering en een smaller leesrecht; geen gegevens):
--   commitments_select, getuigenissen(), getuigenissen_voor() en
--   teruggedraaide_straffen_voor() terugzetten uit 0183, 0169 en 0293 (de
--   lichamen hieronder zijn die, plus de QS8-660-regel);
--   drop function if exists public.straf_teamband_klopt_voor_mij(uuid);
--   drop function if exists public.straf_teamband_klopt(uuid, uuid);
--   drop trigger if exists commitments_teamstraf on public.commitments;
--   drop function if exists public.bewaak_teamstraf();
--   -- en meld_commitment() terugzetten uit 0213 (het lichaam hieronder zonder de
--   -- regel met straf_teamband_klopt);
--
-- ---------------------------------------------------------------------------
-- Wat dit doet, en waar het vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit 12 en 29 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- en de ontwerpronde met Quinten van 18-11-2026 (grens 1, reactie op QS8-660):
--
-- 1. Op een **aandeel** is de begunstigde groep leeg of de eigen teamgroep, en
--    de begunstigde persoon leeg of een actief lid van die teamgroep. Geen
--    vriendengroep en geen vriend: een werkaandeel en een vriendenkring zijn
--    twee werelden.
-- 2. Een **teamgroep** is alleen begunstigde van een aandeel. Een privédoel blijft
--    buiten het team, ook als de eigenaar het zelf aan de teamgroep koppelde.
-- 3. Bij verschuldigd zien collega's de naam en de straftekst, zoals bij elke
--    begunstigde groep. `commitment_zichtbaar_voor_groep()` verandert niet.
--
-- ⚠️ **Een eigen trigger en geen tak in `bewaak_begunstigde()`.** Twee
--    herdefinities van één functielichaam verliezen stil elkaars register
--    (QS8-358); een eigen trigger kan dat niet.
--
-- ⚠️ **Een niet-eigenaar krijgt de melding van de policy, woordelijk.** Een
--    `before`-trigger antwoordt vóór de policy, en een eigen melding zou een
--    vreemde laten zien dat een doel een aandeel is. Zwijgen kan niet: dat opent
--    de grendel voor een definer-context zonder policy erachter (securityreview
--    QS8-654, M1). Dezelfde vorm als `aandeel_blijft_in_teamgroep()` (0319).
--
-- ⚠️ **Een lege begunstigde mag altijd.** De foreign keys zetten hem op `null` als
--    de groep of de persoon verdwijnt, en die RI-actie hoort hier niet te botsen.
--
-- ---------------------------------------------------------------------------

create or replace function public.bewaak_teamstraf()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_eigenaar uuid;
  v_team     uuid;
  v_fout     boolean := false;
begin
  select g.owner_id into v_eigenaar from goals g where g.id = new.goal_id;

  -- De teamgroep van dit doel als het een aandeel is, anders leeg.
  select t.group_id into v_team
    from team_goal_shares s
    join team_goals t on t.id = s.team_goal_id
   where s.goal_id = new.goal_id;

  if v_team is not null then
    -- 1. Een aandeel: alleen het eigen team.
    if new.beneficiary_group_id is not null and new.beneficiary_group_id <> v_team then
      v_fout := true;
    end if;
    if new.beneficiary_user_id is not null and not exists (
         select 1 from group_members m
          where m.group_id = v_team
            and m.user_id  = new.beneficiary_user_id
            and m.status  <> 'inactive') then
      v_fout := true;
    end if;
    -- 1b. ⚠️ **Besluit van Quinten, 20-11-2026 (~12:20 UTC, vraag V8): een
    --     weekbelofte op een aandeel heeft alleen een teamgenoot als persoonlijke
    --     getuige, nooit de teamgroep.** De weekbelofte (0312–0314) kwam op `main`
    --     na de basis van dit issue. Met de teamgroep als begunstigde zag het team,
    --     en daarmee mogelijk een leidinggevende, elke gebroken week dat iemand zijn
    --     week niet haalde, mét de straftekst. Besluit 29 nam dat schaamtemoment
    --     aan voor één straf op een streefdatum, niet voor een wekelijkse. De
    --     gebruiker kiest zelf wie het wél ziet: één teamgenoot.
    if new.periode_start is not null and new.beneficiary_group_id is not null then
      v_fout := true;
    end if;
  else
    -- 2. Een teamgroep is alleen begunstigde van een aandeel.
    if new.beneficiary_group_id is not null and exists (
         select 1 from groups gr
          where gr.id = new.beneficiary_group_id and gr.organization_id is not null) then
      v_fout := true;
    end if;
    -- 3. Besluit M2 (18-11-2026): een collega met wie je alleen het team deelt,
    --    is geen getuige van je privédoel. Dus: deelt de getuige een teamgroep met
    --    de eigenaar, dan moet hij ook een groep zónder organisatie met hem delen.
    --    ⚠️ Niet "moet een groep delen": die eis is van de policy en geldt voor
    --    clients; hier erbij zou hij ongemerkt ook `service_role` binden.
    if new.beneficiary_user_id is not null
       and exists (
         select 1
           from group_members e
           join group_members b  on b.group_id = e.group_id
           join groups gr        on gr.id = e.group_id
          where e.user_id = v_eigenaar and e.status <> 'inactive'
            and b.user_id = new.beneficiary_user_id and b.status <> 'inactive'
            and gr.organization_id is not null)
       and not exists (
         select 1
           from group_members e
           join group_members b  on b.group_id = e.group_id
           join groups gr        on gr.id = e.group_id
          where e.user_id = v_eigenaar and e.status <> 'inactive'
            and b.user_id = new.beneficiary_user_id and b.status <> 'inactive'
            and gr.organization_id is null) then
      v_fout := true;
    end if;
  end if;

  if not v_fout then
    return new;
  end if;

  -- ⚠️ Ook de eigenaar krijgt de melding van de policy als hij geen lid is van de
  --    gekozen groep (securityreview L1). Anders is de eigen hint een orakel op
  --    de vraag of een vreemde groeps-uuid een teamgroep is.
  if v_uid is not null
     and (v_eigenaar is distinct from v_uid
          or (new.beneficiary_group_id is not null
              and not public.is_group_member(new.beneficiary_group_id))) then
    raise exception 'new row violates row-level security policy for table "commitments"'
      using errcode = '42501';
  end if;

  raise exception 'Een afspraak op een teamaandeel blijft in het team, en een team is alleen getuige van een teamaandeel'
    using errcode = 'check_violation',
          hint    = 'teamstraf';
end;
$$;
revoke all on function public.bewaak_teamstraf() from public, anon, authenticated;

drop trigger if exists commitments_teamstraf on public.commitments;
create trigger commitments_teamstraf
  before insert or update of goal_id, beneficiary_group_id, beneficiary_user_id on public.commitments
  for each row execute function public.bewaak_teamstraf();

-- ---------------------------------------------------------------------------
-- Besluit M1 (18-11-2026): een straf op een aandeel alleen voor wie nu in het team zit
-- ---------------------------------------------------------------------------
--
-- De trigger hierboven toetst bij het schrijven. Lezen gebeurt later, en wie dan
-- uit het team vertrokken is maar nog een vriendengroep met de eigenaar deelt,
-- las de straf via `deelt_groep_met_eigenaar()` toch (securityreview, gemeten).
-- Voor een aandeel eisen alle vier de leesroutes nu dat lezer én eigenaar actief
-- lid van de teamgroep zijn; voor elk ander doel verandert er niets.

create or replace function public.straf_teamband_klopt(p_goal_id uuid, p_lezer uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from team_goal_shares s where s.goal_id = p_goal_id)
      or exists (
           select 1
             from team_goal_shares s
             join team_goals t     on t.id = s.team_goal_id
             join group_members l  on l.group_id = t.group_id
                                  and l.user_id  = p_lezer
                                  and l.status  <> 'inactive'
             join group_members e  on e.group_id = t.group_id
                                  and e.user_id  = s.user_id
                                  and e.status  <> 'inactive'
            where s.goal_id = p_goal_id
         );
$$;
-- ⚠️ **Geen grant voor `authenticated`**: hij neemt de lezer als parameter, en een
--    client die hem mag aanroepen kan het voor een ander vragen. Alleen de
--    definer-functies hieronder roepen hem aan; de policy gebruikt de variant
--    met `auth.uid()`.
revoke all on function public.straf_teamband_klopt(uuid, uuid) from public, anon, authenticated;

create or replace function public.straf_teamband_klopt_voor_mij(p_goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.straf_teamband_klopt(p_goal_id, (select auth.uid()));
$$;
revoke all on function public.straf_teamband_klopt_voor_mij(uuid) from public, anon, authenticated;
grant execute on function public.straf_teamband_klopt_voor_mij(uuid) to authenticated;

drop policy if exists commitments_select on public.commitments;
-- ⚠️ **De `(select …)::text[]`-wikkel van 0254 §7 hersteld bij het hernummeren
--    (20-11-2026, security-ronde op de naad).** Deze tak bouwde de policy op uit
--    0183; 0254 deed daarna een `alter policy` die de twee standenlijsten één keer
--    per query laat uitrekenen in plaats van per rij. Zonder de wikkel viel dat
--    stil terug (registerdrift via `alter policy`, die een grep op `create policy`
--    niet ziet).
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
    )
    or (
      beneficiary_user_id = (select auth.uid())
      and status = any ((select commitment_zichtbaar_voor_persoon())::text[])
      and deelt_groep_met_eigenaar(goal_id)
      and straf_teamband_klopt_voor_mij(goal_id)
    )
  );

-- De drie leesfuncties van de persoon-getuige, gekopieerd uit hun huidige
-- definitie (0169, 0293) en aangevuld met de gemarkeerde regel (QS8-358).

create or replace function public.getuigenissen()
 RETURNS TABLE(id uuid, type text, body text, status text, confirmed_at timestamp with time zone, created_at timestamp with time zone, eigenaar_naam text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.id,
         c.type,
         c.body,
         c.status,
         c.confirmed_at,
         c.created_at,
         p.display_name
  from commitments c
  join goals    g on g.id = c.goal_id
  join profiles p on p.id = g.owner_id
  where c.beneficiary_user_id = (select auth.uid())
    and c.status = any (commitment_zichtbaar_voor_persoon())
    -- ⚠️ De band die de aanwijzing droeg, moet er nog zijn — QS8-306. Dezelfde
    --    invariant die `commitments_insert` bij het aanmaken eist, en dezelfde
    --    die `getuigenissen_voor()` (0178) sinds QS8-298 voor de melding
    --    hanteert. Hier mag het via de helper, want de kijker ís `auth.uid()`.
    and deelt_groep_met_eigenaar(c.goal_id)
    -- QS8-660 (besluit M1): een straf op een aandeel alleen voor wie nu in het team zit.
    and straf_teamband_klopt(c.goal_id, (select auth.uid()))
  order by c.confirmed_at desc, c.id;
$function$;

create or replace function public.getuigenissen_voor(p_user_id uuid)
 RETURNS TABLE(commitment_id uuid, eigenaar_naam text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.id, p.display_name
  from commitments c
  join goals    g on g.id = c.goal_id
  join profiles p on p.id = g.owner_id
  where c.beneficiary_user_id = p_user_id
    -- ⚠️ De grens van domeinregel 11 en van `commitment_zichtbaar_voor_persoon()`.
    --    Een straf die nog niet verschuldigd is, bestaat voor de getuige niet.
    and c.status = 'due'
    -- ⚠️ Nooit jezelf. `bewaak_begunstigde()` (0168) laat zo'n rij niet ontstaan,
    --    ook niet als `service_role` — maar een melding sturen over je eigen straf
    --    is een andere fout dan een rij die niet had mogen bestaan, en deze regel
    --    kost niets. De opstelling die hem ijkt staat in
    --    `tests/rls/getuigemelding.test.ts` en zet die trigger even uit.
    and g.owner_id <> p_user_id
    -- QS8-660 (besluit M1): een straf op een aandeel alleen voor wie nu in het team zit.
    and straf_teamband_klopt(c.goal_id, p_user_id)
    -- ⚠️ De groepsband die de aanwijzing droeg, moet er nog zijn — dezelfde band
    --    die `commitments_insert` bij het aanmaken eiste, en verder niets.
    --
    --    ⚠️⚠️ **De eerste versie eiste méér dan dat en was daarmee fout.** Die
    --    keek naar `goal_group_links` — of het dóél aan een gedeelde groep hangt
    --    — omdat `te_beoordelen_voor()` (0054) dat doet. Maar dáár slaat het op
    --    de voltooiing die de groep beoordeelt; hier is de invariant
    --    `shares_group_with_user(beneficiary_user_id)`, en die eist alleen dat
    --    eigenaar en getuige één groep delen. Een doel hóéft aan geen enkele
    --    groep te hangen. De testopstelling viel er meteen over, en dat was
    --    terecht: de conjunct sloot een geldige getuigenis uit.
    --
    --    De statusgrens is `<> 'inactive'` en niet `= 'active'`, precies zoals
    --    `shares_group_with_user()` hem trekt: een lid met een adempauze
    --    (`paused`) is nog steeds een groepsgenoot.
    and exists (
      select 1
      from group_members eigenaar
      join group_members getuige on getuige.group_id = eigenaar.group_id
      where eigenaar.user_id  = g.owner_id
        and eigenaar.status  <> 'inactive'
        and getuige.user_id   = p_user_id
        and getuige.status   <> 'inactive'
    )
    -- ⚠️ De anti-join. Zonder deze schuift het venster niet op en komt melding 51
    --    nooit aan; zie de kop hierboven.
    and not exists (
      select 1
      from notifications_sent n
      where n.user_id = p_user_id
        and n.kind    = 'commitment_witness'
        and n.ref_id  = c.id
    )
  order by c.confirmed_at, c.id
  -- ⚠️ Het dagplafond, en niet zomaar een limiet. `greatest(0, …)` want een
  --    negatieve `limit` is een fout en geen lege uitkomst.
  limit greatest(0, 5 - (
    select count(*)
    from notifications_sent n
    where n.user_id = p_user_id
      and n.kind    = 'commitment_witness'
      and n.sent_at > now() - interval '24 hours'
  ));
$function$;

create or replace function public.teruggedraaide_straffen_voor(p_user_id uuid)
 RETURNS TABLE(commitment_id uuid, eigenaar_naam text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.id, p.display_name
  from commitments c
  join goals    g on g.id = c.goal_id
  join profiles p on p.id = g.owner_id
  where c.beneficiary_user_id = p_user_id
    -- De straf staat nu niet meer verschuldigd. Alleen déze toestand is er een
    -- om over te berichten: `resolved` is afgewikkeld en `cancelled` valt onder
    -- de redenering in de kop.
    and c.status = 'set'
    -- ⚠️ De grendel. Alleen wie de heenweg gehoord heeft, hoort de terugweg.
    and exists (
      select 1
      from notifications_sent n
      where n.user_id = p_user_id
        and n.kind    = 'commitment_witness'
        and n.ref_id  = c.id
    )
    -- Er is werkelijk teruggedraaid, en dat leest hij uit het auditspoor en niet
    -- uit de huidige stand: `reverted` bestaat sinds QS8-308 juist omdat
    -- `due -> set` het tegenovergestelde van triggeren is.
    and exists (
      select 1
      from commitment_events e
      where e.commitment_id = c.id
        and e.event_type    = 'reverted'
    )
    -- ⚠️ Nooit jezelf — zelfde reden en zelfde vorm als in `getuigenissen_voor()`.
    and g.owner_id <> p_user_id
    -- QS8-660 (besluit M1): een straf op een aandeel alleen voor wie nu in het team zit.
    and straf_teamband_klopt(c.goal_id, p_user_id)
    -- ⚠️ De groepsband die de aanwijzing droeg, moet er nog zijn. Woordelijk
    --    dezelfde eis als `shares_group_with_user()` hem trekt: `<> 'inactive'`
    --    en niet `= 'active'`, want een lid met een adempauze is nog een
    --    groepsgenoot.
    and exists (
      select 1
      from group_members eigenaar
      join group_members getuige on getuige.group_id = eigenaar.group_id
      where eigenaar.user_id  = g.owner_id
        and eigenaar.status  <> 'inactive'
        and getuige.user_id   = p_user_id
        and getuige.status   <> 'inactive'
    )
    -- ⚠️⚠️ **En hij moet in een groep zitten waar dít doel aan hangt. Die eis
    --    staat hier ná de security-ronde en is een besluit van Quinten
    --    (19-09-2026), geen afronding.**
    --
    --    📏 Zonder haar bereikt deze melding iemand buiten de kring die QS8-370
    --    heeft afgebakend. End to end nagespeeld: alice zit in G1 (met bob) en
    --    G2 (met dave), haar doel hangt **alleen** aan G2, en haar getuige is
    --    **bob uit G1**. Dave willigt het uitstel in →
    --    `teruggedraaide_straffen_voor(bob)` gaf **1 rij**. Bob hoorde dus iets
    --    over een uitstel in een groep waar hij niet in zit.
    --
    --    Dat kan omdat `commitments_insert` alleen `shares_group_with_user()`
    --    eist: een getuige deelt één of andere groep met de eigenaar, niet per
    --    se de groep waar het doel aan hangt.
    --
    -- ⚠️⚠️ **Waarom dit ertoe doet, en dat hangt aan de gecorrigeerde meting
    --    hierboven:** er is maar één oorzaak van een teruggang, dus deze melding
    --    zegt onvermijdelijk *"er is een uitstelverzoek ingewilligd"*, hoe
    --    neutraal de woorden ook zijn. Met drie oorzaken leek ze vaag; met één
    --    is ze eenduidig. De bewoording beschermt niets als de gevolgtrekking
    --    maar één kant op kan.
    --
    -- ⚠️ **Dit is nog steeds een verruiming van QS8-370 en niet een gelijkmaking.**
    --    Die verruiming gaat over de gevráágde groep; hier mag óók een lid van
    --    een andere gekoppelde groep het horen. Besluit van Quinten, en het
    --    staat als eigen rij in `docs/decisions/002-domeinregel7-oppervlakken.md`.
    and exists (
      select 1
      from goal_group_links l
      join group_members m on m.group_id = l.group_id
      where l.goal_id  = g.id
        and m.user_id  = p_user_id
        and m.status  <> 'inactive'
    )
    -- ⚠️ De anti-join, zonder welke het venster niet opschuift.
    --
    --    ⚠️⚠️ **Hij maakt de melding ook eenmalig per straf, en dat is een
    --    gemeten grens en geen keuze van vandaag.** `notifications_sent_per_onderwerp`
    --    is uniek op `(user_id, kind, ref_id)`, dus een straf die twee keer
    --    heen en weer gaat, meldt één keer. Dat geldt net zo goed voor
    --    `commitment_witness` zelf sinds 0178 — de tweede keer verschuldigd
    --    worden is daar ook stil. Die eigenschap is hier overgenomen en niet
    --    opgelost; hem doorbreken vraagt een andere sleutel dan `ref_id` en
    --    raakt beide soorten.
    and not exists (
      select 1
      from notifications_sent n
      where n.user_id = p_user_id
        and n.kind    = 'commitment_reverted'
        and n.ref_id  = c.id
    )
  order by c.confirmed_at, c.id
  -- Hetzelfde dagplafond als bij `getuigenissen_voor()`, en `greatest(0, …)` om
  -- dezelfde reden: een negatieve `limit` is een fout en geen lege uitkomst.
  limit greatest(0, 5 - (
    select count(*)
    from notifications_sent n
    where n.user_id = p_user_id
      and n.kind    = 'commitment_reverted'
      and n.sent_at > now() - interval '24 hours'
  ));
$function$;

-- ---------------------------------------------------------------------------
-- 9. Geen teambericht over een straf als de eigenaar het team verliet — besluit V11
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Besluit van Quinten, 20-11-2026 (~12:20 UTC, vraag V11), op een bevinding
--    (Middel) van de security-ronde op de naad met main.** Besluit M1 versmalde
--    wie een straf op een aandeel mag lezen, maar `meld_commitment()` plaatste
--    `commitment_due` nog in de begunstigde teamgroep, ook als de eigenaar het
--    team al verlaten had. De teamchat noemde dan iemand die er niet meer is.
--
-- ⚠️ Het lichaam is **woordelijk** dat van 0213 (de laatste definitie op `main`,
--    nagemeten: 0299–0315 herdefiniëren hem niet), plus één regel. Gekopieerd en
--    niet herschreven: zie de registerdrift die bij het hernummeren van deze keten
--    vier keer stil iets liet vallen (QS8-358).
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
