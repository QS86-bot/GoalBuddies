/**
 * IJking van `scripts/avatar-controle.mjs`.
 *
 * ⚠️ **Deze test bestaat omdat de controle bij zijn eerste run loog.** Het
 *    sleutelpatroon was `[A-Za-z_$][\w$]*avatar[\w$]*`, en dat eist stilzwijgend
 *    één teken vóór `avatar`. `author_avatar` en `sender_avatar` kwamen erdoor,
 *    `avatar_url` niet — twee van de vijf ophaalpaden vielen buiten beeld en het
 *    script meldde groen. Precies de vorm uit CLAUDE.md regel 18: een controle
 *    die je niet kunt voeden, kun je niet ijken.
 *
 * ⚠️ **Twee helften, en de tweede is even belangrijk.** Wat hij moet vinden, en
 *    wat hij met rust moet laten. Een controle die ook op testfixtures en
 *    commentaar afgaat, leert je hem weg te klikken — en dan bewaakt hij niets
 *    meer terwijl hij er nog staat.
 */
import { describe, expect, it } from 'vitest';

// Een .mjs zonder typen, net als de andere controlescripts.
import { beoordeelBestand, blokkenVan, controleer, isBron, naamVan } from '../../scripts/avatar-controle.mjs';

function mappingsVan(bron: string): readonly number[] {
  const uitkomst = beoordeelBestand(bron) as { mappings: number[] } | null;
  return uitkomst === null ? [] : uitkomst.mappings;
}

describe('wat de controle moet vinden', () => {
  // ⚠️ De vorm die er de eerste keer doorheen glipte. Staat vooraan omdat hij de
  //    reden is dat dit bestand bestaat.
  it('vindt een sleutel die mét `avatar` begint', () => {
    expect(mappingsVan('  avatar_url: rij.avatar_url,')).toEqual([1]);
  });

  it('vindt een sleutel met `avatar` achteraan', () => {
    expect(mappingsVan('  sender_avatar: rij.sender_avatar,')).toEqual([1]);
    expect(mappingsVan('  author_avatar: rij.author_avatar,')).toEqual([1]);
    expect(mappingsVan('  owner_avatar: rij.owner_avatar,')).toEqual([1]);
  });

  it('vindt een sleutel die precies `avatar` heet', () => {
    expect(mappingsVan('  avatar: lid.foto,')).toEqual([1]);
  });

  it('vindt een mapping met optional chaining', () => {
    expect(mappingsVan('  avatar_url: rij?.avatar_url,')).toEqual([1]);
  });

  it('vindt een mapping die op één regel staat met een accolade ervoor', () => {
    expect(mappingsVan('return { id: rij.id, avatar_url: rij.avatar_url };')).toEqual([1]);
  });

  it('geeft het regelnummer en niet alleen "ja"', () => {
    expect(mappingsVan('een\ntwee\n  avatar_url: rij.avatar_url,')).toEqual([3]);
  });
});

describe('wat de controle met rust moet laten', () => {
  // ⚠️ `avatar_url: null` staat in tientallen fixtures. Zou die afgaan, dan is
  //    de controle onbruikbaar en wordt hij binnen een week uitgezet.
  it('laat een fixture met een letterlijke waarde staan', () => {
    expect(mappingsVan('  avatar_url: null,')).toEqual([]);
    expect(mappingsVan("  avatar_url: 'https://voorbeeld',")).toEqual([]);
  });

  it('laat een typedeclaratie staan', () => {
    expect(mappingsVan('  readonly avatar_url: string | null;')).toEqual([]);
  });

  it('laat commentaar staan — ook als het de vorm letterlijk noemt', () => {
    expect(mappingsVan(' * ⚠️ avatar_url: rij.avatar_url is de vorm die afgaat.')).toEqual([]);
    expect(mappingsVan('  // avatar_url: rij.avatar_url,')).toEqual([]);
  });

  it('laat een sleutel zonder `avatar` staan', () => {
    expect(mappingsVan('  display_name: rij.display_name,')).toEqual([]);
  });
});

describe('welke bestanden meetellen', () => {
  it('telt bron en niet de tests ernaast', () => {
    expect(isBron('src/modules/buddies/api.ts')).toBe(true);
    expect(isBron('app/(tabs)/profiel.tsx')).toBe(true);
    expect(isBron('src/modules/buddies/api.test.ts')).toBe(false);
    expect(isBron('src/lib/database.types.d.ts')).toBe(false);
    expect(isBron('scripts/paden.mjs')).toBe(false);
  });
});

