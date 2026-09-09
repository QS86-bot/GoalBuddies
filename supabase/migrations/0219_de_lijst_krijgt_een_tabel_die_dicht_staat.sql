-- 0219_de_lijst_krijgt_een_tabel_die_dicht_staat.sql — de tabel voor De Lijst:
-- losse taken, eigenaar-only, met een dagplafond en een zichtbaarheidskolom die
-- nog niemand kan schrijven (QS8-379, deel 1 van QS8-378).
--
-- ROLLBACK-PAD:
--   drop trigger if exists taken_dagplafond on public.todo_items;
--   drop trigger if exists taken_rem on public.todo_items;
--   drop trigger if exists todo_items_updated on public.todo_items;
--   drop trigger if exists todo_items_pin on public.todo_items;
--   drop function if exists public.pin_taak();
--   drop function if exists public.begrens_taken();
--   drop function if exists public.rem_taken();
--   drop function if exists public.taken_plafond();
--   drop index if exists public.todo_items_afgevinkt_idx;
--   drop table if exists public.todo_items;
--   -- en `sleutelzetters()` terugzetten op de definitie uit **0217**, dus zonder
--   -- de rij `app.rem_taken` maar mét `app.rem_pushtokens` en
--   -- `app.rem_groepsgebeurtenissen`, én met de derde tak van 0215. Zie de
--   -- waarschuwing bij §5.
--
-- ⚠️ De tabel is nieuw en dus leeg; `drop table` valt hier niet onder grens 2 van
--    de beslisbevoegdheid. Wordt hij ooit teruggedraaid nádat er taken in staan,
--    dan is dat een andere handeling met een `pg_dump` ervoor.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Wens van Quinten, 09-09-2026: een to-do lijst op de taakbalk, te typen of in te
-- spreken, privé te houden of openbaar te maken. Deze migratie is de fundering:
-- **alles staat dicht.** Het scherm is QS8-380, het delen is QS8-381.
--
-- 📏 Er was geen plek voor een losse taak. Nagemeten in het schema: `weekly_goals`
--    is cyclusgebonden met punten en peer-goedkeuring, `milestones` hangt altijd
--    aan een doel, en `daily_moves` is een dagboekregel die sinds 0197 append-only
--    is. Greps op `taak`, `taken`, `checklist` en `subtaak` gaven alleen
--    commentaarregels — geen tabel, geen module, geen scherm.
--
-- ---------------------------------------------------------------------------
-- Twee aannames die hier vastgelegd zijn — en allebei bevestigd
-- ---------------------------------------------------------------------------
--
-- ✅ **Beslispunt 2 van QS8-378 is beslist op 09-09-2026, ná deze migratie:
--    variant B, per taak aanvinken wat de groep ziet.** Dat bevestigt allebei de
--    aannames hieronder in plaats van er een om te gooien — de vorm blijft zoals
--    hij hier staat. Wat het besluit wél doet, staat bij §3b: het deelpad van
--    QS8-381 werkt per taak, gaat door de pin heen met een sessiesleutel, en
--    versoepelt de policy niet.
--
-- ⚠️ **Eén lijst per gebruiker, geen `todo_lists`-tabel.** De wens zegt "een
--    to-do lijst", enkelvoud, en dat is de conservatiefste lezing. Meerdere
--    lijsten kan later zonder de rijen te verhuizen: een `list_id` erbij waarin
--    `null` "de standaardlijst" betekent. ✅ Bevestigd door beslispunt 2: bij
--    "per taak aanvinken" hoeft een lijst geen ding te zijn dat je aanzet.
--
-- ⚠️ **`visibility` staat er wél in en is voor niemand schrijfbaar.** De waarden
--    volgen `daily_moves` (`private`/`group`), maar er is nog geen enkele policy
--    of grant die er iets mee doet. Reden om hem nu al te zetten: een kolom
--    toevoegen aan een gevulde tabel is duurder dan een die er meteen staat, en
--    de standaard hoort `private` te zijn vanaf de eerste rij — CLAUDE.md,
--    domeinregel 7: *voor élk nieuw oppervlak is beschermd het antwoord tot
--    iemand het tegendeel besluit.*
--
--    De test bij deze migratie legt vast dat hij dicht is. Die hoort er **nu** te
--    staan en niet pas bij QS8-381, want anders is de kolom tot dan toe stil open.
--
--    ✅ Beslispunt 2 koos variant B — per taak aanvinken — dus deze kolom per rij
--    is precies de vorm die QS8-381 nodig heeft. ⚠️ Eén vraag laat dat besluit
--    open en hij hoort in QS8-381: "openbaar voor zijn groep" — wélke groep, als
--    iemand er in meer dan één zit? Er is hier geen `group_id`, en dat is
--    onwrikbare regel 18 vraag 6.
--
-- ---------------------------------------------------------------------------
-- 1. De tabel
-- ---------------------------------------------------------------------------

