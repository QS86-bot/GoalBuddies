import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientEnv } from '@/lib/env';
import { useSession } from '@/modules/auth';
import {
  fetchGekoppeldeDoelIds,
  fetchGroep,
  fetchGroepsoverzicht,
  fetchGroepsteller,
  fetchKettingStand,
  fetchKlassement,
  fetchMijnLidmaatschap,
  huddledagLabel,
  huidigeGroepsperiode,
  koppelDoelAanGroep,
  ontkoppelDoelVanGroep,
  uitnodigingsLink,
  verlaatGroep,
  zichtbaarheidLabels,
  type Groep,
  type Groepsteller,
  type Groepslid,
  type Klassementsrij,
  type Zichtbaarheid,
  type Pagina,
} from '@/modules/buddies';
import {
  beslisDeadlineVerzoek,
  fetchDoelen,
  fetchOpenVerzoekenVoorGroep,
  type DeadlineVerzoek,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  useAsync,
  Body,
  Button,
  bevestigingen,
  Bevestiging,
  Caption,
  Card,
  Choice,
  Deelknop,
  Field,
  Ketting,
  MemberRow,
  MilestoneProgress,
  Screen,
  Subheading,
  type KettingStand,
} from '@/shared/ui';

/**
 * Het groepsoverzicht — QS8-55, en de diepe link `goalbuddies://groep/<id>`.
 *
 * ⚠️ Dit is het scherm waar domeinregel 7 het scherpst geldt: alles wat hier
 *    staat, gaat over iemand ánders. Wat er staat is daarom uitsluitend wat er
 *    wél is: het gekoppelde doel, mijlpaalvoortgang (loopt alleen omhoog), de
 *    reeks en of iemand deze periode al afgesloten heeft.
 *
 *    Wat er níét staat, staat er met opzet niet: geen puntentotaal, geen gemiste
 *    weken, geen "loopt achter". `points_ledger` blijft eigenaar-only in élke
 *    stand — besluit A42, en dat is apart genomen.
 *
 * ⚠️ **Dit stond hier tot 24-08 anders, en het klopte niet meer.** Er stond dat
 *    de databasefunctie de beste reeks "niet eens teruggeeft" (migratie 0016 en
 *    0019). Sinds besluit A41 en migratie 0078 geeft `group_overview()` hem wél
 *    terug — en dit scherm tóónt hem, via `MemberRow`. De bescherming is
 *    verhuisd van "de kolom bestaat niet" naar "de kolom is leeg": een `case` in
 *    `group_visible_streaks` vult `best_streak` en `last_cycle_start` alleen
 *    voor de eigenaar zelf en voor een lid van een ópen groep, en levert
 *    daarbuiten `null`.
 *
 *    Dat is aantoonbaar zwakker dan wat er stond — een kolom die er niet is, kan
 *    niet lekken; een `case` kan verkeerd geschreven worden. De afweging tegen
 *    een tweede view en tegen een functie staat in de kop van 0078. Wat het
 *    vasthoudt zijn `tests/rls/epic13.test.ts` (beide standen, plus de view
 *    rechtstreeks) en `tests/rls/policies.test.ts` (de beschermde stand).
 *
 *    ⚠️ Wie hier een veld bij wil zetten, gaat dus niet meer af op "de functie
 *    geeft het toch niet terug". Die garantie bestaat niet meer.
 *
 * ⚠️ Alleen de lópende periode. Binnen een periode betekent "nog niet
 *    afgesloten" precies dat en niets meer; zou dit scherm ook oude perioden
 *    tonen, dan wordt afwezigheid met terugwerkende kracht een oordeel.
 *
 * ⚠️ De id in de URL geeft geen toegang. `group_overview` is SECURITY INVOKER en
 *    `groups_select` eist lidmaatschap, dus een niet-lid krijgt niets — en dat
 *    ziet er hetzelfde uit als een groep die niet bestaat.
 */
