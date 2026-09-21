-- 0249_vereiste_goedkeuringen_verraadt_geen_lidmaatschap.sql — vereiste_goedkeuringen() gaf een buitenstaander antwoord, en dat antwoord verschilde per persoon.
--
-- ROLLBACK-PAD:
--   Zet het lichaam terug naar dat van 0111 — dezelfde functie zonder de
--   `and (...)`-conjunct in de laatste `where`. De handtekening, het returntype
--   en de grants blijven in beide richtingen gelijk, dus een `create or replace`
--   volstaat en er hoeft niets gedropt te worden.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-181, gevonden bij het aanleggen van het leesregister van
-- `definers:controle` en daarna nagemeten op de lokale RLS-stack.
--
-- `vereiste_goedkeuringen(p_group_id, p_owner)` is `SECURITY DEFINER`, mag door
-- `authenticated` aangeroepen worden en had geen enkele poort. Zijn antwoord
-- hangt van een pérsoon af: `beoordelaars` telt de actieve leden **minus
-- p_owner**. Daarmee is het een orakel op `group_members` — precies de tabel
-- waar domeinregel 7 aan hangt.
--
-- 📏 Gemeten met vier actieve leden en `approval_rule = 'majority'`, als een
--    aanroeper die géén lid is:
--
--      is_group_member(G)                -> false
--      select … from groups where id = G -> 0 rijen   (RLS doet zijn werk)
--      select … from group_members       -> 0 rijen
--      vereiste_goedkeuringen(G, lid)    -> 2
--      vereiste_goedkeuringen(G, geenlid)-> 3
--
--    Elk ander oppervlak is dicht en dit gaf antwoord. Een weggestuurd lid houdt
--    beide uuid's en kan zo blijven volgen wie er nog in de groep zit, wie
--    erbij komt en wie vertrekt. Dat is hetzelfde oppervlak dat 0102 sloot toen
--    `shares_group_with_goal()` zijn eigenaarshelft kreeg (QS8-57).
--
-- ⚠️ Bij drie leden geeft `majority` in beide gevallen 2: de klem
--    `least(…, greatest(b.n, 1))` haalt het verschil eruit. Het lek zit dus niet
--    bij élke groepsgrootte en bij `approval_rule = 'any'` (de standaard)
--    helemaal niet. Dat maakt het smaller, niet ongedaan — en een grens die van
--    de groepsgrootte afhangt, is geen grens.
--
-- ---------------------------------------------------------------------------
-- Waarom een conjunct en geen `revoke`
-- ---------------------------------------------------------------------------
--
-- 📏 Een `revoke execute … from authenticated` breekt twee aanroepers, want
--    allebei zijn ze `SECURITY INVOKER` en draaien ze dus als de bevragende rol:
--    `bevestigingsstand()` en `openstaande_beoordelingen()`. Dat is nagekeken in
--    `pg_proc.prosecdef`, niet aangenomen.
--
-- ⚠️⚠️ **En waarom `auth.uid() = p_owner` in de poort staat.** Zonder die tak
--    geeft de functie `null` op het pad waar hij het hárdst nodig is:
--    `bevries_goedkeuringsdrempel()` vuurt bij het insert op `completions` en
--    schrijft de uitkomst in `completion_approval_rules.approvals_required` —
--    een kolom die `not null` is. `completions_insert` eist eigenaarschap maar
--    géén lidmaatschap, dus een doel dat nog aan een groep gekoppeld is terwijl
--    de eigenaar daar op `inactive` staat, zou zijn voltooiing niet meer kunnen
--    indienen. Een grendel die een indiening laat omvallen is een storing en
--    geen weigering.
--
--    Wat die tak níet opent: de aanroeper leest dan de drempel voor zichzélf, en
--    die is voor elke buitenstaander hetzelfde getal. Er is geen ándere persoon
--    uit af te leiden — en dat was het hele lek. Wat er overblijft is de
--    groepsgrootte, en die staat al in `invite_preview()` voor wie de code heeft
--    en in `ontdek_groepen()` voor elke vindbare groep.
--
-- ⚠️ `auth.uid() is null` blijft doorlaten: de rollover en de Edge Functions
--    draaien als `service_role` en hebben geen sessie. Zij komen niet langs een
--    lidmaatschapstoets en horen dat ook niet te hoeven.

