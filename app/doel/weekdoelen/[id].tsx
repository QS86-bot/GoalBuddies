import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fetchJob, vraagWeekdoelen, weekdoelenUit, werkJobAf, type VoorstelWeekdoel } from '@/modules/ai';
import { useProfiel, userClock } from '@/modules/auth';
import {
  eersteCyclusVanDoel,
  fetchDoel,
  fetchInterview,
  fetchMijlpalen,
  heeftAntwoorden,
  maakWeekdoel,
  maakWeekplan,
  type DoelMetVoortgang,
  type InterviewInvoer,
  type Mijlpaal,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { AsyncView, Body, Button, Caption, Card, Screen, Subheading, useAsync } from '@/shared/ui';

/**
 * Weekstappen laten genereren onder één mijlpaal — QS8-41, PRD 3.4.
 *
 * ⚠️ **Een eigen scherm en geen blok in `app/doel/[id].tsx`.** Dat bestand is
 *    ruim vijftienhonderd regels en het herlaadt zichzelf bij elke wijziging;
 *    twee minuten pollen in een component dat tussendoor geremount kan worden is
 *    een fout die je pas in productie ziet. Het coach-scherm van QS8-38 staat om
 *    dezelfde reden apart.
 *
 * ⚠️ **De AI-call draait nooit synchroon** (correctheidsregel 8). Zelfde pad als
 *    de Doelcoach: een job klaarzetten, de Edge Function hem laten afwerken, en
 *    intussen kijken tot hij klaar is. Met een bovengrens op het aantal rondes,
 *    want een `while (true)` tegen een vastgelopen job is op een gratis tier een
 *    rekening.
 *
 * ⚠️ **Hier stond tot 31-08-2026 dat er geen "alles toevoegen"-knop was, en dat
 *    dat de belangrijkste keuze in dit scherm was.** Die knop is er nu wel —
 *    QS8-203, migratie 0137 — en het is belangrijk om te zien dat de réden niet
 *    is weggevallen:
 *
 *    `maakWeekdoel()` zet nog steeds altijd de húidige cyclus, want de client
 *    mag "deze week" niet bepalen (correctheidsregel 7). En domeinregel 10 zegt
 *    nog steeds dat elk weekdoel het puntenplafond verhoogt. Zes voorstellen als
 *    zes weekdoelen wegschrijven zou dus nog steeds vijf gegarandeerd gemiste
 *    weken en vijf minpunten opleveren, voor iets wat de app zélf heeft
 *    voorgesteld.
 *
 *    Wat er veranderd is, is dat er nu een plaats is voor een stap die nog géén
 *    weekdoel is. `neemPlanOver()` maakt precies één weekdoel — de eerste — en
 *    zet de rest in `weekly_plan_steps`, waar niets meetelt tot de rollover hem
 *    inschuift. De knop die hier niet mocht staan, is dus nog steeds verboden;
 *    dit is een andere knop.
 */
export default function Weekdoelcoach() {
  const { id, mijlpaal: mijlpaalId } = useLocalSearchParams<{ id: string; mijlpaal?: string }>();
  const router = useRouter();

  const {
    data: stand,
    loading,
    error,
    herlaad,
  } = useAsync(id ? () => laad(id, mijlpaalId ?? null) : null, [id, mijlpaalId]);

  return (
    <Screen
      title={t('weekcoach.titel')}
      eyebrow={t('weekcoach.eyebrow')}
      terug={{ naar: `/doel/${id}` }}
    >
      <AsyncView
        loading={loading}
        error={error}
        data={stand ?? undefined}
        // ⚠️ Geen mijlpaal in de URL, of een mijlpaal die niet bij dit doel
        //    hoort, is hetzelfde geval: er valt niets te genereren. Het verschil
        //    tonen zou verraden dat er een mijlpaal met die id bestaat.
        isEmpty={(s) => s.doel === null || s.mijlpaal === null}
        onRetry={herlaad}
        empty={{
          title: t('weekcoach.leeg_titel'),
          body: t('weekcoach.leeg_tekst'),
        }}
      >
        {(s) =>
          s.doel === null || s.mijlpaal === null ? null : (
            <View style={styles.blokken}>
              <Card nested>
                <Subheading>{s.mijlpaal.title}</Subheading>
                <Body muted>{t('weekcoach.uitleg', { doel: s.doel.title })}</Body>
                <Caption>{t('weekcoach.zelfde_tien')}</Caption>
              </Card>

              <Genereren doel={s.doel} mijlpaal={s.mijlpaal} antwoorden={s.antwoorden} />
            </View>
          )
        }
      </AsyncView>

      <Button variant="stil" block onPress={() => router.replace(`/doel/${id}`)}>
        {t('weekcoach.terug')}
      </Button>

      {/* De instelroute heeft halverwege een uitgang nodig — QS8-211. */}
      <Button variant="stil" block onPress={() => router.replace('/')}>
        {t('nav.naar_overzicht')}
      </Button>
    </Screen>
  );
}

type Stand =
  | { readonly fase: 'rust' }
  | { readonly fase: 'bezig' }
  | { readonly fase: 'klaar'; readonly voorstellen: readonly VoorstelWeekdoel[] }
  | { readonly fase: 'mislukt'; readonly melding: string };

function Genereren({
  doel,
  mijlpaal,
  antwoorden,
}: {
  readonly doel: DoelMetVoortgang;
  readonly mijlpaal: Mijlpaal;
  readonly antwoorden: InterviewInvoer | null;
}) {
  const router = useRouter();
  const { profiel } = useProfiel();
  const klok = profiel ? userClock(profiel) : null;
  const [stand, setStand] = useState<Stand>({ fase: 'rust' });
  const [ronde, setRonde] = useState(0);
  const [toegevoegd, setToegevoegd] = useState<ReadonlySet<number>>(new Set());
  const [bezig, setBezig] = useState<number | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [planKlaar, setPlanKlaar] = useState(false);

  // ⚠️ In een ref zodat het opruimen van het effect hem kan stoppen. Zonder dit
  //    blijft de lus doortikken nadat het scherm weg is, en dan schrijft hij
  //    naar state die niet meer bestaat.
  const levend = useRef(true);
  useEffect(() => {
    levend.current = true;
    return () => {
      levend.current = false;
    };
  }, []);

  const kijk = useCallback(async (jobId: string) => {
    // ⚠️ Een bovengrens en geen `while (true)`, om dezelfde reden als bij de
    //    Doelcoach: bij een vastgelopen job blijft dit anders eeuwig ophalen.
    for (let poging = 0; poging < 60; poging += 1) {
      await new Promise((klaar) => setTimeout(klaar, 2000));
      if (!levend.current) return;

      const job = await fetchJob(jobId);
      if (job === null) continue;

      if (job.status === 'done') {
        const voorstellen = weekdoelenUit(job.output);
        setStand(
          voorstellen.length === 0
            ? { fase: 'mislukt', melding: t('weekcoach.geen_weekdoelen') }
            : { fase: 'klaar', voorstellen },
        );
        return;
      }

      // ⚠️ `failed` en niet `error`: dat is wat `ai_jobs_status_valid` kent en
      //    wat `doelcoach` schrijft. De vorige versie van deze tak stond in het
      //    coach-scherm op `'error'` en was daardoor onbereikbaar — zie
      //    `src/modules/ai/job-schemas.ts`.
      if (job.status === 'failed') {
        setStand({ fase: 'mislukt', melding: job.error ?? t('weekcoach.vastgelopen') });
        return;
      }
    }

    setStand({ fase: 'mislukt', melding: t('weekcoach.te_lang') });
  }, []);

  async function start(nieuweRonde = ronde) {
    setStand({ fase: 'bezig' });
    setToegevoegd(new Set());
    setFout(null);

    const aanvraag = await vraagWeekdoelen(doel.id, invoerVoor(doel, mijlpaal, antwoorden, nieuweRonde));

    if (!aanvraag.ok) {
      setStand({ fase: 'mislukt', melding: aanvraag.melding });
      return;
    }

    // Een hergebruikte job is al klaar; afwerken zou hem afwijzen met
    // `job_is_done`. Meteen gaan kijken dus.
    if (!aanvraag.waarde.hergebruikt) {
      // ⚠️ **Een mislukte aanroep is geen mislukte job, en opgeven is hier de
      //    duurste fout die er is.** De kop hierboven legt uit dat een verbroken
      //    verbinding de job gewoon laat doorlopen en dat je hem daarom bevraagt
      //    — tot 28-08 zette deze tak precies die redding uit. De client brak
      //    bovendien élke call af na vijftien seconden terwijl er twintig nodig
      //    zijn (gerepareerd in `src/lib/supabase.ts`), dus dit was het normale
      //    pad en niet het randgeval.
      //
      //    Gevolg was: "Het lukte niet" op een job die op `done` staat, de
      //    gebruiker drukt op Opnieuw, en dat is een tweede Anthropic-call en
      //    een tweede plek uit zijn dagquotum voor een antwoord dat al betaald
      //    en opgeslagen is. `kijk()` onderscheidt `done` van `failed` zelf.
      await werkJobAf(aanvraag.waarde.jobId);
    }

    void kijk(aanvraag.waarde.jobId);
  }

  /**
   * De waarde van `bezig` terwijl het hele plan wordt weggezet.
   *
   * ⚠️ `-1` en niet `null`, want `null` betekent "niets loopt er". Een aparte
   *    booleaanse vlag ernaast zou twee bronnen geven voor één toestand, en dan
   *    is de vraag welke van de twee de knoppen uitzet.
   */
  const ALLES = -1;

  /**
   * Het hele plan wegzetten — QS8-203.
   *
   * ⚠️ **Stap 1 wordt een weekdoel, de rest wordt plan.** Precies één rij in
   *    `weekly_goals`, en dus precies één verhoging van het puntenplafond. Zou
   *    dit alle stappen als weekdoel wegschrijven, dan is dit dezelfde knop die
   *    dit scherm bewust niet had.
   *
   * ⚠️ **Het weekdoel eerst en het plan daarna.** Er is geen transactie over
   *    twee tabellen heen — zelfde situatie als in `plan-toepassen.ts` (QS8-201)
   *    — dus er moet gekozen worden wat er overblijft als de tweede helft
   *    faalt. Een weekdoel zonder plan is een bruikbare week; een plan zonder
   *    weekdoel is een lijst waar niets uit inschuift tot de volgende cyclus.
   */
  async function neemPlanOver(voorstellen: readonly VoorstelWeekdoel[]) {
    if (klok === null || voorstellen.length === 0) return;
    setBezig(ALLES);
    setFout(null);

    // ⚠️ `[0]` met een expliciete controle en niet een destructurering die
    //    TypeScript als `VoorstelWeekdoel` leest. `noUncheckedIndexedAccess`
    //    staat aan en heeft gelijk: een lege lijst komt hier niet, maar dat
    //    weten we door de regel hierboven en niet door het type.
    const eersteStap = voorstellen[0];
    if (eersteStap === undefined) {
      setBezig(null);
      return;
    }
    const rest = voorstellen.slice(1);

    const eerste = await eersteCyclusVanDoel(doel.id, klok);
    const weekdoel = await maakWeekdoel(
      klok,
      {
        goal_id: doel.id,
        milestone_id: mijlpaal.id,
        title: eersteStap.title,
        floor_text: eersteStap.floor_text,
        ceiling_text: eersteStap.ceiling_text,
      },
      eerste,
    );

    if (!weekdoel.ok) {
      setBezig(null);
      setFout(weekdoel.melding);
      return;
    }

    if (rest.length > 0) {
      const plan = await maakWeekplan(
        doel.id,
        mijlpaal.id,
        rest.map((v) => ({
          title: v.title,
          floor_text: v.floor_text,
          ceiling_text: v.ceiling_text,
        })),
      );

      if (!plan.ok) {
        // ⚠️ Het weekdoel staat er wél. Dat zeggen is eerlijker dan alleen de
        //    fout tonen: anders drukt de gebruiker nog eens en heeft hij twee
        //    weekdoelen in dezelfde week — precies wat dit scherm voorkomt.
        setBezig(null);
        setPlanKlaar(true);
        setFout(plan.melding);
        return;
      }
    }

    setBezig(null);
    setPlanKlaar(true);
    setToegevoegd(new Set(voorstellen.map((_, i) => i)));
  }

  async function voegToe(voorstel: VoorstelWeekdoel, index: number) {
    if (klok === null) return;
    setBezig(index);
    setFout(null);

    // ⚠️ De cyclus wordt hier **niet** berekend. `maakWeekdoel()` doet dat uit de
    //    klok van de gebruiker (correctheidsregel 7); dit scherm stuurt hem
    //    nooit mee.
    const eerste = await eersteCyclusVanDoel(doel.id, klok);

    const uitkomst = await maakWeekdoel(
      klok,
      {
        goal_id: doel.id,
        milestone_id: mijlpaal.id,
        title: voorstel.title,
        floor_text: voorstel.floor_text,
        ceiling_text: voorstel.ceiling_text,
      },
      eerste,
    );

    setBezig(null);

    if (!uitkomst.ok) {
      // ⚠️ De fout blijft bij dit ene voorstel; de andere blijven bruikbaar. Een
      //    dagplafond of een invoerfout op één stap mag de rest niet meenemen.
      setFout(uitkomst.melding);
      return;
    }

    setToegevoegd((oud) => new Set([...oud, index]));
  }

  if (stand.fase === 'bezig') {
    return (
      <Card nested>
        <Subheading>{t('weekcoach.denkt_na')}</Subheading>
        <Body muted>{t('weekcoach.duurt_even')}</Body>
      </Card>
    );
  }

  if (stand.fase === 'mislukt') {
    return (
      <Card nested>
        <Subheading>{t('weekcoach.lukte_niet')}</Subheading>
        <Body muted>{stand.melding}</Body>

        {/*
          ⚠️ Een weg terug naar handmatig, en niet alleen een foutmelding.
             Zelfde eis als acceptatiecriterium 5 van QS8-38: een mijlpaal zonder
             weekstappen omdat de AI het liet afweten, is een mijlpaal waar je
             niet mee verder komt.
        */}
        <View style={styles.knoppen}>
          <Button variant="primair" onPress={() => router.replace(`/doel/${doel.id}`)}>
            {t('weekcoach.zelf_toevoegen')}
          </Button>
          <Button
            variant="stil"
            onPress={() => {
              const volgende = ronde + 1;
              setRonde(volgende);
              void start(volgende);
            }}
          >
            {t('weekcoach.opnieuw')}
          </Button>
        </View>
      </Card>
    );
  }

  if (stand.fase === 'klaar') {
    return (
      <View style={styles.blokken}>
        <Card nested>
          <Subheading>{t('weekcoach.voorstellen', { aantal: stand.voorstellen.length })}</Subheading>
          {/*
            ⚠️ Deze zin legde tot QS8-203 uit waarom er géén verzamelknop stond.
               Hij staat er nog, maar nu als uitleg bij de knop eronder: de
               stappen zijn nog steeds voor opeenvolgende weken, alleen hoef je er
               niet meer elke week voor terug te komen.
          */}
          <Body muted>{t('weekcoach.een_per_week')}</Body>

          {/*
            ⚠️ **De knop die tot 31-08-2026 met opzet niet bestond** — QS8-203,
               migratie 0137. De reden dat hij er niet was, is niet weggevallen:
               `maakWeekdoel()` zet nog steeds altijd de húidige cyclus, en zes
               weekdoelen in één week zijn nog steeds vijf minpunten. Wat er
               veranderd is, is dat er nu een plaats is voor een stap die nog géén
               weekdoel is. Alleen de eerste wordt er een; de rest wacht in
               `weekly_plan_steps` en telt nergens in mee.
          */}
          {planKlaar ? (
            <Caption>{t('weekplan.overgenomen')}</Caption>
          ) : (
            <>
              <Button
                variant="primair"
                block
                busy={bezig === ALLES}
                onPress={() => void neemPlanOver(stand.voorstellen)}
              >
                {t('weekplan.neem_over')}
              </Button>
              <Caption>{t('weekplan.neem_over_uitleg')}</Caption>
            </>
          )}
        </Card>

        {stand.voorstellen.map((voorstel, index) => (
          <Card key={`${voorstel.title}-${index}`} nested>
            <Subheading>{voorstel.title}</Subheading>
            <Body muted>{t('weekcoach.vloer', { tekst: voorstel.floor_text })}</Body>
            <Body muted>{t('weekcoach.plafond', { tekst: voorstel.ceiling_text })}</Body>

            {toegevoegd.has(index) ? (
              <Caption>{t('weekcoach.toegevoegd')}</Caption>
            ) : (
              <Button
                variant="secundair"
                block
                busy={bezig === index}
                onPress={() => void voegToe(voorstel, index)}
              >
                {t('weekcoach.voeg_toe')}
              </Button>
            )}
          </Card>
        ))}

        {fout === null ? null : <Caption danger>{fout}</Caption>}

        <View style={styles.knoppen}>
          <Button
            variant="stil"
            onPress={() => {
              const volgende = ronde + 1;
              setRonde(volgende);
              void start(volgende);
            }}
          >
            {t('weekcoach.opnieuw')}
          </Button>
          <Button variant="primair" onPress={() => router.replace(`/doel/${doel.id}`)}>
            {t('weekcoach.klaar')}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <Card nested>
      <Body muted>{t('weekcoach.wat_gebeurt_er')}</Body>
      <Button variant="primair" block onPress={() => void start()}>
        {t('weekcoach.genereer')}
      </Button>
      <Caption>{t('weekcoach.duurt_even')}</Caption>
    </Card>
  );
}

/**
 * De invoer van de job, als pure functie.
 *
 * ⚠️ **Een functie en geen inline object, zodat een test hem kan voeden.** De
 *    invoer is de cachesleutel (`md5(p_input::text)` in `vraag_ai_job()`), en
 *    twee eigenschappen ervan moeten kloppen: dezelfde vraag binnen een dag
 *    hergebruikt het antwoord, en "opnieuw" moet een ánder antwoord kunnen
 *    opleveren. Allebei zijn ze te toetsen zolang dit een functie is.
 *
 * ⚠️ **`mijlpaal_id` moet erin.** Zonder dat veld delen twee mijlpalen met
 *    dezelfde titel binnen hetzelfde etmaal één antwoord.
 *
 * ⚠️ **`streefdatum` is die van de mijlpaal**, en pas als die er niet is die van
 *    het doel. Dat veld voedt `tijdsbestek()` in de Edge Function, en dat rekent
 *    de weken uit die in de prompt komen — het model rekent slecht met datums.
 *    Let op: `streefdatum` betekent in een weekdoel-job dus iets anders dan in
 *    een mijlpaal-job, en dat is bewust: het rekenwerk is identiek.
 *
 * ⚠️ **`poging` alleen vanaf ronde 1.** De eerste vraag houdt dezelfde hash als
 *    een eerdere sessie, zodat de cache doet wat hij moet doen. Zonder variatie
 *    daarna geeft `vraag_ai_job()` netjes hetzelfde antwoord terug en lijkt de
 *    knop "opnieuw" stuk.
 */
export function invoerVoor(
  doel: { readonly id: string; readonly title: string; readonly target_date: string },
  mijlpaal: Mijlpaal,
  antwoorden: InterviewInvoer | null,
  ronde: number,
): Record<string, unknown> {
  return {
    doel: doel.title,
    streefdatum: mijlpaal.target_date ?? doel.target_date,
    mijlpaal: {
      id: mijlpaal.id,
      titel: mijlpaal.title,
      ...(mijlpaal.target_date === null ? {} : { streefdatum: mijlpaal.target_date }),
    },
    ...(ronde === 0 ? {} : { poging: ronde }),
    ...(antwoorden !== null && heeftAntwoorden(antwoorden)
      ? { interview: schoon(antwoorden) }
      : {}),
  };
}

/** Alleen ingevulde antwoorden: een `null` zegt het model niets en verandert wél de hash. */
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

interface Geladen {
  readonly doel: DoelMetVoortgang | null;
  readonly mijlpaal: Mijlpaal | null;
  readonly antwoorden: InterviewInvoer | null;
}

async function laad(goalId: string, mijlpaalId: string | null): Promise<Geladen> {
  const [doel, mijlpalen, interview] = await Promise.all([
    fetchDoel(goalId),
    fetchMijlpalen(goalId),
    fetchInterview(goalId),
  ]);

  // ⚠️ De mijlpaal komt uit de lijst van dít doel en niet uit een eigen query.
  //    Dat scheelt geen verzoek maar het maakt "hoort deze mijlpaal bij dit
  //    doel" een eigenschap van de data in plaats van een extra controle.
  const mijlpaal = mijlpaalId === null ? null : (mijlpalen.find((m) => m.id === mijlpaalId) ?? null);

  return { doel, mijlpaal, antwoorden: interview?.antwoorden ?? null };
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap },
  knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 3, alignItems: 'center' },
});
