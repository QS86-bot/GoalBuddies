#!/usr/bin/env node
/**
 * definers-controle — wie schrijft er met `SECURITY DEFINER` in de kerntabellen?
 *
 * ⚠️ **Dit script bestaat omdat een sweep zich voordeed als een inventarisatie.**
 *    Ronde 5 van QS8-262 haalde bij zeven definer-RPC's de eigenaarspoort weg om
 *    te zien of een test rood werd. Vier van die zeven bleken onbewaakt. Wat
 *    niemand mat is of het er zéven waren: het zijn er twaalf, en de achtste —
 *    `verwijder_weekdoel` — had precies hetzelfde gat. Gevonden door de
 *    security-reviewer, niet door het gereedschap.
 *
 *    De dossierrij die de bevinding laag hield zei *"wordt zwaarder als er een
 *    achtste bijkomt"*, en dat was op de dag van schrijven al onwaar. De echte
 *    aanname was **"de zeven die ik mat zijn de hele klasse"**, en zolang die
 *    opsomming alleen in het hoofd van de meter leeft, is elke volgende ronde
 *    weer een greep.
 *
 * ## Waarom deze klasse geen enkel ander rapport raakt
 *
 * `rls:dekking` meet policies door ze open te zetten. Een `SECURITY DEFINER`
 * -functie komt daar principieel niet langs: hij draait als zijn eigenaar, dus
 * geen enkele policy raakt hem. Zijn poort is de `if` in zijn eigen body, en die
 * staat in geen dekkingsrapport. Dit register is de enige plek waar de klasse
 * geteld wordt.
 *
 * ## ⚠️⚠️ Triggerfuncties horen erbij, en dat is de les van 0149
 *
 * `pin:controle` scopete ooit op `has_function_privilege('authenticated', …,
 * 'EXECUTE')`, en zag daardoor twee `SECURITY DEFINER`-**trigger**functies niet:
 * die hebben dat recht niet nodig, want een trigger vuurt zonder. Een client die
 * een bericht plaatste, vuurde ze wél. Het register telde vijf waar er acht
 * waren.
 *
 * Dat is hier één op één van toepassing, dus de vraag scopet **niet** op het
 * EXECUTE-recht. De reden in het register verschilt per soort:
 *
 * | Soort | Waar zijn autorisatie zit |
 * | -- | -- |
 * | RPC die `authenticated` mag aanroepen | de poort ín de functie — die hoort een test te hebben |
 * | RPC zonder dat recht | de **grant** is de grendel, en die bewaakt `tests/rls/functiegrants.test.ts` |
 * | triggerfunctie | de **policy op de schrijfactie die hem aftrapt** — geen eigen poort |
 *
 * ⚠️ Die derde rij is geen vrijbrief. "Geen eigen poort" is iets anders dan "in
 *    orde": het betekent dat déze controle er niets over zegt en dat de dekking
 *    ergens anders vandaan moet komen. `noteer_ontkoppeling` is het scherpste
 *    voorbeeld — die schrijft `goals.losgekoppeld_op` voor een `old.goal_id` die
 *    hij ongecontroleerd overneemt, en leunt volledig op de DELETE-policy van
 *    `goal_group_links`.
 *
 * ## De SQL kiest niet wie er schrijft
 *
 * Dezelfde reparatie als bij `pin:controle` na 27-08: een regex over
 * `pg_get_functiondef()` leest de definitie **inclusief commentaar**, en sloeg
 * daar aan op een zin die uitlegde wat een functie juist níét doet. De valse
 * positief was het kleine probleem; het grote was dat niemand wist hoeveel valse
 * negatieven eronder zaten.
 *
 * `schrijftNaarKerntabel()` hieronder is daarom een gewone functie, en
 * `tests/scripts/definers-controle.test.ts` biedt hem elke vorm los aan — de
 * vormen die hij moet vinden én de vormen die hij met rust moet laten.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

/**
 * De tabellen waar een schrijfactie een autorisatievraag oproept.
 *
 * ⚠️⚠️ **Deze lijst wás de grens van het register, en daarmee de grens van wat
 *    er geteld werd.** Tot 06-09-2026 stonden er vijf tabellen in, allemaal over
 *    een dóél. Daarbuiten schreven **veertien** definer-RPC's die
 *    `authenticated` mag aanroepen aan `groups`, `group_members`,
 *    `deadline_requests`, `approval_withdrawals`, `weekly_plan_steps` en
 *    `badges` — en die stonden in geen enkel rapport. Drie ervan bleken hun
 *    eigenaarspoort ongedekt te hebben (QS8-286).
 *
 *    **Dat is precies het oppervlak waar domeinregel 7 aan hangt.** Wie mag
 *    lezen wat er over een ánder zichtbaar is, wordt bepaald door
 *    groepslidmaatschap — en dat is `group_members`. Een register dat alleen
 *    naar doelen keek, keek langs de helft van het probleem heen.
 *
 * ⚠️ **De les is niet "vijf was te weinig" maar "de lijst is zelf een
 *    aanname".** Dezelfde vorm als de sweep die zich voordeed als
 *    inventarisatie, één laag hoger: het gereedschap dat de klasse telt, trok
 *    zijn eigen grens en niemand mat waar die grens langs liep. Komt er een
 *    tabel bij waar een schrijfactie een autorisatievraag oproept, dan hoort hij
 *    hier — en anders valt de volgende RPC weer buiten élk rapport.
 */
