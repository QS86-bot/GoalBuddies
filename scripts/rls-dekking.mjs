#!/usr/bin/env node
/**
 * Welke RLS-policy wordt door géén enkele test bewaakt? — QS8-185
 *
 * ⚠️ **Het issue zei dat dit niet te meten valt, en dat is precies de reden dat
 *    dit script bestaat.** De dossierrij van 15-08 vroeg welke tabellen nog
 *    ongedekt zijn, en het oordeel van 25-08 was: *"een oordeel over dekking en
 *    geen meetbare stand"*. Dat klopt voor de vraag "noemt een test deze tabel" —
 *    dat is een grep en die bewijst niets. Het klopt niet voor de vraag die
 *    ertoe doet:
 *
 *      **als ik deze policy wagenwijd openzet, wordt er dan iets rood?**
 *
 *    Dat is geen oordeel maar een meting, en het is dezelfde meting waarmee dit
 *    project elke andere grendel ijkt: mutatie per grendel. Een policy die je
 *    kunt slopen zonder dat één test het merkt, bewaakt niets — hoe vaak zijn
 *    tabel ook in de suite voorkomt.
 *
 * ⚠️ **Waarom `using (true)` en niet `drop policy`.** Droppen toetst of een test
 *    de tóégang mist; openzetten toetst of een test de wéigering mist. Dat
 *    tweede is de kant waar dit project op stukgaat — de vier routes naar een
 *    weggepoetste week, het lek in `weekly_goals_select`, de omweg van QS8-186.
 *    Een gedropte policy valt bovendien meteen op omdat de app niets meer kan;
 *    een te ruime policy valt nooit op.
 *
 * ⚠️ **Dit is een rapport en geen poortstap, en dat is met opzet.** Het draait
 *    tachtig keer een deel van de RLS-suite en kost minuten. Zet hem niet in
 *    `npm run poort`; draai hem als je wilt weten waar de suite gaten heeft, en
 *    maak van elke bevinding een test of een aantekening.
 *
 * ⚠️ **Hij weigert te draaien tegen iets anders dan de lokale stack.** Zie
 *    `magHierDraaien()`: lokale host, `RLS_DOEL=lokaal`, en de database moet
 *    `goalbuddies_rls` heten. De kop hieronder waarschuwde daar eerst alleen
 *    voor, en een waarschuwing is geen slot.
 *
 * ⚠️ **Hij verandert de database en zet hem daarna terug — en dat is bij de
 *    eerste echte run misgegaan.** Een `finally` helpt niet als het proces
 *    gedóód wordt: bij een afbreking op tien minuten bleef
 *    `group_members_insert_founder` op `with check (true)` staan, en de meting
 *    daarná draaide dus tegen een database met een gat erin. Die uitslag was
 *    onbruikbaar zonder dat er iets aan te zien was.
 *
 *    **Erger nog was hoe ik het bijna niet zag:** mijn controlevraag keek alleen
 *    naar `using`, niet naar `with check`, en meldde vrolijk "alles teruggezet".
 *    Een controle die de helft van zijn onderwerp niet kent, is geruststellender
 *    dan geen controle.
 *
 *    Daarom schrijft dit script vóór élke mutatie de oorspronkelijke definitie
 *    naar `.rls-dekking-herstel.json` en ruimt dat bestand pas op als alles
 *    terugstaat. Ligt het er bij de start nog, dan is een vorige run afgebroken
 *    en herstelt hij eerst — vóór hij iets meet.
 *
 * ⚠️⚠️ **En "er werd een test rood" is niet hetzelfde als "déze policy maakte
 *    hem rood".** Dat is de derde fout van deze soort op dit script, en alle
 *    drie gaan ze de geruststellende kant op: een gat komt eruit als bewaakt.
 *    Daarom meet hij de suite ook één keer vóór de eerste mutatie en één keer
 *    ná de laatste — wat toen al rood stond, en wat onderweg rood werd, telt
 *    niet als bewijs. Meting en geval staan bij `weegTegenBaseline()`.
 *
 * Gebruik:
 *   npm run rls:dekking              alle policies
 *   npm run rls:dekking -- goals     alleen tabellen waarvan de naam dit bevat
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const TESTMAP = join(WORTEL, 'tests', 'rls');

/**
 * ⚠️ **JSON en geen `-At` met een scheidingsteken.** Een policy-uitdrukking is
 *    opgemaakte SQL: hij bevat nieuwe regels én pijpjes (`a OR b`, een `EXISTS`
 *    over drie regels). Een regelgebaseerde parser knipt daar middenin, en de
 *    eerste versie van dit script deed dat ook — met als eerste slachtoffer
 *    `approval_withdrawals_select`. Postgres kan het zelf serialiseren, dus laat
 *    hem dat doen.
 */
const VRAAG = `
select coalesce(json_agg(json_build_object(
         'tabel',  c.relname,
         'naam',   p.polname,
         'cmd',    p.polcmd,
         'qual',   coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
         'wcheck', coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
         'recht',  case p.polcmd
                     -- ⚠️ DELETE bestaat niet per kolom; SELECT, INSERT en UPDATE wél.
                     when 'd' then has_table_privilege('authenticated', c.oid, 'DELETE')
                     when 'r' then has_any_column_privilege('authenticated', c.oid, 'SELECT')
                     when 'a' then has_any_column_privilege('authenticated', c.oid, 'INSERT')
                     when 'w' then has_any_column_privilege('authenticated', c.oid, 'UPDATE')
                     -- Een for-all-policy dekt vier opdrachten; een recht volstaat.
                     else has_any_column_privilege('authenticated', c.oid, 'SELECT')
                       or has_any_column_privilege('authenticated', c.oid, 'INSERT')
                       or has_any_column_privilege('authenticated', c.oid, 'UPDATE')
                       or has_table_privilege('authenticated', c.oid, 'DELETE')
                   end
       ) order by c.relname, p.polname), '[]')
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public';
`;

/** Zet de JSON van `VRAAG` om in policies, en werpt op alles wat er niet op lijkt. */
export function ontleedPolicies(uitvoer) {
  const ruw = JSON.parse(uitvoer);
  if (!Array.isArray(ruw)) throw new Error('de policyquery gaf geen lijst terug');

  for (const p of ruw) {
    if (typeof p?.recht !== 'boolean') throw new Error(`policy zonder \`recht\`: ${JSON.stringify(p)}`);
    for (const veld of ['tabel', 'naam', 'cmd', 'qual', 'wcheck']) {
      if (typeof p?.[veld] !== 'string') {
        throw new Error(`policy zonder \`${veld}\`: ${JSON.stringify(p)}`);
      }
    }
  }

  return ruw;
}

/** De ALTER die deze policy wagenwijd openzet, of `null` als er niets te openen valt. */
export function verzwakSql(policy, helft) {
  const stukken = [];
  if (policy.qual !== '' && helft !== 'check') stukken.push('using (true)');
  if (policy.wcheck !== '' && helft !== 'using') stukken.push('with check (true)');
  if (stukken.length === 0) return null;

  return `alter policy ${kwoot(policy.naam)} on public.${kwoot(policy.tabel)} ${stukken.join(' ')};`;
}

/**
 * De helften die deze policy los te meten heeft.
 *
 * ⚠️ **Twee clausules zijn twee grendels, en die verdienen twee metingen.** De
 *    eerste versie opende `using` en `with check` tegelijk, en bij een
 *    `ALL`-policy waren dat vier opdrachten in één keer. "Bewaakt" betekende daar
 *    dus: mínstens één van de twee — `milestones_write` kon op INSERT gedekt zijn
 *    en op DELETE niet, en de uitslag zei "bewaakt". Dat is de geruststellende
 *    richting, en het kost één extra ronde per policy om het goed te doen.
 */
