-- 0131_een_oningelogd_eindpunt_zonder_limiet.sql — invite_preview krijgt een teller
--
-- ROLLBACK-PAD:
--   drop function if exists invite_preview(text);
--   drop table if exists invite_preview_limits;
--   -- daarna de versie uit 0128 opnieuw uitvoeren
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-236, gevonden op 31-08-2026 bij de beveiligingsdoorlichting. Supabase'
-- eigen linter meldt hem als `anon_security_definer_function_executable`.
--
-- 📏 Gemeten, niet beredeneerd: `invite_preview` is het enige eindpunt van deze
--    app dat zonder sessie bereikbaar is. Drie van de vier functies die
--    beveiligingsregel 5 raken, hebben een limiet — `join_group_with_code` telt
--    elke poging (0008/0034), `create_group` heeft een dagteller (0016), AI-jobs
--    hebben quota (0038). Deze had niets, en hij is de enige die je zónder
--    account kunt aanroepen.
--
-- Dit is geen datalek. De functie is zuinig (0019 geeft een oningelogde
-- aanroeper alleen voornamen, 0128 haalde het avatarpad er ook voor ingelogden
-- uit) en raden kan niet: twaalf tekens uit een alfabet van dertig is ongeveer
-- 59 bits, met 0088 als grendel onder die drie getallen.
--
-- Het is een **kosten- en beschikbaarheidsvector**. Eén ongeauthenticeerde
-- aanroeper kan onbeperkt werk op de database leggen, op de gratis tier, waar
-- `max_connections` 60 is voor de héle database en er geen uitgavenplafond staat
-- (QS8-141). De rekening komt bij de eigenaar terecht, niet bij de aanroeper.
--
-- ---------------------------------------------------------------------------
-- Waarom een teller per code, en niet per gebruiker of per IP
-- ---------------------------------------------------------------------------
--
-- **Per gebruiker kan niet.** `invite_events.user_id` is `not null` en verwijst
-- naar `profiles`. Een oningelogde aanroeper heeft geen id; die tabel kan hem
-- niet dragen. Dat is de reden dat hier een eigen tabel staat en niet de
-- bestaande.
--
-- **Per IP is niet betrouwbaar te maken.** Het adres komt hier alleen binnen via
-- `request.headers`, en dat is een door de aanroeper te zetten header. Een
-- limiet die je met één regel omzeilt, is geen limiet maar een geruststelling.
--
-- **Per code sluit precies de dure helft.** Twee paden, en ze kosten niet
-- hetzelfde:
--
--   1. Een **geldige** code: lookup op `groups`, `count(*)` op `group_members`,
--      join met `profiles`, en voor een ingelogde aanroeper daarbovenop per lid
--      een gecorreleerde subquery op `goals` × `goal_group_links`. Dit is het
--      dure pad, en dit is wat de teller afknijpt.
--   2. Een **gegokte** code: `groups_invite_code_key` is een unieke index
--      (nagemeten in `pg_indexes` op productie, 31-08), dus dit is één
--      indexprobe en daarna `return null`. Het is ongeveer het goedkoopste dat
--      een eindpunt kan doen.
--
-- ⚠️ **Dit sluit pad 2 dus niet, en dat is een keuze en geen omissie.** Een
--    teller per code kán pad 2 niet zien: er is geen groep om tegen te tellen
--    vóórdat de lookup mislukt is. Wie dat wél wil, heeft een laag vóór Postgres
--    nodig (edge, WAF, of een uitgavenplafond dat de schade begrenst) — dat is
--    QS8-141, niet deze migratie.
--
-- ⚠️ **En dit is de plek waar 0008's les niet opgaat.** Daar staat "eerst
--    loggen, dan pas zoeken", omdat brute-force uit mislukte pogingen bestaat.
--    Hier kán dat niet: de sleutel van de teller kómt uit de lookup. Wie die
--    regel hier klakkeloos overneemt, schrijft een teller op een groep die niet
--    bestaat.
--
-- ---------------------------------------------------------------------------
-- Waarom een rij per groep en geen gebeurtenissentabel
-- ---------------------------------------------------------------------------
--
-- `invite_events` groeit met elke poging. Voor een ingelogde aanroeper is dat
-- prima — die is begrensd door zijn eigen dagteller. Voor een **oningelogd**
-- eindpunt is een tabel die per aanroep een rij krijgt zelf de tweede helft van
-- dezelfde aanval: je knijpt het rekenwerk af en geeft er onbegrensde groei voor
-- terug.
--
-- Daarom één rij per groep, met een schuivend venster in diezelfde rij. Het
-- aantal rijen is hoogstens het aantal groepen, en `on delete cascade` ruimt op.
--
-- ---------------------------------------------------------------------------
-- Waarom de functie van STABLE naar VOLATILE gaat
-- ---------------------------------------------------------------------------
--
-- Een `stable` functie mag niet schrijven, en een teller schrijft. Dat is geen
-- vrije keuze maar een gevolg.
--
-- ⚠️ Dat verandert in PostgREST welke HTTP-methode is toegestaan: `stable` mag
--    via GET, `volatile` alleen via POST. Nagekeken vóór deze wijziging:
--    `src/modules/buddies/api.ts:780` roept hem aan met `supabase().rpc(...)`
--    zonder `{ get: true }`, en supabase-js POST't dan. Er is geen tweede
--    aanroeper — `git grep invite_preview` geeft die ene regel, de
--    beloftetest en het gegenereerde typebestand.
--
-- ---------------------------------------------------------------------------
-- Volgorde ten opzichte van 0128
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De body hieronder is overgenomen uit `pg_get_functiondef()` op productie
--    (31-08), niet uit een bestand in deze branch.** 0126 tot en met 0128 zijn
--    wél op productie gedraaid maar staan op `claude/linear-bijwerken-docs-…`
--    en niet op `main`. Zonder die stap zou deze migratie het avatarpad van 0128
--    terugzetten — precies het lek dat daar is dichtgezet.
--
--    Bij een opbouw uit bestanden lopen de nummers goed af: 0128 < 0131, dus
--    0128 gaat eerst en deze eroverheen. Wie de twee ooit anders volgordelijk
--    maakt, zet dat lek terug.

