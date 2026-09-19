-- 0294_de_strafpoort_meet_aan_de_bevroren_klok_en_p_vandaag_wordt_een_wrapper.sql
-- — de verlooppoort van `maak_straffen_verschuldigd()` mat aan de levende
-- `profiles.tz`, en dat is de klok die de gestrafte zelf zet (QS8-548)
--
-- ROLLBACK-PAD:
--   drop function if exists public.maak_straffen_verschuldigd(uuid);
--   `maak_straffen_verschuldigd(uuid, date)` terug op de versie van 0290: weer
--   `security definer`, met het volledige lichaam en `g.target_date < p_vandaag`.
--   Verder niets: deze migratie raakt geen tabel, geen kolom en geen policy aan.
--
--   ⚠️ Terugdraaien zet het gat terug dat deze migratie sluit — één dag uitstel
--      op je straf voor één PATCH op je tijdzone, zonder uitstelverzoek — en het
--      breekt de dán gedeployde rollover als die intussen de eenargumentsvorm
--      aanroept. Lees eerst de sectie *Wanneer de wrapper weg mag* hieronder.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `0290` verzette het zevendaagse schild naar `doeldatum()` (de bevroren
-- `commitments.tz`, `0280`) en liet de regel erbóven met zoveel woorden staan:
--
--     and g.target_date < p_vandaag
--
-- `p_vandaag` komt van buiten de database — `localDateIn(profiel.tz, nu)` in
-- `supabase/functions/rollover/index.ts`. Dat is de **levende** `profiles.tz`,
-- en 📏 `has_column_privilege('authenticated','public.profiles','tz','UPDATE')`
-- is `t`.
--
-- 📏 **Gemeten op 18-09-2026** op de lokale stack, tegen `pg_get_functiondef()`.
--    Straf `set`, `created_at` dertig dagen oud, **geen** uitstelverzoek,
--    streefdatum één dag vóór de dag van het aangaan, en als énige variabele de
--    zone ná het aangaan:
--
--      UTC        -> UTC        (eerlijk)   verschuldigd = 1
--      Kiritimati -> Honolulu   (aanval)    verschuldigd = 0
--
-- ⚠️ **Kiritimati/Honolulu en niet Kiritimati/Midway**, hoewel het issue dat
--    laatste paar noemt. Midway (`UTC−11`) scheelt 25 uur en dus één dag óf
--    twee, afhankelijk van het uur; Honolulu (`UTC−10`) scheelt er exact 24 en
--    dus altijd precies één. 📏 Dat verschil maakte de suite van `0290` twee van
--    de vierentwintig uur rood (zie zijn kop). De uitslag hierboven is met béide
--    paren gemeten en identiek; alleen het paar dat niet van het uur afhangt
--    hoort in een meting die iemand later overdoet.
--
-- ⚠️ Dit is de eenvoudigste van de drie routes uit deze familie: er komt geen
--    uitstelverzoek aan te pas, alleen een `PATCH` op je eigen profiel.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Het besluit, en wat het kost
-- ---------------------------------------------------------------------------
--
-- **Besluit van Quinten, 19-09-2026: bevriezen op `commitments.tz`** — dezelfde
-- keuze als `0280`, `0288` en `0290`, en om dezelfde reden: het is de enige
-- optie die niemands belofte kráppen maakt.
--
-- ⚠️ **De prijs staat er dit keer vóór de keuze en niet erachter, want hij is
--    bij QS8-533 al gemeten.** Wie eerlijk naar het **westen** verhuist, krijgt
--    zijn straf op de klok waarop hij hem aanging: tot een dag eerder dan zijn
--    nieuwe kalender zegt, mét het `commitment_due`-bericht in de begunstigde
--    groep dat blijft staan ook nadat een buddy uitstel toewijst (domeinregel 7
--    §3 — een systeembericht is een onveranderlijke kopie). Wie naar het
--    **oosten** verhuist krijgt juist een dag coulance terug.
--
-- ⚠️ **Twee alternatieven zijn met die prijs erbij voorgelegd en afgewezen.**
--    *Laten staan* liet één dag uitstel te koop voor één `PATCH`. En
--    `greatest(p_vandaag, doeldatum(...))` — zodra één van beide klokken zegt
--    dat de streefdatum voorbij is, is hij voorbij — sluit het gat óók, maar
--    neemt de coulance weg die deze keuze teruggeeft aan wie naar het oosten
--    verhuist. Dat zou de enige plek in dit model zijn waar een bestaande
--    belofte krapper wordt. Afweging in
--    `docs/decisions/2026-09-19-de-laatste-klok-onder-een-straf.md`.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Wat dit issue eigenlijk is: `p_vandaag` heeft niets meer te doen
-- ---------------------------------------------------------------------------
--
-- Met deze regel verzet leest de functie geen enkele datum meer van buiten. Wat
-- overbleef was een parameter die alleen nog de null-poort bewaakte, en dat is
-- een val: de volgende schrijver leest hem als *"hier hoort de dag van de
-- gebruiker in"* en hangt er iets aan. Criterium 3 van QS8-548 zegt daarom: hij
-- doet nog iets, of hij verdwijnt.
--
-- Hij verdwijnt. `maak_straffen_verschuldigd(uuid)` is vanaf nu de functie die
-- het werk doet.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Waarom de oude handtekening blijft staan, als wrapper
-- ---------------------------------------------------------------------------
--
-- Een migratie die een RPC-handtekening dropt, maakt een deploy tot een harde
-- volgorde-eis — en die eis is in dit project nergens afdwingbaar. Er is geen
-- deploy-workflow in `.github/workflows/`, en `npm run edge:gedeployd` ziet het
-- pas achteraf en alleen met een access token.
--
-- 📏 En de afstand is hier echt: `supabase/uitgerold.json` zegt dat productie op
--    **0282** staat (gemeten 17-09-2026), terwijl de map op `0294` staat. De
--    gedeployde rollover is van 09-09 en roept de tweearguments vorm aan.
--
-- Dit is woordelijk de vorm van `0186` / QS8-324, die om dezelfde reden bestaat:
-- *dan is de deploy weer een gewone deploy in plaats van een race die je
-- verliest zonder het te merken.*
--
-- ⚠️⚠️ **Maar hij neemt de eis maar in één richting weg, en dat is in de
--    security-ronde op deze branch boven gekomen.** De wrapper dekt *migratie
--    vóór deploy*: de bundel die er nu draait blijft werken. Hij dekt **niet**
--    *deploy vóór migratie*: `rollover/index.ts` roept vanaf deze commit de
--    eenargumentsvorm aan, en die bestaat op productie pas als dit bestand daar
--    gelandt is. 📏 En dat is geen randgeval — `supabase/uitgerold.json` zegt
--    `0282`, dus de migratie ligt er gegarandeerd nog niet.
--
--    Wordt er eerder gedeployd, dan geeft PostgREST `PGRST202`,
--    `wikkelStraffenAf()` logt naar `console.error` en telt nul, de rollover
--    loopt door met een 200 — en er wordt voor **niemand** nog een straf
--    verschuldigd, zonder dat iets rood wordt. Domeinregel 11 valt dan stil.
--
--    **De regel is dus: migratie eerst, deploy daarna.** De wrapper maakt alleen
--    dat je tussen die twee mag ademen. `docs/DEPLOY.md` §2.3a draagt dezelfde
--    zin, want daar stond hij ook maar in één richting.
--
-- ⚠️⚠️ **En de wrapper is hier méér dan compatibiliteit: hij past de reparatie
--    ook toe op de gedeployde rollover.** Hij gooit `p_vandaag` weg en roept de
--    eenargumentsvorm aan, dus het gat gaat dicht zodra deze migratie draait —
--    zonder dat er iets gedeployd hoeft te worden. Dat is precies andersom dan
--    bij `0186`, waar de wrapper alleen gedrag behield.
--
-- ⚠️ **Geen `security definer` op de wrapper.** Hij hoeft niets te mogen wat de
--    beller niet mag; `maak_straffen_verschuldigd(uuid)` is zélf definer en
--    draagt de autorisatie. Een tweede definer erbovenop is oppervlak zonder
--    reden — en elke definer-functie in dit project is een kopie van de vorige,
--    zo groeit die verzameling zonder dat iemand het besluit. Zelfde redenering
--    als `0186`. `set search_path` staat er wél, want die hoort bij élke functie
--    die naar `public` wijst.
--
-- ---------------------------------------------------------------------------
-- Wanneer de wrapper weg mag
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een wrapper zonder einddatum is permanent.** Deze mag weg zodra
-- `npx supabase functions deploy rollover` gedraaid heeft én er **tegen de
-- gedeployde bundel** — niet tegen deze map — gemeten is dat de draaiende
-- rollover de eenargumentsvorm aanroept. Dat is dezelfde meting die QS8-403 op
-- 09-09 voor `0186` deed, met `get_edge_function` op `wehgocadxehottiiyvsc`.
--
-- Dat staat als eigen issue (**QS8-559**), en de `comment on` onderaan draagt
-- dezelfde zin — zodat wie de functie in de database tegenkomt niet hoeft te
-- raden of hij nog ergens voor dient.

