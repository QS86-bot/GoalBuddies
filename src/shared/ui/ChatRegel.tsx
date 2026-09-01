import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '../i18n';

import { radius, space, useTheme } from '../theme';

import { Avatar } from './Avatar';
import { Body, Caption } from './Text';

/**
 * Eén regel in de groepschat — QS8-69 en QS8-70.
 *
 * ⚠️ Een systeembericht ziet er anders uit dan een mens, en dat is geen opsmuk.
 *    Het systeem is het kanaal dat de groep vertrouwt: gaat het eruitzien als
 *    iemand die iets zegt, dan is "Tim bevestigde de week van Sanne" niet meer te
 *    onderscheiden van een bericht dat Tim zelf getypt heeft. Andersom net zo
 *    erg — en dat laatste was gat A5 (een lid dat een vals systeembericht kon
 *    plaatsen, gedicht in 0006 en 0010).
 *
 *    Een systeembericht heeft daarom geen avatar, geen naam en geen bubbel: het
 *    staat gecentreerd en zacht, als een regel in een logboek.
 *
 * ⚠️ Er staat nergens iets grijs of doorgestreept waar tegenslag zou kunnen
 *    staan. Dat komt niet doordat dit component het verbergt, maar doordat
 *    `chat_messages_system_event_bekend` (migratie 0025) zulke gebeurtenissen niet
 *    laat bestaan. Dit component is de weergave, niet het slot.
 */

interface Props {
  readonly body: string;
  /** `undefined` betekent: systeembericht. */
  readonly senderName?: string | undefined;
  readonly senderAvatar?: string | null | undefined;
  /** Van de ingelogde gebruiker zelf: rechts uitgelijnd. */
  readonly vanMij?: boolean;
  /** Weergavetijd, al opgemaakt door de aanroeper. Nooit hier berekend. */
  readonly tijd?: string | undefined;
  /**
   * Weghalen van je eigen bericht. Alleen doorgeven bij `vanMij`.
   *
   * ⚠️ Bewerken zit er niet, ook al staat de policy het 15 minuten toe. Een
   *    bewerkte regel in een gesprek van drie mensen is een gesprek waarvan de
   *    helft achteraf kan veranderen. Weghalen is eerlijker: dan is de regel weg
   *    en niet stil anders.
   */
  readonly onWeghalen?: (() => void) | undefined;
  /**
   * Melden van het bericht van een ánder — QS8-232.
   *
   * ⚠️ **Alleen doorgeven bij een bericht dat niet van jou is.** Een meldknop
   *    onder je eigen zin is onzin, en de database weigert hem ook (`reason:
   *    self`).
   *
   * ⚠️ Hij staat naast de tijd en niet achter een lang indrukken. Een meldknop
   *    die je moet ontdekken, is een meldknop die niet bestaat op het moment dat
   *    iemand hem nodig heeft — en dat moment is precies het moment waarop je
   *    niet gaat zoeken.
   */
  readonly onMelden?: (() => void) | undefined;
}

export function ChatRegel({
  body,
  senderName,
  senderAvatar,
  vanMij = false,
  tijd,
  onWeghalen,
  onMelden,
}: Props) {
  const c = useTheme().colors;

  if (senderName === undefined) {
    return (
      <View style={styles.systeem}>
        <Caption>{body}</Caption>
      </View>
    );
  }

  return (
    <View style={[styles.regel, vanMij ? styles.regelRechts : null]}>
      {vanMij ? null : <Avatar name={senderName} url={senderAvatar} size={28} />}

      <View style={styles.kolom}>
        {/*
          ⚠️ De naam staat er ook boven je eigen bericht níét, en boven dat van een
             ander wél. Uitlijning alleen is geen mededeling voor wie de app met een
             schermlezer gebruikt, dus die krijgt hem via het label van de bubbel.
        */}
        {vanMij ? null : <Caption>{senderName}</Caption>}

        <View
          style={[
            styles.bubbel,
            {
              backgroundColor: vanMij ? c.panelDark : c.panel,
              borderColor: c.border,
            },
            vanMij ? styles.bubbelRechts : styles.bubbelLinks,
          ]}
          accessibilityLabel={
            vanMij
              ? t('chat.van_jou', { tekst: body })
              : t('chat.van_ander', { naam: senderName, tekst: body })
          }
        >
          <Body>{body}</Body>
        </View>

        {/* `Caption` neemt met opzet geen `style` aan — de typografie hoort van
            het stelsel te komen. De uitlijning gaat dus via een omhulsel. */}
        {tijd === undefined && onWeghalen === undefined && onMelden === undefined ? null : (
          <View style={[styles.voet, vanMij ? styles.tijdRechts : null]}>
            {tijd === undefined ? null : <Caption>{tijd}</Caption>}
            {onWeghalen === undefined ? null : (
              <Pressable onPress={onWeghalen} accessibilityRole="button">
                <Caption>{t('chat.weghalen')}</Caption>
              </Pressable>
            )}
            {onMelden === undefined ? null : (
              <Pressable
                onPress={onMelden}
                accessibilityRole="button"
                accessibilityLabel={t('melden.bericht_knop')}
              >
                <Caption>{t('melden.titel')}</Caption>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  regel: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  regelRechts: { justifyContent: 'flex-end' },
  kolom: { gap: 3, flexShrink: 1, maxWidth: '86%' },
  bubbel: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bubbelLinks: {
    borderRadius: radius.base,
    borderBottomLeftRadius: 4,
  },
  bubbelRechts: {
    borderRadius: radius.base,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  voet: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tijdRechts: { justifyContent: 'flex-end' },
  systeem: {
    alignItems: 'center',
    paddingVertical: space.blokGap - 8,
    paddingHorizontal: space.shell,
  },
});
