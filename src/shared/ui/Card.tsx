import { StyleSheet, View, type ViewProps } from 'react-native';

import { radius, space, useTheme } from '../theme';

/**
 * Het vlak waar inhoud op staat. De ondergrond van vrijwel elk scherm.
 */

interface Props extends ViewProps {
  readonly children: React.ReactNode;
  /** Een kaart binnen een kaart: iets dieper vlak, zodat nesting leesbaar blijft. */
  readonly nested?: boolean;
  /** Zonder schaduw en rand: voor een kaart die in een lijst staat. */
  readonly flat?: boolean;
}

export function Card({ children, nested = false, flat = false, style, ...rest }: Props) {
  const theme = useTheme();
  const c = theme.colors;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: nested ? c.panelDark : c.panel,
          borderColor: c.border,
        },
        flat ? styles.flat : theme.shadow,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.kaart.paddingVertical,
    paddingHorizontal: space.kaart.paddingHorizontal,
    gap: space.blokGap,
  },
  flat: {
    shadowOpacity: 0,
    elevation: 0,
  },
});
