import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  signOut,
  updateProfiel,
  useProfiel,
  verwijderMijnAccount,
  type Profiel as ProfielRij,
} from '@/modules/auth';
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
  Field,
  Screen,
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

            {/*
              ⚠️ Hier stond een `StreakCounter` met een hardgecodeerde `cycles={0}`.
                 Zolang nergens anders een reeks stond, was dat een plaatshouder.
                 Sinds QS8-75 toont "Vandaag" de échte reeks per doel, en dan is
                 dit geen plaatshouder meer maar een tegenspraak: acht weken op
                 rij op het ene scherm, "Nog geen reeks" op het andere. Een
                 gebruiker leest dat niet als een halfafgemaakte functie maar als
                 een rekenfout.

                 Een teller hoort hier ook inhoudelijk niet: een reeks is per
                 dóél (`user_streaks` heeft de sleutel `(user_id, goal_id)`), dus
                 één getal op een profielpagina zou moeten kiezen wélk doel — en
                 die keuze bestaat niet. De uitleg blijft, de tegenspraak gaat weg.
            */}
            <Card>
              <Subheading>Jouw reeks</Subheading>
              <Caption>
                Je reeks telt weken en staat per doel bij &ldquo;Je stand&rdquo; op Vandaag. Een
                weekpas beschermt je reeks als je een week mist — het punt niet, want anders zegt
                de score niets meer.
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

            <AccountVerwijderen />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * Je account verwijderen — Q-TODO A3, en een AVG-verplichting.
 *
 * ⚠️ Onomkeerbaar, dus met een tussenstap die je moet uittypen. Een knop met
 *    "weet je het zeker?" ernaast is op een telefoon één duimbeweging van een
 *    account dat weg is; het woord overtypen kost drie seconden en die drie
 *    seconden zijn hier het hele punt. Dit is precies het tegenovergestelde van
 *    de keuze op het beoordeelscherm, en om precies dezelfde reden: dáár is de
 *    vergissing goedkoop terug te draaien, hier niet.
 *
 * ⚠️ Wat er gebeurt staat er letterlijk bij, ook het deel dat blijft staan. Zou
 *    hier alleen "alles wordt verwijderd" staan, dan is dat niet waar: je
 *    goedkeuringen en je chatberichten blijven bestaan zonder je naam, want die
 *    zijn van je buddy's (migratie 0031).
 */
function AccountVerwijderen() {
  const [open, setOpen] = useState(false);
  const [bevestiging, setBevestiging] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const WOORD = 'VERWIJDER';

  async function verwijder() {
    setBezig(true);
    setFout(null);

    const uitkomst = await verwijderMijnAccount();
    setBezig(false);

    // Bij succes is de sessie al weg en stuurt de router je naar het inlogscherm;
    // er valt hier niets meer te tonen.
    if (!uitkomst.ok) setFout(uitkomst.melding);
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>Account verwijderen</Subheading>
        <Body muted>
          Je doelen, weken, Dagzetten, punten en lidmaatschappen verdwijnen. Wat blijft
          staan zijn de goedkeuringen die jij aan je buddy&rsquo;s gaf en je berichten in de
          groepschat — zonder je naam erbij. Die zijn van hen.
        </Body>
        <Button variant="stil" onPress={() => setOpen(true)}>
          Ik wil mijn account verwijderen
        </Button>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>Zeker weten?</Subheading>
      <Body>Dit kan niet ongedaan gemaakt worden. Er is geen back-up en geen hersteltermijn.</Body>
      <Field
        label={`Typ ${WOORD} om te bevestigen`}
        value={bevestiging}
        onChangeText={setBevestiging}
        autoCapitalize="characters"
        placeholder={WOORD}
      />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <View style={styles.keuzes}>
        <Button
          variant="secundair"
          busy={bezig}
          disabled={bevestiging.trim().toUpperCase() !== WOORD}
          onPress={() => void verwijder()}
        >
          Definitief verwijderen
        </Button>
        <Button
          variant="stil"
          disabled={bezig}
          onPress={() => {
            setOpen(false);
            setBevestiging('');
            setFout(null);
          }}
        >
          Toch niet
        </Button>
      </View>
    </Card>
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
  const [mislukt, setMislukt] = useState(false);

  useEffect(() => {
    let levend = true;

    fetchBuddyBijdrage(userId)
      .then((n) => {
        if (levend) setAantal(n);
      })
      // ⚠️ Een fout is geen nul. "Je hebt nog geen week beoordeeld" tegen iemand
      //    die er veertig deed, is precies de demotivatie waar deze teller tegen
      //    is bedoeld.
      .catch(() => {
        if (levend) setMislukt(true);
      });

    return () => {
      levend = false;
    };
  }, [userId]);

  return (
    <Card>
      <Subheading>Buddy-bijdrage</Subheading>
      <Body>
        {mislukt
          ? 'Even niet op te halen. Je bijdrage staat er nog, hij is alleen niet te tellen.'
          : aantal === null
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
