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
import { bewaarWerkcode } from '@/modules/organisaties';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { Body, Button, Caption, Card, Field, Screen, Subheading } from '@/shared/ui';
import { useVolgTaal } from '@/shared/i18n/react';

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
  useVolgTaal();
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
      <Body muted>{t('aanmelden.positionering')}</Body>

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

      <WerkIngang />

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

/**
 * De tweede ingang, "Ik kom via mijn werk" — QS8-663. De code wordt alleen
 * onthouden: lid worden kan pas met een sessie en blijft een druk op de knop na
 * de onboarding (`organisaties/pending.ts`).
 */
function WerkIngang() {
  const [werkcode, setWerkcode] = useState('');
  const [melding, setMelding] = useState<string | null>(null);

  async function onthoud() {
    setMelding(null);
    const gelukt = await bewaarWerkcode(werkcode);
    setMelding(gelukt ? t('aanmelden.werk_onthouden') : t('organisatie.code_ongeldig'));
  }

  return (
    <Card nested>
      <Subheading>{t('aanmelden.werk_kop')}</Subheading>
      <Body muted>{t('aanmelden.werk_tekst')}</Body>
      <Field
        label={t('organisatie.code_label')}
        value={werkcode}
        onChangeText={setWerkcode}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="VYHC-2X9G-SRVH"
      />
      {melding === null ? null : <Caption muted={false}>{melding}</Caption>}
      <Button variant="secundair" block onPress={() => void onthoud()}>
        {t('aanmelden.werk_knop')}
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  providers: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
