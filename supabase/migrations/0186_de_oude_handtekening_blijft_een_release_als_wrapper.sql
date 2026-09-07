-- 0186_de_oude_handtekening_blijft_een_release_als_wrapper.sql — de gedeployde rollover roept een handtekening aan die 0185 heeft gedropt (QS8-324)
--
-- ROLLBACK-PAD:
--   drop function if exists public.activeer_weekplanstap(uuid, date, integer);
--   Meer niet. Deze migratie voegt één afgeschreven wrapper toe en raakt geen
--   gegevens, geen policy en geen bestaande functie. Terugdraaien zet de
--   toestand terug op die van vlak ná 0185.
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- `0185` dropte `activeer_weekplanstap(uuid, date, integer)` en zette er een
-- tweearguments vorm neer. De **gedeployde** rollover roept de driearguments
-- vorm nog aan — de edge-functies zijn van 06-09 en de migraties van 07-09
-- (QS8-320) — en krijgt van PostgREST `PGRST202`. De rollover vangt dat zacht af
-- met `continue`, dus het valt stil met een HTTP 200 en niemand ziet het.
--
-- 📏 **Gemeten op productie op 07-09, vlak vóór deze migratie:**
--
--   register hoogste               0185
--   kolom cycle_index bestaat nog  0
--   driearguments varianten over   geen
--   weekly_plan_steps              0
--
-- ⚠️ **Vandaag is dat inert.** `weekly_plan_steps` is leeg, dus
-- `weekplan_kandidaten()` geeft niets terug en de RPC wordt nooit aangeroepen.
-- Maar dat is een landmijn en geen toestand: hij scherpt zichzelf zodra de
-- eerste weekplanstap bestaat.
--
-- ---------------------------------------------------------------------------
-- Waarom een wrapper en niet "gewoon deployen"
-- ---------------------------------------------------------------------------
--
-- Deployen moet ook gebeuren en staat als QS8-320. Maar de kóppeling is het
-- probleem: een migratie die een RPC-handtekening dropt, maakt een deploy tot
-- een harde volgorde-eis, en die eis is nergens afdwingbaar. Er is geen
-- deploy-workflow in `.github/workflows/`, en `npm run edge:gedeployd` ziet het
-- pas achteraf en alleen met een access token.
--
-- De security-review op QS8-147 noemde de duurzame vorm al met zoveel woorden:
-- *"de oude handtekening één release als wrapper laten staan en hem in een
-- volgmigratie droppen."* Dan is de deploy weer een gewone deploy in plaats van
-- een race die je verliest zonder het te merken.
--
-- ---------------------------------------------------------------------------
-- Wat de wrapper wél en niet doet
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Hij negeert zijn derde argument, en dat is correct en niet slordig.**
-- `cycle_index` werd door niemand gelezen — dat is de hele grond onder QS8-147 —
-- en de kolom bestaat sinds 0185 niet meer. De oude rollover rekende dat getal
-- uit en stuurde het mee; de wrapper gooit het weg en doet verder precies wat de
-- tweearguments vorm doet. Er gaat dus geen gedrag verloren.
--
-- ⚠️ **Geen `security definer` op de wrapper zelf.** Hij hoeft niets te mogen wat
-- de beller niet mag: `activeer_weekplanstap(uuid, date)` is zélf definer en
-- draagt de autorisatie. Een tweede definer erbovenop is oppervlak zonder reden,
-- en elke definer-functie in dit project is een kopie van de vorige — zo groeit
-- die verzameling zonder dat iemand het besluit. `set search_path` staat er wél,
-- want die hoort bij élke functie die naar `public` wijst.
--
-- ---------------------------------------------------------------------------
-- Wanneer hij weg mag
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een wrapper zonder einddatum is permanent.** Deze mag weg zodra
-- `npx supabase functions deploy rollover` gedraaid heeft én
-- `npm run edge:gedeployd` bevestigt dat de draaiende rollover de tweearguments
-- vorm aanroept. Dat staat als eigen issue; de `comment on` hieronder draagt
-- dezelfde zin, zodat wie de functie in de database tegenkomt niet hoeft te
-- raden of hij nog ergens voor dient.

-- ---------------------------------------------------------------------------
-- De ijking, en waarom hij eerst niets bewees
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De eerste mutatie op de revoke liet alle vijf de tests groen**, en dat
-- lag niet aan de test maar aan de mutatie. `create or replace` op een functie
-- die er al staat, **behoudt de bestaande grants** — de verruiming door
-- `alter default privileges` gebeurt alleen bij een vérse `create`. De migratie
-- had bij de eerdere geslaagde run al gerevoked, dus het weghalen van de revoke
-- veranderde niets en de ijking voerde zijn geval door een toestand die het
-- probleem al had afgevangen.
--
-- 📏 Opnieuw gedaan mét `drop function` ervoor, zodat de functie echt vers
-- ontstaat:
--
--   revoke weg + verse create   anon=t auth=t   → 1 test rood (de rechtenvergelijking)
--   security definer erop       —               → 1 test rood (de definertoets)
--   beide hersteld                              → 5 van de 5 groen
--
-- **De les is die van regel 18 in een nieuwe vorm:** een mutatie die zijn geval
-- door een pad voert dat een eerdere toestand al afvangt, bewaakt niets van wat
-- hij belooft. Bij een grendel op *rechten* hoort de mutatie dus een `drop` —
-- anders toets je de idempotentie van `create or replace` en niet je revoke.

create or replace function public.activeer_weekplanstap(
  p_goal_id          uuid,
  p_cycle_start_date date,
  p_cycle_index      integer
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- ⚠️ `p_cycle_index` wordt bewust genegeerd: de kolom die hij vulde is met
  --    0185 verdwenen omdat niemand hem las. Deze vorm bestaat alleen nog voor
  --    de rollover die nog niet opnieuw gedeployd is.
  return public.activeer_weekplanstap(p_goal_id, p_cycle_start_date);
end;
$$;

comment on function public.activeer_weekplanstap(uuid, date, integer) is
  'AFGESCHREVEN (QS8-324). Dunne wrapper op activeer_weekplanstap(uuid, date); '
  'negeert p_cycle_index, want die kolom is met 0185 verdwenen. Bestaat alleen '
  'om de rollover van vóór 07-09-2026 draaiend te houden. Mag weg zodra '
  '`supabase functions deploy rollover` gedraaid heeft en `edge:gedeployd` '
  'bevestigt dat de draaiende rollover de tweearguments vorm aanroept.';

-- ⚠️ **Exact de rechten van het origineel, en gemeten in plaats van aangenomen.**
--    `activeer_weekplanstap(uuid, date)` is `anon=f auth=f svc=t`. Een verse
--    functie krijgt van Supabase's `alter default privileges` execute voor
--    `anon`, `authenticated` én `service_role`, dus zonder deze revoke zou de
--    wrapper ruimer zijn dan wat hij inpakt — en dan is de wrapper zelf het gat.
--
--    Onwrikbare regel 4: `authenticated` staat er met zoveel woorden.
revoke execute on function public.activeer_weekplanstap(uuid, date, integer)
  from public, anon, authenticated;
grant  execute on function public.activeer_weekplanstap(uuid, date, integer)
  to service_role;
