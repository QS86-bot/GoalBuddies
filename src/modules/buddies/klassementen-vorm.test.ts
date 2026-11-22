import { describe, expect, it } from 'vitest';

import {
  groepeerKlassementen,
  naarKlassementenRij,
  toonAlleLeden,
  uniekeKaarten,
  type KlassementenRij,
} from './klassementen-vorm';

/**
 * De vorm van "Alle klassementen" — QS8-666 (A57b), deel 3c-ui, fase A. Fixtures, geen database.
 *
 * ⚠️ **De belofte is dat de plek uit de database komt en nergens in de client wordt uitgerekend.** Een gelijke stand over de grens van
 *    vijf heen laat twee leden op dezelfde plek staan; `index + 1` zou daar een slechtere plek verzinnen. Daarom toetst dit bestand
 *    de positie bij een gelijke stand en dat een zesde rij alleen de eigen regel kan zijn.
 *
 * IJKING (met de hand, 22-11-2026): in `groepeerKlassementen` `positie` vervangen door `index + 1` -> 'neemt de plek uit de data over' valt om;
 * de controle `zesde.userId === mijnId` weghalen -> 'een zesde rij van een ander is geen eigen regel' valt om.
 */
const rij = (groupId: string, userId: string, punten: number, positie: number, ledental = 8, naam = userId): KlassementenRij => ({
  groupId,
  groepnaam: `Groep ${groupId}`,
  userId,
  naam,
  punten,
  positie,
  ledental,
  totaalGroepen: 2,
});

describe('naarKlassementenRij', () => {
  const ruw = { group_id: 'g', group_name: 'Hardloop', user_id: 'u', display_name: 'Anna', punten: 4, positie: 2, total_members: 6, total_groups: 3 };

  it('zet een volledige rij om', () => {
    expect(naarKlassementenRij(ruw)).toEqual({ groupId: 'g', groepnaam: 'Hardloop', userId: 'u', naam: 'Anna', punten: 4, positie: 2, ledental: 6, totaalGroepen: 3 });
  });

  it.each(['group_id', 'user_id', 'punten', 'positie'] as const)('geeft null als %s ontbreekt of het verkeerde type heeft', (sleutel) => {
    expect(naarKlassementenRij({ ...ruw, [sleutel]: null })).toBeNull();
  });

  it('vult een ontbrekende naam aan met leeg', () => {
    expect(naarKlassementenRij({ ...ruw, display_name: null, group_name: null })).toMatchObject({ naam: '', groepnaam: '' });
  });
});

describe('groepeerKlassementen', () => {
  it('geeft niets voor niets', () => {
    expect(groepeerKlassementen([], 'ik')).toEqual([]);
  });

  it('neemt de plek uit de data over, ook bij een gelijke stand over de grens van vijf heen', () => {
    // Posities 1, 2, 3, 4, 4 voor de bovenste vijf, en de kijker is de zesde rij met ook positie 4: gelijk met nummer 4 en 5.
    const kaarten = groepeerKlassementen(
      [rij('g', 'a', 9, 1), rij('g', 'b', 8, 2), rij('g', 'c', 7, 3), rij('g', 'd', 6, 4), rij('g', 'e', 6, 4), rij('g', 'ik', 6, 4)],
      'ik',
    );
    expect(kaarten).toHaveLength(1);
    expect(kaarten[0]?.eigen).toMatchObject({ userId: 'ik', positie: 4, jij: true });
    expect(kaarten[0]?.bovenste.map((r) => r.positie)).toEqual([1, 2, 3, 4, 4]);
  });

  it('staat de kijker bij de bovenste vijf, dan is er geen eigen regel en is zijn regel gemarkeerd', () => {
    const kaarten = groepeerKlassementen([rij('g', 'a', 9, 1), rij('g', 'ik', 8, 2), rij('g', 'c', 7, 3)], 'ik');
    expect(kaarten[0]?.eigen).toBeNull();
    expect(kaarten[0]?.bovenste.map((r) => r.jij)).toEqual([false, true, false]);
  });

  it('een zesde rij van een ander is geen eigen regel', () => {
    const rijen = ['a', 'b', 'c', 'd', 'e', 'f'].map((u, i) => rij('g', u, 10 - i, i + 1));
    expect(groepeerKlassementen(rijen, 'ik')[0]?.eigen).toBeNull();
  });

  it('houdt de volgorde van de groepen aan zoals de RPC ze gaf, en sorteert niet opnieuw', () => {
    const kaarten = groepeerKlassementen([rij('z', 'a', 1, 1), rij('z', 'ik', 0, 2), rij('a', 'ik', 99, 1)], 'ik');
    expect(kaarten.map((k) => k.groupId)).toEqual(['z', 'a']);
  });

  it('markeert een groep waar iedereen op nul staat', () => {
    const kaarten = groepeerKlassementen([rij('g', 'a', 0, 1), rij('g', 'ik', 0, 1)], 'ik');
    expect(kaarten[0]?.iedereenOpNul).toBe(true);
  });
});

describe('uniekeKaarten', () => {
  it('laat de eerste van een dubbele groep staan', () => {
    const een = groepeerKlassementen([rij('g', 'a', 1, 1)], 'ik');
    const twee = groepeerKlassementen([rij('g', 'a', 5, 1), rij('h', 'a', 1, 1)], 'ik');
    const samen = uniekeKaarten([...een, ...twee]);
    expect(samen.map((k) => k.groupId)).toEqual(['g', 'h']);
    expect(samen[0]?.bovenste[0]?.punten).toBe(1);
  });
});

describe('toonAlleLeden', () => {
  it('niet als iedereen al op de kaart staat', () => {
    const kaart = groepeerKlassementen([rij('g', 'a', 3, 1, 3), rij('g', 'b', 2, 2, 3), rij('g', 'ik', 1, 3, 3)], 'ik')[0];
    expect(kaart && toonAlleLeden(kaart)).toBe(false);
  });

  it('wel als er meer leden zijn dan de kaart toont, en de eigen regel telt mee', () => {
    const rijen = ['a', 'b', 'c', 'd', 'e'].map((u, i) => rij('g', u, 9 - i, i + 1, 8)).concat(rij('g', 'ik', 1, 8, 8));
    const kaart = groepeerKlassementen(rijen, 'ik')[0];
    expect(kaart?.eigen).not.toBeNull();
    expect(kaart && toonAlleLeden(kaart)).toBe(true);
    const klein = groepeerKlassementen(['a', 'b', 'c', 'd', 'e'].map((u, i) => rij('g', u, 9 - i, i + 1, 6)).concat(rij('g', 'ik', 1, 6, 6)), 'ik')[0];
    expect(klein && toonAlleLeden(klein)).toBe(false);
  });
});
