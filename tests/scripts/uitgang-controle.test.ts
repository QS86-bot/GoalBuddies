import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `tekst-controle.test.ts`
//    en `migratieregister.test.ts`. TypeScript leest de JSDoc ernaast.
import {
  beoordeelScherm,
  GEEN_UITGANG_NODIG,
  schermtags,
  zonderCommentaarEnTekst,
} from '../../scripts/uitgang-controle.mjs';

/**
 * De ijking van `npm run uitgang:controle` — QS8-211.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken.** Dat is de les
 *    van `tekst:controle`, die maandenlang nul meldde terwijl er in één scherm
 *    zeven onvertaalde zinnen stonden. De heuristieken waren niet slecht; ze
 *    zijn nooit tegen een bekend geval gelegd. Daarom biedt dit bestand elke
 *    vorm los aan.
 *
 * ⚠️ **Twee helften, en de tweede is even belangrijk.** De vormen die hij moet
 *    vinden staan hieronder, en de vormen die hij met rust moet laten ook. Een
 *    controle die alles meldt, leert je hem te negeren.
 */

const MET_TERUG = `
export default function Doel() {
  return (
    <Screen title={t('doelscherm.titel')} terug={{ naar: '/doelen' }}>
      <Body>hoi</Body>
    </Screen>
  );
}
`;

const ZONDER_TERUG = `
export default function Doel() {
  return (
    <Screen title={t('doelscherm.titel')}>
      <Body>hoi</Body>
    </Screen>
  );
}
`;

describe('vindt wat hij moet vinden', () => {
  it('meldt een scherm buiten de tabbladen zonder terug', () => {
    expect(beoordeelScherm({ pad: 'app/doel/[id].tsx', bron: ZONDER_TERUG })).toHaveLength(1);
  });

  it('meldt ook als de tag over meerdere regels loopt', () => {
    // ⚠️ Dit is de vorm die `tekst:controle` op 28-08 miste: een prop die over
    //    twee regels staat. Zeven van de negen schermen schrijven zo.
    const bron = `
      <Screen
        title={t('chat.titel')}
        eyebrow={t('chat.eyebrow')}
        scroll={false}
      >
        <Body>hoi</Body>
      </Screen>
    `;
    expect(beoordeelScherm({ pad: 'app/groep/chat/[id].tsx', bron })).toHaveLength(1);
  });

  it('meldt een scherm dat helemaal geen <Screen> gebruikt', () => {
    const bron = 'export default function Los() { return <View><Body>hoi</Body></View>; }';
    expect(beoordeelScherm({ pad: 'app/los.tsx', bron })).toHaveLength(1);
  });

  it('meldt het tweede <Screen> in een bestand met twee takken', () => {
    // Een scherm dat bij een fout een ánder <Screen> tekent, is precies waar de
    // uitgang wegvalt op het moment dat je hem het hardst nodig hebt.
    const bron = `${MET_TERUG}\n${ZONDER_TERUG}`;
    expect(beoordeelScherm({ pad: 'app/doel/[id].tsx', bron })).toHaveLength(1);
  });

  it('trapt niet in het woord terug in een knoplabel', () => {
    const bron = `
      <Screen title={t('beheer.titel')}>
        <Button onPress={weg}>{'terug= naar de groep'}</Button>
      </Screen>
    `;
    expect(beoordeelScherm({ pad: 'app/groep/beheer/[id].tsx', bron })).toHaveLength(1);
  });

  it('trapt niet in een terug-prop op een ánder component', () => {
    const bron = `
      <Screen title={t('x')}>
        <Kruimelpad terug={{ naar: '/groep' }} />
      </Screen>
    `;
    expect(beoordeelScherm({ pad: 'app/groep/[id].tsx', bron })).toHaveLength(1);
  });

  it('meldt een uitzondering die niet meer nodig is', () => {
    const pad = Object.keys(GEEN_UITGANG_NODIG)[0]!;
    const fouten = beoordeelScherm({ pad, bron: MET_TERUG });

    expect(fouten).toHaveLength(1);
    expect(fouten[0]).toContain('GEEN_UITGANG_NODIG');
  });
});

