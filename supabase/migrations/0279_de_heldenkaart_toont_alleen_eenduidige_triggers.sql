-- 0279_de_heldenkaart_toont_alleen_eenduidige_triggers.sql
-- — `groep_helden()` laat `misser` en `tussendoor` vallen. QS8-493.
-- Afweging en metingen:
-- `docs/decisions/2026-09-16-een-held-die-het-tegenovergestelde-zegt.md`
--
-- ROLLBACK-PAD:
--   create or replace function public.groep_helden(uuid, integer, integer) …
--     -- terug naar de allowlist van 0268: `['misser','stilte','mijlpaal','tussendoor']`.
--     ⚠️ Dat zet twee misleidingen terug die hieronder gemeten zijn. Doe het
--        alleen met een besluit erbij.
--
-- ⚠️ Raakt geen rij en geen kolom: één `create or replace`. `hero_appearances`
--    blijft ongemoeid — dit gaat over wat de groép ervan ziet, niet over wat er
--    geschreven wordt.
--
-- ---------------------------------------------------------------------------
-- Waarom: de kaart kon het tegenovergestelde beweren van wat er gebeurd is
-- ---------------------------------------------------------------------------
--
-- QS8-493 gaf `groep_helden()` voor het eerst een scherm. Daarmee werd zichtbaar
-- wat de functie al kon teruggeven, en twee van de vier triggers bleken iets
-- anders te betekenen dan een lezer eruit opmaakt. Gevonden in de
-- gebruikersreview, daarna zelf nagemeten.
--
-- ⚠⚠ **`tussendoor` draagt geen gebeurtenis maar iemands quízheld.** 📏
--    `kiesStem()` (`src/modules/helden/stem.ts` r. 102) geeft
--    `{ held: hoofdheld, trigger: 'tussendoor' }` zódra er géén specifieke
--    gebeurtenis is — en `metHeldenstem()` wordt zo aangeroepen bij onder meer
--    `approval_received`, dus bij goéd nieuws. Is Ignis je quizheld en wordt je
--    week goedgekeurd, dan staat er op de kaart `Anna · Ignis, De Strijder`, en
--    Ignis is de held van `misser`. De lezer ziet een misser waar een
--    goedkeuring stond.
--
--    ⚠️ **0268 zegt dit zelf in zijn kop**, en dat is de pijnlijke kant: *"Bij
--    vijf van de zes triggers is `hero_key` af te leiden uit `trigger` … Bij de
--    zesde niet: `tussendoor`."* Het scherm van QS8-493 motiveerde het weglaten
--    van de trigger met precies het tegendeel — *"held en trigger zijn één op
--    één"*. Een uitgeschreven argument dat de volgende lezer als bewezen
--    aanneemt; CLAUDE.md waarschuwt daar met zoveel woorden voor.
--
-- ⚠⚠ **`misser` betekent "vandaag niets gedaan", niet "een week gemist".** 📏
--    `nudgeReden()` (`supabase/functions/_shared/notificaties/regels.ts`) laat de
--    nudge gaan bij: herinnering aan, het ingestelde uur, géén Dagzet vandaag,
--    géén afronding vandaag, en éérgens een open weekdoel. Die nudge schrijft
--    `misser` (index.ts r. 547). Dat vuurt dus op een doodgewone dinsdag met nog
--    een hele week te gaan.
--
--    ⚠️ Dat botst met **domeinregel 9**: *"De Dagzet is standaard privé … Een
--    dag overslaan heeft geen enkel gevolg."* Hier had een overgeslagen dag
--    zeven dagen lang een groepszichtbaar gevolg. En **A41 opende gemiste
--    wéken**, niet gemiste dagen; dat een gemiste dag daarin meegleed is nooit
--    besloten.
--
--    ⚠️ En het trof uitgerekend wie zijn herinnering áán had staan: een
--    verschijning wordt alleen geschreven als er ook echt een melding uitgaat.
--    Wie meldingen uit heeft, stond nergens op de kaart.
--
-- ---------------------------------------------------------------------------
-- Wat er overblijft, en wat dat kost
-- ---------------------------------------------------------------------------
--
-- `mijlpaal` (⇔ strix) en `stilte` (⇔ lucerna). Allebei eenduidig: de bijectie
-- van `heldVoorTrigger()` houdt voor deze twee, dus de naam van de held dráágt
-- hier wél de reden.
--
-- ⚠️ **De prijs, en die staat er zodat niemand hem later hoeft te ontdekken:**
--    de kaart toont minder, en `mijlpaal` wordt bij élke weekafsluiting
--    geschreven — goed of slecht. `stilte` betekent drie dagen niets, en dat is
--    tegenslag die A41 een open groep toestaat. Wat de kaart níét meer doet is
--    iets bewéren dat niet gebeurd is.
--
-- ⚠️ Dit is een besluit van Quinten (16-09-2026), genomen onder grens 1 van de
--    beslisbevoegdheid: het bepaalt wat de app over een mens aan zijn groep
--    vertelt.
-- ---------------------------------------------------------------------------

begin;

CREATE OR REPLACE FUNCTION public.groep_helden(p_group_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, display_name text, hero_key text, trigger text, totaal bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with leden as (
    select m.user_id as user_id, p.display_name as display_name
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status <> 'inactive'
  ),
  laatste as (
    select distinct on (a.user_id)
      a.user_id  as user_id,
      a.hero_key as hero_key,
      a.trigger  as trigger
    from hero_appearances a
    where a.user_id in (select l.user_id from leden l)
      and a.trigger = any (array['mijlpaal', 'stilte'])
      and a.shown_at >= date_trunc('day', now(), 'UTC') - interval '7 days'
    order by a.user_id, a.shown_at desc, a.id desc
  ),
  samen as (
    select
      l.user_id                    as user_id,
      l.display_name               as display_name,
      h.hero_key                   as hero_key,
      h.trigger                    as trigger,
      -- ⚠️ Het aantal léden met een zichtbare verschijning, en niet het aantal
      --    leden van de groep. De paginering telt wat er in deze lijst staat;
      --    dat tweede getal staat in `groep_klassement()` en hoort daar.
      count(*) over ()             as totaal
    from leden l
    join laatste h on h.user_id = l.user_id
  )
  select s.user_id, s.display_name, s.hero_key, s.trigger, s.totaal
  from samen s
  where lid_van_open_groep(p_group_id)
  -- ⚠️ Op naam en niet op tijd. Een sortering op `shown_at` geeft het tijdstip
  --    niet prijs maar wél de volgorde, en dat is "wie miste het laatst iets" —
  --    een kolom die met opzet niet in de handtekening staat, alsnog afleidbaar
  --    uit de rijvolgorde. `user_id` erachter houdt de paginering deterministisch
  --    bij gelijke namen, zelfde reden als in `groep_klassement()`.
  order by s.display_name asc, s.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

commit;