export const KERNTABELLEN = [
  // Over een doel
  'goals',
  'weekly_goals',
  'milestones',
  'completions',
  'points_ledger',
  'weekly_plan_steps',
  'deadline_requests',
  // Over een groep en wie erin zit
  'groups',
  'group_members',
  'approval_withdrawals',
  'badges',
  // Over een commitment device
  //
  // ⚠️ **Deze twee stonden er niet in tot 10-09-2026, en dat kwam boven in de
  //    security-ronde van QS8-181** — precies de vorm van QS8-286, één laag
  //    verder. `herstel_stuurloze_straf()` schrijft `beneficiary_user_id` en
  //    `status = 'resolved'` op een straf en stond alleen in het léésregister,
  //    met een reden die alleen de leesrichting beschreef. Een commitment device
  //    is waar domeinregel 5 over gaat: het mag nooit stilzwijgend aan of los.
  //    Een register dat naar doelen en groepen keek maar niet naar straffen,
  //    keek langs de zwaarste tabel van het schema heen.
  'commitments',
  'commitment_events',
];

/**
 * Het register: elke definer-functie die in een kerntabel schrijft, met waar
 * zijn autorisatie zit. Een functie die hier niet staat, is een functie waar
 * niemand die vraag over gesteld heeft.
 */
