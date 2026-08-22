/**
 * De Nederlandse catalogus — QS8-113.
 *
 * ⚠️ **Dit bestand is de bron.** Elke andere taal is een vertaling hiervan, en
 *    `catalogus.test.ts` eist dat elke taal exact dezelfde sleutels heeft. Een
 *    sleutel toevoegen zonder hem te vertalen maakt die test rood — met opzet:
 *    een half vertaalde taal is erger dan een taal die er nog niet is, want de
 *    gebruiker ziet dan willekeurig twee talen door elkaar.
 *
 * ⚠️ **Sleutels zijn `module.onderwerp.detail`**, niet de Nederlandse zin zelf.
 *    Een zin als sleutel leest prettig tot je hem wilt bijschaven: dan verandert
 *    de sleutel mee en zijn alle vertalingen stil verlopen zonder dat iets rood
 *    wordt.
 *
 * ⚠️ **Parameters tussen accolades**, en de waarde is altijd al opgemaakt door de
 *    aanroeper. Er wordt hier niet gerekend, niet geformatteerd en geen datum
 *    omgezet — dat hoort in `shared/time` (correctheidsregel 7).
 */
export const nl = {
  // ---------------------------------------------------------------------------
  // Systeemberichten in de groepschat — de zinnen uit migratie 0059
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Deze acht zijn de eerste die écht vertaald moeten worden. Een chatbericht
  //    is een onveranderlijke kopie; sinds 0059 wordt de zin bij het tónen
  //    gemaakt en niet bij het schrijven, dus vanaf hier is meertaligheid in de
  //    chat een kwestie van dit bestand.
  'systeembericht.member_joined': '{naam} doet mee.',
  'systeembericht.completion_pending': '{naam} heeft een week afgerond en wacht op bevestiging.',
  'systeembericht.completion_approved': '{actor} bevestigde de week van {naam}.',
  'systeembericht.milestone_done': '{naam} heeft een mijlpaal gehaald.',
  'systeembericht.goal_completed': '{naam} heeft een doel afgerond.',
  'systeembericht.commitment_unlocked': '{naam} heeft een beloning vrijgespeeld.',
  'systeembericht.commitment_due':
    'De inzet die {naam} zelf heeft ingesteld, is verschuldigd geworden.',
  'systeembericht.deadline_requested': '{naam} vraagt de groep om een streefdatum te verschuiven.',
  'systeembericht.group_sleeping': 'Deze groep is stil geworden. Eén bericht maakt hem weer wakker.',

  /** Iemand die er niet meer is. Zie oppervlak 18 in beslisdocument 002. */
  'algemeen.oud_lid': 'Een oud-lid',

  // ---------------------------------------------------------------------------
  // Aanmelden en inloggen — de referentie-implementatie van QS8-113
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Aanmelden, inloggen en het profiel — QS8-115
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Een inlogfout zegt nooit óf het e-mailadres bestaat. Dat is geen vaagheid
  //    maar bescherming: een scherm dat "dit account bestaat niet" zegt, is een
  //    gratis manier om te controleren wie er lid is. Houd dat vast in élke
  //    vertaling.
  'auth.fout.ongeldig': 'Dit e-mailadres en wachtwoord horen niet bij elkaar.',
  'auth.fout.bestaat_al': 'Er bestaat al een account met dit adres. Log in of herstel je wachtwoord.',
  'auth.fout.niet_bevestigd': 'Bevestig eerst je e-mailadres. Check je inbox.',
  'auth.fout.te_vaak': 'Te veel pogingen. Wacht even en probeer het opnieuw.',
  'auth.fout.zwak_wachtwoord': 'Dit wachtwoord voldoet niet. Gebruik een langere zin.',
  'auth.fout.geen_verbinding': 'Geen verbinding. Controleer je internet en probeer opnieuw.',
  'auth.fout.algemeen': 'Er ging iets mis. Probeer het opnieuw.',
  'auth.fout.invoer': 'Controleer je invoer.',
  'auth.fout.uitloggen': 'Uitloggen lukte niet. Probeer het opnieuw.',

  'auth.verwijder.verlopen': 'Je sessie is verlopen. Log opnieuw in en probeer het dan.',
  'auth.verwijder.enige_beheerder':
    'Je bent de enige beheerder van een groep waar nog anderen in zitten. Maak ' +
    'eerst iemand anders beheerder — anders blijft die groep achter zonder dat ' +
    'iemand hem kan beheren.',
  'auth.verwijder.mislukt': 'Je account verwijderen lukte niet. Probeer het opnieuw.',
  'auth.verwijder.mislukt_kort': 'Je account verwijderen lukte niet.',

  'auth.oauth.alleen_browser':
    'Inloggen met Apple of Google werkt nu alleen in de browser. Gebruik voorlopig je e-mailadres.',
  'auth.oauth.mislukt': 'Inloggen via deze aanbieder lukte niet. Probeer je e-mailadres.',

  'profiel.laden_mislukt': 'Je profiel kon niet geladen worden.',
  'profiel.opslaan_mislukt': 'Opslaan lukte niet. Probeer het opnieuw.',

  // ⚠️ Zod-meldingen. Deze staan in schema's die op moduleniveau gebouwd worden,
  //    dus de aanroep moet lui zijn: `{ error: () => t(...) }` en niet
  //    `{ error: t(...) }`. Zie de kop van `auth/schemas.ts`.
  'validatie.wachtwoord_kort': 'Gebruik minstens 12 tekens. Een korte zin werkt prima.',
  'validatie.wachtwoord_lang': 'Meer dan 72 tekens kan niet — bcrypt kapt daarna af.',
  'validatie.email': 'Dit ziet er niet uit als een e-mailadres.',
  'validatie.wachtwoord_leeg': 'Vul je wachtwoord in.',
  'validatie.weekdag': 'Een week begint op een dag tussen zondag en zaterdag.',
  'validatie.tijdzone': 'Onbekende tijdzone.',
  'validatie.naam_leeg': 'Vul een naam in.',
  'validatie.naam_lang': 'Maximaal 80 tekens.',
  'validatie.tijd': 'Gebruik een tijd als 20:00.',

  // ---------------------------------------------------------------------------
  // Commitment devices — QS8-83, QS8-84
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **De toon is een acceptatiecriterium en geen smaak.** QS8-84 vraagt
  //    letterlijk om nuchter en niet vernederend: iemand heeft dit zichzelf
  //    vooraf opgelegd en bevestigd. Er wordt niets uitgeroepen, niets verweten
  //    en niets aangemoedigd — er wordt verteld wat er is gebeurd. Er staat een
  //    test op die uitroeptekens en verwijtende woorden weigert, in béíde talen.
  'commitment.reward.set.titel': 'Staat klaar',
  'commitment.reward.set.uitleg': 'Deze beloning komt vrij zodra je dit doel op tijd afrondt.',
  'commitment.reward.unlocked.titel': 'Vrijgespeeld',
  'commitment.reward.unlocked.uitleg': 'Je hebt je doel gehaald. Je groep heeft het gezien.',
  'commitment.reward.cancelled.titel': 'Vervallen',
  'commitment.reward.cancelled.uitleg': 'Deze beloning is niet meer van toepassing.',

  'commitment.penalty.set.titel': 'Staat vast',
  'commitment.penalty.set.uitleg':
    'Dit gaat in werking als je streefdatum verstrijkt zonder dat het doel af is. ' +
    'Een week missen doet er niets aan.',
  'commitment.penalty.due.titel': 'Verschuldigd',
  'commitment.penalty.due.uitleg':
    'Je streefdatum is verstreken. De groep die je gekozen hebt, kan dit nu lezen.',
  'commitment.penalty.resolved.titel': 'Afgehandeld',
  'commitment.penalty.resolved.uitleg': 'Deze inzet is voldaan.',
  'commitment.penalty.cancelled.titel': 'Vervallen',
  'commitment.penalty.cancelled.uitleg':
    'Je hebt je doel afgerond, dus deze inzet gaat niet meer in werking.',

  'commitment.onbekend.titel': 'Onbekend',
  'commitment.onbekend.uitleg': 'De stand van deze afspraak is niet te bepalen.',

  'commitment.fout.geen_groep': 'Kies een groep die hiervan profiteert als het niet lukt.',
  'commitment.fout.invoer': 'Controleer je invoer.',
  'commitment.fout.vastleggen': 'Vastleggen lukte niet. Probeer het opnieuw.',
  'commitment.fout.intrekken': 'Intrekken lukte niet.',
  'commitment.fout.al_afgegaan':
    'Dit commitment is al in werking getreden en kan niet meer worden ingetrokken.',
  'commitment.fout.laden': 'De beloning en straf konden niet geladen worden.',
  'commitment.fout.spoor': 'De geschiedenis kon niet geladen worden.',

  'validatie.commitment_kort': 'Schrijf op wat je jezelf oplegt.',
  'validatie.commitment_lang': 'Maximaal 500 tekens.',
  'validatie.link': 'Dit is geen geldige link.',

  // ---------------------------------------------------------------------------
  // Bevestigingen — QS8-106. Elke tekst noemt wát de handeling kost.
  // ---------------------------------------------------------------------------
  //
  // ⚠️ "Weet je het zeker?" is geen bevestiging maar een drempel.
  //    `acties.test.ts` eist dat elke uitleg een gevolg benoemt en dat elke titel
  //    op een vraagteken eindigt — die test toetst de catalogus en niet meer het
  //    oude object.
  'bevestiging.weekdoel_afsluiten.titel': 'Deze week afsluiten?',
  'bevestiging.weekdoel_afsluiten.uitleg':
    'Het weekdoel blijft staan en telt als een gemiste week zodra je week voorbij is. ' +
    'Dat kost één punt en onderbreekt je reeks — tenzij je er een weekpas op zet. ' +
    'Je kunt hem daarna doorschuiven naar volgende week.',
  'bevestiging.weekdoel_afsluiten.knop': 'Afsluiten',

  'bevestiging.weekdoel_verwijderen.titel': 'Dit weekdoel weggooien?',
  'bevestiging.weekdoel_verwijderen.uitleg':
    'Alleen bedoeld voor een vergissing: een dubbele invoer, of een weekdoel onder het ' +
    'verkeerde doel. De rij verdwijnt en er blijft niets van staan. Kan alleen kort na ' +
    'het aanmaken en zolang je nog niets hebt ingediend.',
  'bevestiging.weekdoel_verwijderen.knop': 'Weggooien',

  'bevestiging.weekdoel_doorschuiven.titel': 'Meenemen naar deze week?',
  'bevestiging.weekdoel_doorschuiven.uitleg':
    'Je krijgt hetzelfde weekdoel opnieuw in de week die nu loopt. ' +
    '⚠️ De gemiste week blijft gemist: het punt is al geboekt en je reeks is al ' +
    'onderbroken. Doorschuiven verhuist het werk, het repareert je reeks niet.',
  'bevestiging.weekdoel_doorschuiven.knop': 'Meenemen',

  'bevestiging.doel_verwijderen.titel': 'Dit doel weggooien?',
  'bevestiging.doel_verwijderen.uitleg':
    'Alleen bedoeld voor een doel dat je net per ongeluk hebt aangemaakt. Het kan zolang ' +
    'er niets aan hangt: geen weekdoelen, geen punten, niet gedeeld met een groep. ' +
    'Heeft je doel wél geschiedenis, archiveer het dan — dan blijft alles bewaard.',
  'bevestiging.doel_verwijderen.knop': 'Weggooien',

  'bevestiging.doel_afronden.titel': 'Dit doel afronden?',
  'bevestiging.doel_afronden.uitleg':
    'Elke groep waaraan dit doel hangt, krijgt een bericht dat je het afgerond hebt, en ' +
    'een chatbericht haal je niet meer weg. Je beloning komt vrij en wordt ook gemeld; ' +
    'een straf die je had ingesteld, vervalt. Terugzetten kan niet.',
  'bevestiging.doel_afronden.knop': 'Afronden',

  // ---------------------------------------------------------------------------
  // Feestelijke momenten — QS8-76
  // ---------------------------------------------------------------------------
  'viering.weekdoel.titel': 'Je week is bevestigd',
  'viering.weekdoel.tekst': 'Een buddy heeft je week goedgekeurd. Die telt.',
  'viering.mijlpaal.titel': 'Mijlpaal gehaald',
  'viering.mijlpaal.tekst': 'Een stuk van je doel staat. Dit is er een om even bij stil te staan.',
  'viering.doel.titel': 'Je doel is af',
  'viering.doel.tekst':
    'Je hebt dit van begin tot eind volgehouden. Dat doen de meeste mensen niet.',

  // ---------------------------------------------------------------------------
  // "Vraag je groep om hulp" — QS8-95
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Vier sleutels en niet één, want de zin heeft een meervoudsvorm
  //    en `t()` kan dat niet. Dat is precies de grens van deze catalogus, en hij
  //    is zichtbaar gemaakt in plaats van weggemoffeld: de aanroeper kiest.
  'hulpvraag.opening': 'Ik loop achter op "{doel}".',
  'hulpvraag.tijd_een_week': ' Ik heb nog 1 week te gaan.',
  'hulpvraag.tijd_weken': ' Ik heb nog {weken} weken te gaan.',
  'hulpvraag.slot': ' Iemand een idee?',

  // ---------------------------------------------------------------------------
  // De Risico-radar — QS8-93, QS8-94
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Uitsluitend voor de eigenaar.** `goal_risk` is eigenaar-only (migratie
  //    0050). Kopieer deze teksten nooit naar een groepsscherm: een risicostand
  //    is een afgeleide van gemiste weken, en dat is precies waar domeinregel 7
  //    over gaat.
  //
  // ⚠️ **De toon telt wat er wél is.** "Je hebt drie van de vier weken gemist"
  //    is waar en is precies de zin die iemand de app laat sluiten. "Je haalde
  //    één van de vier weken" zegt hetzelfde zonder het verwijt. Er staat een
  //    test op die het woord "gemist" weigert.
  'risico.label.on_track': 'Op koers',
  'risico.label.at_risk': 'Oppassen',
  'risico.label.behind': 'Achterstand',
  'risico.label.unreachable': 'Deadline onhaalbaar',

  // ⚠️ Aantallen mét hun zelfstandig naamwoord, als eigen sleutel. Zo blijft het
  //    aantal zinnen hieronder twaalf in plaats van achtenveertig, en staat de
  //    meervoudsvorm op één plek per woord. Tot QS8-115 stond er onvoorwaardelijk
  //    "mijlpalen", dus "1 mijlpalen" bestond gewoon.
  'eenheid.mijlpaal_een': '1 mijlpaal',
  'eenheid.mijlpaal_meer': '{n} mijlpalen',
  'eenheid.week_een': '1 week',
  'eenheid.week_meer': '{n} weken',

  'risico.unreachable.datum_is_er':
    'Je streefdatum is er, en er staat nog {mijlpalen} open. Verschuif je datum of haal er werk uit.',
  'risico.unreachable.te_veel_werk':
    'Er staat nog {mijlpalen} open en er zijn nog {weken}. Zelfs met één mijlpaal per week red je dat niet.',
  'risico.unreachable.kaal': 'Er is meer werk over dan er tijd is tot je streefdatum.',

  'risico.behind.niets_afgerond':
    'Je hebt de laatste {weken_bekeken} geen week afgerond, en er staat nog werk open. Dit is het moment om je doel kleiner te maken of je datum te verschuiven.',
  'risico.behind.tempo':
    'Je haalde {gehaald} van je laatste {weken_bekeken}. Om {mijlpalen} in {weken} af te ronden heb je een hoger tempo nodig dan dat.',
  'risico.behind.kaal': 'Je hebt een hoger tempo nodig dan je de laatste weken haalde.',

  // ⚠️ "Telt volledig mee" moet erin blijven staan. De vloer halen betekent dat
  //    de week telt (domeinregel 8); een waarschuwing die dat weglaat, leert de
  //    gebruiker dat de vloer niet goed genoeg is. Er staat een test op.
  'risico.at_risk.vloer':
    'Je haalt je weken, maar bijna altijd op de vloer. Dat telt volledig mee — alleen schuift je plafond zo wel steeds verder weg.',
  'risico.at_risk.tempo':
    'Je hebt {mijlpalen} in {weken} te gaan. Dat vraagt {benodigd} per week; je zit nu op {tempo}.',
  'risico.at_risk.kaal': 'Je loopt nog binnen de lijnen, maar er is weinig ruimte over.',

  'risico.on_track.geen_geschiedenis':
    'Nog geen geschiedenis om iets uit af te leiden — en dat is prima. Een nieuw doel begint op koers.',
  'risico.on_track.tempo':
    'Je haalde {gehaald} van je laatste {weken_bekeken}, met {mijlpalen} in {weken} te gaan. Dat gaat lukken.',
  'risico.on_track.kaal': 'Je tempo is genoeg voor wat er nog ligt.',

  // ---------------------------------------------------------------------------
  // De stand van een weekdoel — QS8-75
  // ---------------------------------------------------------------------------
  //
  // ⚠️ De toon is zakelijk en niet bestraffend. "Niet afgerond" en niet
  //    "mislukt"; "Afgesloten" en niet "opgegeven". Alleen de eigenaar ziet deze
  //    labels — `weekly_goals_select` houdt `missed`, `carried` en `cancelled`
  //    weg bij groepsgenoten — maar domeinregel 7 gaat ook over toon.
  'weekdoel.adempauze': 'Adempauze',
  'weekdoel.meegenomen': 'Meegenomen naar deze week',
  'weekdoel.afgesloten': 'Afgesloten',
  'weekdoel.niet_afgerond': 'Niet afgerond',
  'weekdoel.nog_te_doen': 'Nog te doen',
  'weekdoel.plafond_gehaald': 'Plafond gehaald',
  'weekdoel.vloer_gehaald': 'Vloer gehaald',
  'weekdoel.gehaald': 'Gehaald',
  'weekdoel.wacht_op_buddy': '{wat} — wacht op je buddy',

  // ---------------------------------------------------------------------------
  // Reeks, Ketting en weekpassen — QS8-75, QS8-80, QS8-81
  // ---------------------------------------------------------------------------
  'reeks.geen': 'Nog geen reeks',
  'reeks.een': '1 week op rij',
  'reeks.meer': '{n} weken op rij',

  // ⚠️ De Ketting telt **opdagen** en is onderweg per definitie onaf. Er staat
  //    daarom wat er wél is en nooit wat er mist — geen "nog 2 te gaan", want dat
  //    is dezelfde mededeling met een vriendelijk gezicht. Er staat een test op
  //    die "van 3", "nog N", "te gaan" en "mist" weigert.
  'ketting.niemand': 'Nog niemand doet mee',
  'ketting.net_begonnen': 'De week is net begonnen',
  'ketting.jij_alleen': 'Je schakel ligt er',
  'ketting.voltallig': 'Voltallig — de ketting is rond',
  'ketting.schakels_een': '1 schakel deze week',
  'ketting.schakels_meer': '{n} schakels deze week',

  // ⚠️ Nul is geen mislukking en klinkt hier ook niet zo. "Geen weekpassen" leest
  //    als een tekort; het gaat om iets dat je kúnt verdienen en nog niet hebt.
  'weekpas.geen': 'Nog geen weekpas',
  'weekpas.een': '1 weekpas',
  'weekpas.meer': '{n} weekpassen',
  'weekpas.van_maximum': '{wat} van {maximum}',

  'punten.uitleg': 'Plafond gehaald +2, vloer gehaald +1, week gemist −1, adempauze 0.',

  'weekpas.uitleg':
    'Een weekpas houdt je reeks overeind als je een week mist. Het minpunt voor die week ' +
    'krijg je wél — een pas beschermt je reeks, niet je punten. Je hoeft niets te doen: ' +
    'mis je een week, dan zetten we er automatisch een in. Weekpassen spaar je per doel.',

  'weekpas.vol':
    'Je hebt er {voorraad}, en meer kun je er niet tegelijk hebben. Verdien je er een terwijl je vol zit, dan komt hij vrij zodra je er een gebruikt.',
  'weekpas.nog_een_week': 'Nog één voltooide week',
  'weekpas.nog_weken': 'Nog {n} voltooide weken',
  'weekpas.eerste': '{nog} en je eerste weekpas ligt klaar.',
  'weekpas.volgende': '{nog} tot de volgende.',

  // ---------------------------------------------------------------------------
  // Gedeelde componenten — QS8-115
  // ---------------------------------------------------------------------------
  'chat.van_jou': 'Jij: {tekst}',
  'chat.van_ander': '{naam}: {tekst}',
  'chat.weghalen': 'Weghalen',

  // ⚠️ Geen van beide is een foutmelding met een uitroepteken. Delen dat niet
  //    lukt is een eigenschap van de browser en niet iets dat de gebruiker fout
  //    deed; de zin wijst hem naar wat wél werkt.
  'delen.gekopieerd': 'Gekopieerd — plak hem in je chat',
  'delen.mislukt': 'Delen lukt hier niet — selecteer de link hierboven',

  'stand.punten': 'Punten',
  'stand.langste_reeks': 'Langste reeks',

  'mijlpalen.geen': 'Nog geen mijlpalen',
  'mijlpalen.voortgang': '{done} van {total} mijlpalen',

  'weekstart.label': 'Mijn week begint op',
  'weekstart.hint':
    'Bepaalt wanneer je weekdoelen opnieuw beginnen en wanneer je punten tellen. ' +
    'Later aanpasbaar; een lopende week telt gewoon uit.',

  'weekpas.titel': 'Weekpassen',
  'weekpas.gered': 'Een weekpas heeft je reeks gered.',

  // ---------------------------------------------------------------------------
  // Voltooiingen en peer-goedkeuring — EPIC 6
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Een afgekeurde week heet hier nooit "afgekeurd". "Vertel me meer" is een
  //    vraag en geen oordeel, en dat verschil is het hele punt van peer-review in
  //    dit product: een buddy die om uitleg vraagt, helpt; een buddy die afkeurt,
  //    beoordeelt. Houd dat vast in élke vertaling.
  'voltooiing.notitie_nodig':
    'Schrijf er kort bij wat je gedaan hebt. Je buddy heeft iets nodig om op te reageren.',
  'voltooiing.geweigerd':
    'Je afronding werd geweigerd. Vraagt je groep om een notitie? Eén zin is genoeg; ' +
    'maximaal 2000 tekens.',
  'voltooiing.afronden_mislukt': 'Afronden lukte niet. Probeer het opnieuw.',
  'voltooiing.opslaan_mislukt': 'Opslaan lukte niet. Probeer het opnieuw.',
  'voltooiing.dagzet_laden': 'Je Dagzetten konden niet geladen worden.',
  'voltooiing.invoer': 'Controleer je invoer.',

  'beoordeling.laden_mislukt': 'De beoordelingen konden niet geladen worden.',
  'beoordeling.een_buddy': 'Een buddy',
  'beoordeling.vraag_nodig':
    'Stel je vraag erbij — zonder vraag weet je buddy niet wat hij moet aanvullen.',
  'beoordeling.al_beoordeeld': 'Je hebt deze week van je buddy al beoordeeld.',
  'beoordeling.mislukt': 'Beoordelen lukte niet. Ververs de lijst en probeer het opnieuw.',
  'beoordeling.bijdrage_laden': 'Je buddy-bijdrage kon niet geladen worden.',

  'opnieuw.geen_niveau': 'Kies of je de vloer of het plafond gehaald hebt.',
  'opnieuw.niet_van_jou': 'Dit weekdoel is niet van jou.',
  'opnieuw.al_goedgekeurd': 'Deze week is al goedgekeurd. Er valt niets meer te vervangen.',
  'opnieuw.niets_ingediend': 'Er staat nog niets ingediend voor deze week.',
  'opnieuw.notitie_vereist': 'Deze groep vraagt om een korte notitie bij het afronden.',
  'opnieuw.mislukt': 'Opnieuw indienen lukte niet. Probeer het zo nog eens.',
  'opnieuw.mislukt_kort': 'Opnieuw indienen lukte niet.',

  'intrekken.bestaat_niet': 'Deze goedkeuring bestaat niet meer.',
  'intrekken.niet_van_jou': 'Alleen jij kunt je eigen goedkeuring intrekken.',
  'intrekken.te_laat':
    'Het kwartier om dit terug te draaien is voorbij. Vraag je buddy om de week ' +
    'opnieuw in te dienen als er iets niet klopt.',
  'intrekken.al_gedaan': 'Je hebt deze goedkeuring al ingetrokken.',
  'intrekken.mislukt': 'Intrekken lukte niet. Probeer het zo nog eens.',
  'intrekken.mislukt_kort': 'Intrekken lukte niet.',

  'validatie.notitie_lang': 'Maximaal 2000 tekens.',
  'validatie.dagzet_leeg': 'Eén regel is genoeg, maar leeg kan niet.',
  'validatie.reactie_lang': 'Hou het kort — maximaal 1000 tekens.',

  // ---------------------------------------------------------------------------
  // De Doelcoach — EPIC 3
  // ---------------------------------------------------------------------------
  'coach.starten_mislukt': 'De Doelcoach kon niet gestart worden.',
  'coach.niet_jouw_doel': 'Dit doel is niet van jou.',
  'coach.niet_ingelogd': 'Je bent niet meer ingelogd.',
  'coach.afronden_mislukt': 'De Doelcoach kon het verzoek niet afronden.',
} as const;

export type Sleutel = keyof typeof nl;