create table if not exists public.todo_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  done_at     timestamptz,
  order_index integer not null default 0,
  visibility  text not null default 'private',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- ⚠️ **`char_length` en niet `length`.** Postgres telt codepunten, JavaScript
  --    telt UTF-16-eenheden, en `.length` is altijd ≥ `char_length` — dus een
  --    client die in UTF-16 telt, laat bij een **ondergrens** door wat Postgres
  --    weigert. Eén emoji kost twee UTF-16-eenheden en één codepunt; een
  --    samengesteld gezin elf tegen zeven. Zie QS8-118.
  constraint todo_items_body_len
    check (char_length(btrim(body)) between 1 and 500),

  -- ⚠️ Dezelfde waarden als `daily_moves.visibility` (0001), zodat er niet twee
  --    woordenschatten voor hetzelfde begrip ontstaan.
  constraint todo_items_visibility_valid
    check (visibility in ('private', 'group')),

  -- ⚠️ **Een bovengrens, want "achteraan toevoegen" is `max + 1`.** Zonder deze
  --    CHECK mag een client `2147483647` zetten — de kolom is `integer` — en dan
  --    valt de eerstvolgende taak om met `22003 integer out of range` op een
  --    berekening die nergens fout lijkt. Geen lek, wel een scherm dat vastloopt
  --    op een waarde die een ánder verzoek erin gezet heeft. Gevonden in de
  --    security-review op dit issue.
  --
  --    Een miljoen is ruim: dat is een miljoen taken bij een dichte nummering,
  --    of duizend taken bij een nummering met gaten van duizend. `weekly_plan_steps`
  --    doet hetzelfde met 1..52, waar dat de natuurlijke grens was.
  constraint todo_items_order_bereik
    check (order_index between 0 and 1000000)
);

comment on table public.todo_items is
  'De Lijst — losse taken die niet aan een doel hangen (QS8-379). Levert nooit '
  'punten, een reeks of peer-goedkeuring op: de week blijft de enige eenheid die '
  'telt, net als bij De Dagzet (domeinregel 9).';
comment on column public.todo_items.visibility is
  'Standaard privé. Er is nog geen pad dat hem verandert: QS8-381 bouwt het, per '
  'taak, via een RPC die door pin_taak() heen komt met een sessiesleutel. Tot die '
  'RPC er is, hoort deze kolom voor elke client dicht te staan.';

-- ⚠️ **Niet in de realtime-publicatie, en dat is een keuze.** Elke tabel die
--    erin zit draagt het `REPLICA IDENTITY FULL`-risico mee: Supabase past RLS
--    niet toe op DELETE, dus met `FULL` gaat bij een verwijdering de volledige
--    oude rij naar iedere abonnee. Een to-do lijst heeft geen realtime nodig.

alter table public.todo_items enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Indexen
-- ---------------------------------------------------------------------------
--
-- ⚠️ `todo_items_vers_idx` draagt het venster van de dagteller in §4. Zonder die
--    index leest de telling bij elke insert meer dan ze hoeft, en dan is de rem
--    zelf de vertraging — zie de meting in de kop van 0203.

create index if not exists todo_items_volgorde_idx
  on public.todo_items (user_id, order_index);
create index if not exists todo_items_vers_idx
  on public.todo_items (user_id, created_at desc);

