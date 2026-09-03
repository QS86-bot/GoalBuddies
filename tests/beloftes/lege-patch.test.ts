/**
 * Alles overslaan mag — QS8-37 acceptatiecriterium 4, gevonden in QS8-266.
 *
 * ⚠️ **De belofte is niet "`patchUitVragenlijst()` geeft `{}` terug".** Die was
 *    waar, stond onder test, en was precies de regel die voorkomt dat overslaan
 *    bestaande antwoorden wist. De belofte is wat de gebruiker beloofd wordt:
 *    *wie alles overslaat en op Bewaren drukt, krijgt geen foutmelding.* Die
 *    belofte brak één laag verder: `updateProfiel()` stuurde het lege object
 *    alsnog naar PostgREST, en een `PATCH` zonder velden raakt nul rijen —
 *    `.single()` maakt daar PGRST116 van.
 *
 * ⚠️ **Gemeten, niet beredeneerd.** Tegen de lokale stack gaf de lege patch
 *    `{"code":"PGRST116","message":"JSON object requested, multiple (or no) rows
 *    returned"}` en de gevulde patch een rij. Dat is de reden dat deze test de
 *    schrijfweg hard afsluit in plaats van hem te tellen: de bug was niet dat er
 *    een verkeerd veld meeging, maar dat er überhaupt geschreven werd.
 *
 * ⚠️ **Het scherm was tot 03-09 onbereikbaar** (QS8-266), dus deze fout heeft
 *    nooit iemand kunnen raken. De reparatie die het bereikbaar maakte, maakte
 *    ook dit bereikbaar.
 */
import { describe, expect, it, vi } from 'vitest';

const PROFIEL = {
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Anna',
  avatar_url: null,
  focus_areas: ['sport'],
  minutes_per_day: 30,
  when_i_do_it: 'morning',
  what_breaks_it: ['forget'],
};

/**
 * ⚠️ **Een client die kan lezen en niet kan schrijven.** Zo hoeft deze test niet
 *    te tellen hoeveel velden er meegingen: gaat er íets naar `profiles`, dan
 *    gooit hij. Dat is de belofte en niet een eigenschap van de patch.
 */
const schrijftNiet = {
  from: (tabel: string) => {
    if (tabel === 'profiles') {
      throw new Error('updateProfiel() schreef naar profiles terwijl de patch leeg was.');
    }

    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: PROFIEL, error: null }) }),
      }),
    };
  },
};

vi.mock('../../src/lib/supabase', () => ({ supabase: () => schrijftNiet }));

const { updateProfiel } = await import('../../src/modules/auth/profile');

describe('wie alles overslaat, krijgt geen foutmelding', () => {
  it('een lege patch leest terug en schrijft niet', async () => {
    const uit = await updateProfiel(PROFIEL.id, {});

    expect(uit.ok, 'Een lege patch hoort te slagen; overslaan mag.').toBe(true);
    expect(uit.ok && uit.profiel.minutes_per_day).toBe(30);
  });

  /**
   * ⚠️ De tegenproef, want zonder deze regel zou "schrijf nooit" ook groen zijn.
   *    Een gevulde patch móet wél langs `profiles` — en valt hier dus om op de
   *    schil die niet kan schrijven. Dat is precies het bewijs dat de tak
   *    hierboven de schrijfweg echt overslaat.
   */
  it('een gevulde patch gaat wél naar profiles', async () => {
    await expect(updateProfiel(PROFIEL.id, { minutes_per_day: 45 })).rejects.toThrow(
      /schreef naar profiles/,
    );
  });
});
