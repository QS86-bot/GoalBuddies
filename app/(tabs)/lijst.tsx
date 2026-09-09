import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession } from '@/modules/auth';
import {
  TAAK_MAX,
  fetchTaken,
  maakTaak,
  verwijderTaak,
  verzetTaak,
  zetAfgevinkt,
  type Taak,
} from '@/modules/todos';
import { opmaaktaal, t } from '@/shared/i18n';
import { telTekens } from '@/shared/tekst';
import { space } from '@/shared/theme';
import { toonMoment, type TimeZone } from '@/shared/time';
import {
  AsyncView,
  Bevestiging,
  Body,
  Button,
  Caption,
  Card,
  Field,
  Screen,
  bevestigingen,
  useAsync,
} from '@/shared/ui';

/**
 * De Lijst — losse taken, privé — QS8-380, tabel uit migratie 0215.
 *
 * ⚠️ **Een taak telt nooit mee**, en dat staat ook in de lege staat. De app heeft
 *    weekdoelen die punten opleveren en peer-goedkeuring vragen; wie hier iets
 *    neerzet moet niet gaan denken dat dit meetelt. Domeinregel 9 trekt dezelfde
 *    grens voor De Dagzet, en om dezelfde reden.
 *
 * ⚠️ **Alles is privé, en dat staat er als zin én als grendel.** De zin hangt in
 *    `beloftes.test.ts` aan een reden; de grendel is `todo_items` zelf, dat sinds
 *    0215 vier eigenaar-only policies draagt. Delen is QS8-381 — en zolang dat
 *    niet bestaat, hoort er geen schakelaar te staan die niets doet.
 *
 * ⚠️ **Het invoerveld is het gedeelde `Field` en geen eigen `TextInput`.** Dat is
 *    de hele reden dat inspreken later werkt: QS8-250 hangt de microfoon aan
 *    `Field`, en dan verschijnt hij hier vanzelf.
 *    `tests/beloftes/lijstveld.test.ts` wordt rood zodra dit scherm zijn eigen
 *    invoer bouwt.
 */
