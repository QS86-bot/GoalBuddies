-- 0230_een_bewijsfoto_gaat_mee_met_zijn_eigenaar.sql — het AVG-antwoord, en het
-- is het tegenovergestelde van wat het issue vroeg.
--
-- ROLLBACK-PAD:
--   drop trigger if exists profielen_bewijsfotos_mee on public.profiles;
--   drop function if exists public.wis_bewijsfotos_van_vertrekker();
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Waarom dit anders is dan QS8-391 vroeg
-- ---------------------------------------------------------------------------
--
-- Het issue zei: *"de bewijsfoto **blijft** bij accountverwijdering, langs
-- dezelfde scheidslijn als 0031 — hij is bewijs voor iemand anders."* Die zin
-- klinkt goed en hij is onhoudbaar, en dat is gemeten en niet beredeneerd.
--
-- 📏 Gemeten op de lokale stack, met een voltooiing mét bijlage:
--
--     voor:  completions = 1
--     delete from profiles where id = <a>
--     na:    completions = 0, weekly_goals = 0, goals = 0
--
--     completions_user_id_fkey      ... on delete cascade
--     goals_owner_id_fkey           ... on delete cascade
--     completions_weekly_goal_id_fkey ... on delete cascade
--
-- **De rij cascadeert weg.** "De foto blijft" levert dus geen bewijs op voor wie
-- dan ook — het levert een **wees** op: een blob waar geen rij naar wijst, die
-- niemand meer kan lezen (de leespolicy van 0227 zoekt een weekdoel dat niet
-- meer bestaat), die niet meer te vinden is, en die wél de gratis tier vult.
--
-- ⚠️ Dat is de slechtste van de drie uitkomsten: géén bewijs én een portret dat
--    een wissingsverzoek overleeft zonder grondslag.
--
-- ---------------------------------------------------------------------------
-- De scheidslijn van 0031 wijst hier dus juist de andere kant op
-- ---------------------------------------------------------------------------
--
-- 0031 trekt de lijn bij *"voor wie is de rij bewijs"*, en zet `completions` met
-- zoveel woorden aan de cascadekant: *"Ze horen bij jou: je voltooiingen, en de
-- goedkeuringen die over jouw weken gaan. Dat de goedkeuring van een ander
-- daarmee ook weggaat is juist: hij was bewijs over jou, en jij bent er niet
-- meer."*
--
-- De juiste formulering is daarom niet "chatfoto weg, bewijsfoto blijft" maar:
--
--   **een bewijsfoto is bewijs vóór een ander zolang de voltooiing bestaat;
--   verdwijnt de voltooiing, dan is er geen bewijs meer om te bewaren.**
--
-- Dat is dezelfde zin die 0031 over de goedkeuring gebruikt, en dán is de
-- scheidslijn wél dezelfde. De uitkomst valt toevallig samen met die van 0224
-- voor de chatfoto; de redenering eronder is een andere, en die staat in
-- `docs/decisions/2026-09-09-een-foto-als-bewijs.md` §4.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Deze trigger repareert geen fout — hij is een besluit
-- ---------------------------------------------------------------------------
--
-- Dat is het verschil met 0224, en de vorm lijkt genoeg op elkaar om het te
-- moeten opschrijven. Daar brak accountverwijdering **zonder** de trigger op een
-- 23514: de CHECK van 0223 eist een `sender_id` bij een bijlage, en het
-- `on delete set null` van 0031 maakte die leeg.
--
-- 📏 Hier gebeurt dat niet. De CHECK van 0229 hangt aan twee `not null` kolommen
--    die samen met de rij verdwijnen, dus de verwijdering slaagt ook zonder deze
--    migratie. Wat er zonder deze migratie achterblijft is de wees hierboven.
--
-- ⚠️ `before delete` blijft wél nodig: ná de cascade is er geen `weekly_goals`
--    en geen `completions` meer om het object aan te koppelen. Het tweede
--    padsegment is daarom de sleutel — dat is het gebruikers-id zelf, en dat
--    overleeft precies lang genoeg.
--
-- ⚠️⚠️ **Wat deze migratie NIET kan.** Een `delete from storage.objects` haalt
--    de **metadata-rij** weg; de blob blijft in de objectopslag staan. Vanuit
--    SQL is er geen manier om te garanderen dat een bestand echt weg is — dat
--    vraagt de Storage-API (`.remove()`) of een Edge Function. De rij weghalen
--    maakt het bestand wél onbereikbaar, want er is geen pad meer om te
--    ondertekenen. Zelfde grens als bij 0224; het staat in `docs/DEPLOY.md`
--    §2.6a en als open Laag-rij in `docs/ENGINEER-REVIEW.md`.

create or replace function public.wis_bewijsfotos_van_vertrekker()
returns trigger
language plpgsql
security definer
-- ⚠️ `definer` omdat deze trigger draait tijdens een verwijdering die de
--    gebruiker zelf start, en `storage.objects` is voor `authenticated` alleen
--    langs de policies benaderbaar — die vinden op dat moment geen weekdoel
--    meer waar deze gebruiker eigenaar van is.
-- ⚠️ `pg_temp` expliciet achteraan: zonder die pin doorzoekt Postgres het
--    tijdelijke schema als eerste, en dan kiest de aanroeper welke
--    `storage.objects` een definer-functie leest. `zoekpadschaduw.test.ts`
--    bewaakt dat.
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- Het tweede padsegment is de eigenaar. De voltooiingen zelf gaan langs de
  -- cascade van 0031; hier gaat alleen wat daar niet aan hangt.
  delete from storage.objects o
  where o.bucket_id = 'bewijsfotos'
    and (storage.foldername(o.name))[2] = old.id::text;

  return old;
end;
$$;

drop trigger if exists profielen_bewijsfotos_mee on public.profiles;

create trigger profielen_bewijsfotos_mee
  before delete on public.profiles
  for each row
  execute function public.wis_bewijsfotos_van_vertrekker();

-- ⚠️ `from public, anon, authenticated` — onwrikbare regel 4 en migratie 0115.
--    Een triggerfunctie hoort door niemand rechtstreeks aanroepbaar te zijn, en
--    een definer al helemaal niet.
revoke execute on function public.wis_bewijsfotos_van_vertrekker() from public, anon, authenticated;
