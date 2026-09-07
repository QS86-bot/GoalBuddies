/**
 * De ijking van `dode-exports-controle` — QS8-150.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken** (CLAUDE.md bij
 *    regel 18). Daarom neemt `onbereikbaar()` zijn broncode als argument: elke
 *    vorm gaat hier los langs de zeef — de vormen die hij moet vinden én de
 *    vormen die hij met rust moet laten. Die tweede helft is even belangrijk;
 *    een controle die alles meldt, leer je te negeren, en dat is precies waarom
 *    dit issue niet met een grep opgelost kon worden.
 */
import { describe, expect, it } from 'vitest';

import {
  BEKENDE_ONBEREIKBAAR,
  WORTELMAPPEN,
  barrelExports,
  controleer,
  gebruikteNamen,
  onbereikbaar,
  ontleed,
} from '../../scripts/dode-exports-controle.mjs';

/** Bouwt een minivoorbeeld: een scherm plus een module. */
function wereld(scherm: string, module: string): { pad: string; bron: string }[] {
  return [
    { pad: '/x/app/scherm.tsx', bron: scherm },
    { pad: '/x/src/modules/demo/api.ts', bron: module },
  ];
}

const isWortel = (pad: string): boolean => pad.startsWith('/x/app/');

describe('dode-exports-controle — wat hij moet vinden', () => {
  it('meldt een functie die geen enkel scherm aanroept', () => {
    const uit = onbereikbaar(
      wereld(
        `export default function Scherm() { return null; }`,
        `export function fetchIets() { return 1; }`,
      ),
      isWortel,
      ['fetchIets'],
    );
    expect(uit).toEqual(['fetchIets']);
  });

  it('trapt niet in een naam die alleen in een commentaarblok staat', () => {
    // ⚠️ Dit is de valse melding waar de ruwe grep op stukliep, en de reden dat
    //    hier een parser staat: dit project schrijft veel commentaar, en daar
    //    staan functienamen in.
    const uit = onbereikbaar(
      wereld(
        `/** De knop bij fetchIets() ontbrak tot 28-08. */
         export default function Scherm() { return null; }`,
        `export function fetchIets() { return 1; }`,
      ),
      isWortel,
      ['fetchIets'],
    );
    expect(uit).toEqual(['fetchIets']);
  });

  it('trapt niet in een naam die alleen in een string staat', () => {
    const uit = onbereikbaar(
      wereld(
        `export default function Scherm() { return 'fetchIets'; }`,
        `export function fetchIets() { return 1; }`,
      ),
      isWortel,
      ['fetchIets'],
    );
    expect(uit).toEqual(['fetchIets']);
  });

  it('telt een import zonder gebruik niet als bereikbaar', () => {
    // ⚠️ De vorm die een naïeve tekstzoektocht doorlaat: het scherm importeert
    //    de functie en gebruikt hem nergens. Dan is er nog steeds geen knop.
    const uit = onbereikbaar(
      wereld(
        `import { fetchIets } from '@/modules/demo';
         export default function Scherm() { return null; }`,
        `export function fetchIets() { return 1; }`,
      ),
      isWortel,
      ['fetchIets'],
    );
    expect(uit).toEqual(['fetchIets']);
  });
});

