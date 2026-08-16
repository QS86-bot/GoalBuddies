import { Tabs } from 'expo-router';

import { useTheme } from '@/shared/theme';

/**
 * De vier kernschermen. Vier en niet vijf: elk tabblad erbij verdunt de andere,
 * en de app heeft precies vier plekken waar iemand naartoe wil.
 *
 * ⚠️ Geen icoonbibliotheek. Die zou een dependency zijn, en tekstlabels werken
 *    op web en native identiek, schalen mee met de systeemletter en zijn voor
 *    een schermlezer meteen duidelijk. Komen er iconen, dan komen ze erbij en
 *    niet in plaats van de labels.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.grey,
        tabBarStyle: {
          backgroundColor: theme.colors.panel,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Vandaag' }} />
      <Tabs.Screen name="doelen" options={{ title: 'Doelen' }} />
      <Tabs.Screen name="groep" options={{ title: 'Groep' }} />
      <Tabs.Screen name="profiel" options={{ title: 'Profiel' }} />
    </Tabs>
  );
}
