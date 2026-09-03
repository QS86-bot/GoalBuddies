import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useProfiel, useSession, userClock } from '@/modules/auth';
import {
  beslissendeGroep,
  fetchGroepenVanDoel,
  fetchMijnGroepen,
  koppelbareGroepen,
  koppelDoelAanGroep,
  ontkoppelDoelVanGroep,
  stuurBericht,
  zichtbaarheidLabels,
  type DoelGroep,
  type Groep,
  type Resultaat,
} from '@/modules/buddies';
import {
  fetchCommitments,
  fetchCommitmentSpoor,
  isOpenstaand,
  spoorLabels,
  tekstVoor,
  trekIn,
  zetBeloning,
  zetStraf,
  type Commitment,
} from '@/modules/commitments';
import {
  annuleerAdempauze,
  ARGUMENT_MAX,
  ARGUMENT_MIN,
  categorieLabels,
  eersteCyclusVanDoel,
  fetchAdempauzes,
  fetchDoel,
  fetchLaatsteBesluit,
  fetchMijlpalen,
  fetchOpenVerzoek,
  fetchRisico,
  fetchWeekplan,
  herordenMijlpalen,
  herordenWeekplan,
  dagenUitKeuze,
  dagopties,
  GEEN_DAGEN,
  leesRitme,
  maakMijlpaal,
  maakWeekdoel,
  planAdempauze,
  planbareCycli,
  RITMES,
  ritmeLabels,
  ritmeUitleg,
  trekDeadlineVerzoekIn,
  startWeekplanstapNu,
  verplaats,
  verwijderDoel,
  verwijderMijlpaal,
  verwijderWeekplanstap,
  vraagDeadlineVerschuiving,
  rondDoelAf,
  zetArchief,
  wijzigMijlpaal,
  zetMijlpaalStatus,
  zetStreefdatum,
  type Adempauze,
  type Categorie,
  type DeadlineVerzoek,
  type DoelMetVoortgang,
  type Mijlpaal,
  type Risico,
  type Ritme,
} from '@/modules/goals';
import { opmaaktaal, t } from '@/shared/i18n';
import { telTekens } from '@/shared/tekst';
import { space } from '@/shared/theme';
import {
  addDays,
  apparaatTijdzone,
  localDateIn,
  nextCycle,
  now,
  toonDatum,
  toonMoment,
  type IsoDate,
  type UserClock,
  type Weekday,
} from '@/shared/time';
import {
  AsyncView,
  bevestigingen,
  Bevestiging,
  Body,
  Button,
  Caption,
  CategorieMerk,
  Card,
  Choice,
  DatumKeuze,
  Field,
  HULPVRAAG_MAX,
  hulpvraagVoorstel,
  MilestoneProgress,
  RisicoBadge,
  risicoUitleg,
  Screen,
  Subheading,
  useHulpvraagVerborgen,
  useAsync,
  useAsyncMetTerugval,
  Weekplanblok,
} from '@/shared/ui';

/**
 * De lege terugval voor `useAsyncMetTerugval` — QS8-219.
 *
 * ⚠️ **Een constante en geen `[]` op de aanroepplek.** Een literaal is elke
 *    render een nieuwe array; die hook houdt de terugval daarom buiten `deps`,
 *    en dan hoort de waarde ook echt constant te zijn.
 */
const LEGE_MIJLPALEN: readonly Mijlpaal[] = [];

/**
 * ⚠️ De waarde die "geen mijlpaal" betekent in de keuzelijst. Een lege string
 *    zou hier niet werken: `Choice` gebruikt de waarde als sleutel, en leeg is
 *    niet te onderscheiden van "nog niets gekozen".
 */
const LOS_VAN_MIJLPAAL = 'los';

/**
 * Eén doel: voortgang, deadline verzetten, archiveren, beloning en straf.
 *
 * ⚠️ De id in de URL geeft geen toegang. Wie hier komt zonder recht op dit doel,
 *    krijgt van de database nul rijen — RLS bepaalt dat, niet dit scherm. "Niet
 *    gevonden" en "mag je niet zien" tonen daarom hetzelfde: het verschil
 *    verraadt dat het doel bestaat.
 */
export default function DoelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [doel, setDoel] = useState<DoelMetVoortgang | null>(null);
  const [commitments, setCommitments] = useState<readonly Commitment[]>([]);
  const [groepen, setGroepen] = useState<readonly Groep[]>([]);
  const [doelGroepen, setDoelGroepen] = useState<readonly DoelGroep[]>([]);
  const [verzoek, setVerzoek] = useState<DeadlineVerzoek | null>(null);
  const [besluit, setBesluit] = useState<DeadlineVerzoek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    if (!id) return;
    let levend = true;

    Promise.all([
      fetchDoel(id),
      fetchCommitments(id),
      fetchMijnGroepen(),
      fetchGroepenVanDoel(id),
      fetchOpenVerzoek(id),
      fetchLaatsteBesluit(id),
    ])
      .then(([gevonden, vastgelegd, mijnGroepen, gekoppeld, lopend, laatste]) => {
        if (!levend) return;
        setDoel(gevonden);
        setCommitments(vastgelegd);
        setGroepen(mijnGroepen);
        setDoelGroepen(gekoppeld);
        setVerzoek(lopend);
        setBesluit(laatste);
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
  }, [id, ronde]);

  // ⚠️ Apart opgehaald en apart falend: de Risico-radar is een blok op dit
  //    scherm, en een storing daarin hoort het doel zelf niet mee te slepen.
  //    Staat hier en niet in het radarblok, omdat de hulpvraag-kaart (QS8-95)
  //    dezelfde stand nodig heeft — twee keer ophalen zou twee keer hetzelfde
  //    verzoek zijn.
  const risico = useAsyncMetTerugval(id ? () => fetchRisico(id) : null, null, [id, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);
  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;
  const klok = profiel ? userClock(profiel) : null;

  return (
    <Screen title={t('doelscherm.titel')} terug={{ naar: '/doelen' }}>
      <AsyncView
        loading={loading}
        error={error}
        data={doel ?? undefined}
        isEmpty={() => false}
        onRetry={herlaad}
        empty={{
          title: t('doelscherm.leeg_titel'),
          body: t('doelscherm.leeg_body'),
        }}
      >
        {(d) => (
          <View style={styles.blokken}>
            <Card>
              <Subheading>{d.title}</Subheading>
              {/*
                ⚠️ Het gebied krijgt zijn eigen merk (QS8-255) en staat daarom
                   niet meer in dezelfde zin als de streefdatum: één zin met een
                   pictogram er middenin leest slechter dan twee elementen naast
                   elkaar, en een schermlezer zou het icoon dan tussen twee
                   woorden aantreffen.
              */}
              <View style={styles.kopregel}>
                <CategorieMerk
                  categorie={d.category ?? 'other'}
                  label={categorieLabels()[(d.category ?? 'other') as Categorie]}
                />
                <Caption>{t('doelscherm.streefdatum', { datum: toonDatum(d.target_date ?? '', opmaaktaal()) })}</Caption>
              </View>

              {d.identity_statement ? (
                <Body muted>&ldquo;{d.identity_statement}&rdquo;</Body>
              ) : null}
              {d.description ? <Body muted>{d.description}</Body> : null}

              <MilestoneProgress
                done={d.milestones_done ?? 0}
                total={d.milestones_total ?? 0}
              />
              <Caption>
                {t('doelscherm.weekdoelen_afgerond', {
                  gedaan: d.weekly_approved ?? 0,
                  totaal: d.weekly_total ?? 0,
                })}
              </Caption>

              {/*
                ⚠️ De knop bij `wijzigDoel()`, die tot 28-08 ontbrak. De functie
                   stond er sinds QS8-106 met nul aanroepers, dus een typefout in
                   een doeltitel was permanent. De streefdatum zit er bewust niet
                   in — die verschuif je hieronder via `DeadlineVerzetten` (A7).
              */}
              <Button variant="stil" onPress={() => router.push(`/doel/bewerk/${d.id}`)}>
                {t('doelbewerken.knop')}
              </Button>
            </Card>

            <GedeeldMet
              goalId={d.id}
              gekoppeld={doelGroepen}
              mijnGroepen={groepen}
              onKlaar={herlaad}
            />

            {vandaag && klok ? (
              <DeadlineVerzetten
                doel={d}
                vandaag={vandaag}
                startDag={klok.weekStartDay}
                groepen={doelGroepen}
                verzoek={verzoek}
                besluit={besluit}
                onKlaar={herlaad}
              />
            ) : null}

            <Risicoradar risico={risico} />

            <Herplannen
              risico={risico}
              heeftStraf={commitments.some((c) => c.type === 'penalty' && c.status !== 'cancelled')}
            />

            <HulpVragen doel={d} risico={risico} groepen={doelGroepen} userId={userId} />

            <Mijlpalen
              doel={d}
              onKlaar={herlaad}
              onCoach={() => router.push(`/doel/coach/${d.id}`)}
            />

            {/*
              ⚠️ Onder de mijlpalen en bóven "weekdoel toevoegen" — QS8-203. Dat
                 is de leesvolgorde van het scherm: de mijlpalen zijn het doel
                 opgeknipt, het plan is de eerstvolgende weken daarvan, en pas
                 daaronder maak je er zelf een. Staat het plan eronder, dan maakt
                 de gebruiker een weekdoel dat er de volgende cyclus alsnog bij
                 komt.
            */}
            <Weekplan doel={d} klok={klok} onKlaar={herlaad} />

            <WeekdoelToevoegen doel={d} klok={klok} onKlaar={herlaad} />

            <Adempauzes
              doel={d}
              klok={klok}
              gedeeld={doelGroepen.length > 0}
              onKlaar={herlaad}
            />

            {userId ? <Afronden doel={d} userId={userId} onKlaar={herlaad} /> : null}

            <Beloning
              goalId={d.id}
              bestaand={commitments.find((c) => c.type === 'reward')}
              onKlaar={herlaad}
            />

            <Straf
              goalId={d.id}
              groepen={groepen}
              bestaand={commitments.find((c) => c.type === 'penalty')}
              onKlaar={herlaad}
            />

            {userId ? <Archiveren doel={d} userId={userId} onKlaar={herlaad} /> : null}

            {/*
              Na het weggooien bestaat dit scherm niet meer — herladen zou een
              "niet gevonden" opleveren op een doel dat je zelf net hebt
              weggegooid. Terug naar de lijst is het enige zinnige vervolg.
            */}
            <Weggooien doel={d} onWeg={() => router.replace('/doelen')} />
          </View>
        )}
      </AsyncView>

      {/*
        ⚠️ Buiten de `AsyncView` — QS8-211. Staat de uitgang binnen de data-tak,
           dan is hij er precies niet in de twee toestanden waarin je hem het
           hardst nodig hebt: aan het laden en na een fout. Dit scherm heeft geen
           tabbalk onder zich, dus dan is er niets.
      */}
      <Button variant="stil" block onPress={() => router.replace('/')}>
        {t('nav.naar_overzicht')}
      </Button>
    </Screen>
  );
}

