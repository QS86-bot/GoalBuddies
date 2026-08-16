import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import {
  fetchGekoppeldeDoelIds,
  fetchGroep,
  fetchGroepsoverzicht,
  huddledagLabel,
  huidigeGroepsperiode,
  koppelDoelAanGroep,
  type Groep,
  type Groepslid,
  type Pagina,
} from '@/modules/buddies';
import { fetchDoelen, type DoelMetVoortgang } from '@/modules/goals';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
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
 *    reeks (opdagen) en of iemand deze periode al afgesloten heeft.
 *
 *    Wat er níét staat, staat er met opzet niet: geen puntentotaal, geen gemiste
 *    weken, geen "loopt achter", geen geschiedenis van eerdere perioden. De
 *    databasefunctie geeft die kolommen niet eens terug (migratie 0016), en er
 *    staat een test op die dat vasthoudt.
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

  const [groep, setGroep] = useState<Groep | null>(null);
  const [pagina, setPagina] = useState<Pagina<Groepslid> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    if (!id) return;
    let levend = true;

    laadGroep(id)
      .then((uitkomst) => {
        if (!levend) return;
        setGroep(uitkomst.groep);
        setPagina(uitkomst.overzicht);
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

  const herlaad = useCallback(() => setRonde((n) => n + 1), []);

  const ikBenBeheerder =
    pagina?.rijen.some((lid) => lid.user_id === userId && lid.role === 'admin') ?? false;
  const ikHebGekoppeld =
    pagina?.rijen.some((lid) => lid.user_id === userId && lid.goal_id !== null) ?? false;

  return (
    <Screen
      title={groep?.name ?? 'Groep'}
      eyebrow={groep ? `HUDDLEDAG ${huddledagLabel(groep.huddle_day).toUpperCase()}` : undefined}
    >
      {groep?.status === 'sleeping' ? (
        <Card nested>
          <Body muted>
            Deze groep slaapt: er is een tijd niets gebeurd, dus de herinneringen zijn
            gestopt. Sluit iemand een week af, dan is hij meteen weer wakker.
          </Body>
        </Card>
      ) : null}

      <AsyncView
        loading={loading}
        error={error}
        data={pagina ?? undefined}
        isEmpty={(p) => p.rijen.length === 0}
        onRetry={herlaad}
        empty={{
          title: 'Deze groep is er niet, of niet voor jou',
          body:
            'Je bent geen lid van deze groep, of hij bestaat niet meer. Vraag om een ' +
            'nieuwe uitnodigingslink als je erbij hoort.',
        }}
      >
        {(p) => (
          <View style={styles.lijst}>
            <Card>
              <Subheading>Wie er meedoen</Subheading>
              {/*
                ⚠️ "Nog niets deze week" is geen oordeel en de rij zegt dat ook
                   niet: MemberRow laat gewoon een leeg vak zien in plaats van
                   een grijs kruisje.
              */}
              <Caption>
                Het bolletje betekent: deze week al afgesloten. Geen bolletje betekent nog
                niet, meer niet.
              </Caption>

              {p.rijen.map((lid) => (
                <MemberRow
                  key={lid.user_id}
                  name={lid.display_name}
                  streak={lid.current_streak ?? 0}
                  closedThisPeriod={lid.closed_this_period}
                />
              ))}

              {p.meer ? (
                <Caption>
                  {p.rijen.length} van {p.totaal} leden.
                </Caption>
              ) : null}
            </Card>

            {p.rijen
              .filter((lid) => lid.goal_id !== null)
              .map((lid) => (
                <DoelKaart key={lid.user_id} lid={lid} />
              ))}
          </View>
        )}
      </AsyncView>

      {!ikHebGekoppeld && id ? <KoppelDoel groupId={id} onGekoppeld={herlaad} /> : null}

      {ikBenBeheerder && id ? (
        <Button variant="secundair" block onPress={() => router.push(`/groep/beheer/${id}`)}>
          Groep beheren
        </Button>
      ) : null}

      <Button variant="stil" block onPress={() => router.replace('/groep')}>
        Naar mijn groepen
      </Button>
    </Screen>
  );
}

/** Het doel van één lid, zoals de groep het mag zien. */
function DoelKaart({ lid }: { readonly lid: Groepslid }) {
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
    </Card>
  );
}

/**
 * Een eigen doel aan deze groep koppelen — QS8-54.
 *
 * ⚠️ Koppelen is de toestemming, en daarom een aparte handeling. Tot dit gebeurt
 *    staat je doel in geen enkele ledenlijst, ook niet van een groep waar je wél
 *    in zit. Hetzelfde doel kan in groep A staan en in groep B niet.
 */
function KoppelDoel({
  groupId,
  onGekoppeld,
}: {
  readonly groupId: string;
  readonly onGekoppeld: () => void;
}) {
  const { userId } = useSession();
  const [doelen, setDoelen] = useState<readonly DoelMetVoortgang[]>([]);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let levend = true;

    Promise.all([fetchDoelen(userId), fetchGekoppeldeDoelIds(groupId)])
      .then(([mijn, gekoppeld]) => {
        if (!levend) return;
        setDoelen(mijn.rijen.filter((doel) => !gekoppeld.includes(doel.id)));
      })
      .catch(() => {
        // Stil: dit blok is een aanbod en geen kernfunctie. Lukt het laden niet,
        // dan hoort het overzicht erboven gewoon te blijven staan.
        if (levend) setDoelen([]);
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

  if (doelen.length === 0) return null;

  return (
    <Card>
      <Subheading>Je doel delen met deze groep</Subheading>
      <Body muted>
        Zolang je niets koppelt, ziet niemand hier waar je aan werkt. Koppelen deelt de
        titel en je mijlpaalvoortgang — niet je notities en niet je punten.
      </Body>

      {doelen.map((doel) => (
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

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * De groep plus zijn overzicht.
 *
 * ⚠️ De groepsperiode wordt hier bepaald met `huidigeGroepsperiode()` uit
 *    `shared/time`, en niet in SQL. De database kent de huddledag en de tijdzone
 *    wel, maar mag er niet mee rekenen (CLAUDE.md, correctheidsregel 7).
 */
async function laadGroep(
  groupId: string,
): Promise<{ groep: Groep | null; overzicht: Pagina<Groepslid> }> {
  const groep = await fetchGroep(groupId);

  if (groep === null) {
    return { groep: null, overzicht: { rijen: [], totaal: 0, meer: false } };
  }

  const periode = huidigeGroepsperiode(groep);
  const overzicht = await fetchGroepsoverzicht(groupId, periode);

  return { groep, overzicht };
}

const styles = StyleSheet.create({
  lijst: { gap: space.blokGap },
});
