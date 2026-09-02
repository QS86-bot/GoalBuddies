import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { updateProfiel, useProfiel, useSession } from '@/modules/auth';
import {
  CATEGORIE_GROEPEN,
  categorieLabels,
  MAX_FOCUSGEBIEDEN,
  MINUTEN_OPTIES,
  minutenLabels,
  MOMENTEN,
  momentLabels,
  patchUitVragenlijst,
  urenPerWeekUitMinuten,
  valkuilAntwoord,
  valkuilLabels,
  VALKUILEN,
  type Categorie,
  type Minuten,
  type Moment,
  type Valkuil,
  type VragenlijstInvoer,
} from '@/modules/goals';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import {
  Body,
  Button,
  Caption,
  Card,
  CategorieMerk,
  Choice,
  Screen,
  Subheading,
} from '@/shared/ui';

/**
 * De korte vragenlijst — QS8-257, besluit A56.
 *
 * ⚠️ **Ná de aanmeldmuur en niet ervoor.** Habit Huddle zet hem ervóór als
 *    acquisitiekanaal; dat is voorgelegd en afgewezen, want het vraagt een
 *    uitgelogd AI-eindpunt met een limiet, een misbruikvector en een rekening
 *    zonder gebruiker erachter.
 *
 * ⚠️ **Alles overslaan mag en wist niets.** Acceptatiecriterium 4 van QS8-37,
 *    en het staat er niet alleen als knop: `patchUitVragenlijst()` laat een
 *    overgeslagen antwoord met rust in plaats van het op `null` te zetten. Wie
 *    dit scherm een tweede keer opent en één vraag beantwoordt, houdt de andere
 *    drie.
 *
 * ⚠️ **Het samenvattingsscherm is het punt van dit issue en niet de vier
 *    vragen.** "Dit heb je me verteld — tik een antwoord aan om het te wijzigen"
 *    maakt het plan van de gebruiker in plaats van van de app, en het is de
 *    goedkoopste vertrouwenswinst in de hele flow. Wij sprongen tot nu toe van
 *    invullen meteen naar het resultaat.
 */

type Stap = 0 | 1 | 2 | 3 | 4;

/** De laatste stap is de samenvatting en geen vraag. */
const SAMENVATTING: Stap = 4;

export default function Vragenlijst() {
  const router = useRouter();
  const { userId } = useSession();
  const { profiel, herlaad } = useProfiel();

  const [stap, setStap] = useState<Stap>(0);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  // ⚠️ Wat er al op het profiel staat is het startpunt, niet een lege lijst.
  //    Wie dit scherm opnieuw opent, ziet zijn eigen antwoorden terug.
  const [invoer, setInvoer] = useState<VragenlijstInvoer>({
    focus_areas: (profiel?.focus_areas ?? []) as Categorie[],
    minutes_per_day: (profiel?.minutes_per_day ?? null) as Minuten | null,
    when_i_do_it: (profiel?.when_i_do_it ?? null) as Moment | null,
    what_breaks_it: (profiel?.what_breaks_it ?? []) as Valkuil[],
  });

  function wisselFocus(gebied: Categorie) {
    setInvoer((oud) => {
      const huidig = (oud.focus_areas ?? []) as Categorie[];
      if (huidig.includes(gebied)) {
        return { ...oud, focus_areas: huidig.filter((g) => g !== gebied) };
      }
      // ⚠️ Stil weigeren en niet stil de oudste eruit gooien: dat tweede laat de
      //    gebruiker een keuze verliezen die hij net gemaakt heeft. De bijtekst
      //    zegt wat er aan de hand is.
      if (huidig.length >= MAX_FOCUSGEBIEDEN) return oud;
      return { ...oud, focus_areas: [...huidig, gebied] };
    });
  }

  function wisselValkuil(valkuil: Valkuil) {
    setInvoer((oud) => {
      const huidig = (oud.what_breaks_it ?? []) as Valkuil[];
      return {
        ...oud,
        what_breaks_it: huidig.includes(valkuil)
          ? huidig.filter((v) => v !== valkuil)
          : [...huidig, valkuil],
      };
    });
  }

  async function bewaar() {
    if (!userId) return;
    setBezig(true);
    setFout(null);

    const uitkomst = await updateProfiel(userId, patchUitVragenlijst(invoer));

    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
      return;
    }

    herlaad();
    // ⚠️ Naar de doelen en niet naar Vandaag: wie net verteld heeft waar hij zich
    //    op wil richten, hoort meteen bij de plek te komen waar hij dat vastlegt.
    router.replace('/doelen');
  }

  return (
    <Screen
      title={t('vragenlijst.titel')}
      eyebrow={t('vragenlijst.eyebrow')}
      terug={{ naar: '/doelen' }}
    >
      {stap === 0 ? (
        <FocusVraag
          gekozen={(invoer.focus_areas ?? []) as Categorie[]}
          onWissel={wisselFocus}
        />
      ) : null}

      {stap === 1 ? (
        <TijdVraag
          waarde={(invoer.minutes_per_day ?? null) as Minuten | null}
          onKies={(minuten) => setInvoer((oud) => ({ ...oud, minutes_per_day: minuten }))}
        />
      ) : null}

      {stap === 2 ? (
        <MomentVraag
          waarde={(invoer.when_i_do_it ?? null) as Moment | null}
          onKies={(moment) => setInvoer((oud) => ({ ...oud, when_i_do_it: moment }))}
        />
      ) : null}

      {stap === 3 ? (
        <ValkuilVraag
          gekozen={(invoer.what_breaks_it ?? []) as Valkuil[]}
          onWissel={wisselValkuil}
        />
      ) : null}

      {stap === SAMENVATTING ? (
        <Samenvatting invoer={invoer} onWijzig={(naar) => setStap(naar)} />
      ) : null}

      {fout === null ? null : <Caption danger>{fout}</Caption>}

      <View style={styles.knoppen}>
        {stap === SAMENVATTING ? (
          <Button variant="primair" block busy={bezig} onPress={() => void bewaar()}>
            {t('vragenlijst.samenvatting.bewaren')}
          </Button>
        ) : (
          <Button variant="primair" block onPress={() => setStap((s) => (s + 1) as Stap)}>
            {t('vragenlijst.volgende')}
          </Button>
        )}

        {stap === 0 ? null : (
          <Button variant="stil" block onPress={() => setStap((s) => (s - 1) as Stap)}>
            {t('vragenlijst.vorige')}
          </Button>
        )}

        {/*
          ⚠️ Overslaan staat op élke stap en niet alleen op de eerste. Wie bij
             vraag drie besluit dat het genoeg is, hoort niet nog twee schermen
             te moeten doorklikken om weg te komen.
        */}
        {stap === SAMENVATTING ? null : (
          <Button variant="stil" block onPress={() => setStap(SAMENVATTING)}>
            {t('vragenlijst.overslaan')}
          </Button>
        )}
      </View>

      <Caption>{t('vragenlijst.alles_overslaan')}</Caption>
    </Screen>
  );
}