export function helftenVan(policy) {
  const uit = [];
  if (policy.qual !== '') uit.push('using');
  if (policy.wcheck !== '') uit.push('check');
  return uit;
}

/** De ALTER die hem terugzet zoals hij was. */
export function herstelSql(policy) {
  const stukken = [];
  if (policy.qual !== '') stukken.push(`using (${policy.qual})`);
  if (policy.wcheck !== '') stukken.push(`with check (${policy.wcheck})`);
  if (stukken.length === 0) return null;

  return `alter policy ${kwoot(policy.naam)} on public.${kwoot(policy.tabel)} ${stukken.join(' ')};`;
}

const kwoot = (naam) => `"${naam.replace(/"/g, '""')}"`;

/**
 * De testbestanden die deze tabel überhaupt noemen.
 *
 * ⚠️ **Een grep is hier wél goed genoeg, en dat is een ander gebruik dan de grep
 *    die dit script vervangt.** Hij bepaalt niet óf iets gedekt is — dat doet de
 *    mutatie. Hij beperkt alleen welke bestanden hoeven te draaien, en een
 *    bestand dat de tabelnaam nergens noemt kan er onmogelijk iets over
 *    beweren. Zit je ernaast, dan is de uitkomst "niemand merkt het" terwijl een
 *    ánder bestand het wél merkt — dus bij twijfel draait alles.
 */
export function bestandenVoor(tabel, bestanden) {
  const geraakt = bestanden.filter((b) => b.inhoud.includes(tabel));
  return geraakt.length > 0 ? geraakt.map((b) => b.naam) : bestanden.map((b) => b.naam);
}

/**
 * Wat een meting betekent.
 *
 * ⚠️ **`bewijs` is er sinds ronde 9, en het is geen opsmuk.** Tot dan gaf dit
 *    script bij een bewaakte helft één teken en verder niets — geen mens kon
 *    nakijken of het rood ergens ánders vandaan kwam. Zie `weegTegenBaseline()`.
 */
export function oordeel(policy, uitkomst, bewijs = {}) {
  if (uitkomst === 'onverzwakbaar') {
    return { ...policy, status: 'geen-uitdrukking', melding: 'geen `using` en geen `with check`' };
  }
  // ⚠️ **Een policy waar `authenticated` het récht niet voor heeft, is niet
  //    onbewaakt maar onbewáákbaar langs deze weg.** Gemeten: met
  //    `chain_links_delete` op `using (true)` geeft een DELETE nog steeds
  //    `42501 permission denied for table` — de grendel is de grant, niet de
  //    policy. En díe grendel is wél getest, in `schrijfrechten.test.ts`.
  //
  // ⚠️ **`has_any_column_privilege` en niet `has_table_privilege`, en dat verschil
  //    kostte een hele meting.** De eerste versie van deze tak vroeg naar het
  //    tábelrecht, en dat is `false` zodra een tabel een kolomgrant heeft in
  //    plaats van een tabelbrede. Daardoor vielen `goals_insert`,
  //    `completions_insert`, `profiles_update` en zeven andere uit de meting —
  //    juist de tabellen waar de app dagelijks in schrijft. Gemeten:
  //    `goals` geeft `tabelrecht = f` en `kolomrecht = t`.
  //
  //    Wie hier tóch een test bij schrijft, schrijft een test die niet kán falen
  //    (regel 18 vraag 3). Het instrument moet daar dus niet naartoe duwen.
  if (uitkomst === 'geen-recht') {
    return {
      ...policy,
      status: 'geen-recht',
      melding: '`authenticated` heeft dit recht niet — de grant is de grendel, niet de policy',
    };
  }

  // ⚠️ Geen oordeel is iets anders dan een gunstig oordeel — zie `leesUitkomst()`.
  if (uitkomst === 'onbruikbaar') {
    return {
      ...policy,
      status: 'ongemeten',
      melding: bewijs.reden
        ? `de testrun leverde geen bruikbare uitslag — ${bewijs.reden}`
        : 'de testrun leverde geen bruikbare uitslag',
    };
  }
  if (uitkomst === 'rood') return { ...policy, status: 'bewaakt', rood: bewijs.rood ?? [] };

  return {
    ...policy,
    status: 'onbewaakt',
    melding: bewijs.alRood?.length
      ? 'wagenwijd opengezet; er stond wél rood, maar alleen tests die vóór de meting ' +
        `al rood stonden (${bewijs.alRood[0]})`
      : 'wagenwijd opengezet en geen enkele test werd rood',
  };
}

/* ---------------------------------------------------------------------------
 * Het register van helften die per hélft niet te meten zijn — QS8-262, ronde 6
 * ------------------------------------------------------------------------- */

/**
 * ⚠️ **Waarom dit register er is.** Dit script zet één helft tegelijk open, en
 *    dat is de juiste meting — behalve als een ánder slot die ene helft
 *    afdekt. Dan komt hij uit de meting als "onbewaakt" terwijl het paar wél
 *    bewaakt is, en die melding komt élke run terug.
 *
 *    Zo'n uitslag stond tot nu toe uitgeschreven in de kop van het testbestand
 *    dat het gemeten had — `eigenaarschap.test.ts`, `schrijfgrenzen.test.ts`,
 *    `blokkades.test.ts`. Prima leesbaar voor een mens, onzichtbaar voor dit
 *    script. **Dus meldde het instrument ze eeuwig als gat, en dat is de vorm
 *    waar `CLAUDE.md` voor waarschuwt: een controle die altijd hetzelfde meldt,
 *    leer je overslaan.** Zelfde reparatie als `BEKENDE_ONBEREIKBAAR` in
 *    `dode-exports-controle.mjs`.
 *
 * ⚠️ **De ratel slaat twee kanten op.** Een rij die hier staat terwijl de helft
 *    intussen wél bewaakt wordt, is een lijst die liegt — dat maakt dit script
 *    rood. En een rij zonder terugkeervoorwaarde ook: QS8-262 laat "niet te
 *    toetsen" alleen toe *mét* de voorwaarde waaronder het weer wel kan, precies
 *    zoals `review:controle` dat voor de Laag-rijen eist.
 *
 * ⚠️ **Alleen wat gemeten is.** Geen enkele rij hieronder is er op grond van een
 *    redenering. `schrijfgrenzen.test.ts` draagt de les die dat afdwingt: *"niet
 *    te breken" is een meting en geen conclusie* — daar stond een half jaar een
 *    redenering die bij meting onjuist bleek, en die conjunct staat sinds
 *    QS8-280 gewoon onder test.
 *
 * ⚠️ **Een gefilterde run oordeelt niet over wat hij niet gemeten heeft.** Draai
 *    je `rls:dekking -- goals`, dan zegt dat niets over de rij van
 *    `user_blocks`. `verzoenRegister()` kijkt daarom alleen naar helften die in
 *    déze run langs de meetlat zijn geweest.
 *
 * De sleutel is `tabel.policynaam.helft`.
 */
