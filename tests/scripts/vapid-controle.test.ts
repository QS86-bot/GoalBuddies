import { beforeAll, describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `tekst-controle.test.ts`.
import {
  beoordeelDrietal,
  beoordeelSubject,
  hoortBijElkaar,
  ontleedPubliekeSleutel,
} from '../../scripts/vapid-controle.mjs';

/**
 * De ijking van `npm run vapid:controle`.
 *
 * ⚠️ **Deze controle bestaat omdat de drie VAPID-waarden op drie plekken staan
 *    en gekruist alle drie perfect ogen.** De publieke sleutel in de webbundel,
 *    de privésleutel in de omgeving van de Edge Function, het subject in beide.
 *    WebCrypto merkt een verkeerde combinatie pas bij het ondertekenen, in een
 *    job die eens per uur draait, en dat komt terug als een 403 van de
 *    pushdienst — niet als een rode test.
 *
 * ⚠️ **De sleutelparen hieronder worden echt gegenereerd en zijn niet vastgezet
 *    in het bestand.** Dat is met opzet: een gepind paar toetst dat deze code
 *    één bekend geval herkent, en niet dat hij een wíllekeurig verkeerd paar
 *    weigert. Bovendien hoort er geen privésleutel in een repository, ook geen
 *    weggegooide.
 *
 * ⚠️ **De tegenproef is de belangrijkste test.** Zou `importKey()` een
 *    niet-passende `d` gewoon accepteren, dan meldt deze controle nooit iets en
 *    is hij een aanname met een groen vinkje. Dat is precies de vorm die dit
 *    project telkens duur betaalt, dus het staat hier als eigen geval.
 */

interface Paar {
  publiek: string;
  prive: string;
}

/**
 * Wat de controle teruggeeft.
 *
 * ⚠️ Het script is een `.mjs` zonder typings, dus TypeScript leidt hier een unie
 *    af waarin `reden` soms ontbreekt. Eén vorm hier is leesbaarder dan een cast
 *    per aanroep, en hij beschrijft precies wat het script belooft.
 */
interface Uitslag {
  ok: boolean;
  reden?: string;
  x?: string;
  y?: string;
}

async function genereer(): Promise<Paar> {
  const paar = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey);

  return {
    publiek: Buffer.from(raw).toString('base64url'),
    prive: jwk.d as string,
  };
}

let een: Paar;
let twee: Paar;

beforeAll(async () => {
  een = await genereer();
  twee = await genereer();
});

describe('ontleedPubliekeSleutel', () => {
  it('splitst een echte sleutel in x en y van 32 octetten', () => {
    const uit: Uitslag = ontleedPubliekeSleutel(een.publiek);

    expect(uit.ok).toBe(true);
    expect(Buffer.from(uit.x as string, 'base64url')).toHaveLength(32);
    expect(Buffer.from(uit.y as string, 'base64url')).toHaveLength(32);
  });

  it('weigert een lege waarde', () => {
    expect(ontleedPubliekeSleutel('')).toMatchObject({ ok: false });
  });

  it('weigert een sleutel van de verkeerde lengte', () => {
    const uit: Uitslag = ontleedPubliekeSleutel(Buffer.alloc(64, 4).toString('base64url'));

    expect(uit.ok).toBe(false);
    expect(uit.reden).toContain('64 octetten');
  });

  it('weigert een punt dat niet met 0x04 begint', () => {
    // ⚠️ Een gecomprimeerd punt (0x02/0x03) is een geldige sleutel maar niet de
    //    vorm die de webpush-keten gebruikt. Stilzwijgend accepteren zou hem
    //    verderop laten struikelen.
    const bytes = Buffer.from(een.publiek, 'base64url');
    bytes[0] = 0x02;

    const uit: Uitslag = ontleedPubliekeSleutel(bytes.toString('base64url'));

    expect(uit.reden).toContain('0x04');
  });
});

describe('hoortBijElkaar', () => {
  it('zegt ja tegen een paar dat samen gegenereerd is', async () => {
    await expect(hoortBijElkaar(een.publiek, een.prive)).resolves.toEqual({ ok: true });
  });

  it('zegt nee tegen een gekruist paar — de tegenproef van deze controle', async () => {
    // ⚠️ Dit is het geval waar de hele controle op rust. Accepteerde `importKey()`
    //    een niet-passende `d`, dan meldt dit script nooit iets en is het een
    //    aanname met een groen vinkje.
    const uit: Uitslag = await hoortBijElkaar(een.publiek, twee.prive);

    expect(uit.ok).toBe(false);
    expect(uit.reden).toContain('hoort niet bij');
  });

  it('zegt nee tegen een lege privésleutel', async () => {
    expect((await hoortBijElkaar(een.publiek, '')).ok).toBe(false);
  });

  it('meldt de publieke sleutel als díe niet deugt, en niet de private', async () => {
    // Eén bezwaar per keer: wie "de privésleutel hoort niet bij deze publieke"
    // leest terwijl de publieke onleesbaar is, zoekt op de verkeerde plek.
    const uit: Uitslag = await hoortBijElkaar('geen-sleutel', een.prive);

    expect(uit.reden).not.toContain('privésleutel hoort niet');
  });

  it('noemt de privésleutel nooit in zijn antwoord', async () => {
    // ⚠️ De reden gaat naar een terminal en mogelijk naar een logboek. De vraag
    //    mag eruit, het antwoord niet.
    const uit: Uitslag = await hoortBijElkaar(een.publiek, twee.prive);

    expect(JSON.stringify(uit)).not.toContain(twee.prive);
  });
});

describe('beoordeelSubject', () => {
  it('accepteert mailto: en https:', () => {
    expect(beoordeelSubject('mailto:iemand@example.com').ok).toBe(true);
    expect(beoordeelSubject('https://goalbuddies.q-projects.tech').ok).toBe(true);
  });

  it('weigert een leeg subject', () => {
    expect(beoordeelSubject('').ok).toBe(false);
  });

  it('weigert een adres zonder schema', () => {
    // `vapidAuthorization()` gooit hierop, en dat gebeurt in de uurjob.
    expect(beoordeelSubject('iemand@example.com').ok).toBe(false);
  });
});

describe('beoordeelDrietal', () => {
  it('zwijgt als alle drie kloppen', async () => {
    const klachten = await beoordeelDrietal({
      publiek: een.publiek,
      prive: een.prive,
      subject: 'mailto:iemand@example.com',
    });

    expect(klachten).toEqual([]);
  });

  it('meldt beide bezwaren tegelijk in plaats van bij de eerste te stoppen', async () => {
    // Een controle die na het eerste bezwaar afbreekt, laat je twee keer draaien
    // voor iets dat je in één keer had kunnen rechtzetten.
    const klachten = await beoordeelDrietal({
      publiek: een.publiek,
      prive: twee.prive,
      subject: 'geen-schema',
    });

    expect(klachten).toHaveLength(2);
  });
});
