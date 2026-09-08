-- 0194_een_globale_job_krijgt_een_optionele_grens.sql — drie jobs schreven over
-- élke groep, ongeacht wie ze aanriep (QS8-339)
--
-- ROLLBACK-PAD:
--   drop function if exists public.maak_seizoensrecaps(timestamptz, uuid[]);
--   drop function if exists public.slaap_stille_groepen(integer, uuid[]);
--   drop function if exists public.keur_vastgelopen_goedkeuringen_goed(integer, uuid[]);
--   en de drie terugzetten uit hun laatste definitie vóór deze migratie:
--   `maak_seizoensrecaps()` uit 0158, `slaap_stille_groepen()` uit 0016 en
--   `keur_vastgelopen_goedkeuringen_goed()` uit 0147 — **maar voor die laatste
--   óók 0135**: 0147 draagt alleen de `revoke`, terwijl de
--   `grant execute … to service_role` en de `comment` in 0135 staan. Wie alleen
--   0147 terugzet, houdt een functie over die `service_role` via de default
--   privileges mag aanroepen in plaats van via een besloten grant — precies de
--   klasse die onwrikbare regel 4 wil uitsluiten. 📏 Het pad is letterlijk
--   uitgevoerd op een herbouwde main-database; zonder 0135 komt hij terug als
--   `svc=t auth=f <GEEN COMMENT>`.
--
--   ⚠️ 📏 Per functie nageteld met
--   `grep -ln 'function \(public\.\)\?<naam>(' supabase/migrations/*.sql | grep -v 0194 | tail -1`
--   en niet uit het hoofd — bij 0192 stond hier twee keer een verkeerd nummer
--   mét een meetmarkering ervoor, en dat is precies de fout die een rollback
--   onbruikbaar maakt op het moment dat je hem nodig hebt.
--
--   ⚠️⚠️ **Let op de `public.`-prefix in dat recept, en dat is een gerepareerde
--   valse uitslag.** Hier stond eerst `create or replace function public.<naam>`,
--   en dat geeft voor `slaap_stille_groepen` **nul** treffers: 0016 schrijft hem
--   zonder schemaprefix. Wie het recept naspeelde, concludeerde "geen eerdere
--   definitie" — een recept dat zijn eigen antwoord mist, is erger dan geen
--   recept. De drie antwoorden hierboven kloppen wél; ze zijn met de ruimere
--   vorm nagemeten.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten met `pg_get_functiondef()` — de waarheid, niet de migratiebestanden:
--
--     maak_seizoensrecaps(p_op)              -> for g in select … from groups gr
--                                                 where gr.status <> 'archived'
--     slaap_stille_groepen(p_dagen)          -> for r in select id from groups
--                                                 where status = 'active'
--     keur_vastgelopen_goedkeuringen_goed(p) -> for v_rij in select * from
--                                                 vastgelopen_goedkeuringen()
--
-- Alle drie dragen wél een parameter, en alle drie is dat een **drempel** en
-- geen **bereik**: een moment, een ouderdom, een termijn. Geen van de drie laat
-- de aanroeper zeggen wáárover hij mag schrijven.
--
-- ⚠️ In productie is dat precies de bedoeling — de rollover hóórt over alle
--    groepen te lopen. In een gedeelde testdatabase is het een `update` zonder
--    `where` op eigenaar: draaien er twee suites tegelijk, dan maakt de job van
--    run A recaps in de groepen van run B.
--
-- 📏 Gemeten bij QS8-336: nadat élke gedeelde identiteit uit de fixtures weg
--    was, gaf run B 105/105 groen en run A drie rode tests in
--    `seizoensrecap.test.ts` — tellingen die te hoog of te laag uitkwamen. Dat
--    is de handtekening van een schrijver die buiten zijn eigen fixture kleurt,
--    niet van een botsende sleutel.
--
-- ---------------------------------------------------------------------------
-- Het zijn er drie en niet één
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het issue noemde `maak_seizoensrecaps()`. 📏 Nageteld tegen de lijst in
--    `tests/rls/nevenschade.test.ts`: van de vijf globale schrijvers die daar
--    staan, hebben er twee inmiddels een bereik (`herstel_weekdoelstatus()` en
--    `weekdoelstatus_afwijkingen()`, allebei `p_goal_id` sinds 0137) en missen
--    de andere **drie** het nog. Alleen dit geval repareren zou de volgende
--    ronde precies dezelfde meting opleveren op een andere functie.
--
-- ⚠️ **Wat er níét bij hoort en waarom.** De parameterloze functies die ook
--    schrijven, zijn op één na allemaal triggerfuncties: die draaien per rij en
--    zijn dus door de rij zelf begrensd. De uitzondering is
--    `verwijder_mijn_account()`, en die is begrensd door `auth.uid()`.
--
--    ⚠️ **Hier stond "de 21 functies", en dat getal reproduceert onder geen
--    enkele telwijze** — 12, 18 of 36 naargelang je commentaar meetelt en hoe
--    ruim je "schrijft" leest. De conclusie is wél nagemeten en verandert niet:
--    onder de strikte telling is `verwijder_mijn_account()` de enige
--    niet-trigger parameterloze schrijver. Een getal dat niemand kan naspelen
--    hoort er niet te staan; de eigenschap wel.
--
-- ---------------------------------------------------------------------------
-- De vorm: optioneel, en standaard precies wat er nu gebeurt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`default null` betekent "geen grens", en dat is met opzet de standaard.**
--    De aanroepers in `supabase/functions/rollover/index.ts` veranderen dus geen
--    letter — `db.rpc('maak_seizoensrecaps')` roept hem nog steeds zonder
--    argumenten aan en krijgt hetzelfde gedrag. Zelfde vorm als 0137 bij
--    `herstel_weekdoelstatus()`.
--
-- ⚠️ **Een `drop` en geen `create or replace`, en dat kan niet anders:** een
--    parameter toevoegen maakt een andere functie-handtekening, en `or replace`
--    zou er een overload naast zetten in plaats van de bestaande te vervangen.
--    Dan bestaan beide vormen en kiest Postgres er per aanroep één — precies het
--    geval waar de drop-uitzondering in CLAUDE.md over gaat.
--
-- ⚠️ **De lichamen hieronder zijn niet overgetypt maar afgeleid uit
--    `pg_get_functiondef()`**, met per functie één toegevoegde regel. Overtypen
--    is hoe een migratie stilletjes gedrag verandert dat niemand bedoeld heeft;
--    de toegevoegde regel is in elk geval hieronder de énige inhoudelijke
--    wijziging.

