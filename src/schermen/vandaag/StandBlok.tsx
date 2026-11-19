import { View } from 'react-native';

import type { DoelStand } from '@/modules/goals';
import { t, vergelijkTekst } from '@/shared/i18n';
import { Body, Caption, Card, DoelStandKaart, Subheading, weekpasUitleg } from '@/shared/ui';

import { styles } from './stijlen';

type Rij = { readonly stand: DoelStand; readonly titel: string };

/**
 * Je stand: reeks, punten en weekpassen per doel — QS8-75 en QS8-81.
 *
 * ⚠️ **Alles hier is privé en dat is een domeinregel, geen voorkeur.** Punten
 *    zijn alleen voor de eigenaar (domeinregel 10) omdat een dalend totaal
 *    zichtbaar bewijs is van een gemiste week, en een verbruikte weekpas is dat
 *    net zo goed. Dit blok hoort daarom op dít scherm en op geen enkel
 *    groepsscherm. Kopieer het niet naar `groep/[id]`.
 *
 * ⚠️ Rendert niets zolang er geen enkel doel is. Een leeg kader met "0 punten"
 *    is de eerste indruk van iemand die net begint, en dat is precies de
 *    verkeerde: er is nog niets gemist, er is nog niets te tellen.
 */
export function StandBlok({
  standen,
  titels,
  afgeslotenCyclus,
  loading,
}: {
  readonly standen: ReadonlyMap<string, DoelStand>;
  readonly titels: ReadonlyMap<string, string>;
  readonly afgeslotenCyclus: string | null;
  readonly loading: boolean;
}) {
  const rijen = rijenMetTitel(standen, titels);

  if (loading || rijen.length === 0) return null;

  if (nogNietsTeTellen(rijen)) {
    return (
      <Card nested>
        <Subheading>{t('vandaag.stand')}</Subheading>
        <Body muted>{t('vandaag.stand_leeg')}</Body>
      </Card>
    );
  }

  return <StandKaarten rijen={rijen} afgeslotenCyclus={afgeslotenCyclus} />;
}

function rijenMetTitel(
  standen: ReadonlyMap<string, DoelStand>,
  titels: ReadonlyMap<string, string>,
): readonly Rij[] {
  // ⚠️ Alleen doelen waarvan we de titel kennen. Een stand zonder titel is een
  //    gearchiveerd of net verwijderd doel; die hoort niet op het dashboard van
  //    vandaag, en "Onbekend doel" is geen tekst die iemand vertrouwen geeft.
  return [...standen.values()]
    .map((stand) => ({ stand, titel: titels.get(stand.goalId) }))
    .filter((r): r is Rij => r.titel !== undefined)
    .sort((a, b) => vergelijkTekst(a.titel, b.titel));
}

// ⚠️ Dag één is een eigen geval, en het pijnlijke geval is niet "nul doelen"
//    maar "het eerste doel". Zonder deze tak krijgt iemand die net begonnen is
//    vier keer nul te lezen ("Nog geen reeks", "Punten 0", "Nog geen weekpas")
//    plus een uitleg over gemiste weken en minpunten — voordat hij één week
//    gedaan heeft. Dat is geen stand maar een waarschuwing vooraf.
function nogNietsTeTellen(rijen: readonly Rij[]): boolean {
  return rijen.every(
    ({ stand }) =>
      stand.huidigeReeks === 0 &&
      stand.besteReeks === 0 &&
      stand.punten === 0 &&
      (stand.weekpas?.voltooideCycli ?? 0) === 0,
  );
}

function StandKaarten({
  rijen,
  afgeslotenCyclus,
}: {
  readonly rijen: readonly Rij[];
  readonly afgeslotenCyclus: string | null;
}) {
  return (
    <Card nested>
      <Subheading>{t('vandaag.stand')}</Subheading>
      {/*
        ⚠️ Niet meer "een week telt zodra je vloer gehaald is". Dat gebruikt
           "vloer" als bekend woord, en het klopte bovendien niet voor een
           weekdoel zónder vloer — daar telt gewoon het plafond.
      */}
      <Body muted>{t('vandaag.reeks_telt_weken')}</Body>

      <View style={styles.standen}>
        {rijen.map(({ stand, titel }) => (
          <DoelStandKaart
            key={stand.goalId}
            titel={titel}
            huidigeReeks={stand.huidigeReeks}
            besteReeks={stand.besteReeks}
            punten={stand.punten}
            weekpas={stand.weekpas}
            afgeslotenCyclus={afgeslotenCyclus}
          />
        ))}
      </View>

      {/*
        ⚠️ Eén keer onderaan, en niet bij elk doel. Bij vijf doelen stond deze
           tekst vijf keer onder elkaar en dan leest niemand hem meer — ook niet
           de ene keer dat het uitmaakt.
      */}
      {rijen.some(({ stand }) => stand.weekpas !== null) ? (
        <Caption>{weekpasUitleg()}</Caption>
      ) : null}
    </Card>
  );
}
