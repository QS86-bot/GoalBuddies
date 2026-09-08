-- 0195_voortgang_komt_van_afvinken_en_niet_van_invoer.sql — een mijlpaal wordt
-- afgevinkt en niet ingevoerd: de client zet `id`, `status` en `completed_at`
-- niet meer zelf (QS8-353).
--
-- ROLLBACK-PAD:
--   drop trigger if exists mijlpaal_stempel on milestones;
--   drop function if exists stempel_mijlpaal();
--   grant insert (id, status, completed_at) on public.milestones to authenticated;
--   grant update (completed_at) on public.milestones to authenticated;
--
--   ⚠️ En zet dan `src/modules/goals/mijlpalen.ts` terug: die stuurt sinds deze
--      migratie geen `completed_at` meer mee.
--
--   ⚠️⚠️ **Na deze migratie is `completed_at` door niemand meer te zetten — ook
--      niet als `postgres`.** De trigger werpt voor élke rol; dat is opzet, maar
--      het betekent dat een correctie op bestaande rijen (een teruggedateerde
--      waarde van vóór 0195) langs de trigger heen moet:
--
--        alter table milestones disable trigger mijlpaal_stempel;
--        -- de correctie
--        alter table milestones enable trigger mijlpaal_stempel;
--
--      📏 Tel vóór het uitrollen of zulke rijen bestaan:
--        select count(*) from milestones
--         where (completed_at is not null and completed_at < created_at)
--            or (status <> 'done' and completed_at is not null);
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op 08-09-2026 met een echt JWT tegen de lokale stack, als gewone
--    gebruiker op een eigen doel — twee deuren naar dezelfde fout:
--
--   POST /milestones {id: <zelfgekozen>, status: 'done',
--                     completed_at: '2020-01-01'}        -> HTTP 201
--       id = ZELFGEKOZEN, status = done, completed_at = 2020
--
--   PATCH /milestones {status: 'done',
--                      completed_at: '2019-05-05'}       -> HTTP 200
--       completed_at = 2019
--
-- 📏 En niets stuurt die kolommen langs de nette weg: `maakMijlpaal()`
--    (`modules/goals/mijlpalen.ts`) stuurt `goal_id, title, description,
--    target_date, order_index`, en de AI-planroute (`plan-rijen.ts`) levert
--    `title, description, target_date, order_index`. De defaults dragen het model
--    al: `id` is `gen_random_uuid()`, `status` is `'todo'`, `completed_at` is NULL.
--
-- ---------------------------------------------------------------------------
-- Wat een verzonnen mijlpaal vandaag oplevert — en wat niet
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Niet:** een groepsaankondiging of een badge. 📏 `milestones_systeembericht`
--    en `badges_na_mijlpaal` zijn `AFTER UPDATE` en vuren dus niet op een INSERT.
--    Ook niet: een doel afronden dat nog niet af is — `rond_doel_af()` telt
--    mijlpalen met `status = 'todo'`, en een verzonnen `done` haalt daar niets weg.
--
-- ⚠️ **Wel:** zichtbare voortgang die niet verdiend is. `groep_teller`,
--    `group_overview`, `herbereken_risico`, `seizoensrecap_cijfers`,
--    `verdien_badges` en de view `goal_dashboard` lezen allemaal
--    `milestones.status`. Een deel daarvan is groepszichtbaar.
--
-- ---------------------------------------------------------------------------
-- Waarom een trigger en niet alleen een revoke
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De INSERT-deur dichtdoen is de helft, en de helft is hier misleidend.**
--    `completed_at` en `status` moeten op UPDATE schrijfbaar blijven, want dát is
--    het afvinken. Zou deze migratie alleen de INSERT-grant intrekken, dan staat
--    de belofte "voortgang komt van het afvinken en niet van de invoer" in een
--    test terwijl je hem via PATCH nog steeds breekt — een grendel die groen is
--    om de verkeerde reden (onwrikbare regel 18, vraag 3).
--
--    `status` blijft dus schrijfbaar (afvinken is een keuze van de gebruiker),
--    maar `completed_at` wordt gestempeld: dat is een servertijdstempel en geen
--    invoer. Zelfde vorm als `stamp_chat_message()` voor `created_at`, en dezelfde
--    reden als QS8-295 — een tijdstempel in handen van de client is geen
--    tijdstempel.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `security definer` is hier níet nodig en dus niet gebruikt: de trigger
--    schrijft alleen in `new`, hij leest geen andere tabel.
create or replace function stempel_mijlpaal()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- ⚠️⚠️ **Eerst weigeren, dan pas stempelen — de les van 0188 (QS8-326).**
  --    De eerste versie van deze trigger zette de waarde van de beller
  --    stilzwijgend terug, en dat is precies het patroon dat dit project zeven
  --    migraties geleden heeft afgeschaft: de beller krijgt "gelukt" te horen
  --    over iets dat niet gebeurd is. 📏 Gemeten als `service_role`: een INSERT
  --    met `completed_at = '2015-06-06'` en daarna een UPDATE naar `'2014-01-01'`
  --    gaven allebei geen fout, terwijl de rij `now()` droeg.
  --
  --    Een gewone gebruiker merkt daar niets van — die ketst al op de
  --    kolom-revoke af met 42501. Dit is de rot-kant: een backfill of
  --    herstelscript dat ooit als `service_role` een datum goedzet, krijgt
  --    `UPDATE 1` terug en verandert niets.
  --
  -- ⚠️ `is distinct from old` en niet "is de kolom meegestuurd": bij
  --    `update … set status = 'done'` stuurt PostgREST `completed_at` niet mee,
  --    dus `new.completed_at = old.completed_at` en het afvinken loopt door.
  if tg_op = 'INSERT' and new.completed_at is not null then
    raise exception 'completed_at wordt door de server gezet, niet door de beller'
      using errcode = 'check_violation',
            hint = 'Laat de kolom weg; `stempel_mijlpaal()` zet hem op de overgang naar done.';
  end if;

  if tg_op = 'UPDATE' and new.completed_at is distinct from old.completed_at then
    raise exception 'completed_at wordt door de server gezet, niet door de beller'
      using errcode = 'check_violation',
            hint = 'Zet alleen `status`; het tijdstempel volgt uit de overgang.';
  end if;

  -- ⚠️ **De overgang bepaalt het tijdstempel, niet de waarde.** Blijft een
  --    mijlpaal `done` (iemand werkt de titel bij), dan blijft `completed_at`
  --    staan waar hij stond; dat is wanneer het gebeurde. Alleen de overgang
  --    naar `done` zet hem, en elke andere status wist hem.
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    else
      new.completed_at := old.completed_at;
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function stempel_mijlpaal() from public, anon, authenticated;

drop trigger if exists mijlpaal_stempel on milestones;

create trigger mijlpaal_stempel
  before insert or update on milestones
  for each row execute function stempel_mijlpaal();

-- ⚠️ `from public, anon, authenticated` en niet `from authenticated` — onwrikbare
--    regel 4. In Supabase deelt `alter default privileges` elk nieuw object uit
--    aan alle drie; een revoke die er één overslaat laat precies de rol staan
--    waaronder iedere ingelogde gebruiker draait.
revoke insert (id, status, completed_at) on public.milestones from public, anon, authenticated;

-- ⚠️ `completed_at` gaat óók van de UPDATE-kant af: hij komt nu uit de trigger.
--    `status` blijft staan — afvinken is de handeling van de gebruiker.
revoke update (completed_at) on public.milestones from public, anon, authenticated;
