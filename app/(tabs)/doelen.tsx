import { Card, EmptyState, Screen } from '@/shared/ui';

/**
 * Doelen — de roadmap met mijlpalen, de voortgang en de risicostand.
 *
 * ⚠️ Voortgang staat hier los van de score, en dat blijft zo. Voortgang is
 *    mijlpaalgebaseerd en loopt alleen omhoog (domeinregel 10); de score kan
 *    dalen en hoort op Profiel, waar alleen de eigenaar hem ziet.
 */
export default function Doelen() {
  return (
    <Screen title="Doelen">
      <Card>
        <EmptyState
          title="Nog geen doel"
          body={
            'Begin met één doel met een datum erop. De Doelcoach hakt het daarna ' +
            'in mijlpalen, en die mijlpalen worden je weekdoelen.'
          }
        />
      </Card>
    </Screen>
  );
}
