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
        select count(*) filter (where p.prosrc ~ 'now\\(\\) - interval')::text || ' ' ||
               count(*) filter (where p.prosrc like '%tel_dagteller(%')::text || ' ' ||
               count(*)::text
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_proc p on p.oid = t.tgfoid
        where c.relnamespace = 'public'::regnamespace
          and not t.tgisinternal and t.tgname like '%dagplafond%'
      `);

      const getallen = uit.trim().split(' ').map(Number);
      const venster = getallen.at(0) ?? -1;
      const teller = getallen.at(1) ?? -1;
      const totaal = getallen.at(2) ?? -1;

      expect(venster + teller, `${venster} + ${teller} dekt niet alle ${totaal}`).toBe(totaal);
    },
    TEST_TIMEOUT,
  );
});
