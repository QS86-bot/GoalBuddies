-- 0228_een_rem_per_uploader_op_bewijsfotos.sql — een dagplafond per uploader,
-- met de index eronder die hij nodig heeft.
--
-- ROLLBACK-PAD:
--   drop trigger if exists bewijsfotos_aantal_begrensd on storage.objects;
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

create trigger bewijsfotos_aantal_begrensd
  before insert on storage.objects
  for each row
  execute function public.bewaak_bewijsfoto_aantal();

create index if not exists objects_bewijsfotos_uploader_dag_idx
  on storage.objects (((storage.foldername(name))[2]), created_at)
  where bucket_id = 'bewijsfotos';
