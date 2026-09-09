import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { CHATFOTO_BEWAARDAGEN } from '../bewaartermijn';
import { t } from '../i18n';
import { radius, space, useTheme } from '../theme';

import { Caption } from './Text';

/**
 * Een ondertekende foto uit een privébucket, met zijn drie standen.
 *
 * ⚠️⚠️ **De belofte die aan dit component hangt: `url` is een ondertekende URL
 *    of `null`, nooit een kaal opslagpad.** De datalaag tekent per pagina
 *    (`metGetekendeChatfotos()`, `metGetekendeBewijsfotos()`) en zet wat niet
 *    getekend kon worden op `null`. Een kaal pad hier zou een leeg vlak geven —
 *    en het is de vorm waarin een vreemde URL zou meeliften als de CHECK van
 *    migratie 0223 of 0229 er ooit uit valt.
 *
 * ⚠️ **Deze belofte is met dit component meeverhuisd uit `ChatRegel.tsx`
 *    (QS8-391).** CLAUDE.md noemt een verhuizing de gevaarlijkste beweging die
 *    er is: de tests gaan mee en blijven groen, want ze toetsen wat er in het
 *    bestand staat en niet wat het bestand beloofde. De belofte staat daarom
 *    hier, bij de code, en `tests/ui/foto.test.tsx` toetst hem op deze plek —
 *    niet op de plek waar hij vandaan komt.
 *
 * ⚠️ **"Geen foto" is een eigen uitkomst en geen lege ruimte.** `url` is `null`
 *    zodra het tekenen niets opleverde — een verwijderd bestand, een verlopen
 *    cache, of een lid dat de groep uit is. Een gebroken `<Image>` zegt de
 *    gebruiker niets; deze zin wel. Onwrikbare regel 16: laden, fout én leeg.
 *
 * ⚠️ De teksten komen van de aanroeper, want "deze foto is niet meer
 *    beschikbaar" leest in een gesprek anders dan bij een beoordeling. De drie
 *    standen zijn identiek; alleen de woorden verschillen.
 */
export interface FotoProps {
  readonly url: string | null;
  /** Vaste omschrijving voor een schermlezer. Nooit de laadtekst — zie hieronder. */
  readonly beschrijving: string;
  readonly laadtekst: string;
  readonly afwezigtekst: string;
}

export function Foto({ url, beschrijving, laadtekst, afwezigtekst }: FotoProps) {
  const c = useTheme().colors;
  const [stand, setStand] = useState<'laadt' | 'klaar' | 'mislukt'>('laadt');

  if (url === null) return <Caption>{afwezigtekst}</Caption>;

  return (
    <View style={styles.foto}>
      <Image
        source={{ uri: url }}
        style={styles.beeld}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        // ⚠️ Een vaste omschrijving en niet de laadtekst: dit label blijft staan
        //    nadat de foto geladen is, en een schermlezer las dan eeuwig "Foto
        //    laden". Het laden zelf zit in de `progressbar` hieronder, die
        //    verdwijnt zodra hij klaar is.
        accessibilityLabel={beschrijving}
        onLoad={() => setStand('klaar')}
        onError={() => setStand('mislukt')}
      />

      {stand === 'laadt' ? (
        <View style={styles.over} accessibilityRole="progressbar" accessibilityLabel={laadtekst}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : null}

      {stand === 'mislukt' ? (
        <View style={styles.over}>
          <Caption>{afwezigtekst}</Caption>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  foto: {
    // ⚠️ Een vaste hoogte, want de echte afmeting is pas ná het laden bekend en
    //    een springende lijst leest als een storing.
    height: 180,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.blokGap - 6,
  },
  beeld: { width: '100%', height: '100%' },
  over: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** De drie teksten van de chat, zodat `ChatRegel` ze niet per aanroep herhaalt. */
export const CHATFOTO_TEKSTEN = {
  get beschrijving() {
    return t('chatfoto.beeld');
  },
  get laadtekst() {
    return t('chatfoto.laden');
  },
  get afwezigtekst() {
    // ⚠️ De termijn komt uit `CHATFOTO_BEWAARDAGEN` en staat niet als getal in de
    //    zin: het scherm en de opruimpas van 0233 moeten dezelfde termijn noemen.
    return t('chatfoto.niet_beschikbaar', { dagen: CHATFOTO_BEWAARDAGEN });
  },
};

/** Idem voor het bewijs bij een voltooiing. */
export const BEWIJSFOTO_TEKSTEN = {
  get beschrijving() {
    return t('bewijsfoto.beeld');
  },
  get laadtekst() {
    return t('bewijsfoto.laden');
  },
  get afwezigtekst() {
    return t('bewijsfoto.niet_beschikbaar');
  },
};
