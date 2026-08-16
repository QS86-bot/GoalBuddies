import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  bewaarOpenstaandeUitnodiging,
  fetchUitnodiging,
  huddledagLabel,
  neemDeel,
  vergeetOpenstaandeUitnodiging,
  type Uitnodiging,
} from '@/modules/buddies';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * De gastvrije uitnodigingslink — QS8-59.
 *
 * ⚠️ Dit scherm is de eerste indruk van het product voor iemand die de app nog
 *    nooit gezien heeft. Een uitnodiging die op een loginscherm eindigt, is een
 *    verloren buddy — dat is de goedkoopste retentie-ingreep die er is, en de
 *    reden dat `app/_layout.tsx` deze route bewust buiten de routewacht houdt.
 *
 * ⚠️ De code wordt bewaard vóór er ergens heen genavigeerd wordt. Zonder dat
 *    overleeft hij het aanmelden niet: met e-mailbevestiging aan tikt iemand een
 *    mailtje aan, komt terug in een verse app-sessie, en dit scherm is dan allang
 *    weg. Dat is niet het randgeval maar het hoofdpad, en het scherm belooft er
 *    letterlijk het tegenovergestelde van.
 *
 * ⚠️ Ingelogd de link openen maakt je níét automatisch lid. Een eerdere versie
 *    deed dat wel, en dan word je lid door alleen maar te kijken — terwijl er
 *    (nog) geen knop is om een groep te verlaten. Toetreden is nu altijd een
 *    druk op de knop, behalve op de ene route waar het de bedoeling is: als de
 *    sessie verschijnt terwijl dit scherm openstaat, want dan kwam je hier via
 *    "account maken en meedoen".
 */
