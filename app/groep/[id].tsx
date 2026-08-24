import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientEnv } from '@/lib/env';
import { useSession } from '@/modules/auth';
import {
  fetchGekoppeldeDoelIds,
  fetchGroep,
  fetchGroepsoverzicht,
  fetchKettingStand,
  fetchMijnLidmaatschap,
  huddledagLabel,
  huidigeGroepsperiode,
  koppelDoelAanGroep,
  ontkoppelDoelVanGroep,
  uitnodigingsLink,
  type Groep,
  type Groepslid,
  type Pagina,
} from '@/modules/buddies';
import {
  beslisDeadlineVerzoek,
  fetchDoelen,
  fetchOpenVerzoekenVoorGroep,
  type DeadlineVerzoek,
  type DoelMetVoortgang,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
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
 *    weken, geen beste reeks (want `best_streak > current_streak` verraadt een
 *    verbroken reeks), geen "loopt achter", geen geschiedenis van eerdere
 *    perioden. De databasefunctie geeft die kolommen niet eens terug (migratie
 *    0016 en 0019), en er staat een test op die dat vasthoudt.
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

  const [stand, setStand] = useState<Stand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    if (!id || !userId) return;
    let levend = true;

    laadGroep(id, userId)
      .then((uitkomst) => {
        if (!levend) return;
        setStand(uitkomst);
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
  }, [id, userId, ronde]);

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  return (
    <Screen
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
                  {s.overzicht.rijen.length} van {s.overzicht.totaal} leden.
                </Caption>
              ) : null}
            </Card>

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

            <KoppelDoel groupId={id ?? ''} onGekoppeld={herlaad} />

            {s.beheerder ? (
              <Button variant="secundair" block onPress={() => router.push(`/groep/beheer/${id}`)}>
                {t('groepdetail.beheren')}
              </Button>
            ) : null}
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
        <Caption>Streefdatum {lid.goal_target_date}</Caption>
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
  onGekoppeld,
}: {
  readonly groupId: string;
  readonly onGekoppeld: () => void;
}) {
  const router = useRouter();
  const { userId } = useSession();

  const [doelen, setDoelen] = useState<readonly DoelMetVoortgang[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || groupId === '') return;
    let levend = true;

    Promise.all([fetchDoelen(userId), fetchGekoppeldeDoelIds(groupId)])
      .then(([mijn, gekoppeld]) => {
        if (!levend) return;
        setDoelen(mijn.rijen.filter((doel) => !gekoppeld.includes(doel.id)));
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
  }, [userId, groupId]);

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
        {t('koppel.uitleg')}
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

      {doelen !== null && doelen.length === 0 ? (
        <Button variant="secundair" block onPress={() => router.push('/doel/nieuw')}>
          {t('koppel.nieuw_doel')}
        </Button>
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
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

interface Stand {
  readonly groep: Groep | null;
  readonly overzicht: Pagina<Groepslid>;
  readonly beheerder: boolean;
  readonly ketting: KettingUitkomst;
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
  const [overzicht, lidmaatschap, ketting] = await Promise.all([
    fetchGroepsoverzicht(groupId, periode),
    fetchMijnLidmaatschap(groupId, userId),
    fetchKettingStand(groupId, periode)
      .then((stand): KettingUitkomst =>
        stand === null ? { staat: 'geen-lid' } : { staat: 'ok', stand },
      )
      .catch((): KettingUitkomst => ({ staat: 'fout' })),
  ]);

  return { groep, overzicht, beheerder: lidmaatschap?.role === 'admin', ketting };
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
