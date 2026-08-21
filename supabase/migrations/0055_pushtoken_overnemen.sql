-- 0055_pushtoken_overnemen.sql — EPIC 11, correctie op 0053
--
-- ROLLBACK-PAD:
--   drop function if exists registreer_push_token(text, text);
--   create policy push_tokens_insert on public.push_tokens for insert to authenticated
--     with check (user_id = auth.uid());
--   create policy push_tokens_update on public.push_tokens for update to authenticated
--     using (user_id = auth.uid()) with check (user_id = auth.uid());
--   grant insert, update on public.push_tokens to authenticated;
--
-- ⚠️ **Dit repareert een fout in 0053 die een test eruit haalde, niet ik.**
--    Ik had opgeschreven dat op een gedeeld apparaat "wie zich het laatst
--    registreert, wint" — de unieke index op `token` zou dat regelen. Dat is
--    niet wat er gebeurde. De UPDATE-policy stond op `user_id = auth.uid()`,
--    dus de nieuwe gebruiker mocht de rij van de vórige helemaal niet aanraken:
--    zijn upsert liep op 42501 stuk.
--
--    Het gevolg is erger dan "geen meldingen". De rij bleef van de vorige
--    gebruiker, dus diens meldingen — met de namen van zíjn buddy's erin —
--    bleven binnenkomen op een telefoon die nu bij iemand anders in de hand
--    ligt. En de nieuwe gebruiker kreeg niets, zonder enig signaal.
--
-- ⚠️ De reparatie is een RPC en geen ruimere policy. Een UPDATE-policy die het
--    overnemen toestaat, moet `using (true)` hebben — en dan mag elke ingelogde
--    gebruiker elke rij aanraken. Binnen een functie is de handeling begrensd
--    tot precies één ding: dit token gaat naar mij.
--
-- ⚠️ **Wat je hiermee accepteert, en dat hoort expliciet.** Wie een token van
--    iemand anders kent, kan het naar zich toe trekken. Gevolg: die telefoon
--    krijgt daarna míjn meldingen (ik lek dus aan mezelf), en de eigenaar krijgt
--    de zijne niet meer. Dat laatste is de echte schade — een stille
--    denial-of-service op andermans meldingen.
--
--    De bescherming is dat een Expo-pushtoken een lange willekeurige string is
--    die je alleen krijgt van het apparaat zelf. Dat is dezelfde soort
--    bescherming als bij de uitnodigingscode (Q-TODO A16), en net als daar is
--    het entropie en geen slot. Zie het als bewust geaccepteerd risico; het
--    alternatief — een token nooit laten overnemen — laat het gedeelde apparaat
--    kapot, en dat is een zekerheid in plaats van een risico.

begin;

-- De client schrijft niet meer rechtstreeks. Lezen en verwijderen blijft:
-- uitloggen moet je eigen token kunnen weghalen.
drop policy if exists push_tokens_insert on public.push_tokens;
drop policy if exists push_tokens_update on public.push_tokens;

revoke insert, update on public.push_tokens from authenticated;

create or replace function public.registreer_push_token(
  p_token    text,
  p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- ⚠️ De niet-NULL-controle vooraan, niet impliciet in een vergelijking. Een
  --    lege `auth.uid()` maakt van `x = auth.uid()` geen bewering maar een derde
  --    antwoord dat zich als "niet waar" gedraagt.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'geen_token');
  end if;

  if p_platform not in ('ios', 'android', 'web') then
    return jsonb_build_object('ok', false, 'reason', 'onbekend_platform');
  end if;

  -- Het overnemen. Eén rij per token, en die hoort bij wie zich het laatst
  -- meldt — wat per definitie het apparaat zelf is: de app registreert bij
  -- elke start opnieuw.
  delete from push_tokens where token = p_token and user_id <> v_uid;

  insert into push_tokens (user_id, token, platform, last_seen_at)
  values (v_uid, trim(p_token), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        last_seen_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.registreer_push_token(text, text) from public, anon;
grant execute on function public.registreer_push_token(text, text) to authenticated;

commit;
