-- 0182_het_oppervlak_van_de_getuige_volgt_de_groepsband.sql — wie de groep verliet, bleef zijn getuigenis zien (QS8-306)
--
-- ROLLBACK-PAD:
--   1. `create or replace` op `getuigenissen()` zonder de conjunct
--      `and deelt_groep_met_eigenaar(c.goal_id)` (definitie in 0169);
--   2. `create policy commitments_select` zonder `and deelt_groep_met_eigenaar(goal_id)`
--      in de persoonstak (definitie in 0168);
--   3. `drop function if exists public.deelt_groep_met_eigenaar(uuid);`
--   ⚠️ Stap 3 hoort erbij en is geen netheid: zonder hem blijft er een
--      `security definer`-functie staan die `authenticated` mag uitvoeren
--      terwijl niets hem meer aanroept. Uit de security-review van 07-09-2026,
--      die er ook bij aanwees dat de conjunct géén `exists` is maar een
--      functieaanroep — wie dit pad volgde, zocht naar iets dat er niet staat.
--   ⚠️ Deze migratie versmalt alleen leesrecht; er gaat bij een terugzet niets
--   verloren behalve de begrenzing zelf. Er wordt geen kolom aangeraakt, dus
--   geen enkele aanwijzing gaat weg.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Nawerk van QS8-298. Die gaf `getuigenissen_voor()` — de vraag die de
-- meldingenjob stelt — de band terug die de aanwijzing droeg: eigenaar en
-- getuige moeten nog steeds één groep delen, allebei `<> 'inactive'`. Dezelfde
-- invariant die `commitments_insert` bij het aanmaken eist
-- (`shares_group_with_user`).
--
-- Het leesoppervlak van QS8-292 kreeg die grens niet. Gemeten op de draaiende
-- database, met Bob als getuige die daarna de groep verlaat:
--
--   A1 bob ziet in getuigenissen()  = 1
--   A2 bob leest de rij             = 1
--   ---- bob gaat op inactive ----
--   B0 lidmaatschap van bob         = inactive
--   B3 melding voor bob             = 0     <- QS8-298 doet zijn werk
--   B1 bob ziet in getuigenissen()  = 1     <- het scherm niet
--   B2 bob leest de rij             = 1     <- de policy ook niet
--
-- ⚠️ **Het is niet alleen de functie maar ook de rij eronder.** B2 gaat langs
--    `getuigenissen()` heen: de derde tak van `commitments_select` (0168) laat
--    de begunstigde de rij lezen zonder naar lidmaatschap te kijken. Een
--    reparatie in alleen de functie zou het blok leegmaken en het leesrecht
--    laten staan — precies de vorm waar CLAUDE.md voor waarschuwt: de schermen
--    hielden de regel aan terwijl de database hem lekte.
--
-- ---------------------------------------------------------------------------
-- De ontwerpvraag, en waarom dit het antwoord is
-- ---------------------------------------------------------------------------
--
-- QS8-306 stelde hem als een keuze tussen twee kanten:
--
--   1. *Een afspraak is een afspraak* — de eigenaar heeft deze persoon
--      aangewezen en dat overleeft een vertrek.
--   2. *De band droeg de aanwijzing* — verdwijnt de band, dan verdwijnt het
--      oppervlak.
--
-- Het is 2 geworden, om drie redenen die alle drie al opgeschreven stonden:
--
--   * **CLAUDE.md, domeinregel 7:** *voor élk nieuw oppervlak is beschermd het
--     antwoord tot iemand het tegendeel besluit*, en *bij twijfel is het
--     antwoord nee*. Dit is een oppervlak waarop iemand de tegenslag van een
--     ánder leest.
--   * **De aanwijzing kón alleen dankzij de band.** `commitments_insert` eist
--     `shares_group_with_user(beneficiary_user_id)`. Een oppervlak dat langer
--     leeft dan zijn eigen voorwaarde, is een oppervlak dat niemand besloten
--     heeft.
--   * **QS8-298 trok deze grens al voor de duw.** Het beslisdocument van dat
--     issue zegt met zoveel woorden: *niet duwen is minder dan niet tonen, dus
--     de kant die hier gekozen is, is de veilige.* Dit maakt de twee gelijk.
--
-- ⚠️ **En het gevolg dat QS8-306 vreesde, is nagemeten en kleiner dan gedacht.**
--    Het issue waarschuwde dat een straf waarvan de getuige vertrok "daarna
--    helemaal geen getuige meer heeft", omdat `bewaak_begunstigde()` (0168) de
--    kolom niet laat leeghalen. Gemeten:
--
--      D0 aanwijzing staat er nog      = <het id van bob>
--      ---- bob komt terug ----
--      D1 na terugkeer: melding        = 1
--      D2 na terugkeer: getuigenissen  = 1
--
--    De aanwijzing wordt dus niet vernietigd; alleen het oppervlak volgt de
--    band. Wie terugkomt, ziet zijn getuigenis weer. Dat is een ándere zaak dan
--    een straf zonder getuige, en het is precies de eigenschap die deze grens
--    goedkoop maakt: hij neemt niets weg, hij schort op.
--
--    ⚠️ Wat wél waar blijft: zolang de getuige weg is, ziet niemand die straf
--    behalve de eigenaar. De twee andere pogingen zijn ook gemeten en allebei
--    geweigerd — `beneficiary_user_id = null` geeft *"De begunstigde van een
--    commitment is niet weg te halen zolang hij bestaat"*, en zichzelf aanwijzen
--    geeft *"Je kunt niet je eigen getuige zijn"*. Een straf een nieuwe getuige
--    geven is dus een eigen vraag; die staat als QS8-312.
--
-- ---------------------------------------------------------------------------
-- Eén conjunct, twee plekken, en dezelfde vorm als QS8-298
-- ---------------------------------------------------------------------------
--
-- ⚠️ De conjunct is letterlijk die uit `getuigenissen_voor()` (0178), inclusief
--    `<> 'inactive'` in plaats van `= 'active'`: een lid met een adempauze
--    (`paused`) is nog steeds een groepsgenoot, precies zoals
--    `shares_group_with_user()` de grens trekt. Drie opvattingen over wie een
--    groepsgenoot is, zijn er twee te veel.
--
-- ⚠️ En hij kijkt naar `group_members` en níet naar `goal_group_links`. Dat is
--    de fout die 0178 in zijn eerste versie maakte en die daar is opgeschreven:
--    de invariant is dat eigenaar en getuige één groep delen, niet dat het doel
--    aan een groep hangt. Een doel hoeft aan geen enkele groep te hangen.

