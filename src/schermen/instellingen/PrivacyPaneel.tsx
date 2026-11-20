import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { updateProfiel, type Profiel as ProfielRij } from '@/modules/auth';

import { deblokkeer, fetchBlokkades } from '@/modules/buddies';
import { fetchBuddyBijdrage } from '@/modules/completions';

import { t } from '@/shared/i18n';

import { Body, Button, Caption, Card, Choice, Subheading, useAsync } from '@/shared/ui';

/**
 * Of je buiten je eigen groepen te vinden bent — QS8-476.
 *
 * ⚠️⚠️ **De tekst moet allebei de helften zeggen, en dat is criterium 2
 *    letterlijk.** Wát opengaat (je naam en je profielfoto, voor iedereen die is
 *    ingelogd) én wat dicht blijft (je doelen, je reeks, je punten, je groepen,
 *    je weken). Een schakelaar die alleen het eerste noemt, laat de gebruiker
 *    zelf raden wat hij weggeeft — en dat is precies waar domeinregel 7 voor
 *    bestaat.
 *
 * ⚠️ **Geen bevestigingsstap.** `zet_groepszichtbaarheid()` eist er een omdat
 *    dát besluit met terugwerkende kracht verandert wat er over ándere leden
 *    zichtbaar wordt. Dit gaat over jezelf, is omkeerbaar, en heeft geen
 *    consequentie — domeinregel 5 raakt het niet.
 *
 * ⚠️ **Geen optimistic update.** De stand komt uit het opgeslagen profiel en
 *    verandert pas als de database het bevestigt. Een scherm dat "aan" toont
 *    terwijl de opslag mislukte, liegt over wie jou kan vinden.
 */
export function VindbaarInstelling({
  profiel,
  userId,
  onOpgeslagen,
}: {
  readonly profiel: ProfielRij;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function zet(aan: boolean) {
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, { vindbaar: aan });

    if (uitkomst.ok) onOpgeslagen(uitkomst.profiel);
    else setFout(uitkomst.melding);

    setBezig(false);
  }

  return (
    <Card>
      <Subheading>{t('vindbaar.titel')}</Subheading>
      <Body muted>{t('vindbaar.uitleg')}</Body>

      <Choice
        label={t('vindbaar.label')}
        opties={[
          { waarde: 'aan', label: t('profiel.aan') },
          { waarde: 'uit', label: t('profiel.uit') },
        ]}
        waarde={profiel.vindbaar === true ? 'aan' : 'uit'}
        onKies={(v) => void zet(v === 'aan')}
        disabled={bezig}
      />

      <Caption>{t('vindbaar.wat_niet')}</Caption>
      <Caption>{t('vindbaar.terugdraaien')}</Caption>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * Buddy-bijdrage — QS8-67.
 *
 * ⚠️ Los van je eigen doelvoortgang, en dat is een acceptatiecriterium. Het zijn
 *    punten in hetzelfde grootboek maar zonder `goal_id`, zodat ze niet
 *    meetellen in de reeks of het totaal van een doel waar ze niets mee te maken
 *    hebben. Score en voortgang zijn twee dingen (domeinregel 10) en dit is nog
 *    een derde.
 *
 * ⚠️ Alleen van jezelf. `points_ledger` laat uitsluitend je eigen rijen door, dus
 *    dit getal kan niet per ongeluk dat van een ander zijn.
 */
export function BuddyBijdrage({ userId }: { readonly userId: string }) {
  const [aantal, setAantal] = useState<number | null>(null);
  const [mislukt, setMislukt] = useState(false);

  useEffect(() => {
    let levend = true;

    fetchBuddyBijdrage(userId)
      .then((n) => {
        if (levend) setAantal(n);
      })
      // ⚠️ Een fout is geen nul. "Je hebt nog geen week beoordeeld" tegen iemand
      //    die er veertig deed, is precies de demotivatie waar deze teller tegen
      //    is bedoeld.
      .catch(() => {
        if (levend) setMislukt(true);
      });

    return () => {
      levend = false;
    };
  }, [userId]);

  return (
    <Card>
      <Subheading>{t('profiel.bijdrage_titel')}</Subheading>
      <Body>
        {mislukt
          ? t('profiel.bijdrage_mislukt')
          : aantal === null
            ? t('profiel.bijdrage_onbekend')
            : aantal === 0
              ? t('profiel.bijdrage_geen')
              : aantal === 1
                ? t('profiel.bijdrage_een')
                : t('profiel.bijdrage_meer', { n: aantal })}
      </Body>
      <Caption>{t('profiel.bijdrage_uitleg')}</Caption>
    </Card>
  );
}

/**
 * Wie jij geblokkeerd hebt — QS8-232.
 *
 * ⚠️ **Zonder dit blok is blokkeren een handeling zonder weg terug**, en dan is
 *    het geen instelling maar een straf. De knop staat in de groep, de lijst
 *    staat hier: dit is de enige plek die niet aan één groep hangt, en een
 *    blokkade hangt dat ook niet.
 *
 * ⚠️ **De kaart verdwijnt als je niemand geblokkeerd hebt.** Een lege lijst
 *    "Geblokkeerd" op ieders profiel suggereert dat dit een normaal onderdeel van
 *    de app is waar je iets mee moet.
 *
 * ⚠️ De namen komen uit `mijn_blokkades()` en niet uit een join op `profiles`:
 *    die laat `display_name` alleen door voor wie een groep met je deelt, en een
 *    geblokkeerde deelt er meestal geen meer. Zie de module.
 */
export function Blokkades() {
  const { data, loading, error, herlaad } = useAsync(() => fetchBlokkades(), []);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function hef(userId: string) {
    setBezig(userId);
    setFout(null);

    const uitkomst = await deblokkeer(userId);
    setBezig(null);

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      return;
    }

    herlaad();
  }

  // ⚠️ Sinds QS8-754 staat dit in het onderdeel Privacy en groepen, en dat belooft "wie je geblokkeerd hebt":
  //    wegblijven bij een storing laat de gebruiker denken dat de deblokkeerknop weg is. Dus een foutstaat met
  //    opnieuw proberen, en een lege staat die zegt dat er niemand is.
  if (loading) return null;

  if (error !== null) {
    return (
      <Card>
        <Subheading>{t('melden.geblokkeerd_titel')}</Subheading>
        <Body muted>{t('melden.geblokkeerd_fout')}</Body>
        <Button variant="stil" onPress={herlaad}>
          {t('melden.geblokkeerd_opnieuw')}
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <Subheading>{t('melden.geblokkeerd_titel')}</Subheading>
      {data === undefined || data.length === 0 ? (
        <Body muted>{t('melden.geblokkeerd_leeg')}</Body>
      ) : null}

      {(data ?? []).map((blokkade) => (
        <View key={blokkade.userId}>
          <Body>{blokkade.naam}</Body>
          <Button
            variant="stil"
            busy={bezig === blokkade.userId}
            onPress={() => void hef(blokkade.userId)}
          >
            {t('melden.deblokkeer_knop')}
          </Button>
        </View>
      ))}

      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}
