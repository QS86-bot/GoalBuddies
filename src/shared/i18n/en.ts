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

  'auth.fout.ongeldig': 'This email address and password do not match.',
  'auth.fout.bestaat_al':
    'An account with this address already exists. Log in or recover your password.',
  'auth.fout.niet_bevestigd': 'Confirm your email address first. Check your inbox.',
  'auth.fout.te_vaak': 'Too many attempts. Wait a moment and try again.',
  'auth.fout.zwak_wachtwoord': 'This password is not accepted. Use a longer phrase.',
  'auth.fout.geen_verbinding': 'No connection. Check your internet and try again.',
  'auth.fout.algemeen': 'Something went wrong. Please try again.',
  'auth.fout.invoer': 'Check what you entered.',
  'auth.fout.uitloggen': 'Logging out did not work. Please try again.',

  'auth.verwijder.verlopen': 'Your session has expired. Log in again and then try once more.',
  'auth.verwijder.enige_beheerder':
    'You are the only admin of a group that still has other people in it. Make ' +
    'someone else an admin first — otherwise that group is left behind with ' +
    'nobody able to manage it.',
  'auth.verwijder.mislukt': 'Deleting your account did not work. Please try again.',
  'auth.verwijder.mislukt_kort': 'Deleting your account did not work.',

  'auth.oauth.alleen_browser':
    'Signing in with Apple or Google only works in the browser for now. Use your email address for the time being.',
  'auth.oauth.mislukt': 'Signing in with this provider did not work. Try your email address.',

  'profiel.laden_mislukt': 'Your profile could not be loaded.',
  'profiel.opslaan_mislukt': 'Saving did not work. Please try again.',

  'validatie.wachtwoord_kort': 'Use at least 12 characters. A short phrase works fine.',
  'validatie.wachtwoord_lang': 'More than 72 characters is not possible — bcrypt cuts off after that.',
  'validatie.email': 'This does not look like an email address.',
  'validatie.wachtwoord_leeg': 'Enter your password.',
  'validatie.weekdag': 'A week starts on a day between Sunday and Saturday.',
  'validatie.tijdzone': 'Unknown time zone.',
  'validatie.naam_leeg': 'Enter a name.',
  'validatie.naam_lang': 'At most 80 characters.',
  'validatie.tijd': 'Use a time like 20:00.',

  'commitment.reward.set.titel': 'Ready',
  'commitment.reward.set.uitleg': 'This reward is released as soon as you finish this goal on time.',
  'commitment.reward.unlocked.titel': 'Unlocked',
  'commitment.reward.unlocked.uitleg': 'You reached your goal. Your group has seen it.',
  'commitment.reward.cancelled.titel': 'Expired',
  'commitment.reward.cancelled.uitleg': 'This reward no longer applies.',

  'commitment.penalty.set.titel': 'Set',
  'commitment.penalty.set.uitleg':
    'This comes into effect if your target date passes while the goal is not done. ' +
    'Missing a week does nothing to it.',
  'commitment.penalty.due.titel': 'Due',
  'commitment.penalty.due.uitleg':
    'Your target date has passed. The group you chose can read this now.',
  'commitment.penalty.resolved.titel': 'Settled',
  'commitment.penalty.resolved.uitleg': 'This stake has been paid.',
  'commitment.penalty.cancelled.titel': 'Expired',
  'commitment.penalty.cancelled.uitleg':
    'You finished your goal, so this stake will not come into effect.',

  'commitment.onbekend.titel': 'Unknown',
  'commitment.onbekend.uitleg': 'The state of this arrangement cannot be determined.',

  'commitment.fout.geen_groep': 'Choose a group that benefits if it does not work out.',
  'commitment.fout.invoer': 'Check what you entered.',
  'commitment.fout.vastleggen': 'Saving did not work. Please try again.',
  'commitment.fout.intrekken': 'Withdrawing did not work.',
  'commitment.fout.al_afgegaan':
    'This commitment has already come into effect and can no longer be withdrawn.',
  'commitment.fout.laden': 'The reward and penalty could not be loaded.',
  'commitment.fout.spoor': 'The history could not be loaded.',

  'validatie.commitment_kort': 'Write down what you are holding yourself to.',
  'validatie.commitment_lang': 'At most 500 characters.',
  'validatie.link': 'This is not a valid link.',

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

  'voltooiing.notitie_nodig':
    'Add a short note about what you did. Your buddy needs something to respond to.',
  'voltooiing.geweigerd':
    'Your submission was refused. Does your group ask for a note? One sentence is enough; ' +
    'at most 2000 characters.',
  'voltooiing.afronden_mislukt': 'Submitting did not work. Please try again.',
  'voltooiing.opslaan_mislukt': 'Saving did not work. Please try again.',
  'voltooiing.dagzet_laden': 'Your daily notes could not be loaded.',
  'voltooiing.invoer': 'Check what you entered.',

  'beoordeling.laden_mislukt': 'The reviews could not be loaded.',
  'beoordeling.een_buddy': 'A buddy',
  'beoordeling.vraag_nodig':
    'Add your question — without one your buddy does not know what to add.',
  'beoordeling.al_beoordeeld': 'You have already reviewed this week for your buddy.',
  'beoordeling.mislukt': 'Reviewing did not work. Refresh the list and try again.',
  'beoordeling.bijdrage_laden': 'Your buddy contribution could not be loaded.',

  'opnieuw.geen_niveau': 'Choose whether you reached the floor or the ceiling.',
  'opnieuw.niet_van_jou': 'This weekly goal is not yours.',
  'opnieuw.al_goedgekeurd': 'This week is already approved. There is nothing left to replace.',
  'opnieuw.niets_ingediend': 'Nothing has been submitted for this week yet.',
  'opnieuw.notitie_vereist': 'This group asks for a short note when you submit.',
  'opnieuw.mislukt': 'Resubmitting did not work. Please try again in a moment.',
  'opnieuw.mislukt_kort': 'Resubmitting did not work.',

  'intrekken.bestaat_niet': 'This approval no longer exists.',
  'intrekken.niet_van_jou': 'Only you can withdraw your own approval.',
  'intrekken.te_laat':
    'The fifteen minutes to undo this have passed. Ask your buddy to submit the week ' +
    'again if something is off.',
  'intrekken.al_gedaan': 'You have already withdrawn this approval.',
  'intrekken.mislukt': 'Withdrawing did not work. Please try again in a moment.',
  'intrekken.mislukt_kort': 'Withdrawing did not work.',

  'validatie.notitie_lang': 'At most 2000 characters.',
  'validatie.dagzet_leeg': 'One line is enough, but it cannot be empty.',
  'validatie.reactie_lang': 'Keep it short — at most 1000 characters.',

  'coach.starten_mislukt': 'The Goal Coach could not be started.',
  'coach.niet_jouw_doel': 'This goal is not yours.',
  'coach.niet_ingelogd': 'You are no longer signed in.',
  'coach.afronden_mislukt': 'The Goal Coach could not finish the request.',

  'groep.rate_limited':
    'You have tried an invitation too often today. In 24 hours it works again — ' +
    'meanwhile, ask your buddy to send the link once more.',
  'groep.ongeldige_link':
    'This invitation link no longer works. It was withdrawn or it is wrong; ' +
    'ask your buddy for a new one.',
  'groep.vol': 'This group is full. Three to five people works best, so that is no disaster.',
  'groep.te_veel_groepen': 'You are already in ten groups. Leave one to make room.',
  'groep.naam_kort': 'Give your group a name of at least two characters.',
  'groep.naam_lang': 'That name is too long. At most 60 characters.',
  'groep.slechte_huddledag': 'Choose a day of the week for the huddle.',
  'groep.daglimiet': 'You have already created ten groups today. Tomorrow it works again.',
  'groep.geen_beheerder': 'Only an admin of this group can do this.',

  'groep.aanmaken_mislukt': 'Your group could not be created.',
  'groep.invoer': 'Check what you entered.',
  'groep.opslaan_mislukt': 'Saving did not work. Only an admin can change this.',
  'groep.link_vernieuwen_mislukt': 'Refreshing the link did not work. Please try again.',
  'groep.link_vernieuwen_mislukt_kort': 'Refreshing the link did not work.',
  'groep.actie_mislukt': 'That did not work. Please try again.',
  'groep.actie_mislukt_kort': 'That did not work.',
  'groep.controleer_link': 'Check the link.',
  'groep.deelnemen_mislukt': 'Joining did not work. Please try again in a moment.',
  'groep.deelnemen_mislukt_link': 'Joining did not work. Ask your buddy for a new link.',
  'groep.uitnodiging_laden': 'This invitation could not be loaded.',
  'groep.koppelen_mislukt': 'Linking did not work. Are you a member of this group?',
  'groep.ontkoppelen_mislukt': 'Unlinking did not work.',
  'groep.gekoppelde_groepen_laden': 'The linked groups could not be loaded.',
  'groep.gekoppelde_doelen_laden': 'The linked goals could not be loaded.',
  'groep.naamloos': 'Your group',
  'groep.groepen_laden': 'Your groups could not be loaded.',
  'groep.groep_laden': 'This group could not be loaded.',
  'groep.lidmaatschap_laden': 'Your membership could not be loaded.',
  'groep.overzicht_laden': 'The group overview could not be loaded.',
  'groep.aanmaken_mislukt_kort': 'Your group could not be created. Please try again.',
  'groep.onbekend_lid': 'Unknown member',
  'validatie.groepsnaam_lang': 'At most 60 characters.',
  'validatie.weekdag_kort': 'Choose a day of the week.',
  'validatie.uitnodigingscode': 'This invitation code is not right. Check the link.',

  'bewijseis.note_required': 'Note required',
  'bewijseis.note_and_attachment': 'Note and attachment',
  'bewijseis.optional': 'Everything optional',

  'chat.laden_mislukt': 'The messages could not be loaded.',
  'chat.controleer': 'Check your message.',
  'chat.leeg': 'There is nothing in your message yet.',
  'chat.versturen_mislukt': 'Your message was not sent. Please try again in a moment.',
  'chat.weghalen_mislukt': 'Removing did not work. Please try again.',

  'ketting.laden_mislukt': 'The Chain could not be loaded.',

  'weekafsluiting.v1.label': 'What did you do?',
  'weekafsluiting.v1.hint': 'Pre-filled from your daily notes this week. Change whatever you like.',
  'weekafsluiting.v1.voorbeeld': 'Wrote three mornings, about four hours in total.',
  'weekafsluiting.v2.label': 'What got in the way?',
  'weekafsluiting.v2.hint':
    'The only place this belongs. Your group reads along to help, not to judge.',
  'weekafsluiting.v2.voorbeeld': 'Two evenings of overtime, and after that I could not get back in.',
  'weekafsluiting.v3.label': 'What is your next week?',
  'weekafsluiting.v3.hint': 'One concrete sentence is enough.',
  'weekafsluiting.v3.voorbeeld': 'Finish chapter three, and book an extra hour on Tuesday.',

  'weekafsluiting.leeg':
    'Fill in at least one question. Skipping all three is fine too — then nothing is saved.',
  'weekafsluiting.reactie_leeg': 'There is nothing in your reply yet.',
  'weekafsluiting.laden_mislukt': 'The week review could not be loaded.',
  'weekafsluiting.reacties_laden': 'The replies could not be loaded.',
  'weekafsluiting.invoer': 'Check what you entered.',
  'weekafsluiting.opslaan_mislukt': 'Saving did not work. Are you still a member of this group?',
  'weekafsluiting.weghalen_mislukt': 'Removing did not work. Please try again.',
  'weekafsluiting.reactie_controleer': 'Check your reply.',
  'weekafsluiting.reactie_mislukt': 'Your reply was not sent. Please try again in a moment.',
};
