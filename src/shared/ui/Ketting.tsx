import { Platform, StyleSheet, View } from 'react-native';

import { radius, useTheme } from '../theme';

import { useReducedMotion } from './a11y';
import { kettingLabel, kettingVulling, type KettingStand } from './metrics';
import { Caption, Subheading } from './Text';

/**
 * De Ketting — QS8-80. De gedeelde teller van de groep.
 *
 * Eén schakel per lid dat deze groepsperiode zijn cyclus afsloot. Dit is de
 * vertaling van Habit Huddle's Checkin Chain, en hij past juist op onze
 * groepsvorm: iedereen werkt aan iets anders, en tóch is er één getal dat van
 * jullie samen is.
 *
 * ⚠️ Dit component toont **aantallen en nooit namen**, en dat is geen
 *    vormgeving maar domeinregel 7. Zou hier staan wie er nog ontbreekt, dan is
 *    De Ketting een presentielijst en een ontbrekende schakel een publieke
 *    gemiste week. `ketting_stand()` geeft die namen niet eens terug — voor
 *    déze teller zit de bescherming dus in de database en is dit alleen de
 *    weergave.
 *
 * ⚠️ Dat geldt voor deze teller en niet voor het scherm eromheen. `MemberRow`
 *    toont eronder per lid mét naam of die zijn week afsloot; dat is een
 *    afzonderlijke, in QS8-55 bewust genomen beslissing die door
 *    `group_overview()` wordt begrensd, niet door `ketting_stand()`. In een
 *    groep van twee of drie maakt die ledenlijst de anonimiteit van deze teller
 *    dus grotendeels ongedaan. Bekend, opgeschreven in
 *    `docs/ENGINEER-REVIEW.md` (19-08) en het is een productbeslissing —
 *    **maar ga er niet vanuit dat dit component in zijn eentje domeinregel 7
 *    voor dit scherm afdwingt.**
 *
 * ⚠️ De ketting telt **opdagen, geen prestatie**. Vloer en plafond leveren
 *    dezelfde schakel op (acceptatiecriterium van QS8-80, en domeinregel 8).
 *    Daarom staat er nergens hoe goed iemand het deed.
 *
 * ⚠️ Geen rood, geen waarschuwing, geen "nog 2 te gaan". Onderweg is de ketting
 *    per definitie onaf; dat is de normale toestand van elke groep op
 *    maandagochtend en geen tekortkoming. De schakels zijn goud als de ketting
 *    rond is en groen zolang hij groeit — beide zijn positieve kleuren.
 */

interface Props {
  readonly stand: KettingStand;
  /** De schakels als bolletjes tonen. Uit in compacte lijsten. */
  readonly toonSchakels?: boolean;
}

/**
 * ⚠️ Boven dit aantal wordt het rijtje bolletjes onleesbaar en zegt de balk het
 *    beter. Een groep kan er twaalf hebben (de limiet uit migratie 0016).
 */
const MAX_BOLLETJES = 8;

export function Ketting({ stand, toonSchakels = true }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();

  const vulling = kettingVulling(stand);
  const percentage = Math.round(vulling * 100);
  const kleur = stand.voltallig ? theme.roles.brand : theme.roles.progress;

  const bolletjes = toonSchakels && stand.inAanmerking > 0 && stand.inAanmerking <= MAX_BOLLETJES;

  return (
    <View
      style={styles.blok}
      accessibilityRole="progressbar"
      // ⚠️ Ook voor een schermlezer geen namen en geen "ontbreekt": dezelfde
      //    zin als op het scherm, want een toegankelijkheidslabel is óók een
      //    oppervlak dat de groep ziet.
      accessibilityLabel={`De Ketting: ${kettingLabel(stand)}`}
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
    >
      <View style={styles.kop}>
        <Subheading>De Ketting</Subheading>
        <Caption>{kettingLabel(stand)}</Caption>
      </View>

      {bolletjes ? (
        <View style={styles.schakels}>
          {Array.from({ length: stand.inAanmerking }, (_, i) => (
            <View
              key={i}
              style={[
                styles.schakel,
                {
                  backgroundColor: i < stand.schakels ? kleur : theme.colors.panelDark,
                  ...(reduced || Platform.OS !== 'web' ? {} : { transitionDuration: '260ms' }),
                },
              ]}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.spoor, { backgroundColor: theme.colors.panelDark }]}>
          <View
            style={[
              styles.vulling,
              {
                backgroundColor: kleur,
                width: `${percentage}%`,
                ...(reduced || Platform.OS !== 'web' ? {} : { transitionDuration: '260ms' }),
              },
            ]}
          />
        </View>
      )}

      {/*
        ⚠️ Eén zin uitleg, want zonder die zin telt iemand de bolletjes en leest
           er een score in. De ketting gaat over opdagen; dat moet er letterlijk
           staan, anders bedenkt de lezer zijn eigen betekenis.

        ⚠️ Maar níét als de ketting rond is. Dan is er niets meer uit te leggen
           en leest "het gaat om opdagen, niet om hoeveel je haalde" als een
           verontschuldiging vooraf — alsof er iemand is die het minder deed en
           we dat vast willen gladstrijken. Bevinding van de gebruikersreview.
      */}
      {stand.voltallig ? null : (
        <Caption>
          Eén schakel per lid dat deze week zijn cyclus afsloot. Het gaat om opdagen,
          niet om hoeveel je haalde.
        </Caption>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 7 },
  kop: { gap: 2 },
  schakels: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  schakel: { width: 22, height: 10, borderRadius: radius.pill },
  spoor: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  vulling: { height: '100%', borderRadius: radius.pill },
});