/**
 * De deadline verzetten — QS8-32, en sinds Q-TODO A7 met twee routes.
 *
 * ⚠️ Deel je dit doel met een groep, dan verschuif je de datum niet alleen. Je
 *    dient een verzoek in met een argument, en een ander lid beslist. Deel je
 *    het met niemand, dan is er niemand om iets aan te vragen en zet je hem
 *    gewoon.
 *
 *    Het onderscheid wordt niet hier gemaakt maar in de database: `target_date`
 *    is sinds migratie 0032 niet meer client-schrijfbaar, en `zet_streefdatum()`
 *    weigert zodra het doel aan een groep hangt. Dit scherm kiest alleen welk
 *    formulier je ziet.
 *
 * ⚠️ Loopt er al een verzoek, dan staat dat er en kun je geen tweede indienen.
 *    Tien verzoeken openzetten tot er eentje langskomt die ja zegt, is het
 *    tegenovergestelde van een argument indienen; er staat ook een unieke index
 *    op.
 */
function DeadlineVerzetten({
  doel,
  vandaag,
  startDag,
  groepen,
  verzoek,
  besluit,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly vandaag: IsoDate;
  /** De week-startdag uit het profiel — `DatumKeuze` verzint hem nooit zelf. */
  readonly startDag: Weekday;
  readonly groepen: readonly DoelGroep[];
  readonly verzoek: DeadlineVerzoek | null;
  readonly besluit: DeadlineVerzoek | null;
  readonly onKlaar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [datum, setDatum] = useState(doel.target_date ?? '');
  const [argument, setArgument] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const gedeeld = groepen.length > 0;

  /**
   * ⚠️ **De keuze wordt niet hier bedacht maar in `beslissendeGroep()`, en dat is
   *    de hele reden dat die functie bestaat.** Tot QS8-56 stond hier
   *    `groepen[0]`: het verzoek ging naar de eerste groep uit de lijst, en die
   *    lijst had niet eens een `order by`. Welke dat was, beloofde Postgres niet.
   *
   *    De regel staat in `modules/buddies/deling.ts` omdat een regel in een
   *    component alleen te toetsen is door het component te renderen of door in de
   *    broncode naar een letterlijke regel te grijpen — en dat tweede is precies
   *    de testvorm die bij QS8-85 stilletjes ophield iets te bewaken.
   *
   * ⚠️ **De keuze wordt opgeslagen als losse id en niet als groep.** Ontkoppel je
   *    de gekozen groep in het blok hierboven, dan geeft `beslissendeGroep()`
   *    `undefined` terug en staat de verstuurknop uit — in plaats van dat het
   *    verzoek stilzwijgend naar een ándere groep verhuist.
   */
  const [groepId, setGroepId] = useState('');
  const groep = beslissendeGroep(groepen, groepId);
  const kiesbaar = groepen.length > 1;
  const magVersturen = !gedeeld || groep !== undefined;

  async function trekIn() {
    if (verzoek === null) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await trekDeadlineVerzoekIn(verzoek.id);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onKlaar();
  }

  async function bewaar() {
    setBezig(true);
    setFout(null);

    // ⚠️ Niet `groep?.group_id ?? ''`. Een lege id stuurde het verzoek naar de
    //    server om daar op `not_linked` af te ketsen, en de gebruiker las een
    //    storingsmelding waar hij een keuze had moeten maken.
    if (gedeeld && groep === undefined) {
      setFout(t('deling.kies_eerst'));
      setBezig(false);
      return;
    }

    const uitkomst = groep
      ? await vraagDeadlineVerschuiving(
          doel.id,
          groep.group_id,
          { new_date: datum, reason: argument },
          vandaag,
        )
      : await zetStreefdatum(doel.id, datum, vandaag);

    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setOpen(false);
      setArgument('');
      onKlaar();
    }
    setBezig(false);
  }

  // ⚠️ Een lopend verzoek is geen wachtkamer maar een stand van zaken: je ziet
  //    wat je gevraagd hebt en wat je erbij geschreven hebt. Zonder dit is
  //    "verzonden" het laatste wat je hoort.
  //
  // ⚠️ Mét een knop om het in te trekken. Zonder die knop is een buddy die niet
  //    reageert een blokkade zonder uitweg: er kan geen tweede verzoek open
  //    staan, dus je streefdatum ligt vast tot iemand toevallig kijkt.
  if (verzoek !== null) {
    return (
      <Card nested>
        <Subheading>{t('deadline.verzoek_loopt')}</Subheading>
        <Body>
          {t('deadline.verzoek_uitleg', { oud: verzoek.old_date, nieuw: verzoek.new_date })}
        </Body>
        <Card nested>
          <Body muted>&ldquo;{verzoek.reason}&rdquo;</Body>
        </Card>
        <Caption>{t('deadline.buddy_beslist')}</Caption>
        <Button variant="stil" busy={bezig} onPress={() => void trekIn()}>
          {t('deadline.verzoek_intrekken')}
        </Button>
        {fout === null ? null : <Caption danger>{fout}</Caption>}
      </Card>
    );
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>{t('deadline.kop')}</Subheading>

        {/*
          ⚠️ Een afgewezen verzoek moet je te zien krijgen. Zonder dit verdwijnt
             het gewoon van je scherm zodra iemand "Liever niet" kiest, staat er
             weer een leeg formulier alsof je nooit iets gevraagd hebt, en typ je
             het een tweede keer zonder te weten dat er al nee gezegd is.

             Dit staat uitsluitend op je eigen doelscherm. Een lijst met
             afgewezen verzoeken vóór de groep zou precies het tegenslagsignaal
             over een ander zijn dat domeinregel 7 verbiedt.
        */}
        {besluit === null ? null : (
          <Card nested>
            <Body>
              {besluit.status === 'approved'
                ? t('deadline.akkoord', { datum: toonDatum(besluit.new_date, opmaaktaal()) })
                : t('deadline.afgewezen')}
            </Body>
            {besluit.decision_note === null ? null : (
              <Body muted>&ldquo;{besluit.decision_note}&rdquo;</Body>
            )}
            {besluit.status === 'rejected' ? (
              <Caption>{t('deadline.opnieuw_vragen')}</Caption>
            ) : null}
          </Card>
        )}

        <Body muted>
          {gedeeld ? t('deadline.gedeeld_uitleg') : t('deadline.alleen_uitleg')}
        </Body>
        <Button onPress={() => setOpen(true)}>
          {gedeeld ? t('deadline.vraag_knop') : t('deadline.verzet_knop')}
        </Button>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>{t('deadline.nieuwe_datum')}</Subheading>
      {/*
        ⚠️ Een kalender en geen tekstveld — QS8-223. `min` is morgen en niet
           vandaag: `zetStreefdatum()` eist een datum in de toekomst, en die
           grens hoort een dag te zijn die je niet kunt aantikken in plaats van
           een melding achteraf.
      */}
      <DatumKeuze
        label={t('deadline.datum_label')}
        waarde={datum}
        onKies={setDatum}
        startDag={startDag}
        vandaag={vandaag}
        min={addDays(vandaag, 1)}
      />

      {kiesbaar ? (
        <Choice
          label={t('deling.welke_groep')}
          hint={t('deling.welke_groep_hint')}
          opties={groepen.map((g) => ({ waarde: g.group_id, label: g.name }))}
          waarde={groepId}
          onKies={setGroepId}
        />
      ) : null}

      {gedeeld ? (
        <>
          {/*
            ⚠️ "Wat is er veranderd" en niet "waarom haal je het niet". De vraag
               gaat over de omstandigheid en niet over de persoon — dezelfde
               toon als vraag 2 van de weekafsluiting, en om dezelfde reden.
          */}
          <Field
            label={t('deadline.wat_veranderd')}
            hint={t('deadline.wat_veranderd_hint', {
              groep: groep?.name ?? t('deadline.jouw_groep'),
            })}
            value={argument}
            onChangeText={setArgument}
            multiline
            maxLength={ARGUMENT_MAX}
            placeholder={t('deadline.argument_voorbeeld')}
          />
          {/*
            ⚠️ `telTekens()` en niet `.length` — QS8-118. De teller moet in
               dezelfde eenheid tellen als de grens die hem afdwingt, anders
               zegt hij "Lang genoeg" op een ander moment dan het schema en de
               database. Met emoji scheelde dat een factor twee.
          */}
          <Caption>
            {telTekens(argument.trim()) < ARGUMENT_MIN
              ? t('deadline.nog_tekens', { aantal: ARGUMENT_MIN - telTekens(argument.trim()) })
              : t('deadline.lang_genoeg')}
          </Caption>
        </>
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <View style={styles.knoppen}>
        <Button
          variant="primair"
          busy={bezig}
          disabled={!magVersturen}
          onPress={() => void bewaar()}
        >
          {gedeeld ? t('deadline.versturen') : t('deadline.vastleggen')}
        </Button>
        <Button variant="stil" onPress={() => setOpen(false)}>
          {t('deadline.annuleren')}
        </Button>
      </View>
    </Card>
  );
}

/** De beloning — QS8-34. Voor jezelf, dus geen groep en geen bevestigingsstap. */
function Beloning({
  goalId,
  bestaand,
  onKlaar,
}: {
  readonly goalId: string;
  readonly bestaand: Commitment | undefined;
  readonly onKlaar: () => void;
}) {
  const { profiel } = useProfiel();
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (bestaand) {
    // ⚠️ De uitleg komt uit `tekstVoor()` en staat niet hier. Dat is geen
    //    netheid: de toon bij een straf die afgegaan is, is een
    //    acceptatiecriterium van QS8-84, en teksten die verspreid door schermen
    //    staan, lopen uit elkaar zodra er een tweede scherm bijkomt.
    const stand = tekstVoor(bestaand);

    return (
      <Card>
        <Subheading>{t('beloning.jouw')}</Subheading>
        <Body>{bestaand.body}</Body>
        <Caption>{t('commitment.stand', { titel: stand.titel, uitleg: stand.uitleg })}</Caption>
        <Caption>
          {/*
            ⚠️ **In de zone van de lézer en niet in UTC.** Hier stond
               `confirmed_at.slice(0, 10)`, en dat is de UTC-dag: wie in Los
               Angeles om 17:00 een commitment vastlegt, zag daar de dag erna
               staan. Een datum bij een afspraak die een consequentie draagt
               (domeinregel 5) hoort te kloppen.
          */}
          {t('beloning.vastgelegd_op', {
            datum: toonMoment(bestaand.confirmed_at, profiel?.tz ?? apparaatTijdzone(), opmaaktaal()),
          })}
        </Caption>
        <Spoor commitmentId={bestaand.id} />
      </Card>
    );
  }

  async function bewaar() {
    setBezig(true);
    setFout(null);
    const uitkomst = await zetBeloning(goalId, { body: tekst, image_url: null });
    if (!uitkomst.ok) setFout(uitkomst.melding);
    else onKlaar();
    setBezig(false);
  }

  return (
    <Card>
      <Subheading>{t('beloning.kop')}</Subheading>
      <Body muted>{t('beloning.uitleg')}</Body>
      {/*
        ⚠️ QS8-85: dit moet er letterlijk staan. Iemand die een bedrag invult,
           hoort niet te hoeven raden of de app zijn rekening gaat plunderen.
           Er staat een test op deze zin.
      */}
      <Caption>{t('commitment.geen_afrekening')}</Caption>
      <Field
        label={t('beloning.veld')}
        value={tekst}
        onChangeText={setTekst}
        placeholder={t('beloning.voorbeeld')}
      />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Button busy={bezig} onPress={() => void bewaar()}>
        {t('beloning.vastleggen')}
      </Button>
    </Card>
  );
}

/**
 * Met welke groepen dit doel gedeeld wordt — QS8-56 (PRD 5.5).
 *
 * ⚠️ **Dit blok voegt geen recht toe, het maakt een bestaand recht zichtbaar.**
 *    `goal_group_links` heeft sinds migratie 0001 een samengestelde sleutel
 *    `(goal_id, group_id)`, dus twee groepen per doel kon altijd al. Ook het
 *    groepsscherm stond het al toe: `KoppelDoel` filtert alleen op de koppelingen
 *    van díé groep, dus wie in twee groepen achter elkaar hetzelfde doel koos,
 *    had het. Wat ontbrak was de kant van het doel — nergens stond wat je met wie
 *    deelt, en dus kon je het ook niet overzien of terugdraaien zonder eerst naar
 *    elk groepsscherm apart te lopen.
 *
 * ⚠️ **Elke groep is een aparte toestemming, en dat is waarom er per rij een
 *    ontkoppelknop staat en niet één "stop met delen".** Ontkoppelen van A hoort
 *    B ongemoeid te laten; dat is de belofte die de RLS ook maakt
 *    (`goal_group_links_delete` kijkt naar één rij) en die dit scherm niet mag
 *    versimpelen.
 *
 * ⚠️ **De zin over wat je deelt staat per groep en niet boven de lijst.** Een
 *    doel mag tegelijk in een open en een beschermde groep staan — EPIC 13 toetst
 *    precies die stand — en dan is één zin boven de lijst voor de helft onwaar.
 *    Dat is exact de fout die de critical-user-ronde van 24-08 vond bij
 *    `koppel.uitleg`, alleen op een ander scherm.
 */
function GedeeldMet({
  goalId,
  gekoppeld,
  mijnGroepen,
  onKlaar,
}: {
  readonly goalId: string;
  readonly gekoppeld: readonly DoelGroep[];
  readonly mijnGroepen: readonly Groep[];
  readonly onKlaar: () => void;
}) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const koppelbaar = koppelbareGroepen(mijnGroepen, gekoppeld);
  const labels = zichtbaarheidLabels();

  async function voer(groupId: string, handeling: () => Promise<Resultaat<true>>) {
    setBezig(groupId);
    setFout(null);

    const uitkomst = await handeling();
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onKlaar();
  }

  return (
    <Card>
      <Subheading>{t('deling.kop')}</Subheading>
      <Body muted>{t('deling.uitleg')}</Body>

      {gekoppeld.length === 0 ? (
        <Body muted>{t('deling.nergens')}</Body>
      ) : (
        gekoppeld.map((groep) => (
          <Card nested key={groep.group_id}>
            <Subheading>{groep.name}</Subheading>
            <Caption>{labels[groep.zichtbaarheid]}</Caption>
            <Body muted>
              {groep.zichtbaarheid === 'open'
                ? t('deling.uitleg_open')
                : t('deling.uitleg_beschermd')}
            </Body>
            <Button
              variant="stil"
              busy={bezig === groep.group_id}
              disabled={bezig !== null && bezig !== groep.group_id}
              onPress={() =>
                void voer(groep.group_id, () => ontkoppelDoelVanGroep(goalId, groep.group_id))
              }
            >
              {t('koppel.ontkoppel')}
            </Button>
          </Card>
        ))
      )}

      {/*
        ⚠️ Drie uitkomsten en alle drie hebben een eigen zin. "Geen groepen" en
           "al je groepen hebben het al" zien er zonder tekst identiek uit — een
           lege ruimte — terwijl het tegenovergestelde antwoorden zijn op de vraag
           waarom je hier niets kunt.
      */}
      <Subheading>{t('deling.koppel_kop')}</Subheading>

      {mijnGroepen.length === 0 ? (
        <Body muted>{t('deling.geen_groepen')}</Body>
      ) : koppelbaar.length === 0 ? (
        <Body muted>{t('deling.overal')}</Body>
      ) : (
        koppelbaar.map((groep) => (
          <Card nested key={groep.group_id}>
            <Subheading>{groep.name}</Subheading>
            <Caption>{labels[groep.zichtbaarheid]}</Caption>
            <Body muted>
              {groep.zichtbaarheid === 'open'
                ? t('deling.uitleg_open')
                : t('deling.uitleg_beschermd')}
            </Body>
            <Button
              busy={bezig === groep.group_id}
              disabled={bezig !== null && bezig !== groep.group_id}
              onPress={() =>
                void voer(groep.group_id, () => koppelDoelAanGroep(goalId, groep.group_id))
              }
            >
              {t('deling.koppel', { naam: groep.name })}
            </Button>
          </Card>
        ))
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * De straf — QS8-35.
 *
 * ⚠️ Domeinregel 5: nooit stilzwijgend geactiveerd. Er zit daarom een aparte
 *    bevestigingsstap tussen, waarin de consequentie letterlijk uitgeschreven
 *    staat. Eén knop die meteen vastlegt zou de regel technisch halen en
 *    inhoudelijk breken.
 *
 * ⚠️ De keuzelijst toont alleen groepen waar je lid van bent. Dat is
 *    gebruiksgemak — de echte grens ligt in `commitments_insert` (migratie 0006).
 */
function Straf({
  goalId,
  groepen,
  bestaand,
  onKlaar,
}: {
  readonly goalId: string;
  readonly groepen: readonly Groep[];
  readonly bestaand: Commitment | undefined;
  readonly onKlaar: () => void;
}) {
  const [tekst, setTekst] = useState('');
  const [groepId, setGroepId] = useState(groepen[0]?.id ?? '');
  const [bevestigen, setBevestigen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  if (bestaand) {
    const stand = tekstVoor(bestaand);
    const magIntrekken = isOpenstaand(bestaand);

    return (
      <Card>
        <Subheading>{t('straf.jouw')}</Subheading>
        <Body>{bestaand.body}</Body>
        <Caption>{t('commitment.stand', { titel: stand.titel, uitleg: stand.uitleg })}</Caption>
        {/*
          ⚠️ De knop verdwijnt zodra de straf verschuldigd is, en dat is geen
             cosmetiek: `commitments_update` weigert het dan sowieso (0057). Een
             knop tonen die de server afwijst, leert iemand alleen dat de app
             onbetrouwbaar is — en hier is het juist de bedoeling dat je merkt
             dat je er niet meer onderuit komt.
        */}
        {magIntrekken ? (
          <Button
            variant="stil"
            onPress={() => {
              void trekIn(bestaand.id).then(onKlaar);
            }}
          >
            {t('straf.intrekken')}
          </Button>
        ) : null}
        <Spoor commitmentId={bestaand.id} />
      </Card>
    );
  }

  if (groepen.length === 0) {
    return (
      <Card nested>
        <Subheading>{t('straf.kop')}</Subheading>
        <Body muted>{t('straf.geen_groep')}</Body>
      </Card>
    );
  }

  const gekozenGroep = groepen.find((g) => g.id === groepId);

  async function bewaar() {
    setBezig(true);
    setFout(null);
    const uitkomst = await zetStraf(goalId, { body: tekst, image_url: null }, groepId);
    if (!uitkomst.ok) setFout(uitkomst.melding);
    else {
      setBevestigen(false);
      onKlaar();
    }
    setBezig(false);
  }

  if (bevestigen) {
    return (
      <Card>
        <Subheading>{t('straf.zeker')}</Subheading>
        <Body>
          {t('straf.bevestig_uitleg', {
            groep: gekozenGroep?.name ?? t('straf.jouw_groep'),
          })}
        </Body>
        <Body muted>{t('straf.dan_geldt', { tekst })}</Body>
        <Caption>{t('straf.tot_dan')}</Caption>
        {fout === null ? null : <Caption danger>{fout}</Caption>}
        <View style={styles.knoppen}>
          <Button variant="primair" busy={bezig} onPress={() => void bewaar()}>
            {t('straf.ja_vastleggen')}
          </Button>
          <Button variant="stil" onPress={() => setBevestigen(false)}>
            {t('straf.terug')}
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Subheading>{t('straf.kop')}</Subheading>
      <Body muted>{t('straf.uitleg')}</Body>
      <Caption>{t('straf.geen_geld')}</Caption>

      <Field
        label={t('straf.veld')}
        value={tekst}
        onChangeText={setTekst}
        placeholder={t('straf.voorbeeld')}
      />

      <Choice
        label={t('straf.welke_groep')}
        opties={groepen.map((g) => ({ waarde: g.id, label: g.name }))}
        waarde={groepId}
        onKies={setGroepId}
      />

      <Button disabled={tekst.trim().length < 3} onPress={() => setBevestigen(true)}>
        {t('straf.verder')}
      </Button>
    </Card>
  );
}

/**
 * Een doel afronden — QS8-83.
 *
 * ⚠️ **Dit is het moment waar EPIC 9 op wachtte.** Vóór migratie 0057 kon een
 *    doel nooit `completed` worden, en dus kwam er ook nooit een beloning vrij.
 *
 * ⚠️ Onomkeerbaar, met een bevestiging die zegt wát het kost — dezelfde eis als
 *    bij afsluiten en weggooien (QS8-106). De tekst staat in `BEVESTIGING` en
 *    staat daar onder test.
 *
 * ⚠️ De knop verschijnt niet zolang er een mijlpaal openstaat. De server weigert
 *    het dan óók (`open_milestones`), en dat is de echte grens; dit is het
 *    vriendelijke gezicht ervan. Dat er dan een uitleg staat in plaats van niets,
 *    is met opzet: "de knop is er niet" laat iemand raden waarom.
 */
function Afronden({
  doel,
  userId,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly userId: string;
  readonly onKlaar: () => void;
}) {
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const open = (doel.milestones_total ?? 0) - (doel.milestones_done ?? 0);

  if (doel.status === 'completed') {
    return (
      <Card>
        <Subheading>{t('afronden.afgerond')}</Subheading>
        <Body muted>{t('afronden.afgerond_uitleg')}</Body>
      </Card>
    );
  }

  // Gearchiveerd: eerst terughalen. De server zegt hetzelfde (`not_active`).
  if (doel.status !== 'active') return null;

  async function rond() {
    setBezig(true);
    setFout(null);

    const uitkomst = await rondDoelAf(doel.id, userId);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setVraagt(false);
    onKlaar();
  }

  if (vraagt) {
    return (
      <Bevestiging
        tekst={bevestigingen().doelAfronden}
        bezig={bezig}
        fout={fout}
        onBevestig={() => void rond()}
        onAnnuleer={() => {
          setVraagt(false);
          setFout(null);
        }}
      />
    );
  }

  if (open > 0) {
    return (
      <Card nested>
        <Subheading>{t('afronden.kop')}</Subheading>
        <Body muted>
          {open === 1 ? t('afronden.een_open') : t('afronden.meer_open', { aantal: open })}
        </Body>
      </Card>
    );
  }

  return (
    <Card>
      <Subheading>{t('afronden.kop')}</Subheading>
      <Body muted>{t('afronden.alles_af')}</Body>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Button
        onPress={() => setVraagt(true)}
        accessibilityLabel={t('afronden.knop_label', { titel: doel.title ?? '' })}
      >
        {t('afronden.knop')}
      </Button>
    </Card>
  );
}

/** Archiveren — QS8-32. Omkeerbaar, en dat verschil moet zichtbaar zijn. */
function Archiveren({
  doel,
  userId,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly userId: string;
  readonly onKlaar: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const gearchiveerd = doel.status === 'archived';

  async function schakel() {
    setBezig(true);
    await zetArchief(doel.id, userId, !gearchiveerd);
    setBezig(false);
    onKlaar();
  }

  return (
    <Card nested>
      <Subheading>{gearchiveerd ? t('archief.terughalen_kop') : t('archief.kop')}</Subheading>
      <Body muted>{gearchiveerd ? t('archief.terughalen_uitleg') : t('archief.uitleg')}</Body>
      <Button busy={bezig} onPress={() => void schakel()}>
        {gearchiveerd ? t('archief.terughalen') : t('archief.archiveren')}
      </Button>
    </Card>
  );
}

/**
 * Herplannen bij een onhaalbare deadline — QS8-96.
 *
 * ⚠️ Dit is het moment waarop mensen apps als deze weggooien: het doel is dood,
 *    de app blijft herinneringen sturen, en de gebruiker verwijdert hem. De
 *    issue zegt het zo, en dat is de hele reden dat dit blok bestaat — een uitweg
 *    in plaats van stilte.
 *
 * ⚠️ **Toon: nuchter en behulpzaam, geen verwijt** (acceptatiecriterium 6). Er
 *    staat nergens dat je iets fout hebt gedaan. Een deadline die niet meer
 *    klopt, is informatie en geen oordeel.
 *
 * ⚠️ Bijstellen breekt je reeks niet en wist niets (criterium 3). Dat kán ook
 *    niet: een deadline verzetten raakt `goals.target_date` en niet
 *    `weekly_goals`, mijlpalen laten vallen zet ze op `dropped` in plaats van ze
 *    te verwijderen, en `goal_events` legt elke wijziging append-only vast
 *    (criterium 4). Deze kaart wijst alleen de weg naar bestaande handelingen;
 *    hij voert zelf niets uit. Dat scheelt een tweede plek waar dezelfde
 *    wijziging langs kan.
 */
function Herplannen({
  risico,
  heeftStraf,
}: {
  readonly risico: Risico | null;
  readonly heeftStraf: boolean;
}) {
  if (risico?.stand !== 'unreachable') return null;

  const weken = risico.reden?.weken_over ?? null;
  const open = risico.reden?.open_mijlpalen ?? null;

  /**
   * ⚠️ Vier sleutels en geen ternair middenin de zin. Er stonden er twee —
   *    `is`/`zijn` en `week`/`weken` — en die vorm werkt alleen in een taal met
   *    precies twee meervoudsvormen. Bovendien las hij "Er staan 1 mijlpalen
   *    open" zodra er nog één over was: het meervoud van de mijlpalen was
   *    helemaal niet meegenomen.
   */
  const stand =
    open === null || weken === null
      ? ''
      : open === 1
        ? weken === 1
          ? t('herplannen.stand_1_1')
          : t('herplannen.stand_1_n', { weken })
        : weken === 1
          ? t('herplannen.stand_n_1', { open })
          : t('herplannen.stand_n_n', { open, weken });

  return (
    <Card nested>
      <Subheading>{t('herplannen.kop')}</Subheading>

      <Body muted>
        {stand}
        {t('herplannen.geen_ramp')}
      </Body>

      <Body>{t('herplannen.drie_dingen')}</Body>

      <View style={styles.uitwegen}>
        <View style={styles.uitweg}>
          <Body>{t('herplannen.datum_kop')}</Body>
          <Caption>{t('herplannen.datum_uitleg')}</Caption>
        </View>

        <View style={styles.uitweg}>
          <Body>{t('herplannen.mijlpalen_kop')}</Body>
          <Caption>{t('herplannen.mijlpalen_uitleg')}</Caption>
        </View>

        <View style={styles.uitweg}>
          <Body>{t('herplannen.kleiner_kop')}</Body>
          <Caption>{t('herplannen.kleiner_uitleg')}</Caption>
        </View>
      </View>

      {/*
        ⚠️ Acceptatiecriterium 5: is er een straf ingesteld, dan hoort de
           gebruiker vóór het verzetten te weten wat dat daarvoor betekent.
           Domeinregel 11 zegt dat een straf pas in werking treedt bij een
           verstreken deadline — dus de datum verzetten is precies de handeling
           die dat moment verschuift, en dat mag geen verrassing zijn.
      */}
      {heeftStraf ? (
        <Caption danger>{t('herplannen.let_op_straf')}</Caption>
      ) : null}

      <Caption>{t('herplannen.reeks_blijft')}</Caption>
    </Card>
  );
}

/**
 * "Vraag je groep om hulp" — QS8-95, het scharnierpunt van EPIC 12.
 *
 * ⚠️ **Nooit automatisch** (acceptatiecriterium 1). De kaart verschijnt bij
 *    stand "achterstand" en verder gebeurt er niets: er gaat pas iets naar de
 *    groep als de gebruiker de tekst gelezen heeft, hem eventueel aangepast
 *    heeft, en op verzenden drukt. Dat is wat deze functie tot een geldige
 *    uitzondering op domeinregel 7 maakt — de route loopt via de persoon.
 *
 * ⚠️ Het bericht is een **gewoon chatbericht**, geen systeembericht. Dat scheelt
 *    een migratie (de allowlist hoeft niet open), reageren werkt vanzelf, en het
 *    klopt inhoudelijk: een systeembericht is iets dat de app zegt, dit is iets
 *    dat de gebruiker zegt.
 *
 * ⚠️ Wegklikken blijft weg (acceptatiecriterium 5). De keuze staat op het
 *    apparaat en niet in de database: het is een schermvoorkeur, en een kolom
 *    toevoegen vraagt eerst toestemming. Gevolg: op een nieuwe telefoon komt de
 *    kaart één keer terug.
 */
function HulpVragen({
  doel,
  risico,
  groepen,
  userId,
}: {
  readonly doel: DoelMetVoortgang;
  readonly risico: Risico | null;
  readonly groepen: readonly DoelGroep[];
  readonly userId: string | null;
}) {
  const [tekst, setTekst] = useState('');
  const [groepId, setGroepId] = useState('');
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [verstuurd, setVerstuurd] = useState(false);
  const { weg, verberg, geladen } = useHulpvraagVerborgen(doel.id);

  // ⚠️ Afgeleid en niet in een effect gezet. De eerste groep is de standaard
  //    zolang de gebruiker niets gekozen heeft; dat in een effect naar state
  //    schrijven levert een extra render op zonder dat er iets verandert, en de
  //    lint-regel vangt het af.
  const gekozenGroep = groepId === '' ? (groepen[0]?.group_id ?? '') : groepId;

  // Alleen bij achterstand, alleen met een groep om het aan te vragen, en
  // alleen als hij niet weggeklikt is.
  if (risico?.stand !== 'behind' || groepen.length === 0 || !geladen || weg || userId === null) {
    return null;
  }

  if (verstuurd) {
    return (
      <Card nested>
        <Subheading>{t('hulpvraag.verstuurd_kop')}</Subheading>
        <Body muted>{t('hulpvraag.verstuurd_uitleg')}</Body>
      </Card>
    );
  }

  async function verstuur() {
    if (userId === null) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await stuurBericht(gekozenGroep, userId, tekst);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setVerstuurd(true);
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>{t('hulpvraag.kop')}</Subheading>
        <Body muted>{t('hulpvraag.uitleg')}</Body>

        <View style={styles.knoppen}>
          <Button
            variant="primair"
            onPress={() => {
              setTekst(
                hulpvraagVoorstel({
                  doeltitel: doel.title,
                  wekenOver: risico?.reden?.weken_over ?? null,
                }),
              );
              setOpen(true);
            }}
          >
            {t('hulpvraag.vraag_knop')}
          </Button>
          <Button variant="stil" onPress={verberg}>
            {t('hulpvraag.niet_nu')}
          </Button>
        </View>
      </Card>
    );
  }

  return (
    <Card nested>
      <Subheading>{t('hulpvraag.wat_vragen')}</Subheading>

      <Field
        label={t('hulpvraag.bericht')}
        hint={t('hulpvraag.bericht_hint')}
        value={tekst}
        onChangeText={setTekst}
        multiline
        numberOfLines={4}
        maxLength={HULPVRAAG_MAX}
      />

      {groepen.length === 1 ? null : (
        <Choice
          label={t('hulpvraag.welke_groep')}
          opties={groepen.map((g) => ({ waarde: g.group_id, label: g.name }))}
          waarde={gekozenGroep}
          onKies={setGroepId}
        />
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        <Button
          variant="primair"
          busy={bezig}
          disabled={tekst.trim().length < 3}
          onPress={() => void verstuur()}
        >
          {t('hulpvraag.versturen')}
        </Button>
        <Button variant="stil" disabled={bezig} onPress={() => setOpen(false)}>
          {t('hulpvraag.annuleren')}
        </Button>
      </View>
    </Card>
  );
}

/**
 * De Risico-radar op het doelscherm — QS8-94.
 *
 * ⚠️ **Uitsluitend voor de eigenaar**, en dat is criterium 3 van de issue. De
 *    afdwinging zit in de database: `goal_risk` is eigenaar-only sinds migratie
 *    0050. Dit scherm is sowieso van de eigenaar, maar het component staat
 *    bewust niet in een gedeelde kaart die ooit op een groepsscherm kan belanden
 *    — dat is de valkuil "een component dat op het verkeerde scherm kan
 *    belanden" uit de overdracht.
 *
 * ⚠️ Rendert niets zonder rij. Een doel dat net is aangemaakt heeft nog geen
 *    stand: de radar draait bij de rollover en bij elke goedkeuring, niet bij
 *    het openen van een scherm (criterium 2 van QS8-93).
 */
function Risicoradar({ risico }: { readonly risico: Risico | null }) {
  const [waarom, setWaarom] = useState(false);

  if (risico === null) return null;

  return (
    <Card nested>
      <Subheading>{t('radar.kop')}</Subheading>

      <RisicoBadge
        stand={risico.stand}
        uitleg={waarom ? risicoUitleg(risico.stand, risico.reden) : undefined}
      />

      {waarom ? (
        <Button variant="stil" onPress={() => setWaarom(false)}>
          {t('radar.verbergen')}
        </Button>
      ) : (
        <Button variant="stil" onPress={() => setWaarom(true)}>
          {t('radar.waarom')}
        </Button>
      )}

      <Coachwoord stand={risico.stand} />

      {/*
        ⚠️ Deze zin staat er omdat de gebruiker anders moet raden hoeveel hij
           deelt. Een risicostand is een afgeleide van gemiste weken, en dat is
           precies waar domeinregel 7 over gaat — vandaar dat hij nergens in de
           groep terechtkomt. Wil je je groep om hulp vragen, dan is dat een
           knop die jij indrukt (QS8-95).
      */}
      <Caption>{t('radar.alleen_jij')}</Caption>
    </Card>
  );
}

/**
 * Het woord van de Doelcoach bij een tegenvallende stand — besluit 28-08-2026.
 *
 * ⚠️ **Variant B, en dat is een keuze van Quinten met een reden erbij.** Er lag
 *    een regel dat de coach *"nooit ongevraagd bij stilstand"* spreekt, omdat
 *    een coach die uit zichzelf begint een controleur wordt. Quinten heeft die
 *    afgewogen en gekozen voor ongevraagd aanmoedigen, met de testronde als
 *    ijkpunt: valt het verkeerd, dan gaat het alsnog naar variant A (alleen als
 *    je de coach zelf aanspreekt). Zie `docs/GROENE-NOTITIES.md` §3b.
 *
 * ⚠️ **Waarom dit domeinregel 7 niet raakt, en waarom dat gemeten is en niet
 *    aangenomen.** Dit blok hangt aan `risico`, en dat komt uit `goal_risk`.
 *    Die tabel draagt sinds migratie 0050 één policy — `goal_risk_select` met
 *    `owner_id = auth.uid()` — dus een groepsgenoot krijgt hier `null` en ziet
 *    niets. De grens ligt in de database en niet in dit scherm.
 *
 * ⚠️ **Aanmoedigen is hier niet "je kunt het".** Elke zin wijst naar iets wat de
 *    app écht kan: de vloer (domeinregel 8), de adempauze, of het bijstellen van
 *    de streefdatum. Een aanmoediging zonder handvat is een dooddoener, en die
 *    leert een gebruiker het blok over te slaan.
 */
function Coachwoord({ stand }: { readonly stand: Risico['stand'] }) {
  // Op koers is er niets aan te moedigen. Een coach die ook dán iets zegt,
  // wordt behang.
  if (stand === 'on_track') return null;

  return (
    <>
      <Caption>{t('coach.woord_kop')}</Caption>
      <Body>{t(`coach.woord.${stand}`)}</Body>
    </>
  );
}

/**
 * Het auditspoor van één commitment — de knop die bij `fetchCommitmentSpoor()` ontbrak.
 *
 * ⚠️ **Domeinregel 5 eist dit met zoveel woorden:** alles wat een consequentie
 *    oplegt moet expliciet bevestigd zijn, **auditeerbaar**, en nooit
 *    stilzwijgend geactiveerd. De tabel `commitment_events` bestaat sinds EPIC 9
 *    en `fetchCommitmentSpoor()` sinds QS8-106 — met nul aanroepers. Het spoor
 *    was er dus wel en niemand kon het zien, en dat is precies zo goed als geen
 *    spoor.
 *
 * ⚠️ **Alleen de eigenaar leest dit, en dat komt van RLS en niet van dit
 *    scherm.** `commitment_events_select` eist dat het commitment aan een doel
 *    van `auth.uid()` hangt. Dat is ook de goede kant op voor domeinregel 7: het
 *    spoor van een straf vertelt wanneer iemand hem verschuldigd werd.
 *
 * ⚠️ **Dichtgeklapt tot je erom vraagt.** Een commitment is een afspraak, geen
 *    logboek; wie er elke keer een lijst gebeurtenissen naast krijgt, leest de
 *    afspraak niet meer. De knop staat er wél altijd, want een spoor dat je moet
 *    zoeken is geen spoor.
 */
function Spoor({ commitmentId }: { readonly commitmentId: string }) {
  const { profiel } = useProfiel();
  const [open, setOpen] = useState(false);

  const { data, loading, error, herlaad } = useAsync(
    open ? () => fetchCommitmentSpoor(commitmentId) : null,
    [open, commitmentId],
  );

  if (!open) {
    return (
      <Button variant="stil" onPress={() => setOpen(true)}>
        {t('commitmentspoor.toon')}
      </Button>
    );
  }

  return (
    <View style={styles.blokken}>
      <AsyncView
        loading={loading}
        error={error}
        data={data}
        isEmpty={(rijen) => rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: t('commitmentspoor.leeg_titel'),
          body: t('commitmentspoor.leeg_tekst'),
        }}
      >
        {(rijen) => (
          <View style={styles.mijlpalen}>
            {rijen.map((rij) => (
              <View key={rij.id} style={styles.mijlpaal}>
                <Body>{spoorLabels()[rij.event_type] ?? rij.event_type}</Body>
                {/*
                  ⚠️ Hier stond `created_at.slice(0, 16).replace('T', ' ')`: een
                     ISO-tijdstempel in UTC, dus de verkeerde notatie én het
                     verkeerde uur. Een auditspoor (domeinregel 5) hoort in de
                     zone van wie het leest.
                */}
                <Caption>{toonMoment(rij.created_at, profiel?.tz ?? apparaatTijdzone(), opmaaktaal())}</Caption>
              </View>
            ))}
          </View>
        )}
      </AsyncView>

      <Button variant="stil" onPress={() => setOpen(false)}>
        {t('commitmentspoor.verberg')}
      </Button>
    </View>
  );
}

/**
 * Mijlpalen beheren — QS8-39, migratie 0049.
 *
 * ⚠️ Het handmatige pad moet volledig zijn, ook als er nooit AI gebruikt is
 *    (acceptatiecriterium 1). De Doelcoach vult mijlpalen in; hij is er geen
 *    voorwaarde voor. Daarom staat dit blok er altijd, ook bij een doel dat
 *    nooit door de Doelcoach is gegaan.
 *
 * ⚠️ Herordenen gaat via één RPC en niet via losse updates per rij. De unieke
 *    index `(goal_id, order_index)` is DEFERRABLE: schuiven mag binnen één
 *    transactie, en PostgREST geeft je er per verzoek precies één.
 */
function Mijlpalen({
  doel,
  onKlaar,
  onCoach,
}: {
  readonly doel: DoelMetVoortgang;
  readonly onKlaar: () => void;
  readonly onCoach: () => void;
}) {
  const router = useRouter();
  const { profiel } = useProfiel();
  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;
  const startDag = profiel ? (profiel.week_start_day as Weekday) : null;
  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState('');
  /**
   * ⚠️ **Dezelfde drie velden als bij bewerken, en dat is dezelfde grendel** —
   *    QS8-225. `maakMijlpaal()` neemt `MijlpaalInvoer`, en daar zijn
   *    `description` en `target_date` verplichte sleutels met een nullable
   *    waarde. Dit formulier stuurde ze allebei hard op `null`: een mijlpaal was
   *    alleen met een titel aan te maken, en de omschrijving moest er daarna via
   *    "bewerken" in — twee handelingen voor één ding.
   */
  const [omschrijving, setOmschrijving] = useState('');
  const [datum, setDatum] = useState('');
  /** De mijlpaal die op dit moment bewerkt wordt, of `null`. */
  const [bewerkt, setBewerkt] = useState<Mijlpaal | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ronde, setRonde] = useState(0);

  const mijlpalen = useAsyncMetTerugval(() => fetchMijlpalen(doel.id), LEGE_MIJLPALEN, [
    doel.id,
    ronde,
  ]);

  const ververs = () => {
    setRonde((n) => n + 1);
    onKlaar();
  };

  async function voegToe() {
    setBezig(true);
    setFout(null);

    const uitkomst = await maakMijlpaal(doel.id, {
      title: titel,
      description: omschrijving.trim() === '' ? null : omschrijving,
      target_date: datum.trim() === '' ? null : datum,
    });

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setTitel('');
    setOmschrijving('');
    setDatum('');
    setOpen(false);
    ververs();
  }

  async function schuif(id: string, richting: 'omhoog' | 'omlaag') {
    const nieuweVolgorde = verplaats(
      mijlpalen.map((m) => m.id),
      id,
      richting,
    );

    // ⚠️ De volledige lijst, want de RPC weigert een deelverzameling — daarmee
    //    zijn dubbele posities en gaten te maken.
    const uitkomst = await herordenMijlpalen(doel.id, nieuweVolgorde);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    ververs();
  }

  async function zetStatus(id: string, status: 'todo' | 'done' | 'dropped') {
    const uitkomst = await zetMijlpaalStatus(id, status);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    ververs();
  }

  async function weg(id: string) {
    const uitkomst = await verwijderMijlpaal(id);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    ververs();
  }

  return (
    <Card nested>
      <Subheading>{t('mijlpalenblok.kop')}</Subheading>

      {mijlpalen.length === 0 ? (
        <>
          <Body muted>{t('mijlpalenblok.leeg')}</Body>
          {/*
            ⚠️ De Doelcoach staat hier en niet bovenaan het scherm, en alleen bij
               een doel zónder mijlpalen. Hij is een hulpmiddel bij een leeg doel,
               geen knop die je elke keer ziet — en het handmatige pad hoort
               ernaast te blijven bestaan (QS8-39, criterium 1).
          */}
          <Button variant="primair" onPress={onCoach}>
            {t('mijlpalenblok.coach')}
          </Button>
        </>
      ) : (
        <View style={styles.mijlpalen}>
          {mijlpalen.map((m, i) => (
            <View key={m.id} style={styles.mijlpaal}>
              <Body>{m.title}</Body>

              {/*
                ⚠️ **De omschrijving stond hier niet, en dat was zonde van iets
                   waar al voor betaald is** — QS8-225. `MIJLPAAL_SCHEMA` in de
                   Edge Function zet `description` in `required`, dus élke
                   gegenereerde mijlpaal heeft er een. Die was tot nu toe alleen
                   te zien door op "bewerken" te drukken.
              */}
              {m.description === null || m.description.trim() === '' ? null : (
                <Body muted>{m.description}</Body>
              )}

              <Caption>
                {m.status === 'done'
                  ? t('mijlpalenblok.gehaald')
                  : t('mijlpalenblok.stap', { nummer: i + 1, totaal: mijlpalen.length })}
              </Caption>

              {/*
                ⚠️ Een eigen regel en geen achtervoegsel meer aan de stapnummering.
                   " · streefdatum 2027-03-31" achter "Stap 2 van 5" leest als één
                   mededeling terwijl het er twee zijn, en de datum verdween in de
                   staart van de zin.
              */}
              {m.target_date === null ? null : (
                <Caption>{t('mijlpalenblok.streefdatum', { datum: toonDatum(m.target_date, opmaaktaal()) })}</Caption>
              )}

              <View style={styles.knoppen}>
                {/*
                  ⚠️ Op "gehaald" zetten plaatst een systeembericht in elke
                     gekoppelde groep, en een chatbericht is een onveranderlijke
                     kopie. Terugzetten haalt dat bericht niet weg. De knop zegt
                     dat, want anders ontdekt iemand het pas in de groepschat.
                */}
                {m.status === 'done' ? (
                  <Button variant="stil" onPress={() => void zetStatus(m.id, 'todo')}>
                    {t('mijlpalenblok.toch_niet')}
                  </Button>
                ) : (
                  <Button onPress={() => void zetStatus(m.id, 'done')}>
                    {t('mijlpalenblok.zet_gehaald')}
                  </Button>
                )}

                {/*
                  ⚠️ **QS8-41, en dit is de knop die de keten levend maakt.** Een
                     datalaag met een RPC en een grant waar geen scherm bij kan,
                     is dood hout dat geen enkele test ziet — dat is de les van
                     QS8-113 en van QS8-112, waar `maakWeekdoel()` door niets
                     werd aangeroepen terwijl twee issues op Done stonden.

                  ⚠️ Niet bij een gehaalde mijlpaal. Weekstappen laten bedenken
                     voor iets wat al af is, is een AI-call weggooien — en elke
                     call telt mee in dezelfde tien per dag.
                */}
                {m.status === 'done' ? null : (
                  <Button
                    variant="stil"
                    accessibilityLabel={t('mijlpalenblok.weekstappen_label', { titel: m.title })}
                    onPress={() => router.push(`/doel/weekdoelen/${doel.id}?mijlpaal=${m.id}`)}
                  >
                    {t('mijlpalenblok.weekstappen')}
                  </Button>
                )}

                {i === 0 ? null : (
                  <Button
                    variant="stil"
                    accessibilityLabel={t('mijlpalenblok.omhoog_label', { titel: m.title })}
                    onPress={() => void schuif(m.id, 'omhoog')}
                  >
                    {t('mijlpalenblok.omhoog')}
                  </Button>
                )}

                {i === mijlpalen.length - 1 ? null : (
                  <Button
                    variant="stil"
                    accessibilityLabel={t('mijlpalenblok.omlaag_label', { titel: m.title })}
                    onPress={() => void schuif(m.id, 'omlaag')}
                  >
                    {t('mijlpalenblok.omlaag')}
                  </Button>
                )}

                {/*
                  ⚠️ **De knop bij `wijzigMijlpaal()`, die tot 28-08 ontbrak.**
                     Aanmaken, verwijderen, herordenen en op gehaald zetten konden
                     allemaal; alleen de tekst zelf was permanent. Dezelfde klasse
                     als `wijzigDoel()` en als QS8-113: elk schakeltje af, de keten
                     nergens verbonden, en geen enkele test die dat kón zien.
                */}
                <Button
                  variant="stil"
                  accessibilityLabel={t('mijlpalenblok.bewerken_label', { titel: m.title })}
                  onPress={() => {
                    setFout(null);
                    setBewerkt(bewerkt?.id === m.id ? null : m);
                  }}
                >
                  {t('mijlpalenblok.bewerken')}
                </Button>

                <Button
                  variant="stil"
                  accessibilityLabel={t('mijlpalenblok.verwijderen_label', { titel: m.title })}
                  onPress={() => void weg(m.id)}
                >
                  {t('mijlpalenblok.verwijderen')}
                </Button>
              </View>

              {bewerkt?.id === m.id ? (
                <MijlpaalBewerken
                  mijlpaal={bewerkt}
                  onKlaar={() => {
                    setBewerkt(null);
                    ververs();
                  }}
                  onAnnuleer={() => setBewerkt(null)}
                />
              ) : null}
            </View>
          ))}
        </View>
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      {open ? (
        <View style={styles.pauzeForm}>
          <Field
            label={t('mijlpalenblok.nieuwe')}
            hint={t('mijlpalenblok.nieuwe_hint')}
            value={titel}
            onChangeText={setTitel}
            placeholder={t('mijlpalenblok.nieuwe_voorbeeld')}
          />

          {/*
            ⚠️ **Woordelijk dezelfde velden als `MijlpaalBewerken`, en met opzet.**
               Twee formulieren voor hetzelfde ding die verschillende velden
               tonen, is hoe je een veld kwijtraakt bij de eerste correctie —
               precies wat de kop van dat component beschrijft.

            ⚠️ **Hier stond dat er geen datumkiezer wás.** Dat klopte tot
               03-09: `Kalender` in `shared/ui` is een leesbare heatmap voor het
               overzicht en geen kiezer. `DatumKeuze` is die kiezer wél — QS8-223.
          */}
          <Field
            label={t('mijlpaalbewerken.omschrijving')}
            hint={t('mijlpalenblok.omschrijving_hint')}
            value={omschrijving}
            onChangeText={setOmschrijving}
            multiline
            numberOfLines={3}
          />

          {/*
            ⚠️ **Een kalender en geen tekstveld — QS8-223.** De aantekening die
               hier stond ("er ís geen datumkiezer; er een bouwen is eigen werk")
               klopte tot vandaag; `DatumKeuze` in `shared/ui` is die kiezer.

            ⚠️ **Alleen mét profiel, net als `DeadlineVerzetten` hierboven.** De
               kalender heeft twee dingen uit het profiel nodig die hij nooit zelf
               mag verzinnen: vandaag in jóuw tijdzone, en jouw week-startdag
               (domeinregel 1). Is het profiel niet geladen — de routewacht
               wacht daarop, dus in de praktijk alleen na een mislukte ophaling —
               dan is de mijlpaal nog steeds aan te maken, zonder datum.

            ⚠️ Geen `min`: een mijlpaal in het verleden afvinken is een normale
               handeling, anders dan een streefdatum verzetten.
          */}
          {vandaag === null || startDag === null ? null : (
            <DatumKeuze
              label={t('mijlpaalbewerken.streefdatum')}
              hint={t('mijlpaalbewerken.streefdatum_hint')}
              waarde={datum}
              onKies={setDatum}
              startDag={startDag}
              vandaag={vandaag}
              optioneel
            />
          )}

          <View style={styles.knoppen}>
            <Button
              variant="primair"
              busy={bezig}
              disabled={titel.trim().length < 3}
              onPress={() => void voegToe()}
            >
              {t('mijlpalenblok.toevoegen')}
            </Button>
            <Button
              variant="stil"
              disabled={bezig}
              onPress={() => {
                setOpen(false);
                setFout(null);
                setOmschrijving('');
                setDatum('');
              }}
            >
              {t('mijlpalenblok.annuleren')}
            </Button>
          </View>
        </View>
      ) : (
        <Button onPress={() => setOpen(true)}>{t('mijlpalenblok.toevoegen_knop')}</Button>
      )}
    </Card>
  );
}

/**
 * Eén mijlpaal bewerken — de knop die bij `wijzigMijlpaal()` ontbrak.
 *
 * ⚠️ **Alle drie de velden gaan mee, en dat is geen netheid maar een grendel.**
 *    `wijzigMijlpaal()` stuurt titel, omschrijving én streefdatum in één UPDATE,
 *    zoals `mijlpaalSchema` voorschrijft. Zou dit formulier de omschrijving niet
 *    kennen, dan wiste elke titelcorrectie hem stilzwijgend. Daarom draagt
 *    `Mijlpaal` sinds 28-08 `description` — het type dwingt de juiste waarde af
 *    in plaats van hem te laten raden.
 *
 * ⚠️ **De streefdatum mág hier wél, anders dan bij een doel.** A7 gaat over de
 *    streefdatum van het dóél: die staat in een afspraak met een buddy en
 *    verschuift alleen met akkoord. Een mijlpaal is een eigen tussenstap zonder
 *    afspraak eromheen; hem verzetten raakt niemand anders.
 */
function MijlpaalBewerken({
  mijlpaal,
  onKlaar,
  onAnnuleer,
}: {
  readonly mijlpaal: Mijlpaal;
  readonly onKlaar: () => void;
  readonly onAnnuleer: () => void;
}) {
  const { profiel } = useProfiel();
  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;
  const startDag = profiel ? (profiel.week_start_day as Weekday) : null;
  const [titel, setTitel] = useState(mijlpaal.title);
  const [omschrijving, setOmschrijving] = useState(mijlpaal.description ?? '');
  const [datum, setDatum] = useState(mijlpaal.target_date ?? '');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    setBezig(true);
    setFout(null);

    const uitkomst = await wijzigMijlpaal(mijlpaal.id, {
      title: titel,
      description: omschrijving.trim() === '' ? null : omschrijving,
      target_date: datum.trim() === '' ? null : datum,
    });

    setBezig(false);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onKlaar();
  }

  return (
    <View style={styles.pauzeForm}>
      <Field
        label={t('mijlpaalbewerken.titel')}
        value={titel}
        onChangeText={setTitel}
        placeholder={t('mijlpalenblok.nieuwe_voorbeeld')}
      />

      <Field
        label={t('mijlpaalbewerken.omschrijving')}
        value={omschrijving}
        onChangeText={setOmschrijving}
        multiline
        numberOfLines={3}
      />

      {/* ⚠️ Zie de kalender bij het aanmaken: zelfde grens, zelfde reden. */}
      {vandaag === null || startDag === null ? null : (
        <DatumKeuze
          label={t('mijlpaalbewerken.streefdatum')}
          hint={t('mijlpaalbewerken.streefdatum_hint')}
          waarde={datum}
          onKies={setDatum}
          startDag={startDag}
          vandaag={vandaag}
          optioneel
        />
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        <Button
          variant="primair"
          busy={bezig}
          disabled={titel.trim().length < 3}
          onPress={() => void bewaar()}
        >
          {t('mijlpaalbewerken.bewaren')}
        </Button>
        <Button variant="stil" disabled={bezig} onPress={onAnnuleer}>
          {t('mijlpaalbewerken.annuleren')}
        </Button>
      </View>
    </View>
  );
}

/**
 * Het weekplan — QS8-203, migratie 0138.
 *
 * ⚠️ **Dit blok is de reden dat het plan geen dood hout is.** Een tabel met een
 *    RPC en een grant waar geen scherm bij kan, is precies wat QS8-113 en
 *    QS8-112 opleverden: elk schakeltje af, de keten nergens verbonden, en geen
 *    enkele test die dat kón zien. Het plan wordt gevuld vanaf het coach-scherm
 *    en ingeschoven door de rollover; hier is de plek waar de eigenaar het ziet
 *    en bijstelt.
 *
 * ⚠️ Onwrikbare regel 16: laadstaat, foutstaat én lege staat. De lege staat is
 *    hier het normale geval — de meeste doelen hebben nog geen plan — dus die
 *    zin doet werk en is geen opvulling.
 *
 * ⚠️ De cyclus wordt hier niet berekend. `startWeekplanstapNu()` haalt hem uit
 *    de klok van de gebruiker (correctheidsregel 7).
 */
function Weekplan({
  doel,
  klok,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly klok: UserClock | null;
  readonly onKlaar: () => void;
}) {
  // ⚠️ `useAsync` en geen eigen `levend`-vlag. Dat blokje stond op 25-08 al
  //    tweeëndertig keer woordelijk in deze codebase; `levend:controle` bewaakt
  //    dat er geen drieëndertigste bij komt die één van de vier toetsen vergeet.
  const {
    data: stappen,
    loading: laadt,
    error: laadfout,
    herlaad: laad,
  } = useAsync(() => fetchWeekplan(doel.id), [doel.id]);

  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function startNu(id: string) {
    if (klok === null) return;
    setBezig(id);
    setFout(null);

    const uitkomst = await startWeekplanstapNu(id, doel.id, klok);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    laad();
    // ⚠️ Het doelscherm herladen en niet alleen dit blok: er staat nu een
    //    weekdoel bij, en het puntenplafond eronder is veranderd.
    onKlaar();
  }

  async function verwijder(id: string) {
    setBezig(id);
    setFout(null);

    const uitkomst = await verwijderWeekplanstap(id);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    laad();
  }

  async function schuif(id: string, richting: 'omhoog' | 'omlaag') {
    // ⚠️ `verplaats()` geeft de lijst ongewijzigd terug als er niets te schuiven
    //    valt. Dan is de RPC een netwerkronde voor niets — en erger, hij zou het
    //    scherm laten knipperen alsof er iets veranderde.
    const volgorde = verplaats(
      (stappen ?? []).map((stap) => stap.id),
      id,
      richting,
    );

    if (volgorde.length === 0) return;

    setBezig(id);
    setFout(null);

    const uitkomst = await herordenWeekplan(doel.id, volgorde);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    laad();
  }

  if (laadt) {
    return (
      <Card nested>
        <Body muted>{t('weekplan.kop')}</Body>
      </Card>
    );
  }

  // ⚠️ Onwrikbare regel 16: de foutstaat is een eigen tak en niet een leeg blok.
  //    `Weekplanblok` zou anders "er staat nog geen plan klaar" tonen terwijl er
  //    misschien wél een plan is dat gewoon niet binnenkwam — en dat is de
  //    verkeerde geruststelling.
  if (laadfout !== null && laadfout !== undefined) {
    return (
      <Card nested>
        <Subheading>{t('weekplan.kop')}</Subheading>
        <Caption danger>{t('weekplan.laden_mislukt')}</Caption>
        <Button variant="stil" onPress={laad}>
          {t('laden.opnieuw')}
        </Button>
      </Card>
    );
  }

  return (
    <Card nested>
      <Weekplanblok
        stappen={stappen ?? []}
        bezig={bezig}
        onStartNu={(id) => void startNu(id)}
        onVerwijder={(id) => void verwijder(id)}
        onSchuif={(id, richting) => void schuif(id, richting)}
      />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * Een weekdoel toevoegen — QS8-43, QS8-44, QS8-112.
 *
 * ⚠️ Dit scherm ontbrak, en dat is het soort gat dat een afgevinkt vakje
 *    verbergt: QS8-43 en QS8-44 stonden allebei op Done omdat de datalaag klaar
 *    was. `maakWeekdoel()` werd door niets aangeroepen, en daarmee was de
 *    kernlus van de app niet met de hand te doorlopen.
 *
 * ⚠️ De cyclus wordt hier **niet** berekend. `maakWeekdoel()` doet dat uit de
 *    klok van de gebruiker (correctheidsregel 7); dit formulier levert alleen
 *    tekst en een keuze aan.
 */
function WeekdoelToevoegen({
  doel,
  klok,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly klok: UserClock | null;
  readonly onKlaar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [titel, setTitel] = useState('');
  const [vloer, setVloer] = useState('');
  const [plafond, setPlafond] = useState('');
  const [mijlpaalId, setMijlpaalId] = useState<string>(LOS_VAN_MIJLPAAL);

  // ⚠️ Pas ophalen als het formulier open is: dit blok staat op een scherm dat
  //    ook zonder weekdoel bruikbaar moet zijn. Zonder mijlpalen kun je nog
  //    steeds een los weekdoel maken, en dat is de meest voorkomende situatie —
  //    vandaar de lege terugval en geen foutmelding.
  const mijlpalen = useAsyncMetTerugval(
    open ? () => fetchMijlpalen(doel.id) : null,
    LEGE_MIJLPALEN,
    [open, doel.id],
  );
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  /**
   * Telt deze week in dagen? — QS8-260, besluit A53, migratie 0140.
   *
   * ⚠️ **De keuze gaat over déze week en niet over het doel, en dat is de kern
   *    van A53.** `goals.ritme` is de voorkeur van de gebruiker en stuurt het
   *    vóórstel; `weekly_goals.ceiling_days` ís het oordeel over deze week. Zou
   *    het oordeel het doel lezen, dan verandert de uitslag van een afgelopen
   *    week zodra iemand zijn ritme omzet — en een week die op vrijdag "drie van
   *    vijf dagen" was, moet dat blijven.
   *
   *    Vandaar dat dit formulier het ritme van het doel als **beginstand**
   *    gebruikt en het daarna met rust laat: hier wordt `goals.ritme` niet
   *    teruggeschreven. Wie zijn voorkeur wil wijzigen, doet dat bij het doel.
   */
  const [ritme, setRitme] = useState<Ritme>(leesRitme(doel.ritme));
  const [plafondDagen, setPlafondDagen] = useState<string>(GEEN_DAGEN);
  const [vloerDagen, setVloerDagen] = useState<string>(GEEN_DAGEN);

  // ⚠️ `daily` betekent zeven, en dan is een plafondkeuze een vraag met één
  //    antwoord. `times_per_week` vraagt het wél — dat is precies het verschil
  //    tussen de twee ritmes.
  // ⚠️ **De regel staat in `ritme-invoer.ts` en niet hier, en dat is niet om de
  //    nette reden.** Dit bestand importeert de Supabase-client en die trekt
  //    React Native mee, dus met vitest is er niets van te toetsen — terwijl
  //    juist de vraag wanneer een week in dagen telt onder test hoort te staan.
  const { floor_days: dagenVloer, ceiling_days: dagenPlafond } = dagenUitKeuze(
    ritme,
    plafondDagen,
    vloerDagen,
  );

  // De mijlpalen pas ophalen als het formulier open is: dit blok staat op een
  // scherm dat ook zonder weekdoel bruikbaar moet zijn.


  async function bewaar() {
    if (!klok) return;
    setBezig(true);
    setFout(null);

    // ⚠️ Zonder dit wordt élk weekdoel "week 1" van dit doel en klopt
    //    `cycle_index` niet meer — daar hangt de weekteller aan.
    const eerste = await eersteCyclusVanDoel(doel.id, klok);

    const uitkomst = await maakWeekdoel(
      klok,
      {
        goal_id: doel.id,
        milestone_id: mijlpaalId === LOS_VAN_MIJLPAAL ? null : mijlpaalId,
        title: titel,
        // Lege tekst is "niet ingevuld" en hoort als null de database in, niet
        // als lege string — anders lijkt er een vloer te zijn die er niet is.
        floor_text: vloer.trim() === '' ? null : vloer,
        ceiling_text: plafond.trim() === '' ? null : plafond,
        // ⚠️ **Dit was de onderbroken keten van QS8-260.** De kolommen, de CHECK,
        //    de grant, het schema en de dagteller op het dashboard stonden er
        //    allemaal; alleen kwam er nooit een getal in, want geen enkel scherm
        //    gaf ze mee. Elk schakeltje af, en het geheel dood — regel 18 vraag 5.
        floor_days: dagenVloer,
        ceiling_days: dagenPlafond,
      },
      eerste,
    );

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setOpen(false);
    setTitel('');
    setVloer('');
    setPlafond('');
    setPlafondDagen(GEEN_DAGEN);
    setVloerDagen(GEEN_DAGEN);
    setMijlpaalId(LOS_VAN_MIJLPAAL);
    onKlaar();
  }

  if (!open) {
    return (
      <Button variant="primair" block onPress={() => setOpen(true)}>
        {t('weekdoelform.knop')}
      </Button>
    );
  }

  return (
    <Card nested>
      <Subheading>{t('weekdoelform.kop')}</Subheading>

      <Field
        label={t('weekdoelform.titel')}
        hint={t('weekdoelform.titel_hint')}
        value={titel}
        onChangeText={setTitel}
        placeholder={t('weekdoelform.titel_voorbeeld')}
      />

      {/*
        ⚠️ De vloer staat vóór het plafond en krijgt de uitleg, en dat is geen
           volgordekwestie. Domeinregel 8: de vloer is de belangrijkste import
           uit Habit Huddle, en hij is optioneel — dus als de UI hem niet actief
           aanmoedigt, vult niemand hem in en is een slechte week weer een
           verloren week.
      */}
      <Field
        label={t('weekdoelform.vloer')}
        hint={t('weekdoelform.vloer_hint')}
        value={vloer}
        onChangeText={setVloer}
        placeholder={t('weekdoelform.vloer_voorbeeld')}
      />

      <Field
        label={t('weekdoelform.plafond')}
        hint={t('weekdoelform.plafond_hint')}
        value={plafond}
        onChangeText={setPlafond}
        placeholder={t('weekdoelform.plafond_voorbeeld')}
      />

      {/*
        ⚠️ **Onder de tekstvelden en niet erboven, en dat is een volgordekeuze.**
           Wat je deze week wilt bereiken staat in woorden; hoe vaak je eraan
           werkt is een tweede vraag daarover. Andersom begint het formulier met
           een getal en moet de gebruiker raden waar dat getal over gaat.

        ⚠️ Dit is de keuze voor **deze week**, niet voor het doel — zie de state
           hierboven. De beginstand komt uit `goals.ritme`.
      */}
      <Choice
        label={t('weekdoelform.ritme')}
        hint={t('weekdoelform.ritme_hint')}
        opties={RITMES.map((r) => ({ waarde: r, label: ritmeLabels()[r] }))}
        waarde={ritme}
        onKies={(gekozen) => setRitme(gekozen as Ritme)}
      />
      <Caption>{ritmeUitleg()[ritme]}</Caption>

      {ritme === 'times_per_week' ? (
        <Choice
          label={t('weekdoelform.plafond_dagen')}
          hint={t('weekdoelform.plafond_dagen_hint')}
          opties={dagopties((aantal) => t('weekdoelform.dagen_aantal', { aantal }))}
          waarde={plafondDagen}
          onKies={setPlafondDagen}
        />
      ) : null}

      {/*
        ⚠️ **De vloer in dagen is optioneel en wordt actief aangemoedigd**, net
           als de vloer in tekst hierboven — domeinregel 8. Hij verschijnt pas
           zodra er een plafond is: een vloer zonder plafond bestaat niet, en dat
           staat als `.refine()` in `weekdoelSchema` én als CHECK in 0140. Een
           veld tonen dat de database gaat weigeren, is een formulier dat je
           laat falen.
      */}
      {dagenPlafond === null ? null : (
        <>
          <Choice
            label={t('weekdoelform.vloer_dagen')}
            hint={t('weekdoelform.vloer_dagen_hint')}
            opties={dagopties((aantal) => t('weekdoelform.dagen_aantal', { aantal }), {
              tot: dagenPlafond,
              metGeen: true,
              geenLabel: t('weekdoelform.geen_vloer'),
            })}
            waarde={vloerDagen}
            onKies={setVloerDagen}
          />
          <Caption>
            {dagenVloer === null
              ? t('weekdoelform.dagen_zonder_vloer', { plafond: dagenPlafond })
              : t('weekdoelform.dagen_met_vloer', { vloer: dagenVloer, plafond: dagenPlafond })}
          </Caption>
        </>
      )}

      {/*
        Alleen tonen als er iets te kiezen valt. Eén optie ("los van een
        mijlpaal") is geen keuze maar een verplicht veld dat niets doet.
      */}
      {mijlpalen.length === 0 ? null : (
        <Choice
          label={t('weekdoelform.mijlpaal')}
          hint={t('weekdoelform.mijlpaal_hint')}
          opties={[
            { waarde: LOS_VAN_MIJLPAAL, label: t('weekdoelform.los') },
            ...mijlpalen.map((m) => ({ waarde: m.id, label: m.title })),
          ]}
          waarde={mijlpaalId}
          onKies={setMijlpaalId}
        />
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        <Button
          variant="primair"
          busy={bezig}
          disabled={titel.trim().length < 3 || klok === null}
          onPress={() => void bewaar()}
        >
          {t('weekdoelform.toevoegen')}
        </Button>
        <Button
          variant="stil"
          disabled={bezig}
          onPress={() => {
            setOpen(false);
            setFout(null);
          }}
        >
          {t('weekdoelform.annuleren')}
        </Button>
      </View>
    </Card>
  );
}

/**
 * De adempauze — QS8-82, migratie 0048.
 *
 * ⚠️ Vakantie, ziekte, een piek op het werk. Een reis hoort je niet terug naar
 *    nul te zetten. Tijdens een adempauze krijgt een onvoltooid weekdoel
 *    `excused` in plaats van `missed`: geen minpunt, en je reeks wacht in plaats
 *    van te breken.
 *
 * ⚠️ **Wat de groep ziet is de aankondiging, niet je weken.** `breathers` is
 *    leesbaar voor groepsgenoten van een gekoppeld doel — dat is het punt van
 *    "vooraf aangekondigd", en het is domeinregel 7's eigen uitzondering: dit
 *    loopt via jou. De statuskolom per week is sinds migratie 0047 juist dicht.
 *    De copy zegt dat met zoveel woorden, want anders moet de gebruiker raden
 *    hoeveel hij deelt.
 */
function Adempauzes({
  doel,
  klok,
  gedeeld,
  onKlaar,
}: {
  readonly doel: DoelMetVoortgang;
  readonly klok: UserClock | null;
  readonly gedeeld: boolean;
  readonly onKlaar: () => void;
}) {
  const [pauzes, setPauzes] = useState<readonly Adempauze[]>([]);
  const [open, setOpen] = useState(false);
  const [lengte, setLengte] = useState<'een' | 'twee'>('een');
  const [startIndex, setStartIndex] = useState<'0' | '1'>('0');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let levend = true;

    fetchAdempauzes(doel.id)
      .then((gevonden) => {
        if (levend) setPauzes(gevonden);
      })
      .catch(() => {
        if (levend) setPauzes([]);
      });

    return () => {
      levend = false;
    };
  }, [doel.id]);

  if (!klok) return null;

  const kandidaten = planbareCycli(klok, now());
  const start = kandidaten[startIndex === '0' ? 0 : 1];

  async function plan() {
    if (!klok || !start) return;
    setBezig(true);
    setFout(null);

    // Eén cyclus: begin en eind zijn dezelfde week. Twee: de week erna.
    const eind = lengte === 'een' ? start : nextCycle(start);
    const uitkomst = await planAdempauze(doel.id, start, eind);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    setOpen(false);
    setPauzes(await fetchAdempauzes(doel.id));
    onKlaar();
  }

  async function annuleer(id: string) {
    const uitkomst = await annuleerAdempauze(id);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    setPauzes(await fetchAdempauzes(doel.id));
    onKlaar();
  }

  const vandaag = localDateIn(klok.tz, now());

  return (
    <Card nested>
      <Subheading>{t('adempauze.kop')}</Subheading>
      <Body muted>{t('adempauze.uitleg')}</Body>

      {/*
        ⚠️ Alleen zeggen dat de groep het ziet als er ook echt een groep is. Bij
           een ongekoppeld doel is er niemand om iets aan te kondigen, en dan is
           deze zin een waarschuwing over een risico dat niet bestaat.
      */}
      {gedeeld ? (
        <Caption>{t('adempauze.groep_ziet')}</Caption>
      ) : null}

      {pauzes.length === 0 ? null : (
        <View style={styles.pauzes}>
          {pauzes.map((p) => {
            const begonnen = p.starts_cycle <= vandaag;
            const voorbij = p.ends_cycle < vandaag;

            return (
              <View key={p.id} style={styles.pauze}>
                <Body>
                  {t('adempauze.week_van', { datum: toonDatum(p.starts_cycle, opmaaktaal()) })}
                  {p.ends_cycle === p.starts_cycle
                    ? ''
                    : t('adempauze.tot_en_met', { datum: toonDatum(p.ends_cycle, opmaaktaal()) })}
                </Body>
                <Caption>
                  {voorbij
                    ? t('adempauze.voorbij')
                    : begonnen
                      ? t('adempauze.loopt')
                      : t('adempauze.ingepland')}
                </Caption>

                {/* Annuleren kan alleen zolang hij nog niet begonnen is — de RPC
                    weigert de rest, en dan is de knop tonen een belofte die de
                    database niet nakomt. */}
                {begonnen ? null : (
                  <Button variant="stil" onPress={() => void annuleer(p.id)}>
                    {t('adempauze.annuleren')}
                  </Button>
                )}
              </View>
            );
          })}
        </View>
      )}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      {open ? (
        <View style={styles.pauzeForm}>
          <Choice
            label={t('adempauze.vanaf')}
            hint={t('adempauze.vanaf_hint')}
            opties={kandidaten.map((c, i) => ({
              waarde: String(i) as '0' | '1',
              label: t('adempauze.week_van', { datum: toonDatum(c.startDate, opmaaktaal()) }),
            }))}
            waarde={startIndex}
            onKies={setStartIndex}
          />

          <Choice
            label={t('adempauze.hoe_lang')}
            opties={[
              { waarde: 'een', label: t('adempauze.een_week') },
              { waarde: 'twee', label: t('adempauze.twee_weken') },
            ]}
            waarde={lengte}
            onKies={setLengte}
          />

          <View style={styles.knoppen}>
            <Button variant="primair" busy={bezig} onPress={() => void plan()}>
              {t('adempauze.inplannen')}
            </Button>
            <Button
              variant="stil"
              disabled={bezig}
              onPress={() => {
                setOpen(false);
                setFout(null);
              }}
            >
              {t('adempauze.annuleren')}
            </Button>
          </View>
        </View>
      ) : (
        <Button onPress={() => setOpen(true)}>{t('adempauze.inplannen_knop')}</Button>
      )}
    </Card>
  );
}

/**
 * Weggooien binnen de bedenktijd — QS8-105, migratie 0046.
 *
 * ⚠️ Staat bewust ónder archiveren en in een stille knop. Archiveren is de weg
 *    voor een doel dat je loslaat; weggooien is er alleen voor het doel dat je
 *    net verkeerd hebt aangemaakt. Zou dit even prominent staan, dan wordt het
 *    de standaardreflex om geschiedenis weg te gooien — en dat botst met
 *    domeinregel 6 (append-only: corrigeren doe je met een correctie, niet door
 *    de geschiedenis te wissen).
 *
 * ⚠️ Verdwijnt niet vanzelf als de bedenktijd voorbij is, en dat kan ook niet:
 *    `bedenktijd()` staat alleen in de database en heeft daar bewust geen kopie
 *    in TypeScript. De database weigert dan met `te_oud`, en die melding wijst
 *    naar archiveren. Zie `shared/ui/acties.ts` voor de onderbouwing.
 */
function Weggooien({ doel, onWeg }: { readonly doel: DoelMetVoortgang; readonly onWeg: () => void }) {
  const [vraagt, setVraagt] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // Een gearchiveerd doel heeft per definitie een verleden; daar is weggooien
  // niet voor.
  if (doel.status === 'archived') return null;

  async function weg() {
    setBezig(true);
    setFout(null);

    const uitkomst = await verwijderDoel(doel.id);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    setBezig(false);
    onWeg();
  }

  if (vraagt) {
    return (
      <Bevestiging
        tekst={bevestigingen().doelVerwijderen}
        bezig={bezig}
        fout={fout}
        onBevestig={() => void weg()}
        onAnnuleer={() => {
          setVraagt(false);
          setFout(null);
        }}
      />
    );
  }

  return (
    <Button
      variant="stil"
      onPress={() => setVraagt(true)}
      accessibilityLabel={t('weggooien.label', { titel: doel.title ?? '' })}
    >
      {t('weggooien.knop')}
    </Button>
  );
}

const styles = StyleSheet.create({
  kopregel: { flexDirection: 'row', alignItems: 'center', gap: space.blokGap - 3, flexWrap: 'wrap' },
  blokken: { gap: space.blokGap + 3 },
  mijlpalen: { gap: space.blokGap - 2 },
  uitwegen: { gap: space.blokGap - 3 },
  uitweg: { gap: 2 },
  mijlpaal: { gap: 3 },
  pauzes: { gap: space.blokGap - 3 },
  pauze: { gap: 2 },
  pauzeForm: { gap: space.blokGap - 3 },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, alignItems: 'center' },
});
