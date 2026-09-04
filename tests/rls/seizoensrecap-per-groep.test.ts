import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Eén stukke groep kost de rest geen recap — QS8-171, migratie 0158.
 *
 * ⚠️ **De belofte is niet "er staat een `exception`-tak".** Die is: *wat op één
 *    groepsrij stukgaat, kost alleen díe groep zijn recap.* `maak_seizoensrecaps()`
 *    liep in één lus over alle groepen zonder per groep af te vangen, en omdat de
 *    hele aanroep in één transactie zit rolde ook het werk van de groepen dáárvoor
 *    terug. 📏 Gemeten met de vorm van 0112 en één kapotte `groups.tz`:
 *    `ERROR: time zone "Bogus/Zone" not recognized`, **nul recaps voor iedereen**.
 *
 * ⚠️ **En de tweede helft van de belofte: het mag niet stil gebeuren.** Een tak
 *    die de fout wegslikt en daarna "ok" zegt, lost het afbreken op en bouwt het
 *    stille falen in — precies wat de dossierrij als reden noemde om dit te laten
 *    liggen. Daarom toetst elk geval hieronder twee dingen tegelijk: wie er wél
 *    een recap kreeg, én dat de overgeslagen groep in de teruggave staat.
 *
 * ⚠️ **Waarom psql en niet de harness.** De breuk naspelen is DDL — de trigger
 *    `groups_tijdzone` uit 0119 weigert een onbekende zone, en dat is maar goed
 *    ook. Wat hier nagespeeld wordt is dus niet dát pad (dat is dicht) maar de
 *    breekbaarheid die eronder ligt: *elke* fout in één groepsrij deed hetzelfde.
 *    Alles draait in één transactie die aan het eind terugrolt. Dezelfde vorm als
 *    `groepspin.test.ts` en `avatarbucket.test.ts`.
 *
 * ⚠️ **Draait alleen tegen de lokale stack**, want daar is een supergebruiker.
 *    Zonder stack wordt deze suite overgeslagen — en dat is *ongemeten* en niet
 *    groen; `stackBeschikbaarOfFaal()` werpt zodra `RLS_DOEL` gezet is.
 */

/**
 * ⚠️ De proef kijkt naar `mislukt` in de bron en niet alleen naar het bestaan van
 *    de functie. Draait de stack nog op een schema van vóór 0158, dan is de
 *    uitslag "schema loopt achter" en niet een reeks onverklaarbare rode tests.
 */
const beschikbaar = stackBeschikbaarOfFaal(
  `select count(*) from pg_proc
    where proname = 'maak_seizoensrecaps' and prosrc like '%mislukt%'`,
  import.meta.url,
);

/** 1 oktober 2026 om 08:30 in Amsterdam — de eerste dag van Q4, zoals 0112 hem wil. */
const EERSTE_DAG_Q4 = '2026-10-01T06:30:00Z';

const EIGENAAR = '00000000-0000-4000-8000-000000000171';
const GEZOND = '00000000-0000-4000-8000-00000000a171';
const STUK = '00000000-0000-4000-8000-00000000b171';

/**
 * Twee groepen die allebei een recap verdienen: elk een schakel in Q3, zodat
 * `seizoensrecap_cijfers()` niet op nul uitkomt en de job dus niet zwijgt.
 */
const OPSTELLING = `
  create temp table t as select
    '${EIGENAAR}'::uuid eig, '${GEZOND}'::uuid goed, '${STUK}'::uuid stuk;
  insert into auth.users (id, email) select eig, 'recap171@x.nl' from t;
  insert into groups (id, name, created_by, status, invite_code, categorie, tz, season_cadence)
    select goed, 'Gezond', eig, 'active', 'RECAPG01', 'other', 'Europe/Amsterdam', 'quarterly' from t;
  insert into groups (id, name, created_by, status, invite_code, categorie, tz, season_cadence)
    select stuk, 'Stuk', eig, 'active', 'RECAPS01', 'other', 'Europe/Amsterdam', 'quarterly' from t;
  insert into group_members (group_id, user_id, role, status) select goed, eig, 'admin', 'active' from t;
  insert into group_members (group_id, user_id, role, status) select stuk, eig, 'admin', 'active' from t;
  insert into chain_links (group_id, user_id, group_period_start) select goed, eig, '2026-07-01'::date from t;
  insert into chain_links (group_id, user_id, group_period_start) select stuk, eig, '2026-07-01'::date from t;
`;

