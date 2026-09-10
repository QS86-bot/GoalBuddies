import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een object verhuist niet van de ene emmer naar de andere — QS8-407, migratie 0237.
 *
 * ⚠️⚠️ **Waarom dit een gat was dat geen enkele policy op zichzelf maakte.**
 *    Permissieve policies worden ge-OR'd, en bij een UPDATE gaat dat over twee
 *    verschillende rijen: `using` tegen de óude, `with check` tegen de níeuwe.
 *    Verandert `bucket_id`, dan dekt de policy van de brónemmer de eerste helft
 *    en die van de doelemmer de tweede — en geen van beide heeft ooit beide
 *    rijen gezien. `avatars_update` en `bewijsfotos_update` waren elk voor zich
 *    correct; het gat zat in de naad ertussen. Onwrikbare regel 18 vraag 1:
 *    *waar knopen twee correcte onderdelen aan elkaar?*
 *
 * 📏 **Gemeten op 10-09-2026, vóór 0237**, als `authenticated` met echte claims,
 *    op de lokale stack uit alle 236 migratiebestanden:
 *
 *      update storage.objects set bucket_id = 'bewijsfotos',
 *             name = '<weekdoel>/<uid>/portret.jpg'
 *       where bucket_id = 'avatars' and name = '<uid>/portret.jpg';
 *      → UPDATE 1
 *
 *    `avatars` staat op 2 MB, `bewijsfotos` op 1 MB. Op databaseniveau kijkt
 *    niets terug naar `file_size_limit` of `allowed_mime_types` van de emmer waar
 *    het object heen gaat.
 *
 * ⚠️ **De belofte is de familie en niet twee namen.** De scherpste test hieronder
 *    eist dat er op `storage.objects` **geen enkele** UPDATE-policy staat. Zou
 *    hij `avatars_update` en `bewijsfotos_update` bij naam noemen, dan blijft hij
 *    groen op de dag dat er een vierde emmer bij komt met zijn eigen
 *    `_update`-policy — en dat is precies de branch die dit gat het scherpst
 *    maakt (QS8-72 brengt `application/pdf` mee naast drie beeldtypes).
 *
 * ⚠️ **Waarom psql en niet de harness** — zelfde reden als `avatarbucket.test.ts`:
 *    `storage.objects` is geen PostgREST-oppervlak, maar de policies zijn gewone
 *    RLS-expressies en met `set local role authenticated` plus claims exact zo te
 *    toetsen als PostgREST ze aanroept.
 *
 * ⚠️ Zonder draaiende stack wordt deze suite overgeslagen, en dat is *ongemeten*
 *    en niet groen.
 *
 * ---------------------------------------------------------------------------
 * IJKING — met de hand, 10-09-2026
 * ---------------------------------------------------------------------------
 *
 * Mutatie per grendel, elke keer eerst met een query op `pg_policy` bevestigd dat
 * de mutatie er écht in stond. Nulmeting 7 groen — en die nulmeting is uit de
 * mígratiebestanden opgebouwd en niet met de hand geschoond.
 *
 *   A  alleen `avatars_update` terug      → 2 rood
 *   C  allebei de policies terug          → 4 rood (de stand van vóór 0237)
 *   D  `avatars_insert` op `with check (false)` → 3 rood, en precies de drie
 *                                            must-allows
 *   E  een `for all`-policy op één emmer  → 2 rood
 *
 * ⚠️⚠️ **A is de reden dat de scherpste test naar de familie kijkt en niet naar
 *    twee namen, en dat is met de meting aan te tonen.** Zet je alléén
 *    `avatars_update` terug, dan blijven de twee verhuistests **groen** — het gat
 *    is dan niet exploiteerbaar, want de doelemmer heeft geen policy die de
 *    nieuwe rij toelaat. Alleen *laat geen enkele UPDATE-policy staan* wordt
 *    rood. De klasse is dus terug terwijl het gedrag nog klopt, en dat is precies
 *    de toestand waarin de volgende emmer hem weer exploiteerbaar maakt.
 *
 * ⚠️ **D staat er om de reparatie te onderscheiden van "alle rechten weg".** Zou
 *    0237 te breed zijn, dan is elke upload stuk — en dan hoort een test dát te
 *    zeggen en niet groen te blijven. De drie must-allows vallen om en geen van
 *    de must-finds: het onderscheid is scherp.
 *
 * ⚠️⚠️ **E kwam uit de securityronde en niet uit deze ijking, en dat is precies
 *    het soort gat waar regel 18 vraag 3 over gaat.** De familietest vroeg
 *    `polcmd = 'w'`, en in `pg_policy` is `w` UPDATE terwijl `*` ALL is — een
 *    `for all`-policy geeft UPDATE net zo hard. 📏 Gemeten: met een `for all` op
 *    `storage.objects` gaf die query letterlijk "(geen)". De test die belóóft dat
 *    hij naar de familie kijkt, keek naar drie van de vier vormen. Dit project
 *    kende de vorm al — `scripts/rls-dekking.mjs` heeft er een eigen tak voor.
 *
 *    ⚠️ En het is de vorm die het verst komt: een `for all` op **één** emmer laat
 *       allebei de verhuistests groen (de doelemmer laat de nieuwe rij nog steeds
 *       niet toe), dus zonder deze reparatie viel hij alleen nog op de
 *       hernoemingstest — bij toeval, niet bij ontwerp.
 *
 * ⚠️ **En één ding dat de ijking zelf opleverde:** de eerste versie van die query
 *    deed `polname || ' (' || polcmd || ')'` en dat is in Postgres dubbelzinnig
 *    (`operator is not unique: text || "char"`). De test was daardoor rood om een
 *    reden die niets met policies te maken had — een nulmeting die je niet
 *    narekent, verbergt precies dat. `polcmd::text` is de cast.
 */

