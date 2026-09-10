/**
 * De belofte van `src/shared/ui/Foto.tsx`: **`url` is een ondertekende URL of
 * `null`, nooit een kaal opslagpad** — QS8-412.
 *
 * ⚠️⚠️ **Deze suite bestaat omdat de belofte er wél stond en de grendel niet.**
 *    De kop van `Foto.tsx` zei met zoveel woorden dat een testbestand hem "op
 *    deze plek" toetste, en dat bestand bestond niet. Dat is erger dan een
 *    ontbrekende test: de zin is precies de reden dat de volgende lezer er geen
 *    schrijft. `padverwijzing:controle` vindt die vorm sinds dit issue; deze
 *    suite dicht het gat dat hij bij `Foto.tsx` blootlegde.
 *
 * ⚠️⚠️ **Waarom een kaal pad hier erger is dan een kapotte afbeelding.** Een
 *    `<Image>` met een opslagpad erin geeft een leeg vlak, en dat is het minste.
 *    Het is óók de vorm waarin een vréémde URL zou meeliften als de CHECK van
 *    migratie 0223 (chatfoto) of 0229 (bewijsfoto) er ooit uit valt: dan draagt
 *    `attachment_url` iets anders dan een pad in de eigen emmer, en zonder de
 *    tekenronde gaat dat rechtstreeks het component in.
 *
 * ⚠️ **Twee helften, en dat is opzet.** De onderste helft leest bron, want er is
 *    in dit project geen renderer (zelfde grens en zelfde reden als bij
 *    `Document.tsx` in `tests/beloftes/een-document-voert-niets-uit.test.ts`).
 *    De bovenste helft **voert de datalaag uit** en is daarmee de echte toets:
 *    een bronbewaking kan niet zien wat er gebeurt als het tekenen mislukt, en
 *    dát is precies het geval waarin het kale pad zou blijven staan.
 */
import { describe, expect, it, vi } from 'vitest';

/**
 * Wat `createSignedUrls()` deze keer teruggeeft. Per test gezet.
 *
 * ⚠️ Eén schil voor béide emmers: de twee tekenaars verschillen alleen in de
 *    bucketnaam en de geldigheid, en juist daarom moeten ze dezelfde belofte
 *    waarmaken. Zou er per emmer een eigen schil staan, dan kan de ene helft
 *    stilletjes anders gaan doen dan de andere.
 */
let antwoord: {
  data: { path: string; signedUrl: string; error: string | null }[] | null;
  error: unknown;
} = { data: [], error: null };

/** De emmers waarvoor `createSignedUrls()` is aangeroepen, in volgorde. */
const geraakteEmmers: string[] = [];

vi.mock('../../src/lib/supabase', () => ({
  supabase: () => ({
    storage: {
      from: (emmer: string) => {
        geraakteEmmers.push(emmer);
        return { createSignedUrls: async () => antwoord };
      },
    },
  }),
}));

// ⚠️ Ná `vi.mock`, want die wordt omhooggehesen en deze imports niet.
const { metGetekendeChatfotos, CHATFOTO_BUCKET } = await import(
  '../../src/modules/buddies/chatfoto'
);
const { metGetekendeBewijsfotos, BEWIJSFOTO_BUCKET } = await import(
  '../../src/modules/completions/bewijsfoto'
);

const { readFileSync } = await import('node:fs');

const FOTO_TSX = readFileSync('src/shared/ui/Foto.tsx', 'utf8');

/**
 * `Foto.tsx` zonder commentaar.
 *
 * ⚠️ De kop van dat bestand legt de belofte uit en noemt daarbij `metGetekende…`
 *    en het woord "pad". Een toets op de ruwe tekst zou afgaan op de úítleg in
 *    plaats van op een schending — de vorm die CLAUDE.md beschrijft als *"een
 *    controle die alles meldt, leer je negeren"*.
 *
 * ⚠️⚠️ **De `//` van een URL is géén commentaar, en dat is hier met de hand
 *    gemeten.** 📏 Bij het ijken van deze suite werd een `https://…/storage/…`
 *    in het component ingezet; de kale knipper `\/\/[^\n]*` at de rest van die
 *    regel op, en de grendel "bouwt zelf geen URL" bleef groen — de suite werd
 *    rood op een ándere toets. Precies de vorm waar regel 18 voor waarschuwt:
 *    een ijking die langs een eerdere grendel loopt, bewaakt niets van wat hij
 *    belooft. Vandaar dat `//` alleen telt als er géén dubbele punt vóór staat.
 */
const FOTO_CODE = FOTO_TSX.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /(^|[^:])\/\/[^\n]*/g,
  '$1',
);

/** De twee tekenaars, zodat elk geval beide emmers raakt. */
const TEKENAARS = [
  { naam: 'chatfoto', emmer: CHATFOTO_BUCKET, tekenen: metGetekendeChatfotos },
  { naam: 'bewijsfoto', emmer: BEWIJSFOTO_BUCKET, tekenen: metGetekendeBewijsfotos },
] as const;