const REGISTER = new Map([
  // --- RPC's met een eigenaarspoort, bewaakt door een test -------------------
  ['zet_doelstatus', 'Eigenaarspoort. Bewaakt door `tests/rls/definerpoorten.test.ts` (ronde 5).'],
  ['zet_streefdatum', 'Eigenaarspoort. Bewaakt door `definerpoorten.test.ts`. ⚠️ De zwaarste van de reeks: de directe route om A7 heen.'],
  ['schuif_weekdoel_door', 'Eigenaarspoort. Bewaakt door `definerpoorten.test.ts`.'],
  ['verwijder_weekdoel', 'Eigenaarspoort. Bewaakt door `definerpoorten.test.ts` — de achtste, gevonden bij de review op ronde 5.'],
  [
    'rond_doel_af',
    'Eigenaarspoort. ⚠️ Hier stond "Gemeten: poort weg → `epic9.test.ts` wordt rood", ' +
      'en dat rood was een veranderde fóutreden: die fixture heeft openstaande mijlpalen, ' +
      'dus `open_milestones` ving de mutatie af en de aanroeper kwam nooit bij de `update`. ' +
      'Nagemeten met een doel zónder open mijlpalen: de poort eruit en een vreemde zet het ' +
      'doel van een ander op `completed`. Sinds QS8-283 bewaakt door ' +
      '`definerpoorten.test.ts`, met de groepsgenoot als sterke acteur op een gekoppeld doel.',
  ],
  ['sluit_weekdoel_af', 'Eigenaarspoort. Gemeten: poort weg → `weekpassen.test.ts` wordt rood.'],
  ['trek_goedkeuring_in', 'Moet de goedkeurder zijn én actief lid. Gemeten: poort weg → `besluiten.test.ts` wordt rood.'],
  ['beslis_deadline_verzoek', 'Niet de aanvrager zelf én actief lid. Gemeten: poort weg → `besluiten.test.ts` wordt rood.'],
  [
    'verwijder_doel',
    'Eigenaarspoort. ⚠️ Zelfde geval als `rond_doel_af`: het ene rode test was ' +
      '`expected \'gedeeld_met_groep\' to be \'not_owner\'` — een foutreden, geen effect. ' +
      'Nagemeten met een vers, ongekoppeld doel: de poort eruit en het doel van een ander is weg. ' +
      'Sinds QS8-283 bewaakt door `definerpoorten.test.ts`. ' +
      '⚠️ Twee buddy-predicaten, en ze gedragen zich hier verschillend — noem ze dus bij naam. ' +
      '`shares_group_with_goal()` is niet te raken: hij leest alleen `goal_group_links`, en een doel ' +
      'met een linkrij weigert deze functie al met `gedeeld_met_groep`, een éérdere poort. ' +
      '`shares_group_with_user()` is wél te raken — die leest alleen `group_members` — en wordt ' +
      'gevangen (gemeten: die verruiming maakt de test rood). ' +
      'De eerste vorm wordt toetsbaar zodra `gedeeld_met_groep` verdwijnt of naar achteren schuift.',
  ],
  ['herorden_mijlpalen', 'Toetst `g.owner_id = v_uid` en pint `m.goal_id`. Gemeten: poort weg → één rode test.'],
  [
    'plan_adempauze',
    'Eigenaarspoort. ⚠️ Stapte deze klasse pas in met QS8-227: sindsdien zet een adempauze '
      + 'over een al afgesloten week die week op `excused` en boekt hij het minpunt terug in '
      + '`points_ledger`. Daarvóór schreef de functie alleen in `breathers`. Bewaakt door '
      + '`definerpoorten.test.ts`. ⚠️ Met een eigen doel en een cyclusstart die samenvalt met '
      + 'de gemiste week, want de weekdagtoets zit achter de poort: de bestaande test in '
      + '`epic8.test.ts` zou bij een weggehaalde poort omvallen op `geen_cyclusstart` en dus '
      + 'op een fóutreden. Gemeten: poort weg → de groepsgenoot zet de gemiste week van de '
      + 'eigenaar op `excused` (`expected \'excused\' to be \'missed\'`).',
  ],
  ['dien_opnieuw_in', 'Eigenaarspoort. Gemeten bij de review op ronde 5: poort weg → één rode test.'],
  [
    'zet_week_startdag',
    'Géén losse poort: de scoping zit in de `update … and g.owner_id = v_uid` zelf, ' +
      'en er staat een tweede grendel naast in `update profiles … where id = v_uid`. ' +
      '⚠️ Hier stond tot 05-09 dat dit "de enige RPC is waar de mutatievorm van ronde 5 ' +
      'principieel blind voor is" en dat hij "toetsbaar wordt zodra de scoping naar een ' +
      'aparte `if` verhuist". Béíde helften zijn weerlegd (QS8-282): de conjunct is gewoon ' +
      'weg te halen — de functie draait door en gaf `{"ok": true, "verzet": 2}` — en hij is ' +
      'toetsbaar zonder enige verhuizing. Wat ontbrak was een fixture met een twéede ' +
      'gebruiker erin. Gemeten: zonder die tweede gebruiker nul rood van 963. ' +
      'Bewaakt door `tests/rls/weekstart.test.ts`, met zowel een wildvreemde als een buddy.',
  ],

  // --- Straffen en beloningen: het commitment device (QS8-181) ---------------
  //
  // ⚠️ **Deze vijf kwamen pas in beeld op 10-09-2026**, toen `commitments` en
  //    `commitment_events` aan `KERNTABELLEN` werden toegevoegd. Domeinregel 5:
  //    een commitment device gaat nooit stilzwijgend aan, en dus ook nooit
  //    stilzwijgend los.
  [
    'herstel_stuurloze_straf',
    'Eigenaarspoort (`not_owner`) plus vier standtoetsen, en een bevestiging voor het afwikkelen. ' +
      '⚠️ Stond tot 10-09-2026 in het léésregister met een reden die alleen de leesrichting ' +
      'beschreef — hij schrijft `beneficiary_user_id` en `status = resolved` op een straf. Dat kwam ' +
      'boven in de security-ronde van QS8-181 en is de reden dat de twee commitment-tabellen nu in ' +
      '`KERNTABELLEN` staan. De voorwaarden staan óók in de `where` van beide updates, zodat twee ' +
      'gelijktijdige aanroepen niet allebei een auditrij schrijven.',
  ],
  [
    'maak_straffen_verschuldigd',
    '`authenticated` mag hem niet aanroepen — gemeten: `anon=false auth=false service=true`. De ' +
      'grant ís hier de grendel, en die bewaakt `tests/rls/functiegrants.test.ts` (0115). Enige ' +
      'aanroeper is de rollover-functie, die als `service_role` draait.',
  ],
  [
    'wikkel_commitments_af',
    'Idem: `anon=false auth=false service=true`, dus de grant is de grendel. Wordt verder alleen ' +
      'aangeroepen vanuit `rond_doel_af()`, `zet_streefdatum()`, `zet_week_startdag()` en ' +
      '`herbereken_risico()` — allemaal definer-RPC\'s die hun eigen eigenaarspoort hebben en die ' +
      'in dit register staan.',
  ],
  [
    'noteer_commitment',
    'Triggerfunctie op `commitments` (`commitments_audit`). Geen eigen poort: zijn autorisatie is ' +
      'de policy op de schrijfactie die hem aftrapt. `commitments_insert` en `commitments_update` ' +
      'eisen allebei `g.owner_id = auth.uid()`, en de UPDATE-policy laat alleen `set → set` of ' +
      '`set → cancelled` toe. ⚠️ Schrijft alleen in `commitment_events`, dat append-only is ' +
      '(domeinregel 6).',
  ],
  [
    'meld_commitment',
    'Triggerfunctie op `commitments` (`commitments_systeembericht`). Zelfde grendel als ' +
      '`noteer_commitment`: de policy op de schrijfactie. ⚠️ Plaatst een systeembericht, en dat is ' +
      'een groepszichtbaar oppervlak — de soorten die hij mag gebruiken staan in de CHECK ' +
      '`chat_messages_system_event_bekend`, die ook voor `service_role` geldt, en het bericht noemt ' +
      '“een lid” en nooit een titel of een niveau (beslisdocument 002 §3).',
  ],

  // --- Groeps-RPC's: gemeten in de sweep van QS8-286 -------------------------
  //
  // ⚠️ Alle getallen hieronder zijn zelf nagemeten op 06-09-2026: eerste
  //    autorisatiepoort geneutraliseerd (`if false then`), volledige RLS-suite,
  //    daarna byte-identiek teruggezet en dat gecontroleerd.
  ['archiveer_groep', 'Beheerderspoort (`not_admin`) plus een expliciete bevestiging. Gemeten: poort weg → 2 rood.'],
  ['beslis_lidmaatschapsverzoek', 'Beheerderspoort. Gemeten: poort weg → 2 rood.'],
  [
    'heropen_groep',
    'Beheerderspoort. Gemeten: poort weg → 3 rood. ⚠️ De dossierrij van QS8-286 zette hem ' +
      'bij de drie waarvan "de poort niet automatisch herkend" werd; dat was een beperking ' +
      'van dát sweep-script en niet van de functie. Hij heeft een gewone `not_admin`-poort ' +
      'en die is gedekt.',
  ],
  ['rotate_invite_code', 'Beheerderspoort. Gemeten: poort weg → 7 rood. De uitnodigingscode is de enige route naar binnen, dus dit is de zwaarste van de reeks.'],
  ['set_invite_revoked', 'Beheerderspoort. Gemeten: poort weg → 7 rood.'],
  ['verlaat_groep', 'Lidmaatschapspoort (`not_member`) plus een bevestiging. Gemeten: poort weg → 2 rood.'],
  ['verwijder_lid', 'Beheerderspoort. Gemeten: poort weg → 5 rood.'],
  ['zet_groepsontdekbaarheid', 'Beheerderspoort. Gemeten: poort weg → 3 rood.'],
  [
    'zet_huddledag',
    'Beheerderspoort (QS8-360, migratie 0208). Gemeten: poort weg → 7 rood. ' +
      'Schrijft `groups.huddle_day` en verhuist de `chain_links` en ' +
      '`week_reviews` van de lopende periode mee — dat laatste is de reden dat ' +
      'hij bestaat: een kale PATCH liet een openstaande weekafsluiting ' +
      'onbereikbaar achter. Naast de beheerderspoort toetst hij beide ' +
      'periodestarts op hun eigen huddledag en op vandaag; die komen van de ' +
      'client, want de groepsklok hoort in `shared/time`.',
  ],
  ['zet_groepszichtbaarheid', 'Beheerderspoort (besluit A41). Gemeten: poort weg → 5 rood.'],
  [
    'herorden_weekplan',
    'Eigenaarspoort. ⚠️ **Was ongedekt tot QS8-286: nul rood van 995.** Elke bestaande test ' +
      'riep hem aan als de eigenaar op zijn eigen doel, dus de poort weghalen veranderde ' +
      'niets. Gemeten: mét het nieuwe blok in `definerpoorten.test.ts` → 2 rood, met een ' +
      'effectassertie op de volgorde en niet op de foutreden.',
  ],
  [
    'vraag_deadline_verschuiving',
    'Eigenaarspoort. ⚠️⚠️ **De zwaarste van QS8-286, want een ander argument leunde erop.** ' +
      'QS8-282 verklaarde `beslis_deadline_verzoek` veilig met: die functie heeft geen ' +
      'eigenaarstoets, maar een verzoek kán alleen door de eigenaar aangemaakt zijn — díe ' +
      'toets staat hier. Die redenering klopt en de schakel was door niets bewaakt: nul rood ' +
      'van 995. Valt de poort weg, dan maakt een groepsgenoot een verzoek voor jouw doel en ' +
      'keurt een derde lid het goed. Gemeten met het nieuwe blok → 5 rood.',
  ],
  [
    'trek_deadline_verzoek_in',
    'Aanvragerspoort (`not_yours`). ⚠️ **Was ongedekt tot QS8-286: nul rood van 995.** ' +
      'Gemeten met het nieuwe blok → 3 rood, met een effectassertie op de status.',
  ],
  [
    'create_group',
    'Géén losse poort, en dat is hier geen tekort: alles wat de functie schrijft is op de ' +
      'aanroeper gescopeerd (`created_by = auth.uid()`, en de beheerdersrij gaat naar ' +
      '`auth.uid()`). Er is geen slachtoffer om voor te schrijven. ⚠️ **De vorm die hier wél ' +
      'iets zegt is niet "haal de poort weg" maar "schrijf voor iemand anders"** — dezelfde ' +
      'les als bij `zet_week_startdag` (QS8-282), waar "zo niet te meten" stilletjes "niet ' +
      'gemeten" werd. Gemeten door de beheerdersrij naar een ánder profiel te laten wijzen: ' +
      '**66 rood**. De scoping is dus wél gedekt, alleen niet door de vorm die bij de andere ' +
      'RPCs werkt.',
  ],
  [
    'join_group_with_code',
    'Idem: de code is de sleutel en de lidmaatschapsrij gaat naar `auth.uid()`. Zelfde ' +
      'mutatievorm en zelfde meting als `create_group`: **109 rood**.',
  ],

  // --- RPC's die `authenticated` níét mag aanroepen --------------------------
  ['herstel_weekdoelstatus', 'Geen EXECUTE voor `authenticated`; de grant is de grendel. Bewaakt door `tests/rls/functiegrants.test.ts`.'],
  ['keur_vastgelopen_goedkeuringen_goed', 'Idem: rollover-functie zonder EXECUTE voor `authenticated`.'],
  ['weekplanstap_naar_weekdoel', 'Idem. ⚠️ De naam suggereert een gebruikershandeling; het recht zegt van niet. Verandert dat, dan hoort hij naar het blok hierboven en heeft hij een test nodig.'],

  ['slaap_stille_groepen', 'Geen EXECUTE voor `authenticated`; de grant is de grendel. Rollover-functie. Bewaakt door `tests/rls/functiegrants.test.ts`.'],
  [
    'verdien_badges',
    'Idem. ⚠️ Er staat een tweede grendel naast, en die is er niet voor niets: ' +
      '`tests/rls/badges.test.ts` toetst dat een ingelogde gebruiker hem voor niemand kan ' +
      'aanroepen — ook niet voor zichzelf. Zou het recht ooit terugkomen, dan is dat daar ' +
      'rood en niet stil.',
  ],

  // --- Triggerfuncties: geen eigen poort ------------------------------------
  ['award_points_on_approval', 'Triggerfunctie. Autorisatie is de policy op de goedkeuring die hem aftrapt.'],
  ['mark_weekly_goal_pending', 'Triggerfunctie. Autorisatie is `completions_insert`.'],
  [
    'ontkoppelen_trekt_verzoek_in',
    'Triggerfunctie. Autorisatie is `goal_group_links_delete` — alleen de eigenaar van het ' +
      'doel of een beheerder van de groep mag die rij weghalen, en dat is precies wie het ' +
      'verzoek mag laten vervallen. ⚠️ Schrijft in `deadline_requests`, en dat is een ' +
      'kerntabel: zet uitsluitend een openstaand verzoek op `withdrawn` en raakt een beslist ' +
      'verzoek niet aan (`status = \'open\'` in de `where`), zodat geschiedenis blijft staan. ' +
      'Bestaat omdat ontkoppelen anders wél de strafwaarschuwing van QS8-370 sloot en níet de ' +
      'goedkeurknop; gemeten in de security-ronde van 09-09-2026, en bewaakt door ' +
      '`tests/rls/uitstelbeslisser-ziet-de-straf.test.ts` — de trigger weghalen maakt "en ' +
      'ontkoppelen sluit ook de knop" rood.',
  ],
  ['recalc_goal_max_points', 'Triggerfunctie. Rekent af op `weekly_goals`; autorisatie is de policy op die schrijfactie.'],
  ['koppeling_zet_beoordeelbaar_om', 'Triggerfunctie op `goal_group_links`; autorisatie is de policy op die tabel.'],
  [
    'noteer_ontkoppeling',
    'Triggerfunctie. ⚠️ Schrijft `goals.losgekoppeld_op` voor een `old.goal_id` die ' +
      'hij ongecontroleerd overneemt, en leunt volledig op de DELETE-policy van ' +
      '`goal_group_links`. Het scherpste voorbeeld van "geen eigen poort is iets ' +
      'anders dan in orde".',
  ],
  ['noteer_beoordelaar_weg_groep', 'Triggerfunctie op `groups`; autorisatie is de policy en de pin op die tabel.'],
  ['noteer_beoordelaar_weg_lid', 'Triggerfunctie op `group_members`; idem.'],
  [
    'wek_groep',
    'Triggerfunctie op `chat_messages`, `week_reviews` en `chain_links`. Zet een slapende ' +
      'groep terug op `active`; de waarden zijn hardgecodeerd en de rij komt uit ' +
      '`new.group_id`, die door `is_group_member()` in de INSERT-policy van elke brontabel ' +
      'begrensd is. Staat met dezelfde reden in `scripts/pinuitzonderingen-controle.mjs`.',
  ],
  ['wek_groep_via_review', 'Idem, op `week_review_replies`.'],
]);