const psql = (sql: string) => psqlKaal(sql, { verbose: true });

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from storage.buckets where id = 'avatars'",
  import.meta.url,
);

function als(userId: string, sql: string): string {
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' }).replace(/'/g, "''");
  const uitvoer = psql(
    `begin;
     select set_config('request.jwt.claims', '${claims}', true);
     set local role authenticated;
     ${sql};
     rollback;`,
  );
  return uitvoer.split('\n').slice(1).join('\n').trim();
}

/**
 * Zoals `als`, maar een weigering is hier een uitkomst en geen ongeluk.
 *
 * ⚠️⚠️ **Een weigering heeft twee vormen en de belofte dekt ze allebei.** Staat er
 *    géén UPDATE-policy, dan filtert `using` de rij weg: nul rijen, geen fout.
 *    Staat er alleen die van de brónemmer, dan matcht `using` wél en valt de
 *    `with check` van de níeuwe rij om: `42501`. 📏 Allebei gemeten tijdens de
 *    ijking — mutatie A geeft de tweede vorm, de nulmeting de eerste.
 *
 *    Een test die er één van de twee eist, is groen op de helft van de manieren
 *    waarop dit gat terug kan komen. Wat nooit mag, is dat het object leesbaar in
 *    de doelemmer belandt, en dát is wat deze functie teruggeeft.
 */
function verhuispoging(userId: string, sql: string): string {
  try {
    return als(userId, sql);
  } catch (fout) {
    const tekst = fout instanceof Error ? fout.message : String(fout);
    const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(tekst);
    return `geweigerd:${code?.[1] ?? tekst}`;
  }
}

/**
 * ⚠️⚠️ **De positieve controle, en zonder deze zijn de verhuistests hierboven te
 *    goedkoop.** `verhuispoging()` slikt élke fout — dus een typefout in de
 *    opstelling, een kapotte fixture of een INSERT die zelf al weigert komt er
 *    net zo goed uit als `geweigerd:42501`, en dan slaagt `not.toContain(...)`
 *    zonder dat er iets bewezen is. Deze functie stelt eerst vast dát het object
 *    er staat waar het hoort; pas dan zegt de weigering erna iets.
 *
 *    Opgemerkt door de securityronde van 10-09 op deze branch.
 */
