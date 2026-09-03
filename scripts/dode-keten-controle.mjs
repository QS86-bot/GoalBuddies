#!/usr/bin/env node
/**
 * dode-keten-controle — de variant van regel 18 die geen kapot onderdeel heeft.
 *
 * `docs/ENGINEER-REVIEW.md` heeft sinds 21-08-2026 een rij met de titel "Drie
 * backend-issues op rij bleken geen enkele aanroeper te hebben". Die rij is
 * sindsdien twee keer bijgewerkt en staat inmiddels op vijf gevallen: QS8-47,
 * QS8-112, EPIC 9, `goals.status = 'missed'` (0082) en `scope_reduced` /
 * `milestone_dropped` in `goal_events` (0087). De rij eindigt met een suggestie
 * voor de review — "dat is statisch af te leiden" — en dit is dat.
 *
 * ⚠️ **Twee controles, want de vijf gevallen zijn twee soorten.**
 *
 *   1. **Een functie of trigger die niemand aanroept.** Dat is de vorm van
 *      QS8-47 en QS8-112: een stuk backend dat af is, getest, en waar geen
 *      enkele knop naartoe loopt.
 *   2. **Een CHECK-waarde die niemand schrijft.** Dat is de vorm van 0082 en
 *      0087: de kolom mág de waarde aannemen, er is code die erop rekent, en
 *      er is geen pad dat hem ooit zet. Allebei die gevallen waren
 *      groepszichtbaar — een status die niemand kan bereiken, in een lijst waar
 *      de UI en de policies wél op vertrouwen.
 *
 * ⚠️ **Wat deze controle níét vindt, en dat hoort er expliciet bij te staan.**
 *    EPIC 9 was een trigger die netjes aan een tabel hing en dus een aanroeper
 *    hád; hij wachtte op een status die niets ooit zette. Dat is een dode keten
 *    op wáárde-niveau binnen een functie, en die is hier niet uit af te leiden.
 *    Controle 2 dekt de helft daarvan (de waarde in een CHECK), niet het geval
 *    waarin de waarde alleen in een `if` staat. De vraag uit onwrikbare regel 18
 *    blijft het gereedschap: *kan een gebruiker hier daadwerkelijk bij, en langs
 *    welke knop?*
 *
 * ⚠️ **Tests en scripts tellen niet als aanroeper, en dat is de kern.** Bij
 *    EPIC 9 stonden er tests omheen die het losse gedrag bewezen. Zou een test
 *    als bereikbaarheid tellen, dan was juist dát geval groen geweest. Wat telt
 *    is `src/`, `app/` en `supabase/functions/` — en binnen de database een
 *    trigger, een policy, een view, een default of een andere functie.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Waarden waarvan de tekstzoektocht een treffer geeft die bij een ándere tabel
 * hoort.
 *
 * ⚠️ **De schrijverstoets hieronder is tabelblind, en dat is op 27-08-2026 een
 *    gemeten valse negatief geworden.** Hij zoekt `'waarde'` in álle
 *    bronbestanden en weet niet bij welke tabel die treffer hoort. Voor
 *    `points_ledger.reason = 'milestone_done'` betekende dat: nergens geboekt,
 *    maar `chat_messages.system_event` kent dezelfde naam en die staat wél in
 *    `src/modules/buddies/chat-schemas.ts` — dus de controle zweeg.
 *
 * ⚠️ **En het is geen eenmalig geval.** Veertien CHECK-waarden komen in meer dan
 *    één tabel voor (`active`, `approved`, `archived`, `done`, `todo`, …), dus
 *    voor elk daarvan is het antwoord "er is een schrijver" onbetrouwbaar. Een
 *    algemene oplossing vraagt dat de bron zegt bij welke tabel een string hoort,
 *    en dat zegt hij niet. Zie de rij van 27-08 in `docs/ENGINEER-REVIEW.md`.
 *
 *    Wat hier staat is de gerichte versie: een waarde in deze lijst slaat de
 *    tekstzoektocht over en telt als dood, waarna `BEWUST_ONGESCHREVEN` beslist
 *    of dat erg is. Zo blijft de treffer van een ándere tabel geen alibi.
 *
 * @type {Record<string, string>}
 */
export const TREFFER_HOORT_ELDERS = {
  'points_ledger.reason=milestone_done':
    'De treffer komt uit `chat_messages.system_event`, waar `milestone_done` een ' +
    'systeembericht is dat `meld_mijlpaal()` schrijft. Als puntenreden boekt ' +
    'niemand hem: de vijf schrijvers van `points_ledger` zijn ' +
    '`award_points_on_approval` (floor, ceiling, review_given), de rollover-job ' +
    '(cycle_missed) en `trek_goedkeuring_in` (correction).',
};

