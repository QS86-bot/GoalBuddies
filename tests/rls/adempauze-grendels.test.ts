/**
 * De twee grendels van de adempauze die alleen psql kan zien — QS8-227.
 *
 * Twee beloftes die de PostgREST-client niet kan toetsen: dat twee
 * gelijktijdige aanroepen elkaar niet passeren, en dat het plafond in de client
 * hetzelfde getal is als dat in de database.
 *
 * ⚠️ **De overlapcontrole in `plan_adempauze()` was geen controle maar een
 *    volgorde-aanname.** `if exists (...) then return 'overlapt'` en de `insert`
 *    erna zijn twee losse statements. In read committed ziet de ene transactie
 *    de ongecommitte rij van de andere niet, dus komen twee gelijktijdige
 *    aanroepen er allebei door en liggen er daarna twee pauzes over dezelfde
 *    week. `breathers_geen_dubbele_start` vangt dat niet af zodra de
 *    begindatums verschillen. Gevonden in de security-review van 06-09-2026 en
 *    daar gemeten met twee parallelle sessies.
 *
 * ⚠️ **Dit stond er al vóór QS8-227, en het werd pas nu iets.** Zolang een pauze
 *    hoogstens twee cycli duurde en vooruit gepland moest worden, was botsen
 *    zeldzaam. Met vrije datums en meerdere pauzes naast elkaar is het de gewone
 *    fout. Een grens verandert van gewicht als de feature eromheen verandert.
 *
 * ⚠️ **Waarom psql en niet de PostgREST-client.** Deze belofte gaat over twee
 *    transacties die elkaar overlappen in de tijd. Via de gewone client is dat
 *    niet te sturen: elke aanroep is zijn eigen transactie die meteen commit.
 *    Hier houdt sessie A het slot vast terwijl sessie B het probeert.
 *
 * ⚠️ **En dit is geen timing-test.** Er wordt niet gehoopt dat B "op tijd" komt:
 *    A pakt het slot, de test wácht tot `pg_locks` bevestigt dat A het heeft, en
 *    pas dan probeert B het. Zonder die bevestiging zou een groene uitslag ook
 *    kunnen betekenen dat A nog niet begonnen was.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MAX_ADEMPAUZE_CYCLI } from '../../src/modules/goals/adempauze-periode';

import { PSQL_DB, PSQL_OMGEVING, psql, stackBeschikbaarOfFaal } from './psql-stack';
import { proefId } from './proefid';

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'plan_adempauze'",
  import.meta.url,
);

const GEBRUIKER = proefId(1);
const DOEL = proefId(2);

/**
 * De cyclusstarts die deze test gebruikt: de maandag van volgende week en die
 * daarna, als SQL-uitdrukking.
 *
 * ⚠️⚠️ **Hier stonden twee vaste datums in 2031, en die kunnen sinds 0216 niet
 *    meer** (QS8-373). `plan_adempauze()` eist nu dat een pauze begint binnen 52
 *    cycli terug tot 52 cycli vooruit — anders kan `breathers` onbeperkt groeien.
 *    Een pauze in 2031 valt daarbuiten en wordt geweigerd met `buiten_venster`,
 *    en dan toetsten deze twee gevallen niets meer over gelijktijdigheid.
 *
 * ⚠️ **Relatief en niet opnieuw vast**, want een vaste datum in 2027 zou hetzelfde
 *    probleem over een jaar teruggeven. `date_trunc('week', …)` geeft in Postgres
 *    de maandag van de ISO-week, en de proefgebruiker staat op `week_start_day =
 *    1` — dus dit ís een cyclusstart voor hem. De isolatie die de vaste datum
 *    gaf, komt van de eigen gebruiker en het eigen doel en niet van het jaartal.
 */
const START = "(date_trunc('week', current_date) + interval '7 days')::date";
const OVERLAPPEND_BEGIN = "(date_trunc('week', current_date) + interval '14 days')::date";

/**
 * De sleutel die `plan_adempauze()` neemt. Dezelfde uitdrukking als in de
 * functie — bewust letterlijk overgenomen, want een test die zijn eigen sleutel
 * uitrekent, zou bij een andere sleutel in de functie nog steeds groen zijn.
 */
const SLEUTEL = `hashtextextended('${DOEL}'::text, 0)`;

function psqlArgs(): string[] {
  return ['-U', PSQL_OMGEVING.PGUSER as string, '-d', PSQL_DB, '-q', '-w', '-tA'];
}

/** Voert SQL uit als de testgebruiker en geeft de kale uitvoer terug. */
function alsGebruiker(sql: string): string {
  return psql(
    `select set_config('request.jwt.claims', ` +
      `json_build_object('sub','${GEBRUIKER}','role','authenticated')::text, true); ` +
      sql,
  );
}

