import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { clientEnv } from '@/lib/env';
import { useProfiel } from '@/modules/auth';
import {
  beginfase,
  deelbareUitnodiging,
  fetchGroep,
  fetchGroepenVanDoel,
  fetchMijnGroepen,
  koppelbareGroepen,
  fetchBuddyzoekopdrachtenOver,
  fetchBuddyzoekStand,
  koppelDoelAanGroep,
  stopBuddyZoeken,
  zichtbaarheidLabels,
  zoekBuddies,
  type Buddyzoekstand,
  type DoelGroep,
} from '@/modules/buddies';
import { opmaaktaal, t } from '@/shared/i18n';
import { localDateIn, now, toonDatum } from '@/shared/time';
import {
  AsyncView,
  Bevestiging,
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

  // ⚠️ De buddyzoek-kaart staat in béide standen en niet alleen in `kiezen`. De
  //    wachtrij hoort bij het dóel, niet bij de vraag of er al ergens gekoppeld
  //    is: wie zijn doel met één vriend deelt, mag er nog steeds onbekenden bij
  //    zoeken.
  return (
    <>
      {stand.fase === 'gedeeld' ? (
        <Gedeeld groupId={stand.groupId} onKlaar={onKlaar} />
      ) : (
        <KiesGroep
          doelId={doelId}
          geladen={geladen}
          onGekoppeld={setZojuist}
          onNieuweGroep={onNieuweGroep}
        />
      )}
      <Buddyzoek doelId={doelId} />
    </>
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

/**
 * Buddy's zoeken bij onbekenden — QS8-233, migraties 0299 en 0300.
 *
 * ⚠️⚠️ **De bevestiging is hier geen drempel maar een mededeling, en dat is de
 *    reden dat dit blok bestaat.** Koppelen zet de beoordeelbaarheidsgrendel om
 *    (`docs/decisions/2026-08-23-de-grendel-op-het-minpunt.md`): de week die nu
 *    loopt gaat meetellen en kan een punt kosten. Dat is wat een gebruiker als
 *    consequentie beloofd is, en hij hoort het vóór de knop te lezen — niet op
 *    zijn dashboard te ontdekken.
 *
 * ⚠️ **Geen optimistic update.** `zoekBuddies()` gaat langs een RPC die op acht
 *    gronden kan weigeren; doorstappen naar "we zoeken" zonder bevestigde rij is
 *    succes melden dat er niet is. Dezelfde regel als bij `koppel()` hierboven.
 *
 * ⚠️ **Zonder profiel tonen we niets.** `p_vandaag` hoort in de tijdzone van
 *    déze gebruiker (domeinregel 2); een peildatum uit de serverklok zet iemand
 *    aan de rand van de dag in de verkeerde periodeband.
 */
function Buddyzoek({ doelId }: { readonly doelId: string }) {
  const { profiel } = useProfiel();
  const vandaag = profiel ? localDateIn(profiel.tz, now()) : null;

  const { data, loading, error, herlaad } = useAsync(
    vandaag === null ? null : () => fetchBuddyzoekStand(doelId, vandaag),
    [doelId, vandaag],
  );

  if (profiel === null) return null;

  // ⚠️ De knop staat **buiten** de `AsyncView`, en dat is dezelfde belofte als
  //    bij de overslaan-knop hierboven: juist in de foutstand — de stand laadt
  //    niet — is hij het makkelijkst kwijt, en dan kan de gebruiker niets meer.
  //    De database blijft de rem; een tweede aanmelding geeft `already_queued`.
  const zoektNu = data?.status === 'wachtend' || data?.status === 'gekoppeld';

  return (
    <Card>
      <Subheading>{t('buddyzoek.titel')}</Subheading>
      <AsyncView
        loading={loading}
        error={error}
        onRetry={herlaad}
        data={data}
        isEmpty={(stand) => stand === null}
        empty={{ title: t('buddyzoek.leeg'), body: t('buddyzoek.uitleg') }}
      >
        {(stand) =>
          stand === null ? null : (
            <Gevonden stand={stand} doelId={doelId} onWijziging={herlaad} />
          )
        }
      </AsyncView>

      {zoektNu ? null : <Aanmelden doelId={doelId} onAangemeld={herlaad} />}
    </Card>
  );
}

/**
 * Wat je leest zodra je in de rij staat of gekoppeld bent.
 *
 * ⚠️ `nogNodig` komt afgekapt op 0/1/2 uit de database én uit de datalaag, en
 *    dat is een grendel en geen afronding: een exacte telling van je bak is met
 *    één API-verzoek te herhalen terwijl je je categorie varieert, en dan is het
 *    een populatiemeter op de gebruikersbasis.
 */
function Gevonden({
  stand,
  doelId,
  onWijziging,
}: {
  readonly stand: Buddyzoekstand;
  readonly doelId: string;
  readonly onWijziging: () => void;
}) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function stop() {
    setBezig(true);
    setFout(null);
    const uitkomst = await stopBuddyZoeken(doelId);
    setBezig(false);

    // ⚠️ Bij een mislukking blijven we in deze stand. Doorstappen zonder
    //    bevestigde wijziging is succes melden dat er niet is.
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    onWijziging();
  }

  // ⚠️ **De keten loopt door tot een knop** — onwrikbare regel 18, vraag 5.
  //    "Je hebt buddy's" zonder weg ernaartoe is precies de vorm waarin QS8-43
  //    en QS8-44 op Done stonden terwijl er geen scherm was.
  if (stand.status === 'gekoppeld') {
    return (
      <>
        <Body>{t('buddyzoek.gekoppeld')}</Body>
        {stand.groupId === null ? null : (
          <Button block onPress={() => router.push(`/groep/${stand.groupId ?? ''}`)}>
            {t('buddyzoek.naar_groep')}
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <Body>{t('buddyzoek.wachtend')}</Body>
      <Body>{nogNodigTekst(stand.nogNodig)}</Body>
      <Caption>{t('buddyzoek.zoeken_tot', { datum: toonDatum(stand.verloopt, opmaaktaal()) })}</Caption>
      {fout === null ? null : <Caption>{fout}</Caption>}
      <Button variant="stil" block busy={bezig} onPress={() => void stop()}>
        {t('buddyzoek.stop_knop')}
      </Button>
    </>
  );
}

/**
 * De knop en de bevestiging ervoor.
 *
 * ⚠️⚠️ **De bevestiging is hier geen drempel maar een mededeling.** Koppelen zet
 *    de beoordeelbaarheidsgrendel om
 *    (`docs/decisions/2026-08-23-de-grendel-op-het-minpunt.md`): de week die nu
 *    loopt gaat meetellen en kan een punt kosten. Dat is wat een gebruiker als
 *    consequentie beloofd is, en hij hoort het vóór de knop te lezen — niet op
 *    zijn dashboard te ontdekken. Daarom staat die zin in de `uitleg` van de
 *    bevestiging zelf en niet tussen de vier feiten erboven.
 *
 * ⚠️ **Geen optimistic update.** `zoekBuddies()` gaat langs een RPC die op acht
 *    gronden kan weigeren; doorstappen naar "we zoeken" zonder bevestigde rij is
 *    succes melden dat er niet is.
 */
function Aanmelden({
  doelId,
  onAangemeld,
}: {
  readonly doelId: string;
  readonly onAangemeld: () => void;
}) {
  const [bevestigen, setBevestigen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const { data: over } = useAsync(() => fetchBuddyzoekopdrachtenOver(), []);

  async function meldAan() {
    setBezig(true);
    setFout(null);
    const uitkomst = await zoekBuddies(doelId, true);
    setBezig(false);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }
    setBevestigen(false);
    onAangemeld();
  }

  if (!bevestigen) {
    return (
      <>
        <Button block onPress={() => setBevestigen(true)}>
          {t('buddyzoek.knop')}
        </Button>
        {/*
          ⚠️ `null` bij een storing en geen nul — dan laat het scherm de teller
             wég in plaats van "je mag niets meer" te beweren op grond van een
             mislukte aanroep. De database blijft de rem.
        */}
        {over === null ? null : <Caption>{t('buddyzoek.over_vandaag', { aantal: String(over) })}</Caption>}
      </>
    );
  }

  return (
    <WatJeDeelt
      bezig={bezig}
      fout={fout}
      onBevestig={() => void meldAan()}
      onAnnuleer={() => setBevestigen(false)}
    />
  );
}

/**
 * De vier feiten, en daaronder de bevestiging met de prijs erin.
 *
 * ⚠️⚠️ **De zin over de lopende week staat in de `uitleg` van de bevestiging en
 *    niet tussen de vier feiten erboven**, en dat is met opzet. `acties.ts`
 *    schrijft voor dat elke bevestigingstekst de prijs noemt: "weet je het
 *    zeker?" is geen bevestiging maar een drempel. Dit is de enige van de vijf
 *    die geld kost in punten, dus die hoort op de plek waar de gebruiker hem
 *    niet kan overslaan.
 */
function WatJeDeelt({
  bezig,
  fout,
  onBevestig,
  onAnnuleer,
}: {
  readonly bezig: boolean;
  readonly fout: string | null;
  readonly onBevestig: () => void;
  readonly onAnnuleer: () => void;
}) {
  return (
    <>
      <Body>{t('buddyzoek.bevestig_onbekenden')}</Body>
      <Body>{t('buddyzoek.bevestig_bescherming')}</Body>
      <Body>{t('buddyzoek.bevestig_weekstart')}</Body>
      <Body>{t('buddyzoek.bevestig_stoppen')}</Body>
      <Bevestiging
        tekst={{
          titel: t('buddyzoek.bevestig_titel'),
          uitleg: t('buddyzoek.bevestig_lopende_week'),
          bevestig: t('buddyzoek.bevestig_knop'),
        }}
        onBevestig={onBevestig}
        onAnnuleer={onAnnuleer}
        bezig={bezig}
        fout={fout}
      />
    </>
  );
}

/**
 * ⚠️ Drie zinnen en geen `{aantal}` met een 1 erin: "Er zijn nog 1 mensen nodig"
 *    is een zin die geen mens schrijft, en de meervoudsregel hoort in de
 *    catalogus en niet in een sjabloon.
 */
function nogNodigTekst(nogNodig: number): string {
  if (nogNodig <= 0) return t('buddyzoek.nog_nodig_genoeg');
  if (nogNodig === 1) return t('buddyzoek.nog_nodig_een');
  return t('buddyzoek.nog_nodig_meer', { aantal: String(nogNodig) });
}
