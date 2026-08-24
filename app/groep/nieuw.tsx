import { useRouter } from 'expo-router';
import { useState } from 'react';

import {
  huddledagen,
  maakGroep,
  ZICHTBAARHEDEN,
  zichtbaarheidLabels,
  zichtbaarheidUitleg,
  type Zichtbaarheid,
} from '@/modules/buddies';
import { t } from '@/shared/i18n';
import type { Weekday } from '@/shared/time';
import { Body, Button, Caption, Card, Choice, Field, Screen, Subheading } from '@/shared/ui';

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

    router.replace(`/groep/${uitkomst.waarde.id}`);
  }

  return (
    <Screen title={t('groepnieuw.titel')} eyebrow={t('groepnieuw.eyebrow')}>
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
      <Button variant="stil" block onPress={() => router.back()}>
        {t('groepnieuw.annuleren')}
      </Button>
    </Screen>
  );
}
