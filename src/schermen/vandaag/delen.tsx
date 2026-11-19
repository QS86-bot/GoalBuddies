import { View } from 'react-native';


import { opmaaktaal, t } from '@/shared/i18n';
import { toonDatum } from '@/shared/time';
import { AsyncView, Body, Button, Caption, Card, Subheading } from '@/shared/ui';

import { GEEN_DAGEN } from './constanten';
import { styles } from './stijlen';
import type { useVandaag } from './useVandaag';
import { WeekdoelKaart } from './WeekdoelKaart';

type Gegevens = ReturnType<typeof useVandaag>;

/**
 * De twee meldingen boven de lijst: de coulanceperiode en het inschuiven.
 *
 * ⚠️ Het scherm hierboven is de enige plek waar de coulanceperiode zichtbaar
 *    wordt (QS8-51). Zit je erin, dan sluit je nog de vórige week af, en dat moet
 *    er letterlijk staan — anders denkt iemand dat hij per ongeluk de verkeerde
 *    week aan het afronden is.
 */
export function Meldingen({ v }: { readonly v: Gegevens }) {
  return (
    <>
      {v.coulance && v.afTeSluiten ? (
        <Card nested>
          <Subheading>{t('vandaag.coulance_titel')}</Subheading>
          <Body muted>
            {t('vandaag.coulance_tekst', { datum: toonDatum(v.afTeSluiten.startDate, opmaaktaal()) })}
          </Body>
        </Card>
      ) : null}

      {v.ingeschoven === undefined || v.ingeschoven.size === 0 ? null : (
        <Card nested>
          <Subheading>{t('weekplan.ingeschoven_kop')}</Subheading>
          <Body muted>{t('weekplan.ingeschoven_tekst')}</Body>
        </Card>
      )}
    </>
  );
}

/** De lijst met weekdoelen, mét laad-, fout- en lege staat. */
export function KaartenLijst({ v }: { readonly v: Gegevens }) {
  return (
    <AsyncView
      loading={v.loading}
      error={v.error}
      data={v.weekdoelen}
      isEmpty={(d) => d.length === 0}
      onRetry={v.herlaad}
      empty={{
        title: t('vandaag.leeg_titel'),
        body: t('vandaag.leeg_tekst'),
      }}
    >
      {(doelen) => (
        <View style={styles.lijst}>
          {doelen.map((weekdoel) => (
            <WeekdoelKaart
              key={weekdoel.id}
              weekdoel={weekdoel}
              categorie={v.doelcategorieen.get(weekdoel.goal_id) ?? ''}
              mijlpaaltip={v.mijlpaaltips?.get(weekdoel.goal_id) ?? null}
              afgevinkteDagen={v.afvinkingen?.get(weekdoel.id) ?? GEEN_DAGEN}
              cyclusStart={v.cyclus?.startDate ?? null}
              bevestigingsstand={v.bevestigingsstanden?.get(weekdoel.id)}
              vandaagAfgevinkt={(v.vandaagAf ?? new Set()).has(weekdoel.id)}
              localDate={v.vandaagLokaal}
              userId={v.userId ?? ''}
              onKlaar={v.herlaad}
            />
          ))}
        </View>
      )}
    </AsyncView>
  );
}

/**
 * De twee knoppen onder de lijst.
 *
 * ⚠️ De eerste stuurde je naar de doelenlijst en daar hield het op: er was
 *    geen formulier, dus de route liep dood (QS8-112). Het formulier staat nu
 *    op het doelscherm, want een weekdoel hangt altijd aan een doel. Het
 *    bijschrift zegt dat, anders is twee keer tikken zonder uitleg.
 *
 * ⚠️ De ingang naar het overzicht staat hier en niet als vijfde tabblad:
 *    `(tabs)/_layout.tsx` legt vast dat het er vier zijn en waarom. Hij staat
 *    onderaan omdat Vandaag over vandaag gaat — een terugblik op twaalf weken
 *    hoort niet bovenaan het scherm dat je 's ochtends opent.
 */
export function ToevoegKnoppen({
  onWeekdoel,
  onOverzicht,
}: {
  readonly onWeekdoel: () => void;
  readonly onOverzicht: () => void;
}) {
  return (
    <View style={styles.toevoegen}>
      <Button variant="primair" block onPress={onWeekdoel}>
        {t('vandaag.weekdoel_toevoegen')}
      </Button>
      <Caption>{t('vandaag.toevoegen_uitleg')}</Caption>

      <Button variant="stil" block onPress={onOverzicht}>
        {t('overzicht.open')}
      </Button>
    </View>
  );
}

