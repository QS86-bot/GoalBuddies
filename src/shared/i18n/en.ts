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
  'systeembericht.member_joined_gevouwen': '{namen} joined.',
  'systeembericht.completion_pending_gevouwen':
    '{namen} finished a week and are waiting for confirmation.',
  'systeembericht.completion_approved_gevouwen': '{actor} confirmed the weeks of {namen}.',
  'systeembericht.milestone_done': '{naam} reached a milestone.',
  'systeembericht.goal_completed': '{naam} completed a goal.',
  'systeembericht.commitment_unlocked': '{naam} unlocked a reward.',
  'systeembericht.commitment_due': 'The stake {naam} set for themselves has come due.',
  'systeembericht.deadline_requested': '{naam} is asking the group to move a target date.',
  'systeembericht.group_sleeping': 'This group has gone quiet. One message wakes it up again.',
  'systeembericht.chain_milestone': 'The Chain of this group now counts {aantal} links.',
  'systeembericht.season_recap':
    'The season is done. Together you finished {weken} weeks, reached {mijlpalen} ' +
    'milestones and added {schakels} links to the Chain.',
  'systeembericht.group_opened':
    '{naam} opened up this group. From now on members also see each other’s setbacks.',
  'systeembericht.group_protected':
    '{naam} made this group protected again. Other people’s setbacks are no longer visible.',
  'systeembericht.group_discoverable':
    '{naam} made this group discoverable. People you don’t know yet can see the name, the topic, the description and the number of members. Nothing else.',
  'systeembericht.huddle_day_changed':
    '{naam} moved the huddle day. The week that is running moved along with it; anything already closed stays closed.',
  'systeembericht.team_goal_created': 'There is a new team goal. Take your share if you want to join in.',
  // ⚠️ Migration 0333 (QS8-666, A57). About the group: no {naam}, no points.
  'systeembericht.leaderboard_enabled': 'The leaderboard is on in this group.',
  'systeembericht.leaderboard_disabled': 'The leaderboard is off in this group.',
  'systeembericht.team_goal_completed': 'The team completed a team goal.',

  'systeembericht.prestatie_gedeeld': '{naam} shares an achievement: {prestatie}.',
  'systeembericht.prestatie_gedeeld_zonder_prestatie': '{naam} shares an achievement.',

  'algemeen.oud_lid': 'A former member',
  'algemeen.en': 'and',

  'auth.fout.ongeldig': 'This email address and password do not match.',
  'auth.fout.bestaat_al':
    'An account with this address already exists. Log in or recover your password.',
  'auth.fout.niet_bevestigd': 'Confirm your email address first. Check your inbox.',
  'auth.fout.te_vaak': 'Too many attempts. Wait a moment and try again.',
  'auth.fout.zwak_wachtwoord': 'This password is not accepted. Use a longer phrase.',
  'auth.bevestig_inbox': 'That worked. If email confirmation is on, have a look in your inbox.',
  'auth.fout.geen_verbinding': 'No connection. Check your internet and try again.',
  'auth.fout.algemeen': 'Something went wrong. Please try again.',
  'auth.fout.invoer': 'Check what you entered.',
  'auth.fout.uitloggen': 'Logging out did not work. Please try again.',

  'auth.verwijder.verlopen': 'Your session has expired. Log in again and then try once more.',
  'auth.verwijder.enige_beheerder':
    'You are the only admin of a group that still has other people in it. Make ' +
    'someone else an admin first. Otherwise that group is left behind with ' +
    'nobody able to manage it.',
  'auth.verwijder.mislukt': 'Deleting your account did not work. Please try again.',
  'auth.verwijder.mislukt_kort': 'Deleting your account did not work.',

  'auth.oauth.alleen_browser':
    'Signing in with Apple or Google only works in the browser for now. Use your email address for the time being.',
  'auth.oauth.mislukt': 'Signing in with this provider did not work. Try your email address.',

  'profiel.laden_mislukt': 'Your profile could not be loaded.',
  'profiel.opslaan_mislukt': 'Saving did not work. Please try again.',
  'profiel.weekbelofte_loopt': "Your week start can't change while your weekly promise is running. Once that week is over, you can change it again.",

  'validatie.wachtwoord_kort': 'Use at least 8 characters. A short phrase works fine.',
  'validatie.wachtwoord_lang':
    'This password is too long. It can be at most 72 bytes: a plain letter counts as 1, an accented letter as 2 or 3, an emoji as 3 or more. Shorten the phrase.',
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

  'getuigenis.titel': 'You are the witness',
  'getuigenis.uitleg':
    'These people named you as the witness to their stake. Their target date has ' +
    'passed.',
  'getuigenis.van': "{naam}'s stake",
  'getuigenis.afgehandeld': 'Settled',
  'getuigenis.verschuldigd': 'Due',

  'commitment.onbekend.titel': 'Unknown',
  'commitment.onbekend.uitleg': 'The state of this arrangement cannot be determined.',

  'commitment.fout.geen_begunstigde':
    'First pick who the witness is: a group or one person.',
  'commitment.begunstigde.naamloos': 'A group member',
  'commitment.fout.invoer': 'Check what you entered.',
  'commitment.fout.vastleggen': 'Saving did not work. Please try again.',
  'commitment.fout.teamstraf':
    'An agreement on a team share can only have your team or a teammate as its witness. ' +
    'And a team can only witness a team share. Choose another witness.',
  'commitment.fout.intrekken': 'Withdrawing did not work.',
  'commitment.fout.al_afgegaan':
    'This commitment has already come into effect and can no longer be withdrawn.',
  'commitment.fout.laden': 'The reward and penalty could not be loaded.',
  'stuurloos.kop': 'Your witness is gone',
  'stuurloos.uitleg':
    'The person you named as your witness has closed their account. Your stake is still open. Name someone else, or settle it if you have kept to it.',
  'stuurloos.wie': 'Who watches from now on?',
  'stuurloos.aanwijzen': 'Name this person',
  'stuurloos.kies_eerst': 'First pick who watches from now on.',
  'stuurloos.niemand':
    'There is nobody in your groups to name right now. Once someone joins, you can do it here.',
  'stuurloos.afwikkelen': 'I have kept to it',
  'stuurloos.zeker': 'Settle this stake?',
  'stuurloos.afwikkelen_uitleg':
    'You are recording that you kept to your stake. There is no witness left to confirm it, so this rests on your word alone. It cannot be undone.',
  'stuurloos.ja_afwikkelen': 'Yes, settle it',
  'stuurloos.terug': 'Back',
  'commitment.fout.herstel': 'That did not work. Please try again.',
  'commitment.herstel.heeft_getuige':
    'This stake still has a witness. You can only hand it over once your witness has closed their account.',
  'commitment.herstel.niet_verschuldigd':
    'This stake is not due yet. While that is the case, you can simply withdraw it.',
  'commitment.herstel.geen_groepsgenoot':
    'You can only pick someone you share a group with.',
  'commitment.herstel.niet_jezelf': 'You cannot be your own witness.',
  'commitment.fout.spoor': 'The history could not be loaded.',

  'validatie.commitment_kort': 'Write down what you are holding yourself to.',
  'validatie.commitment_lang': 'At most 500 characters.',
  'validatie.link': 'This is not a valid link.',
  'validatie.link_https': 'An image link has to start with https://.',

  'bevestiging.annuleren': 'Cancel',
  'bevestiging.weekdoel_afsluiten.titel': 'Close this week?',
  'bevestiging.weekdoel_afsluiten.uitleg':
    'The weekly goal stays, and counts as a missed week once your week is over. ' +
    'That costs one point and breaks your streak, unless you spend a week pass on it. ' +
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
    'Does your goal have history? Archive it instead. Then everything is kept.',
  'bevestiging.doel_verwijderen.knop': 'Delete',

  'bevestiging.doel_afronden.titel': 'Complete this goal?',
  'bevestiging.doel_afronden.uitleg':
    'Every group this goal is linked to gets a message that you completed it, and a chat ' +
    'message cannot be taken back. Finish on time and your reward is released and a penalty ' +
    'you had set expires. Finish after the target date and your reward lapses while your ' +
    'penalty stands: it becomes due. This cannot be undone.',
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
    'You are making your weeks, but almost always at the floor. That counts in full. It just keeps pushing your ceiling further away.',
  'risico.at_risk.deels':
    'You finish something every week, but none of the last {weken_bekeken} completely. Plan less per week, or put a floor under what keeps slipping.',
  'risico.at_risk.tempo':
    'You have {mijlpalen} to go in {weken}. That asks {benodigd} per week; you are at {tempo} now.',
  'risico.at_risk.kaal': 'You are still inside the lines, but there is little room left.',

  'risico.on_track.geen_geschiedenis':
    'No history to go on yet, and that is fine. A new goal starts on track.',
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
  'weekdoel.wacht_op_buddy': '{wat}: waiting for your buddy',
  'weekdoel.wacht_op_bevestigingen': '{wat}: {gedaan} of {nodig} confirmed',

  'paginakop.voortgang': 'Progress',
  'paginakop.meldingen': 'Notifications, {aantal} waiting',
  'paginakop.meldingen_knop': 'Notifications {aantal}',
  'reeks.geen': 'No streak yet',
  'reeks.een': '1 week in a row',
  'reeks.meer': '{n} weeks in a row',

  'ketting.niemand': 'Nobody is in yet',
  'ketting.net_begonnen': 'The week has just started',
  'ketting.jij_alleen': 'Your link is in',
  'ketting.voltallig': 'Everyone is in: the chain is closed',
  'ketting.schakels_een': '1 link this week',
  'ketting.schakels_meer': '{n} links this week',

  'weekpas.geen': 'No week pass yet',
  'weekpas.een': '1 week pass',
  'weekpas.meer': '{n} week passes',
  'weekpas.van_maximum': '{wat} of {maximum}',

  'punten.uitleg': 'Ceiling reached +2, floor reached +1, week missed −1, breather 0.',

  'weekpas.uitleg':
    'A week pass keeps your streak alive when you miss a week. You still get the minus ' +
    'point for that week; a pass protects your streak, not your points. You do not have ' +
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

  'delen.gekopieerd': 'Copied. Paste it into your chat',
  'delen.mislukt': 'Sharing does not work here. Select the link above',
  'delen.uitnodiging_onderwerp': '{naam} invites you to GoalBuddies',
  'delen.uitnodiging_onderwerp_zonder_naam': 'You are invited to GoalBuddies',
  'delen.uitnodiging_tekst': '{naam} invites you to the group “{groep}” on GoalBuddies, an app for working on your goals together with others. Open the link to see the group and join:\n{link}',
  'delen.uitnodiging_tekst_zonder_naam': 'You are invited to the group “{groep}” on GoalBuddies, an app for working on your goals together with others. Open the link to see the group and join:\n{link}',
  'linkvoorbeeld.titel': 'GoalBuddies',
  'linkvoorbeeld.beschrijving': 'Work on your goals together with others. GoalBuddies helps you keep going, with a group that cheers you on.',

  'stand.punten': 'Points',
  'stand.langste_reeks': 'Longest streak',

  'mijlpalen.geen': 'No milestones yet',
  'mijlpalen.voortgang': '{done} of {total} milestones',

  'datumkeuze.kies': 'Pick a date',
  'datumkeuze.niets_gekozen': 'no date yet',
  'datumkeuze.wissen': 'No date',
  'datumkeuze.vorige_maand': 'Previous month',
  'datumkeuze.volgende_maand': 'Next month',

  'weekstart.label': 'My week starts on',
  'weekstart.hint':
    'Decides when your weekly goals start over and when your points count. ' +
    'Changeable later; weekly goals you still have to do come along.',

  'weekpas.punt_toch_af': 'Last week was not completed, but your streak continues. One point did come off for that week.',
  'laden.mislukt': 'Something went wrong while loading. Try again; if it keeps failing, it is on us.',
  'laden.opnieuw': 'Try again',
  'mijlpaal.voortgang_label': '{gehaald} of {totaal} milestones reached',
  'uitnodiging.open_waarschuwing': 'If you join, this group also sees your missed weeks.',
  'uitnodiging.titel': 'You have been invited',
  'uitnodiging.titel_verlopen': 'This link no longer works',
  'uitnodiging.eyebrow': 'BUDDY GROUP',
  'uitnodiging.leeg_titel': 'This invitation no longer works',
  'uitnodiging.leeg_tekst': 'The link was withdrawn or replaced by a new one. Ask whoever invited you to send it again. Then you will get the valid one straight away.',
  'uitnodiging.leden_een': '{n} member · huddle day {dag}',
  'uitnodiging.leden_meer': '{n} members · huddle day {dag}',
  'uitnodiging.geen_gedeeld_doel': 'Not working on a shared goal yet',
  'uitnodiging.pas_bij_meedoen': 'You will see what they are working on once you join. That is deliberate: what people share here, they share with their group and not with everyone who gets the link.',
  'uitnodiging.wat_je_doet': 'What you will be doing here',
  'uitnodiging.uitleg_kern': 'You pick one goal with a date on it. Each week you decide what you want to finish, and one of your buddies approves that you did. That is all.',
  'uitnodiging.uitleg_missen_beschermd': 'Missing a week costs one point and nothing else. Nobody in the group sees it.',
  'uitnodiging.uitleg_missen_open': 'Missing a week costs one point and nothing else. In this group the others do see it. That is what “open” above means.',
  'uitnodiging.al_lid': 'You are in the group',
  'uitnodiging.doorsturen': 'You are being taken to the group.',
  'uitnodiging.eerst_profiel': 'Finish your profile first. The group will be waiting for you.',
  'uitnodiging.naar_groep': 'To the group',
  'uitnodiging.profiel_afmaken': 'Finish profile',
  'uitnodiging.al_lid_titel': 'You are already in this group',
  'uitnodiging.al_lid_tekst': 'You are already a member with this account. You do not need to join again. To invite someone else, forward this link.',
  'uitnodiging.lid_onbekend': 'We could not check whether you are already in this group. Check above which account you are joining with.',
  'uitnodiging.controleren': 'Checking whether you are already in this group.',
  'account.ingelogd_als': 'Signed in as {naam}',
  'account.ingelogd_adres': 'Account: {adres}',
  'account.niet_ingelogd': 'You are not signed in.',
  'account.verkeerd_account': 'Not right? Sign out on your profile and open the link again with the correct account.',
  'uitnodiging.deelnemen': 'Join this group',
  'uitnodiging.inloggen': 'Sign in or create an account',
  'uitnodiging.blijft_bewaard': 'Your invitation is kept on this device. Even if you have to confirm your email first, you will be in the group afterwards.',
  'uitnodiging.rondkijken': 'Just have a look around',
  'uitnodiging.deelnemen_mislukt': 'Joining did not work. Please try again in a moment.',
  'veld.wachtwoord_tonen': 'Show',
  'veld.wachtwoord_verbergen': 'Hide',
  'spraak.starten': 'Speak',
  'spraak.stoppen': 'Stop',
  'spraak.luistert': 'Listening',
  'spraak.uitleg_titel': 'Your voice goes to the browser',
  'spraak.uitleg_body': 'To turn your words into text, your browser sends the recording to its own speech service. In Chrome and Edge that is a server run by the browser maker. So what you say leaves your device. If you would rather it did not, just type; that works the same everywhere.',
  'spraak.uitleg_akkoord': 'Got it, start speaking',
  'spraak.uitleg_annuleren': 'I will type',
  'spraak.fout_geweigerd': 'The microphone is blocked for this site. Turn it on in your browser settings and try again.',
  'spraak.fout_verbinding': 'The speech service could not be reached. Check your connection and try again.',
  'spraak.fout_niets_verstaan': 'Nothing was picked up. Try again, a bit closer to the microphone.',
  'spraak.fout_algemeen': 'Speaking did not work. Try again in a moment, or type your text.',
  'aanmelden.titel_nieuw': 'Create account',
  'aanmelden.titel_terug': 'Welcome back',
  'aanmelden.eyebrow': 'GOALBUDDIES',
  'aanmelden.email': 'Email address',
  'aanmelden.email_hint': 'you@example.com',
  'aanmelden.wachtwoord': 'Password',
  'aanmelden.wachtwoord_hint': 'At least 8 characters. A short sentence works well and is easier to remember.',
  'aanmelden.knop_nieuw': 'Create account',
  'aanmelden.knop_inloggen': 'Sign in',
  'aanmelden.heb_al_account': 'I already have an account',
  'aanmelden.ben_nieuw': 'I am new here',
  'aanmelden.bestaand_account': 'Or use an existing account',
  'aanmelden.alleen_browser': 'Signing in with Apple or Google currently only works in the browser.',
  // Second entry: work — QS8-663
  'aanmelden.positionering': 'Reach goals together, without anyone feeling judged. For small teams of up to 25 people and for groups of friends.',
  'aanmelden.werk_kop': 'I am here through work',
  'aanmelden.werk_tekst': 'Got an invitation link or a code from your employer? Create an account first; then you join your team. Your team sees the team bar and your own share, never how far anyone else is.',
  'aanmelden.werk_knop': 'Remember code',
  'aanmelden.werk_onthouden': 'Your code is remembered. Create or pick your account above; then you can join with one tap.',
  'beoordeling.titel': 'Review',
  'beoordeling.leeg_titel': 'Nothing to review',
  'beoordeling.leeg_tekst': 'As soon as a buddy finishes a week, it shows up here. One line back is enough. That is the point.',
  'beoordeling.terugdraai_venster': 'Wrong buddy? You can still undo this for {minuten} minutes.',
  'beoordeling.terug': 'Back',
  'beoordeling.terugdraaien': 'Undo',
  'beoordeling.klopt_zo': 'Looks right',
  'beoordeling.vraag_titel': 'What would you like to know?',
  'beoordeling.vraag_uitleg': 'A question, not a judgement. Most confusion is just confusion.',
  'beoordeling.vraag_hint': 'How far did you get with the second chapter?',
  'beoordeling.vraag_versturen': 'Send question',
  'beoordeling.toch_niet': 'Never mind',
  'beoordeling.goedkeuren': 'Approve',
  'beoordeling.vertel_meer': 'Tell me more',
  'beheer.titel': 'Manage group',
  'beheer.eyebrow': 'ADMINS ONLY',
  'beheer.geen_beheerder_titel': 'Only an admin can set up this group',
  'beheer.geen_beheerder_tekst': 'You are a member of this group, but not an admin. Ask whoever created the group to change the name, the huddle day or the invite link.',
  'beheer.naam': 'Group name',
  'beheer.naam_hint': 'The Thursday club',
  'beheer.huddledag_uitleg': 'Changing this does not break a running chain: a link carries the week it was made in, and that is never recalculated.',
  'beheer.bewijs_label': 'How much proof does this group ask for?',
  'beheer.bewijs_hint': 'A thumbs up on a claim is a formality. One sentence costs ten seconds and gives your buddy something to respond to. That is what gets the conversation going.',
  'beheer.bewijs_wijzigen': 'Changing this does not affect existing completions.',
  'beheer.opslaan': 'Save',
  'beheer.link_titel': 'Invite link',
  'beheer.link_uitleg': 'Whoever opens this link sees the group and how many people are in it, even without an account. What you share in goals is only visible after joining. Still, only share the link with people you want in.',
  'beheer.deel': 'Share the invitation',
  'beheer.kopieer': 'Or copy it by hand',
  'beheer.link_gesloten': 'The link is closed. Nobody can get in with it right now.',
  'beheer.nieuwe_link': 'Create a new link',
  'beheer.link_openzetten': 'Open the link again',
  'beheer.link_sluiten': 'Close the link',
  'beheer.sluiten_uitleg': 'Closing keeps the code but refuses everyone. Creating a new link replaces the code, and then the old one is dead for good. That is what you do when a link ended up somewhere it should not have.',
  'beheer.terug': 'Back to the group',
  'beheer.melding_gesloten': 'The link is closed.',
  'beheer.melding_open': 'The link is open again.',
  'onboarding.profiel_leeg_titel': 'We can\'t load your details right now.',
  'onboarding.profiel_leeg_tekst': 'Try again in a moment. Nothing is lost.',
  'onboarding.eyebrow': 'ONE MORE SCREEN',
  'onboarding.stap1.kop': 'One goal, with a date on it',
  'onboarding.stap1.a': 'You start with one goal that has to be finished on a day you pick. Not five goals. One.',
  'onboarding.stap1.b': 'The Goal Coach then cuts it into milestones, and those milestones become your weekly goals.',
  'onboarding.stap2.kop': 'The week is the unit',
  'onboarding.stap2.a': 'Each week you decide what you want to finish. At the end of your week you tick off what worked.',
  'onboarding.stap2.b': 'Your week starts on the day you pick. Not everyone lives from Monday to Sunday.',
  'onboarding.stap3.kop': 'A floor and a ceiling',
  'onboarding.stap3.a': 'The ceiling is what you want to reach. The floor is the version you still manage on your worst week.',
  'onboarding.stap3.b': 'Reaching the floor counts: your streak continues and your buddy approves it just the same. Only the points differ.',
  'onboarding.stap3.c': 'This is the idea the app is built around. Your streak should serve you, not the other way around.',
  'onboarding.stap4.kop': 'A buddy approves it',
  'onboarding.stap4.a': 'Someone from your group confirms that you did it. Approving yourself is not possible.',
  'onboarding.stap4.b': 'Missing a week costs you one point and nothing else. In a protected group, and that is the default, nobody sees it. If a group deliberately chooses to be open, you are told before you join.',
  'onboarding.stap_van': 'STEP {nu} OF {totaal}',
  'onboarding.zo_ziet_eruit': 'Here is what that looks like',
  'onboarding.voorbeeld_titel': 'Run three times',
  'onboarding.voorbeeld_vloer': 'Once, even if it is twenty minutes',
  'onboarding.voorbeeld_plafond': 'Three times, at least five kilometres',
  'onboarding.aan_de_slag': 'Get started',
  'onboarding.verder': 'Next',
  'onboarding.vorige': 'Back',
  'onboarding.overslaan': 'Skip',

  // Navigation — QS8-211. Deliberately separate from any one screen.
  'nav.terug': 'Back',
  'nav.naar_overzicht': 'Done, to my overview',
  'onboarding.profiel_titel': 'A bit about you',
  'onboarding.naamloos': 'Nameless',
  'onboarding.naam': 'What is your name?',
  'onboarding.naam_hint': 'This is what your buddies see. A first name is enough.',
  'onboarding.naam_plaatshouder': 'Quinten',
  'onboarding.geen_avatar': 'No photo? Then we show your initials. You can pick one here, or later under Profile, in Settings.',
  'onboarding.tijdzone_van_telefoon': 'Time zone: {zone}, from your phone.',
  'onboarding.waarvoor': 'What brings you here?',
  'onboarding.waarvoor_hint': 'Did you come in to help a friend? Then you do not need a goal yourself. You can always make one later.',
  'onboarding.zelf_doel': 'I want a goal of my own',
  'onboarding.kom_helpen': 'I came to help',
  'onboarding.klaar': 'Done',
  'groepdetail.zichtbaarheid': 'This group’s visibility: {stand}',
  'groepdetail.titel': 'Your group',
  'groepdetail.titel_naam': 'Your group: {naam}',
  'groepdetail.titel_zonder_groep': 'Group',
  'groepdetail.inhoud': 'On this page you will find, among others: {onderdelen}',
  'groepdetail.eyebrow': 'HUDDLE DAY {dag}',
  'groepdetail.eyebrow_vandaag': 'TODAY IS THE HUDDLE DAY',
  'groepdetail.geen_lid_titel': 'This group is not here, or not for you',
  'groepdetail.geen_lid_tekst': 'You are not a member of this group, or it no longer exists. Ask for a new invite link if you belong here.',
  'groepdetail.slaapt': 'This group is asleep: nothing has happened for a while, so the reminders stopped. As soon as someone finishes a week, it wakes right up.',
  'groepdetail.ketting_mislukt': 'The Chain could not be loaded.',
  'groepdetail.opnieuw': 'Try again',
  'groepdetail.bolletje_uitleg': 'The dot means: already wrapped up this week. No dot means not yet, nothing more.',
  'groepdetail.gesprek': 'The conversation',
  'groepdetail.gesprek_uitleg': 'The weekly wrap-up is the fixed moment on the huddle day: three questions, and everyone’s answers on one card. The chat is for the rest of the week.',
  'groepdetail.naar_weekafsluiting': 'The weekly wrap-up',
  'groepdetail.naar_chat': 'Group chat',
  'groepdetail.link_uitleg': 'Whoever opens this link sees the group and how many people are in it, even without an account. Only share it with people you want in.',
  'demping.titel': 'Mute group',
  'demping.uitleg_uit': 'Muting turns off notifications from this group: you will not be notified when a buddy is waiting for your review.',
  'demping.uitleg_aan': 'This group is muted: you will not be notified when a buddy is waiting for your review.',
  'demping.blijft': 'Anything about your own work still comes through, such as a buddy approving it. Your membership, points, streak and approval rights do not change; you can still approve in the app.',
  'demping.privacy': 'Only you can see that you muted. The group gets no message about it and cannot see it anywhere.',
  'demping.dempen': 'Mute group',
  'demping.opheffen': 'Unmute',
  'demping.dempen_label': 'Mute notifications from this group',
  'demping.opheffen_label': 'Unmute this group',
  'demping.laden_mislukt': 'The mute setting could not be loaded.',
  'demping.zetten_mislukt': 'The mute setting could not be changed. Please try again shortly.',
  'groepdetail.beheren': 'Manage group',
  'groepdetail.naar_groepen': 'To my groups',
  'deadlineverzoek.leeg_titel': 'Nothing to decide',
  'deadlineverzoek.leeg_tekst': 'As soon as someone asks for a new target date, it shows up here.',
  'deadlineverzoek.van_naar': 'From {oud} to {nieuw}.',
  'deadlineverzoek.reden_label': 'Would you like to add anything?',
  'deadlineverzoek.reden_hint': 'May be empty. One sentence helps your buddy more than a bare refusal.',
  'deadlineverzoek.reden_voorbeeld': 'Shall we first see whether we can make it workable together?',
  'deadlineverzoek.versturen': 'Send',
  'deadlineverzoek.toch_niet': 'Never mind',
  'deadlineverzoek.akkoord': 'Agreed',
  'deadlineverzoek.liever_niet': 'Rather not',
  'deadlineverzoek.straf_staat_erop':
    'This goal carries a penalty its owner set for themselves. If you agree, the date on '+
    'which it falls due moves along with it.',
  'deadlineverzoek.straf_onbekend':
    'We could not check whether this goal carries a penalty.',
  'koppel.ontkoppel': 'Stop sharing with this group',
  'koppel.titel': 'Share your goal with this group',
  'koppel.uitleg_beschermd': 'As long as you link nothing, nobody here sees what you are working on. Linking shares the title and your milestone progress. Not your notes, not your weeks and not your points. You can always undo it.',
  'koppel.uitleg_open': 'As long as you link nothing, nobody here sees what you are working on. This group is open: linking shares the title, your milestone progress and your weeks, including the weeks you did not make. Your notes and your points stay yours. You can always undo it.',
  'koppel.geen_doel_titel': 'You do not have a goal to share yet',
  'koppel.geen_doel_tekst': 'Start with one goal with a date on it. After that you can link it to this group here.',
  'koppel.nieuw_doel': 'New goal',
  'deling.kop': 'Shared with',
  'deling.uitleg':
    'One goal may sit in more than one group. Each group is a separate permission: you ' +
    'link and unlink them independently.',
  'deling.nergens': 'You are not sharing this goal with anyone yet. It is only on your screen.',
  'deling.geen_groepen':
    'You are not in a group yet. As soon as you have one, you can link this goal to it here.',
  'deling.overal': 'This goal is in all of your groups.',
  'deling.koppel_kop': 'Also share with',
  'deling.koppel': 'Share with {naam}',
  'deling.uitleg_beschermd':
    'Protected. This group sees the title and your milestone progress. Not your notes, ' +
    'not your weeks and not your points.',
  'deling.uitleg_open':
    'Open. This group sees the title, your milestone progress and your weeks, including the ' +
    'weeks you did not make. Your notes and your points stay yours.',
  'deling.welke_groep': 'Which group decides?',
  'deling.welke_groep_hint':
    'This goal sits in more than one group. Only the group you pick here reads your ' +
    'explanation and decides on the new date.',
  'deling.kies_eerst': 'First pick which group decides.',
  'deelnemen.titel': 'Join',
  'deelnemen.eyebrow': 'WITH A CODE',
  'deelnemen.code_label': 'Invite code or link',
  'deelnemen.code_hint': 'Twelve characters. Dashes, spaces and the whole link are fine; we strip those ourselves.',
  'deelnemen.herkend': 'Recognised as: {code}',
  'deelnemen.nog_niet_herkend': 'No valid code recognised yet.',
  'deelnemen.knop': 'Join this group',
  'deelnemen.werkt_niet': 'Code not working?',
  'deelnemen.werkt_niet_uitleg': 'A link may have been withdrawn, or replaced by a new one. Ask whoever invited you to send the link again. That one will be valid.',
  'deelnemen.terug': 'Back',
  'groepnieuw.titel': 'New group',
  'groepnieuw.eyebrow': 'THREE IS THE BEST SIZE',
  'groepnieuw.naam': 'What is your group called?',
  'groepnieuw.naam_hint': 'Two to sixty characters. Something you will recognise in a WhatsApp message.',
  'groepnieuw.naam_voorbeeld': 'The Thursday club',
  'groepnieuw.huddledag': 'Huddle day',
  'groepnieuw.huddledag_hint': 'The day you come together. It decides the weekly wrap-up, The Chain and the group overview. Not when your own weekly goals reset: that stays your personal week start day.',
  'groepnieuw.later_wijzigen': 'Changeable later. A running chain does not break from it: links stay in the week they were made.',
  'groepnieuw.wat_daarna': 'What happens next',
  'groepnieuw.wat_daarna_a': 'You get an invite link you can share. Whoever opens it sees the group and what you are working on, even without an account. You can always refresh or close the link.',
  'groepnieuw.wat_daarna_b': 'You become the admin. A group can hold twelve people, but three to five works best in practice.',
  'groepnieuw.aanmaken': 'Create group',
  'groepnieuw.annuleren': 'Cancel',
  'tab.vandaag': 'Today',
  'tab.doelen': 'Goals',
  'tab.groep': 'Group',
  'tab.profiel': 'Profile',
  'tab.melding_wacht': 'a report is waiting',
  'tab.navigatie': 'Main menu',
  'vangnet.kop': 'The app could not continue',
  'vangnet.tekst': 'Something went wrong while building this screen. Go back to the start screen. If it keeps failing, restart the app.',
  'vangnet.opnieuw': 'Go to the start screen',
  'tab.fout_kop': 'This screen could not be shown',
  'tab.fout_tekst': 'Something went wrong while building this screen. Try again, or use the menu to go to another screen.',
  'tab.fout_opnieuw': 'Reload this screen',
  'doelen.titel': 'Goals',
  'doelen.leeg_titel': 'No goal yet',
  'doelen.leeg_tekst': 'Start with one goal with a date on it. The Goal Coach then cuts it into milestones, and those milestones become your weekly goals.',
  'doelen.van_totaal': '{aantal} of {totaal} goals.',
  'doelen.nieuw': 'New goal',
  'doelen.zelf_invullen': 'Rather fill it in myself',
  'doelen.meer_laden': 'Load more goals',
  'doelen.doel': 'Goal',
  'doelen.streefdatum': 'Target date {datum}',
  'doelen.datum_verstreken': 'Date passed',
  'doelen.weken_afgerond': '{n} weeks completed',
  'groepen.titel': 'Your groups',
  'groepen.leeg_titel': 'No buddy group yet',
  'groepen.leeg_tekst': 'Three people is the best size: big enough that someone always responds, small enough that you cannot hide. Create a group or use the invite link you were given.',
  'groepen.aanmaken': 'Create group',
  'groepen.heb_code': 'I have an invite',
  'groepen.ontdekken': 'Find a group to join',
  'groepen.mensen_zoeken': 'Find someone by name',
  'groepen.wachten_onbekend': 'Are buddies waiting on you?',
  'groepen.wacht_een': 'One buddy is waiting on you',
  'groepen.wachten_meer': '{n} buddies are waiting on you',
  'groepen.ophalen_mislukt': 'We could not fetch that just now. Have a look yourself; it takes ten seconds.',
  'groepen.week_afgerond': 'They finished their week. One line back is enough. That is the whole point.',
  'groepen.beoordelen': 'Review',
  'groepen.slaapt': 'This group is asleep. As soon as someone finishes a week, it wakes right up.',
  'groepen.huddledag': 'Huddle day: {dag}',
  'groepen.huddledag_vandaag': 'Huddle day: today',
  'groepen.sectie_prive': 'Personal',
  'groepen.sectie_werk': 'Work',
  'groepen.sectie_werk_naam': 'Work · {naam}',
  'uiterlijk.laden': 'Loading your choices.',
  'uiterlijk.stijl_kop': 'Style',
  'uiterlijk.stijl_uitleg': 'A and B are flat, C is colourful with a gradient. B is the default.',
  'uiterlijk.stijl_a': 'A: flat, teal',
  'uiterlijk.stijl_b': 'B: flat, gold',
  'uiterlijk.stijl_c': 'C: colourful with gradient',
  'uiterlijk.variant_kop': 'Colour variant',
  'uiterlijk.variant_baai': 'Bay',
  'uiterlijk.variant_avondgloed': 'Afterglow',
  'uiterlijk.variant_bosrand': 'Forest edge',
  'uiterlijk.variant_pruim': 'Plum',
  'uiterlijk.variant_koraal': 'Coral',
  'uiterlijk.weergave_kop': 'Mode',
  'uiterlijk.weergave_uitleg': 'If you pick System, the app follows your device setting, including when it switches in the evening.',
  'uiterlijk.weergave_donker': 'Dark',
  'uiterlijk.weergave_licht': 'Light',
  'uiterlijk.weergave_systeem': 'System',
  'uiterlijk.dichtheid_uitleg': 'For now this works on this screen; other screens will follow.',
  'uiterlijk.dichtheid_kop': 'Density',
  'uiterlijk.dichtheid_ruim': 'Roomy',
  'uiterlijk.dichtheid_compact': 'Compact',
  'uiterlijk.emoji_kop': 'Emoji on achievements',
  'uiterlijk.emoji_uitleg': 'Applies only to the emoji on achievement cards, which come later. Emoji you type yourself always stay.',
  'uiterlijk.emoji_aan': 'On',
  'uiterlijk.emoji_uit': 'Off',
  'uiterlijk.voorvertoning_label': 'Preview of your appearance',
  'uiterlijk.voorvertoning_kop': 'This is how it looks',
  'uiterlijk.voorvertoning_gehaald': 'Done',
  'uiterlijk.voorvertoning_bezig': 'In progress',
  'uiterlijk.voorvertoning_knop': 'Finish weekly goal',
  'uiterlijk.voorvertoning_stijl': 'Appearance: {naam}',
  'uiterlijk.privacy': 'Your appearance belongs to your account.',
  'uiterlijk.alleen_lokaal': 'Your choice is saved on this device and not yet on your account. It is reconciled the next time the app starts.',
  'statistiek.titel': 'Your statistics',
  'prestaties.titel': 'Your achievements',
  'prestaties.ingang_titel': 'Your achievements',
  'prestaties.ingang_uitleg': 'Your level, your XP and everything you have earned. Only you can see this.',
  'prestaties.ingang_knop': 'View achievements',
  'prestaties.niveau': 'Level {niveau}',
  'prestaties.niveau_nul': 'No level yet',
  'prestaties.xp_laden': 'Loading your level.',
  'prestaties.xp_niet_beschikbaar': 'Your level cannot be shown right now. Your achievements below are still there.',
  'prestaties.xp_voortgang': 'Level {niveau}: {xp} XP, the next level starts at {volgende} XP.',
  'prestaties.xp_hoogste': 'Level {niveau}: {xp} XP. This is the highest level.',
  'prestaties.xp_begin': '{xp} XP. Your first level starts at {volgende} XP.',
  'prestaties.categorie_eerste_stappen': 'First steps',
  'prestaties.categorie_reeksen': 'Streaks',
  'prestaties.zeldzaamheid_gewoon': 'Common',
  'prestaties.zeldzaamheid_ongewoon': 'Uncommon',
  'prestaties.zeldzaamheid_zeldzaam': 'Rare',
  'prestaties.zeldzaamheid_xp': '{zeldzaamheid}, worth {xp} XP',
  'prestaties.behaald_op': 'Earned on {datum}',
  'prestaties.nog_te_behalen': 'Still to earn',
  'prestaties.rij_label': '{naam}. {zeldzaamheid}, {xp} XP. {status}.',
  'prestaties.leeg_titel': 'No achievements yet',
  'prestaties.leeg_tekst': 'Your achievements will show up here. The ones marked "Still to earn" are what you can still earn; your first comes sooner than you think.',
  'prestaties.privacy': 'Only you can see your achievements, level and XP, except an achievement you share yourself. What you earned stays.',
  'prestaties.deel_knop': 'Share with a group',
  'prestaties.deel_knop_label': '{naam}: share with a group',
  'prestaties.deel_uitleg': 'Pick one group. Everyone in that group will then see in the chat that you have this achievement: only its name, no XP or level. You can share each achievement once per group, and only a limited number a day. A shared message cannot be taken back.',
  'prestaties.deel_groep': 'Share with {groep}',
  'prestaties.deel_geen_groep': 'You are not in a group to share with yet.',
  'prestaties.deel_geen_groep_uitleg': 'Create or join a group in the Groups tab first. Then you can share here.',
  'prestaties.deel_groep_label': '{naam}: share with {groep}',
  'prestaties.deel_sluiten': 'Close',
  'prestaties.deel_gelukt': 'Shared with {groep}.',
  'prestaties.deel_al': 'You already shared this achievement in {groep}.',
  'prestaties.deel_limiet': 'You have reached today’s maximum of shared achievements. Tomorrow you can share more.',
  'prestaties.deel_team_uit': 'You cannot share achievements in this group.',
  'prestaties.deel_niet_mogelijk': 'Sharing did not work: you are no longer a member of this group.',
  'prestaties.deel_niet_deelbaar': 'You cannot share this achievement.',
  'prestaties.deel_niet_behaald': 'Sharing did not work: this achievement is not on your account yet. Reload the screen.',
  'prestaties.deel_log_in': 'You are signed out. Sign in again and try once more.',
  'prestaties.deel_fout': 'Sharing did not work. Please try again in a moment.',
  'statistiek.ingang_titel': 'Your statistics',
  'statistiek.ingang_uitleg': 'Your weeks and the time of day you submit.',
  'statistiek.ingang_knop': 'View statistics',
  'statistiek.periode_kop': 'Period',
  'statistiek.periode_30': '30 days',
  'statistiek.periode_90': '90 days',
  'statistiek.periode_jaar': 'A year',
  'statistiek.periode_alles': 'All time',
  'statistiek.weken_kop': 'Your weeks',
  'statistiek.weken_uitleg': 'One mark per week, following your week start. A filled block is a week in which you submitted something; a small open circle is a week without a submission.',
  'statistiek.week': 'Week of {datum}: {staat}',
  'statistiek.week_huidig': 'This week, from {datum}: {staat}',
  'statistiek.week_actief': 'something submitted',
  'statistiek.week_rustig': 'quiet',
  'statistiek.week_loopt': 'This week, from {datum}: still running',
  'statistiek.legenda_actief': 'Filled block: a week with a submission. A thick border is the current week.',
  'statistiek.legenda_rustig': 'Small open circle: a quiet week.',
  'statistiek.tijdstip_kop': 'When you submit',
  'statistiek.tijdstip_uitleg': 'How many completions you submitted in which part of the day, in your time zone. Night is 0-6, morning 6-12, afternoon 12-18 and evening 18-24.',
  'statistiek.dagdeel_nacht': 'Night',
  'statistiek.dagdeel_ochtend': 'Morning',
  'statistiek.dagdeel_middag': 'Afternoon',
  'statistiek.dagdeel_avond': 'Evening',
  'statistiek.dagdeel_regel': '{naam}: submitted {aantal} times',
  'statistiek.leeg_titel': 'Nothing in this period yet',
  'statistiek.leeg_tekst': 'Pick a longer period to see earlier weeks. Once you submit a weekly goal, your weeks and your time of day appear here.',
  'statistiek.leeg_actie': 'Go to Today',
  'statistiek.afgekapt': 'These are your most recent completions; older ones are not included.',
  'statistiek.privacy': 'This page shows only your own weeks, with no comparison to others.',
  'statistiek.laden_mislukt': 'Your statistics could not be loaded.',
  'profiel.titel': 'Profile',
  'instellingen.titel': 'Settings',
  'instellingen.lijst_label': 'Settings sections',
  'instellingen.account_titel': 'Account',
  'instellingen.account_uitleg': 'Your name, profile photo and deleting your account.',
  'instellingen.voorkeuren_titel': 'Language and time',
  'instellingen.voorkeuren_uitleg': 'Language, start of your week, time zone and celebratory moments.',
  'instellingen.meldingen_uitleg': 'What you hear about, when and how often.',
  'instellingen.privacy_titel': 'Privacy and groups',
  'instellingen.privacy_uitleg': 'Whether you can be found, your contribution to buddies and who you blocked.',
  'instellingen.uiterlijk_titel': 'Appearance',
  'instellingen.uiterlijk_uitleg': 'Style, colour, mode and density.',
  'instellingen.ingang_titel': 'Settings',
  'instellingen.ingang_uitleg': 'Account, language and time, notifications, privacy and appearance.',
  'instellingen.ingang_knop': 'Open settings',
  'profiel.leeg_titel': 'No profile found',
  'profiel.leeg_tekst': 'That should not be possible. Sign out and back in; if it keeps failing, it is on us.',
  'profiel.eigen_doel': 'Working on a goal of their own',
  'profiel.als_buddy': 'Taking part as a buddy',
  'profiel.reeks_titel': 'Your streak',
  'profiel.reeks_uitleg': 'Your streak counts weeks and appears per goal under “Your standing” on Today. A week pass protects your streak if you miss a week. Not the point, because otherwise the score means nothing.',
  'profiel.verwijder_titel': 'Delete account',
  'profiel.verwijder_uitleg': 'Your goals, weeks, Daily Moves, points and memberships disappear. What stays are the approvals you gave your buddies and your messages in the group chat, without your name on them. Those are theirs.',
  'profiel.verwijder_knop': 'I want to delete my account',
  'profiel.zeker_weten': 'Are you sure?',
  'profiel.geen_backup': 'This cannot be undone. There is no backup and no recovery period.',
  'profiel.typ_woord': 'Type {woord} to confirm',
  'profiel.definitief': 'Delete permanently',
  'profiel.toch_niet': 'Never mind',
  'profiel.weekstart_uitleg': 'The new day applies immediately. Weekly goals you still have to do move along to your new week; submitted and completed weeks stay where they are. Your points and streak do not change.',
  'profiel.herinnering_titel': 'Daily reminder',
  'profiel.herinnering_uitleg': 'One quiet nudge a day, and only if you have not done anything yet. Wrote a Daily Move today or closed a week? Then it stays silent.',
  'profiel.herinnering_label': 'Reminder',
  'profiel.herinnering_hoe_laat': 'What time',
  'profiel.herinnering_om': 'Currently set to {tijd}.',
  'profiel.herinnering_hoe_laat_hint': 'In your own time zone, on a 24-hour clock. For example 20:00.',
  'profiel.herinnering_toon': 'Tone',
  'profiel.herinnering_toon_hint': 'Firm is more direct, never accusing. The app does not hold anything against you.',
  'profiel.herinnering_zacht': 'Gentle',
  'profiel.herinnering_streng': 'Firm',
  'profiel.herinnering_uit_blijft_uit': 'Off means off. Turn it back on later and you pick a time again. It does not return on its own.',
  'profiel.herinnering_bewaren': 'Save reminder',
  'profiel.herinnering_bewaard': 'Saved.',
  'profiel.herinnering_geen_meldingen': 'Turn notifications on above, otherwise nothing gets delivered.',
  'profiel.viering_titel': 'Celebratory moments',
  'profiel.viering_uitleg': 'A short congratulation when a buddy confirms your week, you reach a milestone or your goal is done. Otherwise the app stays quiet.',
  'vindbaar.titel': 'Findable outside your groups',
  'vindbaar.uitleg': 'With this on, people who are signed in can find you by your name. They see your name and your profile photo.',
  'vindbaar.label': 'Findable',
  'vindbaar.wat_niet': 'Everything else stays closed: nobody outside your groups sees your goals, your streak, your points, your groups or your weeks.',
  'vindbaar.terugdraaien': 'This is off by default and you can always switch it back.',
  'mensen.titel': 'Find people',
  'mensen.zoeken_mislukt': 'The search did not work. Try again in a moment.',
  'mensen.veld': 'Name',
  'mensen.begin': 'Type a name to look for someone who has made themselves findable.',
  'mensen.te_kort': 'Type at least {aantal} characters.',
  'mensen.niets_gevonden': 'Nobody with that name has made themselves findable.',
  'mensen.meer': 'Load more',
  'mensen.uitleg': 'You search the start of the name. You only see people who switched this on themselves.',
  'meldingsoort.titel': 'Which notifications do you want?',
  'meldingsoort.uitleg':
    'The daily reminder is switched on or off above. These four are separate.',
  'meldingsoort.approval_request': 'A buddy is waiting on your review',
  'meldingsoort.approval_received': 'Someone approved your week',
  'meldingsoort.cycle_summary': 'Your week in review',
  'meldingsoort.commitment_witness': "A stake you're a witness to",
  'meldingsoort.getuige_uitleg':
    "You'll still see the stake under Witness statements; you just won't be notified.",
  'stilteuren.titel': 'Quiet hours',
  'stilteuren.uitleg':
    "You get no notifications in this window. Anything that arrives during the quiet " +
    'hours still comes through afterwards.',
  'stilteuren.label': 'Quiet hours',
  'stilteuren.van': 'From',
  'stilteuren.tot': 'Until',
  'stilteuren.herinnering_verschoven':
    'Your {oud} reminder falls inside your quiet hours, so it arrives at {nieuw}.',
  'profiel.aan': 'On',
  'profiel.uit': 'Off',
  'profiel.viering_beweging': 'If your device asks for reduced motion, the app leaves out the animation anyway. The text simply stays.',
  'profiel.bijdrage_titel': 'Buddy contribution',
  'profiel.bijdrage_mislukt': 'Cannot fetch that right now. Your contribution is still there, it just cannot be counted.',
  'profiel.bijdrage_onbekend': 'Not known yet.',
  'profiel.bijdrage_geen': 'You have not reviewed a buddy’s week yet.',
  'profiel.bijdrage_een': 'You have reviewed one week of a buddy.',
  'profiel.bijdrage_meer': 'You have reviewed {n} weeks of buddies.',
  'profiel.bijdrage_uitleg': 'Reviewing counts. Asking a question is worth just as much as approving. It is about being involved, not about saying yes.',
  'profiel.meldingen': 'Notifications',
  'profiel.meldingen_aanzetten': 'Turn on notifications',
  'profiel.meldingen_uitzetten': 'Turn off notifications',
  'profiel.meldingen_uit_gelukt': 'Notifications are off on this device.',
  'profiel.meldingen_uit_mislukt': 'Turning them off did not work. Try again in a moment.',
  'profiel.meldingen_mislukt': 'Turning it on did not work. Please try again in a moment.',
  'push.geen_websleutels': 'Your browser did not pass on a complete subscription. Turn notifications on again.',
  'push.te_veel_tokens': 'You have registered too many devices today. Try again tomorrow.',
  'push.niet_ingelogd': 'You are no longer signed in. Sign in again and try once more.',
  'push.apparaat_niet_bruikbaar': 'This device could not be registered for notifications. Try again or use another device.',
  'profiel.meldingen_aan': 'Notifications are on. You get a message when a buddy approves your week or when your wrap-up is ready.',
  'profiel.meldingen_uit': 'Get a message when a buddy approves your week or when your wrap-up is ready. We ask your browser for permission once.',
  'profiel.meldingen_geweigerd': 'You refused notifications earlier. That can only be undone in your browser settings; we cannot ask again.',
  'profiel.meldingen_niet_ondersteund': 'This browser cannot receive notifications.',
  'profiel.meldingen_geen_sleutel': 'Notifications are not ready in this environment yet. This is not on you.',
  'profiel.beginscherm_ios': 'On iPhone and iPad, notifications only work when the app is on your home screen. Tap Share and choose Add to Home Screen; then open it from there.',
  'profiel.beginscherm_safari': 'On iPhone and iPad, notifications only work from Safari. Open goalbuddies.q-projects.tech in Safari and add it to your home screen there.',
  'vandaag.titel': 'Today',
  'vandaag.eyebrow_week': 'WEEK OF {datum}',
  'vandaag.eyebrow_deze': 'THIS WEEK',
  'vandaag.coulance_titel': 'Your previous week is still running',
  'vandaag.coulance_tekst': 'Your new week has started, but you can still wrap up the week of {datum}. That window lasts twelve hours: done on Sunday evening, logged on Monday morning.',
  'vandaag.leeg_titel': 'No weekly goals yet',
  'vandaag.leeg_tekst': 'A weekly goal is what you want to finish this week. Give it a floor, the version you still manage on your worst week, and a ceiling. Reaching the floor counts: your streak continues. You create it on the goal it belongs to.',
  'vandaag.weekdoel_toevoegen': 'Add weekly goal',
  'vandaag.toevoegen_uitleg': 'You create a weekly goal on the goal it belongs to.',
  'vandaag.stand': 'Your standing',
  'vandaag.stand_leeg': 'As soon as your first week is approved, your streak and your points appear here.',
  'vandaag.openstaand': 'Still open from earlier weeks',
  'vandaag.meenemen_uitleg': 'You can carry these into the week that is running now. The week itself stays missed: carrying moves the work, it does not restore your streak.',
  'vandaag.antwoord_opnieuw': 'Answer and submit again',
  'vandaag.niveau_label': 'What did you reach?',
  'vandaag.niveau_hint': 'Reaching the floor counts. Your streak continues; only the points differ.',
  'vandaag.vloer': 'The floor',
  'vandaag.plafond': 'The ceiling',
  'vandaag.notitie_label': 'What did you do?',
  'vandaag.notitie_optioneel': 'May stay empty in this group. One sentence does give your buddy something to respond to.',
  'vandaag.notitie_verplicht': 'Your group asks for this. One sentence is enough.',
  'vandaag.opnieuw_indienen': 'Submit again',
  'vandaag.indienen': 'Submit',
  'vandaag.annuleren': 'Cancel',
  'vandaag.afronden': 'Complete',
  'vandaag.week_afsluiten': 'Close this week',
  'vandaag.weggooien': 'Discard',
  'vandaag.weggooien_label': 'Discard weekly goal {titel}',
  'dagzet.titel': 'The Daily Move',
  'dagzet.uitleg': 'One line about what you did today. Ten seconds, no points, nobody has to approve it.',
  'dagzet.vandaag': 'Today',
  'dagzet.voorbeeld': 'Worked two hours on chapter 3',
  'dagzet.zichtbaarheid': 'Visibility',
  'dagzet.zichtbaarheid_hint': 'Only for yourself by default.',
  'dagzet.alleen_ik': 'Only me',
  'dagzet.deel_groep': 'Share with my group',
  'dagzet.vastleggen': 'Record',
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
    'Add your question. Without one your buddy does not know what to add.',
  'beoordeling.al_beoordeeld': 'You have already reviewed this week for your buddy.',
  'beoordeling.mislukt': 'Reviewing did not work. Refresh the list and try again.',
  'beoordeling.bijdrage_laden': 'Your buddy contribution could not be loaded.',

  'opnieuw.geen_niveau': 'Choose whether you reached the floor or the ceiling.',
  'opnieuw.niet_van_jou': 'This weekly goal is not yours.',
  'opnieuw.al_goedgekeurd': 'This week is already approved. There is nothing left to replace.',
  'opnieuw.niets_ingediend': 'Nothing has been submitted for this week yet.',
  'opnieuw.notitie_vereist': 'This group asks for a short note when you submit.',
  'opnieuw.bewijs_vereist': 'This group asks for a photo as proof. Send one along.',
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
  'validatie.reactie_lang': 'Keep it short: at most 1000 characters.',

  'coach.bewaard': 'Saved',
  'coach.bewaren': 'Save answers',
  'coach.alle_overnemen': 'Take all {aantal}',
  'avatar.kop': 'Profile picture',
  'avatar.uitleg': 'Your buddies see it next to your name. Without one, your initials show.',
  'avatar.kiezen': 'Choose a photo',
  'avatar.vervangen': 'Choose another photo',
  'avatar.verwijderen': 'Remove photo',
  'avatar.bezig': 'Uploading',
  'avatar.type_niet_toegestaan': 'Choose a JPG, PNG or WebP.',
  'avatar.te_groot': 'That photo is larger than 2 MB. Choose a smaller one.',
  'avatar.rem_bereikt': 'You have changed your photo enough times today. Tomorrow you can again.',
  'avatar.uploaden_mislukt': 'The photo could not be saved. Please try again.',
  'avatar.verwijderen_mislukt': 'The photo could not be removed. Please try again.',
  'avatar.geen_toegang': 'Without access to your photos the app cannot pick one.',
  'avatar.grens': 'JPG, PNG or WebP, up to {mb} MB. Only your buddies see it.',
  'coach.woord_kop': 'The Goal Coach',
  'coach.woord.at_risk':
    'There is still room. Reach the floor of your weekly goal and the week still counts.',
  'coach.woord.behind':
    'A weaker week says nothing about the weeks after it. Reaching the floor keeps your streak going, and taking a breather is fine too.',
  'coach.woord.unreachable':
    'This is a moment to adjust your target date, not to stop. What you have done so far stays.',
  'coach.titel': 'The Goal Coach',
  'coach.vastgelopen': 'The Goal Coach got stuck.',
  // A goal from one sentence — QS8-201.
  'plan.titel': 'What do you want to achieve?',
  'plan.eyebrow': 'New goal',
  'plan.wat': 'Say it in one sentence',
  'plan.wat_hint': 'Just in your own words. The coach turns it into a plan.',
  'plan.wat_voorbeeld': 'Lose 20 kg before summer',
  'plan.wanneer': 'When do you want to have it done?',
  'plan.wanneer_hint': 'A date. You can still move it later.',
  'plan.maak': 'Make my plan',
  'plan.annuleren': 'Cancel',
  'plan.geen_plan': 'The coach could not work with that sentence. Try saying it a bit more concretely.',
  'plan.terugval_uitleg': 'You can also fill in your goal yourself. What you typed above comes along.',
  'plan.zelf_invullen': 'Fill it in myself',

  // ⚠️ See nl.ts: the invite step at the end of the goal route (QS8-229).
  'samen.titel': 'Who is doing this with you?',
  'samen.eyebrow': 'Your goal is set',
  'samen.uitleg': 'A goal someone else knows about is a goal you keep. Link it to a group, or skip. You can always do it later.',
  'samen.leeg_titel': 'You do not have a group yet',
  'samen.leeg_tekst': 'Create one and send the link to whoever you want along. Or skip: the app works fine on your own.',
  'samen.nieuwe_groep': 'Create a group',
  'samen.overslaan': 'Not right now',
  'samen.klaar': 'Done',
  'samen.gekoppeld': 'Shared with {naam}',
  'samen.gekoppeld_tekst': 'Send the invite link to whoever you want along. Whoever opens it lands in this group.',
  'samen.deel': 'Share invite link',
  'samen.link_gesloten': 'This group\'s invite link is closed. You can reopen it in group settings.',
  'samen.groep_weg_titel': 'This group is gone',
  'samen.groep_weg_tekst': 'Your goal is still there. Link it to another group from the goal itself.',
  'plan.haalbaarheid': 'Honestly',
  'plan.stappen': 'Your steps',
  'plan.stap_regel': '{nummer}. {titel} {datum}',
  'plan.geen_stappen': 'The coach did not suggest any steps. You can add them yourself.',
  'plan.deze_week': 'This week',
  'plan.geen_weekdoel': 'No weekly goal yet. You will pick what you do this week.',
  'plan.vloer': 'Floor',
  'plan.plafond': 'Ceiling',
  'plan.goed_zo': 'That looks right',
  'plan.anders': 'I want something else',
  'coach.plan_zonder_mijlpalen':
    'Your goal is saved, but the steps are not. Add them yourself, or let the coach try again.',
  'coach.plan_zonder_weekdoel':
    'Your goal and steps are saved. Only the weekly goal is missing. Pick what you will do this week.',
  'coach.daglimiet': 'The Goal Coach has done enough for you today. It resets tomorrow. In the meantime you can add milestones yourself.',
  'coach.eyebrow': 'SIX QUESTIONS',
  'coach.zes_vragen': 'Six questions, and you may skip every one of them. The more you fill in, the better the milestones fit you, but skipping works fine.',
  'coach.alleen_voor_jou': 'Your answers are only for you and the Goal Coach. Your group never sees them.',
  'coach.bewaren_niet_nodig': 'Saving is not needed to continue; the Goal Coach uses what is here.',
  'wachten.denkt_na': 'The Goal Coach is thinking',
  'wachten.duurt_even': 'This takes about twenty seconds.',
  'wachten.duurt_langer': 'This is taking longer than usual. It is still working.',
  'wachten.label': 'Goal Coach progress',
  'wachten.seconden': '{n} seconds in',
  'wachten.stap_lezen': 'Reading your goal',
  'wachten.stap_bedenken': 'Working out the steps',
  'wachten.stap_nalopen': 'Checking the plan',
  'wachten.stap_zin_lezen': 'Reading your sentence',
  'wachten.stap_doel_bedenken': 'Turning it into a goal',
  'wachten.stap_week_lezen': 'Reading your milestone',
  'wachten.stap_week_bedenken': 'Working out weekly steps',
  'wachten.stap_week_nalopen': 'Checking floor and ceiling',
  'wachten.liever_zelf': 'I would rather do it myself',
  'wachten.liever_zelf_uitleg': 'Leaving does not stop the Goal Coach. It finishes its work, and when you press generate again the answer is there without costing you another turn.',
  'coach.lukte_niet': 'That did not work',
  'coach.zelf_toevoegen': 'Add milestones yourself',
  'coach.opnieuw': 'Try again',
  'coach.bedenking': 'The Goal Coach has a reservation',
  'coach.bedenking_uitleg': 'You can simply take the milestones. Moving your target date or making your goal smaller can be done afterwards on the goal screen.',
  'coach.neem_over': 'Take them over and adjust them afterwards however you like: deleting, rewriting and reordering can all be done on the goal screen.',
  'coach.toch_niet': 'Never mind',
  'coach.al_mijlpalen': 'You already have milestones on this goal. Taking these over adds them and does not replace them. Delete what you do not want to keep first.',
  'coach.geen_overgenomen':
    'No milestone was created. {melding} Try again in a moment, or add them yourself on the goal screen.',
  'coach.deels_overgenomen':
    'The first {gelukt} of the {totaal} milestones are there; the rest were not created. {melding} Close this window to see what is there and add the rest yourself.',
  'coach.laten_voorstellen': 'Have milestones suggested',
  'coach.wat_hij_doet': 'The Goal Coach cuts your goal into milestones with target dates, based on what you filled in above. You can change everything afterwards.',
  'coach.tien_per_dag': 'You can do this ten times a day. The same question within a day does not cost a new turn.',
  'coach.genereer': 'Generate milestones',
  'coach.starten_mislukt': 'The Goal Coach could not be started.',
  'coach.niet_jouw_doel': 'This goal is not yours.',
  'coach.invoer_te_groot':
    'Your request is too long for the Goal Coach. Shorten your description or answers and try again.',
  'coach.niet_ingelogd': 'You are no longer signed in.',
  'coach.afronden_mislukt': 'The Goal Coach could not finish the request.',

  'groep.rate_limited':
    'You have tried an invitation too often today. In 24 hours it works again; ' +
    'meanwhile, ask your buddy to send the link once more.',
  'groep.ongeldige_link':
    'This invitation link no longer works. It was withdrawn or it is wrong; ' +
    'ask your buddy for a new one.',
  'groep.vol': 'This group is full. Three to five people works best, so that is no disaster.',
  'groep.te_veel_groepen': 'You are already in ten groups. Leave one to make room.',
  'groep.naam_kort': 'Give your group a name of at least two characters.',
  'groep.naam_lang': 'That name is too long. At most 60 characters.',
  'groep.naam_ongeldig': 'That name contains characters that will not work. Try it without invisible or formatting characters.',
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
  'groep.uitnodiging_te_druk':
    'This invitation has been opened too often in the past hour. Try again shortly; the link is still valid.',
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
  'validatie.groepsnaam_link': 'A group name is not a web address. Leave out the link or domain.',
  'validatie.weekdag_kort': 'Choose a day of the week.',
  'validatie.uitnodigingscode': 'This invitation code is not right. Check the link.',

  'bewijseis.note_required': 'Note required',
  'bewijseis.note_and_attachment': 'Note and photo',
  'bewijseis.optional': 'Everything optional',
  'goedkeuringsregel.any': 'One buddy',
  'goedkeuringsregel.majority': 'A majority',
  'goedkeuringsregel.quorum': 'A fixed number',
  'goedkeuringsregel.any_uitleg':
    'As soon as one buddy confirms your week, it counts. Fast, and enough for a ' +
    'group that trusts each other.',
  'goedkeuringsregel.majority_uitleg':
    'More than half of your buddies have to confirm your week. The number moves ' +
    'along as the group grows or shrinks.',
  'goedkeuringsregel.quorum_uitleg':
    'You pick how many buddies have to confirm a week. If there are fewer people ' +
    'than that for a while, everyone present counts.',
  'badge.kop': 'What you have done so far',
  'badge.nog_geen': 'Your first milestones will show up here. The first one comes sooner than you think.',
  'badge.laden_mislukt': 'Your badges could not be loaded.',
  'badge.first_goal': 'First goal done',
  'badge.first_goal_uitleg': 'You finished your first goal all the way.',
  'badge.first_milestone': 'First milestone',
  'badge.first_milestone_uitleg': 'You reached your first milestone inside a goal.',
  'badge.first_review': 'First confirmation',
  'badge.first_review_uitleg': "You confirmed a buddy's week for the first time.",
  'badge.streak_4': 'Four weeks in a row',
  'badge.streak_4_uitleg': 'You kept it up for four cycles in a row.',
  'badge.streak_12': 'Twelve weeks in a row',
  'badge.streak_12_uitleg': 'You kept it up for twelve cycles in a row: a whole quarter.',
  'badge.blijven_staan': 'What you earned stays. Also when a streak breaks once.',
  'seizoen.kop': 'How long is a season?',
  'seizoen.monthly': 'A month',
  'seizoen.quarterly': 'A quarter',
  'seizoen.uitleg':
    'At the end of a season one message goes into the group with what you did ' +
    'together. With weekly cycles a quarter gives a fairer picture than a month: ' +
    'that is only four data points.',
  'goedkeuringsregel.kop': 'When does a week count?',
  'goedkeuringsregel.quorum_veld': 'How many confirmations?',
  'goedkeuringsregel.quorum_hint': 'Between {min} and {max}.',
  'goedkeuringsregel.niet_terugwerkend':
    'What you pick here applies from the next week someone submits. Weeks already ' +
    'waiting for a confirmation keep the rule from back then.',
  'goedkeuringsregel.stand': '{gedaan} of {nodig} confirmations',
  'goedkeuringsregel.nog_een': 'One more confirmation is needed.',
  'goedkeuringsregel.nog_meer': '{aantal} more confirmations are needed.',
  'validatie.quorum_bereik': 'Pick a number between {min} and {max}.',
  'validatie.quorum_ontbreekt': 'Pick how many confirmations are needed.',
  'validatie.quorum_overbodig': 'A number only belongs with a fixed number of confirmations.',

  'chat.titel': 'Group chat',
  'chat.eyebrow': 'GROUP CHAT',
  'chat.geen_lid_titel': 'This group is not here, or not for you',
  'chat.geen_lid_tekst': 'You are not a member of this group, or it no longer exists. Ask for a new invite link if you belong here.',
  'chat.ouder_laden': 'Load older',
  'chat.nog_niets': 'No messages yet. One line is enough. “What are you doing this week?” works better than a long introduction.',
  'chat.terug': 'Back to the group',
  'chat.sessie_laadt': 'Your session is still loading. Try again in a second.',
  'chat.invoer_label': 'New message',
  'chat.invoer_hint': 'Say something to your group',
  'chat.versturen': 'Send',
  'chat.laden_mislukt': 'The messages could not be loaded.',
  'chat.controleer': 'Check your message.',
  'chat.leeg': 'There is nothing in your message yet.',

  // ⚠️ See nl.ts: photos in the chat (QS8-71).
  'chatfoto.knop': 'Add a photo',
  'chatfoto.gekozen': 'Photo ready to send',
  'chatfoto.weghalen': 'Remove photo',
  'chatfoto.type_niet_toegestaan': 'Pick a JPG, PNG or WebP.',
  'chatfoto.te_groot': 'This photo is larger than 1 MB. Pick a smaller one, or shrink it.',
  'chatfoto.rem_bereikt': 'Enough photos have been posted in this group today. Tomorrow you can again.',
  'chatfoto.uploaden_mislukt': 'Sending the photo did not work. Try again in a moment.',
  'chatfoto.kiezen_mislukt': 'The photo picker did not open.',
  'chatfoto.niet_beschikbaar': 'This photo is gone. Shared files are kept for {dagen} days.',
  'bijlage.bewaartermijn': 'Shared files stay on the server for {dagen} days and are removed after that.',
  'chatfoto.laden': 'Loading photo',
  'chatfoto.beeld': 'Photo in this conversation',

  // Documenten in de chat — QS8-72. Eigen sleutels en geen hergebruik van
  // `chatfoto.*`: een document opent buiten de app, en dat hoort de zin te zeggen.
  'chatdoc.knop': 'Add a document',
  'chatdoc.gekozen': 'Document ready to send',
  'chatdoc.weghalen': 'Remove document',
  'chatdoc.type_niet_toegestaan': 'Pick a PDF.',
  'chatdoc.te_groot': 'This document is larger than 5 MB. Pick a smaller file.',
  'chatdoc.naam_leeg': 'This file has no usable name.',
  'chatdoc.uploaden_mislukt': 'Sending the document did not work. Try again in a moment.',
  'chatdoc.rem_bereikt': 'Enough documents have been shared in this group today. Tomorrow you can again.',
  'chatdoc.kiezen_mislukt': 'The file picker did not open.',
  'chatdoc.niet_beschikbaar': 'This document is gone. Shared files are kept for {dagen} days.',
  'chatdoc.openen': 'Open',
  'chatdoc.openen_label': 'Open {naam}, PDF, in another app',
  'chatdoc.openen_mislukt': 'Opening the document did not work.',
  'chatdoc.laden': 'Opening document',
  'chatdoc.soort_pdf': 'PDF',

  // Bewijs bij een voltooiing — QS8-391. Eigen sleutels en geen hergebruik van
  // `chatfoto.*`: "deze foto is niet meer beschikbaar" leest in een gesprek
  // anders dan bij een beoordeling.
  'bewijsfoto.knop': 'Photo as proof',
  'bewijsfoto.gekozen': 'Proof ready to send',
  'bewijsfoto.weghalen': 'Remove photo',
  'bewijsfoto.type_niet_toegestaan': 'Pick a JPG, PNG or WebP.',
  'bewijsfoto.te_groot': 'This photo is larger than 1 MB. Pick a smaller one, or shrink it.',
  'bewijsfoto.uploaden_mislukt': 'Sending the photo did not work. Try again in a moment.',
  'bewijsfoto.rem_bereikt': 'You have sent enough photos today. Tomorrow you can again.',
  'bewijsfoto.kiezen_mislukt': 'The photo picker did not open.',
  'bewijsfoto.niet_beschikbaar': 'This proof is no longer available.',
  'bewijsfoto.laden': 'Loading proof',
  'bewijsfoto.beeld': 'Photo as proof for this completion',
  'bewijsfoto.vereist': 'This group asks for a photo as proof when you finish.',
  'chat.versturen_mislukt': 'Your message was not sent. Please try again in a moment.',
  'chat.rem_bereikt':
    'You have posted the maximum number of messages for today. You can continue again later.',
  'chat.weghalen_mislukt': 'Removing did not work. Please try again.',

  'ketting.laden_mislukt': 'The Chain could not be loaded.',

  'weekafsluiting.titel': 'The weekly wrap-up',
  'weekafsluiting.eyebrow': 'HUDDLE DAY {dag}',
  'weekafsluiting.geen_lid_titel': 'This group is not here, or not for you',
  'weekafsluiting.geen_lid_tekst': 'You are not a member of this group, or it no longer exists. Ask for a new invite link if you belong here.',
  'weekafsluiting.meer_reacties': 'Load more replies',
  'weekafsluiting.niet_gedeeld': 'You have text that has not been shared yet. Leaving throws it away.',
  'weekafsluiting.terugknop_tegengehouden':
    'Your text is still here, so the back button does nothing for now. Share it, or use the button below.',
  'weekafsluiting.toch_weg': 'Leave anyway, without sharing',
  'weekafsluiting.terug': 'Back to the group',
  'weekafsluiting.sessie_laadt': 'Your session is still loading. Try again in a second.',
  'weekafsluiting.staat_op_kaart': 'Your answers are on the card below. You can update them or take them back entirely.',
  'weekafsluiting.terugnemen_uitleg': 'Your answers disappear from the card. You cannot get that back afterwards.',
  'weekafsluiting.terugnemen_een_reactie': 'Note: this also removes the reply your group gave.',
  'weekafsluiting.terugnemen_reacties': 'Note: this also removes the {n} replies your group gave.',
  'weekafsluiting.ja_terugnemen': 'Yes, take it back',
  'weekafsluiting.toch_niet': 'Never mind',
  'weekafsluiting.bijwerken': 'Update',
  'weekafsluiting.terugnemen': 'Take back',
  'weekafsluiting.mogen_leeg': 'All three may stay empty. Whoever fills in nothing does not appear on the card; no empty line comes of it.',
  'weekafsluiting.delen': 'Share with my group',
  'weekafsluiting.toch_niet_bijwerken': 'Do not update after all',
  'weekafsluiting.nog_niemand': 'Nobody has shared anything this week yet. Whoever starts makes it easier for the rest.',
  'weekafsluiting.weghalen': 'Remove',
  'weekafsluiting.reageren_op': 'Reply to {naam}',
  'weekafsluiting.reactie_hint': 'A reply cannot be edited. Removing it can.',
  'weekafsluiting.reactie_voorbeeld': 'Good that you kept going. What would help you on Tuesday?',
  'weekafsluiting.reactie_versturen': 'Send reply',
  'weekafsluiting.je_hebt_gedeeld': 'You shared this week',
  'weekafsluiting.drie_vragen': 'Three questions',
  'weekafsluiting.v1.label': 'What did you do?',
  'weekafsluiting.v1.hint':
    'Whatever you put here, your group sees.',
  'weekafsluiting.v1.uit_dagzetten': 'Copy from my daily notes',
  'weekafsluiting.v1.uit_dagzetten_uitleg': 'Your daily notes for this week are ready. Copying puts them in the field above; you can edit them or remove them again after that.',
  'weekafsluiting.v1.voorbeeld': 'Wrote three mornings, about four hours in total.',
  'weekafsluiting.v2.label': 'What got in the way?',
  'weekafsluiting.v2.hint':
    'The only place this belongs. Your group reads along to help, not to judge.',
  'weekafsluiting.v2.voorbeeld': 'Two evenings of overtime, and after that I could not get back in.',
  'weekafsluiting.v3.label': 'What is your next week?',
  'weekafsluiting.v3.hint': 'One concrete sentence is enough.',
  'weekafsluiting.v3.voorbeeld': 'Finish chapter three, and book an extra hour on Tuesday.',

  'weekafsluiting.leeg':
    'Fill in at least one question. Skipping all three is fine too. Then nothing is saved.',
  'weekafsluiting.reactie_leeg': 'There is nothing in your reply yet.',
  'weekafsluiting.laden_mislukt': 'The week review could not be loaded.',
  'weekafsluiting.reacties_laden': 'The replies could not be loaded.',
  'weekafsluiting.invoer': 'Check what you entered.',
  'weekafsluiting.opslaan_mislukt': 'Saving did not work. Are you still a member of this group?',
  'weekafsluiting.weghalen_mislukt': 'Removing did not work. Please try again.',
  'weekafsluiting.reactie_controleer': 'Check your reply.',
  'weekafsluiting.reactie_mislukt': 'Your reply was not sent. Please try again in a moment.',
  'weekafsluiting.reactie_rem_bereikt':
    'You have posted the maximum number of replies for today. You can continue again later.',

  'doel.doelen_laden': 'Your goals could not be loaded.',
  'doel.doel_laden': 'This goal could not be loaded.',
  'doel.invoer': 'Check what you entered.',
  'doel.datum_verleden': 'Choose a target date that is still ahead.',
  'doel.opslaan_mislukt': 'Your goal could not be saved. Please try again.',
  'doel.niets_gewijzigd': 'Nothing was changed.',
  'doel.wijzigen_mislukt': 'Saving did not work. Please try again.',
  'doel.streefdatum_mislukt': 'Changing the target date did not work. Please try again.',
  'doel.actie_mislukt_kort': 'That did not work.',
  'doel.actie_mislukt': 'That did not work. Please try again.',
  'doel.niet_van_jou': 'This goal is not yours.',
  'doel.datum_ongeldig': 'Choose a valid target date.',

  'doel.groepsakkoord_nodig':
    'You share this goal with a group, so you do not move the date on your own. ' +
    'Ask your buddies to agree, with a short explanation.',
  'doel.straf_staat_open':
    'You set a penalty on this goal yourself, so you cannot push the deadline ' +
    'back. Bringing it forward is fine. If you no longer want the penalty, ' +
    'you can withdraw it.',

  'doel.recent_ontkoppeld':
    'You just unlinked this goal from a group. You can set the date yourself seven days after that.',
  'doel.afronden_mislukt': 'Completing did not work. Please try again.',
  'doel.al_afgerond': 'This goal is already completed.',
  'doel.gearchiveerd': 'This goal is archived. Bring it back first.',
  'doel.niet_ingelogd': 'You are no longer signed in.',
  'doel.een_mijlpaal_open':
    'One milestone is still open. Check it off, or drop it if it is no longer needed.',
  'doel.meer_mijlpalen_open':
    '{aantal} milestones are still open. Check them off, or drop what is no longer needed.',

  'doel.verwijderen_mislukt': 'Deleting did not work.',
  'doel.te_oud':
    'This goal has been around too long to delete. Archive it; then your history ' +
    'stays and it disappears from your list.',
  // QS8-772 (decision by Quinten, 21-11-2026).
  'doel.is_aandeel': 'You cannot throw away a share in a team goal, only unlink it.',
  'doel.gedeeld_met_groep': 'This goal is linked to a group. Unlink it first, or archive it.',
  'doel.heeft_weekdoelen':
    'Weekly goals already hang off this goal. Archive it instead of deleting it.',
  'doel.heeft_punten':
    'Points have already been booked on this goal. Archive it instead of deleting it.',
  'doel.commitment_in_werking':
    'Your reward or penalty has already come into effect. Archive this goal instead of deleting it.',
  'doel.heeft_commitment':
    'You attached a reward or penalty to this goal. That stays in your history, ' +
    'even if you withdraw it. Archive this goal instead of deleting it.',

  'doel.reeks_laden': 'Your streak could not be loaded.',
  'doel.weekpassen_laden': 'Your week passes could not be loaded.',

  'nieuwdoel.categorie_hint': 'What is this goal about? One area per goal.',

  'pictogram.vlam': 'Flame',
  'pictogram.ster': 'Star',
  'pictogram.schild': 'Shield',
  'pictogram.medaille': 'Medal',
  'pictogram.trofee': 'Trophy',
  'pictogram.ketting': 'Chain',
  'pictogram.doel': 'Goal',
  'pictogram.kroon': 'Crown',
  'pictogram.bliksem': 'Lightning bolt',
  'pictogram.hart': 'Heart',
  'pictogram.duim': 'Thumbs up',
  'pictogram.vergrendeld': '{naam}, still to earn',

  'categorie.fitness': 'Sport',
  'categorie.nutrition': 'Nutrition',
  'categorie.self_care': 'Self-care',
  'categorie.mindfulness': 'Meditation',
  'categorie.creativity': 'Creativity',
  'categorie.productivity': 'Productivity',
  'categorie.connection': 'Social',
  'categorie.skills': 'Skills',
  'categorie.building': 'Building',

  'categoriegroep.gezondheid': 'Health',
  'categoriegroep.softskills': 'Soft skills',
  'categoriegroep.ambitie': 'Ambition',

  'categorie.business': 'Work',
  'categorie.study': 'Study',
  'categorie.other': 'Other',

  'validatie.doeltitel_kort': 'Give your goal a name of at least three characters.',
  'validatie.doeltitel_lang': 'At most 200 characters.',
  'validatie.omschrijving_lang': 'At most 2000 characters.',
  'validatie.datum_vorm': 'Use an existing date like 2026-12-31.',
  'validatie.identiteit_lang': 'Keep it short: one sentence works best.',
  'validatie.uren_max': 'A week has 168 hours.',

  'lijst.taak_leeg': 'Write down what you want to do.',
  'lijst.taak_lang': 'Keep it short: at most 500 characters.',
  'lijst.patch_leeg': 'Nothing was changed.',
  'lijst.titel': 'The List',
  'lijst.veld_label': 'New task',
  'lijst.veld_hint': 'Something small you want to tick off today.',
  'lijst.veld_plaats': 'Call the dentist',
  'lijst.toevoegen': 'Add',
  'lijst.teller': '{n} of {max} characters',
  'lijst.leeg_titel': 'Your list is still empty',
  'lijst.leeg_tekst':
    'Put the things you do not want to forget here. A task does not count ' +
    'towards your points or your streak; that stays the week.',
  'lijst.prive_uitleg':
    'A task is private until you share it yourself. Nobody in your group sees ' +
    'what you do not share.',
  'lijst.van_totaal': '{aantal} of {totaal}',
  'lijst.meer_laden': 'Load more',
  'lijst.afvinken': 'Tick off',
  'lijst.ontvinken': 'Reopen',
  'lijst.omhoog': 'Move up',
  'lijst.omlaag': 'Move down',
  'lijst.verwijderen': 'Delete',
  'lijst.hernoemen': 'Edit text',
  'lijst.hernoem_label': 'Task',
  'lijst.hernoem_hint': 'Change what it says. The rest of the item stays as it is.',
  'lijst.hernoem_opslaan': 'Save',
  'lijst.hernoem_annuleer': 'Cancel',
  'lijst.afgerond_op': 'Done on {datum}',
  'lijst.laden_mislukt': 'Loading the list failed.',
  'lijst.toevoegen_mislukt': 'Adding the task failed.',
  'lijst.opslaan_mislukt': 'Saving the change failed.',
  'lijst.verwijderen_mislukt': 'Deleting the task failed.',
  'lijst.bestaat_niet': 'This task no longer exists.',
  'lijst.verzetten_gelijk':
    'These two tasks share the same spot in the list. Move another one out from ' +
    'between them first.',
  'lijst.delen_mislukt': 'Sharing failed.',
  'lijst.geen_groepsgenoot': 'You are no longer a member of that group.',
  'lijst.deel_aan': 'Shared with {groep}',
  'lijst.deel_aan_onbekend': 'Shared with a group that is no longer in your list',
  'lijst.deel_uit': 'Not shared',
  'lijst.deel_knop': 'Share',
  'lijst.deel_terug': 'Stop sharing',
  'lijst.deel_kies': 'With which group?',
  'lijst.deel_kies_eerst': 'First pick which group you share with.',
  'lijst.deel_geen_groep':
    'You are not in any group yet, so there is nobody to share anything with.',
  'lijst.deel_uitleg':
    'Only the group you pick sees what you share. The rest of your list stays ' +
    'private, and you can always undo it.',
  'lijst.invoer': 'Check what you filled in.',
  'bevestiging.taak_verwijderen.titel': 'Throw this task away?',
  'bevestiging.taak_verwijderen.uitleg':
    'The task disappears and does not come back. If you only want it out of ' +
    'sight, tick it off. Then it sinks to the bottom and stays.',
  'bevestiging.taak_verwijderen.knop': 'Throw away',
  'tab.lijst': 'List',

  'deadline.argument_kort':
    'Write one sentence about what changed. Your buddies decide on this, ' +
    'so "no time" is too little to say yes to.',
  'deadline.argument_lang': 'Keep it short: at most 1000 characters.',
  'deadline.geen_lid': 'You are not a member of this group.',
  'deadline.niet_gekoppeld': 'This goal is not linked to this group.',
  'deadline.argument_leeg': 'Write one sentence about what changed.',
  'deadline.geen_beslisser':
    'You are the only member of this group, so nobody can approve this request. ' +
    'Invite someone first, or pick a group with a buddy in it. ' +
    'If you unlink this goal, you can set the date yourself seven days later.',
  'deadline.datum_in_verleden': 'That date is in the past. Pick today or later.',
  'deadline.al_open': 'There is already a request for this goal. Wait for that one first.',
  'deadline.bestaat_niet': 'This request no longer exists.',
  'deadline.al_beslist': 'This has already been decided.',
  'deadline.niet_zelf': 'You cannot approve your own request.',
  'deadline.datum_onleesbaar':
    'We cannot read that date. Please pick it again.',
  'deadline.te_veel_verzoeken':
    'You have filed five requests today. Another one is possible tomorrow.',
  'deadline.verzoek_verlopen':
    'The requested date is now in the past. Ask the requester for a new one.',
  'deadline.niet_van_jou':
    'This request is not yours.',
  'deadline.versturen_mislukt': 'Sending your request did not work. Please try again.',
  'deadline.versturen_mislukt_kort': 'Sending your request did not work.',
  'deadline.beslissen_mislukt': 'Deciding did not work. Please try again.',
  'deadline.beslissen_mislukt_kort': 'Deciding did not work.',
  'deadline.intrekken_mislukt': 'Withdrawing did not work. Please try again.',
  'deadline.intussen_beslist': 'It has already been decided in the meantime.',
  'deadline.intrekken_mislukt_kort': 'Withdrawing did not work.',
  'deadline.lopend_laden': 'The open request could not be loaded.',
  'deadline.verzoeken_laden': 'The requests could not be loaded.',

  'adempauze.laden_mislukt': 'Your breathers could not be loaded.',
  'adempauze.inplannen_mislukt': 'The breather could not be scheduled.',
  'adempauze.overlap': 'There is already a breather over these weeks.',
  'adempauze.te_lang': 'A breather lasts at most {max} weeks.',
  'adempauze.datum_ongeldig': 'Enter a date as yyyy-mm-dd.',
  'adempauze.geen_hele_week': 'Pick a whole week, starting on your own start day.',
  'adempauze.buiten_venster': 'Pick a week within a year back or a year ahead.',
  'adempauze.eind_voor_start': 'The end date is before the start date.',
  'adempauze.annuleren_mislukt': 'Cancelling did not work.',
  'adempauze.al_begonnen': 'This breather has already started and stays.',

  'mijlpaal.toevoegen_mislukt': 'The milestone could not be added.',
  'mijlpaal.wijzigen_mislukt': 'The change could not be saved.',
  'mijlpaal.status_mislukt': 'The status could not be changed.',
  'mijlpaal.verwijderen_mislukt': 'Deleting did not work.',
  'mijlpaal.volgorde_mislukt': 'The order could not be saved.',
  'mijlpaal.lijst_veranderd': 'The list has changed in the meantime. Go back to your goal and open the promise again.',
  'validatie.mijlpaaltitel': 'Give your milestone a name.',

  'weekdoel.laden_mislukt': 'Your weekly goals could not be loaded.',
  'weekdoel.open_laden': 'Your open weeks could not be loaded.',
  'weekdoel.mijlpalen_laden': 'The milestones could not be loaded.',
  'weekdoel.opslaan_mislukt': 'Your weekly goal could not be saved.',
  'weekdoel.verwijderen_mislukt': 'Deleting did not work.',
  'weekdoel.te_oud':
    'This weekly goal has been around too long to delete. You can close it; ' +
    'then the week counts as missed.',
  'weekdoel.al_gebeurd': 'Something has already happened with this weekly goal, so deleting is no longer possible.',
  'weekdoel.al_ingediend': 'You have already submitted something for this. Deleting is no longer possible.',
  'weekdoel.afsluiten_mislukt': 'Closing did not work.',
  'weekdoel.niet_meer_open':
    'This week is no longer open. You can only close a weekly goal that nothing has happened with yet.',
  'weekdoel.doorschuiven_mislukt': 'Carrying over did not work.',
  'weekdoel.te_veel_deze_dag':
    'You have created the maximum number of weekly goals for today. You can continue again later.',
  'weekdoel.nog_niet_afgesloten':
    'Carrying over is only possible once the week is closed. That happens automatically shortly after your week ends.',
  'validatie.kies_doel': 'Choose a goal.',
  'validatie.weekdoeltitel': 'What do you want done this week?',
  'validatie.weekdoeltitel_lang': 'At most 200 characters.',
  'validatie.vloer_plafond_kort': 'Keep it short.',

  'interview.opslaan_mislukt': 'Your answers could not be saved. Please try again.',
  'validatie.uren_min': 'Less than zero hours does not exist.',

  'interview.measurable.vraag': 'How will you see that it worked?',
  'interview.measurable.toelichting': 'Something you can point at or count works better than a feeling.',
  'interview.identity.vraag': 'Who do you become if this works?',
  'interview.identity.toelichting':
    'For a goal that runs for months, identity is the fuel that lasts longest.',
  'interview.deadline_reason.vraag': 'Why that date exactly?',
  'interview.deadline_reason.toelichting': 'A date with a reason behind it is harder to move.',
  'interview.hours_per_week.vraag': 'How many hours a week do you have for this?',
  'interview.hours_per_week.toelichting': 'Estimating honestly helps more than aiming high.',
  'interview.already_done.vraag': 'What have you already done?',
  'interview.already_done.toelichting': 'You rarely start at zero, and that helps the planning.',
  'interview.stuck_before.vraag': 'Where did it get stuck before?',
  'interview.stuck_before.toelichting':
    'Visible only to you and the Goal Coach. Your group never sees this.',

  // ---------------------------------------------------------------------------
  // Creating a goal — QS8-31
  // ---------------------------------------------------------------------------
  'nieuwdoel.titel': 'New goal',
  'nieuwdoel.eyebrow': 'ONE GOAL AT A TIME',
  'nieuwdoel.wat': 'What do you want to achieve?',
  'nieuwdoel.wat_hint': 'Concrete enough that someone else can tell whether it worked.',
  'nieuwdoel.wat_voorbeeld': 'Finish my book',
  'nieuwdoel.identiteit': 'Who do you become if this works?',
  'nieuwdoel.identiteit_hint':
    'Optional, but this is the question that will still carry you four months from now.',
  'nieuwdoel.identiteit_voorbeeld': 'Someone who writes, not someone who wants to write',
  'nieuwdoel.streefdatum': 'Target date',
  'nieuwdoel.streefdatum_hint':
    'Must be in the future. You can move it later, but that gets recorded.',
  'nieuwdoel.categorie': 'Category',
  'nieuwdoel.meer_details': 'More details',
  'nieuwdoel.meer_details_uitleg':
    'Both optional. The Goal Coach uses them later to break things down better.',
  'nieuwdoel.beschrijving': 'Description',
  'nieuwdoel.beschrijving_voorbeeld': 'What is it about, and what have you done already?',
  'nieuwdoel.uren': 'Hours per week',
  'nieuwdoel.uren_hint':
    'How much time do you realistically have for this? Feeds the Risk radar later.',
  'mijlpaalbewerken.titel': 'Title',
  'mijlpaalbewerken.omschrijving': 'Description',
  'mijlpaalbewerken.streefdatum': 'Target date',
  'mijlpaalbewerken.streefdatum_hint':
    'Optional, as yyyy-mm-dd. Leaving it empty is fine; this date is yours and moves without asking anyone.',
  'mijlpaalbewerken.bewaren': 'Save',
  'mijlpaalbewerken.annuleren': 'Cancel',
  'mijlpalenblok.bewerken': 'Edit',
  'mijlpalenblok.bewerken_label': 'Edit milestone {titel}',
  'commitmentspoor.toon': 'Show the trail',
  'commitmentspoor.verberg': 'Hide the trail',
  'commitmentspoor.leeg_titel': 'No events yet',
  'commitmentspoor.leeg_tekst':
    'As soon as something happens to this commitment, it shows up here. Only you can see this.',
  'commitmentspoor.created': 'Created',
  'commitmentspoor.confirmed': 'Confirmed by you',
  'commitmentspoor.edited': 'Changed',
  'commitmentspoor.triggered': 'Became due',
  'commitmentspoor.posted': 'Shared with the group',
  'commitmentspoor.resolved': 'Settled',
  'commitmentspoor.cancelled': 'Withdrawn',
  'doelbewerken.titel': 'Edit goal',
  'doelbewerken.eyebrow': 'Your goal',
  'doelbewerken.bewaren': 'Save changes',
  'doelbewerken.annuleren': 'Back without saving',
  'doelbewerken.leeg_titel': 'This goal no longer exists',
  'doelbewerken.leeg_tekst':
    'It may have been deleted, or it belongs to someone else. Go back to your goals.',
  'doelbewerken.streefdatum_kop': 'Target date',
  'doelbewerken.streefdatum_uitleg':
    'Your target date is {datum} and does not change here. Moving a date is something you ask a buddy for; otherwise an agreement can be stretched one-sidedly. You do that on the goal itself.',
  'doelbewerken.knop': 'Edit goal',
  'nieuwdoel.aanmaken': 'Create goal',
  'nieuwdoel.annuleren': 'Cancel',

  // ---------------------------------------------------------------------------
  // The goal screen — QS8-32 and onwards
  // ---------------------------------------------------------------------------
  'doelscherm.titel': 'Goal',
  'doelscherm.leeg_titel': 'This goal does not exist',
  'doelscherm.leeg_body': 'Either it was deleted, or it is not yours. Check the link.',
  'doelscherm.streefdatum': 'Target date {datum}',
  'doelscherm.weekdoelen_afgerond': '{gedaan} of {totaal} weekly goals completed',

  'deadline.verzoek_loopt': 'Your request is pending',
  'deadline.verzoek_uitleg': 'You asked to move {oud} to {nieuw}.',
  'deadline.buddy_beslist':
    'One of your buddies decides on this. Until that happens, the date stays as it was.',
  'deadline.verzoek_intrekken': 'Withdraw request',
  'deadline.kop': 'Deadline',
  'deadline.akkoord': 'Your buddy agreed: the date is now {datum}.',
  'deadline.afgewezen': 'Your buddy felt it was too early to move it. The date has not changed.',
  'deadline.opnieuw_vragen': 'You can ask again if something has changed.',
  'deadline.gedeeld_uitleg':
    'You share this goal with your group, so you move the date together. Write down what ' +
    'has changed; a buddy decides on it.',
  'deadline.alleen_uitleg':
    'Moving it is fine. It does get recorded, so you can look back honestly later.',
  'deadline.vraag_knop': 'Ask to move it',
  'deadline.verzet_knop': 'Move deadline',
  'deadline.nieuwe_datum': 'New target date',
  'deadline.datum_label': 'Date',
  'deadline.wat_veranderd': 'What has changed?',
  'deadline.wat_veranderd_hint':
    'Your buddies in {groep} read this and decide on it. One honest sentence is enough.',
  'deadline.jouw_groep': 'your group',
  'deadline.argument_voorbeeld':
    'The project at work has run six weeks over and it is eating my evenings.',
  'deadline.nog_tekens': '{aantal} characters to go.',
  'deadline.lang_genoeg': 'Long enough.',
  'deadline.straf_wordt_zichtbaar':
    'Your group sees that this goal carries a penalty as soon as you send this request, and '+
    'keeps seeing that for as long as you share the goal with them. What the penalty says is '+
    'not shared by this request.',
  'deadline.versturen': 'Send request',
  'deadline.vastleggen': 'Save',
  'deadline.annuleren': 'Cancel',

  // ---------------------------------------------------------------------------
  // Reward and penalty on the goal screen — QS8-34, QS8-35 and QS8-85
  // ---------------------------------------------------------------------------
  'commitment.stand': '{titel}: {uitleg}',
  'commitment.geen_afrekening': 'The app settles nothing. This is only kept on record.',

  'beloning.jouw': 'Your reward',
  'beloning.vastgelegd_op': 'Recorded on {datum}.',
  'beloning.kop': 'Reward',
  'beloning.uitleg': 'What will you treat yourself to if this works? Optional, but it helps.',
  'beloning.veld': 'My reward',
  'beloning.voorbeeld': 'A weekend away without a laptop',
  'beloning.vastleggen': 'Save',

  'straf.jouw': 'Your penalty',
  'straf.intrekken': 'Withdraw',
  'straf.begunstigde.groep': 'Witness: the group {groep}',
  'straf.begunstigde.persoon': 'Witness: {naam}',
  'straf.begunstigde.groep_onzichtbaar': 'Witness: a group you are no longer a member of',
  'straf.begunstigde.persoon_onzichtbaar':
    'Witness: someone you no longer share a group with. As long as that stays so, they will not see your penalty.',
  'straf.begunstigde.fout': 'The witness could not be loaded.',
  'straf.kop': 'Penalty',
  'straf.geen_groep':
    'A penalty needs a witness: a group, or one person you share a group with. You are not ' +
    'in any group yet, so start there.',
  'straf.naar_groepen': 'To your groups',
  'straf.datum_voorbij':
    'This goal\u2019s target date has passed, so a penalty would apply straight away. Move your ' +
    'target date first if you still want to work on it.',
  'straf.zeker': 'Are you sure?',
  'straf.bevestig_uitleg':
    'If {groep} gets to see this, it is because your target date passed without your goal ' +
    'being done.',
  'straf.dan_geldt': 'Then this applies: {tekst}',
  'straf.tot_dan':
    'Until that moment nobody sees this, not even your group. You can withdraw it as long ' +
    'as it has not taken effect.',
  'straf.ja_vastleggen': 'Yes, record this',
  'straf.terug': 'Back',
  'straf.uitleg':
    'What happens if you do not make your target date? Optional, and you can withdraw it as ' +
    'long as it has not taken effect.',
  'straf.geen_geld':
    'The app settles nothing and handles no money. You record here what you agree with your ' +
    'group; carrying it out is up to you.',
  'straf.veld': 'My penalty',
  'straf.voorbeeld': 'I treat the group to dinner',
  'straf.welke_groep': 'Which group benefits?',
  'straf.wie_getuige': 'Who is the witness?',
  'straf.een_groep': 'A whole group',
  'straf.een_persoon': 'One person',
  'straf.welke_persoon': 'Who benefits?',
  'straf.kies_groep_eerst': 'First pick which group benefits.',
  'straf.kies_persoon_eerst': 'First pick who benefits.',
  'straf.persoon_uitleg':
    'Until your target date passes, this person sees nothing. After that they may read your ' +
    'penalty and get a notification about it, unless they have turned that kind off.',
  'straf.verder': 'Continue',
  'straf.jouw_groep': 'your group',
  // QS8-698, Quinten's decision of 20-11-2026: three fixed rules and one button, in the weekly-promise form.
  'straf.team.kop': 'Read this before you confirm this penalty',
  'straf.team.haal_niet_groep':
    'If you miss your target date, your colleagues in {groep} will see this agreement with your name on it.',
  'straf.team.haal_niet_persoon':
    'If you miss your target date, {naam} can read this agreement with your name on it.',
  'straf.team.gevolg': 'The consequence: {tekst}',
  'straf.team.wie_groep':
    'Your colleagues in {groep} see your name and this text. That includes colleagues who join the team later.',
  'straf.team.wie_persoon': '{naam} sees your name and this text, and nobody else.',
  'straf.team.wanneer':
    'This only becomes visible once your target date has passed and your goal is still not done. Until then nobody sees this, not {wie} either.',
  'straf.team.collegas': 'your colleagues',
  'straf.team.niet_zien':
    'Which goal it is is not in this agreement. So do not put that goal in your penalty text yourself.',
  'straf.team.intrekken':
    'You can withdraw it until your target date has passed. After that the agreement stays in place. No money is ever involved.',

  // QS8-761 — the weekly promise. See the comment in nl.ts.
  'belofte.knop': 'Make a weekly promise',
  // QS8-762 — see the comment in nl.ts.
  'belofte.verwijzing.tekst':
    'Want to attach a weekly promise to this goal, with a group or witness you choose yourself? Nothing is set until you confirm it yourself.',
  'belofte.verwijzing.link': 'Go to the weekly promise',
  'belofte.verwijzing.sluit': 'Not now',
  'belofte.titel': 'Weekly promise',
  'belofte.uitleg':
    'Promise that you will complete at least one of this goal\u2019s weekly goals this week, with a ' +
    'consequence you choose yourself if you do not. Only your witness can ever see it, and only if ' +
    'you do not keep your promise.',
  'belofte.geen_getuige_titel': 'No witness yet',
  'belofte.geen_getuige':
    'A weekly promise needs a witness: a group you are in, or one person you share such a group ' +
    'with. A group the app put together for you does not count, because you do not know those ' +
    'people yet.',
  'belofte.doel_niet_actief': 'This goal is not active, so there is nothing to promise for it this week.',
  'belofte.datum_voorbij':
    'This goal’s target date has passed. Move your target date on the goal screen first if ' +
    'you are still working on it.',
  'belofte.doelstraf': 'This goal already has a penalty. While it stands, you cannot add a weekly promise.',
  'belofte.deze_week_al': 'Your promise for this week is already set. Next week you can make a new one.',
  'belofte.veld': 'What will you do if you do not keep your promise?',
  'belofte.voorbeeld': 'I buy my group a coffee',
  'belofte.welke_groep': 'Which group is your witness?',
  'belofte.welke_persoon': 'Who is your witness?',
  'belofte.kies_soort_eerst': 'First choose whether a group or one person is your witness.',
  'belofte.kies_groep_eerst': 'First choose which group is your witness.',
  'belofte.kies_persoon_eerst': 'First choose who your witness is.',
  'belofte.bevestig_kop': 'Read this before you promise',
  'belofte.bevestig_gevolg': 'The consequence: {tekst}',
  'belofte.bevestig_periode': 'The week: from {start} up to and including {einde}. Your promise starts now.',
  'belofte.bevestig_wanneer':
    'If you miss one of this goal\u2019s weekly goals that week without a week pass, and complete ' +
    'none of them, your promise takes effect after the week ends. A week with a breather or without ' +
    'weekly goals does not count as missed.',
  'belofte.bevestig_wie':
    'Only then can {getuige} read that you did not keep your promise, with your own text. Until that moment nobody sees that there is a promise, not even ' +
    '{getuige}. If you keep your promise, nobody sees anything of it.',
  'belofte.bevestig_intrekken': 'Until that moment you can withdraw your promise. After that it stays.',
  'belofte.bevestig_punten': 'The promise costs you no extra points: a missed week counts as it always does.',
  'belofte.bevestig_startdag': 'While your promise is running, you cannot change your week start.',
  'belofte.ja': 'Yes, I promise this for this week',
  'belofte.jouw': 'Your weekly promise',
  'belofte.week': 'Week from {start} up to and including {einde}',
  'belofte.stand.set.titel': 'Running',
  'belofte.stand.set.uitleg':
    'Your promise applies to this week. After the week ends, the app checks whether you kept it.',
  'belofte.stand.due.titel': 'In effect',
  'belofte.stand.due.uitleg': 'You did not keep this promise. Your witness can read it now.',
  'belofte.stand.resolved.titel': 'Settled',
  'belofte.stand.resolved.uitleg': 'This promise has been settled.',
  'belofte.stand.cancelled.titel': 'Lapsed',
  'belofte.stand.cancelled.uitleg': 'This promise will no longer take effect.',
  'belofte.fout.laden': 'The details for your promise could not be loaded.',
  'belofte.fout.week_voorbij': 'Your week has ended in the meantime. Go back and confirm the new week.',
  'belofte.fout.startdag': 'Your week start has changed in the meantime. Refresh the screen and try again.',
  'belofte.fout.doelstraf': 'This goal already has a penalty. While it stands, you cannot add a weekly promise.',
  'belofte.fout.plafond':
    'You already have three running weekly promises. A new one can start once one has ended or been withdrawn.',
  'belofte.fout.al_deze_week': 'This goal already has a promise for this week.',
  'belofte.fout.geweigerd':
    'This promise could not be recorded. Your witness or your goal may have changed in the ' +
    'meantime: go back to your goal and open the promise again.',
  'belofte.iedereen_in': 'everyone in {groep}',
  'belofte.week_voorbij_wacht':
    'The week of this promise is over. At the next round the app checks whether you kept it; ' +
    'until then you can still withdraw it.',
  'belofte.vorige_kop': 'Your promise from a previous week',
  'straf.belofte_loopt': 'This goal has a weekly promise running. While it runs, you cannot add a penalty.',
  'belofte.niet_gevonden_titel': 'Goal not found',
  'belofte.niet_gevonden': 'This goal does not exist or is not yours.',

  // ---------------------------------------------------------------------------
  // Completing, archiving and replanning — QS8-83, QS8-32 and QS8-96
  // ---------------------------------------------------------------------------
  'afronden.afgerond': 'Completed',
  'afronden.afgerond_uitleg':
    'You completed this goal. Your groups have seen it and your reward has been released.',
  'afronden.kop': 'Complete',
  'afronden.een_open':
    'One milestone is still open. Tick it off, or drop it if you no longer need it; then ' +
    'you can complete this goal.',
  'afronden.meer_open':
    '{aantal} milestones are still open. Tick them off, or drop what you no longer need; ' +
    'then you can complete this goal.',
  'afronden.alles_af':
    'All milestones are done. Complete your goal, and your group will know and your reward ' +
    'comes free.',
  'afronden.knop_label': 'Complete goal {titel}',
  'afronden.knop': 'This goal is done',

  'archief.terughalen_kop': 'Take out of the archive',
  'archief.kop': 'Archive',
  'archief.terughalen_uitleg': 'The goal returns to your dashboard and to your group overview.',
  'archief.uitleg':
    'The goal disappears from your dashboard and from group overviews. Your history stays ' +
    'completely intact: completions, approvals and points. You can always undo this.',
  'archief.terughalen': 'Restore',
  'archief.archiveren': 'Archive',

  'herplannen.kop': 'This date is no longer going to work',
  'herplannen.stand_1_1': 'One milestone is still open and there is one week left. ',
  'herplannen.stand_1_n': 'One milestone is still open and there are {weken} weeks left. ',
  'herplannen.stand_n_1': '{open} milestones are still open and there is one week left. ',
  'herplannen.stand_n_n': '{open} milestones are still open and there are {weken} weeks left. ',
  'herplannen.geen_ramp':
    'That is not a disaster and it says nothing about you. It says the plan no longer fits. ' +
    'Adjusting a goal works better than letting it quietly bleed out.',
  'herplannen.drie_dingen': 'Three things you can do:',
  'herplannen.datum_kop': 'Move your target date',
  'herplannen.datum_uitleg':
    'Above under “Deadline”. If you share this goal with a group, you ask them to agree, ' +
    'that costs you no points.',
  'herplannen.mijlpalen_kop': 'Drop milestones',
  'herplannen.mijlpalen_uitleg':
    'Under “Milestones”. What you drop no longer counts, and your history stays intact.',
  'herplannen.kleiner_kop': 'Make the goal smaller',
  'herplannen.kleiner_uitleg':
    'Adjust the milestones to what does fit. Better a goal you reach than a plan that made ' +
    'sense in March.',
  'herplannen.let_op_straf':
    'Note: you have set a penalty on this goal. It takes effect if your target date passes ' +
    'without the goal being done. If you move the date, that moment moves along with it.',
  'herplannen.reeks_blijft': 'Your streak and your history stay intact in all three cases.',

  // ---------------------------------------------------------------------------
  // The help request and the Risk radar on the goal screen — QS8-94 and QS8-95
  // ---------------------------------------------------------------------------
  'hulpvraag.verstuurd_kop': 'Your question is in the group',
  'hulpvraag.verstuurd_uitleg':
    'Your buddies can respond to it in the group chat. That is exactly what they are for.',
  'hulpvraag.kop': 'Stuck? Ask your group',
  'hulpvraag.uitleg':
    'You are falling behind on this goal. That is what your group is for: two sentences and ' +
    'someone thinks along with you. You see exactly what you send before it goes out.',
  'hulpvraag.vraag_knop': 'Ask for help',
  'hulpvraag.niet_nu': 'Not right now',
  'hulpvraag.wat_vragen': 'What do you want to ask?',
  'hulpvraag.bericht': 'Your message',
  'hulpvraag.bericht_hint': 'Feel free to adjust it. This goes to the group chat as your message.',
  'hulpvraag.welke_groep': 'To which group?',
  'hulpvraag.kies_eerst': 'First pick which group your question goes to.',
  'hulpvraag.gaat_naar': 'Goes to {groep}.',
  'hulpvraag.versturen': 'Send',
  'hulpvraag.annuleren': 'Cancel',

  'radar.kop': 'Feasibility',
  'radar.verbergen': 'Hide',
  'radar.waarom': 'Why?',
  'radar.alleen_jij': 'Only you see this. Your group never gets to see your feasibility.',

  // ---------------------------------------------------------------------------
  // The milestones block on the goal screen — QS8-39
  // ---------------------------------------------------------------------------
  'mijlpalenblok.kop': 'Milestones',
  'mijlpalenblok.leeg':
    'No milestones yet. Cut your goal into intermediate results you can point at; then you ' +
    'know every week what you are working on.',
  'mijlpalenblok.coach': 'Let the Goal Coach suggest them',
  'mijlpalenblok.gehaald': 'Done',
  'mijlpalenblok.stap': 'Step {nummer} of {totaal}',
  'mijlpalenblok.streefdatum': 'Target date {datum}',
  'mijlpalenblok.toch_niet': 'Not done after all',
  'mijlpalenblok.zet_gehaald': 'Done',
  'mijlpalenblok.weekstappen': 'Weekly steps',
  'mijlpalenblok.weekstappen_label': 'Let the coach think up weekly steps for {titel}',
  'mijlpalenblok.omhoog': 'Up',
  'mijlpalenblok.omlaag': 'Down',
  'mijlpalenblok.verwijderen': 'Delete',
  'mijlpalenblok.omhoog_label': 'Move {titel} up',
  'mijlpalenblok.omlaag_label': 'Move {titel} down',
  'mijlpalenblok.verwijderen_label': 'Delete {titel}',
  'mijlpalenblok.nieuwe': 'New milestone',
  'mijlpalenblok.nieuwe_hint':
    'An intermediate result you can point at. For example: first ten thousand words.',
  'mijlpalenblok.nieuwe_voorbeeld': 'First ten thousand words',
  'mijlpalenblok.omschrijving_hint':
    'Optional. What does this step involve? You can update it later.',
  'mijlpalenblok.toevoegen': 'Add',
  'mijlpalenblok.annuleren': 'Cancel',
  'mijlpalenblok.toevoegen_knop': 'Add milestone',

  // ---------------------------------------------------------------------------
  // Adding a weekly goal, breather and deleting — QS8-43, QS8-82 and QS8-105
  // ---------------------------------------------------------------------------
  'weekcoach.titel': 'Weekly steps',
  'weekcoach.eyebrow': 'THE GOAL COACH',
  'weekcoach.uitleg':
    'The coach knows your goal "{doel}" and this milestone, and suggests weekly steps that lead there together. Every step comes with a floor and a ceiling.',
  'weekcoach.zelfde_tien':
    'This counts towards the same ten AI requests per day as breaking down a goal.',
  'weekcoach.terug': 'Back to the goal',
  'weekcoach.leeg_titel': 'No milestone chosen',
  'weekcoach.leeg_tekst':
    'Open this screen from a milestone on your goal, so the coach knows what to think up steps for.',
  'weekcoach.wat_gebeurt_er':
    'The coach looks at this milestone, at how many weeks you have left, and at what you filled in during the interview.',
  'weekcoach.genereer': 'Generate weekly steps',
  'weekcoach.duurt_even': 'This takes about twenty seconds. Stay on this screen for a moment.',
  'weekcoach.lukte_niet': 'That did not work',
  'weekcoach.geen_weekdoelen':
    'The coach did not come up with usable steps. Every step needs a floor and a ceiling, and those were missing.',
  'weekcoach.vastgelopen': 'The coach got stuck. Try again in a moment.',
  'weekcoach.te_lang': 'This is taking longer than expected. Try again in a moment.',
  'weekcoach.zelf_toevoegen': 'Make a weekly goal yourself',
  'weekcoach.opnieuw': 'Try again',
  'weekcoach.klaar': 'Done',
  'weekcoach.voorstellen': '{aantal} weekly steps',
  'weekcoach.een_per_week':
    'These steps are meant for consecutive weeks. Add the step you are working on this week now; next week you come back for the next one.',
  'weekcoach.vloer': 'Floor: {tekst}',
  'weekcoach.plafond': 'Ceiling: {tekst}',
  'weekcoach.voeg_toe': 'Add as weekly goal',
  'weekcoach.toegevoegd': 'Added to this week.',
  'weekdoelform.coach': 'Let the coach think up weekly steps',
  'weekdoelform.knop': 'Add weekly goal',
  'weekdoelform.kop': 'What do you want done this week?',
  'weekdoelform.titel': 'Weekly goal',
  'weekdoelform.titel_hint': 'One thing, this week. For example: have three customer calls.',
  'weekdoelform.titel_voorbeeld': '3 customer calls',
  'weekdoelform.vloer': 'The floor (recommended)',
  'weekdoelform.vloer_hint':
    'What do you manage even in a bad week? Reaching this keeps your streak running; only ' +
    'the points differ.',
  'weekdoelform.vloer_voorbeeld': '1 call scheduled',
  'weekdoelform.plafond': 'The ceiling',
  'weekdoelform.plafond_hint': 'What are you going for if the week goes well?',
  'weekdoelform.plafond_voorbeeld': '3 calls held',

  'weekdoelform.ritme': 'How does this week count?',
  'weekdoelform.ritme_hint':
    'Starts from what you picked for this goal. Change it here and it applies to this week. Your goal stays as it is.',
  'weekdoelform.plafond_dagen': 'How many days are you going for?',
  'weekdoelform.plafond_dagen_hint': 'If the week goes well.',
  'weekdoelform.vloer_dagen': 'And on your worst week? (recommended)',
  'weekdoelform.vloer_dagen_hint':
    'The number of days you still manage when things go wrong. Reach that and the week counts.',
  'weekdoelform.geen_vloer': 'No floor',
  'weekdoelform.dagen_aantal': '{aantal} days',
  'weekdoelform.dagen_zonder_vloer':
    'You make this week by checking off {plafond} days. One day less counts as a missed week.',
  'weekdoelform.dagen_met_vloer':
    'From {vloer} days your week counts and your streak continues; at {plafond} days you reach your ceiling.',

  'weekdoelform.mijlpaal': 'Does this belong to a milestone?',
  'weekdoelform.mijlpaal_hint': 'It can also hang loose under your goal.',
  'weekdoelform.los': 'Loose under this goal',
  'weekdoelform.toevoegen': 'Add',
  'weekdoelform.annuleren': 'Cancel',

  'adempauze.kop': 'Breather',
  'adempauze.uitleg':
    'Going on holiday, ill, or just a strange month? Then pause those weeks. They cost you no ' +
    'point and your streak stays where it is; it just does not grow. You pick how long, you may ' +
    'have several side by side, and afterwards only the past week is allowed.',
  // ⚠️ QS8-768 (decision by Quinten, 20-11-2026): replaced, the old sentence was untrue
  //    after 0307. The last sentence (the Ketting remainder) is gone since 0329 (QS8-769): the
  //    Ketting counts a member on a pause.
  'adempauze.groep_ziet':
    'Your group does not see your breather. If you want to let them know, post a message ' +
    'yourself.',
  'adempauze.week_van': 'Week of {datum}',
  'adempauze.tot_en_met': ' up to and including the week of {datum}',
  'adempauze.voorbij': 'Over',
  'adempauze.loopt': 'Running now',
  'adempauze.ingepland': 'Scheduled',
  'adempauze.annuleren': 'Cancel',
  'adempauze.vanaf': 'From',
  'adempauze.vanaf_hint': 'As yyyy-mm-dd. Afterwards, only the past week works.',
  'adempauze.tot': 'Up to and including',
  'adempauze.tot_hint': 'Leaving this empty means one week.',
  'adempauze.wordt_een_week': 'This becomes the week of {van}.',
  'adempauze.wordt_meer_weken':
    'This becomes {weken} weeks: from {van} up to and including the week of {tot}.',
  // ⚠️ QS8-770 (decision by Quinten, 20-11-2026): the brake on a breather set afterwards.
  'adempauze.te_ver_terug': 'A breather set afterwards can only cover the past week.',
  'adempauze.terugwerkend':
    'These weeks are already over. Missed weeks inside them are excused after all and the ' +
    'minus point is reversed.',
  'adempauze.inplannen': 'Schedule',
  'adempauze.inplannen_knop': 'Schedule a breather',
  // QS8-753 (decision Quinten 19-11-2026): when scheduling, the member may tell their
  // group they are resting. Off by default, never preselected, the text can be edited
  // or cleared, and nothing is sent until 'Schedule'. A plain chat message from the
  // member; no system type and no migration.
  'adempauze.bericht_vraag': 'Do you want to let your group know you are taking a rest?',
  'adempauze.bericht_nee': 'No',
  'adempauze.bericht_ja': 'Yes, send a message',
  'adempauze.bericht_label': 'Your message',
  'adempauze.bericht_hint':
    'Feel free to change or clear it. You can add which goal or for how long yourself. It goes to the group chat as your own message, and only when you press Schedule. If you leave it empty, nothing is sent.',
  'adempauze.bericht_niet_ingelogd': 'You are not signed in, so your message could not be sent.',
  'adempauze.bericht_voorstel': "I'm taking a short breather. I'll be back after that.",
  'adempauze.bericht_welke_groep': 'To which group?',
  'adempauze.bericht_gaat_naar': 'Goes to {groep}.',
  'adempauze.bericht_kies_eerst': 'First choose which group your message goes to, or choose No.',
  'adempauze.bericht_verstuurd': 'Your breather is scheduled and your message is in the group.',
  'adempauze.bericht_mislukt':
    'Your breather is scheduled, but your message was not sent. {reden}',
  'adempauze.bericht_opnieuw': 'Send message again',
  'adempauze.bericht_laat_maar': 'Never mind',

  'weggooien.label': 'Delete goal {titel}',
  'weggooien.knop': 'Created by accident? Delete it',

  // ---------------------------------------------------------------------------
  // Leftovers found by the extended text check — QS8-115
  // ---------------------------------------------------------------------------
  'laden.kop_mislukt': 'That did not work',
  'ketting.kop': 'The Chain',
  'lid.adempauze': 'Breather',
  'lid.afgerond': 'closed this period',
  'vandaag.reeks_telt_weken': 'Your streak counts weeks, not days.',
  'vandaag.meenemen_knop': 'Carry over to this week',
  'vandaag.buddy_vraag': 'Your buddy has a question',
  'profiel.naam_titel': 'Your name',
  'profiel.naam_uitleg': 'This is the name your buddies see. You can change it any time.',
  'profiel.naam_label': 'Display name',
  'profiel.naam_hint': 'A first name is enough.',
  'profiel.naam_bewaren': 'Save name',
  'profiel.naam_bewaard': 'Your name has been updated.',
  'profiel.uitloggen_kop': 'Sign out',
  'profiel.uitloggen_uitleg': 'You stay a member of your groups. Your goals stay put.',
  'profiel.uitloggen_knop': 'Sign out',
  'beoordelen.verouderd': 'Something has changed in the list in the meantime.',
  'beoordelen.verversen': 'Refresh list',
  'beoordelen.vorige': 'Previous',
  'beoordelen.meer_laden': 'Load more',
  'groepscherm.wie_meedoen': 'Who is taking part',
  'groepscherm.meer_tijd': 'A buddy is asking for more time',
  'coach.poging_telt': 'Every attempt counts towards what the Goal Coach can still do for you today.',
  'weekafsluiting.wat_gedeeld': 'What the group shared',

  // ---------------------------------------------------------------------------
  // The language choice — QS8-115
  // ---------------------------------------------------------------------------
  'taal.label': 'Language',
  'taal.hint': 'The app and your notifications. You can always change this.',
  'taal.uitleg':
    'Your choice also applies to the notifications you receive, because those are ' +
    'composed on the server and not on your phone.',
  'validatie.taal': 'Choose a language from the list.',

  'zichtbaarheid.beschermd': 'Protected',
  'zichtbaarheid.open': 'Open',
  'zichtbaarheid.beschermd_uitleg':
    'The group sees what works out: finished weeks, milestones, encouragement. A missed week stays yours unless you share it yourself.',
  'zichtbaarheid.open_uitleg':
    'The group also sees what does not work out: each other’s missed and carried weeks, each other’s best streak, who took part in which week, each other’s point totals in this group, and which hero last visited whom in the past week. That includes the hero who turns up after a missed week. Only pick this if everyone wants it.',
  'zichtbaarheid.niet_bevestigd': 'Confirm first: this changes what the group sees about other people.',
  'bevestiging.huddledag_verzetten.titel': 'Move the huddle day?',
  'bevestiging.huddledag_verzetten.uitleg':
    'The week that is running moves along to the new day. Anything already closed stays closed. For the others the running week may end sooner, sometimes today. You can do this once a day.',
  'bevestiging.huddledag_verzetten.knop': 'Yes, move the huddle day',

  'bevestiging.groep_openzetten.titel': 'Open up this group?',
  'bevestiging.groep_openzetten.uitleg':
    'From now on everyone in this group also sees each other’s missed and carried weeks, each other’s best streak ever, who took part in each week, a leaderboard of each other’s point totals in this group, and which hero last visited whom in the past week. That includes the hero who turns up after a missed week, and it covers the weeks already there too. The leaderboard turns on, if it was off. So this is not only about you. Everyone gets a message in the group chat, so anyone who would rather not can unlink their goal. That works for everything tied to a goal; the hero list is tied to your membership, so it stays as long as you are in the group. You can switch back at any time, immediately.',
  'bevestiging.groep_openzetten.knop': 'Yes, open it up',
  'bevestiging.groep_beschermen.titel': 'Protect this group again?',
  'bevestiging.groep_beschermen.uitleg':
    'From now on the group only sees what works out. Closed: missed and carried weeks, the best streak, who took part in each week and the hero list, retroactively too. The leaderboard stays; an admin can switch it off separately. Everyone gets a message about it.',
  'bevestiging.groep_beschermen.knop': 'Yes, protect it',
  'bevestiging.groep_ontdekbaar_maken.titel': 'Make this group discoverable?',
  'bevestiging.groep_ontdekbaar_maken.uitleg':
    'People you don’t know yet will be able to find this group and ask to join. They see the name, the topic, your description, the language, the huddle day and how many members there are. They do not see who is in it, which goals are in it, the chat, The Chain or anyone’s streak. Requests come to you and you do not have to accept a single one. Everyone in the group gets a message about it. If the leaderboard is on, it turns off; an admin can turn it back on separately afterwards. You can undo this at any time, immediately.',
  'bevestiging.groep_ontdekbaar_maken.knop': 'Yes, make it discoverable',
  // QS8-666 (A57, 0336). Turning it on also reveals the points already earned in this group (`points_ledger` always
  // keeps the group), and the text says so (domain rule 10). It deliberately does not say "a point you lose is not
  // shown either": a withdrawn approval books corrections with the group, so the standing can drop within the
  // fifteen-minute window. Only a missed week is a promise the database keeps.
  'bevestiging.klassement_aanzetten.titel': 'Turn the leaderboard on?',
  'bevestiging.klassement_aanzetten.uitleg':
    'From now on everyone in this group sees each other\'s rank and the points earned in this group, including those from before today. A missed week never appears in it. This applies to all members: nobody can opt out for themselves. Everyone gets a message in the group chat. You can turn it off at any time, right away.',
  'bevestiging.klassement_aanzetten.knop': 'Yes, turn it on',
  'bevestiging.klassement_aanzetten_vindbaar.titel': 'Turn the leaderboard on?',
  'bevestiging.klassement_aanzetten_vindbaar.uitleg':
    'From now on everyone in this group sees each other\'s rank and the points earned in this group, including those from before today. A missed week never appears in it. This group is discoverable: whoever joins later sees the leaderboard too. This applies to all members: nobody can opt out for themselves. Everyone gets a message in the group chat. You can turn it off at any time, right away.',
  'bevestiging.klassement_aanzetten_vindbaar.knop': 'Yes, turn it on',
  'bevestiging.klassement_uitzetten.titel': 'Turn the leaderboard off?',
  'bevestiging.klassement_uitzetten.uitleg':
    'The leaderboard disappears for everyone in this group. The points are kept and come back if you turn it on again. Everyone gets a message in the group chat.',
  'bevestiging.klassement_uitzetten.knop': 'Yes, turn it off',
  'bevestiging.groep_verbergen.titel': 'Hide this group again?',
  'bevestiging.groep_verbergen.uitleg':
    'The group disappears from the search list and nobody can knock any more. Requests that already came in stay and you can still answer them. Nothing changes for the members.',
  'bevestiging.groep_verbergen.knop': 'Yes, hide it',
  'bevestiging.groep_verlaten.titel': 'Leave this group?',
  'bevestiging.groep_verlaten.uitleg':
    'Your goal leaves this group and you will no longer be able to open the chat, the week reviews or The Chain here. What you have built up stays: your points, your streak, your completions and the approvals you gave. If your goal is also linked to another group, nothing changes there. You can only come back with a valid invite link.',
  'bevestiging.groep_verlaten.knop': 'Yes, leave this group',
  'bevestiging.weekstart_verzetten.titel': 'Start your week on a different day?',
  'bevestiging.weekstart_verzetten.uitleg':
    'Your week starts on the new day from now on. Weekly goals you still have to do move along to your new week, so you lose nothing. Weeks you have already submitted or completed stay where they are, and your points and streak do not change.',
  'bevestiging.weekstart_verzetten.knop': 'Yes, move my week start',
  'verlaten.titel': 'Leave this group',
  'verlaten.uitleg':
    'You step out of this group. Your goal is unlinked from this group and from no other.',
  'verlaten.blijft':
    'Your points, your streak and your history stay. Nothing changes for what your buddies have built up either.',
  'verlaten.knop': 'Leave group',
  'verlaten.geen_lid': 'You are not a member of this group.',
  'verlaten.laatste_beheerder':
    'You are the only admin. Pick someone to take over first.',
  'verlaten.geen_geldige_opvolger': 'Pick an active member of this group.',
  'verlaten.opvolger_titel': 'Who takes over as admin?',
  'verlaten.opvolger_uitleg':
    'You are the only admin. Without a successor nobody can manage this group, so pick one before you leave.',
  'verlaten.laatste_lid':
    'You are the last member. The group is archived when you leave, so no group is left without an admin.',
  'bevestiging.groep_archiveren.titel': 'Archive this group?',
  'bevestiging.groep_archiveren.uitleg':
    'Nobody can do anything in it afterwards: no messages, no week reviews, no new members. Reading still works: the chat and the week reviews stay open to members, and your buddies\u2019 streaks remain correct. As an admin you can bring the group back later.',
  'bevestiging.groep_archiveren.knop': 'Yes, archive this group',
  'beheer.archief_titel': 'Archive group',
  'beheer.archief_uitleg':
    'If this group is finished, this is how you close it. Nobody can do anything in it any more; every member can still read back through it.',
  'beheer.archief_waarschuwing':
    'Nothing is deleted, and as an admin you can bring the group back later.',
  'beheer.archiveren': 'Archive this group',
  'groep.gearchiveerd': 'This group is archived. You can read everything back, but nothing can be added.',
  'groep.link_gearchiveerd': 'This group has been archived. You cannot join it.',
  'beheer.heropen_titel': 'Bring the group back',
  'beheer.heropen_uitleg':
    'This group is in the archive. Bring it back and everyone can post messages, week reviews and goals in it again.',
  'beheer.heropenen': 'Bring this group back',
  'beheer.melding_heropend': 'The group has been taken out of the archive.',
  'bevestiging.groep_heropenen.titel': 'Bring this group back?',
  'bevestiging.groep_heropenen.uitleg':
    'The group takes full part again: everyone can write in it, link goals to it and join the week review. Members are not notified, so let them know yourself.',
  'bevestiging.groep_heropenen.knop': 'Yes, bring this group back',
  'beheer.melding_gearchiveerd': 'The group has been archived.',
  'zichtbaarheid.onbekend': 'That setting does not exist.',
  'zichtbaarheid.ongewijzigd': 'It was already set that way.',
  'zichtbaarheid.te_snel': 'This group was already opened up once in the past 24 hours. It stays protected in the meantime; you can try again in a day.',

  'groepnieuw.zichtbaarheid': 'What does the group see of each other?',
  'groepnieuw.zichtbaarheid_hint':
    'This is the most important choice on this screen. It can be changed later, but never quietly: everyone gets told.',

  'beheer.zichtbaarheid_titel': 'What the group sees of each other',
  'beheer.zichtbaarheid_nu': 'Currently set to: {stand}',
  'beheer.zichtbaarheid_waarschuwing':
    'Opening up works retroactively: from that moment the group also sees the missed weeks that are already there. Everyone gets a message about it, so anyone who would rather not can unlink their goal.',
  'beheer.naar_open': 'Open up this group',
  'beheer.naar_beschermd': 'Protect this group again',
  'beheer.melding_open_gezet': 'The group is open. Everyone has been told.',
  'beheer.melding_beschermd_gezet': 'The group is protected again.',


  'algemeen.laden': 'Loading',
  'algemeen.streefdatum': 'Target date {datum}',
  'reeks.beste_een': 'Best so far: 1 week',
  'reeks.beste_meer': 'Best so far: {aantal} weeks',
  'weekdoel.vloer_regel': 'Floor · {tekst}',
  'weekdoel.plafond_regel': 'Ceiling · {tekst}',
  'ketting.a11y': 'The Chain: {stand}',
  'risico.a11y': 'Status: {label}',
  'coach.leeg_titel': 'This goal does not exist',
  'coach.leeg_tekst': 'Either it was deleted, or it is not yours.',
  'coach.geen_mijlpalen': 'The Goal Coach did not return any usable milestones.',
  'coach.te_lang':
    'That took too long. Try again in a moment, or add your milestones yourself.',
  'coach.n_voorgesteld': '{aantal} milestones suggested',
  'beheer.melding_opgeslagen': 'Saved. Chain links already earned stay exactly where they are.',
  'beheer.melding_huddledag': 'The huddle day is now {{dag}}. The week that is running moved along with it; anything already closed stays closed.',
  'beheer.huddledag_te_snel': 'The huddle day was already moved today. You can do it again tomorrow.',
  'beheer.huddledag_ongeldig': 'That is not a valid weekday.',
  'beheer.huddledag_verlopen': 'The week has moved on in the meantime. Refresh the screen and try again.',
  'beheer.melding_nieuwe_link': 'New link. The old one stops working from now on.',
  'beheer.leeg_titel': 'This group is not here, or not for you',
  'beheer.leeg_tekst': 'You are not a member of this group, or it no longer exists.',
  'beheer.huddledag_label': 'Huddle day',
  'beheer.huddledag_hint':
    'The group’s shared day. It changes nothing about when your own weekly goals reset. That stays your personal week start day.',
  'beheer.voorlezen': 'You can also read it out: {code}',
  'beoordelen.bevestigd': 'You confirmed {naam}’s week.',
  'beoordelen.sessie_laadt': 'Your session is still loading. Try again in a second.',
  'dashboard.week_van': 'Week of {datum}',


  'tijdzone.label': 'Time zone',
  'tijdzone.nu': 'Currently set to: {zone}',
  'tijdzone.van_het_apparaat':
    'This comes from your device and updates automatically when you move or travel.',


  'weektip.lichaam.1': 'Your body remembers the weeks you showed up. This was one of them.',
  'weektip.lichaam.2': 'The version that felt good this week is the one you can keep. Remember it.',
  'weektip.lichaam.3': 'Rest is part of it and it counts. Plan it as deliberately as the rest.',
  'weektip.lichaam.4': 'This week did not have to be hard to count. It counted.',
  'weektip.lichaam.5': 'Lay out what you need for next week now. That is half the decision gone.',
  'weektip.mensen.1': 'What you did for someone this week stays with them longer than you think.',
  'weektip.mensen.2': 'A week where you reached out is a week someone else noticed too.',
  'weektip.mensen.3': 'Making something and sharing it take the same week. This week you did both.',
  'weektip.mensen.4': 'Tell someone what you made or did this week. It makes it real.',
  'weektip.mensen.5': 'Decide now who you will talk to next week, so that choice is already made.',
  'weektip.werk.1': 'What you put in order this week does not need doing again next week.',
  'weektip.werk.2': 'Getting things done this week is not the same as being busy. This was the first.',
  'weektip.werk.3': 'Write down which approach worked this week. That is your manual for the busy ones.',
  'weektip.werk.4': 'Keeping a week going is the skill; the rest is execution. This week it worked.',
  'weektip.werk.5': 'Pick your first step for next week now, while you still know where you left off.',
  'weektip.business.1': 'One finished week is a week someone else spent planning.',
  'weektip.business.2': 'What you finished this week does not need thinking about next week.',
  'weektip.business.3': 'Write down what worked this week. That is your own manual for the busy ones.',
  'weektip.business.4': 'Small and done beats big and half. This week proved it.',
  'weektip.business.5': 'The next step is usually smaller than it looks. Pick it while you are going.',
  'weektip.study.1': 'A week kept up counts for more than one hard day. This was the week.',
  'weektip.study.2': 'What you understood this week, you never have to learn for the first time again.',
  'weektip.study.3': 'Go over this week briefly tomorrow. Twenty minutes now saves an evening later.',
  'weektip.study.4': 'Fixed times beat long sessions. This week is the proof.',
  'weektip.study.5': 'Decide now when you start next week. Then you do not have to decide again.',
  'weektip.other.1': 'Showing up is the whole trick. This week it worked.',
  'weektip.other.2': 'What you did this week counts even if nobody saw it.',
  'weektip.other.3': 'One week is no longer chance. Two is a habit starting.',
  'weektip.other.4': 'Make next week as easy as this one: put out what you need beforehand.',
  'weektip.other.5': 'The weeks that count rarely look special. This one counted.',

  'ketting.opdagen_uitleg':
    'One link for every member who closed their cycle this week. It is about ' +
    'showing up, not about how much you managed.',
  'chat.uit_cache':
    'You are reading this week’s saved messages. The rest fills in as soon as ' +
    'you are back online.',
  'beoordelen.week_afgerond': 'Week finished',
  'beoordelen.week_afgerond_met': 'Week finished: {gehaald}',
  'groepscherm.leden_van_totaal': '{getoond} of {totaal} members.',


  // ---------------------------------------------------------------------------
  // The weekly plan — QS8-203, migration 0138
  // ---------------------------------------------------------------------------
  'weekplan.kop': 'Your weekly plan',
  'weekplan.uitleg':
    'These steps are lined up for the weeks ahead. Every week the top one slides in as your weekly goal.',
  'weekplan.kost_niets':
    "A planned step doesn't count yet: it earns no points and can't cost you one. That starts when it becomes your weekly goal.",
  'weekplan.leeg':
    'No plan yet. Have the coach work out weekly steps under a milestone and the rest will show up here.',
  'weekplan.eerstvolgende': 'Slides in first',
  'weekplan.over_weken': 'In {weken} weeks',
  'weekplan.start_nu': 'Start this one now',
  'weekplan.start_nu_label': 'Start "{titel}" this week',
  'weekplan.verwijder': 'Remove from plan',
  'weekplan.bijstellen': 'Adjust',
  'weekplan.bijstellen_label': 'Adjust "{titel}"',
  'weekplan.bewerken_kop': 'Adjust this step',
  'weekplan.titel': 'What are you going to do?',
  'weekplan.vloer': 'The floor: what you still manage on your worst week',
  'weekplan.plafond': 'The ceiling: what you are aiming for',
  'weekplan.bewaren': 'Save',
  'weekplan.annuleren': 'Never mind',
  'weekplan.verwijder_label': 'Remove "{titel}" from the plan',
  'weekplan.omhoog': 'Earlier',
  'weekplan.omhoog_label': 'Move "{titel}" earlier in the plan',
  'weekplan.omlaag': 'Later',
  'weekplan.omlaag_label': 'Move "{titel}" later in the plan',
  'weekplan.laden_mislukt': "The plan couldn't be loaded.",
  'weekplan.opslaan_mislukt': "The plan couldn't be saved.",
  'weekplan.verwijderen_mislukt': "That step couldn't be removed.",
  'weekplan.starten_mislukt': "That step couldn't be started.",
  'weekplan.al_ingeschoven': 'That step has already become a weekly goal.',
  'weekplan.deze_week_al': 'A step has already slid in for this goal this week.',
  'weekplan.doel_niet_actief': "This goal isn't running any more, so nothing else will slide in.",
  'weekplan.geen_stap': 'There is no step left to start.',
  'weekplan.te_veel_deze_dag': "You've made too many weekly goals today. Try again tomorrow.",
  'weekplan.niet_ingelogd': 'Sign in again and give it another go.',
  'weekplan.niet_van_jou': "That step isn't yours.",
  'weekplan.lijst_veranderd': 'The plan has changed in the meantime. Load it again.',
  'weekplan.ingeschoven_kop': 'A new weekly goal is ready',
  'weekplan.ingeschoven_tekst':
    'The next step from your plan became this week\'s goal. That raises your points ceiling for this week.',
  'weekplan.neem_over': 'Line up the whole plan',
  'weekplan.neem_over_uitleg':
    'The first step becomes your goal for this week. The rest goes into your plan, and one slides in every week.',
  'weekplan.overgenomen': 'The plan is ready. Step 1 is your goal for this week.',
  'validatie.weekplan_leeg': 'A plan without steps is not a plan.',
  'validatie.weekplan_lang': 'A plan reaches at most a year ahead.',
  'coach.al_ingevuld': "You already filled this in on your goal; you can adjust it here.",
  'coach.uit_vragenlijst':
    'This comes from your questionnaire, converted from minutes per day to hours per week; you can adjust it here.',
  'coach.eerder_genoemd': 'In the questionnaire you mentioned: {valkuilen}.',

  // ---------------------------------------------------------------------------
  // A goal's rhythm — decision A53, migration 0140
  // ---------------------------------------------------------------------------
  'ritme.weekly': 'I look at the week',
  'ritme.weekly_uitleg':
    "You wrap up at the end of the week. How you get there is up to you; there's nothing to tick off.",
  'ritme.times_per_week': 'A few times a week',
  'ritme.times_per_week_uitleg':
    'You tick off the days you worked on it. The week counts as soon as you reach your floor.',
  'ritme.daily': 'Every day',
  'ritme.daily_uitleg':
    'For something you do daily. It asks the most of you, so pick this only if it really is every day.',
  'ritme.kop': 'How often will you work on this?',
  'ritme.dagen_gehaald': '{gehaald} of {plafond} days',
  'ritme.vloer_gehaald': "Your floor is met. This week counts.",
  'ritme.vloer_nog_niet': '{aantal} more days to your floor.',
  'ritme.plafond_gehaald': 'Ceiling reached.',
  'ritme.strook_af': '{datum}: checked off',
  'ritme.strook_open': '{datum}: not checked off yet',
  'weekstrook.titel': 'Your week',
  'weekstrook.dag': '{datum}: {staat}',
  'weekstrook.dag_vandaag': 'Today, {datum}: {staat}',
  'weekstrook.dag_actief': 'something done',
  'weekstrook.dag_rustig': 'nothing checked off',
  'weekstrook.leeg': 'What you do this week will show up here.',
  'weekstrook.fout': 'Your week could not be fully loaded.',
  'tellers.titel': 'Safety net, streak and points',
  'tellers.vangnet': 'Safety net',
  'tellers.vangnet_uitleg': 'week passes, across all your goals',
  'tellers.vangnet_uitleg_nul': 'no week pass yet',
  'tellers.reeks': 'Streak',
  'tellers.reeks_uitleg': 'weeks in a row',
  'tellers.reeks_uitleg_een': 'week',
  'tellers.punten': 'Points this week',
  'tellers.punten_uitleg': 'only visible to you',
  'tellers.label_vangnet': 'Safety net: {aantal} week passes available, across your goals. A week pass protects your streak, not your points.',
  'tellers.label_vangnet_een': 'Safety net: 1 week pass available. A week pass protects your streak, not your points.',
  'tellers.label_vangnet_nul': 'Safety net: no week pass yet. A week pass protects your streak, not your points.',
  'tellers.label_reeks': 'Streak: {aantal} weeks in a row',
  'tellers.label_reeks_een': 'Streak: 1 week',
  'tellers.label_punten': 'Points this week: {aantal}. Only visible to you.',
  'tellers.onbekend': '–',
  'tellers.fout': 'Your counters could not be loaded. Reopen Today to try again.',
  'tellers.punten_laden': 'Your points for this week could not be loaded.',
  'afvinkcirkel.staat_leeg': 'Floor not reached yet.',
  'afvinkcirkel.staat_vloer': 'Floor reached: your week counts.',
  'afvinkcirkel.staat_plafond': 'Ceiling reached.',
  'afvinkcirkel.staat_uitgeschakeld': 'Not available.',
  'ritme.vink_af_label': 'Tick off today for "{titel}"',
  'ritme.maak_ongedaan_label': "Undo today's tick for \"{titel}\"",
  'ritme.afvinken_mislukt': "That didn't save.",
  'ritme.buiten_de_week': "That day isn't part of this week.",
  'ritme.onder_de_vloer': "This week hasn't reached its floor yet, so there's nothing to wrap up.",
  'ritme.te_veel_deze_dag': "You've ticked off too much today. Try again tomorrow.",
  'klassement.kop': 'The leaderboard',
  'klassement.uitleg':
    'The points each member has earned in this group. A missed week costs no points here.',
  'klassement.punten_een': '1 point',
  'klassement.punten_meer': '{n} points',
  'klassement.rij_label': 'Place {positie}: {naam}, {punten}',
  // QS8-666 (3b-2): the invitation card for an admin. It promises no more than decision 2: only "a missed week never shows up
  // in it". The points from before today are in the switch's confirmation, not here.
  'klassement.uitnodiging_titel': 'A leaderboard for this group',
  'klassement.uitnodiging_tekst':
    'The leaderboard is off. If you turn it on, members see each other’s points from this group. A missed week never shows up in it.',
  'klassement.uitnodiging_knop': 'Turn on the leaderboard',
  'klassement.uitnodiging_weg_knop': "Don't show again",
  'klassement.uitnodiging_weg_uitleg': 'Only for you. If someone turns the leaderboard on and off again, this card comes back.',
  'klassement.uitnodiging_weg_mislukt': 'The card could not be dismissed. Please try again.',
  'klassement.leeg': 'No points have been earned here yet. The first wrapped-up week gets it going.',
  'klassement.van_totaal': '{getoond} of {totaal} members',
  'klassement.laden_mislukt': 'The leaderboard could not be loaded.',
  'klassement.teller_mislukt': 'The counter could not be loaded.',
  'klassement.opnieuw': 'Try again',
  // The switch in group settings and its refusal reasons — QS8-666 (A57, 0336).
  'klassement.beheer_titel': 'Leaderboard',
  'klassement.beheer_aan': 'Is on. Members see each other\'s points from this group.',
  'klassement.beheer_uit': 'Is off. Members do not see each other\'s points.',
  'klassement.beheer_label': 'Leaderboard',
  'klassement.melding_aan': 'The leaderboard is now on.',
  'klassement.melding_uit': 'The leaderboard is now off.',
  'klassement.niet_bevestigd': 'Confirm first that you want this.',
  'klassement.teamgroep': 'A group that belongs to an organisation never has a leaderboard.',
  'klassement.automatisch': 'A group that was put together automatically never has a leaderboard.',
  'klassement.gearchiveerd': 'This group is archived. Nothing can be changed there anymore.',
  'klassement.ongewijzigd': 'The leaderboard was already set like that.',
  'klassement.onbekend': 'This group no longer exists.',

  // The hero list of an open group — QS8-493, RPC from 0268/0279.
  // ⚠️ The wording follows `bevestiging.groep_openzetten.uitleg`, which is the
  //    text the consent rests on. "seven days" rather than "week": the window is
  //    a rolling UTC one and follows neither the cycle start nor the huddle day.
  'groepshelden.kop': 'Which hero came by',
  'groepshelden.uitleg':
    'In this group you can see which hero last visited whom in the past seven days.',
  'groepshelden.rij': '{held} visited {naam}',
  'groepshelden.leeg': 'No hero visited anyone in the past seven days.',
  'groepshelden.laden_mislukt': 'The hero list could not be loaded.',
  'groepshelden.opnieuw': 'Try again',

  'teller.weken_een': '1 week wrapped up',
  'teller.weken_meer': '{n} weeks wrapped up',
  'teller.mijlpalen_een': '1 milestone reached',
  'teller.mijlpalen_meer': '{n} milestones reached',

  'groepskaart.kop': 'Your group',
  'groepskaart.nog_niets': 'Your first wrapped-up week will show up here.',
  'groepskaart.nog_geen_weken': 'No week wrapped up yet',
  'groepskaart.leden_een': '1 member',
  'groepskaart.leden_meer': '{n} members',
  'groepskaart.alleen': 'A group is better with a buddy. Invite someone to get started together.',
  'groepskaart.uitnodigen_uit': 'Invites are switched off for this group.',
  'groepskaart.uitnodigen': 'Invite someone',
  'groepskaart.a11y': 'Your group: {teller}. {leden}.',

  'overzicht.titel': 'Your overview',
  'overzicht.eyebrow': 'THE PAST TWELVE WEEKS',
  'overzicht.open': 'See your overview',
  'overzicht.laden_mislukt': 'Your overview could not be loaded.',

  'overzicht.weken_kop': 'Twelve weeks',
  'overzicht.weken_leeg': 'Once you wrap up your first week, it shows up here.',
  'overzicht.week_label': 'Week of {datum}: {stand}',
  'weekstand.plafond': 'ceiling reached',
  'weekstand.vloer': 'floor reached \u2014 this week counts',
  'weekstand.ingediend': 'submitted, waiting for your buddy',
  'weekstand.gemist': 'not wrapped up',
  'weekstand.leeg': 'no weekly goal',

  'overzicht.kalender_kop': 'Your days',
  'overzicht.kalender_uitleg': 'Only the goals you work on several times a week.',
  'overzicht.kalender_leeg': 'No days ticked off yet.',
  'overzicht.dag_label': '{datum}: {aantal} ticked off',
  'overzicht.dag_leeg_label': '{datum}: nothing ticked off',

  'overzicht.reeks_kop': 'Your longest run',
  'overzicht.reeks_weken': '{n} weeks',
  'overzicht.reeks_week': '1 week',
  'overzicht.reeks_nu': 'Now {n}',
  'overzicht.punten_kop': 'Your points',
  'overzicht.punten_prive': 'Only you see this number.',

  'overzicht.gebieden_kop': 'What your goals are about',
  'overzicht.gebieden_leeg': 'You do not have any goals yet.',
  'overzicht.gebied_label': '{gebied}: {aantal}',

  'overzicht.groep_kop': 'Your groups',
  'overzicht.groep_uitleg': 'A group\u2019s standing lives on the group screen itself \u2014 that is where the app knows which group you mean.',
  'overzicht.groep_open': 'Go to your groups',

  'vragenlijst.titel': 'A few short questions',
  'vragenlijst.eyebrow': 'SO THE APP KNOWS YOU',
  'vragenlijst.overslaan': 'Go to summary',
  'vragenlijst.volgende': 'Next',
  'vragenlijst.vorige': 'Back',
  'vragenlijst.alles_overslaan': 'You can skip all of it. You lose nothing, and you can fill it in later.',

  'vragenlijst.focus.vraag': 'What do you want to focus on?',
  'vragenlijst.focus.toelichting': 'Pick at most three. They steer what the app suggests and where you find groups.',
  'vragenlijst.focus.vol': 'You have three. Tap one off to swap.',

  'vragenlijst.tijd.vraag': 'How much time can you honestly give?',
  'vragenlijst.tijd.toelichting': 'On an ordinary day, not your best day.',
  'vragenlijst.minuten.5': '5 minutes',
  'vragenlijst.minuten.15': '15 minutes',
  'vragenlijst.minuten.30': '30 minutes',
  'vragenlijst.minuten.60': 'An hour or more',
  'vragenlijst.uren_per_week': 'That is roughly {uren} hours a week. We will fill that in for you later, and you can change it.',

  'vragenlijst.moment.vraag': 'When are you actually going to do it?',
  'vragenlijst.moment.toelichting': 'A fixed moment holds up; a vague intention does not.',
  'vragenlijst.moment.morning': 'In the morning',
  'vragenlijst.moment.workday': 'Somewhere in the workday',
  'vragenlijst.moment.evening': 'In the evening',
  'vragenlijst.moment.varies': 'It varies a lot',

  'vragenlijst.valkuil.vraag': 'What normally makes your habits fall apart?',
  'vragenlijst.valkuil.toelichting': 'Tick as many as ring true. This is what the app was built for.',
  'valkuil.forget': 'I simply forget',
  'valkuil.forget.antwoord': 'That is what the daily reminder is for: one gentle nudge, only if you have not done anything yet that day. You turn it on in your profile.',
  'valkuil.motivation_drops': 'Motivation drops after week one',
  'valkuil.motivation_drops.antwoord': 'That is what a week pass is for: a missed week does not cost you your run. And your floor keeps a mediocre week counting.',
  'valkuil.all_or_nothing': 'All or nothing: one missed day and I stop',
  'valkuil.all_or_nothing.antwoord': 'That is why every weekly goal has a floor next to its ceiling. Floor reached means the week counts \u2014 same run, same approval.',
  'valkuil.nobody_notices': 'Nobody notices if I stop',
  'valkuil.nobody_notices.antwoord': 'Your week is confirmed by a buddy, not by yourself. That is what this app is built around.',
  'valkuil.life_chaotic': 'My life gets chaotic sometimes',
  'valkuil.life_chaotic.antwoord': 'Then you set a breather. Your run stays, and your group only sees it if you let them know yourself.',
  'valkuil.bekijk': 'Show me',

  'vragenlijst.samenvatting.kop': 'Here is what you told me',
  'vragenlijst.samenvatting.uitleg': 'Tap an answer to change it.',
  'vragenlijst.samenvatting.leeg': 'You skipped everything. That is fine, and you can still fill it in later.',
  'vragenlijst.samenvatting.niets': 'Skipped',
  'vragenlijst.samenvatting.bewaren': 'Save and continue',
  'vragenlijst.samenvatting.dit_helpt': 'What the app does with this',

  'validatie.focus_te_veel': 'Pick at most three.',


  'ontdek.titel': 'Find a group',
  'ontdek.eyebrow': 'Search',
  'ontdek.uitleg':
    'These are groups that made themselves findable. You see what they are about and how many people are in them. A group shows nothing more than that to someone from outside.',
  'ontdek.filter_categorie': 'What it is about',
  'ontdek.filter_taal': 'Language',
  'ontdek.alles': 'All',
  'ontdek.laden_mislukt': 'The groups could not be loaded.',
  'ontdek.leeg_titel': 'No group found yet',
  'ontdek.leeg_tekst':
    'There is no findable group in this combination yet. Try another topic or another language. Or start one yourself and open it up.',
  'ontdek.leden': '{aantal} members',
  'ontdek.leden_een': '1 member',
  'ontdek.huddledag': 'Huddle on {dag}',
  'ontdek.meer': 'More groups',
  'ontdek.zelf_beginnen': 'Start a group yourself',

  'ontdek.aanvragen': 'Ask to join',
  'ontdek.bericht_label': 'Introduce yourself',
  'ontdek.bericht_hint':
    'Optional. A sentence or two about what you are working on. The admin of this group reads this.',
  'ontdek.versturen': 'Send',
  'ontdek.annuleren': 'Never mind',
  'ontdek.verzonden':
    'Your request is with the admin of this group. Whether and when they reply is up to them.',
  'ontdek.over_nog': 'You can approach {aantal} more groups today.',
  'ontdek.over_op': 'You have approached ten groups today. Tomorrow you can again.',

  'ontdek.te_veel_aanvragen': 'You have approached ten groups today. Tomorrow you can again.',
  'ontdek.al_lid': 'You are already in this group.',
  'ontdek.niet_open':
    'This group can no longer be found. The admin may have just hidden it.',
  'ontdek.geen_beheerder': 'Only an admin of this group can do this.',
  'ontdek.niet_bevestigd': 'This change was not confirmed.',
  'ontdek.niet_beschermd':
    'An open group cannot be discoverable: strangers would see each other’s setbacks. Make the group protected first.',
  'ontdek.geen_categorie':
    'First pick what this group is about. Without a topic it cannot be found.',
  'ontdek.al_beslist': 'This request has already been decided.',
  'ontdek.ongewijzigd': 'That was already the case.',
  'ontdek.mislukt': 'That did not work. Please try again.',
  'ontdek.verzoeken_mislukt': 'The requests could not be loaded.',
  'ontdek.onbekend_lid': 'Someone',

  'ontdek.beheer_titel': 'Being found',
  'ontdek.beheer_aan': 'This group can be found by people you do not know yet.',
  'ontdek.beheer_uit': 'This group can only be reached with an invitation link.',
  'ontdek.beheer_uitleg':
    'Whoever searches sees the name, the topic, the description, the language, the huddle day and the number of members. Not who is in it, not the goals, not the chat, not The Chain and not anyone’s streak.',
  'ontdek.beheer_moet_beschermd_zijn':
    'Only a protected group can be discoverable. In an open group members see each other’s setbacks, and that is none of a stranger’s business.',
  'ontdek.beheer_aanzetten': 'Make this group discoverable',
  'ontdek.beheer_uitzetten': 'Take it out of the search list',
  'ontdek.melding_ontdekbaar':
    'This group can now be found. Your group got a message about it.',
  'ontdek.melding_verborgen': 'This group is no longer in the search list.',

  'ontdek.categorie_label': 'What this group is about',
  'ontdek.categorie_hint': 'This is what people can find your group by.',
  'ontdek.omschrijving_label': 'Description',
  'ontdek.omschrijving_hint':
    'A sentence or two. This is the only thing a stranger reads about you.',
  'ontdek.voertaal_label': 'Language',
  'ontdek.voertaal_hint':
    'What do you speak with each other? This changes nothing about the language of the app.',
  'ontdek.geen_keuze': 'Not chosen',

  'ontdek.verzoeken_titel': 'Requests',
  'ontdek.verzoeken_leeg': 'There are no open requests right now.',
  'ontdek.verzoeken_uitleg':
    'Whoever you accept joins the group and from that moment sees everything a member sees. Whoever you decline gets no message about it, and neither does the group.',
  'ontdek.aannemen': 'Accept',
  'ontdek.afwijzen': 'Decline',
  'ontdek.aangenomen': 'Accepted.',
  'ontdek.afgewezen': 'Declined.',
  'ontdek.eerder_lid': 'Was a member of this group before.',
  'ontdek.eerder_verwijderd': 'Was a member of this group before and was removed on {datum}.',
  'ontdek.eerder_vertrokken': 'Was a member of this group before and left on {datum}.',
  'ontdek.zonder_bericht': 'No message',

  // Finding buddies through the queue — QS8-233, migrations 0299 and 0300.
  'buddyzoek.titel': 'Find buddies',
  'buddyzoek.uitleg':
    'We look for people with a goal in the same category, a similar target date and the same week start day. Once there are enough, we create a group together.',
  'buddyzoek.knop': 'Find buddies for me',
  'buddyzoek.leeg': 'You are not looking for buddies right now.',

  'buddyzoek.bevestig_titel': 'Before we start looking',
  'buddyzoek.bevestig_onbekenden':
    'You will join a group with people you do not know. They will see your name, your profile picture, the title and the notes of this goal, your target date and the weekly goals under it.',
  'buddyzoek.bevestig_bescherming':
    'Such a group is always protected: a missed week or a setback of yours is never visible there. The group does see your current streak, so it can also read zero.',
  'buddyzoek.bevestig_lopende_week':
    'Note: once you are matched, the week that is running now counts. If you do not make it, that costs a point \u2014 even if you were already halfway when you signed up.',
  'buddyzoek.bevestig_weekstart':
    'We only match you with people whose week starts on the same day as yours, otherwise your weeks drift apart.',
  'buddyzoek.bevestig_stoppen':
    'You can stop looking at any time. It costs nothing and nobody sees it.',
  'buddyzoek.bevestig_knop': 'Yes, find buddies',

  'buddyzoek.wachtend': 'We are looking for buddies for you.',
  'buddyzoek.nog_nodig_een': 'One more person is needed.',
  'buddyzoek.nog_nodig_meer': '{aantal} more people are needed.',
  'buddyzoek.nog_nodig_genoeg': 'There are enough people. Your group will be created shortly.',
  'buddyzoek.zoeken_tot': 'We will keep looking until {datum}.',
  'buddyzoek.stop_knop': 'Stop looking',
  'buddyzoek.gekoppeld': 'You have buddies. Your goal is now in a group.',
  'buddyzoek.naar_groep': 'Go to the group',
  'buddyzoek.over_vandaag': 'You can search {aantal} more times today.',

  'buddyzoek.te_veel': 'You have searched a lot today. Try again tomorrow.',
  'buddyzoek.niet_gevonden': 'This goal does not exist or is not yours.',
  'buddyzoek.niet_bevestigd': 'Read what happens first, then confirm.',
  'buddyzoek.doel_niet_actief': 'This goal is no longer running, so we will not look for buddies for it.',
  'buddyzoek.datum_verstreken': 'The target date of this goal has passed. Set a new one before looking for buddies.',
  'buddyzoek.te_veel_open': 'You are already searching for three goals at once. Stop one first.',
  'buddyzoek.te_veel_groepen': 'You are already in the maximum number of groups.',
  'buddyzoek.al_gekoppeld': 'You are already matched. To get out, leave the group.',
  'buddyzoek.mislukt': 'That did not work. Please try again in a moment.',

  // After fourteen days without buddies — QS8-643, migration 0306.
  'buddyzoek.verlopen': 'We looked until {datum} and have not found buddies for you yet.',
  'buddyzoek.alternatief_uitleg': 'These groups are looking for members. You can ask to join; the admin decides.',
  'buddyzoek.alternatief_geen_titel': 'Right now no group that fits this goal is looking for members.',
  'buddyzoek.alternatief_geen_tekst': 'You can search again, or browse all groups yourself.',
  'buddyzoek.ontdekken_knop': 'Browse all groups',
  'buddyzoek.opnieuw_knop': 'Search again',

  'voertaal.nl': 'Dutch',
  'voertaal.en': 'English',

  'validatie.groepsomschrijving_lang': 'Keep it to 280 characters.',


  'leden.titel': 'Who takes part',
  'leden.eyebrow': 'Group',
  'leden.leeg_titel': 'Nobody yet',
  'leden.leeg_tekst': 'As soon as somebody joins, they show up here.',
  'leden.beheerder': 'Admin',
  'leden.jijzelf': 'This is you.',
  'profiel_ander.titel': 'Profile',
  'profiel_ander.eyebrow': 'Group member',
  'profiel_ander.titel_zelf': 'Your profile as a group member opens it',
  'profiel_ander.eyebrow_zelf': 'Your profile',
  'profiel_ander.tabs_label': 'What do you want to see?',
  'profiel_ander.tab_voltooiingen': 'Goals',
  'profiel_ander.tab_groepen': 'Groups',
  'profiel_ander.tab_statistieken': 'Statistics',
  'profiel_ander.tab_prestaties': 'Achievements',
  'profiel_ander.uitleg_ander': 'You only see what is in groups you share.',
  'profiel_ander.uitleg_zelf': 'This is what this profile shows, not everything a group member can see elsewhere in the app. Each group only sees the goals in that group; everything is combined here.',
  'profiel_ander.leeg_doelen_titel': 'Nothing to show yet',
  'profiel_ander.leeg_doelen_tekst': 'Goals that are in a group you share will appear here.',
  'profiel_ander.leeg_groepen_titel': 'No shared groups',
  'profiel_ander.leeg_groepen_tekst': 'The groups you are both in are listed here.',
  'profiel_ander.niet_beschikbaar_titel': 'This profile cannot be shown',
  'profiel_ander.niet_beschikbaar_tekst': 'You can only see the profile of people you share a group with.',
  'profiel_ander.voltooid': 'Completed',
  'profiel_ander.laden_mislukt': 'Could not load this. Try again in a moment.',
  'profiel_ander.eigen_tab_uitleg': 'This lives on its own screen.',
  'profiel_ander.eigen_tab_open': 'Open',
  'profiel_ander.ingang_knop': 'View profile',
  'profiel_ander.ingang_zelf': 'View your profile',
  'groepdetail.naar_leden': 'All members',

  'melden.titel': 'Report',
  'melden.persoon_knop': 'Report this person',
  'melden.bericht_knop': 'Report this message',
  'melden.reden_label': 'What is going on?',
  'melden.toelichting_label': 'Details',
  'melden.toelichting_hint': 'Optional. What you write here is read by the admin of this group.',
  'melden.versturen': 'Send report',
  'melden.annuleren': 'Never mind',

  'melden.wat_gebeurt_er':
    'Your report goes to the admin of this group, and we can read it. There is no team reviewing reports yet, so we are not going to say there is. If this is something you want to be rid of right now, block that person as well.',
  'melden.verzonden':
    'Your report is in. The admin of this group can see it; the person you reported cannot.',
  'melden.niet_zichtbaar': 'The person you report never sees that you did this.',

  'melden.reden.harassment': 'Harassment or bullying',
  'melden.reden.spam': 'Spam or advertising',
  'melden.reden.inappropriate': 'Inappropriate content',
  'melden.reden.impersonation': 'Pretending to be someone else',
  'melden.reden.other': 'Something else',

  'melden.te_veel': 'You have made twenty reports today. Tomorrow you can again.',
  'melden.geen_lid': 'You are not in this group.',
  'melden.bericht_weg': 'This message no longer exists.',
  'melden.onbekend': 'This person is not in this group.',
  'melden.jezelf': 'You cannot report yourself.',
  'melden.mislukt': 'That did not work. Please try again.',
  'melden.onbekend_lid': 'Someone',

  'melden.blokkeer_knop': 'Block this person',
  'melden.deblokkeer_knop': 'Unblock',
  'melden.geblokkeerd_fout': "Couldn't load the list of blocked people.",
  'melden.geblokkeerd_opnieuw': 'Try again',
  'melden.geblokkeerd_leeg': "You haven't blocked anyone.",
  'instellingen.meldingen_titel': 'Notifications and reminders',
  'melden.geblokkeerd_titel': 'Blocked',
  'melden.blokkades_mislukt': 'Your blocked list could not be loaded.',
  // ⚠️ A sentence of its own rather than `melden.te_veel`: that one names twenty
  //    reports, and this is about blocks with a very different number.
  'melden.te_veel_blokkades':
    'You have blocked a great many people today. Tomorrow you can again. Is someone harassing you right now? Report them; that still works.',
  'melden.blokkeer_stil': 'They get no message about this and cannot see it anywhere.',
  'melden.geblokkeerd': 'This is not possible.',
  'meldingen.laden_mislukt': 'The reports could not be loaded.',
  'meldingen.afhandelen_mislukt': 'Could not resolve the report.',
  'meldingen.niet_van_jou': 'This report is not yours to review.',
  'meldingen.al_afgehandeld': 'Someone has already resolved this report.',

  // The moderation screen — QS8-586.
  'meldingen.titel': 'Reports',
  'meldingen.ingang_kop': 'A report is waiting',
  'meldingen.ingang_tekst': 'Someone reported something you can review.',
  'meldingen.ingang_knop': 'View reports',
  'meldingen.ingang_storing': 'We could not check whether anything is waiting for you.',
  'meldingen.ingang_opnieuw': 'Try again',
  'meldingen.leeg_titel': 'Nothing to review',
  'meldingen.leeg_tekst': 'No report is open. When one comes in, it shows up here.',
  'meldingen.over': 'About {naam}',
  'meldingen.in_groep': 'In {groep}',
  'meldingen.gemeld_op': 'Reported on {datum}',
  'meldingen.escalatie':
    'This report is about an admin of the group, so the group cannot review it itself.',
  'meldingen.toelichting_kop': 'What the reporter wrote',
  'meldingen.geen_toelichting': 'The reporter did not add any explanation.',
  'meldingen.bericht_kop': 'The reported message',
  'meldingen.vaker': 'There are {aantal} open reports about this person.',
  'meldingen.melder_onbekend':
    'Who filed the report is deliberately left out. You judge what happened, not who raised it.',
  'meldingen.actie_knop': 'I have taken action',
  'meldingen.geen_actie_knop': 'Nothing needs to happen here',
  'meldingen.acties_uitleg':
    'Both close the report, with your name and the moment attached. Removing or blocking a member is done on the group screen.',
  'meldingen.meer_laden': 'Load more',

  'melden.verwijder_knop': 'Remove from group',
  'melden.geen_beheerder': 'Only an admin of this group can do this.',
  'melden.niet_bevestigd': 'This action was not confirmed.',
  'melden.al_verwijderd': 'This person is no longer in the group.',
  'melden.laatste_beheerder':
    'This is the only admin of this group. Make someone else an admin first.',
  'melden.verwijderd': 'This member is no longer in the group.',
  'melden.verwijderd_doelen':
    'This member is no longer in the group. {aantal} goals have been unlinked.',

  'bevestiging.lid_verwijderen.titel': 'Remove this member from the group?',
  'bevestiging.lid_verwijderen.uitleg':
    'This person can no longer open the group: not the chat, not the week closings, not The Chain. Their goals leave this group and an open request to move a target date lapses. What they built up stays theirs: their points, their streak and their completions. They cannot come back with the invitation link. The group gets no message about this, but it is recorded in the group history.',
  'bevestiging.lid_verwijderen.knop': 'Yes, remove this member',

  'bevestiging.persoon_blokkeren.titel': 'Block this person?',
  'bevestiging.persoon_blokkeren.uitleg':
    'From now on they will not end up in a group with you: not through an invitation link, not through search. Groups you are both in right now do not change: that would let them notice you did this. They get no message and cannot see it anywhere. You can always undo the block.',
  'bevestiging.persoon_blokkeren.knop': 'Yes, block',

  'validatie.dagen_heel': 'Enter a whole number of days.',
  'validatie.dagen_bereik': 'A week has seven days.',
  'validatie.vloer_boven_plafond': "Your floor can't be above your ceiling.",
  'validatie.vloer_zonder_plafond': 'A floor in days needs a ceiling too.',

  // ---------------------------------------------------------------------------
  // The six heroes — QS8-469, epic QS8-468
  // ---------------------------------------------------------------------------
  //
  // ⚠️ The names are identical in every language on purpose — see the note in
  //    `nl.ts`. Only the subtitle, the personality line and the quote text
  //    change.
  //
  //
  // ⚠️ **Punctuation in the quotes was adjusted; the wording was not.** QS8-218
  //    bans the em dash in app text, so where an original had one there is now a
  //    semicolon or a comma. A deliberate call on 14-09-2026: the words, their
  //    order and the source are intact, the dashes are not. Anyone comparing a
  //    quote with its source sees that difference and no other.
  // ⚠️ A quote is chosen, not translated. Ali, Earhart, Nightingale and Twain
  //    wrote in English, so these are their originals. Aurelius wrote Greek and
  //    Da Vinci Italian: those carry the public-domain translation the source
  //    document names (George Long 1862; Richter/MacCurdy). Back-translating the
  //    Dutch would add a fifth version of a sentence that already passed through
  //    a translator.

  'held.strix.naam': 'Strix',
  'held.strix.ondertitel': 'The Sage',
  'held.strix.persoonlijkheid':
    'Calm, dry and sharp. Says little, but what he says stays with you. No pats on the back. Just the kind of sentence you are still turning over a week later.',
  'held.strix.quote1':
    'If thou art pained by any external thing, it is not this thing that disturbs thee, but thy own judgment about it.',
  'held.strix.quote1.bron': 'Marcus Aurelius · Meditations, book 8.47 · trans. George Long, 1862',
  'held.strix.quote2': 'Confine thyself to the present.',
  'held.strix.quote2.bron': 'Marcus Aurelius · Meditations, book 8.36 · trans. George Long, 1862',
  'held.strix.quote3':
    'No longer talk at all about the kind of man that a good man ought to be, but be such.',
  'held.strix.quote3.bron': 'Marcus Aurelius · Meditations, book 10.16 · trans. George Long, 1862',
  'held.strix.quote4':
    'Begin the morning by saying to thyself, I shall meet today with people who behave without knowing better; let that not throw me off balance.',
  'held.strix.quote4.bron': 'Marcus Aurelius · Meditations, freely after book 2.1',

  'held.ignis.naam': 'Ignis',
  'held.ignis.ondertitel': 'The Fighter',
  'held.ignis.persoonlijkheid':
    'Short, hard, warm underneath. Talks to you like a coach who believes in you even right after you lost. No pity. Just fire.',
  'held.ignis.quote1':
    'I hated every minute of training, but I said: don’t quit. Suffer now and live the rest of your life as a champion.',
  'held.ignis.quote1.bron': 'Muhammad Ali · Muhammad Ali Center, verified quotations',
  'held.ignis.quote2':
    'The fight is won or lost far away from witnesses, behind the lines, in the gym, out there on the road, long before I dance under those lights.',
  'held.ignis.quote2.bron': 'Muhammad Ali · Muhammad Ali Center, verified quotations',
  'held.ignis.quote3':
    'If my mind can conceive it and my heart can believe it, then I can achieve it.',
  'held.ignis.quote3.bron': 'Muhammad Ali · Muhammad Ali Center, verified quotations',
  'held.ignis.quote4':
    'Only a man who knows what it is like to be defeated can reach down to the bottom of his soul and come up with the extra ounce of power it takes to win when the match is even.',
  'held.ignis.quote4.bron': 'Muhammad Ali · Muhammad Ali Center, verified quotations',

  'held.meridian.naam': 'Meridian',
  'held.meridian.ondertitel': 'The Explorer',
  'held.meridian.persoonlijkheid':
    'Energetic and impatient in the good way. Nudges you just past the edge of your comfort zone and is already waving from the other side.',
  'held.meridian.quote1':
    'Preparation, I have often said, is rightly two-thirds of any venture.',
  'held.meridian.quote1.bron': 'Amelia Earhart · Last Flight, 1937, p. 51',
  'held.meridian.quote2':
    'The more one does and sees and feels, the more one is able to do.',
  'held.meridian.quote2.bron': 'Amelia Earhart · Soaring Wings, 1939, p. 83',
  'held.meridian.quote3':
    'In soloing, as in other activities, it is far easier to start something than it is to finish it.',
  'held.meridian.quote3.bron': 'Amelia Earhart · 20 Hrs., 40 Min., 1928, p. 16',
  'held.meridian.quote4':
    'Women must try to do things as men have tried. When they fail, their failure must be but a challenge to others.',
  'held.meridian.quote4.bron': 'Amelia Earhart · Last Flight, 1937',

  'held.forge.naam': 'Forge',
  'held.forge.ondertitel': 'The Builder',
  'held.forge.persoonlijkheid':
    'Level-headed and precise. No pep talk. Just the question you needed: what is the real problem here, and how do we build around it?',
  'held.forge.quote1':
    'Just as iron rusts from disuse and stagnant water putrefies, or turns to ice in the cold, so our intellect wastes unless it is kept in use.',
  'held.forge.quote1.bron':
    'Leonardo da Vinci · Codex Atlanticus 289v, in Richter & Wells, Notebooks',
  'held.forge.quote2':
    'He who loves practice without theory is like the sailor who boards ship without a rudder and compass and never knows where he may cast.',
  'held.forge.quote2.bron':
    'Leonardo da Vinci · The Literary Works of Leonardo da Vinci, 1883',
  'held.forge.quote3': 'Poor is the pupil who does not surpass his master.',
  'held.forge.quote3.bron':
    'Leonardo da Vinci · Aphorisms, Notebooks · trans. E. MacCurdy, 1938',

  'held.lucerna.naam': 'Lucerna',
  'held.lucerna.ondertitel': 'The Caregiver',
  'held.lucerna.persoonlijkheid':
    'Gentle on the person, strict on the excuses. Gives you room to catch your breath and a clear reason to start again tomorrow.',
  'held.lucerna.quote1': 'I attribute my success to this: I never gave or took an excuse.',
  'held.lucerna.quote1.bron':
    'Florence Nightingale · letter to Miss H. Bonham Carter, 1861',
  'held.lucerna.quote2': 'When a disaster happens, I act and they make excuses.',
  'held.lucerna.quote2.bron':
    'Florence Nightingale · letter to Miss H. Bonham Carter, 1861',
  'held.lucerna.quote3':
    'Feelings waste themselves in words; they ought all to be distilled into actions; actions which bring results.',
  'held.lucerna.quote3.bron': 'Florence Nightingale · letter to Mary Clarke, 1844',
  'held.lucerna.quote4':
    'Nursing is an art: and if it is to be made an art, it requires an exclusive devotion as hard a preparation as any painter’s or sculptor’s work.',
  'held.lucerna.quote4.bron': 'Florence Nightingale · Good Words, 1868',

  'held.quip.naam': 'Quip',
  'held.quip.ondertitel': 'The Jester',
  'held.quip.persoonlijkheid':
    'Dry humour, a crooked grin, always a contrary remark ready. Takes the pressure off without making your goal the joke.',
  'held.quip.quote1':
    'Courage is resistance to fear, mastery of fear; not absence of fear.',
  'held.quip.quote1.bron':
    'Mark Twain · Pudd’nhead Wilson’s Calendar, in Following the Equator, 1897',
  'held.quip.quote2':
    'Whenever you find yourself on the side of the majority, it is time to pause and reflect.',
  'held.quip.quote2.bron':
    'Mark Twain · Pudd’nhead Wilson’s Calendar, in Following the Equator, 1897',
  'held.quip.quote3':
    'Habit is habit, and not to be flung out of the window by any man, but coaxed downstairs a step at a time.',
  'held.quip.quote3.bron':
    'Mark Twain · Pudd’nhead Wilson’s Calendar, in Following the Equator, 1897',

  // The four hero questions — QS8-474, epic QS8-468. See nl.ts for why the
  // option order lives in `HELDVRAAGOPTIES` and not here.

  'heldvraag.aantrekking.vraag': 'What draws you in most about a new goal?',
  'heldvraag.aantrekking.toelichting': 'One answer. Go with your first thought.',
  'heldvraag.aantrekking.optie.meridian': 'Taking the first leap',
  'heldvraag.aantrekking.optie.forge': 'Mapping out a plan',
  'heldvraag.aantrekking.optie.strix': 'Keeping the end in clear view',
  'heldvraag.aantrekking.optie.ignis': 'Just going for it, win or lose',
  'heldvraag.aantrekking.optie.lucerna': 'Bringing someone along',
  'heldvraag.aantrekking.optie.quip': 'Keeping it enjoyable above all',

  'heldvraag.tegenslag.vraag': 'A setback: what is your first reaction?',
  'heldvraag.tegenslag.toelichting': 'Not what you should do, but what you actually do.',
  'heldvraag.tegenslag.optie.ignis': 'Push through, teeth clenched',
  'heldvraag.tegenslag.optie.quip': 'Pause a moment and take the edge off with humour',
  'heldvraag.tegenslag.optie.forge': 'Go back to basics and revise the plan',
  'heldvraag.tegenslag.optie.lucerna': 'Take a break and go easy on myself',
  'heldvraag.tegenslag.optie.strix': 'Think about what this teaches me',
  'heldvraag.tegenslag.optie.meridian': 'Work out a different route',

  'heldvraag.motivatie.vraag': 'What keeps you going the most?',
  'heldvraag.motivatie.toelichting': 'What you still do it for on an average day.',
  'heldvraag.motivatie.optie.ignis': 'Proving it can be done',
  'heldvraag.motivatie.optie.meridian': 'Curiosity about what else is possible',
  'heldvraag.motivatie.optie.forge': 'The feeling of building something good',
  'heldvraag.motivatie.optie.strix': 'Inner calm and a clear overview',
  'heldvraag.motivatie.optie.lucerna': 'Support from and for other people',
  'heldvraag.motivatie.optie.quip': 'That it simply has to stay fun',

  'heldvraag.viering.vraag': 'How do you most like to celebrate a win?',
  'heldvraag.viering.toelichting': 'Last question. After this you see everything at a glance.',
  'heldvraag.viering.optie.quip': 'With a joke or a party',
  'heldvraag.viering.optie.strix': 'Quietly reflecting on what you learned',
  'heldvraag.viering.optie.meridian': 'Moving straight on to the next goal',
  'heldvraag.viering.optie.lucerna': 'Sharing it with the people who backed you',
  'heldvraag.viering.optie.ignis': 'Being proud that you won the fight',
  'heldvraag.viering.optie.forge': 'Looking at how to improve the system further',

  'vragenlijst.held.vraag': 'Your hero',
  'vragenlijst.held.kop': 'Who walks with you',
  'vragenlijst.held.een':
    'Your answers point to one hero. That is the voice you will hear at your check-ins.',
  'vragenlijst.held.gelijk':
    'Your answers point equally to {aantal} heroes. Pick the one you want walking with you.',
  'vragenlijst.held.geen':
    'You skipped the hero questions. That is fine: you get no fixed hero, and the rest of the app works as usual.',
  'vragenlijst.held.gekozen': 'This is your hero. Tap another one to switch.',
  'vragenlijst.held.blijft':
    'This is your hero right now. Answer the four hero questions again to switch.',
  'vragenlijst.held.laadt': 'Checking which hero you have right now.',
  'vragenlijst.held.fout':
    'Your current hero could not be loaded. Answer the four questions to pick one.',
  'vragenlijst.held.kies_een': 'Pick one',
  'vragenlijst.held.opslaan_mislukt': 'Your hero could not be saved. Please try again in a moment.',
  // How do you want to feel — QS8-733. Only for yourself; see migration 0311.
  'vragenlijst.stap_van': 'Question {stap} of {totaal}',
  'vragenlijst.gevoel.vraag': 'How do you want to feel?',
  'vragenlijst.gevoel.toelichting':
    'Pick what fits best, or describe it yourself. This stays yours: your group never sees it.',
  'vragenlijst.gevoel.calm': 'Calm',
  'vragenlijst.gevoel.motivated': 'Motivated',
  'vragenlijst.gevoel.proud': 'Proud',
  'vragenlijst.gevoel.supported': 'Supported',
  'vragenlijst.gevoel.energetic': 'Energetic',
  'vragenlijst.gevoel.focused': 'Focused',
  'vragenlijst.gevoel.eigen_label': 'Or in your own words',
  'vragenlijst.gevoel.eigen_hint':
    'Only you see this, in your profile under Daily reminder. It never appears in a notification.',
  'vragenlijst.gevoel.eigen_plaatshouder': 'For example: step by step',
  'vragenlijst.gevoel.eigen_teller': '{aantal} of {max} characters',
  'vragenlijst.gevoel.eigen_te_lang': 'At most {max} characters.',
  'vragenlijst.gevoel.regel': 'How you want to feel',
  'vragenlijst.voorbeeld.vraag': 'This is what your reminder looks like',
  'vragenlijst.voorbeeld.toelichting':
    'This is the nudge you get if you turn notifications on: one a day, only for you, and only if you have not done anything yet that day. You turn notifications on or off in your profile.',
  'vragenlijst.voorbeeld.a11y': 'Example of your reminder',
  'profiel.motto': 'How you want to feel: {tekst}',
  // Organisaties en teams — QS8-657
  'organisatie.ingang_kop':
    'Organisations',
  'organisatie.ingang_uitleg':
    'For the teams at your work. Your buddy groups stay separate.',
  'organisatie.ingang_leeg':
    'You are not in any organisation yet.',
  'organisatie.ingang_storing':
    'Your organisations could not be loaded.',
  'organisatie.ingang_aanmaken':
    'Create an organisation',
  'organisatie.ingang_deelnemen':
    'Join with a code',
  'organisatie.eyebrow':
    'Organisation',
  'organisatie.rol_beheerder':
    'admin',
  'organisatie.jouw_rol_beheerder':
    'You are an admin of this organisation.',
  'organisatie.jouw_rol_lid':
    'You are a member of this organisation.',
  'organisatie.nieuw_titel':
    'Create an organisation',
  'organisatie.naam_label':
    'Name of the organisation',
  'organisatie.naam_hint':
    'This is how your colleagues see the organisation. You become its admin.',
  'organisatie.naam_teller':
    '{aantal} of {max} characters',
  'organisatie.nieuw_knop':
    'Create organisation',
  'organisatie.naam_leeg':
    'Give the organisation a name.',
  'organisatie.naam_lang':
    'That name is too long. 80 characters at most.',
  'organisatie.naam_ongeldig':
    'That name contains characters that are not allowed. Try it without invisible or formatting characters.',
  'organisatie.aanmaken_mislukt':
    'The organisation could not be created. Please try again.',
  'organisatie.rate_limited_aanmaken':
    'You already created three organisations today. You can try again tomorrow.',
  'organisatie.te_veel':
    'You are already in ten organisations. Leave one to make room.',
  'organisatie.niet_toegelaten':
    'Creating an organisation is not possible yet. You can join an organisation with an invitation or a code.',
  'organisatie.deelnemen_titel':
    'Join an organisation',
  'organisatie.code_label':
    'Invitation code',
  'organisatie.code_hint':
    'You get the code from an admin of the organisation.',
  'organisatie.deelnemen_knop':
    'Join',
  'organisatie.deelnemen_mislukt':
    'Joining did not work. Please try again in a moment.',
  'organisatie.code_ongeldig':
    'This code does not work. It was withdrawn or it is wrong; ask an admin for a new one.',
  'organisatie.rate_limited_deelnemen':
    'You tried too many codes today. Try again tomorrow.',
  'organisatie.niet_gevonden_titel':
    'Organisation not found',
  'organisatie.niet_gevonden_tekst':
    'This organisation does not exist or you do not have access to it.',
  'organisatie.leden_kop':
    'Members',
  'organisatie.leden_laden':
    'The members could not be loaded.',
  'organisatie.leden_leeg_titel':
    'No members to show',
  'organisatie.leden_leeg_tekst':
    'There are no members to show right now.',
  'organisatie.meer_laden':
    'Load more',
  'organisatie.meer_mislukt':
    'Loading more did not work. Please try again.',
  'organisatie.acties_label': 'Actions for {naam}',
  'organisatie.uitzetten_label': 'Remove {naam} from the organisation',
  'organisatie.uitzetten_knop':
    'Remove',
  'organisatie.uitzetten_titel':
    'Remove this member?',
  'organisatie.uitzetten_uitleg':
    '{naam} loses access to this organisation and cannot come back with the code. To make sure the old code stops working too, the organisation gets a new code afterwards.',
  'organisatie.uitzetten_bevestig':
    'Yes, remove {naam}',
  'organisatie.uitzetten_mislukt':
    'Removing did not work. Please try again.',
  'organisatie.teams_kop':
    'Teams',
  'organisatie.teams_laden':
    'The teams could not be loaded.',
  'organisatie.teams_uitleg':
    'You only see the names of the teams here. What happens in a team is visible to the members of that team only.',
  'organisatie.teams_leeg_titel':
    'This organisation has no teams yet',
  'organisatie.teams_leeg_tekst':
    'An admin can create a team.',
  'organisatie.team_nieuw_knop':
    'Create a team',
  'organisatie.team_naam_label':
    'Name of the team',
  'organisatie.team_naam_hint':
    'At least two characters, 60 at most.',
  'organisatie.team_opslaan':
    'Create',
  'organisatie.team_aanmaken_mislukt':
    'The team could not be created. Please try again.',
  'organisatie.team_gemaakt':
    'The team was created.',
  'organisatie.code_kop':
    'Invitation code',
  'organisatie.code_uitleg':
    'Share this code with colleagues so they can join. Only admins see it.',
  'organisatie.code_ingetrokken':
    'The code was withdrawn. Nobody can join with it right now.',
  'organisatie.code_laden':
    'The code could not be loaded.',
  'organisatie.code_leeg_titel':
    'No code available',
  'organisatie.code_leeg_tekst':
    'Only an admin can see the code.',
  'organisatie.code_vernieuwen_knop':
    'Make a new code',
  'organisatie.code_vernieuwen_titel':
    'Make a new code?',
  'organisatie.code_vernieuwen_uitleg':
    'The current code stops working. Anyone who has it needs the new code. Current members stay members.',
  'organisatie.code_vernieuwen_bevestig':
    'Yes, new code',
  'organisatie.code_intrekken_knop':
    'Withdraw the code',
  'organisatie.code_intrekken_titel':
    'Withdraw the code?',
  'organisatie.code_intrekken_uitleg':
    'After that nobody can join with a code until you make a new one. Current members stay members.',
  'organisatie.code_intrekken_bevestig':
    'Yes, withdraw',
  'organisatie.rate_limited_code':
    'You already changed the code ten times today. You can try again tomorrow.',
  'organisatie.actie_mislukt':
    'That did not work. Please try again.',
  'organisatie.niet_toegestaan':
    'Only an admin of this organisation can do this.',
  'organisatie.geen_lid':
    'You are not a member of this organisation.',
  'organisatie.verlaten_knop':
    'Leave organisation',
  'organisatie.verlaten_titel':
    'Leave this organisation?',
  'organisatie.verlaten_uitleg':
    'You lose access to the organisation and leave its teams. You cannot get back in with the code. Your other groups stay as they are.',
  'organisatie.verlaten_bevestig':
    'Yes, leave',
  'organisatie.verlaten_mislukt':
    'Leaving did not work. Please try again.',
  'organisatie.laatste_beheerder':
    'You are the only admin of this organisation, so you cannot leave it.',
  'organisatie.verwijder_waarschuwing':
    'Are you the only admin of {naam}? Then nobody can invite new members there after you delete your account. Everyone already in keeps everything.',
  'organisatie.verwijder_waarschuwing_storing':
    'We could not check whether you are an admin of an organisation. If you are, and you are the only one, hand over the admin role first. Otherwise nobody can invite new members afterwards.',
  // Teamdoelen en de teambalk — QS8-658
  'teamdoel.ingang_kop':
    'Team goals',
  'teamdoel.ingang_uitleg':
    'This is a group of your organisation. Here are the goals you reach together.',
  'teamdoel.ingang_knop':
    'Team goals',
  'teamdoel.ingang_storing':
    'We could not check whether this is a team group.',
  'teamdoel.lijst_titel':
    'Team goals',
  'teamdoel.lijst_eyebrow':
    'Team',
  'teamdoel.lijst_laden':
    'The team goals could not be loaded.',
  'teamdoel.lijst_leeg_titel':
    'No team goal yet',
  'teamdoel.lijst_leeg_tekst':
    'Any member of the team can create a team goal.',
  'teamdoel.meer_laden':
    'Show more team goals',
  'teamdoel.meer_mislukt':
    'Loading more team goals failed. Try again.',
  'teamdoel.aanmaken_knop':
    'Create a team goal',
  'teamdoel.nieuw_titel':
    'New team goal',
  'teamdoel.titel_label':
    'What do you want to reach together?',
  'teamdoel.titel_hint':
    'One line. Your colleagues see this title.',
  'teamdoel.titel_teller':
    '{aantal} of {max} characters',
  'teamdoel.beschrijving_label':
    'Description (optional)',
  'teamdoel.beschrijving_teller':
    '{aantal} of {max} characters',
  'teamdoel.datum_label':
    'Target date',
  'teamdoel.datum_hint':
    'Anyone who takes a share gets the same target date.',
  'teamdoel.opslaan':
    'Save team goal',
  'teamdoel.titel_leeg':
    'Give the team goal a title.',
  'teamdoel.titel_lang':
    'The title is too long: keep it to 200 characters or fewer.',
  'teamdoel.titel_ongeldig':
    'Give the team goal a title of 1 to 200 characters.',
  'teamdoel.beschrijving_lang':
    'The description is too long: keep it to 2000 characters or fewer.',
  'teamdoel.datum_ongeldig':
    'Pick a target date.',
  'teamdoel.datum_voorbij':
    'That target date has already passed. Pick a date from today.',
  'teamdoel.tekst_ongeldig':
    'The text contains characters we cannot save. Remove them and try again.',
  'teamdoel.daglimiet':
    'You have already created ten team goals today. Tomorrow it works again.',
  'teamdoel.niet_toegestaan':
    'This did not work. You are not in this team, or the team goal does not exist.',
  'teamdoel.aanmaken_mislukt':
    'Creating the team goal failed. Try again.',
  'teamdoel.niet_gevonden_titel':
    'Team goal not found',
  'teamdoel.niet_gevonden_tekst':
    'This team goal does not exist, or you do not have access to it.',
  'teamdoel.laden_mislukt':
    'The team goal could not be loaded.',
  'teamdoel.streefdatum':
    'Target date {datum}',
  'teamdoel.loopt_nog':
    'This team goal is still running.',
  'teamdoel.afgerond':
    'This team goal is complete.',
  'teamdoel.balk_kop':
    'Team bar',
  'teamdoel.balk_een':
    '1 milestone reached',
  'teamdoel.balk_meer':
    '{n} milestones reached',
  'teamdoel.balk_uitleg':
    'The counter only goes up: milestones the team reached together.',
  'teamdoel.aandeel_kop':
    'Your share',
  'teamdoel.aandeel_uitleg':
    'A share is a personal goal; your colleagues do not see how far along you are.',
  'teamdoel.aandeel_nemen':
    'Take a share',
  'teamdoel.aandeel_bekijk':
    'Go to your share',
  'teamdoel.aandeel_heb':
    'You have a share in this team goal.',
  'teamdoel.aandeel_mislukt':
    'Taking a share failed. Try again.',
  'teamdoel.niet_actief':
    'This team goal is no longer active, so you cannot take a share in it.',
  'teamdoel.al_aandeel':
    'You already have a share in this team goal.',
  'teamdoel.streefdatum_verstreken':
    'The target date of this team goal has passed, so you can no longer take a share in it.',
};
