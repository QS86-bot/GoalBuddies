-- 0297_de_escalatie_was_breder_dan_de_kop_beloofde.sql — vier gaten in het moderatie-oppervlak van 0296, elk met een meting.
--
-- ROLLBACK-PAD:
--   -- de lezer en de afhandeling terug naar de vorm van 0296 (zie dat bestand,
--   -- secties 3 en 4) en daarna:
--   grant select on public.reports to authenticated;
--   drop policy if exists reports_select on public.reports;
--   create policy reports_select on public.reports for select to authenticated
--     using (reporter_id = (select auth.uid())
--            or (public.is_group_admin(group_id) and subject_id <> (select auth.uid())));
--   alter table public.reports drop constraint if exists reports_afhandeling_is_heel;
--   alter table public.reports add constraint reports_afhandeling_is_heel check (
--     (status =  'open' and afgehandeld_door is null     and afgehandeld_op is null)
--     or
--     (status <> 'open' and afgehandeld_door is not null and afgehandeld_op is not null));
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De security-review op QS8-586, 22-09-2026, op een lokaal schema op `0296`.
-- Elke bevinding hieronder is met echte rijen nagemeten in een teruggerolde
-- transactie; de gedeployde definities zijn woordelijk gelijk aan 0296, dus ze
-- gelden voor productie.
--
-- ⚠️⚠️ **Twee van de vier zijn een belofte die niet waargemaakt werd, en dat is
--    erger dan een vergeten regel.** 0296 schrijft in zijn kop uit *waarom* de
--    escalatie smal is en *waarom* `reporter_id` wegblijft, en allebei die
--    alinea's zijn gemeten onwaar. Een omissie valt op; een uitgeschreven
--    argument leest de volgende persoon als een reden om er niet aan te
--    twijfelen — en er stond bovendien een test onder die hem leek te bewijzen.
--
-- **K1 — de platformbeheerder las en dempte meldingen over zichzelf.**
--    Route (a) draagt `r.subject_id <> auth.uid()`; route (b) droeg hem niet, en
--    route (b) vuurt precies als het onderwerp beheerder van die groep is — wat
--    een platformbeheerder die zelf een groep aanmaakt, ís.
--    📏 Gemeten: een lid meldt de platformbeheerder in diens eigen groep.
--
--      MELDEN=true
--      K1_ZIET_OVER_ZICHZELF=1
--      K1_LEEST_TOELICHTING=hij bedreigt mij
--      K1_DEMPT_ZELF=true
--      K1_AFGEHANDELD_DOOR_IS_ONDERWERP=true
--
--    ⚠️ Dit is bovendien een **verbreding** van wat de policy al dichthield:
--    `reports_select` houdt die rij wél bij hem weg. De definer-RPC gaf hem
--    alsnog.
--
--    ⚠️ Bij de eerste meting kwam `K1_DEMPT_ZELF=false` uit, en dat was een fout
--    in de méting: het melding-id werd via RLS opgehaald, waar de
--    platformbeheerder het niet ziet, dus ging er `null` de RPC in. Met het id
--    zoals het **scherm** hem krijgt — uit `openstaande_meldingen()` — is het
--    `true`. Een grendel toetsen langs een pad dat het scherm niet loopt,
--    bewaakt niets van wat hij belooft.
--
-- **K2 — de escalatie vuurde bij élke melding over élke groepsbeheerder.**
--    De kop van 0296 belooft *"alleen die waar de groep aantoonbaar niets mee
--    kan"*. De tweede helft daarvan stond er (het onderwerp is beheerder), de
--    eerste niet. Een groep met twee beheerders kan een melding over beheerder A
--    prima zelf afhandelen.
--    📏 Gemeten, groep met beheerders A en B, melding over A:
--
--      K2_BEHEERDER_B_KAN_DIT_ZELF=1
--      K2_PLATFORM_ZIET_HEM_OOK=1
--      K2_PLATFORM_LEEST_TEKST=geheime klacht
--
--    Elke groep heeft per definitie een oprichter, dus in de praktijk was de
--    route *"elke melding over een oprichter, platformbreed"* — inclusief de
--    letterlijke tekst van een bericht uit een privé-groepschat waar de
--    platformbeheerder niet in zit. Precies de brede platformblik die de kop
--    zegt te vermijden.
--
-- **K3 — `reporter_id` was in één verzoek van de tabel te lezen.**
--    De belofte staat op vier plekken: *"weglaten beschermt de melder tegen een
--    beheerder die het hem betaald zet."* De database dwong hem niet af.
--    `authenticated` had **tabelbrede** `select` op `public.reports`
--    (`relacl = authenticated=rdx/postgres`) en `reports_select` gaf de
--    groepsbeheerder de hele rij.
--    📏 Gemeten, als groepsbeheerder rechtstreeks op de tabel:
--
--      K3_TABEL_GEEFT_MELDER=314e8436-5880-43f7-8fac-a3d91f6bd85c
--      K3_MELDER_NAAM=Melder
--
--    Dat is CLAUDE.md's eigen regel, woordelijk: *RLS kan geen kolommen
--    beperken.* 0296 bouwde de RPC mét kolomlijst en liet de tweede weg open —
--    dezelfde vorm als het `group_overview`-geval in
--    `src/lib/database.types.correcties.ts`, waar de correctie landde op de
--    functie die niemand aanroept.
--
--    ⚠️ De rijtoegang zelf is niet nieuw (`reports_select` bestaat sinds 0145).
--    Wat 0296 toevoegde is de **belofte** dat de melder beschermd is.
--
-- **K4 — wie een melding afhandelde, kon zijn account niet meer opzeggen.**
--    `afgehandeld_door … on delete set null` tegenover een CHECK die bij
--    `status <> 'open'` juist een `afgehandeld_door` eist. De referentiële actie
--    schond zijn eigen tabelconstraint.
--    📏 Gemeten via de échte RPC, daarna `delete from auth.users`:
--
--      K4_AFGEHANDELD=true
--      ERROR:  new row for relation "reports" violates check constraint
--              "reports_afhandeling_is_heel"
--
--    `verwijder_mijn_account()` eindigt op die delete, dus het wisrecht brak
--    hard — en dat is precies het recht waarvoor QS8-335 een benoemde
--    uitzondering op de systeemberichtregel waard vond.
--
-- Drie kleinere, in dezelfde ronde gemeten en hier meegenomen omdat ze in
-- dezelfde twee functies zitten:
--
--   M1  Een open melding in een **gearchiveerde** groep bereikte niemand:
--       `is_group_admin()` eist `g.status <> 'archived'`. Archiveren is de knop
--       van elke actieve beheerder, en `verwijder_mijn_account()` archiveert
--       solo-groepen vanzelf. Dat is het gat van QS8-586 langs de achterdeur.
--   M2  `meldingen_over_onderwerp` telde méldingen en geen mélders, terwijl de
--       kop van 0296 hem uitlegt als *"vijf mensen melden dezelfde persoon"*.
--       Eén melder haalt er met het dagquotum twintig.
--   L   De escalatie-`exists` toetste `group_members.status` niet, terwijl
--       `is_group_admin()` dat wél doet: een uitgezette ex-beheerder als
--       onderwerp escaleerde door.
--
-- ⚠️ **Wat hier níet in zit, en waarom.** De vraag *waar komt een melding over
--    de platformbeheerder dan wél aan* is na K1 nog steeds: nergens. Dat is
--    grens 1 van de Beslisbevoegdheid — het bepaalt wat een gebruiker beloofd
--    wordt — en dus een besluit voor Quinten, geen keuze die hier hoort. Wat
--    deze migratie wél doet is het onderwerp uit de stoel van de beoordelaar
--    halen. De rij staat in `docs/ENGINEER-REVIEW.md`.
--
-- Uitleg in `docs/decisions/2026-09-22-een-melding-die-nergens-aankomt.md` §8.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. K3 — de melder blijft buiten beeld, en nu dwingt de database dat af
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alle vier de functies die `public.reports` lezen zijn `security definer`
--    (`meld`, `meldingen_over`, `openstaande_meldingen`, `handel_melding_af`) en
--    📏 geen enkele client leest de tabel rechtstreeks — gegrepen op
--    `from('reports')` in `src/`, `app/` en `supabase/functions/`: nul treffers.
--    Het recht intrekken kost dus niets en is de enige grendel die telt.
revoke select on public.reports from public, anon, authenticated;

