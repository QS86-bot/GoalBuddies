-- 0174_een_open_deadline_verzoek_houdt_de_straf_tegen.sql — een straf ging verschuldigd terwijl de groep nog over de streefdatum moest beslissen (QS8-307)
--
-- ROLLBACK-PAD:
--   `create or replace` op `maak_straffen_verschuldigd()` zonder de
--   `deadline_requests`-conjuncten (definitie in 0171), plus
--   `drop index if exists deadline_requests_afgewezen_idx;`.
--   ⚠️ Deze migratie voegt alleen een weigering toe; er gaat bij een terugzet
--   niets verloren behalve het uitstel zelf. Straffen die door deze conjunct
--   níet verschuldigd zijn geworden, staan nog op `set` en gaan bij de
--   eerstvolgende rollover alsnog af.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De security-ronde op QS8-298 wees het aan; hieronder staat de meting, in één
-- transactie op de lokale stack, met een doel waarvan de streefdatum gisteren
-- lag en een straf van tien dagen oud:
--
--   A open verzoek op het doel | 1
--   B verschuldigd gemaakt     | 1
--   C status van de straf      | due
--   D verzoek nog open         | 1
--
-- `deadline_requests` kwam in `maak_straffen_verschuldigd()` niet voor. Het
-- gevolg is niet alleen een verkeerde kolomwaarde: sinds QS8-298 stuurt de
-- persoonstak van `meld_commitment()` de getuige een pushmelding dat de inzet
-- verschuldigd is geworden. Die is de deur uit, en door de ontdubbeling op
-- `ref_id` krijgt de getuige bij de échte verschuldiging niets meer.
--
-- ⚠️ **Domeinregel 5.** Een straf die "verschuldigd" heet terwijl de groep nog
--    over de datum moet beslissen, is een consequentie die de gebruiker niet
--    heeft ingesteld — en dat is precies wat een commitment device niet mag
--    doen.
--
-- ---------------------------------------------------------------------------
-- Waarom er twéé grenzen op het uitstel staan
-- ---------------------------------------------------------------------------
--
-- Het issue waarschuwt er zelf voor: een open verzoek dat nooit beslist wordt,
-- stelt de straf anders **oneindig** uit. Nagemeten, en die waarschuwing klopt
-- twee keer:
--
--   1. **Een open verzoek gaat uit zichzelf nooit dicht.** 0171 gaf
--      `beslis_deadline_verzoek()` een verlooptak, maar die weigert alleen het
--      akkoord — de rij blijft `open` staan. Er is geen enkele overgang van
--      `open` naar iets anders zonder dat een mens hem aanraakt.
--
--   2. **`new_date` heeft geen bovengrens.** `vraag_deadline_verschuiving()`
--      toetst `p_new_date >= mijn_datum()` en verder niets; `goals` heeft geen
--      CHECK op `target_date`. Een eigenaar kan dus een verschuiving naar het
--      jaar 3000 aanvragen, en die aanvraag heeft niemands akkoord nodig om te
--      bestáán. Zonder tweede grens is dat een knop waarmee je je uit je eigen
--      commitment koopt — precies wat domeinregel 10 verbiedt bij het
--      verschuiven van een deadline.
--
-- Vandaar twee voorwaarden bovenop `status = 'open'`, die elk in een ánder
-- geval de strengste zijn (de derde volgt in ronde 2 hieronder):
--
--   `r.new_date >= p_vandaag`
--     Het verzoek kan nog iets uitrichten. Is die datum voorbij, dan weigert
--     `beslis_deadline_verzoek()` het akkoord al met `verzoek_verlopen` (0171),
--     dus een verzoek dat niets meer kan verschuiven hoort ook niets meer
--     tegen te houden. Dit is de tegenhanger van die tak en geen nieuw begrip.
--
--   `g.target_date > p_vandaag - 7`
--     Een straf wacht hooguit een week op de groep, geteld vanaf de
--     stréefdatum. Zeven dagen is in dit schema al de maat voor "één week om
--     de omweg dicht te zetten" bij precies dit onderwerp: `zet_streefdatum()`
--     weigert sinds 0110 een verschuiving binnen zeven dagen na het
--     ontkoppelen. Zelfde onderwerp, zelfde maat.
--
-- ⚠️⚠️ **De tweede grens stond eerst op `r.created_at` en dat was fout — met
--    de hand nagemeten, en het is precies de fout die QS8-293 drie rondes
--    lang gemaakt heeft: een grens leggen op iets dat de aanvaller zelf kan
--    verzetten.** Een eigenaar mag zijn eigen verzoek intrekken
--    (`trek_deadline_verzoek_in()`, 0034) en meteen een nieuw indienen; dat
--    heeft niemands akkoord nodig en `vraag_deadline_verschuiving()` staat vijf
--    verzoeken per dag toe. Eén vernieuwing per week is genoeg. Gemeten als
--    gewone `authenticated`-gebruiker, in één transactie, op een doel waarvan
--    de streefdatum zestig dagen geleden lag:
--
--      A eerste verzoek       | ok: true
--      B rollover na 60 dagen | 1            -- de grens deed zijn werk
--      C status               | due
--      D intrekken            | ok: true     -- door Alice zelf
--      E nieuw verzoek        | ok: true     -- door Alice zelf
--      F rollover opnieuw     | 0            -- en de straf staat weer stil
--      G status               | set
--
--    `goals.target_date` heeft die zwakte niet. 📏 Gemeten in
--    `information_schema.column_privileges`: de kolom staat wél in de
--    INSERT-grant van `authenticated` (een doel wordt met een datum
--    aangemaakt, sinds 0170 begrensd op `>= mijn_datum()`) en **niet** in de
--    UPDATE-grant. Hij beweegt dus alleen via `zet_streefdatum()` — die
--    weigert zodra het doel aan een groep hangt — of via
--    `beslis_deadline_verzoek()`, en dat vraagt het akkoord van een buddy.
--    Precies de eigenschap die deze grens nodig heeft.
--
-- ⚠️ Eén route blijft open en is niet van dit issue: een doel loskoppelen en na
--    de zeven dagen van 0110 zelf een nieuwe streefdatum zetten. Dat kost een
--    volle week zonder groep en bestond al vóór deze migratie.
--
-- ⚠️ **Wat hier níét in zit, en dat is met opzet.** Wordt een verzoek ná die
--    week alsnog goedgekeurd, dan staat de straf al op `due` en zet
--    `beslis_deadline_verzoek()` hem niet terug — dat kan ook niet langs
--    `commitments_update`, want die heeft `using (status = 'set' …)`. Dat is
--    een andere reparatie in een andere functie, met een eigen vraag over het
--    auditspoor en over de melding die al verstuurd is. Het staat als QS8-308.
--
-- ---------------------------------------------------------------------------
-- Ronde 2 — een afwijzing bleef nergens aan hangen
-- ---------------------------------------------------------------------------
--
-- De security-ronde op deze migratie mat drie routes na. De eerste is de
-- `created_at`-grens hierboven, en die is vervangen. De tweede staat hier.
--
-- Gemeten, als gewone gebruikers, op een doel waarvan de streefdatum twee
-- dagen over tijd was:
--
--   D1 alice vraagt         | ok: true
--   D2 bob wijst af         | ok: true, moved: false
--   D3 alice vraagt opnieuw | ok: true
--   D4 rollover             | 0
--   D5 straf                | set
--
-- De groep doet precies wat de bedoeling is — afwijzen — en houdt er niets aan
-- over, want er staat weer een open verzoek. Vandaar de derde conjunct.
--
-- ⚠️ **De derde route is bewust niet in deze migratie gerepareerd.** Een doel
--    mag aan meerdere groepen hangen, en `vraag_deadline_verschuiving()` eist
--    alleen lidmaatschap van de groep waarin je het verzoek indient — niet dat
--    díe groep iets met de inzet te maken heeft. Een eigenaar kan het verzoek
--    dus in een groep van één indienen, waar de begunstigde het niet ziet en
--    niet kan afwijzen. De grens hierboven kapt dat af op een week, maar binnen
--    die week is het schild onzichtbaar voor precies de partij die het zou
--    moeten kunnen wegnemen. De begunstigde is bovendien niet altijd een groep
--    (`beneficiary_user_id`), dus "de groep die de inzet houdt" is niet in alle
--    gevallen gedefinieerd — dat is een ontwerpvraag en geen conjunct. Het
--    staat als QS8-309.
--
-- ---------------------------------------------------------------------------
--
-- ⚠️ Voor de eerste `not exists` is geen index nodig:
--    `deadline_requests_een_open_per_doel` (0032) is een partiële unieke index
--    op `goal_id where status = 'open'` en bedient hem precies. Diezelfde index
--    garandeert bovendien dat er hooguit één open verzoek per doel is. Voor de
--    afwijzingen bestond zo'n index niet; die staat hieronder (onwrikbare
--    regel 11).
--
-- ---------------------------------------------------------------------------