-- ⚠️ `todo_items_afgevinkt_idx` draagt nog geen query, en dat is met opzet: het
--    scherm is QS8-380 en de eerste vraag die het stelt — *wat staat er nog
--    open* — leest deze kolom. De index staat er nu omdat hij in het issue
--    genoemd wordt en omdat hem later toevoegen aan een gevulde tabel duurder
--    is dan nu. Blijkt het scherm afgevinkt en open níét te scheiden, dan hoort
--    hij weg: een index die niemand leest, kost bij elke schrijfactie.
create index if not exists todo_items_afgevinkt_idx
  on public.todo_items (user_id, done_at);

-- ---------------------------------------------------------------------------
-- 3. RLS — vier policies, alle vier eigenaar-only
-- ---------------------------------------------------------------------------
--
-- ⚠️ `(select auth.uid())` en niet `auth.uid()`: de kale aanroep wordt per rij
--    geëvalueerd, de subquery één keer per query. Dat is de vorm sinds 0122.
--
-- ⚠️ Vier policies en geen `for all`, want dan staat er één expressie voor vier
--    verschillende vragen en is niet te zien welke helft welke tak bewaakt.
--    Onwrikbare regel 1 vraagt ze afzonderlijk.

drop policy if exists todo_items_select on public.todo_items;
create policy todo_items_select on public.todo_items
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists todo_items_insert on public.todo_items;
create policy todo_items_insert on public.todo_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    -- ⚠️ Een taak wordt privé geboren. Deze conjunct is geen dubbelop naast de
    --    ontbrekende kolomgrant: die houdt tegen dat een client de kolom nóemt,
    --    deze houdt tegen dat hij ooit anders dan `private` binnenkomt — ook als
    --    de grant ooit verruimd wordt zonder dat iemand hierheen kijkt.
    and visibility = 'private'
  );

-- ⚠️⚠️ **Hier stond `and visibility = 'private'` in de `with check`, en dat was
--    een grendel die zijn eigen eigenaar buitensloot.** Een `with check` toetst
--    de *resulterende* rij en niet of een kolom onveranderd bleef. 📏 Gemeten in
--    de security-review op dit issue, en nagemeten: staat een taak eenmaal op
--    `'group'` — wat QS8-381 per ontwerp gaat doen — dan geeft `update … set
--    done_at = now()` van de eigenaar zélf `42501 new row violates row-level
--    security policy`. Zijn gedeelde taak is dan niet meer af te vinken, niet te
--    hernoemen en niet te verplaatsen; alleen nog weg te gooien (`delete` gaf
--    `GERAAKT 1`).
--
--    ⚠️ **En dat is niet alleen een bug maar een val.** Wie dat bij QS8-381
--    tegenkomt, leest een melding die naar precies deze regel wijst, en de
--    goedkoopste reparatie onder tijdsdruk is hem schrappen — waarmee grendel 2
--    van de kolom die deze migratie kwam beschermen, verdwijnt.
--
--    De tweede grendel staat daarom in §3b als pin, de vorm die dit schema al
--    gebruikt (`pin_week_review`, `guard_group_update`): die kijkt naar `old` en
--    `new` en houdt de kolom vast in plaats van de rij te bevriezen.
drop policy if exists todo_items_update on public.todo_items;
create policy todo_items_update on public.todo_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists todo_items_delete on public.todo_items;
create policy todo_items_delete on public.todo_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3a. Kolomgrants — want RLS kan geen kolommen beperken
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`created_at` staat niet in de INSERT-grant.** 📏 QS8-295 mat dat drie
--    tabellen die kolom bij insert uitdeelden, waarmee elke teller en elk venster
--    dat eraan hing waardeloos werd — een client zette hem gewoon een dag terug.
--    Het dagplafond in §4 hangt op deze kolom, dus hij is van de server.
--
-- ⚠️ **`visibility` staat in geen van beide.** Dat is de grendel waar de test bij
--    deze migratie op staat. Delen krijgt in QS8-381 een eigen RPC, met de
--    zorgvuldigheid die `zet_groepszichtbaarheid()` ook heeft — een kolom die
--    toevallig schrijfbaar is, is geen besluit.
--
-- ⚠️ **`updated_at` ook niet:** die wordt door een trigger gezet.
--
-- ⚠️ `user_id` staat wél in de INSERT-grant, en dat is de vorm van dit schema:
--    `daily_moves` deelt `user_id` uit, `goals` deelt `owner_id` uit. De policy
--    is de grendel — `user_id = (select auth.uid())` — en niet de afwezigheid
--    van het recht. `order_index` staat erbij omdat een taak op een plek in de
--    lijst geboren wordt; zonder dat recht schrijft het scherm elke nieuwe taak
--    twee keer.