-- ---------------------------------------------------------------------------
-- 1. De poort
-- ---------------------------------------------------------------------------

create or replace function public.vereiste_goedkeuringen(p_group_id uuid, p_owner uuid)
returns smallint
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  -- ⚠️ `beoordelaars` telt de actieve leden **minus de eigenaar**. Hij mag zijn
  --    eigen week niet bevestigen (domeinregel 3, afgedwongen door de CHECK op
  --    `subject_id`), dus meetellen zou een meerderheid opleveren die niemand
  --    kan halen.
  with beoordelaars as (
    select count(*)::int as n
    from group_members m
    where m.group_id = p_group_id
      and m.status  <> 'inactive'
      and m.user_id <> p_owner
  )
  select greatest(
    1,
    least(
      case g.approval_rule
        when 'majority' then (b.n / 2) + 1
        when 'quorum'   then coalesce(g.approval_quorum, 1)::int
        else 1
      end,
      -- ⚠️ Nooit meer vragen dan er mensen zijn die het kúnnen. Een groep die
      --    krimpt nadat er een quorum is ingesteld, zou anders weken achterlaten
      --    die per definitie niet meer doorgaan.
      greatest(b.n, 1)
    )
  )::smallint
  from groups g cross join beoordelaars b
  where g.id = p_group_id
    -- ⚠️ De poort van QS8-181. Zie de kop voor alle drie de takken en waarom
    --    geen ervan weg kan.
    and (
      (select auth.uid()) is null
      or (select auth.uid()) = p_owner
      or mag_groep_lezen(p_group_id)
    );
$$;