/**
 * Waarden die bewust nog niet geschreven worden, met de reden en de voorwaarde
 * die ze weer interessant maakt.
 *
 * ⚠️ **Dit is een lijst met redenen en geen lijst met namen.** Wie hier iets aan
 *    toevoegt zonder de tweede helft in te vullen, heeft de controle uitgezet in
 *    plaats van beantwoord. Dezelfde vorm als `Wordt zwaarder als:` in
 *    `docs/ENGINEER-REVIEW.md`, en om dezelfde reden: een uitzondering die zijn
 *    houdbaarheidsdatum niet noemt, verloopt zonder dat iemand het merkt.
 *
 * @type {Record<string, string>}
 */
export const BEWUST_ONGESCHREVEN = {
  'reports.status=reviewed':
    'Wacht op een moderatieproces, dat als `phase:v3` op het bord staat (QS8-232). ' +
    '⚠️ Vandaag is `reports_update` `using (false)` voor élke client, dus deze ' +
    'waarde is ook niet te schrijven — de kolom bestaat vooruitlopend en niet ' +
    'half. **Wordt interessant zodra er iemand of iets is dat meldingen ' +
    'beoordeelt.** Is dat er dan nog steeds niet, dan hoort de waarde weg zoals ' +
    'in 0082 en 0087, en `status` met hem — een kolom met één bereikbare waarde ' +
    'is geen kolom.',
  'reports.status=dismissed':
    'Idem als `reviewed` (QS8-232): wacht op een moderatieproces (`phase:v3`), ' +
    'is vandaag voor geen enkele client schrijfbaar, en **wordt interessant ' +
    'zodra er iemand of iets is dat meldingen beoordeelt.** Is dat er dan nog ' +
    'niet, dan hoort de waarde weg.',
  'chat_messages.type=photo':
    'Wacht op Storage-buckets, die er nog niet zijn (QS8-71, Fase 2). ⚠️ De ' +
    'waarde is vandaag ' +
    'wél door een client te schrijven — kolomrecht en policy staan open — dus ' +
    'een bericht kan `photo` heten met een gewone tekst erin. Wordt een defect ' +
    'zodra de chat op `type` gaat renderen.',
  'chat_messages.type=doc':
    'Idem als `photo` (QS8-72, Fase 2), en met dezelfde open schrijfkant.',
  'points_ledger.reason=milestone_done':
    // ⚠️ `goal_done` stond hier tot 31-08 naast, met dezelfde reden. Hij is in
    //    migratie 0132 geschrapt na een besluit van Quinten; deze bleef staan
    //    omdat het een tweede besluit is (telt een mijlpaal apart mee?) en dit
    //    project één besluit per keer neemt. Zie QS8-215.
    'Zelfde geval als het geschrapte `goal_done` en waarschijnlijk hetzelfde ' +
    'besluit, maar nog niet genomen: mijlpalen voeden de ' +
    'vóórtgang en niet de score, en domeinregel 10 zegt dat dat twee dingen ' +
    'zijn. Kwam pas op 27-08 bovendrijven omdat de tekstzoektocht een treffer ' +
    'uit `chat_messages` als schrijver las — zie `TREFFER_HOORT_ELDERS`.',
};

/**
 * Functies die per ontwerp geen pad door de app hebben — bewakingen en ops.
 *
 * ⚠️ **Dit is de enige categorie waar de EPIC 9-regel niet geldt, en er is een
 *    scherpe reden voor.** Die regel — tests en scripts tellen niet als
 *    aanroeper — bestaat omdat een feature met alleen tests eromheen een feature
 *    is waar geen knop heen loopt. Een bewaking ís geen feature: hij bestaat om
 *    in `/audit` en in de RLS-suite nul rijen terug te geven. Er hóórt geen knop
 *    naartoe, en er komt er ook nooit een.
 *
 * ⚠️ **Maar een naam op deze lijst zet de controle níét uit.** Het script
 *    verifieert dat er in `tests/` of `scripts/` daadwerkelijk een aanroep staat.
 *    Staat die er niet, dan wordt de functie alsnog gemeld — met een andere
 *    reden. Anders is dit een lijst waarop je een dode functie kunt parkeren, en
 *    dat is precies wat deze controle moet vinden.
 *
 *    Dat is meteen gebleken: `functie_vingerafdrukken()` stond er met de reden
 *    "de test is de aanroeper", en er was geen test — zijn aanroeper is
 *    `scripts/functies-controle.mjs`. De lijst corrigeerde zijn eigen reden.
 *
 * ⚠️ Ook hier: een lijst met redenen en geen lijst met namen. Zelfde vorm als
 *    `BEWUST_ONGESCHREVEN`.
 *
 * @type {Record<string, string>}
 */
