import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { space, useTheme } from '../theme';

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { Body, Subheading } from './Text';

/**
 * Laden, fout en leeg — de drie staten die `CLAUDE.md` regel 16 verplicht stelt
 * voor élke async view.
 *
 * ⚠️ Als component en niet als richtlijn, omdat een richtlijn wordt vergeten.
 *    Zolang schermen hun data hierdoorheen halen, kán een van de drie niet
 *    ontbreken: de typering dwingt af dat je er alle drie iets over zegt.
 */

interface Props<T> {
  readonly loading: boolean;
  readonly error: unknown;
  readonly data: T | undefined;
  /** Bepaalt of `data` als leeg telt. Een lege lijst is geen "geen data". */
  readonly isEmpty: (data: T) => boolean;
  readonly empty: { readonly title: string; readonly body: string };
  readonly onRetry?: (() => void) | undefined;
  readonly children: (data: T) => React.ReactNode;
}

export function AsyncView<T>({
  loading,
  error,
  data,
  isEmpty,
  empty,
  onRetry,
  children,
}: Props<T>) {
  const theme = useTheme();

  if (loading && data === undefined) {
    return (
      <View style={styles.midden} accessibilityRole="progressbar" accessibilityLabel="Laden">
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error !== undefined && error !== null) {
    return (
      <View style={styles.blok}>
        <Subheading>Dat lukte niet</Subheading>
        {/*
          ⚠️ Nooit de rauwe foutmelding tonen. Die kan de waarde bevatten die een
             constraint brak — bij Postgres staat die letterlijk in de tekst — en
             dat is precies wat er niet op het scherm hoort.
        */}
        <Body muted>
          Er ging iets mis bij het ophalen. Probeer het opnieuw; blijft het
          misgaan, dan ligt het aan ons.
        </Body>
        {onRetry ? (
          <Button variant="secundair" onPress={onRetry}>
            Opnieuw proberen
          </Button>
        ) : null}
      </View>
    );
  }

  if (data === undefined || isEmpty(data)) {
    return <EmptyState title={empty.title} body={empty.body} />;
  }

  return <>{children(data)}</>;
}

const styles = StyleSheet.create({
  midden: {
    paddingVertical: space.sectie.paddingVertical + 16,
    alignItems: 'center',
  },
  blok: {
    gap: space.blokGap - 3,
    paddingVertical: space.sectie.paddingVertical + 8,
    alignItems: 'flex-start',
  },
});
