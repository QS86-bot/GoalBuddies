import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel } from '@/modules/auth';
import {
  fetchOpenstaandeMeldingen,
  handelMeldingAf,
  meldredenLabels,
  type Meldingcursor,
  type Meldreden,
  type OpenstaandeMelding,
} from '@/modules/buddies';
import { opmaaktaal, t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { toonKlokDatum, type TimeZone } from '@/shared/time';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Screen,
  Subheading,
  useAsync,
} from '@/shared/ui';

/**
 * Meldingen — QS8-586, migratie 0296.
 *
 * ⚠️⚠️ **Dit scherm is de lézer die `reports` niet had.** Melden bestaat sinds
 *    QS8-232: er is een tabel, er zijn policies, indexen, kolomgrants en
 *    spoofing-grendels, en 📏 er was **nul** leespad — geen scherm, geen job,
 *    geen notificatie. De meldknop sloeg iets op en zette niets in gang. Dat is
 *    onwrikbare regel 18 vraag 5 in zijn zuiverste vorm: elk schakeltje af, de
 *    keten onderbroken, en dus geen enkele test die het kón zien.
 *
 * ⚠️ **Eén scherm en niet één per groep**, want `openstaande_meldingen()` is niet
 *    groepsgebonden: hij geeft terug wat *jij* mag beoordelen, over al je groepen
 *    heen, plus de geëscaleerde gevallen als je platformbeheerder bent. Een
 *    per-groep-scherm zou een filter vragen die de RPC met opzet niet heeft.
 *
 * ⚠️⚠️ **De client vraagt nooit "ben ik beheerder".** Hij vraagt de database
 *    "is er iets voor mij", en die beslist. Dat is hetzelfde onderscheid als bij
 *    domeinregel 7: *de regel is pas afgedwongen als de dátabase hem afdwingt*.
 *    Een rolcontrole in de schermlaag zou een tweede waarheid zijn die uit elkaar
 *    kan lopen met de RPC — en de RPC is degene die het antwoord geeft.
 *
 * ⚠️ **`reporter_id` staat er niet bij, en dat is geen omissie.** De returntabel
 *    van `openstaande_meldingen()` laat hem weg — *RLS kan geen kolommen
 *    beperken*, dus dat is een eigenschap van de functie en van niets anders. Wie
 *    meldde, is niet nodig om te beoordelen, en weglaten beschermt de melder
 *    tegen een beheerder die het hem betaald zet.
 */
const LIMIET = 20;

/** De twee standen waarin een melding gesloten kan worden — `handel_melding_af()`. */
type Uitkomst = 'reviewed' | 'dismissed';