/**
 * De breuk. `bewaak_tijdzone()` (0119) staat dit pad niet meer toe, en daarom
 * wordt de trigger hier even opzij gezet: wat nagespeeld wordt is niet deze ene
 * oorzaak maar dat een fout in één groepsrij de rest niet meesleept.
 */
const BREEK_DE_STUKKE = `
  alter table groups disable trigger groups_tijdzone;
  update groups set tz = 'Bogus/Zone' where id = (select stuk from t);
  alter table groups enable trigger groups_tijdzone;
`;

interface Uitslag {
  ok: boolean;
  recaps: number;
  mislukt: number;
  /** De `group_id`'s uit `fouten`, alleen die van deze opstelling. */
  overgeslagen: string[];
  berichtenGezond: number;
  berichtenStuk: number;
}

/**
 * Draait de job in een transactie die terugrolt en geeft terug wat hij deed.
 *
 * ⚠️ De berichtentelling staat er náást de teruggave, en niet in plaats ervan.
 *    Een functie die vrolijk `recaps: 1` teruggeeft zonder iets te plaatsen, is
 *    precies de vorm die een test op alleen de teruggave niet ziet.
 */
function draai(breuk: string): Uitslag {
  const uit = psql(`
    begin;
    ${OPSTELLING}
    ${breuk}
    select set_config('recap.uit',
      maak_seizoensrecaps('${EERSTE_DAG_Q4}'::timestamptz)::text, true) from t;
    select current_setting('recap.uit')
      || '|' || (select count(*) from chat_messages
                  where group_id = (select goed from t) and system_event = 'season_recap')
      || '|' || (select count(*) from chat_messages
                  where group_id = (select stuk from t) and system_event = 'season_recap');
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  const [rauw, gezond, stuk] = uit.split('|');
  const uitslag = JSON.parse(rauw as string) as {
    ok: boolean;
    recaps: number;
    mislukt: number;
    fouten: { group_id: string }[];
  };

  return {
    ok: uitslag.ok,
    recaps: uitslag.recaps,
    mislukt: uitslag.mislukt,
    // ⚠️ Afgefilterd op deze opstelling. De lokale stack draagt ook groepen van
    //    andere suites; die horen deze assertie niet te kunnen kleuren.
    overgeslagen: uitslag.fouten
      .map((f) => f.group_id)
      .filter((id) => id === GEZOND || id === STUK),
    berichtenGezond: Number(gezond),
    berichtenStuk: Number(stuk),
  };
}

describe.skipIf(!beschikbaar)('een stukke groep kost de rest geen recap', () => {
  it('geeft de gezonde groep zijn recap terwijl de stukke overgeslagen wordt', () => {
    const uitslag = draai(BREEK_DE_STUKKE);

    // ⚠️ **Dit is de belofte.** Met de vorm van 0112 stond hier nul: de hele
    //    aanroep brak af op de stukke rij en rolde het werk van de andere terug.
    expect(uitslag.berichtenGezond, 'de gezonde groep kreeg geen recap').toBe(1);
    expect(uitslag.berichtenStuk, 'de stukke groep kreeg er wél een').toBe(0);
  });

  it('meldt de overgeslagen groep in plaats van hem weg te slikken', () => {
    const uitslag = draai(BREEK_DE_STUKKE);

    // ⚠️ Zonder deze twee regels lost de exception-tak het afbreken op en bouwt
    //    hij het stille falen in dat de dossierrij vreesde.
    expect(uitslag.mislukt, 'de teller telde de overgeslagen groep niet').toBe(1);
    expect(uitslag.overgeslagen).toEqual([STUK]);
  });

  it('zegt ok, want de job hééft gedraaid', () => {
    const uitslag = draai(BREEK_DE_STUKKE);

    expect(uitslag.ok).toBe(true);
    expect(uitslag.recaps).toBeGreaterThanOrEqual(1);
  });

  /**
   * ⚠️ De andere kant. Zonder dit geval zou `mislukt: 1` ook kloppen bij een
   *    teller die altijd één zegt, en `berichtenStuk: 0` bij een job die de
   *    tweede groep überhaupt nooit bereikt.
   */
  it('telt niets als er niets stuk is, en bedient dan beide groepen', () => {
    const uitslag = draai('');

    expect(uitslag.mislukt, 'er ging iets mis terwijl er niets stuk was').toBe(0);
    expect(uitslag.overgeslagen).toEqual([]);
    expect(uitslag.berichtenGezond).toBe(1);
    expect(uitslag.berichtenStuk).toBe(1);
  });
});

/**
 * De tweede grendel: **een afbreking van buiten is geen groepsfout.**
 *
 * Wordt de job van buitenaf gestopt, dan is per groep dóórgaan het slechtste wat
 * er kan gebeuren: duizend iteraties die allemaal "overgeslagen" melden en daarna
 * "ok" zeggen.
 *
 * ⚠️ **Drie keer dezelfde opstelling met één verschil: de SQLSTATE.** Dat is met
 *    opzet. Een test die alleen het afbreken toont, bewijst niet dat het aan de
 *    code lag en niet aan de nagespeelde fout zelf; een test die alleen het
 *    doorlopen toont, bewijst niet dat er iets overgeslagen kán worden. Samen
 *    wijzen ze precies één regel aan.
 *
 * ⚠️ **`57014` en `57P01` staan er allebei, en om verschillende redenen.** De
 *    eerste hoort te ontsnappen omdat PL/pgSQL hem nooit aan `when others` geeft
 *    — 📏 nagemeten, samen met `P0004`; de tweede omdat 0158 hem met naam
 *    doorgooit. De eerste bewaakt dus een aanname over de táál en de tweede een
 *    regel in de functie. Zou de taal ooit veranderen, dan wordt hier zichtbaar
 *    dat een `statement_timeout` stilletjes als groepsfout geteld wordt.
 */
function metGeforceerdeFout(sqlstate: string): { afgebroken: boolean; melding: string } {
  const sql = `
    begin;
    ${OPSTELLING}
    create or replace function public.seizoensgrens(
      p_tz text, p_cadence text, p_op timestamptz default now())
      returns table (season_start date, season_end date, is_eerste_dag boolean, is_acht_uur boolean)
      language plpgsql
      set search_path = public, pg_catalog, pg_temp
    as $stub$
    begin
      raise exception 'nagespeelde afbreking' using errcode = '${sqlstate}';
    end;
    $stub$;
    select maak_seizoensrecaps('${EERSTE_DAG_Q4}'::timestamptz)::text;
    rollback;
  `;

  try {
    return { afgebroken: false, melding: psql(sql) };
  } catch (fout) {
    return { afgebroken: true, melding: fout instanceof Error ? fout.message : String(fout) };
  }
}

describe.skipIf(!beschikbaar)('een afbreking van buiten is geen groepsfout', () => {
  it('gooit een afsluitcode van de server door in plaats van hem te tellen', () => {
    // 57P01 = admin_shutdown, en die vángt `when others` wél. Dit is de tak in
    // 0158 zelf; zonder hem telt de functie hem als een gewone groepsfout.
    const { afgebroken, melding } = metGeforceerdeFout('57P01');

    expect(afgebroken, 'de afbreking werd als groepsfout weggeslikt').toBe(true);
    expect(melding).toContain('nagespeelde afbreking');
  });

  it('laat query_canceled ontsnappen, zoals PL/pgSQL belooft', () => {
    // 57014 = query_canceled: een `statement_timeout` of een `pg_cancel_backend`.
    // Deze komt niet langs een tak in 0158 maar langs de taal. Wordt hij hier
    // ooit groen, dan slikt de job een afbreking weg als groepsfout.
    const { afgebroken, melding } = metGeforceerdeFout('57014');

    expect(afgebroken, 'een afgebroken job telde vrolijk door').toBe(true);
    expect(melding).toContain('nagespeelde afbreking');
  });

  it('en vangt een gewone fout in exact dezelfde opstelling wél af', () => {
    const { afgebroken, melding } = metGeforceerdeFout('22023');

    expect(afgebroken, 'een gewone groepsfout brak de hele job af').toBe(false);

    const uitslag = JSON.parse(
      melding.split('\n').filter((r) => r.trim() !== '').at(-1) as string,
    ) as { ok: boolean; mislukt: number };

    expect(uitslag.ok).toBe(true);
    // Beide groepen struikelen over de stub, en dat hoort twee tellingen te zijn.
    expect(uitslag.mislukt).toBeGreaterThanOrEqual(2);
  });
});