export default function UitnodigingScherm() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { session, loading: sessieLaadt } = useSession();
  const { profiel } = useProfiel();

  const [uitnodiging, setUitnodiging] = useState<Uitnodiging | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [binnen, setBinnen] = useState<string | null>(null);

  /** Had dit scherm al een sessie toen het openging? Dan kwam je hier niet via aanmelden. */
  const sessieBijBinnenkomst = useRef<boolean | null>(null);
  const automatischGeprobeerd = useRef(false);

  useEffect(() => {
    if (!code) return;
    let levend = true;

    // Onthouden vóór alles. Gaat de bezoeker hierna aanmelden, dan overleeft de
    // uitnodiging de bevestigingsmail en de onboarding.
    void bewaarOpenstaandeUitnodiging(code);

    fetchUitnodiging(code)
      .then((gevonden) => {
        if (!levend) return;
        setUitnodiging(gevonden);
        setError(null);
      })
      .catch((f: unknown) => {
        if (levend) setError(f);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [code, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  const deelnemen = useCallback(async () => {
    if (!code) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await neemDeel(code);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      // ⚠️ Ook bij een fout vergeten. Blijft de code staan, dan probeert de app
      //    hem bij elke start opnieuw, en elke poging kost er één van de twintig
      //    per dag.
      void vergeetOpenstaandeUitnodiging();
      return;
    }

    void vergeetOpenstaandeUitnodiging();
    setBinnen(uitkomst.waarde);

    if (profiel?.onboarded_at) router.replace(`/groep/${uitkomst.waarde}`);
  }, [code, profiel, router]);

  /**
   * Verschijnt er een sessie terwijl dit scherm openstaat, dan kwam die van het
   * aanmeldscherm hiernaast — en dan is toetreden geen extra stap meer.
   *
   * ⚠️ Deze route zet geen `bezig` vóór de aanroep, anders is dat een setState in
   *    de body van een effect en dus een cascade van renders. De toestand
   *    verandert hier uitsluitend in de callback.
   *
   * ⚠️ De ref en niet de state als slot. State is pas bij de volgende render
   *    bijgewerkt, en tot dat moment zou een tweede effectronde nog een keer
   *    kunnen toetreden — en elke toetreding kost een poging uit de dagelijkse
   *    limiet van twintig.
   */
  useEffect(() => {
    if (sessieLaadt) return;

    // De momentopname staat in dezelfde effect-body als de beslissing die hem
    // gebruikt. Dat is geen elegantie maar noodzaak: een ref uitlezen tijdens de
    // render mag niet, en twee losse effecten geven geen vaste volgorde.
    if (sessieBijBinnenkomst.current === null) {
      sessieBijBinnenkomst.current = session !== null;
    }

    if (!session || uitnodiging === null || !code) return;
    if (sessieBijBinnenkomst.current !== false) return;
    if (automatischGeprobeerd.current) return;

    automatischGeprobeerd.current = true;
    let levend = true;

    neemDeel(code)
      .then((uitkomst) => {
        if (!levend) return;
        void vergeetOpenstaandeUitnodiging();

        if (!uitkomst.ok) {
          setFout(uitkomst.melding);
          return;
        }

        setBinnen(uitkomst.waarde);
        if (profiel?.onboarded_at) router.replace(`/groep/${uitkomst.waarde}`);
      })
      .catch(() => {
        if (levend) setFout('Deelnemen lukte niet. Probeer het zo nog eens.');
      });

    return () => {
      levend = false;
    };
  }, [sessieLaadt, session, uitnodiging, code, profiel, router]);

  return (
    <Screen
      title={uitnodiging === null && !loading ? 'Deze link werkt niet meer' : 'Je bent uitgenodigd'}
      eyebrow="BUDDY-GROEP"
    >
      <AsyncView
        loading={loading}
        error={error}
        data={uitnodiging ?? undefined}
        isEmpty={() => false}
        onRetry={herlaad}
        empty={{
          title: 'Deze uitnodiging werkt niet meer',
          body:
            'De link is ingetrokken of vervangen door een nieuwe. Vraag degene die je ' +
            'uitnodigde om hem nog eens te sturen — dan krijg je meteen de geldige.',
        }}
      >
        {(u) => (
          <View style={styles.lijst}>
            <Card>
              <Subheading>{u.group_name}</Subheading>
              <Caption>
                {u.member_count} {u.member_count === 1 ? 'lid' : 'leden'} · huddledag{' '}
                {huddledagLabel(u.huddle_day).toLowerCase()}
              </Caption>

              {u.members.map((lid, i) => (
                <View key={`${lid.display_name}-${i}`} style={styles.lid}>
                  <Avatar name={lid.display_name} url={lid.avatar_url} />
                  <View style={styles.lidTekst}>
                    <Body>{lid.display_name}</Body>
                    {/*
                      Geen doel gekoppeld is geen tekortkoming: het betekent
                      alleen dat deze persoon niets met de groep deelt. En zonder
                      account staat er sowieso geen doel — zie migratie 0019.
                    */}
                    {u.detailed ? (
                      <Caption>{lid.goal_title ?? 'Werkt nog niet aan een gedeeld doel'}</Caption>
                    ) : null}
                  </View>
                </View>
              ))}

              {u.detailed ? null : (
                <Caption>
                  Waar ze aan werken zie je zodra je meedoet. Dat is met opzet: wat mensen
                  hier delen, delen ze met hun groep en niet met iedereen die de link krijgt.
                </Caption>
              )}
            </Card>

            <Card nested>
              <Subheading>Wat je hier gaat doen</Subheading>
              <Body muted>
                Je kiest één doel met een datum erop. Elke week bepaal je wat je af wilt
                hebben, en één van je buddy&apos;s keurt goed dat het gelukt is. Meer niet.
              </Body>
              <Body muted>
                Een week missen kost een punt en verder niets. Niemand in de groep ziet het.
              </Body>
            </Card>

            {binnen !== null ? (
              <Card>
                <Subheading>Je zit in de groep</Subheading>
                <Body muted>
                  {profiel?.onboarded_at
                    ? 'Je wordt doorgestuurd naar de groep.'
                    : 'Maak eerst je profiel af — daarna staat de groep voor je klaar.'}
                </Body>
                {/*
                  ⚠️ Altijd een knop. Een scherm dat zegt "maak eerst je profiel
                     af" zonder te zeggen waar, is een doodlopend pad — en de
                     routewacht slaat deze route juist bewust over.
                */}
                <Button
                  variant="primair"
                  block
                  onPress={() =>
                    router.replace(profiel?.onboarded_at ? `/groep/${binnen}` : '/onboarding/uitleg')
                  }
                >
                  {profiel?.onboarded_at ? 'Naar de groep' : 'Profiel afmaken'}
                </Button>
              </Card>
            ) : session ? (
              <Button variant="primair" block busy={bezig} onPress={() => void deelnemen()}>
                Deelnemen aan deze groep
              </Button>
            ) : (
              <>
                <Button variant="primair" block onPress={() => router.push('/aanmelden')}>
                  Inloggen of account maken
                </Button>
                <Caption>
                  Je uitnodiging blijft op dit apparaat bewaard. Ook als je eerst je e-mail
                  moet bevestigen, sta je daarna gewoon in de groep.
                </Caption>
              </>
            )}

            {fout === null ? null : <Caption danger>{fout}</Caption>}
          </View>
        )}
      </AsyncView>

      {uitnodiging === null && !loading ? (
        <Button variant="secundair" block onPress={() => router.replace('/aanmelden')}>
          Toch even rondkijken
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  lid: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  lidTekst: { flex: 1, gap: 2 },
});
