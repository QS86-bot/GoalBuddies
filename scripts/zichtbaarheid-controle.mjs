#!/usr/bin/env node
/**
 * zichtbaarheid-controle — wat gaat er in een open groep open?
 *
 * ⚠️ **Besluit A41 gaf een groep de keuze tussen beschermd en open, en de zin
 *    die de gebruiker daarbij leest somt op wat er dan zichtbaar wordt.** Die
 *    zin staat in de catalogus (`zichtbaarheid.open_uitleg` en
 *    `bevestiging.groep_openzetten.uitleg`); wat er werkelijk varieert staat in
 *    de database. Niets legde die twee naast elkaar, en dat is precies hoe die
 *    zin op 24-08-2026 een derde van de waarheid ging vertellen.
 *
 * ⚠️ **De bevinding van 25-08 zei dat een controle "een machineleesbare vorm van
 *    §6b" vraagt. Dat is naar de verkeerde bron gekeken.** Het beslisdocument is
 *    een beschrijving; de database is de waarheid. Wat op `groups.zichtbaarheid`
 *    varieert, is gewoon te tellen — en dan hoeft er aan dat document niets te
 *    veranderen.
 *
 * ⚠️ **Het register is tweezijdig en heeft twee soorten rijen.** Niet alles wat
 *    zichtbaarheid noemt is een oppervlak: de twee hulpfuncties zíjn het
 *    mechanisme, `zet_groepszichtbaarheid()` is de setter, `guard_group_update()`
 *    pint de kolom, en `create_group()` zet hem bij het aanmaken. Die staan hier
 *    met hun reden, zodat een níeuwe plek die zichtbaarheid noemt in geen van
 *    beide lijsten valt en dus opvalt.
 *
 * ⚠️ **De zoektocht gaat over de kolom én over de hulpfuncties, en dat is met
 *    opzet dubbel.** Een oppervlak dat rechtstreeks op `groups.zichtbaarheid`
 *    filtert zonder `lid_van_open_groep()` te gebruiken, is precies de valse
 *    negatief die `pin:controle` op 27-08 had — daar kostte één regex drie
 *    gemiste schrijfvormen.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

/**
 * De oppervlakken die met opzet variëren op `groups.zichtbaarheid`, met wat de
 * gebruiker daarover leest.
 *
 * ⚠️ Zes rijen, maar **vijf feiten** — en dat onderscheid is de reden dat de zin
 *    voor de gebruiker niet bij elke rij meegroeit. (Het waren er zeven en zes tot
 *    QS8-802: het klassement varieert sinds A57 niet meer op de zichtbaarheid,
 *    zie `KLASSEMENTPOORT` hieronder.) `zichtbare_reeksen_van_groep`
 *    (0151) is een tweede pad naar hetzelfde feit als `group_visible_streaks`,
 *    niet een eigen ding dat opengaat. Komt er een rij bij die wél een nieuw feit
 *    opent, dan wordt deze controle rood — en dán is de vraag of
 *    `zichtbaarheid.open_uitleg` en `bevestiging.groep_openzetten.uitleg` nog
 *    kloppen, niet later.
 *
 * ⚠️ **Dat is op 14-09-2026 voor de tweede keer gebeurd** (QS8-477, migratie
 *    0268). `groep_helden()` werd hier rood, en de twee zinnen noemden toen vier
 *    van de vijf feiten die er waren. Ze noemen er nu zes.
 *
 *    ⚠️ En er kwam een derde zin bij die niemand had aangewezen:
 *       `bevestiging.groep_beschermen.uitleg`, de tekst bij het terúgzetten. Die
 *       somt op wat er dichtgaat, en liep net zo hard uit de pas — met de
 *       gevaarlijke richting van de twee, want een groep die hoort dat iets weer
 *       privé wordt terwijl het blijft staan, gelooft een belofte die niet klopt.
 *       Deze controle vindt hem niet; `tests/scripts/zichtbaarheid-controle.test.ts`
 *       legt hem sinds QS8-477 wél naast de andere twee.
 *
 * ⚠️ **De tweede-pad-rij is de uitzondering en hij hoort er een te blijven.** Het
 *    is verleidelijk om hem bij `GEEN_OPPERVLAK` te zetten — hij opent immers
 *    niets nieuws — maar hij ís een oppervlak: hij geeft gemaskeerde
 *    gebruikersdata terug en de maskering varieert op `zichtbaarheid`. Hem bij
 *    het mechanisme zetten zou betekenen dat een plek die écht data uitgeeft,
 *    ongeclassificeerd langs de volgende lezer glijdt. Wat hem hier houdt is dat
 *    zijn gelijkheid met de view onder test staat; loopt die ooit uiteen, dan is
 *    het wél een zesde feit en groeit de zin alsnog.
 *
 * ⚠️ **Dat heeft op 01-09-2026 precies gewerkt en dat is het opschrijven waard.**
 *    Het klassement uit besluit A54 werd hier rood, en de melding wees naar de
 *    twee zinnen — die tot dat moment drie oppervlakken opsomden terwijl er vier
 *    waren en er een vijfde bij kwam. Zonder deze controle was de gebruiker de
 *    groep open blijven zetten op een zin die zijn punten niet noemde.
 *
 * ⚠️ **En sinds A57 staat dat klassement hier niet meer** (QS8-666, migraties
 *    0333 en 0336; uit dit register gehaald in QS8-802). Het hangt aan de
 *    schakelaar `groups.klassement_aan` en niet aan de zichtbaarheid: een
 *    beschermde groep kan een klassement hebben, een open groep kan het uit
 *    hebben. Openzetten zet de schakelaar wél aan als hij uit stond (besluit 45),
 *    en daarom noemt `bevestiging.groep_openzetten.uitleg` het klassement nog —
 *    maar dat is een handeling van de setter, geen oppervlak dat op de stand
 *    varieert. De poort zelf wordt hieronder apart getoetst.
 */
