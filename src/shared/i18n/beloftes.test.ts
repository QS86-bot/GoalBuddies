import { describe, expect, it } from 'vitest';

import { en } from './en';
import { nl } from './nl';

/**
 * Geen onzichtbaarheidsbelofte die de app niet waar kan maken — besluit A41.
 *
 * ⚠️ **Dit is het gat dat de critical-user-ronde van 24-08 vond, en het is de
 *    zuiverste vorm van onwrikbare regel 18 die dit project tot nu toe heeft
 *    opgeleverd.** EPIC 13 liet `weekly_goals_select` per groep variëren, met
 *    tests in beide standen. Wat níemand toetste, was de *zin* die de gebruiker
 *    leest op het moment dat hij toestemming geeft:
 *
 *      `koppel.uitleg` — "Koppelen deelt de titel en je mijlpaalvoortgang —
 *      niet je notities, **niet je weken** en niet je punten."
 *
 *    Die zin stond boven de koppelknop en was vanaf migratie 0077 onwaar in een
 *    open groep: koppelen deelt daar élke weekdoelrij, inclusief `missed` en
 *    `carried`. De policy klopte, de zin klopte voor een beschermde groep, en de
 *    combinatie was van niemand.
 *
 * ⚠️ **Waarom een allowlist en geen verbod.** De geruststelling ís waardevol —
 *    hij is de reden dat iemand zijn doel durft te koppelen. Weghalen kost
 *    product. Wat niet mag, is hem *onvoorwaardelijk* doen. Elke sleutel
 *    hieronder draagt daarom de reden waarom hij waar blijft; komt er een zevende
 *    bij zonder reden, dan wordt deze test rood en moet iemand nadenken.
 *
 *    Zelfde vorm en zelfde doel als `VERBODEN_GEBEURTENISSEN` in
 *    `chat-schemas.ts`: een lijst die bestaat om een test rood te maken, zodat
 *    niemand de regel hoeft te ónthouden.
 */

/**
 * Zinnen die beloven dat iets onzichtbaar is voor anderen.
 *
 * ⚠️ Bewust breed. Een patroon dat te veel vangt kost één regel in de lijst
 *    hieronder; een patroon dat te weinig vangt kost het vertrouwen van een
 *    gebruiker die dacht dat zijn gemiste week privé was.
 */
const ONZICHTBAARHEID = [
  /niemand[^.]{0,40}ziet/i,
  /ziet niemand/i,
  /niet je weken/i,
  /blijft priv/i,
  /nobody[^.]{0,40}sees/i,
  /no one[^.]{0,40}sees/i,
  /not your weeks/i,
  /stays? private/i,
];

/**
 * De sleutels die zo'n belofte mógen doen, met de reden erbij.
 *
 * ⚠️ De reden is niet decoratief: hij is wat een volgende lezer moet nalopen
 *    zodra er een oppervlak opengaat. Staat er "alleen in een beschermde groep",
 *    dan moet het scherm dat ook echt afdwingen.
 */
const TOEGESTAAN: Readonly<Record<string, string>> = {
  'koppel.uitleg_beschermd':
    'Wordt alleen getoond als groups.zichtbaarheid = beschermd; app/groep/[id].tsx kiest.',
  'koppel.uitleg_open':
    'De belofte gaat hier over níét koppelen, en die geldt in beide standen. De zin zegt ' +
    'daarna expliciet dat koppelen je weken wél deelt.',
  'deling.uitleg_beschermd':
    'Staat op het doelscherm bij één specifieke groep en wordt alleen gekozen als die groep ' +
    'beschermd is; app/doel/[id].tsx kiest per groep, niet één keer boven de lijst. Een doel ' +
    'kan in een open én een beschermde groep tegelijk staan.',
  'uitnodiging.uitleg_missen_beschermd':
    'Wordt alleen getoond als de uitnodiging een beschermde groep betreft; ' +
    'app/uitnodiging/[code].tsx kiest op invite_preview().zichtbaarheid.',
  'onboarding.stap4.b':
    'Hier is nog geen groep. De zin noemt de voorwaarde zelf ("in een beschermde groep — ' +
    'de standaard") in plaats van een belofte te doen die later gebroken wordt.',
  'straf.tot_dan':
    'Een commitment vóór de deadline. Oppervlak 20 is in EPIC 13 bewust niet opengezet: ' +
    'commitments_select geeft de begunstigde groep pas leesrecht vanaf unlocked/due/resolved. ' +
    'Zie beslisdocument 002 §6b.',
};

/** Elke sleutel met een onzichtbaarheidsbelofte, in beide catalogi. */
function beloftes(): readonly string[] {
  const gevonden = new Set<string>();

  for (const catalogus of [nl, en] as const) {
    for (const [sleutel, zin] of Object.entries(catalogus)) {
      if (ONZICHTBAARHEID.some((p) => p.test(zin))) gevonden.add(sleutel);
    }
  }

  return [...gevonden].sort();
}

describe('onzichtbaarheidsbeloftes', () => {
  it('doet er geen enkele zonder dat iemand er een reden bij heeft gezet', () => {
    // ⚠️ Wordt deze rood, voeg dan niet blind een regel aan `TOEGESTAAN` toe.
    //    De vraag is eerst: is deze zin waar in een ópen groep? Zo niet, dan
    //    hoort hij gesplitst te worden in een `_beschermd` en een `_open`, en
    //    moet het scherm kiezen op `groups.zichtbaarheid`.
    for (const sleutel of beloftes()) {
      expect(TOEGESTAAN[sleutel], `${sleutel} belooft onzichtbaarheid zonder reden`).toBeTypeOf(
        'string',
      );
    }
  });

  it('houdt de lijst schoon: geen reden voor een sleutel die niets belooft', () => {
    // Anders groeit `TOEGESTAAN` uit tot een lijst waar niemand meer doorheen
    // kijkt, en dan bewaakt de test niets meer.
    const gevonden = new Set(beloftes());

    for (const sleutel of Object.keys(TOEGESTAAN)) {
      expect(gevonden.has(sleutel), `${sleutel} staat in TOEGESTAAN maar belooft niets`).toBe(true);
    }
  });

  it('geeft elke beschermde variant een open tegenhanger, in beide talen', () => {
    // ⚠️ Een `_beschermd` zonder `_open` betekent dat het scherm in een open
    //    groep terugvalt op... niets. Dat is precies de toestand van vóór deze
    //    reparatie, alleen met een langere sleutelnaam.
    for (const sleutel of Object.keys(nl)) {
      if (!sleutel.endsWith('_beschermd')) continue;

      const open = sleutel.replace(/_beschermd$/, '_open');
      expect(nl, `${open} ontbreekt in nl`).toHaveProperty(open);
      expect(en, `${open} ontbreekt in en`).toHaveProperty(open);
    }
  });

  it('laat de open variant niet dezelfde belofte doen als de beschermde', () => {
    // De hele reparatie is dat ze verschillen. Een copy-paste die de zin
    // ongemoeid laat, is geen reparatie.
    for (const sleutel of Object.keys(nl)) {
      if (!sleutel.endsWith('_beschermd')) continue;

      const open = sleutel.replace(/_beschermd$/, '_open');
      expect(nl[open as keyof typeof nl], sleutel).not.toBe(nl[sleutel as keyof typeof nl]);
    }
  });
});
