import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { pictogramkleurenDonker, pictogramkleurenLicht, useTheme } from '../theme';

import {
  pictogramLabel,
  pictogramToegestaan,
  teken,
  VERLOPEN,
  verlopenVan,
  type Betekenis,
  type PictogramNaam,
} from './pictogrammen';

/**
 * Een meerkleurig pictogram — QS8-730. De tekeningen staan als gegevens in
 * `pictogrammen.ts`; dit component zet er alleen `react-native-svg` omheen.
 *
 * ⚠️ **Het label komt uit de catalogus en kan niet vergeten worden:** er is geen
 *    prop voor, het component leest `pictogram.<naam>` zelf. Is het pictogram
 *    pure versiering naast een tekst die hetzelfde zegt, zet dan `decoratief`;
 *    dan hoort een schermlezer het niet dubbel.
 *
 * ⚠️ **`betekenis` is verplicht en laat alleen positieve dingen toe** (domeinregel
 *    7). Een combinatie die niet in `PICTOGRAM_BETEKENISSEN` staat rendert niets,
 *    zoals `FloorCeiling` bij tegenslag: een lege plek is hier beter dan een
 *    pictogram dat iets anders zegt dan het is bedoeld.
 *
 * ⚠️ **Vergrendeld is dezelfde vorm in grijs,** geen kruis en geen slotje; de
 *    betekenis staat ook in het label ("…, nog te behalen"), nooit alleen in kleur.
 */

interface Props {
  readonly naam: PictogramNaam;
  readonly betekenis: Betekenis;
  readonly grootte?: number;
  readonly vergrendeld?: boolean;
  /** De naam van wat het pictogram aanduidt, bijvoorbeeld een prestatie; vervangt dan het vormlabel. */
  readonly label?: string;
  readonly decoratief?: boolean;
}

export function Pictogram({ naam, betekenis, grootte = 32, vergrendeld = false, label, decoratief = false }: Props) {
  const theme = useTheme();
  const id = `pg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!pictogramToegestaan(naam, betekenis)) return null;

  const kleuren = theme.dark ? pictogramkleurenDonker : pictogramkleurenLicht;
  const delen = teken(naam, kleuren, vergrendeld, id);

  return (
    <Svg
      width={grootte}
      height={grootte}
      viewBox="0 0 32 32"
      {...(decoratief
        ? { 'aria-hidden': true, importantForAccessibility: 'no-hide-descendants' as const }
        : { role: 'img' as const, accessible: true, 'aria-label': label ?? pictogramLabel(naam, vergrendeld) })}
    >
      {vergrendeld ? null : (
        <Defs>
          {verlopenVan(naam).map((v) => (
            <LinearGradient key={v} id={`${id}-${v}`} x1="0" y1="0" x2="0" y2="1">
              {VERLOPEN[v].map((s, i, rij) => (
                <Stop key={s} offset={rij.length === 1 ? 0 : i / (rij.length - 1)} stopColor={kleuren[s]} />
              ))}
            </LinearGradient>
          ))}
        </Defs>
      )}
      {delen.map((deel, i) => (
        <Path
          key={i}
          d={deel.d}
          fill={deel.fill}
          stroke={deel.stroke}
          strokeWidth={deel.strokeWidth}
          opacity={deel.opacity}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
