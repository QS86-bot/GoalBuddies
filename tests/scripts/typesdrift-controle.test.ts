import { describe, expect, it } from 'vitest';

import { kiesBron, ontleed, rapport, vergelijk } from '../../scripts/typesdrift-controle.mjs';

/**
 * De vormtoetsen onder `scripts/typesdrift-controle.mjs` — QS8-541.
 *
 * ⚠️⚠️ **De helft die telt is "wat hij met rust moet laten".** Een controle die
 *    élke overloaded functie als drift meldt, leer je uitzetten — en dat is
 *    geen hypothese: de eerste parser deed het. `activeer_weekplanstap` kwam
 *    eruit als *alleen in de repo* terwijl hij op productie twee overloads
 *    heeft en in béíde bestanden staat. De generator schrijft hem als unie, en
 *    dan draagt de naamregel géén `{`.
 */

/** De drie vormen waarin de generator een naam neerzet. */
const DRIE_VORMEN = `export type Database = {
  public: {
    Tables: {
      goals: {
        Row: {
          id: string
          title: string
        }
      }
    }
    Views: {
      mijn_doelvelden: {
        Row: {
          id: string
        }
      }
    }
    Functions: {
      ai_dag_limiet: { Args: never; Returns: number }
      activeer_weekplanstap:
        | {
            Args: { p_cycle_start_date: string; p_goal_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_cycle_index: number
              p_cycle_start_date: string
            }
            Returns: Json
          }
      schone_naam: {
        Args: { p_ruw: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
`;

describe('ontleed — de vormen die hij moet vinden', () => {
  it('vindt een blok over meer regels', () => {
    expect(ontleed(DRIE_VORMEN).Tables).toEqual(new Set(['goals']));
  });

  it('vindt de eenregelige vorm met Args en Returns op dezelfde regel', () => {
    expect(ontleed(DRIE_VORMEN).Functions.has('ai_dag_limiet')).toBe(true);
  });

  it('⚠️ vindt een overload-unie, waar de naamregel géén accolade draagt', () => {
    // De vorm die de eerste parser miste. Zonder deze toets meldt de controle
    // élke overloaded functie als drift.
    expect(ontleed(DRIE_VORMEN).Functions.has('activeer_weekplanstap')).toBe(true);
  });

  it('houdt de secties uit elkaar', () => {
    const uit = ontleed(DRIE_VORMEN);
    expect(uit.Views).toEqual(new Set(['mijn_doelvelden']));
    expect(uit.Functions).toEqual(
      new Set(['ai_dag_limiet', 'activeer_weekplanstap', 'schone_naam']),
    );
  });
});

describe('ontleed — wat hij met rust moet laten', () => {
  it('pakt een kolomnaam binnen een Row-blok niet op als tabelnaam', () => {
    const uit = ontleed(DRIE_VORMEN);
    expect(uit.Tables.has('id')).toBe(false);
    expect(uit.Tables.has('title')).toBe(false);
    expect(uit.Tables.has('Row')).toBe(false);
  });

  it('pakt een argumentnaam binnen een Args-blok niet op als functienaam', () => {
    const uit = ontleed(DRIE_VORMEN);
    expect(uit.Functions.has('p_cycle_index')).toBe(false);
    expect(uit.Functions.has('Args')).toBe(false);
    expect(uit.Functions.has('Returns')).toBe(false);
  });

  it('pakt niets op uit een Relationships-blok', () => {
    const met = `export type Database = {
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          id: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_goal_id_fkey"
            columns: ["goal_id"]
            referencedRelation: "goals"
          },
        ]
      }
    }
  }
}
`;
    expect(ontleed(met).Tables).toEqual(new Set(['ai_jobs']));
  });

  it('⚠️ telt een naam die ná het einde van een sectie staat niet mee', () => {
    // De grendel die hierop staat is niet dezelfde als de eindanker van de
    // naamregex. 📏 Gemeten bij het bouwen: hem weghalen veranderde niets aan de
    // echte bestanden (51 beide keren), want helperregels als `Row: infer R`
    // dragen tekst ná de dubbele punt en vallen daarom al af. Deze toets voedt
    // de vorm die dát anker níet afvangt: een kale naam op inspringing zes,
    // buiten elke sectie.
    const na = `export type Database = {
  public: {
    Functions: {
      schone_naam: {
        Args: { p_ruw: string }
        Returns: string
      }
    }
      verdwaald:
  }
}
`;
    expect(ontleed(na).Functions).toEqual(new Set(['schone_naam']));
  });

  it('laat de lege-enum-vorm met rust', () => {
    expect(ontleed(DRIE_VORMEN).Enums.size).toBe(0);
  });
});

