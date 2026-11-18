import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/modules/auth';
import { toonCode } from '@/modules/buddies';
import {
  fetchMijnOrganisaties,
  fetchOrganisatieleden,
  fetchOrganisatieteams,
  fetchUitnodigcode,
  maakTeam,
  verlaatOrganisatie,
  vernieuwOrganisatiecode,
  zetLidUit,
  type Organisatie,
  type Organisatielid,
  type Resultaat,
} from '@/modules/organisaties';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  AsyncView,
  Bevestiging,
  Body,
  Button,
  Caption,
  Card,
  Field,
  Screen,
  Subheading,
  useAsync,
  useBladerlijst,
  type BevestigingsTekst,
} from '@/shared/ui';

/**
 * Een organisatie: leden, teams en (voor een beheerder) de uitnodigcode — QS8-657.
 *
 * ⚠️ **Niet gevonden en geen lid is één lege staat met één zin.** De lijst met
 *    je organisaties bevat alleen wat je mag zien; een verzonnen id en een
 *    organisatie waar je niet in zit zijn hier niet te onderscheiden, en dat is
 *    met opzet — anders is dit scherm een orakel voor bestaande id's.
 *
 * ⚠️ **De rol bepaalt alleen welke knoppen er staan.** De server toetst elke
 *    handeling opnieuw en antwoordt `niet_toegestaan`.
 *
 * ⚠️ **De teamnamen zijn tekst en geen link, en dat is een keuze.**
 *    `/groep/<id>` is voor niet-teamleden een leeg scherm, en voor de meeste
 *    lezers hier is dat zo. Een link die voor de meesten nergens heen leidt is
 *    een dood eind; wie in het team zit, vindt het team bij zijn groepen.
 */
export default function OrganisatieScherm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mijn = useAsync(() => fetchMijnOrganisaties(), [id]);
  const organisatie = mijn.data?.find((o) => o.id === id);

  return (
    <Screen
      title={organisatie?.naam ?? t('organisatie.eyebrow')}
      eyebrow={organisatie === undefined ? undefined : t('organisatie.eyebrow')}
      terug={{ naar: '/profiel' }}
    >
      <AsyncView
        loading={mijn.loading}
        error={mijn.error}
        data={organisatie}
        isEmpty={() => false}
        onRetry={mijn.herlaad}
        empty={{
          title: t('organisatie.niet_gevonden_titel'),
          body: t('organisatie.niet_gevonden_tekst'),
        }}
      >
        {(org) => <Inhoud organisatie={org} />}
      </AsyncView>
    </Screen>
  );
}

