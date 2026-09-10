import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { clientEnv } from '@/lib/env';
import {
  beginfase,
  deelbareUitnodiging,
  fetchGroep,
  fetchGroepenVanDoel,
  fetchMijnGroepen,
  koppelbareGroepen,
  koppelDoelAanGroep,
  zichtbaarheidLabels,
  type DoelGroep,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import {
  AsyncView,
  Body,
  Button,
  Caption,
  Card,
  Deelknop,
  Screen,
  Subheading,
  useAsync,
} from '@/shared/ui';

/**
 * Wie gaat dit met je meemaken — QS8-229.
 *
 * ⚠️ **Dit is het moment waarop de app van een to-dolijst een accountability-app
 *    wordt.** Tot dit scherm bestond kwam je in de hele doelroute geen enkele
 *    buddy tegen: uitnodigen kon alleen vanuit een groep die al bestond, en die
 *    maak je alleen als je zelf op `/groep/nieuw` terechtkomt. Wie een doel
 *    aanmaakte en verder niets deed, had een app zonder de helft van het product.
 *
 * ⚠️⚠️ **Overslaan is een echte uitweg en geen beleefdheidsknop.** De app moet
 *    zonder buddy werkbaar blijven, en daarom staat die knop **buiten de
 *    `AsyncView`**: juist in de foutstand — je groepen laden niet — is hij het
 *    makkelijkst kwijt, en dan is de gebruiker opgesloten op het scherm dat hij
 *    niet eens nodig had. Wie overslaat verliest niets: `GedeeldMet` op
 *    `app/doel/[id].tsx` biedt dezelfde koppeling elk moment daarna opnieuw aan.
 *
 * ⚠️ **Er komt hier bewust géén zoekveld op naam.** Een doorzoekbare
 *    gebruikersindex is een oppervlak dat met één API-verzoek buiten de UI om uit
 *    te lezen is — precies de vraag die domeinregel 7 bij elk nieuw oppervlak
 *    stelt. `profiles` geeft na migratie 0089 alleen `id`, `display_name` en
 *    `avatar_url` vrij; dat is een stand van zaken en geen omissie. De
 *    uitnodigingslink lost hetzelfde op zonder dat oppervlak: hij deelt niets tot
 *    de eigenaar hem verstuurt, en hij is in te trekken. Wil je dat mensen elkaar
 *    kunnen vínden, dan hoort dat bij het ontdekken van groepen met onbekenden
 *    (QS8-230), mét de maatregelen die daar al beschreven staan.
 *
 * ⚠️ **De zin over wat je deelt staat per groep en niet boven de lijst**, en dat
 *    is dezelfde regel als in `GedeeldMet`. Koppelen aan een **open** groep deelt
 *    sinds migratie 0077 élke weekdoelrij, ook de gemiste; aan een beschermde
 *    niet. Eén zin boven een lijst met allebei erin is voor de helft onwaar, en
 *    dat is precies hoe besluit A41 verwatert. De teksten zijn letterlijk die van
 *    het doelscherm — dezelfde belofte hoort niet in twee bewoordingen te bestaan.
 */
export default function Samen() {
  const { doel, groep: gevraagd } = useLocalSearchParams<{ doel?: string; groep?: string }>();
  const router = useRouter();

  const doelId = doel ?? '';
  const { data, loading, error, herlaad } = useAsync(
    doelId === '' ? null : () => laad(doelId),
    [doelId],
  );

  // ⚠️ `replace` en geen `push`: terugtikken naar het scherm dat net een doel
  //    heeft aangemaakt, levert bij een tweede druk een tweede doel op.
  const klaar = () => router.replace('/');

  return (
    <Screen title={t('samen.titel')} eyebrow={t('samen.eyebrow')} terug={{ naar: '/' }}>
      <AsyncView
        loading={loading}
        error={error}
        onRetry={herlaad}
        data={data}
        empty={{ title: t('samen.leeg_titel'), body: t('samen.leeg_tekst') }}
        isEmpty={(d) => d.mijne.length === 0 && d.gekoppeld.length === 0}
      >
        {(geladen) => (
          <Inhoud
            doelId={doelId}
            geladen={geladen}
            gevraagd={gevraagd ?? null}
            onKlaar={klaar}
            onNieuweGroep={() =>
              router.push(`/groep/nieuw?doel=${encodeURIComponent(doelId)}`)
            }
          />
        )}
      </AsyncView>

      {/*
        ⚠️ Buiten de `AsyncView`, en dat is de belofte en geen opmaak. Zie de kop:
           overslaan moet er óók zijn als het laden mislukt of als je nog geen
           enkele groep hebt.
      */}
      <Button variant="stil" block onPress={klaar}>
        {t('samen.overslaan')}
      </Button>
    </Screen>
  );
}

/**
 * ⚠️ Het type komt van `fetchMijnGroepen()` zelf en is hier niet overgetypt. Die
 *    functie cast haar negen kolommen naar de volledige rij, en een eigen,
 *    smaller type ernaast zou dat verschil verbergen in plaats van het te dragen.
 */
interface Geladen {
  readonly mijne: Awaited<ReturnType<typeof fetchMijnGroepen>>;
  readonly gekoppeld: readonly DoelGroep[];
}

async function laad(goalId: string): Promise<Geladen> {
  const [mijne, gekoppeld] = await Promise.all([
    fetchMijnGroepen(),
    fetchGroepenVanDoel(goalId),
  ]);

  return { mijne, gekoppeld };
}

/**
 * Kiezen of gedeeld — en die keuze komt uit de koppelingen, niet uit de URL.
 *
 * ⚠️ Zie `beginfase()`: `?groep=` zegt alleen wat er geprobéérd is. Een scherm
 *    dat die parameter gelooft, meldt "gedeeld" over een koppeling die er niet
 *    is zodra het koppelen halverwege misging.
 */
function Inhoud({
  doelId,
  geladen,
  gevraagd,
  onKlaar,
  onNieuweGroep,
}: {
  readonly doelId: string;
  readonly geladen: Geladen;
  readonly gevraagd: string | null;
  readonly onKlaar: () => void;
  readonly onNieuweGroep: () => void;
}) {
  const [zojuist, setZojuist] = useState<string | null>(null);
  const stand = beginfase(geladen.gekoppeld, zojuist ?? gevraagd);

  if (stand.fase === 'gedeeld') {
    return <Gedeeld groupId={stand.groupId} onKlaar={onKlaar} />;
  }

  return (
    <KiesGroep
      doelId={doelId}
      geladen={geladen}
      onGekoppeld={setZojuist}
      onNieuweGroep={onNieuweGroep}
    />
  );
}

/**
 * De groepen die dit doel nog kunnen krijgen.
 *
 * ⚠️ **Drie lege uitkomsten en alle drie een eigen zin** — dezelfde regel als in
 *    `GedeeldMet`. "Je hebt nog geen groep" en "al je groepen hebben dit doel
 *    al" zien er zonder tekst identiek uit (lege ruimte), terwijl het
 *    tegenovergestelde antwoorden zijn op de vraag waarom je hier niets kunt.
 */
function KiesGroep({
  doelId,
  geladen,
  onGekoppeld,
  onNieuweGroep,
}: {
  readonly doelId: string;
  readonly geladen: Geladen;
  readonly onGekoppeld: (groupId: string) => void;
  readonly onNieuweGroep: () => void;
}) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const koppelbaar = koppelbareGroepen(geladen.mijne, geladen.gekoppeld);

  async function koppel(groupId: string) {
    setBezig(groupId);
    setFout(null);

    const uitkomst = await koppelDoelAanGroep(doelId, groupId);
    setBezig(null);

    // ⚠️ Bij een mislukking blijven we in deze stand. Doorstappen naar "gedeeld"
    //    zonder bevestigde koppeling is succes melden dat er niet is.
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    onGekoppeld(groupId);
  }

  return (
    <>
      <Card>
        <Body muted>{t('samen.uitleg')}</Body>
      </Card>

      <Koppellijst
        heeftGroepen={geladen.mijne.length > 0}
        koppelbaar={koppelbaar}
        bezig={bezig}
        onKoppel={(groupId) => void koppel(groupId)}
      />

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      {/*
        ⚠️ Naar het bestaande aanmaakformulier met het doel erbij, en niet naar
           een tweede formulier hier. Naam, huddledag en zichtbaarheid zijn geen
           invulvelden maar drie beslissingen met uitleg eronder (A41); die twee
           keer onderhouden is precies hoe de ene kopie stiller wordt dan de
           andere.
      */}
      <Button variant="secundair" block onPress={onNieuweGroep}>
        {t('samen.nieuwe_groep')}
      </Button>
    </>
  );
}

