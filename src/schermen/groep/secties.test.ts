import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Lijstgroep } from '@/modules/buddies';
import { t } from '@/shared/i18n';

import { groepSecties, type Groepsectie } from './secties';

/**
 * De indeling van Groepen in Privé en Werk — QS8-775.
 *
 * ⚠️ Toetst de belofte van de lijst en niet de vorm van één sectie: geen groep valt weg, geen groep staat dubbel, een
 *    privégroep staat nooit onder Werk en een teamgroep nooit onder Privé. De naad met de database (wie welke naam
 *    mag lezen) staat in `tests/rls/groepsecties.test.ts`.
 */

let volgnummer = 0;
function groep(organisatie: string | null, naam = `Groep ${++volgnummer}`): Lijstgroep {
  return {
    id: `g-${naam}`,
    name: naam,
    icon: null,
    huddle_day: 0,
    tz: 'Europe/Amsterdam',
    status: 'active',
    created_at: '2026-11-01T00:00:00Z',
    created_by: 'u-1',
    zichtbaarheid: 'beschermd',
    organization_id: organisatie,
  } as Lijstgroep;
}

function ids(secties: readonly Groepsectie[] | null): string[][] {
  return (secties ?? []).map((s) => s.groepen.map((g) => g.id));
}

function koppen(secties: readonly Groepsectie[] | null): string[] {
  return (secties ?? []).map((s) => (s.soort === 'prive' ? 'Privé' : `Werk · ${s.organisatienaam ?? '?'}`));
}

describe('groepSecties — QS8-775', () => {
  it('geeft zonder teamgroep geen secties: Groepen ziet eruit als vóór dit issue', () => {
    expect(groepSecties([groep(null), groep(null)], [])).toBeNull();
    expect(groepSecties([groep(null)], [{ id: 'o-1', naam: 'Acme' }])).toBeNull();
  });

  it('toont geen Privé-sectie als er alleen teamgroepen zijn', () => {
    const team = groep('o-1');
    expect(koppen(groepSecties([team], [{ id: 'o-1', naam: 'Acme' }]))).toEqual(['Werk · Acme']);
  });

  it('zet Privé vooraan en de organisaties daarna op naam, elk met precies hun eigen groepen', () => {
    const prive = groep(null);
    const beta = groep('o-b');
    const acme = groep('o-a');
    const acme2 = groep('o-a');
    const secties = groepSecties(
      [beta, prive, acme, acme2],
      [
        { id: 'o-b', naam: 'Beta' },
        { id: 'o-a', naam: 'acme' },
      ],
    );
    expect(koppen(secties)).toEqual(['Privé', 'Werk · acme', 'Werk · Beta']);
    expect(ids(secties)).toEqual([[prive.id], [acme.id, acme2.id], [beta.id]]);
  });

  it('zet een teamgroep zonder leesbare organisatie onder Werk zonder naam, achteraan', () => {
    const weg = groep('o-weg');
    const acme = groep('o-a');
    const secties = groepSecties([weg, acme, groep(null)], [{ id: 'o-a', naam: 'Acme' }]);
    const laatste = secties?.at(-1);
    expect(laatste).toMatchObject({ soort: 'werk', organisatienaam: null });
    expect(laatste?.groepen.map((g) => g.id)).toEqual([weg.id]);
    expect(secties).toHaveLength(3);
  });

  it('maakt geen sectie voor een organisatie zonder groep', () => {
    const secties = groepSecties(
      [groep('o-a')],
      [
        { id: 'o-a', naam: 'Acme' },
        { id: 'o-z', naam: 'Zonder groep' },
      ],
    );
    expect(koppen(secties)).toEqual(['Werk · Acme']);
  });

  it('houdt twee organisaties met dezelfde naam uit elkaar, in een vaste volgorde', () => {
    const een = groep('o-2');
    const twee = groep('o-1');
    const orgs = [
      { id: 'o-2', naam: 'Acme' },
      { id: 'o-1', naam: 'Acme' },
    ];
    const secties = groepSecties([een, twee], orgs);
    expect(secties?.map((s) => s.sleutel)).toEqual(['o-1', 'o-2']);
    expect(groepSecties([twee, een], [...orgs].reverse())?.map((s) => s.sleutel)).toEqual(['o-1', 'o-2']);
  });

  it('verliest geen groep en zet er geen dubbel: elke groep staat in precies één sectie van zijn eigen soort', () => {
    const invoer = [groep(null), groep('o-a'), groep('o-weg'), groep(null), groep('o-b'), groep('o-a')];
    const secties = groepSecties(invoer, [
      { id: 'o-a', naam: 'Acme' },
      { id: 'o-b', naam: 'Beta' },
    ]);
    const alle = (secties ?? []).flatMap((s) => s.groepen.map((g) => g.id));
    expect([...alle].sort()).toEqual(invoer.map((g) => g.id).sort());
    for (const s of secties ?? []) {
      for (const g of s.groepen) expect(g.organization_id === null).toBe(s.soort === 'prive');
    }
  });
});

describe('de koppen in de catalogus — QS8-775', () => {
  it('heeft een kop Privé, Werk en Werk met de naam van de organisatie', () => {
    expect(t('groepen.sectie_prive')).toBe('Privé');
    expect(t('groepen.sectie_werk')).toBe('Werk');
    expect(t('groepen.sectie_werk_naam', { naam: 'Acme' })).toBe('Werk · Acme');
  });
});

/**
 * ⚠️ **De RLS-test toetst een kopie van de clientverzoeken, en die kopie mag niet wegdrijven** (security-ronde
 *    22-11-2026, punt 1). `tests/rls/groepsecties.test.ts` vraagt met dezelfde kolomlijsten als `fetchMijnGroepen()`
 *    en `fetchMijnOrganisaties()`; krijgt de client een kolom erbij, dan bewijst die test niets meer over wat het
 *    scherm leest. Tweezijdig: de lijst wordt uit de RLS-test gelezen en moet woordelijk in de client staan.
 */
describe('de kolomlijsten van de RLS-test zijn die van de client — QS8-775', () => {
  const bron = (...pad: string[]) => readFileSync(fileURLToPath(new URL(`../../../${pad.join('/')}`, import.meta.url)), 'utf8');
  const rls = bron('tests', 'rls', 'groepsecties.test.ts');
  const constante = (naam: string) => rls.match(new RegExp(`const ${naam} = '([^']+)'`))?.[1];

  it('groups: dezelfde kolommen als fetchMijnGroepen()', () => {
    const kolommen = constante('GROEP_KOLOMMEN');
    expect(kolommen).toBeDefined();
    expect(bron('src', 'modules', 'buddies', 'api.ts')).toContain(`.select('${kolommen}')`);
  });

  it('organizations: dezelfde kolommen als fetchMijnOrganisaties()', () => {
    const kolommen = constante('ORGANISATIE_KOLOMMEN');
    expect(kolommen).toBeDefined();
    expect(bron('src', 'modules', 'organisaties', 'api.ts')).toContain(`.from('organizations').select('${kolommen}')`);
  });
});
