import { describe, expect, it } from 'vitest';

import { beslissendeGroep, enigeOfGekozen, koppelbareGroepen, type DoelGroep } from './deling';

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
    // Sinds migratie 0111 hoort een drempel bij de regel; `any` heeft er geen.
    approval_quorum: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: null,
    evidence_policy: 'none',
    // QS8-231 — een groep die zich niet laat vinden, en dat is de standaard.
    ontdekbaar: false,
    categorie: null,
    omschrijving: null,
    voertaal: null,
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
   * ⚠️⚠️ **Omgekeerd op 05-11-2026 (QS8-651).** Hier stond: *bij precies één groep
   *    wordt een oude keuze genegeerd*, met als reden dat er anders "geen
   *    beslisser" staat terwijl er maar één mogelijkheid is. De security-ronde
   *    vond wat die regel kost: kies "Vrienden", ontkoppel "Vrienden" op hetzelfde
   *    scherm, en het verzoek ging naar "Werk" — de enige die overbleef, met de
   *    keuzelijst verborgen. Het scherm toont de lijst nu opnieuw zolang er geen
   *    beslisser is; de regel kiest niet voor de gebruiker.
   */
  it('kiest bij één overgebleven groep niet stilzwijgend voor een oude keuze', () => {
    expect(beslissendeGroep([koppeling('a')], 'b')).toBeUndefined();
  });
});

/**
 * De ene regel achter élke keuze uit je groepen of je groepsgenoten — QS8-651.
 *
 * ⚠️ **Dit is de regel van `beslissendeGroep()` zonder de naam van het
 *    uitstelverzoek erop**, want hij geldt sinds QS8-651 ook voor de hulpvraag,
 *    de begunstigde van een straf, de vervangende getuige en de deelknop van De
 *    Lijst. Vijf plekken hadden tot dan een stille eerste — vier op het doelscherm,
 *    één in De Lijst; die stond zichtbaar voorgeselecteerd, maar een voorselectie
 *    is een keuze die de gebruiker niet maakte, en de verstuurknop stond aan.
 *
 *    Handmatig gebroken op 05-11-2026, mutatie per grendel:
 *    - `return items[0]` als laatste regel → de tests bij twee kandidaten rood,
 *      in dit blok en bij `beslissendeGroep`; de rest groen.
 *    - `if (items.length === 1) return items[0];` (de oude QS8-56-regel, keuze
 *      genegeerd) → alleen de twee 'overgebleven'-tests rood.
 */
describe('enigeOfGekozen', () => {
  const id = (x: { readonly id: string }) => x.id;
  const a = { id: 'a' };
  const b = { id: 'b' };

  it('geeft niets terug zonder kandidaten', () => {
    expect(enigeOfGekozen([], '', id)).toBeUndefined();
    expect(enigeOfGekozen([], 'a', id)).toBeUndefined();
  });

  it('kiest de enige kandidaat zonder dat er iets gekozen hoeft te worden', () => {
    expect(enigeOfGekozen([a], '', id)).toBe(a);
  });

  it('kiest de enige kandidaat ook als de gebruiker precies die aanwees', () => {
    expect(enigeOfGekozen([a], 'a', id)).toBe(a);
  });

  /**
   * ⚠️ De naad van de security-ronde: twee kandidaten, keuze gemaakt, lijst
   *    krimpt tot één ándere. Dan geen ontvanger — niet de overgeblevene.
   */
  it('kiest bij één overgebleven kandidaat niet stilzwijgend voor een oude keuze', () => {
    expect(enigeOfGekozen([a], 'b', id)).toBeUndefined();
  });

  it('kiest bij twee niets tot de gebruiker kiest', () => {
    expect(enigeOfGekozen([a, b], '', id)).toBeUndefined();
  });

  it('kiest bij twee wat de gebruiker aanwees', () => {
    expect(enigeOfGekozen([a, b], 'b', id)).toBe(b);
  });

  it('valt niet terug op een ander als de gekozene verdwijnt', () => {
    expect(enigeOfGekozen([a, b], 'weg', id)).toBeUndefined();
  });

  /**
   * ⚠️ De sleutel is een parameter en geen vaste kolomnaam, want de vijf plekken
   *    lezen drie vormen: `group_id` op een gekoppelde groep, `id` op een
   *    `Lijstgroep` en `id` op een groepsgenoot. Eén regel die alleen `id` kent,
   *    had op het doelscherm een tweede kopie nodig gehad — en dat is precies hoe
   *    de stille eerste er de vorige keer naast kwam te staan.
   */
  it('vergelijkt op de sleutel die de aanroeper aanwijst', () => {
    const groepen = [koppeling('x'), koppeling('y')];
    expect(enigeOfGekozen(groepen, 'y', (g) => g.group_id)?.group_id).toBe('y');
    expect(enigeOfGekozen(groepen, 'y', (g) => g.name)).toBeUndefined();
  });

  it('is de regel waar `beslissendeGroep()` op staat', () => {
    const groepen = [koppeling('a'), koppeling('b')];
    for (const keuze of ['', 'a', 'b', 'weg']) {
      expect(beslissendeGroep(groepen, keuze)).toBe(enigeOfGekozen(groepen, keuze, (g) => g.group_id));
    }
  });
});
