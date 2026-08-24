-- 0081_migratieregister_uitlijnen.sql — QS8-122, vervolg
--
-- ROLLBACK-PAD:
--   drop function if exists public.lijn_migratieregister_uit(jsonb);
--   (Kost je de automatische stap 3 uit docs/DEPLOY.md; de handmatige UPDATE
--    die daar stond blijft werken.)
--
-- ⚠️ **Waarom dit bestaat.** 0072 maakte het register uitleesbaar en
--    `register:controle` wordt rood bij een tijdstempel. Dat werkt: op 24-08
--    stonden er zes. Wat níét werkte is de reparatie ernaast — stap 3 van
--    docs/DEPLOY.md was een UPDATE die je met de hand tikt, en die is zes keer
--    op rij overgeslagen, op dezelfde dag dat QS8-122 hem opschreef.
--
--    Een handeling die je bij élke migratie moet onthouden, en die niets
--    zichtbaars kapotmaakt als je hem vergeet, wordt vergeten. Dit is dezelfde
--    les als bij de emoji-regel en regel 20: zolang het een zin is en geen
--    commando, gebeurt het niet.
--
-- ⚠️ **Waarom een functie en niet gewoon SQL in een script.** Hetzelfde argument
--    als bij 0072: `supabase_migrations` staat niet in de PostgREST-API, en een
--    directe Postgres-verbinding vraagt het databasewachtwoord dat niet in `.env`
--    staat. Deze functie draait op de service-role-key die er al is.
--
-- ⚠️ **De grendels zitten hier en niet in het script**, want een grendel die de
--    aanroeper zelf moet aanhouden is geen grendel. Vier stuks:
--
--      1. Alleen rijen waarvan de versie een **tijdstempel** is. Een rij die al
--         een nummer draagt wordt nooit aangeraakt — ook niet als de aanroeper
--         een ander nummer meestuurt. Dit is het slot tegen "per ongeluk 0042
--         hernoemen naar 0043" en daarmee tegen het herschrijven van
--         geschiedenis die klopt.
--      2. De **naam moet exact matchen**. Uitlijnen gebeurt op naam, want dat is
--         het enige dat het bestand en de registerrij delen als het nummer al
--         uiteenloopt.
--      3. Het **doelnummer moet vrij zijn**. Twee rijen met hetzelfde nummer is
--         precies de stille variant die de controle uit 0072 moet vangen; die
--         hier zelf veroorzaken zou de controle omzeilen met zijn eigen
--         gereedschap.
--      4. Het doelnummer moet **de vorm van een nummer** hebben (`NNNN` met
--         eventueel een letter, zoals `0052a`). Anders lijn je een tijdstempel
--         uit naar een andere tijdstempel.
--
--    Elke geweigerde rij komt terug in de uitvoer met de reden erbij. Stil
--    overslaan zou van "niets te doen" en "vier keer geweigerd" hetzelfde beeld
--    maken.
--
-- ⚠️ **Alleen voor `service_role`.** Zie de kop van 0072: een nieuwe SECURITY
--    DEFINER-functie erft niets, en deze schríjft in een systeemtabel. Zonder de
--    revoke staat hij als RPC in de API.
--
-- Idempotent: `create or replace`, en de functie zelf is herhaalbaar — een
-- tweede aanroep vindt geen tijdstempels meer en doet niets.

create or replace function public.lijn_migratieregister_uit(p_paren jsonb)
returns table(naam text, van text, naar text, uitkomst text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_paar    jsonb;
  v_naam    text;
  v_doel    text;
  v_huidig  text;
begin
  if p_paren is null or jsonb_typeof(p_paren) <> 'array' then
    raise exception 'lijn_migratieregister_uit verwacht een JSON-array van {naam, versie}';
  end if;

  for v_paar in select * from jsonb_array_elements(p_paren)
  loop
    v_naam := v_paar->>'naam';
    v_doel := v_paar->>'versie';

    naam := v_naam;
    naar := v_doel;
    van  := null;

    -- Grendel 4: het doel moet een nummer zijn.
    if v_doel is null or v_doel !~ '^\d{4}[a-z]?$' then
      uitkomst := 'geweigerd: doelversie is geen nummer';
      return next;
      continue;
    end if;

    select m.version::text into v_huidig
      from supabase_migrations.schema_migrations m
     where m.name = v_naam;

    -- Grendel 2: de naam moet bestaan, en precies één keer.
    if v_huidig is null then
      uitkomst := 'overgeslagen: geen registerrij met deze naam';
      return next;
      continue;
    end if;

    van := v_huidig;

    if v_huidig = v_doel then
      uitkomst := 'niets te doen: stond al goed';
      return next;
      continue;
    end if;

    -- Grendel 1: alleen tijdstempels. Een rij met een nummer blijft staan.
    if v_huidig ~ '^\d{4}[a-z]?$' then
      uitkomst := 'geweigerd: draagt al een nummer, niet aangeraakt';
      return next;
      continue;
    end if;

    -- Grendel 3: het doelnummer moet vrij zijn.
    if exists (
      select 1 from supabase_migrations.schema_migrations m where m.version::text = v_doel
    ) then
      uitkomst := 'geweigerd: doelversie is al in gebruik';
      return next;
      continue;
    end if;

    update supabase_migrations.schema_migrations
       set version = v_doel
     where name = v_naam and version::text = v_huidig;

    uitkomst := 'uitgelijnd';
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.lijn_migratieregister_uit(jsonb) from public, anon, authenticated;
grant execute on function public.lijn_migratieregister_uit(jsonb) to service_role;