describe('de grens is het blok plus zijn aanroepers, niet het bestand', () => {
  /**
   * ⚠️ **De tweede fout van dit script, gevonden door de security-reviewer.** De
   *    eerste versie deed één regex over het hele bestand. `buddies/api.ts` telde
   *    daardoor als "tekent" omdat `fetchGroepsoverzicht` op regel 376 tekent —
   *    terwijl `fetchUitnodiging` op regel 786 het niet deed. Eén tekenende
   *    functie immuniseerde negenhonderd regels.
   *
   * ⚠️ **En de reparatie mocht niet doorslaan naar "het mappende blok moet zélf
   *    tekenen".** De vorm in dit project is een kleine `naarX(rij)` die mapt en
   *    een `fetchX()` die tekent; die eis maakt alle vier de goede ophaalpaden
   *    rood. Vandaar één hop door de aanroepgraaf — en vandaar deze twee tests,
   *    die precies dat onderscheid vastleggen.
   */
  const MAPPER = `
function naarLid(rij) {
  return { id: rij.id, avatar_url: rij.avatar_url };
}
`;

  it('laat een mapper met rust die door een tekenende fetch gebruikt wordt', () => {
    const bron = `${MAPPER}
export async function fetchLeden(id) {
  return metGetekendeAvatars((data ?? []).map(naarLid), 'avatar_url');
}
`;
    expect(beoordeelBestand(bron)?.tekent).toBe(true);
  });

  it('meldt een mapper die alleen door een níet-tekenende fetch gebruikt wordt', () => {
    const bron = `${MAPPER}
export async function fetchIets() {
  return (data ?? []).map(naarLid);
}

export async function fetchAnders() {
  return metGetekendeAvatars(await iets(), 'foto');
}
`;
    const uit = beoordeelBestand(bron);
    expect(uit?.tekent).toBe(false);
    expect(uit?.kaal).toEqual([3]);
  });

  it('laat een functie met rust die zelf mapt én tekent', () => {
    const bron = `
export async function fetchAlles() {
  const rijen = ruw.map((rij) => ({ avatar_url: rij.avatar_url }));
  return metGetekendeAvatars(rijen, 'avatar_url');
}
`;
    expect(beoordeelBestand(bron)?.tekent).toBe(true);
  });
});

describe('blokkenVan en naamVan', () => {
  it('knipt op functies van het hoogste niveau', () => {
    const bron = 'const a = 1;\nfunction een() {\n  return 1;\n}\nexport async function twee() {\n  return 2;\n}';
    expect(blokkenVan(bron).map((b: { van: number }) => b.van)).toEqual([1, 2, 5]);
  });

  // ⚠️ Een ingesprongen functie hoort bij het pad eromheen en start geen blok —
  //    anders valt een hulpfunctie binnen een ophaalpad los en meldt hij zichzelf.
  it('knipt niet op een geneste functie', () => {
    const bron = 'export function buiten() {\n  function binnen() {\n    return 1;\n  }\n}';
    expect(blokkenVan(bron)).toHaveLength(1);
  });

  it('leest de naam uit elke declaratievorm', () => {
    expect(naamVan('export async function fetchChat(groupId) {')).toBe('fetchChat');
    expect(naamVan('function naarBericht(rij) {')).toBe('naarBericht');
    expect(naamVan('export const tekenAvatars = async (paden) => {')).toBe('tekenAvatars');
    expect(naamVan('  const binnen = 1;')).toBeNull();
  });
});

describe('het oordeel over een verzameling bestanden', () => {
  const MET = { pad: 'src/a.ts', inhoud: 'avatar_url: rij.avatar_url,\nmetGetekendeAvatars(x, y);' };
  const ZONDER = { pad: 'src/b.ts', inhoud: 'avatar_url: rij.avatar_url,' };

  it('laat een ophaalpad dat tekent met rust', () => {
    expect(controleer([MET]).gemist).toEqual([]);
  });

  it('meldt een ophaalpad dat niet tekent, mét regelnummer', () => {
    expect(controleer([ZONDER]).gemist).toEqual([{ pad: 'src/b.ts', regels: [1] }]);
  });

  // ⚠️ De kern van regel 18: "de app tekent ergens" is groen terwijl één pad
  //    breekt. De controle kijkt daarom per bestand en niet over het geheel.
  it('laat zich niet redden door een ánder bestand dat wél tekent', () => {
    expect(controleer([MET, ZONDER]).gemist).toHaveLength(1);
  });

  it('telt `tekenAvatars` ook als tekenen', () => {
    expect(
      controleer([{ pad: 'src/c.ts', inhoud: 'avatar_url: p.avatar_url,\ntekenAvatars([x]);' }])
        .gemist,
    ).toEqual([]);
  });

  it('bemoeit zich niet met een bestand zonder avatar-mapping', () => {
    const uit = controleer([{ pad: 'src/d.ts', inhoud: 'const x = 1;' }]);
    expect(uit.gezien).toEqual([]);
    expect(uit.gemist).toEqual([]);
  });
});
