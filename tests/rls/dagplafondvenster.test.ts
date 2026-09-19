import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De belofte: het etmaalvenster van een dagplafond is niet door de client te
 * verzetten — QS8-558, vervolg op QS8-295 en QS8-299.
 *
 * ⚠️⚠️ **Waarom dit naast `tijdstempels.test.ts` staat en er niet in valt.** Die
 *    toetst een eigenschap van een ónderdeel: *deze kolom wordt door de server
 *    gezet, dus de client mag hem niet schrijven*. Dit toetst de belofte:
 *    *het venster waar dit dagplafond op rekent, is niet te verzetten*. Regel 18,
 *    vraag 2 — en het verschil is te meten.
 *
 *    📏 Rij 603 van `docs/ENGINEER-REVIEW.md` schrijft voor dat je nakijkt of
 *    `created_at` servergestempeld is. Gemeten op stand 0291 rusten de achttien
 *    vensters op **drie** verschillende kolommen: veertien op `created_at`, één
 *    op `completions.submitted_at`, één op `goal_group_links.linked_at`. Twee
 *    tellen via `tel_dagteller()` in `dagtellers` en rusten op géén rijkolom.
 *    Wie op het wóórd `created_at` nakijkt, mist er twee.
 *
 * ⚠️ **De rij was acht toen hij geschreven werd (07-09), zestien op 09-09 en
 *    achttien vandaag.** De voorwaarde die hij draagt — *wordt zwaarder als er
 *    een tabel bij komt die een dagplafond krijgt zonder dat iemand nakijkt* —
 *    is dus tien keer ingetreden, en tien keer heeft iemand het goed gedaan.
 *    Dat is diligentie en geen grendel; dit bestand is de grendel.
 *
 * IJKING — met de hand gedraaid op 19-09-2026, één mutatie per grendel, elk op
 * de échte database en daarna teruggerold. De uitslagen hieronder zijn gemeten,
 * niet voorspeld:
 *
 *   A  `grant insert (created_at) on todo_items to authenticated`
 *      -> **2 rood**: 'geen dagplafond rust op een kolom die de client kan
 *         verzetten' én 'laat geen enkele timestamptz met een now()-default in
 *         een client-grant staan'
 *   B  `grant update (submitted_at) on completions to authenticated`
 *      -> **2 rood**: dezelfde twee
 *   C  tak 1 van `dagplafondvenster_bewaking()` uitgezet
 *      -> **1 rood**: 'een dagplafond waarvan de vorm niet te lezen is'
 *   D  `grant update (aantal) on dagtellers to authenticated`
 *      -> **2 rood**: 'geen dagplafond rust op…' én 'de tellertabel onder de
 *         tel_dagteller-vorm staat dicht'
 *   E  een dagplafond op een kolom zónder serverklok-default, client-schrijfbaar
 *      -> **1 rood**: alleen 'geen dagplafond rust op…'
 *   H  een blijvende `*_dagplafond`-trigger met geen van beide vormen
 *      -> **2 rood**: 'geen dagplafond rust op…' én 'elk dagplafond valt in
 *         precies één van de twee vormen'
 *   I  tak 2 uit de bewaking (venster op een kolom van een ándere tabel)
 *      -> **1 rood**: 'een venster op een kolom die niet op de eigen tabel
 *         staat, is een bezwaar'
 *
 * En na de security-ronde, die drie gaten vond die deze ijking niet raakte:
 *
 *   J  de bewaking leest `prosrc` rauw in plaats van via `code_zonder_commentaar()`
 *      -> **2 rood**: 'een commentaarregel stuurt de vensterkolom niet' én 'een
 *         comment dat `tel_dagteller` noemt maakt van een lege rem geen tellervorm'
 *   K  de stringtak uit de knip
 *      -> **1 rood**: 'de knip zelf klopt'
 *   L  tak 1b eruit (meer dan één venster wordt weer een stille eerste-keuze)
 *      -> **eerst 0 rood**, daarna 1: 'twee vensterkolommen in één rem zijn een
 *         bezwaar en geen stille keuze'
 *
 * ⚠️⚠️ **L is de belangrijkste regel in dit blok.** Die tak was er, hij deed het,
 *    en géén enkele test raakte hem — de suite bleef groen op elf tests met de
 *    tak uitgezet. Dat is niet uit nadenken gekomen maar uit de mutatie, en het
 *    is precies waarom CLAUDE.md één mutatie per grendel eist in plaats van één
 *    mutatie voor de controle. De toets is er daarna bij geschreven.
 *
 * ⚠️⚠️ **En het gat dat J nu bewaakt was ernstiger dan het gat waar dit issue
 *    mee begon.** De eerste versie van deze bewaking las `prosrc` als platte
 *    tekst, dus inclusief commentaar. 📏 Gemeten door de security-ronde: één
 *    regel in de huisstijl van dit project — die een ándere tabel als voorbeeld
 *    noemt — liet haar `created_at` nakijken in plaats van `client_tijd`, vond
 *    die dicht, en meldde **nul bezwaren** terwijl het dagplafond volledig
 *    openstond. `tijdstempel_bewaking()` zei óók niets. Een bewaking die
 *    groen staat op een open plafond is erger dan geen bewaking, want rij 603
 *    van de engineer-agenda wordt op grond hiervan afgevinkt.
 *
 *    De kop van 0292 wáárschuwde daar al voor — *een grendel die groen staat
 *    omdat hij zijn invoer niet begreep, bewaakt niets* — en tak 1 dekte alleen
 *    "geen treffer", niet "de verkeerde treffer".
 *
 * ⚠️⚠️ **A en B voorspelde ik als 1 rood en ze waren allebei 2, en dát is de
 *    leerzame uitslag.** `todo_items.created_at` en `completions.submitted_at`
 *    dragen allebei een `now()`-default, dus `tijdstempel_bewaking()` — de
 *    grendel van 0173 die er al stond — ving ze zélf al af. Twee van de zes
 *    mutaties voerden hun geval dus door een pad dat een éérdere grendel
 *    afvangt, en die bewaken niets van wat dit bestand belooft. CLAUDE.md zegt
 *    dat met zoveel woorden bij regel 18.
 *
 *    📏 **E is de mutatie die dat wél doet**, en hij is er met opzet bij gekomen
 *    toen A en B tegenvielen: een vensterkolom zónder serverklok-default is voor
 *    `tijdstempel_bewaking()` onzichtbaar (die eist een niet-immutable default),
 *    en dan blijft er precies één rood over. Dát getal is het bewijs dat deze
 *    bewaking iets draagt wat de oude niet kan dragen — de overlap op
 *    `created_at` is meegenomen winst en niet de reden dat dit bestand bestaat.
 *
 * ⚠️ D en H zijn om dezelfde reden bruikbaar: `dagtellers.aantal` is een
 *    `integer` en een trigger zonder venster heeft geen kolom, dus in geen van
 *    beide gevallen heeft de oude grendel iets te zeggen.
 */

