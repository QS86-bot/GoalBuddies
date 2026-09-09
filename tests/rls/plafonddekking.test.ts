import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De andere kant op: elke tabel die een client kan laten groeien, heeft een
 * dagplafond — of staat met een reden in het register hieronder. QS8-369.
 *
 * ⚠️ **`remdekking.test.ts` bewaakt de ene richting en die is de makkelijke.**
 *    Daar is de vraag: heeft elke teller een rem? Dat is te beantwoorden met wat
 *    er ís. De vraag hier is: mist er een teller? Dat is te beantwoorden met wat
 *    er níet is, en dat is precies de vorm die geen enkele test vanzelf raakt.
 *
 *    📏 En het is niet theoretisch. `push_tokens` had veertien buren met een
 *    `*_dagplafond` en zelf géén enkele niet-interne trigger; de suite was groen
 *    en niemand kon het zien, want er was geen test die naar de leegte kón
 *    kijken. QS8-369 vond dat met de hand. Dit bestand is wat dat had moeten
 *    zijn.
 *
 * ## Wat "een client kan hem laten groeien" betekent
 *
 * Twee routes, en allebei gemeten in de database in plaats van geredeneerd uit
 * de migratiebestanden:
 *
 *   1. **Rechtstreeks.** `authenticated` heeft INSERT op de tabel of op een
 *      kolom ervan.
 *
 *      ⚠️⚠️ **`has_any_column_privilege()` en niet `has_table_privilege()`, en
 *      dat verschil is de helft van dit bestand.** Dit project trekt het
 *      INSERT-recht op tabelniveau in en geeft het per kolom terug — 0046 doet
 *      dat op `goals`, en er zijn er meer. 📏 Met `has_table_privilege` meldde
 *      deze meting **nul** tabellen met een rechtstreekse route, terwijl het er
 *      **twintig** zijn — en twaalf daarvan hebben geen andere route. Een
 *      register dat op die meting gebouwd was, had er twaalf te weinig in gehad
 *      en had groen gestaan, en dat is precies de fout die dit bestand zoekt.
 *   2. **Via een RPC.** Een `security definer`-functie die `authenticated` mag
 *      uitvoeren en die in de tabel schrijft.
 *
 * ⚠️ **De tweede route leest `prosrc` met een reguliere expressie, en dat is een
 *    grovere meting dan de eerste.** Een functie die via dynamische SQL schrijft,
 *    of via een view met een `instead of`-trigger, ziet hij niet. Dat maakt deze
 *    test een ondergrens: wat hij vindt, is echt te laten groeien; wat hij niet
 *    vindt, is daarmee niet veilig. Beter dan dit kan zonder de tabel te vullen,
 *    en het is de vorm die `remdekking.test.ts` er al naast heeft.
 *
 * ## Het register is geen ontsnapping
 *
 * Een tabel mag zonder plafond staan als er een **gemeten** reden is dat een
 * client hem niet kan laten groeien: een sleutel die het aantal rijen bindt, of
 * een grens in de RPC zelf. De reden staat erbij, met het getal of de constraint
 * die hem draagt.
 *
 * ⚠️ **Een regel draagt `QS8-` en dat is met opzet.** Waar geen gemeten grens
 *    is, staat er geen mooie reden maar een issuenummer. Zo is het verschil
 *    tussen "dit kan niet groeien" en "dit is nog niet af" leesbaar in het
 *    register zelf, in plaats van weggeschreven in een zin die als beide leest.
 *
 *    📏 Dat werkte: het waren er twee, en `group_events` (QS8-374) is er in
 *    0217 uit verdwenen doordat de tabel een echt dagplafond kreeg. De test
 *    'het register bevat geen regel die niets meer bewaakt' was het enige dat
 *    daarover begon — die regel had anders blijven staan als een besluit.
 *
 * ⚠️ En het register wordt ook de ándere kant op getoetst: een regel voor een
 *    tabel die niet meer te laten groeien is, of die inmiddels wél een plafond
 *    heeft, wordt rood. Zonder die helft groeit het register stil dicht en is
 *    het over een jaar een lijst waar alles in staat.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, mutatie per grendel:
 *
 *   A  `drop trigger pushtokens_dagplafond on push_tokens` (en de regel niet in
 *      het register zetten)
 *      → 3 rood: het gat zelf, de zelftoets (15 → 14) en de naamgenoemde test
 *   B  de regel `reports` uit het register halen
 *      → 1 rood, met `reports` in de melding
 *   C  een regel toevoegen voor `goals`, die wél een plafond heeft
 *      → 1 rood: 'het register bevat geen regel die niets meer bewaakt'
 *   D  een regel toevoegen voor `user_streaks`, die geen client kan laten groeien
 *      → 1 rood, dezelfde
 *   E  `has_any_column_privilege` terug naar `has_table_privilege`
 *      → 2 rood: de zelftoets (29 → 17) en de registertest, want de twaalf
 *        tabellen met alléén een kolomgrant vallen dan uit de meting
 *
 * ⚠️ Bij elke mutatie is eerst met een grep in het bestand of in `pg_trigger`
 *    nagekeken dat hij er écht in stond vóór de uitslag geloofd werd.
 */

