/**
 * QS8-370 — het leesrecht is er, en het scherm doet er iets mee.
 *
 * ⚠️ **Waarom dit bestand naast `tests/rls/uitstelbeslisser-ziet-de-straf.test.ts`
 *    staat.** Die suite bewijst dat de beslisser de straf *mag* lezen. Wat zij
 *    niet kan bewijzen is dat hij hem ook te zíen krijgt: zij draait met de
 *    client van het harnas, en de schermen leunen op `supabase()`.
 *
 *    Dat is regel 18 vraag 5 in zijn zuiverste vorm — de keten is onderbroken
 *    terwijl elk schakeltje af is. Een policy die niemand bevraagt, is een
 *    policy die niets doet, en de belofte van dit issue is nu juist dat degene
 *    die toestemming geeft het wéét.
 *
 * ⚠️ **Sleutels en geen zinnen.** Er wordt gezocht naar de catalogussleutel en
 *    niet naar de Nederlandse tekst: een zin die herschreven wordt, hoort deze
 *    test niet rood te maken (regel 18 vraag 4). Dat de sleutel in beide talen
 *    bestaat, bewaakt `src/shared/i18n/catalogus.test.ts` al.
 *
 * ⚠️ **Dit is een bronbewaking en geen render**, zoals
 *    `koppelscherm-vraagt-koppelbare-doelen` en `aanmeldscherm` — er is geen
 *    renderer in dit project.
 *
 * ⚠️ Met de hand rood gemaakt, grendel voor grendel:
 *
 *      1. `fetchStrafDoelen(` uit `app/groep/[id].tsx`
 *         → 'het groepsscherm vraagt de straffen op' rood
 *      2. de regel met `deadlineverzoek.straf_staat_erop` weg
 *         → 'en toont ze bij het verzoek' rood
 *      3. de regel met `deadline.straf_wordt_zichtbaar` weg
 *         → 'het doelscherm waarschuwt vóór het versturen' rood
 *      4. `wordtZichtbaarBijUitstelverzoek` vervangen door
 *         `(c) => c.type === 'penalty' && c.status !== 'cancelled'`
 *         → 'de waarschuwing is niet smaller dan het oppervlak' rood
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `stand.ts` en niet via `modules/commitments/index.ts`,
//    net als de andere tests in deze map. De rand van de module trekt `api.ts`
//    mee en daarmee de Supabase-client en react-native, en dat parseert niet in
//    het `unit`-project.
import { wordtZichtbaarBijUitstelverzoek } from '../../src/modules/commitments/stand';

const WORTEL = join(__dirname, '..', '..');

/**
 * De bron zonder commentaar.
 *
 * ⚠️ De koppen bij deze blokken noemen de sleutels en de functienamen met zoveel
 *    woorden, om uit te leggen waaróm ze er staan. Zonder deze stap zou die
 *    uitleg de test groen houden terwijl de code weg is — en dat is de valse
 *    groene, niet de valse rode.
 */
function zonderCommentaar(tekst: string): string {
  return tekst
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((r) => r.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const groepscherm = zonderCommentaar(
  readFileSync(join(WORTEL, 'app', 'groep', '[id].tsx'), 'utf8'),
);
const doelscherm = zonderCommentaar(
  readFileSync(join(WORTEL, 'app', 'doel', '[id].tsx'), 'utf8'),
);

describe('de beslisser krijgt de straf te zien', () => {
  it('het groepsscherm vraagt de straffen bij de verzoeken op', () => {
    expect(
      groepscherm,
      'zonder deze vraag bestaat het leesrecht van 0213 wel en gebeurt er niets mee',
    ).toContain('fetchStrafDoelen(');
  });

  it('en toont ze bij het verzoek waar ze bij horen', () => {
    expect(
      groepscherm,
      'de beslisser hoort te lezen dat hij een commitment device losser maakt',
    ).toContain('deadlineverzoek.straf_staat_erop');
  });

  it('het doelscherm waarschuwt de aanvrager vóór het versturen', () => {
    // ⚠️ Het verzoek opent een oppervlak dat niet meer sluit. Dat is zelf een
    //    consequentie, en domeinregel 5 verbiedt een stilzwijgende.
    expect(
      doelscherm,
      'wie om uitstel vraagt, opent zijn straf voor de groep en hoort dat vooraf te weten',
    ).toContain('deadline.straf_wordt_zichtbaar');
  });

  it('de waarschuwing is niet smaller dan het oppervlak dat hij aankondigt', () => {
    // ⚠️ **De naad.** De policy kent geen statuslijst; het scherm mag er dus ook
    //    geen hebben. Zou het scherm `cancelled` uitsluiten, dan ziet de groep
    //    een ingetrokken straf waarvoor niemand gewaarschuwd heeft.
    expect(
      doelscherm,
      'de grens hoort uit de gedeelde functie te komen en niet uit een eigen vergelijking in de JSX',
    ).toContain('wordtZichtbaarBijUitstelverzoek');

    for (const status of ['set', 'unlocked', 'due', 'resolved', 'cancelled']) {
      expect(
        wordtZichtbaarBijUitstelverzoek({ type: 'penalty', status }),
        `een straf op \`${status}\` wordt door de policy zichtbaar en hoort dus te waarschuwen`,
      ).toBe(true);
    }

    expect(
      wordtZichtbaarBijUitstelverzoek({ type: 'reward', status: 'set' }),
      'een beloning wordt niet zichtbaar en hoort dus niet te waarschuwen',
    ).toBe(false);
  });
});
