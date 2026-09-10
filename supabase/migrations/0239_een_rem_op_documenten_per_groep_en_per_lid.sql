-- 0239_een_rem_op_documenten_per_groep_en_per_lid.sql — twee dagtellers op
-- `chatdocs`, in de vorm die 0233 heeft neergezet.
--
-- Dossier: docs/decisions/2026-09-10-een-document-is-geen-foto.md
--
-- ROLLBACK-PAD:
--   drop trigger if exists chatdocs_aantal_begrensd on storage.objects;
--   drop trigger if exists chatdocs_aantal_begrensd_verhuisd on storage.objects;
--   drop function if exists public.bewaak_chatdoc_aantal();
--   delete from dagtellers where domein = 'chatdocs';
--
-- ---------------------------------------------------------------------------
-- De vorm van 0233 en niet die van 0226
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is precies de plek waar 0233 voor waarschuwt: "de volgende rem
--    wordt geschreven door de vorige te kopiëren."** De rem van 0226 telde
--    `count(*)` over `storage.objects`, en die was met een `delete` terug te
--    zetten — tien plaatsen, één wissen, opnieuw plaatsen. 0233 heeft alle drie
--    de emmers op `tel_dagteller()` gezet, dat de **handelingen** telt die er
--    wáren en niet de objecten die er stáán.
--
--    Deze migratie sluit daarop aan. Kopieer 0226 hier niet.
--
-- ⚠️ **En daarom staat er ook géén index.** 0233 heeft
--    `objects_chatfotos_groep_dag_idx` en `objects_bewijsfotos_uploader_dag_idx`
--    juist wéggehaald: de nieuwe tellers raken `storage.objects` niet meer, en
--    `dagtellers` wordt alleen op zijn primaire sleutel geraakt. Een
--    index van 0222 hier overnemen zou een index zijn voor een query die niet
--    meer bestaat.
--
-- ⚠️ **Twee tellers en niet één**, om de reden van 0226: het groepsplafond
--    beschermt de opslag (1 GB gedeeld met drie andere emmers), het lidplafond
--    beschermt de ándere leden — zonder dat legt één lid de groep een etmaal
--    stil. Het lidplafond ligt strikt lager, anders is het geen rem.
--
-- ⚠️ De sleutel van de ledenteller is **groep én lid samen**. Alleen `uploader`
--    zou één dagplafond over álle groepen van dat lid maken, en dat is een
--    andere regel dan hier bedoeld is: twee per groep per lid, niet twee in
--    totaal.
--
-- ⚠️ `security definer` om de reden van 0233: `dagtellers` staat deny-all
--    en `tel_dagteller()` mag door `authenticated` niet uitgevoerd worden.
--
-- ⚠️ **De teller heet sinds 0234 `tel_dagteller()` en de tabel `dagtellers`**
--    (QS8-401): hij is niet meer alleen voor opslag. `tel_opslag_upload()` is
--    dáár gedropt, dus een aanroep onder de oude naam is geen stijlkwestie maar
--    een migratie die niet draait.

create or replace function public.bewaak_chatdoc_aantal()
returns trigger
language plpgsql
security definer
-- ⚠️ `pg_temp` expliciet achteraan: pin je hem niet, dan doorzoekt Postgres het
--    tijdelijke schema als eerste en kiest de aanroeper welke tabel deze functie
--    leest. `zoekpadschaduw.test.ts` bewaakt dat.
set search_path = public, pg_catalog, pg_temp
as $$
declare
  groep    text := (storage.foldername(new.name))[1];
  uploader text := (storage.foldername(new.name))[2];
begin
  if new.bucket_id <> 'chatdocs' or groep is null then
    return new;
  end if;

  -- TODO(paid-tier): vier per groep per etmaal is byte-pariteit met `chatfotos`
  -- (4 × 5 MB = 20 MB, gelijk aan 20 × 1 MB) en geen productkeuze. Zie 0238 §4.
  perform tel_dagteller('chatdocs', 'groep', groep, 4, interval '1 day',
                        'documenten in deze groep vandaag');

  -- ⚠️ De ledentak staat ná de groepstak, net als in 0226 en 0233: een groep die
  --    vol is, is vol, ongeacht wie het volgende document plaatst.
  if uploader is not null then
    -- TODO(paid-tier): idem. Twee is lager dan vier zodat één lid de groep niet
    -- kan stilleggen.
    perform tel_dagteller('chatdocs', 'uploader', groep || '/' || uploader, 2,
                          interval '1 day', 'documenten van deze persoon vandaag');
  end if;

  return new;
end;
$$;

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon` — onwrikbare
--    regel 4 en migratie 0115. Een triggerfunctie hoort door niemand
--    rechtstreeks aanroepbaar te zijn, en een definer al helemaal niet.
revoke execute on function public.bewaak_chatdoc_aantal() from public, anon, authenticated;

drop trigger if exists chatdocs_aantal_begrensd on storage.objects;
drop trigger if exists chatdocs_aantal_begrensd_verhuisd on storage.objects;

-- ⚠️ **Twee triggers en één functie, en dat is een beperking en geen keuze.** Een
--    `when`-clausule kent `tg_op` niet, en `old` bestaat niet bij een INSERT.
--    Eén trigger voor beide gevallen zou de toets in het lichaam moeten doen, en
--    dan draait de teller óók bij elke metadata-update van de storage-dienst.
create trigger chatdocs_aantal_begrensd
  before insert on storage.objects
  for each row
  when (new.bucket_id = 'chatdocs')
  execute function public.bewaak_chatdoc_aantal();

-- ⚠️ De verhuistrigger dekt **bucket_id én name**, en dat tweede is de les van
--    0233: zonder de naamtak schuif je een object binnen dezelfde emmer naar een
--    ándere groepsmap en telt het daar nergens mee.
create trigger chatdocs_aantal_begrensd_verhuisd
  before update of bucket_id, name on storage.objects
  for each row
  when (new.bucket_id = 'chatdocs'
        and (old.bucket_id is distinct from new.bucket_id
             or (storage.foldername(old.name))[1] is distinct from (storage.foldername(new.name))[1]))
  execute function public.bewaak_chatdoc_aantal();
