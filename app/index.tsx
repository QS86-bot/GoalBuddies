import { StyleSheet, Text, View } from 'react-native';

import { radius, space, useTheme } from '@/shared/theme';

/**
 * Tijdelijk startscherm. Wordt vervangen door "Vandaag" (QS8-90) zodra de
 * componentbibliotheek er staat. Dient nu vooral als bewijs dat het
 * Q-Projects navy-stelsel doorkomt tot in het scherm.
 */
export default function Index() {
  const theme = useTheme();
  const c = theme.colors;

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.panel, { backgroundColor: c.panel, borderColor: c.border }]}>
        <Text style={[styles.eyebrow, { color: c.accent }]}>Q-PROJECTS</Text>
        <Text style={[styles.title, { color: c.text }]}>GoalBuddies</Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          De fundering staat: datamodel, twee klokken en het navy-stelsel.
        </Text>

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <View style={styles.legend}>
          <Legend color={theme.roles.progress} label="Voortgang" />
          <Legend color={theme.roles.pending} label="Wacht op actie" />
          <Legend color={theme.roles.atRisk} label="Deadline-risico" />
        </View>
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const c = useTheme().colors;
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.shell,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.paneel.paddingVertical + 6,
    paddingHorizontal: space.paneel.paddingHorizontal + 4,
    gap: space.blokGap,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  legend: {
    gap: space.rij.paddingVertical + 3,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
  },
  legendLabel: {
    fontSize: 13,
  },
});
