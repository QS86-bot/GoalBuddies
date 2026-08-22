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
} as const;

export type Sleutel = keyof typeof nl;
