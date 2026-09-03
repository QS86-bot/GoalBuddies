import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { opmaaktaal, t, weekdagKort } from '../i18n';
import {
  dagIsTeKiezen,
  eersteVanDeMaand,
  maandErbij,
  maandraster,
  toonDatum,
  toonMaand,
  type IsoDate,
  type Weekday,
} from '../time';
import { radius, space, useTheme } from '../theme';

import { focusRing } from './a11y';
import { Button } from './Button';
import { Caption, Subheading } from './Text';

/**
 * Een datum kiezen uit een kalender — QS8-223.
 *
 * ⚠️ **Eén plek waar een datum de app in komt**, met dezelfde rol als
 *    `TijdzoneKeuze` en `WeekStartKeuze`. Vóór dit component was elk datumveld
 *    een kaal tekstveld met `2026-12-31` als plaatshouder: de gebruiker moest het
 *    formaat kennen. Dat `isoDatum` in `modules/goals/schemas.ts` bestaat, komt
 *    daar rechtstreeks uit — iemand typte iets anders, en
 *    `datumLigtInDeToekomst` vergelijkt strings, dus `'morgen' > '2026-08-18'`
 *    was gewoon waar.
 *
 * ⚠️ **Dit is gebruiksgemak en geen validatie.** `isoDatum`,
 *    `datumLigtInDeToekomst` en de CHECK's in de database blijven staan en
 *    blijven de grens. Een kalender in het scherm zegt niets over wat er via
 *    PostgREST binnenkomt — zelfde redenering als de kop van `auth/schemas.ts`.
 *
 * ⚠️ **Geen datumbibliotheek en geen `@react-native-community/datetimepicker`,
 *    ook al stelde het issue dat laatste voor.** Drie redenen, en ze staan
 *    uitgeschreven in `docs/decisions/2026-09-03-een-kalender-zonder-pakket.md`:
 *    het rekenwerk hoort per correctheidsregel 7 in `shared/time` en niet in de
 *    binnenkant van een pakket, één raster op beide platformen is één ding om te
 *    toetsen in plaats van twee, en er is in dit project geen native build waarin
 *    een native picker ook maar één keer te zien zou zijn geweest.
 *
 * ⚠️ **`startDag` komt van de aanroeper en wordt hier nooit verzonnen.**
 *    Domeinregel 1: de week-startdag is een instelling van de gebruiker. Een
 *    kalender die altijd op maandag begint, laat iemand met een zondagweek elke
 *    keer een kolom verkeerd lezen.
 */

