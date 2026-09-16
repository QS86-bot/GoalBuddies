-- 0277_een_weggestuurd_of_geblokkeerd_lid_ziet_de_uitnodigingskaart_niet.sql
-- — `invite_preview()` weigert wie eruit gezet of geblokkeerd is. QS8-502.
-- Afweging en metingen:
-- `docs/decisions/2026-09-16-de-kaart-die-bleef-hangen-na-het-vertrek.md`
--
-- ROLLBACK-PAD:
--   create or replace function public.invite_preview(text) … -- terug naar de
--     definitie uit 0128, zónder de wachttak. ⚠️ Dat zet het lek terug: een
--     weggestuurd lid leest dan weer de doeltitels van zijn ex-groepsgenoten.
--     Kopieer dat lichaam uit de database of uit 0128, niet uit deze migratie.
--
-- ⚠️ Deze migratie raakt geen rij en geen kolom: één `create or replace`.
--
-- ---------------------------------------------------------------------------
-- De meting die dit nodig maakte
-- ---------------------------------------------------------------------------
--
-- 📏 Opstelling op de lokale stack: een groep op `zichtbaarheid = 'beschermd'`
--    met code `M3CODE123456`, een eigenaar met het doel `Stoppen met drinken`
--    gekoppeld aan die groep, en een tweede gebruiker die **op `inactive` staat**
--    (weggestuurd) én **geblokkeerd** is door de eigenaar. Die tweede, ingelogd,
--    met de oude code:
--
--      invite_preview('M3CODE123456') -> members[0].goal_title
--        = 'Stoppen met drinken'
--                             members[0].display_name
--        = 'Eigenaar Vandenberg'   (de volledige naam, niet de voornaam)
--
--    📏 En `blokkade_met_groep(groep, hem)` gaf in diezelfde opstelling `t`. De
--    toets béstond dus al en werd alleen niet aangeroepen.
--
-- ⚠⚠ **De naad: de schrijfkant was dicht en de leeskant niet.** 📏
--    `join_group_with_code()` draagt allebei de toetsen — `blokkade_met_groep()`
--    geeft `invalid` en een `inactive`-lidmaatschap geeft `removed` — dus
--    terugkomen kon hij al niet. Alleen de kaart erboven bleef alles tonen.
--    Dat is onwrikbare regel 18 vraag 1 in zijn zuiverste vorm: twee correcte
--    onderdelen, en de knoop ertussen onbewaakt.
--
-- ⚠️ **Waarom dit zwaarder weegt dan het lijkt.** Domeinregel 4 zegt dat een
--    lid andermans doelen alleen ziet *voor zover de groepsinstellingen dat
--    toestaan*. Hier kreeg een **niet-lid** ze, langs een `security definer` die
--    `goals_select` overslaat, en er was géén instelling die eroverheen ging —
--    ook `zichtbaarheid` niet. En het moment waarop het pijn doet is precies het
--    moment waarop de meld- en blokkeerstroom van 0145 gebruikt wórdt: iemand
--    gaat er wegens vervelend gedrag uit en houdt zijn venster op de groep.
--
--    0128 haalde `avatar_url` uit dézelfde functie met het argument *"een
--    uitnodigingscode verloopt nooit en is bedoeld om doorgestuurd te worden"*.
--    Dat argument is nooit op `goal_title` toegepast, terwijl een doeltitel
--    (`Stoppen met drinken`) een orde van grootte gevoeliger is dan een
--    avatarpad.
--
-- ---------------------------------------------------------------------------
-- Waarom deze richting, en niet de twee andere die het issue noemt
-- ---------------------------------------------------------------------------
--
-- Het issue biedt drie richtingen. Deze migratie doet de tweede, verbreed.
--
--   1. **`verwijder_lid()` roteert de code.** Niet gedaan. De prijs staat in het
--      issue zelf: een rotatie maakt élke uitstaande link ongeldig, ook die van
--      mensen die nog niet gereageerd hebben, en dat is precies waarom roteren
--      vandaag een handmatige beheerdersactie is. ⚠️ En het lost het geval niet
--      op: een geblókkeerde die nooit lid was, wordt door geen enkele rotatie
--      geraakt.
--   2. **`invite_preview()` toetst de blokkade.** Dat is dit — maar de blokkade
--      alleen dekt het acceptatiecriterium niet, want dat noemt *weggestuurd
--      óf geblokkeerd*. 📏 Gemeten: bij een weggestuurd lid dat **niet**
--      geblokkeerd is, geeft `blokkade_met_groep()` `f`. Vandaar de tweede tak
--      op `status = 'inactive'`, en niet alleen de eerste.
--   3. **`goal_title` alleen bij `zichtbaarheid = 'open'`.** Niet gedaan, en dat
--      is een productbesluit en geen beveiligingsfix. `beschermd` is de
--      standaard (A41), dus deze richting haalt de titels van vrijwel élke
--      uitnodigingskaart — en acceptatiecriterium 2 zegt met zoveel woorden dat
--      een gewone genodigde ze móét blijven zien, *"want daar staan ze voor"*.
--      Wie die richting alsnog wil, verandert wat de kaart bélooft en niet wie
--      hem mag zien; dat is een eigen besluit.
--
-- ---------------------------------------------------------------------------
-- Wat deze migratie niet dicht doet
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het vergelijkingskanaal blijft open, en dat is bewust dezelfde afweging
--    die QS8-232 al maakte.** Wie geblokkeerd is krijgt `null` waar een vriend
--    met dezelfde code een kaart krijgt; wie die twee naast elkaar legt, weet
--    dat er iets is. Dat geldt woordelijk ook voor `vraag_lidmaatschap_aan()`,
--    waar `not_open` sinds QS8-232 drie gevallen dekt. Het alternatief — een
--    népkaart tonen — is erger: dan lekt hij weer namen en titels. Eén antwoord
--    voor vier gevallen is de beste vorm die hier bestaat.
--
-- ⚠️ **De code blijft geldig.** Dit haalt zijn vénster weg, niet zijn sleutel.
--    Terugkomen kon al niet (`join_group_with_code()` hierboven), maar wie de
--    code doorstuurt naar iemand anders, geeft nog steeds een werkende link weg.
--    Dat is de eigenschap van een code die nooit verloopt, en richting 1 is de
--    enige die hem raakt.
-- ---------------------------------------------------------------------------