-- ⚠️ **En de policy zakt mee, ook al is hij zonder grant machteloos.** Twee
--    lagen die hetzelfde zeggen is hier geen dubbelop: komt er ooit een
--    `grant select` terug — een generator, een `alter default privileges`, een
--    hand — dan staat de beheerderstak er niet meer om hem op te vangen.
drop policy if exists reports_select on public.reports;

create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

comment on policy reports_select on public.reports is
  'Alleen je eigen melding, en zelfs dat alleen als iemand `select` teruggeeft — '
  'QS8-586/0297. Beoordelen loopt uitsluitend via openstaande_meldingen().';

-- ---------------------------------------------------------------------------
-- 2. K4 — een afhandeling overleeft het opzeggen van de beoordelaar
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`afgehandeld_op` draagt de eis en `afgehandeld_door` niet meer.** Het
--    moment is wat een afhandeling tot administratie maakt; de naam is wat er
--    van een mens overblijft, en dat mag een gebruiker meenemen. Zelfde vorm als
--    een gewoon chatbericht dat blijft staan met een lege afzender (0221).
alter table public.reports drop constraint if exists reports_afhandeling_is_heel;

alter table public.reports add constraint reports_afhandeling_is_heel check (
  (status =  'open' and afgehandeld_door is null and afgehandeld_op is null)
  or
  (status <> 'open' and afgehandeld_op is not null)
);

