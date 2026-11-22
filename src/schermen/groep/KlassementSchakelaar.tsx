import { StyleSheet, View } from 'react-native';

import { reportError } from '@/lib/observability';
import {
  fetchGroep,
  kanKlassementZetten,
  zetGroepsklassement,
  type KlassementGroep,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { bevestigingen, Bevestiging, Body, Caption, Card, Schakelaar, Subheading } from '@/shared/ui';

import { useBevestigdeWissel } from './useBevestigdeWissel';

/**
 * De schakelaar van het klassement in Groepsbeheer — QS8-666 (A57), keuze B1 van Quinten.
 *
 * ⚠️ **De schakelaar springt niet zelf om.** Een tik opent het bevestigingsblad en roept niets aan; pas "Ja" in het
 *    blad roept `zetGroepsklassement()` aan. Het klassement raakt álle leden en aanzetten maakt ook de punten van
 *    vóór vandaag zichtbaar (domeinregel 10), dus de uitleg wordt gelezen vóór de handeling. De database weigert
 *    zonder `p_bevestigd` en is de grens; dit scherm is de tweede rem.
 *
 * ⚠️ **Alle toestand van deze handeling staat hier en niet in het beheerscherm.** `GroepBeheer` is al de langste
 *    functie van de schermlaag (regel 15, de ratel in `scripts/regel15-controle.mjs`) en dit is niet de plek om hem
 *    te laten groeien.
 *
 * ⚠️ De stand komt van buiten (`groep.klassement_aan`) en gaat na een geslaagde wissel terug via `onGewijzigd`: het
 *    antwoord van de database, niet de gevraagde stand.
 */
interface Props {
  readonly groep: KlassementGroep & { readonly id: string; readonly ontdekbaar: boolean };
  /** Is de kijker actief beheerder van déze groep? Een weergavehint; de database beslist. */
  readonly beheerder: boolean;
  readonly onGewijzigd: (aan: boolean) => void;
}

export function KlassementSchakelaar({ groep, beheerder, onGewijzigd }: Props) {
  const wissel = useBevestigdeWissel();

  if (!kanKlassementZetten(groep, beheerder)) return null;

  const aan = groep.klassement_aan;

  async function zet() {
    const nieuw = await wissel.bevestig(
      () => zetGroepsklassement(groep.id, !aan, true),
      (waarde) => (waarde ? t('klassement.melding_aan') : t('klassement.melding_uit')),
    );
    if (nieuw !== null) onGewijzigd(nieuw);
  }

  const teksten = bevestigingen();
  const tekst = aan
    ? teksten.klassementUitzetten
    : groep.ontdekbaar
      ? teksten.klassementAanzettenVindbaar
      : teksten.klassementAanzetten;

  return (
    <Card>
      <View style={styles.rij}>
        <View style={styles.tekst}>
          <Subheading>{t('klassement.beheer_titel')}</Subheading>
          <Body muted>{aan ? t('klassement.beheer_aan') : t('klassement.beheer_uit')}</Body>
        </View>
        <Schakelaar
          aan={aan}
          label={t('klassement.beheer_label')}
          disabled={wissel.bezig}
          onPress={wissel.open}
        />
      </View>

      {wissel.vraag ? (
        <Bevestiging
          tekst={tekst}
          bezig={wissel.bezig}
          fout={wissel.fout}
          onBevestig={() => void zet()}
          onAnnuleer={wissel.annuleer}
        />
      ) : null}

      {!wissel.vraag && wissel.fout !== null ? <Caption danger>{wissel.fout}</Caption> : null}
      {wissel.melding === null ? null : <Caption>{wissel.melding}</Caption>}
    </Card>
  );
}

const styles = StyleSheet.create({
  rij: { flexDirection: 'row', alignItems: 'center', gap: space.blokGap },
  tekst: { flex: 1, minWidth: 0, gap: 4 },
});

/**
 * Leest de stand van het klassement terug uit de database.
 *
 * ⚠️ Een groep die open wordt krijgt het klassement erbij (besluit 45, QS8-666) en dat gebeurt in de database, in
 *    `zet_groepszichtbaarheid()`. Het scherm bouwt die regel niet na maar vraagt de stand op, zodat de schakelaar
 *    nooit iets anders toont dan wat de leden te zien krijgen.
 */
export function leesKlassementTerug(groupId: string, zetStand: (aan: boolean) => void): Promise<void> {
  return fetchGroep(groupId)
    .then((groep) => {
      if (groep !== null) zetStand(groep.klassement_aan);
    })
    .catch((e: unknown) => reportError(e, 'groep.beheer.klassement_terug'));
}