/**
 * Scheidingstekens die in geen enkele functiedefinitie voorkomen.
 *
 * ⚠️⚠️ **Allebei als JavaScript-stuurteken de SQL in, en niet als tekst.** De
 *    eerste versie schreef de rijscheiding als `'\\x03'` ín de SQL-string, en
 *    Postgres leest dat als vier gewone tekens — geen stuurteken. De uitvoer werd
 *    dus nooit gesplitst: alles kwam als één blok binnen, de naam van de
 *    alfabetisch eerste functie kreeg de bron van álle andere, en het script
 *    meldde precies één "onbekende" functie die niets fout deed.
 *
 *    Het verraderlijke is dat die uitkomst er plausibel uitzag. Hij vond er één,
 *    met een naam die er relevant uitzag, en pas het nameten van díe functie liet
 *    zien dat ze niet eens in een kerntabel schrijft.
 */
const SCHEIDING = '\x02';
const RIJ = '\x03';

const VRAAG = `
  select p.proname
      || '${SCHEIDING}' || (case when p.prorettype = 'trigger'::regtype then 'ja' else 'nee' end)
      || '${SCHEIDING}' || (case when has_function_privilege('authenticated', p.oid, 'EXECUTE') then 'ja' else 'nee' end)
      || '${SCHEIDING}' || p.prosrc
      || '${RIJ}'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
  order by p.proname
`;

