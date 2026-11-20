import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AVATAR_MAX_BYTES,
  updateProfiel,
  verwijderMijnAccount,
  type Profiel as ProfielRij,
} from '@/modules/auth';
import { useAvatarKeuze } from '@/modules/auth/react';

import { t } from '@/shared/i18n';
import { telTekens } from '@/shared/tekst';
import { space } from '@/shared/theme';

import { AvatarKeuze, Body, Button, Caption, Card, Field, Subheading } from '@/shared/ui';

/**
 * Je weergavenaam wijzigen — QS8-473.
 *
 * ⚠️ **Dit was een leeskant zonder schrijfpad**, dezelfde vorm als de profielfoto
 *    in QS8-196 en de taalkeuze in QS8-115: `profielSchema` kende `display_name`
 *    al, `updateProfiel()` nam hem al mee, `schoneNaam()` en de CHECK
 *    `profiles_display_name_zichtbaar` uit 0256 stonden er — en het enige
 *    invoerveld stond in de onboarding, een scherm dat je één keer ziet.
 *    Onwrikbare regel 18, vraag 5: elk schakeltje af en de keten nergens
 *    verbonden.
 *
 * ⚠️ **Geen eigen validatie.** De regels staan in `profielSchema` en de grens
 *    staat in de database; wat hier gebeurt is dat `updateProfiel()` zijn melding
 *    teruggeeft en dit scherm hem toont. Een tweede regelset hier zou de derde
 *    plek zijn die uit de pas kan lopen — precies wat de kop van `profielSchema`
 *    over `.trim()` en `.max()` uitlegt.
 *
 * ⚠️ **`telTekens()` en niet `.length`.** De teller moet in dezelfde eenheid
 *    staan als de grens: `char_length` telt codepunten, `.length` telt
 *    UTF-16-eenheden, en een naam van tachtig emoji is er honderdzestig. Een
 *    teller in de verkeerde eenheid is een nieuwe fout en geen reparatie
 *    (QS8-118).
 */
function useNaamOpslaan(naam: string, userId: string, onOpgeslagen: (profiel: ProfielRij) => void) {
  const [wil, zetWil] = useState(naam);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bewaard, setBewaard] = useState(false);

  async function bewaar() {
    setBezig(true);
    setFout(null);
    setBewaard(false);

    // ⚠️ De uitkomst wordt gelezen en niet weggegooid — `void updateProfiel(...)`
    //    is de vorm die QS8-245 een stille mislukking opleverde, en
    //    `tests/beloftes/uitkomst-niet-weggooien.test.ts` bewaakt die klasse.
    const uitkomst = await updateProfiel(userId, { display_name: wil });

    if (uitkomst.ok) {
      onOpgeslagen(uitkomst.profiel);
      // ⚠️ Terugzetten uit het opgeslagen profiel en niet uit `wil`:
      //    `schoneNaam()` kan hebben geknipt of genormaliseerd, en dan staat er
      //    in het veld iets anders dan in de database. Het veld hoort te tonen
      //    wat er écht staat.
      zetWil(uitkomst.profiel.display_name);
      setBewaard(true);
    } else {
      setFout(uitkomst.melding);
    }

    setBezig(false);
  }

  function typ(waarde: string) {
    zetWil(waarde);
    setBewaard(false);
  }

  return { wil, bezig, fout, bewaard, bewaar, typ };
}

export function Naamkaart({
  naam,
  userId,
  onOpgeslagen,
}: {
  readonly naam: string;
  readonly userId: string;
  readonly onOpgeslagen: (profiel: ProfielRij) => void;
}) {
  const { wil, bezig, fout, bewaard, bewaar, typ } = useNaamOpslaan(naam, userId, onOpgeslagen);

  return (
    <Card>
      <Subheading>{t('profiel.naam_titel')}</Subheading>
      <Body muted>{t('profiel.naam_uitleg')}</Body>

      <Field
        label={t('profiel.naam_label')}
        hint={t('profiel.naam_hint')}
        value={wil}
        onChangeText={typ}
        autoCapitalize="words"
        autoComplete="name"
        placeholder={t('onboarding.naam_plaatshouder')}
        editable={!bezig}
      />
      <Caption>{`${telTekens(wil)}/80`}</Caption>

      <Button busy={bezig} onPress={() => void bewaar()}>
        {t('profiel.naam_bewaren')}
      </Button>

      {bewaard ? <Caption muted={false}>{t('profiel.naam_bewaard')}</Caption> : null}
      {fout === null ? null : <Caption danger>{fout}</Caption>}
    </Card>
  );
}

