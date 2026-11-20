import {
  heldoptieTekstSleutel,
  HELDVRAAGOPTIES,
  heldvraagTekstSleutel,
  type Heldsleutel,
  type Heldvraag,
} from '@/modules/helden';
import { t } from '@/shared/i18n';
import { Button, Caption, Card, Subheading } from '@/shared/ui';

/**
 * Eén heldenvraag: zes knoppen, één antwoord.
 *
 * ⚠️ **Dit component is de vier vragen samen en niet één ervan.** Welke vraag het is
 *    en in welke volgorde de opties staan, bezit `modules/helden`; hier staat alleen
 *    hoe een vraag eruitziet. Zou elke vraag een eigen component krijgen, dan staan
 *    de zes helden vier keer in de schermlaag.
 *
 * ⚠️ Geen letters A t/m F op het scherm: dat is een scoringshulp.
 */
export function Held({
  vraag,
  waarde,
  onKies,
}: {
  readonly vraag: Heldvraag;
  readonly waarde: Heldsleutel | null;
  readonly onKies: (held: Heldsleutel) => void;
}) {
  return (
    <Card>
      <Subheading>{t(heldvraagTekstSleutel(vraag, 'vraag'))}</Subheading>
      <Caption>{t(heldvraagTekstSleutel(vraag, 'toelichting'))}</Caption>

      {HELDVRAAGOPTIES[vraag].map((held) => (
        <Button
          key={held}
          variant={waarde === held ? 'secundair' : 'stil'}
          selected={waarde === held}
          block
          onPress={() => onKies(held)}
        >
          {t(heldoptieTekstSleutel(vraag, held))}
        </Button>
      ))}
    </Card>
  );
}
