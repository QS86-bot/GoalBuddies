import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { telTekens } from '../tekst';
import { space } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { CategorieMerk } from './CategorieMerk';
import { Field } from './Field';
import { Body, Caption, Subheading } from './Text';

/**
 * Wat de kaart van één vindbare groep toont, al vertaald.
 *
 * ⚠️ Plat en zonder moduletype, want `shared/ui` kent geen modules. De vertaling
 *    van een `OntdekteGroep` naar deze velden staat in `groepsKaartVan()` in
 *    `src/modules/buddies/ontdekken.ts`, op één plek voor beide schermen.
 */
export interface GroepsKaartGegevens {
  readonly naam: string;
  readonly categorie: string;
  readonly categorieLabel: string;
  readonly omschrijving: string | null;
  readonly leden: number;
  readonly huddledag: string;
  /** Het label van de voertaal, of `null` als de groep er geen opgaf. */
  readonly voertaal: string | null;
}

interface Props {
  readonly groep: GroepsKaartGegevens;
  readonly aangevraagd: boolean;
  /** De dagrem is op. De database weigert sowieso; dit voorkomt de weigering. */
  readonly geblokkeerd: boolean;
  /** Geeft `null` bij succes, anders de melding voor de gebruiker. */
  readonly onVraagAan: (bericht: string) => Promise<string | null>;
}

/**
 * Eén vindbare groep, met de aanvraag in twee stappen.
 *
 * ⚠️⚠️ **Twee stappen, en dat is de belofte van deze kaart** (QS8-643, code-review).
 *    Een aanvraag is niet in te trekken: er is geen RPC die hem terugneemt, en je
 *    naam ligt daarna bij de beheerder van een groep van onbekenden. Eén tik
 *    mag dat dus niet doen. "Vraag lidmaatschap aan" opent het formulier;
 *    "Versturen" verstuurt. Deze kaart stond in `app/groep/ontdek.tsx` en is
 *    hierheen gehaald omdat het buddyzoekscherm een kopie had gemaakt die met
 *    één tik verstuurde.
 *
 * ⚠️ De kaart toont precies de velden uit de kolomlijst van `ontdek_groepen()` en
 *    geen extra. Komt er ooit iets bij, dan begint dat in die functie.
 */
export function GroepsKaart({ groep, aangevraagd, geblokkeerd, onVraagAan }: Props) {
  const [open, setOpen] = useState(false);
  const [bericht, setBericht] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState(false);

  async function verstuur() {
    setBezig(true);
    setFout(null);
    const melding = await onVraagAan(bericht);
    setBezig(false);
    if (melding !== null) {
      setFout(melding);
      return;
    }
    setOpen(false);
    setKlaar(true);
  }

  return (
    <Card>
      <Subheading>{groep.naam}</Subheading>

      <View style={styles.merken}>
        <CategorieMerk categorie={groep.categorie} label={groep.categorieLabel} />
      </View>

      {groep.omschrijving === null ? null : <Body>{groep.omschrijving}</Body>}

      <Caption>
        {groep.leden === 1 ? t('ontdek.leden_een') : t('ontdek.leden', { aantal: groep.leden })}
      </Caption>
      <Caption>{t('ontdek.huddledag', { dag: groep.huddledag })}</Caption>
      {groep.voertaal === null ? null : <Caption>{groep.voertaal}</Caption>}

      {aangevraagd || klaar ? (
        <Caption muted={false}>{t('ontdek.verzonden')}</Caption>
      ) : open ? (
        <Formulier
          bericht={bericht}
          bezig={bezig}
          onBericht={setBericht}
          onVerstuur={() => void verstuur()}
          onAnnuleer={() => setOpen(false)}
        />
      ) : (
        <Button variant="secundair" block disabled={geblokkeerd} onPress={() => setOpen(true)}>
          {t('ontdek.aanvragen')}
        </Button>
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/** De tweede stap: een optioneel bericht, en dan pas versturen. */
function Formulier({
  bericht,
  bezig,
  onBericht,
  onVerstuur,
  onAnnuleer,
}: {
  readonly bericht: string;
  readonly bezig: boolean;
  readonly onBericht: (tekst: string) => void;
  readonly onVerstuur: () => void;
  readonly onAnnuleer: () => void;
}) {
  return (
    <>
      <Field
        label={t('ontdek.bericht_label')}
        hint={t('ontdek.bericht_hint')}
        value={bericht}
        onChangeText={onBericht}
        multiline
      />
      {/*
        ⚠️ Geteld met `telTekens()` en niet met `.length`: de database telt
           codepunten en een emoji kost er in UTF-16 twee (CLAUDE.md).
      */}
      <Caption>{`${telTekens(bericht)}/280`}</Caption>

      <Button variant="primair" block busy={bezig} disabled={telTekens(bericht) > 280} onPress={onVerstuur}>
        {t('ontdek.versturen')}
      </Button>
      <Button variant="stil" block onPress={onAnnuleer}>
        {t('ontdek.annuleren')}
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  merken: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap },
});