export const BEWAAKT_BUITEN_DE_APP = {
  ddl_rechten_in_de_api:
    'Bewaking op DDL-rechten via de API. Draait in `/audit` en in de RLS-suite.',
  ddl_rechten_van_service_role:
    'Idem, voor `service_role`.',
  functie_vingerafdrukken:
    'Vergelijkt de gedeployde functies met de migraties. Aanroeper is ' +
    '`scripts/functies-controle.mjs`, die in `/audit` draait.',
  functies_voor_authenticated:
    'De grendel onder 0115: welke functies `authenticated` mag uitvoeren. Zonder ' +
    'test is die grant een aanname.',
  indexdekking_bewaking:
    'Onwrikbare regel 11 — index op elke FK en elke WHERE/ORDER BY-kolom.',
  initplan_bewaking:
    'De grendel onder 0119: geen enkele policy met een kale `auth.uid()`.',
  intrekvenster_bewaking:
    'Het intrekvenster staat op één plek; deze bewaking maakt dat leesbaar.',
  onveranderlijkheid_bewaking:
    'Domeinregel 6 — voltooiingen en reeksen zijn append-only.',
  tekstgrenzen_bewaking:
    'De grendel onder 0120: elke schrijfbare tekstkolom heeft een lengtegrens.',
  ai_kosten_per_week:
    'Wat de Doelcoach kost, over álle gebruikers samen — één rekening bij ' +
    'Anthropic. Bewust niet voor `authenticated`: het totaal verraadt hoeveel ' +
    'anderen de coach gebruiken.',
  ai_verbruik:
    'Het dagverbruik van één gebruiker, voor de meldingen en de tests.',
  check_waarden:
    'Leest de CHECK-waarden uit het schema, zodat de app-lijsten ernaast gelegd ' +
    'kunnen worden (0082). Zonder deze functie vergelijkt zo\'n test zichzelf.',
  definer_bewaking:
    'SECURITY DEFINER-functies zonder `set search_path` of open voor `anon` (0106).',
  schrijfrechten_bewaking:
    'Schrijfrechten voor `anon` of `authenticated` waar geen policy bij hoort ' +
    '(0101, generiek sinds 0118).',
  domeinregel3_bewaking:
    'De drie sloten op peer-goedkeuring: policy, constraint en trigger (0093).',
  bewijseis_allowlist:
    'De waarden uit de CHECK `groups_evidence_policy_valid` (0150). Aanroeper is ' +
    '`tests/rls/bewijseis.test.ts`, dat `BEWIJSEISEN` ernaast legt — een ' +
    'gelijkheidstoets, dus rood ongeacht welke kant het eerst verandert. Zonder ' +
    'zo\'n functie vergelijkt zo\'n test zichzelf, en dat is precies wat er bij ' +
    '0032 misging (QS8-261).',
  archiefleesgat:
    'Policies die aan de verkeerde kant van de lees/schrijf-splitsing van 0153 ' +
    'staan. Hoort leeg te zijn. Aanroeper is ' +
    '`tests/rls/archief-leesbaar.test.ts`. ⚠️ Tweezijdig, en de tweede richting ' +
    'is de gevaarlijke: een SELECT-policy die een archief nog uitsluit is een ' +
    'gemis, een schrijfpolicy die er een doorlaat is een lek.',
  barrierelezers:
    'Welke functies `group_visible_streaks` lezen (0151). Hoort leeg te zijn. ' +
    'Aanroeper is `tests/rls/reeksen-van-een-groep.test.ts`. ⚠️ Dit is de énige ' +
    'grendel op de réden van 0151: alle andere tests daar toetsen dat de twee ' +
    'paden hetzelfde géven, en dat blijft waar als iemand de dure join naar de ' +
    'barrière-view terugzet. Gemeten: die terugzetting maakt nul van de elf ' +
    'andere tests rood.',
  alleenlezen_bewaking:
    'Welke policyhelften letterlijk `false` zijn terwijl `authenticated` het ' +
    'recht wél heeft (0148). Aanroeper is `tests/rls/alleenlezen.test.ts`, dat ' +
    'zijn fixtures ernaast legt en rood wordt zodra de twee uiteenlopen — in ' +
    'béide richtingen.',
  migratieregister:
    'Het register van het échte project, voor `register:controle`.',
  triggerfuncties_in_de_api:
    'Triggerfuncties die per ongeluk via PostgREST aanroepbaar zijn (0052a).',
  viewrechten_bewaking:
    'Kolomrechten op de views, want RLS kan geen kolommen beperken.',
  herstel_weekdoelstatus:
    '⚠️ Geen bewaking maar de herstelweg ernaast: `weekdoelstatus_afwijkingen()` ' +
    'meldt drift in de statuscache en deze zet hem terug (0096). Met de hand ' +
    'aan te roepen wanneer die eerste iets meldt; `tests/rls/statuscache.test.ts` ' +
    'is de aanroeper die bewijst dat hij werkt.',
  uitnodigingscode_bewaking:
    'De sterkte van `generate_invite_code()` — alfabet, lengte en de drempel ' +
    'tegen modulo-bias — uitleesbaar, zodat `policies.test.ts` hem kan bewaken.',
  lijn_migratieregister_uit:
    'Lijnt het migratieregister uit na een MCP-apply (DEPLOY.md §2.2). ' +
    'Aanroeper is `scripts/migratieregister-uitlijnen.mjs`; een knop hiervoor ' +
    'in de app zou een ontwikkelhandeling in productie zetten.',
};

