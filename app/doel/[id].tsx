import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button, Caption, Card, EmptyState, Screen } from '@/shared/ui';

/**
 * Diepe link naar één doel: `goalbuddies://doel/<id>` of `/doel/<id>` op web.
 *
 * ⚠️ De id in de URL is geen bewijs van toegang. Wie dit scherm opent zonder
 *    recht op dat doel, krijgt van de database nul rijen terug — RLS bepaalt dat,
 *    niet dit scherm. Zodra hier data komt (EPIC 2), hoort "niet gevonden" en
 *    "mag je niet zien" hetzelfde te tonen: het verschil verraadt dat het doel
 *    bestaat.
 */
export default function DoelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <Screen title="Doel" eyebrow="GEDEELDE LINK">
      <Card>
        <EmptyState
          title="Dit doel is er nog niet"
          body="Doelen worden gebouwd in EPIC 2. De link werkt al wel, dus zodra ze er zijn komt hij hier binnen."
        />
        <Caption>Gevraagde id: {id}</Caption>
      </Card>

      <Button variant="secundair" onPress={() => router.replace('/doelen')}>
        Naar mijn doelen
      </Button>
    </Screen>
  );
}
