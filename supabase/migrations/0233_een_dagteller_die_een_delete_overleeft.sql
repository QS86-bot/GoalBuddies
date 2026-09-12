-- 0233_een_dagteller_die_een_delete_overleeft.sql — de drie opslagtellers tellen
-- voortaan de uploads die er wáren, niet de objecten die er stáán.
--
-- ROLLBACK-PAD:
--   drop trigger if exists avatars_aantal_begrensd_verhuisd on storage.objects;
--   drop trigger if exists chatfotos_aantal_begrensd_verhuisd on storage.objects;
--   drop trigger if exists bewijsfotos_aantal_begrensd_verhuisd on storage.objects;
--   -- daarna de drie tellerfuncties terugzetten uit 0130, 0226 en 0228, en:
--   drop function if exists public.tel_opslag_upload(text, text, text, integer, interval, text);
--   drop table if exists public.opslag_dagtellers;
--   drop index if exists storage.objects_avatars_map_idx;
--   -- en de twee indexen van 0222/0228 terugzetten:
--   create index objects_chatfotos_groep_dag_idx
--     on storage.objects (((storage.foldername(name))[1]), created_at) where bucket_id = 'chatfotos';
--   create index objects_bewijsfotos_uploader_dag_idx
--     on storage.objects (((storage.foldername(name))[2]), created_at) where bucket_id = 'bewijsfotos';
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack, 09-09-2026, met een `do`-blok dat rechtstreeks
--    in `storage.objects` schrijft (de triggers vuren dan gewoon):
--
--      bewijsfotos: tien geplaatst -> 10 rijen
--      bewijsfotos: elfde geweigerd (goed)
--      bewijsfotos: na wissen ER DOORHEEN      <-- de bug
--      chatfotos  : na wissen ER DOORHEEN
--      avatars    : na wissen ER DOORHEEN
--
--    Alle drie tellen met `count(*)` over `storage.objects` zelf. Wie één object
--    wist, mag er weer een plaatsen — de teller telt de objecten die er stáán en
--    niet de uploads die er wáren.
--
-- 📏 En de tweede omzeiling, óók gemeten:
--
--      chatfotos: VERHUIZING ER DOORHEEN -> 9 rijen bij plafond 8
--
--    Een object in een andere emmer parkeren en met één `update` omzetten komt
--    langs de rem, want alleen `bewijsfotos` kreeg in 0228 een tweede trigger op
--    `before update of bucket_id`. `avatars` (0130) en `chatfotos` (0226) niet.
--
-- ⚠️⚠️ **Waarom dit een opslagrem is en niet alleen een snelheidsrem.** Een
--    `delete from storage.objects` haalt de metadata-rij weg maar niet de blob
--    (`docs/DEPLOY.md` §2.6a). Wissen-en-opnieuw-plaatsen laat dus bestanden
--    achter die niemand meer kan bereiken én zet de teller terug. Drie emmers
--    delen één gratis tier van 1 GB; loopt die vol, dan liggen de profielfoto's
--    er voor iedereen uit.
--
-- ⚠️ Onwrikbare regel 5 vraagt een limiet per gebruiker per dag. Een limiet die
--    je met een `delete` reset, is een limiet op gelijktijdigheid en niet op een
--    dag.
--
-- ---------------------------------------------------------------------------
-- 1. De vorm, één keer
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De vorm bestond al en stond op één plek: `invite_preview_limits` (0131).**
--    Een rij per sleutel met een venster dat in dezelfde uitdrukking meeschuift,
--    opgehoogd met één `insert … on conflict do update`. Dit is diezelfde vorm,
--    nu gedeeld door de drie emmers in plaats van gekopieerd.

