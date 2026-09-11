import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { psql as psqlKaal, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een object verhuist niet van de ene emmer naar de andere — QS8-407, migratie 0239,
 * en QS8-416, migratie 0253.
 *
 * ⚠️⚠️ **Deze suite heette tot 11-09-2026 naar 0237 en dat was het verkeerde
 *    nummer — zes keer, inclusief de naam van het `describe`.** 0237 is
 *    `elke_meldingsoort_heeft_een_schakelaar` en raakt `storage.objects` met nul
 *    regels; de drops staan in `0239_geen_enkele_emmer_heeft_een_update_pad`.
 *    📏 Nagemeten met `grep -c storage.objects` op beide bestanden: 0 tegen 2.
 *    Een grendel die naar het verkeerde bestand wijst, stuurt de volgende lezer
 *    naar een migratie die niets doet — en die concludeert dan dat de grendel
 *    niet bestaat.
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
 * 📏 **Gemeten op 10-09-2026, vóór 0239**, als `authenticated` met echte claims,
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
 *   C  allebei de policies terug          → 4 rood (de stand van vóór 0239)
 *   D  `avatars_insert` op `with check (false)` → 3 rood, en precies de drie
 *                                            must-allows
 *   E  een `for all`-policy op één emmer  → 2 rood
 *   F  het INSERT-pad van `chatdocs` dichtzetten → 1 rood (QS8-409)
 *   G  een vijfde emmer in `storage.buckets` zonder pad in `PADEN` → 1 rood,
 *      met de naam van die emmer in de melding
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
 *    0239 te breed zijn, dan is elke upload stuk — en dan hoort een test dát te
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
 *
 * ⚠️⚠️ **F en G komen uit QS8-409, en de aanleiding is dat deze suite binnen een
 *    uur achterliep.** De must-allow somde drie emmers op; QS8-72 landde
 *    `chatdocs` en toen dekte hij er drie van de vier — uitgerekend die met het
 *    afwijkendste type en plafond. F toont dat die emmer nu écht meegemeten
 *    wordt; G toont dat de vijfde hem rood maakt in plaats van stil te verjaren.
 *    De must-find keek al naar de familie; sinds QS8-409 doet de must-allow dat
 *    ook.
 *
 * ---------------------------------------------------------------------------
 * QS8-416 — deze suite bewaakte de reparatie en niet zijn eigen naam
 * ---------------------------------------------------------------------------
 *
 * ⚠️⚠️ **De familietest hierboven kón per constructie niet rood worden van de
 *    helft die openstond.** Hij filtert `polcmd in ('w', '*')`, en een `copy` is
 *    een **INSERT** (`polcmd = 'a'`). `move` is een UPDATE en is dicht sinds
 *    0239; `copy` schrijft een nieuwe rij en raakt die drop nooit. Deze suite
 *    heet *een object verhuist niet tussen emmers* en toetste één van de twee
 *    routes waarlangs dat kan — regel 18 vraag 3 in zijn zuiverste vorm, op een
 *    grendel van dezelfde dag.
 *
 * 📏 En de route bestaat: `@supabase/storage-js` 2.112.3 in deze repo draagt
 *    `copy(fromPath, toPath, { destinationBucket })`. Dat onze eigen code hem
 *    niet aanroept, zegt niets — een client praat rechtstreeks met de
 *    Storage-API.
 *
 * **Wat de INSERT-kant nu toetst, en wat níet.** 0253 pint in elke INSERT-policy
 * de bestandsnaam. Dat maakt de naamvorm een databaseeigenschap in alle vier de
 * emmers in plaats van in één — dezelfde belofte die 0240 voor `chatdocs` deed,
 * met `evil.html` als meting.
 *
 * ⚠️⚠️⚠️ **Het sluit de copy-route níet, en de eerste versie van deze kop
 *    beweerde dat wél.** Bij een `copy` kiest de client de **doelnaam**: 📏
 *    `@supabase/storage-js/dist/index.mjs:982-991` geeft `sourceKey` en
 *    `destinationKey` als twee losse parameters. Een pdf uit `chatdocs` heet in
 *    `chatfotos` dus gewoon `onschuldig.jpg`, en 📏 zo gemeten ná 0253 laten alle
 *    vier de emmers een vrij gekozen doelnaam door. Deze test bewaakt dus de
 *    naamvorm en niet de richting — precies wat hij nu ook zegt.
 *
 * ⚠️⚠️ **En die open route staat hier bewust in géén enkele assertie.** Een
 *    `expect(…)` dat een weigering eist is vandaag rood en liegt dus over de
 *    stand; een `expect(…)` dat de toestemming vastlegt wordt rood op de dag dat
 *    iemand hem alsnog sluit — en dan straft de suite een verbetering af. Wat er
 *    open is hoort in het dossier: de rij van 11-09-2026 in
 *    `docs/ENGINEER-REVIEW.md`, op **Middel**, met `chatdocs` → fotoemmer als de
 *    zwaarste richting (5 MB tegen 1 MB, en een ander mimetype).
 *
 * ---------------------------------------------------------------------------
 * IJKING van de INSERT-kant — met de hand, 11-09-2026
 * ---------------------------------------------------------------------------
 *
 * ⚠️ **Mutatie per grendel, en elke keer nagekeken wélke test omvalt.** De
 *    nulmeting is **8 groen**, opgebouwd uit alle 256 migratiebestanden. ⚠️ Hier
 *    stond eerst 11, en dat was geen meting maar een schatting — eruit gehaald
 *    door de securityronde. Precies de klasse die dit bestand zes regels hoger
 *    over het nummer 0237 documenteert.
 *
 *   H  de `name ~`-regel uit `chatfotos_insert` weghalen   → 1 rood: de
 *      vreemde-extensie-test, en met `chatfotos` in de melding
 *   I  idem uit `bewijsfotos_insert`                       → 1 rood, idem
 *   J  idem uit `avatars_insert`                           → 1 rood, idem
 *   K  idem uit `chatdocs_insert` (stond er al sinds 0240) → 1 rood, idem
 *   L  `VREEMDE_NAAM` leeghalen voor één emmer             → 1 rood op het
 *      register, met de naam van die emmer — dezelfde vorm als G
 *   M  de extensielijst van 0253 verruimen met `pdf`       → 3 rood: de drie
 *      fotoemmers, en `chatdocs` blijft groen
 *   N  `chatfotos_insert` op `with check (false)`          → 2 rood: deze test
 *      **én** de must-allow, met `chatfotos` in beide meldingen
 *
 * ⚠️⚠️ **N is er bijgekomen omdat de securityronde hem miste in mijn ijking, en
 *    hij legt een attributiefout bloot.** Zonder de positieve controle per emmer
 *    bleef deze test **groen** bij `with check (false)` — `verhuispoging()` slikt
 *    elke fout, dus een weigering zei niets over waaróm er geweigerd werd. De
 *    koppeling zat in een ánder `it`, met ándere bestandsnamen, en kon dus uit
 *    elkaar lopen. Nu draagt elke emmer zijn eigen paar binnen dezelfde test.
 *
 * ⚠️ **M is de mutatie die de andere vijf niet dekken.** H t/m K halen de regel
 *    wég; M laat hem staan en maakt hem te ruim. Een test die alleen op
 *    afwezigheid let, is groen op een regex die alles doorlaat. 📏 Gemeten:
 *    precies `avatars, bewijsfotos, chatfotos` in de melding, en `chatdocs`
 *    groen — dus de test wijst de drie verruimde emmers aan en niet "er is iets".
 *
 * ⚠️⚠️ **En de ijkopstelling zelf ging bij M de eerste keer fout, met precies de
 *    fout waar CLAUDE.md voor waarschuwt: kijk wélke test omvalt en of de
 *    mutatie er écht in staat.** Terugzetten deed ik door 0253 opnieuw af te
 *    spelen — maar **0253 raakt `chatdocs_insert` niet aan**, want die regel
 *    stond er al sinds 0240. Mutatie K bleef dus staan, en M meldde vier emmers
 *    waar er drie hoorden. De meting was goed, de opstelling niet; wie alleen op
 *    "er wordt iets rood" had gekeken, had dat niet gezien.
 *
 * ⚠️⚠️ **En de reparatie daarvan was óók fout, met de fout die CLAUDE.md bij
 *    onwrikbare regel 20 met zoveel woorden noemt.** Ik zette `chatdocs_insert`
 *    terug door **0240 opnieuw af te spelen** — maar 0250 komt daarná en raakt
 *    hetzelfde, dus die herhaling zette een látere wijziging terug. 📏 Gevolg:
 *    twee tests in `chatdocbucket.test.ts` en `een-document-is-wat-het-zegt.test.ts`
 *    vielen om (`expected '1' to be '0'`), en die hebben met deze suite niets te
 *    maken. Verse opbouw erna: 59 groen.
 *
 *    **De enige veilige manier om na een mutatie terug te komen is
 *    `scripts/lokale-stack.sh` opnieuw draaien.** Een migratie is idempotent
 *    tegen de toestand waarvoor hij geschreven is en niet tegen die van vandaag;
 *    hem als herstelknop gebruiken is precies de klasse waar dat besluit over
 *    gaat.
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

describe.runIf(beschikbaar)('een object verhuist niet tussen emmers (0239 + 0253)', () => {
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
   *    twee policies uit 0239 terug en deze regel wordt rood; voegt iemand er een
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
   * ⚠️⚠️ **De andere helft van de belofte: `copy` is een INSERT** (QS8-416).
   *    De familietest hierboven kijkt naar `polcmd in ('w', '*')` en kán hier dus
   *    per constructie niet rood van worden. Deze regel vraagt het aan de
   *    handeling: een naam met de extensie van een ándere emmer moet geweigerd
   *    worden, in **élke** emmer die de database kent.
   *
   * ⚠️ **Elk pad hieronder is verder volledig geldig** — juiste diepte, juiste
   *    eerste segment, eigen uid — en alléén de extensie is vreemd. Dat is met
   *    opzet: voert de ijking zijn geval door een pad dat de mapregel al afvangt,
   *    dan bewaakt hij die regel en niet de extensie. De tegenhanger staat
   *    hieronder als must-allow: dezelfde paden mét de goede extensie gaan er wél
   *    in.
   *
   * ⚠️ **`VREEMDE_NAAM` is een register en geen gemak**, om dezelfde reden als
   *    `PADEN`: welke extensie "vreemd" is verschilt per emmer, en een lus kan
   *    dat niet raden. Komt er een vijfde emmer zonder rij, dan wordt deze test
   *    **rood** in plaats van hem stil over te slaan.
   */
  it('weigert in élke emmer een naam met de extensie van een andere emmer', () => {
    const VREEMDE_NAAM: Record<string, string> = {
      // De drie beeldemmers dragen `{image/jpeg, image/png, image/webp}`; een
      // `.pdf`-naam hoort er niet in, ook niet via een `copy` uit `chatdocs`.
      avatars: `${alice}/vreemd.pdf`,
      bewijsfotos: `${weekdoel}/${alice}/vreemd.pdf`,
      chatfotos: `${groep}/${alice}/vreemd.pdf`,
      // En de omgekeerde richting, die sinds 0240 al dicht stond.
      chatdocs: `${groep}/${alice}/vreemd.jpg`,
    };

    const emmers = psql('select id from storage.buckets order by id')
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== '');

    expect(emmers.length, 'geen enkele emmer gevonden — meet dit niet groen').toBeGreaterThan(0);

    const zonderNaam = emmers.filter((e) => VREEMDE_NAAM[e] === undefined);
    expect(
      zonderNaam,
      `nieuwe emmer(s) zonder rij in VREEMDE_NAAM: ${zonderNaam.join(', ')} — vul ze aan, ` +
        'anders bewijst deze test niets over die emmer',
    ).toEqual([]);

    // ⚠️ De filter is geen verkorting maar wat `noUncheckedIndexedAccess` vraagt:
    //    `VREEMDE_NAAM[emmer]` is `string | undefined`. De telling erna zorgt dat
    //    hij niets stil laat vallen — de assertie hierboven dekt de oorzaak, deze
    //    het gevolg.
    const pogingen = emmers
      .map((emmer) => ({ emmer, pad: VREEMDE_NAAM[emmer] }))
      .filter((r): r is { emmer: string; pad: string } => r.pad !== undefined);

    expect(pogingen.length, 'er viel een emmer uit de lijst — dan meet dit minder dan het zegt').toBe(
      emmers.length,
    );

    // ⚠️⚠️ **De positieve controle staat binnen dezelfde test en per emmer, en dat
    //    is een gerepareerde attributiefout.** `verhuispoging()` slikt élke fout,
    //    dus een weigering zegt op zichzelf niet waaróm er geweigerd is. 📏 Gemeten
    //    in de securityronde op deze branch: met `chatfotos_insert` op
    //    `with check (false)` bleef deze test **groen** en viel alleen de
    //    must-allow om. Die stond in een ánder `it`, met ándere bestandsnamen, dus
    //    de koppeling kon uit elkaar lopen. Nu draagt elke emmer zijn eigen paar:
    //    hetzelfde pad met de goede extensie moet erín, met de vreemde eruit. Een
    //    blanket-weigering maakt deze regel dus rood in plaats van hem gratis te
    //    laten slagen.
    const stand = pogingen.map(({ emmer, pad }) => {
      const goed = pad.replace(/\.[A-Za-z0-9]+$/, emmer === 'chatdocs' ? '.pdf' : '.jpg');

      const vreemdErin = verhuispoging(
        alice,
        `insert into storage.objects (bucket_id, name, owner)
           values ('${emmer}', '${pad}', '${alice}');
         select name from storage.objects
          where bucket_id = '${emmer}' and name = '${pad}'`,
      ).includes(pad);

      const goedErin = verhuispoging(
        alice,
        `insert into storage.objects (bucket_id, name, owner)
           values ('${emmer}', '${goed}', '${alice}');
         select name from storage.objects
          where bucket_id = '${emmer}' and name = '${goed}'`,
      ).includes(goed);

      return { emmer, vreemdErin, goedErin };
    });

    const doorgelaten = stand.filter((r) => r.vreemdErin).map((r) => r.emmer);
    const blanket = stand.filter((r) => !r.goedErin).map((r) => r.emmer);

    expect(
      blanket,
      `deze emmer(s) weigerden óók de goede extensie: ${blanket.join(', ')} — dan weigert ` +
        'daar iets anders dan de naamregel, en bewijst de weigering hieronder niets',
    ).toEqual([]);

    expect(
      doorgelaten,
      `deze emmer(s) namen een vreemde extensie aan: ${doorgelaten.join(', ')} — ` +
        'de INSERT-policy pint de naam niet, en dan is een `copy` uit een andere emmer open',
    ).toEqual([]);
  });

  /**
   * De must-allows. ⚠️ **Zonder deze drie is de reparatie niet te onderscheiden
   *    van "alle rechten op storage.objects ingetrokken"** — en dat zou elke
   *    upload stukmaken. Dit is de helft die zegt dat de app nog werkt.
   */
  describe('en wat wél moet blijven werken', () => {
    /**
     * ⚠️⚠️ **Deze test somt de emmers niet op, hij vraagt ze aan de database.**
     *    De eerste versie deed dat wél — *"alle drie"* — en stond binnen een uur
     *    achter, want QS8-72 landde `chatdocs` (QS8-409). En dat was uitgerekend
     *    de emmer die je het minst wilt missen: 📏 de enige met een ánder type
     *    (`application/pdf`) en een ánder plafond (5 MB) naast drie
     *    beeldemmers van 1–2 MB. Een must-allow die moet bewijzen dat 0239 niet
     *    te breed was, mist dan precies de afwijkendste policy.
     *
     * ⚠️ **`PADEN` is een register en geen gemak.** Elke emmer heeft zijn eigen
     *    padvorm — `avatars` op `<uid>/`, de andere drie op twee segmenten met
     *    een eigen eerste segment — dus een lus kan het pad niet raden. Staat er
     *    een emmer in `storage.buckets` waarvoor hier geen pad is, dan wordt deze
     *    test **rood**; hij slaat hem niet stil over. Dát is wat hem bij de
     *    vijfde emmer laat meegroeien in plaats van verjaren.
     */
    it('laat een upload door in élke emmer die de database kent', () => {
      const PADEN: Record<string, string> = {
        avatars: `${alice}/nieuw-portret.jpg`,
        bewijsfotos: `${weekdoel}/${alice}/nieuw-bewijs.jpg`,
        chatfotos: `${groep}/${alice}/nieuw-chat.jpg`,
        // ⚠️ `.pdf` is hier geen smaak: `chatdocs_insert` eist de extensie in de
        //    policy zelf (`name ~ '/[A-Za-z0-9._-]{1,80}\.pdf$'`).
        chatdocs: `${groep}/${alice}/nieuw-doc.pdf`,
      };

      const emmers = psql('select id from storage.buckets order by id')
        .split('\n')
        .map((r) => r.trim())
        .filter((r) => r !== '');

      expect(emmers.length, 'geen enkele emmer gevonden — meet dit niet groen').toBeGreaterThan(0);

      const zonderPad = emmers.filter((e) => PADEN[e] === undefined);
      expect(
        zonderPad,
        `nieuwe emmer(s) zonder pad in PADEN: ${zonderPad.join(', ')} — vul ze aan, ` +
          'anders bewijst deze must-allow niets over die emmer',
      ).toEqual([]);

      const waarden = emmers
        .map((e) => `('${e}', '${PADEN[e]}', '${alice}')`)
        .join(', ');

      const uit = als(
        alice,
        `insert into storage.objects (bucket_id, name, owner) values ${waarden};
         select count(*) from storage.objects where owner = '${alice}'`,
      );

      expect(uit, 'niet elke emmer nam de upload aan').toBe(String(emmers.length));
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