export default function GroepDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();

  const {
    data: stand,
    loading,
    error,
    herlaad,
  } = useAsync(id && userId ? () => laadGroep(id, userId) : null, [id, userId]);

  return (
    <Screen
      terug={{ naar: '/groep' }}
      title={stand?.groep?.name ?? t('groepdetail.titel')}
      eyebrow={
        stand?.groep
          ? t('groepdetail.eyebrow', {
              dag: huddledagLabel(stand.groep.huddle_day).toUpperCase(),
            })
          : undefined
      }
    >
      <AsyncView
        loading={loading}
        error={error}
        data={stand ?? undefined}
        isEmpty={(s) => s.overzicht.rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: t('groepdetail.geen_lid_titel'),
          body: t('groepdetail.geen_lid_tekst'),
        }}
      >
        {(s) => (
          <View style={styles.lijst}>
            {/*
              ⚠️ **De stand hoort hier te staan en niet alleen op het beheerscherm.**
                 Tot 24-08 kon een gewoon lid nergens zien of zijn groep open of
                 beschermd was: de keuze stond op `groep/nieuw`, op het
                 beheerscherm (alleen beheerders) en op de uitnodigingspagina
                 (alleen vóór het meedoen). Het enige signaal daarna was één
                 chatregel — zonder pushmelding, want `0053_notificaties.sql` kent
                 dat soort niet. Wie drie dagen niet in de chat keek, wist het
                 niet.
                 Grens 3 van besluit A41 legt het omzetten naast een commitment
                 device, en dat is bij uitstek iets wat continu zichtbaar hoort te
                 zijn en niet één keer aangekondigd. Gevonden door beide
                 reviewrondes van 24-08.
            */}
            {s.groep === null ? null : (
              <Caption>
                {t('groepdetail.zichtbaarheid', {
                  stand: zichtbaarheidLabels()[s.groep.zichtbaarheid as Zichtbaarheid],
                })}
              </Caption>
            )}

            {s.groep?.status === 'sleeping' ? (
              <Card nested>
                <Body muted>{t('groepdetail.slaapt')}</Body>
              </Card>
            ) : null}

            {/*
              ⚠️ Bovenaan, vóór de ledenlijst. QS8-80 vraagt De Ketting als "de
                 belangrijkste gedeelde teller", en dat is een plaatsingskeuze:
                 het eerste wat je ziet is wat jullie sámen hebben, niet hoe
                 iedereen er los voor staat. Zou hij onder de ledenlijst staan,
                 dan lees je eerst de personen en daarna pas de groep.
            */}
            {s.ketting.staat === 'ok' ? (
              <Card>
                <Ketting stand={s.ketting.stand} />
              </Card>
            ) : null}

            {/*
              ⚠️ Een storing zegt dat hij een storing is. Hiervóór verdween De
                 Ketting bij een fout net zo geruisloos als bij "je bent geen
                 lid", en dan weet een lid niet of hij iets kapot ziet of niet.
            */}
            {s.ketting.staat === 'fout' ? (
              <Card nested>
                <Body muted>{t('groepdetail.ketting_mislukt')}</Body>
                <Button variant="stil" onPress={herlaad}>
                  {t('groepdetail.opnieuw')}
                </Button>
              </Card>
            ) : null}

            {/*
              ⚠️ De teller staat bij De Ketting en niet bij het klassement, want
                 het is hetzelfde soort getal: een optelling over de hele groep
                 zonder namen. Hij staat in béide zichtbaarheidstanden — dat is
                 de vorm die besluit A42 zelf al toestond.
            */}
            <SamenKaart uitkomst={s.teller} onOpnieuw={herlaad} />

            <Card>
              <Subheading>{t('groepscherm.wie_meedoen')}</Subheading>
              {/*
                ⚠️ "Nog niets deze week" is geen oordeel en de rij zegt dat ook
                   niet: MemberRow laat een leeg vak zien in plaats van een grijs
                   kruisje.
              */}
              <Caption>{t('groepdetail.bolletje_uitleg')}</Caption>

              {s.overzicht.rijen.map((lid) => (
                <MemberRow
                  key={lid.user_id}
                  name={lid.display_name}
                  streak={lid.current_streak ?? 0}
                  closedThisPeriod={lid.closed_this_period}
                  bestStreak={lid.best_streak}
                />
              ))}

              {s.overzicht.meer ? (
                <Caption>
                  {t('groepscherm.leden_van_totaal', {
                    getoond: s.overzicht.rijen.length,
                    totaal: s.overzicht.totaal,
                  })}
                </Caption>
              ) : null}

              {/*
                ⚠️ QS8-232. De ingang naar melden, blokkeren en — voor een
                   beheerder — iemand uit de groep zetten. Hij staat hier en niet
                   achter de beheerderinstellingen: die zijn onbereikbaar voor
                   precies de leden die dit nodig hebben.
              */}
              <Button variant="stil" block onPress={() => router.push(`/groep/leden/${id}`)}>
                {t('groepdetail.naar_leden')}
              </Button>
            </Card>

            {/*
              ⚠️ **Ná de ledenlijst en niet ervoor.** Het eerste wat je op dit
                 scherm ziet hoort te zijn wat jullie sámen hebben en wie er
                 meedoet; pas daarna hoe iedereen ervoor staat. Zou het
                 klassement bovenaan staan, dan is het eerste wat een lid van
                 zijn groep leest een ranglijst.

              ⚠️ Dit blok staat er in élke groep, en verbergt niets. In een
                 beschermde groep geeft `groep_klassement()` nul rijen terug en
                 rendert het niets — de regel van besluit A54 staat in 0141 en
                 niet hier. Een scherm dat de regel zelf zou moeten kennen, is
                 een regel die met één verzoek aan PostgREST te omzeilen valt.
            */}
            <KlassementKaart uitkomst={s.klassement} onOpnieuw={herlaad} />

            {/*
              ⚠️ Twee aparte schermen en niet één. De weekafsluiting is één kaart
                 die als een vergadering hoort te lezen; de chat is een doorlopend
                 gesprek. Zet je ze op één scherm, dan wordt de kaart een bericht
                 tussen de berichten — en dat is precies wat het acceptatiecriterium
                 van 7.5 uitsluit.
            */}
            <Card>
              <Subheading>{t('groepdetail.gesprek')}</Subheading>
              <Body muted>{t('groepdetail.gesprek_uitleg')}</Body>
              <Button
                variant="secundair"
                block
                onPress={() => router.push(`/groep/weekafsluiting/${id}`)}
              >
                {t('groepdetail.naar_weekafsluiting')}
              </Button>
              <Button variant="secundair" block onPress={() => router.push(`/groep/chat/${id}`)}>
                {t('groepdetail.naar_chat')}
              </Button>
            </Card>

            {s.groep === null ? null : (
              <Card>
                <Subheading>{t('groepdetail.uitnodigen')}</Subheading>
                <Body muted>{t('groepdetail.link_uitleg')}</Body>
                <Deelknop
                  label={t('groepdetail.deel')}
                  titel={t('groepdetail.deel_titel', { groep: s.groep.name })}
                  tekst={uitnodigingsLink(clientEnv().appUrl, s.groep.invite_code)}
                />
              </Card>
            )}

            {userId ? (
              <DeadlineVerzoeken groupId={id ?? ''} userId={userId} onBeslist={herlaad} />
            ) : null}

            {s.overzicht.rijen
              .filter((lid) => lid.goal_id !== null)
              .map((lid) => (
                <DoelKaart
                  key={lid.user_id}
                  lid={lid}
                  vanMij={lid.user_id === userId}
                  groupId={id ?? ''}
                  onGewijzigd={herlaad}
                />
              ))}

            <KoppelDoel
              groupId={id ?? ''}
              zichtbaarheid={(s.groep?.zichtbaarheid ?? 'beschermd') as Zichtbaarheid}
              onGekoppeld={herlaad}
            />

            {s.beheerder ? (
              <Button variant="secundair" block onPress={() => router.push(`/groep/beheer/${id}`)}>
                {t('groepdetail.beheren')}
              </Button>
            ) : null}

            {/*
              ⚠️ **Hier en niet op het beheerscherm.** Dat scherm is alleen voor
                 beheerders, en juist een gewoon lid moet kunnen vertrekken.
                 Onderaan, onder "Groep beheren", om dezelfde reden als de
                 archiefkaart daar onderaan staat: dit is de zwaarste knop op dit
                 scherm.
            */}
            <VerlaatGroep groupId={id ?? ''} userId={userId ?? ''} leden={s.overzicht.rijen} />
          </View>
        )}
      </AsyncView>

      <Button variant="stil" block onPress={() => router.replace('/groep')}>
        {t('groepdetail.naar_groepen')}
      </Button>
    </Screen>
  );
}

