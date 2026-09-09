/**
 * De bewijsfoto-bucket (0227), de kolomgrens (0229) en de rem (0228) — QS8-391.
 *
 * ⚠️ Dit is de ónderdeeltest. De belofte — "een bewijsfoto volgt zijn
 *    voltooiing" — staat in `een-bewijsfoto-volgt-zijn-voltooiing.test.ts`, en
 *    die kan groen blijven terwijl deze rood wordt en andersom. 📏 Dat is
 *    gemeten: met de leesfunctie op `security definer` blijft déze suite
 *    volledig groen en gaat de naadtest op één geval rood.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from storage.buckets where id = 'bewijsfotos'",
  import.meta.url,
);

/** Voert `sql` uit als deze gebruiker en geeft de foutcode terug, of 'OK'. */
function alsMetCode(userId: string, sql: string): string {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' }).replace(/'/g, "''");
  try {
    psql(
      `begin;
       select set_config('request.jwt.claims', '${claims}', true);
       set local role authenticated;
       ${sql};
       rollback;`,
    );
    return 'OK';
  } catch (fout) {
    const tekst = fout instanceof Error ? fout.message : String(fout);
    const code = /SQLSTATE (\w+)|ERROR:\s+(\w+)/.exec(tekst);
    if (/violates check constraint/.test(tekst)) return '23514';
    if (/row-level security|violates row-level/.test(tekst)) return '42501';
    return code?.[1] ?? 'FOUT';
  }
}

