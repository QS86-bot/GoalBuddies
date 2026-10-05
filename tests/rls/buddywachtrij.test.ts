import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql } from './psql-stack';

import { en } from '../../src/shared/i18n/en';
import { nl } from '../../src/shared/i18n/nl';

/**
 * De wachtrij voor buddy's die je niet kent — QS8-233, migraties 0299 en 0300.
 *
 * ⚠️⚠️ **Dit bestand toetst de kéten en niet de policy.** Elke client-handeling
 *    loopt langs écht PostgREST met een écht JWT; alleen de matcher draait over
 *    `psql`, want `vorm_buddygroepen()` draagt geen `grant execute to
 *    authenticated` en hoort dat ook nooit te krijgen. Dat is precies de
 *    opdeling die de feature heeft: de gebruiker meldt zich aan, een pas op het
 *    uur vormt de groep.
 *
 * ⚠️ **De must-deny weegt hier zwaarder dan de must-allow**, want de belofte is
 *    een negatieve: een wachtrijrij zegt dat deze persoon een doel in deze
 *    categorie met deze streefdatum heeft en actief buddy's zoekt, en dat is van
 *    niemand anders. Ook niet van een toekomstige groepsgenoot.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 240_000;

/** Drie mensen in dezelfde bak, en een vierde die er met opzet buiten valt. */
let alice: TestUser;
let bob: TestUser;
let carla: TestUser;
let dave: TestUser;

const doelen = new Map<string, string>();

function uitkomst(fout: { code?: string } | null): string {
  return fout === null ? 'toegelaten' : `geweigerd ${fout.code}`;
}

function antwoord(data: unknown): string {
  const gelezen = (data ?? {}) as { ok?: boolean; reason?: string };
  if (gelezen.ok === true) return gelezen.reason === undefined ? 'ok' : `ok:${gelezen.reason}`;
  return gelezen.reason ?? 'geen antwoord';
}

/**
 * ⚠️ Het doel krijgt zijn categorie en streefdatum hier, want dat zijn twee van
 *    de drie matchassen. De derde — de week-startdag — staat op het profiel en
 *    wordt in `beforeAll` gezet.
 */