begin;

CREATE OR REPLACE FUNCTION public.invite_preview(code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ⚠️⚠️ **Wie eruit gezet is of geblokkeerd, krijgt dezelfde `null` — 0277,
  --    QS8-502.** `join_group_with_code()` draagt deze twee toetsen al (blokkade
  --    -> `invalid`, `inactive` -> `removed`); alleen de lééskant miste ze, en
  --    dat is de naad: toetreden was dicht, de kaart erboven niet.
  --
  --    📏 Gemeten vóór deze migratie, met een lid op `inactive` én geblokkeerd
  --    door de eigenaar: `invite_preview()` gaf `goal_title` = 'Stoppen met
  --    drinken' en de volledige `display_name`, in een groep op `beschermd`.
  --
  -- ⚠️ **`null` en niet een eigen antwoord, en dat is de vorm van dit huis.**
  --    0019 maakte `null` één antwoord voor "ingetrokken, verlopen of nooit
  --    bestaan", juist zodat deze functie geen orakel is; QS8-232 voegde bij
  --    `vraag_lidmaatschap_aan()` de blokkade toe aan één bestaand antwoord om
  --    dezelfde reden. Een eigen `reason` hier zou van blokkeren — dat stil
  --    hoort te zijn (0145: *"hij krijgt geen bericht en kan het nergens zien"*)
  --    — iets maken dat je kunt aflezen.
  --
  -- ⚠️⚠️ **En de toets staat vóór de teller, niet erna.** Dat is geen
  --    stijlkeuze: 📏 gemeten dat een weggestuurd lid met 61 aanroepen de teller
  --    van 0131 volmaakt, waarna een échte genodigde `{"limiet_bereikt": true}`
  --    krijgt. De teller is per groep, dus wie de kaart niet mag zien kon het
  --    uitnodigen van de héle groep een uur lang stilleggen. Erna toetsen laat
  --    dat staan.
  if (select auth.uid()) is not null
     and (
       blokkade_met_groep(g.id, (select auth.uid()))
       or exists (
         select 1 from group_members m
         where m.group_id = g.id
           and m.user_id = (select auth.uid())
           and m.status = 'inactive'
       )
     )
  then
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

commit;