describe.runIf(beschikbaar)('de bewijsfoto-bucket (0227) en de kolomgrens (0229)', () => {
  const alice = randomUUID();
  const bob = randomUUID();
  let groep = '';
  let doel = '';
  let week = '';
  let weekTwee = '';

  beforeAll(() => {
    for (const id of [alice, bob]) {
      psql(
        `insert into auth.users (id, email) values ('${id}', '${id}@bucket.local')
         on conflict (id) do nothing`,
      );
    }
    groep = psql(
      `insert into public.groups (name, created_by, invite_code)
       values ('Bucket', '${alice}', 'BKT${alice.slice(0, 9).replace(/-/g, '')}') returning id`,
    );
    for (const id of [alice, bob]) {
      psql(
        `insert into public.group_members (group_id, user_id, role, status)
         values ('${groep}', '${id}', 'member', 'active') on conflict do nothing`,
      );
    }
    doel = psql(
      `insert into public.goals (owner_id, title, target_date)
       values ('${alice}', 'Bucketdoel', current_date + 60) returning id`,
    );
    week = psql(
      `insert into public.weekly_goals (goal_id, title, cycle_start_date, status)
       values ('${doel}', 'Week', current_date, 'pending') returning id`,
    );
    weekTwee = psql(
      `insert into public.weekly_goals (goal_id, title, cycle_start_date, status)
       values ('${doel}', 'Week 2', current_date, 'pending') returning id`,
    );
  });

  afterAll(() => {
    psql(`delete from storage.objects where bucket_id = 'bewijsfotos'`);
    psql(`delete from public.goals where owner_id = '${alice}'`);
    psql(`delete from public.group_members where group_id = '${groep}'`);
    psql(`delete from public.groups where id = '${groep}'`);
    psql(`delete from auth.users where id in ('${alice}', '${bob}')`);
  });

  describe('de bucket zelf', () => {
    it('staat privé, op 1 MB, en accepteert geen SVG', () => {
      const rij = psql(
        `select public::text || '|' || file_size_limit::text || '|' ||
                array_to_string(allowed_mime_types, ',')
           from storage.buckets where id = 'bewijsfotos'`,
      );
      // ⚠️ Openbaar zou RLS volledig omzeilen: elk bestand met de URL alleen te
      //    lezen, buiten elke policy om. SVG is renderbare HTML met script erin.
      expect(rij).toBe('false|1048576|image/jpeg,image/png,image/webp');
    });

    it('heeft een eigen bucket en deelt die niet met de chat', () => {
      // ⚠️ Zou dit één bucket zijn, dan moest één policyset twee sleutels
      //    bedienen — en dat is een tak die maar in één modus bestaat.
      const aantal = psql(
        `select count(*) from storage.buckets where id in ('chatfotos', 'bewijsfotos')`,
      );
      expect(aantal).toBe('2');
    });
  });

  describe('de kolomgrens op completions.attachment_url', () => {
    /** Zet dit pad op een nieuwe voltooiing van Alice, als tabeleigenaar. */
    function zet(pad: string, w = week): string {
      try {
        psql(
          `begin;
           insert into public.completions (weekly_goal_id, user_id, achieved_level, note, attachment_url)
           values ('${w}', '${alice}', 'ceiling', 'x', ${pad === 'NULL' ? 'null' : `'${pad}'`});
           rollback;`,
        );
        return 'OK';
      } catch (fout) {
        const tekst = fout instanceof Error ? fout.message : String(fout);
        return /completions_attachment_eigen_pad/.test(tekst) ? '23514' : 'ANDERE_FOUT';
      }
    }

    it('laat het eigen pad door', () => {
      expect(zet(`${week}/${alice}/bewijs.jpg`)).toBe('OK');
    });

    it('laat geen bijlage door', () => {
      expect(zet('NULL')).toBe('OK');
    });

    // ⚠️ Zeven vormen die geweigerd moeten worden, elk met een eigen reden. De
    //    laatste twee zijn de gevallen die 0129 en 0225 hebben opgeleverd.
    it.each([
      ['een andere afzender', () => `${week}/${bob}/bewijs.jpg`],
      ['een ander weekdoel', () => `${weekTwee}/${alice}/bewijs.jpg`],
      ['een extern adres', () => 'https://volgmij.example/pixel.gif'],
      ['een pad met ..', () => `${week}/../${alice}/bewijs.jpg`],
      ['een svg', () => `${week}/${alice}/bewijs.svg`],
      ['een regeleinde met een tweede URL', () => `${week}/${alice}/b.jpg\nhttps://kwaad.example/a.png`],
      ['hetzelfde uuid in hoofdletters', () => `${week.toUpperCase()}/${alice}/bewijs.jpg`],
    ])('weigert %s', (_naam, maak) => {
      expect(zet(maak())).toBe('23514');
    });

    it('geeft authenticated het INSERT-recht op die kolom terug', () => {
      // 0150 trok dit recht in omdat er geen uploadpad was. 0229 zet het terug —
      // en de CHECK hierboven is de reden dat dat mag.
      const recht = psql(
        `select has_column_privilege('authenticated', 'public.completions', 'attachment_url', 'INSERT')::text`,
      );
      // ⚠️ En géén UPDATE: completions is append-only (domeinregel 6).
      const update = psql(
        `select has_column_privilege('authenticated', 'public.completions', 'attachment_url', 'UPDATE')::text`,
      );
      expect({ recht, update }).toEqual({ recht: 'true', update: 'false' });
    });
  });

  describe('de schrijfgrens op het object', () => {
    it('laat de eigenaar in zijn eigen map onder zijn eigen weekdoel schrijven', () => {
      expect(
        alsMetCode(
          alice,
          `insert into storage.objects (bucket_id, name) values ('bewijsfotos', '${week}/${alice}/eigen.jpg')`,
        ),
      ).toBe('OK');
    });

    it('weigert een groepsgenoot die in jouw weekdoelmap schrijft', () => {
      expect(
        alsMetCode(
          bob,
          `insert into storage.objects (bucket_id, name) values ('bewijsfotos', '${week}/${bob}/vreemd.jpg')`,
        ),
      ).toBe('42501');
    });

    it('weigert een pad dat niet precies twee mappen diep is', () => {
      // ⚠️ Zonder `array_length(...) = 2` wordt `<w>/<u>/../<ander>/x.jpg`
      //    aangenomen: segment 1 en 2 kloppen dan, en de rest wordt niet gelezen.
      expect(
        alsMetCode(
          alice,
          `insert into storage.objects (bucket_id, name) values ('bewijsfotos', '${week}/${alice}/diep/x.jpg')`,
        ),
      ).toBe('42501');
    });

    it('weigert een eerste segment dat geen uuid is, zonder de query te slopen', () => {
      // ⚠️ De cast zit in een `case` en niet achter een `and`: Postgres
      //    garandeert die volgorde niet, en één zo'n object zou anders de héle
      //    lijstquery slopen in plaats van alleen die rij (gat 1 van 0130).
      const geweigerd = alsMetCode(
        alice,
        `insert into storage.objects (bucket_id, name) values ('bewijsfotos', 'geenuuid/${alice}/x.jpg')`,
      );
      // En een bestaand niet-uuid object mag een lijstquery niet laten omvallen.
      psql(
        `insert into storage.objects (bucket_id, name) values ('bewijsfotos', '.emptyFolderPlaceholder')
         on conflict do nothing`,
      );
      const leest = alsMetCode(alice, `select count(*) from storage.objects where bucket_id = 'bewijsfotos'`);
      psql(`delete from storage.objects where name = '.emptyFolderPlaceholder'`);

      expect({ geweigerd, leest }).toEqual({ geweigerd: '42501', leest: 'OK' });
    });
  });

  describe('de dagrem per uploader (0228)', () => {
    it('laat er tien door en weigert de elfde', () => {
      const eigen = randomUUID();
      psql(
        `insert into auth.users (id, email) values ('${eigen}', '${eigen}@rem.local')
         on conflict (id) do nothing`,
      );
      const eigenDoel = psql(
        `insert into public.goals (owner_id, title, target_date)
         values ('${eigen}', 'Remdoel', current_date + 30) returning id`,
      );
      const eigenWeek = psql(
        `insert into public.weekly_goals (goal_id, title, cycle_start_date)
         values ('${eigenDoel}', 'Remweek', current_date) returning id`,
      );

      const uitkomsten: string[] = [];
      for (let i = 0; i < 11; i += 1) {
        try {
          psql(
            `insert into storage.objects (bucket_id, name, owner)
             values ('bewijsfotos', '${eigenWeek}/${eigen}/f${i}.jpg', '${eigen}')`,
          );
          uitkomsten.push('OK');
        } catch (fout) {
          const tekst = fout instanceof Error ? fout.message : String(fout);
          uitkomsten.push(/Te veel bewijsfoto/.test(tekst) ? '23514' : 'ANDERE_FOUT');
        }
      }

      psql(`delete from storage.objects where name like '${eigenWeek}/%'`);
      psql(`delete from public.goals where id = '${eigenDoel}'`);
      psql(`delete from auth.users where id = '${eigen}'`);

      // ⚠️ De tiende moet er nog wél door. Alleen "de elfde faalt" toetsen laat
      //    een rem die op één staat ongemerkt passeren.
      expect({ tiende: uitkomsten[9], elfde: uitkomsten[10] }).toEqual({
        tiende: 'OK',
        elfde: '23514',
      });
    });

    it('telt een object dat de bucket in verhuisd wordt ook mee', () => {
      // ⚠️⚠️ **Gevonden in de securityronde op QS8-391.** Met een trigger die
      //    alleen op INSERT vuurt, parkeer je objecten in een andere bucket en
      //    zet je ze daarna met één `update` om. 📏 Gemeten vóór de reparatie:
      //    **veertig objecten bij een plafond van tien**, en dat getal is
      //    willekeurig op te schroeven. Eén gebruiker kon zo de gratis tier
      //    vullen die het hele project deelt.
      const eigen = randomUUID();
      psql(
        `insert into auth.users (id, email) values ('${eigen}', '${eigen}@verhuis.local')
         on conflict (id) do nothing`,
      );
      const eigenDoel = psql(
        `insert into public.goals (owner_id, title, target_date)
         values ('${eigen}', 'Verhuisdoel', current_date + 30) returning id`,
      );
      const eigenWeek = psql(
        `insert into public.weekly_goals (goal_id, title, cycle_start_date)
         values ('${eigenDoel}', 'Verhuisweek', current_date) returning id`,
      );

      // Het plafond vol maken, en er daarna eentje omheen proberen te schuiven.
      for (let i = 0; i < 10; i += 1) {
        psql(
          `insert into storage.objects (bucket_id, name, owner)
           values ('bewijsfotos', '${eigenWeek}/${eigen}/vol${i}.jpg', '${eigen}')`,
        );
      }
      psql(
        `insert into storage.buckets (id, name, public) values ('verhuisstop', 'verhuisstop', false)
         on conflict (id) do nothing`,
      );
      psql(
        `insert into storage.objects (bucket_id, name, owner)
         values ('verhuisstop', 'geparkeerd.jpg', '${eigen}')`,
      );

      let verhuizing = 'OK';
      try {
        psql(
          `update storage.objects
              set bucket_id = 'bewijsfotos', name = '${eigenWeek}/${eigen}/verhuisd.jpg'
            where bucket_id = 'verhuisstop' and name = 'geparkeerd.jpg'`,
        );
      } catch (fout) {
        const tekst = fout instanceof Error ? fout.message : String(fout);
        verhuizing = /Te veel bewijsfoto/.test(tekst) ? '23514' : 'ANDERE_FOUT';
      }

      // ⚠️ En een gewone update bínnen de bucket moet er wél doorheen — anders
      //    breekt het metadata-onderhoud van de storage-dienst na elke upload.
      let binnen = 'OK';
      try {
        psql(
          `update storage.objects set owner = '${eigen}'
            where bucket_id = 'bewijsfotos' and name = '${eigenWeek}/${eigen}/vol0.jpg'`,
        );
      } catch {
        binnen = 'GEWEIGERD';
      }

      psql(`delete from storage.objects where name like '${eigenWeek}/%' or bucket_id = 'verhuisstop'`);
      psql(`delete from storage.buckets where id = 'verhuisstop'`);
      psql(`delete from public.goals where id = '${eigenDoel}'`);
      psql(`delete from auth.users where id = '${eigen}'`);

      expect({ verhuizing, binnen }).toEqual({ verhuizing: '23514', binnen: 'OK' });
    });

    it('draagt de index waar die telling op leunt', () => {
      // Onwrikbare regel 11: deze query draait op het schrijfpad van élke upload.
      const idx = psql(
        `select count(*) from pg_indexes
          where schemaname = 'storage' and indexname = 'objects_bewijsfotos_uploader_dag_idx'`,
      );
      expect(idx).toBe('1');
    });
  });

  describe('de grendels die geen enkel scherm laat zien', () => {
    it('houdt beide hulpfuncties op security invoker', () => {
      // ⚠️⚠️ **Dit is de grendel van deze branch.** `mag_bewijsfoto_lezen()` moet
      //    invoker blijven: met `definer` valt de RLS van `completions` weg en
      //    daarmee het statusfilter dat die transitief erft van
      //    `weekly_goals_select`. 📏 Gemeten: dan leest een groepsgenoot het
      //    bewijs van een gemiste week.
      const definers = psql(
        `select count(*) from pg_proc
          where proname in ('mag_bewijsfoto_lezen', 'mag_weekdoel_van_mij')
            and prosecdef`,
      );
      expect(definers).toBe('0');
    });

    it('pint pg_temp achteraan in het zoekpad van elke nieuwe functie', () => {
      // Zonder die pin doorzoekt Postgres het tijdelijke schema als eerste, en
      // dan kiest de aanroeper welke tabel de functie leest.
      const zonder = psql(
        `select count(*) from pg_proc
          where proname in ('mag_bewijsfoto_lezen', 'mag_weekdoel_van_mij',
                            'bewaak_bewijsfoto_aantal', 'wis_bewijsfotos_van_vertrekker')
            and not (coalesce(array_to_string(proconfig, ','), '') like '%pg_temp%')`,
      );
      expect(zonder).toBe('0');
    });

    it('laat geen van de nieuwe functies door authenticated aanroepen tenzij besloten', () => {
      // Onwrikbare regel 4: `alter default privileges` deelt élke nieuwe functie
      // uit aan authenticated, dus een recht zónder grant-regel is geërfd.
      const uitvoerbaar = psql(
        `select coalesce(string_agg(proname, ',' order by proname), '')
           from pg_proc
          where proname in ('bewaak_bewijsfoto_aantal', 'wis_bewijsfotos_van_vertrekker')
            and has_function_privilege('authenticated', oid, 'EXECUTE')`,
      );
      expect(uitvoerbaar).toBe('');
    });
  });
});
