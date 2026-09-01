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
  // ⚠️ Er hoort er hier precies één te staan voor elke naam in
  //    `SYSTEEM_GEBEURTENISSEN`. Een chatbericht is een onveranderlijke kopie;
  //    sinds 0059 wordt de zin bij het tónen gemaakt en niet bij het schrijven,
  //    dus vanaf hier is meertaligheid in de chat een kwestie van dit bestand.
  //
  // ⚠️ **Tel ze niet in een zin.** Hier stond "deze acht" terwijl het er negen
  //    waren, en de tiende (`chain_milestone`, migratie 0070) ontbrak helemaal —
  //    zes uur lang toonde de groepschat de letterlijke sleutel. `t()` valt bij
  //    een onbekende sleutel terug op de sleutel zelf, en dat is een string die
  //    niet leeg is; de test die "elke gebeurtenis heeft een zin" heette, kwam
  //    daar dus doorheen. De telling staat nu in
  //    `systeemberichten.test.ts` en niet in dit commentaar.
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

  /**
   * ⚠️ Het enige systeembericht zonder persoonsnaam, en het enige met een getal.
   *    Het getal is de drempel die gehaald is (10, 25, 50, …) en komt uit
   *    `chat_messages.payload`, niet uit een berekening — zie migratie 0075.
   */
  'systeembericht.chain_milestone': 'De Ketting van deze groep telt {aantal} schakels.',
  /**
   * ⚠️ **Eén zin met alle cijfers erin, en dat is acceptatiecriterium 2 van
   *    QS8-79.** Habit Huddle heeft losse recap-berichten moeten terugdraaien:
   *    een reeks meldingen achter elkaar leest als spam en niet als een moment.
   *
   * ⚠️ **Geen namen, en dat is domeinregel 7.** Alle drie de getallen zijn
   *    groepstotalen. "Wie het meest" zou ook een lijst zijn van wie onderaan
   *    staat, en een recap die vertelt dat het een rustig seizoen was, is een
   *    tegenslagbericht met een vrolijke kop erop. Bij nul op alle drie wordt hij
   *    helemaal niet verstuurd — zie `maak_seizoensrecaps()`.
   */
  'systeembericht.season_recap':
    'Het seizoen zit erop. Samen hebben jullie {weken} weken afgerond, {mijlpalen} ' +
    'mijlpalen gehaald en {schakels} schakels aan De Ketting toegevoegd.',

  /**
   * ⚠️ Besluit A41 (QS8-132). De zin zegt wat er verandert en niet wat iemand
   *    ervan moet vinden: een lid dat het niet wil, moet er iets mee kunnen doen
   *    (zijn doel ontkoppelen), en daar heeft hij een feit voor nodig.
   */
  'systeembericht.group_opened':
    '{naam} heeft deze groep opengezet. Leden zien vanaf nu ook elkaars tegenslag.',
  'systeembericht.group_protected':
    '{naam} heeft deze groep weer beschermd. Tegenslag van een ander is niet meer zichtbaar.',

  /**
   * ⚠️ QS8-231, migratie 0144. Het enige systeembericht van dit issue, en het is
   *    er een omdat niemand er achteraf achter mag komen dat zijn groep vindbaar
   *    is geworden voor onbekenden. De zin noemt daarom meteen de grens: wat een
   *    vreemde ziet, en dat het daarbij blijft.
   *
   * ⚠️ Er komt géén bericht bij het wéér verbergen. Dat is geen nieuws — er
   *    verandert niets aan wat iemand in de groep ziet — en geen afwezig signaal.
   */
  'systeembericht.group_discoverable':
    '{naam} heeft deze groep vindbaar gemaakt. Mensen die je nog niet kent zien de naam, het onderwerp, de omschrijving en het aantal leden — verder niets.',

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
  'auth.bevestig_inbox': 'Gelukt. Staat e-mailbevestiging aan, kijk dan even in je inbox.',
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
    'Later aanpasbaar; weekdoelen die je nog moet doen gaan dan mee.',

  'weekpas.punt_toch_af': 'Vorige week is niet afgerond, maar je reeks loopt gewoon door. Voor die week is er wel één punt afgegaan.',
  'laden.mislukt': 'Er ging iets mis bij het ophalen. Probeer het opnieuw; blijft het misgaan, dan ligt het aan ons.',
  'laden.opnieuw': 'Opnieuw proberen',
  'mijlpaal.voortgang_label': '{gehaald} van {totaal} mijlpalen gehaald',
  'uitnodiging.open_waarschuwing': 'Doe je mee, dan ziet deze groep ook jouw gemiste weken.',
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
  'uitnodiging.uitleg_missen_beschermd': 'Een week missen kost een punt en verder niets. Niemand in de groep ziet het.',
  'uitnodiging.uitleg_missen_open': 'Een week missen kost een punt en verder niets. In deze groep zien de anderen het wel — dat is wat "open" hierboven betekent.',
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
  'aanmelden.titel_nieuw': 'Account maken',
  'aanmelden.titel_terug': 'Welkom terug',
  'aanmelden.eyebrow': 'GOALBUDDIES',
  'aanmelden.email': 'E-mailadres',
  'aanmelden.email_hint': 'jij@voorbeeld.nl',
  'aanmelden.wachtwoord': 'Wachtwoord',
  'aanmelden.wachtwoord_hint': 'Minstens 12 tekens. Een korte zin werkt prima en onthoud je beter.',
  'aanmelden.knop_nieuw': 'Account maken',
  'aanmelden.knop_inloggen': 'Inloggen',
  'aanmelden.heb_al_account': 'Ik heb al een account',
  'aanmelden.ben_nieuw': 'Ik ben nieuw hier',
  'aanmelden.bestaand_account': 'Of gebruik een bestaand account',
  'aanmelden.alleen_browser': 'Inloggen met Apple of Google werkt op dit moment alleen in de browser.',
  'beoordeling.titel': 'Beoordelen',
  'beoordeling.leeg_titel': 'Niets te beoordelen',
  'beoordeling.leeg_tekst': 'Zodra een buddy een week afrondt, staat hij hier. Eén zin terug is genoeg — daar gaat het om.',
  'beoordeling.terugdraai_venster': 'Verkeerde buddy? Je kunt dit nog {minuten} minuten terugdraaien.',
  'beoordeling.terug': 'Terug',
  'beoordeling.terugdraaien': 'Terugdraaien',
  'beoordeling.klopt_zo': 'Klopt zo',
  'beoordeling.vraag_titel': 'Wat wil je weten?',
  'beoordeling.vraag_uitleg': 'Een vraag, geen oordeel. De meeste onduidelijkheid is gewoon onduidelijkheid.',
  'beoordeling.vraag_hint': 'Hoe ver ben je gekomen met het tweede hoofdstuk?',
  'beoordeling.vraag_versturen': 'Vraag versturen',
  'beoordeling.toch_niet': 'Toch niet',
  'beoordeling.goedkeuren': 'Goedkeuren',
  'beoordeling.vertel_meer': 'Vertel me meer',
  'beheer.titel': 'Groep beheren',
  'beheer.eyebrow': 'ALLEEN VOOR BEHEERDERS',
  'beheer.geen_beheerder_titel': 'Alleen een beheerder kan deze groep instellen',
  'beheer.geen_beheerder_tekst': 'Je bent lid van deze groep, maar geen beheerder. Vraag degene die de groep heeft aangemaakt om de naam, de huddledag of de uitnodigingslink te wijzigen.',
  'beheer.naam': 'Naam van de groep',
  'beheer.naam_hint': 'De donderdagclub',
  'beheer.huddledag_uitleg': 'Wijzigen breekt geen lopende ketting: een schakel draagt de week waarin hij gelegd is, en die wordt nooit herberekend.',
  'beheer.bewijs_label': 'Hoeveel bewijs vraagt deze groep?',
  'beheer.bewijs_hint': 'Een duim omhoog op een bewering is een formaliteit. Eén zin kost tien seconden en geeft je buddy iets om op te reageren — dat is wat het gesprek op gang brengt.',
  'beheer.bijlagen_nog_niet': 'Bijlagen kunnen nog niet: er is nog geen opslag. Kies je die stand, dan geldt voorlopig alleen de notitie. Wijzigen raakt bestaande afrondingen niet.',
  'beheer.opslaan': 'Opslaan',
  'beheer.link_titel': 'Uitnodigingslink',
  'beheer.link_uitleg': 'Wie deze link opent, ziet de groep en hoeveel mensen erin zitten — ook zonder account. Wat jullie aan doelen delen, ziet iemand pas na het meedoen. Deel de link toch alleen met mensen die je erbij wilt.',
  'beheer.deel': 'Deel de uitnodiging',
  'beheer.deel_titel': 'Doe mee met {groep}',
  'beheer.kopieer': 'Of kopieer hem met de hand',
  'beheer.link_gesloten': 'De link is gesloten. Niemand kan er op dit moment mee binnenkomen.',
  'beheer.nieuwe_link': 'Nieuwe link maken',
  'beheer.link_openzetten': 'Link weer openzetten',
  'beheer.link_sluiten': 'Link sluiten',
  'beheer.sluiten_uitleg': 'Sluiten laat de code bestaan maar weigert iedereen. Een nieuwe link maken vervangt de code, en dan is de oude definitief dood — dat is wat je doet als een link ergens is beland waar hij niet hoorde.',
  'beheer.terug': 'Terug naar de groep',
  'beheer.melding_gesloten': 'De link is gesloten.',
  'beheer.melding_open': 'De link staat weer open.',
  'onboarding.profiel_leeg_titel': 'We kunnen je gegevens even niet ophalen.',
  'onboarding.profiel_leeg_tekst': 'Probeer het zo nog eens. Er gaat niets verloren.',
  'onboarding.eyebrow': 'NOG ÉÉN SCHERM',
  'onboarding.dagelijkse_herinnering': 'Dagelijkse herinnering',
  'onboarding.uit_blijft_uit': 'Uit blijft uit. We sturen je niets.',
  'onboarding.stap1.kop': 'Eén doel, met een datum erop',
  'onboarding.stap1.a': 'Je begint met één doel dat af moet zijn op een dag die jij kiest. Niet vijf doelen — één.',
  'onboarding.stap1.b': 'De Doelcoach hakt het daarna in mijlpalen, en die mijlpalen worden je weekdoelen.',
  'onboarding.stap2.kop': 'De week is de eenheid',
  'onboarding.stap2.a': 'Elke week bepaal je wat je af wilt hebben. Aan het eind van je week vink je af wat gelukt is.',
  'onboarding.stap2.b': 'Jouw week begint op de dag die jij kiest. Niet iedereen leeft van maandag tot zondag.',
  'onboarding.stap3.kop': 'Een vloer en een plafond',
  'onboarding.stap3.a': 'Het plafond is wat je wilt halen. De vloer is de versie die je op je slechtste week nóg haalt.',
  'onboarding.stap3.b': 'De vloer halen telt: je reeks loopt door en je buddy keurt hem net zo goed. Alleen de punten verschillen.',
  'onboarding.stap3.c': 'Dit is het idee waar de app om draait. Je reeks hoort jou te dienen, niet andersom.',
  'onboarding.stap4.kop': 'Een buddy keurt het goed',
  'onboarding.stap4.a': 'Iemand uit je groep bevestigt dat het gelukt is. Jezelf goedkeuren kan niet.',
  /**
   * ⚠️ Hier is nog geen groep, dus deze zin kan niet weten of hij open of
   *    beschermd is. Vandaar de vorm "standaard niet, en je ziet het staan" in
   *    plaats van een belofte die de app later moet breken (besluit A41).
   */
  'onboarding.stap4.b': 'Een week missen kost je één punt en verder niets. In een beschermde groep — de standaard — ziet niemand het. Kiest een groep bewust voor open, dan staat dat erbij vóór je meedoet.',
  'onboarding.stap_van': 'STAP {nu} VAN {totaal}',
  'onboarding.zo_ziet_eruit': 'Zo ziet dat eruit',
  'onboarding.voorbeeld_titel': 'Drie keer hardlopen',
  'onboarding.voorbeeld_vloer': 'Eén keer, al is het twintig minuten',
  'onboarding.voorbeeld_plafond': 'Drie keer, minstens vijf kilometer',
  'onboarding.aan_de_slag': 'Aan de slag',
  'onboarding.verder': 'Verder',
  'onboarding.overslaan': 'Overslaan',

  // Navigatie — QS8-211. Deze staan bewust apart van elk scherm: de terugknop en
  // de uitgang uit de instelroute horen bij `Screen` en niet bij het scherm dat
  // ze toevallig als eerste nodig had.
  'nav.terug': 'Terug',
  'nav.naar_overzicht': 'Klaar, naar mijn overzicht',
  'onboarding.profiel_titel': 'Even over jou',
  'onboarding.naamloos': 'Naamloos',
  'onboarding.naam': 'Hoe heet je?',
  'onboarding.naam_hint': 'Dit zien je buddy’s. Een voornaam is genoeg.',
  'onboarding.naam_plaatshouder': 'Quinten',
  'onboarding.geen_avatar': 'Geen avatar? Dan tonen we je initialen. Een foto kiezen kan straks bij Profiel.',
  'onboarding.herinnering': 'Herinnering',
  'onboarding.aan': 'Aan',
  'onboarding.uit': 'Uit',
  'onboarding.hoe_laat': 'Hoe laat?',
  'onboarding.toon': 'Toon',
  'onboarding.toon_hint': 'Bepaalt hoe de tekst klinkt, niet hoe vaak je hem krijgt.',
  'onboarding.zacht': 'Zacht',
  'onboarding.streng': 'Streng',
  'onboarding.waarvoor': 'Waarvoor kom je?',
  'onboarding.waarvoor_hint': 'Kwam je binnen om een vriend te helpen? Dan hoef je zelf geen doel. Je kunt er altijd later een maken.',
  'onboarding.zelf_doel': 'Ik wil zelf een doel',
  'onboarding.kom_helpen': 'Ik kom helpen',
  'onboarding.klaar': 'Klaar',
  'groepdetail.zichtbaarheid': 'Zichtbaarheid van deze groep: {stand}',
  'groepdetail.titel': 'Groep',
  'groepdetail.eyebrow': 'HUDDLEDAG {dag}',
  'groepdetail.geen_lid_titel': 'Deze groep is er niet, of niet voor jou',
  'groepdetail.geen_lid_tekst': 'Je bent geen lid van deze groep, of hij bestaat niet meer. Vraag om een nieuwe uitnodigingslink als je erbij hoort.',
  'groepdetail.slaapt': 'Deze groep slaapt: er is een tijd niets gebeurd, dus de herinneringen zijn gestopt. Sluit iemand een week af, dan is hij meteen weer wakker.',
  'groepdetail.ketting_mislukt': 'De Ketting kon niet geladen worden.',
  'groepdetail.opnieuw': 'Opnieuw proberen',
  'groepdetail.bolletje_uitleg': 'Het bolletje betekent: deze week al afgesloten. Geen bolletje betekent nog niet, meer niet.',
  'groepdetail.gesprek': 'Het gesprek',
  'groepdetail.gesprek_uitleg': 'De weekafsluiting is het vaste moment op de huddledag: drie vragen, en de antwoorden van iedereen op één kaart. De chat is voor de rest van de week.',
  'groepdetail.naar_weekafsluiting': 'De weekafsluiting',
  'groepdetail.naar_chat': 'Groepschat',
  'groepdetail.uitnodigen': 'Iemand uitnodigen',
  'groepdetail.link_uitleg': 'Wie deze link opent, ziet de groep en hoeveel mensen erin zitten — ook zonder account. Deel hem alleen met mensen die je erbij wilt.',
  'groepdetail.deel': 'Deel de uitnodiging',
  'groepdetail.deel_titel': 'Doe mee met {groep}',
  'groepdetail.beheren': 'Groep beheren',
  'groepdetail.naar_groepen': 'Naar mijn groepen',
  'deadlineverzoek.leeg_titel': 'Niets te beslissen',
  'deadlineverzoek.leeg_tekst': 'Zodra iemand om een nieuwe streefdatum vraagt, staat het hier.',
  'deadlineverzoek.van_naar': 'Van {oud} naar {nieuw}.',
  'deadlineverzoek.reden_label': 'Wil je er iets bij zeggen?',
  'deadlineverzoek.reden_hint': 'Mag leeg. Eén zin helpt je buddy meer dan een kale afwijzing.',
  'deadlineverzoek.reden_voorbeeld': 'Zullen we eerst kijken of we het samen haalbaar kunnen maken?',
  'deadlineverzoek.versturen': 'Versturen',
  'deadlineverzoek.toch_niet': 'Toch niet',
  'deadlineverzoek.akkoord': 'Akkoord',
  'deadlineverzoek.liever_niet': 'Liever niet',
  'koppel.ontkoppel': 'Niet meer delen met deze groep',
  'koppel.titel': 'Je doel delen met deze groep',
  /**
   * ⚠️ **Twee zinnen en niet één, sinds besluit A41.** Hier stond onvoorwaardelijk
   *    "niet je weken", en dat was vanaf migratie 0077 onwaar in een open groep:
   *    koppelen deelt daar élke weekdoelrij, inclusief `missed` en `carried`.
   *
   *    De zin stond boven de koppelknop, dus de app deed een privacybelofte op
   *    exact het moment dat de gebruiker toestemming gaf. Gevonden door de
   *    critical-user-ronde van 24-08; de kop van 0077 beweerde intussen dat "een
   *    eigenaar die zijn doel aan een open groep koppelt, weet wat hij deelt".
   *
   * ⚠️ Wie hier een derde oppervlak opent, splitst deze zin niet nóg een keer maar
   *    kijkt eerst of hij nog klopt. `beloftes.test.ts` wordt rood bij een nieuwe
   *    onvoorwaardelijke onzichtbaarheidsbelofte.
   */
  'koppel.uitleg_beschermd': 'Zolang je niets koppelt, ziet niemand hier waar je aan werkt. Koppelen deelt de titel en je mijlpaalvoortgang — niet je notities, niet je weken en niet je punten. Je kunt het altijd weer ongedaan maken.',
  'koppel.uitleg_open': 'Zolang je niets koppelt, ziet niemand hier waar je aan werkt. Deze groep staat open: koppelen deelt de titel, je mijlpaalvoortgang én je weken — ook de weken die je niet gehaald hebt. Je notities en je punten blijven van jou. Je kunt het altijd weer ongedaan maken.',
  'koppel.geen_doel_titel': 'Je hebt nog geen doel om te delen',
  'koppel.geen_doel_tekst': 'Begin met één doel met een datum erop. Daarna kun je het hier aan deze groep koppelen.',
  'koppel.nieuw_doel': 'Nieuw doel',

  // ---------------------------------------------------------------------------
  // Gedeeld met — QS8-56 (PRD 5.5): hetzelfde doel in meer dan één groep
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Eigen sleutels en niet de `koppel.*` hierboven, want het is een andere
  //    vraag. Op het groepsscherm kies je een doel bij een groep die vaststaat;
  //    hier kies je groepen bij een doel dat vaststaat. Dezelfde zin hergebruiken
  //    zou "deze groep" laten slaan op een groep die de gebruiker nog moet kiezen.
  'deling.kop': 'Gedeeld met',
  'deling.uitleg':
    'Eén doel mag in meer dan één groep staan. Elke groep is een aparte toestemming: ' +
    'je koppelt en ontkoppelt ze los van elkaar.',
  'deling.nergens': 'Je deelt dit doel nog met niemand. Het staat alleen op jouw scherm.',
  'deling.geen_groepen':
    'Je zit nog in geen enkele groep. Zodra je er een hebt, kun je dit doel er hier aan koppelen.',
  'deling.overal': 'Dit doel staat in al je groepen.',
  'deling.koppel_kop': 'Ook delen met',
  'deling.koppel': 'Delen met {naam}',
  /**
   * ⚠️ **Twee zinnen, om precies dezelfde reden als bij `koppel.uitleg_*`.** Dit
   *    is een tweede knop die dezelfde toestemming vraagt; als deze zin zwijgt
   *    over de weken in een open groep, is de belofte alsnog gebroken — alleen op
   *    een ander scherm. `beloftes.test.ts` bewaakt dat de beschermde variant een
   *    open tegenhanger heeft en dat die twee verschillen.
   *
   * ⚠️ Ze staan bij élke groep en niet één keer boven de lijst. Een doel kan in
   *    een open én een beschermde groep tegelijk staan (EPIC 13 toetst precies
   *    die stand), en dan is één zin boven de lijst voor de helft onwaar.
   */
  'deling.uitleg_beschermd':
    'Beschermd. Deze groep ziet de titel en je mijlpaalvoortgang — niet je notities, ' +
    'niet je weken en niet je punten.',
  'deling.uitleg_open':
    'Open. Deze groep ziet de titel, je mijlpaalvoortgang én je weken — ook de weken die je ' +
    'niet gehaald hebt. Je notities en je punten blijven van jou.',
  'deelnemen.titel': 'Deelnemen',
  'deelnemen.eyebrow': 'MET EEN CODE',
  'deelnemen.code_label': 'Uitnodigingscode of -link',
  'deelnemen.code_hint': 'Twaalf tekens. Streepjes, spaties en de hele link mogen; die halen we er zelf af.',
  'deelnemen.herkend': 'Herkend als: {code}',
  'deelnemen.knop': 'Deelnemen aan deze groep',
  'deelnemen.werkt_niet': 'Werkt de code niet?',
  'deelnemen.werkt_niet_uitleg': 'Een link kan ingetrokken zijn, of vervangen door een nieuwe. Vraag degene die je uitnodigde om de link nog eens te sturen — die is dan meteen de geldige.',
  'deelnemen.terug': 'Terug',
  'groepnieuw.titel': 'Nieuwe groep',
  'groepnieuw.eyebrow': 'DRIE IS DE BESTE MAAT',
  'groepnieuw.naam': 'Hoe heet je groep?',
  'groepnieuw.naam_hint': 'Twee tot zestig tekens. Iets dat jullie herkennen in een WhatsApp-bericht.',
  'groepnieuw.naam_voorbeeld': 'De donderdagclub',
  'groepnieuw.huddledag': 'Huddledag',
  'groepnieuw.huddledag_hint': 'De dag waarop jullie samenkomen. Bepaalt de weekafsluiting, De Ketting en het groepsoverzicht — niet wanneer jouw eigen weekdoelen resetten, want dat blijft je persoonlijke week-startdag.',
  'groepnieuw.later_wijzigen': 'Later te wijzigen. Een lopende ketting breekt daar niet van: schakels blijven staan in de week waarin ze gelegd zijn.',
  'groepnieuw.wat_daarna': 'Wat er daarna gebeurt',
  'groepnieuw.wat_daarna_a': 'Je krijgt een uitnodigingslink die je kunt delen. Wie hem opent ziet de groep en waar jullie aan werken, ook zonder account. Je kunt de link altijd vernieuwen of sluiten.',
  'groepnieuw.wat_daarna_b': 'Je wordt beheerder. Er kunnen twaalf mensen in een groep, maar drie tot vijf werkt in de praktijk het best.',
  'groepnieuw.aanmaken': 'Groep aanmaken',
  'groepnieuw.annuleren': 'Annuleren',

  // ---------------------------------------------------------------------------
  // Zichtbaarheid van een groep — besluit A41 (QS8-132)
  // ---------------------------------------------------------------------------
  //
  // ⚠️ De teksten zeggen wat er verandert en niet wat je ervan moet vinden. Een
  //    open groep is geen slechtere groep; hij past bij andere mensen. Maar wie
  //    hem openzet, verandert wat er over ánderen zichtbaar is, en dat mag hier
  //    nergens weggeschreven worden.
  'zichtbaarheid.beschermd': 'Beschermd',
  'zichtbaarheid.open': 'Open',
  'zichtbaarheid.beschermd_uitleg':
    'De groep ziet wat er lukt: afgeronde weken, mijlpalen, aanmoedigingen. Een gemiste week blijft van jou, tenzij je hem zelf deelt.',
  'zichtbaarheid.open_uitleg':
    'De groep ziet ook wat er niet lukt: gemiste en doorgeschoven weken, elkaars beste reeks, wie er in welke week meedeed, en elkaars puntentotaal in deze groep. Kies dit alleen als iedereen dat wil.',
  'zichtbaarheid.niet_bevestigd': 'Bevestig eerst: dit verandert wat de groep over anderen ziet.',
  'zichtbaarheid.onbekend': 'Die instelling bestaat niet.',
  'zichtbaarheid.ongewijzigd': 'Zo stond hij al.',
  // ⚠️ Een rollend etmaal en geen kalenderdag — `created_at > now() - interval
  //    '1 day'` in migratie 0076. "Morgen kan het weer" was daarom onwaar voor
  //    wie 's avonds omzet. En de zin noemt nu de huidige stand, want hij
  //    verschijnt terwijl er "Nu ingesteld: Beschermd" boven staat.
  'zichtbaarheid.te_snel': 'Deze groep is in de afgelopen 24 uur al een keer opengezet. Beschermd blijft hij intussen gewoon; over een dag kun je het opnieuw proberen.',

  'groepnieuw.zichtbaarheid': 'Wat ziet de groep van elkaar?',
  'groepnieuw.zichtbaarheid_hint':
    'Dit is de belangrijkste keuze op dit scherm. Hij is later te wijzigen, maar niet ongemerkt: iedereen krijgt het te zien.',

  'beheer.zichtbaarheid_titel': 'Wat de groep van elkaar ziet',
  'beheer.zichtbaarheid_nu': 'Nu ingesteld: {stand}',
  'beheer.zichtbaarheid_waarschuwing':
    'Openzetten werkt met terugwerkende kracht: de groep ziet vanaf dat moment ook de gemiste weken die er al staan. Iedereen krijgt er een bericht van, zodat wie dat niet wil zijn doel kan ontkoppelen.',
  'bevestiging.groep_openzetten.titel': 'Deze groep openzetten?',
  'bevestiging.groep_openzetten.uitleg':
    'Vanaf nu ziet iedereen in deze groep ook elkaars gemiste en doorgeschoven weken, elkaars beste reeks ooit, van elke week wie er meedeed, en een klassement met elkaars puntentotaal in deze groep — ook de weken die er al staan. Dit gaat dus niet alleen over jou. Iedereen krijgt een bericht in de groepschat, zodat wie dat niet wil zijn doel kan ontkoppelen. Terugzetten kan altijd en meteen.',
  'bevestiging.groep_openzetten.knop': 'Ja, zet hem open',
  'bevestiging.groep_beschermen.titel': 'Deze groep weer beschermen?',
  'bevestiging.groep_beschermen.uitleg':
    'De groep ziet vanaf nu alleen nog wat er lukt. Gemiste weken worden weer privé, ook met terugwerkende kracht, en het klassement verdwijnt. Iedereen krijgt er een bericht van.',
  'bevestiging.groep_beschermen.knop': 'Ja, bescherm hem',
  'bevestiging.groep_ontdekbaar_maken.titel': 'Deze groep vindbaar maken?',
  'bevestiging.groep_ontdekbaar_maken.uitleg':
    'Mensen die je nog niet kent kunnen deze groep dan vinden en lidmaatschap aanvragen. Zij zien de naam, het onderwerp, je omschrijving, de voertaal, de huddledag en hoeveel leden er zijn. Zij zien niet wie erin zitten, welke doelen erin staan, de chat, De Ketting of iemands reeks. Aanvragen komen bij jou binnen en je hoeft er geen enkele aan te nemen. Iedereen in de groep krijgt er een bericht van. Terugzetten kan altijd en meteen.',
  'bevestiging.groep_ontdekbaar_maken.knop': 'Ja, maak hem vindbaar',
  'bevestiging.groep_verbergen.titel': 'Deze groep weer verbergen?',
  'bevestiging.groep_verbergen.uitleg':
    'De groep verdwijnt uit de zoeklijst en er kan niemand meer aankloppen. Aanvragen die al binnen zijn blijven staan en kun je gewoon beantwoorden. Voor de leden verandert er niets.',
  'bevestiging.groep_verbergen.knop': 'Ja, verberg hem',
  'bevestiging.groep_verlaten.titel': 'Deze groep verlaten?',
  'bevestiging.groep_verlaten.uitleg':
    'Je doel gaat uit deze groep en je kunt de chat, de weekafsluitingen en De Ketting hier niet meer openen. Wat je hebt opgebouwd blijft staan: je punten, je reeks, je voltooiingen en de goedkeuringen die je hebt gegeven. Hangt je doel ook aan een andere groep, dan verandert daar niets. Terugkomen kan alleen met een geldige uitnodigingslink.',
  'bevestiging.groep_verlaten.knop': 'Ja, verlaat deze groep',
  'bevestiging.weekstart_verzetten.titel': 'Je week op een andere dag laten beginnen?',
  'bevestiging.weekstart_verzetten.uitleg':
    'Je week begint vanaf nu op de nieuwe dag. Weekdoelen die je nog moet doen gaan mee naar je nieuwe week, dus je raakt niets kwijt. Weken die je al hebt ingediend of afgerond blijven staan waar ze staan, en je punten en je reeks veranderen niet.',
  'bevestiging.weekstart_verzetten.knop': 'Ja, verzet mijn weekstart',
  'verlaten.titel': 'Deze groep verlaten',
  'verlaten.uitleg':
    'Je stapt uit deze groep. Je doel wordt losgekoppeld van deze groep en van geen enkele andere.',
  'verlaten.blijft':
    'Je punten, je reeks en je geschiedenis blijven staan. Ook voor je buddies verandert er niets aan wat zij hebben opgebouwd.',
  'verlaten.knop': 'Groep verlaten',
  'verlaten.geen_lid': 'Je bent geen lid van deze groep.',
  'verlaten.laatste_beheerder':
    'Je bent de enige beheerder. Kies eerst iemand die het overneemt.',
  'verlaten.geen_geldige_opvolger': 'Kies een actief lid van deze groep.',
  'verlaten.opvolger_titel': 'Wie neemt het beheer over?',
  'verlaten.opvolger_uitleg':
    'Jij bent de enige beheerder. Zonder opvolger kan niemand deze groep nog beheren, dus kies er een voordat je vertrekt.',
  'verlaten.laatste_lid':
    'Je bent het laatste lid. De groep wordt bij je vertrek gearchiveerd, zodat er geen groep zonder beheerder achterblijft.',
  'bevestiging.groep_archiveren.titel': 'Deze groep archiveren?',
  'bevestiging.groep_archiveren.uitleg':
    'De groep verdwijnt daarna voor iedereen: de chat, de weekafsluitingen en De Ketting zijn niet meer te openen, ook niet voor jou. Wat erin staat wordt niet gewist — het blijft bewaard, en de reeksen van je buddies blijven kloppen. Maar dit is niet terug te draaien vanuit de app.',
  'bevestiging.groep_archiveren.knop': 'Ja, archiveer deze groep',
  'beheer.archief_titel': 'Groep archiveren',
  'beheer.archief_uitleg':
    'Is deze groep klaar, dan sluit je hem hiermee af. Hij verdwijnt bij alle leden en niemand kan er nog iets in doen.',
  'beheer.archief_waarschuwing':
    'Er wordt niets gewist, maar je kunt de groep hierna niet meer openen.',
  'beheer.archiveren': 'Deze groep archiveren',
  'beheer.melding_gearchiveerd': 'De groep is gearchiveerd.',
  'groep.gearchiveerd': 'Deze groep is gearchiveerd en niet meer te openen.',
  'beheer.naar_open': 'Deze groep openzetten',
  'beheer.naar_beschermd': 'Deze groep weer beschermen',
  'beheer.melding_open_gezet': 'De groep staat open. Iedereen heeft er een bericht van gekregen.',
  'beheer.melding_beschermd_gezet': 'De groep is weer beschermd.',
  'tab.vandaag': 'Vandaag',
  'tab.doelen': 'Doelen',
  'tab.groep': 'Groep',
  'tab.profiel': 'Profiel',
  'doelen.titel': 'Doelen',
  'doelen.leeg_titel': 'Nog geen doel',
  'doelen.leeg_tekst': 'Begin met één doel met een datum erop. De Doelcoach hakt het daarna in mijlpalen, en die mijlpalen worden je weekdoelen.',
  'doelen.van_totaal': '{aantal} van {totaal} doelen. Meer laden komt zodra er meer dan twintig zijn.',
  'doelen.nieuw': 'Nieuw doel',
  'doelen.doel': 'Doel',
  'doelen.streefdatum': 'Streefdatum {datum}',
  'doelen.datum_verstreken': 'Datum verstreken',
  'doelen.weken_afgerond': '{n} weken afgerond',
  'groepen.titel': 'Groep',
  'groepen.leeg_titel': 'Nog geen buddy-groep',
  'groepen.leeg_tekst': 'Drie mensen is de beste maat: groot genoeg dat er altijd iemand reageert, klein genoeg dat je je niet kunt verstoppen. Maak een groep aan of gebruik de uitnodigingslink die je hebt gekregen.',
  'groepen.aanmaken': 'Groep aanmaken',
  'groepen.heb_code': 'Ik heb een uitnodigingscode',
  'groepen.ontdekken': 'Een groep zoeken',
  'groepen.wachten_onbekend': 'Wachten er buddy’s op je?',
  'groepen.wacht_een': 'Een buddy wacht op je',
  'groepen.wachten_meer': '{n} buddy’s wachten op je',
  'groepen.ophalen_mislukt': 'Dat konden we even niet ophalen. Kijk zelf even — het duurt tien seconden.',
  'groepen.week_afgerond': 'Ze hebben hun week afgerond. Eén zin terug is genoeg — dat is het hele punt.',
  'groepen.beoordelen': 'Beoordelen',
  'groepen.slaapt': 'Deze groep slaapt. Sluit iemand een week af, dan is hij meteen weer wakker.',
  'groepen.huddledag': 'Huddledag: {dag}',
  'profiel.titel': 'Profiel',
  'profiel.leeg_titel': 'Geen profiel gevonden',
  'profiel.leeg_tekst': 'Dat hoort niet te kunnen. Log uit en opnieuw in; blijft het misgaan, dan ligt het aan ons.',
  'profiel.eigen_doel': 'Werkt aan een eigen doel',
  'profiel.als_buddy': 'Doet mee als buddy',
  'profiel.reeks_titel': 'Jouw reeks',
  'profiel.reeks_uitleg': 'Je reeks telt weken en staat per doel bij “Je stand” op Vandaag. Een weekpas beschermt je reeks als je een week mist — het punt niet, want anders zegt de score niets meer.',
  'profiel.verwijder_titel': 'Account verwijderen',
  'profiel.verwijder_uitleg': 'Je doelen, weken, Dagzetten, punten en lidmaatschappen verdwijnen. Wat blijft staan zijn de goedkeuringen die jij aan je buddy’s gaf en je berichten in de groepschat — zonder je naam erbij. Die zijn van hen.',
  'profiel.verwijder_knop': 'Ik wil mijn account verwijderen',
  'profiel.zeker_weten': 'Zeker weten?',
  'profiel.geen_backup': 'Dit kan niet ongedaan gemaakt worden. Er is geen back-up en geen hersteltermijn.',
  'profiel.typ_woord': 'Typ {woord} om te bevestigen',
  'profiel.definitief': 'Definitief verwijderen',
  'profiel.toch_niet': 'Toch niet',
  'profiel.weekstart_uitleg': 'De nieuwe dag geldt meteen. Weekdoelen die je nog moet doen gaan mee naar je nieuwe week; ingediende en afgeronde weken blijven staan waar ze staan. Je punten en je reeks veranderen niet.',
  'profiel.thema_systeem': 'Systeem',
  'profiel.thema_donker': 'Donker',
  'profiel.thema_licht': 'Licht',
  'profiel.weergave': 'Weergave',
  'profiel.weergave_uitleg': 'Donker is de standaard van dit stelsel. Kies je Systeem, dan volgt de app de instelling van je toestel — ook als die ’s avonds omschakelt.',
  'profiel.weergave_label': 'Weergave: {stand}',
  'profiel.herinnering_titel': 'Dagelijkse herinnering',
  'profiel.herinnering_uitleg': 'Eén rustig zetje per dag, alleen als je nog niets gedaan hebt. Heb je vandaag al een Dagzet geschreven of een week afgerond, dan blijft het stil.',
  'profiel.herinnering_label': 'Herinnering',
  'profiel.herinnering_hoe_laat': 'Hoe laat',
  'profiel.herinnering_hoe_laat_hint': 'In je eigen tijdzone, als 24-uursklok. Bijvoorbeeld 20:00.',
  'profiel.herinnering_toon': 'Toon',
  'profiel.herinnering_toon_hint': 'Streng is directer, nooit verwijtend. De app rekent je nergens op af.',
  'profiel.herinnering_zacht': 'Zacht',
  'profiel.herinnering_streng': 'Streng',
  'profiel.herinnering_uit_blijft_uit': 'Uit is uit. Zet je hem later weer aan, dan kies je opnieuw een tijd — hij komt niet vanzelf terug.',
  'profiel.herinnering_bewaren': 'Herinnering bewaren',
  'profiel.herinnering_bewaard': 'Bewaard.',
  'profiel.herinnering_geen_meldingen': 'Zet meldingen hierboven aan, anders wordt er niets bezorgd.',
  'profiel.viering_titel': 'Feestelijke momenten',
  'profiel.viering_uitleg': 'Een korte felicitatie als een buddy je week bevestigt, je een mijlpaal haalt of je doel af is. Verder blijft de app rustig.',
  'profiel.viering_aan_label': 'Feestelijke momenten aan',
  'profiel.viering_uit_label': 'Feestelijke momenten uit',
  'profiel.aan': 'Aan',
  'profiel.uit': 'Uit',
  'profiel.viering_beweging': 'Vraagt je toestel om minder beweging, dan laat de app de animatie sowieso weg. De tekst blijft dan gewoon staan.',
  'profiel.bijdrage_titel': 'Buddy-bijdrage',
  'profiel.bijdrage_mislukt': 'Even niet op te halen. Je bijdrage staat er nog, hij is alleen niet te tellen.',
  'profiel.bijdrage_geen': 'Je hebt nog geen week van een buddy beoordeeld.',
  'profiel.bijdrage_een': 'Je hebt één week van een buddy beoordeeld.',
  'profiel.bijdrage_meer': 'Je hebt {n} weken van buddy’s beoordeeld.',
  'profiel.bijdrage_uitleg': 'Reviewen telt mee. Doorvragen levert net zoveel op als goedkeuren — het gaat om betrokkenheid, niet om ja zeggen.',
  'profiel.meldingen': 'Meldingen',
  'profiel.meldingen_aanzetten': 'Meldingen aanzetten',
  'profiel.meldingen_uitzetten': 'Meldingen uitzetten',
  'profiel.meldingen_uit_gelukt': 'Meldingen staan uit op dit apparaat.',
  'profiel.meldingen_uit_mislukt': 'Uitzetten lukte niet. Probeer het zo nog eens.',
  'profiel.meldingen_mislukt': 'Aanzetten lukte niet. Probeer het zo nog eens.',
  'profiel.meldingen_aan': 'Meldingen staan aan. Je krijgt bericht als een buddy je week goedkeurt of als je weekafsluiting klaarstaat.',
  'profiel.meldingen_uit': 'Krijg bericht als een buddy je week goedkeurt of als je weekafsluiting klaarstaat. We vragen je browser eenmalig om toestemming.',
  'profiel.meldingen_geweigerd': 'Je hebt meldingen eerder geweigerd. Dat kan alleen in de instellingen van je browser terug — wij kunnen er niet opnieuw om vragen.',
  'profiel.meldingen_niet_ondersteund': 'Deze browser kan geen meldingen ontvangen.',
  'profiel.meldingen_geen_sleutel': 'Meldingen staan in deze omgeving nog niet klaar. Dit ligt niet aan jou.',
  'profiel.beginscherm_ios': 'Op iPhone en iPad werken meldingen alleen als de app op je beginscherm staat. Tik op Deel en kies Zet op beginscherm; open hem daarna vanaf je beginscherm.',
  'profiel.beginscherm_safari': 'Op iPhone en iPad werken meldingen alleen vanuit Safari. Open goalbuddies.q-projects.tech in Safari en zet hem daar op je beginscherm.',
  'vandaag.titel': 'Vandaag',
  'vandaag.eyebrow_week': 'WEEK VAN {datum}',
  'vandaag.eyebrow_deze': 'DEZE WEEK',
  'vandaag.coulance_titel': 'Je vorige week loopt nog even door',
  'vandaag.coulance_tekst': 'Je nieuwe week is begonnen, maar je kunt de week van {datum} nog afsluiten. Dat venster duurt twaalf uur — zondagavond klaar, maandagochtend gelogd.',
  'vandaag.leeg_titel': 'Nog geen weekdoelen',
  'vandaag.leeg_tekst': 'Een weekdoel is wat je deze week af wilt hebben. Geef het een vloer — de versie die je op je slechtste week nog haalt — en een plafond. De vloer halen telt: je reeks loopt door. Je maakt hem aan op het doel waar hij bij hoort.',
  'vandaag.weekdoel_toevoegen': 'Weekdoel toevoegen',
  'vandaag.toevoegen_uitleg': 'Je maakt een weekdoel aan op het doel waar hij bij hoort.',
  'vandaag.stand': 'Je stand',
  'vandaag.stand_leeg': 'Zodra je eerste week is goedgekeurd, staan je reeks en je punten hier.',
  'vandaag.openstaand': 'Nog open van eerdere weken',
  'vandaag.meenemen_uitleg': 'Je kunt deze meenemen naar de week die nu loopt. De week zelf blijft gemist — meenemen verhuist het werk, het herstelt je reeks niet.',
  'vandaag.antwoord_opnieuw': 'Antwoorden en opnieuw indienen',
  'vandaag.niveau_label': 'Wat heb je gehaald?',
  'vandaag.niveau_hint': 'De vloer halen telt. Je reeks loopt door; alleen de punten verschillen.',
  'vandaag.vloer': 'De vloer',
  'vandaag.plafond': 'Het plafond',
  'vandaag.notitie_label': 'Wat heb je gedaan?',
  'vandaag.notitie_optioneel': 'Mag leeg blijven in deze groep. Eén zin geeft je buddy wel iets om op te reageren.',
  'vandaag.notitie_verplicht': 'Je groep vraagt hierom. Eén zin is genoeg.',
  'vandaag.opnieuw_indienen': 'Opnieuw indienen',
  'vandaag.indienen': 'Indienen',
  'vandaag.annuleren': 'Annuleren',
  'vandaag.afronden': 'Afronden',
  'vandaag.week_afsluiten': 'Deze week afsluiten',
  'vandaag.weggooien': 'Weggooien',
  'vandaag.weggooien_label': 'Weekdoel {titel} weggooien',
  'dagzet.titel': 'De Dagzet',
  'dagzet.uitleg': 'Eén regel over wat je vandaag gedaan hebt. Tien seconden, geen punten, niemand hoeft hem goed te keuren.',
  'dagzet.vandaag': 'Vandaag',
  'dagzet.voorbeeld': 'Twee uur aan hoofdstuk 3 gewerkt',
  'dagzet.zichtbaarheid': 'Zichtbaarheid',
  'dagzet.zichtbaarheid_hint': 'Standaard alleen voor jezelf.',
  'dagzet.alleen_ik': 'Alleen ik',
  'dagzet.deel_groep': 'Deel met mijn groep',
  'dagzet.vastleggen': 'Vastleggen',
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
  'coach.bewaard': 'Bewaard',
  'coach.bewaren': 'Antwoorden bewaren',
  'coach.alle_overnemen': 'Alle {aantal} overnemen',
  'avatar.kop': 'Profielfoto',
  'avatar.uitleg': 'Je groepsgenoten zien hem naast je naam. Zonder foto staan je initialen er.',
  'avatar.kiezen': 'Foto kiezen',
  'avatar.vervangen': 'Andere foto kiezen',
  'avatar.verwijderen': 'Foto weghalen',
  'avatar.bezig': 'Bezig met uploaden',
  'avatar.type_niet_toegestaan': 'Kies een JPG, PNG of WebP.',
  'avatar.te_groot': 'Die foto is groter dan 2 MB. Kies een kleinere.',
  'avatar.uploaden_mislukt': 'De foto kon niet opgeslagen worden. Probeer het opnieuw.',
  'avatar.verwijderen_mislukt': 'De foto kon niet weggehaald worden. Probeer het opnieuw.',
  'avatar.geen_toegang': 'Zonder toegang tot je foto’s kan de app er geen kiezen.',
  'avatar.grens': 'JPG, PNG of WebP, tot {mb} MB. Alleen je groepsgenoten zien hem.',
  'coach.woord_kop': 'De Doelcoach',
  'coach.woord.at_risk':
    'Er is nog ruimte. Haal je de vloer van je weekdoel, dan telt de week gewoon mee.',
  'coach.woord.behind':
    'Een mindere week zegt niets over de weken erna. De vloer halen laat je reeks doorlopen, en een adempauze inzetten mag ook.',
  'coach.woord.unreachable':
    'Dit is een moment om je streefdatum bij te stellen, niet om te stoppen. Wat je tot nu toe deed, blijft staan.',
  'coach.titel': 'De Doelcoach',
  'coach.vastgelopen': 'De Doelcoach liep vast.',
  // Een doel uit één zin — QS8-201.
  'plan.titel': 'Wat wil je bereiken?',
  'plan.eyebrow': 'Nieuw doel',
  'plan.wat': 'Zeg het in één zin',
  'plan.wat_hint': 'Gewoon in je eigen woorden. De coach maakt er een plan van.',
  'plan.wat_voorbeeld': '20 kg afvallen voor de zomer',
  'plan.wanneer': 'Wanneer wil je het bereikt hebben?',
  'plan.wanneer_hint': 'Een datum. Je kunt hem later nog verzetten.',
  'plan.maak': 'Maak mijn plan',
  'plan.annuleren': 'Annuleren',
  'plan.bezig': 'De coach maakt je plan. Dit duurt ongeveer twintig seconden.',
  'plan.geen_plan': 'De coach kwam er niet uit met deze zin. Probeer het iets concreter te zeggen.',
  'plan.terugval_uitleg': 'Je kunt je doel ook zelf invullen. Wat je hierboven typte, nemen we mee.',
  'plan.zelf_invullen': 'Zelf invullen',
  'plan.haalbaarheid': 'Even eerlijk',
  'plan.stappen': 'Je stappen',
  'plan.geen_stappen': 'De coach stelde geen stappen voor. Je kunt ze straks zelf toevoegen.',
  'plan.deze_week': 'Deze week',
  'plan.geen_weekdoel': 'Nog geen weekdoel. Je kiest straks zelf wat je deze week doet.',
  'plan.vloer': 'Vloer',
  'plan.plafond': 'Plafond',
  'plan.goed_zo': 'Zo is het goed',
  'plan.anders': 'Ik wil iets anders',
  'coach.plan_zonder_mijlpalen':
    'Je doel staat, maar de stappen zijn niet opgeslagen. Voeg ze zelf toe of laat de coach het opnieuw proberen.',
  'coach.plan_zonder_weekdoel':
    'Je doel en je stappen staan. Alleen het weekdoel is niet opgeslagen — kies zelf wat je deze week doet.',
  'coach.daglimiet': 'Je hebt vandaag al {limiet} keer de Doelcoach gebruikt. Morgen kan het weer — je kunt intussen zelf mijlpalen toevoegen.',
  'coach.eyebrow': 'ZES VRAGEN',
  'coach.zes_vragen': 'Zes vragen, en je mag ze allemaal overslaan. Hoe meer je invult, hoe beter de mijlpalen bij jou passen — maar overslaan werkt gewoon.',
  'coach.alleen_voor_jou': 'Je antwoorden zijn alleen voor jou en de Doelcoach. Je groep ziet ze nooit.',
  'coach.bewaren_niet_nodig': 'Bewaren is niet nodig om verder te gaan — de Doelcoach gebruikt wat hier staat.',
  'coach.denkt_na': 'De Doelcoach denkt na',
  'coach.duurt_even': 'Dit duurt ongeveer twintig seconden. Je kunt dit scherm openhouden; het resultaat komt vanzelf.',
  'coach.lukte_niet': 'Dat lukte niet',
  'coach.zelf_toevoegen': 'Zelf mijlpalen toevoegen',
  'coach.opnieuw': 'Opnieuw proberen',
  'coach.bedenking': 'De Doelcoach heeft een bedenking',
  'coach.bedenking_uitleg': 'Je kunt de mijlpalen gewoon overnemen. Je streefdatum verzetten of je doel kleiner maken kan daarna op het doelscherm.',
  'coach.neem_over': 'Neem ze over en pas ze daarna aan wat je wilt — schrappen, herschrijven en herordenen kan allemaal op het doelscherm.',
  'coach.toch_niet': 'Toch niet',
  'coach.al_mijlpalen': 'Je hebt al mijlpalen bij dit doel. Overnemen zet deze erbij en vervangt ze niet — schrap eerst wat je niet wilt houden.',
  'coach.laten_voorstellen': 'Mijlpalen laten voorstellen',
  'coach.wat_hij_doet': 'De Doelcoach knipt je doel op in mijlpalen met streefdata, op basis van wat je hierboven hebt ingevuld. Je kunt daarna alles aanpassen.',
  'coach.tien_per_dag': 'Je kunt dit tien keer per dag doen. Dezelfde vraag binnen een dag kost geen nieuwe beurt.',
  'coach.genereer': 'Genereer mijlpalen',
  'coach.starten_mislukt': 'De Doelcoach kon niet gestart worden.',
  'coach.niet_jouw_doel': 'Dit doel is niet van jou.',
  'coach.invoer_te_groot':
    'Je vraag is te lang voor de Doelcoach. Kort je omschrijving of je antwoorden wat in en probeer het opnieuw.',
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
  'groep.uitnodiging_te_druk':
    'Deze uitnodiging is het afgelopen uur te vaak geopend. Probeer het straks opnieuw — de link blijft gewoon geldig.',
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

  // ---------------------------------------------------------------------------
  // De goedkeuringsregel van een groep — QS8-65 (PRD 6.4), migratie 0111
  // ---------------------------------------------------------------------------
  //
  // ⚠️ De uitleg noemt steeds een áántal en niet een gevoel. "Strenger" zegt de
  //    gebruiker niets; "twee van je buddy's" wel, en dat is ook precies wat de
  //    database telt.
  'goedkeuringsregel.any': 'Eén buddy',
  'goedkeuringsregel.majority': 'Een meerderheid',
  'goedkeuringsregel.quorum': 'Een vast aantal',
  'goedkeuringsregel.any_uitleg':
    'Zodra één buddy je week bevestigt, telt hij. Snel, en genoeg voor een groep ' +
    'die elkaar vertrouwt.',
  'goedkeuringsregel.majority_uitleg':
    'Meer dan de helft van je buddy\u2019s moet je week bevestigen. Het aantal ' +
    'schuift mee als de groep groeit of krimpt.',
  'goedkeuringsregel.quorum_uitleg':
    'Je kiest zelf hoeveel buddy\u2019s een week moeten bevestigen. Zijn er even ' +
    'minder mensen dan dat, dan telt iedereen die er is.',
  // ---------------------------------------------------------------------------
  // Seizoenen — QS8-79 (PRD 8.5), migratie 0112
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Badges — QS8-78 (PRD 8.4), migratie 0113
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Badges zijn privé.** Deze teksten staan nooit op een groepsscherm; de
  //    badge die er níét staat, zou daar het signaal zijn. Zie het beslisdocument
  //    `2026-08-27-badges-zijn-prive.md`.
  //
  // ⚠️ De uitleg staat in de **verleden tijd en over jou** — "je rondde je eerste
  //    doel af", niet "rond een doel af". Een badge die je al hebt, is geen
  //    opdracht meer.
  'badge.kop': 'Wat je tot nu toe gedaan hebt',
  'badge.nog_geen': 'Hier komen je eerste mijlpalen te staan. De eerste komt sneller dan je denkt.',
  'badge.laden_mislukt': 'Je badges konden niet geladen worden.',
  'badge.first_goal': 'Eerste doel af',
  'badge.first_goal_uitleg': 'Je rondde je eerste doel helemaal af.',
  'badge.first_milestone': 'Eerste mijlpaal',
  'badge.first_milestone_uitleg': 'Je haalde je eerste mijlpaal binnen een doel.',
  'badge.first_review': 'Eerste bevestiging',
  // ⚠️ Deze is de enige die niet over je eigen prestatie gaat, en dat is opzet:
  //    zonder beoordelaars bestaat peer-goedkeuring niet.
  'badge.first_review_uitleg': 'Je bevestigde voor het eerst de week van een buddy.',
  'badge.streak_4': 'Vier weken op rij',
  'badge.streak_4_uitleg': 'Je hield vier cycli achter elkaar vol.',
  'badge.streak_12': 'Twaalf weken op rij',
  'badge.streak_12_uitleg': 'Je hield twaalf cycli achter elkaar vol — een heel kwartaal.',
  // ⚠️ Staat onder de lijst en is geen loze geruststelling: hij legt uit waaróm
  //    een badge blijft staan als je reeks breekt, en dat is precies het moment
  //    waarop iemand anders zou denken dat hij hem kwijt is.
  'badge.blijven_staan': 'Wat je verdiend hebt, blijft staan. Ook als een reeks een keer breekt.',
  'seizoen.kop': 'Hoe lang duurt een seizoen?',
  'seizoen.monthly': 'Een maand',
  'seizoen.quarterly': 'Een kwartaal',
  // ⚠️ De reden staat erbij en niet alleen de keuze. Een maand is met weekcycli
  //    maar vier datapunten; dat is de afweging uit het productvoorstel §1.5.
  'seizoen.uitleg':
    'Aan het eind van een seizoen komt er één bericht in de groep met wat jullie ' +
    'samen gedaan hebben. Met weekcycli geeft een kwartaal een eerlijker beeld dan ' +
    'een maand — dat zijn er maar vier.',
  'goedkeuringsregel.kop': 'Wanneer telt een week?',
  'goedkeuringsregel.quorum_veld': 'Hoeveel bevestigingen?',
  'goedkeuringsregel.quorum_hint': 'Tussen {min} en {max}.',
  // ⚠️ Staat onder de keuze en niet in een bevestigingsstap: de regel verandert
  //    niets aan weken die al lopen, dus er valt niets te bevestigen. Dát is de
  //    geruststelling die hier hoort.
  'goedkeuringsregel.niet_terugwerkend':
    'Wat je hier kiest geldt vanaf de volgende week die iemand indient. Weken die ' +
    'al op een bevestiging wachten, houden de regel van toen.',
  'goedkeuringsregel.stand': '{gedaan} van de {nodig} bevestigingen',
  'goedkeuringsregel.nog_een': 'Er is nog één bevestiging nodig.',
  'goedkeuringsregel.nog_meer': 'Er zijn nog {aantal} bevestigingen nodig.',
  'validatie.quorum_bereik': 'Kies een aantal tussen {min} en {max}.',
  'validatie.quorum_ontbreekt': 'Kies hoeveel bevestigingen er nodig zijn.',
  'validatie.quorum_overbodig': 'Een aantal hoort alleen bij een vast aantal bevestigingen.',

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
  'chat.rem_bereikt':
    'Je hebt vandaag het maximum aantal berichten geplaatst. Straks kun je weer verder.',
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
  'weekafsluiting.titel': 'De weekafsluiting',
  'weekafsluiting.eyebrow': 'HUDDLEDAG {dag}',
  'weekafsluiting.geen_lid_titel': 'Deze groep is er niet, of niet voor jou',
  'weekafsluiting.geen_lid_tekst': 'Je bent geen lid van deze groep, of hij bestaat niet meer. Vraag om een nieuwe uitnodigingslink als je erbij hoort.',
  'weekafsluiting.meer_reacties': 'Meer reacties laden',
  'weekafsluiting.niet_gedeeld': 'Je hebt tekst staan die nog niet gedeeld is. Weggaan gooit hem weg.',
  'weekafsluiting.terugknop_tegengehouden':
    'Je tekst staat er nog, dus de terugknop doet even niets. Deel hem, of gebruik de knop hieronder.',
  'weekafsluiting.toch_weg': 'Toch weg, zonder delen',
  'weekafsluiting.terug': 'Terug naar de groep',
  'weekafsluiting.sessie_laadt': 'Je sessie is nog aan het laden. Probeer het over een tel opnieuw.',
  'weekafsluiting.staat_op_kaart': 'Je antwoorden staan op de kaart hieronder. Je kunt ze bijwerken of helemaal terugnemen.',
  'weekafsluiting.terugnemen_uitleg': 'Je antwoorden verdwijnen van de kaart. Dat kun je daarna niet terughalen.',
  'weekafsluiting.terugnemen_een_reactie': 'Let op: hiermee verdwijnt ook de reactie die je groep erop gaf.',
  'weekafsluiting.terugnemen_reacties': 'Let op: hiermee verdwijnen ook de {n} reacties die je groep erop gaf.',
  'weekafsluiting.ja_terugnemen': 'Ja, terugnemen',
  'weekafsluiting.toch_niet': 'Toch niet',
  'weekafsluiting.bijwerken': 'Bijwerken',
  'weekafsluiting.terugnemen': 'Terugnemen',
  'weekafsluiting.mogen_leeg': 'Alle drie mogen leeg blijven. Wie niets invult, staat niet op de kaart — er komt geen lege regel van.',
  'weekafsluiting.delen': 'Delen met mijn groep',
  'weekafsluiting.toch_niet_bijwerken': 'Toch niet bijwerken',
  'weekafsluiting.nog_niemand': 'Nog niemand heeft deze week iets gedeeld. Wie begint, maakt het voor de rest makkelijker.',
  'weekafsluiting.weghalen': 'Weghalen',
  'weekafsluiting.reageren_op': 'Reageren op {naam}',
  'weekafsluiting.reactie_hint': 'Een reactie is niet te bewerken. Weghalen kan wel.',
  'weekafsluiting.reactie_voorbeeld': 'Mooi dat je bent doorgegaan. Wat helpt je dinsdag?',
  'weekafsluiting.reactie_versturen': 'Reactie versturen',
  'weekafsluiting.je_hebt_gedeeld': 'Je hebt deze week gedeeld',
  'weekafsluiting.drie_vragen': 'Drie vragen',
  'weekafsluiting.v1.label': 'Wat heb je gedaan?',
  'weekafsluiting.v1.hint':
    'Wat je hier zet, ziet je groep.',
  'weekafsluiting.v1.uit_dagzetten': 'Overnemen uit mijn Dagzetten',
  'weekafsluiting.v1.uit_dagzetten_uitleg': 'Je Dagzetten van deze week staan klaar. Overnemen zet ze in het veld hierboven; daarna kun je ze aanpassen of weer weghalen.',
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
  'weekafsluiting.reactie_rem_bereikt':
    'Je hebt vandaag het maximum aantal reacties geplaatst. Straks kun je weer verder.',

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

  // ---------------------------------------------------------------------------
  // De vijftien gebieden — QS8-224, migratie 0142
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Labels en geen omschrijvingen.** Ze staan naast elkaar in een keuzelijst,
  //    dus ze moeten op één regel passen en meteen te onderscheiden zijn. "Sport
  //    en beweging" en niet "Sport, beweging en alles wat je lichaam vraagt".
  //
  // ⚠️ **Geen emoji, ook niet als pictogram.** Een pictogram naast een label is
  //    iets anders dan een emoji in een label; dat eerste komt met QS8-255 en is
  //    geen tekst. Zie de emoji-regel in CLAUDE.md.
  'nieuwdoel.categorie_hint': 'Waar gaat dit doel over? Eén gebied per doel.',

  'categorie.fitness': 'Sport en beweging',
  'categorie.nutrition': 'Voeding',
  'categorie.self_care': 'Zelfzorg',
  'categorie.mindfulness': 'Rust en aandacht',
  'categorie.connection': 'Contact met anderen',
  'categorie.helping': 'Iets voor een ander',
  'categorie.creativity': 'Creativiteit',
  'categorie.productivity': 'Productiviteit',
  'categorie.organization': 'Orde en overzicht',
  'categorie.learning': 'Leren',
  'categorie.skills': 'Vaardigheden',
  'categorie.resilience': 'Veerkracht',

  'categoriegroep.lichaam': 'Lichaam en rust',
  'categoriegroep.mensen': 'Mensen en maken',
  'categoriegroep.werk': 'Werk en groei',
  'categoriegroep.rest': 'Werk, school en overig',

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
  'weekdoel.te_veel_deze_dag':
    'Je hebt vandaag het maximum aantal weekdoelen aangemaakt. Straks kun je weer verder.',
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

  // ---------------------------------------------------------------------------
  // Een doel aanmaken — QS8-31
  // ---------------------------------------------------------------------------
  'nieuwdoel.titel': 'Nieuw doel',
  'nieuwdoel.eyebrow': 'ÉÉN DOEL TEGELIJK',
  'nieuwdoel.wat': 'Wat wil je bereiken?',
  'nieuwdoel.wat_hint': 'Zo concreet dat een ander kan zien of het gelukt is.',
  'nieuwdoel.wat_voorbeeld': 'Mijn boek afmaken',
  // ⚠️ De identiteitsvraag staat bóven de beschrijving en niet bij de optionele
  //    velden onderaan. Dat is de vondst uit de Habit Huddle-analyse (voorstel
  //    §1.5); verplaats hem niet naar beneden omdat hij optioneel is.
  'nieuwdoel.identiteit': 'Wie word je als dit lukt?',
  'nieuwdoel.identiteit_hint':
    'Optioneel, maar dit is de vraag die je er over vier maanden nog doorheen sleept.',
  'nieuwdoel.identiteit_voorbeeld': 'Iemand die schrijft, en niet iemand die wil schrijven',
  'nieuwdoel.streefdatum': 'Streefdatum',
  'nieuwdoel.streefdatum_hint':
    'Moet in de toekomst liggen. Je kunt hem later verzetten, maar dat wordt bijgehouden.',
  'nieuwdoel.categorie': 'Categorie',
  'nieuwdoel.meer_details': 'Meer details',
  'nieuwdoel.meer_details_uitleg':
    'Allebei optioneel. De Doelcoach gebruikt ze straks om beter te splitsen.',
  'nieuwdoel.beschrijving': 'Beschrijving',
  'nieuwdoel.beschrijving_voorbeeld': 'Waar gaat het over, en wat heb je al gedaan?',
  'nieuwdoel.uren': 'Uren per week',
  'nieuwdoel.uren_hint':
    'Hoeveel tijd heb je hier realistisch voor? Voedt straks de Risico-radar.',
  'mijlpaalbewerken.titel': 'Titel',
  'mijlpaalbewerken.omschrijving': 'Omschrijving',
  'mijlpaalbewerken.streefdatum': 'Streefdatum',
  'mijlpaalbewerken.streefdatum_hint':
    'Optioneel, als jjjj-mm-dd. Leeg laten mag; deze datum is van jou en verschuift zonder overleg.',
  'mijlpaalbewerken.bewaren': 'Bewaren',
  'mijlpaalbewerken.annuleren': 'Annuleren',
  'mijlpalenblok.bewerken': 'Bewerken',
  'mijlpalenblok.bewerken_label': 'Mijlpaal {titel} bewerken',
  'commitmentspoor.toon': 'Toon het spoor',
  'commitmentspoor.verberg': 'Verberg het spoor',
  'commitmentspoor.leeg_titel': 'Nog geen gebeurtenissen',
  'commitmentspoor.leeg_tekst':
    'Zodra er iets met deze afspraak gebeurt, staat het hier. Alleen jij ziet dit.',
  'commitmentspoor.created': 'Aangemaakt',
  'commitmentspoor.confirmed': 'Door jou bevestigd',
  'commitmentspoor.edited': 'Aangepast',
  'commitmentspoor.triggered': 'Verschuldigd geworden',
  'commitmentspoor.posted': 'Gedeeld met de groep',
  'commitmentspoor.resolved': 'Afgehandeld',
  'commitmentspoor.cancelled': 'Ingetrokken',
  'doelbewerken.titel': 'Doel bewerken',
  'doelbewerken.eyebrow': 'Jouw doel',
  'doelbewerken.bewaren': 'Wijzigingen bewaren',
  'doelbewerken.annuleren': 'Terug zonder bewaren',
  'doelbewerken.leeg_titel': 'Dit doel bestaat niet meer',
  'doelbewerken.leeg_tekst':
    'Misschien is het verwijderd, of hoort het bij iemand anders. Ga terug naar je doelen.',
  'doelbewerken.streefdatum_kop': 'Streefdatum',
  'doelbewerken.streefdatum_uitleg':
    'Je streefdatum staat op {datum} en verandert hier niet. Een datum verschuiven vraag je aan een buddy — anders is een afspraak eenzijdig op te rekken. Dat doe je op het doel zelf.',
  'doelbewerken.knop': 'Doel bewerken',
  'nieuwdoel.aanmaken': 'Doel aanmaken',
  'nieuwdoel.annuleren': 'Annuleren',

  // ---------------------------------------------------------------------------
  // Het doelscherm — QS8-32 en verder
  // ---------------------------------------------------------------------------
  'doelscherm.titel': 'Doel',
  // ⚠️ "Bestaat niet" en niet "geen toegang", en dat is geen slordige tekst maar
  //    het scherm dat doet wat de database doet: RLS geeft nul rijen terug of je
  //    nu naar een verwijderd doel kijkt of naar dat van iemand anders. Zou hier
  //    "je mag dit niet zien" staan, dan verraadt de melding dát het bestaat.
  'doelscherm.leeg_titel': 'Dit doel bestaat niet',
  'doelscherm.leeg_body': 'Of het is verwijderd, of het is niet van jou. Controleer de link.',
  'doelscherm.streefdatum': 'Streefdatum {datum}',
  'doelscherm.weekdoelen_afgerond': '{gedaan} van {totaal} weekdoelen afgerond',

  'deadline.verzoek_loopt': 'Je verzoek loopt',
  'deadline.verzoek_uitleg': 'Je vroeg om {oud} te verzetten naar {nieuw}.',
  'deadline.buddy_beslist':
    'Een van je buddy’s beslist hierover. Zolang dat niet gebeurd is, blijft de datum ' +
    'staan zoals hij was.',
  'deadline.verzoek_intrekken': 'Verzoek intrekken',
  'deadline.kop': 'Deadline',
  'deadline.akkoord': 'Je buddy ging akkoord: de datum staat nu op {datum}.',
  'deadline.afgewezen': 'Je buddy vond het nog te vroeg om te verzetten. De datum is niet veranderd.',
  'deadline.opnieuw_vragen': 'Je kunt het opnieuw vragen als er iets veranderd is.',
  'deadline.gedeeld_uitleg':
    'Je deelt dit doel met je groep, dus de datum verzet je samen. Schrijf erbij wat er ' +
    'veranderd is; een buddy beslist erover.',
  'deadline.alleen_uitleg':
    'Verzetten mag. Het wordt wel bijgehouden, zodat je later eerlijk kunt terugkijken.',
  'deadline.vraag_knop': 'Vraag om te verzetten',
  'deadline.verzet_knop': 'Deadline verzetten',
  'deadline.nieuwe_datum': 'Nieuwe streefdatum',
  'deadline.datum_label': 'Datum',
  // ⚠️ "Wat is er veranderd" en niet "waarom haal je het niet". De vraag gaat over
  //    de omstandigheid en niet over de persoon — dezelfde toon als vraag 2 van de
  //    weekafsluiting, en om dezelfde reden. Houd dat vast in élke vertaling.
  'deadline.wat_veranderd': 'Wat is er veranderd?',
  'deadline.wat_veranderd_hint':
    'Je buddy’s in {groep} lezen dit en beslissen erop. Eén eerlijke zin is genoeg.',
  'deadline.jouw_groep': 'je groep',
  // ⚠️ QS8-56. Tot dan koos het scherm stilzwijgend de eerste groep uit de lijst,
  //    en die lijst had niet eens een vaste volgorde. Zolang een doel maar in één
  //    groep kón staan viel dat niemand op; met PRD 5.5 is het de vraag zelf.
  'deling.welke_groep': 'Welke groep beslist hierover?',
  'deling.welke_groep_hint':
    'Dit doel staat in meer dan één groep. Alleen de groep die je hier kiest, leest je ' +
    'uitleg en beslist over de nieuwe datum.',
  'deling.kies_eerst': 'Kies eerst welke groep erover beslist.',
  'deadline.argument_voorbeeld':
    'Het project op mijn werk is met zes weken uitgelopen en dat eet mijn avonden op.',
  'deadline.nog_tekens': 'Nog {aantal} tekens te gaan.',
  'deadline.lang_genoeg': 'Lang genoeg.',
  'deadline.versturen': 'Verzoek versturen',
  'deadline.vastleggen': 'Vastleggen',
  'deadline.annuleren': 'Annuleren',

  // ---------------------------------------------------------------------------
  // Beloning en straf op het doelscherm — QS8-34, QS8-35 en QS8-85
  // ---------------------------------------------------------------------------
  'commitment.stand': '{titel} — {uitleg}',
  // ⚠️ QS8-85, acceptatiecriterium 2: deze belofte moet er letterlijk staan.
  //    Iemand die "ik trakteer op een etentje" invult, hoort niet te hoeven raden
  //    of de app zijn rekening gaat plunderen. Er staat een test op deze sleutel
  //    die hem in béide talen nakijkt — verwater hem niet in een vertaling.
  'commitment.geen_afrekening': 'De app rekent niets af. Dit wordt alleen bijgehouden.',

  'beloning.jouw': 'Je beloning',
  'beloning.vastgelegd_op': 'Vastgelegd op {datum}.',
  'beloning.kop': 'Beloning',
  'beloning.uitleg': 'Wat gun je jezelf als dit lukt? Optioneel, maar het werkt.',
  'beloning.veld': 'Mijn beloning',
  'beloning.voorbeeld': 'Een weekend weg zonder laptop',
  'beloning.vastleggen': 'Vastleggen',

  'straf.jouw': 'Je straf',
  'straf.intrekken': 'Intrekken',
  'straf.kop': 'Straf',
  'straf.geen_groep':
    'Een straf gaat naar een van je groepen. Je zit nog nergens in, dus dit kan pas als je ' +
    'een buddy-groep hebt.',
  'straf.zeker': 'Weet je het zeker?',
  'straf.bevestig_uitleg':
    'Als {groep} dit te zien krijgt, is dat omdat je streefdatum verstreken is zonder dat ' +
    'je doel af was.',
  'straf.dan_geldt': 'Dan geldt: {tekst}',
  // ⚠️ Domeinregel 11 in één zin: de groep krijgt pas leesrecht op het moment dat
  //    de straf verschuldigd wordt. Tot dan is dit van jou alleen.
  'straf.tot_dan':
    'Tot dat moment ziet niemand dit — ook je groep niet. Intrekken kan zolang het niet in ' +
    'werking is getreden.',
  'straf.ja_vastleggen': 'Ja, leg dit vast',
  'straf.terug': 'Terug',
  'straf.uitleg':
    'Wat gebeurt er als je je streefdatum niet haalt? Optioneel, en je kunt hem intrekken ' +
    'zolang hij niet in werking is.',
  'straf.geen_geld':
    'De app rekent niets af en verwerkt geen geld. Je legt hier vast wat je met je groep ' +
    'afspreekt; het uitvoeren doen jullie zelf.',
  'straf.veld': 'Mijn straf',
  'straf.voorbeeld': 'Ik trakteer de groep op een etentje',
  'straf.welke_groep': 'Welke groep profiteert?',
  'straf.verder': 'Verder',
  'straf.jouw_groep': 'je groep',

  // ---------------------------------------------------------------------------
  // Afronden, archiveren en herplannen — QS8-83, QS8-32 en QS8-96
  // ---------------------------------------------------------------------------
  'afronden.afgerond': 'Afgerond',
  'afronden.afgerond_uitleg':
    'Je hebt dit doel afgerond. Je groepen hebben het gezien en je beloning is vrijgekomen.',
  'afronden.kop': 'Afronden',
  // ⚠️ Twee sleutels en geen ternair in de zin. Zie de meervoudsafspraak boven in
  //    dit bestand: een taal met drie meervoudsvormen kan met een ternair niets.
  'afronden.een_open':
    'Er staat nog één mijlpaal open. Vink hem af, of laat hem vallen als hij niet meer nodig ' +
    'is — dan kun je dit doel afronden.',
  'afronden.meer_open':
    'Er staan nog {aantal} mijlpalen open. Vink ze af, of laat vallen wat niet meer nodig ' +
    'is — dan kun je dit doel afronden.',
  'afronden.alles_af':
    'Alle mijlpalen staan af. Rond je doel af, dan weet je groep het en komt je beloning vrij.',
  'afronden.knop_label': 'Doel {titel} afronden',
  'afronden.knop': 'Dit doel is af',

  'archief.terughalen_kop': 'Uit het archief halen',
  'archief.kop': 'Archiveren',
  'archief.terughalen_uitleg': 'Het doel komt weer op je dashboard en in je groepsoverzicht.',
  'archief.uitleg':
    'Het doel verdwijnt van je dashboard en uit groepsoverzichten. Je geschiedenis blijft ' +
    'volledig staan: voltooiingen, goedkeuringen en punten. Je kunt dit altijd terugdraaien.',
  'archief.terughalen': 'Terughalen',
  'archief.archiveren': 'Archiveren',

  // ⚠️ **Toon: nuchter en behulpzaam, geen verwijt** — acceptatiecriterium 6 van
  //    QS8-96. Er staat nergens dat je iets fout hebt gedaan. Een deadline die
  //    niet meer klopt is informatie en geen oordeel; dit is het blok dat mensen
  //    de app laat houden in plaats van weggooien. Vertaal het niet strenger.
  'herplannen.kop': 'Deze datum gaat niet meer lukken',
  'herplannen.stand_1_1': 'Er staat nog één mijlpaal open en er is nog één week. ',
  'herplannen.stand_1_n': 'Er staat nog één mijlpaal open en er zijn nog {weken} weken. ',
  'herplannen.stand_n_1': 'Er staan nog {open} mijlpalen open en er is nog één week. ',
  'herplannen.stand_n_n': 'Er staan nog {open} mijlpalen open en er zijn nog {weken} weken. ',
  'herplannen.geen_ramp':
    'Dat is geen ramp en het zegt niets over jou — het zegt dat het plan niet meer klopt. ' +
    'Een doel bijstellen werkt beter dan het stilletjes laten doodbloeden.',
  'herplannen.drie_dingen': 'Drie dingen die je kunt doen:',
  'herplannen.datum_kop': 'Verzet je streefdatum',
  'herplannen.datum_uitleg':
    'Hierboven bij “Deadline”. Deel je dit doel met een groep, dan vraag je er akkoord ' +
    'voor — dat kost je geen punten.',
  'herplannen.mijlpalen_kop': 'Laat mijlpalen vallen',
  'herplannen.mijlpalen_uitleg':
    'Bij “Mijlpalen”. Wat je laat vallen telt niet meer mee, en je geschiedenis blijft staan.',
  'herplannen.kleiner_kop': 'Maak het doel kleiner',
  'herplannen.kleiner_uitleg':
    'Pas de mijlpalen aan naar wat er wél in past. Liever een doel dat je haalt dan een plan ' +
    'dat klopte in maart.',
  // ⚠️ Acceptatiecriterium 5 van QS8-96, en het hangt aan domeinregel 11: een
  //    straf treedt in werking bij een verstreken deadline, dus de datum verzetten
  //    is precies de handeling die dat moment verschuift. Dat mag geen verrassing
  //    zijn.
  'herplannen.let_op_straf':
    'Let op: je hebt een straf ingesteld op dit doel. Die treedt in werking als je ' +
    'streefdatum verstrijkt zonder dat het doel af is. Verzet je de datum, dan verschuift ' +
    'dat moment mee.',
  'herplannen.reeks_blijft': 'Je reeks en je geschiedenis blijven bij alle drie gewoon staan.',

  // ---------------------------------------------------------------------------
  // De hulpvraag en de Risico-radar op het doelscherm — QS8-94 en QS8-95
  // ---------------------------------------------------------------------------
  // ⚠️ Dit is een van de drie routes waarlangs tegenslag de groep bereikt, en
  //    hij loopt via de gebruiker zelf (domeinregel 7). De teksten zeggen daarom
  //    op elke stap wat er gebeurt en wanneer: "je ziet precies wat je verstuurt
  //    voordat het weggaat". Verwater dat niet — zonder die zin is het een knop
  //    die iets over je naar de groep stuurt.
  'hulpvraag.verstuurd_kop': 'Je vraag staat in de groep',
  'hulpvraag.verstuurd_uitleg':
    'Je buddy’s kunnen erop reageren in de groepschat. Dat is precies waar ze voor zijn.',
  'hulpvraag.kop': 'Vastgelopen? Vraag je groep',
  'hulpvraag.uitleg':
    'Je loopt achter op dit doel. Daar is je groep voor — twee zinnen en iemand denkt met je ' +
    'mee. Je ziet precies wat je verstuurt voordat het weggaat.',
  'hulpvraag.vraag_knop': 'Vraag om hulp',
  'hulpvraag.niet_nu': 'Nu even niet',
  'hulpvraag.wat_vragen': 'Wat wil je vragen?',
  'hulpvraag.bericht': 'Je bericht',
  'hulpvraag.bericht_hint': 'Pas het gerust aan. Dit gaat als jouw bericht naar de groepschat.',
  'hulpvraag.welke_groep': 'Naar welke groep?',
  'hulpvraag.versturen': 'Versturen',
  'hulpvraag.annuleren': 'Annuleren',

  'radar.kop': 'Haalbaarheid',
  'radar.verbergen': 'Verbergen',
  'radar.waarom': 'Waarom?',
  // ⚠️ Deze zin staat er omdat de gebruiker anders moet raden hoeveel hij deelt.
  //    Een risicostand is een afgeleide van gemiste weken — precies waar
  //    domeinregel 7 over gaat, en de reden dat migratie 0050 `goal_risk`
  //    eigenaar-only maakte. De belofte moet in élke taal even hard staan.
  'radar.alleen_jij': 'Alleen jij ziet dit. Je groep krijgt je haalbaarheid nooit te zien.',

  // ---------------------------------------------------------------------------
  // Het mijlpalenblok op het doelscherm — QS8-39
  // ---------------------------------------------------------------------------
  'mijlpalenblok.kop': 'Mijlpalen',
  'mijlpalenblok.leeg':
    'Nog geen mijlpalen. Knip je doel op in tussenresultaten die je kunt aanwijzen — dan weet ' +
    'je elke week waar je aan werkt.',
  'mijlpalenblok.coach': 'Laat de Doelcoach ze voorstellen',
  'mijlpalenblok.gehaald': 'Gehaald',
  'mijlpalenblok.stap': 'Stap {nummer} van {totaal}',
  'mijlpalenblok.streefdatum': ' · streefdatum {datum}',
  // ⚠️ "Toch niet gehaald" en niet "ongedaan maken": op gehaald zetten plaatst een
  //    systeembericht in elke gekoppelde groep, en een chatbericht is een
  //    onveranderlijke kopie. Terugzetten haalt dat bericht niet weg. De knop zegt
  //    wat de handeling is, niet dat hij de vorige uitwist.
  'mijlpalenblok.toch_niet': 'Toch niet gehaald',
  'mijlpalenblok.zet_gehaald': 'Gehaald',
  'mijlpalenblok.weekstappen': 'Weekstappen',
  'mijlpalenblok.weekstappen_label': 'Laat de coach weekstappen bedenken voor {titel}',
  'mijlpalenblok.omhoog': 'Omhoog',
  'mijlpalenblok.omlaag': 'Omlaag',
  'mijlpalenblok.verwijderen': 'Verwijderen',
  'mijlpalenblok.omhoog_label': '{titel} omhoog',
  'mijlpalenblok.omlaag_label': '{titel} omlaag',
  'mijlpalenblok.verwijderen_label': '{titel} verwijderen',
  'mijlpalenblok.nieuwe': 'Nieuwe mijlpaal',
  'mijlpalenblok.nieuwe_hint':
    'Een tussenresultaat dat je kunt aanwijzen. Bijvoorbeeld: eerste tienduizend woorden.',
  'mijlpalenblok.nieuwe_voorbeeld': 'Eerste tienduizend woorden',
  'mijlpalenblok.toevoegen': 'Toevoegen',
  'mijlpalenblok.annuleren': 'Annuleren',
  'mijlpalenblok.toevoegen_knop': 'Mijlpaal toevoegen',

  // ---------------------------------------------------------------------------
  // Weekdoel toevoegen, adempauze en weggooien — QS8-43, QS8-82 en QS8-105
  // ---------------------------------------------------------------------------
  'weekcoach.titel': 'Weekstappen',
  'weekcoach.eyebrow': 'DE DOELCOACH',
  'weekcoach.uitleg':
    'De coach kent je doel "{doel}" en deze mijlpaal, en stelt weekstappen voor die er samen naartoe leiden. Elke stap komt met een vloer en een plafond.',
  'weekcoach.zelfde_tien':
    'Dit telt mee in dezelfde tien AI-aanvragen per dag als het opsplitsen van een doel.',
  'weekcoach.terug': 'Terug naar het doel',
  'weekcoach.leeg_titel': 'Geen mijlpaal gekozen',
  'weekcoach.leeg_tekst':
    'Open dit scherm vanaf een mijlpaal op je doel, dan weet de coach waar hij stappen voor moet bedenken.',
  'weekcoach.wat_gebeurt_er':
    'De coach kijkt naar deze mijlpaal, naar hoeveel weken je nog hebt en naar wat je bij het interview hebt ingevuld.',
  'weekcoach.genereer': 'Genereer weekstappen',
  'weekcoach.denkt_na': 'De coach denkt na',
  'weekcoach.duurt_even': 'Dit duurt ongeveer twintig seconden. Blijf even op dit scherm.',
  'weekcoach.lukte_niet': 'Dat lukte niet',
  'weekcoach.geen_weekdoelen':
    'De coach kwam niet met bruikbare stappen. Elke stap moet een vloer én een plafond hebben, en die waren er niet.',
  'weekcoach.vastgelopen': 'De coach liep vast. Probeer het zo nog eens.',
  'weekcoach.te_lang': 'Dit duurt langer dan verwacht. Probeer het zo nog eens.',
  'weekcoach.zelf_toevoegen': 'Zelf een weekdoel maken',
  'weekcoach.opnieuw': 'Opnieuw proberen',
  'weekcoach.klaar': 'Klaar',
  'weekcoach.voorstellen': '{aantal} weekstappen',
  'weekcoach.een_per_week':
    'Deze stappen zijn bedoeld voor opeenvolgende weken. Voeg nu de stap toe waar je deze week aan werkt; volgende week kom je terug voor de volgende.',
  'weekcoach.vloer': 'Vloer: {tekst}',
  'weekcoach.plafond': 'Plafond: {tekst}',
  'weekcoach.voeg_toe': 'Voeg toe als weekdoel',
  'weekcoach.toegevoegd': 'Toegevoegd aan deze week.',
  'weekdoelform.coach': 'Laat de coach weekstappen bedenken',
  'weekdoelform.knop': 'Weekdoel toevoegen',
  'weekdoelform.kop': 'Wat wil je deze week af hebben?',
  'weekdoelform.titel': 'Weekdoel',
  'weekdoelform.titel_hint': 'Eén ding, deze week. Bijvoorbeeld: drie klantgesprekken voeren.',
  'weekdoelform.titel_voorbeeld': '3 klantgesprekken voeren',
  // ⚠️ De vloer staat vóór het plafond en krijgt de uitleg — domeinregel 8. Hij is
  //    optioneel, dus moedigt de UI hem actief aan; doet ze dat niet, dan vult
  //    niemand hem in en is een slechte week weer een verloren week. Houd die
  //    aanmoediging in élke vertaling.
  'weekdoelform.vloer': 'De vloer (aanbevolen)',
  'weekdoelform.vloer_hint':
    'Wat haal je ook in een rotweek? Dit halen laat je reeks doorlopen — alleen de punten ' +
    'verschillen.',
  'weekdoelform.vloer_voorbeeld': '1 gesprek ingepland',
  'weekdoelform.plafond': 'Het plafond',
  'weekdoelform.plafond_hint': 'Waar ga je voor als de week meezit?',
  'weekdoelform.plafond_voorbeeld': '3 gesprekken gevoerd',
  'weekdoelform.mijlpaal': 'Hoort dit bij een mijlpaal?',
  'weekdoelform.mijlpaal_hint': 'Mag ook los onder je doel hangen.',
  'weekdoelform.los': 'Los onder dit doel',
  'weekdoelform.toevoegen': 'Toevoegen',
  'weekdoelform.annuleren': 'Annuleren',

  'adempauze.kop': 'Adempauze',
  'adempauze.uitleg':
    'Ga je op vakantie, ben je ziek, of is het gewoon een gekke maand? Zet dan een of twee ' +
    'weken stil. Die weken kosten je geen punt en je reeks blijft staan waar hij staat — hij ' +
    'groeit alleen niet mee.',
  // ⚠️ **Wat de groep ziet is de aankondiging, niet je weken.** Dit is domeinregel
  //    7's eigen uitzondering: de route loopt via jou, want je kondigt hem zelf
  //    aan. De statuskolom per week is sinds migratie 0047 dicht. Deze zin zegt
  //    precies waar die grens ligt; laat de tweede helft er nooit af.
  'adempauze.groep_ziet':
    'Je groep ziet dát je een adempauze hebt en van wanneer tot wanneer. Ze zien niet welke ' +
    'weekdoelen je wel of niet gehaald hebt.',
  'adempauze.week_van': 'Week van {datum}',
  'adempauze.tot_en_met': ' tot en met de week van {datum}',
  'adempauze.voorbij': 'Voorbij',
  'adempauze.loopt': 'Loopt nu',
  'adempauze.ingepland': 'Ingepland',
  'adempauze.annuleren': 'Annuleren',
  'adempauze.vanaf': 'Vanaf welke week?',
  'adempauze.vanaf_hint':
    'Een adempauze kondig je vooraf aan, dus de week die nu loopt kan niet meer.',
  'adempauze.hoe_lang': 'Hoe lang?',
  'adempauze.een_week': 'Eén week',
  'adempauze.twee_weken': 'Twee weken',
  'adempauze.inplannen': 'Inplannen',
  'adempauze.inplannen_knop': 'Adempauze inplannen',

  'weggooien.label': 'Doel {titel} weggooien',
  'weggooien.knop': 'Per ongeluk aangemaakt? Weggooien',

  // ---------------------------------------------------------------------------
  // Resten die de uitgebreide tekstcontrole vond — QS8-115
  // ---------------------------------------------------------------------------
  // ⚠️ Deze zeventien zinnen stonden in mappen die al "af" heetten. Ze zaten
  //    achter een openingstag op dezelfde regel, en die vorm zag de controle in
  //    zijn eerste drie versies niet. Ze staan hier bij elkaar omdat ze één ding
  //    gemeen hebben: ze zijn gevonden door de meter scherper te zetten nadat hij
  //    groen stond, niet door beter te kijken.
  'laden.kop_mislukt': 'Dat lukte niet',
  'ketting.kop': 'De Ketting',
  'lid.adempauze': 'Adempauze',
  'lid.afgerond': 'heeft deze periode afgerond',
  'vandaag.reeks_telt_weken': 'Je reeks telt weken, geen dagen.',
  'vandaag.meenemen_knop': 'Meenemen naar deze week',
  'vandaag.buddy_vraag': 'Je buddy heeft een vraag',
  'profiel.uitloggen_kop': 'Uitloggen',
  'profiel.uitloggen_uitleg': 'Je blijft lid van je groepen. Je doelen blijven staan.',
  'profiel.uitloggen_knop': 'Uitloggen',
  'beoordelen.verouderd': 'Er is intussen iets veranderd in de lijst.',
  'beoordelen.verversen': 'Lijst verversen',
  'beoordelen.vorige': 'Vorige',
  'beoordelen.meer_laden': 'Meer laden',
  'groepscherm.wie_meedoen': 'Wie er meedoen',
  'groepscherm.meer_tijd': 'Een buddy vraagt om meer tijd',
  'coach.poging_telt': 'Elke poging telt mee in je tien per dag.',
  'weekafsluiting.wat_gedeeld': 'Wat de groep deelde',

  // ---------------------------------------------------------------------------
  // De taalkeuze — QS8-115
  // ---------------------------------------------------------------------------
  'taal.label': 'Taal',
  'taal.hint': 'De app én je meldingen. Je kunt dit altijd omzetten.',
  // ⚠️ Deze zin is er omdat de meldingen server-side worden opgesteld, in een
  //    Edge Function zonder apparaat in de buurt (migratie 0061). Zonder de
  //    keuze hier is iemand Engels in de app en Nederlands in elke nudge.
  'taal.uitleg':
    'Je keuze geldt ook voor de meldingen die je krijgt, want die worden op de ' +
    'server opgesteld en niet op je telefoon.',
  'validatie.taal': 'Kies een taal uit de lijst.',

  // ---------------------------------------------------------------------------
  // Wat de controle miste — QS8-115, ronde 24-08-2026
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Deze sleutels komen niet uit een nieuwe feature maar uit een blinde vlek
  //    in `npm run tekst:controle`. Vijf vormen kwamen er niet doorheen: een prop
  //    met één woord, een prop die over meerdere regels loopt, een tekstsleutel
  //    in een objectliteraal, JSX-tekst met een accolade erin, en een kale zin in
  //    `setMelding(...)`. Zie de kop van dat script.
  'algemeen.laden': 'Laden',
  'algemeen.streefdatum': 'Streefdatum {datum}',
  // ⚠️ Mét eenheid. Naast "3 weken op rij" van de reeksteller las "Beste
  //    reeks: 7" als zeven wat — critical-user-ronde 24-08.
  'reeks.beste_een': 'Beste tot nu toe: 1 week',
  'reeks.beste_meer': 'Beste tot nu toe: {aantal} weken',
  'weekdoel.vloer_regel': 'Vloer · {tekst}',
  'weekdoel.plafond_regel': 'Plafond · {tekst}',
  'ketting.a11y': 'De Ketting: {stand}',
  'risico.a11y': 'Status: {label}',
  'coach.leeg_titel': 'Dit doel bestaat niet',
  'coach.leeg_tekst': 'Of het is verwijderd, of het is niet van jou.',
  'coach.geen_mijlpalen': 'De Doelcoach gaf geen bruikbare mijlpalen terug.',
  'coach.te_lang':
    'Het duurde te lang. Probeer het zo nog eens, of voeg je mijlpalen zelf toe.',
  'coach.n_voorgesteld': '{aantal} mijlpalen voorgesteld',
  'beheer.melding_opgeslagen': 'Opgeslagen. Lopende kettingschakels blijven staan waar ze staan.',
  'beheer.melding_nieuwe_link': 'Nieuwe link. De oude werkt vanaf nu niet meer.',
  'beheer.leeg_titel': 'Deze groep is er niet, of niet voor jou',
  'beheer.leeg_tekst': 'Je bent geen lid van deze groep, of hij bestaat niet meer.',
  'beheer.huddledag_label': 'Huddledag',
  'beheer.huddledag_hint':
    'De gedeelde dag van de groep. Verandert niets aan wanneer jouw eigen weekdoelen resetten — dat blijft je persoonlijke week-startdag.',
  'beheer.voorlezen': 'Voorlezen kan ook: {code}',
  'beoordelen.bevestigd': 'Je hebt de week van {naam} bevestigd.',
  'beoordelen.sessie_laadt': 'Je sessie is nog aan het laden. Probeer het over een tel opnieuw.',
  'dashboard.week_van': 'Week van {datum}',


  // ---------------------------------------------------------------------------
  // De tijdzone met de hand zetten — QS8-27, criterium 1
  // ---------------------------------------------------------------------------
  'tijdzone.label': 'Tijdzone',
  'tijdzone.hint':
    'Hierin worden "vandaag" en "deze week" berekend. Standaard die van je telefoon; zoek op een plaatsnaam om hem te wijzigen.',
  'tijdzone.zoek_voorbeeld': 'Amsterdam',
  'tijdzone.nu': 'Nu ingesteld: {zone}',
  'tijdzone.gebruik_getypt': 'Gebruik {zone}',
  'tijdzone.van_apparaat': 'De tijdzone van dit apparaat ({zone})',
  'tijdzone.niets_gevonden': 'Geen tijdzone gevonden. Zoek op een grote stad in de buurt.',
  'tijdzone.uitleg':
    'Wijzigen laat je punten en je reeks met rust: die staan vast op de weken die er al zijn. Wat verandert is wanneer de volgende week omslaat.',
  'tijdzone.opgeslagen': 'Tijdzone opgeslagen.',


  // ---------------------------------------------------------------------------
  // De weektip — besluit A48, variant 3 (QS8-110)
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Vijf per categorie. Ze gaan over de wéék die je net gehaald hebt, niet over
  //    het leven in het algemeen — dat was het bezwaar tegen de wijze quotes. En
  //    geen enkele noemt een tegenvaller; er staat een test op.
  'weektip.lichaam.1': 'Je lichaam onthoudt de weken die je wél kwam opdagen. Deze was er een.',
  'weektip.lichaam.2': 'Wat deze week goed voelde, is de versie die je volhoudt. Onthoud die.',
  'weektip.lichaam.3': 'Rust hoort erbij en telt mee. Plan hem net zo bewust als de rest.',
  'weektip.lichaam.4': 'Deze week hoefde niet zwaar te zijn om te tellen. Hij telde.',
  'weektip.lichaam.5': 'Leg alvast klaar wat je volgende week nodig hebt. Dat scheelt de helft van het besluit.',
  'weektip.mensen.1': 'Wat je deze week voor iemand deed, blijft langer hangen dan je denkt.',
  'weektip.mensen.2': 'Een week waarin je contact zocht, is een week die iemand anders ook merkte.',
  'weektip.mensen.3': 'Maken en delen kost dezelfde week. Deze week deed je het allebei.',
  'weektip.mensen.4': 'Vertel iemand wat je deze week gemaakt of gedaan hebt. Het maakt het echt.',
  'weektip.mensen.5': 'Zet nu vast wie je volgende week spreekt. Dan hoeft dat besluit er niet meer bij.',
  'weektip.werk.1': 'Wat je deze week op orde bracht, hoeft volgende week niet opnieuw.',
  'weektip.werk.2': 'Deze week gedaan krijgen is iets anders dan deze week druk zijn. Dit was het eerste.',
  'weektip.werk.3': 'Schrijf op welke aanpak deze week wérkte. Dat is je handleiding voor de drukke weken.',
  'weektip.werk.4': 'Een week volhouden is de vaardigheid; de rest is uitvoering. Deze week ging het.',
  'weektip.werk.5': 'Kies nu je eerste stap voor volgende week, nu je nog weet waar je gebleven was.',
  'weektip.business.1': 'Eén afgeronde week is een week waarin iemand anders nog aan het plannen was.',
  'weektip.business.2': 'Wat je deze week af kreeg, hoeft volgende week niet meer bedacht te worden.',
  'weektip.business.3': 'Schrijf op wat deze week wérkte. Dat is je eigen handleiding voor de drukke weken.',
  'weektip.business.4': 'Klein en af verslaat groot en half. Dat is deze week bewezen.',
  'weektip.business.5': 'De volgende stap is meestal kleiner dan hij eruitziet. Kies hem nu je op dreef bent.',
  'weektip.study.1': 'Een week doorgezet telt zwaarder dan een dag hard werken. Dit was de week.',
  'weektip.study.2': 'Wat je deze week begreep, hoef je nooit meer voor het eerst te leren.',
  'weektip.study.3': 'Herhaal morgen kort wat je deze week deed. Twintig minuten scheelt straks een avond.',
  'weektip.study.4': 'Vaste tijden verslaan lange sessies. Deze week is daar het bewijs van.',
  'weektip.study.5': 'Zet nu vast wanneer je volgende week begint. Dan hoef je het niet meer te besluiten.',
  'weektip.other.1': 'Opdagen is het hele kunstje. Deze week is dat gelukt.',
  'weektip.other.2': 'Wat je deze week deed, telt ook als niemand het gezien heeft.',
  'weektip.other.3': 'Eén week is geen toeval meer. Twee is een gewoonte die begint.',
  'weektip.other.4': 'Maak volgende week net zo makkelijk als deze: leg klaar wat je nodig hebt.',
  'weektip.other.5': 'De weken die tellen zien er zelden bijzonder uit. Deze telde.',

  // ---------------------------------------------------------------------------
  // Wat de controle miste — QS8-115, ronde 28-08-2026
  // ---------------------------------------------------------------------------
  //
  // ⚠️ Vier plekken, en alle vier dezelfde vorm: kale tekst tussen de kinderen
  //    van een tag. Twee ervan liepen over twee regels, en dan brak de
  //    heuristiek op allebei zijn eisen tegelijk — de eerste helft eindigt op
  //    een komma, de tweede begint klein. Zie `binnenJsxTekst()` in
  //    `scripts/tekst-controle.mjs`.
  'ketting.opdagen_uitleg':
    'Eén schakel per lid dat deze week zijn cyclus afsloot. Het gaat om opdagen, ' +
    'niet om hoeveel je haalde.',
  'chat.uit_cache':
    'Je leest de bewaarde berichten van deze week. Zodra er weer verbinding is, ' +
    'vult de rest zich aan.',
  // ⚠️ Twee sleutels en geen samenstelling met een streepje in de code. Het
  //    scheidingsteken is leesteken en dus taal: een vertaler die er een
  //    dubbele punt van wil maken, moet dat kunnen.
  'beoordelen.week_afgerond': 'Week afgerond',
  'beoordelen.week_afgerond_met': 'Week afgerond — {gehaald}',
  'groepscherm.leden_van_totaal': '{getoond} van {totaal} leden.',


  // ---------------------------------------------------------------------------
  // Het weekplan — QS8-203, migratie 0138
  // ---------------------------------------------------------------------------
  //
  // ⚠️ De copy moet op twee plekken zeggen dat een geplande stap niets kost.
  //    Wie zes stappen ziet en denkt dat het zes weekdoelen zijn, denkt ook dat
  //    hij er vijf gaat missen — en dat is precies de verwarring die dit hele
  //    ontwerp voorkomt.
  'weekplan.kop': 'Je weekplan',
  'weekplan.uitleg':
    'Deze stappen staan klaar voor de weken hierna. Elke week schuift de bovenste er vanzelf in als weekdoel.',
  'weekplan.kost_niets':
    'Een geplande stap telt nog niet mee: hij levert geen punten op en kan geen minpunt kosten. Dat begint pas als hij je weekdoel wordt.',
  'weekplan.leeg':
    'Er staat nog geen plan klaar. Laat de coach weekstappen bedenken onder een mijlpaal, dan komt de rest hier te staan.',
  'weekplan.eerstvolgende': 'Schuift als eerste in',
  'weekplan.over_weken': 'Over {weken} weken',
  'weekplan.start_nu': 'Start deze nu',
  'weekplan.start_nu_label': 'Start "{titel}" deze week',
  'weekplan.verwijder': 'Weg uit het plan',
  'weekplan.verwijder_label': 'Haal "{titel}" uit het plan',
  'weekplan.omhoog': 'Eerder',
  'weekplan.omhoog_label': 'Zet "{titel}" eerder in het plan',
  'weekplan.omlaag': 'Later',
  'weekplan.omlaag_label': 'Zet "{titel}" later in het plan',
  'weekplan.laden_mislukt': 'Het plan kon niet geladen worden.',
  'weekplan.opslaan_mislukt': 'Het plan kon niet opgeslagen worden.',
  'weekplan.verwijderen_mislukt': 'Die stap kon niet weggehaald worden.',
  'weekplan.starten_mislukt': 'Die stap kon niet gestart worden.',
  'weekplan.al_ingeschoven': 'Die stap is al een weekdoel geworden.',
  'weekplan.deze_week_al': 'Voor dit doel is deze week al een stap ingeschoven.',
  'weekplan.doel_niet_actief': 'Dit doel loopt niet meer, dus er schuift niets meer in.',
  'weekplan.geen_stap': 'Er staat geen stap meer klaar.',
  'weekplan.te_veel_deze_dag': 'Je hebt vandaag te veel weekdoelen gemaakt. Probeer het morgen weer.',
  'weekplan.niet_ingelogd': 'Log opnieuw in en probeer het nog eens.',
  'weekplan.niet_van_jou': 'Deze stap is niet van jou.',
  'weekplan.lijst_veranderd': 'Het plan is intussen veranderd. Laad het opnieuw.',
  'weekplan.ingeschoven_kop': 'Er staat een nieuw weekdoel klaar',
  'weekplan.ingeschoven_tekst':
    'De volgende stap uit je plan is deze week je weekdoel geworden. Dat verhoogt je puntenplafond met deze week.',
  'weekplan.neem_over': 'Zet het hele plan klaar',
  'weekplan.neem_over_uitleg':
    'De eerste stap wordt je weekdoel voor deze week. De rest komt in je plan te staan en schuift er elke week vanzelf één in.',
  'weekplan.overgenomen': 'Het plan staat klaar. Stap 1 is je weekdoel voor deze week.',
  'validatie.weekplan_leeg': 'Een plan zonder stappen is geen plan.',
  'validatie.weekplan_lang': 'Een plan reikt hoogstens een jaar vooruit.',
  'coach.al_ingevuld': 'Dit had je al ingevuld bij je doel; je kunt het hier bijstellen.',

  // ---------------------------------------------------------------------------
  // Het ritme van een doel — besluit A53, migratie 0140
  // ---------------------------------------------------------------------------
  //
  // ⚠️ De uitleg zegt wat de keuze kóst en niet wat hij is. "Dagelijks" klinkt
  //    als de serieuze optie, en dan kiest iedereen hem — terwijl het de enige is
  //    die zeven momenten per week van je vraagt.
  'ritme.weekly': 'Ik kijk naar de week',
  'ritme.weekly_uitleg':
    'Aan het eind van de week rond je af. Hoe je er komt, is aan jou — er is niets af te vinken.',
  'ritme.times_per_week': 'Een paar keer per week',
  'ritme.times_per_week_uitleg':
    'Je vinkt de dagen af waarop je eraan gewerkt hebt. De week telt zodra je je vloer haalt.',
  'ritme.daily': 'Elke dag',
  'ritme.daily_uitleg':
    'Voor iets wat je dagelijks doet. Vraagt het meest van je, dus kies dit alleen als het echt elke dag is.',
  'ritme.kop': 'Hoe vaak werk je hieraan?',
  'ritme.dagen_gehaald': '{gehaald} van {plafond} dagen',
  'ritme.vloer_gehaald': 'Je vloer is gehaald. Deze week telt.',
  'ritme.vloer_nog_niet': 'Nog {aantal} dagen tot je vloer.',
  'ritme.plafond_gehaald': 'Plafond gehaald.',
  'ritme.vink_af': 'Vink vandaag af',
  'ritme.vink_af_label': 'Vink vandaag af voor "{titel}"',
  'ritme.maak_ongedaan': 'Toch niet',
  'ritme.maak_ongedaan_label': 'Maak de afvinking van vandaag ongedaan voor "{titel}"',
  'ritme.afvinken_mislukt': 'Dat afvinken lukte niet.',
  'ritme.buiten_de_week': 'Die dag hoort niet bij deze week.',
  'ritme.onder_de_vloer': 'Deze week haalt de vloer nog niet, dus er valt nog niets af te ronden.',
  'ritme.te_veel_deze_dag': 'Je hebt vandaag te veel afgevinkt. Probeer het morgen weer.',
  // ---------------------------------------------------------------------------
  // Het klassement en de teller — QS8-254, besluit A54
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Geen enkele zin hier noemt een minpunt, een gemiste week of een laatste
  //    plaats.** Dat is niet alleen toon: de RPC's uit 0141 hebben geen kolom
  //    voor een delta en geen kolom voor een datum, dus er valt hier ook niets
  //    over te zeggen. Als je merkt dat je zo'n zin nodig hebt, is er iets aan
  //    de database veranderd en niet aan de copy.
  //
  // ⚠️ **De teller zwijgt bij nul.** "Samen 0 weken afgerond" is een
  //    tegenslagbericht met een vrolijke kop erop — dezelfde afweging die de
  //    seizoensrecap in 0112 maakte, en om precies dezelfde reden.
  'klassement.kop': 'Het klassement',
  'klassement.uitleg':
    'Jullie hebben afgesproken open te zijn, dus staan de punten van deze groep hier bij elkaar.',
  'klassement.punten_een': '1 punt',
  'klassement.punten_meer': '{n} punten',
  'klassement.rij_label': 'Plek {positie}: {naam}, {punten}',
  'klassement.leeg': 'Er zijn hier nog geen punten verdiend. De eerste afgeronde week zet hem in gang.',
  'klassement.van_totaal': '{getoond} van {totaal} leden',
  'klassement.laden_mislukt': 'Het klassement kon niet geladen worden.',
  'klassement.teller_mislukt': 'De teller kon niet geladen worden.',
  'klassement.opnieuw': 'Opnieuw proberen',

  'teller.kop': 'Samen',
  'teller.weken_een': '1 week afgerond',
  'teller.weken_meer': '{n} weken afgerond',
  'teller.mijlpalen_een': '1 mijlpaal gehaald',
  'teller.mijlpalen_meer': '{n} mijlpalen gehaald',
  'teller.nog_niets': 'Jullie eerste afgeronde week komt hier te staan.',

  // ---------------------------------------------------------------------------
  // Het persoonlijke overzicht — QS8-256
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Geen enkele zin hier noemt een gemiste week als verwijt.** Dit scherm
  //    toont je eigen terugblik, en CLAUDE.md staat dat toe ("eigen tegenvallers
  //    zijn privé zichtbaar voor jezelf") — maar de toon van domeinregel 7 geldt
  //    ook voor tekst die alleen jij leest. "Niet afgerond" en niet "gemist".
  'overzicht.titel': 'Je overzicht',
  'overzicht.eyebrow': 'DE AFGELOPEN TWAALF WEKEN',
  'overzicht.open': 'Bekijk je overzicht',
  'overzicht.laden_mislukt': 'Je overzicht kon niet geladen worden.',
  'overzicht.opnieuw': 'Opnieuw proberen',

  'overzicht.weken_kop': 'Twaalf weken',
  'overzicht.weken_leeg': 'Zodra je je eerste week afrondt, komt hij hier te staan.',
  'overzicht.week_label': 'Week van {datum}: {stand}',
  'weekstand.plafond': 'plafond gehaald',
  'weekstand.vloer': 'vloer gehaald — deze week telt',
  'weekstand.ingediend': 'ingediend, wacht op je buddy',
  'weekstand.gemist': 'niet afgerond',
  'weekstand.leeg': 'geen weekdoel',

  'overzicht.kalender_kop': 'Je dagen',
  'overzicht.kalender_uitleg': 'Alleen de doelen waar je meerdere keren per week aan werkt.',
  'overzicht.kalender_leeg': 'Nog geen dagen afgevinkt.',
  'overzicht.dag_label': '{datum}: {aantal} afgevinkt',
  'overzicht.dag_leeg_label': '{datum}: niets afgevinkt',

  'overzicht.reeks_kop': 'Je langste reeks',
  'overzicht.reeks_weken': '{n} weken',
  'overzicht.reeks_week': '1 week',
  'overzicht.reeks_nu': 'Nu {n}',
  'overzicht.punten_kop': 'Je punten',
  'overzicht.punten_prive': 'Alleen jij ziet dit getal.',

  'overzicht.gebieden_kop': 'Waar je doelen over gaan',
  'overzicht.gebieden_leeg': 'Je hebt nog geen doelen.',
  'overzicht.gebied_label': '{gebied}: {aantal}',

  'overzicht.groep_kop': 'Je groepen',
  'overzicht.groep_uitleg': 'De stand van een groep staat op het groepsscherm zelf — daar weet de app om welke groep het gaat.',
  'overzicht.groep_open': 'Naar je groepen',

  // ---------------------------------------------------------------------------
  // De korte vragenlijst — QS8-257, besluit A56
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **Vraag 4 gaat over eerdere mislukking en de toon moet dat dragen.** Niet
  //    "wat doe jij fout" maar "wat laat gewoontes normaal gesproken stuklopen" —
  //    het onderwerp is de gewoonte en niet de persoon. Domeinregel 7 gaat over
  //    wat de groep ziet; deze zin ziet alleen de gebruiker zelf, en juist daar
  //    telt de toon.
  'vragenlijst.titel': 'Vier korte vragen',
  'vragenlijst.eyebrow': 'ZODAT DE APP JE KENT',
  'vragenlijst.overslaan': 'Sla over',
  'vragenlijst.volgende': 'Volgende',
  'vragenlijst.vorige': 'Terug',
  'vragenlijst.klaar': 'Klaar',
  'vragenlijst.opslaan_mislukt': 'Je antwoorden konden niet opgeslagen worden.',
  'vragenlijst.alles_overslaan': 'Alles overslaan kan ook. Je verliest er niets mee en je kunt het later invullen.',

  'vragenlijst.focus.vraag': 'Waar wil je je op richten?',
  'vragenlijst.focus.toelichting': 'Kies er hoogstens drie. Ze sturen wat de app je voorstelt en waar je groepen vindt.',
  'vragenlijst.focus.vol': 'Je hebt er drie. Tik er een uit om te wisselen.',

  'vragenlijst.tijd.vraag': 'Hoeveel tijd kun je eerlijk geven?',
  'vragenlijst.tijd.toelichting': 'Op een gewone dag, niet je beste dag.',
  'vragenlijst.minuten.5': '5 minuten',
  'vragenlijst.minuten.15': '15 minuten',
  'vragenlijst.minuten.30': '30 minuten',
  'vragenlijst.minuten.60': 'Een uur of meer',
  'vragenlijst.uren_per_week': 'Dat is ongeveer {uren} uur per week. Dat vullen we straks voor je in, en je kunt het wijzigen.',

  'vragenlijst.moment.vraag': 'Wanneer ga je het echt doen?',
  'vragenlijst.moment.toelichting': 'Een vast moment houdt het vol; een vage bedoeling niet.',
  'vragenlijst.moment.morning': "'s Ochtends",
  'vragenlijst.moment.workday': 'Ergens op de werkdag',
  'vragenlijst.moment.evening': "'s Avonds",
  'vragenlijst.moment.varies': 'Dat wisselt sterk',

  'vragenlijst.valkuil.vraag': 'Wat laat jouw gewoontes normaal gesproken stuklopen?',
  'vragenlijst.valkuil.toelichting': 'Vink er zoveel aan als kloppen. Hier is de app voor gebouwd.',
  'valkuil.forget': 'Ik vergeet het gewoon',
  'valkuil.forget.antwoord': 'Straks krijg je een herinnering op de dag van je groep. Die is er nog niet, en dan zeggen we ook niet dat hij er is.',
  'valkuil.motivation_drops': 'Motivatie zakt na week één',
  'valkuil.motivation_drops.antwoord': 'Daar is de weekpas voor: een gemiste week kost je je reeks niet. En je vloer zorgt dat een matige week nog steeds telt.',
  'valkuil.all_or_nothing': 'Alles of niets: één dag mis en ik stop',
  'valkuil.all_or_nothing.antwoord': 'Daarom heeft elk weekdoel een vloer naast zijn plafond. Vloer gehaald betekent dat de week telt — dezelfde reeks, dezelfde goedkeuring.',
  'valkuil.nobody_notices': 'Niemand merkt het als ik stop',
  'valkuil.nobody_notices.antwoord': 'Je week wordt door een buddy bevestigd, niet door jezelf. Dat is waar deze app om draait.',
  'valkuil.life_chaotic': 'Mijn leven wordt soms chaotisch',
  'valkuil.life_chaotic.antwoord': 'Dan kondig je vooraf een adempauze aan. Je groep ziet dat je even pauzeert, en je reeks blijft staan.',
  'valkuil.bekijk': 'Laat zien',

  'vragenlijst.samenvatting.kop': 'Dit heb je me verteld',
  'vragenlijst.samenvatting.uitleg': 'Tik een antwoord aan om het te wijzigen.',
  'vragenlijst.samenvatting.leeg': 'Je hebt alles overgeslagen. Dat mag, en je kunt het later alsnog invullen.',
  'vragenlijst.samenvatting.niets': 'Overgeslagen',
  'vragenlijst.samenvatting.bewaren': 'Bewaren en verder',
  'vragenlijst.samenvatting.dit_helpt': 'Wat de app hiermee doet',

  'validatie.focus_te_veel': 'Kies er hoogstens drie.',


  // ---------------------------------------------------------------------------
  // Groepen ontdekken — QS8-231, migratie 0144
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **De toon van dit scherm is de helft van het issue.** Wie hier komt, kent
  //    niemand. Elke zin die belooft dat het wel goed komt, is een zin die
  //    teleurstelt als een beheerder niet reageert — en een aanvraag die
  //    nergens op antwoord krijgt is de eerste ervaring van een nieuwe
  //    gebruiker. De teksten zeggen daarom wat er gebeurt en niet wat er hoort
  //    te gebeuren.
  //
  // ⚠️ **En geen enkele zin hier zegt iets over een persoon.** Wat een
  //    buitenstaander te zien krijgt, staat in de kolomlijst van
  //    `ontdek_groepen()` — niet in dit bestand. Deze teksten mogen die grens
  //    beschrijven maar nooit verruimen.

  'ontdek.titel': 'Een groep vinden',
  'ontdek.eyebrow': 'Zoeken',
  'ontdek.uitleg':
    'Dit zijn groepen die zich hebben laten vinden. Je ziet waar ze het over hebben en hoeveel mensen erin zitten — meer laat een groep aan iemand van buiten niet zien.',
  'ontdek.filter_categorie': 'Waar gaat het over',
  'ontdek.filter_taal': 'Taal',
  'ontdek.alles': 'Alles',
  'ontdek.laden_mislukt': 'De groepen konden niet geladen worden.',
  'ontdek.leeg_titel': 'Nog geen groep gevonden',
  'ontdek.leeg_tekst':
    'Er is nog geen vindbare groep in deze combinatie. Probeer een ander onderwerp of een andere taal — of begin er zelf een en zet hem open.',
  'ontdek.leden': '{aantal} leden',
  'ontdek.leden_een': '1 lid',
  'ontdek.huddledag': 'Huddle op {dag}',
  'ontdek.meer': 'Meer groepen',
  'ontdek.zelf_beginnen': 'Zelf een groep beginnen',

  'ontdek.aanvragen': 'Vraag lidmaatschap aan',
  'ontdek.bericht_label': 'Stel jezelf voor',
  'ontdek.bericht_hint':
    'Optioneel. Eén of twee zinnen over waar je aan werkt. De beheerder van deze groep leest dit.',
  'ontdek.versturen': 'Versturen',
  'ontdek.annuleren': 'Laat maar',
  /**
   * ⚠️ **"Verstuurd" en niet "je hoort snel iets".** Er is geen enkele garantie
   *    dat een beheerder antwoordt, en een belofte die de app niet kan nakomen
   *    is erger dan geen belofte. De zin zegt precies wat er gebeurd is.
   */
  'ontdek.verzonden': 'Je aanvraag staat bij de beheerder van deze groep. Of en wanneer die reageert, bepaalt die zelf.',
  'ontdek.al_aangevraagd': 'Aangevraagd',
  'ontdek.over_nog': 'Je kunt vandaag nog {aantal} groepen aanschrijven.',
  'ontdek.over_op': 'Je hebt vandaag tien groepen aangeschreven. Morgen kan het weer.',

  'ontdek.te_veel_aanvragen': 'Je hebt vandaag tien groepen aangeschreven. Morgen kan het weer.',
  'ontdek.al_lid': 'Je zit al in deze groep.',
  'ontdek.niet_open': 'Deze groep is niet meer te vinden. Misschien heeft de beheerder hem net verborgen.',
  'ontdek.geen_beheerder': 'Alleen een beheerder van deze groep kan dit doen.',
  'ontdek.niet_bevestigd': 'Deze wijziging is niet bevestigd.',
  'ontdek.niet_beschermd':
    'Een open groep kan niet vindbaar zijn: dan zouden onbekenden elkaars tegenslag zien. Bescherm de groep eerst.',
  'ontdek.geen_categorie': 'Kies eerst waar deze groep over gaat. Zonder onderwerp is hij niet te vinden.',
  'ontdek.al_beslist': 'Over deze aanvraag is al beslist.',
  'ontdek.ongewijzigd': 'Dat stond al zo.',
  'ontdek.mislukt': 'Dat lukte niet. Probeer het opnieuw.',
  'ontdek.verzoeken_mislukt': 'De aanvragen konden niet geladen worden.',
  'ontdek.onbekend_lid': 'Iemand',

  // De kant van de beheerder
  'ontdek.beheer_titel': 'Gevonden worden',
  'ontdek.beheer_aan': 'Deze groep is te vinden voor mensen die je nog niet kent.',
  'ontdek.beheer_uit': 'Deze groep is alleen te bereiken met een uitnodigingslink.',
  'ontdek.beheer_uitleg':
    'Wie zoekt ziet de naam, het onderwerp, de omschrijving, de voertaal, de huddledag en het aantal leden. Niet wie erin zitten, niet de doelen, niet de chat, niet De Ketting en niet iemands reeks.',
  'ontdek.beheer_moet_beschermd_zijn':
    'Alleen een beschermde groep kan vindbaar zijn. In een open groep zien leden elkaars tegenslag, en dat gaat een vreemde niet aan.',
  'ontdek.beheer_aanzetten': 'Maak deze groep vindbaar',
  'ontdek.beheer_uitzetten': 'Haal hem uit de zoeklijst',
  'ontdek.melding_ontdekbaar': 'Deze groep is nu te vinden. Je groep heeft er een bericht van gekregen.',
  'ontdek.melding_verborgen': 'Deze groep staat niet meer in de zoeklijst.',

  'ontdek.categorie_label': 'Waar gaat deze groep over',
  'ontdek.categorie_hint': 'Dit is waarop mensen je groep kunnen vinden.',
  'ontdek.omschrijving_label': 'Omschrijving',
  'ontdek.omschrijving_hint': 'Eén of twee zinnen. Dit is het enige wat een vreemde over jullie leest.',
  'ontdek.voertaal_label': 'Voertaal',
  'ontdek.voertaal_hint': 'Waarin praten jullie met elkaar? Dit verandert niets aan de taal van de app.',
  'ontdek.geen_keuze': 'Niet gekozen',

  'ontdek.verzoeken_titel': 'Aanvragen',
  'ontdek.verzoeken_leeg': 'Er staan nu geen aanvragen open.',
  'ontdek.verzoeken_uitleg':
    'Wie je aanneemt komt in de groep en ziet vanaf dat moment alles wat een lid ziet. Wie je afwijst krijgt daar geen bericht van, en de groep ook niet.',
  'ontdek.aannemen': 'Aannemen',
  'ontdek.afwijzen': 'Afwijzen',
  'ontdek.aangenomen': 'Aangenomen.',
  'ontdek.afgewezen': 'Afgewezen.',
  'ontdek.zonder_bericht': 'Zonder bericht',

  'voertaal.nl': 'Nederlands',
  'voertaal.en': 'Engels',

  'validatie.groepsomschrijving_lang': 'Hou het bij 280 tekens.',


  // ---------------------------------------------------------------------------
  // Melden en blokkeren — QS8-232, migratie 0145
  // ---------------------------------------------------------------------------
  //
  // ⚠️ **De copy belooft precies wat er gebeurt en geen woord meer.** Er is geen
  //    moderatieproces — dat staat als `phase:v3` op het bord — dus de eerlijke
  //    zin is: de beheerder van deze groep ziet het, en wij kunnen het uitlezen.
  //    "Wordt beoordeeld" terwijl er niemand kijkt, is erger dan geen meldknop:
  //    dan wacht iemand op een uitkomst die nooit komt en doet in de tussentijd
  //    niets anders om zichzelf te helpen.
  //
  // ⚠️ **Geen enkele zin hier bevestigt of ontkent dat iemand geblokkeerd is.**
  //    Er is geen scherm dat "je bent geblokkeerd" zegt, en er is er ook geen dat
  //    "deze persoon heeft jou geblokkeerd" zegt. Zou die zin bestaan, dan is
  //    blokkeren iets wat je je twee keer bedenkt.

  'leden.titel': 'Wie er meedoen',
  'leden.eyebrow': 'Groep',
  'leden.leeg_titel': 'Nog niemand',
  'leden.leeg_tekst': 'Zodra er iemand meedoet, staat hij hier.',
  'leden.beheerder': 'Beheerder',
  'leden.jijzelf': 'Dit ben jij.',
  'groepdetail.naar_leden': 'Wie er meedoen',

  'melden.titel': 'Melden',
  'melden.persoon_knop': 'Deze persoon melden',
  'melden.bericht_knop': 'Dit bericht melden',
  'melden.reden_label': 'Wat is er aan de hand?',
  'melden.toelichting_label': 'Toelichting',
  'melden.toelichting_hint': 'Optioneel. Wat je hier schrijft, leest de beheerder van deze groep.',
  'melden.versturen': 'Melding versturen',
  'melden.annuleren': 'Laat maar',

  /**
   * ⚠️ **De belangrijkste twee zinnen van dit issue.** Ze staan zowel vóór het
   *    versturen als erna, want dit is wat iemand moet weten om te beslissen of
   *    hij hier iets aan heeft. Alles wat hier bij zou komen — "we nemen het
   *    serieus", "je hoort van ons" — is een belofte die niemand nakomt.
   */
  'melden.wat_gebeurt_er':
    'Je melding gaat naar de beheerder van deze groep, en wij kunnen hem uitlezen. Er is nog geen team dat meldingen beoordeelt, dus we zeggen niet dat dat gebeurt. Zit je ergens mee waar je nu vanaf wilt, blokkeer die persoon dan ook.',
  'melden.verzonden':
    'Je melding staat er. De beheerder van deze groep kan hem zien; de gemelde persoon niet.',
  'melden.niet_zichtbaar': 'De persoon over wie je meldt, ziet nooit dat je dit gedaan hebt.',

  'melden.reden.harassment': 'Intimidatie of pesten',
  'melden.reden.spam': 'Spam of reclame',
  'melden.reden.inappropriate': 'Ongepaste inhoud',
  'melden.reden.impersonation': 'Doet zich voor als iemand anders',
  'melden.reden.other': 'Iets anders',

  'melden.te_veel': 'Je hebt vandaag twintig meldingen gedaan. Morgen kan het weer.',
  'melden.geen_lid': 'Je zit niet in deze groep.',
  'melden.bericht_weg': 'Dit bericht bestaat niet meer.',
  'melden.onbekend': 'Deze persoon zit niet in deze groep.',
  'melden.jezelf': 'Je kunt jezelf niet melden.',
  'melden.mislukt': 'Dat lukte niet. Probeer het opnieuw.',
  'melden.onbekend_lid': 'Iemand',

  // Blokkeren
  'melden.blokkeer_knop': 'Deze persoon blokkeren',
  'melden.deblokkeer_knop': 'Blokkade opheffen',
  'melden.geblokkeerd_titel': 'Geblokkeerd',
  'melden.geblokkeerd_leeg': 'Je hebt niemand geblokkeerd.',
  'melden.blokkades_mislukt': 'Je blokkades konden niet geladen worden.',
  /**
   * ⚠️ **Deze zin zegt met zoveel woorden wat blokkeren níét doet**, en dat is
   *    het belangrijkste eraan. Wie denkt dat de knop iemand uit zijn groep zet,
   *    drukt hem in en concludeert daarna dat de app stuk is.
   */
  'melden.blokkeer_uitleg':
    'Deze persoon komt hierna niet meer bij je in een groep terecht — niet via een uitnodiging, niet via zoeken. Zit hij nu al in een groep met jou, dan verandert daar niets: dat zou hem laten merken dat je hem geblokkeerd hebt. Wil je hem daar weg, verlaat dan die groep of vraag de beheerder.',
  'melden.blokkeer_stil': 'Hij krijgt hier geen bericht van en kan het nergens zien.',
  'melden.geblokkeerd_sinds': 'Geblokkeerd op {datum}',
  'melden.geblokkeerd': 'Dit kan niet.',

  // Een lid verwijderen
  'melden.verwijder_knop': 'Uit de groep zetten',
  'melden.geen_beheerder': 'Alleen een beheerder van deze groep kan dit doen.',
  'melden.niet_bevestigd': 'Deze handeling is niet bevestigd.',
  'melden.al_verwijderd': 'Deze persoon zit al niet meer in de groep.',
  'melden.laatste_beheerder':
    'Dit is de enige beheerder van deze groep. Maak eerst iemand anders beheerder.',
  'melden.verwijderd': 'Dit lid zit niet meer in de groep.',
  'melden.verwijderd_doelen': 'Dit lid zit niet meer in de groep. {aantal} doelen zijn ontkoppeld.',

  'bevestiging.lid_verwijderen.titel': 'Dit lid uit de groep zetten?',
  'bevestiging.lid_verwijderen.uitleg':
    'Deze persoon kan de groep niet meer openen: niet de chat, niet de weekafsluitingen, niet De Ketting. Zijn doelen gaan uit deze groep en een openstaand verzoek om een streefdatum te verschuiven vervalt. Wat hij heeft opgebouwd blijft van hem: zijn punten, zijn reeks en zijn voltooiingen. Hij kan niet terugkomen met de uitnodigingslink. De groep krijgt hier geen bericht van, maar het staat wel in de groepsgeschiedenis.',
  'bevestiging.lid_verwijderen.knop': 'Ja, zet dit lid eruit',

  'bevestiging.persoon_blokkeren.titel': 'Deze persoon blokkeren?',
  'bevestiging.persoon_blokkeren.uitleg':
    'Hij komt hierna niet meer bij je in een groep terecht — niet via een uitnodigingslink, niet via zoeken. Groepen waar jullie nu samen in zitten veranderen niet: dat zou hem laten merken dat je dit gedaan hebt. Hij krijgt geen bericht en kan het nergens zien. Je kunt de blokkade altijd opheffen.',
  'bevestiging.persoon_blokkeren.knop': 'Ja, blokkeer',

  'validatie.dagen_heel': 'Vul een heel aantal dagen in.',
  'validatie.dagen_bereik': 'Een week heeft zeven dagen.',
  'validatie.vloer_boven_plafond': 'Je vloer kan niet boven je plafond liggen.',
  'validatie.vloer_zonder_plafond': 'Een vloer in dagen vraagt ook een plafond.',
} as const;

export type Sleutel = keyof typeof nl;