/**
 * Gekoppeld — en dan meteen de link, want dát is de handeling die telt.
 *
 * ⚠️ **Eén groep ophalen en niet de lijst.** De uitnodigingscode zit niet in
 *    `fetchMijnGroepen()`; zie `deelbareUitnodiging()` voor waarom het type daar
 *    liegt. Hem per rij in de kieslijst alvast ophalen zou een N+1 zijn op het
 *    scherm waar de meeste gebruikers precies één keer komen.
 *
 * ⚠️ **Geen link is een eigen uitkomst en geen lege knop.** Is de uitnodiging
 *    ingetrokken, dan is het doel wél gekoppeld maar valt er niets te delen. Een
 *    Deelknop die een dode link uitdeelt, stuurt de gebruiker naar iemand toe.
 */
function Gedeeld({ groupId, onKlaar }: { readonly groupId: string; readonly onKlaar: () => void }) {
  const { data: groep, loading, error, herlaad } = useAsync(() => fetchGroep(groupId), [groupId]);

  return (
    <>
      <AsyncView
        loading={loading}
        error={error}
        onRetry={herlaad}
        data={groep ?? undefined}
        empty={{ title: t('samen.groep_weg_titel'), body: t('samen.groep_weg_tekst') }}
        isEmpty={() => false}
      >
        {(g) => <Uitnodiging naam={g.name} link={deelbareUitnodiging(g, clientEnv().appUrl)} />}
      </AsyncView>

      <Button variant="stil" block onPress={onKlaar}>
        {t('samen.klaar')}
      </Button>
    </>
  );
}

