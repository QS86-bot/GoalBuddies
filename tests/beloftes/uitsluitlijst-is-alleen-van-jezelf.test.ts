/**
 * De uitsluitlijst van het koppelscherm bevat alleen je eigen doelen — QS8-342.
 *
 * ⚠️ **Waarom dit bestand er is: de naad stond onbewaakt, en dat is gemeten.**
 *    `fetchKoppelbareDoelen()` bestaat uit twee helften. `mijnGekoppeldeDoelIds()`
 *    haalt op wát er al gekoppeld is; de hoofdvraag sluit dat serverzijdig uit met
 *    `not.in`. Er stond een test op de tweede helft (`tests/rls/koppelbare-doelen`,
 *    die de lijst met de hand meegeeft) en een test op de bedrading naar het scherm
 *    (`koppelscherm-vraagt-koppelbare-doelen`). Op de helft ertussen stond niets:
 *    met `.eq('goals.owner_id', userId)` weggehaald bleven **alle 4221 tests
 *    groen**. Onwrikbare regel 18 vraag 3 in zijn zuiverste vorm — een test die
 *    groen blijft terwijl de belofte breekt, bewaakt niets.
 *
 * ⚠️ **De belofte is niet "de query draagt een filter".** Dat is een eigenschap
 *    van het onderdeel, en die verhuist niet mee. De belofte is: *`goal_group_links`
 *    bevat de doelen van élk groepslid, en alleen de jouwe worden eraf getrokken.*
 *    Valt het owner-filter weg, dan wordt de uitsluitlijst zo groot als de héle
 *    groep. Dat is niet alleen verspilling: die lijst gaat als `not.in` mee in de
 *    URL, en die heeft een lengtegrens (QS8-344). Met een groepsbrede lijst komt
 *    die grens net zo veel sneller in zicht als de groep leden heeft.
 *
 * ⚠️ **Waarom een nagemaakte client en niet de RLS-harnas.** Deze functie leunt op
 *    `supabase()` — de client van de app — en de harnas draait met zijn eigen
 *    client op een echte PostgREST. De harnas kan de vráag toetsen (dat doet
 *    `tests/rls/koppelbare-doelen`) maar niet welke lijst deze module eraan
 *    meegeeft. Dezelfde vorm als `lege-patch.test.ts` en `avatar.test.ts`.
 *
 *    ⚠️ De nagemaakte tabel **past het owner-filter écht toe** in plaats van hem
 *    te tellen. Zou hij dat niet doen, dan kon deze test niet rood worden van het
 *    weghalen ervan — en dan bewaakte hij precies zo weinig als de tests die er al
 *    stonden.
 */
import { describe, expect, it, vi } from 'vitest';

const GROEP = '99999999-9999-4999-8999-999999999999';
const ANNA = '11111111-1111-4111-8111-111111111111';
const BRAM = '22222222-2222-4222-8222-222222222222';

const ANNA_GEKOPPELD = [
  '0a000000-0000-4000-8000-000000000001',
  '0a000000-0000-4000-8000-000000000002',
];
const BRAM_GEKOPPELD = [
  '0b000000-0000-4000-8000-000000000001',
  '0b000000-0000-4000-8000-000000000002',
];

/** Elke koppeling in de groep, van beide leden — precies wat de tabel bevat. */
const LINKS = [
  ...ANNA_GEKOPPELD.map((goal_id) => ({ goal_id, owner_id: ANNA })),
  ...BRAM_GEKOPPELD.map((goal_id) => ({ goal_id, owner_id: BRAM })),
];

/**
 * Hoeveel rijen de nagemaakte server per verzoek hoogstens geeft.
 *
 * ⚠️ **Dit is `db-max-rows`.** PostgREST mag minder rijen teruggeven dan het
 *    gevraagde venster, en doet dat zodra die instelling lager staat. `Infinity`
 *    is de lokale stack (gemeten: `pgrst.conf` draagt hem niet).
 */
let venster = Infinity;

/** Wat het scherm uiteindelijk vraagt: de `not.in`-lijst van de hoofdvraag. */
let uitgesloten: string | null = null;

/**
 * ⚠️ Een functie en geen kale lezing. TypeScript versmalt een module-`let` na
 *    `uitgesloten = null` tot `null` en ziet de toewijzing in de nagemaakte
 *    client niet; via een aanroep blijft het type staan wat het is.
 */
function uitsluitlijst(): string | null {
  return uitgesloten;
}

/**
 * Een schil die `eq` onthoudt en hem bij het uitlezen ook echt toepast.
 *
 * ⚠️ `goals.owner_id` is de ingebedde kolom uit `goals!inner(owner_id)`. De schil
 *    kent hem onder diezelfde naam, zodat het weghalen van dat filter hier
 *    hetzelfde doet als op een echte PostgREST: de rijen van het andere lid komen
 *    mee.
 */
