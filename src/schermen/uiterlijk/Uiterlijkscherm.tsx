import { View } from 'react-native';

import type { Uiterlijkvoorkeur } from '@/modules/uiterlijk';
import { useUiterlijk } from '@/modules/uiterlijk/react';
import { t } from '@/shared/i18n';
import { useTheme } from '@/shared/theme';
import { Body, Caption, Card, Choice } from '@/shared/ui';

import { dichtheidOpties, emojiOpties, stijlOpties, variantOpties, weergaveOpties } from './keuzes';
import { Voorvertoning } from './Voorvertoning';

/**
 * Het scherm Uiterlijk — QS8-731: stijl, bij C een kleurvariant, weergave, dichtheid en emoji.
 *
 * ⚠️ **De keuze geldt direct en wordt daarna bewaard** (`useUiterlijk().kies`). Is de account niet bereikbaar,
 *    dan blijft de lokale keuze staan en zegt het scherm dat rustig; er is geen foutscherm. Loading is de lokale
 *    lezing; een lege staat bestaat hier niet, want er is altijd een keuze (de standaard).
 */
export function Uiterlijkscherm() {
  const { voorkeur, ready, opslag, kies } = useUiterlijk();
  const { afstand } = useTheme();

  if (!ready) return <Body muted>{t('uiterlijk.laden')}</Body>;

  return (
    <View style={{ gap: afstand.l }}>
      <Voorvertoning />
      <StijlKaart voorkeur={voorkeur} kies={kies} />
      <WeergaveKaart voorkeur={voorkeur} kies={kies} />
      <Caption>{t('uiterlijk.privacy')}</Caption>
      {opslag === 'alleen-lokaal' ? <Caption>{t('uiterlijk.alleen_lokaal')}</Caption> : null}
    </View>
  );
}

interface KaartProps {
  readonly voorkeur: Uiterlijkvoorkeur;
  readonly kies: (wijziging: Partial<Uiterlijkvoorkeur>) => void;
}

function StijlKaart({ voorkeur, kies }: KaartProps) {
  return (
    <Card>
      <Choice
        label={t('uiterlijk.stijl_kop')}
        hint={t('uiterlijk.stijl_uitleg')}
        opties={stijlOpties()}
        waarde={voorkeur.stijl}
        onKies={(stijl) => kies({ stijl })}
      />
      {voorkeur.stijl === 'c' ? (
        <Choice
          label={t('uiterlijk.variant_kop')}
          opties={variantOpties()}
          waarde={voorkeur.kleurvariant === 'geen' ? 'baai' : voorkeur.kleurvariant}
          onKies={(kleurvariant) => kies({ kleurvariant })}
        />
      ) : null}
    </Card>
  );
}

function WeergaveKaart({ voorkeur, kies }: KaartProps) {
  return (
    <Card>
      <Choice
        label={t('uiterlijk.weergave_kop')}
        hint={t('uiterlijk.weergave_uitleg')}
        opties={weergaveOpties()}
        waarde={voorkeur.weergave}
        onKies={(weergave) => kies({ weergave })}
      />
      <Choice
        label={t('uiterlijk.dichtheid_kop')}
        opties={dichtheidOpties()}
        waarde={voorkeur.dichtheid}
        onKies={(dichtheid) => kies({ dichtheid })}
      />
      <Choice
        label={t('uiterlijk.emoji_kop')}
        hint={t('uiterlijk.emoji_uitleg')}
        opties={emojiOpties()}
        waarde={voorkeur.emoji ? 'aan' : 'uit'}
        onKies={(w) => kies({ emoji: w === 'aan' })}
      />
    </Card>
  );
}