describe('vergelijk', () => {
  it('meldt niets als beide kanten dezelfde namen dragen', () => {
    expect(vergelijk(DRIE_VORMEN, DRIE_VORMEN).totaal).toBe(0);
  });

  it('meldt een naam die alleen het schema heeft', () => {
    const zonder = DRIE_VORMEN.replace(/      schone_naam: \{\n.*?\n      \}\n/s, '');
    const uit = vergelijk(DRIE_VORMEN, zonder);
    expect(uit.perSectie.Functions?.alleenSchema).toEqual(['schone_naam']);
    expect(uit.perSectie.Functions?.alleenTypes).toEqual([]);
  });

  it('meldt een naam die alleen de types nog hebben — de ketting_schakel-vorm', () => {
    const metRommel = DRIE_VORMEN.replace(
      '      schone_naam: {',
      '      ketting_schakel: { Args: never; Returns: undefined }\n      schone_naam: {',
    );
    const uit = vergelijk(DRIE_VORMEN, metRommel);
    expect(uit.perSectie.Functions?.alleenTypes).toEqual(['ketting_schakel']);
  });

  it('⚠️ meldt een overload-unie níet als drift tegen de eenvoudige vorm', () => {
    // Het bestand in de repo kent één handtekening, de generatie twee. Op
    // náámniveau is dat geen drift — en dit is precies het geval dat de eerste
    // parser wél meldde.
    const enkelvoudig = `export type Database = {
  public: {
    Functions: {
      activeer_weekplanstap: {
        Args: { p_cycle_start_date: string; p_goal_id: string }
        Returns: Json
      }
    }
  }
}
`;
    const uit = vergelijk(DRIE_VORMEN, enkelvoudig);
    expect(uit.perSectie.Functions?.alleenTypes).toEqual([]);
    expect(uit.perSectie.Functions?.alleenSchema).not.toContain('activeer_weekplanstap');
  });
});

describe('kiesBron', () => {
  it('slaat over zonder generatie en zonder token, en noemt de reden', () => {
    const uit = kiesBron({});
    expect(uit.soort).toBe('geen');
    expect(uit.reden).toContain('TYPES_GENERATIE');
  });

  it('slaat over als TYPES_GENERATIE naar een bestand wijst dat er niet is', () => {
    const uit = kiesBron({ TYPES_GENERATIE: '/bestaat/niet/types.ts' });
    expect(uit.soort).toBe('geen');
    expect(uit.reden).toContain('bestaat niet');
  });
});

describe('rapport', () => {
  it('⚠️ zegt bij een productiebron dat hij handwerk niet van drift kan scheiden', () => {
    const uit = vergelijk(DRIE_VORMEN, DRIE_VORMEN);
    const regels = rapport(uit, 'productie (wehgocadxehottiiyvsc)').join('\n');
    expect(regels).toContain('kan vooruitlopend handwerk niet van drift scheiden');
  });

  it('laat die waarschuwing weg bij een bron die het wél kan', () => {
    const uit = vergelijk(DRIE_VORMEN, DRIE_VORMEN);
    const regels = rapport(uit, '/pad/naar/generatie-uit-de-map.ts').join('\n');
    expect(regels).not.toContain('kan vooruitlopend handwerk niet van drift scheiden');
  });
});
