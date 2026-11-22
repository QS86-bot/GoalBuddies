import { zetOntdekbaar, type Groep } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { Bevestiging, bevestigingen, Body, Button, Caption, Card, Subheading } from '@/shared/ui';

import { useBevestigdeWissel } from './useBevestigdeWissel';

/**
 * Vindbaar maken, of juist niet — QS8-231, en sinds QS8-666 (A57) ook de plek waar het klassement meeverandert.
 *
 * ⚠️ **Een eigen kaart met een bevestiging, en om dezelfde reden als de zichtbaarheid.** Vindbaar maken doe je namens
 *    iedereen die in de groep zit; dat mag nooit meeliften op de opslaanknop van een formulier waar ook de
 *    groepsnaam in staat. Allebei zetten ze iets open namens mensen die het niet gevraagd hebben. De database
 *    weigert zonder `p_bevestigd`, dus dit scherm is de tweede rem.
 *
 * ⚠️ **Verhuisd uit `app/groep/beheer/[id].tsx` zonder dat er gedrag verandert, op één ding na:** de melding en de fout
 *    staan nu in de kaart zelf in plaats van bovenaan het scherm. Redenen: het beheerscherm is de langste functie van
 *    de schermlaag (regel 15, de ratel), en dit onderdeel heeft alleen zijn eigen toestand nodig.
 *
 * ⚠️ **Vindbaar maken zet het klassement uit (besluit Quinten, 22-11-2026, migratie 0336).** De bevestigingstekst
 *    zegt dat vooraf, en na de aanroep komt de stand uit het antwoord van de database mee terug via `onGewijzigd`,
 *    zodat de schakelaar in Groepsbeheer meteen klopt zonder het scherm te herladen.
 */
interface Props {
  readonly groep: Groep;
  readonly onGewijzigd: (deel: { ontdekbaar: boolean; klassement_aan?: boolean }) => void;
}

export function OntdekKaart({ groep, onGewijzigd }: Props) {
  const wissel = useBevestigdeWissel();
  const nietBeschermd = (groep.zichtbaarheid ?? 'beschermd') !== 'beschermd';

  async function zet(naar: boolean) {
    const nieuw = await wissel.bevestig(
      () => zetOntdekbaar(groep.id, naar, true),
      () => (naar ? t('ontdek.melding_ontdekbaar') : t('ontdek.melding_verborgen')),
    );
    if (nieuw === null) return;
    onGewijzigd({
      ontdekbaar: nieuw.ontdekbaar,
      ...(nieuw.klassement === null ? {} : { klassement_aan: nieuw.klassement }),
    });
  }

  return (
    <Card>
      <Subheading>{t('ontdek.beheer_titel')}</Subheading>
      <Body muted>{groep.ontdekbaar ? t('ontdek.beheer_aan') : t('ontdek.beheer_uit')}</Body>
      <Body muted>{t('ontdek.beheer_uitleg')}</Body>

      {/*
        ⚠️ De twee voorwaarden staan hier als zin en in de database als CHECK (`groups_ontdekbaar_is_beschermd`,
           `groups_ontdekbaar_heeft_categorie`). Dit scherm legt uit waarom de knop niets doet; het is niet wat
           het tegenhoudt.
      */}
      {nietBeschermd ? <Caption danger>{t('ontdek.beheer_moet_beschermd_zijn')}</Caption> : null}
      {groep.categorie === null ? <Caption danger>{t('ontdek.geen_categorie')}</Caption> : null}

      {wissel.vraag ? (
        <Bevestiging
          tekst={groep.ontdekbaar ? bevestigingen().groepVerbergen : bevestigingen().groepOntdekbaarMaken}
          bezig={wissel.bezig}
          fout={wissel.fout}
          onBevestig={() => void zet(!groep.ontdekbaar)}
          onAnnuleer={wissel.annuleer}
        />
      ) : (
        <Button
          variant="secundair"
          block
          disabled={!groep.ontdekbaar && (nietBeschermd || groep.categorie === null)}
          onPress={wissel.open}
        >
          {groep.ontdekbaar ? t('ontdek.beheer_uitzetten') : t('ontdek.beheer_aanzetten')}
        </Button>
      )}

      {!wissel.vraag && wissel.fout !== null ? <Caption danger>{wissel.fout}</Caption> : null}
      {wissel.melding === null ? null : <Caption>{wissel.melding}</Caption>}
    </Card>
  );
}
