import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { clientEnv } from '@/lib/env';
import { useSession } from '@/modules/auth';
import {
  fetchGroep,
  fetchMijnLidmaatschap,
  HUDDLEDAGEN,
  toonCode,
  uitnodigingsLink,
  vernieuwUitnodiging,
  wijzigGroep,
  zetUitnodigingIngetrokken,
  type Groep,
} from '@/modules/buddies';
import type { Weekday } from '@/shared/time';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Deelknop,
  Field,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * Groepsinstellingen voor de beheerder — QS8-52 en QS8-58.
 *
 * ⚠️ Wie hier komt zonder beheerder te zijn, ziet de knoppen wel maar krijgt van
 *    de server een weigering. Dat is met opzet de volgorde: de UI verbergt, de
 *    database beslist (CLAUDE.md, beveiligingsregel 2). Zou de UI de enige
 *    controle zijn, dan is een aangepaste client genoeg.
 *
 * ⚠️ De uitnodigingscode staat in een veld en niet in lopende tekst. Op web én
 *    native is dat de enige manier om hem te kunnen selecteren en kopiëren zonder
 *    een nieuwe dependency (`expo-clipboard`) toe te voegen — en dependencies
 *    gaan niet zonder overleg.
 */
export default function GroepBeheer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { userId } = useSession();

  const [groep, setGroep] = useState<Groep | null>(null);
  const [beheerder, setBeheerder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [naam, setNaam] = useState('');
  const [huddledag, setHuddledag] = useState<Weekday>(0);
  const [bezig, setBezig] = useState<'opslaan' | 'vernieuwen' | 'sluiten' | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !userId) return;
    let levend = true;

    Promise.all([fetchGroep(id), fetchMijnLidmaatschap(id, userId)])
      .then(([gevonden, lidmaatschap]) => {
        if (!levend) return;
        setGroep(gevonden);
        setBeheerder(lidmaatschap?.role === 'admin');
        setNaam(gevonden?.name ?? '');
        setHuddledag(((gevonden?.huddle_day ?? 0) % 7) as Weekday);
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
  }, [id, userId]);

  async function slaOp() {
    if (!id) return;
    setBezig('opslaan');
    setFout(null);
    setMelding(null);

    const uitkomst = await wijzigGroep(id, { name: naam, huddle_day: huddledag });
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setGroep(uitkomst.waarde);
    setMelding('Opgeslagen. Lopende kettingschakels blijven staan waar ze staan.');
  }

  async function vernieuw() {
    if (!id) return;
    setBezig('vernieuwen');
    setFout(null);
    setMelding(null);

    const uitkomst = await vernieuwUitnodiging(id);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setGroep((huidig) => (huidig === null ? huidig : { ...huidig, invite_code: uitkomst.waarde }));
    setMelding('Nieuwe link. De oude werkt vanaf nu niet meer.');
  }

  async function zetGesloten(gesloten: boolean) {
    if (!id) return;
    setBezig('sluiten');
    setFout(null);
    setMelding(null);

    const uitkomst = await zetUitnodigingIngetrokken(id, gesloten);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    setGroep((huidig) => (huidig === null ? huidig : { ...huidig, invite_revoked: gesloten }));
    setMelding(gesloten ? 'De link is gesloten.' : 'De link staat weer open.');
  }

  return (
    <Screen title="Groep beheren" eyebrow="ALLEEN VOOR BEHEERDERS">
      <AsyncView
        loading={loading}
        error={error}
        data={groep ?? undefined}
        isEmpty={() => false}
        empty={{
          title: 'Deze groep is er niet, of niet voor jou',
          body: 'Je bent geen lid van deze groep, of hij bestaat niet meer.',
        }}
      >
        {(g) =>
          /*
            ⚠️ Een gewoon lid krijgt geen formulier te zien dat de server daarna
               weigert. De database is en blijft de bescherming — dat is
               beveiligingsregel 2 — maar een scherm dat je drie keer laat falen
               voordat het zegt dat je er niets te zoeken hebt, is een slecht
               scherm.
          */
          !beheerder ? (
            <Card>
              <Subheading>Alleen een beheerder kan deze groep instellen</Subheading>
              <Body muted>
                Je bent lid van deze groep, maar geen beheerder. Vraag degene die de groep
                heeft aangemaakt om de naam, de huddledag of de uitnodigingslink te
                wijzigen.
              </Body>
            </Card>
          ) : (
            <>
              <Card>
                <Field
                  label="Naam van de groep"
                  value={naam}
                  onChangeText={setNaam}
                  maxLength={60}
                  placeholder="De donderdagclub"
                />

                <Choice
                  label="Huddledag"
                  hint={
                    'De gedeelde dag van de groep. Verandert niets aan wanneer jouw eigen ' +
                    'weekdoelen resetten — dat blijft je persoonlijke week-startdag.'
                  }
                  opties={HUDDLEDAGEN.map((d) => ({ waarde: d.waarde, label: d.label }))}
                  waarde={huddledag}
                  onKies={setHuddledag}
                />

                <Caption>
                  Wijzigen breekt geen lopende ketting: een schakel draagt de week waarin hij
                  gelegd is, en die wordt nooit herberekend.
                </Caption>

                <Button
                  variant="primair"
                  block
                  busy={bezig === 'opslaan'}
                  onPress={() => void slaOp()}
                >
                  Opslaan
                </Button>
              </Card>

              <Card>
                <Subheading>Uitnodigingslink</Subheading>
                <Body muted>
                  Wie deze link opent, ziet de groep en hoeveel mensen erin zitten — ook
                  zonder account. Wat jullie aan doelen delen, ziet iemand pas na het
                  meedoen. Deel de link toch alleen met mensen die je erbij wilt.
                </Body>

                <Deelknop
                  label="Deel de uitnodiging"
                  titel={`Doe mee met ${g.name}`}
                  tekst={uitnodigingsLink(clientEnv().appUrl, g.invite_code)}
                />

                <Field
                  label="Of kopieer hem met de hand"
                  value={uitnodigingsLink(clientEnv().appUrl, g.invite_code)}
                  editable={false}
                  selectTextOnFocus
                  multiline
                />
                <Caption>Voorlezen kan ook: {toonCode(g.invite_code)}</Caption>

                {g.invite_revoked ? (
                  <Caption danger>
                    De link is gesloten. Niemand kan er op dit moment mee binnenkomen.
                  </Caption>
                ) : null}

                <Button
                  variant="secundair"
                  block
                  busy={bezig === 'vernieuwen'}
                  onPress={() => void vernieuw()}
                >
                  Nieuwe link maken
                </Button>
                <Button
                  variant="stil"
                  block
                  busy={bezig === 'sluiten'}
                  onPress={() => void zetGesloten(!g.invite_revoked)}
                >
                  {g.invite_revoked ? 'Link weer openzetten' : 'Link sluiten'}
                </Button>

                <Caption>
                  Sluiten laat de code bestaan maar weigert iedereen. Een nieuwe link maken
                  vervangt de code, en dan is de oude definitief dood — dat is wat je doet als
                  een link ergens is beland waar hij niet hoorde.
                </Caption>
              </Card>

              {melding === null ? null : <Caption muted={false}>{melding}</Caption>}
              {fout === null ? null : <Caption danger>{fout}</Caption>}
            </>
          )
        }
      </AsyncView>

      <Button variant="stil" block onPress={() => router.back()}>
        Terug naar de groep
      </Button>
    </Screen>
  );
}