const TEST_TIMEOUT = 30_000;

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'dagplafondvenster_bewaking'",
  import.meta.url,
);

describe.skipIf(!beschikbaar)('het venster van een dagplafond staat niet open', () => {
  it(
    'geen dagplafond rust op een kolom die de client kan verzetten',
    async () => {
      const uit = psql(
        "select coalesce(string_agg(tabel || '.' || venster || ': ' || bezwaar, E'\\n'), '')" +
          ' from dagplafondvenster_bewaking()',
      );

      expect(uit.trim()).toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'een dagplafond waarvan de vorm niet te lezen is, telt als bezwaar',
    async () => {
      // ⚠️⚠️ **Dit is de helft die het zwaarst weegt.** Zonder deze tak zou een
      //    teller die zijn venster anders opschrijft — met een variabele, via een
      //    hulpfunctie, met een andere interval-notatie — de bewaking hierboven
      //    groen laten omdat ze hem niet kón lezen. Een grendel die groen staat
      //    omdat hij zijn invoer niet begreep, bewaakt niets.
      const uit = psql(`
        begin;
        create table public.proef_plafond (id int);
        create function public.begrens_proef() returns trigger language plpgsql as $f$
          begin return null; end $f$;
        create trigger proef_dagplafond after insert on public.proef_plafond
          for each statement execute function public.begrens_proef();
        select count(*) from dagplafondvenster_bewaking() where tabel = 'proef_plafond';
        rollback;
      `);

      expect(uit.trim(), 'een onleesbaar dagplafond kwam er stil doorheen').toBe('1');
    },
    TEST_TIMEOUT,
  );

  it(
    'een commentaarregel stuurt de vensterkolom niet',
    async () => {
      // ⚠️⚠️ **Dit is het gat dat de security-ronde op QS8-558 vond, en het was
      //    ernstiger dan het gat dat dit issue repareerde.** De bewaking las
      //    `prosrc` als platte tekst, en `prosrc` bevat commentaar. Eén regel in
      //    de huisstijl van dit project — die een ándere tabel als voorbeeld
      //    noemt — liet haar de verkeerde kolom nakijken, en die stond dicht.
      //    📏 Gemeten vóór de reparatie: **nul bezwaren**, van beide bewakingen,
      //    terwijl `client_tijd` voor de client te schrijven was en het
      //    dagplafond dus volledig openstond.
      const uit = psql(`
        begin;
        create table public.proef_comm (id int, user_id uuid,
          created_at timestamptz not null default now(),
          client_tijd timestamptz not null);
        revoke all on public.proef_comm from public, anon, authenticated;
        grant insert (user_id, client_tijd) on public.proef_comm to authenticated;
        create function public.begrens_proef_comm() returns trigger language plpgsql as $f$
        declare n int; begin
          -- Bij de meeste tabellen is dat created_at > now() - interval '1 day';
          --    hier hangt het venster aan het tijdstip dat de client meestuurt.
          select count(*) into n from public.proef_comm
            where client_tijd > now() - interval '1 day';
          return null; end $f$;
        create trigger proef_comm_dagplafond after insert on public.proef_comm
          for each statement execute function public.begrens_proef_comm();
        select coalesce(string_agg(venster || ': ' || bezwaar, ' | '), 'NUL BEZWAREN')
          from dagplafondvenster_bewaking() where tabel = 'proef_comm';
        rollback;
      `);

      expect(uit.trim(), 'een comment koos de vensterkolom in plaats van de code').toBe(
        'client_tijd: client mag de vensterkolom schrijven (INSERT voor authenticated)',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'een comment dat `tel_dagteller` noemt maakt van een lege rem geen tellervorm',
    async () => {
      // ⚠️ De spiegelzijde van de test hierboven, en gemeten dezelfde ronde: een
      //    functie die in commentaar zegt `tel_dagteller()` juist **niet** te
      //    gebruiken, telde als tellervorm — en dan vuurt tak 1 niet, terwijl er
      //    helemaal geen venster afgedwongen wordt. 📏 Vóór de reparatie: nul
      //    bezwaren.
      const uit = psql(`
        begin;
        create table public.proef_teller (id int);
        revoke all on public.proef_teller from public, anon, authenticated;
        create function public.begrens_proef_teller() returns trigger language plpgsql as $f$
        begin
          -- We gebruiken hier bewust NIET tel_dagteller( ), want deze tabel
          --    heeft een eigen venster nodig.
          return null; end $f$;
        create trigger proef_teller_dagplafond after insert on public.proef_teller
          for each statement execute function public.begrens_proef_teller();
        select coalesce(string_agg(bezwaar, ' | '), 'NUL BEZWAREN')
          from dagplafondvenster_bewaking() where tabel = 'proef_teller';
        rollback;
      `);

      expect(uit.trim(), 'een comment praatte een lege rem naar binnen als tellervorm').toBe(
        'vorm niet herkend: geen vensterkolom en geen tel_dagteller() — niet na te meten',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'twee vensterkolommen in één rem zijn een bezwaar en geen stille keuze',
    async () => {
      // ⚠️⚠️ **Dit geval had géén toets en dat bleek uit de ijking, niet uit
      //    nadenken.** Mutatie L zette deze tak uit en de suite bleef groen op
      //    elf tests — een grendel die niets bewaakte. De tak bestaat omdat de
      //    reparatie van het comment-gat anders half is: `regexp_matches(…'g')`
      //    vindt nu álle treffers, en dan is "welke van de twee draagt het
      //    plafond" een vraag die de bewaking niet mag beantwoorden door de
      //    eerste te pakken. Precies dát stil kiezen was het oorspronkelijke gat.
      const uit = psql(`
        begin;
        create table public.proef_twee (id int,
          created_at timestamptz not null default now(),
          client_tijd timestamptz not null);
        revoke all on public.proef_twee from public, anon, authenticated;
        create function public.begrens_proef_twee() returns trigger language plpgsql as $f$
        declare n int; begin
          select count(*) into n from public.proef_twee where created_at > now() - interval '1 day';
          select count(*) into n from public.proef_twee where client_tijd > now() - interval '1 day';
          return null; end $f$;
        create trigger proef_twee_dagplafond after insert on public.proef_twee
          for each statement execute function public.begrens_proef_twee();
        select coalesce(string_agg(bezwaar, ' | '), 'NUL BEZWAREN')
          from dagplafondvenster_bewaking() where tabel = 'proef_twee';
        rollback;
      `);

      expect(uit.trim(), 'de bewaking koos stil één van twee vensterkolommen').toBe(
        'meer dan één vensterkolom gevonden (2) — welke het plafond draagt is niet af te leiden',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'de knip zelf klopt: een string is geen commentaar en andersom',
    async () => {
      // ⚠️⚠️ **De knip die een controle scherp houdt, is zelf een grendel**
      //    (QS8-412, waar een knip op regelcommentaar alles ná de dubbele slash
      //    van een URL opat). Daarom staat hij hier los onder toets, met de
      //    gevallen die een regex niet uit elkaar houdt: streepje-streepje
      //    bínnen een string begint geen commentaar, een aanhalingsteken bínnen
      //    commentaar begint geen string, en blokcommentaar mag in Postgres
      //    nesten.
      const uit = psql(`
        select
          -- code blijft staan
          (public.code_zonder_commentaar('a.created_at > now()') ~ 'created_at')::text || ' ' ||
          -- regelcommentaar gaat weg
          (public.code_zonder_commentaar($x$-- x.created_at > now()$x$ || chr(10) || $x$b$x$)
             ~ 'created_at')::text || ' ' ||
          -- blokcommentaar gaat weg, ook genest
          (public.code_zonder_commentaar('/* a /* b.created_at */ c */ d') ~ 'created_at')::text || ' ' ||
          -- een string gaat weg
          (public.code_zonder_commentaar($x$ 'p.created_at' $x$) ~ 'created_at')::text || ' ' ||
          -- streepje-streepje bínnen een string begint geen commentaar: de code
          -- erna hoort te blijven staan
          (public.code_zonder_commentaar($x$ '-- ' || q.created_at $x$) ~ 'created_at')::text || ' ' ||
          -- een aanhalingsteken in commentaar begint geen string: de regel erna blijft
          (public.code_zonder_commentaar($x$-- het 'venster$x$ || chr(10) || $x$ r.created_at$x$)
             ~ 'created_at')::text
      `);

      // code, comment, blok, string, string-met-streepjes, comment-met-quote
      expect(uit.trim(), 'de knip haalt code weg of laat commentaar staan').toBe(
        'true false false false true true',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'een venster op een kolom die niet op de eigen tabel staat, is een bezwaar',
    async () => {
      // ⚠️⚠️ **Deze tak is er zowel om iets te melden als om niet om te vallen.**
      //    `has_column_privilege(rol, tabel, 'naam', recht)` wérpt zodra die naam
      //    niet op die tabel staat (📏 `ERROR: column "…" of relation "…" does
      //    not exist`) — precies de vorm die deze tak hoort te melden. De
      //    bewaking geeft daarom het kolom**nummer** door, dat uit een join komt.
      //
      // ⚠️ **En de eerlijke meting erbij:** de vorm met de kolomnaam plus een
      //    `where`-guard ernaast is hierop uitgeprobeerd en gaf géén fout — de
      //    planner evalueerde de guard eerst. Dit bewaakt dus geen gemeten
      //    omval maar een afhankelijkheid van iets dat SQL niet belooft.
      const uit = psql(`
        begin;
        create table public.proef_elders (id int);
        create function public.begrens_proef_elders() returns trigger language plpgsql as $f$
          begin perform 1 from public.goals g where g.created_at > now() - interval '1 day'; return null; end $f$;
        create trigger proef_elders_dagplafond after insert on public.proef_elders
          for each statement execute function public.begrens_proef_elders();
        select coalesce(string_agg(venster || ': ' || bezwaar, ' | '), 'NIETS')
          from dagplafondvenster_bewaking() where tabel = 'proef_elders';
        rollback;
      `);

      expect(uit.trim(), 'een venster op een andere tabel kwam er stil doorheen').toBe(
        'created_at: vensterkolom staat niet op de tabel van deze trigger — niet na te meten',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'de tellertabel onder de tel_dagteller-vorm staat dicht',
    async () => {
      // ⚠️ **De must-allow-kant van tak 4.** `begrens_pushtokens()` en
      //    `begrens_blokkades()` hebben géén vensterkolom, en dat is de stérkere
      //    vorm en geen uitzondering: er is niets in de rij om te verzetten. Wat
      //    hen draagt is dat `dagtellers` dicht staat, en dat is wat hier
      //    gemeten wordt in plaats van aangenomen.
      const uit = psql(`
        select
          has_table_privilege('authenticated', 'public.dagtellers', 'SELECT')::text || ' ' ||
          has_column_privilege('authenticated', 'public.dagtellers', 'aantal', 'UPDATE')::text || ' ' ||
          has_column_privilege('authenticated', 'public.dagtellers', 'venster_start', 'INSERT')::text
      `);

      expect(uit.trim(), 'de teller waar twee dagplafonds op rusten is te verzetten').toBe(
        'false false false',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'elk dagplafond valt in precies één van de twee vormen',
    async () => {
      // ⚠️ De must-allow van de bewaking zelf: ze moet álle achttien wégen, niet
      //    alleen de leesbare. Zonder dit getal zou een bewaking die per ongeluk
      //    maar twee triggers vindt ook groen staan op de test hierboven — en
      //    dat is de vorm waar dit hele bestand tegen bestaat.
      const uit = psql(`
        with vorm as (
          select (public.code_zonder_commentaar(p.prosrc) ~ 'now\\(\\) - interval') as heeft_venster,
                 (public.code_zonder_commentaar(p.prosrc) like '%tel_dagteller(%') as heeft_teller
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_proc p on p.oid = t.tgfoid
          where c.relnamespace = 'public'::regnamespace
            and not t.tgisinternal and t.tgname like '%dagplafond%'
        )
        select count(*) filter (where heeft_venster and heeft_teller)::text || ' ' ||
               count(*) filter (where not heeft_venster and not heeft_teller)::text
        from vorm
      `);

      // ⚠️⚠️ **Een som is geen partitie, en dat verschil is gemeten.** Hier stond
      //    `venster + teller === totaal`, en die middelt uit: één trigger die
      //    béíde vormen draagt en één die geen van beide draagt geven samen
      //    weer het totaal, en de test blijft groen op de naam die hij draagt.
      //    Gevonden in de security-ronde op dit issue. Daarom telt hij nu de
      //    triggers die in **precies één** vorm vallen.
      expect(uit.trim(), 'niet elke dagplafond-trigger valt in precies één vorm').toBe('0 0');
    },
    TEST_TIMEOUT,
  );
});
