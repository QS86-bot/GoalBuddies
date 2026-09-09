/**
 * `paused` is geen lidmaatschapstoestand meer — QS8-325, migratie 0204.
 *
 * ⚠️ **De belofte is niet "de CHECK kent twee waarden".** Dat is de kolom. De
 *    belofte is een eigenschap van het geheel:
 *
 *      Er is geen recht, geen rol en geen functie waarmee een lidmaatschap op
 *      `paused` komt, en er is geen lezer meer die op die waarde vertakt.
 *
 *    Een test op de CHECK alleen blijft groen bij een functie die de waarde nog
 *    meeweegt, en een test op de functies alleen blijft groen bij een kolom die
 *    hem nog toelaat. Beide helften staan hieronder, en de tweede is de helft
 *    die dit issue beschrijft: `paused` had geen schrijver en wél vier lezers.
 *
 * ⚠️ **Waarom hij weggaat en geen schrijver krijgt.** 📏 De adempauze die het
 *    product bedoelt (PRODUCT-PROPOSAL regel 70: "tot 2 cycli, vooraf
 *    aangekondigd") bestaat al, per doel, in `breathers` — mét `plan_adempauze()`
 *    en een aanroeper in `src/modules/goals/adempauze.ts`. `ketting_stand()` had
 *    daardoor twee vrijstellingen naast elkaar voor dezelfde gedachte, waarvan er
 *    één onbereikbaar was. Volledige afweging in
 *    `docs/decisions/2026-09-08-paused-was-de-adempauze-op-de-verkeerde-plek.md`.
 *
 * ⚠️⚠️ **Twee must-denies verhuizen van slot, en dat staat hier met zoveel
 *    woorden.** Vóór 0204 weigerde de trigger een beheerder die een ánder op
 *    pauze zette (`pauze_van_een_ander`, P0001); nu doet de CHECK dat (23514).
 *    De weigering blijft, de foutcode niet — en een must-deny die stil van slot
 *    wisselt, is precies hoe een test iets anders gaat bewaken dan hij belooft.
 *    Vandaar dat elk geval hieronder zegt wélk slot hem tegenhoudt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';
import { proefId } from './proefid';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

let anna: TestUser;
let bram: TestUser;
let carol: TestUser;
let groepId: string;
let code: string;

interface Fout {
  code?: string;
  message?: string;
}

/** De rij zoals `service_role` hem ziet — buiten elke policy om. */
async function lid(userId: string): Promise<{ role: string; status: string } | null> {
  const { data } = await adminDb()
    .from('group_members')
    .select('role, status')
    .eq('group_id', groepId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data ?? null) as { role: string; status: string } | null;
}

