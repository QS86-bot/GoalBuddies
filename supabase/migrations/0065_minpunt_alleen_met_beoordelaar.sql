-- 0065 — Het minpunt gaat alleen door als iemand had kunnen beoordelen (QS8-110)
--
-- Hoort bij 0064. Die levert de vraag `kan_beoordeeld_worden()`; deze handhaaft
-- het antwoord.
--
-- ⚠️ **Waarom in de database en niet in de rollover.** De rollover is de enige
--    schrijver van `cycle_missed` vandaag, maar `supabase/functions/` valt buiten
--    typecheck, lint en CI, en de repo-versie van dat bestand loopt aantoonbaar
--    achter op de gedeployde (de repo mist de straffen uit 0057 en de
--    risicoherberekening). Een regel die dáár staat, geldt zolang niemand een
--    tweede schrijver toevoegt en zolang niemand een oude versie deployt.
--
--    Hier geldt hij voor elke schrijver, ook voor een toekomstige. Dat is
--    dezelfde redenering als bij domeinregel 7: de regel is pas afgedwongen als
--    de dátabase hem afdwingt.
--
-- ⚠️ **De trigger slaat de rij stil over en gooit niet.** Gooien zou de rollover
--    elk uur een fout opleveren voor elke gebruiker zonder buddy — en dat is
--    geen storing maar de bedoeling. `raise notice` laat het spoor achter in de
--    Postgres-logs zonder de job te hinderen.
--
--    Gevolg dat je moet weten: de rollover telt zo'n week nog steeds mee in zijn
--    `gemist`-teller, terwijl er geen punt geboekt is. De statuswijziging naar
--    `missed` klópt — de week ís gemist — alleen het punt vervalt.
--
-- ⚠️ `is distinct from` en niet `<>`. `reason` is wel NOT NULL, maar `<>` op een
--    mogelijk lege waarde is in SQL geen controle maar een derde antwoord dat
--    zich in een `if` als onwaar gedraagt. Met `<>` zou een lege `reason` door de
--    eerste tak vallen en daarna beoordeeld worden alsof het een gemiste week
--    was — en dan verdwijnt er een punt dat wél geboekt hoorde te worden.
--
-- ⚠️ Een `cycle_missed` zonder `goal_id` gaat gewoon door. Zo'n rij hoort niet te
--    bestaan, maar als hij bestaat is "de regel niet kunnen toetsen" geen reden
--    om stilzwijgend van gedrag te veranderen. Bij twijfel blijft het zoals het
--    was.
--
-- Idempotent: `create or replace` plus `drop trigger if exists`.
--
-- ROLLBACK:
--   drop trigger if exists minpunt_alleen_met_beoordelaar on public.points_ledger;
--   drop function if exists public.geen_minpunt_zonder_beoordelaar();
--
-- Geen dump vooraf nodig: dit voegt een trigger toe en wijzigt geen bestaande
-- rijen. `points_ledger` is leeg (0 rijen, nagemeten 22-08-2026).

create or replace function public.geen_minpunt_zonder_beoordelaar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Alleen het minpunt van een gemiste week. Al het andere ongemoeid.
  if new.reason is distinct from 'cycle_missed' then
    return new;
  end if;

  -- Niet te toetsen: laat het zoals het was.
  if new.goal_id is null then
    return new;
  end if;

  if kan_beoordeeld_worden(new.goal_id, new.user_id) then
    return new;
  end if;

  raise notice
    'QS8-110: minpunt overgeslagen voor doel % van gebruiker % — geen beoordelaar.',
    new.goal_id, new.user_id;

  return null;
end;
$$;

comment on function public.geen_minpunt_zonder_beoordelaar() is
  'Slaat het minpunt van een gemiste week over als niemand die week had kunnen '
  'goedkeuren (QS8-110, optie C). Zonder buddy geen punten omhoog, dus ook niet omlaag.';

drop trigger if exists minpunt_alleen_met_beoordelaar on public.points_ledger;

create trigger minpunt_alleen_met_beoordelaar
  before insert on public.points_ledger
  for each row
  execute function public.geen_minpunt_zonder_beoordelaar();