/**
 * Een groep verlaten — QS8-57, PRD 5.6.
 *
 * ⚠️ **De uitleg noemt wat er blíjft en niet alleen wat er weggaat.** Dat is de
 *    helft die iemand nodig heeft: wie niet weet of zijn reeks en zijn punten
 *    het vertrek overleven, blijft uit voorzorg in een groep zitten waar hij
 *    niet meer wil zijn. Domeinregel 10 zegt dat de reeks de gebruiker dient.
 *
 * ⚠️ **"Ben ik de laatste beheerder" is hier een UI-hint en geen autorisatie.**
 *    De afleiding uit de al geladen ledenlijst bepaalt alleen óf de
 *    opvolgerkeuze getoond wordt. Heeft dit scherm het mis — een verouderde
 *    lijst, een tweede tabblad dat net iemand promoveerde — dan weigert de RPC
 *    met `last_admin` en staat die melding eronder. De grens ligt in de
 *    database, zoals altijd.
 *
 * ⚠️ **Geen tweede query voor de opvolgerkeuze.** De ledenlijst is al geladen en
 *    een groep is op twaalf leden gemaximeerd, dus pagina 0 bevat ze altijd. Een
 *    eigen `fetch` hier zou een N+1 zijn op het drukste scherm van de app
 *    (schaalbaarheidsregel 12).
 */
