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

  'bevestiging.weekdoel_afsluiten.titel': 'Close this week?',
  'bevestiging.weekdoel_afsluiten.uitleg':
    'The weekly goal stays, and counts as a missed week once your week is over. ' +
    'That costs one point and breaks your streak — unless you spend a week pass on it. ' +
    'You can carry it over to next week afterwards.',
  'bevestiging.weekdoel_afsluiten.knop': 'Close',

  'bevestiging.weekdoel_verwijderen.titel': 'Delete this weekly goal?',
  'bevestiging.weekdoel_verwijderen.uitleg':
    'Only meant for a mistake: a duplicate entry, or a weekly goal under the wrong goal. ' +
    'The row disappears and nothing is kept. Only possible shortly after creating it, ' +
    'and as long as you have not submitted anything.',
  'bevestiging.weekdoel_verwijderen.knop': 'Delete',

  'bevestiging.weekdoel_doorschuiven.titel': 'Carry over to this week?',
  'bevestiging.weekdoel_doorschuiven.uitleg':
    'You get the same weekly goal again in the week that is running now. ' +
    '⚠️ The missed week stays missed: the point is already booked and your streak is ' +
    'already broken. Carrying over moves the work, it does not repair your streak.',
  'bevestiging.weekdoel_doorschuiven.knop': 'Carry over',

  'bevestiging.doel_verwijderen.titel': 'Delete this goal?',
  'bevestiging.doel_verwijderen.uitleg':
    'Only meant for a goal you just created by accident. It works as long as nothing ' +
    'hangs off it: no weekly goals, no points, not shared with a group. ' +
    'Does your goal have history? Archive it instead — then everything is kept.',
  'bevestiging.doel_verwijderen.knop': 'Delete',

  'bevestiging.doel_afronden.titel': 'Complete this goal?',
  'bevestiging.doel_afronden.uitleg':
    'Every group this goal is linked to gets a message that you completed it, and a chat ' +
    'message cannot be taken back. Your reward is released and announced too; a penalty ' +
    'you had set expires. This cannot be undone.',
  'bevestiging.doel_afronden.knop': 'Complete',

  'viering.weekdoel.titel': 'Your week is confirmed',
  'viering.weekdoel.tekst': 'A buddy approved your week. It counts.',
  'viering.mijlpaal.titel': 'Milestone reached',
  'viering.mijlpaal.tekst': 'A piece of your goal is done. This one is worth pausing for.',
  'viering.doel.titel': 'Your goal is done',
  'viering.doel.tekst': 'You saw this through from start to finish. Most people do not.',

  'hulpvraag.opening': 'I am behind on "{doel}".',
  'hulpvraag.tijd_een_week': ' I have 1 week left.',
  'hulpvraag.tijd_weken': ' I have {weken} weeks left.',
  'hulpvraag.slot': ' Any ideas?',

  'risico.label.on_track': 'On track',
  'risico.label.at_risk': 'Watch out',
  'risico.label.behind': 'Behind',
  'risico.label.unreachable': 'Deadline out of reach',

  'eenheid.mijlpaal_een': '1 milestone',
  'eenheid.mijlpaal_meer': '{n} milestones',
  'eenheid.week_een': '1 week',
  'eenheid.week_meer': '{n} weeks',

  'risico.unreachable.datum_is_er':
    'Your target date is here, and {mijlpalen} is still open. Move your date or take work out.',
  'risico.unreachable.te_veel_werk':
    '{mijlpalen} is still open and there are {weken} left. Even at one milestone a week you would not make it.',
  'risico.unreachable.kaal': 'There is more work left than there is time until your target date.',

  'risico.behind.niets_afgerond':
    'You have not finished a week in the last {weken_bekeken}, and there is still work open. This is the moment to make your goal smaller or move your date.',
  'risico.behind.tempo':
    'You made {gehaald} of your last {weken_bekeken}. Finishing {mijlpalen} in {weken} needs a higher pace than that.',
  'risico.behind.kaal': 'You need a higher pace than you managed these last weeks.',

  'risico.at_risk.vloer':
    'You are making your weeks, but almost always at the floor. That counts in full — it just keeps pushing your ceiling further away.',
  'risico.at_risk.tempo':
    'You have {mijlpalen} to go in {weken}. That asks {benodigd} per week; you are at {tempo} now.',
  'risico.at_risk.kaal': 'You are still inside the lines, but there is little room left.',

  'risico.on_track.geen_geschiedenis':
    'No history to go on yet — and that is fine. A new goal starts on track.',
  'risico.on_track.tempo':
    'You made {gehaald} of your last {weken_bekeken}, with {mijlpalen} to go in {weken}. That will work out.',
  'risico.on_track.kaal': 'Your pace is enough for what is left.',

  'weekdoel.adempauze': 'Breather',
  'weekdoel.meegenomen': 'Carried into this week',
  'weekdoel.afgesloten': 'Closed',
  'weekdoel.niet_afgerond': 'Not finished',
  'weekdoel.nog_te_doen': 'Still to do',
  'weekdoel.plafond_gehaald': 'Ceiling reached',
  'weekdoel.vloer_gehaald': 'Floor reached',
  'weekdoel.gehaald': 'Done',
  'weekdoel.wacht_op_buddy': '{wat} — waiting for your buddy',

  'reeks.geen': 'No streak yet',
  'reeks.een': '1 week in a row',
  'reeks.meer': '{n} weeks in a row',

  'ketting.niemand': 'Nobody is in yet',
  'ketting.net_begonnen': 'The week has just started',
  'ketting.jij_alleen': 'Your link is in',
  'ketting.voltallig': 'Everyone is in — the chain is closed',
  'ketting.schakels_een': '1 link this week',
  'ketting.schakels_meer': '{n} links this week',

  'weekpas.geen': 'No week pass yet',
  'weekpas.een': '1 week pass',
  'weekpas.meer': '{n} week passes',
  'weekpas.van_maximum': '{wat} of {maximum}',

  'punten.uitleg': 'Ceiling reached +2, floor reached +1, week missed −1, breather 0.',

  'weekpas.uitleg':
    'A week pass keeps your streak alive when you miss a week. You still get the minus ' +
    'point for that week — a pass protects your streak, not your points. You do not have ' +
    'to do anything: miss a week and we spend one automatically. Week passes are saved per goal.',

  'weekpas.vol':
    'You have {voorraad}, and you cannot hold more at once. Earn one while you are full and it comes free as soon as you use one.',
  'weekpas.nog_een_week': 'One more completed week',
  'weekpas.nog_weken': '{n} more completed weeks',
  'weekpas.eerste': '{nog} and your first week pass is ready.',
  'weekpas.volgende': '{nog} until the next one.',

  'chat.van_jou': 'You: {tekst}',
  'chat.van_ander': '{naam}: {tekst}',
  'chat.weghalen': 'Remove',

  'delen.gekopieerd': 'Copied — paste it into your chat',
  'delen.mislukt': 'Sharing does not work here — select the link above',

  'stand.punten': 'Points',
  'stand.langste_reeks': 'Longest streak',

  'mijlpalen.geen': 'No milestones yet',
  'mijlpalen.voortgang': '{done} of {total} milestones',

  'weekstart.label': 'My week starts on',
  'weekstart.hint':
    'Decides when your weekly goals start over and when your points count. ' +
    'Changeable later; a running week just finishes out.',

  'weekpas.titel': 'Week passes',
  'weekpas.gered': 'A week pass saved your streak.',
};
