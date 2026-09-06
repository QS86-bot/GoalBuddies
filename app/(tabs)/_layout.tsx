import { Tabs } from 'expo-router';

import { t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { BovenrandAlVerrekend } from '@/shared/ui';

/**
 * De vier kernschermen. Vier en niet vijf: elk tabblad erbij verdunt de andere,
 * en de app heeft precies vier plekken waar iemand naartoe wil.
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
        <Tabs.Screen name="profiel" options={{ title: t('tab.profiel') }} />
      </Tabs>
    </BovenrandAlVerrekend>
  );
}