revoke all on table public.todo_items from public, anon, authenticated;
grant select                                      on table public.todo_items to authenticated;
grant insert (user_id, body, order_index)         on table public.todo_items to authenticated;
grant update (body, done_at, order_index)         on table public.todo_items to authenticated;
grant delete                                      on table public.todo_items to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. De pin — de tweede grendel op `visibility`, en op drie kolommen erbij
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Waarom een pin en geen conjunct in de policy:** zie de aantekening bij
--    `todo_items_update` hierboven. Een `with check` kent `old` niet en bevriest
--    daarom de hele rij zodra de waarde ooit verandert.
--
-- ⚠️ **Hij weigert luid en zet niet stil terug.** Dat is de les van QS8-314: een
--    stille terugzetting geeft de client een 200 op een verzoek dat niets deed,
--    en dan zoekt niemand verder. De toewijzingen eronder zijn de vangnetregel
--    voor het geval de weigering ooit versmald wordt — dezelfde volgorde als in
--    `pin_week_review()`.
--
-- ⚠️ **Vier kolommen en niet één.** `visibility`, `user_id`, `created_at` en
--    `id` staan geen van alle in de UPDATE-kolomgrant, dus een client kán ze
--    vandaag niet noemen. Dit is de grendel voor het geval er ooit een grant bij
--    glipt — precies de reden die `groepspin.test.ts` in zijn kop uitschrijft,
--    en die daar geen hypothese bleek: `groups.tz` hád het recht.
--
-- ⚠️⚠️ **QS8-381 loopt hier tegenaan, en dat is met opzet.** Het deelpad krijgt
--    een `security definer`-RPC, en een trigger geldt óók voor die. De vorm die
--    dit schema daarvoor kent is een sessiesleutel die alléén die RPC zet, met
--    een rij in `sleutelzetters()` erbij — zoals `app.huddledag_verzet` in 0208.
--    Die sleutel staat hier bewust nog niet: een register dat een functie noemt
--    die niet bestaat, is een lijst die liegt. **Wie QS8-381 bouwt, voegt de
--    uitzondering hier toe en niet in de policy.**
--
-- ⚠️ `updated_at` wordt met opzet niet gepind: die zet `touch_updated_at()` een
--    trigger later. Triggers vuren op naam, en `todo_items_pin` komt vóór
--    `todo_items_updated`.

create or replace function public.pin_taak() returns trigger
 language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if new.visibility is distinct from old.visibility
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id
  then
    raise exception 'De zichtbaarheid en de herkomst van een taak liggen vast'
      using errcode = 'check_violation',
            hint = 'visibility, user_id, created_at en id liggen vast zodra de taak er staat; body, done_at en order_index zijn wel te wijzigen.';
  end if;

  new.visibility := old.visibility;
  new.user_id    := old.user_id;
  new.created_at := old.created_at;
  new.id         := old.id;

  return new;
end $$;

comment on function public.pin_taak() is
  'Houdt visibility, user_id, created_at en id van een taak vast bij een UPDATE '
  '(QS8-379). De kolomgrant is de eerste grendel; dit is de tweede, voor het '
  'geval er ooit een recht bij glipt.';

revoke all on function public.pin_taak() from public, anon, authenticated;

drop trigger if exists todo_items_pin on public.todo_items;
create trigger todo_items_pin
  before update on public.todo_items
  for each row execute function public.pin_taak();