export default function Lijst() {
  const { userId } = useSession();
  const { profiel } = useProfiel();
  const lijst = useTaken(userId);
  const [melding, setMelding] = useState<string | null>(null);

  return (
    <Screen title={t('lijst.titel')}>
      <Caption>{t('lijst.prive_uitleg')}</Caption>

      <Invoer userId={userId} onKlaar={lijst.opnieuw} onFout={setMelding} />

      {melding === null ? null : <Caption danger>{melding}</Caption>}

      <AsyncView
        loading={lijst.loading}
        error={lijst.error}
        data={lijst.pagina}
        isEmpty={() => lijst.rijen.length === 0}
        onRetry={lijst.herlaad}
        empty={{ title: t('lijst.leeg_titel'), body: t('lijst.leeg_tekst') }}
      >
        {() => (
          <Takenlijst
            rijen={lijst.rijen}
            tz={profiel?.tz ?? null}
            totaal={lijst.pagina?.totaal ?? lijst.rijen.length}
            meer={lijst.pagina?.meer ?? false}
            onGewijzigd={lijst.opnieuw}
            onFout={setMelding}
            onMeer={lijst.volgendePagina}
          />
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * De laadstand van de lijst: de opgehaalde pagina's, de volgende, en opnieuw.
 *
 * ⚠️ **Elke wijziging leest opnieuw vanaf pagina 0, en dat is geen luiheid.**
 *    Afvinken en verplaatsen veranderen de vólgorde, dus de opgehaalde pagina's
 *    kloppen daarna niet meer bij elkaar: een taak die zakt, zou anders twee
 *    keer in beeld staan.
 */
function useTaken(userId: string | null) {
  const [paginaNr, setPaginaNr] = useState(0);
  const [eerdere, setEerdere] = useState<readonly Taak[]>([]);

  const { data: pagina, loading, error, herlaad } = useAsync(
    userId ? () => fetchTaken(userId, { pagina: paginaNr }) : null,
    [userId, paginaNr],
  );

  const rijen = [...eerdere, ...(pagina?.rijen ?? [])];

  const opnieuw = useCallback(() => {
    setEerdere([]);
    setPaginaNr(0);
    herlaad();
  }, [herlaad]);

  const volgendePagina = () => {
    setEerdere(rijen);
    setPaginaNr((n) => n + 1);
  };

  return { pagina, rijen, loading, error, herlaad, opnieuw, volgendePagina };
}

/**
 * Het invoerveld en de knop.
 *
 * ⚠️ **De teller telt in codepunten en niet met `.length`.** `telTekens()` is de
 *    eenheid die de database telt (`char_length`); een teller in
 *    UTF-16-eenheden toont bij emoji een andere grens dan de grens die geldt.
 *    Zie CLAUDE.md, Emoji.
 */
function Invoer({
  userId,
  onKlaar,
  onFout,
}: {
  readonly userId: string | null;
  readonly onKlaar: () => void;
  readonly onFout: (melding: string | null) => void;
}) {
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  const tekens = telTekens(tekst.trim());

  const voegToe = async () => {
    if (userId === null || bezig) return;
    setBezig(true);
    const uitkomst = await maakTaak(userId, { body: tekst });
    setBezig(false);

    if (!uitkomst.ok) {
      onFout(uitkomst.melding);
      return;
    }
    setTekst('');
    onFout(null);
    onKlaar();
  };

  return (
    <Card>
      <Field
        label={t('lijst.veld_label')}
        hint={t('lijst.veld_hint')}
        placeholder={t('lijst.veld_plaats')}
        value={tekst}
        onChangeText={setTekst}
        multiline
      />
      <View style={styles.voet}>
        <Caption>{t('lijst.teller', { n: tekens, max: TAAK_MAX })}</Caption>
        <Button
          variant="primair"
          busy={bezig}
          disabled={tekens === 0 || tekens > TAAK_MAX}
          onPress={() => void voegToe()}
        >
          {t('lijst.toevoegen')}
        </Button>
      </View>
    </Card>
  );
}

/**
 * De lijst zelf.
 *
 * ⚠️ **De buren voor omhoog en omlaag komen uit de open taken en niet uit alle
 *    rijen.** De server sorteert afgevinkte taken onderaan (`done_at` nulls
 *    first), dus een open taak met een afgevinkte buur wisselen zou een
 *    `order_index` verzetten die je nergens ziet — een knop die niets doet.
 *
 * ⚠️ Aan het einde van wat er geladen is, staat de buur op de volgende pagina.
 *    De knop is daar uit, en dat is de zachtere fout: liever geen knop dan een
 *    knop die een taak met zichzelf wisselt.
 */
function Takenlijst({
  rijen,
  tz,
  totaal,
  meer,
  onGewijzigd,
  onFout,
  onMeer,
}: {
  readonly rijen: readonly Taak[];
  /** De tijdzone van de gebruiker; `null` zolang het profiel nog laadt. */
  readonly tz: TimeZone | null;
  readonly totaal: number;
  readonly meer: boolean;
  readonly onGewijzigd: () => void;
  readonly onFout: (melding: string | null) => void;
  readonly onMeer: () => void;
}) {
  const open = rijen.filter((taak) => taak.done_at === null);

  return (
    <View style={styles.lijst}>
      {rijen.map((taak) => (
        <TaakRegel
          key={taak.id}
          taak={taak}
          tz={tz}
          vorige={buur(open, taak, -1)}
          volgende={buur(open, taak, +1)}
          onGewijzigd={onGewijzigd}
          onFout={onFout}
        />
      ))}

      {meer ? (
        <>
          <Caption>{t('lijst.van_totaal', { aantal: rijen.length, totaal })}</Caption>
          <Button variant="secundair" block onPress={onMeer}>
            {t('lijst.meer_laden')}
          </Button>
        </>
      ) : null}
    </View>
  );
}

/** De buur van `taak` binnen `open`, of `null` aan de rand. */
function buur(open: readonly Taak[], taak: Taak, stap: -1 | 1): Taak | null {
  const plek = open.indexOf(taak);
  if (plek === -1) return null;
  return open[plek + stap] ?? null;
}

/** Wat elke schrijfactie van dit scherm teruggeeft. */
type Uitkomst = { readonly ok: boolean; readonly melding?: string };

/**
 * Voert één schrijfactie uit en vertelt het scherm hoe het afliep.
 *
 * ⚠️ **Een mislukking blijft staan als melding en niet als niets.** Een
 *    `verzetTaak()` die weigert omdat twee taken hetzelfde nummer dragen, geeft
 *    anders een knop die niets doet — en dat is precies de stille terugzetting
 *    waar QS8-314 over gaat.
 */
async function voerUit(
  handeling: () => Promise<Uitkomst>,
  scherm: {
    readonly bezig: boolean;
    readonly setBezig: (b: boolean) => void;
    readonly onFout: (melding: string | null) => void;
    readonly onGewijzigd: () => void;
  },
): Promise<void> {
  if (scherm.bezig) return;
  scherm.setBezig(true);
  const uitkomst = await handeling();
  scherm.setBezig(false);

  scherm.onFout(uitkomst.ok ? null : (uitkomst.melding ?? t('lijst.opslaan_mislukt')));
  if (uitkomst.ok) scherm.onGewijzigd();
}

/**
 * Eén regel: de tekst, de stand, en wat je ermee kunt.
 *
 * ⚠️ **Afgevinkt is doorgestreept én in woorden.** Alleen een streep is voor een
 *    schermlezer niets, en `textDecorationLine` reist bovendien niet altijd mee
 *    naar native. De datum eronder zegt hetzelfde in tekst.
 */
function TaakRegel({
  taak,
  tz,
  vorige,
  volgende,
  onGewijzigd,
  onFout,
}: {
  readonly taak: Taak;
  readonly tz: TimeZone | null;
  readonly vorige: Taak | null;
  readonly volgende: Taak | null;
  readonly onGewijzigd: () => void;
  readonly onFout: (melding: string | null) => void;
}) {
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const af = taak.done_at !== null;

  const voer = (handeling: () => Promise<Uitkomst>) =>
    void voerUit(handeling, { bezig, setBezig, onFout, onGewijzigd });

  return (
    <Card>
      <Body muted={af} doorgestreept={af}>
        {taak.body}
      </Body>
      <Afgerond doneAt={taak.done_at} tz={tz} />

      {vraagt ? (
        <Bevestiging
          tekst={bevestigingen().taakVerwijderen}
          bezig={bezig}
          onBevestig={() => voer(() => verwijderTaak(taak.id))}
          onAnnuleer={() => setVraagt(false)}
        />
      ) : (
        <Regelknoppen
          af={af}
          bezig={bezig}
          vorige={vorige}
          volgende={volgende}
          onAfvinken={() => voer(() => zetAfgevinkt(taak.id, !af))}
          onOmhoog={() => voer(() => verzetTaak(taak, vorige as Taak))}
          onOmlaag={() => voer(() => verzetTaak(taak, volgende as Taak))}
          onWeg={() => setVraagt(true)}
        />
      )}
    </Card>
  );
}

/**
 * Wanneer een taak is afgevinkt, in de tijdzone van de gebruiker.
 *
 * ⚠️ **`toonMoment()` en niet de datum uit de tijdstempel snijden.** `done_at`
 *    staat in UTC; de eerste tien tekens eruit halen geeft de UTC-datum, en die
 *    is voor iemand in Auckland dertien uur van de zijne verwijderd.
 *    Domeinregel 2, en correctheidsregel 7: geen datumberekening buiten
 *    `shared/time`.
 *
 * ⚠️ Zonder tijdzone toont hij niets in plaats van een gok. Het profiel laadt
 *    apart, en een datum in de verkeerde zone is erger dan even geen datum.
 */
function Afgerond({ doneAt, tz }: { readonly doneAt: string | null; readonly tz: TimeZone | null }) {
  if (doneAt === null || tz === null) return null;

  return <Caption>{t('lijst.afgerond_op', { datum: toonMoment(doneAt, tz, opmaaktaal()) })}</Caption>;
}

/** De vier knoppen onder een regel. Apart, want vier knoppen is geen regel. */
function Regelknoppen({
  af,
  bezig,
  vorige,
  volgende,
  onAfvinken,
  onOmhoog,
  onOmlaag,
  onWeg,
}: {
  readonly af: boolean;
  readonly bezig: boolean;
  readonly vorige: Taak | null;
  readonly volgende: Taak | null;
  readonly onAfvinken: () => void;
  readonly onOmhoog: () => void;
  readonly onOmlaag: () => void;
  readonly onWeg: () => void;
}) {
  return (
    <View style={styles.knoppen}>
      <Button variant="secundair" busy={bezig} onPress={onAfvinken}>
        {af ? t('lijst.ontvinken') : t('lijst.afvinken')}
      </Button>
      <Button variant="stil" disabled={bezig || vorige === null} onPress={onOmhoog}>
        {t('lijst.omhoog')}
      </Button>
      <Button variant="stil" disabled={bezig || volgende === null} onPress={onOmlaag}>
        {t('lijst.omlaag')}
      </Button>
      <Button variant="stil" disabled={bezig} onPress={onWeg}>
        {t('lijst.verwijderen')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  voet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.blokGap,
  },
  knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 3, alignItems: 'center' },
});
