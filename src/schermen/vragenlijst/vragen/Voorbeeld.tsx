import { nudgeBericht, type Toon } from '@/modules/notifications';
import { t, taal } from '@/shared/i18n';
import { Body, Caption, Card, Subheading } from '@/shared/ui';

/**
 * Het voorbeeld van je herinnering — QS8-733, criterium 4.
 *
 * ⚠️ **Het is de echte tekst en geen nagemaakte.** Dezelfde `nudgeBericht()` als de
 *    Edge Function gebruikt, dus het voorbeeld kan niet uit de pas lopen met wat je
 *    straks krijgt; alleen de kop en de uitleg komen uit de catalogus. Het is één
 *    melding aan één persoon die erom vraagt, geen uitgaande stroom (grens 1), en
 *    hij staat vóór elke pushvraag: dit scherm vraagt zelf niets.
 *
 * ⚠️ Alleen een voorstel kleurt de tekst. Je eigen woorden komen hier niet in.
 */
export function Voorbeeld({
  toon,
  gevoel,
}: {
  readonly toon: Toon;
  readonly gevoel: string | null;
}) {
  const bericht = nudgeBericht(toon, taal(), gevoel);

  return (
    <Card>
      <Subheading>{t('vragenlijst.voorbeeld.vraag')}</Subheading>
      <Caption>{t('vragenlijst.voorbeeld.toelichting')}</Caption>

      <Card nested accessibilityLabel={t('vragenlijst.voorbeeld.a11y')}>
        <Body>{bericht.titel}</Body>
        <Body muted>{bericht.body}</Body>
      </Card>
    </Card>
  );
}
