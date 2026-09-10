import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '../i18n';

import { radius, space, useTheme } from '../theme';

import { Avatar } from './Avatar';
import { CHATDOC_TEKSTEN, Document } from './Document';
import { CHATFOTO_TEKSTEN, Foto } from './Foto';
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

/**
 * De bijlage van één bericht — precies één soort, of geen.
 *
 * ⚠️⚠️ **Een unie en geen twee losse props, en dat is een spiegel van de
 *    database.** De CHECK `chat_messages_attachment_eigen_pad` (migratie 0236)
 *    paart de soort aan de extensie: een rij is `photo` met een beeldextensie
 *    óf `doc` met `.pdf`, nooit allebei en nooit gekruist. Twee optionele props
 *    zouden een vierde stand toelaten — foto én document in één bubbel — die de
 *    tabel niet kan opleveren, en dan bewaakt het type niets meer.
 *
 * ⚠️⚠️ **De twee takken dragen tegengestelde beloftes en dat is met opzet
 *    zichtbaar in de veldnamen.** `foto.url` is een **ondertekende URL** (of
 *    `null`), getekend per pagina door `metGetekendeChatfotos()`. `doc` draagt
 *    geen URL en geen pad: een document wordt pas getekend als iemand tikt, en
 *    `Document` mag daarom niets hebben dat op een adres lijkt. Zie de kop van
 *    `Document.tsx` en `tekenChatdoc()`.
 */
export type Chatbijlage =
  | { readonly soort: 'foto'; readonly url: string | null }
  | {
      readonly soort: 'doc';
      /** De naam die de afzender koos — gebruikerstekst. */
      readonly naam: string;
      /** Wat `soortUitPad()` van het opslagpad maakte. Nooit uit `naam` afgeleid. */
      readonly documentsoort: 'pdf' | null;
      readonly bezig: boolean;
      readonly fout: string | null;
      readonly onOpenen: () => void;
    };

interface Props {
  readonly body: string;
  /** De bijlage, of `undefined` bij een bericht zonder. */
  readonly bijlage?: Chatbijlage | undefined;
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
   * ⚠️ Bewerken zit er niet. Een bewerkte regel in een gesprek van drie mensen
   *    is een gesprek waarvan de helft achteraf kan veranderen. Weghalen is
   *    eerlijker: dan is de regel weg en niet stil anders.
   *
   * ⚠️ **Tot 08-09-2026 stond hier "ook al staat de policy het 15 minuten toe",
   *    en dát is met migratie 0193 rechtgezet** (QS8-327). Die policy bestond
   *    sinds 0003 en had nooit een aanroeper; de app besloot hierboven dat de
   *    knop er niet komt, en de database zei vier maanden lang het
   *    tegenovergestelde. 📏 Gemeten: een bewerking van je eigen verse bericht
   *    gaf `HTTP 200` en landde gewoon, langs een rechtstreeks verzoek.
   *
   *    Nu is er geen recht meer om níet te gebruiken. Wie de knop alsnog wil,
   *    zet de policy terug én bouwt hem — en leest eerst
   *    `docs/decisions/2026-09-08-een-recht-zonder-knop.md`, want zonder een
   *    `edited_at`-markering is een bewerkt bericht precies het "stil anders"
   *    waar de regel hierboven tegen argumenteert.
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
  bijlage,
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
              ? t('chat.van_jou', { tekst: bubbeltekst(body, bijlage) })
              : t('chat.van_ander', { naam: senderName, tekst: bubbeltekst(body, bijlage) })
          }
        >
          {bijlage === undefined ? null : <Bijlage bijlage={bijlage} />}
          {body === '' ? null : <Body>{body}</Body>}
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

/**
 * De bijlage van een bubbel: één van de twee, nooit allebei.
 *
 * ⚠️ Een eigen functie en geen ternary in de bubbel, zodat het `switch`-achtige
 *    karakter zichtbaar is: komt er ooit een derde soort bij, dan is dit de plek
 *    waar TypeScript hem opeist.
 */
function Bijlage({ bijlage }: { readonly bijlage: Chatbijlage }) {
  if (bijlage.soort === 'foto') return <Foto url={bijlage.url} {...CHATFOTO_TEKSTEN} />;

  return (
    <Document
      naam={bijlage.naam}
      soort={bijlage.documentsoort}
      bezig={bijlage.bezig}
      fout={bijlage.fout}
      onOpenen={bijlage.onOpenen}
      {...CHATDOC_TEKSTEN}
    />
  );
}

/**
 * Wat een schermlezer als "inhoud van de bubbel" te horen krijgt.
 *
 * ⚠️⚠️ **Een bijlage zonder onderschrift is een leeg label, en dat is geen
 *    randgeval maar de gewone gang van zaken:** `chat_messages_inhoud_vereist`
 *    (0024) laat een bericht met alléén een bijlage uitdrukkelijk toe, en het
 *    scherm heeft er ook een knop voor. Zonder deze functie leest een
 *    schermlezer dan "Van jou: " en verder niets — de bubbel is er, en wat erin
 *    zit is onhoorbaar.
 *
 * ⚠️ Bij een document is de **naam** de tekst, want die koos de afzender en die
 *    onderscheidt drie bijlagen van elkaar. Is hij leeg, dan valt hij terug op de
 *    soort — nooit op het pad, want dat noemt twee uuid's.
 */
function bubbeltekst(body: string, bijlage: Chatbijlage | undefined): string {
  if (body !== '') return body;
  if (bijlage === undefined) return body;
  if (bijlage.soort === 'foto') return t('chatfoto.beeld');
  return bijlage.naam === '' ? t('chatdoc.soort_pdf') : bijlage.naam;
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