export const NIET_PER_HELFT_TE_METEN = {
  'day_checkins.day_checkins_delete.using': {
    reden:
      'PostgREST stuurt een DELETE als `DELETE … RETURNING`, dus de rij moet óók door ' +
      '`day_checkins_select` — en dat is letterlijk dezelfde uitdrukking (de eigenaarstoets ' +
      'via `weekly_goals` en `goals`). 📏 Gemeten met bob die aan de afvinking van alice ' +
      'komt: alleen deze helft open = de rij blijft staan; delete én select samen open = ' +
      '1 rood, en het is de juiste test. De grendel is het paar.',
    wordtToetsbaarAls:
      'de uitdrukkingen van `day_checkins_select` en `day_checkins_delete` uit elkaar lopen — ' +
      'bijvoorbeeld als een groepsgenoot ooit afvinkingen mag lezen. ⚠️ Dat zou domeinregel 7 ' +
      'raken: een rooster met gaten is fijnmaziger tegenslag dan een gemiste week (A41).',
    staatIn: 'tests/rls/afvinkgrens.test.ts',
  },
  'push_tokens.push_tokens_delete.using': {
    reden:
      'Zelfde vorm als `day_checkins_delete`: `push_tokens_select` draagt letterlijk dezelfde ' +
      'uitdrukking (`user_id = auth.uid()`), en een DELETE gaat als `DELETE … RETURNING`. ' +
      '📏 Gemeten: alleen deze helft open = het token blijft staan; delete én select samen ' +
      'open = 1 rood.',
    wordtToetsbaarAls:
      'de uitdrukkingen van `push_tokens_select` en `push_tokens_delete` uit elkaar lopen.',
    staatIn: 'tests/rls/afvinkgrens.test.ts',
  },
  'profiles.profiles_update.using': {
    reden:
      '`using` en `with check` zijn letterlijk dezelfde uitdrukking — `id = auth.uid()` — ' +
      'en `id` staat níet in de UPDATE-kolomgrant van `profiles` (📏 hermeten op 10-09-2026: ' +
      'twintig kolommen wél, `id` niet; de kop van `schrijfgrenzen.test.ts` zei nog veertien). ' +
      'Er bestaat dus geen rij die de ene helft passeert en de andere niet. Het páár is wél ' +
      'bewaakt: `schrijfgrenzen.test.ts` wordt rood zodra béíde helften verruimd worden. ' +
      '⚠️⚠️ **Deze rij is op 10-09-2026 (ronde 9) ten onrechte weggehaald en meteen ' +
      'teruggezet.** Eén run van `rls:dekking -- profiles` gaf `bewaakt` voor beide helften en ' +
      'eiste verwijdering; drie runs erna — op een verse stack, en onafhankelijk door de ' +
      'security-reviewer — gaven `onbewaakt`. Die tegenspraak staat als eigen rij in ' +
      '`docs/ENGINEER-REVIEW.md`: een `bewaakt`-uitslag betekent *er werd een test rood*, en ' +
      'dat is niet hetzelfde als *déze policy maakte hem rood*.',
    wordtToetsbaarAls:
      'de twee uitdrukkingen uit elkaar lopen — bijvoorbeeld als een beheerder ooit ' +
      "andermans profiel mag lezen maar niet schrijven — of `id` in de UPDATE-kolomgrant komt.",
    staatIn: 'tests/rls/schrijfgrenzen.test.ts',
  },
  'profiles.profiles_update.check': {
    reden: 'Zelfde paar als `profiles.profiles_update.using`; zie daar voor de meting.',
    wordtToetsbaarAls: 'zie `profiles.profiles_update.using`.',
    staatIn: 'tests/rls/schrijfgrenzen.test.ts',
  },
  'todo_items.todo_items_update.check': {
    reden:
      '`using` en `with check` zijn letterlijk dezelfde uitdrukking — `user_id = auth.uid()` — ' +
      'en `user_id` staat níet in de UPDATE-kolomgrant van `todo_items` (📏 gemeten: ' +
      '`order_index`, `body` en `done_at` wél, `user_id` niet). Een client kan de eigenaar dus ' +
      'nooit veranderen, waardoor de nieuwe rij altijd dezelfde `user_id` draagt als de oude — ' +
      'en die is de `using`-helft al gepasseerd. Er bestaat geen rij die de ene helft passeert ' +
      'en de andere niet. ' +
      '⚠️ **Dit is niet hetzelfde geval als `groups_update`, en het verschil is gemeten.** Daar ' +
      'geeft élke helft los nul rood; hier geeft de `using`-helft los **1 rood** en de ' +
      '`check`-helft nul. 📏 Drie metingen op 10-09-2026 (QS8-262, ronde 9): alleen `using` ' +
      'open → 1 rood, alleen `check` open → 0 rood, béíde open → 1 rood, elke keer ' +
      '*de UPDATE-policy filtert andermans rij weg, ook met SELECT wagenwijd open*. De ' +
      '`using`-helft is dus gewoon bewaakt; alleen deze is niet te isoleren.',
    wordtToetsbaarAls:
      'de twee uitdrukkingen uit elkaar lopen, of `user_id` in de UPDATE-kolomgrant komt — ' +
      'dan kan iemand zijn taak naar een ander schrijven en is `check` in zijn eentje de ' +
      'grendel. ⚠️ Een gedeelde taak maakt dat scherper: `shared_group_id` staat er vandaag ' +
      'ook niet in, en `zet_taakzichtbaarheid()` is de enige weg.',
    staatIn: 'tests/rls/todo-lijst.test.ts',
  },
  'goals.goals_update.using': {
    reden:
      '`using` en `with check` zijn letterlijk dezelfde uitdrukking — `owner_id = auth.uid()` — ' +
      'en `owner_id` staat níet in de UPDATE-kolomgrant van `goals` (📏 gemeten: `title`, ' +
      '`description`, `category`, `identity_statement` en `available_hours_per_week` wél, ' +
      '`owner_id` niet). Een client kan de eigenaar dus nooit verzetten. 📏 Gemeten op ' +
      '10-09-2026 (ronde 9), met de 96 testbestanden die `goals` noemen: alleen `using` open = ' +
      '1211 groen, alleen `check` open = 1211 groen, béíde tegelijk = 1 rood — *een ' +
      'groepsgenoot hernoemt het doel van een ander niet*. De grendel is het paar. ' +
      '⚠️ Ronde 4 (#174) mat dit al zo en legde het niet vast; het register bestond toen nog ' +
      'niet.',
    wordtToetsbaarAls:
      'de twee uitdrukkingen uit elkaar lopen, of `owner_id` in de UPDATE-kolomgrant komt — ' +
      'dan kan iemand zijn doel naar een ander schrijven en is `check` in zijn eentje de ' +
      'grendel.',
    staatIn: 'tests/rls/eigenaarschap.test.ts',
  },
  'goals.goals_update.check': {
    reden: 'Zelfde paar als `goals.goals_update.using`; zie daar voor de meting.',
    wordtToetsbaarAls: 'zie `goals.goals_update.using`.',
    staatIn: 'tests/rls/eigenaarschap.test.ts',
  },
  'weekly_goals.weekly_goals_update.using': {
    reden:
      '`using` en `with check` zijn letterlijk dezelfde uitdrukking — de eigenaarstoets via ' +
      '`goals` — en `goal_id` staat níet in de UPDATE-kolomgrant van `weekly_goals` ' +
      '(📏 gemeten: `milestone_id`, `ceiling_text`, `floor_text` en `title` wél, `goal_id` niet). ' +
      'Een client kan het doel van een weekdoel dus nooit verzetten, waardoor de nieuwe rij ' +
      'altijd dezelfde eigenaar heeft als de oude. 📏 Gemeten op 10-09-2026 (ronde 9): elke ' +
      'helft los = nul rood, béíde tegelijk = 1 rood — *een groepsgenoot hernoemt het weekdoel ' +
      'van een ander niet*. De grendel is het paar. ' +
      '⚠️ Ronde 4 (#174) mat dit al zo en legde het alleen niet vast; het register bestond toen ' +
      'nog niet. Daardoor meldde `rls:dekking` deze twee helften drie rondes lang als gat.',
    wordtToetsbaarAls:
      'de twee uitdrukkingen uit elkaar lopen, of `goal_id` in de UPDATE-kolomgrant komt — dan ' +
      'kan een eigenaar zijn weekdoel naar het doel van een ander schrijven en is `check` in ' +
      'zijn eentje de grendel.',
    staatIn: 'tests/rls/eigenaarschap.test.ts',
  },
  'weekly_goals.weekly_goals_update.check': {
    reden: 'Zelfde paar als `weekly_goals.weekly_goals_update.using`; zie daar voor de meting.',
    wordtToetsbaarAls: 'zie `weekly_goals.weekly_goals_update.using`.',
    staatIn: 'tests/rls/eigenaarschap.test.ts',
  },
  'weekly_plan_steps.weekly_plan_steps_update.check': {
    reden:
      '⚠️ **Hier zijn de twee helften níet gelijk, en tóch is alleen de check niet te ' +
      'isoleren.** De `check` draagt één conjunct extra — `weekly_goal_id is null` — bovenop de ' +
      'eigenaarstoets en `activated_cycle is null` die ook in de `using` staan. Geen van die ' +
      'drie kolommen staat in de UPDATE-kolomgrant (📏 gemeten: alleen `title`, `floor_text` en ' +
      '`ceiling_text`), dus een client kan ze niet zetten. ' +
      '⚠️⚠️ **Maar dát is niet de hele grendel, en die correctie komt uit de security-ronde.** ' +
      'Voor `activated_cycle` volstaat de kolomgrant; voor `weekly_goal_id` niet, want de ' +
      '`using`-helft toetst die kolom helemaal niet — "de using al gepasseerd" zegt er dus ' +
      'niets over. De onderscheidende rij is `activated_cycle is null and weekly_goal_id is ' +
      'not null`, en die is onbereikbaar door een **invariant** en niet door de policy: ' +
      '`weekly_goal_id` staat ook niet in de INSERT-grant, en de énige schrijver ervan — ' +
      '`weekplanstap_naar_weekdoel()` — zet hem altijd samen met `activated_cycle` in dezelfde ' +
      'UPDATE. Die invariant leeft in één functielichaam en staat in geen enkele CHECK. ' +
      '📏 Gemeten op 10-09-2026 (ronde 9): `using` los = **bewaakt**, `check` los = nul rood, ' +
      'béíde tegelijk = 2 rood (*een geactiveerde stap is niet meer te wijzigen* en *laat de ' +
      'stap van Alice ongemoeid bij een ongefilterde update van Bob*).',
    wordtToetsbaarAls:
      '`weekly_goal_id`, `activated_cycle` of `goal_id` in de UPDATE-kolomgrant komt, **of ' +
      'zodra er een tweede schrijver van `weekly_goal_id` bijkomt die hem zet zonder ' +
      '`activated_cycle`** — een "ontkoppel dit weekdoel maar hou de stap verbruikt"-actie, ' +
      'bijvoorbeeld. Die tweede route was de eerste keer vergeten, en hij is de enige die ' +
      'realistisch is: de invariant leeft in een functielichaam en niet in een constraint.',
    staatIn: 'tests/rls/schrijfgrenzen.test.ts en tests/rls/planstapgrens.test.ts',
  },
  'groups.groups_update.using': {
    reden:
      '`using` en `with check` zijn letterlijk dezelfde uitdrukking — `is_group_admin(id)` — ' +
      'en `id` staat níet in de UPDATE-kolomgrant van `groups` (📏 gemeten na 0202: ' +
      'name, huddle_day, categorie en zeven andere wél — tien in totaal — `id` niet. ' +
      '`tz` stond hier tot QS8-355 bij en is er met 0202 uit). Er bestaat dus geen rij die ' +
      'de ene helft passeert en de andere niet. 📏 Gemeten: elke helft los = nul rood, ' +
      'béide helften tegelijk = 3 rood. De grendel is het paar.',
    wordtToetsbaarAls:
      'de twee uitdrukkingen uit elkaar lopen, of `id` in de UPDATE-kolomgrant komt — ' +
      'dan kan een beheerder zijn groep naar een ander id schrijven en is `check` in ' +
      'zijn eentje de grendel.',
    staatIn: 'tests/rls/lidmaatschapsgrens.test.ts',
  },
  'groups.groups_update.check': {
    reden: 'Zelfde paar als `groups.groups_update.using`; zie daar voor de meting.',
    wordtToetsbaarAls: 'zie `groups.groups_update.using`.',
    staatIn: 'tests/rls/lidmaatschapsgrens.test.ts',
  },
  'user_blocks.user_blocks_delete.using': {
    reden:
      'PostgREST stuurt een DELETE als `DELETE … RETURNING`, en met een RETURNING moet ' +
      'de rij óók door de SELECT-policy. `user_blocks_select` is letterlijk dezelfde ' +
      'uitdrukking als deze policy, dus een vreemde ziet de rij niet en komt nooit tot ' +
      'de delete-policy. 📏 Gemeten: alleen deze helft open = 4 groen, alleen ' +
      '`user_blocks_select` open = 4 groen, allebei tegelijk = 1 rood en het is de ' +
      'juiste test. De grendel is dus het paar.',
    wordtToetsbaarAls:
      'de uitdrukkingen van `user_blocks_select` en `user_blocks_delete` uit elkaar ' +
      'lopen — bijvoorbeeld als een groepsbeheerder ooit blokkades van anderen mag lezen.',
    staatIn: 'tests/rls/blokkades.test.ts',
  },
};

