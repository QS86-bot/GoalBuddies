import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BIJLAGE_BEWAARDAGEN } from '../bewaartermijn';
import { t } from '../i18n';
import { radius, space, useTheme } from '../theme';

import { Body, Caption } from './Text';

/**
 * Een document uit een privébucket, met zijn vier standen.
 *
 * ⚠️⚠️ **Dit component kent het opslagpad niet, en dat is de grendel.** Er is
 *    met opzet geen `pad`- en geen `url`-prop: het enige dat het kan doen is
 *    `onOpenen()` roepen, en wie dát afhandelt tekent eerst. Bij een
 *    `doc`-bericht is `attachment_url` in de app namelijk een **kaal pad** —
 *    de tegenovergestelde belofte van die bij een `photo`-bericht, waar het na
 *    `metGetekendeChatfotos()` een ondertekende URL is. Zie `tekenChatdoc()`
 *    in `src/modules/buddies/chatdoc.ts` voor waarom er geen paginategenaar is.
 *
 *    Een prop die er niet is, kan niet per ongeluk in een `Linking.openURL()`
 *    belanden. `tests/ui/document.test.tsx` toetst die belofte hier, bij de
 *    code die hem waarmaakt — niet bij het scherm dat hem vandaag gebruikt.
 *
 * ⚠️⚠️ **De soort komt uit het pad en nooit uit de naam.** `soort` is wat
 *    `soortUitPad()` van het opslagpad maakte, en dat pad ligt vast in de CHECK
 *    van migratie 0242. `naam` is gebruikerstekst: zou het label daaruit komen,
 *    dan stelt `factuur.pdf.exe` zich voor als PDF. Vandaar twee props waar één
 *    string had gekund.
 *
 * ⚠️ **Onwrikbare regel 16 geldt hier per tik en niet per render**, en dat is
 *    een echt verschil met `Foto`. Een foto laadt zodra de rij in beeld komt; een
 *    document doet niets tot iemand tikt. `bezig` en `fout` gaan dus over de
 *    handeling, en `soort === null` is de lege stand — het bestand is weg, of het
 *    pad heeft een vorm die we niet vertrouwen.
 */
export interface DocumentProps {
  /** De naam die de gebruiker koos. Leeg is toegestaan; dan draagt de soort het label. */
  readonly naam: string;
  /** Wat `soortUitPad()` van het opslagpad maakte. `null` is de lege stand. */
  readonly soort: 'pdf' | null;
  /** Loopt het tekenen en openen op dit moment? */
  readonly bezig: boolean;
  /** De melding van een mislukte poging, of `null`. */
  readonly fout: string | null;
  readonly onOpenen: () => void;
  readonly laadtekst: string;
  readonly afwezigtekst: string;
}

export function Document({
  naam,
  soort,
  bezig,
  fout,
  onOpenen,
  laadtekst,
  afwezigtekst,
}: DocumentProps) {
  const c = useTheme().colors;

  if (soort === null) return <Caption>{afwezigtekst}</Caption>;

  const soortlabel = t('chatdoc.soort_pdf');
  const titel = naam === '' ? soortlabel : naam;

  return (
    <View style={[styles.blok, { backgroundColor: c.panelDark, borderColor: c.border }]}>
      <Body numberOfLines={2}>{titel}</Body>
      <Caption>{soortlabel}</Caption>

      {/*
        ⚠️ De knop blijft staan tijdens een fout — een mislukte poging is bijna
           altijd een verlopen handtekening of een wegvallend netwerk, en dan is
           "nog eens" het antwoord. Een verdwenen knop maakt er een doodlopende
           weg van.
      */}
      {fout === null ? null : <Caption danger>{fout}</Caption>}

      {bezig ? (
        <View style={styles.bezig} accessibilityRole="progressbar" accessibilityLabel={laadtekst}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <Pressable
          onPress={onOpenen}
          accessibilityRole="button"
          /*
            ⚠️ Het label zegt **dat het de app verlaat**, en dat is geen
               beleefdheid maar de mededeling die je vóór de tik nodig hebt: het
               document belandt in de systeembrowser, en daarmee in geschiedenis
               en downloads — plekken waar deze app niets meer over te zeggen
               heeft. "Openen" alleen zegt dat niet, en zegt bovendien niet
               wélk document, wat in een lijst van drie bijlagen het verschil is.
          */
          accessibilityLabel={t('chatdoc.openen_label', { naam: titel })}
        >
          <Caption>{t('chatdoc.openen')}</Caption>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
    marginBottom: space.blokGap - 6,
  },
  bezig: { alignItems: 'flex-start' },
});

/** De twee teksten van de chat, zodat `ChatRegel` ze niet per aanroep herhaalt. */
export const CHATDOC_TEKSTEN = {
  get laadtekst() {
    return t('chatdoc.laden');
  },
  get afwezigtekst() {
    // ⚠️ De termijn komt uit `BIJLAGE_BEWAARDAGEN` en staat niet als getal in de
    //    zin: het scherm en de opruimpassen moeten dezelfde termijn noemen. Eén
    //    constante voor beide emmers sinds QS8-411.
    return t('chatdoc.niet_beschikbaar', { dagen: BIJLAGE_BEWAARDAGEN });
  },
};
