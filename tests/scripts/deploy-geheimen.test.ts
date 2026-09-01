import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `deploy-htaccess.test.ts`.
import {
  bewaakteNamen,
  leesEnv,
  teControleren,
  treffersIn,
} from '../../scripts/deploy-web.mjs';

/**
 * IJking van de secret-scan in de deploy — QS8-242.
 *
 * ⚠️ **Deze controle bewaakt het zwaarste dat dit script bewaakt, en was als
 *    enige nooit tegen een bekend geval gelegd.** `deploy-web.mjs` exporteerde
 *    zeven dingen met drie testbestanden eromheen; `scanOpGeheimen` en
 *    `leesEnvNamen` stonden daar niet bij en waren niet eens geëxporteerd. Dat is
 *    de regel uit QS8-115: *een controle die je niet kunt voeden, kun je niet
 *    ijken.*
 *
 * ⚠️ **En hij meldde nul terwijl hij niets kón zien.** Op 31-08 stond er in
 *    `.env` een regel `Google OAuth secret=…` — spaties, kleine letters. Die kwam
 *    niet door `[A-Z0-9_]+`, stond dus niet in de namenlijst, en de waarde is
 *    nooit met de bundel vergeleken. De scan meldde geen fout; hij meldde dat er
 *    niets te controleren viel. **Nul gecontroleerd en alles schoon zagen er
 *    identiek uit.**
 *
 *    Er is niets gelekt: `.env` staat in `.gitignore` en `git log --all -- .env`
 *    is leeg. Dit gaat over de controle.
 *
 * ⚠️ **De must-allow-helft weegt hier extra zwaar.** Een secret-scan die vals
 *    alarm geeft, blokkeert de deploy — en een controle die altijd afgaat, wordt
 *    uitgezet. `TZ=UTC` zit in élke bundel; daarom valt alles onder twaalf tekens
 *    af, en die uitzondering staat hieronder apart onder test.
 *
 * IJKING — mutatie per grendel, en niet één voor de hele controle. Dat is de les
 * van 28-08 bij `tekst:controle`: daar voerde een ijking zijn geval door een pad
 * dat een éérdere grendel al afving, dus hij bleef groen terwijl hij niets
 * bewaakte van wat hij beloofde.
 *
 *   A  de lengtedrempel eruit                → 1 rood
 *   B  het `EXPO_PUBLIC_`-filter eruit       → 3 rood
 *   C  `.env.example` niet meelezen          → 2 rood
 *   D  onleesbare regels stil overslaan      → 2 rood
 *   E  `treffersIn` altijd leeg              → 2 rood
 */

const VOORBEELD = [
  'EXPO_PUBLIC_SUPABASE_URL=',
  'SUPABASE_SERVICE_ROLE_KEY=',
  'SENTRY_AUTH_TOKEN=',
  'HOSTINGER_API_TOKEN=',
].join('\n');

describe('leesEnv', () => {
  it('leest de namen uit een gewoon env-bestand', () => {
    expect(leesEnv('A_B=1\nC=2\n').namen).toEqual(['A_B', 'C']);
  });

  it('slaat commentaar en lege regels over', () => {
    expect(leesEnv('# uitleg\n\n  \nA=1\n').namen).toEqual(['A']);
  });

  /**
   * ⚠️ **Het geval van 31-08, en de reden dat dit issue bestaat.** Zonder deze
   *    tak verdwijnt zo'n regel geruisloos uit de controle.
   */
  it('meldt een naam met spaties in plaats van hem over te slaan', () => {
    const uit = leesEnv('Google OAuth secret=abcdef\n');

    expect(uit.namen).toEqual([]);
    expect(uit.onleesbaar).toEqual([{ nummer: 1, regel: 'Google OAuth secret' }]);
  });

  it('meldt ook een naam in kleine letters', () => {
    expect(leesEnv('client_secret=abcdef\n').onleesbaar).toHaveLength(1);
  });

  /** Een regel zonder `=` is geen toewijzing en dus geen bevinding. */
  it('laat een regel zonder toewijzing met rust', () => {
    expect(leesEnv('zomaar wat tekst\n').onleesbaar).toEqual([]);
  });

  it.each([
    ['leeg', ''],
    ['undefined', undefined],
  ])('valt niet om bij %s', (_naam, tekst) => {
    expect(leesEnv(tekst)).toEqual({ namen: [], onleesbaar: [] });
  });
});

describe('bewaakteNamen', () => {
  it('neemt de geheimen uit .env.example', () => {
    expect(bewaakteNamen(VOORBEELD)).toEqual([
      'SUPABASE_SERVICE_ROLE_KEY',
      'SENTRY_AUTH_TOKEN',
      'HOSTINGER_API_TOKEN',
    ]);
  });

  /** ⚠️ `EXPO_PUBLIC_*` hóórt in de bundel te staan — meescannen is vals alarm. */
  it('laat EXPO_PUBLIC eruit', () => {
    expect(bewaakteNamen(VOORBEELD)).not.toContain('EXPO_PUBLIC_SUPABASE_URL');
  });
});

