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
} as const;

export type Sleutel = keyof typeof nl;