describe('paused bestaat niet meer als lidmaatschapstoestand', () => {
  beforeAll(async () => {
    if (!rlsTestsConfigured) return;
    anna = await createTestUser('pauze-anna');
    bram = await createTestUser('pauze-bram');
    carol = await createTestUser('pauze-carol');

    const g = await anna.db.rpc('create_group', { group_name: 'Pauzeloos' });
    if (g.error) throw new Error(`groep: ${g.error.message}`);
    const uit = (g.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(g.data)}`);
    groepId = uit.group.id;
    code = uit.group.invite_code;

    for (const wie of [bram, carol]) {
      const mee = await wie.db.rpc('join_group_with_code', { code });
      if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    if (!rlsTestsConfigured) return;
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // 1. Er is geen schrijver — op geen enkel rechtenniveau
  // -------------------------------------------------------------------------

  it.runIf(rlsTestsConfigured)(
    'weigert een gewoon lid dat zichzelf op pauze zet — en dat blijft de guard',
    async () => {
      const { error } = await bram.db
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', groepId)
        .eq('user_id', bram.id);

      const fout = (error ?? {}) as Fout;
      expect(error, 'de pauze landde').not.toBeNull();
      // ⚠️ De BEFORE-trigger vuurt vóór de CHECK, dus dit geval ketst nog steeds
      //    af op `geen_groepsbeheerder` en niet op de kolomgrens. Dat is geen
      //    detail: zou hier 23514 staan, dan was de trigger stil geworden.
      expect(fout.message ?? '', JSON.stringify(error)).toContain('geen_groepsbeheerder');
      expect((await lid(bram.id))?.status).toBe('active');
    },
    TEST_TIMEOUT,
  );

  it.runIf(rlsTestsConfigured)(
    'weigert een beheerder die een ander op pauze zet — nu als onbekende stand',
    async () => {
      const { error } = await anna.db
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', groepId)
        .eq('user_id', carol.id);

      const fout = (error ?? {}) as Fout;
      expect(error, 'de pauze landde').not.toBeNull();
      // ⚠️⚠️ **Hier zat `pauze_van_een_ander` (0199), en die tak is vervangen
      //    door een bredere: `onbekende_lidstatus`.** Dat is geen naamswijziging
      //    maar een andere belofte — de oude tak verbood één waarde, deze
      //    verbiedt élke waarde buiten `active` en `inactive`.
      //
      // ⚠️ 📏 Een tussenversie van deze branch had hier `23514` staan, want
      //    zónder de restweigering is de CHECK het eerste slot dat de beheerder
      //    tegenkomt. Toen de weigering erbij kwam, verschoof het slot opnieuw —
      //    en dat is precies waarom deze test de fóutcode noemt en niet alleen
      //    dát er een fout kwam. De CHECK blijft gemeten in de test hieronder,
      //    langs `service_role`, dat door de trigger heen loopt.
      expect(fout.code, JSON.stringify(error)).toBe('P0001');
      expect(fout.message ?? '').toContain('onbekende_lidstatus');
      expect((await lid(carol.id))?.status).toBe('active');
    },
    TEST_TIMEOUT,
  );

  it.runIf(rlsTestsConfigured)(
    'weigert service_role, die buiten elke policy en trigger om schrijft',
    async () => {
      // ⚠️⚠️ **Dit is de test die de belofte draagt.** De twee hierboven meten
      //    een pad; deze meet dat er géén pad is. `service_role` heeft BYPASSRLS
      //    en loopt door de guard heen via de vroege uitgang op `auth.uid() is
      //    null` — er is dus niets anders over dat hem tegenhoudt dan de CHECK.
      const { error } = await adminDb()
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', groepId)
        .eq('user_id', carol.id);

      const fout = (error ?? {}) as Fout;
      expect(error, 'service_role schreef de stand alsnog').not.toBeNull();
      expect(fout.code, JSON.stringify(error)).toBe('23514');
      expect((await lid(carol.id))?.status).toBe('active');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. Toetreden met een code houdt dezelfde uitkomst
  // -------------------------------------------------------------------------
  //
  // ⚠️ 0204 haalde de `paused`-tak uit de upsert van `join_group_with_code()` en
  //    maakte er `on conflict do nothing` van. Dat raakt twee gevallen die wél
  //    blijven bestaan, en die staan hier omdat de wijziging ze had kunnen
  //    veranderen zonder dat iemand het zag.

  it.runIf(rlsTestsConfigured)(
    'een actief lid dat de code nog eens aanbiedt, blijft gewoon lid',
    async () => {
      const toe = await bram.db.rpc('join_group_with_code', { code });
      expect(toe.error, JSON.stringify(toe.error)).toBeNull();
      expect((toe.data as { ok?: boolean }).ok).toBe(true);
      expect((await lid(bram.id))?.status).toBe('active');
      expect((await lid(bram.id))?.role).toBe('member');
    },
    TEST_TIMEOUT,
  );

  it.runIf(rlsTestsConfigured)(
    'een uitgezet lid komt er met de code niet in — dat is nog steeds `removed`',
    async () => {
      const weg = await anna.db.rpc('verwijder_lid', {
        p_group_id: groepId,
        p_user_id: carol.id,
        p_bevestigd: true,
      });
      if (weg.error) throw new Error(`uitzetten: ${weg.error.message}`);

      const toe = await carol.db.rpc('join_group_with_code', { code });
      expect(toe.error, JSON.stringify(toe.error)).toBeNull();
      expect(toe.data as { ok?: boolean; reason?: string }).toMatchObject({
        ok: false,
        reason: 'removed',
      });
      expect((await lid(carol.id))?.status).toBe('inactive');
    },
    TEST_TIMEOUT,
  );
});

/**
 * De tweede helft: er is geen lezer achtergebleven.
 *
 * ⚠️ **Waarom psql en niet de harness.** Dit vraagt `pg_proc` en
 *    `pg_constraint`, en die zijn via PostgREST niet te lezen. Er wordt niets
 *    geschreven, dus er valt ook niets terug te rollen.
 */
const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_constraint where conname = 'group_members_status_valid'",
  import.meta.url,
);

describe.skipIf(!beschikbaar)('en er is geen lezer voor de waarde achtergebleven', () => {
  it('de CHECK kent nog twee waarden', () => {
    const def = psql(
      "select pg_get_constraintdef(oid) from pg_constraint where conname = 'group_members_status_valid'",
    ).trim();

    expect(def).toContain("'active'");
    expect(def).toContain("'inactive'");
    expect(def).not.toContain("'paused'");
  });

  it('geen enkele functie in public vertakt nog op de waarde', () => {
    // ⚠️⚠️ **Commentaar wordt eruit gestript, en dat is een besluit en geen
    //    slordigheid.** Een migratie die opschrijft wat er weg is ("hier stond
    //    `not in ('inactive', 'paused')`") is documentatie en geen lezer;
    //    `ketting_stand()` draagt zo'n regel. Zou deze toets die meetellen, dan
    //    leert hij je de geschiedenis uit de code te halen om hem groen te
    //    krijgen. Wat hij wél moet vinden is een vertákking op de waarde.
    //
    // ⚠️ 📏 Geijkt door in de lokale stack een functie te maken die de literal
    //    in háár lichaam draagt: dan noemt deze toets haar bij naam. Alleen in
    //    `--`-commentaar zetten laat hem terecht met rust.
    //
    // ⚠️ Blokcommentaar (`/* … */`) wordt niet gestript, dus een literal daarin
    //    meldt hij wél. 📏 Gemeten in de security-review. Dat is de strenge kant
    //    en dus geen gat; deze codebase schrijft `--`.
    const treffers = psql(
      `select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') like '%''paused''%'`,
    ).trim();

    expect(treffers, `deze functies wegen 'paused' nog mee: ${treffers}`).toBe('');
  });

  /**
   * ⚠️⚠️ **De restweigering, en die is er omdat 0204 er een weghaalt.**
   *    `pauze_van_een_ander` kon uit de beheerderstak omdat de CHECK de waarde
   *    niet meer kent. Wat daarmee wegviel is het vangnet: de tak verbiedt een
   *    rolwijziging, een terugzetting en een uitzetting, en liet élke andere
   *    statuswaarde door.
   *
   * ⚠️ **Deze toets maakt met opzet een schema dat vandaag niet bestaat.** Dat
   *    is de enige manier om een grendel te ijken die pas de dag ná een derde
   *    lidstatus iets doet — en een grendel die nooit rood is geweest, is een
   *    aanname (regel 18, vraag 3). 📏 Zonder de weigering meldt dit geval
   *    `GELAND`, gemeten vóór hij er stond. Alles loopt in één transactie die
   *    terugrolt, dus de CHECK staat na afloop weer op twee waarden.
   */
  it('weigert een beheerder een status die het model niet kent', () => {
    const anna = proefId(1);
    const bob = proefId(2);
    const groep = proefId(3);

    const uitslag = psql(`
      begin;
      insert into auth.users (id, email) values
        ('${anna}', 'anna325@x.nl'), ('${bob}', 'bob325@x.nl');
      insert into groups (id, name, created_by, status, invite_code, categorie)
        values ('${groep}', 'Restweigering', '${anna}', 'active', 'REST325', 'other');
      insert into group_members (group_id, user_id, role, status) values
        ('${groep}', '${anna}', 'admin', 'active'),
        ('${groep}', '${bob}', 'member', 'active');

      -- De derde stand die er vandaag niet is, maar waar drie rijen in
      -- ENGINEER-REVIEW.md rekening mee houden.
      alter table group_members drop constraint group_members_status_valid;
      alter table group_members add constraint group_members_status_valid
        check (status in ('active', 'inactive', 'ietsnieuws'));

      -- ⚠️ De uitslag gaat via een tijdelijke tabel en niet via de foutuitvoer:
      --    een mislukt statement breekt anders de hele psql-aanroep af, en dan
      --    is "geweigerd" niet te onderscheiden van "de opstelling klopte niet".
      create temp table uitslag(t text);
      grant insert on uitslag to authenticated;

      select set_config('request.jwt.claims',
        '{"sub":"${anna}","role":"authenticated"}', true);
      set local role authenticated;
      do $$
      begin
        update public.group_members set status = 'ietsnieuws'
         where group_id = '${groep}' and user_id = '${bob}';
        insert into uitslag values ('GELAND');
      exception when others then
        insert into uitslag values ('GEWEIGERD: ' || sqlerrm);
      end
      $$;
      reset role;
      select t from uitslag;
      rollback;
    `).trim();

    expect(uitslag).toContain('GEWEIGERD');
    expect(uitslag).toContain('onbekende_lidstatus');
  });

  it('en geen enkele policy weegt hem mee', () => {
    // ⚠️ De policies noemden hem vóór 0204 al niet — 📏 gemeten. Deze toets
    //    staat er omdat een lezer terugkomen kan langs een weg die de vorige
    //    toets niet ziet: een policy is geen `pg_proc`-rij.
    const treffers = psql(
      `select coalesce(string_agg(tablename || '.' || policyname, ', '), '')
         from pg_policies
        where coalesce(qual, '') like '%paused%'
           or coalesce(with_check, '') like '%paused%'`,
    ).trim();

    expect(treffers, `deze policies wegen 'paused' nog mee: ${treffers}`).toBe('');
  });
});