/**
 * Klachten over de vórm van het register, los van welke database dan ook.
 *
 * ⚠️ Een rij zonder terugkeervoorwaarde is een rij die nooit meer weggaat. Dat
 *    is dezelfde eis die `review:controle` aan een Laag-bevinding stelt, en om
 *    dezelfde reden: wat je wegzet, zegt wanneer het terugkomt.
 */
export function registervormKlachten(register) {
  const uit = [];
  for (const [sleutel, rij] of Object.entries(register)) {
    if (sleutel.split('.').length !== 3) {
      uit.push(`\`${sleutel}\` is geen \`tabel.policy.helft\``);
      continue;
    }
    const helft = sleutel.split('.')[2];
    if (helft !== 'using' && helft !== 'check') {
      uit.push(`\`${sleutel}\` noemt helft \`${helft}\` en niet \`using\` of \`check\``);
    }
    for (const veld of ['reden', 'wordtToetsbaarAls', 'staatIn']) {
      if (typeof rij?.[veld] !== 'string' || rij[veld].trim() === '') {
        uit.push(`\`${sleutel}\` mist \`${veld}\``);
      }
    }
  }
  return uit;
}

/** De sleutel waaronder een bevinding in het register staat. */
export function registersleutel(bevinding) {
  return `${bevinding.tabel}.${bevinding.naam}.${bevinding.helft}`;
}

/**
 * Legt de bevindingen van deze run naast het register.
 *
 * `alle` is de volledige policylijst — óók buiten het filter — zodat een rij die
 * naar een policy wijst die niet meer bestaat opvalt, ook in een gefilterde run.
 *
 * @returns `verklaard` (onbewaakt én bekend), `onbekend` (onbewaakt en nieuw),
 *          `verouderd` (bekend maar intussen bewaakt) en `verdwenen` (bekend
 *          maar de policy bestaat niet meer).
 */
