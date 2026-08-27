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
  'systeembericht.chain_milestone': 'The Chain of this group now counts {aantal} links.',
  'systeembericht.group_opened':
    '{naam} opened up this group. From now on members also see each other’s setbacks.',
  'systeembericht.group_protected':
    '{naam} made this group protected again. Other people’s setbacks are no longer visible.',

  'algemeen.oud_lid': 'A former member',

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
  'validatie.link_https': 'An image link has to start with https://.',

  'bevestiging.annuleren': 'Cancel',
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

  'weekpas.punt_toch_af': 'Last week was not completed, but your streak continues. One point did come off for that week.',
  'laden.mislukt': 'Something went wrong while loading. Try again; if it keeps failing, it is on us.',
  'laden.opnieuw': 'Try again',
  'mijlpaal.voortgang_label': '{gehaald} of {totaal} milestones reached',
  'uitnodiging.open_waarschuwing': 'If you join, this group also sees your missed weeks.',
  'uitnodiging.titel': 'You have been invited',
  'uitnodiging.titel_verlopen': 'This link no longer works',
  'uitnodiging.eyebrow': 'BUDDY GROUP',
  'uitnodiging.leeg_titel': 'This invitation no longer works',
  'uitnodiging.leeg_tekst': 'The link was withdrawn or replaced by a new one. Ask whoever invited you to send it again — then you will get the valid one straight away.',
  'uitnodiging.leden_een': '{n} member · huddle day {dag}',
  'uitnodiging.leden_meer': '{n} members · huddle day {dag}',
  'uitnodiging.geen_gedeeld_doel': 'Not working on a shared goal yet',
  'uitnodiging.pas_bij_meedoen': 'You will see what they are working on once you join. That is deliberate: what people share here, they share with their group and not with everyone who gets the link.',
  'uitnodiging.wat_je_doet': 'What you will be doing here',
  'uitnodiging.uitleg_kern': 'You pick one goal with a date on it. Each week you decide what you want to finish, and one of your buddies approves that you did. That is all.',
  'uitnodiging.uitleg_missen_beschermd': 'Missing a week costs one point and nothing else. Nobody in the group sees it.',
  'uitnodiging.uitleg_missen_open': 'Missing a week costs one point and nothing else. In this group the others do see it — that is what “open” above means.',
  'uitnodiging.al_lid': 'You are in the group',
  'uitnodiging.doorsturen': 'You are being taken to the group.',
  'uitnodiging.eerst_profiel': 'Finish your profile first — the group will be waiting for you.',
  'uitnodiging.naar_groep': 'To the group',
  'uitnodiging.profiel_afmaken': 'Finish profile',
  'uitnodiging.deelnemen': 'Join this group',
  'uitnodiging.inloggen': 'Sign in or create an account',
  'uitnodiging.blijft_bewaard': 'Your invitation is kept on this device. Even if you have to confirm your email first, you will be in the group afterwards.',
  'uitnodiging.rondkijken': 'Just have a look around',
  'uitnodiging.deelnemen_mislukt': 'Joining did not work. Please try again in a moment.',
  'aanmelden.titel_nieuw': 'Create account',
  'aanmelden.titel_terug': 'Welcome back',
  'aanmelden.eyebrow': 'GOALBUDDIES',
  'aanmelden.email': 'Email address',
  'aanmelden.email_hint': 'you@example.com',
  'aanmelden.wachtwoord': 'Password',
  'aanmelden.wachtwoord_hint': 'At least 12 characters. A short sentence works well and is easier to remember.',
  'aanmelden.knop_nieuw': 'Create account',
  'aanmelden.knop_inloggen': 'Sign in',
  'aanmelden.heb_al_account': 'I already have an account',
  'aanmelden.ben_nieuw': 'I am new here',
  'aanmelden.bestaand_account': 'Or use an existing account',
  'aanmelden.alleen_browser': 'Signing in with Apple or Google currently only works in the browser.',
  'beoordeling.titel': 'Review',
  'beoordeling.leeg_titel': 'Nothing to review',
  'beoordeling.leeg_tekst': 'As soon as a buddy finishes a week, it shows up here. One line back is enough — that is the point.',
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
  'beheer.bewijs_hint': 'A thumbs up on a claim is a formality. One sentence costs ten seconds and gives your buddy something to respond to — that is what gets the conversation going.',
  'beheer.bijlagen_nog_niet': 'Attachments are not possible yet: there is no storage. If you pick that setting, only the note applies for now. Changing it does not affect existing completions.',
  'beheer.opslaan': 'Save',
  'beheer.link_titel': 'Invite link',
  'beheer.link_uitleg': 'Whoever opens this link sees the group and how many people are in it — even without an account. What you share in goals is only visible after joining. Still, only share the link with people you want in.',
  'beheer.deel': 'Share the invitation',
  'beheer.deel_titel': 'Join {groep}',
  'beheer.kopieer': 'Or copy it by hand',
  'beheer.link_gesloten': 'The link is closed. Nobody can get in with it right now.',
  'beheer.nieuwe_link': 'Create a new link',
  'beheer.link_openzetten': 'Open the link again',
  'beheer.link_sluiten': 'Close the link',
  'beheer.sluiten_uitleg': 'Closing keeps the code but refuses everyone. Creating a new link replaces the code, and then the old one is dead for good — that is what you do when a link ended up somewhere it should not have.',
  'beheer.terug': 'Back to the group',
  'beheer.melding_gesloten': 'The link is closed.',
  'beheer.melding_open': 'The link is open again.',
  'onboarding.eyebrow': 'ONE MORE SCREEN',
  'onboarding.dagelijkse_herinnering': 'Daily reminder',
  'onboarding.uit_blijft_uit': 'Off stays off. We will not send you anything.',
  'onboarding.stap1.kop': 'One goal, with a date on it',
  'onboarding.stap1.a': 'You start with one goal that has to be finished on a day you pick. Not five goals — one.',
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
  'onboarding.stap4.b': 'Missing a week costs you one point and nothing else. In a protected group — the default — nobody sees it. If a group deliberately chooses to be open, you are told before you join.',
  'onboarding.stap_van': 'STEP {nu} OF {totaal}',
  'onboarding.zo_ziet_eruit': 'Here is what that looks like',
  'onboarding.voorbeeld_titel': 'Run three times',
  'onboarding.voorbeeld_vloer': 'Once, even if it is twenty minutes',
  'onboarding.voorbeeld_plafond': 'Three times, at least five kilometres',
  'onboarding.aan_de_slag': 'Get started',
  'onboarding.verder': 'Next',
  'onboarding.overslaan': 'Skip',
  'onboarding.profiel_titel': 'A bit about you',
  'onboarding.naamloos': 'Nameless',
  'onboarding.naam': 'What is your name?',
  'onboarding.naam_hint': 'This is what your buddies see. A first name is enough.',
  'onboarding.naam_plaatshouder': 'Quinten',
  'onboarding.geen_avatar': 'No avatar? Then we show your initials. Uploading a photo will be possible once we have storage.',
  'onboarding.herinnering': 'Reminder',
  'onboarding.aan': 'On',
  'onboarding.uit': 'Off',
  'onboarding.hoe_laat': 'What time?',
  'onboarding.toon': 'Tone',
  'onboarding.toon_hint': 'Decides how the text sounds, not how often you get it.',
  'onboarding.zacht': 'Gentle',
  'onboarding.streng': 'Strict',
  'onboarding.waarvoor': 'What brings you here?',
  'onboarding.waarvoor_hint': 'Did you come in to help a friend? Then you do not need a goal yourself. You can always make one later.',
  'onboarding.zelf_doel': 'I want a goal of my own',
  'onboarding.kom_helpen': 'I came to help',
  'onboarding.klaar': 'Done',
  'groepdetail.zichtbaarheid': 'This group’s visibility: {stand}',
  'groepdetail.titel': 'Group',
  'groepdetail.eyebrow': 'HUDDLE DAY {dag}',
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
  'groepdetail.uitnodigen': 'Invite someone',
  'groepdetail.link_uitleg': 'Whoever opens this link sees the group and how many people are in it — even without an account. Only share it with people you want in.',
  'groepdetail.deel': 'Share the invitation',
  'groepdetail.deel_titel': 'Join {groep}',
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
  'koppel.ontkoppel': 'Stop sharing with this group',
  'koppel.titel': 'Share your goal with this group',
  'koppel.uitleg_beschermd': 'As long as you link nothing, nobody here sees what you are working on. Linking shares the title and your milestone progress — not your notes, not your weeks and not your points. You can always undo it.',
  'koppel.uitleg_open': 'As long as you link nothing, nobody here sees what you are working on. This group is open: linking shares the title, your milestone progress and your weeks — including the weeks you did not make. Your notes and your points stay yours. You can always undo it.',
  'koppel.geen_doel_titel': 'You do not have a goal to share yet',
  'koppel.geen_doel_tekst': 'Start with one goal with a date on it. After that you can link it to this group here.',
  'koppel.nieuw_doel': 'New goal',
  'deelnemen.titel': 'Join',
  'deelnemen.eyebrow': 'WITH A CODE',
  'deelnemen.code_label': 'Invite code or link',
  'deelnemen.code_hint': 'Twelve characters. Dashes, spaces and the whole link are fine; we strip those ourselves.',
  'deelnemen.herkend': 'Recognised as: {code}',
  'deelnemen.knop': 'Join this group',
  'deelnemen.werkt_niet': 'Code not working?',
  'deelnemen.werkt_niet_uitleg': 'A link may have been withdrawn, or replaced by a new one. Ask whoever invited you to send the link again — that one will be valid.',
  'deelnemen.terug': 'Back',
  'groepnieuw.titel': 'New group',
  'groepnieuw.eyebrow': 'THREE IS THE BEST SIZE',
  'groepnieuw.naam': 'What is your group called?',
  'groepnieuw.naam_hint': 'Two to sixty characters. Something you will recognise in a WhatsApp message.',
  'groepnieuw.naam_voorbeeld': 'The Thursday club',
  'groepnieuw.huddledag': 'Huddle day',
  'groepnieuw.huddledag_hint': 'The day you come together. It decides the weekly wrap-up, The Chain and the group overview — not when your own weekly goals reset, because that stays your personal week start day.',
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
  'doelen.titel': 'Goals',
  'doelen.leeg_titel': 'No goal yet',
  'doelen.leeg_tekst': 'Start with one goal with a date on it. The Goal Coach then cuts it into milestones, and those milestones become your weekly goals.',
  'doelen.van_totaal': '{aantal} of {totaal} goals. Loading more arrives once there are more than twenty.',
  'doelen.nieuw': 'New goal',
  'doelen.doel': 'Goal',
  'doelen.streefdatum': 'Target date {datum}',
  'doelen.datum_verstreken': 'Date passed',
  'doelen.weken_afgerond': '{n} weeks completed',
  'groepen.titel': 'Group',
  'groepen.leeg_titel': 'No buddy group yet',
  'groepen.leeg_tekst': 'Three people is the best size: big enough that someone always responds, small enough that you cannot hide. Create a group or use the invite link you were given.',
  'groepen.aanmaken': 'Create group',
  'groepen.heb_code': 'I have an invite code',
  'groepen.wachten_onbekend': 'Are buddies waiting on you?',
  'groepen.wacht_een': 'One buddy is waiting on you',
  'groepen.wachten_meer': '{n} buddies are waiting on you',
  'groepen.ophalen_mislukt': 'We could not fetch that just now. Have a look yourself — it takes ten seconds.',
  'groepen.week_afgerond': 'They finished their week. One line back is enough — that is the whole point.',
  'groepen.beoordelen': 'Review',
  'groepen.slaapt': 'This group is asleep. As soon as someone finishes a week, it wakes right up.',
  'groepen.huddledag': 'Huddle day: {dag}',
  'profiel.titel': 'Profile',
  'profiel.leeg_titel': 'No profile found',
  'profiel.leeg_tekst': 'That should not be possible. Sign out and back in; if it keeps failing, it is on us.',
  'profiel.eigen_doel': 'Working on a goal of their own',
  'profiel.als_buddy': 'Taking part as a buddy',
  'profiel.reeks_titel': 'Your streak',
  'profiel.reeks_uitleg': 'Your streak counts weeks and appears per goal under “Your standing” on Today. A week pass protects your streak if you miss a week — not the point, because otherwise the score means nothing.',
  'profiel.verwijder_titel': 'Delete account',
  'profiel.verwijder_uitleg': 'Your goals, weeks, Daily Moves, points and memberships disappear. What stays are the approvals you gave your buddies and your messages in the group chat — without your name on them. Those are theirs.',
  'profiel.verwijder_knop': 'I want to delete my account',
  'profiel.zeker_weten': 'Are you sure?',
  'profiel.geen_backup': 'This cannot be undone. There is no backup and no recovery period.',
  'profiel.typ_woord': 'Type {woord} to confirm',
  'profiel.definitief': 'Delete permanently',
  'profiel.toch_niet': 'Never mind',
  'profiel.weekstart_uitleg': 'If you change this halfway through a week, the running week still counts out on the old day. Your points and your streak stay.',
  'profiel.thema_systeem': 'System',
  'profiel.thema_donker': 'Dark',
  'profiel.thema_licht': 'Light',
  'profiel.weergave': 'Appearance',
  'profiel.weergave_uitleg': 'Dark is the default of this system. If you pick System, the app follows your device setting — including when it switches in the evening.',
  'profiel.weergave_label': 'Appearance: {stand}',
  'profiel.herinnering_titel': 'Daily reminder',
  'profiel.herinnering_uitleg': 'One quiet nudge a day, and only if you have not done anything yet. Wrote a Daily Move today or closed a week? Then it stays silent.',
  'profiel.herinnering_label': 'Reminder',
  'profiel.herinnering_hoe_laat': 'What time',
  'profiel.herinnering_hoe_laat_hint': 'In your own time zone, on a 24-hour clock. For example 20:00.',
  'profiel.herinnering_toon': 'Tone',
  'profiel.herinnering_toon_hint': 'Firm is more direct, never accusing. The app does not hold anything against you.',
  'profiel.herinnering_zacht': 'Gentle',
  'profiel.herinnering_streng': 'Firm',
  'profiel.herinnering_uit_blijft_uit': 'Off means off. Turn it back on later and you pick a time again — it does not return on its own.',
  'profiel.herinnering_bewaren': 'Save reminder',
  'profiel.herinnering_bewaard': 'Saved.',
  'profiel.herinnering_geen_meldingen': 'Turn notifications on above, otherwise nothing gets delivered.',
  'profiel.viering_titel': 'Celebratory moments',
  'profiel.viering_uitleg': 'A short congratulation when a buddy confirms your week, you reach a milestone or your goal is done. Otherwise the app stays quiet.',
  'profiel.viering_aan_label': 'Celebratory moments on',
  'profiel.viering_uit_label': 'Celebratory moments off',
  'profiel.aan': 'On',
  'profiel.uit': 'Off',
  'profiel.viering_beweging': 'If your device asks for reduced motion, the app leaves out the animation anyway. The text simply stays.',
  'profiel.bijdrage_titel': 'Buddy contribution',
  'profiel.bijdrage_mislukt': 'Cannot fetch that right now. Your contribution is still there, it just cannot be counted.',
  'profiel.bijdrage_geen': 'You have not reviewed a buddy’s week yet.',
  'profiel.bijdrage_een': 'You have reviewed one week of a buddy.',
  'profiel.bijdrage_meer': 'You have reviewed {n} weeks of buddies.',
  'profiel.bijdrage_uitleg': 'Reviewing counts. Asking a question is worth just as much as approving — it is about being involved, not about saying yes.',
  'profiel.meldingen': 'Notifications',
  'profiel.meldingen_aanzetten': 'Turn on notifications',
  'profiel.meldingen_uitzetten': 'Turn off notifications',
  'profiel.meldingen_uit_gelukt': 'Notifications are off on this device.',
  'profiel.meldingen_uit_mislukt': 'Turning them off did not work. Try again in a moment.',
  'profiel.meldingen_mislukt': 'Turning it on did not work. Please try again in a moment.',
  'profiel.meldingen_aan': 'Notifications are on. You get a message when a buddy approves your week or when your wrap-up is ready.',
  'profiel.meldingen_uit': 'Get a message when a buddy approves your week or when your wrap-up is ready. We ask your browser for permission once.',
  'profiel.meldingen_geweigerd': 'You refused notifications earlier. That can only be undone in your browser settings — we cannot ask again.',
  'profiel.meldingen_niet_ondersteund': 'This browser cannot receive notifications.',
  'profiel.meldingen_geen_sleutel': 'Notifications are not ready in this environment yet. This is not on you.',
  'profiel.beginscherm_ios': 'On iPhone and iPad, notifications only work when the app is on your home screen. Tap Share and choose Add to Home Screen; then open it from there.',
  'profiel.beginscherm_safari': 'On iPhone and iPad, notifications only work from Safari. Open goalbuddies.q-projects.tech in Safari and add it to your home screen there.',
  'vandaag.titel': 'Today',
  'vandaag.eyebrow_week': 'WEEK OF {datum}',
  'vandaag.eyebrow_deze': 'THIS WEEK',
  'vandaag.coulance_titel': 'Your previous week is still running',
  'vandaag.coulance_tekst': 'Your new week has started, but you can still wrap up the week of {datum}. That window lasts twelve hours — done on Sunday evening, logged on Monday morning.',
  'vandaag.leeg_titel': 'No weekly goals yet',
  'vandaag.leeg_tekst': 'A weekly goal is what you want to finish this week. Give it a floor — the version you still manage on your worst week — and a ceiling. Reaching the floor counts: your streak continues. You create it on the goal it belongs to.',
  'vandaag.weekdoel_toevoegen': 'Add weekly goal',
  'vandaag.toevoegen_uitleg': 'You create a weekly goal on the goal it belongs to.',
  'vandaag.stand': 'Your standing',
  'vandaag.stand_leeg': 'As soon as your first week is approved, your streak and your points appear here.',
  'vandaag.openstaand': 'Still open from earlier weeks',
  'vandaag.meenemen_uitleg': 'You can carry these into the week that is running now. The week itself stays missed — carrying moves the work, it does not restore your streak.',
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

  'coach.bewaard': 'Saved',
  'coach.bewaren': 'Save answers',
  'coach.alle_overnemen': 'Take all {aantal}',
  'coach.titel': 'The Goal Coach',
  'coach.vastgelopen': 'The Goal Coach got stuck.',
  'coach.daglimiet': 'You have used the Goal Coach {limiet} times today. It resets tomorrow — in the meantime you can add milestones yourself.',
  'coach.eyebrow': 'SIX QUESTIONS',
  'coach.zes_vragen': 'Six questions, and you may skip every one of them. The more you fill in, the better the milestones fit you — but skipping works fine.',
  'coach.alleen_voor_jou': 'Your answers are only for you and the Goal Coach. Your group never sees them.',
  'coach.bewaren_niet_nodig': 'Saving is not needed to continue — the Goal Coach uses what is here.',
  'coach.denkt_na': 'The Goal Coach is thinking',
  'coach.duurt_even': 'This takes about twenty seconds. You can keep this screen open; the result arrives by itself.',
  'coach.lukte_niet': 'That did not work',
  'coach.zelf_toevoegen': 'Add milestones yourself',
  'coach.opnieuw': 'Try again',
  'coach.bedenking': 'The Goal Coach has a reservation',
  'coach.bedenking_uitleg': 'You can simply take the milestones. Moving your target date or making your goal smaller can be done afterwards on the goal screen.',
  'coach.neem_over': 'Take them over and adjust them afterwards however you like — deleting, rewriting and reordering can all be done on the goal screen.',
  'coach.toch_niet': 'Never mind',
  'coach.al_mijlpalen': 'You already have milestones on this goal. Taking these over adds them and does not replace them — delete what you do not want to keep first.',
  'coach.laten_voorstellen': 'Have milestones suggested',
  'coach.wat_hij_doet': 'The Goal Coach cuts your goal into milestones with target dates, based on what you filled in above. You can change everything afterwards.',
  'coach.tien_per_dag': 'You can do this ten times a day. The same question within a day does not cost a new turn.',
  'coach.genereer': 'Generate milestones',
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

  'chat.titel': 'Group chat',
  'chat.eyebrow': 'GROUP CHAT',
  'chat.geen_lid_titel': 'This group is not here, or not for you',
  'chat.geen_lid_tekst': 'You are not a member of this group, or it no longer exists. Ask for a new invite link if you belong here.',
  'chat.ouder_laden': 'Load older',
  'chat.nog_niets': 'No messages yet. One line is enough — “what are you doing this week?” works better than a long introduction.',
  'chat.terug': 'Back to the group',
  'chat.sessie_laadt': 'Your session is still loading. Try again in a second.',
  'chat.invoer_label': 'New message',
  'chat.invoer_hint': 'Say something to your group',
  'chat.versturen': 'Send',
  'chat.laden_mislukt': 'The messages could not be loaded.',
  'chat.controleer': 'Check your message.',
  'chat.leeg': 'There is nothing in your message yet.',
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
  'weekafsluiting.mogen_leeg': 'All three may stay empty. Whoever fills in nothing does not appear on the card — no empty line comes of it.',
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
    'Fill in at least one question. Skipping all three is fine too — then nothing is saved.',
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
    'This goal has been around too long to delete. Archive it — then your history ' +
    'stays and it disappears from your list.',
  'doel.gedeeld_met_groep': 'This goal is linked to a group. Unlink it first, or archive it.',
  'doel.heeft_weekdoelen':
    'Weekly goals already hang off this goal. Archive it instead of deleting it.',
  'doel.heeft_punten':
    'Points have already been booked on this goal. Archive it instead of deleting it.',
  'doel.commitment_in_werking':
    'Your reward or penalty has already come into effect. Archive this goal instead of deleting it.',

  'doel.reeks_laden': 'Your streak could not be loaded.',
  'doel.weekpassen_laden': 'Your week passes could not be loaded.',

  'categorie.business': 'Work',
  'categorie.study': 'Study',
  'categorie.other': 'Other',

  'validatie.doeltitel_kort': 'Give your goal a name of at least three characters.',
  'validatie.doeltitel_lang': 'At most 200 characters.',
  'validatie.omschrijving_lang': 'At most 2000 characters.',
  'validatie.datum_vorm': 'Use an existing date like 2026-12-31.',
  'validatie.identiteit_lang': 'Keep it short — one sentence works best.',
  'validatie.uren_max': 'A week has 168 hours.',

  'deadline.argument_kort':
    'Write one sentence about what changed. Your buddies decide on this, ' +
    'so "no time" is too little to say yes to.',
  'deadline.argument_lang': 'Keep it short — at most 1000 characters.',
  'deadline.geen_lid': 'You are not a member of this group.',
  'deadline.niet_gekoppeld': 'This goal is not linked to this group.',
  'deadline.zelfde_datum': 'Choose a date other than the one that is set now.',
  'deadline.argument_leeg': 'Write one sentence about what changed.',
  'deadline.al_open': 'There is already a request for this goal. Wait for that one first.',
  'deadline.bestaat_niet': 'This request no longer exists.',
  'deadline.al_beslist': 'This has already been decided.',
  'deadline.niet_zelf': 'You cannot approve your own request.',
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
  'adempauze.te_laat':
    'You announce a breather in advance. The week that is running cannot be used — pick the week ahead.',
  'adempauze.te_lang': 'A breather lasts at most two weeks.',
  'adempauze.overlap': 'There is already a breather over these weeks.',
  'adempauze.geen_hele_week': 'Pick a whole week, starting on your own start day.',
  'adempauze.eind_voor_start': 'The end date is before the start date.',
  'adempauze.annuleren_mislukt': 'Cancelling did not work.',
  'adempauze.al_begonnen': 'This breather has already started and stays.',

  'mijlpaal.toevoegen_mislukt': 'The milestone could not be added.',
  'mijlpaal.wijzigen_mislukt': 'The change could not be saved.',
  'mijlpaal.status_mislukt': 'The status could not be changed.',
  'mijlpaal.verwijderen_mislukt': 'Deleting did not work.',
  'mijlpaal.volgorde_mislukt': 'The order could not be saved.',
  'mijlpaal.lijst_veranderd': 'The list has changed in the meantime. Refresh the screen and try again.',
  'validatie.mijlpaaltitel': 'Give your milestone a name.',

  'weekdoel.laden_mislukt': 'Your weekly goals could not be loaded.',
  'weekdoel.open_laden': 'Your open weeks could not be loaded.',
  'weekdoel.mijlpalen_laden': 'The milestones could not be loaded.',
  'weekdoel.opslaan_mislukt': 'Your weekly goal could not be saved.',
  'weekdoel.verwijderen_mislukt': 'Deleting did not work.',
  'weekdoel.te_oud':
    'This weekly goal has been around too long to delete. You can close it — ' +
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
    'Visible only to you and the Goal Coach — your group never sees this.',

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
  'nieuwdoel.aanmaken': 'Create goal',
  'nieuwdoel.annuleren': 'Cancel',

  // ---------------------------------------------------------------------------
  // The goal screen — QS8-32 and onwards
  // ---------------------------------------------------------------------------
  'doelscherm.titel': 'Goal',
  'doelscherm.leeg_titel': 'This goal does not exist',
  'doelscherm.leeg_body': 'Either it was deleted, or it is not yours. Check the link.',
  'doelscherm.categorie_streefdatum': '{categorie} · target date {datum}',
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
  'deadline.versturen': 'Send request',
  'deadline.vastleggen': 'Save',
  'deadline.annuleren': 'Cancel',

  // ---------------------------------------------------------------------------
  // Reward and penalty on the goal screen — QS8-34, QS8-35 and QS8-85
  // ---------------------------------------------------------------------------
  'commitment.stand': '{titel} — {uitleg}',
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
  'straf.kop': 'Penalty',
  'straf.geen_groep':
    'A penalty goes to one of your groups. You are not in one yet, so this is only possible ' +
    'once you have a buddy group.',
  'straf.zeker': 'Are you sure?',
  'straf.bevestig_uitleg':
    'If {groep} gets to see this, it is because your target date passed without your goal ' +
    'being done.',
  'straf.dan_geldt': 'Then this applies: {tekst}',
  'straf.tot_dan':
    'Until that moment nobody sees this — not even your group. You can withdraw it as long ' +
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
  'straf.verder': 'Continue',
  'straf.jouw_groep': 'your group',

  // ---------------------------------------------------------------------------
  // Completing, archiving and replanning — QS8-83, QS8-32 and QS8-96
  // ---------------------------------------------------------------------------
  'afronden.afgerond': 'Completed',
  'afronden.afgerond_uitleg':
    'You completed this goal. Your groups have seen it and your reward has been released.',
  'afronden.kop': 'Complete',
  'afronden.een_open':
    'One milestone is still open. Tick it off, or drop it if you no longer need it — then ' +
    'you can complete this goal.',
  'afronden.meer_open':
    '{aantal} milestones are still open. Tick them off, or drop what you no longer need — ' +
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
    'That is not a disaster and it says nothing about you — it says the plan no longer fits. ' +
    'Adjusting a goal works better than letting it quietly bleed out.',
  'herplannen.drie_dingen': 'Three things you can do:',
  'herplannen.datum_kop': 'Move your target date',
  'herplannen.datum_uitleg':
    'Above under “Deadline”. If you share this goal with a group, you ask them to agree — ' +
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
    'You are falling behind on this goal. That is what your group is for — two sentences and ' +
    'someone thinks along with you. You see exactly what you send before it goes out.',
  'hulpvraag.vraag_knop': 'Ask for help',
  'hulpvraag.niet_nu': 'Not right now',
  'hulpvraag.wat_vragen': 'What do you want to ask?',
  'hulpvraag.bericht': 'Your message',
  'hulpvraag.bericht_hint': 'Feel free to adjust it. This goes to the group chat as your message.',
  'hulpvraag.welke_groep': 'To which group?',
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
    'No milestones yet. Cut your goal into intermediate results you can point at — then you ' +
    'know every week what you are working on.',
  'mijlpalenblok.coach': 'Let the Goal Coach suggest them',
  'mijlpalenblok.gehaald': 'Done',
  'mijlpalenblok.stap': 'Step {nummer} of {totaal}',
  'mijlpalenblok.streefdatum': ' · target date {datum}',
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
  'weekcoach.denkt_na': 'The coach is thinking',
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
    'What do you manage even in a bad week? Reaching this keeps your streak running — only ' +
    'the points differ.',
  'weekdoelform.vloer_voorbeeld': '1 call scheduled',
  'weekdoelform.plafond': 'The ceiling',
  'weekdoelform.plafond_hint': 'What are you going for if the week goes well?',
  'weekdoelform.plafond_voorbeeld': '3 calls held',
  'weekdoelform.mijlpaal': 'Does this belong to a milestone?',
  'weekdoelform.mijlpaal_hint': 'It can also hang loose under your goal.',
  'weekdoelform.los': 'Loose under this goal',
  'weekdoelform.toevoegen': 'Add',
  'weekdoelform.annuleren': 'Cancel',

  'adempauze.kop': 'Breather',
  'adempauze.uitleg':
    'Going on holiday, ill, or just a strange month? Then pause one or two weeks. Those weeks ' +
    'cost you no point and your streak stays where it is — it just does not grow.',
  'adempauze.groep_ziet':
    'Your group sees that you have a breather and from when to when. They do not see which ' +
    'weekly goals you did or did not reach.',
  'adempauze.week_van': 'Week of {datum}',
  'adempauze.tot_en_met': ' up to and including the week of {datum}',
  'adempauze.voorbij': 'Over',
  'adempauze.loopt': 'Running now',
  'adempauze.ingepland': 'Scheduled',
  'adempauze.annuleren': 'Cancel',
  'adempauze.vanaf': 'From which week?',
  'adempauze.vanaf_hint':
    'You announce a breather in advance, so the week that is running now is no longer possible.',
  'adempauze.hoe_lang': 'How long?',
  'adempauze.een_week': 'One week',
  'adempauze.twee_weken': 'Two weeks',
  'adempauze.inplannen': 'Schedule',
  'adempauze.inplannen_knop': 'Schedule a breather',

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
  'profiel.uitloggen_kop': 'Sign out',
  'profiel.uitloggen_uitleg': 'You stay a member of your groups. Your goals stay put.',
  'profiel.uitloggen_knop': 'Sign out',
  'beoordelen.verouderd': 'Something has changed in the list in the meantime.',
  'beoordelen.verversen': 'Refresh list',
  'beoordelen.vorige': 'Previous',
  'beoordelen.meer_laden': 'Load more',
  'groepscherm.wie_meedoen': 'Who is taking part',
  'groepscherm.meer_tijd': 'A buddy is asking for more time',
  'coach.poging_telt': 'Every attempt counts towards your ten per day.',
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
    'The group also sees what does not work out: each other’s missed and carried weeks, each other’s best streak, and who took part in which week. Only pick this if everyone wants it.',
  'zichtbaarheid.niet_bevestigd': 'Confirm first: this changes what the group sees about other people.',
  'bevestiging.groep_openzetten.titel': 'Open up this group?',
  'bevestiging.groep_openzetten.uitleg':
    'From now on everyone in this group also sees each other’s missed and carried weeks, each other’s best streak ever, and who took part in each week — including the ones already there. So this is not only about you. Everyone gets a message in the group chat, so anyone who would rather not can unlink their goal. You can switch back at any time, immediately.',
  'bevestiging.groep_openzetten.knop': 'Yes, open it up',
  'bevestiging.groep_beschermen.titel': 'Protect this group again?',
  'bevestiging.groep_beschermen.uitleg':
    'From now on the group only sees what works out. Missed weeks become private again, retroactively too. Everyone gets a message about it.',
  'bevestiging.groep_beschermen.knop': 'Yes, protect it',
  'bevestiging.groep_archiveren.titel': 'Archive this group?',
  'bevestiging.groep_archiveren.uitleg':
    'The group then disappears for everyone: the chat, the week reviews and The Chain can no longer be opened, not even by you. Nothing in it is deleted — it stays stored, and your buddies\u2019 streaks remain correct. But this cannot be undone from the app.',
  'bevestiging.groep_archiveren.knop': 'Yes, archive this group',
  'beheer.archief_titel': 'Archive group',
  'beheer.archief_uitleg':
    'If this group is finished, this is how you close it. It disappears for all members and nobody can do anything in it any more.',
  'beheer.archief_waarschuwing':
    'Nothing is deleted, but you will not be able to open the group afterwards.',
  'beheer.archiveren': 'Archive this group',
  'groep.gearchiveerd': 'This group has been archived and can no longer be opened.',
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
  'beheer.melding_nieuwe_link': 'New link. The old one stops working from now on.',
  'beheer.leeg_titel': 'This group is not here, or not for you',
  'beheer.leeg_tekst': 'You are not a member of this group, or it no longer exists.',
  'beheer.huddledag_label': 'Huddle day',
  'beheer.huddledag_hint':
    'The group’s shared day. It changes nothing about when your own weekly goals reset — that stays your personal week start day.',
  'beheer.voorlezen': 'You can also read it out: {code}',
  'beoordelen.bevestigd': 'You confirmed {naam}’s week.',
  'beoordelen.sessie_laadt': 'Your session is still loading. Try again in a second.',
  'dashboard.week_van': 'Week of {datum}',


  'tijdzone.label': 'Time zone',
  'tijdzone.hint':
    'This is where “today” and “this week” are calculated. Your phone’s zone by default; search for a city to change it.',
  'tijdzone.zoek_voorbeeld': 'Amsterdam',
  'tijdzone.nu': 'Currently set to: {zone}',
  'tijdzone.gebruik_getypt': 'Use {zone}',
  'tijdzone.van_apparaat': 'This device’s time zone ({zone})',
  'tijdzone.niets_gevonden': 'No time zone found. Search for a large city nearby.',
  'tijdzone.uitleg':
    'Changing this leaves your points and your streak alone: those are fixed to the weeks already there. What changes is when the next week rolls over.',
  'tijdzone.opgeslagen': 'Time zone saved.',


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

};