function Uitnodiging({ naam, link }: { readonly naam: string; readonly link: string | null }) {
  return (
    <Card>
      <Subheading>{t('samen.gekoppeld', { naam })}</Subheading>
      <Body muted>{t('samen.gekoppeld_tekst')}</Body>

      {link === null ? (
        <Caption>{t('samen.link_gesloten')}</Caption>
      ) : (
        <Deelknop
          label={t('samen.deel')}
          titel={t('samen.deel_titel', { groep: naam })}
          tekst={link}
        />
      )}
    </Card>
  );
}

/**
 * Eén groep met de zin erbij die zegt wat koppelen deelt.
 *
 * ⚠️ **Apart, en niet alleen om regel 15.** De zin en de knop horen bij elkaar:
 *    wie de knop ergens anders hergebruikt, neemt de zin mee. Dat is precies de
 *    scheiding die A41 nodig heeft — een koppelknop zonder zin is de stillere
 *    belofte waar `deling.ts` voor waarschuwt.
 */
function KoppelKaart({
  groep,
  bezig,
  onKoppel,
}: {
  readonly groep: DoelGroep;
  readonly bezig: string | null;
  readonly onKoppel: () => void;
}) {
  return (
    <Card nested>
      <Subheading>{groep.name}</Subheading>
      <Caption>{zichtbaarheidLabels()[groep.zichtbaarheid]}</Caption>
      <Body muted>
        {groep.zichtbaarheid === 'open'
          ? t('deling.uitleg_open')
          : t('deling.uitleg_beschermd')}
      </Body>
      <Button
        busy={bezig === groep.group_id}
        disabled={bezig !== null && bezig !== groep.group_id}
        onPress={onKoppel}
      >
        {t('deling.koppel', { naam: groep.name })}
      </Button>
    </Card>
  );
}

/**
 * De drie uitkomsten van "welke groepen kan dit doel nog krijgen".
 *
 * ⚠️ **Alle drie een eigen zin** — dezelfde regel als in `GedeeldMet`. "Je hebt
 *    nog geen groep" en "al je groepen hebben dit doel al" zien er zonder tekst
 *    identiek uit, namelijk als lege ruimte, terwijl het tegenovergestelde
 *    antwoorden zijn op de vraag waarom je hier niets kunt.
 */
function Koppellijst({
  heeftGroepen,
  koppelbaar,
  bezig,
  onKoppel,
}: {
  readonly heeftGroepen: boolean;
  readonly koppelbaar: readonly DoelGroep[];
  readonly bezig: string | null;
  readonly onKoppel: (groupId: string) => void;
}) {
  if (!heeftGroepen) return <Body muted>{t('deling.geen_groepen')}</Body>;
  if (koppelbaar.length === 0) return <Body muted>{t('deling.overal')}</Body>;

  return (
    <>
      {koppelbaar.map((groep) => (
        <KoppelKaart
          key={groep.group_id}
          groep={groep}
          bezig={bezig}
          onKoppel={() => onKoppel(groep.group_id)}
        />
      ))}
    </>
  );
}
