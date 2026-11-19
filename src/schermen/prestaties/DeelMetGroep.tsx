import { useState } from 'react';
import { View } from 'react-native';

import { deelPrestatie, fetchMijnGroepen, type DeelUitslag } from '@/modules/buddies';
import { t } from '@/shared/i18n';
import { space } from '@/shared/theme';
import { AsyncView, Body, Button, Caption, useAsync } from '@/shared/ui';

import { deelMelding } from './deel-melding';

/**
 * "Deel met je groep" op een behaalde prestatie — QS8-736. Een handeling van de gebruiker:
 * nooit voorgeselecteerd, nooit een vraag per badge, en altijd één groep.
 *
 * ⚠️ **Dit component krijgt een naam en een sleutel en verder niets.** Geef het nooit het
 *    `Prestatie`-type, XP of een zeldzaamheid: die blijven op het Prestatiescherm
 *    (domeinregel 7 en 10). De server toetst of je de prestatie echt hebt.
 * ⚠️ **De uitleg staat vóór de keuze.** Wie een groep kiest, weet dan wat er opengaat: alle
 *    leden van die groep zien het bericht (domeinregel 5, in de geest: geen stille handeling).
 */
export function DeelMetGroep({ badge, naam }: { readonly badge: string; readonly naam: string }) {
  const [open, setOpen] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  if (!open) {
    return (
      <View style={{ gap: space.blokGap }}>
        <Button
          variant="secundair"
          onPress={() => setOpen(true)}
          accessibilityLabel={t('prestaties.deel_knop_label', { naam })}
        >
          {t('prestaties.deel_knop')}
        </Button>
        <View accessibilityLiveRegion="polite">{melding === null ? null : <Caption>{melding}</Caption>}</View>
      </View>
    );
  }
  return (
    <GroepKeuze
      badge={badge}
      naam={naam}
      sluit={() => setOpen(false)}
      klaar={(tekst) => {
        setMelding(tekst);
        setOpen(false);
      }}
    />
  );
}

function useDeel(badge: string, klaar: (tekst: string) => void) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const kies = async (groep: { readonly id: string; readonly name: string }) => {
    setBezig(groep.id);
    setFout(null);
    try {
      const uitslag: DeelUitslag = await deelPrestatie(groep.id, badge);
      klaar(deelMelding(uitslag, groep.name));
    } catch (e) {
      setFout(e instanceof Error ? e.message : t('prestaties.deel_fout'));
    } finally {
      setBezig(null);
    }
  };
  return { bezig, fout, kies };
}

function GroepKeuze({
  badge,
  naam,
  sluit,
  klaar,
}: {
  readonly badge: string;
  readonly naam: string;
  readonly sluit: () => void;
  readonly klaar: (tekst: string) => void;
}) {
  const groepen = useAsync(() => fetchMijnGroepen(), []);
  const { bezig, fout, kies } = useDeel(badge, klaar);

  return (
    <View style={{ gap: space.blokGap }}>
      <Body>{t('prestaties.deel_uitleg')}</Body>
      <AsyncView
        loading={groepen.loading}
        error={groepen.error}
        data={groepen.data}
        isEmpty={(lijst) => lijst.length === 0}
        onRetry={groepen.herlaad}
        empty={{ title: t('prestaties.deel_geen_groep'), body: t('prestaties.deel_geen_groep_uitleg') }}
      >
        {(lijst) => (
          <View style={{ gap: space.blokGap }}>
            {lijst.map((g) => (
              <Button
                key={g.id}
                variant="primair"
                busy={bezig === g.id}
                disabled={bezig !== null}
                accessibilityLabel={t('prestaties.deel_groep_label', { naam, groep: g.name })}
                onPress={() => void kies(g)}
              >
                {t('prestaties.deel_groep', { groep: g.name })}
              </Button>
            ))}
          </View>
        )}
      </AsyncView>
      <View accessibilityLiveRegion="polite">{fout === null ? null : <Caption>{fout}</Caption>}</View>
      <Button variant="secundair" onPress={sluit} disabled={bezig !== null}>
        {t('prestaties.deel_sluiten')}
      </Button>
    </View>
  );
}