/**
 * Tabellen zonder `*_dagplafond` die een client tóch kan laten groeien, met de
 * gemeten reden dat dat geen gat is.
 *
 * 📏 Alles hieronder is op 08-09-2026 op de lokale stack nagekeken: de
 * constraints met `pg_constraint`, de grenzen in de RPC's met
 * `pg_get_functiondef()`.
 */
const REGISTER: Readonly<Record<string, string>> = {
  ai_jobs:
    'vraag_ai_job() weigert boven de 3 lopende jobs en houdt daarnaast een ' +
    'dagbudget bij over het laatste etmaal.',
  approval_withdrawals:
    'UNIQUE (approval_id) — hoogstens één intrekking per goedkeuring, en ' +
    'completion_approvals draagt zelf goedkeuringen_dagplafond.',
  breathers:
    'plan_adempauze() eist sinds 0216 dat een pauze begint binnen 52 cycli terug ' +
    'tot 52 cycli vooruit, op de kalender van de eigenaar. Dat zijn hoogstens 105 ' +
    'cyclusstarts, en omdat pauzes elkaar niet mogen overlappen is dat meteen de ' +
    'bovengrens per doel. 📏 Dezelfde 200 aanroepen die er vóór 0216 alle 200 in ' +
    'gingen, leveren er nu 53 op (QS8-373).',
  deadline_requests: 'vraag_deadline_verschuiving() weigert vanaf 5 verzoeken in het laatste etmaal.',
  group_join_requests: 'vraag_lidmaatschap_aan() weigert zodra lidmaatschapsverzoeken_over() op nul staat.',
  group_members:
    'PRIMARY KEY (group_id, user_id) — één rij per groep per lid; en de twee ' +
    'routes ernaartoe hebben zelf een grens: create_group() 10 per etmaal, ' +
    'join_group_with_code() 20 pogingen per etmaal en 12 leden per groep.',
  groups: 'create_group() weigert vanaf 10 groepen in het laatste etmaal, en vanaf 10 lidmaatschappen.',
  invite_events: 'join_group_with_code() weigert vanaf 20 pogingen in het laatste etmaal.',
  invite_preview_limits:
    'PRIMARY KEY (group_id) — één rij per groep, en invite_preview() werkt hem ' +
    'bij in plaats van er een tweede naast te zetten.',
  points_ledger:
    'Geen eigen clientroute: elke rij hangt aan een handeling die zelf begrensd ' +
    'is. trek_goedkeuring_in() loopt langs UNIQUE (approval_id) op ' +
    'approval_withdrawals; plan_adempauze() boekt alleen bij een herstel van een ' +
    'al afgeboekt punt, en dan hoogstens 1 rij per doel per cyclus.',
  reports: 'meld() weigert zodra meldingen_over() op nul staat.',
  user_blocks:
    'PRIMARY KEY (blocker_id, blocked_id) met on conflict do nothing, en ' +
    'blokkeer() eist een bestaand profiel — begrensd door het aantal mensen dat ' +
    'je kunt noemen, niet door hoe vaak je het vraagt.',
  week_reviews: 'UNIQUE (group_id, user_id, group_period_start) — één weekafsluiting per periode.',
};

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'push_tokens' and relkind = 'r' and relnamespace = 'public'::regnamespace",
  import.meta.url,
);

/**
 * Elke tabel in `public` die een client kan laten groeien, met de vraag of er
 * een `*_dagplafond` op staat.
 *
 * ⚠️ De koppeling teller ↔ tabel loopt over `tgrelid` en niet over de naam. De
 *    tellers heten Nederlands (`voltooiingen_dagplafond`) en de tabellen Engels
 *    (`completions`); een vergelijking op naam meldt hier vrolijk dat de helft
 *    geen plafond heeft.
 */
function groeibareTabellen(): { naam: string; plafond: boolean }[] {
  const uit = psql(`
    with tabel as (
      select c.oid as toid, c.relname::text as naam
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
    ),
    groeibaar as (
      select t.toid, t.naam,
             -- ⚠️ Per kolom. Zie de kop: dit project trekt INSERT op tabelniveau
             --    in en geeft het per kolom terug.
             has_any_column_privilege('authenticated', t.toid, 'INSERT') as direct,
             exists (
               select 1
                 from pg_proc p
                 join pg_namespace pn on pn.oid = p.pronamespace
                where pn.nspname = 'public'
                  and p.prosecdef
                  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                  and p.prosrc ~* ('insert\\s+into\\s+(public\\.)?' || t.naam || '\\M')
             ) as via_rpc
        from tabel t
    )
    select g.naam || '|' ||
           exists (
             select 1 from pg_trigger tr
              where tr.tgrelid = g.toid
                and not tr.tgisinternal
                and tr.tgname like '%\\_dagplafond'
           )::text
      from groeibaar g
     where g.direct or g.via_rpc
     order by 1
  `);
  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '')
    .map((r) => {
      const [naam, plafond] = r.split('|');
      // ⚠️ `'true'` en niet `'t'`. De query cast met `::text`, en dan geeft
      //    Postgres de tekstweergave van de boolean — niet de `t`/`f` die psql
      //    voor een kále booleankolom toont. 📏 Met `=== 't'` stond hier voor
      //    élke tabel `false`, en dat is precies het geval dat de zelftoets
      //    hieronder ving: 0 in plaats van 15.
      return { naam: naam ?? '', plafond: plafond === 'true' };
    });
}

