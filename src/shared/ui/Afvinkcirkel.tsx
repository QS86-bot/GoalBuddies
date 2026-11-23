import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { t } from '../i18n';
import { useTheme } from '../theme';

import { focusRing } from './a11y';
import { afvinkcirkel, CIRKEL_STAAT_SLEUTEL, type CirkelVorm, type Niveau } from './afvinkcirkel-vorm';
import { spatieActiveert, standEigenschappen } from './keuze-aria';

/**
 * De grote afvinkcirkel — QS8-727: de hoofdhandeling van een actiekaart.
 *
 * ⚠️ **Vorm, geen kleur, draagt het onderscheid.** Open ring, half gevuld, vol met
 *    een tweede ring: zie `afvinkcirkel-vorm.ts`. Kleur versterkt alleen. Niets
 *    hier is rood, en een lege of uitgeschakelde cirkel is neutraal.
 *
 * ⚠️ **Het label komt van het scherm (uit de catalogus) en de cirkel noemt ook de staat in tekst**, want een
 *    schermlezer ziet geen vulling. De staat staat bovendien in `accessibilityState`.
 *
 * ⚠️ Eén cirkel per kaart. Een tweede primaire handeling hoort een knop eronder
 *    te zijn, geen tweede cirkel.
 */
interface Props {
  /** Het label van de handeling, uit de catalogus; het scherm vertaalt (QS8-748). */
  readonly label: string;
  readonly niveau: Niveau | null;
  readonly vandaagAfgevinkt: boolean;
  readonly busy?: boolean;
  readonly uitgeschakeld?: boolean;
  readonly onPress: () => void;
}

function Tekening({ vorm, grootte, dik }: { readonly vorm: CirkelVorm; readonly grootte: number; readonly dik: number }) {
  const theme = useTheme();
  const m = grootte / 2;
  const r = m - dik * 2;
  const voortgang = theme.roles.progress;
  // Bij de halve vulling staat het vinkje in de lege bovenhelft.
  const dy = vorm.vulling === 'half' ? -r / 2 : 0;
  const rand = vorm.toestand === 'uitgeschakeld' ? theme.colors.grey : theme.colors.textSecondary;

  return (
    <Svg width={grootte} height={grootte} viewBox={`0 0 ${grootte} ${grootte}`} aria-hidden importantForAccessibility="no-hide-descendants">
      {vorm.buitenring ? <Circle cx={m} cy={m} r={m - dik / 2} fill="none" stroke={voortgang} strokeWidth={dik} /> : null}
      {vorm.vulling === 'vol' ? <Circle cx={m} cy={m} r={r} fill={voortgang} /> : null}
      {vorm.vulling === 'half' ? <Path d={`M ${m - r} ${m} A ${r} ${r} 0 0 0 ${m + r} ${m} Z`} fill={voortgang} /> : null}
      <Circle
        cx={m}
        cy={m}
        r={r}
        fill="none"
        stroke={vorm.vulling === 'geen' ? rand : voortgang}
        strokeWidth={dik}
        {...(vorm.streepjes ? { strokeDasharray: `${dik + 1} ${dik + 1}` } : {})}
      />
      {vorm.vinkje ? (
        <Polyline
          points={`${m - r / 2},${m + dy} ${m - r / 6},${m + r / 3 + dy} ${m + r / 2},${m - r / 3 + dy}`}
          fill="none"
          stroke={vorm.vulling === 'vol' ? theme.colors.panel : voortgang}
          strokeWidth={dik + 1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

export function Afvinkcirkel({ label, niveau, vandaagAfgevinkt, busy = false, uitgeschakeld = false, onPress }: Props) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);
  const vorm = afvinkcirkel({ niveau, vandaagAfgevinkt, uitgeschakeld });
  const uit = vorm.toestand === 'uitgeschakeld';
  // Bezig blokkeert de tik maar verandert de vorm niet: "bezig" is niet "niet beschikbaar".

  return (
    <Pressable
      onPress={onPress}
      disabled={uit || busy}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      accessibilityRole="checkbox"
      accessibilityLabel={`${label}. ${t(CIRKEL_STAAT_SLEUTEL[vorm.toestand])}`}
      accessibilityState={{ disabled: uit || busy, busy, checked: vandaagAfgevinkt }}
      {...standEigenschappen({ checked: vandaagAfgevinkt, busy }, Platform.OS === 'web').aria}
      {...spatieActiveert(onPress, uit || busy, Platform.OS === 'web')}
      style={[styles.raak, { width: vorm.aanraak, height: vorm.aanraak, borderColor: theme.colors.panel }, focusRing(theme, heeftFocus)]}
    >
      <Tekening vorm={vorm} grootte={vorm.grootte} dik={3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  raak: { alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 2 },
});
