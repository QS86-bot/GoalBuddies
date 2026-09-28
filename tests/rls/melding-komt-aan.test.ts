import { describe, expect, it } from 'vitest';

import { psql, psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een melding komt aan — QS8-586, migratie 0296.
 *
 * ⚠️ **De belofte is niet "er is een RPC".** Het is: *een melding die iemand
 *    doet, belandt bij iemand die hem kan afhandelen.* Dat is een eigenschap van
 *    de kéten, en precies de klasse van onwrikbare regel 18 vraag 5 — elk
 *    schakeltje af, de keten onderbroken.
 *
 * 📏 **De toestand vóór 0296, met echte rijen gemeten:** `reports` had een
 *    schrijfpad (`meld()`), policies, indexen, kolomgrants en spoofing-grendels
 *    — en **nul** lezers van de inhoud. `meldingen_over()` leest de tabel wel,
 *    maar telt je eigen meldingen voor het dagquotum en geeft een `integer`
 *    terug.
 *
 * ⚠️⚠️ **En het geval dat de vorm van 0296 bepaalde.** `reports_select` is
 *    `reporter_id = auth.uid() OR (is_group_admin(group_id) AND subject_id <> auth.uid())`.
 *    Een melding **over de groepsbeheerder** kwam dus bij niemand aan die kon
 *    handelen:
 *
 *      melden gaf                          {"ok": true}
 *      de MELDER ziet                      1 melding
 *      de BEHEERDER (het onderwerp) ziet   0 meldingen
 *
 *    In een groep met onbekenden — het besluit van 22-09 op QS8-230 — is dat
 *    precies het geval dat het zwaarst weegt.
 *
 * ⚠️ Deze toetsen draaien via `psql` met `set local role authenticated` en niet
 *    via PostgREST, want ze gaan over wie wát ziet in de database. Alles staat in
 *    één teruggerolde transactie; er blijft niets achter.
 *
 * ---------------------------------------------------------------------------
 *
 * ⚠️⚠️ **Zes van deze tien zijn er pas na de security-review van 22-09-2026, en
 *    dat is het leerzame deel van dit bestand.** De vier die er stonden waren
 *    groen en bleven groen terwijl 0296 vier gaten had — omdat ze een eigenschap
 *    van het **onderdeel** toetsten waar de belofte er een van het **geheel**
 *    was. Onwrikbare regel 18 in vier vormen tegelijk:
 *
 *    - de fixture bouwde één beheerder, dus *"de escalatie blijft smal"* kón
 *      niet rood worden (vraag 6: "er is er altijd precies één" → "er kunnen er
 *      meer zijn");
 *    - de must-not *"het onderwerp ziet het nooit"* stond op één van de twee
 *      routes, en juist de andere miste de poort (vraag 2);
 *    - de `reporter_id`-toets greep naar de **functie**, terwijl de belofte langs
 *      de **tabel** gebroken werd (vraag 4: grijpt deze test naar een plek?);
 *    - afhandelen en het wisrecht waren elk af en de naad ertussen stuk
 *      (vraag 1), net als afhandelen en archiveren.
 *
 * IJKING — met de hand, 22-09-2026, tegen een lokaal schema op `0297`. Eén
 * mutatie per grendel, elke keer terug naar de vórm van 0296, en de stand ervóór
 * gemeten: **10 groen**.
 *
 *   A  de `subject_id <> auth.uid()`-conjunct terug naar alleen route (a)
 *      -> 1 rood: 'de platformbeheerder beoordeelt geen melding over zichzelf'
 *   B  de `not exists`-conjunct uit `mag_melding_als_escalatie()`
 *      -> 1 rood: 'een melding over een beheerder die een mede-beheerder kan
 *         afhandelen, escaleert niet'
 *   C  `grant select on public.reports to authenticated` + de oude policy
 *      -> 1 rood: 'de melder is ook buiten de RPC om niet te lezen'
 *   D  de oude CHECK (`afgehandeld_door is not null`)
 *      -> 1 rood: 'wie een melding afhandelde, kan zijn account nog opzeggen'
 *   E  `is_group_admin()` terug in `mag_melding_als_beheerder()`
 *      -> 1 rood: 'een open melding overleeft het archiveren van de groep'
 *   F  `count(*)` terug in plaats van `count(distinct a.reporter_id)`
 *      -> 1 rood: 'de teller telt melders en geen meldingen'
 *
 * ⚠️ Zes mutaties, zes keer precies één rode toets, en elke keer de bedoelde —
 *    niet "er werd iets rood". Dat onderscheid is hier een regel, want een
 *    ijking die zijn geval door een pad voert dat een éérdere grendel al
 *    afvangt, bewaakt niets van wat hij belooft.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'openstaande_meldingen'",
  import.meta.url,
);

/**
 * Zet de gebruikers, een groep en de regels neer. Rolt alles terug.
 *
 * ⚠️⚠️ **`tweedeBeheerder` is er omdat de fixture eerst de bevinding uitsloot.**
 *    Deze proef bouwde een groep met précies één beheerder, en de toets die
 *    *"de escalatie blijft smal"* heet kón daarin niet rood worden: de
 *    escalatieroute van 0296 vuurde bij élke melding over élke beheerder, ook
 *    als een mede-beheerder hem kon afhandelen, en dat is pas zichtbaar met een
 *    tweede beheerder. 📏 Gemeten op 22-09-2026, vóór 0297:
 *    `K2_BEHEERDER_B_KAN_DIT_ZELF=1` én `K2_PLATFORM_ZIET_HEM_OOK=1`.
 *
 *    De belofte is *"de platformbeheerder ziet alleen wat de groep niet kan"*;
 *    wat er getoetst werd was *"hij ziet geen melding over een niet-beheerder"* —
 *    een eigenschap van het onderdeel. Onwrikbare regel 18, vraag 2 en vraag 6:
 *    dit tilt "er is er altijd precies één beheerder" naar "er kunnen er meer
 *    zijn", en de fout stond er al.
 */
function proef(regels: string[], opties: { tweedeBeheerder?: boolean } = {}): string {
  return psqlMetInvoer(
    [
      'begin;',
      "select set_config('p.beheerder', public.shim_maak_gebruiker('b586@proef.nl','Beheerder')::text, true);",
      "select set_config('p.tweede',    public.shim_maak_gebruiker('t586@proef.nl','Tweede')::text, true);",
      "select set_config('p.melder',    public.shim_maak_gebruiker('m586@proef.nl','Melder')::text, true);",
      "select set_config('p.lid',       public.shim_maak_gebruiker('l586@proef.nl','Lid')::text, true);",
      "select set_config('p.platform',  public.shim_maak_gebruiker('x586@proef.nl','Platform')::text, true);",
      "update public.profiles set platform_beheerder = true where id = current_setting('p.platform')::uuid;",
      "select set_config('request.jwt.claim.sub', current_setting('p.beheerder'), true);",
      'set local role authenticated;',
      "select set_config('p.groep', (public.create_group('Proefgroep586'::text))->'group'->>'id', true);",
      'reset role;',
      'insert into public.group_members(group_id, user_id, role, status) values',
      "  (current_setting('p.groep')::uuid, current_setting('p.melder')::uuid, 'member', 'active'),",
      "  (current_setting('p.groep')::uuid, current_setting('p.lid')::uuid,    'member', 'active');",
      ...(opties.tweedeBeheerder === true
        ? [
            'insert into public.group_members(group_id, user_id, role, status) values',
            "  (current_setting('p.groep')::uuid, current_setting('p.tweede')::uuid, 'admin', 'active');",
          ]
        : []),
      ...regels,
      'rollback;',
    ].join('\n'),
  );
}

/** Leest één `SLEUTEL=waarde`-regel uit de psql-uitvoer. */
function lees(uit: string, sleutel: string): string | undefined {
  return uit
    .split('\n')
    .map((r) => r.trim())
    .find((r) => r.startsWith(`${sleutel}=`))
    ?.slice(sleutel.length + 1);
}

/** Wisselt van gebruiker binnen de proef. */
function als(wie: string): string[] {
  return [`select set_config('request.jwt.claim.sub', current_setting('p.${wie}'), true);`, 'set local role authenticated;'];
}

describe.skipIf(!beschikbaar)('een melding komt aan', () => {
  /**
   * ⚠️⚠️ **Dit is de toets die het issue draagt.** Hij is geschreven ná de
   *    meting dat het gat er was, en hij wordt rood zodra de escalatieroute
   *    verdwijnt — dan komt een melding over de beheerder weer nergens aan.
   */
  it('een melding over de groepsbeheerder bereikt de platformbeheerder, en niemand anders', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.beheerder')::uuid, null, 'spam', 'doet naar');",
      "select 'MELDER=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
      ...als('beheerder'),
      "select 'ONDERWERP=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
      ...als('lid'),
      "select 'ANDER_LID=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
      ...als('platform'),
      "select 'PLATFORM=' || count(*) from public.openstaande_meldingen();",
      "select 'ESCALATIE=' || coalesce((select via_escalatie::text from public.openstaande_meldingen() limit 1), '-');",
      'reset role;',
    ]);

    expect(lees(uit, 'PLATFORM'), 'de escalatieroute is de enige die dit geval kan afhandelen').toBe('1');
    expect(lees(uit, 'ESCALATIE'), 'de lezer hoort te zeggen dát dit een escalatie is').toBe('true');

    // ⚠️ De drie must-nots. Zonder deze helft is "de platformbeheerder ziet hem"
    //    ook waar als iedereen hem ziet, en dan is dit geen grendel maar een lek.
    expect(lees(uit, 'ONDERWERP'), 'het onderwerp mag een melding over zichzelf nooit zien').toBe('0');
    expect(lees(uit, 'ANDER_LID'), 'een gewoon groepslid is geen moderator').toBe('0');
    expect(lees(uit, 'MELDER'), 'de melder mag zijn eigen melding zien via reports_select, maar is geen moderator — de lezer is voor afhandelen').toBe('0');
  }, 60_000);

  /**
   * ⚠️⚠️ **De toets die 0296 had moeten vangen en niet kon.** Hier staat een
   *    tweede beheerder in de groep, dus de groep kán een melding over de eerste
   *    zelf afhandelen — en dan hoort de escalatie níet te vuren. 📏 Vóór 0297
   *    deed hij dat wél: de platformbeheerder las de toelichting van een melding
   *    uit een groep waar hij niet in zit, terwijl beheerder B ernaast stond.
   */
  it('een melding over een beheerder die een mede-beheerder kan afhandelen, escaleert niet', () => {
    const uit = proef(
      [
        ...als('melder'),
        "select public.meld(current_setting('p.groep')::uuid, current_setting('p.beheerder')::uuid, null, 'harassment', 'geheime klacht');",
        'reset role;',
        ...als('tweede'),
        "select 'TWEEDE_BEHEERDER=' || count(*) from public.openstaande_meldingen();",
        'reset role;',
        ...als('platform'),
        "select 'PLATFORM=' || count(*) from public.openstaande_meldingen();",
        'reset role;',
      ],
      { tweedeBeheerder: true },
    );

    expect(lees(uit, 'TWEEDE_BEHEERDER'), 'de groep kan dit zelf — dat is de hele reden dat de escalatie smal hoort te zijn').toBe('1');
    expect(
      lees(uit, 'PLATFORM'),
      'de kop van 0296 belooft "alleen die waar de groep aantoonbaar niets mee kan"; met een mede-beheerder kán de groep het',
    ).toBe('0');
  }, 60_000);

  /**
   * ⚠️⚠️ **K1 — de must-not van de éscalatieroute, en die ontbrak.** De toets
   *    hieronder zette `ONDERWERP=0` vast voor de groepsbeheerder (route a), en
   *    route (a) draagt die poort ook. Route (b) droeg hem niet, en route (b)
   *    vuurt precies wanneer het onderwerp beheerder is — wat een
   *    platformbeheerder die zelf een groep aanmaakt, ís.
   *
   *    📏 Gemeten vóór 0297: `ZIET_OVER_ZICHZELF=1`,
   *    `LEEST_TOELICHTING=hij bedreigt mij`, `DEMPT_ZELF=true`, en
   *    `afgehandeld_door` wees naar het onderwerp. De regel *"het onderwerp
   *    beoordeelt niet"* hoort per róute getoetst te worden en niet per rol.
   */
  it('de platformbeheerder beoordeelt geen melding over zichzelf', () => {
    const uit = proef([
      // de platformbeheerder wordt beheerder van deze groep — precies het geval
      // dat route (b) liet vuren
      "update public.group_members set role = 'admin' where group_id = current_setting('p.groep')::uuid and user_id = current_setting('p.platform')::uuid;",
      "insert into public.group_members(group_id, user_id, role, status) values (current_setting('p.groep')::uuid, current_setting('p.platform')::uuid, 'admin', 'active') on conflict do nothing;",
      "delete from public.group_members where group_id = current_setting('p.groep')::uuid and user_id = current_setting('p.beheerder')::uuid;",
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.platform')::uuid, null, 'harassment', 'hij bedreigt mij');",
      'reset role;',
      ...als('platform'),
      "select 'ZIET_OVER_ZICHZELF=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
      "select set_config('p.melding', (select id::text from public.reports limit 1), true);",
      ...als('platform'),
      "select 'DEMPT_ZELF=' || ((public.handel_melding_af(current_setting('p.melding')::uuid, 'dismissed'))->>'reason');",
      'reset role;',
    ]);

    expect(lees(uit, 'ZIET_OVER_ZICHZELF'), 'wie het onderwerp is, beoordeelt niet — ook niet via de escalatieroute').toBe('0');
    expect(
      lees(uit, 'DEMPT_ZELF'),
      'een onderwerp dat zijn eigen melding kan sluiten, is precies het schaamteloze geval waar de meldknop voor bestaat',
    ).toBe('not_allowed');
  }, 60_000);

  /**
   * ⚠️⚠️ **K3 — de kolombelofte langs het pad dat hem brak.** De toets onderaan
   *    dit bestand leest `proargnames` van de RPC, en de beloftetest leest het
   *    TypeScript-type. Allebei correct, allebei over de **functie** — terwijl er
   *    een tweede weg was: `authenticated` had tabelbrede `select` op
   *    `public.reports`, en `reports_select` gaf de groepsbeheerder de hele rij.
   *    📏 Gemeten vóór 0297: `TABEL_GEEFT_MELDER=<uuid>`, `MELDER_NAAM=Melder`.
   *
   *    Eén regel in de browserconsole. Regel 18 vraag 4 in zijn duurste vorm: de
   *    toets greep naar de plek waar de belofte vandaag stond.
   */
  it('de melder is ook buiten de RPC om niet te lezen', () => {
    // ⚠️ **De grant en de policy, en niet een `select` die faalt.** `psql` draait
    //    hier met `ON_ERROR_STOP=1`, dus een verwachte weigering breekt de hele
    //    proef af — en een toets die de rest van zijn eigen opstelling opblaast,
    //    meet niet meer wat hij denkt te meten. Dit zijn de twee lagen zelf:
    //    het recht dat er niet is, en de policy die het ook niet zou geven.
    const uit = proef([
      "select 'MELDER=' || has_column_privilege('authenticated', 'public.reports', 'id', 'SELECT')::text;",
      "select 'REPORTER_ID=' || has_column_privilege('authenticated', 'public.reports', 'reporter_id', 'SELECT')::text;",
      "select 'AFHANDELAAR=' || has_column_privilege('authenticated', 'public.reports', 'afgehandeld_door', 'SELECT')::text;",
      "select 'POLICY=' || (select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.reports'::regclass and polname = 'reports_select');",
    ]);

    // ⚠️⚠️ **Beide kanten, en de eerste is er bij gekomen omdat 0297 hem brak.**
    //    Die migratie repareerde de kolombelofte met een kaal
    //    `revoke select on public.reports` — en nam daarmee het leesrecht van de
    //    mélder op zijn éigen melding weg. 📏 CI vond dat op twee plekken tegelijk
    //    (`anonleesrecht` en `veiligheid`), en allebei terecht. **Een revoke is
    //    geen reparatie tot je gemeten hebt wat hij ook dichttrekt**; 0298 maakt er
    //    een kolomgrant van, wat CLAUDE.md bij deze klasse ook voorschrijft.
    expect(lees(uit, 'MELDER'), 'de melder hoort zijn eigen melding te kunnen lezen — dat staat sinds QS8-232 onder toets').toBe('true');
    expect(
      lees(uit, 'REPORTER_ID'),
      'RLS kan geen kolommen beperken: dit is de kolomgrens zelf, en zonder hem is de kolomlijst van de RPC een suggestie',
    ).toBe('false');
    expect(lees(uit, 'AFHANDELAAR'), 'wie er oordeelde is moderatie-administratie, niet iets voor de melder of de gemelde').toBe('false');
    expect(
      lees(uit, 'POLICY'),
      'en de rijgrens zakt mee, zodat een teruggekeerde tabelgrant de beheerderstak niet opnieuw openzet',
    ).not.toContain('is_group_admin');
  }, 60_000);

  /**
   * ⚠️ **M1 — het gat van dit issue langs de achterdeur.** `is_group_admin()`
   *    eist `g.status <> 'archived'`, en archiveren is de gewone knop van elke
   *    beheerder (`verwijder_mijn_account()` doet het zelfs vanzelf met
   *    solo-groepen). 📏 Gemeten vóór 0297: `GEARCHIVEERD_BEHEERDER_ZIET=0`. Een
   *    open melding was daarmee opnieuw een melding die nergens aankomt.
   */
  it('een open melding overleeft het archiveren van de groep', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'spam', null);",
      'reset role;',
      "update public.groups set status = 'archived' where id = current_setting('p.groep')::uuid;",
      ...als('beheerder'),
      "select 'NA_ARCHIVEREN=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
    ]);

    expect(lees(uit, 'NA_ARCHIVEREN'), 'een gearchiveerde groep krijgt geen nieuwe meldingen; de oude horen afgehandeld te kunnen worden').toBe('1');
  }, 60_000);

  /**
   * ⚠️ **M2 — de teller telt melders.** De kop van 0296 legt dit getal uit als
   *    *"vijf mensen melden dezelfde persoon is het signaal dat telt"*, en dat is
   *    precies wat `count(*)` niet meet. 📏 Gemeten vóór 0297: één melder,
   *    drie meldingen, teller op 3 — en het scherm laat met opzet niet zien wie
   *    er meldde, dus er was geen manier om te zien dat het één iemand was.
   */
  it('de teller telt melders en geen meldingen', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'spam', 'een');",
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'spam', 'twee');",
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'spam', 'drie');",
      'reset role;',
      ...als('beheerder'),
      "select 'TELLING=' || coalesce((select meldingen_over_onderwerp::text from public.openstaande_meldingen() limit 1), '-');",
      "select 'KAARTEN=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
    ]);

    expect(lees(uit, 'KAARTEN'), 'drie meldingen zijn drie kaarten — dat verandert niet').toBe('3');
    expect(lees(uit, 'TELLING'), 'één pester die twintig keer meldt, is geen twintig mensen die iets vinden').toBe('1');
  }, 60_000);

  /**
   * ⚠️⚠️ **K4 — de naad tussen afhandelen en het wisrecht.** `afgehandeld_door`
   *    draagt `on delete set null`, en de CHECK eiste bij `status <> 'open'`
   *    juist een `afgehandeld_door`: de referentiële actie schond zijn eigen
   *    tabelconstraint. 📏 Gemeten vóór 0297: `verwijder_mijn_account()` viel om
   *    met *violates check constraint "reports_afhandeling_is_heel"*.
   *
   *    Twee onderdelen die elk klopten, en de keten ertussen stuk — regel 18
   *    vraag 1. Geen van beide kanten had een test die de naad raakte.
   */
  it('wie een melding afhandelde, kan zijn account nog opzeggen', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'spam', null);",
      'reset role;',
      ...als('beheerder'),
      "select set_config('p.melding', (select id::text from public.openstaande_meldingen() limit 1), true);",
      "select 'AFGEHANDELD=' || ((public.handel_melding_af(current_setting('p.melding')::uuid, 'reviewed'))->>'ok');",
      'reset role;',
      "delete from auth.users where id = current_setting('p.beheerder')::uuid;",
      "select 'OPZEGGEN=gelukt';",
      "select 'SPOOR=' || (select (afgehandeld_door is null)::text || '/' || (afgehandeld_op is not null)::text from public.reports where id = current_setting('p.melding')::uuid);",
    ]);

    expect(lees(uit, 'AFGEHANDELD'), 'eerst moet er iets af te handelen zijn').toBe('true');
    expect(lees(uit, 'OPZEGGEN'), 'het wisrecht mag niet afhangen van of je ooit moderator geweest bent').toBe('gelukt');
    expect(
      lees(uit, 'SPOOR'),
      'de naam loopt leeg zoals bij een chatbericht (0221); het moment blijft, en dat is wat de afhandeling tot administratie maakt',
    ).toBe('true/true');
  }, 60_000);

  it('een gewone melding bereikt de groepsbeheerder, en de escalatie blijft smal', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'harassment', 'scheldt');",
      'reset role;',
      ...als('beheerder'),
      "select 'BEHEERDER=' || count(*) from public.openstaande_meldingen();",
      "select 'TELLING=' || coalesce((select meldingen_over_onderwerp::text from public.openstaande_meldingen() limit 1), '-');",
      'reset role;',
      ...als('platform'),
      "select 'PLATFORM=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
    ]);

    expect(lees(uit, 'BEHEERDER'), 'hier kan de groep zelf bij — dat is de gewone route').toBe('1');
    expect(lees(uit, 'TELLING'), 'de lezer telt hoeveel meldingen er over dit onderwerp openstaan').toBe('1');

    // ⚠️ **Dit is de belangrijkste must-not van 0296.** De platformbeheerder ziet
    //    met opzet níet alles: alleen wat de groep aantoonbaar niet kan
    //    afhandelen. Wordt dit `1`, dan leest één account elke melding in elke
    //    groep, en dat is een privacybelofte die niemand gedaan heeft.
    expect(lees(uit, 'PLATFORM'), 'de escalatie is smal — de platformbeheerder is geen moderatiedienst').toBe('0');
  }, 60_000);

  it('afhandelen kan één keer, door wie het mag, en alleen naar een geldige stand', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'spam', null);",
      'reset role;',
      // ⚠️ Het id buiten de rol om, want sinds 0297 mag géén client `reports`
      //    lezen — ook de beheerder niet. Het scherm krijgt hem uit
      //    `openstaande_meldingen()`; deze toets gaat over wie hem mag
      //    afhandelen als hij hem tóch heeft.
      "select set_config('p.melding', (select id::text from public.reports limit 1), true);",
      ...als('platform'),
      "select 'PLATFORM_MAG_NIET=' || ((public.handel_melding_af(current_setting('p.melding')::uuid, 'reviewed'))->>'reason');",
      'reset role;',
      ...als('melder'),
      "select 'MELDER_MAG_NIET=' || ((public.handel_melding_af(current_setting('p.melding')::uuid, 'reviewed'))->>'reason');",
      'reset role;',
      ...als('beheerder'),
      "select 'ONGELDIG=' || ((public.handel_melding_af(current_setting('p.melding')::uuid, 'open'))->>'reason');",
      "select 'EERSTE=' || ((public.handel_melding_af(current_setting('p.melding')::uuid, 'reviewed'))->>'ok');",
      "select 'TWEEDE=' || ((public.handel_melding_af(current_setting('p.melding')::uuid, 'dismissed'))->>'reason');",
      'reset role;',
      "select 'SPOOR=' || (select (afgehandeld_door is not null and afgehandeld_op is not null)::text from public.reports limit 1);",
      "select 'WEG_UIT_DE_LIJST=' || (select count(*)::text from public.reports where status = 'open');",
    ]);

    expect(lees(uit, 'PLATFORM_MAG_NIET'), 'de platformbeheerder mag alleen geëscaleerde gevallen aanraken').toBe('not_allowed');
    expect(lees(uit, 'MELDER_MAG_NIET'), 'melden is geen beoordelen').toBe('not_allowed');
    expect(lees(uit, 'ONGELDIG'), "'open' is geen afhandeling").toBe('status_invalid');
    expect(lees(uit, 'EERSTE'), 'de beheerder handelt zijn eigen groep af').toBe('true');
    expect(
      lees(uit, 'TWEEDE'),
      'een tweede oordeel zou `afgehandeld_door` overschrijven, en dan is dat niet meer wie het besloot',
    ).toBe('already_handled');
    expect(lees(uit, 'SPOOR'), 'een afhandeling zonder wie en wanneer is administratie, geen bewijs').toBe('true');
    expect(lees(uit, 'WEG_UIT_DE_LIJST'), 'een afgehandelde melding staat niet meer open').toBe('0');
  }, 60_000);

  /**
   * ⚠️ **Een kolombelofte, en die is niet met RLS te maken.** *RLS kan geen
   *    kolommen beperken* — dus dat `reporter_id` niet meegaat, is een
   *    eigenschap van de **returntabel** van deze functie en van niets anders.
   *    Een `select *` erbij zou hem stilzwijgend terugbrengen.
   */
  it('de lezer geeft `reporter_id` niet terug — wie meldde is niet nodig om te beoordelen', () => {
    const kolommen = psql(
      "select string_agg(a.attname, ',' order by a.attnum) " +
        'from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, attmode, attnum) ' +
        "where p.oid = 'public.openstaande_meldingen(integer, timestamptz, uuid)'::regprocedure " +
        "and a.attmode = 't';",
    ).trim();

    expect(kolommen, 'de returnkolommen horen leesbaar te zijn in deze toets').toContain('reden');
    expect(
      kolommen,
      'wie er meldde hoort niet bij de beoordeling, en weglaten beschermt de melder tegen een beheerder die het hem betaald zet',
    ).not.toContain('reporter_id');
  }, 30_000);
});