-- ---------------------------------------------------------------------------
-- 1. De teller
-- ---------------------------------------------------------------------------

create table if not exists invite_preview_limits (
  group_id      uuid        primary key references groups (id) on delete cascade,
  venster_start timestamptz not null default now(),
  aantal        integer     not null default 0
);

comment on table invite_preview_limits is
  'Eén rij per groep: hoe vaak de uitnodiging van die groep in het lopende '
  'venster is opgevraagd. Alleen geschreven door invite_preview() (0131). '
  '⚠️ Bewust géén gebeurtenissentabel: dit eindpunt is oningelogd, en een rij '
  'per aanroep is dan zelf een groeivector.';

alter table invite_preview_limits enable row level security;

-- ⚠️ Geen policy, en dat is de bedoeling: geen policy is deny-all. Deze tabel is
--    uitsluitend voor de definer-functie, die als eigenaar draait en RLS dus
--    passeert. Zelfde vorm als `invite_events`, en die staat onder test in
--    tests/rls/policies.test.ts.
--
-- ⚠️ De revoke noemt `authenticated` met zoveel woorden. `alter default
--    privileges` deelt in Supabase élke nieuwe tabel in `public` uit aan anon,
--    authenticated én service_role; `from public, anon` houdt precies de rol
--    over waaronder iedere ingelogde gebruiker draait. Zie CLAUDE.md regel 4.
revoke all on table invite_preview_limits from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. De functie
-- ---------------------------------------------------------------------------

create or replace function public.invite_preview(code text)
  returns jsonb
  language plpgsql
  volatile security definer
  set search_path = public, pg_temp
as $function$
declare
  g          groups%rowtype;
  aantal     integer;
  leden      jsonb;
  teller     integer;
  ingelogd   boolean := auth.uid() is not null;
