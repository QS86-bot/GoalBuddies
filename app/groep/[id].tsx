import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { clientEnv } from '@/lib/env';
import { useSession } from '@/modules/auth';
import {
  fetchGekoppeldeDoelIds,
  fetchGroep,
  fetchGroepsoverzicht,
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
import { space } from '@/shared/theme';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Deelknop,
  MemberRow,
  MilestoneProgress,
  Screen,
  Subheading,
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
      title={stand?.groep?.name ?? 'Groep'}
      eyebrow={
        stand?.groep ? `HUDDLEDAG ${huddledagLabel(stand.groep.huddle_day).toUpperCase()}` : undefined
      }
    >
      <AsyncView
        loading={loading}
        error={error}
        data={stand ?? undefined}
        isEmpty={(s) => s.overzicht.rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: 'Deze groep is er niet, of niet voor jou',
          body:
            'Je bent geen lid van deze groep, of hij bestaat niet meer. Vraag om een ' +
            'nieuwe uitnodigingslink als je erbij hoort.',
        }}
      >
        {(s) => (
          <View style={styles.lijst}>
            {s.groep?.status === 'sleeping' ? (
              <Card nested>
                <Body muted>
                  Deze groep slaapt: er is een tijd niets gebeurd, dus de herinneringen zijn
                  gestopt. Sluit iemand een week af, dan is hij meteen weer wakker.
                </Body>
              </Card>
            ) : null}

            <Card>
              <Subheading>Wie er meedoen</Subheading>
              {/*
                ⚠️ "Nog niets deze week" is geen oordeel en de rij zegt dat ook
                   niet: MemberRow laat een leeg vak zien in plaats van een grijs
                   kruisje.
              */}
              <Caption>
                Het bolletje betekent: deze week al afgesloten. Geen bolletje betekent nog
                niet, meer niet.
              </Caption>

              {s.overzicht.rijen.map((lid) => (
                <MemberRow
                  key={lid.user_id}
                  name={lid.display_name}
                  streak={lid.current_streak ?? 0}
                  closedThisPeriod={lid.closed_this_period}
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
              <Subheading>Het gesprek</Subheading>
              <Body muted>
                De weekafsluiting is het vaste moment op de huddledag: drie vragen, en de
                antwoorden van iedereen op één kaart. De chat is voor de rest van de week.
              </Body>
              <Button
                variant="secundair"
                block
                onPress={() => router.push(`/groep/weekafsluiting/${id}`)}
              >
                De weekafsluiting
              </Button>
              <Button variant="secundair" block onPress={() => router.push(`/groep/chat/${id}`)}>
                Groepschat
              </Button>
            </Card>

            {s.groep === null ? null : (
              <Card>
                <Subheading>Iemand uitnodigen</Subheading>
                <Body muted>
                  Wie deze link opent, ziet de groep en hoeveel mensen erin zitten — ook
                  zonder account. Deel hem alleen met mensen die je erbij wilt.
                </Body>
                <Deelknop
                  label="Deel de uitnodiging"
                  titel={`Doe mee met ${s.groep.name}`}
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
                Groep beheren
              </Button>
            ) : null}
          </View>
        )}
      </AsyncView>

      <Button variant="stil" block onPress={() => router.replace('/groep')}>
        Naar mijn groepen
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

    const uitkomst = await beslisDeadlineVerzoek(verzoekId, akkoord, null);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

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
      <Subheading>Een buddy vraagt om meer tijd</Subheading>

      <AsyncView
        loading={loading}
        error={error}
        data={verzoeken ?? undefined}
        isEmpty={(v) => v.length === 0}
        empty={{
          title: 'Niets te beslissen',
          body: 'Zodra iemand om een nieuwe streefdatum vraagt, staat het hier.',
        }}
      >
        {(rijen) => (
          <>
            {rijen.map((verzoek) => (
              <Card key={verzoek.id} nested>
                <Body>
                  Van {verzoek.old_date} naar {verzoek.new_date}.
                </Body>
                <Body muted>&ldquo;{verzoek.reason}&rdquo;</Body>
                {/*
                  ⚠️ Allebei `secundair`, net als op het beoordeelscherm. Geen
                     primair/secundair-verhouding, want die maakt van de ene knop
                     het goede antwoord.
                */}
                <View style={styles.knoppen}>
                  <Button
                    variant="secundair"
                    busy={bezig === verzoek.id}
                    onPress={() => void beslis(verzoek.id, true)}
                  >
                    Akkoord
                  </Button>
                  <Button
                    variant="secundair"
                    disabled={bezig !== null}
                    onPress={() => void beslis(verzoek.id, false)}
                  >
                    Liever niet
                  </Button>
                </View>
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
            Niet meer delen met deze groep
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
      <Subheading>Je doel delen met deze groep</Subheading>
      <Body muted>
        Zolang je niets koppelt, ziet niemand hier waar je aan werkt. Koppelen deelt de
        titel en je mijlpaalvoortgang — niet je notities, niet je weken en niet je punten.
        Je kunt het altijd weer ongedaan maken.
      </Body>

      <AsyncView
        loading={loading}
        error={error}
        data={doelen ?? undefined}
        isEmpty={(d) => d.length === 0}
        empty={{
          title: 'Je hebt nog geen doel om te delen',
          body:
            'Begin met één doel met een datum erop. Daarna kun je het hier aan deze groep ' +
            'koppelen.',
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
          Nieuw doel
        </Button>
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

interface Stand {
  readonly groep: Groep | null;
  readonly overzicht: Pagina<Groepslid>;
  readonly beheerder: boolean;
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
    return { groep: null, overzicht: { rijen: [], totaal: 0, meer: false }, beheerder: false };
  }

  const periode = huidigeGroepsperiode(groep);
  const [overzicht, lidmaatschap] = await Promise.all([
    fetchGroepsoverzicht(groupId, periode),
    fetchMijnLidmaatschap(groupId, userId),
  ]);

  return { groep, overzicht, beheerder: lidmaatschap?.role === 'admin' };
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
  knoppen: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
