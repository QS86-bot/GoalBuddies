import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import {
  huddledagen,
  koppelDoelAanGroep,
  maakGroep,
  ZICHTBAARHEDEN,
  zichtbaarheidLabels,
  zichtbaarheidUitleg,
  type Zichtbaarheid,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import type { Weekday } from '@/shared/time';
import {
  Body,
  Button,
  Caption,
  Card,
  Choice,
  Field,
  Screen,
  Subheading,
  useTerug,
} from '@/shared/ui';

/**
 * Een buddy-groep aanmaken — QS8-52.
 *
 * ⚠️ Er staat geen veld voor de uitnodigingscode, en dat is met opzet. Die komt
 *    van de server (migratie 0016): een code die de client kiest, is geen code
 *    maar een verzoek, en "niet raadbaar" is dan een aanname.
 *
 * ⚠️ De huddledag is geen instelling maar een fundamentele keuze, dus hij staat
 *    hier en niet weggestopt onder instellingen. Hij is later te wijzigen zonder
 *    dat een lopende ketting breekt — dat staat er ook bij, want anders durft
 *    niemand hem aan te raken.
 */
export default function NieuweGroep() {
  const router = useRouter();
  const terug = useTerug('/groep');
  // ⚠️ Optioneel, en dat is het punt: dit scherm is er in de eerste plaats om
  //    een groep te maken. Kom je hier uit de doelroute (QS8-229), dan reist het
  //    doel mee zodat de gebruiker het niet op het volgende scherm nog eens moet
  //    koppelen.
  const { doel } = useLocalSearchParams<{ doel?: string }>();
  const heeftDoel = typeof doel === 'string' && doel !== '';

  const [naam, setNaam] = useState('');
  const [huddledag, setHuddledag] = useState<Weekday>(0);
  // ⚠️ Begint op `beschermd`, en niet op "nog niets gekozen". Grens 1 van besluit
  //    A41: dat is de standaard, en een scherm dat je eerst laat kiezen zou de
  //    standaard tot een vraag maken.
  const [zichtbaarheid, setZichtbaarheid] = useState<Zichtbaarheid>('beschermd');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    setBezig(true);
    setFout(null);

    const uitkomst = await maakGroep({ name: naam, huddle_day: huddledag, zichtbaarheid });

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    // ⚠️ **Koppelen mag mislukken zonder dat de groep verdwijnt.** De groep
    //    bestaat op dit punt; hem als niet-aangemaakt behandelen omdat een
    //    tweede verzoek faalde, zou de gebruiker een groep laten maken die hij
    //    daarna nergens ziet. Daarom gaat hij hoe dan ook door naar de
    //    uitnodigingsstap.
    //
    // ⚠️⚠️ **Maar de uitkomst wordt wél gelezen, en dat is een reparatie**
    //    (QS8-350/QS8-387). Hier stond `await koppelDoelAanGroep(…)` als kaal
    //    statement, en een kaal await gooit het `Resultaat` net zo hard weg als
    //    een `void`. Wat het kostte: bij een mislukte koppeling ging `?groep=`
    //    tóch mee, en dan opende `/doel/samen` in de stand "gedeeld" over een
    //    koppeling die niet bestond — precies het "succes dat er geen is" waar
    //    `beginfase()` voor gebouwd is. Nu gaat de parameter alleen mee als er
    //    echt gekoppeld is, en anders staat de koppelknop er gewoon weer.
    if (heeftDoel) {
      const gekoppeld = await koppelDoelAanGroep(doel, uitkomst.waarde.id);
      const staart = gekoppeld.ok ? `&groep=${encodeURIComponent(uitkomst.waarde.id)}` : '';

      router.replace(`/doel/samen?doel=${encodeURIComponent(doel)}${staart}`);
      return;
    }

    router.replace(`/groep/${uitkomst.waarde.id}`);
  }

  return (
    <Screen title={t('groepnieuw.titel')} eyebrow={t('groepnieuw.eyebrow')} terug={{ naar: '/groep' }}>
      <Card>
        <Field
          label={t('groepnieuw.naam')}
          hint={t('groepnieuw.naam_hint')}
          value={naam}
          onChangeText={setNaam}
          maxLength={60}
          placeholder={t('groepnieuw.naam_voorbeeld')}
        />
      </Card>

      <Card>
        <Choice
          label={t('groepnieuw.huddledag')}
          hint={t('groepnieuw.huddledag_hint')}
          opties={huddledagen().map((d) => ({ waarde: d.waarde, label: d.label }))}
          waarde={huddledag}
          onKies={setHuddledag}
        />
        <Caption>{t('groepnieuw.later_wijzigen')}</Caption>
      </Card>

      {/*
        ⚠️ Deze keuze staat op het aanmaakscherm en niet weggestopt onder
           instellingen, om dezelfde reden als de huddledag: hij is fundamenteel.
           Besluit A41 zegt bovendien dat hij bij het aanmáken gemaakt wordt.
           De uitleg staat eronder en niet in een hulpicoon — wie hier "open"
           kiest, kiest iets over de weken van zijn buddy's.
      */}
      <Card>
        <Choice
          label={t('groepnieuw.zichtbaarheid')}
          hint={t('groepnieuw.zichtbaarheid_hint')}
          opties={ZICHTBAARHEDEN.map((z) => ({ waarde: z, label: zichtbaarheidLabels()[z] }))}
          waarde={zichtbaarheid}
          onKies={setZichtbaarheid}
        />
        <Caption>{zichtbaarheidUitleg()[zichtbaarheid]}</Caption>

        {/*
          ⚠️ **Twee verschillende zinnen, en dat is geen doublure.**
             `zichtbaarheidUitleg()` zegt wat de groepsstand betekent;
             `koppel.uitleg_*` zegt wat kóppelen van dit doel deelt. Kom je hier
             uit de doelroute (QS8-229), dan doet dit scherm dat koppelen zelf —
             en een koppelknop die niet zegt wat hij deelt, is precies de
             "stillere belofte" waar `deling.ts` voor waarschuwt. Hij staat vóór
             de aanmaakknop, want daarna is de keuze gemaakt.
        */}
        {heeftDoel ? (
          <Caption>
            {zichtbaarheid === 'open' ? t('koppel.uitleg_open') : t('koppel.uitleg_beschermd')}
          </Caption>
        ) : null}
      </Card>

      <Card nested>
        <Subheading>{t('groepnieuw.wat_daarna')}</Subheading>
        <Body muted>{t('groepnieuw.wat_daarna_a')}</Body>
        <Body muted>{t('groepnieuw.wat_daarna_b')}</Body>
      </Card>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
        {t('groepnieuw.aanmaken')}
      </Button>
      <Button variant="stil" block onPress={terug}>
        {t('groepnieuw.annuleren')}
      </Button>
    </Screen>
  );
}