function Inhoud({ organisatie }: { readonly organisatie: Organisatie }) {
  const beheerder = organisatie.rol === 'admin';
  // Uitzetten wisselt de code (0299); dit getal laat het codeblok opnieuw lezen.
  const [codeVersie, setCodeVersie] = useState(0);

  return (
    <View style={styles.blokken}>
      <Caption>
        {beheerder ? t('organisatie.jouw_rol_beheerder') : t('organisatie.jouw_rol_lid')}
      </Caption>
      <Ledenblok
        organisatieId={organisatie.id}
        beheerder={beheerder}
        onUitgezet={() => setCodeVersie((n) => n + 1)}
      />
      <Teamsblok organisatieId={organisatie.id} beheerder={beheerder} />
      {beheerder ? <Codeblok organisatieId={organisatie.id} versie={codeVersie} /> : null}
      <Verlaten organisatieId={organisatie.id} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Gedeeld
// ---------------------------------------------------------------------------

function MeerLaden({
  heeftMeer,
  bezig,
  fout,
  onPress,
}: {
  readonly heeftMeer: boolean;
  readonly bezig: boolean;
  readonly fout: boolean;
  readonly onPress: () => void;
}) {
  if (!heeftMeer) return null;
  return (
    <View style={styles.blok}>
      {fout ? <Caption danger>{t('organisatie.meer_mislukt')}</Caption> : null}
      <Button variant="secundair" busy={bezig} onPress={onPress}>
        {t('organisatie.meer_laden')}
      </Button>
    </View>
  );
}

/** Eén handeling met bevestiging: bezig, fout en uitvoeren op één plek. */
function useHandeling() {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function voerUit<T>(
    actie: () => Promise<Resultaat<T>>,
    bijSucces: (waarde: T) => void,
  ): Promise<void> {
    setBezig(true);
    setFout(null);
    const uitkomst = await actie();
    setBezig(false);
    if (uitkomst.ok) bijSucces(uitkomst.waarde);
    else setFout(uitkomst.melding);
  }

  return { bezig, fout, voerUit, wisFout: () => setFout(null) };
}

// ---------------------------------------------------------------------------
// Leden
// ---------------------------------------------------------------------------

interface LedenblokProps {
  readonly organisatieId: string;
  readonly beheerder: boolean;
  readonly onUitgezet: () => void;
}

function Ledenblok({ organisatieId, beheerder, onUitgezet }: LedenblokProps) {
  const { userId } = useSession();
  const lijst = useBladerlijst((na) => fetchOrganisatieleden(organisatieId, na), [organisatieId]);

  return (
    <Card>
      <Subheading>{t('organisatie.leden_kop')}</Subheading>
      <AsyncView
        loading={lijst.loading}
        error={lijst.error}
        data={lijst.rijen}
        isEmpty={(rijen) => rijen.length === 0}
        onRetry={lijst.herlaad}
        empty={{
          title: t('organisatie.leden_leeg_titel'),
          body: t('organisatie.leden_leeg_tekst'),
        }}
      >
        {(rijen) => (
          <View style={styles.blok}>
            {rijen.map((lid) => (
              <Ledenrij
                key={lid.userId}
                organisatieId={organisatieId}
                lid={lid}
                kanUitzetten={beheerder && lid.rol === 'member' && lid.userId !== userId}
                onUitgezet={() => {
                  lijst.herlaad();
                  onUitgezet();
                }}
              />
            ))}
            <MeerLaden
              heeftMeer={lijst.heeftMeer}
              bezig={lijst.bezig}
              fout={lijst.meerFout}
              onPress={() => void lijst.laadMeer()}
            />
          </View>
        )}
      </AsyncView>
    </Card>
  );
}

function uitzettenTekst(naam: string): BevestigingsTekst {
  return {
    titel: t('organisatie.uitzetten_titel'),
    uitleg: t('organisatie.uitzetten_uitleg', { naam }),
    bevestig: t('organisatie.uitzetten_bevestig', { naam }),
  };
}

function Ledenrij({
  organisatieId,
  lid,
  kanUitzetten,
  onUitgezet,
}: {
  readonly organisatieId: string;
  readonly lid: Organisatielid;
  readonly kanUitzetten: boolean;
  readonly onUitgezet: () => void;
}) {
  const [open, setOpen] = useState(false);
  const handeling = useHandeling();

  return (
    <View style={styles.blok}>
      <View style={styles.rij}>
        <Body>{lid.naam}</Body>
        {lid.rol === 'admin' ? <Caption>{t('organisatie.rol_beheerder')}</Caption> : null}
        {kanUitzetten && !open ? (
          <Button
            variant="stil"
            accessibilityLabel={t('organisatie.uitzetten_label', { naam: lid.naam })}
            onPress={() => setOpen(true)}
          >
            {t('organisatie.uitzetten_knop')}
          </Button>
        ) : null}
      </View>
      {open ? (
        <Bevestiging
          tekst={uitzettenTekst(lid.naam)}
          bezig={handeling.bezig}
          fout={handeling.fout}
          onAnnuleer={() => {
            setOpen(false);
            handeling.wisFout();
          }}
          onBevestig={() =>
            void handeling.voerUit(() => zetLidUit(organisatieId, lid.userId), onUitgezet)
          }
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function Teamsblok({
  organisatieId,
  beheerder,
}: {
  readonly organisatieId: string;
  readonly beheerder: boolean;
}) {
  const lijst = useBladerlijst((na) => fetchOrganisatieteams(organisatieId, na), [organisatieId]);

  return (
    <Card>
      <Subheading>{t('organisatie.teams_kop')}</Subheading>
      <Caption>{t('organisatie.teams_uitleg')}</Caption>
      <AsyncView
        loading={lijst.loading}
        error={lijst.error}
        data={lijst.rijen}
        isEmpty={(rijen) => rijen.length === 0}
        onRetry={lijst.herlaad}
        empty={{
          title: t('organisatie.teams_leeg_titel'),
          body: t('organisatie.teams_leeg_tekst'),
        }}
      >
        {(rijen) => (
          <View style={styles.blok}>
            {rijen.map((team) => (
              <Body key={team.id}>{team.naam}</Body>
            ))}
            <MeerLaden
              heeftMeer={lijst.heeftMeer}
              bezig={lijst.bezig}
              fout={lijst.meerFout}
              onPress={() => void lijst.laadMeer()}
            />
          </View>
        )}
      </AsyncView>
      {beheerder ? <TeamAanmaken organisatieId={organisatieId} onGemaakt={lijst.herlaad} /> : null}
    </Card>
  );
}

function TeamAanmaken({
  organisatieId,
  onGemaakt,
}: {
  readonly organisatieId: string;
  readonly onGemaakt: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [gemaakt, setGemaakt] = useState(false);

  if (open) {
    return (
      <TeamFormulier
        organisatieId={organisatieId}
        onKlaar={(isGemaakt) => {
          setOpen(false);
          if (isGemaakt) {
            setGemaakt(true);
            onGemaakt();
          }
        }}
      />
    );
  }

  return (
    <View style={styles.blok}>
      {gemaakt ? <Caption>{t('organisatie.team_gemaakt')}</Caption> : null}
      <Button variant="secundair" onPress={() => setOpen(true)}>
        {t('organisatie.team_nieuw_knop')}
      </Button>
    </View>
  );
}

function TeamFormulier({
  organisatieId,
  onKlaar,
}: {
  readonly organisatieId: string;
  readonly onKlaar: (gemaakt: boolean) => void;
}) {
  const [naam, setNaam] = useState('');
  const handeling = useHandeling();

  return (
    <View style={styles.blok}>
      <Field
        label={t('organisatie.team_naam_label')}
        hint={t('organisatie.team_naam_hint')}
        value={naam}
        onChangeText={setNaam}
        autoCorrect={false}
        {...(handeling.fout === null ? {} : { error: handeling.fout })}
      />
      <View style={styles.rij}>
        <Button
          variant="primair"
          busy={handeling.bezig}
          onPress={() =>
            void handeling.voerUit(
              () => maakTeam(organisatieId, naam),
              () => onKlaar(true),
            )
          }
        >
          {t('organisatie.team_opslaan')}
        </Button>
        <Button variant="stil" disabled={handeling.bezig} onPress={() => onKlaar(false)}>
          {t('bevestiging.annuleren')}
        </Button>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// De uitnodigcode (alleen beheerder)
// ---------------------------------------------------------------------------

type Codeactie = 'vernieuwen' | 'intrekken';

function codeTekst(actie: Codeactie): BevestigingsTekst {
  return actie === 'vernieuwen'
    ? {
        titel: t('organisatie.code_vernieuwen_titel'),
        uitleg: t('organisatie.code_vernieuwen_uitleg'),
        bevestig: t('organisatie.code_vernieuwen_bevestig'),
      }
    : {
        titel: t('organisatie.code_intrekken_titel'),
        uitleg: t('organisatie.code_intrekken_uitleg'),
        bevestig: t('organisatie.code_intrekken_bevestig'),
      };
}

function Codeblok({
  organisatieId,
  versie,
}: {
  readonly organisatieId: string;
  readonly versie: number;
}) {
  const code = useAsync(() => fetchUitnodigcode(organisatieId), [organisatieId, versie]);

  return (
    <Card>
      <Subheading>{t('organisatie.code_kop')}</Subheading>
      <AsyncView
        loading={code.loading}
        error={code.error}
        data={code.data}
        isEmpty={(waarde) => waarde === null}
        onRetry={code.herlaad}
        empty={{
          title: t('organisatie.code_leeg_titel'),
          body: t('organisatie.code_leeg_tekst'),
        }}
      >
        {(waarde) =>
          waarde === null ? null : (
            <CodeActies
              organisatieId={organisatieId}
              code={waarde.code}
              ingetrokken={waarde.ingetrokken}
              onVerandert={code.herlaad}
            />
          )
        }
      </AsyncView>
    </Card>
  );
}

interface CodeActiesProps {
  readonly organisatieId: string;
  readonly code: string;
  readonly ingetrokken: boolean;
  readonly onVerandert: () => void;
}

function CodeActies({ organisatieId, code, ingetrokken, onVerandert }: CodeActiesProps) {
  const [actie, setActie] = useState<Codeactie | null>(null);
  const handeling = useHandeling();

  function stop() {
    setActie(null);
    handeling.wisFout();
  }

  return (
    <View style={styles.blok}>
      <Caption>{t('organisatie.code_uitleg')}</Caption>
      <Subheading>{toonCode(code)}</Subheading>
      {ingetrokken ? <Caption>{t('organisatie.code_ingetrokken')}</Caption> : null}
      {actie === null ? (
        <CodeKnoppen ingetrokken={ingetrokken} onKies={setActie} />
      ) : (
        <Bevestiging
          tekst={codeTekst(actie)}
          bezig={handeling.bezig}
          fout={handeling.fout}
          onAnnuleer={stop}
          onBevestig={() =>
            void handeling.voerUit(
              () => vernieuwOrganisatiecode(organisatieId, actie === 'intrekken'),
              () => {
                stop();
                onVerandert();
              },
            )
          }
        />
      )}
    </View>
  );
}

function CodeKnoppen({
  ingetrokken,
  onKies,
}: {
  readonly ingetrokken: boolean;
  readonly onKies: (actie: Codeactie) => void;
}) {
  return (
    <View style={styles.rij}>
      <Button variant="secundair" onPress={() => onKies('vernieuwen')}>
        {t('organisatie.code_vernieuwen_knop')}
      </Button>
      {ingetrokken ? null : (
        <Button variant="stil" onPress={() => onKies('intrekken')}>
          {t('organisatie.code_intrekken_knop')}
        </Button>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Verlaten
// ---------------------------------------------------------------------------

function Verlaten({ organisatieId }: { readonly organisatieId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const handeling = useHandeling();

  if (!open) {
    return (
      <Button variant="stil" onPress={() => setOpen(true)}>
        {t('organisatie.verlaten_knop')}
      </Button>
    );
  }

  return (
    <Bevestiging
      tekst={{
        titel: t('organisatie.verlaten_titel'),
        uitleg: t('organisatie.verlaten_uitleg'),
        bevestig: t('organisatie.verlaten_bevestig'),
      }}
      bezig={handeling.bezig}
      fout={handeling.fout}
      onAnnuleer={() => {
        setOpen(false);
        handeling.wisFout();
      }}
      onBevestig={() =>
        void handeling.voerUit(
          () => verlaatOrganisatie(organisatieId),
          () => router.replace('/profiel'),
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  blok: { gap: space.blokGap },
  rij: { flexDirection: 'row', gap: space.blokGap, alignItems: 'center', flexWrap: 'wrap' },
});
