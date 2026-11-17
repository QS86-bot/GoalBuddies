import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Criterium 5 van QS8-652, het structurele deel: **een beheerder ziet niet meer
 * dan een lid** (besluit 6). De rol van een organisatie mag in geen enkel leespad
 * terechtkomen. Het gedragsdeel — beheerder en lid krijgen dezelfde rijen — staat
 * in `tests/rls/organisaties.test.ts`.
 *
 * Drie grendels, en elk heeft hieronder een eigen ijking die precies díe grendel
 * breekt (CLAUDE.md, regel 18: mutatie per grendel, niet één voor het geheel):
 *
 * 1. **Geen SELECT- of ALL-policy** verwijst naar `is_organisatiebeheerder()` of
 *    naar de rol in `organization_members`.
 * 2. **Geen functie en geen view** raakt `organization_members` of de helper,
 *    behalve de rijen in `REGISTER`, elk met een reden. Dat is breder dan "noemt
 *    de rol": een `select *` of een `returns setof organization_members` geeft
 *    de rol ook mee zonder het woord te noemen (security-ronde, L5). Een nieuwe
 *    functie is rood tot iemand hem met een reden registreert — en dat is dan
 *    een besluit, geen bijvangst. Een view kan niet geregistreerd worden: die
 *    is standaard eigendom van `postgres` en omzeilt RLS.
 * 3. **`is_organisatiebeheerder()` heeft geen execute voor `authenticated`.**
 *    Een policy draait als de aanroeper, dus een policy die hem ooit aanroept
 *    valt om met 42501 in plaats van stil te verruimen.
 *
 * ⚠️ De catalogusvraag leest de code zónder commentaar
 *    (`code_zonder_commentaar()`), anders telt een functie die de helper alleen
 *    nóémt als een die hem gebruikt — de val die `sleutelzetters()` beschrijft.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'is_organisatiebeheerder'",
  import.meta.url,
);

/** Functies die de rol mogen raken, met de reden. Leesfuncties alleen als label. */
const REGISTER: Readonly<Record<string, string>> = {
  is_organisatiebeheerder: 'de helper zelf',
  is_organisatielid: 'leest alleen het eigen lidmaatschap; geeft een boolean en geen rol',
  maak_organisatie: 'schrijft de rol admin voor de aanmaker',
  word_organisatielid: 'schrijft de rol member voor wie met de code binnenkomt',
  verlaat_organisatie: 'de laatste beheerder kan niet vertrekken',
  zet_organisatielid_uit: 'beheerderspoort; een beheerder zet geen beheerder uit',
  organisatie_uitnodigcode: 'beheerderspoort; geeft een code en geen voortgang',
  vernieuw_organisatiecode: 'beheerderspoort op een schrijfactie',
  organisatieleden: 'toont de rol als label in de ledenlijst; de poort is is_organisatielid() en is voor beheerder en lid gelijk',
  // QS8-653
  actief_organisatielid: 'leest alleen of iemand actief lid is; geeft een boolean en geen rol',
  maak_teamgroep: 'beheerderspoort op een schrijfactie (besluit 13)',
  is_teambeheerder:
    'beheerderspoort voor teambeheer (besluit 34 en 36). ⚠️ Via is_group_admin() ook in ' +
    'group_join_requests_select: een organisatiebeheerder leest de lidmaatschapsverzoeken ' +
    'van zijn teams, zoals elke groepsbeheerder. Dat is beheer en geen voortgang (besluit 6); ' +
    'chat, overzicht, leden en teambalk blijven aan mag_groep_lezen() en dus aan het lidmaatschap. ' +
    'Grendel 1 hieronder ziet deze route via een tussenfunctie niet; zie de afleverregel van QS8-653.',
};

const VRAAG = `
select 'policy|' || schemaname || '.' || tablename || '.' || policyname
  from pg_policies
 where cmd in ('SELECT', 'ALL')
   and (
     (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'is_organisatiebeheerder'
     or ((tablename = 'organization_members'
          or (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'organization_members')
         and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '\\mrole\\M')
   )
union all
select 'functie|' || k.proname
  from (
    -- ⚠️ Eerst grof op de ruwe tekst, dan pas strippen: \`code_zonder_commentaar()\`
    --    over élke functie kost 📏 ruim tien seconden per meting. Een
    --    \`BEGIN ATOMIC\`-functie heeft een lege \`prosrc\`; die leest hij uit
    --    \`pg_get_functiondef()\` (security-ronde, L5).
    select p.proname,
           public.code_zonder_commentaar(
             case when p.prosqlbody is null then p.prosrc else pg_get_functiondef(p.oid) end) as code
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and (p.prosrc ~ '(is_organisatiebeheerder|organization_members)'
            or (p.prosqlbody is not null
                and pg_get_functiondef(p.oid) ~ '(is_organisatiebeheerder|organization_members)'))
     offset 0
  ) k
 where k.code ~ '(is_organisatiebeheerder|organization_members)'
union all
select 'view|' || schemaname || '.' || viewname
  from pg_views
 where schemaname = 'public'
   and definition ~ '(is_organisatiebeheerder|organization_members)'
union all
select 'grant|is_organisatiebeheerder'
 where has_function_privilege('authenticated', 'public.is_organisatiebeheerder(uuid)', 'execute')
union all
select 'bestaat|' || p.proname
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname = any(array[${Object.keys(REGISTER)
     .map((n) => `'${n}'`)
     .join(', ')}]);
`;