describe.each(TEKENAARS)('$naam: getekend of niets, nooit het pad', ({ emmer, tekenen }) => {
  it('vervangt een pad dat tekent door de ondertekende URL', async () => {
    antwoord = {
      data: [{ path: 'g1/u1/abc.jpg', signedUrl: 'https://opslag/getekend?t=1', error: null }],
      error: null,
    };
    geraakteEmmers.length = 0;

    const uit = await tekenen([{ attachment_url: 'g1/u1/abc.jpg' }], 'attachment_url');

    expect(uit[0]?.attachment_url).toBe('https://opslag/getekend?t=1');
    expect(geraakteEmmers).toEqual([emmer]);
  });

  /**
   * ⚠️⚠️ **Het geval waar het om gaat.** Een verwijderd bestand, een verlopen
   *    cache of een lid dat de groep uit is geeft een lege of onvolledige
   *    tekenronde. De rij mag dan niet ongewijzigd teruggaan: dan staat het kale
   *    pad in `url` en is de belofte gebroken zonder dat er iets omvalt.
   *
   *    📏 Deze fout hééft bestaan, in `avatar.ts`: daar stond
   *    `if (getekend.size === 0) return rijen;` als zuinigheid. De kop van
   *    `metGetekendeChatfotos()` schrijft dat op; hier wordt het gemeten.
   */
  it('zet een pad dat niet tekent op null en niet op zichzelf', async () => {
    antwoord = { data: [], error: null };

    const uit = await tekenen([{ attachment_url: 'g1/u1/weg.jpg' }], 'attachment_url');

    expect(uit[0]?.attachment_url).toBeNull();
  });

  it('zet álle paden op null als de hele ronde faalt', async () => {
    antwoord = { data: null, error: { message: 'storage down' } };

    const uit = await tekenen(
      [{ attachment_url: 'g1/u1/a.jpg' }, { attachment_url: 'g1/u1/b.jpg' }],
      'attachment_url',
    );

    expect(uit.map((r) => r.attachment_url)).toEqual([null, null]);
  });

  /**
   * ⚠️ De deelvulling is de gevaarlijkste, want hij lijkt te werken: één foto
   *    komt door en de andere houdt zijn pad. Een test met één rij zou dit
   *    missen.
   */
  it('tekent wat kan en laat de rest niet als pad achter', async () => {
    antwoord = {
      data: [{ path: 'g1/u1/a.jpg', signedUrl: 'https://opslag/a', error: null }],
      error: null,
    };

    const uit = await tekenen(
      [{ attachment_url: 'g1/u1/a.jpg' }, { attachment_url: 'g1/u1/b.jpg' }],
      'attachment_url',
    );

    expect(uit.map((r) => r.attachment_url)).toEqual(['https://opslag/a', null]);
  });

  it('laat een rij zonder bijlage met rust', async () => {
    antwoord = { data: [], error: null };

    const uit = await tekenen([{ attachment_url: null }], 'attachment_url');

    expect(uit[0]?.attachment_url).toBeNull();
  });
});

describe('Foto.tsx krijgt een URL en maakt er geen', () => {
  /**
   * ⚠️ Deze toets grijpt naar het bestand, en dat is wat vraag 4 van regel 18
   *    afraadt. Hij staat er tóch: er is in dit project geen opstelling die een
   *    component tekent, en het alternatief was geen test. De belofte staat in
   *    de kop van `Foto.tsx` zodat hij met het component meeverhuist — en dat
   *    meeverhuizen is precies hoe deze grendel de vorige keer verdween.
   */
  it('heeft geen pad-, bucket- of uri-prop', () => {
    const props = /export interface FotoProps \{([\s\S]*?)\n\}/.exec(FOTO_TSX);
    expect(props, 'geen FotoProps gevonden').not.toBeNull();
    const zonderCommentaar = (props?.[1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(zonderCommentaar).toMatch(/\burl\b\s*:\s*string \| null/);
    expect(zonderCommentaar).not.toMatch(/\b(pad|path|bucket|uri|href)\b\s*:/);
  });

  it('bouwt zelf geen URL en praat niet met de opslag', () => {
    expect(FOTO_CODE).not.toMatch(/createSignedUrls?|getPublicUrl|supabase|storage/);
  });

  /** Onwrikbare regel 16: laden, fout én leeg — alle drie zichtbaar. */
  it('heeft de drie standen die onwrikbare regel 16 vraagt', () => {
    expect(FOTO_TSX).toMatch(/accessibilityRole="progressbar"/);
    expect(FOTO_TSX).toMatch(/stand === 'mislukt'/);
    expect(FOTO_TSX).toMatch(/url === null.*afwezigtekst/s);
  });
});
