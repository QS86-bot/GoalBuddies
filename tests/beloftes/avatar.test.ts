/**
 * De avatar-keten — migratie 0126.
 *
 * ⚠️ **De belofte is niet "uploaden werkt".** Die is: *`profiles.avatar_url` is
 *    geen dood hout meer, en wat er in een `<Image>` belandt is nooit een pad*.
 *    Dat is de vorm uit CLAUDE.md regel 18, vraag 5 — de keten waarvan elk
 *    schakeltje af is en die nergens aan elkaar zit. `avatar_url` bestond sinds
 *    migratie 0001 en er was geen enkele knop die hem kon vullen; geen test kon
 *    dat zien, want er was niets kapot.
 *
 * ⚠️ **Wat hier níét staat, staat in `tests/scripts/avatar-controle.test.ts`:**
 *    dat élk ophaalpad tekent, en niet alleen de vijf die vandaag bestaan. Deze
 *    suite toetst de onderdelen die alleen hier te toetsen zijn — de grenzen, het
 *    pad, de decoder en het samenvoegen — plus de twee naden die er tussen zitten.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  avatarPad,
  base64NaarBytes,
  keurBestand,
  metGetekendeAvatars,
} from '../../src/modules/auth/avatar';

import { readFileSync } from 'node:fs';

/**
 * ⚠️ Een storage-schil die niets kan tekenen. Dat is niet de saaie stand maar de
 *    gevaarlijke: precies dán liet `metGetekendeAvatars` de rijen ongewijzigd
 *    terug, en ging alles wat er in `avatar_url` stond rechtstreeks het scherm
 *    in.
 */
const tekentNiets = {
  storage: {
    from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }),
  },
};

vi.mock('../../src/lib/supabase', () => ({ supabase: () => tekentNiets }));

const MIGRATIE = readFileSync('supabase/migrations/0126_avatars_in_een_eigen_emmer.sql', 'utf8');

// ---------------------------------------------------------------------------

describe('de grenzen staan op de bucket én in de app, en ze zijn gelijk', () => {
  // ⚠️ **Dit is een naad en geen onderdeel.** De bucket is de grendel
  //    (onwrikbare regel 3); de lijst in de app is het gemak. Lopen ze uiteen,
  //    dan is de uitkomst een upload die het formulier doorlaat en de server
  //    weigert — met een melding waar niemand iets aan heeft. Precies de vorm van
  //    migratie 0032/0034, waar de test de app-lijst met zichzelf vergeleek.
  it('de toegestane types komen letterlijk uit migratie 0126', () => {
    const uitMigratie = /allowed_mime_types[\s\S]*?array\[([^\]]+)\]/i.exec(MIGRATIE);
    expect(uitMigratie, 'geen allowed_mime_types in 0126').not.toBeNull();

    const types = [...(uitMigratie?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...types].sort()).toEqual([...AVATAR_TYPES].sort());
  });

  it('de bovengrens komt letterlijk uit migratie 0126', () => {
    // De insert is `values ('avatars', 'avatars', false, 2097152, array[...])`.
    const getal = /'avatars',\s*'avatars',\s*false,\s*(\d+)\s*,/.exec(MIGRATIE);
    expect(getal, 'geen grootte in de insert van 0126').not.toBeNull();
    expect(Number(getal?.[1])).toBe(AVATAR_MAX_BYTES);
  });

  // ⚠️ De bucket is privé, en dat is een besluit en geen instelling. Zou hij ooit
  //    op `true` gaan, dan zijn de vier policies eronder decoratie: een openbare
  //    bucket omzeilt RLS volledig. `storage-controle.mjs` bewaakt dit ook, maar
  //    díé leest álle migraties — hier staat het bij de bucket zelf.
  it('de bucket is privé', () => {
    expect(MIGRATIE).toMatch(/values\s*\(\s*'avatars',\s*'avatars',\s*false/);
  });
});

// ---------------------------------------------------------------------------

describe('keurBestand', () => {
  it('laat elk toegestaan type door', () => {
    for (const mime of AVATAR_TYPES) expect(keurBestand(1024, mime)).toBeNull();
  });

  it('weigert een type dat de bucket niet accepteert', () => {
    expect(keurBestand(1024, 'image/gif')).not.toBeNull();
    expect(keurBestand(1024, 'application/pdf')).not.toBeNull();
  });

  it('weigert een bestand boven de grens en laat de grens zelf door', () => {
    expect(keurBestand(AVATAR_MAX_BYTES, 'image/png')).toBeNull();
    expect(keurBestand(AVATAR_MAX_BYTES + 1, 'image/png')).not.toBeNull();
  });

  // ⚠️ Een melding die de sleutel teruggeeft, is een ontbrekende vertaling. `t()`
  //    valt daar stilzwijgend op terug, dus "niet leeg" is hier niet genoeg.
  it('geeft een vertaalde melding en niet de sleutel', () => {
    expect(keurBestand(1024, 'image/gif')).not.toMatch(/^avatar\./);
    expect(keurBestand(AVATAR_MAX_BYTES + 1, 'image/png')).not.toMatch(/^avatar\./);
  });
});

// ---------------------------------------------------------------------------

