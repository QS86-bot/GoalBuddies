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
  'auth.titel.inloggen': 'Welkom terug',
  'auth.titel.aanmelden': 'Maak een account',
  'auth.veld.email': 'E-mailadres',
  'auth.veld.wachtwoord': 'Wachtwoord',
  'auth.knop.inloggen': 'Inloggen',
  'auth.knop.aanmelden': 'Account maken',
  'auth.wissel.naar_aanmelden': 'Nog geen account? Maak er een.',
  'auth.wissel.naar_inloggen': 'Heb je al een account? Log in.',

  // ⚠️ De foutmeldingen zeggen nooit óf het e-mailadres bestaat. Dat is geen
  //    vaagheid maar bescherming: een inlogscherm dat "dit account bestaat niet"
  //    zegt, is een gratis manier om te controleren wie er lid is.
  'auth.fout.ongeldig': 'Dat e-mailadres en wachtwoord horen niet bij elkaar.',
  'auth.fout.algemeen': 'Inloggen lukte niet. Probeer het zo nog eens.',
  'auth.fout.bestaat_al': 'Er is al een account met dit e-mailadres.',

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
} as const;

export type Sleutel = keyof typeof nl;