-- ---------------------------------------------------------------------------
-- 1. De functie die het werk doet — zonder datum van buiten
-- ---------------------------------------------------------------------------

/**
 * Maakt de straffen verschuldigd waarvan de streefdatum verstreken is, gemeten
 * op de zone die bij het aangaan van de straf bevroren is — QS8-548.
 *
 * ⚠️ **Eén klok, en dat is het verschil met de versie van `0290`.** Daar mat de
 *    verlooppoort aan een datum van buiten en het schild eromheen aan
 *    `doeldatum()`; die twee konden uit elkaar lopen zodra iemand zijn
 *    `profiles.tz` verzette. Alle drie de datumvragen lopen nu via dezelfde
 *    `doeldatum(g.id, g.owner_id)`.
 *
 * ⚠️ De `cross join lateral` staat er om die vraag één naam te geven. Losse
 *    aanroepen van dezelfde functie zijn losse regels die iemand apart kan
 *    verzetten, en dat is de fout die `0290` repareerde — één laag kleiner.
 *    Hij kan geen rijen laten vallen of vermenigvuldigen: een `select` zonder
 *    `from` geeft altijd precies één rij.
 *
 * ⚠️ `doeldatum()` geeft hier altijd de bevroren klok en nooit zijn terugval:
 *    de rij die bijgewerkt wordt ís een straf met `status = 'set'`, en dat is
 *    een van de statussen waar `doeldatum()` zijn `max()` over neemt.
 *    `tests/rls/het-schild-meet-aan-de-bevroren-strafklok.test.ts` legt die
 *    aanname vast, samen met `commitments.tz NOT NULL` en de terugval die
 *    `doeldatum()` niet-null houdt.
 */