create or replace function maak_straffen_verschuldigd(p_owner_id uuid, p_vandaag date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
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
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     and g.status <> 'completed'
     and g.target_date < p_vandaag
     -- ⚠️ **Serverklok, en met opzet niet `p_vandaag`.** Een straf die je
     --    vastlegt, gaat nooit binnen een dag af. Dat sluit de tz-route uit de
     --    kop van 0171 uit (de aanvaller moet weer een echte dag wachten) en
     --    het is de belofte die domeinregel 5 hier hoort te geven: er zit
     --    altijd een nacht tussen het vastleggen en het afgaan.
     and c.created_at < now() - interval '24 hours'
     -- ⚠️ **En niet zolang de groep er nog over gaat** (QS8-307). Een verzoek
     --    houdt de straf tegen zolang het alle drie de voorwaarden hieronder
     --    haalt; elk van die drie sluit een andere manier af om er eindeloos
     --    onder uit te komen. Zie de kop voor de metingen.
     and not exists (
       select 1
       from deadline_requests r
       where r.goal_id = g.id
         and r.status = 'open'
         and r.new_date >= p_vandaag
         -- ⚠️ **De grens op het uitstel hangt aan de streefdatum en niet aan
         --    het verzoek.** Zie de kop: een eigenaar trekt zijn eigen verzoek
         --    in en dient meteen een nieuw in, dus een grens op
         --    `deadline_requests` verzet hij zelf. `goals.target_date` staat
         --    niet in de UPDATE-grant van `authenticated` en beweegt alleen
         --    met het akkoord van een buddy.
         --
         -- ⚠️ **Bínnen de `not exists` en niet ernaast**, en dat is geen
         --    stijlkeuze: ernaast zou het een voorwaarde op élke straf zijn en
         --    zou een deadline die langer dan een week voorbij is nooit meer
         --    tot een straf leiden — ook zonder dat er ooit een verzoek was.
         --    Hier zegt hij wat hij hoort te zeggen: het verzoek houdt de
         --    straf tegen zolang de deadline nog geen week voorbij is.
         and g.target_date > p_vandaag - 7
         -- ⚠️ **En een "nee" van de groep blijft een nee** (QS8-307, tweede
         --    security-ronde). Zonder deze voorwaarde dient de eigenaar na een
         --    afwijzing meteen een nieuw verzoek in en staat de straf weer
         --    stil: de groep doet precies wat de bedoeling is en houdt er
         --    niets aan over. Gemeten — zie de kop.
         --
         -- ⚠️ **Bínnen deze `not exists` en niet ernaast.** Ernaast is hij een
         --    tweede blokkade in plaats van een grens op de eerste, en dan
         --    houdt het níeuwe open verzoek de straf gewoon tegen — de
         --    afwijzing verandert dan niets. Met de hand gemeten: de test bleef
         --    op `set` staan waar hij `due` hoorde te zien.
         --
         -- ⚠️ **Op `old_date` en niet op een tijdstip**, want dat is exact en
         --    klokloos. `old_date` is bij het indienen gekopieerd uit
         --    `goals.target_date`, dus een afwijzing met
         --    `old_date = g.target_date` is een afwijzing van déze deadline.
         --    Wordt er later wél een verschuiving goedgekeurd, dan verspringt
         --    `target_date` en telt de oude afwijzing niet meer mee — precies
         --    goed, want dan gaat het over een andere datum.
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

create index if not exists deadline_requests_afgewezen_idx
  on deadline_requests (goal_id, old_date)
  where status = 'rejected';

revoke all on function maak_straffen_verschuldigd(uuid, date) from public, anon, authenticated;
