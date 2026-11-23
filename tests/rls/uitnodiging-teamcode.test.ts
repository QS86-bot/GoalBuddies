import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  anonDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { laatOrganisatieAanmaken } from './organisatie-toelating';
import { psql } from './psql-stack';

/**
 * Een teamcode toont buitenstaanders geen namen of doelen — QS8-807, migratie 0342.
 *
 * ⚠️⚠️ **De belofte is niet "het veld `detailed` is false" maar: wie geen actief lid van díe organisatie is,
 *    krijgt geen enkele naam of doeltitel van een teamlid te zien — ook niet via een doorgestuurde code en ook
 *    niet buiten de UI om.** Daarom zoekt de toets de echte naam en de echte doeltitel in het héle antwoord
 *    (`JSON.stringify`) en niet alleen in `members`: een herdefinitie die ze ergens anders neerzet, wordt hier rood.
 *
 * ⚠️ **En de kale kaart heeft dezelfde tien sleutels als de volle** (criterium 2), zodat de vorm van het antwoord
 *    niet meer verraadt dan het besluit accepteert. Wat hij wél verraadt, staat in de kop van 0342 en in rij 7 van
 *    `docs/decisions/002-domeinregel7-oppervlakken.md`: een lege `members` bij `member_count` > 0. Door Quinten
 *    geaccepteerd (23-11-2026).
 *
 * ⚠️ **Een gewone groep verandert niet**, en ook dat is hier een toets: een ingelogde buitenstaander leest bij een
 *    gewone groep nog steeds namen en doelen, en anon voornamen.
 *
 * Alle rollen via de echte RPC's en met echte JWT's (PostgREST), geen handgezette lidmaatschappen.
 *
 * IJKING — met de hand gedraaid op 23-11-2026 tegen de lokale stack (Postgres 16 + PostgREST 12.2.12, alle 345
 * migraties), mutatie per grendel op de gedeployde functie en daarna 0342 hersteld (10/10 groen). Per mutatie staat
 * erbij wélke rollen omvielen:
 *
 *   G0  de hele functie terug naar 0341 (zonder de reparatie)
 *       → 📏 2 rood: anon, buitenstaander en uitgezet organisatielid krijgen namen, medelid en beheerder het
 *         aandeel van een ander.
 *   G1  de kale tak uit (`if false then`)
 *       → 📏 2 rood: anon (voornamen), buitenstaander en uitgezet organisatielid (namen en doelen); de
 *         groepsveldentoets ziet een niet-lege `members`.
 *   G2  `actief_organisatielid()` vervangen door een `exists` zonder statustoets
 *       → 📏 rood op alleen het uitgezette organisatielid (volle kaart), plus de teamtoets van 0341.
 *   G3  `and not is_aandeel_van_een_ander(gg.id)` weg
 *       → 📏 rood op medelid én beheerder (`aandeel_zichtbaar: true`).
 *   G3b de uitsluiting alleen voor groepsleden opgeheven (`or is_group_member(g.id)`)
 *       → 📏 rood op alleen het medelid.
 *   G3c de uitsluiting alleen voor niet-groepsleden opgeheven (`or not is_group_member(g.id)`)
 *       → 📏 rood op alleen de beheerder.
 *   G4  `and ingelogd` weg uit `teamlid`
 *       → 📏 0 rood, en dat is juist: `actief_organisatielid(org, null)` is al false. Een kortsluiting en geen
 *         eigen grendel, net als I in `tests/rls/uitnodiging-klassement.test.ts`.
 *   G5  `kaal := not teamlid` (ook zonder organisatie)
 *       → 📏 rood op de gewone-groeptoets hier en de sleutelsettoets van 0341: een gewone groep zou veranderen.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 120_000;

/** De sleutels van `invite_preview()` sinds 0341, voor de volle én de kale kaart. */
const SLEUTELS = [
  'detailed',
  'group_id',
  'group_name',
  'huddle_day',
  'icon',
  'klassement_aan',
  'member_count',
  'members',
  'teamgroep',
  'zichtbaarheid',
].sort();

const AANDEELTITEL = 'Geheim aandeel van het teamlid';
const TEAMDOELTITEL = 'Kwartaaldoel van het team';
const GEWOONTITEL = 'Gedeeld doel in een gewone groep';
const MEDELIDTITEL = 'Gewoon gedeeld doel van het medelid';
const TEAMLID_VOORNAAM = 'Teuntje';
const TEAMLID_NAAM = `${TEAMLID_VOORNAAM} Teamlidsma`;

