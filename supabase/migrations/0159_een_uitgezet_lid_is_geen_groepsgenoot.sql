-- 0159_een_uitgezet_lid_is_geen_groepsgenoot.sql — het model van de hulpfuncties
--
-- ROLLBACK-PAD:
--   create or replace function public.shares_group_with_user(other uuid)
--     returns boolean language sql stable security definer
--     set search_path = public, pg_temp
--   as $rb$ select exists (
--     select 1 from group_members mine
--     join group_members theirs on theirs.group_id = mine.group_id
--     where mine.user_id = auth.uid()
--       and mine.status <> 'inactive'
--       and theirs.user_id = other); $rb$;
--
--   ⚠️ Terugrollen zet één lek terug open: een uitgezet lid blijft dan voor de
--      groep leesbaar in `profiles` en in de avataremmer. Geen data, geen
--      handtekening — de functie wordt bij elke aanroep opnieuw geëvalueerd.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-146, dossierrij van 27-08 (risico **Middel**): *"de vier RLS-hulpfuncties
-- delen niet hetzelfde model van wanneer een lidmaatschap meetelt."* Het issue
-- vraagt drie dingen — ze naast elkaar leggen, het model expliciet maken, en
-- gelijktrekken waar ze horen samen te vallen.
--
-- 📏 **Naast elkaar gelegd met `pg_get_functiondef()` op de gedeployde stand**,
--    niet uit de migratiebestanden gelezen. Het zijn er inmiddels zeven en geen
--    vier; `mag_groep_lezen()` (0153), `lid_van_open_groep()` en
--    `deelt_open_groep_met_doel()` (0141) zijn er na die dossierrij bij gekomen.
--
--    | functie | kijker | tegenpartij | archief | open |
--    |---|---|---|---|---|
--    | `is_group_member` | ✓ | n.v.t. | dicht | — |
--    | `is_group_admin` | ✓ (+admin) | n.v.t. | dicht | — |
--    | `mag_groep_lezen` | ✓ | n.v.t. | **open** | — |
--    | `lid_van_open_groep` | ✓ | n.v.t. | dicht | ✓ |
--    | `shares_group_with_goal` | ✓ | ✓ | dicht | — |
--    | `deelt_open_groep_met_doel` | ✓ | ✓ | dicht | ✓ |
--    | `shares_group_with_user` | ✓ | **✗** | **open** | — |
--
--    Op de eerste as is er niets te repareren: 📏 alle zeven schrijven
--    `status <> 'inactive'` en geen enkele `status = 'active'`. Een adempauze is
--    geen uitzetting (0029), en dat staat er overal hetzelfde.
--
-- ---------------------------------------------------------------------------
-- De ene rij die eruit springt, en waarom hij dat mag op één van de twee assen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De archiefkolom is een keuze en geen slordigheid.** 0092 zette de
--    archieftoets in `is_group_member()` omdat daar de schrijfpolicies langs
--    lopen; 0153 splitste de leeskant eraf als `mag_groep_lezen()`, want een
--    archief hoort leesbaar te zijn. `shares_group_with_user()` staat aan de
--    leeskant — hij draagt `profiles_select` en de avataremmer — dus dat hij een
--    archief doorlaat hoort bij het model en blijft zo. `archiefleesgat()` uit
--    0153 bewaakt de andere kant van die splitsing.
--
--    Dat `shares_group_with_goal()` een archief wél dichthoudt terwijl hij ook
--    aan de leeskant staat, is óók een keuze: 0153 schrijft uit dat
--    `weekly_goals` de zwaarste tabel van domeinregel 7 is en dus niet meeging.
--
-- ⚠️⚠️ **De tegenpartijkolom is dat niet.** Daar staat één leeg vakje, en het is
--    hetzelfde vakje dat dit project al een keer geld heeft gekost.
--
-- 0029 schreef de regel op: *"Alleen de kant van de kíjker wordt afgeknepen…
-- Zou dat hier ook meelopen, dan verdween het doel van een uitgezet lid uit het
-- overzicht van de groep — en dat is geschiedenis herschrijven."*
--
-- **0102 heeft die regel omgedraaid**, met een meting erbij: `bob ná het vertrek
-- van alice ziet haar doel: true`. Die kop noemt drie routes naar hetzelfde
-- effect — (a) de eigenaar is vertrokken, (b) de eigenaar staat op `inactive`,
-- (c) de groep is gearchiveerd — en zegt er met zoveel woorden bij dat twee van
-- de drie dichtzetten *"dezelfde fout nog een keer maken"* is.
--
-- ⚠️ **Route (b) staat op `shares_group_with_user()` nog open**, en 0102 ging er
--    niet overheen omdat die migratie over doelen ging. 📏 Gemeten op een verse
--    database uit deze map, als Alice:
--
--      bob is actief lid                        true
--      bob is uitgezet (status = 'inactive')    true      ← het gat
--      carol neemt een adempauze                true      (hoort zo)
--      carol vertrekt (rij weg)                 false
--      bob (uitgezet) ziet alice                false
--
--    **Vertrekken maakt je onzichtbaar, eruit gezet worden niet.** `verlaat_groep()`
--    (0102) verwijdert de rij; `verwijder_lid()` (0145) zet hem op `inactive` en
--    laat hem staan. Twee wegen naar dezelfde toestand, twee verschillende
--    uitkomsten, en nergens een regel die zegt welke van de twee bedoeld is.
--
-- `shares_group_with_user()` draagt `profiles_select` (0003/0122) en de
-- avatarpolicies (0126/0130). Wat er dus lekt is de naam, de avatar, de tijdzone
-- en de week-startdag van iemand die de groep zojuist heeft weggestuurd —
-- onbeperkt, en zonder dat hij er iets van ziet.
--
-- ---------------------------------------------------------------------------
-- Waarom dichtzetten en niet de regel van 0029 herstellen
-- ---------------------------------------------------------------------------
--
-- Het bezwaar van 0029 was dat de geschiedenis onleesbaar wordt. **Dat bezwaar
-- is in de app al beantwoord, en niet door mij.** `src/modules/buddies/chat.ts`
-- zegt het zelf:
--
--   *"`sender_name` valt terug op "Een oud-lid" … de left join laat de naam juist
--    wél leeg bij iemand die de groep verlaten heeft — dan is `profiles_select`
--    niet meer van toepassing, terwijl zijn bericht in het gesprek hoort te
--    blijven staan."*
--
-- De schermen rekenen dus al op een naam die er niet is, voor precies dit geval,
-- en tonen `algemeen.oud_lid`. 📏 Nagemeten dat er ook geen scherm is dat een
-- uitgezet lid nog toont: `app/groep/[id].tsx` filtert `member_status !==
-- 'inactive'` uit de ledenlijst. Er wordt met deze migratie geen enkele rij
-- herschreven en geen enkel bericht onleesbaar — alleen de náám valt terug, net
-- als bij iemand die zelf is vertrokken.
--
-- ⚠️ De omgekeerde reparatie — `verwijder_lid()` de rij laten verwijderen zoals
--    `verlaat_groep()` dat doet — kan niet: `verwijder_lid()` bewaart die rij met
--    opzet, want een uitgezet lid mag niet met dezelfde code weer naar binnen
--    (0029 route 2, `join_group_with_code` weigert het heractiveren van een
--    inactieve rij). De `inactive`-rij ís het slot. Dus hoort de toets in de
--    functie.
--
-- ---------------------------------------------------------------------------

