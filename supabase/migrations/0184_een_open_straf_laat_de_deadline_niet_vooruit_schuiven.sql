-- 0184_een_open_straf_laat_de_deadline_niet_vooruit_schuiven.sql — een straf die je zelf eindeloos vooruit kon schuiven (QS8-317)
--
-- ROLLBACK-PAD:
--   Beide functies terugzetten uit hun vorige definitie:
--     `zet_streefdatum(uuid, date)`        uit 0170 (r.154)
--     `maak_straffen_verschuldigd(uuid, date)` uit 0175 (r.202)
--   Allebei `create or replace` zonder handtekeningwijziging, dus er hoeven
--   geen grants opnieuw uitgedeeld te worden. Niets aan gegevens verandert:
--   deze migratie schrijft geen enkele rij.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- Domeinregel 11 zegt: een straf treedt in werking bij een verstreken deadline.
-- `maak_straffen_verschuldigd()` toetst daarvoor uitsluitend
-- `g.target_date < p_vandaag`. Die belofte houdt alleen stand als de gestrafte
-- zijn eigen deadline niet kan verzetten, en dat kon hij.
--
-- 📏 **Gemeten op de lokale stack, end-to-end, als `authenticated` met echte
-- claims** — niet uit de bestanden gelezen:
--
--   basislijn                     straf gaat af      job telt 1, status `due`
--   eigenaar verzet zijn deadline `{"ok": true}`     30 dagen vooruit
--   daarna dezelfde job           gaat niet af       job telt 0, status `set`
--
-- Herhaalbaar zonder bovengrens. En onzichtbaar: `commitment_zichtbaar_voor_
-- groep()` geeft `unlocked/due/resolved`, dus een straf op `set` ziet de
-- begunstigde niet — hij weet niet dát er een straf staat, laat staan dat de
-- datum opschoof. Het `deadline_moved`-event dat `zet_streefdatum()` wél
-- schrijft, hangt aan `shares_group_with_goal()` en is bij een ongekoppeld doel
-- voor niemand anders leesbaar.
--
-- ⚠️ **De weg erheen is geen misbruik maar de gewone knop.** `zet_streefdatum()`
-- weigert bij een gekoppeld doel met `needs_group_approval` (A7, 0110). Bij een
-- ongekoppeld doel weigert hij niets — en een straf kán op een ongekoppeld doel
-- staan, want `commitments_insert` eist een begunstigde waar de **eigenaar** lid
-- van is, niet een groep waar het **doel** aan hangt.
--
-- ---------------------------------------------------------------------------
-- De keuze: weigeren, en alleen vooruit
-- ---------------------------------------------------------------------------
--
-- Drie vormen stonden in het issue. Deze migratie bouwt de conservatiefste:
-- `zet_streefdatum()` weigert, met een eigen reden. De andere twee — de straf
-- een eigen `due_date` geven, of het verschuiven zichtbaar maken voor de
-- begunstigde — veranderen wát er aan de gebruiker beloofd is en vallen onder
-- grens 1 van de beslisbevoegdheid. Die blijven in QS8-317 staan.
--
-- ⚠️ **Alleen vooruit, en dat is geen detail.** Een deadline naar vóren halen
-- maakt de straf eerder verschuldigd; dat is het tegenovergestelde van een
-- ontsnapping en er is geen reden om het te blokkeren. De grens loopt dus op
-- `p_date > g.target_date` en niet op "er is een straf".
--
-- ⚠️ **Alleen `status = 'set'`.** Dat is de enige stand die
-- `maak_straffen_verschuldigd()` nog kan omzetten. Een straf die al `due` is,
-- gaat door het verschuiven niet terug — alleen `beslis_deadline_verzoek()` zet
-- hem terug (0177), en dat vraagt het akkoord van een buddy. Blokkeren op `due`
-- zou iemand die zijn straf al gehad heeft beletten opnieuw te plannen.
--
-- ⚠️ **De tak staat ná `needs_group_approval`.** Bij een gekoppeld doel hoort de
-- gebruiker "vraag het je groep" te lezen en niet "er staat een straf open" —
-- die eerste route bestaat en de tweede is voor hem doodlopend.
--
-- ---------------------------------------------------------------------------
-- Rechten
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen drop, dus geen nieuwe rechten.** Beide functies houden hun
-- handtekening; `create or replace` laat de bestaande grants staan en draait
-- `alter default privileges` niet opnieuw af. Dat is met opzet de veilige vorm
-- hier — de sessie hiervoor (QS8-147) liet zien dat een drop-en-opnieuw
-- `service_role` er stil bij geeft. De rechten zijn vóór en ná gemeten en
-- staan in het beslisdocument.

