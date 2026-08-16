import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button, Caption, Card, EmptyState, Screen } from '@/shared/ui';

/**
 * Diepe link naar één groep: `goalbuddies://groep/<id>` of `/groep/<id>` op web.
 *
 * ⚠️ Ook hier: de id in de URL geeft geen toegang. `groups_select` eist
 *    lidmaatschap, dus een niet-lid krijgt niets — en dat hoort er hetzelfde uit
 *    te zien als een groep die niet bestaat.
 */
export default function GroepDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <Screen title="Groep" eyebrow="GEDEELDE LINK">
      <Card>
        <EmptyState
          title="Deze groep is er nog niet"
          body="Buddy-groepen worden gebouwd in EPIC 5. De link werkt al wel."
        />
        <Caption>Gevraagde id: {id}</Caption>
      </Card>

      <Button variant="secundair" onPress={() => router.replace('/groep')}>
        Naar mijn groep
      </Button>
    </Screen>
  );
}
