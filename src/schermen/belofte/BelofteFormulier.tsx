import { COMMITMENT_MAX, COMMITMENT_MIN, type BelofteBegunstigden } from '@/modules/commitments';
import { t } from '@/shared/i18n';
import { schoneEneRegel, telTekens } from '@/shared/tekst';
import { Body, Button, Caption, Card, Choice, Field, Subheading } from '@/shared/ui';

import { soortVan, type Keuze, type Soort } from './keuze';

/**
 * Het formulier: het gevolg en de getuige. Niets is voorgeselecteerd (`keuze.ts`).
 *
 * ⚠️ Een `Choice` met waarde `''` toont geen keuze als gekozen; zo staat er bij
 *    het openen niemand aangevinkt, ook niet bij één kandidaat.
 * ⚠️ Geen bedragveld en geen lijst van gevolgen: vrije tekst, nooit geld
 *    (domeinregel 5, besluit 1 van de poort).
 */
export function BelofteFormulier({
  keuze,
  lijsten,
  onKeuze,
  kanVerder,
  onVerder,
}: {
  readonly keuze: Keuze;
  readonly lijsten: BelofteBegunstigden;
  readonly onKeuze: (keuze: Keuze) => void;
  readonly kanVerder: boolean;
  readonly onVerder: () => void;
}) {
  const soort = soortVan(keuze, lijsten);
  const beide = lijsten.groepen.length > 0 && lijsten.getuigen.length > 0;

  return (
    <Card>
      <Subheading>{t('belofte.titel')}</Subheading>
      <Body muted>{t('belofte.uitleg')}</Body>
      <Caption>{t('straf.geen_geld')}</Caption>
      <Field
        label={t('belofte.veld')}
        value={keuze.tekst}
        onChangeText={(tekst) => onKeuze({ ...keuze, tekst })}
        placeholder={t('belofte.voorbeeld')}
      />
      <Lengte tekst={keuze.tekst} />
      {beide ? (
        <Choice<Soort | ''>
          label={t('straf.wie_getuige')}
          opties={[
            { waarde: 'groep', label: t('straf.een_groep') },
            { waarde: 'persoon', label: t('straf.een_persoon') },
          ]}
          waarde={keuze.soort ?? ''}
          onKies={(s) => onKeuze({ ...keuze, soort: s === '' ? null : s })}
          hint={keuze.soort === null ? t('belofte.kies_soort_eerst') : undefined}
        />
      ) : null}
      <Getuigekeuze soort={soort} keuze={keuze} lijsten={lijsten} onKeuze={onKeuze} />
      <Button disabled={!kanVerder} onPress={onVerder}>
        {t('straf.verder')}
      </Button>
    </Card>
  );
}

function Getuigekeuze({
  soort,
  keuze,
  lijsten,
  onKeuze,
}: {
  readonly soort: Soort | null;
  readonly keuze: Keuze;
  readonly lijsten: BelofteBegunstigden;
  readonly onKeuze: (keuze: Keuze) => void;
}) {
  if (soort === 'groep') {
    return (
      <Choice
        label={t('belofte.welke_groep')}
        opties={lijsten.groepen.map((g) => ({ waarde: g.id, label: g.naam }))}
        waarde={keuze.groepId ?? ''}
        onKies={(groepId) => onKeuze({ ...keuze, groepId })}
        hint={keuze.groepId === null ? t('belofte.kies_groep_eerst') : undefined}
      />
    );
  }
  if (soort === 'persoon') {
    return (
      <Choice
        label={t('belofte.welke_persoon')}
        opties={lijsten.getuigen.map((m) => ({ waarde: m.id, label: m.naam }))}
        waarde={keuze.persoonId ?? ''}
        onKies={(persoonId) => onKeuze({ ...keuze, persoonId })}
        hint={keuze.persoonId === null ? t('belofte.kies_persoon_eerst') : undefined}
      />
    );
  }
  return null;
}

/** Waarom "Verder" grijs is: te kort of te lang, in codepunten zoals de database telt. */
function Lengte({ tekst }: { readonly tekst: string }) {
  const n = telTekens(schoneEneRegel(tekst));
  if (n > COMMITMENT_MAX) return <Caption danger>{t('validatie.commitment_lang')}</Caption>;
  if (tekst.length > 0 && n < COMMITMENT_MIN) return <Caption>{t('validatie.commitment_kort')}</Caption>;
  return null;
}
