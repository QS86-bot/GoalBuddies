-- 0067 — `registreer_push_token` neemt de websleutels aan (QS8-114, M2)
--
-- Repareert een stille breuk die 0062 introduceerde. De security-review van
-- 23-08-2026 vond hem.
--
-- ⚠️ **Wat er misging.** 0062 zette deze CHECK op `push_tokens`:
--
--      check ((platform = 'web') = (p256dh is not null and auth is not null))
--
--    en `registreer_push_token(text, text)` uit 0055 is niet meegewijzigd. Die
--    functie kent de sleutels niet en insert ze dus als NULL. Voor een
--    webregistratie is de linkerkant dan waar en de rechterkant onwaar, en dat
--    is per definitie een schending. Elke aanroep met `p_platform = 'web'` liep
--    dus stuk — de tabel kón geen enkele web-rij bevatten, en web push was
--    daarmee dood zodra hij aangezet werd.
--
--    Erger dan de breuk zelf is hoe hij eruitzag. De functie ving de fout niet
--    af, dus de gebruiker kreeg geen `{ok:false, reason:...}` maar een ruwe
--    Postgres-fout (23514, inclusief constraintnaam) door PostgREST heen. De RPC
--    is aan `authenticated` gegrant, dus elke ingelogde gebruiker kon die 500
--    opwekken.
--
--    Tweede variant van dezelfde fout: een bestaande web-rij overnemen met
--    `p_platform = 'ios'` liet de sleutels staan en schond de CHECK andersom.
--
-- ⚠️ **Les die hier hoort te blijven staan.** 0062 voegde een constraint toe op
--    een tabel waar precies één functie in schrijft, zonder die functie mee te
--    wijzigen. De tabel was leeg, dus de migratie slaagde en er ging niets
--    zichtbaar stuk. Een CHECK op een kolom die de enige schrijver niet vult, is
--    geen bescherming maar een tijdbom — hij gaat pas af als de feature aangaat.
--
-- ⚠️ **Waarom `drop` en niet `create or replace`.** De parameterlijst verandert,
--    en `create or replace` maakt dan een tweede functie naast de oude. Met
--    allebei aanwezig is een aanroep met twee argumenten dubbelzinnig. De nieuwe
--    heeft `default null` op de sleutels, dus een bestaande aanroep met alleen
--    `p_token`/`p_platform` blijft werken — dat is precies wat de native app doet.
--
-- ⚠️ Sleutels worden voor niet-web hard op NULL gezet in plaats van
--    doorgegeven. Anders houdt een apparaat dat van web naar native gaat zijn
--    oude sleutels, en dan schendt de overname de CHECK opnieuw.
--
-- Idempotent: `drop function if exists` + `create or replace`.
--
-- ROLLBACK:
--   drop function if exists public.registreer_push_token(text, text, text, text);
--   -- en zet de tweeargumentversie uit 0055 terug.

drop function if exists public.registreer_push_token(text, text);

create or replace function public.registreer_push_token(
  p_token    text,
  p_platform text,
  p_p256dh   text default null,
  p_auth     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_uid    uuid := auth.uid();
  v_p256dh text;
  v_auth   text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'geen_token');
  end if;

  if p_platform not in ('ios', 'android', 'web') then
    return jsonb_build_object('ok', false, 'reason', 'onbekend_platform');
  end if;

  -- Alleen web draagt sleutels. Voor de rest hard op NULL, zie de kop.
  if p_platform = 'web' then
    v_p256dh := nullif(trim(coalesce(p_p256dh, '')), '');
    v_auth   := nullif(trim(coalesce(p_auth, '')), '');

    -- ⚠️ Dit is de reden dat deze migratie bestaat: zonder deze tak wordt dit
    --    een CHECK-schending en krijgt de gebruiker een ruwe Postgres-fout in
    --    plaats van een antwoord waar de client iets mee kan.
    if v_p256dh is null or v_auth is null then
      return jsonb_build_object('ok', false, 'reason', 'geen_websleutels');
    end if;
  else
    v_p256dh := null;
    v_auth   := null;
  end if;

  delete from push_tokens where token = p_token and user_id <> v_uid;

  insert into push_tokens (user_id, token, platform, p256dh, auth, last_seen_at)
  values (v_uid, trim(p_token), p_platform, v_p256dh, v_auth, now())
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        last_seen_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.registreer_push_token(text, text, text, text) from public;
revoke all on function public.registreer_push_token(text, text, text, text) from anon;
grant execute on function public.registreer_push_token(text, text, text, text) to authenticated;
