import { View } from 'react-native';

import { heldTekstSleutel, type Heldkeuze, type Heldsleutel } from '@/modules/helden';
import {
  categorieLabels,
  gevoelLabels,
  minutenLabels,
  momentLabels,
  valkuilAntwoord,
  valkuilLabels,
  type Categorie,
  type Gevoel,
  type Minuten,
  type Moment,
  type Valkuil,
  type VragenlijstInvoer,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { Body, Button, Caption, CategorieMerk, Card, Subheading } from '@/shared/ui';

import { type BestaandeHeld, HeldUitslag } from './HeldUitslag';
import { EERSTE_HELDVRAAG, FOCUS, GEVOEL, MOMENT, TIJD, VALKUIL, type Stap } from './stappen';
import { stijlen } from './stijlen';

interface Props {
  readonly invoer: VragenlijstInvoer;
  readonly keuze: Heldkeuze;
  readonly bestaandeHeld: BestaandeHeld;
  readonly onKiesHeld: (held: Heldsleutel) => void;
  readonly onWijzig: (naar: Stap) => void;
}

function Regel({ vraag, antwoord, onWijzig }: { readonly vraag: string; readonly antwoord: string; readonly onWijzig: () => void }) {
  return (
    <View style={stijlen.regel}>
      <Caption>{vraag}</Caption>
      <Button variant="stil" block onPress={onWijzig}>
        {antwoord}
      </Button>
    </View>
  );
}

/** Voorstel, eigen woorden of allebei; "Overgeslagen" alleen als er niets staat. */
function gevoelAntwoord(gevoel: Gevoel | null, eigen: string | null, niets: string): string {
  const delen = [gevoel === null ? null : gevoelLabels()[gevoel], eigen].filter((d): d is string => d !== null);
  return delen.length === 0 ? niets : delen.join(' · ');
}

function heldAntwoord(keuze: Heldkeuze, bestaande: BestaandeHeld, niets: string): string {
  if (keuze.soort === 'quiz') return t(heldTekstSleutel(keuze.held, 'naam'));
  if (keuze.soort === 'gelijkspel') return t('vragenlijst.held.kies_een');
  return bestaande.soort === 'held' ? t(heldTekstSleutel(bestaande.held, 'naam')) : niets;
}

/** "Dit heb je me verteld": elke regel is een knop naar zijn eigen vraag. */
export function Samenvatting({ invoer, keuze, bestaandeHeld: bestaande, onKiesHeld, onWijzig }: Props) {
  const gebieden = (invoer.focus_areas ?? []) as Categorie[];
  const valkuilen = (invoer.what_breaks_it ?? []) as Valkuil[];
  const minuten = (invoer.minutes_per_day ?? null) as Minuten | null;
  const moment = (invoer.when_i_do_it ?? null) as Moment | null;
  const gevoel = (invoer.feeling ?? null) as Gevoel | null;
  const niets = t('vragenlijst.samenvatting.niets');
  // ⚠️ Ook de heldenvragen tellen mee voor "je hebt niets ingevuld".
  const alles =
    gebieden.length === 0 && valkuilen.length === 0 && minuten === null && moment === null &&
    gevoel === null && (invoer.feeling_own ?? null) === null &&
    keuze.soort === 'geen' && bestaande.soort !== 'held';

  return (
    <Card>
      <Subheading>{t('vragenlijst.samenvatting.kop')}</Subheading>
      <Caption>{t('vragenlijst.samenvatting.uitleg')}</Caption>
      {alles ? <Body muted>{t('vragenlijst.samenvatting.leeg')}</Body> : null}

      <Regel vraag={t('vragenlijst.focus.vraag')} onWijzig={() => onWijzig(FOCUS)}
        antwoord={gebieden.length === 0 ? niets : gebieden.map((g) => categorieLabels()[g]).join(' · ')} />
      {gebieden.length === 0 ? null : (
        <View style={stijlen.gebieden}>
          {gebieden.map((g) => <CategorieMerk key={g} categorie={g} label={categorieLabels()[g]} />)}
        </View>
      )}
      <Regel vraag={t('vragenlijst.tijd.vraag')} onWijzig={() => onWijzig(TIJD)}
        antwoord={minuten === null ? niets : minutenLabels()[minuten]} />
      <Regel vraag={t('vragenlijst.moment.vraag')} onWijzig={() => onWijzig(MOMENT)}
        antwoord={moment === null ? niets : momentLabels()[moment]} />
      <Regel vraag={t('vragenlijst.valkuil.vraag')} onWijzig={() => onWijzig(VALKUIL)}
        antwoord={valkuilen.length === 0 ? niets : valkuilen.map((v) => valkuilLabels()[v]).join(' · ')} />
      <Regel vraag={t('vragenlijst.gevoel.regel')} onWijzig={() => onWijzig(GEVOEL)}
        antwoord={gevoelAntwoord(gevoel, invoer.feeling_own ?? null, niets)} />
      <Regel vraag={t('vragenlijst.held.vraag')} onWijzig={() => onWijzig(EERSTE_HELDVRAAG)}
        antwoord={heldAntwoord(keuze, bestaande, niets)} />

      <HeldUitslag keuze={keuze} bestaande={bestaande} onKies={onKiesHeld} />
      <DitHelpt valkuilen={valkuilen} />
    </Card>
  );
}

function DitHelpt({ valkuilen }: { readonly valkuilen: readonly Valkuil[] }) {
  if (valkuilen.length === 0) return null;

  return (
    <View style={stijlen.helpt}>
      <Caption>{t('vragenlijst.samenvatting.dit_helpt')}</Caption>
      {valkuilen.map((v) => (
        <Body key={v} muted>{valkuilAntwoord(v).antwoord}</Body>
      ))}
    </View>
  );
}