drop trigger if exists todo_items_updated on public.todo_items;
create trigger todo_items_updated
  before update on public.todo_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Het dagplafond, en de rem eronder
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een nieuwe tabel zonder dagteller is het defect van QS8-344 opnieuw.** Die
--    vond tien tabellen die een client onbeperkt kon vullen. De vorm hieronder is
--    letterlijk die van 0203 en 0207, en dat is met opzet: `remdekking.test.ts`
--    wordt rood zodra er een `*_dagplafond`-trigger bestaat zonder een `*_rem`
--    ervoor die naar `rem_<naam>()` wijst.
--
-- ⚠️ **De teller alleen is niet genoeg, en dat is gemeten.** 📏 0200/0207: een
--    geweigerde bulk-insert schrijft de rijen éérst en draait ze daarna terug —
--    een transitietabel bestaat alleen in `AFTER`. Op `daily_moves` kostte een
--    batch van 20.000 daarmee 2,9 MB aangroei voor een verzoek dat volledig
--    geweigerd werd, en die ruimte komt pas terug bij een `vacuum full`. Vandaar
--    de `BEFORE INSERT … FOR EACH ROW`-rem op tweemaal het plafond.
--
-- ⚠️ **200 en niet 500.** De Dagzet staat op 500 omdat daar één regel per dag de
--    bedoeling is en de ruimte er voor vergissingen zit. Een to-do lijst is een
--    lijst: tweehonderd taken per etmaal is royaal voor een mens en krap voor een
--    script. Het is een gok in dezelfde orde als de andere plafonds; hij staat op
--    één plek, dus verhogen is één regel.

create or replace function public.taken_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 200 $$;

comment on function public.taken_plafond() is
  'Het dagplafond op nieuwe taken in De Lijst (QS8-379). Begrenst hoevéél je er '
  'per etmaal aanmaakt, nooit wat een afzonderlijke taak inhoudt.';

-- ⚠️ `revoke` noemt `authenticated` met zoveel woorden (onwrikbare regel 4):
--    `alter default privileges` deelt élke nieuwe functie in `public` uit aan
--    `anon`, `authenticated` én `service_role`, en `from public, anon` houdt
--    precies de rol over waaronder iedere ingelogde gebruiker draait.
revoke all on function public.taken_plafond() from public, anon, authenticated;

create or replace function public.begrens_taken() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  -- ⚠️⚠️ **Een statement dat niets toevoegde, kan het plafond niet doorbroken
  --    hebben.** Deze trigger is `after insert … for each statement` en vuurt
  --    óók als de transitietabel leeg is: een `insert … on conflict do nothing`
  --    die volledig op de conflicttak landt, ís een INSERT-statement. Zonder
  --    deze regel telt hij dan de tabel en niet de toevoeging, en krijgt een
  --    gebruiker die al boven zijn plafond staat `23514` op een verzoek dat
  --    niets schreef. 📏 Dat is op `push_tokens` gemeten en gerepareerd (QS8-369,
  --    0214): élke herregistratie viel om, met `(0 erbij, 21 in het laatste
  --    etmaal)` als diagnose in de melding zelf.
  --
  -- ⚠️ **Hier is dat pad vandaag niet te bereiken, en de regel staat er tóch.**
  --    `todo_items` heeft één unieke sleutel — de primaire — en `id` staat niet
  --    in de INSERT-kolomgrant, dus een client kán geen conflict maken. Maar de
  --    veertien tellers vóór 0214 dragen deze vorm zonder de regel, en de open
  --    vraag in `docs/ENGINEER-REVIEW.md` is of hij er overal bij hoort. Voor een
  --    níeuwe tabel is het antwoord ja: een bekend defect opnieuw neerzetten is
  --    hoe het zich verspreidt (CLAUDE.md, regel 19 — fouten worden gekopieerd).
  --    De grendel is geijkt door `id` in een terugrollende transactie tijdelijk
  --    wél uit te delen; zie `tests/rls/todo-lijst.test.ts`.
  if v_batch = 0 then return null; end if;
  select count(*) into v_totaal from todo_items t
   where t.user_id = (select auth.uid()) and t.created_at > now() - interval '1 day';
  if v_totaal > taken_plafond() then
    raise exception 'Te veel taken in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, taken_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

revoke all on function public.begrens_taken() from public, anon, authenticated;

create or replace function public.rem_taken() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_taken', true), ''), '0')::integer + 1;
  perform set_config('app.rem_taken', v_n::text, true);
  if v_n > taken_plafond() * 2 then
    raise exception 'Te veel taken in één verzoek (% rijen, noodgrens %)',
      v_n, taken_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

revoke all on function public.rem_taken() from public, anon, authenticated;

drop trigger if exists taken_rem on public.todo_items;
create trigger taken_rem
  before insert on public.todo_items
  for each row execute function public.rem_taken();