function streefdatum(dagen: number): string {
  return new Date(Date.now() + dagen * 86_400_000).toISOString().slice(0, 10);
}

type Kaart = Record<string, unknown> | null;

describe.skipIf(!rlsTestsConfigured)('een teamcode toont buitenstaanders geen namen of doelen', () => {
  let beheerder: TestUser;
  let teamlid: TestUser;
  let medelid: TestUser;
  let uitgezetTeamlid: TestUser;
  let uitgezetOrglid: TestUser;
  let buitenstaander: TestUser;
  let gewoneEigenaar: TestUser;
  let teamcode: string;
  let gewoneCode: string;
  let teamlidNaam: string;
  let gewoneNaam: string;
  const groepen: string[] = [];
  const organisaties: string[] = [];

  async function rpc(wie: TestUser, naam: string, args: Record<string, unknown>) {
    const r = await wie.db.rpc(naam as never, args as never);
    if (r.error) throw new Error(`${naam}: ${r.error.message}`);
    return r.data as unknown as Record<string, unknown> | null;
  }

  async function kaart(wie: TestUser | null, code: string): Promise<Kaart> {
    const db = wie === null ? anonDb() : wie.db;
    const { data, error } = await db.rpc('invite_preview', { code });
    if (error) throw new Error(`invite_preview: ${error.message}`);
    return data as unknown as Kaart;
  }

  function naam(id: string): string {
    return psql(`select display_name from profiles where id = '${id}'`).trim();
  }

  beforeAll(async () => {
    [beheerder, teamlid, medelid, uitgezetTeamlid, uitgezetOrglid, buitenstaander, gewoneEigenaar] = await Promise.all([
      createTestUser('teamcode-beheerder'),
      createTestUser('teamcode-teamlid'),
      createTestUser('teamcode-medelid'),
      createTestUser('teamcode-uitgezet'),
      createTestUser('teamcode-uitgezet-orglid'),
      createTestUser('teamcode-buitenstaander'),
      createTestUser('teamcode-gewoon'),
    ]);

    // De organisatie en de teamgroep, langs de echte knoppen.
    await laatOrganisatieAanmaken(beheerder);
    const org = (await rpc(beheerder, 'maak_organisatie', { p_naam: 'Teamcode BV' }))?.organization_id as string;
    expect(org, 'maak_organisatie gaf geen id').toBeTruthy();
    organisaties.push(org);
    const orgcode = (
      await rpc(beheerder, 'organisatie_uitnodigcode', {
        p_organization_id: org,
      })
    )?.code as string;
    for (const wie of [teamlid, medelid, uitgezetTeamlid, uitgezetOrglid]) {
      expect((await rpc(wie, 'word_organisatielid', { p_code: orgcode }))?.ok).toBe(true);
    }
    const team = (
      await rpc(beheerder, 'maak_teamgroep', {
        p_organization_id: org,
        p_naam: 'Team Teamcode',
      })
    )?.group_id as string;
    expect(team, 'maak_teamgroep gaf geen id').toBeTruthy();
    groepen.push(team);
    registreerGroep(team);
    const rij = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    teamcode = (rij.data as { invite_code: string } | null)?.invite_code ?? '';
    expect(teamcode, 'een teamgroep zonder code toetst niets').toBeTruthy();

    for (const wie of [teamlid, medelid, uitgezetTeamlid]) {
      expect((await rpc(wie, 'join_group_with_code', { code: teamcode }))?.ok).toBe(true);
    }

    // Het aandeel dat via `goal_group_links` aan de teamgroep hangt (0319): precies wat lekte.
    const td = await rpc(teamlid, 'maak_teamdoel', {
      p_group_id: team,
      p_titel: TEAMDOELTITEL,
      p_streefdatum: streefdatum(90),
    });
    const aandeel = await rpc(teamlid, 'neem_aandeel', {
      p_team_goal_id: td?.team_goal_id,
    });
    expect(aandeel?.ok, JSON.stringify(aandeel)).toBe(true);
    const aandeelId = aandeel?.goal_id as string;
    const titel = await teamlid.db
      .from('goals')
      .update({ title: AANDEELTITEL } as never)
      .eq('id', aandeelId);
    expect(titel.error, titel.error?.message).toBeNull();

    // Een gewoon (geen aandeel) doel van het medelid aan de teamgroep: dat blijft voor organisatieleden zichtbaar.
    const gewoonInTeam = await medelid.db
      .from('goals')
      .insert({
        owner_id: medelid.id,
        title: MEDELIDTITEL,
        target_date: streefdatum(60),
      } as never)
      .select('id')
      .single();
    expect(gewoonInTeam.error, gewoonInTeam.error?.message).toBeNull();
    const k = await medelid.db.from('goal_group_links').insert({
      goal_id: (gewoonInTeam.data as { id: string }).id,
      group_id: team,
    } as never);
    expect(k.error, k.error?.message).toBeNull();

    // Pas ná het joinen uit de organisatie gezet: het "uitgezette teamlid" was er echt in. Het tweede uitgezette
    // lid joinde nooit; dat is de rol die de statustoets van `actief_organisatielid()` in 0342 bewaakt.
    for (const wie of [uitgezetTeamlid, uitgezetOrglid]) {
      const z = await beheerder.db.rpc(
        'zet_organisatielid_uit' as never,
        { p_organization_id: org, p_user_id: wie.id } as never,
      );
      expect(z.error, z.error?.message).toBeNull();
      const stand = psql(
        `select status from organization_members where organization_id = '${org}' and user_id = '${wie.id}'`,
      ).trim();
      expect(stand).not.toBe('active');
    }

    // Een gewone groep met een gedeeld doel: de vergelijking die niet mag veranderen.
    const g = await rpc(gewoneEigenaar, 'create_group', {
      group_name: 'Gewone groep',
      huddle_day: 1,
    });
    const groep = g?.group as { id: string; invite_code: string };
    groepen.push(groep.id);
    registreerGroep(groep.id);
    gewoneCode = groep.invite_code;
    const doel = await gewoneEigenaar.db
      .from('goals')
      .insert({
        owner_id: gewoneEigenaar.id,
        title: GEWOONTITEL,
        target_date: streefdatum(90),
      } as never)
      .select('id')
      .single();
    expect(doel.error, doel.error?.message).toBeNull();
    const koppel = await gewoneEigenaar.db.from('goal_group_links').insert({
      goal_id: (doel.data as { id: string }).id,
      group_id: groep.id,
    } as never);
    expect(koppel.error, koppel.error?.message).toBeNull();

    // Een eigen naam van twee woorden: `createTestUser` noemt iedereen "Test <label>", en dan bewijst een
    // voornaamtoets niets (anon kreeg vóór 0342 het eerste woord, en dat was voor elk lid "Test").
    const hernoem = await adminDb()
      .from('profiles')
      .update({ display_name: TEAMLID_NAAM } as never)
      .eq('id', teamlid.id);
    expect(hernoem.error, hernoem.error?.message).toBeNull();
    teamlidNaam = naam(teamlid.id);
    expect(teamlidNaam).toBe(TEAMLID_NAAM);
    gewoneNaam = naam(gewoneEigenaar.id);
    expect(teamlidNaam.length, 'een lege naam toetst niets').toBeGreaterThan(0);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin
        .from('team_goals' as never)
        .delete()
        .in('group_id' as never, groepen as never);
      await admin.from('group_members').delete().in('group_id', groepen);
      await admin.from('groups').delete().in('id', groepen);
    }
    if (organisaties.length > 0) {
      await admin
        .from('organization_members' as never)
        .delete()
        .in('organization_id' as never, organisaties as never);
      await admin
        .from('organizations' as never)
        .delete()
        .in('id' as never, organisaties as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * Wat een rol bij de teamcode te zien krijgt, teruggebracht tot wat de belofte toetst. Eén object over alle
   * rollen en één `toEqual`: een ijking moet laten zien wélke rollen omvallen, niet alleen de eerste.
   */
  function samenvatting(uit: Kaart) {
    if (uit === null) return null;
    const tekst = JSON.stringify(uit);
    return {
      sleutels: Object.keys(uit).sort(),
      detailed: uit.detailed,
      teamgroep: uit.teamgroep,
      leden: Array.isArray(uit.members) ? uit.members.length > 0 : 'geen array',
      member_count_positief: typeof uit.member_count === 'number' && uit.member_count > 0,
      naam_zichtbaar: tekst.includes(teamlidNaam),
      voornaam_zichtbaar: tekst.includes(TEAMLID_VOORNAAM),
      aandeel_zichtbaar: tekst.includes(AANDEELTITEL),
      gewoon_doel_zichtbaar: tekst.includes(MEDELIDTITEL),
    };
  }

  /** Een actief organisatielid: namen en gewone gedeelde doelen, nooit andermans aandeel (optie A). */
  const VOL = {
    sleutels: SLEUTELS,
    detailed: true,
    teamgroep: true,
    leden: true,
    member_count_positief: true,
    naam_zichtbaar: true,
    voornaam_zichtbaar: true,
    aandeel_zichtbaar: false,
    gewoon_doel_zichtbaar: true,
  };
  /** De eigenaar van het aandeel ziet zijn eigen aandeel wél. */
  const VOL_EIGEN_AANDEEL = { ...VOL, aandeel_zichtbaar: true };
  const KAAL = {
    sleutels: SLEUTELS,
    detailed: false,
    teamgroep: false,
    leden: false,
    member_count_positief: true,
    naam_zichtbaar: false,
    voornaam_zichtbaar: false,
    aandeel_zichtbaar: false,
    gewoon_doel_zichtbaar: false,
  };

  it(
    'teamcode: alleen een actief organisatielid ziet namen en doelen, nooit andermans aandeel; anon, een buitenstaander en een uitgezet lid krijgen de kale kaart of niets',
    async () => {
      const rollen = [
        [teamlid, 'actief teamlid, eigenaar van het aandeel', VOL_EIGEN_AANDEEL],
        [medelid, 'actief medelid van de teamgroep', VOL],
        [beheerder, 'organisatiebeheerder, niet in de groep', VOL],
        [null, 'anon', KAAL],
        [buitenstaander, 'ingelogde buitenstaander', KAAL],
        // 📏 Gemeten: uitzetten zet ook het groepslidmaatschap op `inactive`, en dan geeft de wachttak van 0277
        //    `null` — al vóór 0342. Geen kaart is strenger dan de kale kaart, en dus ook goed.
        [uitgezetTeamlid, 'uitgezet teamlid (was in de groep)', null],
        [uitgezetOrglid, 'uitgezet organisatielid (nooit in de groep)', KAAL],
      ] as const;
      const gelezen: Record<string, unknown> = {};
      const verwacht: Record<string, unknown> = {};
      for (const [wie, rol, wat] of rollen) {
        gelezen[rol] = samenvatting(await kaart(wie, teamcode));
        verwacht[rol] = wat;
      }
      expect(gelezen).toEqual(verwacht);
    },
    TEST_TIMEOUT,
  );

  it(
    'de kale kaart houdt de groepsvelden (keuze A): naam, aantal, icoon, huddledag, zichtbaarheid, klassement en id',
    async () => {
      const vol = (await kaart(teamlid, teamcode)) ?? {};
      const groepsvelden = (k: Kaart) => {
        const { members: _m, detailed: _d, teamgroep: _t, ...rest } = k ?? {};
        return rest;
      };
      expect({
        anon: groepsvelden(await kaart(null, teamcode)),
        buitenstaander: groepsvelden(await kaart(buitenstaander, teamcode)),
      }).toEqual({
        anon: groepsvelden(vol),
        buitenstaander: groepsvelden(vol),
      });
      expect((await kaart(null, teamcode))?.members).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'een gewone groep verandert niet: een buitenstaander ziet naam en doel, anon alleen de voornaam',
    async () => {
      const ingelogd = (await kaart(buitenstaander, gewoneCode)) ?? {};
      const anon = (await kaart(null, gewoneCode)) ?? {};
      const voornaam = gewoneNaam.split(' ')[0];
      expect({
        ingelogd: {
          sleutels: Object.keys(ingelogd).sort(),
          detailed: ingelogd.detailed,
          naam: JSON.stringify(ingelogd).includes(gewoneNaam),
          doel: JSON.stringify(ingelogd).includes(GEWOONTITEL),
        },
        anon: {
          sleutels: Object.keys(anon).sort(),
          detailed: anon.detailed,
          voornaam: JSON.stringify(anon).includes(`"${voornaam}"`),
          doel: JSON.stringify(anon).includes(GEWOONTITEL),
        },
      }).toEqual({
        ingelogd: {
          sleutels: SLEUTELS,
          detailed: true,
          naam: true,
          doel: true,
        },
        anon: {
          sleutels: SLEUTELS,
          detailed: false,
          voornaam: true,
          doel: false,
        },
      });
    },
    TEST_TIMEOUT,
  );
});