function linktabel() {
  const filters: Record<string, string> = {};
  let inner = false;

  const schil = {
    select: (vorm: string) => {
      // ⚠️ **`!inner` is geen opsmuk maar de helft van het filter, en dat is
      //    gemeten op de lokale PostgREST** (2026-09-07, dezelfde groep met twee
      //    leden die er elk twee gekoppeld hebben):
      //
      //      select=goal_id,goals!inner(owner_id) + goals.owner_id=eq.<anna>  -> 2 rijen
      //      select=goal_id,goals(owner_id)       + goals.owner_id=eq.<anna>  -> 4 rijen
      //
      //    Zonder `!inner` beperkt een filter op een ingebedde kolom de rijen
      //    van de bovenliggende tabel niet: Bram's twee komen mee met
      //    `goals: null`, en `mijnGekoppeldeDoelIds()` duwt `rij.goal_id`
      //    onvoorwaardelijk in de lijst. Deze schil doet daarom hetzelfde,
      //    anders kan de test niet rood worden van het weghalen ervan.
      inner = vorm.includes('!inner');
      return schil;
    },
    eq: (kolom: string, waarde: string) => {
      filters[kolom] = waarde;
      return schil;
    },
    order: () => schil,
    range: async (van: number, tot: number) => {
      const eigenaar = inner ? filters['goals.owner_id'] : undefined;
      const gefilterd = LINKS.filter(
        (rij) =>
          (eigenaar === undefined || rij.owner_id === eigenaar) &&
          (filters['group_id'] === undefined || filters['group_id'] === GROEP),
      );

      // ⚠️ `count` is het totaal ná het filter en niet de venstergrootte — zo doet
      //    PostgREST het met `count: 'exact'`, en de lus leunt erop.
      return {
        data: gefilterd
          .slice(van, Math.min(tot + 1, van + venster))
          .map(({ goal_id }) => ({ goal_id })),
        error: null,
        count: gefilterd.length,
      };
    },
  };

  return schil;
}

/** Het dashboard geeft niets terug; deze test kijkt naar de vráag, niet naar het antwoord. */
function dashboard() {
  const schil = {
    select: () => schil,
    eq: () => schil,
    not: (kolom: string, operator: string, waarde: string) => {
      if (kolom === 'id' && operator === 'in') uitgesloten = waarde;
      return schil;
    },
    order: () => schil,
    range: async () => ({ data: [], error: null, count: 0 }),
  };

  return schil;
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: () => ({
    from: (tabel: string) => {
      if (tabel === 'goal_group_links') return linktabel();
      if (tabel === 'goal_dashboard') return dashboard();
      throw new Error(`onverwachte tabel in het koppelpad: ${tabel}`);
    },
  }),
}));

const { fetchKoppelbareDoelen } = await import('../../src/modules/goals/api');

describe('de uitsluitlijst van het koppelscherm', () => {
  it('trekt de doelen van een groepsgenoot er niet vanaf', async () => {
    uitgesloten = null;
    venster = Infinity;
    await fetchKoppelbareDoelen(ANNA, GROEP);

    expect(uitsluitlijst(), 'de hoofdvraag hoort een `not.in` te dragen').not.toBeNull();

    for (const vanBram of BRAM_GEKOPPELD) {
      expect(
        uitsluitlijst()?.includes(vanBram),
        `het doel ${vanBram} is van een gróepsgenoot en hoort niet in Anna's uitsluitlijst — ` +
          'zonder het owner-filter wordt die lijst zo groot als de hele groep, en de `not.in` gaat mee in de URL',
      ).toBe(false);
    }
  });

  it('trekt je eigen gekoppelde doelen er wél vanaf', async () => {
    // ⚠️ De tegenproef. Zonder deze regel is "sluit niets van Bram uit" ook groen
    //    met een lege lijst — en dan biedt het scherm je je eigen gekoppelde doelen
    //    opnieuw aan, wat de bug van criterium 3 terugbrengt.
    uitgesloten = null;
    venster = Infinity;
    await fetchKoppelbareDoelen(ANNA, GROEP);

    for (const vanAnna of ANNA_GEKOPPELD) {
      expect(
        uitsluitlijst()?.includes(vanAnna),
        `${vanAnna} hangt al aan deze groep en hoort uitgesloten te worden`,
      ).toBe(true);
    }
  });

  it('blijft compleet als de server kleinere pagina\'s geeft dan gevraagd', async () => {
    // ⚠️ **De achterdeur uit de security-review van 07-09-2026.** De voor de hand
    //    liggende lus stopt bij "een pagina korter dan gevraagd". Staat
    //    `db-max-rows` op de server onder de stapgrootte, dan is de éérste pagina
    //    al kort: de lus stopt meteen, de uitsluitlijst is stil onvolledig, en het
    //    scherm biedt je doelen aan die al gekoppeld zijn. Dat is de bug van dit
    //    issue, terug via een instelling die niet in deze codebase staat.
    //
    //    Eén rij per verzoek is het scherpste geval: elke pagina is korter dan de
    //    stap, dus de oude uitgang zou al na de eerste stoppen.
    uitgesloten = null;
    venster = 1;
    await fetchKoppelbareDoelen(ANNA, GROEP);

    for (const vanAnna of ANNA_GEKOPPELD) {
      expect(
        uitsluitlijst()?.includes(vanAnna),
        `${vanAnna} viel buiten de uitsluitlijst omdat de server kleine pagina's gaf — dan lijkt een gekoppeld doel weer koppelbaar`,
      ).toBe(true);
    }
  });
});
