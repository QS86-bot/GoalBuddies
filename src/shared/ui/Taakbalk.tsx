import { Link, usePathname } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

import { t, type Sleutel } from '../i18n';
import { afstand, radius, useTheme } from '../theme';

import { focusRing } from './a11y';
import { abonneerMenu, leesMenuOpen, menuBijNavigatie, wisselMenu } from './menustand';
import { useMeldingWacht } from './meldingstip';
import {
  actiefTabblad,
  kopSleutel,
  MENU_BEGINSTAND_OPEN,
  MENU_KOLOMBREEDTE,
  menuKlaptIn,
  TABBLADEN,
  taakbalkVorm,
  toontTaakbalk,
  toonMenuknoppen,
  type Taakbalkvorm,
} from './tabbladen';

/**
 * De vorm van het menu bij de breedte van dít venster.
 *
 * ⚠️ **Eerst `bovenrand`, en pas ná het hydrateren de echte breedte** (de
 *    server-snapshot van `useSyncExternalStore`). De webexport
 *    is vooraf getekend zonder venster; wie de breedte meteen leest, krijgt een
 *    andere boom dan de server en React meldt een hydratiefout (#418, gemeten op
 *    de eerste build van QS8-705, en via de globale fouthaak naar Sentry
 *    gegaan). De smalle vorm is de conservatieve, dus die is de beginstand.
 */
const abonneer = (verandering: () => void) => {
  const abonnement = Dimensions.addEventListener('change', verandering);
  return () => abonnement.remove();
};
const leesVorm = (): Taakbalkvorm => taakbalkVorm(Dimensions.get('window').width);
// Wat de server en de eerste clientronde zien.
const serverVorm = (): Taakbalkvorm => 'bovenrand';

// ⚠️ QS8-740: op web mount de `Taakbalk` sinds dat issue nooit tijdens de hydratie,
//    want `Shell` tekent alles pas na `useGehydrateerd()`. De server-snapshot
//    hieronder wordt daar dus niet meer gebruikt; hij blijft als verdediging in de
//    diepte. De hydratie-veiligheid van de app wordt in `Shell` geregeld en niet hier.
export function useTaakbalkVorm(): Taakbalkvorm {
  return useSyncExternalStore(abonneer, leesVorm, serverVorm);
}

/**
 * De taakbalk, op élk scherm dat er een hoort te hebben — QS8-437.
 *
 * ⚠️ **Dit is de énige tabbalk in de app.** De navigator in
 *    `app/(tabs)/_layout.tsx` tekent zijn eigen balk sinds dit issue niet meer
 *    (`tabBar={() => null}`). Zouden ze allebei tekenen, dan zijn er twee
 *    componenten die er hetzelfde uit moeten zien en is de vraag "waar ben ik"
 *    op twee plekken beantwoord — precies het bezwaar dat het issue tegen deze
 *    vorm opwierp. Eén component en één bron (de router) haalt dat bezwaar weg.
 *
 * ⚠️ **Geen navigator-eigenschap maar een `Link`.** Dat is wat dit betaalbaar
 *    maakt: geen enkele route verhuist, dus geen enkele belofte die aan een
 *    bestandsplek hing raakt los. Regel 18 noemt een verhuizing de gevaarlijkste
 *    beweging die er is, en hier is er geen.
 *
 * ⚠️ **`replace` en niet `push`.** De vijf tabbladen zijn bestemmingen en geen
 *    stappen; met `push` groeit de geschiedenis bij elke tik en wordt de
 *    terugknop van de browser een lijst van tabbladen in plaats van de weg terug.
 *
 * ⚠️ **Vijf knoppen en geen lap tekst — QS8-705.** Tot dat issue was dit één
 *    horizontaal scrollende rij van twaalf punten tekst zonder rand of
 *    tikvlak, en dat las Quinten als "geen knoppen". Elke bestemming is nu een
 *    knop met een rand en een tikvlak van minstens 44 punten.
 *
 * ⚠️ **Twee vormen, en welke bepaalt `taakbalkVorm()`.** Breed: een kolom links,
 *    onder elkaar van boven naar beneden. Smal: dezelfde kolom, gestapeld
 *    bovenaan over de volle breedte (Quinten wilde ook op een telefoon
 *    knoppen onder elkaar). Nooit scrollend of afkappend: scrollen verbergt
 *    tabbladen, en een verborgen tabblad is precies wat dit issue is. Afweging
 *    en breekpunt in
 *    `docs/decisions/2026-11-18-de-navigatie-is-knoppen-en-een-renderfout-is-een-foutstaat.md`.
 */