drop trigger if exists taken_dagplafond on public.todo_items;
create trigger taken_dagplafond
  after insert on public.todo_items
  referencing new table as nieuw
  for each statement execute function public.begrens_taken();

-- ---------------------------------------------------------------------------
-- 5. Het sleutelregister
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit register zit in een functielichaam, en dat is drie keer bijna
--    duur geworden.** Twee branches die allebei `create or replace` doen,
--    geven git geen conflict: de laatste wint en het register van de ander
--    verdwijnt zonder een woord (QS8-358). Het lichaam hieronder is daarom
--    gekopieerd uit **0217 op `main`** — de laatste definitie die er is — en
--    de enige toevoeging is de rij `app.rem_taken`.
--
--    📏 **Dat is niet theoretisch gebleven, en het is hier twee keer bijna
--    misgegaan — één keer per hernummering.** De eerste keer stond hier het
--    lichaam van 0208 en ontbrak `app.rem_pushtokens` uit 0214. De tweede keer
--    stond hier het lichaam van 0214, en dat kostte méér dan een sleutel: main
--    kreeg er 0215 (QS8-376) bij, die de **derde tak** herschreef van "per
--    functie" naar "per sleutel", en 0217 met `app.rem_groepsgebeurtenissen`.
--    Deze migratie draait ná allebei, dus ze had die reparatie ongemerkt
--    teruggedraaid.
--
--    ⚠️ **De les die dit oplevert staat niet in CLAUDE.md en hoort er wel:**
--    hernummeren is geen administratieve handeling. Een migratie die naar
--    achteren schuift, draait ná migraties waar ze eerst vóór stond, en elke
--    `create or replace` in haar lichaam wordt daarmee een terugzetting. Kijk
--    bij élke hernummering welke functies je herdefinieert en of `main` ze
--    intussen heeft aangeraakt.

