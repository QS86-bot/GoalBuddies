import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Lijstgroep } from '@/modules/buddies';

const groepen = vi.fn<() => Promise<readonly Lijstgroep[]>>();
const organisaties = vi.fn<() => Promise<readonly { id: string; naam: string; rol: 'admin' | 'member' }[]>>();

vi.mock('@/modules/buddies', () => ({ fetchMijnGroepen: () => groepen() }));
vi.mock('@/modules/organisaties', () => ({ fetchMijnOrganisaties: () => organisaties() }));

const { laadGroepenlijst } = await import('./laden');

function groep(id: string, organisatie: string | null): Lijstgroep {
  return { id, name: id, organization_id: organisatie } as Lijstgroep;
}

/**
 * Wat het tabblad Groepen laadt — QS8-775, security-ronde 22-11-2026 punt 2.
 *
 * ⚠️ Twee beloften die geen RLS-test ziet: wie geen teamgroep heeft, doet niet meer verzoeken dan vóór dit issue, en
 *    een storing op de organisaties is een foutstaat en geen lijst met "Werk" zonder naam.
 */
describe('laadGroepenlijst — QS8-775', () => {
  beforeEach(() => {
    groepen.mockReset();
    organisaties.mockReset();
  });

  it('vraagt zonder teamgroep de organisaties niet op en geeft geen secties', async () => {
    groepen.mockResolvedValue([groep('a', null)]);
    organisaties.mockRejectedValue(new Error('mag niet aangeroepen worden'));
    await expect(laadGroepenlijst()).resolves.toEqual({ groepen: [groep('a', null)], secties: null });
    expect(organisaties).not.toHaveBeenCalled();
  });

  it('geeft een storing op de organisaties door als fout, en niet als Werk zonder naam', async () => {
    groepen.mockResolvedValue([groep('a', null), groep('t', 'o-1')]);
    organisaties.mockRejectedValue(new Error('Je organisaties konden niet geladen worden.'));
    await expect(laadGroepenlijst()).rejects.toThrow('Je organisaties konden niet geladen worden.');
  });

  it('deelt in met de namen van de organisaties zodra er een teamgroep is', async () => {
    groepen.mockResolvedValue([groep('a', null), groep('t', 'o-1')]);
    organisaties.mockResolvedValue([{ id: 'o-1', naam: 'Acme', rol: 'member' }]);
    const lijst = await laadGroepenlijst();
    expect(lijst.secties?.map((s) => (s.soort === 'werk' ? s.organisatienaam : 'prive'))).toEqual(['prive', 'Acme']);
  });
});
