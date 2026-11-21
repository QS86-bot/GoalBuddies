import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { signOut, useProfiel, useSession } from '@/modules/auth';

import { fetchOpenstaandeMeldingen } from '@/modules/buddies';

import { fetchMijnOrganisaties } from '@/modules/organisaties';

import { t } from '@/shared/i18n';

import { space } from '@/shared/theme';

import {
  Accountregel,
  AsyncView,
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  Paginakop,
  Screen,
  Subheading,
  useAsync,
  zetMeldingWacht,
} from '@/shared/ui';

/**
 * Profiel — jezelf, je ingangen naar statistieken en prestaties, en de ingang naar Instellingen.
 *
 * ⚠️ Dit is de enige plek waar punten mogen staan. `points_ledger` en het
 *    puntentotaal zijn uitsluitend voor de eigenaar leesbaar (domeinregel 10):
 *    een dalend totaal is zichtbaar bewijs van een gemiste week, en dat botst
 *    met domeinregel 7. De groep ziet De Ketting en mijlpalen, nooit dit scherm.
 */
export default function Profiel() {
  const { profiel, loading, error, herlaad } = useProfiel();

  return (
    <Screen title={t('profiel.titel')} kop={<Paginakop titel={t('profiel.titel')} />}>
      {/*
        ⚠️ `onRetry` stond hier niet, en dat maakte dit scherm bij een laadfout
           volledig dood: álle inhoud staat binnen deze AsyncView, inclusief de
           uitlogknop. Er was geen enkele uitweg behalve de app herstarten.
      */}
      <AsyncView
        loading={loading}
        error={error}
        data={profiel ?? undefined}
        isEmpty={() => false}
        onRetry={herlaad}
        empty={{
          title: t('profiel.leeg_titel'),
          body: t('profiel.leeg_tekst'),
        }}
      >
        {(p) => (
          <View style={styles.blokken}>
            {/*
              ⚠️ **Bovenaan en niet onderaan** — QS8-777 (besluit Quinten 20-11-2026). Wie hier komt omdat de stip op
                 de tab het zei, moet de kaart zien zonder te scrollen. Voor wie niets mag beoordelen blijft de
                 plek leeg: de kaart verschijnt alleen als de RPC een rij teruggeeft.
            */}
            <MeldingenIngang />
            <Card>
              <View style={styles.kop}>
                <Avatar name={p.display_name} url={p.avatar_url} size={44} />
                <View style={styles.kopTekst}>
                  <Subheading>{p.display_name}</Subheading>
                  <Caption>
                    {p.wants_own_goal ? t('profiel.eigen_doel') : t('profiel.als_buddy')}
                  </Caption>
                </View>
              </View>
            </Card>

            {/*
              ⚠️ **Uitloggen staat hier en niet onderaan, en dat is een gemeten
                 bevinding** (QS8-245). Het was het twáalfde blok op dit scherm,
                 onder taal, tijdzone, meldingen, herinnering, thema en viering —
                 een halve minuut scrollen langs instellingen die je niet zocht.
                 De eigenaar van het product vond hem zelf niet.

                 Het kostte bovendien echt iets: `routewacht.ts` stuurt je van
                 `/aanmelden` naar `/` zodra je een sessie hebt, en het
                 aanmeldscherm is de enige plek met de Apple- en Google-knop.
                 Uitloggen is dus de enige route daarheen, en die route was niet
                 te vinden.

                 ⚠️ Account verwijderen blijft wél onderaan, met zijn
                 overtyp-bevestiging. Dat is met opzet moeilijk bereikbaar.
            */}
            <Uitloggen />

            {/*
              ⚠️ Hier stond een `StreakCounter` met een hardgecodeerde `cycles={0}`.
                 Zolang nergens anders een reeks stond, was dat een plaatshouder.
                 Sinds QS8-75 toont "Vandaag" de échte reeks per doel, en dan is
                 dit geen plaatshouder meer maar een tegenspraak: acht weken op
                 rij op het ene scherm, "Nog geen reeks" op het andere. Een
                 gebruiker leest dat niet als een halfafgemaakte functie maar als
                 een rekenfout.

                 Een teller hoort hier ook inhoudelijk niet: een reeks is per
                 dóél (`user_streaks` heeft de sleutel `(user_id, goal_id)`), dus
                 één getal op een profielpagina zou moeten kiezen wélk doel — en
                 die keuze bestaat niet. De uitleg blijft, de tegenspraak gaat weg.
            */}
            <Card>
              <Subheading>{t('profiel.reeks_titel')}</Subheading>
              <Caption>{t('profiel.reeks_uitleg')}</Caption>
            </Card>

            <InstellingenIngang />

            <Ingangen />
          </View>
        )}
      </AsyncView>
    </Screen>
  );
}

/** De ingang naar Instellingen — QS8-754. De onderdelen staan in `src/schermen/instellingen`. */
function InstellingenIngang() {
  const router = useRouter();
  return (
    <Card>
      <Subheading>{t('instellingen.ingang_titel')}</Subheading>
      <Body muted>{t('instellingen.ingang_uitleg')}</Body>
      <Button onPress={() => router.push('/instellingen')}>{t('instellingen.ingang_knop')}</Button>
    </Card>
  );
}