export function verzoenRegister({ bevindingen, register, alle }) {
  const verklaard = [];
  const onbekend = [];
  const verouderd = [];

  for (const b of bevindingen) {
    if (b.status !== 'onbewaakt' && b.status !== 'bewaakt') continue;
    const sleutel = registersleutel(b);
    const bekend = sleutel in register;

    if (b.status === 'onbewaakt') (bekend ? verklaard : onbekend).push({ ...b, sleutel });
    else if (bekend) verouderd.push({ ...b, sleutel });
  }

  // ⚠️ Over `alle` en niet over de gemeten bevindingen: of een policy nog
  //    bestáát, is geen vraag die van het filter afhangt.
  const bestaand = new Set(alle.map((p) => `${p.tabel}.${p.naam}`));
  const verdwenen = Object.keys(register).filter((sleutel) => {
    const stukken = sleutel.split('.');
    return !bestaand.has(`${stukken[0]}.${stukken[1]}`);
  });

  return { verklaard, onbekend, verouderd, verdwenen };
}

const HERSTELBESTAND = join(WORTEL, '.rls-dekking-herstel.json');

/**
 * Weigert te draaien tegen iets anders dan de lokale stack.
 *
 * ⚠️ **Dit script zet policies wagenwijd open.** Op de lokale stack is dat een
 *    meting; op het echte project is het een gat in de beveiliging dat blijft
 *    staan zolang de run duurt — en langer als hij afbreekt. De kop waarschuwde
 *    daarvoor, en een waarschuwing is geen slot: `PGHOST` naar het echte project
 *    wijzen en `npm run rls:dekking` typen was genoeg.
 *
 * ⚠️ **De toets is bewust een allowlist en geen blocklist.** "Is dit niet
 *    productie" is niet te beantwoorden; "is dit onmiskenbaar mijn eigen
 *    machine" wel. Alles wat daar niet onder valt, gaat er niet doorheen —
 *    inclusief een hostnaam die je niet had verwacht.
 */
export function magHierDraaien({ host, poort, db, doel }) {
  if (doel !== 'lokaal') return { ok: false, reden: 'RLS_DOEL staat niet op `lokaal`' };

  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    return { ok: false, reden: `de host is \`${host}\` en dat is geen loopback-adres` };
  }
  if (poort !== '5433') {
    return { ok: false, reden: `de poort is \`${poort}\` en de lokale stack draait op 5433` };
  }

  // ⚠️ De naam van de échte database staat nergens in dit script, en dat hoort
  //    zo: hij hoeft alleen te weten welke naam hij wél mag muteren.
  if (db !== 'goalbuddies_rls') {
    return { ok: false, reden: `de database heet \`${db}\` en niet \`goalbuddies_rls\`` };
  }

  return { ok: true };
}

/**
 * Legt de uitkomst van `select …` naast wat we dáchten te verbinden.
 *
 * ⚠️ **Dit is wat van de allowlist een meting maakt.** `magHierDraaien()` toetst
 *    wat we van plan zijn; deze toetst waar we daadwerkelijk uitkwamen. Zonder
 *    deze tweede helft is de eerste een vrome wens: libpq kiest zijn bestemming
 *    óók uit `PGHOSTADDR`, `PGSERVICE` en `PGSERVICEFILE`, en die staan alle drie
 *    buiten elke lijst die je van tevoren kunt opschrijven.
 *
 *    Gemeten: `env -u PGHOST PGHOSTADDR=127.0.0.1 psql …` maakt een
 *    TCP-verbinding terwijl `PGHOST` niet bestaat. De eerste versie van dit slot
 *    zei daar `ok` op, en de ijking keurde die tak met zoveel woorden goed — dus
 *    de mutatie op de hosttoets werd rood terwijl de grendel die hij beweerde te
 *    bewaken er niet was.
 */
export function kloptDeBestemming({ adres, poort, database }) {
  if (!['127.0.0.1', '::1'].includes(adres)) {
    return { ok: false, reden: `de verbinding kwam uit op \`${adres}\` en dat is geen loopback` };
  }
  if (String(poort) !== '5433') {
    return { ok: false, reden: `de verbinding kwam uit op poort \`${poort}\`` };
  }
  if (database !== 'goalbuddies_rls') {
    return { ok: false, reden: `de verbinding kwam uit in \`${database}\`` };
  }

  return { ok: true };
}


/**
 * Zet terug wat een afgebroken run heeft laten liggen.
 *
 * ⚠️ **Dit gebeurt vóór de eerste meting en niet erna**, want een meting tegen
 *    een database met een openstaande policy is geen meting. Dat is precies wat
 *    er de eerste keer gebeurde, en het viel niet op omdat het resultaat er
 *    normaal uitzag.
 */
function herstelWatOpenstond() {
  if (!existsSync(HERSTELBESTAND)) return;

  const policy = JSON.parse(readFileSync(HERSTELBESTAND, 'utf8'));
  const sql = herstelSql(policy);
  console.log(
    `⚠ een vorige run is afgebroken bij ${policy.tabel}.${policy.naam} — eerst terugzetten.\n`,
  );
  if (sql !== null) psql(sql);
  rmSync(HERSTELBESTAND);
}

/**
 * De policies die wagenwijd openstaan, uit de lijst die de lus gaat gebruiken.
 *
 * ⚠️ **Dit werkt op de ingelezen lijst en niet op een verse query, en dat is de
 *    reparatie van een echte fout.** De eerste versie las de policies in, herstelde
 *    daarna pas wat een afgebroken run had laten liggen, en vroeg de database
 *    vervolgens of er nog iets openstond. Dat antwoord was dan "nee" — terwijl de
 *    lijst in het geheugen die ene policy nog steeds als `true` droeg. Aan het eind
 *    van zijn beurt zette de lus hem "terug" naar `true`, zonder spoor en zonder
 *    melding, en draaide de rest van de run tegen een database met een gat.
 *
 *    Precies het faalbeeld dat dit script beschrijft, in geruststellende richting,
 *    met een guard die er per constructie naast keek. Door de vraag op de
 *    ínlezing te stellen kan die twee nooit meer uit elkaar lopen.
 */
export function verdachtePolicies(policies) {
  return policies
    .filter((p) => p.qual === 'true' || p.wcheck === 'true')
    .map((p) => `${p.tabel}.${p.naam}`);
}

/**
 * Elke policy die wagenwijd openstaat, gevraagd aan de database.
 *
 * ⚠️ **Béide helften, en dat is de reparatie van de eerste versie.** Een
 *    INSERT-policy heeft alléén een `with check`; keek je daar niet naar, dan
 *    meldde deze controle "alles dicht" over precies het gat dat er lag.
 *
 * ⚠️ **Dit draait aan het éínd en niet aan het begin.** Vooraf is
 *    `verdachtePolicies()` de juiste vraag, want die kijkt naar de lijst die de
 *    lus gebruikt. Achteraf is déze de juiste: heeft deze run de database
 *    achtergelaten zoals hij hem vond? Dat is wat er de eerste keer misging, en
 *    het bleef onopgemerkt omdat niemand het vroeg.
 */
function watOpenstaat() {
  return psql(`
    select c.relname || '.' || p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (pg_get_expr(p.polqual, p.polrelid) = 'true'
        or pg_get_expr(p.polwithcheck, p.polrelid) = 'true');
  `)
    .split('\n')
    .filter((r) => r.trim().length > 0);
}

/**
 * ⚠️ **Alles expliciet, en de omgeving geschoond.** Laat je één van host, poort,
 *    gebruiker of database aan libpq over, dan kan die hem uit `PGHOSTADDR`,
 *    `PGSERVICE`, `PGSERVICEFILE` of `~/.pg_service.conf` halen — allemaal buiten
 *    het zicht van `magHierDraaien()`. `PGOPTIONS` gaat er ook uit, want dat kan
 *    de `search_path` verzetten en daarmee wat `pg_get_expr()` teruggeeft.
 */