/**
 * Functies zonder aanroeper waarvan het verdict een productvraag is.
 *
 * ⚠️ **Een derde categorie, en er is een scherpe reden dat hij niet bij de vorige
 *    hoort.** `BEWAAKT_BUITEN_DE_APP` zegt *"deze functie hóórt geen pad door de
 *    app te hebben"*, en het script bewijst dat met een aanroeper in `tests/` of
 *    `scripts/`. Wat hier staat is het tegenovergestelde: een functie die een pad
 *    zou moeten hébben en er geen heeft, waarbij de vraag *of hij dat pad moet
 *    krijgen of moet verdwijnen* niet aan een opruimronde is.
 *
 * ⚠️ **Dit is dus geen parkeerplaats maar een agenda**, en elke regel draagt de
 *    vráág en niet alleen de constatering — zelfde vorm als
 *    `Wordt zwaarder als:` in `docs/ENGINEER-REVIEW.md`. Wie hier iets neerzet
 *    zonder de vraag op te schrijven, heeft de controle uitgezet.
 *
 * @type {Record<string, string>}
 */
export const WACHT_OP_EEN_BESLUIT = {
};

/** Bestanden waarin een aanroep als "productie" telt. Tests en scripts niet. */
const PRODUCTIEMAPPEN = ['src', 'app', 'supabase/functions'];

function bronbestanden(dir, uit = [], vorm = /\.(ts|tsx)$/) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam === '.git') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bronbestanden(pad, uit, vorm);
    else if (vorm.test(naam)) uit.push(pad);
  }
  return uit;
}

/**
 * Alle functienamen die een migratie definieert.
 *
 * ⚠️ `drop function ... ; create or replace function ...` is hier de normale
 *    vorm van een idempotente migratie — 71 van de 99 functies staan zo in het
 *    bestand. Een `drop` betekent dus niet dat de functie weg is.
 */
export function functiesIn(sql) {
  // ⚠️ **In volgorde verwerken en `drop function` honoreren.** Zonder dat telt
  //    élke `create ... function` mee, ook van een functie die een latere
  //    migratie heeft weggegooid — en die verschijnt dan als "dood" terwijl hij
  //    niet bestáát. `markeer_doorgeschoven()` is in 0091 verwijderd en werd zo
  //    gemeld. Vals alarm, en precies het soort melding waardoor je een script
  //    uitzet. `checksIn()` deed dit voor constraints al goed; hier stond het
  //    patroon niet.
  //
  // ⚠️ **De regel is "het laatste woord telt", en dat is met opzet grover dan
  //    de handtekening.** `drop function f(a) ; create function f(a, b)` is in
  //    dit project de normale vorm van een migratie die de vorm van een functie
  //    wijzigt — 71 van de 99 functies staan zo in het bestand. Voor de vraag
  //    die hier gesteld wordt (*bestaat deze náám nog en roept iemand hem aan*)
  //    is de naam het juiste niveau: blijft er één overload over, dan is er iets
  //    om aan te roepen. Voor de vraag of een dróp de goede overload raakt, is
  //    de handtekening wél nodig — die staat in `tests/migraties/idempotentie.ts`.
  const namen = new Set();
  const gebeurtenissen = [];

  for (const m of sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
  )) {
    gebeurtenissen.push({ index: m.index ?? 0, naam: m[1].toLowerCase(), maakt: true });
  }
  for (const m of sql.matchAll(
    /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi,
  )) {
    gebeurtenissen.push({ index: m.index ?? 0, naam: m[1].toLowerCase(), maakt: false });
  }

  gebeurtenissen.sort((a, b) => a.index - b.index);
  for (const g of gebeurtenissen) {
    if (g.maakt) namen.add(g.naam);
    else namen.delete(g.naam);
  }

  return namen;
}