create table if not exists opslag_dagtellers (
  bucket_id     text        not null,
  -- ⚠️ **Een allowlist en geen vrij tekstveld.** Zonder deze CHECK maakt één
  --    typefout in een tellerfunctie stilzwijgend een tweede, lege teller aan —
  --    en dat is precies een omzeiling met een schone naam.
  soort         text        not null check (soort in ('uploader', 'groep')),
  sleutel       text        not null,
  venster_start timestamptz not null default now(),
  aantal        integer     not null default 0,
  primary key (bucket_id, soort, sleutel)
);

comment on table opslag_dagtellers is
  'Eén rij per emmer, soort en sleutel: hoeveel uploads er in het lopende '
  'venster wáren. Alleen geschreven door tel_opslag_upload() (0233). '
  '⚠️ Bewust géén rij per upload: dat zou de teller zelf een groeivector maken '
  '— zelfde afweging als invite_preview_limits (0131).';

alter table opslag_dagtellers enable row level security;

-- ⚠️ **Geen policy, en dat is de bedoeling: geen policy is deny-all.** Zou een
--    client hier mogen schrijven, dan is de teller met één `update` te resetten
--    en hebben we de bug van deze migratie terug met een extra stap. Zelfde
--    keuze en dezelfde reden als bij `invite_preview_limits`.

