-- 0169_getuigenissen_voor_de_persoon_getuige.sql — de getuige kan zien van wie de
-- straf is (QS8-292, vervolg op 0168/QS8-228)
--
-- ROLLBACK-PAD:
--   drop function if exists public.getuigenissen();
--
--   Voegt verder niets toe: geen tabel, geen kolom, geen policy. Terugdraaien
--   kost dus niets en raakt geen enkele rij.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0168 gaf één persoon leesrecht op een straf zodra die verschuldigd wordt —
-- `commitments_select`, derde tak, `{due, resolved}`. Dat recht werkt, maar er
-- was geen enkele plek waar die persoon het tegenkwam: `fetchCommitments()`
-- vraagt per `goal_id` en wordt alleen aangeroepen vanaf het scherm van de
-- eigenaar. Regel 18 vraag 5 in zuivere vorm — elk schakeltje af, de keten
-- onderbroken.
--
-- ⚠️ **En er zat een tweede gat onder, dat het issue niet noemde.** 📏 Gemeten
--    met een echte opstelling (Alice heeft een doel, Bob zit in haar groep en is
--    de getuige, de straf staat op `due`), gelezen als Bob:
--
--      commitments   -> 1 rij, inclusief body
--      goals         -> 0 rijen
--      profiles(alice) -> 1 rij
--
--    De getuige krijgt de straf wél te zien maar het dóél niet, en
--    `commitments` draagt geen `owner_id`. **Hij kan dus niet vaststellen van
--    wie de straf is.** Een blok "je bent getuige van: *ik trakteer op taart*"
--    zonder naam is geen oppervlak maar een raadsel; de werking van een
--    commitment device komt uit het gezien wórden, en dan moet er iemand te zien
--    zijn.
--
-- ⚠️ **Waarom een functie en niet een verruiming van `goals_select`.** De
--    getuige hoort het doel níét te kunnen lezen — titel, streefdatum,
--    categorie en voortgang gaan hem niet aan, en 0168 heeft die grens bewust zo
--    getrokken. Wat hij nodig heeft is één veld: de naam van de eigenaar. Een
--    definer-functie levert precies dat en niets meer; `goals_select` verruimen
--    zou alles meegeven.
--
-- ⚠️ **De naam lekt niets nieuws.** Hij mag `profiles` van de eigenaar al lezen
--    (`shares_group_with_user`), want een getuige kiezen kán alleen binnen een
--    gedeelde groep — dat is de grens uit `commitments_insert`. Deze functie
--    bespaart hem alleen de omweg die hij zonder `owner_id` niet kán lopen.
--
-- ⚠️ **Domeinregel 7 is hier niet geschonden maar aangeroepen.** Een straf die
--    verschuldigd wordt ís tegenslag van een ander. De regel noemt daarvoor met
--    zoveel woorden één uitzondering: *"een straf die de gebruiker zelf vooraf
--    heeft ingesteld en bevestigd"*. `confirmed_at` is NOT NULL, dus die
--    voorwaarde is een schema-eigenschap en geen belofte. En het bereik blijft
--    één persoon — precies degene die de eigenaar zelf aanwees.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- getuigenissen() — de straffen waar jij persoonlijk getuige van bent
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`auth.uid()` staat in het lichaam en dat is de autorisatie**, niet een
--    filter dat de client meestuurt. De functie neemt geen argumenten: er is
--    geen manier om hem voor iemand anders aan te roepen. Dat is de les van
--    0165 (`verdien_badges(p_user_id)`) in de vorm van een ontwerpkeuze.
--
-- ⚠️ De statuslijst komt uit `commitment_zichtbaar_voor_persoon()` en niet uit
--    een tweede opsomming hier. Twee lijsten die hetzelfde horen te zeggen,
--    lopen uiteen — en dan zou deze functie meer of minder tonen dan de policy
--    toestaat.
--
-- ⚠️ Eén query en geen N+1 (regel 12): de naam komt uit een join en niet uit een
--    verzoek per rij.
create or replace function public.getuigenissen()
returns table(
  id uuid,
  type text,
  body text,
  status text,
  confirmed_at timestamptz,
  created_at timestamptz,
  eigenaar_naam text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id,
         c.type,
         c.body,
         c.status,
         c.confirmed_at,
         c.created_at,
         p.display_name
  from commitments c
  join goals    g on g.id = c.goal_id
  join profiles p on p.id = g.owner_id
  where c.beneficiary_user_id = (select auth.uid())
    and c.status = any (commitment_zichtbaar_voor_persoon())
  order by c.confirmed_at desc, c.id;
$$;

comment on function public.getuigenissen() is
  'De straffen waarvan de aanroeper persoonlijk de getuige is, met de naam van '
  'de eigenaar erbij — het enige veld dat commitments_select hem niet kan geven '
  'omdat goals voor hem dicht is. Neemt geen argumenten: auth.uid() ín het '
  'lichaam is de autorisatie. ⚠️ Bewust géén doeltitel: 0168 sluit het doel voor '
  'de getuige af en dat blijft zo. Zie migratie 0169 (QS8-292).';

-- ⚠️ De volledige vorm van onwrikbare regel 4. `from public, anon` alléén houdt
--    precies de rol over waaronder iedere ingelogde gebruiker draait.
revoke execute on function public.getuigenissen() from public, anon, authenticated;
grant  execute on function public.getuigenissen() to authenticated;

commit;
