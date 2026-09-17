import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De belofte: **`create_group()` geeft op élke groepsnaam een gestructureerd
 * antwoord** — `{ok: true, …}` of `{ok: false, reason: …}`, en nooit een kale
 * databasefout — en wat er landt is genormaliseerd. QS8-515, migratie 0287.
 *
 * ⚠️⚠️ **Dit toetst het antwoord en niet de functie.** `schone_naam()` staat al
 *    onder een naadtest die het hele codepuntbereik afloopt
 *    (`tests/rls/naamnormalisatie.test.ts`); die was groen terwijl dit gat
 *    openstond. Wat ontbrak was een toets op de vraag die de aanroeper stelt:
 *    *krijg ik hier een antwoord dat `api.ts` kan vertalen?* 📏 Vóór 0287 gaf
 *    `create_group(U&'\00A0Jan\00A0')` een `23514` op `groups_name_schoon`,
 *    omdat `create_group()` met `btrim()` streek en de CHECK met
 *    `schone_naam()` toetst — twee vragen waar er één hoorde te staan.
 *
 * ⚠️ **Via PostgREST als een echte `authenticated`, en niet over psql.** Dat is
 *    de route die een directe RPC-aanroeper neemt, en het is de enige route waar
 *    een `23514` zichtbaar wordt als `error` in plaats van als een uitzondering.
 *
 * ⚠️ **`error` is de assertie die de belofte draagt, niet `ok`.** Een toets die
 *    alleen `ok === false` eist, leest een omgevallen aanroep als een nette
 *    weigering: bij een `23514` is `data` namelijk `null`, en `null?.ok` is óók
 *    niet `true`. Daarom staat de `error`-assertie overal vóórop.
 *
 * ⚠️ **De tweede helft staat onderaan: de naad.** `create_group()` bewaakt de
 *    naam met één vraag (`schone_naam()`), en de tabel bewaakt hem met zeven
 *    CHECKs. Dat gat is precies zo groot als het verschil tussen die twee, en
 *    het groeit zodra iemand een achtste CHECK op `groups.name` zet die
 *    `schone_naam()` niet impliceert. Die toets loopt daarom niet langs een
 *    lijstje constraintnamen dat ik hier intik, maar langs `pg_constraint`.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** `U+00A0` NO-BREAK SPACE — de rand uit de meting van QS8-515. */
const NBSP = String.fromCodePoint(0x00a0);
/** `U+200B` ZERO WIDTH SPACE. */
const ZWSP = String.fromCodePoint(0x200b);
/** `U+202E` RIGHT-TO-LEFT OVERRIDE — het teken uit de meting van QS8-494. */
const RLO = String.fromCodePoint(0x202e);
/** `U+2063` INVISIBLE SEPARATOR. */
const ONZICHTBARE_SCHEIDING = String.fromCodePoint(0x2063);
/** `U+2001` EM QUAD — een randteken. */
const EM_QUAD = String.fromCodePoint(0x2001);
/** `U+FE05` VARIATION SELECTOR-6 — geen randteken, wél een nul-pixelteken. */
const VS6 = String.fromCodePoint(0xfe05);

interface Geval {
  readonly naam: string;
  readonly ruw: string;
  /** `null` = de groep hoort te landen; anders de reden die terug moet komen. */
  readonly reden: string | null;
  /** Wat er dan in `groups.name` hoort te staan. Alleen zinvol als `reden` null is. */
  readonly landt?: string;
}

