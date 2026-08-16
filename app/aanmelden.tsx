import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { signInWithEmail, signInWithOAuth, signUpWithEmail } from '@/modules/auth';
import { space } from '@/shared/theme';
import { Body, Button, Caption, Card, Field, Screen, Subheading } from '@/shared/ui';

/**
 * Aanmelden en inloggen. Eén scherm, want twee schermen betekent dat iemand op
 * het verkeerde begint en terug moet.
 *
 * ⚠️ De foutmelding bij een verkeerde combinatie is bewust één melding voor
 *    "onbekend adres" en "verkeerd wachtwoord" (zie `modules/auth/api.ts`). Twee
 *    aparte meldingen vertellen een aanvaller welke adressen een account hebben.
 */
export default function Aanmelden() {
  const [nieuw, setNieuw] = useState(true);
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<{ melding: string; veld?: 'email' | 'wachtwoord' } | null>(null);
  const [gelukt, setGelukt] = useState<string | null>(null);

  async function verzend() {
    setBezig(true);
    setFout(null);
    setGelukt(null);

    const uitkomst = nieuw
      ? await signUpWithEmail({ email, wachtwoord })
      : await signInWithEmail({ email, wachtwoord });

    if (!uitkomst.ok) {
      setFout({
        melding: uitkomst.melding,
        ...(uitkomst.veld === undefined ? {} : { veld: uitkomst.veld }),
      });
    } else if (nieuw) {
      // Staat e-mailbevestiging aan, dan is er nog geen sessie en gebeurt er
      // zichtbaar niets. Dat moet je zeggen, anders lijkt de knop stuk.
      setGelukt('Gelukt. Staat e-mailbevestiging aan, kijk dan even in je inbox.');
    }

    setBezig(false);
  }

  async function metProvider(provider: 'apple' | 'google') {
    setFout(null);
    const uitkomst = await signInWithOAuth(provider);
    if (!uitkomst.ok) setFout({ melding: uitkomst.melding });
  }

  return (
    <Screen title={nieuw ? 'Account maken' : 'Welkom terug'} eyebrow="GOALBUDDIES">
      <Card>
        <Field
          label="E-mailadres"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          textContentType="emailAddress"
          placeholder="jij@voorbeeld.nl"
          {...(fout?.veld === 'email' ? { error: fout.melding } : {})}
        />

        <Field
          label="Wachtwoord"
          {...(nieuw ? { hint: 'Minstens 12 tekens. Een korte zin werkt prima en onthoud je beter.' } : {})}
          value={wachtwoord}
          onChangeText={setWachtwoord}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={nieuw ? 'new-password' : 'current-password'}
          textContentType={nieuw ? 'newPassword' : 'password'}
          {...(fout?.veld === 'wachtwoord' ? { error: fout.melding } : {})}
        />

        {fout && fout.veld === undefined ? <Caption danger>{fout.melding}</Caption> : null}
        {gelukt === null ? null : <Caption muted={false}>{gelukt}</Caption>}

        <Button variant="primair" block busy={bezig} onPress={() => void verzend()}>
          {nieuw ? 'Account maken' : 'Inloggen'}
        </Button>

        <Button
          variant="stil"
          block
          onPress={() => {
            setNieuw((n) => !n);
            setFout(null);
            setGelukt(null);
          }}
        >
          {nieuw ? 'Ik heb al een account' : 'Ik ben nieuw hier'}
        </Button>
      </Card>

      <Card nested>
        <Subheading>Of gebruik een bestaand account</Subheading>
        {Platform.OS === 'web' ? (
          <View style={styles.providers}>
            <Button onPress={() => void metProvider('apple')}>Apple</Button>
            <Button onPress={() => void metProvider('google')}>Google</Button>
          </View>
        ) : (
          // Eerlijk zijn is hier beter dan een knop die niets doet: op native
          // heeft dit expo-web-browser nodig, en dat is een dependency die nog
          // niet gekozen is. Zie docs/Q-TODO.docx.
          <Body muted>
            Inloggen met Apple of Google werkt op dit moment alleen in de browser.
          </Body>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  providers: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