/**
 * De twee helften aan elkaar — QS8-196.
 *
 * ⚠️ Zo dun met opzet: de knop staat in `shared/ui` en het werk in
 *    `useAvatarKeuze()`. Dit stukje mag in twee schermen staan omdat er niets in
 *    zit dat uit elkaar kan lopen.
 */
export function Avatarkaart({
  profiel,
  onGewijzigd,
}: {
  readonly profiel: ProfielRij;
  readonly onGewijzigd: (profiel: ProfielRij) => void;
}) {
  const keuze = useAvatarKeuze(profiel, onGewijzigd);

  return (
    <AvatarKeuze
      naam={profiel.display_name}
      avatarUrl={profiel.avatar_url}
      maxBytes={AVATAR_MAX_BYTES}
      bezig={keuze.bezig}
      fout={keuze.fout}
      onKies={() => void keuze.kies()}
      onWeghalen={() => void keuze.weghalen()}
    />
  );
}

const WOORD = 'VERWIJDER';

/** Het overtyp-formulier van account verwijderen; de handeling zelf staat in de aanroeper. */
function VerwijderBevestigen({
  bevestiging,
  bezig,
  fout,
  onTyp,
  onDefinitief,
  onAnnuleer,
}: {
  readonly bevestiging: string;
  readonly bezig: boolean;
  readonly fout: string | null;
  readonly onTyp: (v: string) => void;
  readonly onDefinitief: () => void;
  readonly onAnnuleer: () => void;
}) {
  return (
    <Card nested>
      <Subheading>{t('profiel.zeker_weten')}</Subheading>
      <Body>{t('profiel.geen_backup')}</Body>
      <Field
        label={t('profiel.typ_woord', { woord: WOORD })}
        value={bevestiging}
        onChangeText={onTyp}
        autoCapitalize="characters"
        placeholder={WOORD}
      />
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <View style={styles.keuzes}>
        <Button
          variant="secundair"
          busy={bezig}
          disabled={bevestiging.trim().toUpperCase() !== WOORD}
          onPress={onDefinitief}
        >
          {t('profiel.definitief')}
        </Button>
        <Button variant="stil" disabled={bezig} onPress={onAnnuleer}>
          {t('profiel.toch_niet')}
        </Button>
      </View>
    </Card>
  );
}

/**
 * Je account verwijderen — Q-TODO A3, en een AVG-verplichting.
 *
 * ⚠️ Onomkeerbaar, dus met een tussenstap die je moet uittypen. Een knop met
 *    "weet je het zeker?" ernaast is op een telefoon één duimbeweging van een
 *    account dat weg is; het woord overtypen kost drie seconden en die drie
 *    seconden zijn hier het hele punt. Dit is precies het tegenovergestelde van
 *    de keuze op het beoordeelscherm, en om precies dezelfde reden: dáár is de
 *    vergissing goedkoop terug te draaien, hier niet.
 *
 * ⚠️ Wat er gebeurt staat er letterlijk bij, ook het deel dat blijft staan. Zou
 *    hier alleen "alles wordt verwijderd" staan, dan is dat niet waar: je
 *    goedkeuringen en je chatberichten blijven bestaan zonder je naam, want die
 *    zijn van je buddy's (migratie 0031).
 */
export function AccountVerwijderen() {
  const [open, setOpen] = useState(false);
  const [bevestiging, setBevestiging] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verwijder() {
    setBezig(true);
    setFout(null);

    const uitkomst = await verwijderMijnAccount();
    setBezig(false);

    // Bij succes is de sessie al weg en stuurt de router je naar het inlogscherm;
    // er valt hier niets meer te tonen.
    if (!uitkomst.ok) setFout(uitkomst.melding);
  }

  if (!open) {
    return (
      <Card nested>
        <Subheading>{t('profiel.verwijder_titel')}</Subheading>
        <Body muted>{t('profiel.verwijder_uitleg')}</Body>
        <Button variant="stil" onPress={() => setOpen(true)}>
          {t('profiel.verwijder_knop')}
        </Button>
      </Card>
    );
  }

  return (
    <VerwijderBevestigen
      bevestiging={bevestiging}
      bezig={bezig}
      fout={fout}
      onTyp={setBevestiging}
      onDefinitief={() => void verwijder()}
      onAnnuleer={() => {
        setOpen(false);
        setBevestiging('');
        setFout(null);
      }}
    />
  );
}

const styles = StyleSheet.create({
  keuzes: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});
