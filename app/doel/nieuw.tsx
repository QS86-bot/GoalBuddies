import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useProfiel, useSession } from '@/modules/auth';
import { CATEGORIEEN, CATEGORIE_LABELS, maakDoel, type Categorie } from '@/modules/goals';
import { localDateIn, now } from '@/shared/time';
import { Body, Button, Caption, Card, Choice, Field, Screen, Subheading } from '@/shared/ui';

/**
 * Een hoofddoel aanmaken — QS8-31, met de identiteitsvraag uit QS8-36.
 *
 * ⚠️ De identiteitszin staat bewust bóven de beschrijving en niet onderaan bij
 *    de optionele velden. Habit Huddle heeft precies die vraag van een veldje
 *    naar de kop van de kaart gepromoveerd, en dat is de reden dat dit scherm zo
 *    is opgebouwd (voorstel §1.5).
 */
export default function NieuwDoel() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel } = useProfiel();

  const [titel, setTitel] = useState('');
  const [identiteit, setIdentiteit] = useState('');
  const [beschrijving, setBeschrijving] = useState('');
  const [categorie, setCategorie] = useState<Categorie>('other');
  const [datum, setDatum] = useState('');
  const [uren, setUren] = useState('');

  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar() {
    if (!userId || !profiel) return;
    setBezig(true);
    setFout(null);

    // ⚠️ "Vandaag" komt uit shared/time, in de tijdzone van deze gebruiker. Een
    //    doel voor morgen mag niet worden geweigerd omdat de server al over is.
    const vandaag = localDateIn(profiel.tz, now());

    const uitkomst = await maakDoel(
      userId,
      {
        title: titel,
        description: beschrijving.trim() === '' ? null : beschrijving,
        category: categorie,
        target_date: datum,
        identity_statement: identiteit.trim() === '' ? null : identiteit,
        available_hours_per_week: uren.trim() === '' ? null : Number(uren),
      },
      vandaag,
    );

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    router.replace(`/doel/${uitkomst.waarde.id}`);
  }

  return (
    <Screen title="Nieuw doel" eyebrow="ÉÉN DOEL TEGELIJK">
      <Card>
        <Field
          label="Wat wil je bereiken?"
          hint="Zo concreet dat een ander kan zien of het gelukt is."
          value={titel}
          onChangeText={setTitel}
          placeholder="Mijn boek afmaken"
        />

        <Field
          label="Wie word je als dit lukt?"
          hint="Optioneel, maar dit is de vraag die je er over vier maanden nog doorheen sleept."
          value={identiteit}
          onChangeText={setIdentiteit}
          placeholder="Iemand die schrijft, en niet iemand die wil schrijven"
        />
      </Card>

      <Card>
        <Field
          label="Streefdatum"
          hint="Moet in de toekomst liggen. Je kunt hem later verzetten, maar dat wordt bijgehouden."
          value={datum}
          onChangeText={setDatum}
          placeholder="2026-12-31"
          autoCapitalize="none"
          inputMode="numeric"
        />

        <Choice
          label="Categorie"
          opties={CATEGORIEEN.map((c) => ({ waarde: c, label: CATEGORIE_LABELS[c] }))}
          waarde={categorie}
          onKies={setCategorie}
        />
      </Card>

      <Card nested>
        <Subheading>Meer details</Subheading>
        <Body muted>Allebei optioneel. De Doelcoach gebruikt ze straks om beter te splitsen.</Body>

        <Field
          label="Beschrijving"
          value={beschrijving}
          onChangeText={setBeschrijving}
          multiline
          numberOfLines={4}
          placeholder="Waar gaat het over, en wat heb je al gedaan?"
        />

        <Field
          label="Uren per week"
          hint="Hoeveel tijd heb je hier realistisch voor? Voedt straks de Risico-radar."
          value={uren}
          onChangeText={setUren}
          inputMode="numeric"
          placeholder="6"
        />
      </Card>

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
        Doel aanmaken
      </Button>
      <Button variant="stil" block onPress={() => router.back()}>
        Annuleren
      </Button>
    </Screen>
  );
}
