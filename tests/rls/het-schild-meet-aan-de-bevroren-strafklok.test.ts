import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De belofte: **het zevendaagse schild rond een straf is niet op te rekken door
 * je eigen tijdzone te verzetten** — QS8-533, migratie 0290.
 *
 * ⚠️⚠️ **Wat er mis was.** `maak_straffen_verschuldigd()` hield een straf op
 *    `set` zolang er een open, beslisbaar uitstelverzoek lag en
 *    `g.target_date > p_vandaag - 7`. `p_vandaag` is `localDateIn(profiel.tz,
 *    nu)` uit `supabase/functions/rollover/index.ts` — de **levende**
 *    `profiles.tz`, en 📏 `has_column_privilege('authenticated',
 *    'public.profiles','tz','UPDATE')` is `t`. Een kleinere `p_vandaag` maakt
 *    `p_vandaag - 7` kleiner, dus het schild hield langer stand.
 *
 * ⚠️⚠️ **En de tweede helft was een naad die 0288 zelf openliet.**
 *    `r.new_date >= p_vandaag` hier en `r.new_date < doeldatum(...)` in
 *    `beslis_deadline_verzoek()` stellen dezelfde vraag — *is dit verzoek nog te
 *    beslissen*. Sinds 0288 mat de tweede aan de bevroren klok en de eerste niet,
 *    en dan schermt een verzoek een straf af dat de buddy alleen nog kan
 *    afwijzen. Dat is precies wat migratie 0175 verbiedt: *een verzoek dat
 *    niemand kan beslissen is geen verzoek*.
 *
 * ⚠️ **Wat deze suite níet bewaakt, en dat is een keuze.** De regel erboven,
 *    `g.target_date < p_vandaag`, meet nog steeds aan de levende klok. Dat is
 *    een gat van dezelfde klasse en het staat als **QS8-548** open, mét meting;
 *    het is grens 1 van de *Beslisbevoegdheid* en dus niet van deze branch. De
 *    toerekeningsgevallen hieronder meten dat verschil expliciet, zodat een
 *    latere lezer niet hoeft te raden welke van de twee clausules groen is.
 *
 * ⚠️⚠️ **Geen enkele toets hier hangt van het uur van de dag af, en dat is met
 *    opzet.** Kiritimati is `UTC+14` en Midway `UTC−11`: **25 uur** uit elkaar,
 *    en twee zones die meer dan 24 uur uit elkaar liggen staan nooit op dezelfde
 *    datum. De voorganger van dit soort toetsen telde datums op het moment van
 *    draaien en maakte CI twee uur per dag rood (QS8-529).
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'maak_straffen_verschuldigd'",
  import.meta.url,
);

/** `UTC+14`. De datum hier is altijd die van {@link WEST} plus één. */
const OOST = 'Pacific/Kiritimati';
/** `UTC−11`. */
const WEST = 'Pacific/Midway';

interface Opstelling {
  /** De zone van het profiel op het moment dat de straf wordt aangegaan. */
  readonly bijAangaan: string;
  /** De zone waar het profiel daarna naartoe gaat — de aanval. */
  readonly daarna: string;
  /**
   * Hoeveel dagen de streefdatum vóór vandaag ligt, geteld **in de zone bij
   * aangaan**. Dat is de enige klok die in beide opstellingen hetzelfde
   * betekent; tellen in de levende zone zou de meting zelf verschuiven.
   */
  readonly dagenTerug: number;
  /** SQL-uitdrukking voor `new_date`, of `null` voor een doel zonder verzoek. */
  readonly nieuweDatum: string | null;
}

/**
 * Een doel met een verstreken streefdatum, een straf van dertig dagen oud, en
 * naar keuze een open uitstelverzoek met een buddy die erover mag beslissen.
 *
 * ⚠️ **De straf wordt aangegaan terwijl het profiel nog eerlijk staat.**
 *    `bevries_commitmentzone()` kopieert `profiles.tz` bij de `insert`, dus een
 *    opstelling die de zone vóór die regel verzet, manipuleert óók de bevroren
 *    klok en meet daarmee niets. 📏 Dat overkwam de eerste meting van QS8-531:
 *    alle zes de gevallen kwamen er identiek uit, vóór én na de migratie.
 *
 * ⚠️ `created_at` dertig dagen terug, want `maak_straffen_verschuldigd()` draagt
 *    sinds 0171 een eigen grendel van 24 uur. Zonder die regel zou elk geval
 *    hieronder op díe clausule stranden in plaats van op het schild.
 */
