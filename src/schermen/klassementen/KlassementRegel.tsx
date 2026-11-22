import { StyleSheet, View } from 'react-native';

import type { Klassementsrij } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { Body, Caption } from '@/shared/ui';

/**
 * Eén regel van een klassement: plek, naam, punten — QS8-666 (A57b), 3c-ui. Verhuisd uit `app/groep/[id].tsx` zodat het groepsscherm en
 * "Alle klassementen" dezelfde regel tekenen.
 *
 * ⚠️ **De plek komt uit de data en wordt hier nooit uitgerekend.** Een regel heeft een positie, een naam en een totaal en verder niets: geen
 *    delta, geen datum, geen minteken. `tests/beloftes/klassementen-regel.test.ts` legt dat vast.
 *
 * ⚠️ "Jij" is een tekst en geen kleur: een nieuwe kleur hoort in de tokens, niet in een scherm (huisstijlregel van 19-11-2026).
 */
export function KlassementRegel({ rij }: { readonly rij: Klassementsrij & { readonly jij?: boolean } }) {
  const punten = rij.punten === 1 ? t('klassement.punten_een') : t('klassement.punten_meer', { n: rij.punten });
  const label = rij.jij
    ? t('klassementen.rij_label_jij', { positie: rij.positie, naam: rij.naam, punten })
    : t('klassement.rij_label', { positie: rij.positie, naam: rij.naam, punten });

  return (
    <View style={styles.rij} accessible accessibilityLabel={label}>
      <Caption>{rij.positie}</Caption>
      <View style={styles.naam}>
        <Body>{rij.naam}</Body>
        {rij.jij ? <Caption>{t('klassementen.jij')}</Caption> : null}
      </View>
      <Caption>{punten}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  rij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.blokGap - 3 },
  naam: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.blokGap - 3 },
});
