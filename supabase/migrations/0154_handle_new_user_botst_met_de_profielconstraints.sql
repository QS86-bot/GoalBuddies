-- 0154_handle_new_user_botst_met_de_profielconstraints.sql — aanmelden met Google
-- kan vandaag niet: de trigger schrijft waarden die de CHECKs op `profiles`
-- weigeren, en dan rolt de hele `auth.users`-insert terug.
--
-- ROLLBACK-PAD:
--   De vorige body staat in 0002_functions_triggers.sql (0004 bevat alleen de
--   `revoke`, niet de body — nagemeten na de review). Terugzetten met
--   `create or replace function public.handle_new_user()` en die body — inclusief
--   `set search_path = public, pg_temp` ín de definitie, want zonder dat wist een
--   `create or replace` de pin (gemeten, zie hieronder).
--   ⚠️ Daarmee is aanmelden met een provider weer stuk — zie hieronder.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gemeten op 03-09-2026 bij QS8-197, in een teruggedraaide transactie tegen de
-- lokale stack. Een aanmelding zoals Supabase die voor Google aanmaakt:
--
--   insert into auth.users (id, email, raw_user_meta_data) values (
--     '…', 'iemand@gmail.com',
--     '{"full_name":"Iemand Google",
--       "avatar_url":"https://lh3.googleusercontent.com/a/ACg8ocK"}'::jsonb);
--
--   ERROR: new row for relation "profiles" violates check constraint
--          "profiles_avatar_url_eigen_pad"
--   CONTEXT: PL/pgSQL function handle_new_user() line 3
--
-- Dezelfde insert mét een `full_name` van 125 tekens:
--
--   ERROR: new row for relation "profiles" violates check constraint
--          "profiles_display_name_len"
--
-- Een gewone e-mailaanmelding gaat wél goed. Het verschil is dat een provider
-- velden meestuurt die een e-mailaanmelding niet heeft.
--
-- ⚠️ **Dit is geen schoonheidsfout maar een dichte deur.** De trigger draait ín
--    de transactie van de `auth.users`-insert. Faalt hij, dan rolt die insert
--    terug en bestaat het account niet. Aanmelden met Google is dus onmogelijk,
--    óók nadat de provider in het dashboard aangezet is (stap 1 van QS8-197) —
--    en het zou zich voordoen als een provider- of configuratieprobleem, want
--    de fout komt uit de database en niet uit de OAuth-flow.
--
-- ⚠️⚠️ **De naad is 125 migraties breed, en dat is de eigenlijke les.**
--    `handle_new_user` schrijft `avatar_url` sinds **0002**, ongefilterd uit
--    `raw_user_meta_data`. Toen was dat onschadelijk: er was geen CHECK. Die kwam
--    er in **0127** (`een avatarpad wijst naar jezelf`) en **0129** (`een
--    avatarpad heeft een vorm`), bij het bouwen van de avatar-upload. Beide
--    kanten waren op zichzelf correct; niemand liep de schrijvers na.
--
--    Het bleef onzichtbaar omdat de providers uitstaan. Er is dus nooit een
--    gebruiker langs deze route gekomen, en geen enkele test deed dat ook —
--    `createTestUser()` in de RLS-harness stuurt geen `avatar_url` mee.
--
-- ---------------------------------------------------------------------------
-- Wat deze migratie doet
-- ---------------------------------------------------------------------------
--
-- De trigger levert nu waarden die de constraints áán kunnen, in plaats van dat
-- de constraints versoepeld worden. Dat is met opzet die kant op:
--
--   * `profiles_avatar_url_eigen_pad` bestaat om te voorkomen dat een client
--     `avatar_url` naar het pad van iemand anders laat wijzen (0127). Die regel
--     verruimen voor een externe URL zou precies dat slot openzetten, en
--     `avatar_url` wordt in de app als opslagpad gelezen — een `https://`-waarde
--     zou daar sowieso niet als plaatje uitkomen.
--   * De avatar van de provider gaat dus **niet** mee. Dat is een bewuste
--     beperking en geen omissie: hem overnemen betekent hem ophalen en in de
--     eigen bucket zetten, en dat is het schrijfpad dat QS8-196 nog moet bouwen.
--     Tot die tijd begint een provider-account zonder foto, net als een
--     e-mailaccount.
--
--   * De naam wordt afgekapt op 80 **codepunten** met `left()`, want dat is wat
--     `char_length` in de CHECK telt (CLAUDE.md: één eenheid overal). Afkappen is
--     hier beter dan weigeren: een lange naam mag nooit een aanmelding kosten.
--
-- ⚠️ **Er zijn drie CHECKs op de kolommen die deze trigger schrijft, niet twee.**
--    De eerste versie van deze kop noemde `profiles_avatar_url_eigen_pad` en
--    `profiles_display_name_len` en miste `profiles_avatar_url_len` (maximaal
--    1000 tekens). Gevonden bij de security-review en nagemeten; de regex is
--    daarom begrensd op 200 tekens na de id.
--
-- ⚠️ De `search_path` blijft expliciet gezet, zoals 0004 hem achterliet. Zonder
--    dat is dit een `SECURITY DEFINER`-functie zonder vast zoekpad, en dat is de
--    eigenschap die `definer_bewaking()` (0106) op nul houdt.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- ⚠️⚠️ **De pin staat hier ín de `create or replace` en niet in een losse
--    `alter` eronder.** Gemeten na de review: `create or replace` zonder `set`
--    wíst `proconfig`, en `definer_bewaking()` meldt dan meteen 1. Met de pin een
--    statement later stond er dus een venster waarin een `SECURITY DEFINER`
--    -triggerfunctie op `auth.users` geen vast zoekpad heeft — precies wat 0004
--    §1 beschrijft. Lokaal is dat venster er niet omdat `schema-opbouwen.sh` elke
--    migratie in één transactie draait; op productie is dat niet gegarandeerd, en
--    die vraag is goedkoper weg te nemen dan te beantwoorden.
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- ⚠️ `left(..., 80)` telt codepunten, net als `char_length` in
    --    `profiles_display_name_len`. Zou hier `substring` op bytes staan, dan
    --    knipt een naam met een emoji of een accent middenin een teken.
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Naamloos'
      ),
      80
    ),
    -- ⚠️ Alleen een pad dat aan `profiles_avatar_url_eigen_pad` voldoet. Een
    --    provider stuurt hier een `https://`-URL, en die hoort niet in deze
    --    kolom — zie de kop. Alles wat niet past, wordt `null`.
    -- ⚠️ `{1,200}` en niet `+`. Er zijn **drie** CHECKs op de kolommen die deze
    --    trigger schrijft, en `profiles_avatar_url_len` (maximaal 1000 tekens) is
    --    de derde — die stond niet in de eerste versie van deze kop. Gemeten:
    --    een eigen pad met 1001 tekens erachter laat de `auth.users`-insert
    --    alsnog terugrollen. Vandaag onbereikbaar (je kent je eigen id niet vóór
    --    de aanmelding), maar de bewering "de trigger levert waarden die de
    --    constraints áán kunnen" was daarmee niet waar.
    case
      when new.raw_user_meta_data ->> 'avatar_url' ~ ('^' || new.id::text || '/[A-Za-z0-9._-]{1,200}$')
        then new.raw_user_meta_data ->> 'avatar_url'
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ⚠️ Blijft staan als gordel naast de bretels: hij is nu idempotent en overbodig,
--    en dat is goedkoper dan de vraag of elke omgeving dit bestand als één
--    transactie doorvoert.
alter function public.handle_new_user() set search_path = public, pg_temp;

comment on function public.handle_new_user() is
  'Maakt het profiel bij een nieuwe auth.users-rij. Levert waarden die de CHECKs '
  'op profiles aankunnen: de naam afgekapt op 80 codepunten, en alleen een '
  'avatar_url die het eigen-pad-patroon volgt. Een provider-URL gaat dus niet '
  'mee — zie 0154 en QS8-196.';