export const OPPERVLAKKEN = new Map([
  [
    'policy:weekly_goals.weekly_goals_select',
    'De gemiste en doorgeschoven weken zelf (migratie 0077). Dit is het zwaarste ' +
      'oppervlak: het is de rij waar domeinregel 7 over gaat.',
  ],
  [
    'functie:group_overview',
    'Wie er in welke week meedeed en de laatste cyclus per lid (migratie 0078). ' +
      'Buiten een open groep geeft `closed_this_period` geen antwoord.',
  ],
  [
    'view:group_visible_streaks',
    'Elkaars beste reeks ooit (migratie 0078). Een view en geen policy, want RLS ' +
      'kan geen kolommen beperken.',
  ],
  [
    'policy:chain_links.chain_links_select',
    'De Ketting per lid (migratie 0079). De teller erboven blijft dicht — die is ' +
      'optellend en verraadt niemand (besluit A42).',
  ],
  [
    'functie:zichtbare_reeksen_van_groep',
    'Dezelfde beste reeks als `view:group_visible_streaks` — geen zesde ding dat ' +
      'opengaat maar een tweede deur naar het vijfde (migratie 0151). Hij bestaat ' +
      'omdat de view op `security_barrier` staat en zijn `where` daardoor per rij ' +
      'van de héle `user_streaks` draait; `group_overview()` gebruikt hem. ' +
      '⚠️ Staat hij hier, dan hoeft `zichtbaarheid.open_uitleg` niet te groeien — ' +
      'maar wijkt hij ooit inhoudelijk van de view af, dan is dat wél een nieuw ' +
      'oppervlak. Die gelijkheid staat onder test in ' +
      '`tests/rls/reeksen-van-een-groep.test.ts`, in beide richtingen.',
  ],
  [
    'functie:groep_helden',
    'Welke held er bij elk lid het laatst langs is geweest, met de trigger erbij ' +
      '(migratie 0268, QS8-477, besluit 5 van QS8-468). Het zesde oppervlak. ' +
      '⚠️ **Dit is er een die tegenslag opent en niet een die hem verbergt:** ' +
      '`trigger = \'misser\'` en `trigger = \'stilte\'` zeggen dat iemand iets ' +
      'gemist heeft of drie dagen niets deed. Dat is precies wat A41 toestaat en ' +
      'wat domeinregel 7 in een beschermde groep buiten de deur houdt. ' +
      '⚠️ Een RPC en geen policytak, want RLS kan geen kolommen beperken: een ' +
      'vierde tak op `hero_appearances_select` had `shown_at` meegegeven, en dat ' +
      'is de dag waarop iemand iets miste. Zelfde vorm als `getuigenissen()` ' +
      '(0169) en `straffen_bij_uitstelverzoek()` (0218). ' +
      '⚠️ Alles ouder dan zeven dagen valt eruit — zonder venster is "Ignis is ' +
      'langs geweest" een merkteken dat nooit vervalt.',
  ],
]);