-- ⚠️ De grants staan hier opnieuw, ook al houdt `create or replace` ze. Een
--    functie die `authenticated` mag uitvoeren zonder grant-regel in een
--    migratie is een geërfd recht en geen besloten recht — `revoke ... from
--    public, anon` laat juist de rol staan waaronder iedere ingelogde gebruiker
--    draait. `tests/rls/functiegrants.test.ts` legt dit sinds 0115 naast elkaar.
revoke all on function public.vereiste_goedkeuringen(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vereiste_goedkeuringen(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. `definer_bewaking()` klopt weer
-- ---------------------------------------------------------------------------
--
-- Twee gevolgen van sectie 1, en allebei zijn ze door de bestaande suite
-- gevonden en niet bedacht:
--
--   1. `vereiste_goedkeuringen` stond in het uitzonderingenregister met de
--      reden *"er is een toets binnenin nodig"* (QS8-289 deel B, 06-09-2026).
--      Die toets is er nu, dus tak 5 wordt terecht rood: een regel in dat
--      register is een schuld en geen vrijstelling. Hij gaat eruit.
--
--   2. De recursie in `toetsers` markeerde `goedkeuringsdrempel_gehaald()`
--      stilzwijgend als toetser, omdat die via `bevestigingsstand()` bij
--      `vereiste_goedkeuringen()` uitkomt. Dat is een verzwakking van tak 4 en
--      geen verbetering: die functie toetst zijn aanroeper niet, hij is
--      afgeschermd met een `revoke`. Vandaar `geen_delegatie` — zie het
--      commentaar in het lichaam.
--
-- ⚠️ Het lichaam hieronder is **letterlijk overgenomen uit de gedeployde
--    functie** (`pg_get_functiondef()`) en niet uit een migratiebestand, met
--    alleen die twee wijzigingen erin. Een register in een functielichaam
--    verdwijnt anders geruisloos bij de merge — QS8-358, en
--    `registerdrift:controle` bewaakt precies dat.

CREATE OR REPLACE FUNCTION public.definer_bewaking()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with recursive
  -- Elk lichaam één keer, zonder commentaarregels.
  lichaam as (
    select p.oid,
           p.proname::text as fnaam,
           regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') as body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  -- ⚠️⚠️ **Wie de aanroeper toetst, maar dat niet dóórgeeft** — QS8-181.
  --    De recursie hieronder zegt: wie een toetser aanroept, erft diens toets.
  --    Dat klopt bij een functie waarvan de hele uitkomst achter `auth.uid()`
  --    hangt, zoals `is_group_member()`. Het klopt níet bij een functie waarvan
  --    de toets één tak van een disjunctie is: `vereiste_goedkeuringen()` laat
  --    sinds 0249 óók door wanneer `auth.uid()` leeg is (de rollover) of gelijk
  --    aan het subject. Wie hém aanroept, weet daarmee niets over zijn eigen
  --    aanroeper.
  --
  --    📏 Zonder deze lijst werd `goedkeuringsdrempel_gehaald()` stil een
  --    "toetser" zodra 0249 landde — via `bevestigingsstand()` — en dan meldt
  --    tak 4 hem niet meer als iemand zijn EXECUTE terugzet. Die stille
  --    verzwakking is gemeten met de tweede helft van
  --    `tests/rls/definer-aanroepertoets.test.ts`.
  geen_delegatie(fnaam) as (
    values ('vereiste_goedkeuringen')
  ),
  -- Wie de aanroeper toetst: zelf, of via een functie die het doet.
  toetsers as (
    select l.oid, l.fnaam
    from lichaam l
    where l.body like '%auth.uid()%'
    union
    select l.oid, l.fnaam
    from lichaam l
    join toetsers t on l.oid <> t.oid
                   and l.body ~ ('\m' || t.fnaam || '[[:space:]]*\(')
                   and t.fnaam not in (select g.fnaam from geen_delegatie g)
  ),
  -- Het register: bekend, benoemd, met reden en datum.
  --
  -- ⚠️ Een regel hier is een schuld en geen vrijstelling. Verdwijnt de reden,
  --    dan hoort de regel weg — en tak 5 wordt rood zodra hij niets meer dekt.
  uitzonderingen(fnaam, reden, sinds) as (
    values
      ('invite_preview',
       'bewust open voor anon: een uitnodigingslink werkt vóór het inloggen (0019, 0080)',
       '2026-08-16'),
      ('groepsdatum',
       'zit in group_overview() (INVOKER) en in de policy chain_links_select; een policy draait onder het recht van de aanroeper — QS8-289 deel B',
       '2026-09-06')
  )
  select p.proname::text, 'geen set search_path'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%')
  union all
  select p.proname::text, 'pg_temp hoort achteraan in het zoekpad'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%' limit 1
  ) g(regel)
  cross join lateral (select btrim(substring(g.regel from 13))) v(pad)
  cross join lateral (select string_to_array(v.pad, ',')) d(delen)
  where n.nspname = 'public'
    and v.pad <> '""'
    and (
      coalesce(array_length(d.delen, 1), 0) < 2
      or btrim(d.delen[array_length(d.delen, 1)]) <> 'pg_temp'
    )
  union all
  select p.proname::text, 'uitvoerbaar door anon'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in (select u.fnaam from uitzonderingen u)
  union all
  -- Tak 4 — de klasse van QS8-287/QS8-289.
  select l.fnaam, 'definer, uitvoerbaar door authenticated, en toetst de aanroeper niet'
  from lichaam l
  join pg_proc p on p.oid = l.oid
  where p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not exists (select 1 from toetsers t where t.oid = l.oid)
    and l.fnaam not in (select u.fnaam from uitzonderingen u)
  union all
  -- Tak 5 — het register mag niet rotten.
  select u.fnaam, 'staat als uitzondering geregistreerd (' || u.sinds || ') maar is geen bezwaar meer'
  from uitzonderingen u
  where not exists (
    select 1
    from lichaam l
    join pg_proc p on p.oid = l.oid
    where l.fnaam = u.fnaam
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or (
          has_function_privilege('authenticated', p.oid, 'execute')
          and not exists (select 1 from toetsers t where t.oid = l.oid)
        )
      )
  )
  order by 1, 2;
$function$

;