const BESTEMMING = {
  host: process.env.PGHOST || 'localhost',
  poort: process.env.PGPORT ?? '5433',
  gebruiker: process.env.PGUSER ?? 'postgres',
  db: process.env.DB ?? 'goalbuddies_rls',
};

function psql(sql) {
  const schoon = { ...process.env };
  for (const naam of [
    'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER',
    'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS',
  ]) {
    delete schoon[naam];
  }

  return execFileSync(
    'psql',
    [
      '--quiet', '--no-psqlrc', '-At',
      '-h', BESTEMMING.host,
      '-p', BESTEMMING.poort,
      '-U', BESTEMMING.gebruiker,
      '-d', BESTEMMING.db,
      '-v', 'ON_ERROR_STOP=1',
      '-c', sql,
    ],
    { encoding: 'utf8', env: schoon, timeout: 60_000 },
  );
}

/**
 * Leest uit de JSON van vitest wat er écht gebeurd is.
 *
 * ⚠️ **De exitcode is hier niet genoeg, en dat gaat de geruststellende kant op.**
 *    De eerste versie las élke niet-nul afloop als "bewaakt". Maar vitest geeft
 *    ook niet-nul bij een startup-error, een dichte PostgREST, een `npx` die
 *    hapert, of geheugen op — en dan telt een policy als beschermd zonder dat er
 *    één assertie gedraaid heeft. Over een run van meer dan een uur is dat geen
 *    randgeval, en elke keer dat het gebeurt schuift een policy van "onbewaakt"
 *    naar "bewaakt".
 *
 *    Daarom is "bewaakt" nu: **er zijn tests gedraaid én er is er minstens één
 *    gefaald.** Draaide er niets, dan is de uitkomst `onbruikbaar` en dat is geen
 *    oordeel maar een reden om te stoppen.
 */
export function faalnamen(uit) {
  const namen = [];
  for (const bestand of uit.testResults ?? []) {
    for (const test of bestand.assertionResults ?? []) {
      if (test.status !== 'failed') continue;
      const waar = bestand.name ? basename(bestand.name) : '?';
      namen.push(`${waar} > ${test.fullName ?? test.title ?? '?'}`);
    }
  }
  return [...new Set(namen)].sort();
}

export function leesUitkomst(json) {
  let uit;
  try {
    uit = JSON.parse(json);
  } catch {
    return { uitkomst: 'onbruikbaar', reden: 'vitest gaf geen leesbare JSON' };
  }

  const gedraaid = (uit.numTotalTests ?? 0) - (uit.numPendingTests ?? 0);
  if (gedraaid <= 0) return { uitkomst: 'onbruikbaar', reden: 'er is geen enkele test gedraaid' };

  if ((uit.numFailedTests ?? 0) > 0) {
    const rood = faalnamen(uit);

    // ⚠️⚠️ **Een rood zonder namen is geen bruikbaar rood, en dat is sinds
    //    ronde 9 een weigering in plaats van een aanname.** Vanaf hier telt niet
    //    meer dát er iets rood werd maar wát; kan dit script dat niet uitlezen,
    //    dan kan het de vraag van `weegTegenBaseline()` niet stellen en is een
    //    oordeel over deze helft niet te geven. De json-reporter van vitest
    //    noemt ze altijd — komt er toch een telling zonder namen uit, dan is er
    //    iets met de reporter en niet met de policy.
    if (rood.length === 0) {
      return {
        uitkomst: 'onbruikbaar',
        reden: `vitest telde ${uit.numFailedTests} gefaalde test(s) maar noemde er geen één`,
      };
    }

    return { uitkomst: 'rood', gedraaid, rood };
  }

  // ⚠️ **Een groene uitslag is alleen te geloven als er geen bestand omviel.**
  //    K3 hierboven dekt de ene kant af — "er ging íets mis" mag niet als bewaakt
  //    tellen. Dit is de ándere kant, en die is op 03-09 een weggegooide meting
  //    geweest: valt PostgREST weg, dan sneuvelt élke aanroep in `beforeAll`. Dat
  //    is een *error* en geen gefaalde assertie, en de rest van het bestand wordt
  //    overgeslagen. `numFailedTests` blijft dan nul terwijl er tientallen
  //    bestanden rood staan — en dat leest als "niets werd rood", dus als
  //    onbewaakt.
  //
  //    Die richting is de gevaarlijke: het instrument verzint dan gaten die er
  //    niet zijn, en wie ze gaat dichten schrijft tests voor een probleem dat niet
  //    bestaat. Bij een échte onbewaakte policy draait de suite gewoon groen —
  //    nul gefaalde bestanden — dus deze toets kost geen enkele geldige meting.
  if ((uit.numFailedTestSuites ?? 0) > 0) {
    return {
      uitkomst: 'onbruikbaar',
      reden:
        `${uit.numFailedTestSuites} testbestand(en) vielen om zonder dat er één assertie faalde ` +
        '— de stack is er waarschijnlijk onder weggevallen',
    };
  }

  return { uitkomst: 'groen', gedraaid };
}

/**
 * ⚠️⚠️ **Het hart van ronde 9: "er werd een test rood" is niet hetzelfde als
 *    "déze policy maakte hem rood".**
 *
 *    📏 Gemeten op 10-09-2026, op één commit, zonder één policy aan te raken:
 *    `rls:dekking -- profiles` gaf eerst `1 van de 3`, met beide helften van
 *    `profiles_update` als gat. Daarna is in `dagtellers` één rij opgehoogd —
 *    `avatars/uploader/tmp` van 6 naar 10, precies de stand die vier gewone
 *    suiteruns opleveren — en dezelfde meting gaf **`3 van de 3` bewaakt**, mét
 *    de eis om de twee registerrijen weg te halen die die gaten vastleggen.
 *
 *    De oorzaak is dat `tmp` een lettérlijke sleutel is: elke run van
 *    `avatarbucket.test.ts` telt er één bij en een `delete` haalt hem er niet af
 *    (dat is precies wat migratie 0233 wilde). Bij tien slaat de dagteller dicht
 *    en valt *"valt niet om op een map die geen uuid is"* om met `23514` — in
 *    élke beurt van deze meting, ongeacht welke policy er openstond.
 *
 *    Dit is dezelfde klasse als de twee fouten die dit issue al draagt (een
 *    afgebroken run die een policy liet openstaan; elke niet-nul exitcode als
 *    bewaakt), en hij gaat dezelfde geruststellende kant op: een echt gat komt
 *    eruit als bewaakt. Ik ben er zelf in gelopen — in ronde 9 heb ik op grond
 *    van zo'n uitslag twee terechte registerrijen wéggehaald.
 *
 *    De reparatie is dat een rood pas telt als het er vóór de meting nog niet
 *    was. Wat er al rood stond, bewijst niets over een policy die op dat moment
 *    nog gewoon dichtstond.
 */
export function weegTegenBaseline(uitslag, baseline) {
  if (uitslag.uitkomst !== 'rood') return uitslag;

  const nieuw = (uitslag.rood ?? []).filter((naam) => !baseline.includes(naam));
  if (nieuw.length > 0) return { ...uitslag, rood: nieuw };

  return { ...uitslag, uitkomst: 'groen', rood: [], alRood: uitslag.rood ?? [] };
}

/**
 * De andere helft van dezelfde reparatie: de basislijn wordt gemeten vóór de
 * eerste mutatie, maar een teller loopt tíjdens de run door.
 *
 * ⚠️ **Daarom wordt hij ook aan het eind gemeten, met alles teruggezet.** Een
 *    test die dán rood staat en bij de start groen was, is onderweg omgevallen
 *    zonder dat er iets openstond. Rust een `bewaakt` uitsluitend op zo'n test,
 *    dan is dat geen bewijs maar drift — en dit script noemt dan liever geen
 *    getal dan een verkeerd getal. Zelfde houding als bij `ongemeten`.
 *
 * ⚠️ Alleen wie er hélemaal op leunt wordt teruggezet. Wie er nog een ánder rood
 *    onder heeft, houdt dat rood en blijft bewaakt: dat rood was er bij de start
 *    niet en aan het eind ook niet.
 */