describe('dode-exports-controle — wat hij met rust moet laten', () => {
  it('een functie die een scherm rechtstreeks aanroept', () => {
    const uit = onbereikbaar(
      wereld(
        `import { fetchIets } from '@/modules/demo';
         export default function Scherm() { void fetchIets(); return null; }`,
        `export function fetchIets() { return 1; }`,
      ),
      isWortel,
      ['fetchIets'],
    );
    expect(uit).toEqual([]);
  });

  it('⚠️ een functie die als callback wordt doorgegeven', () => {
    // ⚠️ **Dit geval liet de eerste opzet vallen.**
    //    `useAsyncMetTerugval(fetchMogelijkeBegunstigden, …)` is de vorm die dit
    //    project overal gebruikt: de functie wordt niet aangeroepen maar
    //    doorgegeven. Een zeef die alleen `naam(` ziet, meldt hem als dood.
    const uit = onbereikbaar(
      wereld(
        `import { fetchIets } from '@/modules/demo';
         export default function Scherm() { return useIets(fetchIets); }`,
        `export function fetchIets() { return 1; }`,
      ),
      isWortel,
      ['fetchIets'],
    );
    expect(uit).toEqual([]);
  });

  it('⚠️ een functie die pas via een tweede schakel bereikt wordt', () => {
    // ⚠️ **Dit is waar de parser voor betaalt.** `uploadAvatar` staat op geen
    //    enkel scherm — alleen `useAvatarKeuze` roept hem aan, en díe staat op
    //    een scherm. Een controle die één schakel diep kijkt, meldt hem als dood.
    const uit = onbereikbaar(
      [
        { pad: '/x/app/scherm.tsx', bron: `export default function Scherm() { return useHook(); }` },
        { pad: '/x/src/modules/demo/hook.ts', bron: `export function useHook() { return uploadIets(); }` },
        { pad: '/x/src/modules/demo/api.ts', bron: `export function uploadIets() { return 1; }` },
      ],
      isWortel,
      ['uploadIets'],
    );
    expect(uit).toEqual([]);
  });

  it('een functie die een geplande taak aanroept en geen enkel scherm', () => {
    // ⚠️ De rollover en de notificatiejob zijn óók wortels: een gebruiker
    //    bereikt code langs een scherm of langs een geplande taak. Vergeet je de
    //    tweede, dan meldt de controle de halve notifications-module als dood —
    //    gemeten, dat waren er vijf.
    const uit = onbereikbaar(
      [
        { pad: '/x/supabase/functions/rollover/index.ts', bron: `export default () => magNudgen();` },
        { pad: '/x/src/modules/demo/regels.ts', bron: `export function magNudgen() { return true; }` },
      ],
      (pad: string) => pad.startsWith('/x/supabase/functions/'),
      ['magNudgen'],
    );
    expect(uit).toEqual([]);
  });

  it('een JSX-component die alleen als tag gebruikt wordt', () => {
    const uit = onbereikbaar(
      [
        { pad: '/x/app/scherm.tsx', bron: `export default function Scherm() { return <Kaart />; }` },
        { pad: '/x/src/shared/ui/Kaart.tsx', bron: `export function Kaart() { return null; }` },
      ],
      isWortel,
      ['Kaart'],
    );
    expect(uit).toEqual([]);
  });

  it('een naam die niet als functie bestaat, wordt niet gemeld', () => {
    // ⚠️ Types, constanten en Zod-schema's worden genoemd en niet aangeroepen.
    //    Bij de eerste opzet telden ze mee en stonden er 279 meldingen.
    const uit = onbereikbaar(
      wereld(
        `export default function Scherm() { return null; }`,
        `export const MAX = 10; export type Doel = { id: string };`,
      ),
      isWortel,
      ['MAX', 'Doel'],
    );
    expect(uit).toEqual([]);
  });
});

describe('de wortels zelf', () => {
  /**
   * ⚠️ **Deze test staat er omdat de ijking hem miste.** De test hierboven over
   *    een geplande taak geeft zijn eigen `isWortel` mee, dus hij toetst het
   *    álgoritme en niet de instelling. `supabase/functions` uit `WORTELMAPPEN`
   *    halen maakte hem dan ook niet rood — alleen de registertest, en die zegt
   *    niet wáárom.
   *
   *    Dat is precies de val die CLAUDE.md bij regel 18 beschrijft: een ijking
   *    die zijn geval door een pad voert dat een andere grendel al afvangt,
   *    bewaakt niets van wat hij belooft.
   */
  it('een geplande taak telt als wortel, net als een scherm', () => {
    // Gemeten toen dit ontbrak: vijf functies uit `notifications` werden als
    // dood gemeld terwijl de notificatiejob ze gewoon aanroept.
    expect(WORTELMAPPEN).toContain('app');
    expect(WORTELMAPPEN.some((m: string) => m.includes('functions'))).toBe(true);
  });
});

describe('de onderdelen los', () => {
  it('`gebruikteNamen` laat een importregel en een property-naam liggen', () => {
    const namen = gebruikteNamen(
      ontleed('/x/a.ts', `import { a } from 'x'; const q = obj.b; void c();`),
    );
    expect(namen.has('a')).toBe(false);
    expect(namen.has('b')).toBe(false);
    expect(namen.has('c')).toBe(true);
  });

  it('`barrelExports` slaat een `export type` over', () => {
    const namen = barrelExports(
      ontleed('/x/index.ts', `export { doeIets, type Doel } from './api';`),
    );
    expect([...namen]).toEqual(['doeIets']);
  });
});

describe('het register en de werkelijkheid lopen gelijk', () => {
  /**
   * ⚠️ **De ratel.** Rood als er een onbereikbare functie bij komt, én rood als
   *    er een uit het register verdwijnt zonder dat de rij meezakt — een
   *    register dat blijft staan terwijl de functie weg is, is een lijst die
   *    liegt. Zelfde vorm als `regel15:controle` en `levend:controle`.
   */
  it('elke gevonden functie staat in het register en andersom', () => {
    const gevonden = controleer().sort();
    expect(gevonden).toEqual(Object.keys(BEKENDE_ONBEREIKBAAR).sort());
  });

  it('elke rij in het register draagt een reden en geen kale naam', () => {
    for (const [naam, reden] of Object.entries(BEKENDE_ONBEREIKBAAR)) {
      expect(typeof reden, naam).toBe('string');
      expect((reden as string).length, `${naam} heeft een te korte reden`).toBeGreaterThan(60);
    }
  });
});
