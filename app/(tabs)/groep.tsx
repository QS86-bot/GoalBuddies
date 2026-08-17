import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchMijnGroepen, huddledagLabel, type Groep } from '@/modules/buddies';
import { fetchBeoordelingen, volgBeoordelingen } from '@/modules/completions';
import { space } from '@/shared/theme';
import { AsyncView, Body, Button, Caption, Card, Screen, Subheading } from '@/shared/ui';

/**
 * Groep — de ingang naar je buddy-groepen.
 *
 * ⚠️ Het gevaarlijkste scherm van de app voor domeinregel 7. Alles achter dit
 *    tabblad is zichtbaar over iemand ánders. Bij elk ding dat erbij komt: kan
 *    hieruit iemands gemiste week worden afgeleid? Zo ja, dan is het fout, ook
 *    als het technisch werkt.
 *
 *    Er zijn precies twee routes waarlangs tegenslag dit tabblad mag bereiken, en
 *    beide lopen via de gebruiker zelf: vraag 2 van de weekafsluiting, en de knop
 *    "vraag je groep om hulp" van de Risico-radar.
 *
 * ⚠️ Deze lijst toont per groep alleen de naam en de huddledag. Bewust geen
 *    ledenaantal met een "3 van 5"-gevoel erbij en geen activiteitsindicator:
 *    "deze groep is stil" over een groep waar drie mensen in zitten, is een
 *    uitspraak over die drie mensen.
 */
export default function GroepTab() {
  const router = useRouter();

  const [groepen, setGroepen] = useState<readonly Groep[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    let levend = true;

    fetchMijnGroepen()
      .then((gevonden) => {
        if (!levend) return;
        setGroepen(gevonden);
        setError(null);
      })
      .catch((fout: unknown) => {
        if (levend) setError(fout);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  return (
    <Screen title="Groep">
      <TeBeoordelenKaart />

      <AsyncView
        loading={loading}
        error={error}
        data={groepen ?? undefined}
        isEmpty={(g) => g.length === 0}
        onRetry={herlaad}
        empty={{
          title: 'Nog geen buddy-groep',
          body:
            'Drie mensen is de beste maat: groot genoeg dat er altijd iemand reageert, ' +
            'klein genoeg dat je je niet kunt verstoppen. Maak een groep aan of gebruik ' +
            'de uitnodigingslink die je hebt gekregen.',
        }}
      >
        {(lijst) => (
          <View style={styles.lijst}>
            {lijst.map((groep) => (
              <GroepKaart
                key={groep.id}
                groep={groep}
                onOpen={() => router.push(`/groep/${groep.id}`)}
              />
            ))}
          </View>
        )}
      </AsyncView>

      <Button variant="primair" block onPress={() => router.push('/groep/nieuw')}>
        Groep aanmaken
      </Button>
      <Button variant="secundair" block onPress={() => router.push('/groep/deelnemen')}>
        Ik heb een uitnodigingscode
      </Button>
    </Screen>
  );
}

/**
 * "Er wacht iets op jou" — QS8-62.
 *
 * ⚠️ Deze kaart was de énige ingang naar het beoordeelscherm, en hij verborg
 *    zichzelf als het tellen mislukte. In de trein stond er dan "niets te
 *    beoordelen" terwijl er drie mensen wachtten, zonder enige manier om dat te
 *    controleren. Dat is dodelijk voor de succesmetriek uit de PRD (≥80% binnen
 *    48 uur): wie het niet ziet, beoordeelt niet.
 *
 *    Nu: bij een storing blijft de kaart staan met een eerlijke tekst en de knop
 *    erin. Beter een keer voor niets kijken dan nooit weten dat er iets was.
 *
 * ⚠️ Op nul blijft hij wél weg. Een kaart die permanent "0 te beoordelen" meldt,
 *    leert mensen om er niet meer naar te kijken — en dan is hij nutteloos op
 *    het moment dat er wél iets staat.
 */
function TeBeoordelenKaart() {
  const router = useRouter();
  const [aantal, setAantal] = useState(0);
  const [mislukt, setMislukt] = useState(false);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    let levend = true;

    fetchBeoordelingen()
      .then((w) => {
        if (!levend) return;
        setAantal(w.totaal);
        setMislukt(false);
      })
      .catch(() => {
        if (levend) setMislukt(true);
      });

    return () => {
      levend = false;
    };
  }, [ronde]);

  useEffect(() => {
    const stop = volgBeoordelingen(() => setRonde((n) => n + 1));
    return stop;
  }, []);

  if (aantal === 0 && !mislukt) return null;

  return (
    <Card>
      <Subheading>
        {mislukt
          ? 'Wachten er buddy’s op je?'
          : aantal === 1
            ? 'Een buddy wacht op je'
            : `${aantal} buddy's wachten op je`}
      </Subheading>
      <Body muted>
        {mislukt
          ? 'Dat konden we even niet ophalen. Kijk zelf even — het duurt tien seconden.'
          : 'Ze hebben hun week afgerond. Eén zin terug is genoeg — dat is het hele punt.'}
      </Body>
      <Button variant="primair" block onPress={() => router.push('/beoordelen')}>
        Beoordelen
      </Button>
    </Card>
  );
}

function GroepKaart({ groep, onOpen }: { readonly groep: Groep; readonly onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={groep.name}>
      <Card>
        <Subheading>{groep.name}</Subheading>

        {/*
          ⚠️ "Slaapt" is een eigenschap van de groep en niet van een lid. Het
             beschuldigt niemand en het is de enige manier om uit te leggen waarom
             de herinneringen gestopt zijn (5.9).
        */}
        {groep.status === 'sleeping' ? (
          <Body muted>
            Deze groep slaapt. Sluit iemand een week af, dan is hij meteen weer wakker.
          </Body>
        ) : null}

        <Caption>Huddledag: {huddledagLabel(groep.huddle_day)}</Caption>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
});