export function Taakbalk() {
  const theme = useTheme();
  const pad = usePathname();
  const vorm = useTaakbalkVorm();
  const open = useSyncExternalStore(abonneerMenu, leesMenuOpen, () => MENU_BEGINSTAND_OPEN);
  // QS8-795: elke navigatie begint dicht, ook op een tabblad dat al gemount was.
  useEffect(() => {
    menuBijNavigatie();
  }, [pad]);
  const meldingWacht = useMeldingWacht();

  if (!toontTaakbalk(pad)) return null;
  const actief = actiefTabblad(pad);
  const zijkant = vorm === 'zijkant';

  return (
    <View
      role="navigation"
      accessibilityLabel={t('tab.navigatie')}
      style={[
        zijkant ? styles.zijkant : styles.bovenrand,
        {
          backgroundColor: theme.colors.panel,
          // ⚠️ Per kant en niet `borderColor`: de lijn hoort onder de rij (smal)
          //    of rechts van de kolom (breed), nooit boven — de breedte in de
          //    stijl bepaalt welke van de twee er getekend wordt.
          borderBottomColor: theme.colors.border,
          borderRightColor: theme.colors.border,
        },
      ]}
    >
      {menuKlaptIn(vorm) ? (
        <MenuKop
          actief={actief}
          open={open}
          stip={meldingWacht}
          onWissel={wisselMenu}
        />
      ) : null}
      {toonMenuknoppen(vorm, open)
        ? TABBLADEN.map((tab) => (
            <Tab
              key={tab.pad}
              pad={tab.pad}
              sleutel={tab.sleutel}
              actief={tab.pad === actief}
              zijkant={zijkant}
              stip={meldingWacht && tab.sleutel === 'tab.profiel'}
            />
          ))
        : null}
    </View>
  );
}

interface MenuKopProps {
  readonly actief: string | null;
  readonly open: boolean;
  /** Er wacht een melding (QS8-777). Dicht is het menu de enige plek waar dat te zien is, dus de stip staat ook hier. */
  readonly stip: boolean;
  readonly onWissel: () => void;
}

/**
 * De ingeklapte kop van het menu op een telefoon — QS8-728 (optie A).
 *
 * ⚠️ **Eén knop met de stand erbij.** `aria-expanded` en `accessibilityState.expanded`
 *    zeggen "open" of "dicht"; het label noemt het menu en de huidige pagina, zodat
 *    een schermlezer niet alleen "Groep, knop" zegt. De pagina staat ook zichtbaar in
 *    de knop, want in de dichte stand is dat het enige dat vertelt waar je bent.
 *
 * ⚠️ Een `Pressable` en geen `Link`: dit gaat nergens heen, het wisselt een stand.
 *    De chevron is twee randen van een gedraaid vierkant, dus geen teken en geen
 *    emoji, en `importantForAccessibility="no"` omdat de stand al in de knop staat.
 */