/**
 * Plekken die zichtbaarheid noemen zonder een oppervlak te zijn.
 *
 * ⚠️ Zonder deze lijst meldt de controle er zes en leert hij je zichzelf te
 *    negeren. Mét deze lijst is elke plek geclassificeerd, en dat is het punt:
 *    een nieuwe naam valt in geen van beide en komt bovendrijven.
 */
export const GEEN_OPPERVLAK = new Map([
  ['functie:lid_van_open_groep', 'De hulpfunctie zelf — dit ís het mechanisme.'],
  [
    'functie:vorm_een_buddygroep',
    'Noemt `zichtbaarheid` één keer, in de `insert into groups`, en zet hem daar hard ' +
      "op `'beschermd'` (0300, QS8-233). Hij **varieert** dus niets wat een lid van een " +
      'ánder ziet — hij legt de zuinigste stand vast en laat die niet kiezen. ⚠️ Dat de ' +
      'groep daar nooit meer van afkomt is niet deze regel maar de CHECK ' +
      '`groups_automatisch_is_beschermd` plus de `automatisch`-tak in beide zet-RPC\'s; ' +
      'een `insert` die de goede waarde zet is een gewoonte, een CHECK is een ' +
      'eigenschap. ⚠️⚠️ **Wat hier wél een oppervlak is, is de groep zelf** — mensen die ' +
      'elkaar niet gekozen hebben zien wat rij 1 geeft. Dat staat als rij 51 in ' +
      '`docs/decisions/002-domeinregel7-oppervlakken.md` en niet in deze lijst, want ' +
      'OPPERVLAKKEN gaat over wat op `groups.zichtbaarheid` varieert.',
  ],
  [
    'functie:deelt_open_groep_met_doel',
    'Dezelfde hulpfunctie voor de doelkant: deelt de kijker een open groep met dít ' +
      'doel? Ook mechanisme en geen oppervlak.',
  ],
  [
    'functie:leesroute_bewaking',
    'De routetoets van 0259. Noemt `deelt_open_groep_met_doel` en ' +
      '`lid_van_open_groep` alleen als naam in een allowlist van gesanctioneerde ' +
      'routes — hij leest geen enkele rij van een lid en geeft alleen policynamen ' +
      'terug. Zelfde reden als `archiefleesgat` hieronder.',
  ],
  [
    'functie:archiefleesgat',
    'De teller van de lees/schrijf-splitsing van 0153. Noemt ' +
      '`deelt_open_groep_met_doel` alleen als één van de vier functies die een ' +
      'archieftoets dragen — hij leest geen enkele rij van een lid en geeft alleen ' +
      'policynamen terug.',
  ],
  [
    'functie:sleutelzetters',
    '⚠️ **Een valse positief op een naam, en die is het opschrijven waard.** Deze ' +
      'functie gaat over de ontgrendelsleutel van het archief (0153) en heeft niets ' +
      'met zichtbaarheid te maken. Hij komt hier terecht omdat zijn body de naam ' +
      '`heropen_groep` noemt, en daar zit `open_groep` letterlijk in — de zoekterm ' +
      'van deze controle. Wie ooit een functienaam kiest met `open_groep` erin, ' +
      'belandt hier. Dat is geen defect (deze controle hoort liever te veel te ' +
      'melden dan te weinig, zie de kop) maar het is wél de reden dat deze rij een ' +
      'uitleg draagt in plaats van een streepje.',
  ],
  [
    'functie:archief_blijft_archief',
    '⚠️ **Dezelfde valse positief als `sleutelzetters` hierboven, en om precies ' +
      'dezelfde reden.** Deze trigger gaat over het archief en niet over ' +
      'zichtbaarheid; hij komt hier terecht doordat zijn foutmelding sinds 0265 ' +
      'de naam `heropen_groep()` noemt, en daar zit `open_groep` letterlijk in. ' +
      'Die naam staat er met opzet in: een weigering die de juiste weg noemt is ' +
      'de helft van de reparatie van QS8-488. De melding herschrijven om deze ' +
      'controle te ontwijken zou de gebruiker slechter bedienen om een script ' +
      'stil te krijgen.',
  ],
  ['functie:zet_groepszichtbaarheid', 'De setter (0076). Zet de stand, leest niets van een lid.'],
  [
    'functie:groep_klassement',
    '⚠️ **Een valse positief op een comment, en tot QS8-802 een rij in OPPERVLAKKEN.** ' +
      'Het klassement varieerde onder A54 (0141) op de zichtbaarheid; sinds A57 (0333) ' +
      'is de poort `lid_van_levende_groep()` plus de schakelaar `groups.klassement_aan` ' +
      'plus de teamtoets. 📏 De body noemt `zichtbaarheid` alleen nog in het commentaar ' +
      '"…en niet meer aan de zichtbaarheid", en daarom vindt de zoekvraag hem. Dat hij ' +
      'hier staat is dus geen oordeel over de poort; die toetst `klassementpoort()` ' +
      'apart en op de code zonder commentaar. Verdwijnt het comment, dan meldt deze ' +
      'controle hem als verdwenen en hoort deze rij eruit.',
  ],
  [
    'functie:zet_huddledag',
    '⚠️ **De tweede valse positief op een naam, en de eerste sinds `sleutelzetters` ' +
      'hierboven.** Deze functie (0208, QS8-360) verzet de huddledag en de lopende ' +
      'periode; hij leest `zichtbaarheid` niet en varieert niets op de stand van de ' +
      'groep. Hij komt hier terecht omdat zijn commentaar `zet_groepszichtbaarheid()` ' +
      'noemt — hij spiegelt de bevestiging en de dagrem van die functie, en die reden ' +
      'hoort in de body te staan. Dat de teller daarop aanslaat is geen defect maar ' +
      'de prijs van een zoekterm die liever te veel meldt dan te weinig; het is wél ' +
      'de tweede keer, en daarmee een patroon in plaats van een incident.',
  ],
  ['functie:guard_group_update', 'Pint de kolom vast; een client mag hem niet schrijven.'],
  ['functie:create_group', 'Zet de beginstand. Nieuwe groepen zijn beschermd.'],
  [
    'functie:maak_teamgroep',
    'Zet de beginstand van een teamgroep, gekozen door de organisatiebeheerder (QS8-653, ' +
      'besluit 18); standaard beschermd. Omzetten gaat daarna via `zet_groepszichtbaarheid()` ' +
      '(besluit 26). Varieert zelf niets.',
  ],
  [
    'functie:invite_preview',
    'Geeft de stand van de gróep terug, niet iets over een lid — verantwoord in 0080: ' +
      'het is het feit dat iemand nodig heeft om te besluiten of hij meedoet.',
  ],
  [
    'functie:zet_taakzichtbaarheid',
    '⚠️ **Dit is wél een nieuw groepsoppervlak, maar het varieert niet op** ' +
      '`groups.zichtbaarheid` (0248, QS8-381). Deze teller gaat over besluit A41: ' +
      'welke oppervlakken laten in een **open** groep meer zien dan in een ' +
      'beschermde. Delen per taak staat daar los van — het is een opt-in van de ' +
      'eigenaar zelf, per regel, en een beschermde groep ziet precies evenveel als ' +
      'een open groep: alleen wat de eigenaar heeft aangewezen. ' +
      '⚠️ De naam komt hier terecht omdat de functie `zichtbaarheid` heet en niet ' +
      'omdat ze de kolom leest; 📏 `zet_taakzichtbaarheid()` noemt `groups` alleen ' +
      'via `is_group_member()`. ' +
      '**Het oppervlak zelf staat wél in** `docs/decisions/002-domeinregel7-oppervlakken.md`, ' +
      'want dát document gaat over élk ding dat de groep te zien krijgt. ' +
      '⚠️ **Kijk hier opnieuw zodra delen ooit van de groepsstand af gaat hangen** ' +
      '— dan is dit een rij in OPPERVLAKKEN en horen `zichtbaarheid.open_uitleg` ' +
      'en `bevestiging.groep_openzetten.uitleg` het te noemen.',
  ],
  [
    'functie:pin_taak',
    '⚠️ **De derde valse positief op een naam** (0246, QS8-379), en hij komt uit een ' +
      'andere hoek dan de twee hiervoor: het woord staat hier in de ' +
      'foutmelding — "De zichtbaarheid en de herkomst van een taak liggen vast". ' +
      'Deze trigger pint `todo_items.visibility`, en dat is een kolom van De Lijst ' +
      'en niet `groups.zichtbaarheid`; hij leest de stand van geen enkele groep en ' +
      'varieert niets op wat een lid van een ánder ziet. Sterker: hij houdt de kolom ' +
      'juist vast, zodat er niets opengaat. ⚠️ Kijk hier opnieuw bij QS8-381 — dat ' +
      'issue geeft `todo_items.visibility` een deelpad, en dán is de vraag of een ' +
      'gedeelde taak een groepsoppervlak is. Vandaag is hij dat niet, want er is geen ' +
      'enkele weg om de kolom van `private` af te krijgen.',
  ],
  [
    'functie:zet_groepsontdekbaarheid',
    'Leest `zichtbaarheid` om te wéigeren (QS8-231, migratie 0144): een open groep kan ' +
      'niet vindbaar zijn, want dan zouden onbekenden elkaars tegenslag zien. Hij geeft ' +
      'dus niets over een lid terug — hij gebruikt de stand als grens en niet als filter. ' +
      '⚠️ De grendel is de CHECK `groups_ontdekbaar_is_beschermd`; deze functie is de ' +
      'uitleg erbij, zodat een scherm een reden kan tonen in plaats van een 23514.',
  ],
]);

