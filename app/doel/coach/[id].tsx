import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  fetchJob,
  haalbaarheidUit,
  mijlpalenUit,
  vraagMijlpalen,
  werkJobAf,
  type VoorstelMijlpaal,
} from '@/modules/ai';
import { useSession } from '@/modules/auth';
import {
  ANTWOORD_MAX,
  bewaarInterview,
  fetchDoel,
  fetchInterview,
  heeftAntwoorden,
  interviewStappen,
  LEEG_INTERVIEW,
  maakMijlpaal,
  type DoelMetVoortgang,
  type InterviewInvoer,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Field,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * De Doelcoach — QS8-37 (het interview) en QS8-38 (mijlpalen genereren).
 *
 * ⚠️ Eén scherm voor allebei, en dat is geen samenvoegen om het samenvoegen.
 *    Het interview bestaat om de generatie beter te maken; los van elkaar is het
 *    eerste een vragenlijst zonder doel en het tweede een knop zonder context.
 *
 * ⚠️ **Alles is overslaanbaar en alles overslaan moet werken** — dat is
 *    acceptatiecriterium 4 van QS8-37, en het is de reden dat er nergens een
 *    verplicht veld staat. Wie niets invult krijgt een generieker resultaat,
 *    geen blokkade.
 *
 * ⚠️ **De AI-call draait nooit synchroon** (correctheidsregel 8). Hij duurt hier
 *    ongeveer twintig seconden — gemeten op 21-08-2026, niet geschat. Het pad
 *    is: een job klaarzetten, de Edge Function hem laten afwerken, en intussen
 *    kijken tot hij klaar is.
 *
 * ⚠️ **Valt de Doelcoach uit, dan is er een weg terug.** Acceptatiecriterium 5
 *    van QS8-38: bij een fout staat er een knop naar de handmatige route en niet
 *    alleen een melding. Een doel zonder mijlpalen omdat de AI het liet afweten,
 *    is een doel dat je kwijtraakt.
 */
export default function Doelcoach() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();

  const [doel, setDoel] = useState<DoelMetVoortgang | null>(null);
  const [antwoorden, setAntwoorden] = useState<InterviewInvoer>(LEEG_INTERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    let levend = true;

    Promise.all([fetchDoel(id), fetchInterview(id)])
      .then(([gevonden, interview]) => {
        if (!levend) return;
        setDoel(gevonden);
        if (interview !== null) setAntwoorden(interview.antwoorden);
        setError(null);
      })
      .catch((fout: unknown) => {
        if (levend) setError(fout);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [id]);

  return (
    <Screen title={t('coach.titel')} eyebrow={t('coach.eyebrow')}>
      <AsyncView
        loading={loading}
        error={error}
        data={doel ?? undefined}
        isEmpty={() => false}
        onRetry={() => router.replace(`/doel/${id}`)}
        empty={{
          title: t('coach.leeg_titel'),
          body: t('coach.leeg_tekst'),
        }}
      >
        {(d) => (
          <View style={styles.blokken}>
            <Card nested>
              <Subheading>{d.title}</Subheading>
              <Body muted>{t('coach.zes_vragen')}</Body>
              <Caption>{t('coach.alleen_voor_jou')}</Caption>
            </Card>

            <Interview
              goalId={d.id}
              userId={userId}
              antwoorden={antwoorden}
              onWijzig={setAntwoorden}
            />

            <Genereren
              doel={d}
              antwoorden={antwoorden}
              heeftAlMijlpalen={(d.milestones_total ?? 0) > 0}
              onKlaar={() => router.replace(`/doel/${d.id}`)}
            />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/**
 * De zes vragen.
 *
 * ⚠️ Alles op één scherm en niet als wizard met zes stappen. Zes losse schermen
 *    voelen als een formulier dat je móét afmaken; één lijst die je kunt
 *    scrollen laat zien hoe kort het is, en dat is precies wat "je mag alles
 *    overslaan" geloofwaardig maakt.
 */
function Interview({
  goalId,
  userId,
  antwoorden,
  onWijzig,
}: {
  readonly goalId: string;
  readonly userId: string | null;
  readonly antwoorden: InterviewInvoer;
  readonly onWijzig: (nieuw: InterviewInvoer) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bewaard, setBewaard] = useState(false);

  async function bewaar() {
    if (userId === null) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await bewaarInterview(goalId, antwoorden);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setBewaard(true);
  }

  return (
    <Card>
      {interviewStappen().map((stap) => {
        const waarde = antwoorden[stap.veld];

        // ⚠️ Vraag 4 is een getal en de rest tekst. Dat verschil is er niet voor
        //    de vorm: de Risico-radar rékent met de uren, en een tekstveld
        //    levert "een uurtje of zes" op.
        if (stap.veld === 'hours_per_week') {
          return (
            <Field
              key={stap.veld}
              label={stap.vraag}
              hint={stap.toelichting}
              value={waarde === null ? '' : String(waarde)}
              onChangeText={(tekst) => {
                const schoon = tekst.replace(/[^0-9]/g, '');
                onWijzig({
                  ...antwoorden,
                  hours_per_week: schoon === '' ? null : Number(schoon),
                });
                setBewaard(false);
              }}
              keyboardType="number-pad"
              placeholder="6"
            />
          );
        }

        return (
          <Field
            key={stap.veld}
            label={stap.vraag}
            hint={stap.toelichting}
            value={typeof waarde === 'string' ? waarde : ''}
            onChangeText={(tekst) => {
              onWijzig({ ...antwoorden, [stap.veld]: tekst === '' ? null : tekst });
              setBewaard(false);
            }}
            multiline
            numberOfLines={2}
            maxLength={ANTWOORD_MAX}
          />
        );
      })}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        <Button busy={bezig} disabled={userId === null} onPress={() => void bewaar()}>
          {bewaard ? t('coach.bewaard') : t('coach.bewaren')}
        </Button>
      </View>

      <Caption>{t('coach.bewaren_niet_nodig')}</Caption>
    </Card>
  );
}

type Stand =
  | { fase: 'rust' }
  | { fase: 'bezig'; jobId: string }
  | { fase: 'klaar'; voorstellen: readonly VoorstelMijlpaal[]; haalbaarheid: string | null }
  | { fase: 'mislukt'; melding: string };

/**
 * Mijlpalen laten voorstellen en overnemen — QS8-38.
 *
 * ⚠️ Kijken tot de job klaar is, en niet wachten op het antwoord van de Edge
 *    Function. Die twee zijn niet hetzelfde: een verbroken verbinding tijdens de
 *    aanroep laat de job gewoon doorlopen, en dan is het antwoord er wel maar
 *    heeft dit scherm het gemist. Door de job te bevragen komt hij er alsnog.
 */
function Genereren({
  doel,
  antwoorden,
  heeftAlMijlpalen,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly antwoorden: InterviewInvoer;
  readonly heeftAlMijlpalen: boolean;
  readonly onKlaar: () => void;
}) {
  const [stand, setStand] = useState<Stand>({ fase: 'rust' });
  const [overnemen, setOvernemen] = useState(false);
  /**
   * Hoe vaak er op "opnieuw" gedrukt is — QS8-40.
   *
   * ⚠️ Dit getal gaat mee de invoer in, en dat is geen sierlijkheid. De poort
   *    hasht de invoer en hergebruikt een geslaagde job met dezelfde hash binnen
   *    een dag. Zonder variatie levert "opnieuw genereren" dus letterlijk
   *    hetzelfde antwoord uit de cache — de knop lijkt dan stuk terwijl de cache
   *    precies doet wat hij moet doen.
   */
  const [ronde, setRonde] = useState(0);

  // ⚠️ In een ref zodat het opruimen van het effect hem kan stoppen. Zonder dit
  //    blijft een interval doortikken nadat het scherm weg is, en dan schrijft
  //    hij naar state die niet meer bestaat.
  const levend = useRef(true);
  useEffect(() => {
    levend.current = true;
    return () => {
      levend.current = false;
    };
  }, []);

  const kijk = useCallback(async (jobId: string) => {
    // ⚠️ Een bovengrens op het aantal rondes, geen `while (true)`. De AI-call
    //    duurt ongeveer twintig seconden; twee minuten is ruim, en zonder grens
    //    blijft dit scherm bij een vastgelopen job eeuwig ophalen — op een
    //    gratis tier is dat een rekening.
    for (let ronde = 0; ronde < 60; ronde += 1) {
      await new Promise((klaar) => setTimeout(klaar, 2000));
      if (!levend.current) return;

      const job = await fetchJob(jobId);
      if (job === null) continue;

      if (job.status === 'done') {
        const voorstellen = mijlpalenUit(job.output);
        setStand(
          voorstellen.length === 0
            ? { fase: 'mislukt', melding: t('coach.geen_mijlpalen') }
            : {
                fase: 'klaar',
                voorstellen,
                haalbaarheid: haalbaarheidUit(job.output),
              },
        );
        return;
      }

      if (job.status === 'error') {
        setStand({
          fase: 'mislukt',
          melding: job.error ?? 'De Doelcoach liep vast.',
        });
        return;
      }
    }

    setStand({
      fase: 'mislukt',
      melding: t('coach.te_lang'),
    });
  }, []);

  async function start(nieuweRonde = ronde) {
    setStand({ fase: 'rust' });

    const aanvraag = await vraagMijlpalen(doel.id, {
      doel: doel.title,
      streefdatum: doel.target_date,
      ...(nieuweRonde === 0 ? {} : { poging: nieuweRonde }),
      // ⚠️ Alleen ingevulde antwoorden. Een `null` meesturen zegt de coach
      //    niets, en het verandert wél de cachesleutel.
      ...(heeftAntwoorden(antwoorden) ? { interview: schoon(antwoorden) } : {}),
    });

    if (!aanvraag.ok) {
      setStand({ fase: 'mislukt', melding: aanvraag.melding });
      return;
    }

    setStand({ fase: 'bezig', jobId: aanvraag.waarde.jobId });

    // Een hergebruikte job is al klaar; afwerken zou hem afwijzen met
    // `job_is_done`. Meteen gaan kijken dus.
    if (!aanvraag.waarde.hergebruikt) {
      const gestart = await werkJobAf(aanvraag.waarde.jobId);
      if (!gestart.ok) {
        setStand({ fase: 'mislukt', melding: gestart.melding });
        return;
      }
    }

    void kijk(aanvraag.waarde.jobId);
  }

  async function neemOver(voorstellen: readonly VoorstelMijlpaal[]) {
    setOvernemen(true);

    // ⚠️ Eén voor één en op volgorde, want `maakMijlpaal()` bepaalt zelf de
    //    volgende `order_index` uit wat er al staat. Parallel zetten zou twee
    //    mijlpalen op hetzelfde nummer kunnen zetten, en daar staat een unieke
    //    index op.
    for (const voorstel of voorstellen) {
      await maakMijlpaal(doel.id, {
        title: voorstel.title,
        description: voorstel.description,
        target_date: voorstel.target_date,
      });
    }

    setOvernemen(false);
    onKlaar();
  }

  if (stand.fase === 'bezig') {
    return (
      <Card nested>
        <Subheading>{t('coach.denkt_na')}</Subheading>
        <Body muted>{t('coach.duurt_even')}</Body>
      </Card>
    );
  }

  if (stand.fase === 'mislukt') {
    return (
      <Card nested>
        <Subheading>{t('coach.lukte_niet')}</Subheading>
        <Body muted>{stand.melding}</Body>

        {/*
          ⚠️ Acceptatiecriterium 5 van QS8-38: een nette terugval naar handmatig.
             Niet alleen een foutmelding — een doel zonder mijlpalen omdat de AI
             het liet afweten, is een doel dat je kwijtraakt.
        */}
        <View style={styles.knoppen}>
          <Button variant="primair" onPress={onKlaar}>
            {t('coach.zelf_toevoegen')}
          </Button>
          <Button variant="stil" onPress={() => void start()}>
            {t('coach.opnieuw')}
          </Button>
        </View>
      </Card>
    );
  }

  if (stand.fase === 'klaar') {
    return (
      <Card nested>
        <Subheading>{t('coach.n_voorgesteld', { aantal: stand.voorstellen.length })}</Subheading>

        {/*
          ⚠️ De tegenspraak staat bóven de voorstellen en niet eronder — laatste
             acceptatiecriterium van QS8-38. Een coach die alles haalbaar noemt
             is geen coach, en een waarschuwing onder twaalf mijlpalen leest
             niemand meer. De uitwegen die hier genoemd worden (datum verzetten,
             doel kleiner maken) staan op het doelscherm; dit blok zegt alleen
             dát er iets niet past.
        */}
        {stand.haalbaarheid === null ? null : (
          <Card>
            <Subheading>{t('coach.bedenking')}</Subheading>
            <Body muted>{stand.haalbaarheid}</Body>
            <Caption>{t('coach.bedenking_uitleg')}</Caption>
          </Card>
        )}

        <Body muted>{t('coach.neem_over')}</Body>

        <View style={styles.voorstellen}>
          {stand.voorstellen.map((voorstel, i) => (
            <View key={`${voorstel.title}-${i}`} style={styles.voorstel}>
              <Body>{voorstel.title}</Body>
              {voorstel.target_date === null ? null : (
                <Caption>{t('algemeen.streefdatum', { datum: voorstel.target_date })}</Caption>
              )}
            </View>
          ))}
        </View>

        <View style={styles.knoppen}>
          <Button
            variant="primair"
            busy={overnemen}
            onPress={() => void neemOver(stand.voorstellen)}
          >
            {t('coach.alle_overnemen', { aantal: stand.voorstellen.length })}
          </Button>
          {/*
            QS8-40. Telt mee in het quotum — dat kan niet anders, want het gaat
            langs dezelfde poort.
          */}
          <Button
            variant="stil"
            disabled={overnemen}
            onPress={() => {
              const volgende = ronde + 1;
              setRonde(volgende);
              void start(volgende);
            }}
          >
            {t('coach.opnieuw')}
          </Button>
          <Button variant="stil" disabled={overnemen} onPress={onKlaar}>
            {t('coach.toch_niet')}
          </Button>
        </View>

        {/*
          ⚠️ QS8-40 vraagt een waarschuwing vóór het overschrijven van handmatige
             bewerkingen. Overnemen overschrijft niets — `maakMijlpaal()` zet ze
             eronder — dus het eerlijke bericht is niet "je raakt iets kwijt"
             maar "je krijgt er meer dan je denkt". Dat is de fout die iemand
             hier echt maakt.
        */}
        {heeftAlMijlpalen ? (
          <Caption danger>{t('coach.al_mijlpalen')}</Caption>
        ) : null}

        <Caption>{t('coach.poging_telt')}</Caption>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>{t('coach.laten_voorstellen')}</Subheading>
      <Body muted>{t('coach.wat_hij_doet')}</Body>
      <Caption>{t('coach.tien_per_dag')}</Caption>

      <Button variant="primair" onPress={() => void start()}>
        {t('coach.genereer')}
      </Button>
    </Card>
  );
}

/** Alleen de ingevulde antwoorden, met Nederlandse sleutels voor de prompt. */
function schoon(antwoorden: InterviewInvoer): Record<string, unknown> {
  const uit: Record<string, unknown> = {};

  if (antwoorden.measurable !== null) uit.waaraan_zie_je_dat_het_gelukt_is = antwoorden.measurable;
  if (antwoorden.identity !== null) uit.wie_word_je = antwoorden.identity;
  if (antwoorden.deadline_reason !== null) uit.waarom_die_datum = antwoorden.deadline_reason;
  if (antwoorden.hours_per_week !== null) uit.uren_per_week = antwoorden.hours_per_week;
  if (antwoorden.already_done !== null) uit.al_gedaan = antwoorden.already_done;
  if (antwoorden.stuck_before !== null) uit.eerder_vastgelopen = antwoorden.stuck_before;

  return uit;
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 3, alignItems: 'center' },
  voorstellen: { gap: space.blokGap - 4 },
  voorstel: { gap: 2 },
});