export function weegDrift(bevindingen, gedrift) {
  return bevindingen.map((b) => {
    if (b.status !== 'bewaakt') return b;

    const overeind = (b.rood ?? []).filter((naam) => !gedrift.includes(naam));
    if (overeind.length > 0) return { ...b, rood: overeind };

    return {
      ...b,
      status: 'ongemeten',
      melding:
        'het enige rood stond aan het eind van de run óók rood, met alles dicht ' +
        `(${(b.rood ?? [])[0]})`,
    };
  });
}

function draai(bestanden) {
  const uit = spawnSync(
    'npx',
    ['vitest', 'run', '--reporter=json', ...bestanden.map((b) => `tests/rls/${b}`)],
    {
      cwd: WORTEL,
      encoding: 'utf8',
      env: { ...process.env, RLS_DOEL: process.env.RLS_DOEL ?? 'lokaal' },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60_000,
    },
  );

  // ⚠️ vitest zet zijn JSON tussen andere uitvoer; pak het buitenste object.
  const begin = (uit.stdout ?? '').indexOf('{');
  const eind = (uit.stdout ?? '').lastIndexOf('}');
  if (begin === -1 || eind <= begin) {
    return { uitkomst: 'onbruikbaar', reden: 'vitest gaf geen JSON terug' };
  }

  return leesUitkomst(uit.stdout.slice(begin, eind + 1));
}