describe('teControleren', () => {
  const lang = 'ditisminstens12tekens';

  it('neemt een geheim uit .env mee', () => {
    const uit = teControleren({
      omgeving: { MIJN_TOKEN: lang },
      envTekst: 'MIJN_TOKEN=x',
    });
    expect(uit.geheimen).toEqual([{ naam: 'MIJN_TOKEN', waarde: lang }]);
  });

  /**
   * ⚠️ **Blinde vlek 2 van dit issue.** De oude versie filterde op
   *    `naam in leesEnvNamen()`, dus een secret van een CI-runner kwam er niet
   *    doorheen — ook al stond de waarde gewoon in `process.env`.
   */
  it('neemt een geheim mee dat alleen in de omgeving staat', () => {
    const uit = teControleren({
      omgeving: { SENTRY_AUTH_TOKEN: lang },
      envTekst: undefined,
      voorbeeldTekst: VOORBEELD,
    });
    expect(uit.geheimen.map((g: { naam: string }) => g.naam)).toEqual(['SENTRY_AUTH_TOKEN']);
  });

  /** ⚠️ De val die echt is: `TZ=UTC` zit in élke bundel. */
  it('slaat een waarde korter dan de drempel over, met reden', () => {
    const uit = teControleren({ omgeving: { TZ: 'UTC' }, envTekst: 'TZ=x' });

    expect(uit.geheimen).toEqual([]);
    expect(uit.overgeslagen).toContainEqual({ naam: 'TZ', reden: 'korter dan 12 tekens' });
  });

  it('slaat een publieke variabele over, met reden', () => {
    const uit = teControleren({
      omgeving: { EXPO_PUBLIC_SUPABASE_URL: lang },
      envTekst: 'EXPO_PUBLIC_SUPABASE_URL=x',
    });

    expect(uit.geheimen).toEqual([]);
    expect(uit.overgeslagen).toContainEqual({ naam: 'EXPO_PUBLIC_SUPABASE_URL', reden: 'publiek' });
  });

  it('slaat een bekende naam zonder waarde over, met reden', () => {
    const uit = teControleren({ omgeving: {}, envTekst: undefined, voorbeeldTekst: VOORBEELD });

    expect(uit.geheimen).toEqual([]);
    expect(uit.overgeslagen).toContainEqual({ naam: 'SENTRY_AUTH_TOKEN', reden: 'niet gezet' });
  });

  /**
   * ⚠️ **Niet de hele omgeving.** Op een runner staan honderden variabelen, en
   *    `PWD` of `PATH` komen zó in een bronverwijzing terecht.
   */
  it('pakt niet zomaar alles uit de omgeving', () => {
    const uit = teControleren({
      omgeving: { PATH: '/usr/bin:/usr/local/bin:/opt/dingen', HOME: '/home/iemand' },
      envTekst: undefined,
      voorbeeldTekst: VOORBEELD,
    });
    expect(uit.geheimen).toEqual([]);
  });

  it('ontdubbelt een naam die in beide bestanden staat', () => {
    const uit = teControleren({
      omgeving: { SENTRY_AUTH_TOKEN: lang },
      envTekst: 'SENTRY_AUTH_TOKEN=x',
      voorbeeldTekst: VOORBEELD,
    });
    expect(uit.geheimen).toHaveLength(1);
  });
});

describe('treffersIn', () => {
  const geheimen = [{ naam: 'MIJN_TOKEN', waarde: 'ditisminstens12tekens' }];

  it('vindt een geheim dat in een bestand staat', () => {
    const inhoud = new Map([['dist/app.js', 'const k = "ditisminstens12tekens";']]);
    expect(treffersIn(geheimen, inhoud)).toEqual([{ naam: 'MIJN_TOKEN', pad: 'dist/app.js' }]);
  });

  it('meldt hetzelfde geheim in twee bestanden allebei', () => {
    const inhoud = new Map([
      ['dist/a.js', 'ditisminstens12tekens'],
      ['dist/b.js', 'ditisminstens12tekens'],
    ]);
    expect(treffersIn(geheimen, inhoud)).toHaveLength(2);
  });

  /** ⚠️ De helft die telt: een schone bundel mag niets melden. */
  it('zwijgt over een schone bundel', () => {
    expect(treffersIn(geheimen, new Map([['dist/app.js', 'niets aan de hand']]))).toEqual([]);
  });

  it('zwijgt als er niets te zoeken is', () => {
    expect(treffersIn([], new Map([['dist/app.js', 'ditisminstens12tekens']]))).toEqual([]);
  });
});

/**
 * ⚠️ **De ijking tegen het échte project.** Verzonnen voorbeelden zijn groen op
 *    alles wat je bedacht hebt; deze voert de controle het bestand dat er
 *    werkelijk ligt.
 */
describe('het echte .env.example', () => {
  it('levert de geheimen die de deploy moet bewaken', () => {
    const namen = bewaakteNamen(readFileSync('.env.example', 'utf8'));

    for (const naam of ['SUPABASE_SERVICE_ROLE_KEY', 'SENTRY_AUTH_TOKEN', 'HOSTINGER_API_TOKEN']) {
      expect(namen, `${naam} hoort door de secret-scan bewaakt te worden`).toContain(naam);
    }
  });

  /**
   * ⚠️ **De werkafspraak die uit dit issue volgt, als grendel.** Een naam die niet
   *    in `SCREAMING_SNAKE_CASE` staat, bestaat niet voor de controle — en dat is
   *    niet aan de uitvoer te zien.
   */
  it('heeft geen enkele regel die de parser niet kan lezen', () => {
    const { onleesbaar } = leesEnv(readFileSync('.env.example', 'utf8'));
    expect(onleesbaar).toEqual([]);
  });
});
