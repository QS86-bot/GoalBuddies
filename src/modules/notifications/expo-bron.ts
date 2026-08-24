import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform as RNPlatform } from 'react-native';

import { reportError } from '../../lib/observability';

import type { Platform, PushBron } from './tokens';

/**
 * De echte pushbron — QS8-91, Q-TODO B4.
 *
 * ⚠️ **Dit is het enige bestand dat `expo-notifications` importeert.** Dat is de
 *    hele opzet van `tokens.ts`: één interface, één aanroeppunt, en de
 *    bibliotheek raakt de datalaag, de schermen en de Edge Function niet aan.
 *    Zou de bibliotheek ooit vervangen moeten worden, dan is dat dit bestand en
 *    verder niets.
 *
 * ⚠️ **Geeft `null` in plaats van te gooien, altijd.** Er is geen scherm dat van
 *    meldingen afhangt, en een app die bij het opstarten omvalt omdat een
 *    telefoon geen toestemming geeft, is erger dan een app zonder meldingen. Elk
 *    faalgeval hieronder eindigt in `null` en een regel in het logboek.
 *
 * ⚠️ **Het token staat nooit in een logboek.** Het is geen geheim, maar het is
 *    wel een identificator van één apparaat — en logboeken hebben een andere
 *    bewaartermijn dan de database. `reportError` krijgt hier alleen een reden.
 */

/**
 * Hoe een melding zich gedraagt als de app openstaat.
 *
 * ⚠️ Zonder deze handler toont iOS een binnengekomen melding **niet** wanneer de
 *    app op de voorgrond staat. Dat is precies het moment waarop een nudge nutteloos
 *    wordt: je krijgt hem alleen als je de app tóch al dicht had.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function huidigPlatform(): Platform {
  if (RNPlatform.OS === 'ios') return 'ios';
  if (RNPlatform.OS === 'android') return 'android';
  return 'web';
}

/**
 * Het projectId dat Expo nodig heeft om een pushtoken uit te geven.
 *
 * ⚠️ Zonder EAS-project is er geen token te krijgen — `getExpoPushTokenAsync`
 *    gooit dan een fout die leest als een netwerkprobleem. Daarom wordt het hier
 *    expliciet gelezen en met een begrijpelijke reden overgeslagen. Zie
 *    `docs/DEPLOY.md`: het projectId plus de FCM- en APNs-sleutels horen bij de
 *    build, niet bij de server.
 */
function projectId(): string | null {
  const uitConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const uitEas = Constants.easConfig?.projectId;

  const gevonden = (uitConfig ?? uitEas ?? '').trim();
  return gevonden === '' ? null : gevonden;
}

export const expoPush: PushBron = {
  async haalToken() {
    // Web heeft een heel ander pad (VAPID-sleutels en een service worker) en dat
    // is niet gebouwd. Netjes overslaan in plaats van een fout laten ontstaan.
    if (RNPlatform.OS === 'web') return null;

    try {
      const bestaand = await Notifications.getPermissionsAsync();
      let status = bestaand.status;

      // ⚠️ Alleen vragen als er nog niet beslist is. Opnieuw vragen aan iemand
      //    die "nee" gezegd heeft, levert op iOS niets op — het systeem toont de
      //    vraag geen tweede keer — en op Android is het opdringerig. Wie van
      //    gedachten verandert, doet dat in de instellingen van zijn telefoon.
      if (status !== 'granted' && bestaand.canAskAgain) {
        status = (await Notifications.requestPermissionsAsync()).status;
      }

      if (status !== 'granted') return null;

      // Android wil een kanaal, anders komt een melding zonder geluid en zonder
      // groepering binnen — en dan ziet de gebruiker hem niet.
      if (RNPlatform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Herinneringen',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      // ⚠️ Zonder EAS-projectId geeft Expo geen token uit, en de fout die je dan
      //    krijgt leest als een netwerkprobleem. Liever hier expliciet stoppen
      //    met een reden die klopt — dan zoekt niemand een uur in de verkeerde
      //    richting. Het projectId hoort bij de build; zie docs/DEPLOY.md.
      const id = projectId();
      if (id === null) {
        reportError(
          new Error('Geen EAS-projectId; er is geen pushtoken op te halen'),
          'push.token',
          { platform: huidigPlatform() },
        );
        return null;
      }

      const antwoord = await Notifications.getExpoPushTokenAsync({ projectId: id });

      if (!antwoord.data) return null;

      return { token: antwoord.data, platform: huidigPlatform() };
    } catch (fout) {
      // ⚠️ Geen token, geen melding — maar wél zichtbaar. Dit is de plek waar
      //    "er komt niets binnen" anders een raadsel wordt. De token zelf gaat
      //    niet mee, alleen de reden.
      reportError(fout, 'push.token', { platform: huidigPlatform() });
      return null;
    }
  },
};