const GEVALLEN: readonly Geval[] = [
  // ---------------------------------------------------------------------------
  // De rand — het geval waar dit issue over gaat
  // ---------------------------------------------------------------------------
  {
    naam: 'een no-break space aan beide randen',
    ruw: `${NBSP}Hardlopers${NBSP}`,
    reden: null,
    landt: 'Hardlopers',
  },
  {
    naam: 'een zero-width space aan beide randen',
    ruw: `${ZWSP}Hardlopers${ZWSP}`,
    reden: null,
    landt: 'Hardlopers',
  },
  // ⚠️ Het geval waar `btrim()` en `schone_naam()` een ánder antwoord geven op de
  //    lengtevraag: na `btrim()` zijn dit drie tekens en na `schone_naam()` één.
  //    Vóór 0287 kwam dit door de lengtetoets heen en viel het om op de CHECK.
  {
    naam: 'een naam die na het strijken één teken overhoudt',
    ruw: `${NBSP}a${NBSP}`,
    reden: 'name_too_short',
  },
  {
    naam: 'een naam van uitsluitend onzichtbare tekens',
    ruw: `${ZWSP}${NBSP}${ONZICHTBARE_SCHEIDING}`,
    reden: 'name_too_short',
  },

  // ---------------------------------------------------------------------------
  // Het midden — hier verandert 0287 het gedrag, en dat is opzet
  // ---------------------------------------------------------------------------
  //
  // ⚠️⚠️ **Deze twee werden vóór 0287 gewéígerd en worden nu gestreken.** De
  //    belofte eronder — *er landt geen groepsnaam die als een andere groep
  //    rendert* — is in beide gevallen waar, en het is dezelfde uitkomst die de
  //    app-route al gaf (`schemas.ts` doet `.transform(schoneNaam)` vóór de
  //    lengtetoets). Wat verdwijnt is het verschil tussen de twee routes.
  {
    naam: 'een override midden in de naam',
    ruw: `Just${RLO}kcart`,
    reden: null,
    landt: 'Justkcart',
  },
  {
    naam: 'een zero-width space tussen twee letters',
    ruw: `a${ZWSP}b`,
    reden: null,
    landt: 'ab',
  },
  {
    naam: 'een regelovergang midden in de naam',
    ruw: 'Jan\nAdmin',
    reden: null,
    landt: 'JanAdmin',
  },

  // ---------------------------------------------------------------------------
  // ⚠️⚠️ Het geval waarvoor één aanroep van `schone_naam()` niet genoeg is
  // ---------------------------------------------------------------------------
  //
  // 📏 Gemeten bij QS8-515, en het bepaalde de vorm van migratie 0287:
  //
  //     schone_naam(EM_QUAD + VS6 + 'ab')  ->  VS6 + 'ab'
  //     schone_naam(VS6 + 'ab')            ->  'ab'
  //
  // De randstap haalt de EM QUAD weg en schuift de variatieselector naar een
  // positie waar `zonder_onzichtbaar_tussen_letters()` er wél iets van vindt —
  // maar die stap is in diezelfde aanroep al geweest. Eén aanroep levert dus een
  // naam op die `groups_name_geen_onzichtbaar_tussen_letters` wéígert. 0287
  // strijkt daarom tot een vast punt; zonder die lus staat hier een kale `23514`.
  {
    naam: 'een naam waar één keer strijken niet genoeg is',
    ruw: `${EM_QUAD}${VS6}ab`,
    reden: null,
    landt: 'ab',
  },

  // ---------------------------------------------------------------------------
  // De lengte — dezelfde vraag als de CHECK, dus ná het strijken gemeten
  // ---------------------------------------------------------------------------
  {
    naam: 'een naam van eenenzestig zichtbare tekens',
    ruw: 'x'.repeat(61),
    reden: 'name_too_long',
  },
  // ⚠️ Zestig zichtbare tekens met onzichtbare randen eromheen. Met `btrim()`
  //    telde dit als tweeënzestig en kwam het er als `name_too_long` uit; de
  //    CHECK zou de gestreken versie gewoon hebben aangenomen. De lengtetoets en
  //    de CHECK stellen nu dezelfde vraag.
  {
    naam: 'zestig zichtbare tekens met onzichtbare randen',
    ruw: `${NBSP}${'x'.repeat(60)}${ZWSP}`,
    reden: null,
    landt: 'x'.repeat(60),
  },

  // ⚠️⚠️ **De grove bovengrens van duizend, en die is er om wat hij kóst en niet
  //    om wat hij is.** 📏 `public.schone_naam()` op vijf miljoen zero-width
  //    spaties kost 1.470 ms tegen 94 ms voor `btrim()`, en de lus draait hem tot
  //    twee keer — vóór élke limiet, en zonder dat `daily_limit` optelt, dus
  //    onbeperkt herhaalbaar. Gevonden in de security-ronde op QS8-515.
  //
  //    ⚠️⚠️ **Duizend-en-een onzichtbare tekens en geen duizend-en-een `x`-en**,
  //       en dat verschil is wat dit geval tot een grendel maakt. Bij `x`-en
  //       komt er `name_too_long` uit met én zonder de grens — de lengtetoets
  //       ná het strijken geeft hetzelfde antwoord — en dan bewaakt de toets
  //       niets. Onzichtbare tekens strijken wég: zónder de grens landt dit als
  //       `'ab'`, mét de grens komt er `name_too_long`. Regel 18 vraag 3.
  //
  //    ⚠️ Dat is meteen de prijs van de grens, en die staat hier zodat hij een
  //       keuze blijft: een invoer van meer dan duizend ruwe tekens wordt
  //       geweigerd óók als er een geldige naam van overblijft. De app-route kan
  //       daar niet komen — `groepSchema` weigert boven de zestig — en de
  //       weigering is gestructureerd.
  {
    naam: 'duizend-en-een onzichtbare tekens met een naam erin',
    ruw: `${ZWSP.repeat(1001)}ab`,
    reden: 'name_too_long',
  },

  // ---------------------------------------------------------------------------
  // De must-allow — een doodgewone naam blijft een doodgewone naam
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Niet optioneel.** Zonder dit geval blijft alles hierboven groen als
  //    `create_group()` élke naam op `name_too_short` afwijst — een dichte deur
  //    leest dan als een veilige deur.
  { naam: 'een gewone groepsnaam', ruw: 'De Hardlopers', reden: null, landt: 'De Hardlopers' },
  { naam: 'een Arabische groepsnaam', ruw: 'مجموعة', reden: null, landt: 'مجموعة' },
  { naam: 'een groepsnaam met een emoji', ruw: '🏃 Hardlopers', reden: null, landt: '🏃 Hardlopers' },
];

const stackBeschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_constraint where conname = 'groups_name_schoon'",
  import.meta.url,
);

/**
 * ⚠️⚠️ **Eén gebruiker per drie gevallen, en dat is geen netheid maar een
 *    gemeten val.** `create_group()` staat op tien groepen per dag én tien
 *    lidmaatschappen; de gevallen hierboven laten er tien landen. Met één
 *    gebruiker zit de suite dus exact op de grens, en het eerstvolgende geval
 *    dat erbij komt maakt niet zichzelf rood maar het **laatste** geval, met de
 *    melding "create_group() weigerde een naam die hij hoort door te laten" —
 *    terwijl de oorzaak `daily_limit` is en niets met die naam te maken heeft.
 *    📏 Gemeten in de security-ronde op QS8-515, met één extra must-allow.
 *
 *    Een toets die rood wordt op het verkeerde geval, stuurt de volgende lezer
 *    naar de verkeerde plek. De rotatie houdt de marge groot genoeg dat een
 *    geval erbij niets omgooit.
 */
const GEBRUIKERS_IN_ROULATIE = 5;

let gebruikers: TestUser[] = [];
/** Een eigen gebruiker voor de handlertoets, om dezelfde reden als de rotatie. */
let proefgebruiker: TestUser;

describe.skipIf(!rlsTestsConfigured)('create_group() antwoordt gestructureerd', () => {
  beforeAll(async () => {
    gebruikers = [];
    for (let i = 0; i < GEBRUIKERS_IN_ROULATIE; i += 1) {
      gebruikers.push(await createTestUser(`gestructureerd-antwoord-${i}`));
    }
    proefgebruiker = await createTestUser('gestructureerd-handler');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it.each(GEVALLEN.map((geval, index) => ({ ...geval, index })))(
    'geeft op $naam een antwoord en geen databasefout',
    async ({ ruw, reden, landt, index }) => {
      const gebruiker = gebruikers[index % GEBRUIKERS_IN_ROULATIE];
      if (!gebruiker) throw new Error('geen testgebruiker voor dit geval — beforeAll liep niet');
      const { data, error } = await gebruiker.db.rpc('create_group', {
        group_name: ruw,
        huddle_day: 1,
        tz: 'Europe/Amsterdam',
      });

      // ⚠️ **Dit is de belofte.** Een `23514` komt hier binnen als een `error`
      //    met een constraintnaam erin, en `api.ts` heeft daar geen vertaling
      //    voor — de gebruiker krijgt dan de tekst van een databasefout te zien.
      expect(
        error === null ? null : `${error.code} ${error.message}`,
        'create_group() viel om op de database in plaats van een reden terug te geven',
      ).toBeNull();

      const antwoord = data as unknown as {
        ok?: boolean;
        reason?: string;
        group?: { id: string };
      } | null;

      if (reden !== null) {
        expect(antwoord?.ok, 'create_group() maakte een groep aan die hij hoorde te weigeren').toBe(
          false,
        );
        expect(
          antwoord?.reason,
          'create_group() weigerde, maar met een andere reden dan deze toets bewaakt',
        ).toBe(reden);
        return;
      }

      expect(antwoord?.ok, 'create_group() weigerde een naam die hij hoort door te laten').toBe(
        true,
      );

      const id = antwoord?.group?.id;
      expect(id, 'create_group() zei ok maar gaf geen groep terug').toBeTruthy();
      if (!id) return;
      registreerGroep(id);

      // ⚠️ **Teruglezen en niet op `to_jsonb(nieuw)` vertrouwen.** Die kopie komt
      //    uit de `returning` van de insert; hij bewijst wel dát er iets geland
      //    is, maar hij is dezelfde regel code als de insert zelf. De vraag is
      //    wat er in de tabel staat.
      const na = await adminDb().from('groups').select('name').eq('id', id).single();

      expect(na.data?.name, 'de groep landde met een andere naam dan de gestreken versie').toBe(
        landt,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * Draait `create_group()` in een transactie die terugdraait, met één extra
   * CHECK op `groups` erbij. Geeft de uitvoer van psql terug.
   *
   * ⚠️ De sessie zet alleen de JWT-claims en geen rol: `create_group()` is
   *    `security definer` en leest de aanroeper uit `auth.uid()`, dus dat is wat
   *    er nodig is. Wat hier getoetst wordt is de handler, niet RLS.
   *
   * ⚠️ `not valid`, zodat de bestaande rijen van deze database ongemoeid blijven.
   */
  function metProefbeperking(definitie: string): string {
    return psqlMetInvoer(`
begin;
alter table public.groups add constraint zz_ijk_proef check (${definitie}) not valid;
create temp table zz_uit (tekst text) on commit drop;
set local request.jwt.claims = '{"sub":"${proefgebruiker.id}","role":"authenticated"}';
do $ijk$
declare v jsonb;
begin
  begin
    v := public.create_group('Proefgroep', 1::smallint, 'Europe/Amsterdam');
    insert into zz_uit values ('ANTWOORD=' || v::text);
  exception when others then
    insert into zz_uit values ('OMGEVALLEN=' || sqlstate);
  end;
end;
$ijk$;
select tekst from zz_uit;
rollback;
`);
  }

  /**
   * De handler zelf — **de tak die vandaag alleen met een extra CHECK te
   * bereiken is**, en daarom hier met de hand gevoed wordt.
   *
   * ⚠️⚠️ **Dit is de reden dat die tak er staat en niet de reden dat hij weg
   *    kon.** In de eerste versie van 0287 zat geen handler, met als
   *    onderbouwing dat `schone_naam()` elke CHECK impliceert. 📏 Die aanname is
   *    onderuitgegaan op een gemeten geval (zie de kop hierboven), en een
   *    `check_violation` die niemand opvangt is voor de aanroeper een kale
   *    `23514`. Een tak zonder toets is een aanname; deze toets maakt er een
   *    grendel van.
   *
   * ⚠️ **Over psql en in een transactie die terugdraait**, want de opstelling
   *    voegt een CHECK aan `groups` toe. `not valid`, zodat bestaande rijen
   *    ongemoeid blijven.
   *
   * ⚠️ De sessie zet alleen de JWT-claims en geen rol: `create_group()` is
   *    `security definer` en leest de aanroeper uit `auth.uid()`, dus dat is wat
   *    er nodig is. Wat hier getoetst wordt is de handler, niet RLS.
   */
  it.skipIf(!stackBeschikbaar)(
    'geeft name_invalid als een CHECK op de naam het alsnog weigert',
    () => {
      const uit = metProefbeperking('name = upper(name)');

      expect(
        uit.match(/OMGEVALLEN=\S+/)?.[0] ?? null,
        'create_group() viel om op de CHECK in plaats van hem te vertalen',
      ).toBeNull();
      // ⚠️ Een regex en geen `toContain` op een letterlijke jsonb-tekst: de
      //    witruimte in `jsonb::text` is een opmaakkeuze van Postgres en geen
      //    belofte. 📏 Deze toets stond eerst op `"reason" : "…"` met een spatie
      //    en werd rood op `"reason": "…"` zonder.
      expect(
        /"reason"\s*:\s*"name_invalid"/.test(uit),
        `create_group() gaf geen name_invalid terug toen een CHECK op de naam weigerde: ${uit}`,
      ).toBe(true);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️⚠️ **De andere helft, en zonder haar bewaakt de toets hierboven de
   *    versmalling niet.** De handler mag alléén een CHECK vertalen die over
   *    `groups.name` gaat; elke andere hoort ongewijzigd door te gaan, want een
   *    handler die élke `check_violation` naar een nette reden vertaalt verbergt
   *    een echte fout achter een gebruikersmelding.
   *
   *    📏 Gemeten in de security-ronde op QS8-515: met de `pg_constraint`-toets
   *    uit de handler gehaald — élke `check_violation` wordt dan `name_invalid` —
   *    bleven alle 56 toetsen van de drie geraakte suites **groen**. De
   *    eigenschap die de migratiekop als veiligheidsgrens beschrijft, kon
   *    verdwijnen zonder dat iets rood werd. Dat is precies "een grendel die
   *    alleen in een comment staat".
   *
   * ⚠️ `tz` en niet `huddle_day`: die eerste wordt hierboven wel op bestaan
   *    getoetst maar niet op waarde, dus deze CHECK vuurt écht bij de `insert` en
   *    niet eerder.
   */
  it.skipIf(!stackBeschikbaar)(
    'gooit een CHECK die niet over de naam gaat ongewijzigd door',
    () => {
      const uit = metProefbeperking("tz <> 'Europe/Amsterdam'");

      expect(
        /"reason"\s*:\s*"name_invalid"/.test(uit),
        `create_group() vertaalde een CHECK die niets met de naam te maken heeft naar een naamfout: ${uit}`,
      ).toBe(false);
      expect(
        uit.match(/OMGEVALLEN=\S+/)?.[0] ?? null,
        'create_group() ving een CHECK op die hij had moeten doorgooien',
      ).toBe('OMGEVALLEN=23514');
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// De naad — stelt `create_group()` dezelfde vraag als de tabel?
// ---------------------------------------------------------------------------

/**
 * De andere helft van de naad: **het vaste punt van `schone_naam()` haalt élke
 * CHECK op `groups.name`.**
 *
 * ⚠️⚠️ **Het vaste punt, en niet één aanroep — en dat verschil is hier gemeten
 *    en niet aangenomen.** `schone_naam()` is niet idempotent: 📏 256 van
 *    1.136.356 paargevallen veranderen bij een tweede aanroep nog, en alle 256
 *    zakken op `zonder_onzichtbaar_tussen_letters`. Deze toets stond er eerst
 *    met één aanroep in en werd rood op precies dat geval — de eerste versie van
 *    0287 had dezelfde fout, en die is er hierdoor uit gekomen.
 *
 * ⚠️⚠️ **Twee grendels en niet één, en ze hangen aan verschillende dingen.** De
 *    gevallen hierboven toetsen dat `create_group()` de naam met
 *    `schone_naam()` strijkt; deze toetst dat wat daar uitkomt ook langs de
 *    tabel komt. Samen dragen ze de belofte *`create_group()` kan geen CHECK op
 *    `name` raken*; los draagt geen van beide hem.
 *
 *    📏 Dat is gemeten en niet bedacht: met `btrim()` teruggezet in
 *    `create_group()` gaan acht van de gevallen hierboven rood en blijft deze
 *    toets groen — hij leest `create_group()` niet en hoort dat ook niet te
 *    doen. Wie hier één van de twee weghaalt, houdt een groene suite over die
 *    de helft van de belofte laat vallen.
 *
 * ⚠️⚠️ **Deze toets loopt langs `pg_constraint` en niet langs een lijstje dat ik
 *    hier intik**, en dat is het verschil tussen een toets die de belofte
 *    bewaakt en een toets die de stand van vandaag vastlegt. Zet iemand een
 *    achtste CHECK op `groups.name` die `schone_naam()` niet impliceert — een
 *    hoofdletterregel, een verbod op cijfers — dan is het gat van QS8-515 terug,
 *    en dan hoort deze toets rood te worden zonder dat iemand hem daarvoor heeft
 *    aangepast.
 *
 * ⚠️ **Alleen enkelkoloms-CHECKs op `name`.** Een CHECK over twee kolommen is
 *    per constructie niet op een losse naam te evalueren, en `create_group()`
 *    kan die ook niet nabootsen; zo een zou een eigen bevinding zijn en geen
 *    stille overslag. Er staat er vandaag geen — en zodra die er wél een is,
 *    meldt de telling onderaan dat er minder CHECKs bekeken zijn dan er staan.
 */
describe.skipIf(!stackBeschikbaar)('de naad tussen de normalisatie en groups.name', () => {
  it(
    'elke CHECK op groups.name is waar voor het vaste punt van schone_naam()',
    () => {
      const ruw = GEVALLEN.map((g) => g.ruw);

      const sql = `
begin;
-- Het VASTE PUNT en niet een enkele aanroep: schone_naam() is niet idempotent
-- (gemeten bij QS8-515: 256 van 1.136.356 paargevallen, maximale diepte 2).
-- Dezelfde lus als in create_group(), met hetzelfde plafond — wat die functie
-- opslaat is wat deze toets moet toetsen, en dat is de uitkomst van de lus en
-- niet van de eerste stap.
create function pg_temp.vast_punt(p text) returns text language plpgsql as $vp$
declare v text := p; w text;
begin
  for i in 1..5 loop
    w := public.schone_naam(v);
    exit when w = v;
    v := w;
  end loop;
  return v;
end;
$vp$;

create temp table zz_namen (name text) on commit drop;
insert into zz_namen (name)
select pg_temp.vast_punt(v.ruw)
from (values ${ruw.map((r) => `(${literal(r)})`).join(',')}) v(ruw)
where char_length(pg_temp.vast_punt(v.ruw)) between 2 and 60;

create temp table zz_uitslag (conname text, aantal bigint) on commit drop;
create temp table zz_telling (bekeken integer, totaal integer) on commit drop;

do $naad$
declare
  r          record;
  v_aantal   bigint;
  v_bekeken  integer := 0;
  v_totaal   integer;
  v_naamattr smallint;
begin
  select attnum into v_naamattr
  from pg_attribute where attrelid = 'public.groups'::regclass and attname = 'name';

  select count(*) into v_totaal
  from pg_constraint
  where conrelid = 'public.groups'::regclass and contype = 'c'
    and v_naamattr = any (conkey);

  for r in
    select conname, pg_get_expr(conbin, conrelid) as expr
    from pg_constraint
    where conrelid = 'public.groups'::regclass and contype = 'c'
      and conkey = array[v_naamattr]
    order by conname
  loop
    v_bekeken := v_bekeken + 1;
    execute format('select count(*) from zz_namen where not (%s)', r.expr) into v_aantal;
    insert into zz_uitslag (conname, aantal) values (r.conname, v_aantal);
  end loop;

  insert into zz_telling (bekeken, totaal) values (v_bekeken, v_totaal);
end;
$naad$;

-- ⚠️ Over stdout en niet met \`raise notice\`: dat laatste schrijft naar stderr,
--    en \`psqlMetInvoer()\` geeft alleen stdout terug. 📏 Dat kostte deze toets
--    zijn eerste ijking: de lus had gedraaid, de uitslag was nul schendingen, en
--    de toets viel om op "het naadblok heeft niet gedraaid".
select 'GESCHONDEN=' || conname || ' AANTAL=' || aantal from zz_uitslag where aantal > 0;
select 'BEKEKEN=' || bekeken || ' VAN=' || totaal from zz_telling;
rollback;
`;

      const uit = psqlMetInvoer(sql);

      expect(
        uit.match(/GESCHONDEN=(\S+)/g) ?? [],
        'het vaste punt van schone_naam() haalt een CHECK op groups.name niet — dan is ' +
          'de normalisatie in create_group() niet langer genoeg en komt de kale 23514 ' +
          'terug voor wie de RPC rechtstreeks aanroept',
      ).toEqual([]);

      const telling = uit.match(/BEKEKEN=(\d+) VAN=(\d+)/);
      expect(telling, 'het naadblok heeft niet gedraaid').not.toBeNull();
      if (!telling) return;

      // ⚠️ **De tweede helft van deze toets.** Zonder haar is "nul schendingen"
      //    ook waar als er nul CHECKs bekeken zijn — een lus over een lege lijst
      //    is altijd groen. Dit eist dat er iets bekeken is, en dat er niets
      //    overgeslagen is.
      expect(
        Number(telling[1]),
        'er zijn geen CHECKs op groups.name bekeken — de lus liep over niets',
      ).toBeGreaterThanOrEqual(7);
      expect(
        Number(telling[1]),
        'er staat een CHECK op groups.name die deze toets niet kon evalueren',
      ).toBe(Number(telling[2]));
    },
    TEST_TIMEOUT,
  );
});

/** `E'…'` met de aanhalingstekens en de backslashes ontsnapt — psql krijgt dit via stdin. */
function literal(waarde: string): string {
  return `E'${waarde.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}