function VerlaatGroep({
  groupId,
  userId,
  leden,
}: {
  readonly groupId: string;
  readonly userId: string;
  readonly leden: readonly Groepslid[];
}) {
  const router = useRouter();
  const [vraag, setVraag] = useState(false);
  const [opvolger, setOpvolger] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // ⚠️ `!== 'inactive'` en niet `=== 'active'`. Dat is de definitie die migratie
  //    0066 (M1) als de enige juiste heeft vastgelegd, en het is dezelfde die
  //    `verlaat_groep()` gebruikt. Zouden deze twee uiteenlopen, dan toont dit
  //    scherm een keuze die de database weigert, of andersom.
  const anderen = leden.filter((l) => l.user_id !== userId && l.member_status !== 'inactive');
  const ikBenBeheerder = leden.some((l) => l.user_id === userId && l.role === 'admin');
  const andereBeheerders = anderen.filter((l) => l.role === 'admin').length;
  const laatsteBeheerder = ikBenBeheerder && andereBeheerders === 0 && anderen.length > 0;
  const laatsteLid = anderen.length === 0;

  async function verlaat() {
    setBezig(true);
    setFout(null);

    const uitkomst = await verlaatGroep(groupId, true, opvolger ?? undefined);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    // ⚠️ Weglopen en niet herladen, dezelfde reden als bij `archiveerGroep()`:
    //    `is_group_member()` is direct hierna onwaar, dus elke query op dit
    //    scherm geeft leeg terug en de gebruiker zou een lege staat zien als
    //    antwoord op een geslaagde handeling. `bezig` blijft staan tot de
    //    navigatie voorbij is.
    router.replace('/groep');
  }

  return (
    <Card>
      <Subheading>{t('verlaten.titel')}</Subheading>
      <Body muted>{t('verlaten.uitleg')}</Body>
      <Caption>{t('verlaten.blijft')}</Caption>

      {laatsteLid ? <Caption>{t('verlaten.laatste_lid')}</Caption> : null}

      {vraag ? (
        <>
          {laatsteBeheerder ? (
            <Choice
              label={t('verlaten.opvolger_titel')}
              hint={t('verlaten.opvolger_uitleg')}
              opties={anderen.map((l) => ({ waarde: l.user_id, label: l.display_name }))}
              waarde={opvolger ?? ''}
              onKies={(waarde) => setOpvolger(waarde)}
              disabled={bezig}
            />
          ) : null}

          <Bevestiging
            tekst={bevestigingen().groepVerlaten}
            bezig={bezig}
            fout={fout}
            // ⚠️ Bevestigen kan pas als er een opvolger gekozen is. De RPC
            //    weigert het anders alsnog met `last_admin`, maar een knop die
            //    je mag indrukken en dan een fout geeft, is een slechtere knop
            //    dan een knop die wacht.
            onBevestig={() => {
              if (laatsteBeheerder && opvolger === null) {
                setFout(t('verlaten.laatste_beheerder'));
                return;
              }
              void verlaat();
            }}
            onAnnuleer={() => {
              setVraag(false);
              setFout(null);
            }}
          />
        </>
      ) : (
        <Button variant="secundair" block onPress={() => setVraag(true)}>
          {t('verlaten.knop')}
        </Button>
      )}
    </Card>
  );
}

/**
 * Verzoeken om een streefdatum te verschuiven — Q-TODO A7.
 *
 * ⚠️ Dit is een uitzondering op domeinregel 7 die Quinten zelf gemaakt heeft, en
 *    hij past in het patroon dat de regel beschrijft: de tegenslag komt via de
 *    persoon zélf. Hij schrijft het argument en drukt op verzenden. Wat hier
 *    staat is dus zijn mededeling, geen afgeleide van zijn falen.
 *
 * ⚠️ Je eigen verzoek staat er niet bij; dat zie je op je eigen doel. En je kunt
 *    het niet zelf goedkeuren — dat weigert de RPC, niet dit scherm.
 *
 * ⚠️ Alleen open verzoeken. Een lijst met afgewezen verzoeken erbij zou van deze
 *    kaart een register maken van wie het niet gehaald heeft, en dat is precies
 *    wat er niet mag.
 */
