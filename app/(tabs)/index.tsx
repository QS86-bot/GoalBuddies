import { useRouter } from 'expo-router';

import { useTeBeoordelen } from '@/modules/completions';
import { opmaaktaal, t } from '@/shared/i18n';
import { toonDatum } from '@/shared/time';
import { Screen, TeBeoordelenKaart } from '@/shared/ui';
import {
  BadgeBlok,
  DagzetBlok,
  GetuigenisBlok,
  HeldBlok,
  KaartenLijst,
  Meldingen,
  OpenstaandBlok,
  StandBlok,
  ToevoegKnoppen,
  useVandaag,
  WeekstrookBlok,
} from '@/schermen/vandaag';

/**
 * Vandaag — de huidige cyclus, de weekdoelen met vloer en plafond, de Dagzet.
 *
 * ⚠️ Dit scherm is de enige plek waar de coulanceperiode zichtbaar wordt
 *    (QS8-51). Zit je erin, dan sluit je nog de vórige week af, en dat moet er
 *    letterlijk staan — anders denkt iemand dat hij per ongeluk de verkeerde
 *    week aan het afronden is.
 *
 * ⚠️ **Dit bestand is alleen nog de samenstelling (QS8-748).** De gegevens staan
 *    in `useVandaag()`, de onderdelen in `src/schermen/vandaag/`. De plekken
 *    waar de weekstrook (QS8-746) en de drie tellers (QS8-747) komen, zijn de
 *    regels vóór `KaartenLijst`: een nieuw blok is hier één regel erbij en geen
 *    verlenging van een functie van 190 regels.
 */
export default function Vandaag() {
  const router = useRouter();
  const teBeoordelen = useTeBeoordelen();
  const v = useVandaag();

  return (
    <Screen
      title={t('vandaag.titel')}
      eyebrow={
        v.afTeSluiten
          ? t('vandaag.eyebrow_week', { datum: toonDatum(v.afTeSluiten.startDate, opmaaktaal()) })
          : t('vandaag.eyebrow_deze')
      }
    >
      {/*
        ⚠️ **Bovenaan het hoofdscherm, en dat is de hele reparatie van QS8-148.**
           Deze kaart stond alleen op het gróepstabblad — een scherm dat je opent
           als je er iets te zoeken hebt. De peer-goedkeuring hing daarmee aan een
           pad dat niemand tegenkomt, en dat is de succesmetriek uit de PRD (≥80%
           binnen 48 uur) aan een verstopte knop.

        ⚠️ Vóór de eigen weekdoelen, want een oordeel dat iemand ánders ophoudt
           is dringender dan je eigen lijstje. En hij verdwijnt vanzelf als er
           niets wacht — zie `toonBeoordeelkaart()`; een kaart die permanent "0"
           meldt, leert mensen om er niet meer naar te kijken.

        ⚠️ Dit is geen tegenslag van een ander en botst dus niet met domeinregel
           7: het telt voltooiingen die iemand heeft ingediend — een afgeronde
           week — en nooit een gemiste.
      */}
      <TeBeoordelenKaart stand={teBeoordelen} onOpen={() => router.push('/beoordelen')} />

      <WeekstrookBlok v={v} />

      <Meldingen v={v} />

      <KaartenLijst v={v} />

      <ToevoegKnoppen
        onWeekdoel={() => router.push('/doelen')}
        onOverzicht={() => router.push('/overzicht')}
      />

      <OpenstaandBlok weekdoelen={v.openstaand} klok={v.klok} onKlaar={v.herlaad} />

      <StandBlok
        standen={v.standen}
        titels={v.doeltitels}
        afgeslotenCyclus={v.geslotenStart}
        loading={v.loading}
      />

      <HeldBlok
        verschijning={v.verschijning ?? null}
        vandaag={v.vandaagLokaal}
        tz={v.profiel?.tz ?? null}
      />

      <GetuigenisBlok getuigenissen={v.getuigenissen ?? []} />

      <BadgeBlok badges={v.badges ?? []} />

      <DagzetBlok
        userId={v.userId ?? ''}
        localDate={v.vandaagLokaal}
        zetten={v.dagzetten}
        onKlaar={v.herlaad}
      />
    </Screen>
  );
}

// ⚠️ QS8-705: een renderfout op dit tabblad is een foutstaat met herstelknop en
//    geen wit scherm. Zie `src/shared/ui/TabFout.tsx`.
export { TabFout as ErrorBoundary } from '@/shared/ui';
