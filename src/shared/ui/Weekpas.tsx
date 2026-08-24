import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';

import { radius, useTheme } from '../theme';

import { weekpasLabel, weekpasVoortgang, type WeekpasStand } from './metrics';
import { Body, Caption, Subheading } from './Text';

/**
 * De weekpasteller — QS8-81. De vertaling van Habit Huddle's streak freezes.
 *
 * Eén pas per zes voltooide cycli, plus één cadeau na je eerste. Een gemiste
 * week verbruikt er automatisch een: je reeks loopt door, het minpunt blijft
 * staan.
 *
 * ⚠️ **Dit component is privé en hoort nooit in een groepsscherm.** Een
 *    verbruikte weekpas is het bewijs van een gemiste week (domeinregel 7), en
 *    zelfs de voorraad verklapt iets: wie er vorige week twee had en er nu één
 *    heeft, heeft gemist. `weekpas_stand()` geeft daarom alleen antwoord aan de
 *    eigenaar van het doel — maar leun daar niet op. Zet dit component niet
 *    naast een ledenlijst en geef het geen `viewer`-prop in de hoop dat het dan
 *    wel goed komt; er is geen groepsvariant en die hoort er ook niet te komen.
 *
 * ⚠️ Geen rood en geen alarm bij nul. Nul passen is de begintoestand van elke
 *    gebruiker, niet een tekort. De teller is grijs tot er iets te vieren valt
 *    en wordt dan goud — dezelfde kleurregel als De Ketting.
 *
 * ⚠️ De uitleg zegt met zoveel woorden dat de pas de reeks redt en niet het
 *    punt. Zonder die zin denkt de helft van de gebruikers dat een pas de week
 *    ongedaan maakt, en dan voelt een terecht minpunt als een storing.
 */

interface Props {
  readonly stand: WeekpasStand;
  /**
   * Heeft een pas de zojuist afgesloten cyclus gered? Dan komt de melding
   * achteraf erbij die QS8-81 vraagt.
   *
   * ⚠️ De aanroeper bepaalt dit met `weekpasReddeDezeCyclus()`; dit component
   *    rekent geen cyclus uit (correctheidsregel 7).
   */
  readonly reddeVorigeWeek?: boolean;
}

/**
 * ⚠️ Boven dit aantal wordt het rijtje onleesbaar. De bovengrens uit de database
 *    is nu twee, dus dit is ruim — maar het getal komt uit `stand.maximum` en
 *    kan meebewegen, en dan mag dit component niet stuk.
 */
const MAX_BOLLETJES = 6;

export function Weekpas({ stand, reddeVorigeWeek = false }: Props) {
  const theme = useTheme();

  const kleur = stand.voorraad > 0 ? theme.roles.brand : theme.colors.grey;
  const bolletjes = stand.maximum > 0 && stand.maximum <= MAX_BOLLETJES;

  return (
    <View style={styles.blok} accessibilityLabel={weekpasLabel(stand)}>
      <View style={styles.kop}>
        <Subheading>{t('weekpas.titel')}</Subheading>
        <Caption>{weekpasLabel(stand)}</Caption>
      </View>

      {bolletjes ? (
        <View style={styles.passen}>
          {Array.from({ length: stand.maximum }, (_, i) => (
            <View
              key={i}
              style={[
                styles.pas,
                {
                  backgroundColor: i < stand.voorraad ? kleur : theme.colors.panelDark,
                  borderColor: theme.colors.border,
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      {/*
        ⚠️ De melding achteraf. Staat hier en niet in de groepschat, en dat is
           het hele punt: dit is de enige plek waar een gemiste week benoemd
           wordt, en hij is alleen voor jezelf. Een systeembericht hierover zou
           domeinregel 7 breken en staat daarom niet op de allowlist in
           `chat_messages_system_event_bekend`.

        ⚠️ De toon is "gered", niet "je hebt gemist". Het feit is hetzelfde, maar
           dit is precies het moment waarop iemand de app weggooit — de reeks
           die hij dacht kwijt te zijn, staat er nog.
      */}
      {reddeVorigeWeek ? (
        <View style={[styles.melding, { borderColor: theme.roles.brand }]}>
          <Body>{t('weekpas.gered')}</Body>
          {/*
            ⚠️ "Er is één punt afgegaan" en niet "het punt is vervallen". Dat
               eerste is wat er gebeurt — de rollover boekt −1 in het
               grootboek — en het tweede suggereert dat er alleen iets níét
               bijgekomen is. Wie dat leest en later zijn totaal ziet dalen,
               denkt dat de app niet kan rekenen.
          */}
          <Caption>
            Vorige week is niet afgerond, maar je reeks loopt gewoon door. Voor die week is er
            wel één punt afgegaan.
          </Caption>
        </View>
      ) : null}

      <Caption>{weekpasVoortgang(stand)}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 7 },
  kop: { gap: 2 },
  passen: { flexDirection: 'row', gap: 6 },
  pas: { width: 26, height: 12, borderRadius: radius.pill, borderWidth: 1 },
  melding: { borderLeftWidth: 3, paddingLeft: 10, gap: 2 },
});