interface Uitslag {
  readonly lekken: string[];
  readonly bestaand: Set<string>;
}

/** Draait de vraag in een teruggedraaide transactie, na een optionele mutatie. */
function meet(mutatie = ''): Uitslag {
  const uit = psqlMetInvoer(`begin;\n${mutatie}\n${VRAAG};\nrollback;\n`);
  const regels = uit.split('\n').filter((r) => r.includes('|'));
  const lekken = regels
    .filter((r) => !r.startsWith('bestaat|'))
    .filter((r) => !(r.startsWith('functie|') && r.slice('functie|'.length) in REGISTER));
  const bestaand = new Set(regels.filter((r) => r.startsWith('bestaat|')).map((r) => r.slice('bestaat|'.length)));
  return { lekken, bestaand };
}

describe.runIf(beschikbaar)('de rol van een organisatie komt in geen leespad (QS8-652, criterium 5)', () => {
  it('vandaag: geen policy, geen ongeregistreerde functie en geen grant', () => {
    expect(meet().lekken).toEqual([]);
  });

  it('elke registerrij bestaat nog — een register zonder object is een vrijbrief', () => {
    expect([...meet().bestaand].sort()).toEqual(Object.keys(REGISTER).sort());
  });

  // -------------------------------------------------------------------------
  // IJking, één mutatie per grendel
  // -------------------------------------------------------------------------

  it('ijking grendel 1: een tak "of beheerder" op een SELECT-policy wordt gemeld', () => {
    const { lekken } = meet(`
      create policy ijk_beheerder_leest on public.goals for select to authenticated
        using (exists (select 1 from public.organization_members om
                        where om.user_id = (select auth.uid()) and om.role = 'admin'));`);
    expect(lekken).toEqual(['policy|public.goals.ijk_beheerder_leest']);
  });

  it('ijking grendel 1b: een policy die de helper aanroept wordt gemeld', () => {
    const { lekken } = meet(`
      create policy ijk_helper_leest on public.organizations for select to authenticated
        using (public.is_organisatiebeheerder(id));`);
    expect(lekken).toEqual(['policy|public.organizations.ijk_helper_leest']);
  });

  it('ijking grendel 2: een leesfunctie met de beheerderspoort wordt gemeld', () => {
    const { lekken } = meet(`
      create function public.ijk_beheerder_leesfunctie(p uuid) returns setof public.goals
        language sql stable security definer set search_path = public, pg_temp
        as $$ select * from goals where is_organisatiebeheerder(p) $$;`);
    expect(lekken).toEqual(['functie|ijk_beheerder_leesfunctie']);
  });

  it('ijking grendel 2b: commentaar dat de helper noemt telt niet als gebruik', () => {
    const { lekken } = meet(`
      create function public.ijk_alleen_commentaar() returns integer
        language sql stable set search_path = public, pg_temp
        as $$ -- is_organisatiebeheerder() hoort hier niet
              select 1 $$;`);
    expect(lekken).toEqual([]);
  });

  it('ijking grendel 2c: een functie die de lidtabel teruggeeft zonder "role" te noemen wordt gemeld', () => {
    const { lekken } = meet(`
      create function public.ijk_alle_lidmaatschappen() returns setof public.organization_members
        language sql stable security definer set search_path = public, pg_temp
        as $$ select * from organization_members $$;`);
    expect(lekken).toEqual(['functie|ijk_alle_lidmaatschappen']);
  });

  it('ijking grendel 2d: een view over de lidtabel wordt gemeld', () => {
    const { lekken } = meet('create view public.ijk_ledenview as select * from public.organization_members;');
    expect(lekken).toEqual(['view|public.ijk_ledenview']);
  });

  it('ijking grendel 3: een grant op de helper wordt gemeld', () => {
    const { lekken } = meet(
      'grant execute on function public.is_organisatiebeheerder(uuid) to authenticated;',
    );
    expect(lekken).toEqual(['grant|is_organisatiebeheerder']);
  });
});