interface Props {
  readonly label: string;
  readonly hint?: string | undefined;
  /** De gekozen datum als `YYYY-MM-DD`, of `''` als er nog niets gekozen is. */
  readonly waarde: string;
  readonly onKies: (datum: string) => void;
  /** De week-startdag uit het profiel — zie de kop. */
  readonly startDag: Weekday;
  /** Dagen hiervóór zijn niet aan te tikken. `YYYY-MM-DD`. */
  readonly min?: string | undefined;
  readonly max?: string | undefined;
  /**
   * De maand die opengaat als er nog niets gekozen is. Hoort "vandaag in de
   * tijdzone van de gebruiker" te zijn; die berekening staat in `shared/time` en
   * niet hier.
   */
  readonly vandaag: string;
  /** Mag de datum leeg blijven? Dan staat er een knop om hem te wissen. */
  readonly optioneel?: boolean | undefined;
  readonly error?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export function DatumKeuze({
  label,
  hint,
  waarde,
  onKies,
  startDag,
  min,
  max,
  vandaag,
  optioneel = false,
  error,
  disabled = false,
}: Props) {
  const theme = useTheme();
  const c = theme.colors;

  // ⚠️ De maand die je bekijkt is iets anders dan de datum die je koos. Wie
  //    doorbladert en niets aantikt, hoort niet teruggeworpen te worden.
  const [maand, setMaand] = useState<IsoDate>(
    eersteVanDeMaand((waarde === '' ? vandaag : waarde) as IsoDate),
  );
  const [open, setOpen] = useState(false);

  const raster = maandraster(maand, startDag);
  const taal = opmaaktaal();

  return (
    <View style={styles.blok}>
      <Subheading>{label}</Subheading>
      {hint === undefined ? null : <Caption>{hint}</Caption>}

      {/*
        ⚠️ **De knop toont de datum in de notatie van het toestel** (QS8-221) en
           nooit de ISO-waarde. Wat er naar de datalaag gaat is wél ISO; dat
           verschil is de hele reden dat `toonDatum` bestaat.
      */}
      <Button
        variant="stil"
        block
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel={`${label}: ${
          waarde === '' ? t('datumkeuze.niets_gekozen') : toonDatum(waarde, taal)
        }`}
      >
        {waarde === '' ? t('datumkeuze.kies') : toonDatum(waarde, taal)}
      </Button>

      {error === undefined ? null : <Caption danger>{error}</Caption>}

      {!open ? null : (
        <View style={[styles.paneel, { backgroundColor: c.panelDark, borderColor: c.border }]}>
          <View style={styles.maandrij}>
            <Button
              variant="stil"
              onPress={() => setMaand(maandErbij(maand, -1))}
              accessibilityLabel={t('datumkeuze.vorige_maand')}
            >
              {'<'}
            </Button>
            <Subheading>{toonMaand(maand, taal)}</Subheading>
            <Button
              variant="stil"
              onPress={() => setMaand(maandErbij(maand, 1))}
              accessibilityLabel={t('datumkeuze.volgende_maand')}
            >
              {'>'}
            </Button>
          </View>

          <View style={styles.week}>
            {raster.kolommen.map((dag) => (
              <View key={dag} style={styles.vakje}>
                <Caption>{weekdagKort(dag)}</Caption>
              </View>
            ))}
          </View>

          {raster.weken.map((week) => (
            <View key={week[0]!.datum} style={styles.week}>
              {week.map((dag) => (
                <Dagvakje
                  key={dag.datum}
                  datum={dag.datum}
                  inMaand={dag.inMaand}
                  gekozen={dag.datum === waarde}
                  vandaag={dag.datum === vandaag}
                  teKiezen={dagIsTeKiezen(dag.datum, {
                    min: min as IsoDate | undefined,
                    max: max as IsoDate | undefined,
                  })}
                  onKies={() => {
                    onKies(dag.datum);
                    setOpen(false);
                  }}
                />
              ))}
            </View>
          ))}

          {/*
            ⚠️ Wissen staat er alleen als leeg ook echt mag. Een knop die een
               verplicht veld leegmaakt, levert een foutmelding op en geen keuze.
          */}
          {!optioneel ? null : (
            <Button
              variant="stil"
              block
              onPress={() => {
                onKies('');
                setOpen(false);
              }}
            >
              {t('datumkeuze.wissen')}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Eén dag.
 *
 * ⚠️ **Een dag die niet mag, is niet aan te tikken en niet stilletjes fout.** Dat
 *    is het punt van acceptatiecriterium 3: een streefdatum in het verleden hoort
 *    een dag te zijn die je niet kunt kiezen, niet een melding achteraf.
 *
 * ⚠️ Vandaag krijgt een rand en niet alleen een kleur. Kleur alleen is geen
 *    mededeling voor wie kleurenblind is — zelfde regel als bij `Field`.
 */
function Dagvakje({
  datum,
  inMaand,
  gekozen,
  vandaag,
  teKiezen,
  onKies,
}: {
  readonly datum: IsoDate;
  readonly inMaand: boolean;
  readonly gekozen: boolean;
  readonly vandaag: boolean;
  readonly teKiezen: boolean;
  readonly onKies: () => void;
}) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);
  const c = theme.colors;
  const nummer = datum.slice(-2).replace(/^0/, '');

  return (
    <Pressable
      style={[
        styles.vakje,
        gekozen ? { backgroundColor: c.accent } : null,
        vandaag && !gekozen ? { borderColor: c.accent, borderWidth: 1 } : null,
        focusRing(theme, heeftFocus),
      ]}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      disabled={!teKiezen}
      onPress={onKies}
      accessibilityRole="button"
      accessibilityState={{ disabled: !teKiezen, selected: gekozen }}
      accessibilityLabel={toonDatum(datum, opmaaktaal())}
    >
      <Caption muted={!inMaand || !teKiezen}>{nummer}</Caption>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blok: { gap: 6 },
  paneel: {
    borderWidth: 1,
    borderRadius: radius.md,
    ...space.paneel,
    gap: 6,
  },
  maandrij: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  week: { flexDirection: 'row' },
  vakje: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