/**
 * De poort van het klassement sinds A57 — wat er in de code van
 * `groep_klassement()` en `mijn_klassementen()` moet staan, en wat er niet meer
 * in mag (QS8-802).
 *
 * ⚠️ **Waarom een eigen toets en niet een rij in de registers hierboven.** Die
 *    registers classificeren plekken die zichtbaarheid nóemen; ze zeggen niets
 *    over waar een functie wél op filtert. Zet iemand `lid_van_open_groep()`
 *    terug in het klassement, dan noemt de functie `open_groep` en staat hij
 *    keurig in een register — en zou de controle groen blijven op precies de
 *    terugval die A57 verbiedt. Deze toets maakt dat rood.
 *
 * ⚠️⚠️ **Eén lijst, twee bronnen.** Deze lijst is ook wat
 *    `tests/beloftes/klassementpoort.test.ts` toetst, op de migratiebestanden en
 *    zonder database; hier gaat hij over de gedéployde definitie
 *    (`pg_get_functiondef()`). Dat verschil is de reden dat er twee toetsen zijn
 *    en geen twee vertalingen van de regel: wie een poortdeel toevoegt, doet dat
 *    hier en beide toetsen nemen het over. Die toets heeft daarnaast eigen,
 *    strengere vormen (de volgorde, de knip, de exacte teamvoorwaarde) die
 *    alleen op de bron te stellen zijn.
 *
 * ⚠️ **Op de code, niet op het commentaar.** 📏 De body van 0333 noemt
 *    `zichtbaarheid` in een comment, en een comment dat de oude poort uitlegt
 *    mag blijven staan. `codeZonderCommentaar()` haalt regelcommentaar (`--`) en
 *    blokcommentaar eruit vóór er gezocht wordt.
 *
 * De grendels uit CLAUDE.md, domeinregel 10 (A57), staan elk als eis: het
 * lidmaatschap en het archief via `lid_van_levende_groep()`, de schakelaar
 * `klassement_aan`, en de teamgroep die nooit een klassement heeft. De teamtoets
 * heeft per functie een eigen vorm (`not exists … is not null` tegenover
 * `and g.organization_id is null`), en `mijn_klassementen()` toetst automatisch
 * gevormde groepen zelf waar `groep_klassement()` op de CHECK leunt.
 */