function MenuKop({ actief, open, stip, onWissel }: MenuKopProps) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);
  const c = theme.colors;
  const naam = t(kopSleutel(actief));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('tab.navigatie')}: ${naam}${stip ? `, ${t('tab.melding_wacht')}` : ''}`}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      onPress={onWissel}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={StyleSheet.flatten([
        styles.knop,
        styles.kop,
        { backgroundColor: c.panel, borderColor: c.accent, borderWidth: 2 },
        focusRing(theme, heeftFocus),
      ])}
    >
      <View style={styles.inhoud}>
        <Text style={[styles.label, { color: c.accent, fontWeight: '700' }]}>{naam}</Text>
        {stip && !open ? (
          <View
            importantForAccessibility="no"
            aria-hidden
            style={[styles.stip, { backgroundColor: c.accent }]}
          />
        ) : null}
      </View>
      <View
        importantForAccessibility="no"
        aria-hidden
        style={[
          styles.chevron,
          { borderColor: c.accent, transform: [{ rotate: open ? '-135deg' : '45deg' }] },
        ]}
      />
    </Pressable>
  );
}

interface TabProps {
  readonly pad: string;
  readonly sleutel: Sleutel;
  readonly actief: boolean;
  readonly zijkant: boolean;
  /** Er wacht iets op dit tabblad (QS8-777): een stip naast het label en de zin in het label voor een schermlezer. */
  readonly stip: boolean;
}

/**
 * ⚠️ **`aria-current` en `accessibilityState`, niet alleen een kleur.** Het
 *    actieve tabblad is voor een ziend oog goud en voor een schermlezer niets,
 *    tenzij de stand er met zoveel woorden bij staat. Kleur is nooit de enige
 *    drager — ook niet voor wie de kleuren niet uit elkaar houdt: de actieve
 *    knop heeft ook een dikkere rand en een zwaarder label (QS8-728).
 *
 * ⚠️ **Rol `link` en niet `button`.** Dit zijn bestemmingen met een adres
 *    (`Link` tekent een `<a href>`), en een schermlezer die "link, huidige
 *    pagina" zegt vertelt meer dan "knop". Visueel is het een knop; dat is wat
 *    Quinten vroeg.
 *
 * ⚠️ Alleen themakleuren, en geen `grey` voor een inactief label: dat is voor
 *    bijschriften, en een label dat je moet raken hoort leesbaar te zijn.
 */
function Tab({ pad, sleutel, actief, zijkant, stip }: TabProps) {
  const theme = useTheme();
  const [heeftFocus, setFocus] = useState(false);
  const [ingedrukt, setIngedrukt] = useState(false);
  const c = theme.colors;

  return (
    <Link href={pad} replace asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={stip ? `${t(sleutel)}, ${t('tab.melding_wacht')}` : undefined}
        accessibilityState={{ selected: actief }}
        aria-current={actief ? 'page' : undefined}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onPressIn={() => setIngedrukt(true)}
        onPressOut={() => setIngedrukt(false)}
        // ⚠️ Een stijlobject en geen functie: `Link asChild` geeft een
        //    functiestijl niet door aan de `<a>` (gemeten op de webexport: de
        //    knoppen bleven 19 punten hoog, zonder rand), dus de ingedrukt-stand
        //    staat in state. En `flatten`: een array gaat ongeflattend door de
        //    Slot naar de DOM en gooit "Failed to set an indexed property" —
        //    dat was een wit scherm op elk tabblad, gemeten.
        style={StyleSheet.flatten([
          styles.knop,
          zijkant ? styles.knopZijkant : styles.knopRij,
          {
            backgroundColor: c.panel,
            borderColor: actief ? c.accent : c.border,
            borderWidth: actief ? 2 : 1,
            opacity: ingedrukt ? 0.7 : 1,
          },
          focusRing(theme, heeftFocus),
        ])}
      >
        <View style={styles.inhoud}>
          <Text
            style={[
              styles.label,
              { color: actief ? c.accent : c.text, fontWeight: actief ? '700' : '600' },
            ]}
          >
            {t(sleutel)}
          </Text>
          {stip ? (
            <View
              importantForAccessibility="no"
              aria-hidden
              style={[styles.stip, { backgroundColor: c.accent }]}
            />
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  // Smal: dezelfde kolom, maar bovenaan over de volle breedte in plaats van
  // ernaast. Besluit van Quinten 18-11-2026: ook op een telefoon onder elkaar.
  bovenrand: {
    flexDirection: 'column',
    gap: afstand.s,
    padding: afstand.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  zijkant: {
    width: MENU_KOLOMBREEDTE,
    gap: afstand.s,
    padding: afstand.m,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  knop: {
    // 44 punten is de kleinste maat die op een telefoon betrouwbaar te raken is
    // (zelfde reden als in `Button`).
    minHeight: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingHorizontal: afstand.l,
  },
  // Smal: vijf gelijke knoppen die een regel delen en omslaan als het niet past.
  knopRij: { alignItems: 'flex-start' },
  knopZijkant: { alignItems: 'flex-start' },
  inhoud: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 15 },
  stip: { width: 8, height: 8, borderRadius: 4, marginLeft: afstand.s },
  // De ingeklapte kop: label links, chevron rechts, dezelfde maat als een knop.
  kop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
});