/**
 * De SQL zonder alles wat een functie *over* zichzelf zegt, zodat een functie niet
 * zijn eigen aanroeper wordt.
 *
 * ⚠️ `public.` gaat er hier af. De eerste versie van deze controle miste acht
 *    functies omdat de aanroep `execute function public.noteer_commitment()`
 *    luidt en de negatieve lookbehind op `.` die wegfilterde. Alle acht waren
 *    vals alarm, en dat is precies het soort controle dat je leert negeren.
 *
 * ⚠️ **En sinds 28-08 gaan `grant`, `revoke`, `comment on` en `alter function`
 *    er ook af, want dáár zat de blinde vlek.** Bijna élke functie in dit project
 *    draagt twee regels: `revoke all on function public.f(...)` en
 *    `grant execute on function public.f(...) to ...`. Allebei bevatten `f(`, dus
 *    het aanroeppatroon sloeg erop aan en was iedere functie per definitie
 *    "levend". Het script meldde maandenlang nul — niet omdat er niets dood was,
 *    maar omdat hij niets kón vinden. Dat is dezelfde vorm als bij
 *    `tekst:controle` (QS8-115): een controle die nooit rood is geweest, is een
 *    aanname.
 *
 *    Gevonden door de controleronde van 28-08, die drie datalaagfuncties zonder
 *    één aanroeper vond terwijl dit script groen stond.
 */
export function zonderDefinities(sql) {
  return sql
    // ⚠️ **Commentaar eerst, en dat is op 28-08 gemeten.** Een migratiekop legt
    //    uit wát een functie doet en noemt hem daarbij mét haakjes — en dan
    //    telde de uitleg als de aanroeper. Het overkwam deze sessie zelf: een
    //    ⚠️-regel in 0122 noemde `initplan_bewaking()`, waarna de controle die
    //    functie levend noemde. Dezelfde klasse als de grant-regels hieronder:
    //    de tekst óver een functie is geen gebruik ervan.
    //
    //    Met commentaar eruit meldde het script dertien functies in plaats van
    //    nul. Elf daarvan zijn bewakingen en ops-functies en staan nu op
    //    `BEWAAKT_BUITEN_DE_APP`; één was een echte vondst (`weekpas_stand`,
    //    verwijderd in 0124) en één bestond helemaal niet meer — zie
    //    `functiesIn()` hieronder.
    .replace(/--[^\n]*/g, ' ')
    .replace(/\bpublic\./gi, '')
    .replace(/create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_]+)\s*\(/gi, ' ')
    .replace(/drop\s+function\s+(?:if\s+exists\s+)?[a-z0-9_]+[^;]*;/gi, ' ')
    // ⚠️ Alles wat een recht of een toelichting op een functie zet. `[^;]*`
    //    stopt bij de eerste puntkomma, en die staat in geen van deze vier
    //    vormen binnenin.
    .replace(/\b(?:grant|revoke)\b[^;]*?\bon\s+function\b[^;]*;/gi, ' ')
    .replace(/comment\s+on\s+function\b[^;]*;/gi, ' ')
    .replace(/alter\s+function\b[^;]*;/gi, ' ');
}

/** De namen die `src/`, `app/` en `supabase/functions/` via `.rpc()` aanroepen. */
export function rpcAanroepenIn(bron) {
  const namen = new Set();
  for (const m of bron.matchAll(/\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/gi)) {
    namen.add(m[1].toLowerCase());
  }
  return namen;
}

/**
 * Of `naam` ergens als functieaanroep in `bron` voorkomt.
 *
 * ⚠️ Alleen bedoeld als bewijs bij `BEWAAKT_BUITEN_DE_APP`, nooit als bewijs van
 *    leven — zie de toelichting in `controleer()`.
 */
export function genoemdIn(bron, naam) {
  return new RegExp(`(?<![a-z0-9_])${naam}(\\s*\\(|['"\`])`, 'i').test(bron);
}

/** Functies zonder enige aanroeper — niet in de database, niet in productiecode. */
export function functiesZonderAanroeper({ sql, prodBron }) {
  const gedefinieerd = functiesIn(sql);
  const romp = zonderDefinities(sql);
  const rpc = rpcAanroepenIn(prodBron);

  const dood = [];
  for (const naam of gedefinieerd) {
    if (rpc.has(naam)) continue;
    if (new RegExp(`(?<![a-z0-9_])${naam}\\s*\\(`, 'i').test(romp)) continue;
    dood.push(naam);
  }
  return dood.sort();
}