function FocusVraag({
  gekozen,
  onWissel,
}: {
  readonly gekozen: readonly Categorie[];
  readonly onWissel: (gebied: Categorie) => void;
}) {
  const labels = categorieLabels();
  const vol = gekozen.length >= MAX_FOCUSGEBIEDEN;

  return (
    <Card>
      <Subheading>{t('vragenlijst.focus.vraag')}</Subheading>
      <Caption>{t('vragenlijst.focus.toelichting')}</Caption>

      {CATEGORIE_GROEPEN.map((groep) => (
        <View key={groep.sleutel} style={styles.gebieden}>
          {groep.leden.map((gebied) => (
            <Button
              key={gebied}
              variant={gekozen.includes(gebied) ? 'secundair' : 'stil'}
              onPress={() => onWissel(gebied)}
            >
              {labels[gebied]}
            </Button>
          ))}
        </View>
      ))}

      {vol ? <Caption>{t('vragenlijst.focus.vol')}</Caption> : null}
    </Card>
  );
}

function TijdVraag({
  waarde,
  onKies,
}: {
  readonly waarde: Minuten | null;
  readonly onKies: (minuten: Minuten) => void;
}) {
  const uren = urenPerWeekUitMinuten(waarde);

  return (
    <Card>
      <Choice
        label={t('vragenlijst.tijd.vraag')}
        hint={t('vragenlijst.tijd.toelichting')}
        opties={MINUTEN_OPTIES.map((m) => ({ waarde: m, label: minutenLabels()[m] }))}
        waarde={waarde ?? 0}
        onKies={(m) => onKies(m as Minuten)}
      />

      {/*
        ⚠️ De omrekening staat op het scherm en gebeurt niet stil. Het interview
           vult straks uren per week voor; die waarde namens iemand verzinnen
           zonder het te laten zien, is een getal invullen dat hij niet gegeven
           heeft.
      */}
      {uren === null ? null : <Caption>{t('vragenlijst.uren_per_week', { uren })}</Caption>}
    </Card>
  );
}

function MomentVraag({
  waarde,
  onKies,
}: {
  readonly waarde: Moment | null;
  readonly onKies: (moment: Moment) => void;
}) {
  return (
    <Card>
      <Choice
        label={t('vragenlijst.moment.vraag')}
        hint={t('vragenlijst.moment.toelichting')}
        opties={MOMENTEN.map((m) => ({ waarde: m, label: momentLabels()[m] }))}
        waarde={waarde ?? ''}
        onKies={(m) => onKies(m as Moment)}
      />
    </Card>
  );
}