comment on constraint reports_afhandeling_is_heel on public.reports is
  'Een afgehandelde melding draagt een moment; de naam mag leeglopen als het '
  'account opgezegd wordt (QS8-586/0297, K4).';

-- ---------------------------------------------------------------------------
-- 2b. De twee routes, elk op één plek
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **In 0296 stonden deze twee takken twee keer woordelijk uitgeschreven** —
--    één keer in de lezer en één keer in de afhandeling — met erbij dat dat
--    *"met opzet in dezelfde volgorde"* was. Dat is geen grendel maar een
--    afspraak met jezelf, en 📏 het is meteen misgegaan: K1 zit in allebei, en
--    wie er één repareert laat de andere open. De lezer en de afhandeling moeten
--    het altijd eens zijn over wie mag beoordelen, dus staat elke tak nu op één
--    plek.
--
-- ⚠️ **Geen `grant execute`, met opzet.** Deze drie worden uitsluitend aangeroepen
--    vanuit `openstaande_meldingen()` en `handel_melding_af()`, en die draaien
--    als `postgres`. Een client heeft ze niet nodig, en een recht dat niemand
--    gebruikt is precies de bevinding van QS8-592. De `revoke` noemt
--    `authenticated` met zoveel woorden (onwrikbare regel 4): `alter default
--    privileges` deelt élke nieuwe functie in `public` aan die rol uit.

-- Ben ik actief beheerder van deze groep?
--
-- ⚠️ **Dit is met opzet níet `is_group_admin()`** — die eist `g.status <>
--    'archived'`, en dat is M1: een open melding in een gearchiveerde groep
--    bereikte daardoor niemand meer, ook niet via de escalatie. Archiveren is de
--    gewone knop van elke beheerder en `verwijder_mijn_account()` doet het
--    vanzelf met solo-groepen, dus dat is het gat van QS8-586 langs de
--    achterdeur. Een gearchiveerde groep heeft geen nieuwe meldingen, maar de
--    oude horen afgehandeld te kunnen worden.
create or replace function public.mag_melding_als_beheerder(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1
      from public.group_members m
     where m.group_id = p_group_id
       and m.user_id  = (select auth.uid())
       and m.role     = 'admin'
       and m.status  <> 'inactive'
  );
$function$;

comment on function public.mag_melding_als_beheerder(uuid) is
  'Route (a) van het moderatie-oppervlak: actief beheerder van deze groep, ook '
  'als de groep gearchiveerd is — QS8-586/0297, M1.';

revoke execute on function public.mag_melding_als_beheerder(uuid) from public, anon, authenticated;

