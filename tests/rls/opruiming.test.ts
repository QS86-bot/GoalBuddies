import { describe, expect, it } from 'vitest';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured } from './harness';

/**
 * Het opruimen van deze suite bewaakt zichzelf — QS8-281.
 *
 * ⚠️ **De belofte is "een run laat niets achter", en die stond nergens onder
 *    test.** Er stond wél machinerie: een wezen-lus in `removeTestUsers()` met
 *    een uitgeschreven kop over het lek dat hij ooit repareerde. Die kop klopte
 *    niet meer en niets werd er rood van — gemeten op 05-09: 23 gearchiveerde
 *    `Solo-groep`-rijen met nul leden, één per volledige suite-run. Regel 18 in
 *    het klein: de tests toetsten onderdelen, de belofte was van het geheel.
 *
 * ## Wat er in productie gebeurt, want dat is eerst gemeten
 *
 * ⚠️ **`verwijder_mijn_account()` láát die groepsrij met opzet staan.** Gemeten
 *    in `pg_get_functiondef()`: hij roept `archiveer_groep()` aan voor elke groep
 *    waarvan de vertrekker het enige actieve lid is, en verwijdert daarna zijn
 *    `auth.users`-rij. Dat is 0102 §6b en het is de bedoeling — zonder die stap
 *    blijft er een `active` groep staan met een werkende uitnodigingscode, en
 *    loopt een wildvreemde er als enig, niet-beherend lid binnen. De
 *    achtergebleven rijen stonden dan ook allemaal op `status = 'archived'`.
 *
 *    Dat antwoord verlaagt de inzet in plaats van hem te verhogen: dit is
 *    testhygiëne en geen productiedefect. Het staat hier omdat de vólgende lezer
 *    die vraag weer gaat stellen.
 *
 * ## Waarom het opruimen die groep miste
 *
 * De wezen-lus zoekt groepen via de lidmaatschappen van de gebruikers die hij
 * verwijdert. Laat een test een gebruiker zijn eigen account verwijderen, dan
 * cascadeert dat lidmaatschap weg en komt `groups.created_by` op NULL — beide
 * wegen naar die groep zijn dicht vóórdat het opruimen begint.
 *
 * ## De twee grendels, apart geijkt
 *
 * | grendel | mutatie | uitkomst |
 * | -- | -- | -- |
 * | de tweede weg (`createdGroups`) | `registreerGroep()` niet aanroepen in `vertrek.test.ts` | dat bestand wordt rood |
 * | de bewaker (`meldAchtergeblevenGroepen`) | hem niet laten gooien | de tweede test hieronder wordt rood |
 *
 * ⚠️ **De bewaker is op de échte fout rood geweest en niet alleen op een
 *    nagebouwde.** Vóór de reparatie in `vertrek.test.ts` noemde hij die run
 *    precies één groep bij id en naam. Dat is het verschil tussen een test die de
 *    belofte bewaakt en een test die zijn eigen opstelling bewaakt.
 */

const TEST_TIMEOUT = 30_000;

interface Groep {
  readonly id: string;
  readonly code: string;
}

/** Maakt een groep zoals de app dat doet: via `create_group()`, als de eigenaar. */
async function maakGroep(db: ReturnType<typeof adminDb>, naam: string): Promise<Groep> {
  const { data, error } = await db.rpc('create_group', { group_name: naam });
  if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);
  const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (g.ok !== true || !g.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);
  return { id: g.group.id, code: g.group.invite_code };
}

/**
 * Zet de groep in de toestand die een vertrokken eigenaar achterlaat: geen
 * lidmaatschap meer, en `created_by` op NULL.
 *
 * ⚠️ **Dit bootst `verwijder_mijn_account()` niet na, het bootst zijn néveneffect
 *    na** — en dat is met opzet. Wat het opruimen breekt is niet die RPC maar de
 *    toestand die hij achterlaat. Die hier rechtstreeks zetten maakt de test
 *    onafhankelijk van hoe die RPC morgen werkt; dát de RPC hem oplevert, staat
 *    in `vertrek.test.ts`.
 *
 * ⚠️ **De `created_by` hoort erbij, en dat is gemeten en niet bedacht.** De eerste
 *    versie van deze helper haalde alléén het lidmaatschap weg. Beide tests
 *    slaagden toen om de verkeerde reden: `removeTestUsers()` doet vóór de
 *    wezen-lus een `wipe('groups', 'created_by')`, en die vond de groep gewoon
 *    terug — de opstelling liep langs een éérdere grendel dan de grendel die hij
 *    beweerde te meten. In het echte geval staat die kolom op NULL, want
 *    `groups.created_by` cascadeert met ON DELETE SET NULL zodra de eigenaar uit
 *    `auth.users` verdwijnt. Precies de valkuil uit CLAUDE.md bij regel 18:
 *    mutatie per grendel, en niet één die door een ander slot wordt afgevangen.
 */
