/**
 * IJking van `scripts/emoji-controle.mjs` — QS8-420.
 *
 * ⚠️ **Waarom dit bestand er pas nu is.** De controle draaide sinds 23-08-2026
 *    in de poort en in `/audit`, en CLAUDE.md had hem al gepromoveerd van "een
 *    zin" naar "een controle". Hij was alleen nooit rood geweest en niet te
 *    voeden: geen export, geen test. Dat is de vorm die dit project "een
 *    aanname met een groen vinkje ervoor" noemt — regel 18: *een controle die
 *    je niet kunt voeden, kun je niet ijken.*
 *
 * ⚠️⚠️ **Twee grendels, en ze worden apart geijkt.** De controle beantwoordt
 *    twee vragen achter elkaar, en een ijking die er maar één raakt bewaakt de
 *    andere niet:
 *
 *    | | grendel | wat hij beslist |
 *    |---|---|---|
 *    | G1 | `zoekEmoji()` | wélke tekens emoji zijn |
 *    | G2 | `teltMee()` | wélke regels en bestanden meetellen |
 *
 *    Een geval dat door G2 wordt weggefilterd, zegt niets over G1 — en
 *    andersom. Vandaar twee blokken die elk hun eigen grendel voeden.
 *
 * 📏 **De bevinding die dit opleverde staat hieronder als eigen geval**, zodat
 *    hij niet nog een keer terug kan komen: de oude handgeschreven reeks begon
 *    bij U+1F300 en liet daarmee `🆕` en `🅰` door, plus het hele blok
 *    U+2600–27BF op vier met de hand geplukte tekens na.
 */
import { describe, expect, it } from 'vitest';

import { teltMee, treffersIn, zoekEmoji } from '../../scripts/emoji-controle.mjs';

const vindt = (teken: string): boolean => (zoekEmoji(teken) as string[]).length > 0;

describe('G1 — welke tekens zijn emoji', () => {
  it.each([
    ['🎉', 'feest'],
    ['😀', 'gezicht'],
    ['👍', 'duim'],
    ['🔥', 'vuur'],
    ['📏', 'meetlint'],
    ['❤', 'hart'],
    ['✅', 'vinkje'],
    ['❌', 'kruis'],
    ['⭐', 'ster'],
  ])('vindt %s (%s)', (teken) => {
    expect(vindt(teken)).toBe(true);
  });

  it.each([
    ['🆕', 'U+1F195 — kwam door de oude reeks heen, die begon pas bij U+1F300'],
    ['🅰', 'U+1F170 — idem'],
    ['✨', 'U+2728 — het blok U+2600-27BF ontbrak'],
    ['❗', 'U+2757 — idem'],
    ['✔', 'U+2714 — idem'],
    ['☑', 'U+2611 — idem'],
    ['☀', 'U+2600 — idem'],
    ['⏰', 'U+23F0 — Miscellaneous Technical, ook pictografisch'],
    ['⌛', 'U+231B — idem'],
  ])('vindt %s, en dat was de bevinding: %s', (teken) => {
    expect(vindt(teken)).toBe(true);
  });

  it('vindt een vlag, en die is géén Extended_Pictographic', () => {
    // ⚠️ De vlagletters zijn `Regional_Indicator`. Zonder het losse bereik
    //    U+1F1E6-1F1FF komt 🇳🇱 er gewoon doorheen — 📏 nagemeten.
    expect(vindt('🇳🇱')).toBe(true);
  });

  it('geeft de gevonden tekens terug en niet alleen een ja of nee', () => {
    expect(zoekEmoji("const t = 'Klaar 🎉 en af ✅';")).toEqual(['🎉', '✅']);
  });
});

describe('G1 — wat de controle met rust moet laten', () => {
  it('laat de waarschuwingsdriehoek staan, ook al is hij pictografisch', () => {
    // Dit is de énige uitzondering in `HUISSTIJL`, en hij staat 3215 keer in
    // deze repo. Zonder hem meldt de controle elke kop in het project.
    expect(vindt('⚠')).toBe(false);
    expect(vindt('⚠️')).toBe(false);
  });

  it.each([
    ['→', 'pijl'],
    ['←', 'pijl'],
    ['─', 'kaderlijn'],
    ['≥', 'wiskunde'],
    ['−', 'minteken'],
    ['⌈', 'plafondhaak'],
    ['⌉', 'plafondhaak'],
    ['‖', 'dubbele streep'],
    ['—', 'gedachtestreepje'],
    ['…', 'beletselteken'],
    ['’', 'apostrof'],
    ['“', 'aanhalingsteken'],
  ])('laat %s staan (%s)', (teken) => {
    expect(vindt(teken)).toBe(false);
  });

  it.each(['●', '◐', '◑', '▲'])(
    'laat %s staan — die staat vandaag in app-tekst en is geen emoji',
    (teken) => {
      // 📏 `src/shared/ui/risico.ts:57-63` geeft deze vier terug als
      //    risiconiveau. Ze zijn Geometric Shapes en geen Extended_Pictographic,
      //    dus de verbreding van QS8-420 raakt ze niet. Dat is gemeten en niet
      //    aangenomen; of een schermlezer ze net zo hardop leest als een emoji
      //    is een productvraag met een eigen rij in `docs/ENGINEER-REVIEW.md`.
      expect(vindt(teken)).toBe(false);
    },
  );

  it('meldt niets op een regel zonder emoji', () => {
    expect(zoekEmoji("const knop = t('doel.opslaan');")).toEqual([]);
  });
});

describe('G2 — welke regels en bestanden meetellen', () => {
  const bron = 'src/scherm.tsx';

  it.each(['  * de ⚠️-kop loopt door met 🎉', '// een 🎉 in commentaar', '/* 🎉 */'])(
    'slaat een commentaarregel over: %s',
    (regel) => {
      expect(teltMee(bron, regel)).toBe(false);
    },
  );

  it.each(['src/tekst.test.ts', 'app/scherm.test.tsx'])(
    'slaat een testbestand over: %s',
    (pad) => {
      // Die voeden 😀 en 👨‍👩‍👧‍👦 juist aan `telTekens()` — QS8-118.
      expect(teltMee(pad, "expect(telTekens('😀')).toBe(1);")).toBe(false);
    },
  );

  it('telt een gewone regel wél mee', () => {
    expect(teltMee(bron, "const t = 'Klaar 🎉';")).toBe(true);
  });

  it('telt een regel mee die een commentaar áchteraan draagt, en dat is de bewuste grens', () => {
    // ⚠️ Een knip op een `//` verderop in de regel eet alles op ná de `//` van
    //    een URL — de fout van QS8-412. De prijs is deze valse melding, en die
    //    valt de goede kant op.
    expect(teltMee(bron, "const t = 'Start'; // 🎉")).toBe(true);
  });
});

describe('de twee grendels samen', () => {
  it('vindt een emoji in app-tekst en noemt regel en teken', () => {
    const treffers = treffersIn([
      { pad: 'src/scherm.tsx', bron: "const a = 1;\nconst t = 'Klaar 🎉';\n" },
    ]) as { pad: string; regel: number; tekens: string[] }[];

    expect(treffers).toHaveLength(1);
    expect(treffers[0]?.regel).toBe(2);
    expect(treffers[0]?.tekens).toEqual(['🎉']);
  });

  it('laat een bestand met alleen commentaar-emoji met rust', () => {
    const treffers = treffersIn([
      { pad: 'src/scherm.tsx', bron: ' * 📏 gemeten\n// 🎉 klaar\nconst a = 1;\n' },
    ]) as unknown[];

    expect(treffers).toEqual([]);
  });
});