function opzet(o: Opstelling): string {
  return `
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_grp uuid := gen_random_uuid();
  v_g uuid;
  v_c uuid;
  v_r uuid;
  v_t date;
begin
  insert into auth.users (id, email) values (v_a, v_a || '@zz.test'), (v_b, v_b || '@zz.test');
  update profiles set tz = '${o.bijAangaan}' where id = v_a;
  update profiles set tz = 'UTC'             where id = v_b;

  insert into groups (id, name, created_by, invite_code, huddle_day, tz)
    values (v_grp, 'Proefgroep', v_a, 'ZZ' || substr(md5(random()::text), 1, 10), 1, 'UTC');
  insert into group_members (group_id, user_id, role, status)
    values (v_grp, v_a, 'admin', 'active'), (v_grp, v_b, 'member', 'active');

  v_t := (now() at time zone '${o.bijAangaan}')::date - ${o.dagenTerug};

  insert into goals (owner_id, title, target_date)
    values (v_a, 'Doel met een streefdatum', v_t) returning id into v_g;

  insert into commitments (goal_id, type, body, confirmed_at, beneficiary_group_id, status, created_at)
    values (v_g, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(), v_grp, 'set',
            now() - interval '30 days')
    returning id into v_c;

  -- ⚠️ **Nu pas** verzet de gestrafte zijn zone. Dat is de aanval.
  update profiles set tz = '${o.daarna}' where id = v_a;

  ${
    o.nieuweDatum === null
      ? `-- geen uitstelverzoek: de toerekening`
      : `insert into deadline_requests (goal_id, group_id, requester_id, old_date, new_date, reason, status)
    values (v_g, v_grp, v_a, v_t, ${o.nieuweDatum}, 'Ik had meer tijd nodig', 'open')
    returning id into v_r;`
  }

  create temp table proef (request_id uuid, goal_id uuid, commitment_id uuid, buddy uuid, eigenaar uuid);
  insert into proef values (v_r, v_g, v_c, v_b, v_a);
end $$;`;
}

/**
 * Draait de rollover precies zoals `supabase/functions/rollover/index.ts` hem
 * draait: `p_vandaag = localDateIn(profiel.tz, nu)`, met de **levende** zone.
 *
 * ⚠️ Zou deze helper de bevroren zone meegeven, dan meet de suite haar eigen
 *    aanname in plaats van de functie. De aanroepkant hoort hier onveranderd te
 *    zijn; alleen de SQL eronder verandert.
 */
const ROLLOVER = `
do $$
declare v_n integer;
begin
  select public.maak_straffen_verschuldigd(
           (select eigenaar from proef),
           (now() at time zone (select tz from profiles where id = (select eigenaar from proef)))::date)
    into v_n;
  create temp table uitslag (regel text);
  insert into uitslag values ('verschuldigd=' || v_n);
  insert into uitslag
    select 'straf=' || (select status from commitments where id = (select commitment_id from proef));
end $$;
select regel from uitslag;`;

/** Beslist als de buddy en rapporteert de uitkomst. */
const BESLIS = `
do $$
declare v_uit jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select buddy from proef), 'role', 'authenticated')::text, true);
  v_uit := public.beslis_deadline_verzoek((select request_id from proef), true, null);
  insert into uitslag values ('beslissing=' || coalesce(v_uit ->> 'reason', v_uit ->> 'ok'));
end $$;
select regel from uitslag;`;

/** Draait de opstelling plus de rollover, rolt terug, en geeft stdout terug. */
function rollover(o: Opstelling, ookBeslissen = false): string {
  try {
    return psqlMetInvoer(
      `begin;\n${opzet(o)}\n${ROLLOVER}\n${ookBeslissen ? BESLIS : ''}\nrollback;`,
    );
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout);
  }
}

/** Een `new_date` die ver genoeg in de toekomst ligt om in elke zone geldig te zijn. */
const RUIM_IN_DE_TOEKOMST = `(now() at time zone '${OOST}')::date + 30`;