/**
 * Het CHECK-landschap zoals de migraties het achterlaten.
 *
 * ⚠️ **In volgorde verwerken en `drop constraint` honoreren.** De verkenning
 *    vond `goals_risk_status_valid` als dode constraint, maar die bestaat al
 *    sinds 0050 niet meer — de risicokolommen zijn toen naar `goal_risk`
 *    verhuisd. Een controle die alleen naar het laatste `check (...)` kijkt,
 *    meldt constraints die er niet zijn, en dat is dezelfde valse-alarmklasse
 *    als hierboven.
 */
export function checksIn(bestanden) {
  const huidig = new Map();

  for (const { naam, sql } of bestanden) {
    for (const m of sql.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi)) {
      huidig.delete(m[1].toLowerCase());
    }

    // ⚠️ Een kolom die weggaat, neemt zijn CHECK mee. 0050 verhuisde de
    //    risicokolommen naar `goal_risk` met `drop column` en liet
    //    `goals_risk_status_valid` daarmee verdwijnen zonder hem ooit bij naam
    //    te noemen. De eerste versie van deze controle meldde die constraint
    //    dus als dood terwijl hij al maanden niet meer bestond.
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z0-9_]+)[\s\S]*?drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi,
    )) {
      const [, tabel, kolom] = [m[0], m[1].toLowerCase(), m[2].toLowerCase()];
      for (const [cnaam, c] of huidig) {
        if (c.tabel === tabel && c.kolom === kolom) huidig.delete(cnaam);
      }
    }

    for (const m of sql.matchAll(/constraint\s+([a-z0-9_]+)\s+check\s*\(/gi)) {
      const body = haakjesBlok(sql, m.index + m[0].length - 1);
      if (body === null) continue;
      const kolom = /^\s*\(?\s*([a-z0-9_]+)/i.exec(body)?.[1]?.toLowerCase() ?? null;
      const waarden = [...new Set([...body.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]))];
      if (waarden.length < 2) continue;
      huidig.set(m[1].toLowerCase(), {
        bestand: naam,
        tabel: tabelVoor(sql, m.index),
        kolom,
        waarden,
        body,
      });
    }
  }
  return huidig;
}

/**
 * De tabel waar de constraint op `positie` bij hoort: de dichtstbijzijnde
 * `create table` of `alter table` erboven.
 *
 * ⚠️ Niet uit de constraintnaam afleiden. `groups_approval_rule_valid` levert
 *    met elke denkbare afkapregel `groups_approval` op in plaats van `groups`,
 *    en dan zoekt de uitzonderingenlijst naar een sleutel die niemand ooit
 *    intikt.
 */
function tabelVoor(sql, positie) {
  const ervoor = sql.slice(0, positie);
  const treffers = [
    ...ervoor.matchAll(/(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+|only\s+)?(?:public\.)?([a-z0-9_]+)/gi),
  ];
  return treffers.length ? treffers[treffers.length - 1][1].toLowerCase() : null;
}

/** Het blok vanaf het openingshaakje op `start`, haakjes meetellend. */
function haakjesBlok(tekst, start) {
  let diepte = 0;
  for (let i = start; i < tekst.length; i++) {
    if (tekst[i] === '(') diepte++;
    else if (tekst[i] === ')') {
      diepte--;
      if (diepte === 0) return tekst.slice(start + 1, i);
    }
  }
  return null;
}

/** De SQL met alle CHECK-bodies eruit, zodat een waarde niet zijn eigen schrijver is. */
export function zonderChecks(sql) {
  let uit = '';
  let i = 0;
  const re = /check\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const body = haakjesBlok(sql, m.index + m[0].length - 1);
    if (body === null) continue;
    uit += sql.slice(i, m.index);
    i = m.index + m[0].length + body.length + 1;
    re.lastIndex = i;
  }
  return uit + sql.slice(i);
}

/** CHECK-waarden die geen enkel pad ooit schrijft. */
/**
 * @param {{
 *   bestanden: { naam: string, sql: string }[],
 *   prodBron: string,
 *   elders?: Record<string, string>,
 * }} invoer
 */
export function waardenZonderSchrijver({ bestanden, prodBron, elders = TREFFER_HOORT_ELDERS }) {
  const checks = checksIn(bestanden);
  const romp = zonderChecks(bestanden.map((b) => b.sql).join('\n'));

  const dood = [];
  for (const [naam, c] of checks) {
    const tabel = c.tabel;
    for (const waarde of c.waarden) {
      const rij = { constraint: naam, kolom: c.kolom, waarde, bestand: c.bestand, tabel };

      // ⚠️ Eerst het register, dán de tekstzoektocht. Staat de waarde hier, dan
      //    is een treffer elders geen bewijs — zie `TREFFER_HOORT_ELDERS`.
      if (sleutelVan(rij) in elders) {
        dood.push(rij);
        continue;
      }

      if (new RegExp(`['"\`]${waarde}['"\`]`).test(prodBron)) continue;
      if (new RegExp(`'${waarde}'`).test(romp)) continue;
      dood.push(rij);
    }
  }
  return dood;
}

