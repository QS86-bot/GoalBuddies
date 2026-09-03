import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  andereModus,
  beginModus,
  signInWithEmail,
  signInWithOAuth,
  signUpWithEmail,
  type Aanmeldmodus,
} from '@/modules/auth';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { Body, Button, Caption, Card, Field, Screen, Subheading } from '@/shared/ui';

/**
 * Aanmelden en inloggen. Eén scherm, want twee schermen betekent dat iemand op
 * het verkeerde begint en terug moet.
 *
 * ⚠️ De foutmelding bij een verkeerde combinatie is bewust één melding voor
 *    "onbekend adres" en "verkeerd wachtwoord" (zie `modules/auth/api.ts`). Twee
 *    aparte meldingen vertellen een aanvaller welke adressen een account hebben.
 *
 * ⚠️ **Waar dit scherm op opent, staat niet hier maar in `aanmeldmodus.ts`**
 *    (QS8-248). Er is geen renderer in dit project, dus een beslissing die in een
 *    `useState` blijft zitten is niet te toetsen — zelfde reden als
 *    `routewacht.ts`. Zet hier dus nooit een modus met de hand neer; dan gaat de
 *    grendel in `tests/beloftes/aanmeldscherm.test.ts` rood, en terecht.
 */
export default function Aanmelden() {
  const parameters = useLocalSearchParams();
  const [modus, setModus] = useState<Aanmeldmodus>(() => beginModus(parameters));

  // Eén afgeleide, zodat de rest van dit scherm leest zoals het altijd las.
  const nieuw = modus === 'aanmelden';

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
      setGelukt(t('auth.bevestig_inbox'));
    }

    setBezig(false);
  }

  async function metProvider(provider: 'apple' | 'google') {
    setFout(null);
    const uitkomst = await signInWithOAuth(provider);
    if (!uitkomst.ok) setFout({ melding: uitkomst.melding });
  }

  return (
    <Screen
      title={nieuw ? t('aanmelden.titel_nieuw') : t('aanmelden.titel_terug')}
      eyebrow={t('aanmelden.eyebrow')}
    >
      <Card>
        <Field
          label={t('aanmelden.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          textContentType="emailAddress"
          placeholder={t('aanmelden.email_hint')}
          {...(fout?.veld === 'email' ? { error: fout.melding } : {})}
        />

        <Field
          label={t('aanmelden.wachtwoord')}
          {...(nieuw ? { hint: t('aanmelden.wachtwoord_hint') } : {})}
          value={wachtwoord}
          onChangeText={setWachtwoord}
          wachtwoord
          autoCapitalize="none"
          autoComplete={nieuw ? 'new-password' : 'current-password'}
          textContentType={nieuw ? 'newPassword' : 'password'}
          {...(fout?.veld === 'wachtwoord' ? { error: fout.melding } : {})}
        />

        {fout && fout.veld === undefined ? <Caption danger>{fout.melding}</Caption> : null}
        {gelukt === null ? null : <Caption muted={false}>{gelukt}</Caption>}

        <Button variant="primair" block busy={bezig} onPress={() => void verzend()}>
          {nieuw ? t('aanmelden.knop_nieuw') : t('aanmelden.knop_inloggen')}
        </Button>

        <Button
          variant="stil"
          block
          onPress={() => {
            setModus(andereModus);
            setFout(null);
            setGelukt(null);
          }}
        >
          {nieuw ? t('aanmelden.heb_al_account') : t('aanmelden.ben_nieuw')}
        </Button>
      </Card>

      <Card nested>
        <Subheading>{t('aanmelden.bestaand_account')}</Subheading>
        {Platform.OS === 'web' ? (
          <View style={styles.providers}>
            <Button onPress={() => void metProvider('apple')}>Apple</Button>
            <Button onPress={() => void metProvider('google')}>Google</Button>
          </View>
        ) : (
          // Eerlijk zijn is hier beter dan een knop die niets doet: op native
          // heeft dit expo-web-browser nodig, en dat is een dependency die nog
          // niet gekozen is. Zie docs/Q-TODO.docx.
          <Body muted>{t('aanmelden.alleen_browser')}</Body>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  providers: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
