-- 0090_een_rem_op_de_chat_en_de_weekreacties.sql — beveiligingsregel 5
--
-- ROLLBACK-PAD:
--   drop policy if exists chat_messages_insert on public.chat_messages;
--   create policy chat_messages_insert on public.chat_messages
--     for insert to authenticated
--     with check (
--       sender_id = auth.uid() and is_group_member(group_id)
--       and type <> 'system' and system_event is null
--     );
--   drop policy if exists week_review_replies_insert on public.week_review_replies;
--   create policy week_review_replies_insert on public.week_review_replies
--     for insert to authenticated
--     with check (
--       author_id = auth.uid()
--       and exists (
--         select 1 from week_reviews r
--         where r.id = week_review_replies.week_review_id and is_group_member(r.group_id)
--       )
--     );
--   drop function if exists public.berichten_over();
--   drop function if exists public.weekreacties_over();
--   drop index if exists public.chat_messages_afzender_vers_idx;
--   drop index if exists public.week_review_replies_auteur_vers_idx;
--
-- ---------------------------------------------------------------------------
-- Wat er open stond
-- ---------------------------------------------------------------------------
--
-- Bevinding van 18-08-2026 uit `docs/ENGINEER-REVIEW.md`, op 25-08 nagemeten en
-- ongewijzigd: `chat_messages` en `week_review_replies` zijn rechtstreeks
-- beschrijfbaar via PostgREST zonder énige telling. `chat_messages_insert`
-- toetste afzender, lidmaatschap en dat het geen systeembericht is; meer niet.
--
-- ⚠️ **De praktische rem was sociaal, en dat is geen rem.** Twaalf leden per
--    groep die je zelf hebt uitgenodigd, 4000 respectievelijk 1000 tekens per
--    rij. Op een gratis tier van 500 MB zonder automatische backups is één lid
--    dat in een lus schrijft een kostenvector — en `wek_groep()` doet er per
--    bericht een `update groups` bovenop, dus het is niet alleen opslag.
--
-- CLAUDE.md beveiligingsregel 5 noemt AI-calls, uitnodigingen en auth met naam
-- en de chat niet. Dat is precies waarom dit buiten EPIC 7 bleef liggen. De
-- reden dat het nú wel moet: de lijst in die regel is een opsomming van
-- vectoren die we toen kenden, geen uitputtende definitie van wat een vector is.
--
-- ---------------------------------------------------------------------------
-- In de policy en niet in een trigger — hetzelfde argument als 0083
-- ---------------------------------------------------------------------------
--
-- ⚠️ De bevinding stelde zelf een trigger voor, met de terechte kanttekening dat
--    dit een insert-pad is en een trigger hier dús mag gooien — de valkuil van
--    0017 gaat over SECURITY DEFINER-RPC's die iets willen ónthouden. Een
--    trigger zou bovendien een leesbare melding opleveren in plaats van een kale
--    policyweigering.
--
-- ⚠️ **Toch de policy, om de reden die 0083 al opschreef.** Systeemberichten
--    komen uit definer-functies en de rollover draait als `service_role`; die
--    vallen buiten een policy die `to authenticated` staat, zonder dat daar één
--    regel voor nodig is. Een trigger geldt voor iedereen en zou dus zélf op een
--    rolnaam moeten beslissen — en zo'n trigger faalt open (WERKVOORRAAD §7).
--    Een grens die openvalt is geen grens. De leesbare melding lossen we
--    hieronder anders op.
--
-- ---------------------------------------------------------------------------
-- Waarom "hoeveel mag je nog" en niet "hoeveel deed je al"
-- ---------------------------------------------------------------------------
--
-- ⚠️ 0083 telde vooruit (`weekdoelen_vandaag() < 200`) en zette de grens in de
--    policy. Dat werkt, maar het getal staat dan in de policy en de app kan het
--    niet kennen — en een policyweigering is voor élke reden dezelfde 42501. Een
--    gebruiker die tegen de limiet aanloopt, krijgt "versturen mislukt" en mag
--    raden.
--
--    Deze twee functies geven daarom het **resterende** budget terug. De policy
--    toetst `> 0`, en de app kan op het foutpad dezelfde functie aanroepen om te
--    zeggen wát er aan de hand is. De grens staat daarmee op precies één plek —
--    in de functie — en de app leest hem, in plaats van hem te herhalen.
--
-- ---------------------------------------------------------------------------
-- De getallen
-- ---------------------------------------------------------------------------
--
-- 500 chatberichten en 100 weekreacties per voortschrijdend etmaal.
--
-- ⚠️ **Voortschrijdend en geen kalenderdag.** `now() - interval '1 day'` laat
--    het budget continu weer aangroeien; een kalendergrens zet iemand die om
--    11:00 op is, tot middernacht buiten de deur. Zelfde vorm als 0083 en 0008.
--
-- Een buddy-groep is drie tot twaalf mensen. Vijfhonderd berichten op één dag
-- van één persoon is al extreem; een lus haalt dat in minder dan een seconde en
-- loopt dus meteen vast. Dat is precies de verhouding die je wilt: ruim boven
-- wat een mens doet, ruim onder wat een script doet.

