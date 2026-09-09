-- 0218_de_groep_die_om_uitstel_gevraagd_wordt_ziet_de_straf.sql — een blind akkoord op een commitment device (QS8-370)
--
-- ROLLBACK-PAD:
--   begin;
--   drop trigger if exists goal_group_links_verzoek_intrekken on public.goal_group_links;
--   drop function if exists public.ontkoppelen_trekt_verzoek_in();
--   drop function if exists public.straffen_bij_uitstelverzoek(uuid[]);
--   drop index if exists public.deadline_requests_goal_idx;
--   commit;
--
--   ⚠️ Een terugzet laat verzoeken staan die de trigger al heeft ingetrokken.
--      Dat is geen verlies van gegevens — `withdrawn` is een bestaande stand die
--      de aanvrager zelf ook kan zetten — maar het draait niet vanzelf terug, en
--      dat hoort hier te staan.
--
--   ⚠️ `commitments_select` wordt door deze migratie **niet aangeraakt**, dus er
--      valt aan die kant niets terug te zetten. Dat is geen toeval maar de
--      uitkomst van de security-ronde hieronder.
--   ⚠️ De `drop function` hoort erbij en is geen netheid: zonder hem blijft er
--      een `security definer`-functie staan die `authenticated` mag uitvoeren
--      terwijl niets hem meer aanroept. Dezelfde les als in 0183.
--   ⚠️ Deze migratie versmalt niets en gooit niets weg; een terugzet neemt
--      alleen de verruiming zelf terug. Er wordt geen kolom aangeraakt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-370, gevonden door de security-ronde op de branch van QS8-322.
-- `zet_streefdatum()` draagt sinds 0184 een rem: een straf die op `set` staat,
-- laat de streefdatum niet vooruit schuiven. `beslis_deadline_verzoek()` draagt
-- die rem niet, en dat is geen vergeten achterdeur — 0184 zegt zelf dat de route
-- via `vraag_deadline_verschuiving()` wél bestaat en de gebruiker díé hoort te
-- lezen. De groep mag dus verschuiven wat de eigenaar alleen niet mag.
--
-- ⚠️ **Wat er scheef stond is niet dát, maar dat het akkoord blind was.**
--    📏 Gemeten op de lokale stack, met Bob als beslissend groepslid en een
--    straf op `set`, allebei de vormen die `commitments` kent:
--
--      bob ziet de persoonsstraf (beneficiary_user_id = bob)   = 0
--      bob ziet de groepsstraf   (beneficiary_group_id = grp)  = 0
--
--    `commitment_zichtbaar_voor_groep()` geeft `unlocked, due, resolved` en
--    `commitment_zichtbaar_voor_persoon()` geeft `due, resolved`. Een straf op
--    `set` valt buiten allebei. Het groepslid dat "Akkoord" indrukt, maakt dus
--    een commitment device losser zonder te weten dat het er staat.
--
--    Domeinregel 5 zegt dat een consequentie expliciet bevestigd en
--    auditeerbaar is en nooit stilzwijgend geactiveerd. De spiegelzijde — nooit
--    stilzwijgend ge-de-activeerd, al helemaal niet door iemand die niet ziet
--    waar hij ja tegen zegt — stond er niet, en dat is precies het gat.
--
-- ---------------------------------------------------------------------------
-- De keuze, en waarom hij niet van Claude is
-- ---------------------------------------------------------------------------
--
-- QS8-370 gaf vier richtingen. Richting 1 en 2 (dezelfde rem in
-- `beslis_deadline_verzoek()` of in `vraag_deadline_verschuiving()`) zijn
-- gebouwd en gemeten: 📏 tien bestaande tests werden rood, waaronder twee
-- must-allows in `tests/rls/straf-plafond.test.ts`. Die reparatie is dus geen
-- "strenger maken" maar het intrekken van een belofte die vandaag onderdeel is
-- van de afspraak. Beslisbevoegdheid grens 1.
--
-- **Quinten heeft richting 3 gekozen, en breder dan het issue hem stelde:**
-- *"Iedereen van de groep mag de straf zien"* — niet alleen degene die toevallig
-- op de knop drukt. De volledige afweging staat in
-- `docs/decisions/2026-09-08-de-groepsroute-is-geen-uitweg.md`.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Waarom dit een RPC is en géén vierde tak op `commitments_select`
-- ---------------------------------------------------------------------------
--
-- De eerste versie van deze migratie zette wél zo'n tak neer:
-- `or (type = 'penalty' and gevraagd_om_uitstel_op(goal_id))`. De
-- security-ronde van 09-09-2026 heeft hem afgewezen, en de drie metingen die
-- dat dragen zijn alle drie nagemeten voordat ze verwerkt werden:
--
--   📏 **De tak gaf de hele rij weg.** Bob (lid van de gevraagde groep, níet de
--      begunstigde) las met één `select *` op `commitments`:
--        body                = 'GEHEIME STRAF'
--        image_url           = 'https://…'
--        beneficiary_user_id = <het id van de getuige>
--      Het scherm laat daar één generieke zin van zien. **RLS kan geen kolommen
--      beperken** — CLAUDE.md domeinregel 7 zegt dat met zoveel woorden — dus
--      een policy is hier per constructie te veel.
--
--      ⚠️ **Dit project heeft die afweging al eens gemaakt en toen andersom
--         beslist.** QS8-292/0169 gaf de persoonlijke getuige geen policy maar
--         `getuigenissen()`: een `security definer`-functie met een expliciete
--         kolomlijst, precies omdat de getuige mínder hoort te zien dan de
--         eigenaar. Deze migratie kopieert die vorm in plaats van hem tegen te
--         spreken.
--
--   📏 **De tak gaf `due` weg, en dat is tegenslag over een derde.** Met een
--      straf op `due` las hetzelfde groepslid de rij gewoon (= 1), terwijl hij
--      de begunstigde niet is. `maak_straffen_verschuldigd()` zet een straf op
--      `due` bij `g.target_date < p_vandaag`; `due` ís dus letterlijk "deze
--      persoon heeft zijn streefdatum niet gehaald". Dat is het schaamtemoment
--      waar domeinregel 7 voor bestaat, in een **beschermde** groep, buiten de
--      drie routes om — en het gebeurt zónder dat de eigenaar er nog iets voor
--      doet. De eerste versie van dit bestand beweerde het tegendeel ("die was
--      voor de begunstigde al zichtbaar"); dat klopt voor rij 20 en niet voor
--      dit publiek.
--
--   📏 **De tak hield nergens op.** Na `delete from goal_group_links` las Bob
--      het dóél niet meer (= 0) en de straf nog wél (= 1). Beslisdocument 002
--      legt vast: *"Koppelen is de toestemming (QS8-54) en ontkoppelen is het
--      intrekken ervan"*, en de knop heet letterlijk "Niet meer delen met deze
--      groep". Ook een **ingetrokken** verzoek (`withdrawn`) hield het oppervlak
--      open, terwijl daar niemand ooit iets heeft toegestaan.
--
-- **De functie hieronder geeft daarom precies één ding terug: welke van de
-- opgegeven doelen een straf dragen.** Geen tekst, geen foto, geen getuige,
-- geen stand.
--
-- ⚠️ **En dat maakt `due` per constructie onzichtbaar in plaats van per
--    afspraak.** De uitkomst verandert niet als een straf van `set` naar `due`
--    gaat — hij stond er al in. Er is dus geen statuslijst om synchroon te
--    houden en geen moment waarop deze functie iets nieuws vertelt; dat is een
--    eigenschap van wat hij teruggeeft en niet van een `where`-regel die iemand
--    later kan verzetten.
--
-- ⚠️ **De prijs staat in de app en niet alleen hier.** Wat de aanvrager te horen
--    krijgt is dus ook precies dit: de groep ziet *dát* er een straf staat, niet
--    wat erin staat. `deadline.straf_wordt_zichtbaar` zegt allebei de helften.
--    Wil Quinten de tekst zélf ook delen, dan is dat een eigen besluit onder
--    grens 1 en een eigen issue — niet iets dat een policy er stilzwijgend bij
--    geeft.

begin;

-- ⚠️ Een index op `goal_id` alleen. Die is er nog niet: van de twee bestaande
--    indexen op die kolom is er één partieel op `status = 'open'` en de andere
--    op `(goal_id, old_date) where status = 'rejected'`. De functie hieronder
--    vraagt over álle statussen behalve `withdrawn` (onwrikbare regel 11).
create index if not exists deadline_requests_goal_idx
  on public.deadline_requests (goal_id);

-- ---------------------------------------------------------------------------
-- 1 — Ontkoppelen sluit óók de beslissing, en niet alleen de waarschuwing
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is de tweede bevinding van de security-ronde, en zonder deze helft
--    is de rand hieronder erger dan geen rand.** 📏 Gemeten, volledig langs
--    paden die een gewone client kan lopen:
--
--      alice verstuurt het verzoek            -> ok
--      alice ontkoppelt haar eigen doel       -> DELETE 1  (goal_group_links_delete)
--      bob ziet het doel                      = 0
--      bob ziet het verzoek                   = 1
--      bob ziet de straf-bit                  = 0     <- de waarschuwing wég
--      bob beslist(akkoord)                   -> {"ok": true, "moved": true}
--      de datum is verschoven                 = true
--
--    Eén knop — "Niet meer delen met deze groep" — en het akkoord is weer
--    blind, precies wat dit issue bestrijdt. En blinder dan vóór 0218: er staat
--    dan niet "onbekend" maar niets, want de vraag lukt en zegt "geen straf".
--
-- ⚠️ **De reparatie zit aan de kant van het verzoek en niet aan die van de
--    knop.** Een toets in `beslis_deadline_verzoek()` zou het verzoek `open`
--    laten staan terwijl niemand het meer kan beslissen — en sinds 0174 houdt
--    een open verzoek de straf tegen, dus dat is een schild dat niemand kan
--    wegnemen. Dat is exact het geval dat QS8-309/0175 heeft moeten repareren.
--    Een verzoek waarvan de koppeling weg is, hoort dus dicht en niet dood.
--
-- ⚠️ `withdrawn` en niet `rejected`: de aanvrager heeft dit zelf veroorzaakt
--    door te ontkoppelen. Niemand heeft nee gezegd.
create or replace function public.ontkoppelen_trekt_verzoek_in()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update deadline_requests
     set status = 'withdrawn'
   where goal_id  = old.goal_id
     and group_id = old.group_id
     and status   = 'open';

  return old;
end;
$$;

-- ⚠️ Regel 4, en bij een triggerfunctie net zo goed: `alter default privileges`
--    deelt hem anders uit aan `anon` en `authenticated`, en dan staat er een
--    definer-functie in de API die niemand hoort aan te roepen.
--    `triggerfuncties_in_de_api()` wordt daar rood van.
revoke all on function public.ontkoppelen_trekt_verzoek_in() from public, anon, authenticated;

comment on function public.ontkoppelen_trekt_verzoek_in() is
  'Trekt een openstaand uitstelverzoek in zodra het doel niet meer met die groep gedeeld '
  'wordt. Koppelen is de toestemming en ontkoppelen is het intrekken ervan (beslisdocument '
  '002); zonder deze trigger verdwijnt de strafwaarschuwing van QS8-370 terwijl de '
  'goedkeurknop blijft staan, en dat is het blinde akkoord dat 0218 juist sluit.';

drop trigger if exists goal_group_links_verzoek_intrekken on public.goal_group_links;
create trigger goal_group_links_verzoek_intrekken
  after delete on public.goal_group_links
  for each row
  execute function public.ontkoppelen_trekt_verzoek_in();

-- ---------------------------------------------------------------------------
-- 2 — Welke doelen dragen een straf, gezien door de gevraagde groep
-- ---------------------------------------------------------------------------

create or replace function public.straffen_bij_uitstelverzoek(p_goal_ids uuid[])
returns table (goal_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- ⚠️ **Werpen en niet afkappen** (onwrikbare regel 10). Een `p_goal_ids[1:100]`
  --    faalt stíl: 📏 met het doel op positie 120 van 150 kwamen er nul rijen
  --    terug, zonder fout — en dan verdwijnt de waarschuwing terwijl het scherm
  --    denkt dat het een antwoord heeft. Een exception wordt in
  --    `fetchStrafDoelen()` een `null` en op het scherm "dit konden we niet
  --    ophalen". Fail-closed, zonder één regel schermcode.
  if coalesce(array_length(p_goal_ids, 1), 0) > 100 then
    raise exception 'straffen_bij_uitstelverzoek: hoogstens 100 doelen per aanroep'
      using errcode = 'program_limit_exceeded';
  end if;

  return query
  select distinct c.goal_id
  from commitments c
  where c.type = 'penalty'
    -- ⚠️ **`cancelled` telt niet mee, en dat is een correctie uit de
    --    security-ronde.** Het scherm zegt *"Ga je akkoord, dan schuift de datum
    --    waarop die verschuldigd wordt mee"*, en bij een ingetrokken straf is dat
    --    aantoonbaar onwaar: er schuift niets. Een onjuiste mededeling in een
    --    beslissing over een commitment device is erger dan geen mededeling.
    --
    -- ⚠️ **En dit is de enige stand die eruit mag.** `set`, `due` en `resolved`
    --    tellen alle drie mee, juist zodat de uitkomst níet verandert als een
    --    straf verschuldigd wordt: zou `due` eruit vallen, dan is het
    --    verdwijnen van dit bit het signaal dat iemand zijn streefdatum niet
    --    gehaald heeft (domeinregel 7). Wat hier wél afleidbaar wordt is dat de
    --    eigenaar zijn straf heeft ingetrokken — zijn eigen handeling, en geen
    --    tegenslag.
    and c.status <> 'cancelled'
    and c.goal_id = any (p_goal_ids)
    -- ⚠️ **Dezelfde opvatting van "mag ik dit doel zien" als de rest van de
    --    leeskant, en niet een derde.** `shares_group_with_goal()` eist dat de
    --    kíjker nog actief lid is, dat de **eigenaar** dat ook is, en dat de
    --    groep niet gearchiveerd is. 📏 Zonder deze conjunct las een groepslid
    --    het bit terwijl het doel zelf onzichtbaar was — in een gearchiveerde
    --    groep, en ook nadat de eigenaar zichzelf met een kale PATCH op
    --    `inactive` had gezet. Een oppervlak dat langer leeft dan het doel
    --    waar het over gaat, is een oppervlak dat niemand besloten heeft.
    and shares_group_with_goal(c.goal_id)
    and exists (
      select 1
      from deadline_requests r
      join goal_group_links l
        on l.goal_id = r.goal_id
       and l.group_id = r.group_id
      where r.goal_id = c.goal_id
        -- ⚠️ **Een ingetrokken verzoek telt niet.** De onderbouwing van dit
        --    oppervlak is "je hebt deze groep gevraagd je afspraak losser te
        --    maken, dus die mag weten wat eraan hangt". Bij `withdrawn` heeft
        --    niemand ooit iets toegestaan — de aanvrager heeft het zelf
        --    teruggenomen. `rejected` telt wél mee: daar is over besloten, en
        --    wie nee heeft gezegd, hoort te kunnen terugzien waarop.
        and r.status <> 'withdrawn'
        -- ⚠️ De `join` hierboven eist dat het doel nog mét díe groep gedeeld
        --    wordt. Samen met de trigger van sectie 1 sluit dat allebei de
        --    kanten: de waarschuwing én de knop.
        and mag_groep_lezen(r.group_id)
    );
end;
$$;

-- ⚠️ Regel 4: `authenticated` staat met zoveel woorden in de `revoke`. In
--    Supabase deelt `alter default privileges` elke nieuwe functie in `public`
--    uit aan `anon`, `authenticated` én `service_role`; `from public, anon` laat
--    precies de rol staan waaronder iedere ingelogde gebruiker draait.
revoke all on function public.straffen_bij_uitstelverzoek(uuid[]) from public, anon, authenticated;
grant execute on function public.straffen_bij_uitstelverzoek(uuid[]) to authenticated;

comment on function public.straffen_bij_uitstelverzoek(uuid[]) is
  'Welke van deze doelen dragen een straf die nog staat, gezien door een groep die om uitstel '
  'op dat doel gevraagd is? Geeft uitsluitend `goal_id` terug — geen tekst, geen foto, geen '
  'getuige en geen stand, want RLS kan geen kolommen beperken en de beslisser hoeft alleen te '
  'weten dát er een afspraak aan hangt (QS8-370, 0218). Zelfde vorm en zelfde reden als '
  'getuigenissen() uit 0169. De retourvorm is zelf de belofte en staat onder test in '
  'tests/rls/uitstelbeslisser-ziet-de-straf.test.ts: een kolom erbij is daar een rode test. '
  'Elk verzoek telt behalve een ingetrokken, het doel moet nog met die groep gedeeld worden, '
  'en shares_group_with_goal() draagt dezelfde grens als de rest van de leeskant. Niet te '
  'verwarren met commitment_zichtbaar_voor_groep(), die over de BEGUNSTIGDE groep gaat en door '
  'dit oppervlak niet verruimd wordt.';

commit;
