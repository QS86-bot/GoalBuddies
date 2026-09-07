import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchJob,
  onvolledigMelding,
  pasPlanToe,
  planUit,
  rijenUitPlan,
  vraagPlan,
  werkJobAf,
  type VoorstelPlan,
} from '@/modules/ai';
import { useProfiel, useSession, userClock } from '@/modules/auth';
import { categorieLabels } from '@/modules/goals';
import { opmaaktaal, t } from '@/shared/i18n';
import { addDays, localDateIn, now, toonDatum, type Weekday } from '@/shared/time';
import {
  Body,
  Button,
  Caption,
  Card,
  DatumKeuze,
  Field,
  Screen,
  Subheading,
  useTerug,
  Wachtbalk,
} from '@/shared/ui';

/**
 * Een doel uit één zin — QS8-201, de kern van epic QS8-200.
 *
 * ⚠️ **Twee velden en één knop, en dat is de hele bedoeling.** Het oude pad
 *    (`/doel/nieuw` → `/doel/[id]` → coach → weekdoelen) kostte negentien
 *    invoervelden en twee AI-rondes voordat er iets bruikbaars stond. Uit de
 *    doorloop van 30-08: dat is geen wauw, dat is een formulier.
 *
 * ⚠️ **`/doel/nieuw` blijft bestaan als "ik doe het liever zelf".** Onwrikbare
 *    regel 16 en acceptatiecriterium 5 van QS8-38: valt de AI uit, dan staat er
 *    een knop naar het handmatige formulier en niet alleen een foutmelding — met
 *    de zin en de datum al ingevuld, zodat de gebruiker niet opnieuw begint.
 */

type Stand =
  | { fase: 'invoer' }
  | { fase: 'bezig' }
  | { fase: 'klaar'; plan: VoorstelPlan }
  | { fase: 'mislukt'; melding: string };

export default function PlanUitEenZin() {
  const router = useRouter();
  const terug = useTerug('/doelen');
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [zin, setZin] = useState('');
  const [datum, setDatum] = useState('');
  const [stand, setStand] = useState<Stand>({ fase: 'invoer' });
  const [bevestigen, setBevestigen] = useState(false);

  // ⚠️ Dezelfde vangrail als in `app/doel/coach/[id].tsx`: het scherm kan weg
  //    zijn terwijl de lus nog draait, en dan zet `setStand` op een component
  //    die niet meer bestaat.
  const levend = useRef(true);
  useEffect(() => {
    levend.current = true;
    return () => {
      levend.current = false;
    };
  }, []);

  const kijk = useCallback(async (jobId: string) => {
    // ⚠️ Een bovengrens en geen `while (true)` — zelfde reden als bij de coach:
    //    zonder grens blijft dit scherm bij een vastgelopen job eeuwig ophalen,
    //    en op een gratis tier is dat een rekening.
    for (let ronde = 0; ronde < 60; ronde += 1) {
      await new Promise((klaar) => setTimeout(klaar, 2000));
      if (!levend.current) return;

      const job = await fetchJob(jobId);
      if (job === null) continue;

      if (job.status === 'done') {
        const plan = planUit(job.output);
        setStand(
          plan === null
            ? { fase: 'mislukt', melding: t('plan.geen_plan') }
            : { fase: 'klaar', plan },
        );
        return;
      }

      if (job.status === 'failed') {
        setStand({ fase: 'mislukt', melding: job.error ?? t('coach.vastgelopen') });
        return;
      }
    }

    setStand({ fase: 'mislukt', melding: t('coach.te_lang') });
  }, []);

  async function vraag() {
    setStand({ fase: 'bezig' });

    const aanvraag = await vraagPlan(zin.trim(), datum.trim());
    if (!aanvraag.ok) {
      setStand({ fase: 'mislukt', melding: aanvraag.melding });
      return;
    }

    // ⚠️ Aanzetten en dan pas kijken, en de uitkomst hiervan wordt niet
    //    afgewacht — `kijk()` onderscheidt `done` van `failed` zelf. Zelfde
    //    volgorde als in het coachscherm.
    await werkJobAf(aanvraag.waarde.jobId);
    void kijk(aanvraag.waarde.jobId);
  }

  /**
   * De handmatige route, met mee wat er al getypt is.
   *
   * ⚠️ Stond twee keer uitgeschreven zodra QS8-208 er een uitweg tijdens het
   *    wachten bij zette. Twee kopieën van dezelfde URL is twee plekken waar de
   *    parameters uit de pas kunnen lopen, en dan verliest de gebruiker precies
   *    de zin die hij niet nog een keer wil typen.
   */
  function zelfInvullen() {
    const titel = encodeURIComponent(zin.trim());
    router.push(`/doel/nieuw?titel=${titel}&datum=${encodeURIComponent(datum.trim())}`);
  }

  async function bevestig(plan: VoorstelPlan) {
    if (!userId || !profiel) return;
    setBevestigen(true);

    const uitkomst = await pasPlanToe(
      userId,
      rijenUitPlan(plan, datum.trim()),
      userClock(profiel),
      null,
    );

    setBevestigen(false);

    if (!uitkomst.ok) {
      setStand({ fase: 'mislukt', melding: uitkomst.melding });
      return;
    }

    // ⚠️ **Naar het doel en niet naar het hoofdscherm bij een half plan.** Is er
    //    iets niet geland, dan moet de gebruiker kunnen zien wát — een
    //    hoofdscherm dat leger is dan wat hij net bevestigde, verklaart niets.
    const klacht = onvolledigMelding(uitkomst.waarde);
    router.replace(klacht === null ? '/' : `/doel/${uitkomst.waarde.goalId}`);
  }

  const magVragen = zin.trim().length >= 3 && datum.trim() !== '' && stand.fase !== 'bezig';

  return (
    <Screen title={t('plan.titel')} eyebrow={t('plan.eyebrow')} terug={{ naar: '/doelen' }}>
      {stand.fase === 'klaar' ? (
        <PlanVoorstel
          plan={stand.plan}
          bezig={bevestigen}
          opnieuw={() => setStand({ fase: 'invoer' })}
          bevestig={() => void bevestig(stand.plan)}
        />
      ) : (
        <>
          <Card>
            <Field
              label={t('plan.wat')}
              hint={t('plan.wat_hint')}
              value={zin}
              onChangeText={setZin}
              placeholder={t('plan.wat_voorbeeld')}
              multiline
              numberOfLines={2}
            />

            {/* ⚠️ Zie `app/doel/nieuw.tsx`: kalender, morgen als ondergrens. */}
            {profiel === null ? null : (
              <DatumKeuze
                label={t('plan.wanneer')}
                hint={t('plan.wanneer_hint')}
                waarde={datum}
                onKies={setDatum}
                startDag={profiel.week_start_day as Weekday}
                vandaag={localDateIn(profiel.tz, now())}
                min={addDays(localDateIn(profiel.tz, now()), 1)}
                optioneel
              />
            )}
          </Card>

          {/*
            ⚠️ **Ook dit scherm wacht twintig seconden, en het stond niet in
               QS8-208.** Het issue noemt de Doelcoach en het weekdoelenscherm;
               `tests/beloftes/wachten-op-de-coach.test.ts` leidt zijn lijst af
               uit wie `fetchJob()` aanroept en vond er dus drie. Dat is precies
               waarom die lijst niet uit twee bestandsnamen bestaat.
          */}
          {stand.fase === 'bezig' ? (
            <Card nested>
              <Wachtbalk
                stappen={[
                  t('wachten.stap_zin_lezen'),
                  t('wachten.stap_doel_bedenken'),
                  t('wachten.stap_nalopen'),
                ]}
                uitweg={
                  <>
                    <Button variant="stil" block onPress={zelfInvullen}>
                      {t('wachten.liever_zelf')}
                    </Button>
                    <Caption>{t('wachten.liever_zelf_uitleg')}</Caption>
                  </>
                }
              />
            </Card>
          ) : null}

          {stand.fase === 'mislukt' ? (
            <Card nested>
              <Caption danger>{stand.melding}</Caption>
              <Body muted>{t('plan.terugval_uitleg')}</Body>
              <Button variant="secundair" block onPress={zelfInvullen}>
                {t('plan.zelf_invullen')}
              </Button>
            </Card>
          ) : null}

          <Button
            variant="primair"
            block
            busy={stand.fase === 'bezig'}
            disabled={!magVragen}
            onPress={() => void vraag()}
          >
            {t('plan.maak')}
          </Button>
          <Button variant="stil" block onPress={terug}>
            {t('plan.annuleren')}
          </Button>
        </>
      )}
    </Screen>
  );
}