create index if not exists chat_messages_afzender_vers_idx
  on public.chat_messages (sender_id, created_at desc);

comment on index public.chat_messages_afzender_vers_idx is
  'Voor de rem in chat_messages_insert (0090): per afzender de meest recente '
  'rijen eerst. ⚠️ Er stond tot 0090 geen enkele index op sender_id, terwijl '
  'drie policies erop filteren — onwrikbare regel 11 gold hier niet.';

create index if not exists week_review_replies_auteur_vers_idx
  on public.week_review_replies (author_id, created_at desc);

comment on index public.week_review_replies_auteur_vers_idx is
  'Voor de rem in week_review_replies_insert (0090). De bestaande '
  'week_review_replies_author_idx staat alleen op author_id en dekt de '
  'tijdgrens niet.';

/**
 * Hoeveel chatberichten mag de ingelogde gebruiker nu nog plaatsen?
 *
 * ⚠️ **Faalt dicht bij een lege `auth.uid()`.** Zonder sessie is het antwoord
 *    nul en niet "de hele limiet". Dit project heeft die val één keer betaald:
 *    de `auth.uid()`-NULL-fout kostte veertig regels omdat precies één functie
 *    hem had, en elke definer-functie hier is een kopie van de vorige.
 */
create or replace function public.berichten_over()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then 0
    else greatest(
      0,
      500 - (
        select count(*)::integer
        from chat_messages m
        where m.sender_id = auth.uid()
          and m.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.berichten_over() is
  'Het resterende chatbudget van de ingelogde gebruiker over het laatste etmaal, '
  'voor de rem in chat_messages_insert (beveiligingsregel 5). Geeft zonder '
  'sessie nul terug, zodat de policy dichtvalt en niet opengaat. De grens van '
  '500 staat hier en nergens anders — de app leest hem via deze functie.';

revoke all on function public.berichten_over() from public, anon;
grant execute on function public.berichten_over() to authenticated;

/**
 * Hoeveel reacties op een weekafsluiting mag de ingelogde gebruiker nu nog
 * plaatsen? Zelfde vorm en dezelfde dichtvalregel als `berichten_over()`.
 */
create or replace function public.weekreacties_over()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then 0
    else greatest(
      0,
      100 - (
        select count(*)::integer
        from week_review_replies r
        where r.author_id = auth.uid()
          and r.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.weekreacties_over() is
  'Het resterende budget aan weekreacties van de ingelogde gebruiker over het '
  'laatste etmaal, voor de rem in week_review_replies_insert. Geeft zonder '
  'sessie nul terug.';

revoke all on function public.weekreacties_over() from public, anon;
grant execute on function public.weekreacties_over() to authenticated;

-- ⚠️ De bestaande voorwaarden blijven ongewijzigd overgenomen uit
--    `pg_policies`, niet gereconstrueerd uit een migratiebestand. Dat is de les
--    van 0084: de gedeployde definitie is de waarheid, en een policy die je
--    "ongeveer zo" herschrijft, verliest stil een voorwaarde.
drop policy if exists chat_messages_insert on public.chat_messages;

create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and is_group_member(group_id)
    and type <> 'system'
    and system_event is null
    and berichten_over() > 0
  );

drop policy if exists week_review_replies_insert on public.week_review_replies;

create policy week_review_replies_insert on public.week_review_replies
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from week_reviews r
      where r.id = week_review_replies.week_review_id
        and is_group_member(r.group_id)
    )
    and weekreacties_over() > 0
  );
