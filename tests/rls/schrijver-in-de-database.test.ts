/**
 * De tegenvraag van `kolomrechten:controle`, op een echte database — QS8-573.
 *
 * ⚠️⚠️ **Waarom deze toets in `tests/rls/` staat en niet bij de andere
 *    scriptstoetsen.** `SCHRIJVERVRAAG` is SQL, en zijn belofte — *een functie
 *    die de tabelnaam alleen in commentaar noemt, telt niet als schrijver* —
 *    is niet te toetsen door de query als tékst te lezen. De unittest ernaast
 *    (`tests/scripts/kolomrechten-controle.test.ts`) pint dat
 *    `code_zonder_commentaar()` in de vraag voorkomt; dát is een eigenschap van
 *    het onderdeel. Of de knip ook werkt, is een eigenschap van het geheel, en
 *    daar is een database voor nodig. Regel 18, vraag 2.
 *
 * ⚠️⚠️ **Dit is de grendel die de hele reparatie draagt, en hij faalt de
 *    gevaarlijke kant op.** Zonder de knip zegt `kolomrechten:controle` *"de
 *    database schrijft hier"* over een functie die juist opschrijft dat ze dat
 *    níet doet — en dan praat de melding de lezer van een échte dode grant af.
 *    Dat is precies omgekeerd aan wat rij 634 wil bereiken.
 *
 * 📏 Met de hand gemeten op stand 0294, vóór deze toets bestond:
 *
 *      met knip     -> telt de commentaarfunctie mee: false
 *      zonder knip  -> telt de commentaarfunctie mee: true
 *
 *    Deze toets legt beide helften vast, zodat die meting niet hoeft te worden
 *    overgedaan door wie de vraag ooit aanraakt.
 *
 * ⚠️ De proeffunctie staat in een transactie die terugrolt. Ze heet
 *    `zz_…` zodat ze ook bij een afgebroken run herkenbaar is als proefwerk en
 *    niet als iets wat iemand bedoeld heeft.
 */
import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

const TEST_TIMEOUT = 60_000;

/** Draait pas als de stack `code_zonder_commentaar()` kent — die komt uit 0292. */
const METEN = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'code_zonder_commentaar'",
  import.meta.url,
);

/**
 * Een functie die `update group_members` uitsluitend in commentaar noemt, plus
 * de vraag of ze als schrijver telt — met en zonder de knip.
 *
 * ⚠️ Beide kanten in één transactie, zodat het verschil niet van twee runs
 *    afhangt. Een meting die "ervoor" en "erna" in verschillende transacties
 *    doet, kan een drift meten die ertussen is ontstaan.
 */
const PROEF = String.raw`
begin;

create function public.zz_noemt_alleen_in_commentaar() returns void
language plpgsql as $fn$
begin
  -- hier wordt met opzet GEEN update group_members set role = 'admin' gedaan
  /* en ook geen insert into reports (id) values (1) */
  perform 1;
end
$fn$;

-- ⚠️⚠️ **Het paar dat de woordgrens écht toetst.** 📏 Gemeten: in dit schema is geen
--    enkele tabelnaam een strikt voorvoegsel van een andere — alles is
--    meervoud, dus groups begint niet met group_members en andersom ook
--    niet. Een toets op bestaande tabellen zou de grens dus nooit kunnen breken
--    en groen blijven als iemand hem weghaalt. Daarom staat hier een paar
--    dat het wél doet.
create function public.zz_schrijft_naar_langere_naam() returns void
language plpgsql as $fn2$
begin
  insert into public.zz_kort_en_lang (id) values (1);
end
$fn2$;

select
  (select exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'zz_noemt_alleen_in_commentaar'
        and public.code_zonder_commentaar(p.prosrc)
              ~* 'update\s+(only\s+)?(public\.)?group_members\M'))::text
  || '|' ||
  (select exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'zz_noemt_alleen_in_commentaar'
        and p.prosrc ~* 'update\s+(only\s+)?(public\.)?group_members\M'))::text
  || '|' ||
  (select exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'verlaat_groep'
        and public.code_zonder_commentaar(p.prosrc)
              ~* 'update\s+(only\s+)?(public\.)?group_members\M'))::text
  || '|' ||
  (select exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_group'
        and public.code_zonder_commentaar(p.prosrc)
              ~* 'insert\s+into\s+(public\.)?groups\M'))::text
  || '|' ||
  (select exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'zz_schrijft_naar_langere_naam'
        and public.code_zonder_commentaar(p.prosrc)
              ~* 'insert\s+into\s+(public\.)?zz_kort\M'))::text
  || '|' ||
  (select exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'zz_schrijft_naar_langere_naam'
        and public.code_zonder_commentaar(p.prosrc)
              ~* 'insert\s+into\s+(public\.)?zz_kort'))::text
  as uitslag;

rollback;
`;

describe.skipIf(!METEN)('de tegenvraag herkent een schrijver en trapt niet in commentaar', () => {
  const regels = () =>
    psqlMetInvoer(PROEF)
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.includes('|'));

  it(
    'legt de knip, de must-find en de woordgrens in één transactie vast',
    () => {
      const [metKnip, zonderKnip, updateSchrijver, insertSchrijver, metGrens, zonderGrens] = (
        regels().at(-1) ?? ''
      ).split('|');

      // ⚠️⚠️ De grendel: commentaar telt niet mee…
      expect(metKnip).toBe('false');
      // …en zónder de knip zou hij dat wél doen. Deze helft maakt de eerste een
      // meting in plaats van een bewering: zonder haar kan `false` ook betekenen
      // dat de regex helemaal niets vindt.
      expect(zonderKnip).toBe('true');

      // ⚠️ **De must-find, en hij staat er om de eerste toets te dragen.** Een
      //    knip die álles wegknipt geeft óók `false` op de commentaarfunctie —
      //    dan bewijst die toets niets. Deze twee laten zien dat er nog wél
      //    gevonden wordt: `verlaat_groep()` doet een echte UPDATE op
      //    `group_members`, `create_group()` een echte INSERT op `groups`.
      expect(updateSchrijver).toBe('true');
      expect(insertSchrijver).toBe('true');

      // ⚠️⚠️ **`\M` sluit de tabelnaam af**, en dit paar toetst dát en niet iets
      //    anders: `zz_schrijft_naar_langere_naam()` schrijft naar
      //    `zz_kort_en_lang`, en de vraag gaat over `zz_kort`. Mét de grens is
      //    dat géén treffer; zónder wél. Een tabel die `zz_kort` heet zou
      //    daarmee een schrijver toegedicht krijgen die naar een héél andere
      //    tabel schrijft.
      expect(metGrens).toBe('false');
      expect(zonderGrens).toBe('true');
    },
    TEST_TIMEOUT,
  );
});