describe.skipIf(!beschikbaar)('twee adempauzes tegelijk', () => {
  let houder: ChildProcess | null = null;

  beforeAll(() => {
    psql(`delete from goals where id = '${DOEL}'`);
    psql(`delete from auth.users where id = '${GEBRUIKER}'`);
    psql(
      `insert into auth.users (id, email) values ('${GEBRUIKER}', 'gelijktijdig@example.test')`,
    );
    psql(
      `update profiles set tz = 'Europe/Amsterdam', week_start_day = 1 where id = '${GEBRUIKER}'`,
    );
    psql(
      `insert into goals (id, owner_id, title, target_date) ` +
        `values ('${DOEL}', '${GEBRUIKER}', 'GELIJKTIJDIG', '2032-01-01')`,
    );
  });

  afterAll(() => {
    houder?.kill('SIGKILL');
    psql(`delete from goals where id = '${DOEL}'`);
    psql(`delete from auth.users where id = '${GEBRUIKER}'`);
  });

  it(
    'laat er maar één door, ook als de tweede binnen de transactie van de eerste valt',
    async () => {
      // Sessie A pakt hetzelfde slot dat `plan_adempauze()` neemt en houdt het
      // vast. `pg_advisory_lock` op sessieniveau, zodat het blijft staan tot we
      // het proces afbreken.
      houder = spawn('psql', psqlArgs(), { env: PSQL_OMGEVING });
      houder.stdin?.write(`select pg_advisory_lock(${SLEUTEL}); select pg_sleep(60);\n`);

      // Wachten tot A het slot écht heeft. Zonder deze lus meet een groene
      // uitslag misschien alleen dat A nog niet begonnen was.
      const tot = Date.now() + 15_000;
      let gepakt = false;
      while (Date.now() < tot) {
        const n = psql(
          `select count(*) from pg_locks where locktype = 'advisory' ` +
            `and granted and ((classid::bigint << 32) | objid::bigint) = ${SLEUTEL}`,
        );
        if (n !== '0') {
          gepakt = true;
          break;
        }
        await new Promise((klaar) => setTimeout(klaar, 100));
      }
      expect(gepakt, 'sessie A heeft het slot niet gepakt; deze test meet dan niets').toBe(true);

      // Sessie B probeert een adempauze te plannen die over die van A heen zou
      // liggen. Met het slot in de functie wacht hij en loopt hij in zijn
      // `statement_timeout`; zonder het slot komt hij er gewoon doorheen.
      let uit = '';
      let geblokkeerd = false;
      try {
        uit = execFileSync('psql', [...psqlArgs(), '-v', 'ON_ERROR_STOP=1'], {
          env: PSQL_OMGEVING,
          encoding: 'utf8',
          input:
            `set statement_timeout = '3s'; ` +
            `select set_config('request.jwt.claims', ` +
            `json_build_object('sub','${GEBRUIKER}','role','authenticated')::text, false); ` +
            `select plan_adempauze('${DOEL}', ${OVERLAPPEND_BEGIN}, ${OVERLAPPEND_BEGIN});`,
        });
      } catch (fout) {
        const tekst = fout instanceof Error ? `${fout.message}` : String(fout);
        if (/canceling statement due to statement timeout/i.test(tekst)) {
          geblokkeerd = true;
        } else {
          throw new Error(`sessie B viel om op iets anders dan het slot:\n${tekst}`);
        }
      }

      expect(
        geblokkeerd,
        `sessie B kwam erdoor terwijl A het slot van dit doel vasthield — dan is de ` +
          `overlapcontrole twee losse statements en geen grendel. psql zei: ${uit}`,
      ).toBe(true);

      expect(
        psql(`select count(*) from breathers where goal_id = '${DOEL}'`),
        'er hoort niets neergelegd te zijn',
      ).toBe('0');
    },
    60_000,
  );

  it(
    'laat een doel dat niets met het slot te maken heeft niet wachten',
    () => {
      // ⚠️ **De must-allow, en zonder hem bewijst de test hierboven ook een
      //    functie die iedereen laat wachten.** Het slot hangt aan het doel;
      //    twee verschillende doelen horen langs elkaar heen te kunnen.
      const ander = proefId(3);
      psql(
        `insert into goals (id, owner_id, title, target_date) ` +
          `values ('${ander}', '${GEBRUIKER}', 'GELIJKTIJDIG-ANDER', '2032-01-01') ` +
          `on conflict (id) do nothing`,
      );

      try {
        const uit = alsGebruiker(
          `set statement_timeout = '5s'; ` +
            `select plan_adempauze('${ander}', ${START}, ${START});`,
        );
        expect(uit, `een ander doel hoorde er gewoon door te kunnen: ${uit}`).toContain(
          '"ok": true',
        );
      } finally {
        psql(`delete from goals where id = '${ander}'`);
      }
    },
    30_000,
  );
});

describe.skipIf(!beschikbaar)('het plafond staat op twee plekken', () => {
  it('en dat zijn twee keer dezelfde weken', () => {
    // ⚠️ **De naad, en de reden dat een tweede kopie van dit getal mag bestaan.**
    //    `MAX_ADEMPAUZE_CYCLI` staat in de client zodat het scherm de grens kan
    //    tónen vóór de knop; `c_max_cycli` staat in `plan_adempauze()` omdat een
    //    grens die alleen in de client staat geen grens is. Lopen ze uiteen, dan
    //    biedt het scherm iets aan dat de database weigert, en dat merkt de
    //    eerste gebruiker die ver vooruit plant.
    //
    // ⚠️ Leest de **gedeployde** functie en niet het migratiebestand.
    //    `pg_get_functiondef()` is de waarheid; een bestand zegt alleen wat er
    //    ooit gedraaid had moeten worden.
    const definitie = psql(
      "select pg_get_functiondef('plan_adempauze(uuid,date,date)'::regprocedure)",
    );

    const gevonden = /c_max_cycli\s+constant\s+integer\s*:=\s*(\d+)/.exec(definitie);
    expect(
      gevonden,
      'de gedeployde functie draagt geen `c_max_cycli` meer — dan bewaakt deze test niets ' +
        'en is de grens misschien wel helemaal weg',
    ).not.toBeNull();

    expect(
      Number(gevonden?.[1]),
      'de client toont een andere bovengrens dan de database afdwingt',
    ).toBe(MAX_ADEMPAUZE_CYCLI);
  });
});