const GEDEELDE_POORT = [
  ['lid_van_levende_groep(', 'de poort voor lidmaatschap en archief (A57, 0333)'],
  ['klassement_aan', 'de schakelaar op de groep (A57, 0333)'],
  ["status <> 'inactive'", 'een uitgezet lid telt niet mee'],
];

export const KLASSEMENTPOORT = {
  functies: {
    groep_klassement: [
      ...GEDEELDE_POORT,
      ['organization_id is not null', 'de teamtoets: een teamgroep heeft nooit een klassement'],
    ],
    mijn_klassementen: [
      ...GEDEELDE_POORT,
      ['g.organization_id is null', 'de teamtoets: een teamgroep heeft nooit een klassement'],
      ['not g.automatisch', 'een automatisch gevormde groep heeft nooit een klassement'],
    ],
  },
  magNiet: [
    ['open_groep', 'de poort van A54 — het klassement hangt niet meer aan open'],
    ['zichtbaarheid', 'de zichtbaarheid van de groep — sinds A57 niet meer de poort'],
  ],
};

/**
 * Haalt SQL-commentaar uit een functiedefinitie.
 *
 * ⚠️ Een `--` binnen een stringliteral wordt hier ook geknipt. Dat is de
 *    voorzichtige kant: hooguit verdwijnt er een stuk tekst, en een eis die
 *    daardoor wegvalt maakt de toets rood, niet groen.
 */
