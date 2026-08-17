import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { signOut, updateProfiel, useProfiel, type Profiel as ProfielRij } from '@/modules/auth';
import { fetchBuddyBijdrage } from '@/modules/completions';
import { space, useThemePreference, type ThemePreference } from '@/shared/theme';
import type { Weekday } from '@/shared/time';
import {
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Screen,
  StreakCounter,
  Subheading,
  WeekStartKeuze,
} from '@/shared/ui';

/**
 * Profiel — reeks, punten, weekpassen en instellingen.
 *
 * ⚠️ Dit is de enige plek waar punten mogen staan. `points_ledger` en het
 *    puntentotaal zijn uitsluitend voor de eigenaar leesbaar (domeinregel 10):
 *    een dalend totaal is zichtbaar bewijs van een gemiste week, en dat botst
 *    met domeinregel 7. De groep ziet De Ketting en mijlpalen, nooit dit scherm.
 */
export default function Profiel() {
  const { profiel, loading, error, zetProfiel } = useProfiel();

  return (
    <Screen title="Profiel">
      <AsyncView
        loading={loading}
        error={error}
        data={profiel ?? undefined}
        isEmpty={() => false}
        empty={{
          title: 'Geen profiel gevonden',
          body: 'Dat hoort niet te kunnen. Log uit en opnieuw in; blijft het misgaan, dan ligt het aan ons.',
        }}
      >
        {(p) => (
          <View style={styles.blokken}>
            <Card>
              <View style={styles.kop}>
                <Avatar name={p.display_name} url={p.avatar_url} size={44} />
                <View style={styles.kopTekst}>
                  <Subheading>{p.display_name}</Subheading>
                  <Caption>
                    {p.wants_own_goal ? 'Werkt aan een eigen doel' : 'Doet mee als buddy'}
                  </Caption>
                </View>
              </View>
            </Card>

            <Card>
              <Subheading>Jouw reeks</Subheading>
              <StreakCounter cycles={0} />
              <Caption>
                Zodra je eerste week telt, begint hij hier te lopen. Een weekpas beschermt je
                reeks als je een week mist — het punt niet, want anders zegt de score niets meer.
              </Caption>
            </Card>

            <BuddyBijdrage userId={p.id} />

            <WeekStartInstelling
              waarde={p.week_start_day as Weekday}
              userId={p.id}
              onOpgeslagen={zetProfiel}
            />

            <ThemaKeuze />

            <Card nested>
              <Subheading>Uitloggen</Subheading>
              <Body muted>Je blijft lid van je groepen. Je doelen blijven staan.</Body>
              <Button onPress={() => void signOut()}>Uitloggen</Button>
            </Card>
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * De week-startdag, aanpasbaar na de onboarding — QS8-28.
 *
 * ⚠️ Wijzigen midden in een cyclus laat punten en reeks met rust. De reeks en het
 *    grootboek staan vast op `cycle_start_date` van de rijen die er al zijn; die
 *    worden niet herschreven. In de praktijk betekent dat: de lopende week telt
 *    uit op de oude dag, de volgende begint op de nieuwe. Dat staat ook in de
 *    hint, want anders durft niemand het aan te raken.
 */
function WeekStartInstelling({
  waarde,
  userId,
  onOpgeslagen,
}: {
  readonly waarde: Weekday;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function kies(dag: Weekday) {
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, { week_start_day: dag });
    if (uitkomst.ok) onOpgeslagen(uitkomst.profiel);
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  return (
    <Card>
      <WeekStartKeuze waarde={waarde} onKies={(dag) => void kies(dag)} disabled={bezig} />
      <Caption>
        Verander je dit halverwege een week, dan telt de lopende week gewoon uit op de oude dag.
        Je punten en je reeks blijven staan.
      </Caption>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

const OPTIES: readonly { readonly waarde: ThemePreference; readonly label: string }[] = [
  { waarde: 'systeem', label: 'Systeem' },
  { waarde: 'navy', label: 'Donker' },
  { waarde: 'navy-licht', label: 'Licht' },
];

function ThemaKeuze() {
  const { preference, setPreference, ready } = useThemePreference();

  return (
    <Card>
      <Subheading>Weergave</Subheading>
      <Body muted>
        Donker is de standaard van dit stelsel. Kies je Systeem, dan volgt de app de instelling
        van je toestel — ook als die &apos;s avonds omschakelt.
      </Body>

      <View style={styles.keuzes}>
        {OPTIES.map(({ waarde, label }) => (
          <Button
            key={waarde}
            variant={preference === waarde ? 'primair' : 'secundair'}
            disabled={!ready}
            onPress={() => setPreference(waarde)}
            accessibilityLabel={`Weergave: ${label}`}
          >
            {label}
          </Button>
        ))}
      </View>
    </Card>
  );
}

/**
 * Buddy-bijdrage — QS8-67.
 *
 * ⚠️ Los van je eigen doelvoortgang, en dat is een acceptatiecriterium. Het zijn
 *    punten in hetzelfde grootboek maar zonder `goal_id`, zodat ze niet
 *    meetellen in de reeks of het totaal van een doel waar ze niets mee te maken
 *    hebben. Score en voortgang zijn twee dingen (domeinregel 10) en dit is nog
 *    een derde.
 *
 * ⚠️ Alleen van jezelf. `points_ledger` laat uitsluitend je eigen rijen door, dus
 *    dit getal kan niet per ongeluk dat van een ander zijn.
 */
function BuddyBijdrage({ userId }: { readonly userId: string }) {
  const [aantal, setAantal] = useState<number | null>(null);

  useEffect(() => {
    let levend = true;

    fetchBuddyBijdrage(userId)
      .then((n) => {
        if (levend) setAantal(n);
      })
      .catch(() => {
        if (levend) setAantal(0);
      });

    return () => {
      levend = false;
    };
  }, [userId]);

  return (
    <Card>
      <Subheading>Buddy-bijdrage</Subheading>
      <Body>
        {aantal === null
          ? '—'
          : aantal === 0
            ? 'Je hebt nog geen week van een buddy beoordeeld.'
            : aantal === 1
              ? 'Je hebt één week van een buddy beoordeeld.'
              : `Je hebt ${aantal} weken van buddy's beoordeeld.`}
      </Body>
      <Caption>
        Reviewen telt mee. Doorvragen levert net zoveel op als goedkeuren — het gaat om
        betrokkenheid, niet om ja zeggen.
      </Caption>
    </Card>
  );
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  kop: { flexDirection: 'row', gap: space.blokGap, alignItems: 'center' },
  kopTekst: { gap: 2, flex: 1 },
  keuzes: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
