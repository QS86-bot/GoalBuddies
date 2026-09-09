-- 0225_een_plafond_per_lid_naast_dat_van_de_groep.sql — een tweede, lagere teller
-- per uploader, zodat één lid de foto's van de hele groep niet kan stilleggen.
--
-- ROLLBACK-PAD:
--   `bewaak_chatfoto_aantal()` terug in de vorm van 0221 (dat bestand is
--   idempotent en zet de functie opnieuw neer). ⚠️ Daarmee komt ook de
--   asymmetrie hieronder terug.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Uit de securityronde op QS8-71.
--
-- 0221 zette één teller neer: twintig foto's per **groep** per etmaal. Dat houdt
-- de opslag in toom, maar het legt de rem bij de verkeerde partij. Twintig
-- uploads van één lid blokkeren álle andere leden voor een etmaal, en die krijgen
-- `chatfoto.uploaden_mislukt` te zien — "probeer het zo nog eens", niet te
-- onderscheiden van een netwerkfout, dus ze blijven het proberen.
--
-- ⚠️ **Onwrikbare regel 5 vraagt letterlijk om een limiet *per gebruiker* per
--    dag.** Voor berichten is die er (`begrens_berichten()`, per `sender_id`);
--    voor foto's was hij er niet. Dit is die tweede helft.
--
-- ⚠️ **Twee tellers en niet één verplaatste.** Het groepsplafond beschermt de
--    opslag (1 GB gedeeld met `avatars`); het lidplafond beschermt de andere
--    leden. Vervang je de eerste door de tweede, dan kunnen twaalf leden samen
--    nog steeds 144 foto's per dag plaatsen en is de opslagbescherming weg.
--
-- ⚠️ **Het lidplafond is lager dan het groepsplafond**, anders is het geen rem:
--    bij gelijke waarden loopt een groep van twee leden nog steeds tegen de
--    groepsgrens aan door één iemand.
--
-- ⚠️ De index van 0221 draagt deze telling al — hij staat op
--    `((storage.foldername(name))[1], created_at)`, en het tweede segment komt uit
--    dezelfde rijen.

create or replace function public.bewaak_chatfoto_aantal()
returns trigger
language plpgsql
-- ⚠️ `pg_temp` expliciet achteraan: pin je hem niet, dan doorzoekt Postgres het
--    tijdelijke schema als eerste. `zoekpadschaduw.test.ts` bewaakt dat.
set search_path = public, pg_catalog, pg_temp
as $$
declare
  groep     text := (storage.foldername(new.name))[1];
  uploader  text := (storage.foldername(new.name))[2];
  van_groep integer;
  van_lid   integer;
begin
  if new.bucket_id <> 'chatfotos' or groep is null then
    return new;
  end if;

  select
    count(*) filter (where true),
    count(*) filter (where (storage.foldername(o.name))[2] = uploader)
  into van_groep, van_lid
  from storage.objects o
  where o.bucket_id = 'chatfotos'
    and (storage.foldername(o.name))[1] = groep
    and o.created_at > now() - interval '1 day';

  -- TODO(paid-tier): twintig per groep per etmaal is een rem tegen het vollopen
  -- van de gratis tier en geen productkeuze.
  if van_groep >= 20 then
    -- ⚠️ Geen groepsnaam en geen gebruikerstekst: een foutmelding reist naar
    --    plekken waar de autorisatie niet meereist.
    raise exception 'Te veel foto''s in deze groep vandaag (%).', van_groep
      using errcode = 'check_violation';
  end if;

  -- TODO(paid-tier): idem. Acht is lager dan twintig zodat één lid de groep niet
  -- kan stilleggen, en hoog genoeg dat een gesprek niet tegen de rem loopt.
  if van_lid >= 8 then
    raise exception 'Te veel foto''s van deze persoon vandaag (%).', van_lid
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.bewaak_chatfoto_aantal() from public, anon, authenticated;