revoke all on table opslag_dagtellers from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. De teller zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`security definer`, en dat is hier geen gemak maar de grendel.** De
--    tabel is deny-all, dus een niet-definer functie die er onder
--    `authenticated` in wil schrijven, kán dat niet. En het alternatief —
--    `authenticated` schrijfrecht op de tabel geven — is precies wat hierboven
--    dichtgezet wordt.
--
-- ⚠️⚠️ **En daarom mag `authenticated` deze functie níét uitvoeren.** Wie hem
--    rechtstreeks mag aanroepen, kan de teller van een ánder lid ophogen en dat
--    lid zijn dag uit sturen. Dat is een griefvector met een schone naam, en de
--    `revoke` onderaan is wat hem dichthoudt. De aanroepers zijn de drie
--    tellerfuncties, en die worden hieronder zelf `security definer` — zie de
--    aantekening daar.
--
-- ⚠️⚠️ **Het venster is vast en niet schuivend, en dat is een verruiming die je
--    moet weten.** 0226/0228 telden `created_at > now() - interval '1 day'`: een
--    schuivend venster. Deze vorm zet `venster_start` op de eerste upload en
--    schuift pas als er een etmaal voorbij is. 📏 Gemeten: tien bewijsfoto's,
--    `venster_start` 24u01 terug, tien nieuwe → **twintig objecten binnen enkele
--    minuten** bij een plafond van tien.
--
--    "Tien per etmaal" betekent dus in het slechtste geval "tot twintig rond de
--    vensterwissel, daarna tien per 24 uur". Dat is bewust geaccepteerd: het is
--    de vorm van `invite_preview_limits` (0131), hij kost één rij per sleutel in
--    plaats van een rij per upload, en de rem waar het om gaat — ongelimiteerd
--    plaatsen-en-wissen — is dicht. Een écht schuivend venster vraagt een rij per
--    upload, en dat is de groeivector die 0131 juist afwees.
--
-- ⚠️ **En het plafond van `chatfotos` is per groep, niet per gebruiker.** Een lid
--    dat in tien groepen zit, mag 8 × 10 foto's per dag. Dat is de erfenis van
--    0226 en verandert hier niet; `create_group()` begrenst het aantal groepen op
--    tien per etmaal. Onwrikbare regel 5 vraagt een limiet per gebruiker per dag,
--    en die is er voor chatfoto's dus alleen langs die omweg. Staat als bevinding
--    in `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ Eén statement, en dat is de hele afdwinging. Lezen-dan-schrijven laat twee
--    gelijktijdige uploads allebei dezelfde stand zien en allebei doorlopen;
--    `on conflict do update` neemt de rijvergrendeling en telt daarbinnen op.
--    Het venster schuift in dezelfde uitdrukking mee. Zelfde redenering als in
--    `invite_preview()`.

create or replace function public.tel_opslag_upload(
  p_bucket  text,
  p_soort   text,
  p_sleutel text,
  p_plafond integer,
  p_venster interval,
  -- ⚠️⚠️ **De bewoording komt van de aanroeper, en dat is geen opsmuk.** Eén
  --    gedeelde zin ("te veel uploads in deze emmer") leest in een log als drie
  --    verschillende remmen die je niet uit elkaar kunt houden, en hij maakte
  --    bovendien twee bestaande tests stil onbruikbaar: die matchten op
  --    `Te veel bewijsfoto`. 📏 Gemeten — ze gaven `ANDERE_FOUT` in plaats van
  --    `23514`.
  --
  --    Dat is regel 18 vraag 4 van twee kanten. Die tests grijpen naar een zin
  --    en niet naar de belofte, en dat is hun zwakte; maar alleen op `23514`
  --    toetsen zou óók de padconstraint aanvaarden, en dan bewaken ze minder dan
  --    nu. De vorm blijft dus op één plek en de zin blijft per emmer.
  p_wat     text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_aantal integer;
begin
  insert into opslag_dagtellers as t (bucket_id, soort, sleutel, venster_start, aantal)
  values (p_bucket, p_soort, p_sleutel, now(), 1)
  on conflict (bucket_id, soort, sleutel) do update
    set venster_start = case
          when t.venster_start < now() - p_venster then now()
          else t.venster_start
        end,
        aantal = case
          when t.venster_start < now() - p_venster then 1
          else t.aantal + 1
        end
  returning t.aantal into v_aantal;

  -- ⚠️ **`>` en niet `>=`, want deze telling is inclusief de upload van nu.** Bij
  --    een plafond van tien is de tiende `aantal = 10` en die mag er nog in; de
  --    elfde is 11 en die niet. De oude tellers vergeleken vóór het ophogen en
  --    gebruikten daarom `>=`.
  if v_aantal > p_plafond then
    -- ⚠️ Geen pad, geen naam en geen sleutel in de melding: een foutmelding
    --    reist naar plekken waar de autorisatie niet meereist, en deze paden
    --    dragen twee uuid's.
    raise exception 'Te veel % (%).', p_wat, v_aantal
      using errcode = 'check_violation';
  end if;

  return v_aantal;
end;
$$;

revoke execute on function public.tel_opslag_upload(text, text, text, integer, interval, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. De drie tellers volgen de vorm
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Ze worden alle drie `security definer`, en dat is een bewuste afwijking
--    van de kop van 0228.** Daar stond: *"Geen `security definer`: een
--    triggerfunctie op `storage.objects` draait al in de context van de
--    schrijver."* Dat klopte zolang de teller alleen `storage.objects` las. Nu
--    schrijft hij in een deny-all tabel via een functie die `authenticated` niet
--    mag uitvoeren, en dan moet de aanroeper de eigenaar zijn.
--
--    Wat het níet uitdeelt: deze functies lezen `new.name` en hogen één teller
--    op. Ze geven de schrijver geen enkel recht dat hij zonder trigger niet had.
--    `definer_bewaking()` (0106) ziet ze en dat is goed — ze staan er met reden.

create or replace function public.bewaak_bewijsfoto_aantal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  uploader text := (storage.foldername(new.name))[2];
begin
  if new.bucket_id <> 'bewijsfotos' or uploader is null then
    return new;
  end if;

  -- TODO(paid-tier): tien per etmaal is een rem tegen het vollopen van de
  -- gratis tier en geen productkeuze.
  perform tel_opslag_upload('bewijsfotos', 'uploader', uploader, 10, interval '1 day',
                            'bewijsfoto''s vandaag');

  return new;
end;
$$;

revoke execute on function public.bewaak_bewijsfoto_aantal() from public, anon, authenticated;

create or replace function public.bewaak_chatfoto_aantal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  groep    text := (storage.foldername(new.name))[1];
  uploader text := (storage.foldername(new.name))[2];
begin
  if new.bucket_id <> 'chatfotos' or groep is null then
    return new;
  end if;

  -- TODO(paid-tier): twintig per groep per etmaal is een rem tegen het vollopen
  -- van de gratis tier en geen productkeuze.
  perform tel_opslag_upload('chatfotos', 'groep', groep, 20, interval '1 day',
                            'foto''s in deze groep vandaag');

  -- ⚠️ De ledentak staat ná de groepstak, net als in 0226: een groep die vol is,
  --    is vol, ongeacht wie de volgende foto plaatst.
  --
  -- ⚠️ **En de sleutel is groep én lid samen.** Alleen `uploader` zou één
  --    dagplafond over álle groepen van dat lid maken, en dat is een ándere
  --    regel dan 0226 had — acht per groep per lid, niet acht in totaal.
  if uploader is not null then
    -- TODO(paid-tier): idem. Acht is lager dan twintig zodat één lid de groep
    -- niet kan stilleggen.
    perform tel_opslag_upload('chatfotos', 'uploader', groep || '/' || uploader, 8,
                              interval '1 day', 'foto''s van deze persoon vandaag');
  end if;

  return new;
end;
$$;

revoke execute on function public.bewaak_chatfoto_aantal() from public, anon, authenticated;

-- ⚠️⚠️ **`avatars` houdt zijn oude toets én krijgt er een bij, en dat is geen
--    dubbelop.** De toets van 0130 telt zonder venster: hoeveel avatars er van
--    deze gebruiker *staan*. Dat is een grens op gelijktijdigheid — "één is
--    genoeg voor de app, de rest is ruimte voor wezen" — en die hoort te blijven
--    werken als je je avatar vervangt.
--
--    Die grens vervangen door een dagteller zou een gebruiker die zijn foto elf
--    keer in een jaar wisselt voorgoed buitensluiten. Andersom laat de grens van
--    0130 wél toe dat iemand honderd keer per dag plaatst en wist. Het zijn twee
--    verschillende vragen, en ze hebben allebei hun eigen antwoord nodig.

create or replace function public.bewaak_avatar_aantal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  map    text := (storage.foldername(new.name))[1];
  aantal integer;
begin
  if new.bucket_id <> 'avatars' or map is null then
    return new;
  end if;

  -- De grens van 0130: hoeveel er tegelijk stáán. Zonder venster, met opzet.
  --
  -- ⚠️ `>=` en niet `>`, want deze trigger is `before insert`: de rij van nu
  --    staat er nog niet. Dat is de vorm van 0130 en die blijft. (Tussentijds
  --    stond hier `>` toen de trigger `after` was; toen weigerde hij met `>=` de
  --    tiende in plaats van de elfde — de must-allow ving dat.)
  select count(*) into aantal
  from storage.objects o
  where o.bucket_id = 'avatars'
    and (storage.foldername(o.name))[1] = map;

  if aantal >= 10 then
    raise exception 'Te veel avatars voor deze gebruiker (%).', aantal
      using errcode = 'check_violation';
  end if;

  -- TODO(paid-tier): en hoeveel er per etmaal bíj zijn gekomen — de grens die
  -- 0130 niet had, en waardoor plaatsen-en-wissen ongelimiteerd was.
  perform tel_opslag_upload('avatars', 'uploader', map, 10, interval '1 day',
                            'avatars van deze gebruiker vandaag');

  return new;
end;
$$;

revoke execute on function public.bewaak_avatar_aantal() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. De verhuistrigger die twee emmers misten
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen het moment van binnenkomen: `update of bucket_id` beperkt hem tot
--    statements die die kolom aanraken, en de `when` daarbovenop tot de
--    verhuizingen die er werkelijk een zijn. Zelfde vorm als in 0228.

drop trigger if exists avatars_aantal_begrensd_verhuisd on storage.objects;

create trigger avatars_aantal_begrensd_verhuisd
  before update of bucket_id, name on storage.objects
  for each row
  when (new.bucket_id = 'avatars'
        and (old.bucket_id is distinct from new.bucket_id
             or (storage.foldername(old.name))[1] is distinct from (storage.foldername(new.name))[1]))
  execute function public.bewaak_avatar_aantal();

drop trigger if exists chatfotos_aantal_begrensd_verhuisd on storage.objects;

create trigger chatfotos_aantal_begrensd_verhuisd
  before update of bucket_id, name on storage.objects
  for each row
  when (new.bucket_id = 'chatfotos'
        and (old.bucket_id is distinct from new.bucket_id
             or (storage.foldername(old.name))[1] is distinct from (storage.foldername(new.name))[1]))
  execute function public.bewaak_chatfoto_aantal();

-- ⚠️⚠️ **Ook `bewijsfotos` krijgt de bredere vorm, al is die emmer er vandaag
--    niet mee te misbruiken.** Zijn sleutel is segment 2 en dat is door
--    `bewijsfotos_insert` aan `auth.uid()` gepind, dus een hernoeming kan de
--    sleutel niet verzetten. Maar één vorm voor drie emmers is het hele punt van
--    deze migratie: laat je hier de smalle staan, dan is dát de vorm die de
--    volgende schrijver kopieert. Zelfde reden als "een halve familie is erger
--    dan een hele".

drop trigger if exists bewijsfotos_aantal_begrensd_verhuisd on storage.objects;

create trigger bewijsfotos_aantal_begrensd_verhuisd
  before update of bucket_id, name on storage.objects
  for each row
  when (new.bucket_id = 'bewijsfotos'
        and (old.bucket_id is distinct from new.bucket_id
             or (storage.foldername(old.name))[2] is distinct from (storage.foldername(new.name))[2]))
  execute function public.bewaak_bewijsfoto_aantal();

-- ---------------------------------------------------------------------------
-- 5. De insert-triggers: `before` en niet `after`
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Hier stond eerst `after insert`, en dat is teruggedraaid na de
--    securityronde op deze branch. Twee gemeten redenen.**
--
-- 📏 **Een.** `after insert … for each row` vuurt niet voor de DO-UPDATE-tak van
--    een upsert. Gemeten: twaalf keer hetzelfde pad met
--    `on conflict … do update` gaf `aantal = 1` — elf uploads ongeteld. De
--    Storage-API doet precies die vorm zodra een client `x-upsert: true`
--    meestuurt, en een aanvaller gebruikt de app niet. Vóór deze migratie telde
--    `before insert` die tak wél; met `after` zou deze migratie een rem
--    *weghalen* terwijl hij er een komt zetten.
--
-- 📏 **Twee.** `after … for each row` vuurt aan het **eind** van het statement en
--    niet tussen de rijen door. Gemeten: één insert van twintig rijen in
--    `avatars` meldde `Te veel avatars voor deze gebruiker (20).` — alle twintig
--    stonden er dus al toen de eerste trigger vuurde. Met `before` is dat tien.
--    In de kop van deze migratie stond het omgekeerde beweerd; dat was onjuist
--    en is precies de fout die zich in deze familie vermenigvuldigt, want de
--    volgende rem wordt geschreven door de vorige te kopiëren.
--
-- ⚠️ **Wat `before` kost, en waarom dat hier de goedkoopste kant is.** Een
--    `insert … on conflict do nothing` die niets toevoegt, hoogt de teller tóch
--    op — de trigger vuurt vóórdat Postgres de botsing ziet. 📏 Gemeten: geen
--    enkel app-pad doet dat (`chatfoto.ts`, `bewijsfoto.ts` en `avatar.ts` zetten
--    alle drie `upsert: false` en schrijven een vers pad); het kwam alleen voor
--    in testfixtures. Een upload die niets toevoegt te veel tellen is bovendien
--    de veilige kant: hij weigert te veel in plaats van te weinig.

drop trigger if exists bewijsfotos_aantal_begrensd on storage.objects;

create trigger bewijsfotos_aantal_begrensd
  before insert on storage.objects
  for each row
  when (new.bucket_id = 'bewijsfotos')
  execute function public.bewaak_bewijsfoto_aantal();

drop trigger if exists chatfotos_aantal_begrensd on storage.objects;

create trigger chatfotos_aantal_begrensd
  before insert on storage.objects
  for each row
  when (new.bucket_id = 'chatfotos')
  execute function public.bewaak_chatfoto_aantal();

drop trigger if exists avatars_aantal_begrensd on storage.objects;

create trigger avatars_aantal_begrensd
  before insert on storage.objects
  for each row
  when (new.bucket_id = 'avatars')
  execute function public.bewaak_avatar_aantal();

-- ---------------------------------------------------------------------------
-- 6. De indexen volgen de tellingen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Twee indexen zijn dood en één ontbrak, en dat is precies omgekeerd aan
--    hoe het stond.** `objects_chatfotos_groep_dag_idx` (0222) en
--    `objects_bewijsfotos_uploader_dag_idx` (0228) droegen de `count(*)` die
--    deze migratie weghaalt: die twee tellers raken `storage.objects` niet meer.
--    Ze blijven wel een schrijfactie kosten bij élke upload.
--
--    Tegelijk is `bewaak_avatar_aantal()` de énige overgebleven telling over
--    `storage.objects` — de gelijktijdigheidsgrens van 0130 — en díé had er geen.
--    Onwrikbare regel 11.

drop index if exists storage.objects_chatfotos_groep_dag_idx;
drop index if exists storage.objects_bewijsfotos_uploader_dag_idx;

-- ⚠️⚠️ **Voorwaardelijk, en dat is geen slordigheid maar QS8-439.**
--    `storage.objects` is eigendom van `supabase_storage_admin`. Alles wat dit
--    project heeft — de Supabase-MCP, `psql` met de projectcredentials én de
--    SQL-editor in het dashboard — draait als `postgres`, en die is géén lid van
--    die rol. `grant supabase_storage_admin to postgres` antwoordt bovendien met
--    *"role memberships are reserved, only superusers can grant them"*.
--
-- 📏 **Per handeling apart gemeten op 12-09-2026**, elk in een eigen
--    terugrollende transactie: `create policy` gaat, `create trigger` gaat,
--    `create index` geeft `42501: must be owner of table objects`. Eén kale
--    `create index` stopt daarmee de hele migratiereeks — zo stond productie
--    vanaf `0222` drie dagen stil.
--
-- ⚠️ **Lokaal bezitten we de tabel wél**, dus daar wordt de index gewoon
--    aangelegd en houden `schema-opbouwen.sh` en de RLS-suite het volledige
--    schema. Op Supabase slaat hij hem hóórbaar over. Dit is de enige vorm
--    waarin dat verschil in de migratie zelf staat in plaats van in een
--    overgeslagen stap. Afweging in `docs/decisions/2026-09-12-een-index-op-een-tabel-die-niet-van-ons-is.md`.
do $$
begin
  create index if not exists objects_avatars_map_idx
    on storage.objects (((storage.foldername(name))[1]))
    where bucket_id = 'avatars';
exception when insufficient_privilege then
  raise notice 'QS8-439: objects_avatars_map_idx overgeslagen (42501) — geen eigenaar van storage.objects.';
end $$;
-- ⚠️ De tellertabel wordt alleen op zijn primaire sleutel geraakt
--    (`bucket_id, soort, sleutel`), en die index maakt Postgres zelf. Er hoeft
--    er dus geen bij — dat is hier geen omissie maar de vorm.
