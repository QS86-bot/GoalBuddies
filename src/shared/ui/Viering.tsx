import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { radius, space, useTheme } from '../theme';

import { useReducedMotion } from './a11y';
import { bewegingsDuur } from './beweging';
import { Body, Subheading } from './Text';
import { aantalDeeltjes, viering, type VieringSoort } from './vieringen';

/**
 * Het feestelijke moment — QS8-76.
 *
 * ⚠️ Gedoseerd, zoals EPIC 10 vraagt. Drie niveaus: een goedgekeurd weekdoel is
 *    ingetogen, een afgerond doel mag groot. Wát er per niveau hoort, staat in
 *    `vieringen.ts` en is daar getest; dit bestand tekent het alleen.
 *
 * ⚠️ **Bij `prefers-reduced-motion` verdwijnt de beweging, niet het moment.**
 *    `aantalDeeltjes()` geeft dan nul en `motionDuration` maakt de fade
 *    ogenblikkelijk — maar de tekst staat er gewoon. Iemand met vestibulaire
 *    klachten hoort niet ook zijn felicitatie kwijt te raken.
 *
 * ⚠️ Puur decoratief voor een schermlezer? Nee. De tekst is de boodschap, dus
 *    het blok is een `alert`: wie niet kijkt, hoort hem.
 */
interface Props {
  readonly soort: VieringSoort;
  /** Wordt aangeroepen als het moment voorbij is, zodat het scherm hem opruimt. */
  readonly onKlaar: () => void;
}

export function Viering({ soort, onKlaar }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const v = viering(soort);

  // ⚠️ Via `useState` met een lazy initializer en niet via `useRef(...).current`.
  //    Dat laatste is een ref aanraken tijdens render, en dat is onveilig zodra
  //    React een render afbreekt — de lint-regel vangt het af. De waarde wordt
  //    één keer gemaakt en daarna nooit vervangen.
  const [vervaging] = useState(() => new Animated.Value(0));
  const deeltjes = aantalDeeltjes(v.niveau, reduced);

  // ⚠️ `onKlaar` in een ref, niet in de afhankelijkheden. Een scherm dat de
  //    callback elke render opnieuw maakt, zou de animatie anders steeds
  //    opnieuw starten en het feestje nooit afmaken — dezelfde val als de
  //    dependency-array op "Vandaag" (QS8-75).
  const klaar = useRef(onKlaar);

  // ⚠️ Het bijwerken staat in een effect en niet in de renderfase: een ref
  //    aanraken tijdens render is onveilig zodra React een render afbreekt, en
  //    de lint-regel vangt het af.
  useEffect(() => {
    klaar.current = onKlaar;
  }, [onKlaar]);

  useEffect(() => {
    const duur = bewegingsDuur(reduced, 260);

    Animated.timing(vervaging, {
      toValue: 1,
      duration: duur,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    const t = setTimeout(() => klaar.current(), v.duurMs);
    return () => clearTimeout(t);
  }, [vervaging, reduced, v.duurMs]);

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.kader,
        {
          backgroundColor: theme.colors.panelDark,
          borderColor: theme.colors.accent,
          opacity: vervaging,
        },
      ]}
    >
      {/*
        De "deeltjes" zijn stipjes in het goud van het stelsel — geen
        regenboogconfetti. Uitsluitend Q-Projects-kleuren (CLAUDE.md).
      */}
      {deeltjes === 0 ? null : (
        <View style={styles.stipjes} pointerEvents="none" accessibilityElementsHidden>
          {Array.from({ length: deeltjes }, (_, i) => (
            <View
              key={i}
              style={[
                styles.stip,
                {
                  backgroundColor: i % 2 === 0 ? theme.colors.accent : theme.colors.accentDim,
                  // Een vaste spreiding op de index: geen willekeur, want dan
                  // springt het patroon bij elke render.
                  left: `${(i * 97) % 100}%`,
                  top: `${(i * 37) % 100}%`,
                },
              ]}
            />
          ))}
        </View>
      )}

      <Subheading>{v.titel}</Subheading>
      <Body muted>{v.tekst}</Body>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  kader: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.kaart.paddingVertical + 4,
    paddingHorizontal: space.kaart.paddingHorizontal,
    gap: space.blokGap - 5,
    overflow: 'hidden',
  },
  // Geen `StyleSheet.absoluteFillObject`: die staat niet in de typedefinities
  // van deze RN-versie. Vier nullen doen exact hetzelfde.
  stipjes: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  stip: { position: 'absolute', width: 4, height: 4, borderRadius: 2, opacity: 0.5 },
});
