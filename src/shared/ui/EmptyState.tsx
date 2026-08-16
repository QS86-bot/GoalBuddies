import { StyleSheet, View } from 'react-native';

import { space } from '../theme';

import { Button } from './Button';
import { Body, Subheading } from './Text';

/**
 * De lege staat.
 *
 * ⚠️ Dit is geen randgeval maar het eerste scherm dat iedere gebruiker ziet: de
 *    app is op dag één helemaal leeg. Een lege staat die alleen "geen resultaten"
 *    zegt, is een gemiste eerste indruk.
 *
 * Daarom is `action` geen extraatje: elke lege staat hoort te vertellen wat de
 * volgende stap is. Is er geen volgende stap, dan hoort de sectie er waarschijnlijk
 * helemaal niet te staan.
 */

interface Props {
  readonly title: string;
  readonly body: string;
  readonly action?:
    | {
        readonly label: string;
        readonly onPress: () => void;
      }
    | undefined;
}

export function EmptyState({ title, body, action }: Props) {
  return (
    <View style={styles.blok}>
      <Subheading>{title}</Subheading>
      <Body muted>{body}</Body>
      {action ? (
        <Button variant="primair" onPress={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: {
    gap: space.blokGap - 3,
    paddingVertical: space.sectie.paddingVertical + 8,
    alignItems: 'flex-start',
  },
});