describe('laat met rust wat hij met rust moet laten', () => {
  it('een scherm met terug', () => {
    expect(beoordeelScherm({ pad: 'app/doel/[id].tsx', bron: MET_TERUG })).toEqual([]);
  });

  it('een tabblad — daar staat de tabbalk eronder', () => {
    expect(beoordeelScherm({ pad: 'app/(tabs)/doelen.tsx', bron: ZONDER_TERUG })).toEqual([]);
  });

  it('een layout, want dat is geen scherm', () => {
    expect(beoordeelScherm({ pad: 'app/_layout.tsx', bron: ZONDER_TERUG })).toEqual([]);
    expect(beoordeelScherm({ pad: 'app/(tabs)/_layout.tsx', bron: ZONDER_TERUG })).toEqual([]);
  });

  it('een scherm dat met een reden in de uitzonderingslijst staat', () => {
    for (const pad of Object.keys(GEEN_UITGANG_NODIG)) {
      expect(beoordeelScherm({ pad, bron: ZONDER_TERUG }), pad).toEqual([]);
    }
  });

  it('een <Screen> in een uitleg-blok', () => {
    // ⚠️ De blinde vlek van `keten:controle` (QS8-156): commentaar telde mee.
    const bron = `
      /* Voorbeeld voor de volgende schrijver:
         <Screen title={t('x')}>…</Screen>
      */
      ${MET_TERUG}
    `;
    expect(beoordeelScherm({ pad: 'app/doel/nieuw.tsx', bron })).toEqual([]);
  });

  it('een <Screen> in een JSX-commentaar', () => {
    const bron = `${MET_TERUG.replace('<Body>hoi</Body>', '{/* zoals <Screen title={x}> hierboven */}')}`;
    expect(beoordeelScherm({ pad: 'app/doel/nieuw.tsx', bron })).toEqual([]);
  });

  it('een woord dat op Screen eindigt', () => {
    const bron = MET_TERUG.replace('<Body>hoi</Body>', '<AsyncScreen title={x} />');
    expect(beoordeelScherm({ pad: 'app/doel/nieuw.tsx', bron })).toEqual([]);
  });
});

describe('de hulpstukken', () => {
  it('houdt een lege string als lege string over', () => {
    // Anders leest `terug=` zonder waarde als een aanwezige prop.
    expect(zonderCommentaarEnTekst("const a = 'x';")).toBe("const a = '';");
  });

  it('leest een tag met een objectliteraal helemaal uit', () => {
    const tags = schermtags("<Screen terug={{ naar: '/a' }} title={t('b')}>");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('terug=');
  });

  it('stopt de tag bij de eerste > buiten accolades', () => {
    const tags = schermtags('<Screen title={x}>\n<Body>{a > b ? 1 : 2}</Body>');
    expect(tags[0]).toBe('<Screen title={x}>');
  });

  it('laat zich niet afkappen door een > binnen een prop', () => {
    // ⚠️ **Deze ijking is er pas na een mislukte mutatie, en dat hoort erbij.**
    //    De eerste versie heette "meerregelige tag" en werd niét rood toen het
    //    accolades tellen eruit ging: die tag had geen enkele `>` tússen de
    //    accolades, dus hij liep langs een grendel die hij nooit raakte. Precies
    //    de vorm waar de grondwet sinds 28-08 voor waarschuwt — een ijking die
    //    zijn geval door een éérdere grendel voert, bewaakt niets van wat hij
    //    belooft. Een ternair in een prop is de echte vorm: `app/groep/[id].tsx`
    //    en `app/(tabs)/index.tsx` schrijven allebei zo.
    const tag = "<Screen eyebrow={rijen.length > 0 ? a : b} terug={{ naar: '/groep' }}>";

    // `schermtags` geeft de tekstloze vorm terug — daar is `zonderCommentaarEnTekst`
    // voor — dus de bestemming zelf is er dan al uit.
    expect(schermtags(tag)[0]).toBe(tag.replace("'/groep'", "''"));
    expect(beoordeelScherm({ pad: 'app/groep/[id].tsx', bron: tag })).toEqual([]);
  });

  it('elke uitzondering draagt een reden en geen kale naam', () => {
    for (const [pad, reden] of Object.entries(GEEN_UITGANG_NODIG)) {
      expect(String(reden).length, pad).toBeGreaterThan(40);
    }
  });
});