function staatErEcht(userId: string, bucket: string, pad: string): void {
  const uit = als(
    userId,
    `insert into storage.objects (bucket_id, name, owner)
       values ('${bucket}', '${pad}', '${userId}');
     select bucket_id from storage.objects where owner = '${userId}'`,
  );

  expect(uit, `de opstelling klopt niet: ${bucket}/${pad} kwam er niet in`).toBe(bucket);
}

describe.runIf(beschikbaar)('een object verhuist niet tussen emmers (0237)', () => {
  const alice = randomUUID();
  const weekdoel = randomUUID();
  const doel = randomUUID();
  // ⚠️ Een groep, want `chatfotos_insert` sleutelt op `<group_id>/<sender_id>` en
  //    toetst lidmaatschap. Zonder deze rij dekt de must-allow twee van de drie
  //    emmers en zegt de titel iets dat de test niet doet.
  const groep = randomUUID();

  beforeAll(() => {
    psql(`
      insert into auth.users (id, email) values ('${alice}', 'verhuis-${alice}@proef.test')
        on conflict do nothing;
      insert into public.goals (id, owner_id, title, target_date)
        values ('${doel}', '${alice}', 'Verhuisdoel', current_date + 30)
        on conflict do nothing;
      insert into public.weekly_goals (id, goal_id, title, cycle_start_date)
        values ('${weekdoel}', '${doel}', 'Verhuisweek', current_date)
        on conflict do nothing;
      insert into public.groups (id, name, created_by, invite_code)
        values ('${groep}', 'Verhuisgroep', '${alice}', 'verhuis-${groep}')
        on conflict do nothing;
      insert into public.group_members (group_id, user_id, role, status)
        values ('${groep}', '${alice}', 'admin', 'active')
        on conflict do nothing;
    `);
  });

  /**
   * ⚠️ **Dit is de grendel, en hij is met opzet niet op naam.** Zet één van de
   *    twee policies uit 0237 terug en deze regel wordt rood; voegt iemand er een
   *    dérde bij voor een nieuwe emmer, ook.
   */
  it('laat geen enkele UPDATE-policy op storage.objects staan, ook geen for-all', () => {
    // ⚠️⚠️ **`in ('w', '*')` en niet `= 'w'`.** In `pg_policy` is `w` UPDATE en
    //    `*` is ALL, en een `for all`-policy geeft UPDATE net zo hard. 📏 Gemeten
    //    tijdens de securityronde van 10-09: met alleen `= 'w'` gaf deze query
    //    "(geen)" terwijl er een `for all`-policy op stond. Dit project kende die
    //    vorm al — `scripts/rls-dekking.mjs` heeft er een eigen tak voor met de
    //    regel *"Een for-all-policy dekt vier opdrachten"*.
    const policies = psql(`
      select coalesce(string_agg(polname || ' (' || polcmd::text || ')', ', ' order by polname), '')
      from pg_policy p join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname = 'objects' and polcmd in ('w', '*')
    `).trim();

    expect(policies, `nog een UPDATE-pad op storage.objects: ${policies}`).toBe('');
  });

  /**
   * ⚠️ **De must-find, en die toetst de belofte en niet de policy.** De telling
   *    hierboven kan groen zijn terwijl een verhuizing langs een ánder pad tóch
   *    lukt — een `grant`, een definer-functie, een trigger. Deze regel vraagt
   *    het aan de handeling zelf.
   */
  it('weigert een verhuizing van avatars naar bewijsfotos', () => {
    staatErEcht(alice, 'avatars', `${alice}/portret.jpg`);

    const uit = verhuispoging(
      alice,
      `insert into storage.objects (bucket_id, name, owner)
         values ('avatars', '${alice}/portret.jpg', '${alice}');
       update storage.objects
          set bucket_id = 'bewijsfotos', name = '${weekdoel}/${alice}/portret.jpg'
        where bucket_id = 'avatars' and name = '${alice}/portret.jpg';
       select bucket_id from storage.objects where owner = '${alice}'`,
    );

    // Wat er niet mag: het object leest als 'bewijsfotos'. Of de weigering nu een
    // gefilterde rij is of een 42501 maakt voor de belofte niet uit.
    expect(uit, `het object belandde in bewijsfotos: ${uit}`).not.toContain('bewijsfotos');
  });

  it('weigert de omgekeerde verhuizing net zo goed', () => {
    staatErEcht(alice, 'bewijsfotos', `${weekdoel}/${alice}/bewijs.jpg`);

    const uit = verhuispoging(
      alice,
      `insert into storage.objects (bucket_id, name, owner)
         values ('bewijsfotos', '${weekdoel}/${alice}/bewijs.jpg', '${alice}');
       update storage.objects
          set bucket_id = 'avatars', name = '${alice}/bewijs.jpg'
        where bucket_id = 'bewijsfotos' and name = '${weekdoel}/${alice}/bewijs.jpg';
       select bucket_id from storage.objects where owner = '${alice}'`,
    );

    expect(uit, `het object belandde in avatars: ${uit}`).not.toContain('avatars');
  });

  /**
   * ⚠️ **Een hernoeming bínnen de eigen emmer kan ook niet meer, en dat is een
   *    gevolg en geen doel.** Het staat hier omdat het het verschil is tussen
   *    "deze test bewaakt de verhuizing" en "deze test bewaakt dat UPDATE weg is".
   *    Ziet iemand dit ooit terugkomen als eis, dan is dít de regel die het zegt.
   */
  it('en een hernoeming binnen de eigen emmer dus ook niet', () => {
    staatErEcht(alice, 'avatars', `${alice}/oud.jpg`);

    const uit = verhuispoging(
      alice,
      `insert into storage.objects (bucket_id, name, owner)
         values ('avatars', '${alice}/oud.jpg', '${alice}');
       update storage.objects set name = '${alice}/nieuw.jpg'
        where bucket_id = 'avatars' and name = '${alice}/oud.jpg';
       select name from storage.objects where owner = '${alice}'`,
    );

    expect(uit, `de hernoeming ging door: ${uit}`).not.toContain('nieuw.jpg');
  });

  /**
   * De must-allows. ⚠️ **Zonder deze drie is de reparatie niet te onderscheiden
   *    van "alle rechten op storage.objects ingetrokken"** — en dat zou elke
   *    upload stukmaken. Dit is de helft die zegt dat de app nog werkt.
   */
  describe('en wat wél moet blijven werken', () => {
    it('laat een upload in elke emmer gewoon door — alle drie', () => {
      const uit = als(
        alice,
        `insert into storage.objects (bucket_id, name, owner)
           values ('avatars', '${alice}/nieuw-portret.jpg', '${alice}'),
                  ('bewijsfotos', '${weekdoel}/${alice}/nieuw-bewijs.jpg', '${alice}'),
                  ('chatfotos', '${groep}/${alice}/nieuw-chat.jpg', '${alice}');
         select count(*) from storage.objects where owner = '${alice}'`,
      );

      expect(uit).toBe('3');
    });

    it('laat je je eigen object nog weghalen', () => {
      const uit = als(
        alice,
        `insert into storage.objects (bucket_id, name, owner)
           values ('avatars', '${alice}/weg.jpg', '${alice}');
         delete from storage.objects
          where bucket_id = 'avatars' and name = '${alice}/weg.jpg';
         select count(*) from storage.objects where owner = '${alice}'`,
      );

      expect(uit).toBe('0');
    });

    it('laat je je eigen object nog lezen', () => {
      const uit = als(
        alice,
        `insert into storage.objects (bucket_id, name, owner)
           values ('avatars', '${alice}/lezen.jpg', '${alice}');
         select name from storage.objects
          where bucket_id = 'avatars' and owner = '${alice}'`,
      );

      expect(uit).toContain('lezen.jpg');
    });
  });
});