CREATE OR REPLACE FUNCTION public.sleutelzetters()
 RETURNS TABLE(naam text, bezwaar text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      -- ⚠️ Uit 0208 (QS8-360). De huddledag verzetten schuift de start van de
      --    lopende periode, en dan gaat de weekafsluiting die erbij hoort mee —
      --    langs de pin van 0206, die `group_id` en `user_id` onverkort gepind
      --    houdt.
      ('app.huddledag_verzet',    array['zet_huddledag', 'pin_week_review']),
      -- ⚠️ **Deze drie komen uit 0199 (QS8-356) en staan hier omdat een
      --    `create or replace` het hele register vervangt.** Ze zijn er bij het
      --    samenvoegen bijna uit gevallen: de RLS-suite meldde na de merge drie
      --    ongeregistreerde sleutels — `verlaat_groep`,
      --    `beslis_lidmaatschapsverzoek` en `verwijder_lid` — omdat mijn versie
      --    het register van vóór die migratie kopieerde.
      --
      --    Dat is de val van een teller die zijn eigen register in zijn lichaam
      --    draagt: twee branches breiden hem uit, de laatste `replace` wint, en
      --    de ander verdwijnt zonder een woord. Hier ving de teller zichzelf op
      --    doordat hij de weggevallen sleutels meteen als ongeregistreerd meldde.
      ('app.beheer_overgedragen',   array['verlaat_groep', 'guard_group_member_update']),
      ('app.lidmaatschap_besloten', array['beslis_lidmaatschapsverzoek', 'guard_group_member_update']),
      ('app.lid_uitgezet',          array['verwijder_lid', 'guard_group_member_update']),
      -- De tellers van 0200. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen']),
      -- ⚠️⚠️ **Deze vijf komen uit 0207 (QS8-361) en waren er bij het samenvoegen
      --    uit gevallen.** Mijn versie kopieerde het register van vóór die
      --    migratie, precies zoals de aantekening bij de drie sleutels van 0199
      --    hierboven beschrijft — de val van een teller die zijn eigen register in
      --    zijn lichaam draagt: twee branches breiden hem uit, de laatste
      --    `replace` wint, en de ander verdwijnt zonder een woord.
      --
      -- 📏 De teller ving zichzelf opnieuw op: `rem_commitments`, `rem_dagzetten`,
      --    `rem_doelinterviews`, `rem_doelkoppelingen` en `rem_voltooiingen`
      --    stonden meteen als ongeregistreerd in de uitslag, en twee RLS-tests
      --    werden er rood van. Dat is de tweede keer op vier dagen; het staat als
      --    QS8-358.
      ('app.rem_commitments',        array['rem_commitments']),
      ('app.rem_voltooiingen',       array['rem_voltooiingen']),
      ('app.rem_dagzetten',          array['rem_dagzetten']),
      ('app.rem_doelkoppelingen',    array['rem_doelkoppelingen']),
      ('app.rem_doelinterviews',     array['rem_doelinterviews']),
      -- ⚠️⚠️ **Uit 0214 (QS8-369), en deze regel is er bijna uit gevallen.**
      --    Die migratie landde op `main` terwijl deze branch openstond en
      --    hernummerde mij van 0214 naar 0215 — dus deze `create or replace`
      --    draait er nu áchteraan. Het register dat ik kopieerde was van vóór hun
      --    migratie, en zonder deze regel had ik `app.rem_pushtokens` er stil
      --    weer uit gehaald.
      --
      --    Dat is exact de val van QS8-358, en de derde keer dat hij toeslaat: een
      --    teller die zijn eigen register in zijn lichaam draagt, twee branches
      --    die hem uitbreiden, en de laatste `replace` wint. 📏 Gevonden door na
      --    het samenvoegen te grepen op wat hún 0214 registreert en dat naast het
      --    mijne te leggen.
      --
      --    ⚠️ **En de teller had zichzelf ook opgevangen**, net als bij 0199 en
      --    0207: `rem_pushtokens()` zet die sleutel nog steeds, dus zonder deze
      --    regel meldt hij hem meteen als ongeregistreerd — 📏 nagemeten, de regel
      --    weghalen geeft `rem_pushtokens: noemt app.rem_pushtokens`. Dat is de
      --    hele reden dat deze grendel bestaat, en het is de derde keer dat hij
      --    zijn eigen register redt.
      ('app.rem_pushtokens',         array['rem_pushtokens']),
      -- ⚠️ Uit 0217 (QS8-374). De zestiende dagteller, en de eerste op een
      --    tabel die niemand rechtstreeks beschrijft: `group_events` is bij
      --    alle zeven schrijvers een neveneffect.
      --
      -- ⚠️⚠️ **En dit register is voor de tweede keer op rij opnieuw uitgelezen
      --    in plaats van gekopieerd.** Toen deze migratie geschreven werd stond
      --    hij op 0215; QS8-376 landde ondertussen op `main` met een 0215 die
      --    déze functie herschrijft — `ilike` in plaats van `like`, en een derde
      --    tak die per sleutel kijkt in plaats van per functie. 📏 Het verschil
      --    is nagemeten met een `diff` tussen wat ik meedroeg en wat er ná hun
      --    migratie in de database stond: mijn kopie had hun hele reparatie
      --    stilzwijgend teruggedraaid. Dat is QS8-358 voor de vierde keer.
      ('app.rem_groepsgebeurtenissen', array['rem_groepsgebeurtenissen']),
      -- ⚠️ Uit 0219 (QS8-379). De Lijst krijgt zijn eigen rem, en dus zijn eigen
      --    sleutel.
      ('app.rem_taken',                array['rem_taken'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc ilike '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select distinct p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt ' || m.gevonden[1] || ', een app.-sessiesleutel die in geen '
         'enkel register van deze teller staat; een nieuwe sleutel hoort er '
         'met zijn eigen regel in te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(p.prosrc, 'app\.[A-Za-z0-9_]+', 'g') as m(gevonden)
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and lower(m.gevonden[1]) not in (select s.instelling from sleutel s)

   order by 1;
$function$

;

-- ⚠️ **De `revoke` staat er ook al zou `create or replace` de rechten bewaren.**
--    Onwrikbare regel 4: `alter default privileges` in Supabase deelt élke
--    nieuwe functie in `public` uit aan `anon`, `authenticated` én
--    `service_role`, en `from public, anon` houdt precies de rol over waaronder
--    iedere ingelogde gebruiker draait. Hem hier herhalen kost niets en maakt de
--    stand na deze migratie onafhankelijk van wat ervóór stond — 0214 doet
--    hetzelfde, 0208 deed het niet.
revoke execute on function public.sleutelzetters()
  from public, anon, authenticated;
