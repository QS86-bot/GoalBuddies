import { useRouter } from 'expo-router';
import { useState } from 'react';

import { HUDDLEDAGEN, maakGroep } from '@/modules/buddies';
import type { Weekday } from '@/shared/time';
import { Body, Button, Caption, Card, Choice, Field, Screen, Subheading } from '@/shared/ui';

/**
 * Een buddy-groep aanmaken — QS8-52.
 *
 * ⚠️ Er staat geen veld voor de uitnodigingscode, en dat is met opzet. Die komt
 *    van de server (migratie 0016): een code die de client kiest, is geen code
 *    maar een verzoek, en "niet raadbaar" is dan een aanname.
 *
 * ⚠️ De huddledag is geen instelling maar een fundamentele keuze, dus hij staat
 *    hier en niet weggestopt onder instellingen. Hij is later te wijzigen zonder
 *    dat een lopende ketting breekt — dat staat er ook bij, want anders durft
 *    niemand hem aan te raken.
 */
export default function NieuweGroep() {
  const router = useRouter();

  const [naam, setNaam] = useState('');
  const [huddledag, setHuddledag] = useState<Weekday>(0);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    setBezig(true);
    setFout(null);

    const uitkomst = await maakGroep({ name: naam, huddle_day: huddledag });

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    router.replace(`/groep/${uitkomst.waarde.id}`);
  }

  return (
    <Screen title="Nieuwe groep" eyebrow="DRIE IS DE BESTE MAAT">
      <Card>
        <Field
          label="Hoe heet je groep?"
          hint="Twee tot zestig tekens. Iets dat jullie herkennen in een WhatsApp-bericht."
          value={naam}
          onChangeText={setNaam}
          maxLength={60}
          placeholder="De donderdagclub"
        />
      </Card>

      <Card>
        <Choice
          label="Huddledag"
          hint={
            'De dag waarop jullie samenkomen. Bepaalt de weekafsluiting, De Ketting en ' +
            'het groepsoverzicht — niet wanneer jouw eigen weekdoelen resetten, want dat ' +
            'blijft je persoonlijke week-startdag.'
          }
          opties={HUDDLEDAGEN.map((d) => ({ waarde: d.waarde, label: d.label }))}
          waarde={huddledag}
          onKies={setHuddledag}
        />
        <Caption>
          Later te wijzigen. Een lopende ketting breekt daar niet van: schakels blijven staan
          in de week waarin ze gelegd zijn.
        </Caption>
      </Card>

      <Card nested>
        <Subheading>Wat er daarna gebeurt</Subheading>
        <Body muted>
          Je krijgt een uitnodigingslink die je kunt delen. Wie hem opent ziet de groep en
          waar jullie aan werken, ook zonder account. Je kunt de link altijd vernieuwen of
          sluiten.
        </Body>
        <Body muted>
          Je wordt beheerder. Er kunnen twaalf mensen in een groep, maar drie tot vijf werkt
          in de praktijk het best.
        </Body>
      </Card>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
        Groep aanmaken
      </Button>
      <Button variant="stil" block onPress={() => router.back()}>
        Annuleren
      </Button>
    </Screen>
  );
}