create or replace function public.zet_streefdatum(p_goal_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  g goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if p_date is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  -- ⚠️ **Een streefdatum begint niet in het verleden** (QS8-293). `mijn_datum()`
  --    en niet `current_date`: de grens is de dag van de gebruiker en niet die
  --    van de server, anders wordt iemand op UTC-10 geweigerd op zijn eigen
  --    vandaag.
  if p_date < mijn_datum() then
    return jsonb_build_object('ok', false, 'reason', 'datum_in_verleden');
  end if;

  -- ⚠️ Gekoppeld aan een groep? Dan loopt het via een verzoek. Dit is het punt
  --    waar het besluit van A7 wordt afgedwongen, en het is geen UI-regel.
  if exists (select 1 from goal_group_links l where l.goal_id = p_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'needs_group_approval');
  end if;

  -- ⚠️ En dit is de tak die de omweg dichtzet. Zonder haar is de regel hierboven
  --    een momentopname, en drie verzoeken zijn genoeg om er langs te lopen.
  --    Zie de kop: gemeten, niet vermoed.
  if g.losgekoppeld_op is not null and g.losgekoppeld_op > now() - interval '7 days' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'recent_ontkoppeld',
      'weer_toegestaan_op', (g.losgekoppeld_op + interval '7 days')
    );
  end if;

  -- ⚠️⚠️ **Een openstaande straf laat de deadline niet vooruit schuiven**
  --    (QS8-317). Zonder deze tak toetst `maak_straffen_verschuldigd()` een
  --    datum die de gestrafte zelf zet, en dan is domeinregel 11 leeg.
  --
  --    `p_date > g.target_date` en niet "er staat een straf": naar vóren halen
  --    maakt de straf eerder verschuldigd en is dus nooit een ontsnapping.
  --    `status = 'set'` en niet elke straf: alleen die stand kan de job nog
  --    omzetten, en vanaf `due` zet alleen een buddy hem terug (0177).
  --
  --    ⚠️ Ná `needs_group_approval`, want bij een gekoppeld doel bestaat de
  --    route via `vraag_deadline_verschuiving()` wél en hoort de gebruiker
  --    díé te lezen.
  if p_date > g.target_date and exists (
    select 1 from commitments c
    where c.goal_id = p_goal_id
      and c.type    = 'penalty'
      and c.status  = 'set'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'straf_staat_open');
  end if;

  if p_date = g.target_date then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;

  update goals set target_date = p_date where id = p_goal_id;

  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value)
  values (p_goal_id, auth.uid(), 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', p_date));

  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

comment on function public.zet_streefdatum(uuid, date) is
  'Zet de streefdatum van een eigen, ongekoppeld doel. Weigert bij een gekoppeld '
  'doel (A7), binnen zeven dagen na ontkoppelen (0110), bij een datum in het '
  'verleden (0170) en — sinds 0184, QS8-317 — bij het vooruit schuiven van een '
  'doel met een openstaande straf.';

-- ---------------------------------------------------------------------------
-- En de zin die niet klopte
-- ---------------------------------------------------------------------------
--
-- ⚠️ Ongewijzigd van gedrag; alleen het commentaar in de `not exists` is
--    gecorrigeerd. Het stond er als bewijsstuk waarop een volgende lezer leunt,
--    en het beweerde precies de eigenschap die deze migratie pas waar maakt.

create or replace function public.maak_straffen_verschuldigd(p_owner_id uuid, p_vandaag date)
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
         -- ⚠️ **Is er nog iemand die dit verzoek kán beslissen?** (QS8-309)
         --    `beslis_deadline_verzoek()` weigert de aanvrager, dus in een
         --    groep waar hij het enige actieve lid is kan niemand ja zeggen —
         --    het verzoek kan alleen verlopen, en tot die tijd is het een
         --    schild dat niemand kan wegnemen.
         --
         -- ⚠️ **Ook hier en niet alleen bij het indienen**, want de toestand
         --    verandert ertussen: een groep kan één lid worden nádat het
         --    verzoek is ingediend. Deze tak dekt dat én de rijen die vóór
         --    0175 zijn aangemaakt. Regel 18 vraag 1 — twee correcte
         --    onderdelen, en de naad ertussen.
         --
         -- ⚠️ `<> r.requester_id` en niet `<> auth.uid()`: de rollover draait
         --    onder `service_role`. En `<> 'inactive'` en niet `= 'active'`,
         --    want dat is precies wat `beslis_deadline_verzoek()` toetst.
         and exists (
           select 1
           from group_members m
           where m.group_id = r.group_id
             and m.user_id <> r.requester_id
             and m.status <> 'inactive'
         )
         -- ⚠️ **De grens op het uitstel hangt aan de streefdatum en niet aan
         --    het verzoek.** Zie de kop: een eigenaar trekt zijn eigen verzoek
         --    in en dient meteen een nieuw in, dus een grens op
         --    `deadline_requests` verzet hij zelf.
         --
         -- ⚠️⚠️ **Hier stond dat `goals.target_date` "alleen met het akkoord
         --    van een buddy" beweegt, en dat was onwaar** (QS8-317). De kolom
         --    staat inderdaad niet in de UPDATE-grant van `authenticated`, maar
         --    `zet_streefdatum()` is een definer-RPC die `authenticated` mag
         --    aanroepen, en die weigerde alleen bij een gekoppeld doel. Een
         --    doel zónder groepskoppeling kan wél een straf dragen — de
         --    begunstigde is een groep waar de eigenaar lid van is, niet een
         --    groep waar het doel aan hangt — en de eigenaar schoof zijn eigen
         --    verschuldigd-worden dus onbeperkt vooruit. 📏 Gemeten: straf op
         --    `set`, deadline 30 dagen vooruit, job telt 0.
         --
         --    Sinds 0184 klopt de zin wél, en scherper: een doel met een
         --    openstaande straf laat zijn deadline niet **vooruit** schuiven
         --    zonder buddy. Achteruit mag altijd — dat maakt de straf eerder
         --    verschuldigd en is dus geen ontsnapping.
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
