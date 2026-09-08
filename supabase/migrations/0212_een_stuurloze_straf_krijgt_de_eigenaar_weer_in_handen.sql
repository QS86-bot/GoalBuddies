-- 0212_een_stuurloze_straf_krijgt_de_eigenaar_weer_in_handen.sql — een
-- verschuldigde straf waarvan de getuige zijn account verwijderde, is weer te
-- bedienen: een nieuwe getuige aanwijzen of hem afwikkelen (QS8-333, besluit van
-- Quinten 08-09-2026).
--
-- ROLLBACK-PAD:
--   drop function if exists public.herstel_stuurloze_straf(uuid, text, uuid, boolean);
--   Verder niets: geen kolom, geen policy, geen bestaande functie gewijzigd. De
--   rijen die de RPC intussen geschreven heeft blijven staan — `commitment_events`
--   is append-only (domeinregel 6) en een terugdraai wist geen geschiedenis.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Straf op `due` met een persoon als getuige; die getuige verwijdert zijn
--    account:
--
--      vooraf:   status=due   getuige=<carol>
--      verwijder_mijn_account (getuige): {"ok": true}
--      na:       status=due   getuige=NULL
--      rijen die de eigenaar daarna mag bijwerken: 0
--
--    Die laatste regel is de kern. Het is geen "lastig te bereiken" maar **nul**:
--    de rij bestaat, is in werking, en buiten `service_role` raakt niemand hem
--    nog aan. Drie dingen grijpen in elkaar — de foreign key is
--    `on delete set null`, `bewaak_begunstigde()` laat leeghalen toe zodra het
--    profiel weg is, en `commitments_update.using` is `status = 'set' and
--    eigenaar`.
--
-- ---------------------------------------------------------------------------
-- Waarom een RPC en geen ruimere policy
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Het issue stelt voor `commitments_update.using` te verruimen. Dat is
--    gebouwd en gemeten, en het doet precies het verkeerde.** Met alleen die
--    verruiming, als eigenaar:
--
--      A. een nieuwe getuige aanwijzen     GEWEIGERD  permission denied
--      B. zijn eigen due-straf annuleren   GELUKT     status=cancelled
--      C. hem afwikkelen naar 'resolved'   GEWEIGERD  policy violation
--
--    📏 De kolomgrant is `grant update (body, image_url, status)` — 
--    `beneficiary_user_id` staat er niet in, dus geen policy ter wereld laat een
--    client een getuige aanwijzen; dat is "RLS kan geen kolommen beperken" uit
--    domeinregel 7, in de omgekeerde richting. En `with_check` laat alleen
--    `set`/`cancelled` door, dus `resolved` is voor elke client onbereikbaar.
--    📏 Sterker: géén enkele functie in `public` schrijft `resolved` — de stand
--    staat in de CHECK en in `commitment_zichtbaar_voor_*()`, en er was geen pad
--    heen.
--
--    Netto levert de verruiming één nieuwe bevoegdheid op: de eigenaar mag zijn
--    eigen verschuldigde straf annuleren. Dat is het bezwaar waarop richting 2
--    sneuvelde, met de slechtst denkbare hand aan de knop.
--
-- ⚠️ **Een kolomgrant op `beneficiary_user_id` is daarom geen alternatief.** Die
--    geldt voor élke update van elke ingelogde gebruiker. Wat vandaag dicht zit —
--    niemand wisselt ooit stil een getuige om — zou dan openstaan voor álle
--    commitments, met alleen nog een policy ervoor. Eén slot waar er nu twee zijn.
--    Een `security definer`-functie houdt de grant dicht en opent één deur.
--
-- ⚠️ **Richting 4 (de groep neemt het over) is afgevallen op een meting.**
--    `goal_group_links` heeft `primary key (goal_id, group_id)`: een doel kan aan
--    méér dan één groep hangen, en `goals` heeft zelf geen groepskolom. Er is dus
--    geen "de groep" om op terug te vallen — er is een lijst, en welke ervan de
--    straf erft is een nieuw besluit. Regel 18 vraag 6 in zuivere vorm.
--
-- ---------------------------------------------------------------------------
-- Wat deze functie wél en niet mag
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Afwikkelen zit erin, en dat is Quintens keuze en niet mijn voorstel.** Ik
--    stelde voor om alleen een nieuwe getuige te laten aanwijzen: zonder getuige
--    is "ik heb hem afgewikkeld" een verklaring van de gestrafte over zichzelf,
--    en dat is geen commitment device meer. Quinten koos op 08-09-2026 voor
--    allebei. Het bezwaar staat in
--    `docs/decisions/2026-09-08-wat-een-straf-overleeft.md` §3; het besluit staat
--    hier in de code.
--
--    Daarom draagt afwikkelen wél een expliciete bevestiging (`p_bevestigd`),
--    net als `archiveer_groep()` en `zet_groepszichtbaarheid()`: domeinregel 5
--    zegt dat een commitment device nooit stilzwijgend uitgaat, en dit ís het
--    uitgaan ervan.
--
-- ⚠️ **De poort is `beneficiary_user_id is null and beneficiary_group_id is
--    null`, en niet "de getuige bestaat niet meer".** Die twee vallen samen,
--    want `bewaak_begunstigde()` laat de kolom alléén leeg worden als het profiel
--    weg is en niemand kan hem leeg schrijven. De toets op de lege kolom is
--    daarmee de toets op de verdwenen getuige, en hij is niet te omzeilen door
--    er zelf een te maken.
--
-- ⚠️ **`status = 'due'` en niets anders.** Een straf op `set` is nog gewoon in te
--    trekken en opnieuw aan te maken (QS8-312, §2 van
--    `tests/rls/getuige-blijft.test.ts` legt dat als must-allow vast). Deze functie
--    is er alleen voor de toestand waarin dat níet meer kan.
--
-- ⚠️⚠️ **Dit vernauwt een belofte die onder test staat.** De kop van
--    `tests/rls/getuige-blijft.test.ts` zei: *een straf die in werking is,
--    verandert niet meer van getuige, niet van eigenaar, en verdwijnt niet.* Die
--    zin klopt na deze migratie niet meer zonder uitzondering. De test bleef
--    groen — hij voert de directe tabelupdate, en die is nog steeds dicht — dus
--    dit is precies het geval waarvoor regel 18 waarschuwt: de belofte verschuift
--    en de test merkt het niet. De kop is daar bijgewerkt en er staat een test
--    bij die de nieuwe grens vastlegt.