begin
  select * into g
  from groups
  where invite_code = code
    and invite_revoked = false
    and status <> 'archived';

  if g.id is null then
    return null;
  end if;

  -- ⚠️ Eén statement, en dat is de hele afdwinging. Lezen-dan-schrijven laat
  --    twee gelijktijdige aanroepen allebei dezelfde stand zien en allebei
  --    doorlopen; `on conflict do update` neemt de rijvergrendeling en telt
  --    daarbinnen op. Het venster schuift in dezelfde uitdrukking mee, zodat er
  --    geen tweede statement is dat ertussen kan vallen.
  insert into invite_preview_limits as l (group_id, venster_start, aantal)
  values (g.id, now(), 1)
  on conflict (group_id) do update
    set venster_start = case
          when l.venster_start < now() - interval '1 hour' then now()
          else l.venster_start
        end,
        aantal = case
          when l.venster_start < now() - interval '1 hour' then 1
          else l.aantal + 1
        end
  returning l.aantal into teller;

  -- ⚠️ Een eigen antwoord, en niet `null`. `null` betekent hier sinds 0019
  --    "ingetrokken, verlopen of nooit bestaan" — dat is met opzet één antwoord
  --    voor drie gevallen, zodat de functie geen orakel is. Zou een bereikte
  --    limiet óók `null` geven, dan krijgt een échte genodigde te horen dat zijn
  --    uitnodiging niet meer geldt, terwijl hij morgen gewoon werkt. Dat is een
  --    ander soort fout dan het orakel dat 0019 wilde voorkomen: het verraadt
  --    niets over welke codes bestaan, want je bent hier alleen als je code
  --    klopte.
  if teller > 60 then
    return jsonb_build_object('limiet_bereikt', true);
  end if;

  select count(*) into aantal
  from group_members
  where group_id = g.id and status <> 'inactive';

  select coalesce(jsonb_agg(rij), '[]'::jsonb) into leden
  from (
    select jsonb_build_object(
      'display_name', case
        when ingelogd then p.display_name
        else split_part(btrim(p.display_name), ' ', 1)
      end,
      -- ⚠️ Altijd null, ook voor een ingelogde aanroeper — migratie 0128.
      --    Sinds 0126 is dit een pad waarvan het eerste segment de auth.uid()
      --    van dat lid is. Een uitnodigingslink verloopt nooit en wordt
      --    doorgestuurd; hem meesturen geeft de interne id's van acht mensen weg
      --    aan iemand die geen lid is. Ondertekenen helpt niet — het pad zit in
      --    de signed URL. Het scherm toont initialen, en dat is de terugval waar
      --    `Avatar` voor gemaakt is.
      'avatar_url', null,
      'goal_title', case
        when ingelogd then (
          select gg.title
          from goals gg
          join goal_group_links l on l.goal_id = gg.id
          where l.group_id = g.id
            and gg.owner_id = m.user_id
            and gg.status = 'active'
          order by gg.target_date asc
          limit 1
        )
        else null
      end
    ) as rij
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = g.id and m.status <> 'inactive'
    order by m.joined_at asc
    limit 8
  ) t;

  return jsonb_build_object(
    'group_id',      g.id,
    'group_name',    g.name,
    'icon',          g.icon,
    'huddle_day',    g.huddle_day,
    'zichtbaarheid', g.zichtbaarheid,
    'member_count',  aantal,
    'detailed',      ingelogd,
    'members',       leden
  );
end;
$function$;

comment on function public.invite_preview(text) is
  'De groep achter een uitnodigingslink, ook zonder sessie. ⚠️ Het enige '
  'oningelogde eindpunt van deze app. Sinds 0131 hoogstens 60 opvragingen per '
  'code per uur; daarboven komt {"limiet_bereikt": true} terug in plaats van de '
  'groep. ⚠️ volatile en niet stable: de teller schrijft.';

revoke all on function public.invite_preview(text) from public, anon, authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