drop function if exists public.maak_seizoensrecaps(timestamptz);
drop function if exists public.slaap_stille_groepen(integer);
drop function if exists public.keur_vastgelopen_goedkeuringen_goed(integer);

CREATE OR REPLACE FUNCTION public.maak_seizoensrecaps(p_op timestamp with time zone DEFAULT now(), p_group_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  g        record;
  grens    record;
  cijfers  record;
  gemaakt  integer := 0;
  stil     integer := 0;
  mislukt  integer := 0;
  fouten   jsonb   := '[]'::jsonb;
  gezet    integer;
  voor     integer;
  na       integer;
begin
  -- ⚠️ Alleen `service_role`. Deze functie plaatst berichten in groepschats;
  --    een ingelogde gebruiker die hem kan aanroepen, kan de hele boel laten
  --    afgaan wanneer het hem uitkomt.
  if current_setting('request.jwt.claim.role', true) is not null
     and current_setting('request.jwt.claim.role', true) <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  for g in
    select gr.id, gr.tz, gr.season_cadence
    from groups gr
    where gr.status <> 'archived'
      and (p_group_ids is null or gr.id = any (p_group_ids))
  loop
    -- ⚠️ Alles van één groep in één blok — QS8-171. Wat hierbinnen stukgaat,
    --    kost deze groep zijn recap en verder niemand iets.
    begin
      select * into grens
      from seizoensgrens(g.tz, g.season_cadence, p_op);

      -- ⚠️ **Precies op de eerste dag van het nieuwe seizoen, om 08:00 lokaal.**
      --    Dat is acceptatiecriterium 3, en het is bewust strak: de rollover draait
      --    elk uur, dus zonder deze twee toetsen zou de recap op het moment van de
      --    kalenderomslag komen — middenin de nacht.
      continue when not (grens.is_eerste_dag and grens.is_acht_uur);

      continue when exists (
        select 1 from season_recaps r
        where r.group_id = g.id and r.season_start = grens.season_start
      );

      select * into cijfers
      from seizoensrecap_cijfers(g.id, grens.season_start, grens.season_end);

      -- ⚠️ Een recap van nul is een tegenslagbericht met een vrolijke kop erop.
      --    In een stille groep zwijgt hij; zie punt 3 in de kop van 0112.
      if coalesce(cijfers.weken, 0) = 0
         and coalesce(cijfers.mijlpalen, 0) = 0
         and coalesce(cijfers.schakels, 0) = 0 then
        stil := stil + 1;
        continue;
      end if;

      insert into season_recaps (group_id, season_start, season_end, weken, mijlpalen, schakels)
      values (g.id, grens.season_start, grens.season_end,
              cijfers.weken, cijfers.mijlpalen, cijfers.schakels)
      on conflict do nothing
      returning 1 into gezet;

      -- ⚠️ Landde de rij niet, dan was een andere aanroep ons voor en heeft die
      --    het bericht al geplaatst. Doorgaan zou de tweede recap posten.
      continue when gezet is null;

      select count(*) into voor
      from chat_messages
      where group_id = g.id and system_event = 'season_recap';

      perform plaats_systeembericht(
        g.id,
        'season_recap',
        -- ⚠️ Noodterugval, precies zoals 0059 het bedoelde: de app maakt de zin uit
        --    `system_event` plus de payload. Deze tekst is alleen voor een client
        --    die de gebeurtenis nog niet kent.
        'Het seizoen zit erop.',
        null,
        null,
        jsonb_build_object(
          'weken', cijfers.weken,
          'mijlpalen', cijfers.mijlpalen,
          'schakels', cijfers.schakels
        )
      );

      -- ⚠️ **`plaats_systeembericht()` eet zijn eigen fouten op** (0059) en geeft
      --    `void` terug, dus zonder deze telling commit de rij in `season_recaps`
      --    zonder bericht en is de groep dat seizoen kwijt. Zie de kop; gemeten.
      select count(*) into na
      from chat_messages
      where group_id = g.id and system_event = 'season_recap';

      if na = voor then
        raise exception 'season_recap voor groep % is niet in de chat beland', g.id
          using errcode = 'P0001';
      end if;

      gemaakt := gemaakt + 1;

    exception
      -- ⚠️ Eerst, en zonder er iets mee te doen: een afbreking van buiten is
      --    geen fout van deze groep. `query_canceled` staat er niet bij omdat
      --    `others` hem sowieso niet vangt — gemeten, zie de kop.
      when admin_shutdown or crash_shutdown or cannot_connect_now then
        raise;

      when others then
        mislukt := mislukt + 1;
        fouten := fouten || jsonb_build_object('group_id', g.id, 'sqlstate', sqlstate);

        -- ⚠️ De volledige melding gaat naar het log en niet naar de teruggave —
        --    `sqlerrm` kan de waarde bevatten die de fout veroorzaakte.
        raise warning 'seizoensrecap overgeslagen voor groep %: [%] %', g.id, sqlstate, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'recaps', gemaakt,
    'stil', stil,
    -- ⚠️ Deze twee zijn de hele reden dat 0158 bestaat. Een job zonder scherm
    --    heeft alleen zijn uitvoer: wat hij niet teruggeeft, is niet gebeurd
    --    voor wie het log leest.
    'mislukt', mislukt,
    'fouten', fouten
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.slaap_stille_groepen(p_dagen integer DEFAULT 30, p_group_ids uuid[] DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n integer := 0;
  r record;
begin
  for r in
    select id from groups
    where status = 'active'
      and (p_group_ids is null or id = any (p_group_ids))
      and last_activity_at < now() - make_interval(days => greatest(1, coalesce(p_dagen, 30)))
  loop
    update groups set status = 'sleeping' where id = r.id;

    -- ⚠️ Eén bericht, over de groep en over niemand in het bijzonder. Zou hier
    --    staan wie er niet meer kwam, dan is dit precies het schaamtemoment dat
    --    domeinregel 7 verbiedt.
    insert into chat_messages (group_id, sender_id, type, system_event, body)
    values (
      r.id,
      null,
      'system',
      'group_sleeping',
      'Deze groep is een tijdje stil geweest en gaat slapen. Je krijgt hier geen '
      || 'herinneringen meer. Sluit iemand een week af, dan is hij meteen weer wakker.'
    );

    n := n + 1;
  end loop;

  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.keur_vastgelopen_goedkeuringen_goed(p_termijn_dagen integer DEFAULT 7, p_owner_ids uuid[] DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rij      record;
  v_week     weekly_goals%rowtype;
  v_voltooid completions%rowtype;
  v_punten   integer;
  v_reden    text;
  v_aantal   integer := 0;
begin
  if p_termijn_dagen is null or p_termijn_dagen < 1 then
    raise exception 'p_termijn_dagen moet minstens 1 zijn, kreeg %', p_termijn_dagen;
  end if;

  -- ⚠️ **`vastgelopen_goedkeuringen()` is de enige definitie van "vastgelopen",
  --    en dat blijft zo.** Die functie spiegelt `te_beoordelen_voor()` met
  --    dezelfde vier voorwaarden; hier een eigen variant naast zetten is precies
  --    de tweede lijst die in 0032/0034 uit elkaar liep.
  for v_rij in
    select * from vastgelopen_goedkeuringen() v
    where p_owner_ids is null or v.owner_id = any (p_owner_ids)
  loop
    -- ⚠️ **De tak van 0147, en de énige regel die hier verandert.** De rest van
    --    deze functie is woordelijk die van 0135; overtypen zou een tweede lijst
    --    maken die uiteenloopt (0032/0034). Wat de eigenaar zelf heeft gemaakt,
    --    wordt wél gemeld door `vastgelopen_goedkeuringen()` maar hier niet
    --    afgehandeld.
    continue when v_rij.beurt_bij_eigenaar;

    select * into v_voltooid from completions where id = v_rij.completion_id;

    -- De termijn loopt vanaf het indienen. Zie de kop.
    continue when v_voltooid.submitted_at is null
              or v_voltooid.submitted_at > now() - make_interval(days => p_termijn_dagen);

    select * into v_week from weekly_goals where id = v_voltooid.weekly_goal_id;

    -- ⚠️ Alleen een week die nog écht wacht. `vastgelopen_goedkeuringen()` filtert
    --    daar al op, maar tussen die query en deze regel kan een goedkeuring
    --    binnenkomen; dan hoort deze functie niets meer te doen.
    continue when v_week.status is distinct from 'pending';

    -- ⚠️ **Dezelfde redenen en dezelfde volgorde als `award_points_on_approval()`.**
    --    Twee paden naar een goedgekeurde week met verschillende gevolgen is hoe
    --    het puntenmodel stil uit elkaar loopt; wat de trigger doet, doet dit ook.
    if v_voltooid.achieved_level = 'ceiling' then
      v_punten := v_week.points_ceiling;
      v_reden  := 'completion_approved_ceiling';
    else
      v_punten := v_week.points_floor;
      v_reden  := 'completion_approved_floor';
    end if;

    update weekly_goals set status = 'approved' where id = v_week.id;

    -- ⚠️ `group_id` is `null` en dat is geen omissie: er ís geen groep meer, want
    --    dat is nu juist waarom deze week vastliep. De normale route boekt de
    --    groep van de beoordelaar; die bestaat hier per definitie niet.
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
    values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id)
    on conflict do nothing;

    perform verdien_weekpassen(v_rij.owner_id, v_week.goal_id);
    perform herbereken_reeks(v_rij.owner_id, v_week.goal_id);

    v_aantal := v_aantal + 1;
  end loop;

  return v_aantal;
end;
$function$;

-- ---------------------------------------------------------------------------
-- De rechten, opnieuw — want een `drop` neemt ze mee
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is geen formaliteit maar een gat dat deze migratie zélf sloeg.**
--    `create or replace` behoudt de bestaande grants; een `drop` gevolgd door
--    `create` niet. En omdat `alter default privileges` in Supabase élke nieuwe
--    functie in `public` uitdeelt aan `anon`, `authenticated` én `service_role`,
--    stonden alle drie na de hercreatie wagenwijd open.
--
--    📏 Gemeten vlak na het afspelen, vóór dit blok:
--
--      maak_seizoensrecaps                  anon=true auth=true service=true
--      slaap_stille_groepen                 anon=true auth=true service=true
--      keur_vastgelopen_goedkeuringen_goed  anon=true auth=true service=true
--
--    Zonder dit blok kon élke ingelogde gebruiker — en zelfs een bezoeker
--    zonder sessie — `maak_seizoensrecaps()` aanroepen en daarmee
--    systeemberichten in álle groepen laten plaatsen. Onwrikbare regel 4 bestaat
--    voor precies dit geval, en de reden dat hij "noem `authenticated` met
--    zoveel woorden" zegt is dat `from public, anon` er als "van iedereen"
--    uitziet en juist die rol overlaat.
--
-- ⚠️ De drie zijn `SECURITY DEFINER` en horen alleen door de geplande jobs
--    aangeroepen te worden. Dat is hoe ze vóór deze migratie ook stonden — zie
--    0158 regel 268-269 voor dezelfde twee regels op de oude handtekening.

revoke all on function public.maak_seizoensrecaps(timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.slaap_stille_groepen(integer, uuid[]) from public, anon, authenticated;
revoke all on function public.keur_vastgelopen_goedkeuringen_goed(integer, uuid[]) from public, anon, authenticated;

grant execute on function public.maak_seizoensrecaps(timestamptz, uuid[]) to service_role;
grant execute on function public.slaap_stille_groepen(integer, uuid[]) to service_role;
grant execute on function public.keur_vastgelopen_goedkeuringen_goed(integer, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- En het commentaar, want een `drop` neemt dát óók mee
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dezelfde val als bij de grants, één laag dieper: `pg_get_functiondef()`
--    geeft het lichaam terug maar niet de `comment on function`, dus wie een
--    functie uit die uitvoer herbouwt, verliest hem stilzwijgend. 📏 Gemeten na
--    het eerste afspelen: alle drie `<GEEN COMMENT>`, terwijl `main` er drie had.
--
-- ⚠️ **En het zijn juist de zinnen die de autorisatie-intentie uitspreken**
--    ("Alleen voor de rollover; nooit voor een client"). `functies:controle` is
--    de enige controle die commentaar met productie vergelijkt, en die stond in
--    de poort op OVERGESLAGEN wegens een ontbrekende productiesleutel — er was
--    dus niets dat dit kón melden.
--
-- De teksten hieronder zijn letterlijk die van 0158, 0016 en 0135, met alleen de
-- handtekening aangepast.

comment on function public.maak_seizoensrecaps(timestamptz, uuid[]) is
  'Plaatst één seizoensrecap per groep, op de eerste dag van het nieuwe seizoen '
  'om 08:00 in de tijdzone van de groep. Draait elk uur vanuit de rollover — QS8-79. '
  'Sinds 0158 (QS8-171) staat elke groep in een eigen blok: wat op één groepsrij '
  'stukgaat kost alleen die groep zijn recap, wordt geteld in `mislukt` en '
  'benoemd in `fouten` (group_id en sqlstate, nooit de melding zelf). '
  'Sinds 0194 (QS8-339) begrenst `p_group_ids` optioneel waarover hij mag '
  'schrijven; null is alle groepen en dat is wat de rollover meegeeft.';

comment on function public.slaap_stille_groepen(integer, uuid[]) is
  'Zet stilgevallen groepen op sleeping met één afscheidsbericht (5.9). Alleen '
  'voor het systeem: draait mee met de rollover-job. Sinds 0194 (QS8-339) '
  'begrenst `p_group_ids` optioneel waarover hij mag schrijven; null is alle '
  'groepen.';

comment on function public.keur_vastgelopen_goedkeuringen_goed(integer, uuid[]) is
  'Keurt weken goed die na de goedkeuringstermijn nog op een beoordelaar wachten '
  'die er niet meer is. Beslisdocument 001 §2.6b.3, gebouwd in QS8-178. '
  'Alleen voor de rollover; nooit voor een client. Sinds 0194 (QS8-339) begrenst '
  '`p_owner_ids` optioneel welke eigenaars hij aanraakt; null is alle eigenaars.';
