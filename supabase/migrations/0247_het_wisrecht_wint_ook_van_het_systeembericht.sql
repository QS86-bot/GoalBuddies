-- 0247_het_wisrecht_wint_ook_van_het_systeembericht.sql — wie zijn account
-- verwijdert, neemt ook de systeemberichten over zijn commitments mee (QS8-335,
-- besluit van Quinten 08-09-2026).
--
-- ROLLBACK-PAD:
--   Herstel `verwijder_mijn_account()` uit **0102** — zonder het blok dat
--   `chat_messages` opruimt. Verder verandert er niets: geen kolom, geen policy,
--   geen constraint.
--   ⚠️ **Wat er al gewist is, komt daarmee niet terug.** Dit is de enige migratie
--   van deze reeks waarvan het terugdraaien de code herstelt en niet de gegevens.
--   Draai daarom `pg_dump` vóór het toepassen, zoals altijd, en weet dat de
--   rollback het gedrag terugzet en niet de geschiedenis.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Straf op `due` met de groep als begunstigde; de **eigenaar** verwijdert zijn
--    account:
--
--      vooraf:  commitment 1   auditregels 3   systeemberichten 2
--      verwijder_mijn_account (eigenaar): {"ok": true}
--      na:      commitment 0   auditregels 0   systeemberichten 2
--
--      blijft staan:
--        "De inzet die Alice zelf heeft ingesteld, is verschuldigd geworden."
--
--    Vier cascades wisten het commitment en zijn spoor
--    (`auth.users → profiles → goals → commitments → commitment_events`, alle vier
--    `confdeltype = 'c'`), en `verwijder_mijn_account()` noemt het woord
--    `commitment` **nul keer**. Maar de foreign keys van `chat_messages` naar
--    `profiles` — `sender_id`, `actor_id`, `subject_id` — staan alle drie op
--    `set null`, dus het bericht bleef staan. En de naam staat er als **platte
--    tekst** in: `meld_commitment()` bakt `weergavenaam(v_owner_id)` in de zin op
--    het moment dat hij hem plaatst.
--
-- ⚠️⚠️ **Dat was geen wisrecht maar een halve wissing, en de verkeerde helft
--    overleefde.** De groep hield een zin die zegt dat Alice' inzet verschuldigd
--    werd; de rij en de auditregels die daar iets over konden zeggen waren weg.
--    Wie het later vraagt, vindt de bewering en niet de administratie. Daarom was
--    *niets doen* hier niet de neutrale keuze maar de enige aantoonbaar
--    incoherente.
--
-- ---------------------------------------------------------------------------
-- Het besluit, en wat het kost
-- ---------------------------------------------------------------------------
--
-- **Quinten koos op 08-09-2026: het wisrecht wint helemaal.** Wie zijn account
-- opzegt, neemt zijn commitments én wat daarover in de groep staat mee.
--
-- ⚠️ **Dit wijkt af van wat ik voorstelde**, en dat hoort hier te staan. Mijn
--    voorstel was een auditstomp: de commitmentrij mag mee, maar één
--    geanonimiseerde regel blijft staan zodat het achtergebleven groepsbericht
--    gestaafd wordt. Quinten koos de andere kant op. Het bezwaar staat in
--    `docs/decisions/2026-09-08-wat-een-straf-overleeft.md` §4; het besluit staat
--    hier.
--
-- ⚠️⚠️ **En het raakt een regel die in `CLAUDE.md` staat.** Domeinregel 7 zegt:
--    *een bericht is een onveranderlijke kopie die de autorisatie overleeft
--    waaronder hij gemaakt is; ontkoppelen trekt de toestemming in, maar wist geen
--    chat.* Die zin blijft gelden — behálve voor deze ene route. De uitzondering
--    is in `CLAUDE.md` opgeschreven, want een regel die stilzwijgend een
--    uitzondering krijgt, is geen regel meer.
--
-- ⚠️ **De reikwijdte is met opzet smal, en dat is de conservatiefste lezing van
--    het besluit.** Alleen de systeemberichten die over een **commitment** van de
--    vertrekker gaan (`commitment_due`, `commitment_unlocked`) en waarvan hij het
--    onderwerp is. Niet zijn gewone chatberichten — die blijven staan met een lege
--    afzender, zoals altijd. Niet `goal_completed` — dat gaat over een doel en
--    niet over een consequentie, en dit issue gaat over straffen. Wie die grens
--    wil verleggen, doet dat als besluit en niet als bijvangst.
--
-- ⚠️ **Waarom `delete` en niet de naam wegpoetsen.** Anonimiseren zou de zin laten
--    staan met "iemand" erin, en dan blijft er een mededeling over een straf
--    hangen die niemand meer kan navragen — precies de halve wissing die dit
--    issue is. Wissen is hier het eerlijke antwoord op de vraag die gesteld werd.
--
-- ⚠️ **Veilig ten opzichte van realtime.** `chat_messages` staat in de publicatie
--    `supabase_realtime`, en Supabase past RLS niet toe op DELETE. 📏 Nagemeten
--    vóór het schrijven: `relreplident = 'd'`, dus bij een verwijdering gaat
--    alléén de sleutel over de lijn en niet de oude rij. Was die op `FULL` gezet,
--    dan zou dit blok de body van elk gewist bericht naar iedere abonnee sturen.
--    Dat is de reden dat `REPLICA IDENTITY FULL` op deze tabel verboden is, en
--    deze migratie is het eerste blok dat er daadwerkelijk op leunt.