/**
 * Uitloggen — QS8-245.
 *
 * ⚠️ **Waarom dit een component is en geen drie regels in het scherm.** Hier
 *    stond `void signOut()`, en dat gooit de `Uitkomst` weg. `signOut()` bouwt
 *    netjes `auth.fout.uitloggen` op ("Uitloggen lukte niet. Probeer het
 *    opnieuw."), die melding staat in beide catalogi en is op inhoud getest —
 *    en geen enkel scherm liet hem ooit zien. Mislukte het uitloggen, dan
 *    gebeurde er zichtbaar niets en dacht je dat de knop stuk was.
 *
 *    Dat is onwrikbare regel 18 vraag 5: elk schakeltje af, de keten nergens
 *    verbonden. Er was niets kapot te maken, dus geen enkele test kon het zien.
 *    `tests/beloftes/uitkomst-niet-weggooien.test.ts` bewaakt voortaan de hele
 *    klasse in plaats van dit ene geval.
 */
function Uitloggen() {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function uitloggen() {
    setBezig(true);
    setFout(null);

    const uitkomst = await signOut();

    // ⚠️ Alleen bij een fout terug naar rust. Lukt het wél, dan haalt de
    //    routewacht dit scherm weg en hoort de knop bezig te blijven tot dat
    //    gebeurd is — anders flikkert hij nog even terug naar klikbaar.
    if (!uitkomst.ok) {
      setFout(uitkomst.melding);
      setBezig(false);
    }
  }

  return (
    <Card nested>
      <Subheading>{t('profiel.uitloggen_kop')}</Subheading>
      <AccountVanProfiel />
      <Body muted>{t('profiel.uitloggen_uitleg')}</Body>
      {fout === null ? null : <Caption danger>{fout}</Caption>}
      <Button busy={bezig} onPress={() => void uitloggen()}>
        {t('profiel.uitloggen_knop')}
      </Button>
    </Card>
  );
}

/** De ingangen naar de schermen Statistieken, Prestaties, je groepsprofiel en je organisaties, in één regel van Profiel zodat dat scherm niet groeit. */
function Ingangen() {
  return (
    <>
      <StatistiekIngang />
      <PrestatiesIngang />
      <GroepsProfielIngang />
      <OrganisatieIngang />
    </>
  );
}

/**
 * Je organisaties, met de twee ingangen — QS8-657.
 *
 * ⚠️ Een storing laat de kaart staan met een foutzin en een knop, zoals
 *    `MeldingenIngang`: wegblijven zou "ik zit in geen organisatie" lijken.
 *    De twee knoppen om er een te maken of lid te worden staan er altijd.
 *
 * ⚠️ Bij het hernummeren (20-11-2026) overgezet naar de opbouw van `main`: het
 *    profiel is sinds QS8-754 een rij ingangen, en deze kaart staat daar als
 *    laatste, in dezelfde vorm als de andere.
 */
function OrganisatieIngang() {
  const router = useRouter();
  const { data, loading, error, herlaad } = useAsync(() => fetchMijnOrganisaties(), []);

  return (
    <Card>
      <Subheading>{t('organisatie.ingang_kop')}</Subheading>
      <Body muted>{t('organisatie.ingang_uitleg')}</Body>
      <AsyncView
        loading={loading}
        error={error}
        data={data}
        isEmpty={(rijen) => rijen.length === 0}
        onRetry={herlaad}
        empty={{ title: t('organisatie.ingang_kop'), body: t('organisatie.ingang_leeg') }}
      >
        {(rijen) => (
          <View style={styles.keuzes}>
            {rijen.map((organisatie) => (
              <Button
                key={organisatie.id}
                variant="secundair"
                onPress={() => router.push(`/organisatie/${organisatie.id}`)}
              >
                {organisatie.naam}
              </Button>
            ))}
          </View>
        )}
      </AsyncView>
      <View style={styles.keuzes}>
        <Button variant="stil" onPress={() => router.push('/organisatie/nieuw')}>
          {t('organisatie.ingang_aanmaken')}
        </Button>
        <Button variant="stil" onPress={() => router.push('/organisatie/deelnemen')}>
          {t('organisatie.ingang_deelnemen')}
        </Button>
      </View>
    </Card>
  );
}

/** De ingang naar "zo ziet je groep je" — QS8-750. Het profiel zelf staat bij de route. */
function GroepsProfielIngang() {
  const router = useRouter();
  const { userId } = useSession();
  if (!userId) return null;
  return (
    <Card>
      <Subheading>{t('profiel_ander.titel_zelf')}</Subheading>
      <Body muted>{t('profiel_ander.uitleg_zelf')}</Body>
      <Button variant="stil" onPress={() => router.push(`/mensen/${userId}`)}>
        {t('profiel_ander.ingang_zelf')}
      </Button>
    </Card>
  );
}

