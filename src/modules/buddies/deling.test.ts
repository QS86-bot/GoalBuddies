import { describe, expect, it } from 'vitest';

import { beslissendeGroep, koppelbareGroepen, type DoelGroep } from './deling';

import type { Tables } from '../../lib/database.types';

/**
 * Eén doel in meer dan één groep — QS8-56 (PRD 5.5).
 *
 * ⚠️ **Wat hier getoetst wordt is de belofte en niet het lijstje.** De belofte
 *    van deze feature is dat elke groep een aparte toestemming is en dat de app
 *    er nooit stilzwijgend een voor je kiest. Een test die telt hoeveel rijen er
 *    op het scherm staan, blijft groen op het moment dat die belofte breekt.
 */

function groep(id: string, extra: Partial<Tables<'groups'>> = {}): Tables<'groups'> {
  return {
    id,
    name: `Groep ${id}`,
    approval_rule: 'any',
    // Sinds migratie 0110 hoort een drempel bij de regel; `any` heeft er geen.
    approval_quorum: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: null,
    evidence_policy: 'none',
    huddle_day: 0,
    icon: null,
    invite_code: `code-${id}`,
    invite_revoked: false,
    last_activity_at: '2026-01-01T00:00:00Z',
    season_cadence: 'none',
    status: 'active',
    tz: 'Europe/Amsterdam',
    zichtbaarheid: 'beschermd',
    ...extra,
  };
}

function koppeling(id: string, zichtbaarheid: DoelGroep['zichtbaarheid'] = 'beschermd'): DoelGroep {
  return { group_id: id, name: `Groep ${id}`, zichtbaarheid };
}

describe('koppelbareGroepen', () => {
  it('laat de groepen over waar dit doel nog niet in staat', () => {
    const over = koppelbareGroepen([groep('a'), groep('b'), groep('c')], [koppeling('b')]);

    expect(over.map((g) => g.group_id)).toEqual(['a', 'c']);
  });

  it('geeft niets terug als het doel al in al je groepen staat', () => {
    expect(koppelbareGroepen([groep('a')], [koppeling('a')])).toEqual([]);
  });

  it('geeft niets terug als je nog in geen enkele groep zit', () => {
    expect(koppelbareGroepen([], [])).toEqual([]);
  });

  /**
   * ⚠️ Een gearchiveerde groep hoort er normaal niet eens in te zitten:
   *    `groups_select` is `is_group_member(id)`, en die functie sluit een
   *    gearchiveerde groep uit. Deze filter is er voor het geval de lijst ergens
   *    anders vandaan komt — een cache, een toekomstige RPC, een testfixture.
   *
   *    Hij mág niet weg: een koppelpoging op een gearchiveerde groep ketst af op
   *    `goal_group_links_insert` (dat leunt op dezelfde `is_group_member`), en een
   *    knop aanbieden die gegarandeerd een storingsmelding oplevert, is erger dan
   *    geen knop. Deze functie mag dus nooit áánnemen dat de aanroeper al
   *    gefilterd heeft.
   */
  it('biedt een gearchiveerde groep niet aan', () => {
    expect(koppelbareGroepen([groep('a', { status: 'archived' })], [])).toEqual([]);
  });

  /**
   * ⚠️ De zichtbaarheid moet meekomen, want de zin boven de koppelknop hangt
   *    ervan af: koppelen aan een **open** groep deelt sinds migratie 0077 élke
   *    weekdoelrij, ook de gemiste. Zonder dit veld zou het scherm die zin niet
   *    kunnen kiezen en zou het de beschermde belofte doen in een open groep —
   *    exact de fout die `beloftes.test.ts` bewaakt.
   */
  it('neemt de zichtbaarheid van elke groep mee', () => {
    const over = koppelbareGroepen(
      [groep('open', { zichtbaarheid: 'open' }), groep('dicht')],
      [],
    );

    expect(over.map((g) => g.zichtbaarheid)).toEqual(['open', 'beschermd']);
  });

  /**
   * ⚠️ **Onbekend is beschermd.** `groups.zichtbaarheid` is in de gegenereerde
   *    types een kale `string`; een oudere server, een lege kolom of een tikfout
   *    hoort geen "open" te suggereren. Dan zou de gebruiker denken dat hij minder
   *    deelt dan hij deelt.
   */
  it('leest een onbekende zichtbaarheid als beschermd', () => {
    const over = koppelbareGroepen([groep('x', { zichtbaarheid: 'iets-nieuws' })], []);

    expect(over[0]?.zichtbaarheid).toBe('beschermd');
  });
});

describe('beslissendeGroep', () => {
  it('geeft niemand terug als het doel met niemand gedeeld wordt', () => {
    expect(beslissendeGroep([], '')).toBeUndefined();
    expect(beslissendeGroep([], 'a')).toBeUndefined();
  });

  it('kiest de enige groep zonder dat er iets gekozen hoeft te worden', () => {
    expect(beslissendeGroep([koppeling('a')], '')?.group_id).toBe('a');
  });

  /**
   * ⚠️ **Dit is de test die de hele feature bewaakt.** Tot QS8-56 nam het scherm
   *    `groepen[0]`, en dan was dít geval een groep die de gebruiker nooit
   *    aangewezen had. Zolang een doel maar in één groep kón staan, was de
   *    toestand onbereikbaar en kon geen enkele test hem zien; PRD 5.5 maakt hem
   *    bereikbaar, dus hij moet hier staan.
   *
   *    Handmatig gebroken op 27-08: met `return groepen[0]` in de laatste regel
   *    van `beslissendeGroep()` wordt precies deze test rood en de rest groen.
   */
  it('kiest bij twee groepen niets tot de gebruiker kiest', () => {
    expect(beslissendeGroep([koppeling('a'), koppeling('b')], '')).toBeUndefined();
  });

  it('kiest bij twee groepen de groep die de gebruiker aanwees', () => {
    expect(beslissendeGroep([koppeling('a'), koppeling('b')], 'b')?.group_id).toBe('b');
  });

  /**
   * ⚠️ Ontkoppel je de gekozen groep terwijl het formulier openstaat, dan is het
   *    antwoord "geen beslisser" en niet "de volgende in de rij". Een verzoek dat
   *    naar een andere groep verhuist dan je aanwees, is erger dan een verzoek dat
   *    niet weggaat.
   */
  it('valt niet terug op een andere groep als de gekozen groep verdwijnt', () => {
    expect(beslissendeGroep([koppeling('a'), koppeling('b')], 'weg')).toBeUndefined();
  });

  /**
   * ⚠️ Bij precies één groep wordt een oude keuze genegeerd. Anders zou een keuze
   *    die op twee groepen sloeg, blijven hangen nadat er nog één over is — en dan
   *    staat er "geen beslisser" terwijl er maar één mogelijkheid is.
   */
  it('negeert een oude keuze zodra er nog één groep over is', () => {
    expect(beslissendeGroep([koppeling('a')], 'b')?.group_id).toBe('a');
  });
});
