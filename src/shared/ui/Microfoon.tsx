import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '../i18n';
import { space } from '../theme';

import { Button } from './Button';
import { Card } from './Card';
import { magSpraak, microfoonSleutel, voegAan, type Veldvorm } from './spraakveld';
import { Body, Caption, Subheading } from './Text';
import { useSpraak } from './useSpraak';
import { useSpraakUitlegGezien } from './voorkeuren';

/**
 * De microfoon naast een vrijetekstveld — QS8-250.
 *
 * ⚠️ **De uitleg is een blok in het scherm en geen `Alert`.** Zelfde reden als
 *    bij `Bevestiging`: een `Alert` gedraagt zich op web anders dan op native,
 *    en dit blok is met een schermlezer gewoon te lezen.
 *
 * ⚠️ **Dit component bedénkt niets.** Het besluit óf hij past, maar de regel
 *    waarop dat besluit rust staat in `spraakveld.ts` — `magSpraak()`,
 *    `voegAan()` en `spraakfoutSleutel()` zijn daar puur en dus te voeden en te
 *    ijken. Hier staat wat er getekend wordt en waar de knip zit; geen enkele
 *    grens wordt hier zelf uitgerekend.
 *
 * ⚠️ **Geen goud op lopende tekst.** `theme/contrast.test.ts` legt vast dat goud
 *    een accent is en geen tekstkleur; de luisterstand is daarom gewone tekst en
 *    geen gekleurde. Dat hij er *staat* is het signaal.
 */

/**
 * De eenmalige mededeling over waar de stem heen gaat.
 *
 * ⚠️ Een eigen component, en niet omdat het mooier staat: `Microfoon` kwam er
 *    anders boven de vijftig regels uit en `regel15:controle` werd daar terecht
 *    rood van. Splitsen is hier bovendien de juiste knip — dit blok heeft zijn
 *    eigen reden van bestaan (beslisdocument §3) en zijn eigen twee knoppen.
 */
function SpraakUitleg({ opAkkoord, opAnnuleer }: {
  readonly opAkkoord: () => void;
  readonly opAnnuleer: () => void;
}) {
  return (
    <Card nested>
      <Subheading>{t('spraak.uitleg_titel')}</Subheading>
      <Body muted>{t('spraak.uitleg_body')}</Body>

      <View style={styles.knoppen}>
        <Button variant="secundair" onPress={opAkkoord}>
          {t('spraak.uitleg_akkoord')}
        </Button>
        <Button variant="stil" onPress={opAnnuleer}>
          {t('spraak.uitleg_annuleren')}
        </Button>
      </View>
    </Card>
  );
}

interface Props {
  /**
   * De invoerprops van het veld zelf.
   *
   * ⚠️ **Dit component beslist zélf of het van toepassing is**, en dat is een
   *    knip die er eerst niet zat: `Field` deed het, en kwam daarmee boven de
   *    vijftig regels uit. Hier hoort hij ook beter — wie de microfoon kent,
   *    hoort te weten wanneer hij niet past.
   */
  readonly veld: Veldvorm & {
    readonly value?: string | undefined;
    readonly onChangeText?: ((tekst: string) => void) | undefined;
  };
  /** Het label van het veld, zodat een schermlezer weet waar de knop bij hoort. */
  readonly veldlabel: string;
}

export function Microfoon({ veld, veldlabel }: Props) {
  // ⚠️ **Aanvullen en niet overschrijven.** `voegAan()` plakt het herkende
  //    fragment achter wat er al staat, zodat wie halverwege een zin de knop
  //    pakt zijn eerste helft terugziet.
  const spraak = useSpraak((herkend) => veld.onChangeText?.(voegAan(veld.value ?? '', herkend)));

  // ⚠️ Geen knop die niets doet: bij een wachtwoord-, e-mail- of getalveld, op
  //    een browser zonder herkenner en op native hoort hier niets te staan.
  const past = magSpraak(veld) && spraak.beschikbaar;

  // ⚠️ `past` gaat mee naar binnen zodat de opslag niet gelezen wordt voor een
  //    knop die er toch niet komt — zie de kop van `useSpraakUitlegGezien`.
  const uitleg = useSpraakUitlegGezien(past);
  const [uitlegOpen, setUitlegOpen] = useState(false);

  // ⚠️ En zolang de voorkeur nog laadt ook niets — anders knippert de uitleg een
  //    frame lang voorbij bij wie hem allang gezien heeft.
  if (!past || !uitleg.geladen) return null;

  function drukken() {
    if (spraak.luistert) {
      spraak.stop();
      return;
    }
    // ⚠️ De uitleg staat vóór de eerste opname, niet erna. Zie
    //    `useSpraakUitlegGezien` voor waarom dit geen privacyverklaring is.
    if (uitleg.gezien) spraak.start();
    else setUitlegOpen(true);
  }

  function akkoord() {
    setUitlegOpen(false);
    uitleg.onthoud();
    spraak.start();
  }

  return (
    <View style={styles.blok}>
      <Pressable
        onPress={drukken}
        accessibilityRole="button"
        accessibilityLabel={`${t(microfoonSleutel(spraak.luistert))}: ${veldlabel}`}
        accessibilityState={{ busy: spraak.luistert }}
        hitSlop={8}
        style={styles.knop}
      >
        <Caption>{t(microfoonSleutel(spraak.luistert))}</Caption>
      </Pressable>

      {!spraak.luistert ? null : <Caption>{t('spraak.luistert')}</Caption>}
      {spraak.fout === null ? null : <Caption danger>{t(spraak.fout)}</Caption>}

      {!uitlegOpen ? null : (
        <SpraakUitleg opAkkoord={akkoord} opAnnuleer={() => setUitlegOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Rechts uitgelijnd onder het veld, net als de spiekknop van het
  // wachtwoordveld: dicht bij wat hij bedient, en hij duwt de foutmelding van
  // het veld niet opzij.
  blok: { alignSelf: 'stretch', alignItems: 'flex-end', gap: 2 },
  knop: { paddingVertical: 2 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
});
