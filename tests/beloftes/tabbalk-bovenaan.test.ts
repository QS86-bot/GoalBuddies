import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * De taakbalk staat bovenaan, staat overal, en de veilige zone wordt één keer
 * geteld — QS8-246, herzien bij QS8-437.
 *
 * ⚠️⚠️ **Wat hier veranderde, en waarom de oude helft wég moest in plaats van
 *    mee te verhuizen.** Tot 12-09-2026 tekende de navigator de balk en telde
 *    hij `insets.top` zélf; `Screen` telde hem óók, en een context
 *    (`BovenrandAlVerrekend`) hield die twee uit elkaar. Deze suite toetste die
 *    context: of `veiligeBovenrand()` goed rekende en of de provider eromheen
 *    stond.
 *
 *    Sinds QS8-437 tekent alleen `Screen` de balk, dus er is nog één teller. De
 *    rekensom die de oude helft toetste bestaat niet meer — en dan is de
 *    eerlijke zet die tests weghalen en de belófte opnieuw vastleggen in de vorm
 *    die er nú is. Regel 18: *loop bij elke verhuizing na welke belofte eraan
 *    hing en of die nog ergens getoetst wordt.* De belofte was en is:
 *    **de bovenrand wordt precies één keer geteld.** Die staat nu in de eerste
 *    describe, en hij is strenger dan zijn voorganger: geen rekensom meer, maar
 *    de eis dat er maar één plek ís die telt.
 *
 * ⚠️ **Er wordt in dit project niets gerenderd in een test** — geen
 *    testing-library, geen `.test.tsx`. Zodra die er is, hoort dit bestand
 *    vervangen te worden door een test die een scherm werkelijk opent en kijkt
 *    of de balk er staat. Wat deze test niet kan: bewijzen dat het er goed
 *    uitziet.
 *
 * IJKING — met de hand gedraaid op 12-09-2026, één mutatie per grendel:
 *
 *   A  een tweede `useSafeAreaInsets()` in een scherm zetten
 *      -> 1 rood: 'telt precies één plek de veilige bovenrand'
 *   B  `<Taakbalk />` uit `Screen.tsx` halen
 *      -> 2 rood: 'tekent Screen de balk, want dat is wat élk scherm rendert'
 *                 en 'zet de balk buiten de ScrollView'
 *   C  `tabBar={() => null}` uit de navigator halen
 *      -> 1 rood: 'tekent de navigator zijn eigen balk niet meer'
 *
 * ⚠️ **A is de tweede poging en de eerste telt mee.** De eerste mutatie zette
 *    alleen de `import` erbij en niets werd rood — terecht: een import is geen
 *    tweede teller, een aanroep wel. De grendel zoekt op `useSafeAreaInsets(`
 *    mét haakje. **Een mutatie die de grendel niet raakt, meet de grendel niet**,
 *    en dat is niet hetzelfde als een grendel die niet werkt.
 *
 * ⚠️ Dat B er twee omgooit is geen slordigheid: de tweede test leest de bron
 *    ná `<Taakbalk />`, dus zonder die regel heeft hij niets om te lezen. Het
 *    staat hier zodat de volgende meting weet wat hij mag verwachten.
 */

const WORTEL = join(__dirname, '..', '..');

/**
 * Leest een bronbestand zonder commentaar.
 *
 * ⚠️ **Dit staat er omdat het in QS8-199 twee rondes kostte**, en de knip is
 *    sinds QS8-412 blind gemaakt voor de `//` van een URL: `(^|[^:])` ervoor,
 *    anders eet hij alles op ná `https://`.
 */
function bronZonderCommentaar(pad: string): string {
  return readFileSync(pad, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function bestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else if (naam.endsWith('.tsx') || naam.endsWith('.ts')) uit.push(pad);
  }
  return uit;
}

describe('de veilige bovenrand wordt één keer geteld', () => {
  /**
   * ⚠️ **De belofte, en strenger dan de rekensom die hier stond.** Twee keer een
   *    notch aan ruimte is op een toestel zónder notch precies nul verschil, en
   *    dit project heeft geen toestel met een notch. De enige manier om dat vast
   *    te leggen is te eisen dat er maar één teller bestáát.
   */
  it('telt precies één plek de veilige bovenrand', () => {
    const tellers: string[] = [];

    for (const pad of [...bestanden(join(WORTEL, 'app')), ...bestanden(join(WORTEL, 'src'))]) {
      if (pad.includes('.test.')) continue;
      if (/\buseSafeAreaInsets\s*\(/.test(bronZonderCommentaar(pad))) {
        tellers.push(relative(WORTEL, pad));
      }
    }

    expect(
      tellers,
      'de bovenrand hoort alleen door `Screen` geteld te worden; een tweede teller ' +
        'is een dubbele marge die op een simulator zonder notch onzichtbaar is',
    ).toEqual([join('src', 'shared', 'ui', 'Screen.tsx')]);
  });
});

describe('de taakbalk hoort bij het scherm en niet bij de navigator', () => {
  const layout = bronZonderCommentaar(join(WORTEL, 'app', '(tabs)', '_layout.tsx'));
  const scherm = bronZonderCommentaar(join(WORTEL, 'src', 'shared', 'ui', 'Screen.tsx'));

  /**
   * ⚠️ **De naad.** `Taakbalk` kan perfect werken en de navigator kan perfect
   *    zwijgen, en tóch ziet niemand een balk — namelijk als niets hem tekent.
   *    Dit is de variant zonder kapot onderdeel.
   */
  it('tekent Screen de balk, want dat is wat élk scherm rendert', () => {
    expect(scherm).toContain('<Taakbalk />');
  });

  /**
   * ⚠️ **Twee balken is het echte risico van deze vorm**, en het is precies het
   *    bezwaar dat het issue tegen deze route opwierp: twee componenten die er
   *    hetzelfde uit moeten zien, en twee antwoorden op "waar ben ik".
   */
  it('tekent de navigator zijn eigen balk niet meer', () => {
    expect(layout).toMatch(/tabBar=\{\(\)\s*=>\s*null\}/);
    expect(layout, 'de oude balkopmaak hoort weg te zijn').not.toContain('tabBarPosition');
  });

  /** ⚠️ De scheidingslijn hoort aan de kant waar de inhoud begint. */
  it('zet de scheidingslijn onder de balk en niet erboven', () => {
    const balk = bronZonderCommentaar(join(WORTEL, 'src', 'shared', 'ui', 'Taakbalk.tsx'));

    expect(balk).toContain('borderBottomColor');
    expect(balk, 'boven met een lijn bovenaan is een streep tegen de statusbalk').not.toContain(
      'borderTopColor',
    );
  });

  /**
   * ⚠️ **De balk scrollt niet mee**, want dan is hij weg op het moment dat je
   *    hem nodig hebt: onderaan een lang scherm.
   */
  it('zet de balk buiten de ScrollView', () => {
    const naBalk = scherm.slice(scherm.indexOf('<Taakbalk />'));
    expect(naBalk, 'de balk hoort vóór de scrollende romp te staan').toContain('{romp}');
  });
});