export function codeZonderCommentaar(definitie) {
  return definitie.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Toetst één definitie tegen de poort van die functie in `KLASSEMENTPOORT`.
 *
 * @param {string} functie `groep_klassement` of `mijn_klassementen`
 * @param {string} definitie de functiedefinitie, mét commentaar
 * @returns {string[]} de bezwaren; leeg als de poort klopt
 */
export function klassementpoort(functie, definitie, poort = KLASSEMENTPOORT) {
  const moet = poort.functies[functie];
  if (!moet) return [`\`${functie}()\` heeft geen poort in KLASSEMENTPOORT`];
  if (!definitie || !definitie.trim()) {
    return [`\`${functie}()\` bestaat niet — de poort is niet te toetsen`];
  }
  const code = codeZonderCommentaar(definitie).toLowerCase().replace(/\s+/g, ' ');
  return [
    ...moet
      .filter(([term]) => !code.includes(term))
      .map(([term, reden]) => `${functie}: mist \`${term}\`: ${reden}`),
    ...poort.magNiet
      .filter(([term]) => code.includes(term))
      .map(([term, reden]) => `${functie}: filtert op \`${term}\`: ${reden}`),
  ];
}

function klassementvraag(functie) {
  return `
select coalesce(string_agg(pg_get_functiondef(p.oid), E'\\n'), '')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = '${functie}';
`;
}

/**
 * Alles wat `groups.zichtbaarheid` of een van de open-groephulpfuncties noemt.
 *
 * ⚠️ Beide zoektermen, niet één. Zie de kop: op de kolom filteren zonder de
 *    helper is de valse negatief waar dit soort controle aan kapotgaat.
 */
const VRAAG = `
select 'functie:' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosrc like '%open_groep%' or p.prosrc like '%zichtbaarheid%')
union all
select 'policy:' || tablename || '.' || policyname
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || coalesce(with_check, '')) similar to '%(open\\_groep|zichtbaarheid)%'
union all
select 'view:' || viewname
from pg_views
where schemaname = 'public'
  and (definition like '%open_groep%' or definition like '%zichtbaarheid%')
order by 1;
`;

export function ontleed(uitvoer) {
  return uitvoer
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * Legt de gevonden plekken naast de twee registers — tweezijdig.
 *
 * `onbekend`  — noemt zichtbaarheid en staat in geen van beide lijsten.
 * `verdwenen` — staat in een register maar bestaat niet meer.
 */
export function beoordeel(gevonden, oppervlakken = OPPERVLAKKEN, geen = GEEN_OPPERVLAK) {
  const gezien = new Set(gevonden);
  const bekend = new Set([...oppervlakken.keys(), ...geen.keys()]);

  return {
    onbekend: gevonden.filter((p) => !bekend.has(p)),
    verdwenen: [...bekend].filter((p) => !gezien.has(p)),
  };
}

function psql(vraag) {
  return execFileSync('psql', psqlArgumenten(vraag), { encoding: 'utf8' });
}

function hoofd() {
  let gevonden;
  const definities = {};
  try {
    gevonden = ontleed(psql(VRAAG));
    for (const functie of Object.keys(KLASSEMENTPOORT.functies)) {
      definities[functie] = psql(klassementvraag(functie));
    }
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'zichtbaarheid-controle',
        leest:
          'Deze controle leest `pg_proc`, `pg_policies` en `pg_views`, niet de\n' +
          'migratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const { onbekend, verdwenen } = beoordeel(gevonden);
  const poortbezwaren = Object.entries(definities).flatMap(([functie, definitie]) =>
    klassementpoort(functie, definitie),
  );

  if (poortbezwaren.length > 0) {
    console.error('✗ de poort van het klassement klopt niet met A57:\n');
    for (const b of poortbezwaren) console.error(`    ${b}`);
    console.error(
      '\nSinds A57 (QS8-666) hangt het klassement aan `groups.klassement_aan`, niet\n' +
        'aan de zichtbaarheid. Een beschermde groep kan een klassement hebben; zie\n' +
        'CLAUDE.md, domeinregel 10, en rij 28 in `docs/decisions/002-domeinregel7-oppervlakken.md`.',
    );
    return 1;
  }

  if (onbekend.length > 0) {
    console.error(
      `✗ ${onbekend.length} plek(ken) noemen zichtbaarheid zonder classificatie:\n`,
    );
    for (const p of onbekend) console.error(`    ${p}`);
    console.error(
      '\nVarieert dit oppervlak wat een lid van een ánder ziet? Zet hem dan in\n' +
        'OPPERVLAKKEN — en lees `zichtbaarheid.open_uitleg` en\n' +
        '`bevestiging.groep_openzetten.uitleg` na: die zinnen sommen op wat er\n' +
        'opengaat, en met een vijfde oppervlak vertellen ze een deel van de\n' +
        'waarheid. Varieert hij niets, zet hem dan met de reden in GEEN_OPPERVLAK.',
    );
    return 1;
  }

  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} plek(ken) in het register bestaan niet meer:\n`);
    for (const p of verdwenen) console.error(`    ${p}`);
    console.error(
      '\nEen register dat achterloopt, geeft redenen voor code die weg is. Haal ze\n' +
        'eruit — en kijk of de toestemmingszin er nog een noemt die niet meer bestaat.',
    );
    return 1;
  }

  console.log(
    `zichtbaarheid-controle: ${OPPERVLAKKEN.size} oppervlakken variëren op ` +
      `\`groups.zichtbaarheid\`, en ${GEEN_OPPERVLAK.size} plekken noemen hem zonder er een te zijn. ` +
      'Het klassement filtert op de schakelaar (A57).',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