/**
 * Haalt SQL-commentaar weg vóór er iets besloten wordt.
 *
 * ⚠️ Zonder dit slaat de toets aan op een zin die uitlegt wat een functie juist
 *    níét doet. Dat is op 27-08-2026 bij `pin:controle` gebeurd, en de reparatie
 *    was toen de zín herschrijven in plaats van de code.
 *
 * @param {string} definitie
 * @returns {string}
 */
export function zonderCommentaar(definitie) {
  return definitie.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Schrijft deze functie in een kerntabel?
 *
 * ⚠️ `\\M` in de SQL-regex bestaat in JavaScript niet; hier staat `\\b` met een
 *    expliciete uitsluiting van een liggend streepje, anders matcht `goals` ook
 *    in `goal_group_links` en `weekly_goals` in `weekly_goals_archief`.
 *
 * @param {string} definitie
 * @returns {boolean}
 */
export function schrijftNaarKerntabel(definitie) {
  const schoon = zonderCommentaar(definitie);
  const tabellen = KERNTABELLEN.join('|');
  const patroon = new RegExp(
    `(insert\\s+into|update|delete\\s+from)\\s+(only\\s+)?(public\\.)?"?(${tabellen})"?(?![\\w-])`,
    'i',
  );
  return patroon.test(schoon);
}

/**
 * Leest deze functie uit een kerntabel?
 *
 * ⚠️ **`from` en `join`, en niet "komt de tabelnaam erin voor"** — QS8-181. Dat
 *    tweede vindt ook de naam in een `insert into`, in een kolomnaam en in een
 *    `raise`-tekst, en dan meldt het register functies waar niets aan de hand is.
 *    Een controle die alles meldt, leer je te negeren.
 *
 * ⚠️ Zelfde `(?![\w-])` als hierboven, en om dezelfde reden: zonder die
 *    uitsluiting matcht `from goal_group_links` op `goals` en
 *    `join weekly_goals_archief` op `weekly_goals`.
 *
 * @param {string} definitie
 * @returns {boolean}
 */
export function leestKerntabel(definitie) {
  const schoon = zonderCommentaar(definitie);
  const tabellen = KERNTABELLEN.join('|');
  const patroon = new RegExp(
    `(from|join)\\s+(only\\s+)?(public\\.)?"?(${tabellen})"?(?![\\w-])`,
    'i',
  );
  return patroon.test(schoon);
}

/**
 * Welk register deze functie aangaat, of `null` als geen van beide.
 *
 * ⚠️ **Schrijven wint van lezen, en dat is geen willekeur.** Bijna elke schrijver
 *    leest óók — een `update … where owner_id = …` staat in beide patronen. Het
 *    schrijfregister is het strengere van de twee (het vraagt een gemeten
 *    poort), dus daar hoort hij thuis; hem in allebei zetten zou dezelfde functie
 *    twee redenen laten dragen die uit elkaar kunnen lopen.
 *
 * ⚠️ **De leeskant scopet op een aanroepbare niet-triggerfunctie**, en de reden
 *    staat bij `LEESREGISTER`: een trigger heeft geen aanroeper om te toetsen, en
 *    een functie zonder grant wordt door `functiegrants.test.ts` bewaakt.
 *
 * @param {{trigger: boolean, aanroepbaar: boolean, definitie: string}} functie
 * @returns {'schrijft' | 'leest' | null}
 */
export function soortVan({ trigger, aanroepbaar, definitie }) {
  if (schrijftNaarKerntabel(definitie)) return 'schrijft';
  if (!trigger && aanroepbaar && leestKerntabel(definitie)) return 'leest';
  return null;
}

/**
 * Uit de ruwe psql-uitvoer: de definer-functies die een kerntabel aangaan.
 *
 * @param {string} uitvoer
 * @returns {{naam: string, trigger: boolean, aanroepbaar: boolean, soort: string}[]}
 */
export function ontleed(uitvoer) {
  return uitvoer
    .split(RIJ)
    .map((blok) => blok.trim())
    .filter((blok) => blok.length > 0)
    .map((blok) => {
      const [naam, trigger, aanroepbaar, ...rest] = blok.split(SCHEIDING);
      // ⚠️ `'ja'`/`'nee'` en niet een boolean. `||` in Postgres maakt van een
      //    boolean de tekst `true`/`false`, niet `t`/`f` — de eerste versie
      //    vergeleek met `'t'` en meldde daardoor "0 RPC's, 0 triggerfuncties"
      //    boven een lijst van 22. Het getal klopte, de uitsplitsing loog.
      return {
        naam,
        trigger: trigger === 'ja',
        aanroepbaar: aanroepbaar === 'ja',
        definitie: rest.join(SCHEIDING),
      };
    })
    .map((f) => ({ ...f, soort: soortVan(f) }))
    .filter((f) => f.soort !== null)
    .map(({ naam, trigger, aanroepbaar, soort }) => ({ naam, trigger, aanroepbaar, soort }));
}

/**
 * Legt de gevonden functies naast één register — tweezijdig.
 *
 * ⚠️ `soort` is optioneel en filtert vooraf. Zonder filter kijkt hij naar alles
 *    wat je hem geeft; dat is wat de tests doen, en wat het schrijfregister deed
 *    toen het het enige register was.
 *
 * @param {{naam: string, soort?: string}[]} gevonden
 * @param {Map<string, string>} register
 * @param {string} [soort]
 */
export function beoordeel(gevonden, register = REGISTER, soort = undefined) {
  const eigen = soort === undefined ? gevonden : gevonden.filter((f) => f.soort === soort);
  const gezien = new Set(eigen.map((f) => f.naam));
  return {
    onbekend: eigen.filter((f) => !register.has(f.naam)).map((f) => f.naam),
    verdwenen: [...register.keys()].filter((naam) => !gezien.has(naam)),
  };
}

/**
 * Het leesregister: elke definer-**RPC** die `authenticated` mag aanroepen en
 * die uit een kerntabel léést, met waar zijn autorisatie zit — QS8-181.
 *
 * ⚠️⚠️ **Waarom dit naast het schrijfregister staat en niet erin.** Het register
 *    hierboven telt wie er schrijft; de dossierrij van 15-08-2026 gaat over iets
 *    breders. `SECURITY DEFINER` omzeilt RLS in beide richtingen: een functie die
 *    alleen `select`t komt net zo hard langs elke policy heen, en dan is de vraag
 *    niet "mag hij dit veranderen" maar **"zijn deze rijen van de aanroeper om te
 *    zien"**. Dat is precies de vraag waar domeinregel 7 aan hangt, en die stond
 *    voor deze klasse in geen enkel rapport. 📏 Op 10-09-2026 waren het er
 *    dertig, naast de drieënveertig schrijvers.
 *
 * ⚠️ **De grens van dit register is zelf een keuze, en die staat hier met
 *    zoveel woorden** — dezelfde les als bij `KERNTABELLEN`. Buiten beeld blijven
 *    twee klassen, elk omdat hun grendel érgens anders bewaakt wordt:
 *
 *    | Buiten beeld | Waar zijn grendel dan wél staat |
 *    | -- | -- |
 *    | een **triggerfunctie** die leest | de policy op de schrijfactie die hem aftrapt — hij heeft per constructie geen aanroeper |
 *    | een functie die `authenticated` **niet** mag aanroepen | de `grant`, en die legt `tests/rls/functiegrants.test.ts` naast de migratieregels |
 *
 *    Verschuift een van die twee — een interne functie die alsnog een grant
 *    krijgt — dan komt hij hier vanzelf bij en wordt deze controle rood tot
 *    iemand opschrijft waarom hij open mag.
 */
const LEESREGISTER = new Map([
  // --- Predicaten: geven een boolean over de aanroeper zélf -----------------
  //
  // ⚠️ Deze acht zijn de predicaten. Ze lezen `group_members` als eigenaar
  //    om de recursie te vermijden die policies op die tabel anders veroorzaken,
  //    en ze scopen allemaal hard op `auth.uid()`: de uitkomst gaat over de
  //    aanroeper en over niemand anders. `tests/rls/hulpfuncties.test.ts` pint
  //    hun onderlinge model vast (QS8-146).
  ['is_group_member', 'Predicaat op `m.user_id = auth.uid()`. Geeft alleen iets over de aanroeper zelf.'],
  ['is_group_admin', 'Predicaat op `m.user_id = auth.uid()` plus `role = admin`.'],
  ['mag_groep_lezen', 'Predicaat op `m.user_id = auth.uid()`. ⚠️ Kijkt bewust niet naar `groups.status`: dit is de leesvariant, en een gearchiveerde groep blijft leesbaar voor wie erin zat.'],
  ['lid_van_open_groep', 'Predicaat op `m.user_id = auth.uid()` plus `zichtbaarheid = open`. Draagt de grendel van A54.'],
  ['shares_group_with_user', 'Predicaat op `mine.user_id = auth.uid()`; béíde kanten moeten actief lid zijn.'],
  ['shares_group_with_goal', 'Predicaat op `m.user_id = auth.uid()`; de kijker én de eigenaar moeten actief lid zijn en de groep niet gearchiveerd.'],
  ['deelt_groep_met_eigenaar', 'Leunt volledig op `shares_group_with_user()`, en die scopet op `auth.uid()`. Leest `goals` alleen om de eigenaar op te zoeken.'],
  ['deelt_open_groep_met_doel', 'Predicaat op `m.user_id = auth.uid()` in een groep met `zichtbaarheid = open`.'],

  // --- Eigen rijen: de scoping is `auth.uid()` in de query zelf --------------
  ['dagafvinkingen_over', 'Ratelimiet-teller. Telt uitsluitend `g.owner_id = auth.uid()` en geeft 0 zonder sessie.'],
  ['weekdoelen_over', 'Ratelimiet-teller. Idem: alleen eigen rijen, 0 zonder sessie.'],
  ['weekplanstappen_over', 'Ratelimiet-teller. Idem.'],
  ['weekpas_standen', 'Scoping in de `where`: `auth.uid() is not null and g.owner_id = auth.uid()`.'],
  ['mijn_bevestigingsstanden', 'Scoping in de `where`: `g.owner_id = auth.uid()`. Geeft per weekdoel alleen `gedaan`/`nodig`, geen namen.'],
  ['verwijder_mijn_account', 'Alles hangt aan `mij := auth.uid()`; leest `group_members` alleen om de laatste-beheerder-toets te doen.'],
  ['vraag_ai_job', 'Poort op `auth.uid()`, en `p_goal_id` moet van de aanroeper zijn (`not_your_goal`). Leest `goals`/`milestones` alleen daarvoor.'],
  ['start_weekplanstap', 'Eigenaarspoort (`not_owner`) vóór de doorgifte aan `weekplanstap_naar_weekdoel()`.'],

  // --- Groepsoppervlakken: een lidmaatschapspoort in de functie zelf ---------
  //
  // ⚠️ Dit is de klasse waar domeinregel 7 aan hangt. Bij élk van deze negen geldt
  //    de vraag uit CLAUDE.md: kan hieruit iemands gemiste week worden afgeleid,
  //    en kan iemand dat met één API-verzoek uitlezen buiten de UI om?
  ['groep_teller', 'Lidmaatschapspoort: `where is_group_member(p_group_id)` — geen lid, nul rijen. Telt alleen omhoog (domeinregel 7).'],
  ['ketting_stand', 'Lidmaatschapspoort: `where is_group_member(p_group_id)`. Geeft `{schakels, in_aanmerking, voltallig}` en nooit een naam.'],
  ['groep_klassement', 'Poort op `lid_van_open_groep(p_group_id)`: in een beschermde groep nul rijen (A54). Geen delta en geen datum, dus geen gemiste week af te leiden.'],
  ['zichtbare_reeksen_van_groep', 'Lidmaatschapspoort in de `where` plus `shares_group_with_goal()` per doel; `best_streak` en `last_cycle_start` zijn gemaskeerd buiten een open groep (0078).'],
  ['verzoekers_eerder_lid', 'Beheerderspoort: `and is_group_admin(p_group_id)` in de `where`.'],
  ['getuigenissen', 'Scoping op `c.beneficiary_user_id = auth.uid()` plus `deelt_groep_met_eigenaar()` (QS8-306). ⚠️ Bestaat als RPC en niet als policy omdat RLS geen kolommen kan beperken — de kolomlijst ís hier de grendel.'],
  ['straffen_bij_uitstelverzoek', 'Poort op `shares_group_with_goal()` én `mag_groep_lezen()`. ⚠️ Geeft één kolom terug — `goal_id`, en niet de tekst, de foto, de getuige of de stand. Zelfde vorm en zelfde reden als `getuigenissen()`; zie domeinregel 11.'],
  ['meld', 'Lidmaatschapspoort (`not_member`) plus een ratelimiet. Leest `chat_messages` en `group_members` alleen om de gemelde persoon te bepalen en geeft geen rijen terug.'],
  ['vraag_lidmaatschap_aan', 'Leest `groups`/`group_members` alleen om `ontdekbaar`, archivering, blokkade en bestaand lidmaatschap te toetsen; geeft `{ok}` en verder niets, en is geratelimit.'],

  // --- Met opzet open voor iedere ingelogde gebruiker ------------------------
  [
    'ontdek_groepen',
    'Géén lidmaatschapspoort, en dat ís de functie: dit is de ontdekpagina. Wat hem begrenst staat in de `where` — ' +
      'alleen `g.ontdekbaar`, niet gearchiveerd, en niet langs een blokkade heen (QS8-232, route 4). ' +
      'De groep heeft zelf besloten vindbaar te zijn; `zet_groepsontdekbaarheid()` is een beheerders-RPC.',
  ],
  [
    'invite_preview',
    'Géén lidmaatschapspoort: de uitnodigingscode ís de sleutel. Drie grendels dragen dat — één antwoord (`null`) voor ' +
      'ingetrokken, verlopen én onbestaand zodat de functie geen orakel is (0019), een teller van 60 per groep per uur ' +
      'in hetzelfde statement als de lezing, en `avatar_url` altijd `null` omdat dat pad sinds 0126 de `auth.uid()` ' +
      'van elk lid draagt (0128). Een niet-ingelogde kijker krijgt alleen voornamen en geen doeltitels.',
  ],

  // --- De twee die geen poort hádden, en dat was de opbrengst van deze ronde -
  //
  // ⚠️⚠️ **Ze zijn hulpfuncties gewórden zonder dat iemand de vraag over ze
  //    gesteld heeft** — precies waarvoor dit register bestaat. Geen van beide is
  //    dicht te zetten met een `revoke`: `bevestigingsstand()` en
  //    `openstaande_beoordelingen()` zijn `SECURITY INVOKER` en roepen de eerste
  //    aan, en `chain_links_select` roept de tweede aan in een policy-expressie,
  //    die als de bevragende rol draait. De eerste heeft sinds 0249 een poort met
  //    drie takken; de tweede lekt niets over een persoon en staat als Laag-rij
  //    in `docs/ENGINEER-REVIEW.md`, met de voorwaarde waaronder hij zwaarder
  //    wordt.
  [
    'vereiste_goedkeuringen',
    'Poort sinds 0249 (QS8-181): `auth.uid() is null or auth.uid() = p_owner or mag_groep_lezen(p_group_id)`. ' +
      '⚠️ **Hij had er geen, en dat was een orakel op `group_members`.** Zijn antwoord hangt van een pérsoon af — ' +
      '`beoordelaars` telt de actieve leden mínus `p_owner`. 📏 Gemeten met vier leden en `approval_rule = majority`, ' +
      'als iemand die geen lid is en aan wie `groups` en `group_members` nul rijen geven: 2 voor een lid, 3 voor een ' +
      'niet-lid. Een weggestuurd lid houdt beide uuid\'s en kon zo blijven volgen wie er nog in de groep zit. ' +
      '⚠️ De derde tak is geen beleefdheid: `bevries_goedkeuringsdrempel()` schrijft de uitkomst in een ' +
      '`not null`-kolom bij het insert op `completions`, en `completions_insert` eist géén lidmaatschap. Zonder ' +
      '`auth.uid() = p_owner` valt de indiening om met 23502. Beide takken apart geijkt in ' +
      '`tests/rls/goedkeuringsdrempel-verraadt-niets.test.ts`. ' +
      '⚠️ Een `revoke` kon niet: `bevestigingsstand()` én `openstaande_beoordelingen()` zijn `SECURITY INVOKER` ' +
      'en roepen hem aan.',
  ],
  [
    'groepsdatum',
    '⚠️ **Geen poort.** Geeft de datum van vandaag in de tijdzone van een groep, voor elk uuid. Wat eruit lekt is de ' +
      'tijdzone van de groep en niets anders. Staat in `chain_links_select`, dus `authenticated` móet hem kunnen ' +
      'aanroepen.',
  ],
]);

/**
 * De uitleg die bij een onbekende schrijver hoort.
 *
 * ⚠️ Staat apart van `hoofd()` om coderegel 15: die functie liep over de vijftig
 *    toen het tweede register erbij kwam, en `scripts/` is sinds QS8-291 een
 *    ratel — het aantal lange functies mag daar alleen dalen.
 */
function meldSchrijvers(namen) {
  console.error(`✗ ${namen.length} definer-functie(s) schrijven in een kerntabel zonder reden:\n`);
  for (const f of namen) console.error(`    ${f}()`);
  console.error(
    '\nEen SECURITY DEFINER-functie draait als zijn eigenaar, dus geen enkele policy\n' +
      'houdt hem tegen — zijn poort is de `if` in zijn eigen body, en `rls:dekking`\n' +
      'ziet die niet.\n\n' +
      'Mag `authenticated` hem aanroepen? Dan hoort er een test te staan die rood\n' +
      'wordt als die poort weggehaald wordt — zie tests/rls/definerpoorten.test.ts.\n' +
      'Is het een triggerfunctie? Dan zit de autorisatie in de policy op de\n' +
      'schrijfactie die hem aftrapt; schrijf op wélke.\n' +
      'Zet hem daarna met die reden in REGISTER in scripts/definers-controle.mjs.',
  );
}

/**
 * De uitleg die bij een onbekende lezer hoort — QS8-181.
 *
 * ⚠️ Een eigen tekst en niet die van de schrijvers, want de vraag is een andere:
 *    niet "waar is de poort die dit tegenhoudt" maar "zijn deze rijen van de
 *    aanroeper om te zien".
 */
function meldLezers(namen) {
  console.error(`✗ ${namen.length} definer-RPC('s) lezen uit een kerntabel zonder reden:\n`);
  for (const f of namen) console.error(`    ${f}()`);
  console.error(
    '\n`SECURITY DEFINER` omzeilt RLS in beide richtingen: ook een `select` komt\n' +
      'langs elke policy heen. De vraag is hier niet of hij iets mag veranderen\n' +
      'maar of deze rijen van de aanroeper zijn om te zien.\n\n' +
      'Twee vragen, uit CLAUDE.md bij domeinregel 7: kan hieruit iemands gemiste\n' +
      'week worden afgeleid, en kan iemand dat met één API-verzoek uitlezen\n' +
      'buiten de UI om?\n\n' +
      'Schrijf op waar de poort zit — een `where is_group_member(...)`, een\n' +
      '`owner_id = auth.uid()`, of met zoveel woorden dat er geen poort is en\n' +
      'waarom dat hier mag. Zet dat in LEESREGISTER in\n' +
      'scripts/definers-controle.mjs.',
  );
}

function psql(vraag) {
  return execFileSync('psql', psqlArgumenten(vraag), { encoding: 'utf8' });
}

function hoofd() {
  let gevonden;
  try {
    gevonden = ontleed(psql(VRAAG));
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'definers-controle',
        leest: 'Deze controle leest `pg_proc` en niet de migratiebestanden.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const schrijvers = beoordeel(gevonden, REGISTER, 'schrijft');
  const lezers = beoordeel(gevonden, LEESREGISTER, 'leest');

  if (schrijvers.onbekend.length > 0) {
    meldSchrijvers(schrijvers.onbekend);
    return 1;
  }

  if (lezers.onbekend.length > 0) {
    meldLezers(lezers.onbekend);
    return 1;
  }

  const verdwenen = [...schrijvers.verdwenen, ...lezers.verdwenen];
  if (verdwenen.length > 0) {
    console.error(`✗ ${verdwenen.length} functie(s) in het register bestaan niet meer:\n`);
    for (const f of verdwenen) console.error(`    ${f}()`);
    console.error(
      '\nEen register dat achterloopt, geeft redenen voor code die weg is. Haal ze eruit.',
    );
    return 1;
  }

  const schrijft = gevonden.filter((f) => f.soort === 'schrijft');
  const rpcs = schrijft.filter((f) => !f.trigger && f.aanroepbaar).length;
  const triggers = schrijft.filter((f) => f.trigger).length;
  console.log(
    `definers-controle: ${schrijft.length} definer-functies schrijven in een kerntabel ` +
      `(${rpcs} aanroepbare RPC's, ${triggers} triggerfuncties) en ` +
      `${gevonden.length - schrijft.length} lezen er alleen uit, allemaal met een reden.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