create or replace function public.shares_group_with_user(other uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id   = auth.uid()
      and mine.status   <> 'inactive'
      and theirs.user_id = other
      -- ⚠️ **De tegenpartij hoort er ook nog bij.** Dit was de ontbrekende helft,
      --    dezelfde die 0102 in `shares_group_with_goal()` aanvulde. Zonder deze
      --    regel is een uitgezet lid nog steeds een groepsgenoot en blijft zijn
      --    profiel en avatar leesbaar voor de groep die hem wegstuurde, terwijl
      --    iemand die zélf vertrekt meteen onzichtbaar is.
      and theirs.status <> 'inactive'
  );
$$;

comment on function public.shares_group_with_user(uuid) is
  'Deelt de huidige gebruiker een groep met deze persoon? Beide kanten moeten '
  'er nog bij horen: een uitgezet lid (status inactive) is geen groepsgenoot '
  'meer, in geen van beide richtingen — 0159, QS8-146. Een adempauze (paused) '
  'telt wél mee. Een gearchiveerde groep telt óók mee: deze functie staat aan de '
  'leeskant, net als mag_groep_lezen() (0153). SECURITY DEFINER tegen '
  'RLS-recursie. Het volledige model van de zeven hulpfuncties staat in '
  'docs/decisions/2026-09-04-het-model-van-de-hulpfuncties.md.';