create or replace function public.verwijder_mijn_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  mij  uuid := auth.uid();
  solo record;
  v_berichten integer := 0;
begin
  if mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- ⚠️ Laatste beheerder van een groep met andere leden? Dan eerst het
  --    beheerderschap overdragen. Zonder deze regel blijft er een groep achter
  --    die niemand meer kan beheren: de code niet roteren, geen lid uitzetten,
  --    de groep niet opheffen. Dat is geen verwijdering maar een wrak.
  if exists (
    select 1
    from group_members mijn
    where mijn.user_id = mij
      and mijn.role    = 'admin'
      and mijn.status <> 'inactive'
      and exists (
        select 1 from group_members ander
        where ander.group_id = mijn.group_id
          and ander.user_id <> mij
          and ander.status <> 'inactive'
      )
      and not exists (
        select 1 from group_members mede
        where mede.group_id = mijn.group_id
          and mede.user_id <> mij
          and mede.role     = 'admin'
          and mede.status  <> 'inactive'
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;

  -- ⚠️ Sinds 0102: de groepen waarvan ik het énige actieve lid ben, gaan mee het
  --    archief in. Anders blijft er een `active` groep staan met nul leden en een
  --    werkende uitnodigingscode, en loopt een wildvreemde er als enig,
  --    niet-beherend lid binnen.
  --
  -- ⚠️ **Via `archiveer_groep()` en niet met een eigen schrijfopdracht op de
  --    groepstabel**, om dezelfde reden als in `verlaat_groep()` §6b:
  --    `groups.status` is een gepinde kolom, en `npm run pin:controle` maakte de
  --    eerste versie hiervan terecht rood.
  --
  -- ⚠️ Dit werkt alleen vóór de delete: `archiveer_groep()` eist een actieve
  --    beheerder, en dat ben ik in mijn eigen solo-groep nog.
  for solo in
    select g.id
    from groups g
    where g.status <> 'archived'
      and exists (
        select 1 from group_members m
        where m.group_id = g.id and m.user_id = mij and m.status <> 'inactive'
      )
      and not exists (
        select 1 from group_members m
        where m.group_id = g.id and m.user_id <> mij and m.status <> 'inactive'
      )
  loop
    perform archiveer_groep(solo.id, true);
  end loop;

  -- ⚠️⚠️ **QS8-335, en zie de kop.** Dit blok is de enige plek in de codebase waar
  --    een systeembericht gewist wordt. Het staat vóór de delete omdat
  --    `chat_messages.subject_id` daarna `null` is — de foreign key staat op
  --    `set null` — en het bericht dan niet meer aan mij te koppelen valt. Ná de
  --    delete is dit blok een no-op, en dat is precies het gat dat het dicht.
  --
  --    De twee gebeurtenissen zijn de enige die `meld_commitment()` plaatst, en
  --    allebei zetten ze mij als `subject_id`. De grens is bewust smal: dit gaat
  --    over consequenties die ik zelf ben aangegaan, niet over alles wat er ooit
  --    over mij gezegd is.
  delete from chat_messages
   where subject_id = mij
     and type = 'system'
     and system_event in ('commitment_due', 'commitment_unlocked');
  get diagnostics v_berichten = row_count;

  delete from auth.users where id = mij;

  return jsonb_build_object('ok', true, 'systeemberichten_gewist', v_berichten);
end;
$$;