/** De ingang naar je prestaties — QS8-735. Alleen voor jezelf; de inhoud staat bij de route. */
function PrestatiesIngang() {
  const router = useRouter();
  return (
    <Card>
      <Subheading>{t('prestaties.ingang_titel')}</Subheading>
      <Body muted>{t('prestaties.ingang_uitleg')}</Body>
      <Button onPress={() => router.push('/prestaties')}>{t('prestaties.ingang_knop')}</Button>
    </Card>
  );
}

/** De ingang naar je statistieken — QS8-749. Alleen voor jezelf; de inhoud staat bij de route. */
function StatistiekIngang() {
  const router = useRouter();
  return (
    <Card>
      <Subheading>{t('statistiek.ingang_titel')}</Subheading>
      <Body muted>{t('statistiek.ingang_uitleg')}</Body>
      <Button onPress={() => router.push('/statistiek')}>{t('statistiek.ingang_knop')}</Button>
    </Card>
  );
}

/**
 * De ingang naar `/meldingen` — QS8-586.
 *
 * ⚠️⚠️ **Dit is het schakeltje dat ontbrak.** `reports` had sinds QS8-232 een
 *    schrijfpad, policies, indexen en grendels, en 📏 **geen enkele lezer**: een
 *    melding werd netjes weggeschreven en er keek niemand naar. Een scherm
 *    zonder ingang is precies even onbereikbaar — dat is waarom
 *    `npm run schermingang:controle` bestaat — dus de lezer en zijn knop horen
 *    in dezelfde wijziging.
 *
 * ⚠️ **De vraag is "is er iets voor mij" en niet "ben ik beheerder".** Deze kaart
 *    vraagt de RPC om één rij en verschijnt alleen als die er is. Zo staat de rol
 *    nergens in de schermlaag: wie niets mag beoordelen, krijgt een lege lijst
 *    terug en ziet dus niets — en dat is dezelfde waarheid als op het scherm
 *    erachter, omdat het dezelfde functie is die hem geeft.
 *
 * ⚠️ Bij een storing blijft de kaart weg in plaats van met een foutbalk te
 *    staan, zelfde afweging als bij `Blokkades` (nu in `src/schermen/instellingen/PrivacyPaneel.tsx`): dit is een blok naast de
 *    instellingen, en wie hier komt kwam voor iets anders. De fout wordt wél
 *    gemeld — `fetchOpenstaandeMeldingen()` stuurt hem naar Sentry voordat hij
 *    werpt.
 */
function MeldingenIngang() {
  const router = useRouter();
  const { data, loading, error, herlaad } = useAsync(
    () => fetchOpenstaandeMeldingen({ limiet: 1 }),
    [],
  );

  // ⚠️ Alleen een geslaagde lading zet de stip om (`meldingstip.ts`): een storing is geen "er wacht niets".
  useEffect(() => {
    if (!loading && error === null && data !== undefined) zetMeldingWacht(data.length > 0);
  }, [loading, error, data]);

  if (loading) return null;

  /*
    ⚠️⚠️ **Een fout maakt deze kaart níet onzichtbaar, en dat is een bewuste
       afwijking van `Blokkades` hierboven.** Daar is wegblijven goed: wie op dit
       scherm komt, kwam voor iets anders. Hier is stilte de gevaarlijke
       richting — de moderator hoort dan nooit dát er iets wacht, en dat is
       precies het gat dat QS8-586 dichtte, één laag hoger. De beloftetest zegt
       het zelf: *de gevaarlijke richting is dat de knop te wéinig verschijnt.*
       Onwrikbare regel 16 vraagt bovendien een error-state, en `null` is er geen.
  */
  if (error !== null) {
    return (
      <Card>
        <Subheading>{t('meldingen.ingang_kop')}</Subheading>
        <Body muted>{t('meldingen.ingang_storing')}</Body>
        <Button variant="stil" onPress={herlaad}>
          {t('meldingen.ingang_opnieuw')}
        </Button>
      </Card>
    );
  }

  if (data === undefined || data.length === 0) return null;

  return (
    <Card>
      <Subheading>{t('meldingen.ingang_kop')}</Subheading>
      <Body muted>{t('meldingen.ingang_tekst')}</Body>
      <Button onPress={() => router.push('/meldingen')}>{t('meldingen.ingang_knop')}</Button>
    </Card>
  );
}

/** Het ingelogde account, in het blok bij Uitloggen — QS8-708. Eigen component, zodat het scherm erboven niet groeit. */
function AccountVanProfiel() {
  const { session } = useSession();
  const { profiel } = useProfiel();
  return (
    <Accountregel
      ingelogd={session !== null}
      naam={profiel?.display_name ?? null}
      adres={session?.user.email ?? null}
    />
  );
}

const styles = StyleSheet.create({
  blokken: { gap: space.blokGap + 3 },
  kop: { flexDirection: 'row', gap: space.blokGap, alignItems: 'center' },
  kopTekst: { gap: 2, flex: 1 },
  keuzes: { flexDirection: 'row', gap: space.blokGap - 3, flexWrap: 'wrap' },
});

// ⚠️ QS8-705: een renderfout op dit tabblad is een foutstaat met herstelknop en
//    geen wit scherm. Zie `src/shared/ui/TabFout.tsx`.
export { TabFout as ErrorBoundary } from '@/shared/ui';