function DeadlineVerzoeken({
  groupId,
  userId,
  onBeslist,
}: {
  readonly groupId: string;
  readonly userId: string;
  readonly onBeslist: () => void;
}) {
  const [verzoeken, setVerzoeken] = useState<readonly DeadlineVerzoek[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [afwijzen, setAfwijzen] = useState<string | null>(null);
  const [reden, setReden] = useState('');

  useEffect(() => {
    if (groupId === '' || userId === '') return;
    let levend = true;

    fetchOpenVerzoekenVoorGroep(groupId, userId)
      .then((rijen) => {
        if (!levend) return;
        setVerzoeken(rijen);
        setError(null);
      })
      .catch((f: unknown) => {
        if (levend) setError(f);
      })
      .finally(() => {
        if (levend) setLoading(false);
      });

    return () => {
      levend = false;
    };
  }, [groupId, userId]);

  async function beslis(verzoekId: string, akkoord: boolean) {
    setBezig(verzoekId);
    setFout(null);

    const uitkomst = await beslisDeadlineVerzoek(
      verzoekId,
      akkoord,
      akkoord ? null : reden,
    );
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setAfwijzen(null);
    setReden('');
    setVerzoeken((rijen) => (rijen ?? []).filter((r) => r.id !== verzoekId));
    onBeslist();
  }

  // ⚠️ Geen lege kaart als er niets te beslissen valt. Dit blok hoort alleen te
  //    bestaan als iemand iets gevraagd heeft; anders is het een vaste
  //    herinnering aan een uitzondering die zelden voorkomt.
  if (!loading && error === null && (verzoeken === null || verzoeken.length === 0)) {
    return null;
  }

  return (
    <Card>
      <Subheading>{t('groepscherm.meer_tijd')}</Subheading>

      <AsyncView
        loading={loading}
        error={error}
        data={verzoeken ?? undefined}
        isEmpty={(v) => v.length === 0}
        empty={{
          title: t('deadlineverzoek.leeg_titel'),
          body: t('deadlineverzoek.leeg_tekst'),
        }}
      >
        {(rijen) => (
          <>
            {rijen.map((verzoek) => (
              <Card key={verzoek.id} nested>
                <Body>
                  {t('deadlineverzoek.van_naar', {
                    oud: verzoek.old_date,
                    nieuw: verzoek.new_date,
                  })}
                </Body>
                <Body muted>&ldquo;{verzoek.reason}&rdquo;</Body>
                {/*
                  ⚠️ Allebei `secundair`, net als op het beoordeelscherm. Geen
                     primair/secundair-verhouding, want die maakt van de ene knop
                     het goede antwoord.
                */}
                {afwijzen === verzoek.id ? (
                  <>
                    {/*
                      ⚠️ Afwijzen zonder één woord uitleg is het soort nee dat een
                         groep van drie kapotmaakt. De kolom bestond al en werd
                         nergens gevuld; nu wel, en optioneel — een verplicht veld
                         levert "nee" op als tekst.
                    */}
                    <Field
                      label={t('deadlineverzoek.reden_label')}
                      hint={t('deadlineverzoek.reden_hint')}
                      value={reden}
                      onChangeText={setReden}
                      multiline
                      maxLength={1000}
                      placeholder={t('deadlineverzoek.reden_voorbeeld')}
                    />
                    <View style={styles.knoppen}>
                      <Button
                        variant="secundair"
                        busy={bezig === verzoek.id}
                        onPress={() => void beslis(verzoek.id, false)}
                      >
                        {t('deadlineverzoek.versturen')}
                      </Button>
                      <Button
                        variant="stil"
                        disabled={bezig !== null}
                        onPress={() => {
                          setAfwijzen(null);
                          setReden('');
                        }}
                      >
                        {t('deadlineverzoek.toch_niet')}
                      </Button>
                    </View>
                  </>
                ) : (
                  <View style={styles.knoppen}>
                    <Button
                      variant="secundair"
                      busy={bezig === verzoek.id}
                      onPress={() => void beslis(verzoek.id, true)}
                    >
                      {t('deadlineverzoek.akkoord')}
                    </Button>
                    <Button
                      variant="secundair"
                      disabled={bezig !== null}
                      onPress={() => setAfwijzen(verzoek.id)}
                    >
                      {t('deadlineverzoek.liever_niet')}
                    </Button>
                  </View>
                )}
              </Card>
            ))}
          </>
        )}
      </AsyncView>

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/** Het doel van één lid, zoals de groep het mag zien. */
function DoelKaart({
  lid,
  vanMij,
  groupId,
  onGewijzigd,
}: {
  readonly lid: Groepslid;
  readonly vanMij: boolean;
  readonly groupId: string;
  readonly onGewijzigd: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function ontkoppel() {
    if (lid.goal_id === null) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await ontkoppelDoelVanGroep(lid.goal_id, groupId);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onGewijzigd();
  }

  return (
    <Card nested>
      <Subheading>{lid.display_name}</Subheading>
      <Body>{lid.goal_title}</Body>

      {/*
        ⚠️ MilestoneProgress en geen scorebalk. Voortgang is mijlpaalgebaseerd en
           loopt alleen omhoog; de score kan dalen en is bovendien privé
           (domeinregel 10). Die twee in één balk proppen is precies het gevoel
           dat mensen deze app laat verwijderen.
      */}
      <MilestoneProgress done={lid.milestones_done} total={lid.milestones_total} />

      {lid.goal_target_date === null ? null : (
        <Caption>{t('algemeen.streefdatum', { datum: lid.goal_target_date })}</Caption>
      )}

      {/*
        ⚠️ Alleen op je eigen kaart, en hij moet er zijn. De hele module leunt op
           "koppelen is de toestemming"; een toestemming die je niet kunt
           intrekken is er geen. Ontkoppelen wist niets — het stopt alleen de
           zichtbaarheid in déze groep.
      */}
      {vanMij ? (
        <>
          <Button variant="stil" busy={bezig} onPress={() => void ontkoppel()}>
            {t('koppel.ontkoppel')}
          </Button>
          {fout === null ? null : <Caption danger>{fout}</Caption>}
        </>
      ) : null}
    </Card>
  );
}

/**
 * Een eigen doel aan deze groep koppelen — QS8-54.
 *
 * ⚠️ Koppelen is de toestemming, en daarom een aparte handeling. Tot dit gebeurt
 *    staat je doel in geen enkele ledenlijst, ook niet van een groep waar je wél
 *    in zit. Hetzelfde doel kan in groep A staan en in groep B niet.
 *
 * ⚠️ Ook dit blok heeft alle drie de staten. Een eerdere versie slikte een
 *    laadfout in en gaf dan hetzelfde beeld als "je hebt geen doelen": niets. Dat
 *    is een stille storing met een zichtbaar gevolg — je kunt je doel niet delen
 *    en je weet niet waarom.
 */
function KoppelDoel({
  groupId,
  zichtbaarheid,
  onGekoppeld,
}: {
  readonly groupId: string;
  /**
   * ⚠️ **Deze prop bestaat omdat de uitleg erboven anders liegt.** Tot 24-08 stond
   *    er onvoorwaardelijk "niet je weken"; sinds migratie 0077 deelt koppelen in
   *    een open groep élke weekdoelrij, inclusief de gemiste. De zin staat boven
   *    de knop, dus de app deed die belofte precies op het moment van toestemming.
   *
   *    Onbekend valt terug op `beschermd` — dan is de zin hooguit te
   *    voorzichtig, en dat is de goede kant om fout te zitten.
   */
  readonly zichtbaarheid: Zichtbaarheid;
  readonly onGekoppeld: () => void;
}) {
  const router = useRouter();
  const { userId } = useSession();

  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const { data: doelen, loading, error } = useAsync(
    userId && groupId !== ''
      ? async () => {
          const [mijn, gekoppeld] = await Promise.all([
            fetchDoelen(userId),
            fetchGekoppeldeDoelIds(groupId),
          ]);
          return mijn.rijen.filter((doel) => !gekoppeld.includes(doel.id));
        }
      : null,
    [userId, groupId],
  );

  async function koppel(goalId: string) {
    setBezig(goalId);
    setFout(null);

    const uitkomst = await koppelDoelAanGroep(goalId, groupId);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onGekoppeld();
  }

  return (
    <Card>
      <Subheading>{t('koppel.titel')}</Subheading>
      <Body muted>
        {zichtbaarheid === 'open' ? t('koppel.uitleg_open') : t('koppel.uitleg_beschermd')}
      </Body>

      <AsyncView
        loading={loading}
        error={error}
        data={doelen ?? undefined}
        isEmpty={(d) => d.length === 0}
        empty={{
          title: t('koppel.geen_doel_titel'),
          body: t('koppel.geen_doel_tekst'),
        }}
      >
        {(lijst) => (
          <>
            {lijst.map((doel) => (
              <Button
                key={doel.id}
                variant="secundair"
                block
                busy={bezig === doel.id}
                onPress={() => void koppel(doel.id)}
              >
                {doel.title}
              </Button>
            ))}
          </>
        )}
      </AsyncView>

      {doelen !== undefined && doelen.length === 0 ? (
        <Button variant="secundair" block onPress={() => router.push('/doel/nieuw')}>
          {t('koppel.nieuw_doel')}
        </Button>
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * De twee optellende groepstotalen — QS8-254.
 *
 * ⚠️ **Bij nul zwijgt hij.** "Samen 0 weken afgerond" is een tegenslagbericht met
 *    een vrolijke kop erop; dezelfde afweging die de seizoensrecap in 0112
 *    maakte, en om precies dezelfde reden. In plaats daarvan staat er waar de
 *    teller straks komt te staan.
 */
function SamenKaart({
  uitkomst,
  onOpnieuw,
}: {
  readonly uitkomst: TellerUitkomst;
  readonly onOpnieuw: () => void;
}) {
  if (uitkomst.staat === 'geen-lid') return null;

  if (uitkomst.staat === 'fout') {
    return (
      <Card nested>
        <Body muted>{t('klassement.teller_mislukt')}</Body>
        <Button variant="stil" onPress={onOpnieuw}>
          {t('klassement.opnieuw')}
        </Button>
      </Card>
    );
  }

  const { weken, mijlpalen } = uitkomst.teller;

  return (
    <Card>
      <Subheading>{t('teller.kop')}</Subheading>
      {weken === 0 && mijlpalen === 0 ? (
        <Body muted>{t('teller.nog_niets')}</Body>
      ) : (
        <>
          <Body>{weken === 1 ? t('teller.weken_een') : t('teller.weken_meer', { n: weken })}</Body>
          {mijlpalen === 0 ? null : (
            <Caption>
              {mijlpalen === 1
                ? t('teller.mijlpalen_een')
                : t('teller.mijlpalen_meer', { n: mijlpalen })}
            </Caption>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Het klassement van een open groep — QS8-254, besluit A54.
 *
 * ⚠️ **Er is geen tak voor "beschermde groep".** Dit component weet niet wat
 *    `groups.zichtbaarheid` is en hoeft dat niet te weten: in een beschermde
 *    groep komen er nul rijen binnen en rendert het niets. Zou het scherm de
 *    stand zélf lezen en de kaart verbergen, dan zou de RPC hem alsnog uitleveren
 *    aan wie er rechtstreeks om vraagt.
 *
 * ⚠️ **Er staat geen enkel minteken op dit scherm, en dat kán ook niet.** Een
 *    `Klassementsrij` heeft een totaal en een positie en verder niets — geen
 *    delta, geen datum. Die kolommen bestaan niet in `groep_klassement()`.
 */
function KlassementKaart({
  uitkomst,
  onOpnieuw,
}: {
  readonly uitkomst: KlassementUitkomst;
  readonly onOpnieuw: () => void;
}) {
  if (uitkomst.staat === 'fout') {
    return (
      <Card nested>
        <Body muted>{t('klassement.laden_mislukt')}</Body>
        <Button variant="stil" onPress={onOpnieuw}>
          {t('klassement.opnieuw')}
        </Button>
      </Card>
    );
  }

  const { rijen, totaal, meer } = uitkomst.pagina;

  // Nul rijen betekent "deze groep is beschermd" of "je bent geen lid". Allebei
  // is de juiste uitkomst niets, en niet een lege kaart met een kop erboven.
  if (rijen.length === 0) return null;

  const iedereenOpNul = rijen.every((rij) => rij.punten === 0);

  return (
    <Card>
      <Subheading>{t('klassement.kop')}</Subheading>
      <Caption>{t('klassement.uitleg')}</Caption>

      {iedereenOpNul ? (
        <Body muted>{t('klassement.leeg')}</Body>
      ) : (
        rijen.map((rij) => <KlassementRij key={rij.userId} rij={rij} />)
      )}

      {meer ? (
        <Caption>{t('klassement.van_totaal', { getoond: rijen.length, totaal })}</Caption>
      ) : null}
    </Card>
  );
}

/** Eén regel: plek, naam, punten. Meer valt er niet te tonen. */
function KlassementRij({ rij }: { readonly rij: Klassementsrij }) {
  const punten =
    rij.punten === 1 ? t('klassement.punten_een') : t('klassement.punten_meer', { n: rij.punten });

  return (
    <View
      style={styles.klassementRij}
      accessible
      accessibilityLabel={t('klassement.rij_label', {
        positie: rij.positie,
        naam: rij.naam,
        punten,
      })}
    >
      <Caption>{rij.positie}</Caption>
      <Body>{rij.naam}</Body>
      <Caption>{punten}</Caption>
    </View>
  );
}

/**
 * De uitkomst van De Ketting, met drie standen in plaats van twee.
 *
 * ⚠️ `geen-lid` en `fout` zagen er eerst hetzelfde uit — allebei een leeg
 *    scherm zonder uitleg. Een lid dat door een storing niets zag, kon niet
 *    weten of dat normaal was. Bevinding van de gebruikersreview.
 */
type KettingUitkomst =
  | { readonly staat: 'ok'; readonly stand: KettingStand }
  | { readonly staat: 'geen-lid' }
  | { readonly staat: 'fout' };

/**
 * De teller en het klassement, met dezelfde drie standen als De Ketting.
 *
 * ⚠️ Dat `geen-lid` en `fout` uit elkaar gehouden worden, is hier geen kopie van
 *    de vorm maar dezelfde bevinding: een lid dat door een storing niets ziet,
 *    hoort iets anders te zien dan een buitenstaander.
 *
 * ⚠️ Het klassement heeft een vierde geval dat de Ketting niet kent, en dat is
 *    het belangrijkste van dit scherm: **een beschermde groep krijgt nul rijen**.
 *    Dat is geen fout en geen leegte, maar de regel van besluit A54 — en het
 *    scherm hoeft die regel niet te kennen, want de RPC geeft dan gewoon niets.
 */
type TellerUitkomst =
  | { readonly staat: 'ok'; readonly teller: Groepsteller }
  | { readonly staat: 'geen-lid' }
  | { readonly staat: 'fout' };

type KlassementUitkomst =
  | { readonly staat: 'ok'; readonly pagina: Pagina<Klassementsrij> }
  | { readonly staat: 'fout' };

interface Stand {
  readonly groep: Groep | null;
  readonly overzicht: Pagina<Groepslid>;
  readonly beheerder: boolean;
  readonly ketting: KettingUitkomst;
  readonly teller: TellerUitkomst;
  readonly klassement: KlassementUitkomst;
}

/**
 * De groep, zijn overzicht en je eigen rol.
 *
 * ⚠️ De groepsperiode wordt hier bepaald met `huidigeGroepsperiode()` uit
 *    `shared/time`, en niet in SQL. De database kent de huddledag en de tijdzone
 *    wel, maar mag er niet mee rekenen (CLAUDE.md, correctheidsregel 7).
 *
 * ⚠️ Het beheerderschap komt uit `fetchMijnLidmaatschap()` en niet uit een regel
 *    van het overzicht. Dat scheelt geen verzoek, maar het koppelt een
 *    autorisatie-afgeleide niet aan de vraag of je toevallig op pagina één staat.
 */
async function laadGroep(groupId: string, userId: string): Promise<Stand> {
  const groep = await fetchGroep(groupId);

  if (groep === null) {
    return {
      groep: null,
      overzicht: { rijen: [], totaal: 0, meer: false },
      beheerder: false,
      ketting: { staat: 'geen-lid' },
      teller: { staat: 'geen-lid' },
      klassement: { staat: 'ok', pagina: { rijen: [], totaal: 0, meer: false } },
    };
  }

  // ⚠️ Dezelfde periode voor het overzicht én voor De Ketting. Zou elk zijn
  //    eigen `huidigeGroepsperiode()` aanroepen, dan kan er een cyclusgrens
  //    tussen vallen en toont het scherm twee verschillende weken naast elkaar.
  const periode = huidigeGroepsperiode(groep);

  // ⚠️ De Ketting draagt zijn eigen fout en trekt het scherm niet mee. Zat hij
  //    kaal in deze `Promise.all`, dan zette één hik in `ketting_stand()` het
  //    hele groepsoverzicht in de foutstand — ledenlijst, chat en al. Bevinding
  //    van de security- en de gebruikersreview, allebei.
  const [overzicht, lidmaatschap, ketting, teller, klassement] = await Promise.all([
    fetchGroepsoverzicht(groupId, periode),
    fetchMijnLidmaatschap(groupId, userId),
    fetchKettingStand(groupId, periode)
      .then((stand): KettingUitkomst =>
        stand === null ? { staat: 'geen-lid' } : { staat: 'ok', stand },
      )
      .catch((): KettingUitkomst => ({ staat: 'fout' })),
    // ⚠️ Om dezelfde reden als De Ketting dragen deze twee hun eigen fout: één
    //    hik in een teller hoort de ledenlijst en de chat niet mee te nemen.
    fetchGroepsteller(groupId)
      .then((teller): TellerUitkomst =>
        teller === null ? { staat: 'geen-lid' } : { staat: 'ok', teller },
      )
      .catch((): TellerUitkomst => ({ staat: 'fout' })),
    fetchKlassement(groupId)
      .then((pagina): KlassementUitkomst => ({ staat: 'ok', pagina }))
      .catch((): KlassementUitkomst => ({ staat: 'fout' })),
  ]);

  return {
    groep,
    overzicht,
    beheerder: lidmaatschap?.role === 'admin',
    ketting,
    teller,
    klassement,
  };
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  klassementRij: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.blokGap - 3,
  },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