/** De sleutel waaronder een dode waarde in `BEWUST_ONGESCHREVEN` staat. */
export function sleutelVan({ tabel, kolom, waarde }) {
  return `${tabel}.${kolom}=${waarde}`;
}

/**
 * @param {{
 *   bestanden: { naam: string, sql: string }[],
 *   prodBron: string,
 *   testBron?: string,
 *   bewust?: Record<string, string>,
 *   bewaakt?: Record<string, string>,
 *   wacht?: Record<string, string>,
 * }} invoer
 */
export function controleer({
  bestanden,
  prodBron,
  testBron = '',
  bewust = BEWUST_ONGESCHREVEN,
  bewaakt = BEWAAKT_BUITEN_DE_APP,
  wacht = WACHT_OP_EEN_BESLUIT,
}) {
  const sql = bestanden.map((b) => b.sql).join('\n');
  const alleZonder = functiesZonderAanroeper({ sql, prodBron });

  // ⚠️ Een naam op `bewaakt` zet de controle niet uit: de aanroeper buiten de app
  //    moet er ook echt zijn. Zonder deze splitsing is dit een lijst waarop je
  //    een dode functie parkeert, en dat is precies wat deze controle moet vinden.
  //
  // ⚠️ Hier telt élke vermelding en niet alleen `.rpc('naam')`, en dat is geen
  //    slordigheid maar het verschil in wat er bewezen wordt. Aan de productiekant
  //    gaat het om "loopt hier een pad heen" en dan is de vorm van de aanroep het
  //    bewijs. Hier gaat het om "kijkt er iets buiten de app naar", en dat doen
  //    deze twee allebei ánders: `functies-controle.mjs` doet een kale `fetch()`
  //    op `/rest/v1/rpc/…` én een `select` via psql, en
  //    `migratieregister-uitlijnen.mjs` heeft een eigen `rpc()`-hulpje. Een
  //    strenge vorm meldde die twee als ongetest terwijl ze allebei in `/audit`
  //    draaien — vals alarm, en dat is precies wat je leert negeren.
  const functies = alleZonder.filter((naam) => !(naam in bewaakt) && !(naam in wacht));

  // ⚠️ Ook deze lijst loopt achter zodra de vraag beantwoord is: een naam die
  //    inmiddels een aanroeper heeft, hoort eraf. Zelfde vorm als `verouderd`.
  const beslistVerouderd = Object.keys(wacht).filter((naam) => !alleZonder.includes(naam));
  const beloofdMaarOngetest = alleZonder.filter(
    (naam) => naam in bewaakt && !genoemdIn(testBron, naam),
  );

  // ⚠️ En de andere kant, net als bij `verouderd` hieronder: een naam op de
  //    lijst die inmiddels een echte aanroeper heeft, hoort eraf.
  const bewaaktVerouderd = Object.keys(bewaakt).filter((naam) => !alleZonder.includes(naam));
  const alleDood = waardenZonderSchrijver({ bestanden, prodBron });
  const dood = new Set(alleDood.map(sleutelVan));

  return {
    functies,
    beloofdMaarOngetest,
    bewaaktVerouderd,
    beslistVerouderd,
    waarden: alleDood.filter((w) => !(sleutelVan(w) in bewust)),
    // ⚠️ **De andere kant van het register, en die ontbrak.** Een uitzondering
    //    die niet meer nodig is, valt stil buiten beeld: de filter hierboven
    //    haalt hem weg, dus de controle blijft groen en de réden blijft staan.
    //    Op 28-08 waren er twee zo — `approval_rule=majority` (QS8-65 bouwde
    //    hem) en `season_cadence=monthly` (QS8-79, een paar uur later). Beide
    //    beweerden dat de feature niet bestond terwijl hij er stond.
    //
    // ⚠️ Dezelfde vorm als `verdwenen` in `zichtbaarheid-controle` en
    //    `klokgrens-controle`: een register dat achterloopt geeft redenen voor
    //    een toestand die er niet meer is, en dat is erger dan geen register —
    //    want wie het leest, leest de stand van zaken verkeerd.
    verouderd: Object.keys(bewust).filter((sleutel) => !dood.has(sleutel)),
  };
}

