import { StyleSheet, Text, View } from 'react-native';

/**
 * Tijdelijk startscherm. Wordt vervangen door "Vandaag" (QS8-90) zodra het
 * design system er staat.
 */
export default function Index() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>GoalBuddies</Text>
      <Text style={styles.subtitle}>
        De fundering staat. Het datamodel draait, de klokken volgen.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#10b981',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    color: '#6b7280',
    maxWidth: 320,
  },
});
