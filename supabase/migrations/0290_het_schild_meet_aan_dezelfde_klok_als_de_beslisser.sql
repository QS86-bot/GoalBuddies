-- 0290_het_schild_meet_aan_dezelfde_klok_als_de_beslisser.sql — het zevendaagse
-- schild in `maak_straffen_verschuldigd()` mat aan `profiles.tz`, de klok die de
-- gestrafte zelf zet, terwijl de beslisser sinds 0288 aan de bevroren klok meet
-- (QS8-533)
--
-- ROLLBACK-PAD:
--   `maak_straffen_verschuldigd(uuid, date)` terug op de versie van 0238: geen
--   `cross join lateral`, en in de `not exists` weer `r.new_date >= p_vandaag`
--   en `g.target_date > p_vandaag - 7`.
--   Verder niets: deze migratie raakt geen tabel, geen kolom, geen policy en
--   geen handtekening aan, en `create or replace` behoudt de bestaande grants.
--
--   ⚠️ Terugdraaien zet twee dingen terug. Het gat dat dit issue beschrijft — een
--      onbeslist uitstelverzoek houdt een ronde langer stand zodra de gestrafte
--      zijn zone westwaarts zet — én de naad die 0288 openliet: een verzoek dat
--      het schild geldig noemt en de beslisser verlopen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden in de security-ronde op QS8-530, en hier zelf nagemeten tegen
-- `pg_get_functiondef('public.maak_straffen_verschuldigd(uuid,date)')` — niet
-- tegen 0175 of 0184, want een migratiebestand is niet de waarheid.
--
-- Het schild hield een straf op `set` zolang er een open, beslisbaar
-- uitstelverzoek lag en de streefdatum minder dan zeven dagen achter ons was:
--
--     and r.new_date  >= p_vandaag
--     ...
--     and g.target_date > p_vandaag - 7
--
-- `p_vandaag` komt van buiten de database: `localDateIn(profiel.tz, nu)` in
-- `supabase/functions/rollover/index.ts`. Dat is de **levende** `profiles.tz`,
-- en 📏 `has_column_privilege('authenticated','public.profiles','tz','UPDATE')`
-- is `t` — hier nagemeten. Een kleinere `p_vandaag` maakt `p_vandaag - 7`
-- kleiner, dus het schild houdt langer stand.
--
-- 📏 **Gemeten op 18-09-2026** op de lokale stack, met echte rijen en
--    teruggerold. Straf `set`, `created_at` dertig dagen oud, één open verzoek
--    met een toekomstige `new_date`, en als énige variabele de `profiles.tz`
--    ná het aangaan — de straf wordt dus eerlijk bevroren en het profiel
--    verhuist daarna. ⚠️ `vandaag` in de linkerkolom is de dag in de zone
--    **bij aangaan**, want dat is de enige klok die in beide opstellingen
--    hetzelfde betekent:
--
--      streefdatum   zone bij aangaan  zone daarna  met verzoek  zonder verzoek
--      ------------  ----------------  -----------  -----------  --------------
--      vandaag - 8   UTC               UTC                    1               1
--      vandaag - 8   Kiritimati        Midway                 1               1
--      vandaag - 7   UTC               UTC                    1               1
--      vandaag - 7   Kiritimati        Midway                 0               1
--      vandaag - 6   UTC               UTC                    0               1
--      vandaag - 6   Kiritimati        Midway                 0               1
--
-- ⚠️ **De rij `vandaag - 7` is het gat, en de kolom ernaast is de toerekening.**
--    Zónder verzoek wordt diezelfde straf op `vandaag - 7` gewoon verschuldigd,
--    ook in de aanvalsopstelling. Het is dus écht de schildclausule en niets
--    anders. Kiritimati (`UTC+14`) en Midway (`UTC−11`) liggen 25 uur uit
--    elkaar: precies één dag. In het drie-datumsvenster van QS8-530
--    (10:00–11:59 UTC) zijn het er twee.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ De tweede helft is een naad die 0288 zelf openliet
-- ---------------------------------------------------------------------------
--
-- 0288 verzette de verlooppoort van `beslis_deadline_verzoek()` naar
-- `doeldatum()` en liet `r.new_date >= p_vandaag` hier staan. Die twee stellen
-- dezelfde vraag — *is dit verzoek nog te beslissen* — en konden vanaf dat
-- moment uit elkaar lopen.
--
-- 📏 Gemeten op 18-09-2026, straf aangegaan in `Pacific/Kiritimati`, profiel
--    daarna naar `Pacific/Midway`, `new_date` = de levende dag van de aanvrager:
--
--      bevroren zone Kiritimati -> doeldatum  2026-09-18
--      levende zone Midway      -> p_vandaag  2026-09-17
--      new_date 2026-09-17, dus new_date >= p_vandaag
--      rollover      -> verschuldigd = 0, de straf blijft op `set`
--      de buddy beslist -> {"ok": false, "reason": "verzoek_verlopen"}
--
-- ⚠️⚠️ **Dat is precies wat 0175 verbiedt.** Die migratie heet *"een verzoek dat
--    niemand kan beslissen is geen verzoek"* en voegde de clausule toe die eist
--    dat er een buddy ís die erover mag gaan. Een verzoek dat wél een buddy
--    heeft maar dat die buddy alleen kan afwijzen, schermt een straf af zonder
--    dat er iets te beslissen valt. De regel bestond; de klok eronder liep weg.
--
-- Beide clausules gaan daarom naar `doeldatum(g.id, g.owner_id)` — dezelfde
-- functie die `vraag_deadline_verschuiving()` en `beslis_deadline_verzoek()`
-- sinds 0288 aanroepen. Drie plekken, één bron: ze kunnen niet meer uiteenlopen
-- zonder dat iemand die ene functie verzet.
--
-- ⚠️ `doeldatum()` geeft hier altijd de bevroren klok en nooit zijn terugval, en
--    dat is een eigenschap van deze query en niet van die functie: de rij die
--    bijgewerkt wordt ís een straf met `status = 'set'`, en dat is een van de
--    statussen waar `doeldatum()` zijn `max()` over neemt. 📏 `commitments.tz`
--    is NOT NULL (gemeten in `information_schema.columns`), dus die zone is er
--    ook echt.
--
-- 📏 **Ná deze migratie, dezelfde reeks:** de rij `vandaag - 7` met verzoek in
--    de aanvalsopstelling geeft `verschuldigd = 1` in plaats van `0`, en de
--    naadmeting hierboven geeft `verschuldigd = 1` met de straf op `due` —
--    terwijl de buddy nog steeds `verzoek_verlopen` krijgt. Die twee zeggen nu
--    hetzelfde over hetzelfde verzoek.
--
-- ⚠️ **De aanval slaat hierna de andere kant op**, en dat volgt uit diezelfde
--    tabel: het schild rekent door op de zone waarin de straf is aangegaan, en
--    die staat na een westwaartse sprong oostelijker dan de levende. De straf
--    die op `vandaag - 7` afgaat, gaat daarmee af op `levende dag - 6`. Dat is
--    dezelfde coulance als 0280 beschreef — je houdt precies wat je had toen je
--    je vastlegde — en geen tweede meting maar een herschrijving van de eerste.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Wat hier NIET in zit, en dat is een keuze met een meting eronder
-- ---------------------------------------------------------------------------
--
-- De regel erboven meet aan diezelfde levende klok en blijft staan:
--
--     and g.target_date < p_vandaag
--
-- 📏 Gemeten in dezelfde reeks, zonder enig uitstelverzoek, streefdatum één dag
--    vóór de dag van het aangaan:
--
--      UTC -> UTC (eerlijk)               verschuldigd = 1
--      Kiritimati -> Midway (aanval)      verschuldigd = 0
--
-- ⚠️⚠️ **Dat is dus een gat van dezelfde klasse, het staat één regel hoger, en
--    deze migratie sluit het niet.** Wie dit bestand leest en er "de klok onder
--    een straf ligt nu vast" uit meeneemt, leest het verkeerd. Drie redenen:
--
--   1. Het is een andere bevinding dan die van QS8-533, en dit project doet één
--      branch per issue. Hij staat als **QS8-548** open, mét deze meting.
--   2. Hij verandert **wanneer elke bestaande straf afgaat** en niet alleen hoe
--      lang een uitstel standhoudt. Dat is grens 1 van de *Beslisbevoegdheid* —
--      een besluit van Quinten, net als 0280 en 0288 dat waren.
--   3. `rollover/index.ts` draagt een uitgeschreven reden waarom juist díe datum
--      van de gebruiker komt (*"te vroeg is precies het enige dat hier niet
--      mag"*). Die reden klopt voor een sprong naar het oosten en zwijgt over
--      een sprong naar het westen. Dat is een afweging om te maken, niet een
--      omissie om en passant te repareren.
--
-- ⚠️ Wat deze migratie er wél aan doet: de twee clausules tellen niet meer op.
--    Vóór 0290 verschoof één westwaartse sprong allebei de grenzen dezelfde kant
--    op; erna staat het schild vast en blijft alleen de bovenste regel over.
--
-- ---------------------------------------------------------------------------
-- Wat `p_vandaag` hierna nog doet
-- ---------------------------------------------------------------------------
--
-- Hij draagt de bovenste regel en de null-poort, en hij blijft dus een parameter
-- met werk. Daarom verandert de handtekening niet en hoeft
-- `supabase/functions/rollover/index.ts` niet mee — er is geen volgorde van
-- uitrollen waarin de gedeployde rollover en deze functie elkaar mislopen.
--
-- ⚠️ De comment in `rollover/index.ts` die uitlegt waarom de datum daar berekend
--    wordt, is in deze wijziging bijgesteld: hij ging over de functie als geheel
--    en gaat vanaf nu over de regel die hij werkelijk draagt. Acceptatiecriterium
--    3 van QS8-533.
--
-- ---------------------------------------------------------------------------

/**
 * Maakt de straffen verschuldigd waarvan de streefdatum verstreken is.
 *
 * ⚠️ **Twee klokken, en dat is geen slordigheid maar de stand van zaken.**
 *    `p_vandaag` is de levende dag van de eigenaar en draagt de vraag *is de
 *    streefdatum verstreken*; `doeldatum()` is de bevroren dag onder de straf en
 *    draagt het schild eromheen. De kop van deze migratie zegt waarom de eerste
 *    daar nog staat en onder welk issue hij openstaat (QS8-548).
 *
 * ⚠️ De `cross join lateral` staat er om `doeldatum()` één keer per doel te
 *    berekenen in plaats van twee keer per rij — en, belangrijker, om er één
 *    naam voor te hebben. Twee losse aanroepen van dezelfde functie zijn twee
 *    regels die iemand apart kan verzetten.
 */
create or replace function public.maak_straffen_verschuldigd(p_owner_id uuid, p_vandaag date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_aantal integer;
begin
  if p_owner_id is null or p_vandaag is null then
    return 0;
  end if;

  update commitments c
     set status = 'due'
    from goals g
         cross join lateral (
           select public.doeldatum(g.id, g.owner_id) as vandaag
         ) d
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     and g.target_date < p_vandaag
     and c.created_at < now() - interval '24 hours'
     and not exists (
       select 1
       from deadline_requests r
       where r.goal_id = g.id
         and r.status = 'open'
         and r.new_date >= d.vandaag
         and exists (
           select 1
           from group_members m
           where m.group_id = r.group_id
             and m.user_id <> r.requester_id
             and m.status <> 'inactive'
         )
         and g.target_date > d.vandaag - 7
         and not exists (
           select 1
           from deadline_requests eerder
           where eerder.goal_id = g.id
             and eerder.status = 'rejected'
             and eerder.old_date = g.target_date
         )
     );

  get diagnostics v_aantal = row_count;
  return v_aantal;
end;
$$;