describe('avatarPad', () => {
  const ID = '11111111-1111-1111-1111-111111111111';

  // ⚠️ **Het eerste padsegment ís de autorisatie.** Alle vier de policies van
  //    0126 hangen aan `(storage.foldername(name))[1]`. Een pad dat níét met de
  //    user-id begint, is een upload die afketst op de WITH CHECK — en die fout
  //    zou pas op de server zichtbaar worden.
  it('zet de eigenaar vooraan, want daar hangt de policy aan', () => {
    expect(avatarPad(ID, 'image/png').split('/')[0]).toBe(ID);
  });

  it('geeft precies één map diep — de policy leest segment 1', () => {
    expect(avatarPad(ID, 'image/png').split('/')).toHaveLength(2);
  });

  it('kiest de extensie bij het type', () => {
    expect(avatarPad(ID, 'image/jpeg')).toMatch(/\.jpg$/);
    expect(avatarPad(ID, 'image/png')).toMatch(/\.png$/);
    expect(avatarPad(ID, 'image/webp')).toMatch(/\.webp$/);
  });

  // ⚠️ Twee uploads binnen dezelfde milliseconde mogen elkaar niet overschrijven:
  //    `upload()` staat op `upsert: false` en zou dan falen op een naambotsing.
  it('geeft elke keer een ander pad', () => {
    const paden = new Set(Array.from({ length: 200 }, () => avatarPad(ID, 'image/png')));
    expect(paden.size).toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe('base64NaarBytes', () => {
  function heenEnWeer(bytes: readonly number[]): readonly number[] {
    const base64 = Buffer.from(Uint8Array.from(bytes)).toString('base64');
    return [...(base64NaarBytes(base64) ?? [])];
  }

  it('geeft dezelfde bytes terug als Buffer erin stopte', () => {
    expect(heenEnWeer([0, 1, 2, 253, 254, 255])).toEqual([0, 1, 2, 253, 254, 255]);
  });

  // ⚠️ De drie restlengtes van base64. Een decoder die de padding verkeerd
  //    afhandelt, doet het op precies één van deze drie fout — en dat is dan één
  //    op de drie foto's.
  it('klopt bij elke restlengte', () => {
    for (const lengte of [1, 2, 3, 4, 5, 6, 7]) {
      const bytes = Array.from({ length: lengte }, (_, i) => (i * 37) % 256);
      expect(heenEnWeer(bytes), `lengte ${lengte}`).toEqual(bytes);
    }
  });

  it('doorstaat een echte JPEG-kop', () => {
    expect(heenEnWeer([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
    ]);
  });

  it('negeert regeleindes — sommige kiezers wikkelen de tekst', () => {
    const base64 = Buffer.from(Uint8Array.from([1, 2, 3, 4, 5, 6])).toString('base64');
    expect([...(base64NaarBytes(base64.slice(0, 4) + '\n' + base64.slice(4)) ?? [])]).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  // ⚠️ Geen halve buffer bij rommel. Een afbeelding die er half is, is een upload
  //    die op de server sneuvelt — en de gebruiker leest dan "opslaan mislukt"
  //    terwijl het probleem hier zat.
  it('geeft null bij een teken dat niet in het alfabet staat', () => {
    expect(base64NaarBytes('AAAA!AAA')).toBeNull();
  });

  it('geeft null bij een onmogelijke lengte', () => {
    expect(base64NaarBytes('AAAAA')).toBeNull();
  });

  it('geeft een lege reeks bij een lege string en niet null', () => {
    expect(base64NaarBytes('')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('metGetekendeAvatars', () => {
  it('laat een lege lijst met rust', async () => {
    await expect(metGetekendeAvatars([], 'avatar_url')).resolves.toEqual([]);
  });

  it('laat een lege waarde leeg', async () => {
    const uit = await metGetekendeAvatars([{ id: 'a', avatar_url: null }], 'avatar_url');
    expect(uit[0]?.avatar_url).toBeNull();
  });

  /**
   * ⚠️ **Dit is de scherpste test van dit bestand, en hij is met de hand gebroken
   *    gevonden.** `profiles.avatar_url` is voor `authenticated` schrijfbaar —
   *    gemeten in `information_schema.column_privileges`, veertien kolommen
   *    waaronder deze. Een gebruiker kan er dus een willekeurig adres in zetten.
   *
   *    Zolang er ook maar één avatar in de lijst wél getekend werd, viel dat
   *    adres eruit. Was er níets te tekenen — één lid met een vreemde URL en de
   *    rest zonder foto — dan gaf de functie de rijen ongewijzigd terug en laadde
   *    elk groepslid dat adres uit zijn eigen `<Image>`. Dat is geen theoretisch
   *    lek maar de goedkoopste manier om de IP-adressen van een groep te
   *    verzamelen.
   *
   *    De belofte is daarom niet "paden worden getekend" maar: *wat hier uitkomt
   *    is een ondertekende URL of `null`, en nooit iets ertussenin*.
   */
  it('geeft null voor wat niet getekend kon worden — nooit de ruwe waarde', async () => {
    const uit = await metGetekendeAvatars(
      [{ id: 'a', avatar_url: 'https://volgmij.example/pixel.gif' }],
      'avatar_url',
    );

    expect(uit[0]?.avatar_url).toBeNull();
  });

  it('doet dat ook als de hele lijst onbekende waarden draagt', async () => {
    const uit = await metGetekendeAvatars(
      [
        { id: 'a', avatar_url: 'https://volgmij.example/1.gif' },
        { id: 'b', avatar_url: 'iemand-anders/foto.jpg' },
      ],
      'avatar_url',
    );

    expect(uit.map((r) => r.avatar_url)).toEqual([null, null]);
  });
});
