import { useLocalSearchParams } from 'expo-router';

import { Body, Card, Screen, Subheading } from '@/shared/ui';

/**
 * De uitnodigingslink: `goalbuddies://uitnodiging/<code>` of `/uitnodiging/<code>`.
 *
 * ⚠️ Dit scherm is voor iemand die de app nog nooit gezien heeft. Het is dus
 *    niet "de plek waar de code wordt ingewisseld" maar de eerste indruk van het
 *    product — QS8-59 maakt hem gastvrij. Wat hier nu staat is de vorm; het
 *    inwisselen zelf loopt straks via `join_group_with_code`, want dat is de
 *    enige route naar lidmaatschap.
 *
 *    De code hoort nooit zichtbaar in een foutmelding of in een gedeelde
 *    schermafbeelding terecht te komen; daarom staat hij hier niet voluit.
 */
export default function Uitnodiging() {
  const { code } = useLocalSearchParams<{ code: string }>();

  return (
    <Screen title="Je bent uitgenodigd" eyebrow="BUDDY-GROEP">
      <Card>
        <Subheading>Wat je hier gaat doen</Subheading>
        <Body muted>
          Je kiest één doel met een datum erop. Elke week bepaal je wat je af wilt
          hebben, en één van je buddy&apos;s keurt goed dat het gelukt is. Meer
          niet.
        </Body>
        <Body muted>
          Een week missen kost een punt en verder niets. Niemand in de groep ziet
          het.
        </Body>
      </Card>

      <Card nested>
        <Subheading>Meedoen</Subheading>
        <Body muted>
          Aanmelden werkt zodra EPIC 1 er is. De uitnodiging blijft geldig tot de
          groep hem intrekt.
        </Body>
        <Body muted>Code herkend: {code ? `${code.slice(0, 4)}…` : 'geen'}</Body>
      </Card>
    </Screen>
  );
}