/**
 * Het voorstel als één geheel: dit is je doel, dit zijn je stappen, dit doe je
 * deze week.
 *
 * ⚠️ **De haalbaarheidstegenspraak staat bovenaan en niet onderaan.** Een
 *    waarschuwing onder zes mijlpalen leest niemand, en dan is de tegenspraak
 *    een formaliteit geweest.
 */
function PlanVoorstel({
  plan,
  bezig,
  opnieuw,
  bevestig,
}: {
  plan: VoorstelPlan;
  bezig: boolean;
  opnieuw: () => void;
  bevestig: () => void;
}) {
  return (
    <>
      {plan.haalbaarheid === null ? null : (
        <Card nested>
          <Subheading>{t('plan.haalbaarheid')}</Subheading>
          <Body>{plan.haalbaarheid}</Body>
        </Card>
      )}

      <Card>
        <Subheading>{plan.title}</Subheading>
        <Caption>{categorieLabels()[plan.category]}</Caption>
        {plan.identity_statement === null ? null : <Body>{plan.identity_statement}</Body>}
      </Card>

      <Card>
        <Subheading>{t('plan.stappen')}</Subheading>
        {plan.milestones.length === 0 ? (
          <Body muted>{t('plan.geen_stappen')}</Body>
        ) : (
          plan.milestones.map((m, i) => (
            <Body key={`${i}-${m.title}`}>
              {/*
                ⚠️ **Twee dingen tegelijk, en het tweede was ontglipt.** Het
                   gedachtestreepje moest eruit (QS8-218), en de datum ernaast
                   stond hier nog als kale ISO-waarde — QS8-221 vond hem niet,
                   want die zoekt naar sleutels met een `{datum}` erin en dit is
                   een sjabloonstring in JSX.
              */}
              {t('plan.stap_regel', {
                nummer: i + 1,
                titel: m.title,
                datum: m.target_date === null ? '' : toonDatum(m.target_date, opmaaktaal()),
              })}
            </Body>
          ))
        )}
      </Card>

      <Card>
        <Subheading>{t('plan.deze_week')}</Subheading>
        {plan.first_weekly_goal === null ? (
          <Body muted>{t('plan.geen_weekdoel')}</Body>
        ) : (
          <>
            <Body>{plan.first_weekly_goal.title}</Body>
            <Caption>{t('plan.vloer')}: {plan.first_weekly_goal.floor_text}</Caption>
            <Caption>{t('plan.plafond')}: {plan.first_weekly_goal.ceiling_text}</Caption>
          </>
        )}
      </Card>

      <Button variant="primair" block busy={bezig} onPress={bevestig}>
        {t('plan.goed_zo')}
      </Button>
      <Button variant="stil" block onPress={opnieuw}>
        {t('plan.anders')}
      </Button>
    </>
  );
}