-- ⚠️ `create or replace` behoudt de ACL, maar de vorm van onwrikbare regel 4
--    hoort er te staan: `revoke ... from public, anon` laat `authenticated`
--    precies staan, en `tests/rls/functiegrants.test.ts` noemt een recht zonder
--    grant-regel geërfd en niet besloten.
revoke all on function public.shares_group_with_user(uuid) from public, anon, authenticated;
grant execute on function public.shares_group_with_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- En de andere zes krijgen hun model in hun eigen commentaar
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen enkele definitie verandert hieronder; alleen de uitleg.** Het model
--    stond nergens bij de functies zelf, en dat is precies wat deze rij aanwees:
--    elk verschil tussen deze zeven is een autorisatieverschil, en een verschil
--    dat je niet leest, trek je bij de volgende functie per ongeluk recht of
--    juist scheef. `tests/rls/hulpfunctiemodel.test.ts` legt deze uitspraken
--    naast de gedeployde bron.

comment on function public.is_group_member(uuid) is
  'Actief lid van een niet-gearchiveerde groep? De schríjfkant — elke policy die '
  'schrijft loopt hierlangs (0092). Een uitgezet lid telt niet mee, een '
  'adempauze wel (0029). Leeskant: mag_groep_lezen() (0153). Model: '
  'docs/decisions/2026-09-04-het-model-van-de-hulpfuncties.md.';

comment on function public.is_group_admin(uuid) is
  'Beheerder van een niet-gearchiveerde groep? Een uitgezette beheerder is geen '
  'beheerder meer (0029), en een archief heeft geen beheer nodig (0092). Model: '
  'docs/decisions/2026-09-04-het-model-van-de-hulpfuncties.md.';

comment on function public.shares_group_with_goal(uuid) is
  'Deelt de huidige gebruiker een niet-gearchiveerde groep met de eigenaar van '
  'dit doel? Beide kanten worden getoetst — dat was de reparatie van 0102 '
  '(QS8-57). De archieftoets staat hier wél, anders dan bij de andere '
  'leesfuncties: weekly_goals draagt missed en carried en is de zwaarste tabel '
  'van domeinregel 7 (0153). Model: '
  'docs/decisions/2026-09-04-het-model-van-de-hulpfuncties.md.';

comment on function public.lid_van_open_groep(uuid) is
  'Actief lid van een open, niet-gearchiveerde groep? De grendel onder het '
  'klassement van A54 (0141): in een beschermde groep geeft de RPC nul rijen. '
  'Model: docs/decisions/2026-09-04-het-model-van-de-hulpfuncties.md.';

comment on function public.deelt_open_groep_met_doel(uuid) is
  'Deelt de huidige gebruiker een open, niet-gearchiveerde groep met de eigenaar '
  'van dit doel? Beide kanten getoetst, zoals shares_group_with_goal(). Model: '
  'docs/decisions/2026-09-04-het-model-van-de-hulpfuncties.md.';