function hoofd() {
  const migMap = join(WORTEL, 'supabase/migrations');
  const bestanden = readdirSync(migMap)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((naam) => ({ naam, sql: readFileSync(join(migMap, naam), 'utf8') }));

  const prodBron = PRODUCTIEMAPPEN.flatMap((m) => bronbestanden(join(WORTEL, m)))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');

  // ⚠️ Apart van `prodBron` en met opzet: een aanroep uit `tests/` of `scripts/`
  //    maakt een functie níét levend (de les van EPIC 9). Hij telt alleen als
  //    bewijs bij een naam op `BEWAAKT_BUITEN_DE_APP`.
  const testBron = ['tests', 'scripts']
    .flatMap((m) => bronbestanden(join(WORTEL, m), [], /\.(ts|tsx|mjs)$/))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');

  const {
    functies,
    beloofdMaarOngetest,
    bewaaktVerouderd,
    beslistVerouderd,
    waarden,
    verouderd,
  } = controleer({
    bestanden,
    prodBron,
    testBron,
  });

  if (
    functies.length === 0 &&
    beloofdMaarOngetest.length === 0 &&
    bewaaktVerouderd.length === 0 &&
    beslistVerouderd.length === 0 &&
    waarden.length === 0 &&
    verouderd.length === 0
  ) {
    const aantal = functiesIn(bestanden.map((b) => b.sql).join('\n')).size;
    const buiten = Object.keys(BEWAAKT_BUITEN_DE_APP).length;
    const wachtend = Object.keys(WACHT_OP_EEN_BESLUIT).length;
    // ⚠️ Drie getallen en geen één. Eén totaal maakt de tweede en derde groep
    //    onzichtbaar, en zo is de blinde vlek van 28-08 ontstaan: alles telde
    //    als "levend" en niemand kon zien waaróm.
    console.log(
      `dode-keten-controle: ${aantal} functies hebben allemaal een verdict — ` +
        `${aantal - buiten - wachtend} met een pad door de app, ${buiten} bewakingen ` +
        `en ops-functies met een aanroeper in tests/ of scripts/, en ${wachtend} ` +
        `zonder pad waar het verdict een productvraag is. Elke CHECK-waarde ` +
        `wordt ergens geschreven of staat met reden op de lijst.`,
    );
    return 0;
  }

  for (const naam of functies) {
    console.error(
      `✗ ${naam}() wordt door niets aangeroepen — niet via .rpc() uit src/, app/ of ` +
        `supabase/functions/, en niet door een trigger, policy, view of andere functie.`,
    );
  }
  for (const naam of beloofdMaarOngetest) {
    console.error(
      `✗ ${naam}() staat op BEWAAKT_BUITEN_DE_APP ("de test of het script is de ` +
        `aanroeper"), maar er staat nergens in tests/ of scripts/ een aanroep. Een ` +
        `bewaking zonder aanroeper is een aanname — zet er een test op of haal hem ` +
        `van de lijst.`,
    );
  }
  for (const naam of beslistVerouderd) {
    console.error(
      `✗ ${naam}() staat op WACHT_OP_EEN_BESLUIT maar heeft inmiddels een ` +
        `aanroeper. De vraag is dus beantwoord — haal hem van de lijst.`,
    );
  }
  for (const naam of bewaaktVerouderd) {
    console.error(
      `✗ ${naam}() staat op BEWAAKT_BUITEN_DE_APP maar heeft inmiddels een echte ` +
        `aanroeper. Haal hem van de lijst, anders geeft het register een reden ` +
        `voor een toestand die er niet meer is.`,
    );
  }
  for (const w of waarden) {
    console.error(
      `✗ ${w.tabel}.${w.kolom} mag '${w.waarde}' zijn (${w.constraint}, ${w.bestand}), ` +
        `maar niets schrijft die waarde ooit.`,
    );
  }
  for (const sleutel of verouderd) {
    console.error(
      `✗ BEWUST_ONGESCHREVEN noemt '${sleutel}' een uitzondering, maar die waarde ` +
        `wordt inmiddels wél geschreven. Haal hem eruit.`,
    );
  }

  if (waarden.length > 0 || functies.length > 0) {
    console.error(
      '\nOfwel er ontbreekt een schrijfpad, ofwel de waarde hoort weg zoals in 0082 en ' +
        '0087. Is het bewust en tijdelijk: zet hem in BEWUST_ONGESCHREVEN mét de ' +
        'voorwaarde die hem weer interessant maakt.',
    );
  }
  if (verouderd.length > 0) {
    console.error(
      '\nEen verlopen uitzondering is geen kleinigheid: zolang hij blijft staan, zegt ' +
        'zijn reden dat de feature niet gebouwd is. Wie het register leest als de ' +
        'stand van zaken, leest dan iets dat niet meer klopt.',
    );
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
