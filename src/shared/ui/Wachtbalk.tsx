import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { radius, space, useTheme } from '../theme';
import { now } from '../time';

import { useReducedMotion } from './a11y';
import { bewegingsStijl } from './beweging';
import { Body, Caption, Subheading } from './Text';
import { VERWACHTE_WACHT_MS, voortgangsweergave, wachtstand } from './wachtvoortgang';

/**
 * Laat zien dat de coach nadenkt — QS8-208.
 *
 * ⚠️ **Hier stonden twee regels tekst en verder niets.** De call duurt ongeveer
 *    twintig seconden, en twintig seconden naar stilstaande tekst kijken voelt
 *    als een app die vastloopt. Dat is niet de conclusie van een ontwerper maar
 *    van de doorloop van 30-08: *"ik zie niet dat hij effectief aan het nadenken
 *    is."* Het is de plek in het snelle-start-epic waar de eerste gebruiker
 *    afhaakt.
 *
 * ⚠️ **Eén component voor beide schermen.** De Doelcoach en het weekdoelenscherm
 *    hadden letterlijk dezelfde vier regels JSX. Twee kopieën van dezelfde
 *    belofte is de naad uit onwrikbare regel 18: allebei kloppen ze, en zodra
 *    iemand er één aanpast lopen ze uit elkaar zonder dat er iets rood wordt.
 *
 * ⚠️ **De beslissingen zitten in `wachtvoortgang.ts` en niet hier.** Wat er in
 *    een `.tsx` staat, staat buiten de testsuite — er is geen
 *    React-testbibliotheek in dit project. Dit bestand tekent; het kiest niets.
 */

interface Props {
  /** Wat de coach doet, in de volgorde waarin hij het doet. Twee of drie. */
  readonly stappen: readonly string[];
  /** De uitweg tijdens het wachten. Laat de job doorlopen. */
  readonly uitweg?: React.ReactNode;
}

export function Wachtbalk({ stappen, uitweg }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const weergave = voortgangsweergave(reduced);

  const [verstreken, setVerstreken] = useState(0);

  useEffect(() => {
    // ⚠️ Een eigen klok en niet de rondeteller van het pollen. Die tikt per twee
    //    seconden, en een balk die met sprongen van twee seconden beweegt, ziet
    //    eruit als iets dat hapert. De pollus blijft waar hij hoort.
    //
    // ⚠️ `now()` uit `shared/time` en niet `Date.now()`: correctheidsregel 7 laat
    //    geen tweede klok toe, en de lint-regel wees dit meteen aan. Het is hier
    //    verstreken tijd en geen datumberekening, maar een tweede klok is een
    //    tweede klok — en deze is te bevriezen, wat `Date.now()` niet is.
    const begin = now().getTime();
    const tik = setInterval(() => setVerstreken(now().getTime() - begin), 250);

    return () => clearInterval(tik);
  }, []);

  const stand = wachtstand(verstreken, VERWACHTE_WACHT_MS, stappen.length);
  const percentage = Math.round(stand.deel * 100);

  return (
    <View style={styles.blok}>
      <Subheading>{t('wachten.denkt_na')}</Subheading>

      {/*
        ⚠️ Voorbij de verwachte tijd blijft de balk vol staan én zegt het scherm
           dat het langer duurt. Alleen de volle balk zou hetzelfde beeld geven
           als vóór deze wijziging: iets dat er klaar uitziet terwijl er niets
           gebeurt.
      */}
      <Body muted>
        {stand.fase === 'duurt_langer'
          ? t('wachten.duurt_langer')
          : (stappen[stand.stap] ?? t('wachten.duurt_even'))}
      </Body>

      {weergave.balk ? (
        <View
          style={[styles.spoor, { backgroundColor: theme.colors.panelDark }]}
          accessibilityRole="progressbar"
          accessibilityLabel={t('wachten.label')}
          accessibilityValue={{ min: 0, max: 100, now: percentage }}
        >
          <View
            style={[
              styles.vulling,
              {
                backgroundColor: theme.roles.progress,
                width: `${percentage}%`,
                ...bewegingsStijl(reduced, Platform.OS === 'web', weergave.animatieMs),
              },
            ]}
          />
        </View>
      ) : null}

      {/*
        ⚠️ De teller is de voortgang voor wie de balk niet ziet bewegen. Zonder
           hem valt "verminder beweging" terug op niets, en dat is precies de
           gebruiker die het minst aan een animatie heeft.
      */}
      {weergave.teller ? <Caption>{t('wachten.seconden', { n: stand.seconden })}</Caption> : null}

      {uitweg}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: space.blokGap - 4 },
  spoor: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  vulling: { height: '100%', borderRadius: radius.pill },
});