async function eigenaarVertrokken(groupId: string): Promise<void> {
  const lid = await adminDb().from('group_members').delete().eq('group_id', groupId);
  if (lid.error) throw new Error(`lidmaatschap weghalen: ${lid.error.message}`);

  const maker = await adminDb().from('groups').update({ created_by: null }).eq('id', groupId);
  if (maker.error) throw new Error(`created_by leegmaken: ${maker.error.message}`);
}

async function groepBestaatNog(groupId: string): Promise<boolean> {
  const { count, error } = await adminDb()
    .from('groups')
    .select('id', { count: 'exact', head: true })
    .eq('id', groupId);
  if (error) throw new Error(`groep opzoeken: ${error.message}`);
  return (count ?? 0) > 0;
}

describe.skipIf(!rlsTestsConfigured)('Het opruimen van de RLS-suite laat niets achter', () => {
  it(
    'ruimt een groep op waarvan het lidmaatschap al weg is',
    async () => {
      const eigenaar = await createTestUser('opruiming-geregistreerd');
      const groep = await maakGroep(eigenaar.db, 'Opruiming geregistreerd');
      registreerGroep(groep.id);

      // De toestand die `verwijder_mijn_account()` achterlaat: de groep staat er
      // nog, het lidmaatschap niet meer.
      await eigenaarVertrokken(groep.id);

      await expect(removeTestUsers()).resolves.toBeUndefined();

      expect(
        await groepBestaatNog(groep.id),
        'de boekhouding is de tweede weg naar deze groep; zonder haar vindt het ' +
          'opruimen hem niet meer en blijft hij elke run staan',
      ).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'gooit als er tóch een groep zonder leden blijft staan',
    async () => {
      // ⚠️ **De must-see, en zonder deze test is de reparatie niet te
      //    onderscheiden van een opruiming die alles opruimt zónder bewaker.**
      //    Hier wordt met opzet níet geregistreerd: dat is precies wat iemand
      //    vergeet die morgen een `maakGroep` bijschrijft in een bestand dat een
      //    account verwijdert. De belofte is dat dat niet stil misgaat.
      const eigenaar = await createTestUser('opruiming-vergeten');
      const groep = await maakGroep(eigenaar.db, 'Opruiming vergeten');

      await eigenaarVertrokken(groep.id);

      // ⚠️ **De belofte is dat de bewaker hier nóóit zwijgt**, en dat is sinds
      //    QS8-329 de precieze formulering. Deze opstelling maakt met opzet een
      //    wees die niet toe te wijzen is: geen lidmaatschap, geen `created_by`,
      //    niet aangemeld. Draait er een tweede suite tegen dezelfde database,
      //    dan kán zo'n rij ook van háár zijn, en dan is de eerlijke uitslag
      //    `ONGEMETEN` in plaats van rood.
      //
      // ⚠️ **Dit is geen slappe `of/of`.** De uitgesloten uitkomst is de enige
      //    die ertoe doet: stilte. Een bewaker die afzwakt hoort dat te zeggen —
      //    de les van QS8-268 (controles die "OVERGESLAGEN" printen en daarna
      //    exitcode 0 geven) en QS8-270 (een suite die zichzelf stil oversloeg).
      //    Wélke van de twee luide uitkomsten het wordt hangt af van wie er nog
      //    meer aan deze database zit, en dát staat exact onder test in
      //    `tests/wezen.test.ts` — daar is de omstandigheid een parameter en
      //    geen toevalligheid.
      //
      // ⚠️ Hier stond eerst een meting vooraf, met daarna één geëiste uitkomst.
      //    📏 Dat viel om in de praktijk: de test en de bewaker bemonsteren op
      //    twee verschillende momenten, en tussen die twee door verscheen er een
      //    vreemde aanmaker. Twee metingen van hetzelfde feit lopen uit elkaar;
      //    één belofte doet dat niet.
      const gewaarschuwd: string[] = [];
      const eerder = console.warn;
      console.warn = (...args: unknown[]) => void gewaarschuwd.push(args.join(' '));

      let gegooid = '';
      try {
        await removeTestUsers();
      } catch (fout) {
        gegooid = fout instanceof Error ? fout.message : String(fout);
      } finally {
        console.warn = eerder;
      }

      const rood = /zonder leden achter/.test(gegooid);
      const ongemeten = /ONGEMETEN/.test(gewaarschuwd.join('\n'));

      expect(
        rood || ongemeten,
        `de bewaker zweeg over ${groep.id}; dat is de enige uitkomst die hier niet mag`,
      ).toBe(true);
      expect(rood && ongemeten, 'één uitslag per run, niet allebei').toBe(false);

      expect(
        await groepBestaatNog(groep.id),
        'de bewaker verwijdert niets — een tijdstempel zegt "van vandaag" en niet ' +
          '"van ons", en op dat verschil hoort geen delete te leunen',
      ).toBe(true);

      // Zelf opruimen, anders vindt de volgende `removeTestUsers()` deze groep en
      // faalt dit bestand op zijn eigen opstelling.
      const { error } = await adminDb().from('groups').delete().eq('id', groep.id);
      if (error) throw new Error(`opstelling opruimen: ${error.message}`);
    },
    TEST_TIMEOUT,
  );
});