export default function Meldingen() {
  const { profiel } = useProfiel();

  /**
   * De cursors van de pagina's die je gezien hebt — zelfde vorm als
   * `app/beoordelen.tsx`.
   *
   * ⚠️ Een stapel en geen paginanummer: een keyset-cursor is vooruit-alleen.
   *    `null` op plek 0 is de eerste pagina; "Meer laden" legt de cursor van de
   *    laatste rij erbovenop. Herladen na een afhandeling haalt dezelfde pagina
   *    opnieuw op, en dat blijft stabiel omdat een cursor een wáárde is: de rij
   *    waar hij naar wijst mag verdwijnen zonder dat er iets overslaat.
   */
  const [cursors, setCursors] = useState<readonly (Meldingcursor | null)[]>([null]);
  const pagina = cursors.length - 1;

  const { data, loading, error, herlaad } = useAsync(
    () => fetchOpenstaandeMeldingen({ limiet: LIMIET, na: cursors[pagina] ?? null }),
    [cursors],
  );

  // ⚠️ `.at(-1)` en geen `[length - 1]`: met `noUncheckedIndexedAccess` is dat
  //    tweede `T | undefined` en zou er een `!` of een cast voor nodig zijn. De
  //    lege lijst is hier een gewone toestand — de laatste pagina is bijna nooit
  //    vol — en die hoort in het type te staan, niet weggedrukt te worden.
  const laatste = data?.at(-1) ?? null;
  const volgende: Meldingcursor | null =
    laatste === null ? null : { at: laatste.created_at, id: laatste.id };

  return (
    <Screen title={t('meldingen.titel')} terug={{ naar: '/profiel' }}>
      <AsyncView
        loading={loading}
        error={error}
        data={data}
        isEmpty={(rijen) => rijen.length === 0}
        onRetry={herlaad}
        empty={{ title: t('meldingen.leeg_titel'), body: t('meldingen.leeg_tekst') }}
      >
        {(rijen) => (
          <View style={styles.lijst}>
            <Caption>{t('meldingen.melder_onbekend')}</Caption>

            {rijen.map((melding) => (
              <MeldingKaart
                key={melding.id}
                melding={melding}
                tz={(profiel?.tz ?? null) as TimeZone | null}
                onAfgehandeld={herlaad}
              />
            ))}

            <Bladeren
              terug={pagina === 0 ? null : () => setCursors((c) => c.slice(0, -1))}
              verder={
                rijen.length === LIMIET && volgende !== null
                  ? () => setCursors((c) => [...c, volgende])
                  : null
              }
            />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * Vorige en volgende.
 *
 * ⚠️ **Alleen doorbladeren bij een vólle pagina én een bruikbare cursor**, en
 *    daarom geeft de aanroeper `null` door in plaats van een vlag. `created_at`
 *    en `id` zijn allebei `not null` op `reports`, dus een volle pagina zónder
 *    cursor kan niet bestaan — maar een knop die `null` als grens doorgeeft,
 *    laadt de eerste pagina opnieuw, en dan lijkt bladeren stuk in plaats van op
 *    te houden.
 */
function Bladeren({
  terug,
  verder,
}: {
  readonly terug: (() => void) | null;
  readonly verder: (() => void) | null;
}) {
  if (terug === null && verder === null) return null;

  return (
    <View style={styles.acties}>
      {terug === null ? null : <Button onPress={terug}>{t('beoordelen.vorige')}</Button>}
      {verder === null ? null : (
        <Button onPress={verder}>{t('meldingen.meer_laden')}</Button>
      )}
    </View>
  );
}

/**
 * Eén melding, met de twee knoppen die hem sluiten.
 *
 * ⚠️ **De knoppen doen zelf niets aan het lidmaatschap.** Ze zetten de status en
 *    leggen vast wie het besloot; iemand uit de groep zetten of blokkeren is een
 *    andere handeling op een ander scherm. Een knop die twee dingen tegelijk doet
 *    is precies waar een moderatiebeslissing onomkeerbaar wordt zonder dat
 *    iemand het bedoelde.
 */
function MeldingKaart({
  melding,
  tz,
  onAfgehandeld,
}: {
  readonly melding: OpenstaandeMelding;
  readonly tz: TimeZone | null;
  readonly onAfgehandeld: () => void;
}) {
  const [bezig, setBezig] = useState<Uitkomst | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function sluit(status: Uitkomst) {
    setBezig(status);
    setFout(null);

    const uitkomst = await handelMeldingAf(melding.id, status);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onAfgehandeld();
  }

  const datum = tz === null ? '' : toonKlokDatum(melding.created_at, tz, opmaaktaal());
  const reden = meldredenLabels()[melding.reden as Meldreden] ?? melding.reden;

  return (
    <Card>
      <Subheading>{t('meldingen.over', { naam: melding.onderwerp_naam })}</Subheading>
      <Caption>{t('meldingen.in_groep', { groep: melding.groepsnaam })}</Caption>
      {/*
        ⚠️ Een eigen regel en niet achter de groepsnaam met een streepje ertussen.
           `streepje:controle` wordt daar rood op (QS8-218), en terecht: twee
           losse feiten aan elkaar plakken leest slechter dan twee regels.
      */}
      {datum === '' ? null : <Caption>{t('meldingen.gemeld_op', { datum })}</Caption>}

      <Body>{reden}</Body>

      {/*
        ⚠️ De escalatie staat er met zoveel woorden bij. Zonder deze regel leest
           een platformbeheerder een melding uit een groep waar hij niets mee te
           maken heeft, zonder te weten waaróm hij hem ziet.
      */}
      {melding.via_escalatie ? <Caption>{t('meldingen.escalatie')}</Caption> : null}

      <Aanleiding melding={melding} />

      <Sluitknoppen bezig={bezig} onSluit={(status) => void sluit(status)} />

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * Waaróm er gemeld is.
 *
 * ⚠️ **`toelichting` en `bericht_kopie` kunnen allebei leeg zijn**, en dat is de
 *    gewone vorm en geen randgeval: 📏 allebei staan `is_nullable = YES` op
 *    `public.reports`. De gegenereerde types zeggen `string` — de generator kan
 *    dat op een `returns table` niet zien — en daarom staat de correctie in
 *    `src/lib/database.types.correcties.ts`. Zonder die correctie rendert hier
 *    een lege aanhaling op de plek waar de aanleiding hoort te staan.
 */
function Aanleiding({ melding }: { readonly melding: OpenstaandeMelding }) {
  const toelichting = melding.toelichting ?? '';
  const bericht = melding.bericht_kopie ?? '';

  return (
    <>
      <Card nested>
        <Caption>{t('meldingen.toelichting_kop')}</Caption>
        {toelichting === '' ? (
          <Body muted>{t('meldingen.geen_toelichting')}</Body>
        ) : (
          <Body>{toelichting}</Body>
        )}
      </Card>

      {bericht === '' ? null : (
        <Card nested>
          <Caption>{t('meldingen.bericht_kop')}</Caption>
          <Body muted>&ldquo;{bericht}&rdquo;</Body>
        </Card>
      )}

      {melding.meldingen_over_onderwerp > 1 ? (
        <Caption>{t('meldingen.vaker', { aantal: melding.meldingen_over_onderwerp })}</Caption>
      ) : null}
    </>
  );
}

/**
 * De twee uitkomsten.
 *
 * ⚠️ **Allebei `secundair` en naast elkaar**, zelfde afweging als bij
 *    beoordelen: een primair/secundair-verhouding maakt van de ene knop het
 *    goede antwoord en van de andere een uitzondering. "Hier hoeft niets te
 *    gebeuren" is een even geldige uitkomst als "ik heb actie ondernomen", en
 *    een beheerder die het gevoel krijgt dat wegklikken fout is, klikt niets weg.
 *
 * ⚠️ De ándere knop gaat op slot zodra er een loopt. Twee oordelen op dezelfde
 *    melding geeft `already_handled` van de RPC — dat is de tweede grendel, en
 *    dit is de eerste: de fout is hier niet te máken.
 */
function Sluitknoppen({
  bezig,
  onSluit,
}: {
  readonly bezig: Uitkomst | null;
  readonly onSluit: (status: Uitkomst) => void;
}) {
  return (
    <>
      <View style={styles.acties}>
        <Button
          variant="secundair"
          busy={bezig === 'reviewed'}
          disabled={bezig === 'dismissed'}
          onPress={() => onSluit('reviewed')}
        >
          {t('meldingen.actie_knop')}
        </Button>
        <Button
          variant="secundair"
          busy={bezig === 'dismissed'}
          disabled={bezig === 'reviewed'}
          onPress={() => onSluit('dismissed')}
        >
          {t('meldingen.geen_actie_knop')}
        </Button>
      </View>

      <Caption>{t('meldingen.acties_uitleg')}</Caption>
    </>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  acties: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
