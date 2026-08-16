import { Card, EmptyState, Screen } from '@/shared/ui';

/**
 * Vandaag — de huidige cyclus, de weekdoelen met vloer en plafond, en de Dagzet.
 *
 * ⚠️ Dit scherm heeft nog geen data: EPIC 4 bouwt de weekdoelen en EPIC 1 de
 *    gebruiker. Wat er nu staat is de lege staat, en die is niet tijdelijk — de
 *    app is op dag één helemaal leeg, dus dit is het eerste dat iedere nieuwe
 *    gebruiker ziet.
 */
export default function Vandaag() {
  return (
    <Screen title="Vandaag" eyebrow="DEZE WEEK">
      <Card>
        <EmptyState
          title="Nog geen weekdoelen"
          body={
            'Een weekdoel is wat je deze week af wilt hebben. Geef het een vloer — ' +
            'de versie die je op je slechtste week nog haalt — en een plafond. ' +
            'De vloer halen telt: je reeks loopt door.'
          }
        />
      </Card>

      <Card nested>
        <EmptyState
          title="De Dagzet"
          body={
            'Eén regel over wat je vandaag gedaan hebt. Kost tien seconden, levert ' +
            'geen punten op en niemand hoeft hem goed te keuren. Een dag overslaan ' +
            'heeft geen enkel gevolg.'
          }
        />
      </Card>
    </Screen>
  );
}