create or replace function public.herstel_stuurloze_straf(
  p_commitment_id uuid,
  p_actie         text,
  p_getuige       uuid    default null,
  p_bevestigd     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c        commitments%rowtype;
  v_eigenaar uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if p_actie is null or p_actie not in ('nieuwe_getuige', 'afwikkelen') then
    return jsonb_build_object('ok', false, 'reason', 'onbekende_actie');
  end if;

  select * into c from commitments where id = p_commitment_id;
  if c.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select g.owner_id into v_eigenaar from goals g where g.id = c.goal_id;
  if v_eigenaar is null or v_eigenaar <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if c.type <> 'penalty' then
    return jsonb_build_object('ok', false, 'reason', 'geen_straf');
  end if;

  if c.status <> 'due' then
    return jsonb_build_object('ok', false, 'reason', 'niet_verschuldigd');
  end if;

  -- ⚠️ Zie de kop: leeg betekent hier verdwenen, want leeg schrijven kan niemand.
  if c.beneficiary_user_id is not null or c.beneficiary_group_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'heeft_nog_een_begunstigde');
  end if;

  if p_actie = 'nieuwe_getuige' then
    if p_getuige is null then
      return jsonb_build_object('ok', false, 'reason', 'getuige_ontbreekt');
    end if;

    if p_getuige = v_eigenaar then
      return jsonb_build_object('ok', false, 'reason', 'niet_jezelf');
    end if;

    -- `shares_group_with_user()` leest `auth.uid()`, en dat is hier de eigenaar.
    -- Dezelfde eis als `commitments_insert` stelt bij het aanmaken.
    if not shares_group_with_user(p_getuige) then
      return jsonb_build_object('ok', false, 'reason', 'geen_groepsgenoot');
    end if;

    update commitments
       set beneficiary_user_id = p_getuige
     where id = p_commitment_id;

    -- ⚠️ **Een tweede rij naast die van de trigger, en met opzet.**
    --    `noteer_commitment()` schrijft bij een wijziging zonder statuswissel een
    --    `edited`-rij, en die zegt niet wát er veranderde. Domeinregel 5 vraagt
    --    dat een commitment device auditeerbaar is; "er is iets bewerkt" is dat
    --    niet. Deze rij noemt de reden en de nieuwe getuige. De trigger blijft
    --    ongemoeid — die staat op de branch van QS8-361 ook onder handen, en
    --    twee migraties die hetzelfde functielichaam herschrijven geven een
    --    schone merge met een verdwenen register.
    insert into commitment_events (commitment_id, actor_id, event_type, payload)
    values (
      p_commitment_id,
      auth.uid(),
      'edited',
      jsonb_build_object(
        'reden',          'getuige_verdwenen',
        'nieuwe_getuige', p_getuige
      )
    );

    return jsonb_build_object('ok', true, 'actie', 'nieuwe_getuige');
  end if;

  -- p_actie = 'afwikkelen'
  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'niet_bevestigd');
  end if;

  update commitments
     set status = 'resolved'
   where id = p_commitment_id;

  -- Hier schrijft `noteer_commitment()` zelf een `resolved`-rij met `van` en
  -- `naar`, en die is volledig: de statuswissel ís de gebeurtenis.
  return jsonb_build_object('ok', true, 'actie', 'afwikkelen');
end;
$$;

-- ⚠️ De vorm uit onwrikbare regel 4: `authenticated` staat er met zoveel woorden
--    in het `revoke`, want anders houdt de default privilege van Supabase precies
--    de rol over waaronder iedere ingelogde gebruiker draait.
revoke all on function public.herstel_stuurloze_straf(uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.herstel_stuurloze_straf(uuid, text, uuid, boolean)
  to authenticated;

comment on function public.herstel_stuurloze_straf(uuid, text, uuid, boolean) is
  'Geeft de eigenaar een verschuldigde straf terug in handen zodra de getuige '
  'zijn account verwijderd heeft: een nieuwe getuige aanwijzen of afwikkelen. '
  'QS8-333, besluit van Quinten 08-09-2026.';
