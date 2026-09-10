import { Tabs } from 'expo-router';

import { t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { BovenrandAlVerrekend } from '@/shared/ui';

/**
 * De vijf kernschermen.
 *
 * ## ⚠️ Hier stond "vier en niet vijf", en dat is op 09-09-2026 omgedraaid
 *
 * De oude zin luidde: *"Vier en niet vijf: elk tabblad erbij verdunt de andere,
 * en de app heeft precies vier plekken waar iemand naartoe wil."* Hij is
 * vervangen en niet verwijderd, want het argument klopt nog steeds — het is
 * afgewogen en verloren, en dat hoort leesbaar te blijven.
 *
 * **Besluit van Quinten (QS8-378, beslispunt 1):** De Lijst krijgt een eigen
 * tabblad. Drie vormen lagen voor — een vijfde tabblad, een blok binnen
 * *Vandaag*, of De Lijst in plaats van een bestaand tabblad — en de wens vroeg
 * met zoveel woorden om een knop op de balk.
 *
 * ⚠️ **Wat de oude zin waarschuwde blijft waar, en de prijs is betaald en niet
 *    weggeredeneerd:** vijf labels naast elkaar is krapper dan vier, en de balk
 *    draagt tekst en geen iconen. De labels zijn daarom kort gehouden
 *    (`Lijst`/`List`, het kortste van de vijf) en de balk scrollt liever dan af
 *    te kappen. **Wordt er een zesde overwogen, dan is dit de plek waar iemand
 *    eerst moet meten** — bij vijf is dit een afweging, bij zes is het een
 *    ontwerpprobleem.
 *
 * ⚠️ **Waarom De Lijst niet binnen *Vandaag* past**, want dat was de goedkope
 *    optie: *Vandaag* gaat over de lopende cyclus — weekdoelen, De Dagzet, wat
 *    er vandaag moet. Een taak hoort juist bij géén cyclus en telt nergens voor
 *    mee (domeinregel 9 en 10). Hem daar neerzetten zou precies de verwarring
 *    maken die de epic wil vermijden: nog een ding dat op een weekdoel lijkt.
 *
 * ⚠️ Geen icoonbibliotheek. Die zou een dependency zijn, en tekstlabels werken
 *    op web en native identiek, schalen mee met de systeemletter en zijn voor
 *    een schermlezer meteen duidelijk. Komen er iconen, dan komen ze erbij en
 *    niet in plaats van de labels.
 *
 * ## De balk staat bovenaan — QS8-246
 *
 * ⚠️ **Met `tabBarPosition` op de bestaande navigator en geen tweede
 *    navigator.** Het issue noemde twee routes en zei erbij dat welke het is
 *    gemeten moest worden. Gemeten in
 *    `expo-router/build/react-navigation/bottom-tabs/types.d.ts`:
 *    `tabBarPosition?: 'bottom' | 'left' | 'right' | 'top'`. De optie zit er dus
 *    in, en daarmee vervalt route 2 — geen `@react-navigation/material-top-tabs`,
 *    geen dependency erbij, en geen veeggedrag tussen tabbladen dat niemand
 *    gevraagd heeft.
 *
 * ⚠️ **`borderBottomColor` en niet `borderTopColor`.** De scheidingslijn hoort
 *    aan de kant waar de inhoud begint. Boven met een lijn aan de bovenkant is
 *    een streep tegen de statusbalk aan.
 *
 * ⚠️ **`BovenrandAlVerrekend` eromheen, en dat is de naad van deze wijziging.**
 *    De balk neemt `insets.top` zélf (gemeten in `BottomTabBar.js`:
 *    `paddingTop: tabBarPosition === 'top' ? insets.top : 0`). `Screen` deed dat
 *    óók, en twee keer een notch aan ruimte is precies de fout die op een
 *    simulator zonder notch onzichtbaar blijft. De context zet dat voor élk
 *    scherm onder deze map tegelijk goed, ook voor een tabblad dat er later bij
 *    komt.
 *
 * ⚠️ **Boven op web én op native, en dat is een keuze met een prijs.** Het issue
 *    biedt de splitsing aan — boven op web, onder op native — met het argument
 *    dat de bovenrand van een telefoon van zes inch met één hand niet te
 *    bereiken is. Dat argument klopt. Het is hier niet gevolgd omdat de
 *    acceptatiecriteria van QS8-246 beide platforms met zoveel woorden noemen:
 *    een splitsing zou zijn eigen toets niet halen. Blijkt de duimafstand in de
 *    testronde te knellen, dan is dit de plek en is het één regel.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <BovenrandAlVerrekend>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarPosition: 'top',
          tabBarActiveTintColor: theme.colors.accent,
          tabBarInactiveTintColor: theme.colors.grey,
          tabBarStyle: {
            backgroundColor: theme.colors.panel,
            borderBottomColor: theme.colors.border,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          sceneStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('tab.vandaag') }} />
        <Tabs.Screen name="doelen" options={{ title: t('tab.doelen') }} />
        <Tabs.Screen name="groep" options={{ title: t('tab.groep') }} />
        {/*
          ⚠️ Vóór "Profiel" en niet erna: de eerste vier zijn de lus die de app
             draait, en Profiel is de instellingenhoek. De Lijst hoort bij het
             doen en niet bij het instellen.
        */}
        <Tabs.Screen name="lijst" options={{ title: t('tab.lijst') }} />
        <Tabs.Screen name="profiel" options={{ title: t('tab.profiel') }} />
      </Tabs>
    </BovenrandAlVerrekend>
  );
}