/**
 * ⚠️ **Hier zit de waarde van deze vragenlijst.** Elk aangevinkt antwoord krijgt
 *    meteen te zien wat de app ertegen heeft — en dat is machinerie die al
 *    bestaat: de vloer, de weekpas, peer-goedkeuring, de adempauze. Dit is de
 *    plek waar we uitleggen wat ons anders maakt, in de woorden van de gebruiker
 *    zelf.
 *
 * ⚠️ **Er wordt niets aangezet.** Aanvinken slaat een antwoord op en laat zien
 *    wat er al is; het zet geen gedrag aan dat de gebruiker niet gevraagd heeft.
 */
function ValkuilVraag({
  gekozen,
  onWissel,
}: {
  readonly gekozen: readonly Valkuil[];
  readonly onWissel: (valkuil: Valkuil) => void;
}) {
  const labels = valkuilLabels();

  return (
    <Card>
      <Subheading>{t('vragenlijst.valkuil.vraag')}</Subheading>
      <Caption>{t('vragenlijst.valkuil.toelichting')}</Caption>

      {VALKUILEN.map((valkuil) => (
        <View key={valkuil} style={styles.valkuil}>
          <Button
            variant={gekozen.includes(valkuil) ? 'secundair' : 'stil'}
            block
            onPress={() => onWissel(valkuil)}
          >
            {labels[valkuil]}
          </Button>

          {gekozen.includes(valkuil) ? (
            <Body muted>{valkuilAntwoord(valkuil).antwoord}</Body>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

/**
 * "Dit heb je me verteld — tik een antwoord aan om het te wijzigen."
 *
 * ⚠️ Elke regel is een knop naar zijn eigen vraag. Een samenvatting die je
 *    alleen kunt lezen, is een bevestigingsscherm; een samenvatting die je kunt
 *    bijstellen, maakt het plan van de gebruiker.
 */
function Samenvatting({
  invoer,
  onWijzig,
}: {
  readonly invoer: VragenlijstInvoer;
  readonly onWijzig: (naar: Stap) => void;
}) {
  const gebieden = (invoer.focus_areas ?? []) as Categorie[];
  const valkuilen = (invoer.what_breaks_it ?? []) as Valkuil[];
  const minuten = (invoer.minutes_per_day ?? null) as Minuten | null;
  const moment = (invoer.when_i_do_it ?? null) as Moment | null;

  const niets = t('vragenlijst.samenvatting.niets');
  const alles =
    gebieden.length === 0 && valkuilen.length === 0 && minuten === null && moment === null;

  return (
    <Card>
      <Subheading>{t('vragenlijst.samenvatting.kop')}</Subheading>
      <Caption>{t('vragenlijst.samenvatting.uitleg')}</Caption>

      {alles ? <Body muted>{t('vragenlijst.samenvatting.leeg')}</Body> : null}

      <Regel
        vraag={t('vragenlijst.focus.vraag')}
        antwoord={
          gebieden.length === 0
            ? niets
            : gebieden.map((g) => categorieLabels()[g]).join(' · ')
        }
        onWijzig={() => onWijzig(0)}
      />
      {gebieden.length === 0 ? null : (
        <View style={styles.gebieden}>
          {gebieden.map((gebied) => (
            <CategorieMerk key={gebied} categorie={gebied} label={categorieLabels()[gebied]} />
          ))}
        </View>
      )}

      <Regel
        vraag={t('vragenlijst.tijd.vraag')}
        antwoord={minuten === null ? niets : minutenLabels()[minuten]}
        onWijzig={() => onWijzig(1)}
      />

      <Regel
        vraag={t('vragenlijst.moment.vraag')}
        antwoord={moment === null ? niets : momentLabels()[moment]}
        onWijzig={() => onWijzig(2)}
      />

      <Regel
        vraag={t('vragenlijst.valkuil.vraag')}
        antwoord={
          valkuilen.length === 0
            ? niets
            : valkuilen.map((v) => valkuilLabels()[v]).join(' · ')
        }
        onWijzig={() => onWijzig(3)}
      />

      {valkuilen.length === 0 ? null : (
        <View style={styles.helpt}>
          <Caption>{t('vragenlijst.samenvatting.dit_helpt')}</Caption>
          {valkuilen.map((valkuil) => (
            <Body key={valkuil} muted>
              {valkuilAntwoord(valkuil).antwoord}
            </Body>
          ))}
        </View>
      )}
    </Card>
  );
}

function Regel({
  vraag,
  antwoord,
  onWijzig,
}: {
  readonly vraag: string;
  readonly antwoord: string;
  readonly onWijzig: () => void;
}) {
  return (
    <View style={styles.regel}>
      <Caption>{vraag}</Caption>
      <Button variant="stil" block onPress={onWijzig}>
        {antwoord}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  knoppen: { gap: space.blokGap - 4 },
  gebieden: { flexDirection: 'row', flexWrap: 'wrap', gap: space.blokGap - 5 },
  valkuil: { gap: 4 },
  regel: { gap: 2 },
  helpt: { gap: 4 },
});