describe.skipIf(!beschikbaar)('het schild meet aan de bevroren strafklok', () => {
  const TIMEOUT = 30_000;

  // -------------------------------------------------------------------------
  // De aanval, en de toerekening ernaast
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Dit is de toets die de belofte draagt.** De straf is aangegaan in het
   *    oosten en de streefdatum ligt daar zeven dagen terug: het schild is dáár
   *    precies om. Zet de gestrafte zijn profiel naar het westen, dan telde de
   *    functie vóór 0290 zes dagen en hield het schild een ronde langer.
   *
   *    📏 Gemeten met precies deze opstelling, 18-09-2026:
   *
   *      zonder 0290   verschuldigd=0   straf blijft `set`
   *      met    0290   verschuldigd=1   straf wordt `due`
   */
  it(
    'laat het schild vervallen op de zone waarin de straf is aangegaan',
    () => {
      const uit = rollover({
        bijAangaan: OOST,
        daarna: WEST,
        dagenTerug: 7,
        nieuweDatum: RUIM_IN_DE_TOEKOMST,
      });

      expect(
        uit,
        'de gestrafte rekte zijn zevendaagse schild op door zijn eigen tijdzone te verzetten',
      ).toContain('verschuldigd=1');
      expect(uit).toContain('straf=due');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ **De spiegel: zonder de zonesprong hoort er hetzelfde uit te komen.**
   *    Zonder dit geval zou de toets hierboven ook groen zijn als 0290 het
   *    schild simpelweg had weggehaald.
   */
  it(
    'doet met dezelfde streefdatum hetzelfde voor wie zijn zone niet verzet',
    () => {
      const uit = rollover({
        bijAangaan: 'UTC',
        daarna: 'UTC',
        dagenTerug: 7,
        nieuweDatum: RUIM_IN_DE_TOEKOMST,
      });

      expect(uit).toContain('verschuldigd=1');
    },
    TIMEOUT,
  );

  /**
   * ⚠️⚠️ **De toerekening, en dit geval is het bewijs dat de suite de júiste
   *    clausule vasthoudt.** Dezelfde opstelling zonder uitstelverzoek: dan is
   *    er geen schild, en de straf hoort gewoon verschuldigd te worden. Was het
   *    de verlooppoort `g.target_date < p_vandaag` die de uitslag bepaalde, dan
   *    zou deze toets nul geven — en dat is precies wat er op één dag verschil
   *    wél gebeurt (QS8-548, de toets helemaal onderaan).
   */
  it(
    'maakt dezelfde straf zonder uitstelverzoek gewoon verschuldigd',
    () => {
      const uit = rollover({ bijAangaan: OOST, daarna: WEST, dagenTerug: 7, nieuweDatum: null });

      expect(uit).toContain('verschuldigd=1');
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De must-allows — zonder deze helft is "altijd verschuldigd" een geldig antwoord
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Het schild moet wél werken.** Zes dagen na de streefdatum houdt een open,
   *    beslisbaar verzoek de straf tegen — in beide opstellingen, want de
   *    bevroren klok is de maat.
   */
  it(
    'houdt de straf tegen zolang het schild loopt, in beide opstellingen',
    () => {
      const eerlijk = rollover({
        bijAangaan: 'UTC',
        daarna: 'UTC',
        dagenTerug: 6,
        nieuweDatum: RUIM_IN_DE_TOEKOMST,
      });
      const verzet = rollover({
        bijAangaan: OOST,
        daarna: WEST,
        dagenTerug: 6,
        nieuweDatum: RUIM_IN_DE_TOEKOMST,
      });

      expect(eerlijk, 'het schild hield niet tegen zonder enige zonesprong').toContain(
        'verschuldigd=0',
      );
      expect(verzet, 'de bevroren klok gaf een andere uitslag dan de eerlijke').toContain(
        'verschuldigd=0',
      );
      expect(eerlijk).toContain('straf=set');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ En zonder verzoek valt datzelfde geval wél om. Dit is de tweede helft van
   *    de toerekening: het schild is het enige dat `vandaag - 6` tegenhoudt.
   */
  it(
    'maakt datzelfde geval zonder uitstelverzoek wél verschuldigd',
    () => {
      const uit = rollover({ bijAangaan: OOST, daarna: WEST, dagenTerug: 6, nieuweDatum: null });

      expect(uit).toContain('verschuldigd=1');
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De naad: het schild en de beslisser stellen dezelfde vraag
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Dit is de tweede grendel, en hij zat vóór 0290 los.** Een verzoek
   *    waarvan de `new_date` gelijk is aan de **levende** dag van de aanvrager
   *    terwijl de bevroren klok een dag verder staat: het schild noemde hem
   *    geldig en de beslisser `verzoek_verlopen`. Een straf afgeschermd door een
   *    verzoek dat niemand kan toewijzen — precies wat migratie 0175 verbiedt.
   *
   *    📏 Gemeten, 18-09-2026:
   *
   *      zonder 0290   verschuldigd=0, straf `set`   beslissing=verzoek_verlopen
   *      met    0290   verschuldigd=1, straf `due`   beslissing=verzoek_verlopen
   */
  it(
    'laat een verzoek dat de beslisser verlopen noemt geen straf afschermen',
    () => {
      const uit = rollover(
        {
          bijAangaan: OOST,
          daarna: WEST,
          // ⚠️ Twee, niet één. `dagenTerug` telt in de zone bij aangaan, en de
          //    levende klok loopt hier een dag achter: met één dag valt dit geval
          //    op `g.target_date < p_vandaag` en meet het QS8-548 in plaats van
          //    deze naad. 📏 Dat overkwam de eerste versie van deze toets.
          dagenTerug: 2,
          nieuweDatum: `(now() at time zone '${WEST}')::date`,
        },
        true,
      );

      expect(
        uit,
        'het schild hield een straf tegen op een verzoek dat de buddy alleen kon afwijzen',
      ).toContain('verschuldigd=1');
      expect(uit).toContain('beslissing=verzoek_verlopen');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ **De spiegel van de naad, en zonder haar bewaakt de toets hierboven
   *    niets.** Eén dag later is hetzelfde verzoek in béide klokken geldig: dan
   *    schermt het schild de straf wél af én kan de buddy hem toewijzen.
   */
  it(
    'schermt de straf wél af zolang de beslisser het verzoek kan toewijzen',
    () => {
      const uit = rollover(
        {
          bijAangaan: OOST,
          daarna: WEST,
          // ⚠️ Twee om dezelfde reden als hierboven: met één was `verschuldigd=0`
          //    het antwoord van de verlooppoort en niet van het schild, en dan is
          //    deze spiegel groen zonder iets te spiegelen.
          dagenTerug: 2,
          nieuweDatum: `(now() at time zone '${OOST}')::date + 30`,
        },
        true,
      );

      expect(uit, 'een geldig verzoek hield de straf niet meer tegen').toContain('verschuldigd=0');
      expect(uit).toContain('straf=set');
      expect(uit, 'de buddy kon een verzoek dat het schild geldig noemt niet toewijzen').toContain(
        'beslissing=true',
      );
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De aannames onder de reparatie, vastgelegd in plaats van vertrouwd
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **`doeldatum()` valt hier nooit terug op de levende klok, en dat is een
   *    eigenschap van déze query.** De rij die bijgewerkt wordt ís een straf met
   *    `status = 'set'`, en dat is een van de statussen waar `doeldatum()` zijn
   *    `max()` over neemt. Zou die statuslijst ooit versmallen, dan geeft
   *    `max()` niets, valt `doeldatum()` terug op `eigenaarsdatum()` en staat het
   *    gat er weer — een fail-open door omissie. Deze toets legt de lijst vast.
   */
  it(
    'neemt `set` mee in de statussen waar `doeldatum()` zijn zone uit haalt',
    () => {
      const uit = psqlMetInvoer(
        `select case when pg_get_functiondef('public.doeldatum(uuid,uuid)'::regprocedure)
                       ~ 'status in \\(''set'', ''due''\\)'
                then 'statuslijst=set,due' else 'statuslijst=anders' end;`,
      );

      expect(
        uit,
        'de statuslijst van `doeldatum()` is verschoven; het schild valt dan terug op de levende klok',
      ).toContain('statuslijst=set,due');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ `commitments.tz` is NOT NULL, dus er ís altijd een bevroren zone om aan te
   *    meten. Werd die kolom nullable, dan is `max()` `null` voor een rij zonder
   *    zone en valt hetzelfde gat open.
   */
  it(
    'houdt `commitments.tz` NOT NULL',
    () => {
      const uit = psqlMetInvoer(
        `select 'tz_nullable=' || is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'commitments' and column_name = 'tz';`,
      );

      expect(uit).toContain('tz_nullable=NO');
    },
    TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Wat hier bewust nog openstaat — QS8-548
  // -------------------------------------------------------------------------

  /**
   * ⚠️⚠️ **Deze toets legt een gat vast in plaats van een belofte, en dat is met
   *    opzet.** `g.target_date < p_vandaag` meet nog aan de levende klok: een
   *    sprong naar het westen stelt het verschuldigd worden een dag uit, zónder
   *    uitstelverzoek. Dat is grens 1 van de *Beslisbevoegdheid* en staat als
   *    **QS8-548** open.
   *
   *    Hij staat hier om twee redenen. Hij houdt de meting vast waarop dat issue
   *    berust, en hij wordt **rood zodra iemand die regel verzet** — dan is het
   *    issue af en hoort deze toets omgedraaid te worden, niet weggehaald.
   */
  it(
    'stelt het verschuldigd worden zélf nog wél uit — QS8-548, en dat is nog geen belofte',
    () => {
      const eerlijk = rollover({
        bijAangaan: 'UTC',
        daarna: 'UTC',
        dagenTerug: 1,
        nieuweDatum: null,
      });
      const verzet = rollover({ bijAangaan: OOST, daarna: WEST, dagenTerug: 1, nieuweDatum: null });

      expect(eerlijk).toContain('verschuldigd=1');
      expect(
        verzet,
        'QS8-548 is gerepareerd — draai deze toets om in plaats van hem weg te halen',
      ).toContain('verschuldigd=0');
    },
    TIMEOUT,
  );
});
