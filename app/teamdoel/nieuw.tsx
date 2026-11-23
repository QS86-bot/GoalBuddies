import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useProfiel } from '@/modules/auth';
import { fetchGroep, type Groep } from '@/modules/buddies';
import {
  maakTeamdoel,
  TEAMDOEL_BESCHRIJVING_MAX,
  TEAMDOEL_TITEL_MAX,
} from '@/modules/organisaties';
import { t } from '@/shared/i18n';
import { telTekens } from '@/shared/tekst';
import { localDateIn, now, type Weekday } from '@/shared/time';
import { AsyncView, Button, Caption, Card, DatumKeuze, Field, Screen, useAsync } from '@/shared/ui';
import { useVolgTaal } from '@/shared/i18n/react';

/**
 * Een teamdoel aanmaken — QS8-658.
 *
 * ⚠️ **"Vandaag" is de dag van de groep en niet die van het toestel of van het
 *    profiel.** Een teamdoel volgt de klok van de teamgroep (besluit 17), en de
 *    server toetst de streefdatum in diezelfde kalender (`groepsdatum()`). De
 *    kiezer houdt je er alleen vooraf binnen; de server blijft de grens. De
 *    week-startdag van de kiezer is wel die van jou: hij bepaalt hoe de
 *    kalender er voor jou uitziet en niets over het doel.
 *
 * ⚠️ De tellers tellen codepunten (`telTekens`), want dat telt `char_length`.
 *    Geen `maxLength` op de velden: dat telt UTF-16-eenheden en kapt een emoji
 *    midden door.
 */
export default function NieuwTeamdoel() {
  useVolgTaal();
  const { groep: groepId } = useLocalSearchParams<{ groep: string }>();
  const groep = useAsync(() => fetchGroep(groepId), [groepId]);
  const { profiel, loading, error, herlaad } = useProfiel();

  const klaar = groep.data != null && profiel !== null ? { groep: groep.data, profiel } : undefined;

  return (
    <Screen
      title={t('teamdoel.nieuw_titel')}
      eyebrow={t('teamdoel.lijst_eyebrow')}
      terug={{ naar: `/groep/teamdoelen/${groepId}` }}
    >
      <AsyncView
        loading={groep.loading || loading}
        error={groep.error ?? error}
        data={klaar}
        isEmpty={() => false}
        onRetry={() => {
          groep.herlaad();
          herlaad();
        }}
        empty={{
          title: t('teamdoel.niet_gevonden_titel'),
          body: t('teamdoel.niet_toegestaan'),
        }}
      >
        {(k) => (
          <Formulier
            groep={k.groep}
            startDag={k.profiel.week_start_day as Weekday}
          />
        )}
      </AsyncView>
    </Screen>
  );
}

function Formulier({ groep, startDag }: { readonly groep: Groep; readonly startDag: Weekday }) {
  const router = useRouter();
  const [titel, setTitel] = useState('');
  const [beschrijving, setBeschrijving] = useState('');
  const [datum, setDatum] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const vandaag = localDateIn(groep.tz, now());

  async function bewaar() {
    setBezig(true);
    setFout(null);
    const uitkomst = await maakTeamdoel(groep.id, titel, datum, beschrijving);
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }
    router.replace(`/teamdoel/${uitkomst.waarde}`);
  }

  return (
    <Card>
      <Teksten
        titel={titel}
        onTitel={setTitel}
        beschrijving={beschrijving}
        onBeschrijving={setBeschrijving}
      />
      <DatumKeuze
        label={t('teamdoel.datum_label')}
        hint={t('teamdoel.datum_hint')}
        waarde={datum}
        onKies={setDatum}
        startDag={startDag}
        vandaag={vandaag}
        min={vandaag}
      />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
        {t('teamdoel.opslaan')}
      </Button>
    </Card>
  );
}

interface TekstenProps {
  readonly titel: string;
  readonly onTitel: (waarde: string) => void;
  readonly beschrijving: string;
  readonly onBeschrijving: (waarde: string) => void;
}

function Teksten({ titel, onTitel, beschrijving, onBeschrijving }: TekstenProps) {
  return (
    <>
      <Field
        label={t('teamdoel.titel_label')}
        hint={t('teamdoel.titel_hint')}
        value={titel}
        onChangeText={onTitel}
        autoCorrect={false}
      />
      <Caption>
        {t('teamdoel.titel_teller', { aantal: telTekens(titel), max: TEAMDOEL_TITEL_MAX })}
      </Caption>
      <Field
        label={t('teamdoel.beschrijving_label')}
        value={beschrijving}
        onChangeText={onBeschrijving}
        multiline
      />
      <Caption>
        {t('teamdoel.beschrijving_teller', {
          aantal: telTekens(beschrijving),
          max: TEAMDOEL_BESCHRIJVING_MAX,
        })}
      </Caption>
    </>
  );
}