create or replace function public.maak_straffen_verschuldigd(p_owner_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_aantal integer;
begin
  if p_owner_id is null then
    return 0;
  end if;

  update commitments c
     set status = 'due'
    from goals g
         cross join lateral (
           select public.doeldatum(g.id, g.owner_id) as vandaag
         ) d
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     and g.target_date < d.vandaag
     and c.created_at < now() - interval '24 hours'
     and not exists (
       select 1
       from deadline_requests r
       where r.goal_id = g.id
         and r.status = 'open'
         and r.new_date >= d.vandaag
         and exists (
           select 1
           from group_members m
           where m.group_id = r.group_id
             and m.user_id <> r.requester_id
             and m.status <> 'inactive'
         )
         and g.target_date > d.vandaag - 7
         and not exists (
           select 1
           from deadline_requests eerder
           where eerder.goal_id = g.id
             and eerder.status = 'rejected'
             and eerder.old_date = g.target_date
         )
     );

  get diagnostics v_aantal = row_count;
  return v_aantal;
end;
$$;

revoke all on function public.maak_straffen_verschuldigd(uuid) from public, anon, authenticated;
grant execute on function public.maak_straffen_verschuldigd(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. De oude handtekening blijft één release als afgeschreven wrapper
-- ---------------------------------------------------------------------------

/**
 * Afgeschreven — QS8-548, mag weg onder de voorwaarde in de `comment on`.
 *
 * ⚠️ **Hij negeert `p_vandaag`, en dat is de reparatie en niet slordigheid.**
 *    Die datum kwam uit de levende `profiles.tz` en is precies wat dit issue
 *    weghaalt. De gedeployde rollover blijft hem meesturen tot hij opnieuw
 *    uitgerold is; hier gaat hij de prullenbak in.
 *
 * ⚠️⚠️ **Eén gedragswijziging die niet in de bevinding stond: de null-poort op
 *    `p_vandaag` is vervallen.** Vóór 0294 gaf `(owner, null)` nul terug —
 *    *weten we de dag niet, dan doen we niets*. 📏 Gemeten met deze wrapper:
 *    `null::date` verandert niets meer en de straf gaat gewoon af. Dat is de
 *    bedoeling van dit issue — de dag komt niet meer van de beller — maar het
 *    raakt óók de gedeployde rollover. 📏 Die tak is daar onbereikbaar, en dat
 *    is uit de bron gelezen en niet aangenomen: `draaiRollover` doet
 *    `if (afsluitbaar === null) { overgeslagen += 1; continue; }` vóór de
 *    aanroep, dus een profiel met een onbruikbare zone komt hier nooit.
 */
create or replace function public.maak_straffen_verschuldigd(p_owner_id uuid, p_vandaag date)
returns integer
language sql
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select public.maak_straffen_verschuldigd(p_owner_id);
$$;

-- ⚠️ **Deze revoke is vandaag een no-op, en staat er tóch.** `create or replace`
--    behoudt de bestaande ACL, en die was al dicht sinds 0057/0174/0175 — 📏
--    nagemeten in een teruggedraaide transactie: zónder deze regel blijft
--    `anon=f auth=f service=t` staan. De revoke op de **eenarguments**vorm
--    hierboven is wél dragend, want dat is een vérse `create`: 📏 `pg_default_acl`
--    in deze database gunt `anon`, `authenticated` én `service_role` EXECUTE op
--    elke nieuwe functie in `public`, en zonder die revoke had iedere ingelogde
--    gebruiker de straf van een willekeurige `p_owner_id` kunnen laten afgaan.
--    Dat verschil is de les van 0186 en het staat hier omdat de volgende lezer
--    anders moet raden welke van de twee het werk doet.
revoke all on function public.maak_straffen_verschuldigd(uuid, date) from public, anon, authenticated;
grant execute on function public.maak_straffen_verschuldigd(uuid, date) to service_role;

comment on function public.maak_straffen_verschuldigd(uuid, date) is
  'Afgeschreven sinds 0294 (QS8-548): negeert p_vandaag en roept '
  'maak_straffen_verschuldigd(uuid) aan. Bestaat alleen voor de gedeployde '
  'rollover, die de tweearguments vorm nog aanroept. Mag weg zodra '
  '`npx supabase functions deploy rollover` gedraaid heeft EN er tegen de '
  'gedeployde bundel gemeten is dat de draaiende rollover de eenargumentsvorm '
  'aanroept — niet tegen supabase/functions/ in de map. Staat als QS8-559.';
