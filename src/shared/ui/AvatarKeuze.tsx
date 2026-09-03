import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Card } from './Card';
import { Body, Caption, Subheading } from './Text';

/**
 * De kaart waarmee je je profielfoto zet of weghaalt — QS8-196.
 *
 * ⚠️ **Presentatie en verder niets.** Het kiezen, uploaden en verwijderen staat
 *    in `useAvatarKeuze()` in `modules/auth`; dit bestand importeert geen
 *    datalaag. Zo blijft `shared/ui` te renderen zonder Supabase, en wijst
 *    `modules/` niet naar de schermlaag — de lintregel met de dossierrij van
 *    19-08.
 *
 * ⚠️ **Eén kaart en niet twee.** Hij hangt op het profieltabblad én in de
 *    onboarding. Twee kopieën zouden na de eerste wijziging uiteenlopen, en de
 *    grens die eronder ligt (2 MB, drie MIME-types) is er niet een om op twee
 *    plekken te onderhouden.
 *
 * ⚠️ **De maximale grootte staat in de tekst en komt uit de constante**, niet uit
 *    een getal in de catalogus. `tests/beloftes/avatar.test.ts` legt die
 *    constante naast migratie 0126; een zin die zijn eigen getal draagt zou daar
 *    langs kunnen lopen.
 */
export function AvatarKeuze({
  naam,
  avatarUrl,
  maxBytes,
  bezig,
  fout,
  onKies,
  onWeghalen,
}: {
  readonly naam: string;
  readonly avatarUrl: string | null;
  readonly maxBytes: number;
  readonly bezig: boolean;
  readonly fout: string | null;
  readonly onKies: () => void;
  readonly onWeghalen: () => void;
}) {
  const heeftFoto = avatarUrl !== null;

  return (
    <Card>
      <Subheading>{t('avatar.kop')}</Subheading>
      <View style={styles.avatarRij}>
        <Avatar name={naam} url={avatarUrl} size={56} />
        <Body muted>{t('avatar.uitleg')}</Body>
      </View>

      <Button onPress={onKies} busy={bezig} variant="secundair">
        {heeftFoto ? t('avatar.vervangen') : t('avatar.kiezen')}
      </Button>

      {heeftFoto ? (
        <Button onPress={onWeghalen} disabled={bezig} variant="stil">
          {t('avatar.verwijderen')}
        </Button>
      ) : null}

      <Caption>
        {t('avatar.grens', { mb: String(Math.round(maxBytes / 1024 / 1024)) })}
      </Caption>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

const styles = StyleSheet.create({
  avatarRij: { alignItems: 'center', flexDirection: 'row', gap: 12 },
});
