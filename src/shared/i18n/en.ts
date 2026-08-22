import type { Sleutel } from './nl';

/**
 * The English catalogue — QS8-113.
 *
 * ⚠️ Elke sleutel uit `nl.ts` moet hier staan; `catalogus.test.ts` wordt rood
 *    zodra er één ontbreekt of één te veel is. Vandaar het type: een ontbrekende
 *    sleutel is al een typefout, en de test vangt de omgekeerde kant (een sleutel
 *    die hier wél staat en in `nl.ts` niet meer).
 *
 * ⚠️ De teksten zijn vertaald, niet letterlijk overgezet. "De vloer halen telt
 *    volledig mee" is Nederlands voor een idee dat in het Engels anders loopt;
 *    waar dat speelt staat de bedoeling voorop en niet de woordvolgorde.
 */
export const en: Record<Sleutel, string> = {
  'systeembericht.member_joined': '{naam} joined.',
  'systeembericht.completion_pending': '{naam} finished a week and is waiting for confirmation.',
  'systeembericht.completion_approved': '{actor} confirmed {naam}’s week.',
  'systeembericht.milestone_done': '{naam} reached a milestone.',
  'systeembericht.goal_completed': '{naam} completed a goal.',
  'systeembericht.commitment_unlocked': '{naam} unlocked a reward.',
  'systeembericht.commitment_due': 'The stake {naam} set for themselves has come due.',
  'systeembericht.deadline_requested': '{naam} is asking the group to move a target date.',
  'systeembericht.group_sleeping': 'This group has gone quiet. One message wakes it up again.',

  'algemeen.oud_lid': 'A former member',

  'auth.titel.inloggen': 'Welcome back',
  'auth.titel.aanmelden': 'Create an account',
  'auth.veld.email': 'Email address',
  'auth.veld.wachtwoord': 'Password',
  'auth.knop.inloggen': 'Log in',
  'auth.knop.aanmelden': 'Create account',
  'auth.wissel.naar_aanmelden': 'No account yet? Create one.',
  'auth.wissel.naar_inloggen': 'Already have an account? Log in.',

  'auth.fout.ongeldig': 'That email address and password don’t match.',
  'auth.fout.algemeen': 'Logging in didn’t work. Please try again in a moment.',
  'auth.fout.bestaat_al': 'There’s already an account with this email address.',
};
