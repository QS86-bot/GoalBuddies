import { View } from 'react-native';

import { heldTekstSleutel, type Heldkeuze, type Heldsleutel } from '@/modules/helden';
import { t } from '@/shared/i18n';
import { Body, Button, Caption } from '@/shared/ui';

import { stijlen } from './stijlen';

/**
 * De held die er al stond, met de drie staten die onwrikbare regel 16 eist.
 *
 * ⚠️ **`laadt` en `fout` zijn hier geen decoratie maar het verschil tussen twee
 *    ware en twee onware zinnen.** Zonder ze rendert het scherm "je hebt geen
 *    held" aan iemand van wie de leesactie nog onderweg is of net mislukt — en
 *    dat is precies wat het comment bij de leesactie verbiedt.
 */
export type BestaandeHeld =
  | { readonly soort: 'laadt' }
  | { readonly soort: 'fout' }
  | { readonly soort: 'geen' }
  | { readonly soort: 'held'; readonly held: Heldsleutel };

export function bestaandeHeld(uitkomst: {
  readonly data: { readonly held: Heldsleutel } | null | undefined;
  readonly loading: boolean;
  readonly error: unknown;
}): BestaandeHeld {
  if (uitkomst.loading) return { soort: 'laadt' };
  if (uitkomst.error !== null && uitkomst.error !== undefined) return { soort: 'fout' };
  if (uitkomst.data === undefined || uitkomst.data === null) return { soort: 'geen' };
  return { soort: 'held', held: uitkomst.data.held };
}

export function HeldUitslag({
  keuze,
  bestaande,
  onKies,
}: {
  readonly keuze: Heldkeuze;
  readonly bestaande: BestaandeHeld;
  readonly onKies: (held: Heldsleutel) => void;
}) {
  return (
    <View style={stijlen.held}>
      <Caption>{t('vragenlijst.held.kop')}</Caption>

      {keuze.soort === 'geen' ? <HeldGeen bestaande={bestaande} /> : null}
      {keuze.soort === 'quiz' ? <HeldEen held={keuze.held} /> : null}
      {keuze.soort === 'gelijkspel' ? <HeldGelijkspel keuze={keuze} onKies={onKies} /> : null}
    </View>
  );
}

/**
 * Geen uitslag uit de vier vragen.
 *
 * ⚠️ **Twee heel verschillende situaties, en het verschil is de hele reden dat
 *    `huidigeHeld` hier binnenkomt.** Wie nooit een held koos, leest dat hij er
 *    geen krijgt en dat de rest gewoon werkt. Wie er al een heeft en de vragen
 *    deze keer oversloeg, houdt die held — en dan is "je hebt de heldenvragen
 *    overgeslagen" een ware zin met een onware strekking.
 */
function HeldGeen({ bestaande }: { readonly bestaande: BestaandeHeld }) {
  if (bestaande.soort === 'laadt') return <Body muted>{t('vragenlijst.held.laadt')}</Body>;
  if (bestaande.soort === 'fout') return <Body muted>{t('vragenlijst.held.fout')}</Body>;
  if (bestaande.soort === 'geen') return <Body muted>{t('vragenlijst.held.geen')}</Body>;

  return (
    <>
      <Body>{t(heldTekstSleutel(bestaande.held, 'naam'))}</Body>
      <Caption>{t(heldTekstSleutel(bestaande.held, 'ondertitel'))}</Caption>
      <Body muted>{t('vragenlijst.held.blijft')}</Body>
    </>
  );
}

function HeldEen({ held }: { readonly held: Heldsleutel }) {
  return (
    <>
      <Body>{t(heldTekstSleutel(held, 'naam'))}</Body>
      <Caption>{t(heldTekstSleutel(held, 'ondertitel'))}</Caption>
      <Body muted>{t('vragenlijst.held.een')}</Body>
    </>
  );
}

/**
 * ⚠️⚠️ **Hier staan álle gedeelde koplopers en niet de top 2.** Vier vragen over
 *    zes helden geeft maximaal 4 punten, en 1-1-1-1 over vier verschillende
 *    helden is een normale uitslag — "de top 2" is dan niet gedefinieerd.
 *    Besluit 7 van QS8-468. Het aantal kaarten komt uit `keuze.koplopers`, en er
 *    staat nergens een getal dat er twee afsnijdt;
 *    `tests/beloftes/alle-gedeelde-koplopers.test.ts` wordt rood zodra dat wel
 *    gebeurt.
 */
function HeldGelijkspel({
  keuze,
  onKies,
}: {
  readonly keuze: Extract<Heldkeuze, { soort: 'gelijkspel' }>;
  readonly onKies: (held: Heldsleutel) => void;
}) {
  return (
    <>
      <Body muted>{t('vragenlijst.held.gelijk', { aantal: keuze.koplopers.length })}</Body>

      {keuze.koplopers.map((held) => (
        <HeldKaart
          key={held}
          held={held}
          gekozen={keuze.gekozen === held}
          onKies={() => onKies(held)}
        />
      ))}

      <Caption>
        {keuze.gekozen === null
          ? t('vragenlijst.held.kies_een')
          : t('vragenlijst.held.gekozen')}
      </Caption>
    </>
  );
}

function HeldKaart({
  held,
  gekozen,
  onKies,
}: {
  readonly held: Heldsleutel;
  readonly gekozen: boolean;
  readonly onKies: () => void;
}) {
  return (
    <View style={stijlen.heldkaart}>
      <Button variant={gekozen ? 'secundair' : 'stil'} block onPress={onKies}>
        {`${t(heldTekstSleutel(held, 'naam'))} · ${t(heldTekstSleutel(held, 'ondertitel'))}`}
      </Button>
      <Body muted>{t(heldTekstSleutel(held, 'persoonlijkheid'))}</Body>
    </View>
  );
}
