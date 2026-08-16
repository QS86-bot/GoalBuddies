import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  fetchUitnodiging,
  huddledagLabel,
  neemDeel,
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
 * ⚠️ Wat hier zichtbaar is, komt uit `invite_preview()` (migratie 0016) en is
 *    precies zoveel als nodig: de groepsnaam, wie er meedoen en waar ze aan
 *    werken. Geen notities, geen chat, geen bewijs, geen reeksen, geen punten.
 *    Een doel staat er alleen in als de eigenaar het expliciet aan déze groep
 *    heeft gekoppeld (5.3) — koppelen is de toestemming, en dit scherm rekt die
 *    niet op.
 *
 * ⚠️ Werkt ook bij een verlopen sessie: de pagina hangt niet aan een sessie, dus
 *    zonder geldige sessie zie je gewoon de groep plus een knop om in te loggen.
 *    Verschijnt er daarna een sessie, dan wordt er automatisch toegetreden en
 *    land je in de groep — dat is het "groep al gejoined" uit de issue.
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
  const [binnen, setBinnen] = useState(false);

  /** Eén automatische toetredingspoging per keer dat dit scherm openstaat. */
  const automatischGeprobeerd = useRef(false);

  useEffect(() => {
    if (!code) return;
    let levend = true;

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
      return;
    }

    setBinnen(true);

    // ⚠️ Alleen doorsturen als de onboarding af is. Is dat niet zo, dan pakt de
    //    routewacht in `app/_layout.tsx` het over en zou een push hier meteen
    //    weggeduwd worden — met als resultaat dat iemand na de onboarding op het
    //    beginscherm belandt zonder te weten of hij nu in de groep zit. Het
    //    lidmaatschap staat er dan al; dat zegt de tekst hieronder ook.
    if (profiel?.onboarded_at) router.replace(`/groep/${uitkomst.waarde}`);
  }, [code, profiel, router]);

  /**
   * Verschijnt er een sessie terwijl dit scherm openstaat — iemand die zich via
   * deze link net heeft aangemeld — dan is toetreden geen extra stap meer.
   *
   * ⚠️ Deze route zet geen `bezig` vóór de aanroep, anders wordt dit een
   *    setState in de body van een effect en dat is een cascade van renders. De
   *    toestand verandert hier uitsluitend in de callback, wanneer het antwoord
   *    van de server binnen is. De knop hierboven mag dat wél doen: die reageert
   *    op een handeling en niet op een effect.
   *
   * ⚠️ De ref en niet de state als slot. State is pas bij de volgende render
   *    bijgewerkt, en tot dat moment zou een tweede effectronde nog een keer
   *    kunnen toetreden — en elke toetreding kost een poging uit de dagelijkse
   *    limiet van twintig.
   */
  useEffect(() => {
    if (sessieLaadt || !session || uitnodiging === null || !code) return;
    if (automatischGeprobeerd.current) return;

    automatischGeprobeerd.current = true;
    let levend = true;

    neemDeel(code)
      .then((uitkomst) => {
        if (!levend) return;

        if (!uitkomst.ok) {
          setFout(uitkomst.melding);
          return;
        }

        setBinnen(true);
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
    <Screen title="Je bent uitgenodigd" eyebrow="BUDDY-GROEP">
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

              {u.members.map((lid) => (
                <View key={`${lid.display_name}-${lid.goal_title ?? ''}`} style={styles.lid}>
                  <Avatar name={lid.display_name} url={lid.avatar_url} />
                  <View style={styles.lidTekst}>
                    <Body>{lid.display_name}</Body>
                    {/*
                      Geen doel gekoppeld is geen tekortkoming: het betekent
                      alleen dat deze persoon niets met de groep deelt.
                    */}
                    <Caption>{lid.goal_title ?? 'Werkt nog niet aan een gedeeld doel'}</Caption>
                  </View>
                </View>
              ))}
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

            {binnen ? (
              <Card>
                <Subheading>Je zit in de groep</Subheading>
                <Body muted>
                  {profiel?.onboarded_at
                    ? 'Je wordt doorgestuurd naar de groep.'
                    : 'Maak eerst je profiel af, dan staat de groep voor je klaar.'}
                </Body>
              </Card>
            ) : session ? (
              <Button variant="primair" block busy={bezig} onPress={() => void deelnemen()}>
                Deelnemen aan deze groep
              </Button>
            ) : (
              <>
                <Button variant="primair" block onPress={() => router.push('/aanmelden')}>
                  Account maken en meedoen
                </Button>
                <Caption>
                  Na het aanmelden kom je hier terug en zit je meteen in de groep.
                </Caption>
              </>
            )}

            {fout === null ? null : <Caption danger>{fout}</Caption>}
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  lid: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  lidTekst: { flex: 1, gap: 2 },
});