-- Is dit het geval dat de groep aantoonbaar niet zelf kán afhandelen?
--
-- ⚠️⚠️ **De derde conjunct is K2, en die ontbrak.** 0296 toetste alleen dat het
--    onderwerp beheerder is. Een groep met twee beheerders kan een melding over
--    de een prima door de ander laten behandelen, en toch escaleerde hij — dus
--    las de platformbeheerder in de praktijk elke melding over elke oprichter,
--    inclusief de letterlijke tekst uit een privé-groepschat waar hij niet in
--    zit. 📏 `K2_BEHEERDER_B_KAN_DIT_ZELF=1` én `K2_PLATFORM_ZIET_HEM_OOK=1`.
--
-- ⚠️ `m.status <> 'inactive'` staat er nu in beide `exists` (bevinding L): een
--    uit de groep gezette ex-beheerder als onderwerp escaleerde door, terwijl
--    `is_group_admin()` diezelfde toets aan de andere kant wél doet.
create or replace function public.mag_melding_als_escalatie(
  p_group_id   uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.is_platform_beheerder()
     and exists (
       select 1
         from public.group_members m
        where m.group_id = p_group_id
          and m.user_id  = p_subject_id
          and m.role     = 'admin'
          and m.status  <> 'inactive'
     )
     and not exists (
       select 1
         from public.group_members m2
        where m2.group_id = p_group_id
          and m2.role     = 'admin'
          and m2.status  <> 'inactive'
          and m2.user_id <> p_subject_id
     );
$function$;

comment on function public.mag_melding_als_escalatie(uuid, uuid) is
  'Route (b): platformbeheerder, het onderwerp is de enige actieve beheerder van '
  'die groep, en er is dus niemand in de groep die het kan — QS8-586/0297, K2.';

revoke execute on function public.mag_melding_als_escalatie(uuid, uuid) from public, anon, authenticated;

-- Heeft deze sessie überhaupt iets te beoordelen?
--
-- ⚠️ **M3 — dit is een kostenpoort en geen autorisatiepoort.** Hij mag niets
--    toestaan wat de twee takken hierboven niet al toestaan; hij is er zodat een
--    gewone gebruiker niet de hele meldingenvoorraad hoeft te scannen om nul
--    rijen te krijgen. 📏 Gemeten bij 5000 open meldingen:
--    `Rows Removed by Filter: 5000`, 58 ms per profielbezoek. Onwrikbare regel
--    12, en op de gratis tier met `max_connections = 60` telt dat door.
create or replace function public.moderatiepoort()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.is_platform_beheerder()
      or exists (
        select 1
          from public.group_members m
         where m.user_id = (select auth.uid())
           and m.role    = 'admin'
           and m.status <> 'inactive'
      );
$function$;

comment on function public.moderatiepoort() is
  'Kostenpoort voor openstaande_meldingen(): beoordeelt deze sessie ergens iets? '
  'Staat niets toe wat de routes niet al toestaan — QS8-586/0297, M3.';

revoke execute on function public.moderatiepoort() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. K1, K2, M1, M2, L — de lezer
-- ---------------------------------------------------------------------------
create or replace function public.openstaande_meldingen(
  p_limit  integer     default 20,
  p_na_at  timestamptz default null,
  p_na_id  uuid        default null
)
returns table (
  id                        uuid,
  group_id                  uuid,
  groepsnaam                text,
  subject_id                uuid,
  onderwerp_naam            text,
  reden                     text,
  toelichting               text,
  bericht_kopie             text,
  status                    text,
  created_at                timestamptz,
  meldingen_over_onderwerp  integer,
  via_escalatie             boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- ⚠️ **M3 — de voorpoort, en die staat er om onwrikbare regel 12.** Het filter
  --    eronder is een functieaanroep per rij en dus niet te indexeren; voor de
  --    gebruiker die geen beheerder is en nergens escaleert, raakte de scan élke
  --    open melding op het platform aan. 📏 Gemeten bij 5000 open meldingen:
  --    `Rows Removed by Filter: 5000`, 58 ms, nul rijen — bij élk profielbezoek,
  --    want de ingangskaart vraagt er één op. Deze conjunct is een scalaire
  --    subquery, dus Postgres rekent hem één keer uit en slaat de scan over.
  select r.id,
         r.group_id,
         g.name,
         r.subject_id,
         p.display_name,
         r.reden,
         r.toelichting,
         r.bericht_kopie,
         r.status,
         r.created_at,
         -- ⚠️ **M2 — `distinct` op de melder.** De kop van 0296 legt dit getal
         --    uit als *"vijf mensen melden dezelfde persoon"*, en dat is precies
         --    wat `count(*)` niet meet: 📏 één melder haalde er met het
         --    dagquotum van `meldingen_over()` twintig, en het scherm toonde
         --    "20 meldingen over deze persoon" zonder dat er een manier was om
         --    te zien dat het één iemand was — `reporter_id` is er immers met
         --    opzet uit.
         (select count(distinct a.reporter_id)::integer
            from public.reports a
           where a.group_id = r.group_id
             and a.subject_id = r.subject_id
             and a.status = 'open'),
         not public.mag_melding_als_beheerder(r.group_id)
  from public.reports r
       join public.groups   g on g.id = r.group_id
       join public.profiles p on p.id = r.subject_id
  where r.status = 'open'
    and (select public.moderatiepoort())
    -- ⚠️ **K1 — één conjunct over béide routes.** Hij stond alleen in route (a),
    --    en route (b) vuurt juist wanneer het onderwerp beheerder is. Wie het
    --    onderwerp is, beoordeelt niet.
    and r.subject_id <> (select auth.uid())
    and (public.mag_melding_als_beheerder(r.group_id)
         or public.mag_melding_als_escalatie(r.group_id, r.subject_id))
    -- ⚠️ De cursor, en beide helften of geen van beide — zelfde vorm als
    --    `openstaande_beoordelingen()` (0125).
    and (p_na_at is null or p_na_id is null
         or (r.created_at, r.id) < (p_na_at, p_na_id))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;

comment on function public.openstaande_meldingen(integer, timestamptz, uuid) is
  'Openstaande meldingen voor de groepsbeheerder, plus de gevallen die de groep '
  'zelf niet kán afhandelen voor de platformbeheerder — QS8-586, versmald in '
  '0297. Zonder reporter_id, en nooit over jezelf.';

-- ---------------------------------------------------------------------------
-- 4. K1, K2, M1, L — de afhandeling
-- ---------------------------------------------------------------------------
create or replace function public.handel_melding_af(
  p_report_id uuid,
  p_status    text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mij uuid := (select auth.uid());
  v_rij public.reports;
  v_mag boolean;
begin
  if v_mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- ⚠️ `not_allowed` en niet `not_found` voor een bestaande rij die je niet mag
  --    zien: anders is deze RPC een orakel dat vertelt of een melding-id bestaat.
  if p_status is null or p_status not in ('reviewed', 'dismissed') then
    return jsonb_build_object('ok', false, 'reason', 'status_invalid');
  end if;

  select * into v_rij from public.reports where id = p_report_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  -- ⚠️ **Dezelfde twee takken als de lezer, uit dezelfde twee functies.** Ze
  --    stonden in 0296 twee keer uitgeschreven, en dat is precies hoe ze uit
  --    elkaar gaan lopen: de lezer en de afhandeling moeten het altijd eens zijn
  --    over wie mag. Nu is er één plek per tak.
  v_mag := v_rij.subject_id <> v_mij
       and (public.mag_melding_als_beheerder(v_rij.group_id)
            or public.mag_melding_als_escalatie(v_rij.group_id, v_rij.subject_id));

  if not v_mag then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  -- ⚠️ Alleen een openstaande melding is af te handelen. Zonder deze poort kan
  --    een tweede beheerder een oordeel van de eerste overschrijven, en dan is
  --    `afgehandeld_door` niet meer wie het besloot. De `for update` hierboven
  --    draagt de gelijktijdige variant; deze `if` de sequentiële.
  if v_rij.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'already_handled');
  end if;

  update public.reports
     set status           = p_status,
         afgehandeld_door = v_mij,
         afgehandeld_op   = now()
   where id = p_report_id;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.handel_melding_af(uuid, text) is
  'De enige weg naar een andere meldingsstatus; legt vast wie het besloot en '
  'wanneer — QS8-586, versmald in 0297. Nooit over jezelf.';
