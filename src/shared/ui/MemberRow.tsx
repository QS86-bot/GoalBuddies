import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { initiaalVan } from '../tekst';
import { radius, space, useTheme } from '../theme';

import { besteReeksLabel, ledenrijLabel } from './metrics';
import { StreakCounter } from './StreakCounter';
import { Body, Caption } from './Text';

/**
 * Eén lid in het groepsoverzicht.
 *
 * ⚠️ Deze rij is de gevaarlijkste plek in de app voor domeinregel 7. Alles wat
 *    hier zichtbaar is, is zichtbaar over iemand ánders. Daarom draagt hij
 *    uitsluitend positieve signalen: de reeks (opdagen) en of er deze periode
 *    iets is afgerond. Nooit een gemiste week, nooit een puntentotaal, nooit
 *    "loopt achter".
 *
 *    Een rij zonder vinkje betekent hier "nog niets binnen deze periode" en niet
 *    "deze persoon faalt" — en de tekst moet dat ook zeggen.
 *
 * ⚠️ **De rij spreekt met één stem, en die stem staat in `ledenrijLabel()`.**
 *    Tot 25-08-2026 was het "afgerond"-signaal een gekleurd bolletje zonder
 *    label: onhoorbaar voor een schermlezer en onzichtbaar voor wie kleuren niet
 *    onderscheidt, terwijl naam en reeks eronder wél werden voorgelezen. Het
 *    positieve signaal was daarmee de helft van de gebruikers niet gegeven, en
 *    dat is niet alleen een toegankelijkheidsgat: domeinregel 7 laat de groep
 *    juist wél zien wat er áf is.
 *
 *    De afwezigheid blijft stil. Er is geen label voor "nog niet", en er mag er
 *    ook nooit een bij komen — dat zou van dit overzicht de presentielijst maken
 *    die De Ketting met opzet niet is.
 */

interface Props {
  readonly name: string;
  /** Cycli op rij. Komt uit `group_visible_streaks`, nooit uit `user_streaks`. */
  readonly streak: number;
  /** Heeft dit lid deze groepsperiode iets afgerond? */
  readonly closedThisPeriod: boolean;
  /** Loopt er een aangekondigde adempauze? Neutraal, geen tegenslag. */
  readonly onBreather?: boolean;
  /**
   * De beste reeks ooit. **Alleen gevuld in een open groep** (besluit A41).
   *
   * ⚠️ Dit is het enige veld op deze rij dat tegenslag van een ander kan
   *    verraden — `best > current` betekent dat er een reeks gebroken is, en dat
   *    is precies waarom migratie 0019 de kolom uit `group_visible_streaks`
   *    haalde. Hij hoort hier dus nooit met een `?? 0` binnen te komen: `null`
   *    betekent "niet voor jou", en dat is niet hetzelfde als nul.
   */
  readonly bestStreak?: number | null;
}

export function MemberRow({
  name,
  streak,
  closedThisPeriod,
  onBreather = false,
  bestStreak = null,
}: Props) {
  const theme = useTheme();

  return (
    <View
      style={styles.rij}
      accessible
      accessibilityRole="text"
      accessibilityLabel={ledenrijLabel({ name, streak, closedThisPeriod, onBreather, bestStreak })}
    >
      <View style={[styles.avatar, { backgroundColor: theme.colors.panelDark }]}>
        <Caption muted={false}>{initiaalVan(name)}</Caption>
      </View>

      <View style={styles.midden}>
        <Body>{name}</Body>
        <StreakCounter cycles={streak} compact />
        {/*
          ⚠️ Alleen tonen als hij hóger is dan de lopende reeks. Staat hij gelijk,
             dan voegt hij niets toe; staat hij lager, dan is er iets mis met de
             data en is zwijgen beter dan een tegenstrijdig getal.
        */}
        {bestStreak !== null && bestStreak > streak ? (
          <Caption>{besteReeksLabel(bestStreak)}</Caption>
        ) : null}
      </View>

      {onBreather ? (
        <Caption>{t('lid.adempauze')}</Caption>
      ) : closedThisPeriod ? (
        <View style={[styles.vinkje, { backgroundColor: theme.roles.progress }]} />
      ) : (
        // Bewust niets. Geen grijs kruisje, geen "nog niet": een leeg vak zegt
        // al genoeg en beschuldigt niemand.
        <View style={styles.vinkje} />
      )}
    </View>
  );
}



const styles = StyleSheet.create({
  rij: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: space.rij.paddingVertical + 3,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  midden: { flex: 1, gap: 3 },
  vinkje: { width: 10, height: 10, borderRadius: radius.pill },
});