-- ⚠️ **Eén definitie van "deelt een groep", en niet drie.** De policy hieronder
--    kan de band niet zelf uitrekenen: een subquery in een policy leest `goals`
--    ónder RLS, en de getuige mag het doel van de eigenaar niet lezen. Gemeten:
--    met de join in de policy zag een getuige die nog gewoon lid was zijn eigen
--    rij niet meer (`bob leest de rij = 0`), en dat is de must-allow die brak.
--
--    Vandaar een `security definer`-helper, die niets zelf bedenkt maar
--    `shares_group_with_user()` de vraag stelt die hij al beantwoordt. Zo blijft
--    er één plek waar staat wat een groepsgenoot is — dezelfde die
--    `commitments_insert` bij het aanmaken gebruikt.
--
-- ⚠️ Een doel dat niet bestaat geeft `null` en daarmee `false`: `theirs.user_id
--    = null` levert geen rijen. Dat is de goede kant om op te falen.
-- ⚠️ **In één transactie, en dat is niet vanzelfsprekend.** `docs/DEPLOY.md` §2.2b
--    past migraties toe met `psql -v ON_ERROR_STOP=1 -f`, zónder `-1`. Faalt de
--    `create policy` nadat de `drop policy if exists` geslaagd is, dan staat
--    `commitments` met RLS aan en zonder SELECT-policy: dan leest niemand meer
--    iets, ook de eigenaar niet. Dat faalt naar de veilige kant, maar het is een
--    storing op de tabel die het hele commitment-scherm draagt. 0168 en 0169
--    doen dit allebei al. Uit de security-review van 07-09-2026.
begin;

create or replace function deelt_groep_met_eigenaar(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select shares_group_with_user((select owner_id from goals where id = g));
$$;

revoke all on function deelt_groep_met_eigenaar(uuid) from public, anon, authenticated;
grant execute on function deelt_groep_met_eigenaar(uuid) to authenticated;

create or replace function getuigenissen()
returns table (
  id            uuid,
  type          text,
  body          text,
  status        text,
  confirmed_at  timestamptz,
  created_at    timestamptz,
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
    -- ⚠️ De band die de aanwijzing droeg, moet er nog zijn — QS8-306. Dezelfde
    --    invariant die `commitments_insert` bij het aanmaken eist, en dezelfde
    --    die `getuigenissen_voor()` (0178) sinds QS8-298 voor de melding
    --    hanteert. Hier mag het via de helper, want de kijker ís `auth.uid()`.
    and deelt_groep_met_eigenaar(c.goal_id)
  order by c.confirmed_at desc, c.id;
$$;

revoke all on function getuigenissen() from public, anon, authenticated;
grant execute on function getuigenissen() to authenticated;

-- ⚠️ **En de rij eronder.** Zonder deze helft maakt de functie hierboven het
--    blok leeg terwijl het leesrecht blijft staan, en dan is de regel alleen in
--    de UI afgedwongen. De database dwingt hem pas af als de policy hem draagt.
drop policy if exists commitments_select on commitments;
create policy commitments_select on commitments
  for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    or (
      beneficiary_group_id is not null
      and status = any (commitment_zichtbaar_voor_groep())
      and mag_groep_lezen(beneficiary_group_id)
    )
    or (
      beneficiary_user_id = (select auth.uid())
      and status = any (commitment_zichtbaar_voor_persoon())
      and deelt_groep_met_eigenaar(goal_id)
    )
  );

-- ⚠️ **Het commentaar is hier de grendel tegen een verwisseling.** Er staan nu
--    drie `security definer`-functies met de handtekening `(g uuid) -> boolean`
--    die alle drie iets over groepen zeggen en alle drie iets ánders bedoelen:
--    `shares_group_with_goal()` vraagt of het dóél aan een gedeelde groep hangt,
--    `deelt_open_groep_met_doel()` idem maar alleen open groepen, en deze vraagt
--    of je een groep deelt met de **eigenaar**. Ze zijn tegen elkaar in te
--    wisselen zonder dat er iets van omvalt bij het compileren — en dat is
--    precies de fout die 0178 in zijn eerste versie maakte. Uit de
--    security-review van 07-09-2026.
comment on function deelt_groep_met_eigenaar(uuid) is
  'Deelt de aanroeper een groep met de EIGENAAR van dit doel? Niet te verwarren met '
  'shares_group_with_goal(), die vraagt of het doel aan een gedeelde groep hangt — een '
  'doel hoeft aan geen enkele groep te hangen. Delegeert naar shares_group_with_user() '
  'zodat er een opvatting van groepsgenoot is en niet twee; gearchiveerde groepen tellen '
  'mee, want dit is de leeskant. Bestaat voor commitments_select, die de band niet zelf '
  'kan uitrekenen: een subquery in een policy leest goals onder RLS. QS8-306, 0182.';

commit;