function hoofd() {
  const filter = process.argv[2] ?? '';
  const mag = magHierDraaien({
    host: BESTEMMING.host,
    poort: BESTEMMING.poort,
    db: BESTEMMING.db,
    doel: process.env.RLS_DOEL,
  });
  if (!mag.ok) {
    console.error(
      `✗ rls-dekking weigert te draaien: ${mag.reden}.\n\n` +
        'Dit script zet elke policy om beurten wagenwijd open. Op de lokale stack is\n' +
        'dat een meting; ergens anders is het een gat dat blijft staan zolang de run\n' +
        'duurt — en langer als hij afbreekt.\n\n' +
        'Start de stack met `npm run rls:stack` en draai met RLS_DOEL=lokaal.',
    );
    return 1;
  }

  // ⚠️ **De `try` dekt alléén de aanroep en niet het ontleden.** De eerste versie
  //    deed dat wel, en meldde een échte parseerfout als "geen database" — dan
  //    lijkt een defect een overslag. Zelfde val als in `kolomrechten-controle`.
  // ⚠️ **Eerst herstellen, dán inlezen.** Andersom leest hij het gat in en zet
  //    het aan het eind van die beurt weer terug — zie `verdachtePolicies()`.
  // ⚠️ **Nameten waar we uitkwamen, en niet aannemen dat het gelukt is.**
  //    Zie `kloptDeBestemming()`.
  try {
    const [adres, poort, database] = psql(
      "select coalesce(host(inet_server_addr()), 'unix-socket'), inet_server_port(), current_database();",
    )
      .trim()
      .split('|');
    const echt = kloptDeBestemming({ adres, poort, database });
    if (!echt.ok) {
      console.error(`✗ rls-dekking weigert te draaien: ${echt.reden}.`);
      return 1;
    }
  } catch (fout) {
    console.error(
      '⚠ rls-dekking: OVERGESLAGEN — geen database om mee te verbinden.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  let ruw;
  try {
    herstelWatOpenstond();
    ruw = psql(VRAAG);
  } catch (fout) {
    console.error(
      '⚠ rls-dekking: OVERGESLAGEN — geen database om de policies uit te lezen.\n\n' +
        'Dit script muteert de database en hoort alleen tegen de lokale stack te draaien.\n' +
        'Start hem met `npm run rls:stack`.\n\n' +
        `psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
    );
    return 1;
  }

  const alle = ontleedPolicies(ruw);
  const policies = alle.filter((p) => p.tabel.includes(filter));

  // ⚠️ **Nooit meten tegen een database die al openstaat.** Blijft hier iets
  //    over, dan is het niet van deze run en weet dit script niet wat de
  //    oorspronkelijke uitdrukking was — dan is opnieuw opbouwen het antwoord.
  //
  //    ⚠️ Over `alle` en niet over `policies`: een filter op tabelnaam mag niet
  //       bepalen of een gat elders in het schema meetelt. Dat gat beïnvloedt de
  //       tests van déze tabel net zo goed.
  const alOpen = verdachtePolicies(alle);
  if (alOpen.length > 0) {
    console.error(
      `✗ ${alOpen.length} policy/policies staan al wagenwijd open:\n\n` +
        alOpen.map((r) => `    ${r}`).join('\n') +
        '\n\nMeten tegen zo\'n database geeft een uitslag die er normaal uitziet en\n' +
        'niets waard is. Bouw de stack opnieuw op met `npm run rls:stack`.',
    );
    return 1;
  }

  const bestanden = readdirSync(TESTMAP)
    .filter((n) => n.endsWith('.test.ts'))
    .map((naam) => ({ naam, inhoud: readFileSync(join(TESTMAP, naam), 'utf8') }));

  // ⚠️ **Welke bestanden er in déze run langskomen.** De basislijn moet precies
  //    die dekken: minder en er glipt een al-rode test doorheen, meer en hij
  //    kost tijd zonder iets toe te voegen.
  const nodig = [
    ...new Set(
      policies.filter((p) => p.recht).flatMap((p) => bestandenVoor(p.tabel, bestanden)),
    ),
  ];

  console.log(`rls-dekking: ${policies.length} policies, elk apart opengezet.\n`);

  // ⚠️⚠️ **Eerst meten wat er al rood staat, mét alles dicht.** Zie
  //    `weegTegenBaseline()` voor het geval dat dit oplevert.
  console.log('  ·  basislijn: de suite één keer met alle policies zoals ze zijn…');
  const voor = nodig.length > 0 ? draai(nodig) : { uitkomst: 'groen', rood: [] };
  if (voor.uitkomst === 'onbruikbaar') {
    console.error(
      `\n✗ de basislijn leverde geen bruikbare uitslag: ${voor.reden}.\n\n` +
        'Zonder basislijn is niet vast te stellen of een rood van de policy komt\n' +
        'of er al stond. Er valt dan niets te meten.',
    );
    return 1;
  }
  const baseline = voor.rood ?? [];
  if (baseline.length > 0) {
    console.log(
      `  ·  ${baseline.length} test(en) staan nu al rood en tellen deze run niet als bewijs:\n` +
        baseline.map((n) => `       ${n}`).join('\n'),
    );
  }
  console.log('');

  let bevindingen = [];

  for (const [i, policy] of policies.entries()) {
    const kop = `[${i + 1}/${policies.length}] ${policy.tabel}.${policy.naam}`;

    if (!policy.recht) {
      const b = oordeel(policy, 'geen-recht');
      bevindingen.push(b);
      console.log(`  ·  ${kop} — ${b.melding}`);
      continue;
    }

    const helften = helftenVan(policy);
    if (helften.length === 0) {
      bevindingen.push(oordeel(policy, 'onverzwakbaar'));
      console.log(`  ·  ${kop} — geen uitdrukking om open te zetten`);
      continue;
    }

    // ⚠️ **Per helft, en niet allebei tegelijk** — zie `helftenVan()`. Een policy
    //    heet pas bewaakt als élke helft afzonderlijk gemist wordt.
    for (const helft of helften) {
      const open = verzwakSql(policy, helft);
      const terug = herstelSql(policy);
      const label = helften.length > 1 ? `${kop} (${helft})` : kop;

      writeFileSync(HERSTELBESTAND, JSON.stringify(policy), 'utf8');
      psql(open);

      let uitslag;
      try {
        uitslag = draai(bestandenVoor(policy.tabel, bestanden));
      } finally {
        psql(terug);
        rmSync(HERSTELBESTAND, { force: true });
      }

      uitslag = weegTegenBaseline(uitslag, baseline);

      const b = { ...oordeel(policy, uitslag.uitkomst, uitslag), helft };
      bevindingen.push(b);
      const teken = uitslag.uitkomst === 'rood' ? '✓' : uitslag.uitkomst === 'groen' ? '✗' : '·';

      // ⚠️ **Een bewaakt-uitslag noemt vanaf ronde 9 zijn getuige.** Zonder die
      //    naam is een uitslag niet na te kijken, en juist dáár zat de fout:
      //    ✓ zag er hetzelfde uit of het rood nou van deze policy kwam of van
      //    een dagteller die vol was gelopen.
      const getuige = uitslag.uitkomst === 'rood' ? ` — rood werd: ${uitslag.rood[0]}` : '';
      console.log(`  ${teken}  ${label}${b.melding ? ` — ${b.melding}` : ''}${getuige}`);
    }
  }

  // ⚠️ **De laatste vraag: is de database achtergelaten zoals hij gevonden is?**
  //    Bij de eerste echte run was het antwoord nee, en niemand vroeg het.
  //
  // ⚠️ **Hij staat sinds ronde 9 vóór de slotbasislijn en niet erna**, want een
  //    basislijn die tegen een openstaande policy gemeten is, meet niet de
  //    basislijn.
  const nogOpen = watOpenstaat();
  if (nogOpen.length > 0) {
    console.error(
      `\n✗ deze run heeft ${nogOpen.length} policy/policies laten openstaan:\n\n` +
        nogOpen.map((r) => `    ${r}`).join('\n') +
        '\n\nDat hoort niet te kunnen. Bouw de stack opnieuw op met `npm run rls:stack`\n' +
        'en vertrouw de uitslag hierboven niet.',
    );
    return 1;
  }

  // ⚠️⚠️ **En dezelfde basislijn nog een keer, nu aan het eind.** Zie
  //    `weegDrift()`: een teller die tijdens de run volloopt, staat bij de start
  //    nog groen. Alleen de tweede meting vindt die.
  if (bevindingen.some((b) => b.status === 'bewaakt')) {
    console.log('\n  ·  basislijn opnieuw, met alles teruggezet…');
    const na = draai(nodig);
    if (na.uitkomst === 'onbruikbaar') {
      console.error(
        `\n✗ de slotbasislijn leverde geen bruikbare uitslag: ${na.reden}.\n\n` +
          'Zonder die tweede meting is niet vast te stellen of een bewaakt-uitslag\n' +
          'op een test rust die onderweg is omgevallen. Draai opnieuw.',
      );
      return 1;
    }

    const gedrift = (na.rood ?? []).filter((naam) => !baseline.includes(naam));
    if (gedrift.length > 0) {
      console.log(
        `  ·  ${gedrift.length} test(en) zijn tíjdens deze run rood geworden zonder dat er\n` +
          '     iets openstond; wat daarop leunt telt niet als bewijs:\n' +
          gedrift.map((n) => `       ${n}`).join('\n'),
      );
      bevindingen = weegDrift(bevindingen, gedrift);
    }
  }

  // ⚠️ **Een run met ongemeten policies levert geen getal op.** Dat is de hele
  //    les van de besmette meting: een uitslag die er normaal uitziet en het niet
  //    is, is erger dan geen uitslag.
  const ongemeten = bevindingen.filter((b) => b.status === 'ongemeten');
  if (ongemeten.length > 0) {
    console.error(
      `\n✗ ${ongemeten.length} policy/policies leverden geen bruikbare uitslag:\n\n` +
        ongemeten.map((b) => `    ${b.tabel}.${b.naam}`).join('\n') +
        '\n\nEr is dan geen getal te noemen. Draai opnieuw.',
    );
    return 1;
  }

  const gemeten = bevindingen.filter((b) => b.status === 'bewaakt' || b.status === 'onbewaakt');
  const zonderRecht = bevindingen.filter((b) => b.status === 'geen-recht');

  const vormklachten = registervormKlachten(NIET_PER_HELFT_TE_METEN);
  const { verklaard, onbekend, verouderd, verdwenen } = verzoenRegister({
    bevindingen,
    register: NIET_PER_HELFT_TE_METEN,
    alle,
  });
  const onbewaakt = onbekend;

  console.log(
    `\n${gemeten.filter((b) => b.status === 'bewaakt').length} van de ${gemeten.length} ` +
      'meetbare policy-helften worden door minstens één test bewaakt.',
  );
  if (zonderRecht.length > 0) {
    console.log(
      `${zonderRecht.length} policy/policies zijn langs deze weg niet te meten: ` +
        '`authenticated` heeft het recht niet, dus de grant is de grendel.',
    );
  }

  if (onbewaakt.length > 0) {
    console.log(`\n✗ ${onbewaakt.length} policy/policies die niemand mist:\n`);
    for (const b of onbewaakt) {
      console.log(`    ${b.tabel}.${b.naam} (${b.cmd}${b.helft ? `, ${b.helft}` : ''})`);
    }
    console.log(
      '\nEen policy die je wagenwijd kunt openzetten zonder dat een test het merkt,\n' +
        'bewaakt niets. Schrijf er een test bij, of leg vast waarom hij niet te\n' +
        'toetsen is — zie QS8-185, en `NIET_PER_HELFT_TE_METEN` in dit bestand.',
    );
  }

  // ⚠️ **Bekend en vastgelegd is iets anders dan bewaakt, en het hoort er
  //    zichtbaar te staan.** Zou deze lijst zwijgen, dan leek een helft die een
  //    ander slot afdekt op een helft die niemand ooit gemeten heeft.
  if (verklaard.length > 0) {
    console.log(
      `\n· ${verklaard.length} helft(en) zijn per hélft niet te meten, en dat is vastgelegd:\n`,
    );
    for (const b of verklaard) {
      console.log(`    ${b.sleutel} — zie ${NIET_PER_HELFT_TE_METEN[b.sleutel].staatIn}`);
    }
  }

  // ⚠️ **De ratel, en hij slaat twee kanten op.** Een register dat blijft staan
  //    terwijl de helft intussen wél bewaakt wordt, is een lijst die liegt — en
  //    een lijst die liegt is erger dan geen lijst, want hij onderdrukt precies
  //    de melding waar hij voor bestond.
  const klachten = [
    ...vormklachten,
    ...verouderd.map(
      (b) =>
        `\`${b.sleutel}\` staat in het register maar wordt intussen wél bewaakt — haal de rij weg`,
    ),
    ...verdwenen.map((sleutel) => `\`${sleutel}\` wijst naar een policy die niet meer bestaat`),
  ];

  if (klachten.length > 0) {
    console.error(
      `\n✗ ${klachten.length} klacht(en) over \`NIET_PER_HELFT_TE_METEN\`:\n\n` +
        klachten.map((k) => `    ${k}`).join('\n') +
        '\n\nDat register onderdrukt meldingen, dus het hoort te kloppen. Zie de kop\n' +
        'ervan in dit bestand.',
    );
    return 1;
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