describe.skipIf(!beschikbaar)('elke groeibare tabel heeft een plafond of een reden', () => {
  it('geen enkele groeibare tabel staat buiten het register zonder plafond', () => {
    const onbewaakt = groeibareTabellen()
      .filter((t) => !t.plafond)
      .map((t) => t.naam)
      .filter((naam) => !(naam in REGISTER));

    expect(
      onbewaakt,
      `deze tabellen kan een ingelogde gebruiker laten groeien en er staat geen ` +
        `dagplafond op: ${onbewaakt.join(', ')}. Zet er een plafond op (zie ` +
        `migratie 0214 voor de vorm), of zet ze met een gemeten reden in ` +
        `REGISTER bovenaan dit bestand.`,
    ).toEqual([]);
  }, 60_000);

  it('en de meting vindt werkelijk iets — anders bewijst de regel hierboven niets', () => {
    // ⚠️ **Zonder deze helft is de test hierboven gratis groen.** Vindt de query
    //    door een typefout nul tabellen, dan is de lijst leeg en klopt de
    //    assertie — terwijl er niets gemeten is. Regel 18, vraag 3.
    //
    // ⚠️ En het is geen ondergrens maar een exact getal, om dezelfde reden als
    //    de zelftoets in `remdekking.test.ts`: bij `> 10` hadden er negentien
    //    kunnen wegvallen zonder dat hier iets aansloeg.
    const gevonden = groeibareTabellen();

    expect(gevonden.length, 'het aantal groeibare tabellen is veranderd').toBe(29);
    expect(
      gevonden.filter((t) => t.plafond).length,
      'het aantal groeibare tabellen mét plafond is veranderd',
    ).toBe(16);
  }, 60_000);

  it('en push_tokens zit er met een plafond bij — de aanleiding van dit bestand', () => {
    // ⚠️ **Deze regel is de ijking van de vorige twee, vastgelegd.** QS8-369
    //    bestond omdat `push_tokens` precies hier doorheen viel: groeibaar via
    //    `registreer_push_token()`, geen plafond, en niets dat erover begon.
    //    Verdwijnt het plafond, dan hoort deze test te zeggen wélke tabel het
    //    was en niet alleen dat het getal niet meer klopt.
    const push = groeibareTabellen().find((t) => t.naam === 'push_tokens');

    expect(push, 'push_tokens hoort groeibaar te zijn via registreer_push_token()').toBeDefined();
    expect(push?.plafond, 'pushtokens_dagplafond hoort er te staan — zie 0214').toBe(true);
  }, 60_000);

  it('het register bevat geen regel die niets meer bewaakt', () => {
    // ⚠️ **De andere kant op.** Zonder deze test groeit het register stil dicht:
    //    een tabel die een plafond krijgt, of die niet meer te laten groeien is,
    //    laat zijn regel achter en die leest volgend jaar als een besluit.
    const groeibaarZonderPlafond = new Set(
      groeibareTabellen()
        .filter((t) => !t.plafond)
        .map((t) => t.naam),
    );

    const overbodig = Object.keys(REGISTER).filter((naam) => !groeibaarZonderPlafond.has(naam));

    expect(
      overbodig,
      `deze regels in REGISTER bewaken niets meer — de tabel heeft inmiddels een ` +
        `dagplafond, of een client kan hem niet meer laten groeien: ` +
        `${overbodig.join(', ')}. Haal ze weg.`,
    ).toEqual([]);
  }, 60_000);

  it('elke reden in het register noemt een grens of een issue', () => {
    // ⚠️ **Een register met "n.v.t." erin is geen register.** Dezelfde eis als
    //    `npm run review:controle` aan een Laag-rij stelt: de reden draagt de
    //    aanname die de regel overeind houdt, en is die er niet, dan is het een
    //    uitstel en hoort er een issuenummer te staan.
    const zwak = Object.entries(REGISTER)
      .filter(([, reden]) => {
        const noemtGrens = /\d/.test(reden) || /UNIQUE|PRIMARY KEY|_over\(\)/.test(reden);
        return reden.length < 40 || !noemtGrens;
      })
      .map(([naam]) => naam);

    expect(
      zwak,
      `deze regels noemen geen grens en geen issue: ${zwak.join(', ')}. Een reden ` +
        `die geen getal, sleutel of QS8-nummer bevat, is een aanname.`,
    ).toEqual([]);
  }, 60_000);
});