async function maakDoel(
  eigenaar: TestUser,
  titel: string,
  dagen: number,
  categorie = 'fitness',
): Promise<string> {
  const datum = new Date(Date.now() + dagen * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await eigenaar.db
    .from('goals')
    .insert({ owner_id: eigenaar.id, title: titel, category: categorie, target_date: datum })
    .select('id')
    .single();
  if (error) throw new Error(`doel ${titel}: ${error.message}`);
  doelen.set(titel, data.id);
  return data.id;
}

/** De matcher, als `service_role` — de enige rol die hem mag aanroepen. */
function draaiMatcher(): { bakken: number; gevormd: number; leden: number } {
  const ruw = psql(
    `select public.vorm_buddygroepen(current_date, 20)::text`,
  ).trim();
  return JSON.parse(ruw) as { bakken: number; gevormd: number; leden: number };
}

/** De groepen die uit de wachtrij gevormd zijn, met hun grendelstand. */
function automatischeGroepen(): readonly {
  id: string;
  zichtbaarheid: string;
  ontdekbaar: boolean;
  created_by: string | null;
  invite_revoked: boolean;
  leden: number;
}[] {
  const ruw = psql(
    `select coalesce(json_agg(r), '[]')::text from (
       select g.id::text, g.zichtbaarheid, g.ontdekbaar, g.created_by::text, g.invite_revoked,
              (select count(*) from group_members m where m.group_id = g.id) as leden
       from groups g where g.automatisch
     ) r`,
  ).trim();
  return JSON.parse(ruw);
}

describe.skipIf(!rlsTestsConfigured)('de wachtrij voor onbekende buddys', () => {
  beforeAll(async () => {
    alice = await createTestUser('wachtrij-alice');
    bob = await createTestUser('wachtrij-bob');
    carla = await createTestUser('wachtrij-carla');
    dave = await createTestUser('wachtrij-dave');

    // ⚠️ Alice, Bob en Carla op dezelfde week-startdag; Dave met opzet op een
    //    andere. Die laatste is de harde eis van domeinregel 1 en de scherpste
    //    must-deny die deze feature heeft.
    const zelfde = [alice.id, bob.id, carla.id].map((id) => `'${id}'`).join(',');
    psql(`update profiles set week_start_day = 1 where id in (${zelfde})`);
    psql(`update profiles set week_start_day = 4 where id = '${dave.id}'`);

    await maakDoel(alice, 'wachtrij-a', 40);
    await maakDoel(bob, 'wachtrij-b', 45);
    await maakDoel(carla, 'wachtrij-c', 50);
    await maakDoel(dave, 'wachtrij-d', 42);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  describe('aanmelden loopt uitsluitend over de RPC', () => {
    it(
      'zonder bevestiging komt er geen rij, met bevestiging precies één',
      async () => {
        const zonder = await alice.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get('wachtrij-a') ?? '',
          p_bevestigd: false,
        });
        expect(uitkomst(zonder.error)).toBe('toegelaten');
        expect(antwoord(zonder.data)).toBe('not_confirmed');

        const met = await alice.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get('wachtrij-a') ?? '',
          p_bevestigd: true,
        });
        expect(antwoord(met.data)).toBe('ok');

        // Nog een keer: idempotent, en nog steeds één rij.
        const weer = await alice.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get('wachtrij-a') ?? '',
          p_bevestigd: true,
        });
        expect(antwoord(weer.data)).toBe('ok:already_queued');

        const { data } = await alice.db.from('goal_match_queue').select('id, status');
        expect(data).toHaveLength(1);
        expect(data?.[0]?.status).toBe('wachtend');
      },
      TEST_TIMEOUT,
    );

    it(
      'een kale INSERT, UPDATE en DELETE komen er alle drie niet door',
      async () => {
        const ingevoerd = await alice.db.from('goal_match_queue').insert({
          goal_id: doelen.get('wachtrij-a') ?? '',
          user_id: alice.id,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        });
        expect(uitkomst(ingevoerd.error)).not.toBe('toegelaten');

        await alice.db.from('goal_match_queue').update({ status: 'vertrokken' }).eq('user_id', alice.id);
        await alice.db.from('goal_match_queue').delete().eq('user_id', alice.id);

        // ⚠️ Niet op de foutcode toetsen maar op de uitkomst: PostgREST geeft
        //    een UPDATE die nul rijen raakt een 200 terug. Of de rij er nog
        //    staat is de belofte; of er een foutcode kwam is een detail van de
        //    laag ertussen.
        const { data } = await alice.db.from('goal_match_queue').select('status');
        expect(data).toHaveLength(1);
        expect(data?.[0]?.status).toBe('wachtend');
      },
      TEST_TIMEOUT,
    );

    it(
      'uit de rij stappen kan altijd, en kost geen punt en geen gebeurtenis',
      async () => {
        const voorPunten = psql(
          `select count(*) from points_ledger where user_id = '${bob.id}'`,
        ).trim();

        await bob.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get('wachtrij-b') ?? '',
          p_bevestigd: true,
        });
        const uit = await bob.db.rpc('zoek_buddies_uit', {
          p_goal_id: doelen.get('wachtrij-b') ?? '',
        });
        expect(antwoord(uit.data)).toBe('ok');

        const rij = psql(
          `select q.status || '|' || (q.decided_at is not null)::text
             from goal_match_queue q join goals g on g.id = q.goal_id
            where g.owner_id = '${bob.id}'`,
        ).trim();
        expect(rij).toBe('vertrokken|true');

        expect(psql(`select count(*) from points_ledger where user_id = '${bob.id}'`).trim()).toBe(
          voorPunten,
        );
        // ⚠️ **Beide kolommen, en dat is geen gordel-en-bretels.** `chat_messages`
        //    draagt `sender_id` (wie het plaatste) én `actor_id` (over wie het
        //    gaat, bij een systeembericht). Een toets op één van de twee zou
        //    groen blijven terwijl de andere route een bericht plaatst, en dan
        //    bewaakt deze regel de kolom die ik toevallig eerst intypte.
        expect(
          psql(
            `select count(*) from chat_messages
              where sender_id = '${bob.id}' or actor_id = '${bob.id}'`,
          ).trim(),
        ).toBe('0');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de stand is van de eigenaar en van niemand anders', () => {
    it(
      'een ander leest je wachtrijrij niet, met een kaal verzoek',
      async () => {
        const { data, error } = await carla.db
          .from('goal_match_queue')
          .select('id, user_id, goal_id');
        expect(uitkomst(error)).toBe('toegelaten');

        // ⚠️ Nul rijen en geen fout: een fout zou verklappen dat er iets te
        //    weigeren was.
        expect(data).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'buddyzoek_stand geeft een ander nul rijen op jouw doel',
      async () => {
        const vandaag = new Date().toISOString().slice(0, 10);

        const eigen = await alice.db.rpc('buddyzoek_stand', {
          p_goal_id: doelen.get('wachtrij-a') ?? '',
          p_vandaag: vandaag,
        });
        expect(uitkomst(eigen.error)).toBe('toegelaten');
        expect(eigen.data).toHaveLength(1);

        const vreemd = await carla.db.rpc('buddyzoek_stand', {
          p_goal_id: doelen.get('wachtrij-a') ?? '',
          p_vandaag: vandaag,
        });
        expect(uitkomst(vreemd.error)).toBe('toegelaten');
        expect(vreemd.data).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'nog_nodig komt nooit boven twee, ook niet met een lege bak',
      async () => {
        // ⚠️ Dit is de grendel en niet de weergave: een exacte telling is met
        //    één verzoek te herhalen terwijl je je categorie varieert, en dan is
        //    het een populatiemeter op de gebruikersbasis.
        const vandaag = new Date().toISOString().slice(0, 10);
        const { data } = await alice.db.rpc('buddyzoek_stand', {
          p_goal_id: doelen.get('wachtrij-a') ?? '',
          p_vandaag: vandaag,
        });
        const rij = (data ?? [])[0] as { nog_nodig?: number } | undefined;
        expect(rij?.nog_nodig).toBeLessThanOrEqual(2);
        expect(rij?.nog_nodig).toBeGreaterThanOrEqual(0);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de matcher, en de grendels op wat hij maakt', () => {
    it(
      'een afwijkende week-startdag breekt de bak — geen groep',
      async () => {
        // ⚠️⚠️ **Drie kandidaten en niet twee, en dat verschil is de hele toets.**
        //    De eerste versie zette er twee in de rij: Alice en Dave, met
        //    verschillende week-startdagen. Die vormen geen groep — maar twee is
        //    óók onder het minimum van drie, dus de uitkomst was hetzelfde mét en
        //    zónder de week-starteis. 📏 Geijkt: de eis uit de matcher halen liet
        //    déze toets groen en maakte de buurtest rood. Een geval dat door een
        //    éérdere grendel al wordt afgevangen, bewaakt niets van wat het
        //    belooft — CLAUDE.md, bij onwrikbare regel 18.
        //
        //    Nu zijn het drie mensen in een eigen categorie: twee op dag 5 en één
        //    op dag 6. Mét de eis is de grootste bak twee en ontstaat er niets;
        //    zónder de eis zijn het er drie en ontstaat er wél een groep.
        const hugo = await createTestUser('wachtrij-hugo');
        const iris = await createTestUser('wachtrij-iris');
        const jonas = await createTestUser('wachtrij-jonas');

        psql(`update profiles set week_start_day = 5 where id in ('${hugo.id}','${iris.id}')`);
        psql(`update profiles set week_start_day = 6 where id = '${jonas.id}'`);

        for (const [gebruiker, titel] of [
          [hugo, 'ws-h'],
          [iris, 'ws-i'],
          [jonas, 'ws-j'],
        ] as const) {
          await maakDoel(gebruiker, titel, 70, 'study');
          await gebruiker.db.rpc('zoek_buddies_aan', {
            p_goal_id: doelen.get(titel) ?? '',
            p_bevestigd: true,
          });
        }

        // Dave erbij in de fitness-bak, ook met een afwijkende dag.
        await dave.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get('wachtrij-d') ?? '',
          p_bevestigd: true,
        });

        const uit = draaiMatcher();
        expect(uit.gevormd).toBe(0);
        expect(automatischeGroepen()).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'drie in dezelfde bak geven één groep, en die is beschermd, zonder oprichter en dicht',
      async () => {
        await bob.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get('wachtrij-b') ?? '',
          p_bevestigd: true,
        });
        await carla.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get('wachtrij-c') ?? '',
          p_bevestigd: true,
        });

        const uit = draaiMatcher();
        expect(uit.gevormd).toBe(1);

        const groepen = automatischeGroepen();
        expect(groepen).toHaveLength(1);
        const groep = groepen[0];
        if (groep === undefined) throw new Error('geen groep');
        registreerGroep(groep.id);

        expect({
          zichtbaarheid: groep.zichtbaarheid,
          ontdekbaar: groep.ontdekbaar,
          oprichter: groep.created_by,
          code_dicht: groep.invite_revoked,
          leden: groep.leden,
        }).toEqual({
          zichtbaarheid: 'beschermd',
          ontdekbaar: false,
          oprichter: null,
          code_dicht: true,
          leden: 3,
        });

        // ⚠️ **De keten loopt door tot een knop** — regel 18, vraag 5. Het lid
        //    moet de groep met een kaal verzoek kunnen lezen, anders staat er
        //    een groep die niemand kan openen.
        const { data } = await alice.db.from('groups').select('id, name').eq('id', groep.id);
        expect(data).toHaveLength(1);

        // En de wachtrijrij draagt de groep.
        const stand = psql(
          `select q.status || '|' || (q.group_id is not null)::text
             from goal_match_queue q join goals g on g.id = q.goal_id
            where g.owner_id = '${alice.id}'`,
        ).trim();
        expect(stand).toBe('gekoppeld|true');
      },
      TEST_TIMEOUT,
    );

    it(
      'een lid krijgt zo n groep niet open, en niet ontdekbaar',
      async () => {
        const groep = automatischeGroepen()[0];
        if (groep === undefined) throw new Error('geen groep');

        // ⚠️⚠️ **`toBe('automatisch')` en niet `not.toBe('ok')`, en dat verschil
        //    is een bevinding uit de security-ronde.** De zwakke vorm bleef groen
        //    terwijl de reden `not_admin` was — en dát was bug B6: de
        //    `automatisch`-tak stond ná `is_group_admin()`, en zo'n groep heeft
        //    per constructie geen beheerder, dus de tak was onbereikbaar voor
        //    precies de groepen waarvoor hij bestaat. De uitkomst was goed en de
        //    grendel die hem moest dragen vuurde nooit.
        //
        //    Regel 18 vraag 3 in zijn zuiverste vorm: deze test kón groen blijven
        //    terwijl de belofte brak, dus hij bewaakte niets.
        const open = await alice.db.rpc('zet_groepszichtbaarheid', {
          p_group_id: groep.id,
          p_naar: 'open',
          p_bevestigd: true,
        });
        expect(antwoord(open.data)).toBe('automatisch');

        const vindbaar = await alice.db.rpc('zet_groepsontdekbaarheid', {
          p_group_id: groep.id,
          p_naar: true,
          p_bevestigd: true,
        });
        expect(antwoord(vindbaar.data)).toBe('automatisch');

        const na = automatischeGroepen()[0];
        expect({ z: na?.zichtbaarheid, o: na?.ontdekbaar }).toEqual({
          z: 'beschermd',
          o: false,
        });
      },
      TEST_TIMEOUT,
    );

    it(
      'ook service_role krijgt de CHECKs niet om',
      () => {
        const groep = automatischeGroepen()[0];
        if (groep === undefined) throw new Error('geen groep');

        // ⚠️ Twee aparte mutaties, want het zijn twee aparte CHECKs. Eén
        //    mutatie voor beide zou de tweede ongemeten laten.
        for (const [kolom, waarde] of [
          ['zichtbaarheid', `'open'`],
          ['ontdekbaar', 'true'],
        ] as const) {
          let gefaald = false;
          try {
            psql(`update groups set ${kolom} = ${waarde} where id = '${groep.id}'`);
          } catch {
            gefaald = true;
          }
          expect(gefaald, `${kolom} had geweigerd moeten worden`).toBe(true);
        }
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een blokkade houdt twee mensen uit elkaar', () => {
    it(
      'wie elkaar geblokkeerd heeft, komt niet in dezelfde groep',
      async () => {
        const eva = await createTestUser('wachtrij-eva');
        const finn = await createTestUser('wachtrij-finn');
        const gijs = await createTestUser('wachtrij-gijs');

        const ids = [eva.id, finn.id, gijs.id].map((i) => `'${i}'`).join(',');
        psql(`update profiles set week_start_day = 2 where id in (${ids})`);

        await maakDoel(eva, 'blok-e', 60);
        await maakDoel(finn, 'blok-f', 62);
        await maakDoel(gijs, 'blok-g', 64);

        // Eva blokkeert Finn, via de echte RPC.
        const geblokkeerd = await eva.db.rpc('blokkeer', { p_user: finn.id });
        expect(antwoord(geblokkeerd.data)).toBe('ok');

        for (const [gebruiker, titel] of [
          [eva, 'blok-e'],
          [finn, 'blok-f'],
          [gijs, 'blok-g'],
        ] as const) {
          await gebruiker.db.rpc('zoek_buddies_aan', {
            p_goal_id: doelen.get(titel) ?? '',
            p_bevestigd: true,
          });
        }

        draaiMatcher();

        // ⚠️ Drie kandidaten waarvan twee elkaar blokkeren, houdt er twee over —
        //    en twee is onder het minimum van drie. Er ontstaat dus géén groep,
        //    en dat is de juiste uitkomst: liever geen groep dan een groep met
        //    een paar erin dat elkaar geweerd heeft.
        const samen = psql(
          `select count(*) from group_members a
             join group_members b on b.group_id = a.group_id
             join groups g on g.id = a.group_id
            where g.automatisch and a.user_id = '${eva.id}' and b.user_id = '${finn.id}'`,
        ).trim();
        expect(samen).toBe('0');
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * ⚠️⚠️ **De naad tussen de bevestigingstekst en de kolomrechten.**
   *
   * Vóór de verzendknop staat één alinea die zegt wat onbekenden straks van je
   * lezen, en die alinea was onwaar: hij noemde de naam, de foto en de
   * weekdoelen, en niet de **titel** en de **notitie** van het doel. 📏 Gemeten
   * op 05-10-2026 met een gevormde automatische groep: een groepsgenoot leest
   * `goals.title` en `goals.description` van twee onbekenden met één verzoek —
   * `goals_select` laat `shares_group_with_goal(id)` toe en `authenticated`
   * heeft `SELECT` op beide kolommen.
   *
   * Deze toets grijpt niet naar de alinea in `app/doel/samen.tsx` maar naar de
   * **belofte**: hij leest uit de database welke vrije-tekstkolommen een
   * groepsgenoot werkelijk kan lezen, en eist dat de tekst elk daarvan noemt —
   * in beide catalogi. Verruimt een latere migratie de leeskant, dan wordt deze
   * test rood omdat de tekst achterloopt, en niet pas als iemand het merkt.
   *
   * ⚠️ En hij faalt dicht: een leesbare vrije-tekstkolom die het register
   * hieronder niet kent, is een fout en geen stilte.
   */
  const VRIJE_TEKST: Record<string, { nl: RegExp; en: RegExp }> = {
    title: { nl: /titel/i, en: /title/i },
    description: { nl: /notitie/i, en: /notes?/i },
    identity_statement: { nl: /identiteits?verklaring|wie je wilt zijn/i, en: /identity/i },
  };

  it(
    'de bevestigingstekst noemt elke vrije-tekstkolom die een groepsgenoot kan lezen',
    async () => {
      const hans = await createTestUser('wachtrij-hans');
      const ilse = await createTestUser('wachtrij-ilse');
      const joost = await createTestUser('wachtrij-joost');

      const ids = [hans.id, ilse.id, joost.id].map((i) => `'${i}'`).join(',');
      psql(`update profiles set week_start_day = 3 where id in (${ids})`);

      await maakDoel(hans, 'tekst-h', 70);
      await maakDoel(ilse, 'tekst-i', 72);
      await maakDoel(joost, 'tekst-j', 74);

      for (const [gebruiker, titel] of [
        [hans, 'tekst-h'],
        [ilse, 'tekst-i'],
        [joost, 'tekst-j'],
      ] as const) {
        await gebruiker.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get(titel) ?? '',
          p_bevestigd: true,
        });
      }

      draaiMatcher();

      // ⚠️ Toetsen op **deze** groep en niet op het aantal automatische groepen
      //    in de database: eerdere tests in dit bestand vormen er ook, en een
      //    teller over het geheel zegt niets over de drie van hierboven.
      const mijnGroep = psql(
        `select count(distinct a.group_id) from group_members a
           join groups g on g.id = a.group_id
          where g.automatisch and a.user_id = '${hans.id}'`,
      ).trim();
      expect(mijnGroep).toBe('1');

      // Wélke vrije-tekstkolommen mag `authenticated` überhaupt lezen?
      const gegund = psql(
        `select column_name from information_schema.column_privileges
          where table_name = 'goals' and grantee = 'authenticated'
            and privilege_type = 'SELECT' order by column_name`,
      )
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);

      // En wat komt er dan werkelijk door PostgREST terug, als groepsgenoot?
      const kolommen = gegund.filter((k) => k in VRIJE_TEKST);
      expect(kolommen.length).toBeGreaterThan(0);

      const gelezen: string[] = [];
      for (const kolom of kolommen) {
        const { data } = await hans.db
          .from('goals')
          .select(`id,${kolom}`)
          .neq('owner_id', hans.id);
        const rijen = data ?? [];
        if (rijen.length > 0) gelezen.push(kolom);
      }

      // ⚠️ Twee onbekenden, niet één: de belofte gaat over de groep en niet over
      //    een toevallige rij. Vraag 6 van onwrikbare regel 18.
      const aantal = (
        await hans.db.from('goals').select('id').neq('owner_id', hans.id)
      ).data?.length;
      expect(aantal).toBe(2);

      expect(gelezen.sort()).toEqual(kolommen.sort());

      for (const kolom of gelezen) {
        const woord = VRIJE_TEKST[kolom];
        if (woord === undefined) {
          throw new Error(
            `\`goals.${kolom}\` is leesbaar voor een groepsgenoot maar staat niet in ` +
              'VRIJE_TEKST. Zet hem erbij met het woord waarmee de tekst hem noemt, ' +
              'of stel vast dat de kolom geen vrije tekst draagt.',
          );
        }
        expect(nl['buddyzoek.bevestig_onbekenden']).toMatch(woord.nl);
        expect(en['buddyzoek.bevestig_onbekenden']).toMatch(woord.en);
      }
    },
    TEST_TIMEOUT,
  );
  /**
   * ⚠️⚠️ **De wrapper van 0301 gooit `p_vandaag` weg, en dit is de meting die
   * dat staande houdt.**
   *
   * `buddyzoek_stand(uuid, date)` nam zijn peildag als argument, en die bepaalde
   * niet alleen de band van de áánvrager maar ook die waartegen anderen
   * vergeleken werden. `nog_nodig` is afgekapt op 0/1/2, maar dat begrenst de
   * amplitude en niet de resolutie: schuif de peildag dag voor dag en op de
   * bandgrens kantelt het getal — en uit het kantelpunt volgt de streefdatum van
   * een vreemde.
   *
   * 0301 laat de handtekening staan (vorm van 0294 en 0186, zodat een gedeployde
   * client de reparatie meteen krijgt) maar geeft het argument nergens meer door.
   *
   * 📏 Geijkt op 05-10-2026 met twee wachtenden aan weerszijden van de
   * 90-dagengrens, streefdatums op +85 en +95 dagen:
   *
   *     peildag          lek      wrapper
   *     vandaag           2          2
   *     vandaag  -5       2          2
   *     vandaag -10       1          2
   *     vandaag -20       1          2
   *     vandaag -90       2          2
   *
   * Die opzet is met opzet gekozen: met twee willekeurige streefdatums beweegt
   * ook de lekke variant niet, en dan toetst deze test niets. Geef `p_vandaag`
   * door aan `doelperiode()` en hij wordt rood.
   */
  it(
    'de peildag van de oude handtekening beweegt de uitkomst niet',
    async () => {
      const kaat = await createTestUser('wachtrij-kaat');
      const lars = await createTestUser('wachtrij-lars');

      const ids = [kaat.id, lars.id].map((i) => `'${i}'`).join(',');
      psql(`update profiles set week_start_day = 5 where id in (${ids})`);

      // ⚠️ +85 en +95: de één onder en de ander boven de 90-dagengrens van
      //    `doelperiode()`. Bij een peildag tien dagen terug vallen ze in
      //    dezelfde band, en dáár kantelt het getal als de peildag doorwerkt.
      await maakDoel(kaat, 'peil-k', 85, 'study');
      await maakDoel(lars, 'peil-l', 95, 'study');

      for (const [gebruiker, titel] of [
        [kaat, 'peil-k'],
        [lars, 'peil-l'],
      ] as const) {
        const aan = await gebruiker.db.rpc('zoek_buddies_aan', {
          p_goal_id: doelen.get(titel) ?? '',
          p_bevestigd: true,
        });
        expect(antwoord(aan.data)).toBe('ok');
      }

      const dag = (verschuiving: number): string =>
        new Date(Date.now() + verschuiving * 86_400_000).toISOString().slice(0, 10);

      const uitkomsten: (number | undefined)[] = [];
      for (const verschuiving of [0, -5, -10, -20, -90]) {
        const { data, error } = await kaat.db.rpc('buddyzoek_stand', {
          p_goal_id: doelen.get('peil-k') ?? '',
          p_vandaag: dag(verschuiving),
        });
        expect(uitkomst(error)).toBe('toegelaten');
        const rij = (data ?? [])[0] as { nog_nodig?: number } | undefined;
        uitkomsten.push(rij?.nog_nodig);
      }

      // ⚠️ Eén uitkomst, en niet "allemaal ≤ 2": dat laatste blijft groen terwijl
      //    het getal tussen 1 en 2 heen en weer gaat, en dát ís het orakel.
      expect(new Set(uitkomsten).size).toBe(1);
      expect(uitkomsten[0]).toBeDefined();

      // En de kale versie geeft hetzelfde — anders is de wrapper niet inert maar
      // alleen constant.
      const { data: kaal } = await kaat.db.rpc('buddyzoek_stand', {
        p_goal_id: doelen.get('peil-k') ?? '',
      });
      const kaleRij = (kaal ?? [])[0] as { nog_nodig?: number } | undefined;
      expect(kaleRij?.nog_nodig).toBe(uitkomsten[0]);
    },
    TEST_TIMEOUT,
  );

});
