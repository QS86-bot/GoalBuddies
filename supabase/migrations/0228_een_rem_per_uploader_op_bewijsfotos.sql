-- 0228_een_rem_per_uploader_op_bewijsfotos.sql — een dagplafond per uploader,
-- met de index eronder die hij nodig heeft.
--
-- ROLLBACK-PAD:
--   drop trigger if exists bewijsfotos_aantal_begrensd on storage.objects;
--   drop trigger if exists bewijsfotos_aantal_begrensd_verhuisd on storage.objects;
--   drop function if exists public.bewaak_bewijsfoto_aantal();
--   drop index if exists storage.objects_bewijsfotos_uploader_dag_idx;
--
-- ---------------------------------------------------------------------------
-- Eén teller, en dat is een bewuste afwijking van 0226
-- ---------------------------------------------------------------------------
--
-- `chatfotos` heeft er twee: twintig per groep (die beschermt de opslag) en acht
-- per lid (die beschermt de ándere leden, want zonder die tweede legt één lid de
-- hele groep een etmaal stil).
--
-- ⚠️ **Hier is er geen tweede partij.** De insertpolicy van 0227 eist
--    `segment 2 = auth.uid()` én `mag_bewijs_van_weekdoel_zetten()`, dus je kunt
--    uitsluitend in je eigen map onder je eigen weekdoel schrijven. Niemand kan
--    een ander stilleggen, en dus is er niets om tegen te beschermen. Een tweede
--    teller per weekdoel zou alleen een hersubmit-lus remmen, en die zit al
--    onder deze.
--
--    Schrijf dat op, want één teller naast de twee van 0226 leest anders als een
--    vergeten helft.
--
-- ⚠️ **Het is een trigger en geen policy**, en dat is niet te kiezen: een
--    subquery op `storage.objects` in een policy óp `storage.objects` geeft
--    `infinite recursion detected in policy`. Gemeten in 0130.
--
-- ⚠️⚠️ **Hij vuurt op INSERT én op een verhuizing de bucket ín, en dat is geen
--    volledigheidsdrang.** 📏 Gevonden in de securityronde op QS8-391 en zelf
--    nagemeten: met een trigger die alleen op INSERT vuurt, parkeer je dertig
--    objecten in een andere bucket en zet je ze daarna met één `update` om —
--    **veertig objecten bij een plafond van tien**, en dat getal is willekeurig
--    op te schroeven. Een rij die de bucket ín beweegt is voor de opslag
--    hetzelfde als een nieuwe rij, dus hij hoort ook langs de teller.
--
--    De `when`-clausule houdt hem smal: een gewone `update` binnen de bucket —
--    de storage-dienst werkt metadata bij na een upload — telt níet mee, want
--    dan verandert `bucket_id` niet. Alleen het moment van binnenkomen telt.
--
-- ⚠️ **Wat deze migratie NIET repareert: wissen zet de teller terug.** 📏 Tien
--    plaatsen, één wissen, opnieuw plaatsen — dat gaat er doorheen, want de
--    teller telt de objecten die er *staan* en niet de uploads die er *waren*.
--    Dat is de vorm van élke dagteller in dit project (`begrens_pushtokens()`,
--    `bewaak_chatfoto_aantal()`, `bewaak_avatar_aantal()`), dus repareren hoort
--    op één plek voor alle drie te gebeuren en niet hier alleen — een halve
--    familie is erger dan een hele. Staat als rij in `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ **De index staat op segment 2 en niet op segment 1**, anders dan die van
--    0222. Deze teller telt per uploader, en die staat in het tweede segment.
--    Zonder index is elke upload een scan over de héle objecttabel — gedeeld met
--    `avatars` en `chatfotos`, dus die betalen mee. Onwrikbare regel 11.

create or replace function public.bewaak_bewijsfoto_aantal()
returns trigger
language plpgsql
-- ⚠️ Geen `security definer`: een triggerfunctie op `storage.objects` draait al
--    in de context van de schrijver, en `definer_bewaking()` (0106) houdt de
--    lijst definer-functies kort. `pg_temp` expliciet achteraan, zie 0227.
set search_path = public, pg_catalog, pg_temp
as $$
declare
  uploader text := (storage.foldername(new.name))[2];
  aantal   integer;
begin
  if new.bucket_id <> 'bewijsfotos' or uploader is null then
    return new;
  end if;

  select count(*)
    into aantal
  from storage.objects o
  where o.bucket_id = 'bewijsfotos'
    and (storage.foldername(o.name))[2] = uploader
    and o.created_at > now() - interval '1 day';

  -- TODO(paid-tier): tien per etmaal is een rem tegen het vollopen van de
  -- gratis tier en geen productkeuze. Een bewijsfoto hoort bij een weekdoel, en
  -- iemand rondt er niet tien per dag af; wie eroverheen gaat, is aan het
  -- proberen en niet aan het bewijzen.
  if aantal >= 10 then
    -- ⚠️ Geen pad en geen naam in de melding: een foutmelding reist naar plekken
    --    waar de autorisatie niet meereist, en dit pad noemt twee uuid's.
    raise exception 'Te veel bewijsfoto''s vandaag (%).', aantal
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.bewaak_bewijsfoto_aantal() from public, anon, authenticated;

drop trigger if exists bewijsfotos_aantal_begrensd on storage.objects;
drop trigger if exists bewijsfotos_aantal_begrensd_verhuisd on storage.objects;

-- ⚠️ **Twee triggers en één functie, en dat is geen keuze maar een beperking.**
--    Een `when`-clausule kent `tg_op` niet, en `old` bestaat niet bij een
--    INSERT. Één trigger voor beide gevallen zou de toets dus in het lichaam
--    moeten doen, en dan draait de teller óók bij elke metadata-update die de
--    storage-dienst doet.
create trigger bewijsfotos_aantal_begrensd
  before insert on storage.objects
  for each row
  when (new.bucket_id = 'bewijsfotos')
  execute function public.bewaak_bewijsfoto_aantal();

-- ⚠️ Alleen het moment van binnenkomen: `update of bucket_id` beperkt hem al tot
--    statements die die kolom aanraken, en de `when` daarbovenop tot de
--    verhuizingen die er werkelijk een zijn. Een gewone update binnen de bucket
--    telt dus niet mee.
create trigger bewijsfotos_aantal_begrensd_verhuisd
  before update of bucket_id on storage.objects
  for each row
  when (new.bucket_id = 'bewijsfotos' and old.bucket_id is distinct from new.bucket_id)
  execute function public.bewaak_bewijsfoto_aantal();

create index if not exists objects_bewijsfotos_uploader_dag_idx
  on storage.objects (((storage.foldername(name))[2]), created_at)
  where bucket_id = 'bewijsfotos';
