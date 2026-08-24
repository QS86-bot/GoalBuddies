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
  'validatie.link_https': 'Een afbeeldingslink moet met https:// beginnen.',

  // ---------------------------------------------------------------------------
  // Bevestigingen — QS8-106. Elke tekst noemt wát de handeling kost.
  // ---------------------------------------------------------------------------
  //
  // ⚠️ "Weet je het zeker?" is geen bevestiging maar een drempel.
  //    `acties.test.ts` eist dat elke uitleg een gevolg benoemt en dat elke titel
  //    op een vraagteken eindigt — die test toetst de catalogus en niet meer het
  //    oude object.
  'bevestiging.annuleren': 'Annuleren',
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

  'weekpas.punt_toch_af': 'Vorige week is niet afgerond, maar je reeks loopt gewoon door. Voor die week is er wel één punt afgegaan.',
  'laden.mislukt': 'Er ging iets mis bij het ophalen. Probeer het opnieuw; blijft het misgaan, dan ligt het aan ons.',
  'laden.opnieuw': 'Opnieuw proberen',
  'mijlpaal.voortgang_label': '{gehaald} van {totaal} mijlpalen gehaald',
  'uitnodiging.titel': 'Je bent uitgenodigd',
  'uitnodiging.titel_verlopen': 'Deze link werkt niet meer',
  'uitnodiging.eyebrow': 'BUDDY-GROEP',
  'uitnodiging.leeg_titel': 'Deze uitnodiging werkt niet meer',
  'uitnodiging.leeg_tekst': 'De link is ingetrokken of vervangen door een nieuwe. Vraag degene die je uitnodigde om hem nog eens te sturen — dan krijg je meteen de geldige.',
  'uitnodiging.leden_een': '{n} lid · huddledag {dag}',
  'uitnodiging.leden_meer': '{n} leden · huddledag {dag}',
  'uitnodiging.geen_gedeeld_doel': 'Werkt nog niet aan een gedeeld doel',
  'uitnodiging.pas_bij_meedoen': 'Waar ze aan werken zie je zodra je meedoet. Dat is met opzet: wat mensen hier delen, delen ze met hun groep en niet met iedereen die de link krijgt.',
  'uitnodiging.wat_je_doet': 'Wat je hier gaat doen',
  'uitnodiging.uitleg_kern': 'Je kiest één doel met een datum erop. Elke week bepaal je wat je af wilt hebben, en één van je buddy’s keurt goed dat het gelukt is. Meer niet.',
  'uitnodiging.uitleg_missen': 'Een week missen kost een punt en verder niets. Niemand in de groep ziet het.',
  'uitnodiging.al_lid': 'Je zit in de groep',
  'uitnodiging.doorsturen': 'Je wordt doorgestuurd naar de groep.',
  'uitnodiging.eerst_profiel': 'Maak eerst je profiel af — daarna staat de groep voor je klaar.',
  'uitnodiging.naar_groep': 'Naar de groep',
  'uitnodiging.profiel_afmaken': 'Profiel afmaken',
  'uitnodiging.deelnemen': 'Deelnemen aan deze groep',
  'uitnodiging.inloggen': 'Inloggen of account maken',
  'uitnodiging.blijft_bewaard': 'Je uitnodiging blijft op dit apparaat bewaard. Ook als je eerst je e-mail moet bevestigen, sta je daarna gewoon in de groep.',
  'uitnodiging.rondkijken': 'Toch even rondkijken',
  'uitnodiging.deelnemen_mislukt': 'Deelnemen lukte niet. Probeer het zo nog eens.',
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

  // ---------------------------------------------------------------------------
  // Groepen, uitnodigingen en de chat — EPIC 5 en 7
  // ---------------------------------------------------------------------------
  //
  // ⚠️ De uitnodigingsmeldingen zeggen nooit wélke groep of wie erin zit. Een
  //    onbekende code hoort geen informatie op te leveren over een groep waar je
  //    niet in zit — dat zou een uitnodigingslink tot een zoekmachine maken.
  'groep.rate_limited':
    'Je hebt vandaag te vaak een uitnodiging geprobeerd. Over 24 uur kan het weer — ' +
    'vraag je buddy intussen om de link nog eens te sturen.',
  'groep.ongeldige_link':
    'Deze uitnodigingslink werkt niet meer. Hij is ingetrokken of hij klopt niet; ' +
    'vraag je buddy om een nieuwe.',
  'groep.vol': 'Deze groep zit vol. Drie tot vijf mensen werkt het best, dus dat is geen ramp.',
  'groep.te_veel_groepen': 'Je zit al in tien groepen. Verlaat er een om ruimte te maken.',
  'groep.naam_kort': 'Geef je groep een naam van minstens twee tekens.',
  'groep.naam_lang': 'Die naam is te lang. Maximaal 60 tekens.',
  'groep.slechte_huddledag': 'Kies een dag van de week voor de huddle.',
  'groep.daglimiet': 'Je hebt vandaag al tien groepen aangemaakt. Morgen kan het weer.',
  'groep.geen_beheerder': 'Alleen een beheerder van deze groep kan dit doen.',

  'groep.aanmaken_mislukt': 'Je groep kon niet worden aangemaakt.',
  'groep.invoer': 'Controleer je invoer.',
  'groep.opslaan_mislukt': 'Opslaan lukte niet. Alleen een beheerder kan dit wijzigen.',
  'groep.link_vernieuwen_mislukt': 'De link vernieuwen lukte niet. Probeer het opnieuw.',
  'groep.link_vernieuwen_mislukt_kort': 'De link vernieuwen lukte niet.',
  'groep.actie_mislukt': 'Dat lukte niet. Probeer het opnieuw.',
  'groep.actie_mislukt_kort': 'Dat lukte niet.',
  'groep.controleer_link': 'Controleer de link.',
  'groep.deelnemen_mislukt': 'Deelnemen lukte niet. Probeer het zo nog eens.',
  'groep.deelnemen_mislukt_link': 'Deelnemen lukte niet. Vraag je buddy om een nieuwe link.',
  'groep.uitnodiging_laden': 'Deze uitnodiging kon niet geladen worden.',
  'groep.koppelen_mislukt': 'Koppelen lukte niet. Ben je lid van deze groep?',
  'groep.ontkoppelen_mislukt': 'Ontkoppelen lukte niet.',
  'groep.gekoppelde_groepen_laden': 'De gekoppelde groepen konden niet geladen worden.',
  'groep.gekoppelde_doelen_laden': 'De gekoppelde doelen konden niet geladen worden.',
  'groep.naamloos': 'Je groep',
  'groep.groepen_laden': 'Je groepen konden niet geladen worden.',
  'groep.groep_laden': 'Deze groep kon niet geladen worden.',
  'groep.lidmaatschap_laden': 'Je lidmaatschap kon niet geladen worden.',
  'groep.overzicht_laden': 'Het groepsoverzicht kon niet geladen worden.',
  'groep.aanmaken_mislukt_kort': 'Je groep kon niet worden aangemaakt. Probeer het opnieuw.',
  'groep.onbekend_lid': 'Onbekend lid',
  'validatie.groepsnaam_lang': 'Maximaal 60 tekens.',
  'validatie.weekdag_kort': 'Kies een dag van de week.',
  'validatie.uitnodigingscode': 'Deze uitnodigingscode klopt niet. Controleer de link.',

  // ⚠️ De standaard is "notitie verplicht" en dat is beslispunt 3, geen detail:
  //    een duim omhoog op een bewering is een formaliteit, één zin geeft de
  //    goedkeurder iets om op te reageren.
  'bewijseis.note_required': 'Notitie verplicht',
  'bewijseis.note_and_attachment': 'Notitie én bijlage',
  'bewijseis.optional': 'Alles optioneel',

  'chat.titel': 'Groepschat',
  'chat.eyebrow': 'GROEPSCHAT',
  'chat.geen_lid_titel': 'Deze groep is er niet, of niet voor jou',
  'chat.geen_lid_tekst': 'Je bent geen lid van deze groep, of hij bestaat niet meer. Vraag om een nieuwe uitnodigingslink als je erbij hoort.',
  'chat.ouder_laden': 'Ouder laden',
  'chat.nog_niets': 'Nog geen berichten. Eén zin is genoeg — “wat ga je deze week doen?” werkt beter dan een lange inleiding.',
  'chat.terug': 'Terug naar de groep',
  'chat.sessie_laadt': 'Je sessie is nog aan het laden. Probeer het over een tel opnieuw.',
  'chat.invoer_label': 'Nieuw bericht',
  'chat.invoer_hint': 'Zeg iets tegen je groep',
  'chat.versturen': 'Versturen',
  'chat.laden_mislukt': 'De berichten konden niet geladen worden.',
  'chat.controleer': 'Controleer je bericht.',
  'chat.leeg': 'Er staat nog niets in je bericht.',
  'chat.versturen_mislukt': 'Je bericht is niet verstuurd. Probeer het zo nog eens.',
  'chat.weghalen_mislukt': 'Weghalen lukte niet. Probeer het opnieuw.',

  'ketting.laden_mislukt': 'De Ketting kon niet geladen worden.',

  // ---------------------------------------------------------------------------
  // De weekafsluiting — EPIC 7
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Vraag 2 is de enige plek waar tegenslag hoort**, en de hint zegt dat met
  //    zoveel woorden: de groep leest mee om te helpen, niet om te beoordelen.
  //    Dit is een van de drie routes waarlangs tegenslag de groep bereikt, en
  //    alle drie lopen ze via de gebruiker zelf (domeinregel 7). Verwater die zin
  //    niet in een vertaling.
  'weekafsluiting.v1.label': 'Wat heb je gedaan?',
  'weekafsluiting.v1.hint': 'Voorgevuld uit je Dagzetten van deze week. Pas aan wat je wilt.',
  'weekafsluiting.v1.voorbeeld': 'Drie ochtenden geschreven, samen ongeveer vier uur.',
  'weekafsluiting.v2.label': 'Wat zat in de weg?',
  'weekafsluiting.v2.hint':
    'De enige plek waar dit hoort. Je groep leest mee om te helpen, niet om te beoordelen.',
  'weekafsluiting.v2.voorbeeld': 'Twee avonden overwerk, en daarna kwam ik er niet meer in.',
  'weekafsluiting.v3.label': 'Wat is je volgende week?',
  'weekafsluiting.v3.hint': 'Eén concrete zin is genoeg.',
  'weekafsluiting.v3.voorbeeld': 'Hoofdstuk drie af, en dinsdag een uur extra inplannen.',

  'weekafsluiting.leeg':
    'Vul minstens één vraag in. Alle drie overslaan mag ook — dan sla je niets op.',
  'weekafsluiting.reactie_leeg': 'Er staat nog niets in je reactie.',
  'weekafsluiting.laden_mislukt': 'De weekafsluiting kon niet geladen worden.',
  'weekafsluiting.reacties_laden': 'De reacties konden niet geladen worden.',
  'weekafsluiting.invoer': 'Controleer je invoer.',
  'weekafsluiting.opslaan_mislukt': 'Opslaan lukte niet. Ben je nog lid van deze groep?',
  'weekafsluiting.weghalen_mislukt': 'Weghalen lukte niet. Probeer het opnieuw.',
  'weekafsluiting.reactie_controleer': 'Controleer je reactie.',
  'weekafsluiting.reactie_mislukt': 'Je reactie is niet verstuurd. Probeer het zo nog eens.',

  // ---------------------------------------------------------------------------
  // Doelen — EPIC 2
  // ---------------------------------------------------------------------------
  'doel.doelen_laden': 'Je doelen konden niet geladen worden.',
  'doel.doel_laden': 'Dit doel kon niet geladen worden.',
  'doel.invoer': 'Controleer je invoer.',
  'doel.datum_verleden': 'Kies een streefdatum die nog moet komen.',
  'doel.opslaan_mislukt': 'Je doel kon niet worden opgeslagen. Probeer het opnieuw.',
  'doel.niets_gewijzigd': 'Er is niets gewijzigd.',
  'doel.wijzigen_mislukt': 'Opslaan lukte niet. Probeer het opnieuw.',
  'doel.streefdatum_mislukt': 'De streefdatum aanpassen lukte niet. Probeer het opnieuw.',
  'doel.actie_mislukt_kort': 'Dat lukte niet.',
  'doel.actie_mislukt': 'Dat lukte niet. Probeer het opnieuw.',
  'doel.niet_van_jou': 'Dit doel is niet van jou.',
  'doel.datum_ongeldig': 'Kies een geldige streefdatum.',

  // ⚠️ Deze zin is A7 in één regel: verschuiven kán, maar niet alleen. Hij legt
  //    uit wát er moet gebeuren in plaats van alleen te weigeren.
  'doel.groepsakkoord_nodig':
    'Dit doel deel je met een groep, dus de datum verschuif je niet alleen. ' +
    'Vraag je buddy’s om akkoord met een korte uitleg erbij.',

  'doel.afronden_mislukt': 'Afronden lukte niet. Probeer het opnieuw.',
  'doel.al_afgerond': 'Dit doel is al afgerond.',
  'doel.gearchiveerd': 'Dit doel is gearchiveerd. Haal het eerst terug.',
  'doel.niet_ingelogd': 'Je bent niet meer ingelogd.',
  'doel.een_mijlpaal_open':
    'Er staat nog één mijlpaal open. Vink hem af, of laat hem vallen als hij niet meer nodig is.',
  'doel.meer_mijlpalen_open':
    'Er staan nog {aantal} mijlpalen open. Vink ze af, of laat vallen wat niet meer nodig is.',

  'doel.verwijderen_mislukt': 'Verwijderen lukte niet.',
  'doel.te_oud':
    'Dit doel staat er te lang om nog te verwijderen. Archiveer het — dan blijft je ' +
    'geschiedenis staan en verdwijnt het uit je lijst.',
  'doel.gedeeld_met_groep': 'Dit doel is aan een groep gekoppeld. Ontkoppel het eerst, of archiveer het.',
  'doel.heeft_weekdoelen':
    'Er hangen al weekdoelen aan dit doel. Archiveer het in plaats van het te verwijderen.',
  'doel.heeft_punten':
    'Er zijn al punten op dit doel geboekt. Archiveer het in plaats van het te verwijderen.',
  'doel.commitment_in_werking':
    'Je beloning of straf is al in werking getreden. Archiveer dit doel in plaats van het te verwijderen.',

  'doel.reeks_laden': 'Je reeks kon niet geladen worden.',
  'doel.weekpassen_laden': 'Je weekpassen konden niet geladen worden.',

  'categorie.business': 'Werk',
  'categorie.study': 'Studie',
  'categorie.other': 'Overig',

  'validatie.doeltitel_kort': 'Geef je doel een naam van minstens drie tekens.',
  'validatie.doeltitel_lang': 'Maximaal 200 tekens.',
  'validatie.omschrijving_lang': 'Maximaal 2000 tekens.',
  'validatie.datum_vorm': 'Gebruik een bestaande datum als 2026-12-31.',
  'validatie.identiteit_lang': 'Hou het kort — één zin werkt het best.',
  'validatie.uren_max': 'Een week heeft 168 uur.',

  // ---------------------------------------------------------------------------
  // Deadline verschuiven met akkoord — A7
  // ---------------------------------------------------------------------------
  'deadline.argument_kort':
    'Schrijf één zin over wat er veranderd is. Je buddy’s beslissen hierop, ' +
    'dus "geen tijd" is te weinig om ja op te zeggen.',
  'deadline.argument_lang': 'Hou het kort — maximaal 1000 tekens.',
  'deadline.geen_lid': 'Je bent geen lid van deze groep.',
  'deadline.niet_gekoppeld': 'Dit doel is niet aan deze groep gekoppeld.',
  'deadline.zelfde_datum': 'Kies een andere datum dan de datum die er nu staat.',
  'deadline.argument_leeg': 'Schrijf één zin over wat er veranderd is.',
  'deadline.al_open': 'Er loopt al een verzoek voor dit doel. Wacht daar eerst op.',
  'deadline.bestaat_niet': 'Dit verzoek bestaat niet meer.',
  'deadline.al_beslist': 'Hier is al over beslist.',
  'deadline.niet_zelf': 'Je eigen verzoek kun je niet zelf goedkeuren.',
  'deadline.versturen_mislukt': 'Je verzoek versturen lukte niet. Probeer het opnieuw.',
  'deadline.versturen_mislukt_kort': 'Je verzoek versturen lukte niet.',
  'deadline.beslissen_mislukt': 'Beslissen lukte niet. Probeer het opnieuw.',
  'deadline.beslissen_mislukt_kort': 'Beslissen lukte niet.',
  'deadline.intrekken_mislukt': 'Intrekken lukte niet. Probeer het opnieuw.',
  'deadline.intussen_beslist': 'Er is intussen al over beslist.',
  'deadline.intrekken_mislukt_kort': 'Intrekken lukte niet.',
  'deadline.lopend_laden': 'Het lopende verzoek kon niet geladen worden.',
  'deadline.verzoeken_laden': 'De verzoeken konden niet geladen worden.',

  // ---------------------------------------------------------------------------
  // Adempauze, mijlpalen, weekdoelen en het Doelcoach-interview
  // ---------------------------------------------------------------------------
  'adempauze.laden_mislukt': 'Je adempauzes konden niet geladen worden.',
  'adempauze.inplannen_mislukt': 'De adempauze kon niet ingepland worden.',
  'adempauze.te_laat':
    'Een adempauze kondig je vooraf aan. De week die nu loopt kan niet meer — kies de week die komt.',
  'adempauze.te_lang': 'Een adempauze duurt hoogstens twee weken.',
  'adempauze.overlap': 'Er ligt al een adempauze over deze weken.',
  'adempauze.geen_hele_week': 'Kies een hele week, die begint op jouw eigen startdag.',
  'adempauze.eind_voor_start': 'De einddatum ligt vóór de startdatum.',
  'adempauze.annuleren_mislukt': 'Annuleren lukte niet.',
  'adempauze.al_begonnen': 'Deze adempauze is al begonnen en blijft staan.',

  'mijlpaal.toevoegen_mislukt': 'De mijlpaal kon niet worden toegevoegd.',
  'mijlpaal.wijzigen_mislukt': 'De wijziging kon niet worden opgeslagen.',
  'mijlpaal.status_mislukt': 'De status kon niet worden aangepast.',
  'mijlpaal.verwijderen_mislukt': 'Verwijderen lukte niet.',
  'mijlpaal.volgorde_mislukt': 'De volgorde kon niet worden opgeslagen.',
  'mijlpaal.lijst_veranderd':
    'De lijst is ondertussen veranderd. Ververs het scherm en probeer het opnieuw.',
  'validatie.mijlpaaltitel': 'Geef je mijlpaal een naam.',

  'weekdoel.laden_mislukt': 'Je weekdoelen konden niet geladen worden.',
  'weekdoel.open_laden': 'Je openstaande weken konden niet geladen worden.',
  'weekdoel.mijlpalen_laden': 'De mijlpalen konden niet geladen worden.',
  'weekdoel.opslaan_mislukt': 'Je weekdoel kon niet worden opgeslagen.',
  'weekdoel.verwijderen_mislukt': 'Verwijderen lukte niet.',
  'weekdoel.te_oud':
    'Dit weekdoel staat er te lang om nog te verwijderen. Je kunt hem wel afsluiten — ' +
    'dan telt de week als gemist.',
  'weekdoel.al_gebeurd': 'Er is al iets met dit weekdoel gebeurd, dus verwijderen kan niet meer.',
  'weekdoel.al_ingediend': 'Je hebt hier al iets voor ingediend. Verwijderen kan dan niet meer.',
  'weekdoel.afsluiten_mislukt': 'Afsluiten lukte niet.',
  'weekdoel.niet_meer_open':
    'Deze week staat niet meer open. Alleen een weekdoel waar nog niets mee gebeurd is, kun je afsluiten.',
  'weekdoel.doorschuiven_mislukt': 'Doorschuiven lukte niet.',
  'weekdoel.nog_niet_afgesloten':
    'Doorschuiven kan pas als de week is afgesloten. Dat gebeurt automatisch kort na het einde van je week.',
  'validatie.kies_doel': 'Kies een doel.',
  'validatie.weekdoeltitel': 'Wat wil je deze week af hebben?',
  'validatie.weekdoeltitel_lang': 'Maximaal 200 tekens.',
  'validatie.vloer_plafond_kort': 'Hou het kort.',

  'interview.opslaan_mislukt': 'Je antwoorden konden niet worden opgeslagen. Probeer het opnieuw.',
  'validatie.uren_min': 'Minder dan nul uur bestaat niet.',

  'interview.measurable.vraag': 'Waaraan zie je straks dat het gelukt is?',
  'interview.measurable.toelichting': 'Iets wat je kunt aanwijzen of tellen werkt beter dan een gevoel.',
  'interview.identity.vraag': 'Wie word je als dit lukt?',
  'interview.identity.toelichting':
    'Bij een doel van maanden is identiteit de brandstof die het langst meegaat.',
  'interview.deadline_reason.vraag': 'Waarom juist die datum?',
  'interview.deadline_reason.toelichting': 'Een datum met een reden erachter verschuif je minder makkelijk.',
  'interview.hours_per_week.vraag': 'Hoeveel uur per week heb je hiervoor?',
  'interview.hours_per_week.toelichting': 'Eerlijk schatten helpt meer dan hoog inzetten.',
  'interview.already_done.vraag': 'Wat heb je al gedaan?',
  'interview.already_done.toelichting': 'Je begint zelden bij nul, en dat scheelt in de planning.',
  'interview.stuck_before.vraag': 'Waar liep het eerder vast?',
  // ⚠️ Deze belofte staat er niet voor de sier: dit veld gaat naar de Doelcoach
  //    en nooit naar de groep. Verwater hem niet in een vertaling.
  'interview.stuck_before.toelichting':
    'Alleen voor jou en de Doelcoach zichtbaar — je groep ziet dit nooit.',
} as const;

export type Sleutel = keyof typeof nl;
