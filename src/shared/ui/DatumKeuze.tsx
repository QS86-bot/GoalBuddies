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
  type Maandraster,
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
  // ⚠️ De maand die je bekijkt is iets anders dan de datum die je koos. Wie
  //    doorbladert en niets aantikt, hoort niet teruggeworpen te worden.
  const [maand, setMaand] = useState<IsoDate>(
    eersteVanDeMaand((waarde === '' ? vandaag : waarde) as IsoDate),
  );
  const [open, setOpen] = useState(false);

  const taal = opmaaktaal();

  return (
    <View style={styles.blok}>
      <Subheading>{label}</Subheading>
      {hint === undefined ? null : <Caption>{hint}</Caption>}

      <Datumknop
        label={label}
        waarde={waarde}
        taal={taal}
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
      />

      {error === undefined ? null : <Caption danger>{error}</Caption>}

      {!open ? null : (
        <Kalenderpaneel
          maand={maand}
          onMaand={setMaand}
          startDag={startDag}
          taal={taal}
          waarde={waarde}
          vandaag={vandaag}
          min={min}
          max={max}
          optioneel={optioneel}
          onKies={(datum) => {
            onKies(datum);
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}

/**
 * De knop die het paneel opent en de gekozen datum toont.
 *
 * ⚠️ **De knop toont de datum in de notatie van het toestel** (QS8-221) en nooit
 *    de ISO-waarde. Wat er naar de datalaag gaat is wél ISO; dat verschil is de
 *    hele reden dat `toonDatum` bestaat.
 *
 * ⚠️ Het `accessibilityLabel` noemt het veld én de stand, want "12 maart" alleen
 *    zegt een schermlezer niet wélke datum dit is.
 */
function Datumknop({
  label,
  waarde,
  taal,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly waarde: string;
  readonly taal: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const tekst = waarde === '' ? t('datumkeuze.kies') : toonDatum(waarde, taal);
  const stand = waarde === '' ? t('datumkeuze.niets_gekozen') : toonDatum(waarde, taal);

  return (
    <Button
      variant="stil"
      block
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={`${label}: ${stand}`}
    >
      {tekst}
    </Button>
  );
}

/**
 * De weekdagkoppen en de zes weken eronder.
 *
 * ⚠️ Altijd zes rijen — dat besluit staat in `maandraster()` en niet hier: een
 *    raster dat per maand van hoogte verspringt, laat de knoppen eronder
 *    dansen.
 */
function Dagenraster({
  raster,
  waarde,
  vandaag,
  min,
  max,
  onKies,
}: {
  readonly raster: Maandraster;
  readonly waarde: string;
  readonly vandaag: string;
  readonly min?: string | undefined;
  readonly max?: string | undefined;
  readonly onKies: (datum: string) => void;
}) {
  return (
    <>
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
              onKies={() => onKies(dag.datum)}
            />
          ))}
        </View>
      ))}
    </>
  );
}

/**
 * De maandkop: terug, de maandnaam, vooruit.
 *
 * ⚠️ De twee knoppen dragen een `accessibilityLabel` en niet alleen een pijltje.
 *    `<` en `>` zijn voor een schermlezer geen richting maar een teken.
 */
function Maandkop({
  maand,
  taal,
  onMaand,
}: {
  readonly maand: IsoDate;
  readonly taal: string;
  readonly onMaand: (m: IsoDate) => void;
}) {
  return (
    <View style={styles.maandrij}>
      <Button
        variant="stil"
        onPress={() => onMaand(maandErbij(maand, -1))}
        accessibilityLabel={t('datumkeuze.vorige_maand')}
      >
        {'<'}
      </Button>
      <Subheading>{toonMaand(maand, taal)}</Subheading>
      <Button
        variant="stil"
        onPress={() => onMaand(maandErbij(maand, 1))}
        accessibilityLabel={t('datumkeuze.volgende_maand')}
      >
        {'>'}
      </Button>
    </View>
  );
}

/**
 * Het opengeklapte paneel: maandkop, weekdagen, het raster en de wisknop.
 *
 * ⚠️ **Staat los van `DatumKeuze` omdat die anders over de vijfenzeventig regels
 *    gaat** die `src/shared/ui` sinds QS8-190 als plafond heeft. Het is bovendien
 *    de natuurlijke snede: `DatumKeuze` houdt de stáát (welke maand, open of
 *    dicht) en dit stuk tekent alleen.
 *
 * ⚠️ De keuze sluit het paneel, en dat gebeurt in één `onKies` hierboven — niet
 *    twee keer, want dan is "sluit na kiezen" een belofte op twee plekken.
 */
function Kalenderpaneel({
  maand,
  onMaand,
  startDag,
  taal,
  waarde,
  vandaag,
  min,
  max,
  optioneel,
  onKies,
}: {
  readonly maand: IsoDate;
  readonly onMaand: (m: IsoDate) => void;
  readonly startDag: Weekday;
  readonly taal: string;
  readonly waarde: string;
  readonly vandaag: string;
  readonly min?: string | undefined;
  readonly max?: string | undefined;
  readonly optioneel: boolean;
  readonly onKies: (datum: string) => void;
}) {
  const c = useTheme().colors;
  const raster = maandraster(maand, startDag);

  return (
    <View style={[styles.paneel, { backgroundColor: c.panelDark, borderColor: c.border }]}>
      <Maandkop maand={maand} taal={taal} onMaand={onMaand} />

      <Dagenraster
        raster={raster}
        waarde={waarde}
        vandaag={vandaag}
        min={min}
        max={max}
        onKies={onKies}
      />

      {/*
        ⚠️ Wissen staat er alleen als leeg ook echt mag. Een knop die een
           verplicht veld leegmaakt, levert een foutmelding op en geen keuze.
      */}
      {!optioneel ? null : (
        <Button variant="stil" block onPress={() => onKies('')}>
          {t('datumkeuze.wissen')}
        </Button>
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
