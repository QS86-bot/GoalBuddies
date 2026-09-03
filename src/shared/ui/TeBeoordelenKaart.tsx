import { Button } from './Button';
import { Card } from './Card';
import { Body, Subheading } from './Text';
import { beoordeelkopSleutel, toonBeoordeelkaart, type Beoordeelstand } from './tebeoordelen';
import { t } from '../i18n';

/**
 * "Er wacht iets op jou" — QS8-62, sinds QS8-148 op twee tabbladen.
 *
 * ⚠️ **Waarom dit een gedeeld component is en geen tweede kopie.** Deze kaart was
 *    tot QS8-148 de énige ingang naar het beoordeelscherm, en hij stond op het
 *    gróepstabblad — een scherm dat je alleen opent als je er iets te zoeken
 *    hebt. De hele peer-goedkeuring hing daarmee aan een pad dat niemand
 *    tegenkomt, en dat is de succesmetriek uit de PRD (≥80% binnen 48 uur) aan
 *    een verstopte knop.
 *
 *    De reparatie is hem óók op het hoofdscherm zetten. Twee kopieën van dezelfde
 *    kaart zou dan de fout van 0032/0034 zijn in schermvorm: twee plekken die
 *    hetzelfde horen te zeggen en na de eerste wijziging uiteenlopen. Er is er
 *    dus één, en wanneer hij te zien is staat in `tebeoordelen.ts`.
 *
 * ⚠️ **Presentatie en verder niets.** De telling en het realtime-abonnement staan
 *    in `useTeBeoordelen()` in `modules/completions`; dit bestand importeert geen
 *    datalaag. Zo blijft `shared/ui` te renderen zonder Supabase — de reden
 *    waarom QS8-207 openstaat over de vier types die dat wél doen.
 */
export function TeBeoordelenKaart({
  stand,
  onOpen,
}: {
  readonly stand: Beoordeelstand;
  readonly onOpen: () => void;
}) {
  if (!toonBeoordeelkaart(stand)) return null;

  return (
    <Card>
      <Subheading>{t(beoordeelkopSleutel(stand), { n: stand.aantal })}</Subheading>
      <Body muted>{stand.mislukt ? t('groepen.ophalen_mislukt') : t('groepen.week_afgerond')}</Body>
      <Button variant="primair" block onPress={onOpen}>
        {t('groepen.beoordelen')}
      </Button>
    </Card>
  );
}
