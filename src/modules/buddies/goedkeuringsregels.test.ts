import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  GOEDKEURINGSREGELS,
  goedkeuringsregelLabels,
  goedkeuringsregelUitleg,
  groepPatchSchema,
  leesGoedkeuringsregel,
  QUORUM_MAX,
  QUORUM_MIN,
} from './schemas';

/**
 * De goedkeuringsregel per groep — QS8-65 (PRD 6.4).
 *
 * ⚠️ **De eerste twee tests lezen de migratie en niet de app.** Dat is de les van
 *    migratie 0032/0034: daar vergeleek de test `SYSTEEM_GEBEURTENISSEN` met
 *    zichzelf, de CHECK kreeg er een waarde bij, de app bleef op acht staan, en
 *    er werd niets rood. Een lijst in TypeScript naast een CHECK in SQL is een
 *    naad, en een naad toets je door allebei de kanten op te halen.
 */

const MIGRATIE = fileURLToPath(
  new URL('../../../supabase/migrations/0111_goedkeuring_met_een_drempel.sql', import.meta.url),
);

/** De waarden uit `groups_approval_rule_valid`, zoals de migratie ze schrijft. */
export function regelsUitDeCheck(sql: string): readonly string[] {
  const blok = /constraint groups_approval_rule_valid\s*\n?\s*check \(approval_rule in \(([^)]*)\)\)/.exec(
    sql,
  );
  const binnenkant = blok?.[1];
  if (binnenkant === undefined) return [];

  return [...binnenkant.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

/** De grenzen uit `groups_approval_quorum_bereik`. */
export function quorumgrenzenUitDeCheck(sql: string): readonly [number, number] | null {
  const blok = /check \(approval_quorum is null or approval_quorum between (\d+) and (\d+)\)/.exec(
    sql,
  );
  if (blok === null) return null;

  return [Number(blok[1]), Number(blok[2])];
}

describe('regelsUitDeCheck', () => {
  it('leest de waarden uit een CHECK', () => {
    const sql =
      "alter table public.groups add constraint groups_approval_rule_valid\n" +
      "  check (approval_rule in ('any', 'majority', 'quorum'));";
    expect(regelsUitDeCheck(sql)).toEqual(['any', 'majority', 'quorum']);
  });

  it('geeft niets terug als de constraint er niet is', () => {
    expect(regelsUitDeCheck('select 1;')).toEqual([]);
  });

  it('laat een ándere constraint met rust', () => {
    const sql = "check (evidence_policy in ('note_required', 'optional'));";
    expect(regelsUitDeCheck(sql)).toEqual([]);
  });
});

describe('de app en de database kennen dezelfde regels', () => {
  const sql = readFileSync(MIGRATIE, 'utf8');

  it('heeft precies de waarden die de CHECK toestaat', () => {
    // ⚠️ Wordt deze rood, verruim dan niet blind de lijst in `schemas.ts`. Een
    //    vierde regel is een productbesluit, en het scherm moet hem ook kunnen
    //    uitleggen — zie de twee tests over labels hieronder.
    expect([...GOEDKEURINGSREGELS].sort()).toEqual([...regelsUitDeCheck(sql)].sort());
  });

  it('houdt dezelfde quorumgrenzen aan als de database', () => {
    // Zou de app een ruimer bereik toestaan, dan is de foutmelding die de
    // gebruiker krijgt een Postgres-weigering in plaats van een zin.
    expect(quorumgrenzenUitDeCheck(sql)).toEqual([QUORUM_MIN, QUORUM_MAX]);
  });
});

describe('leesGoedkeuringsregel', () => {
  it('herkent de drie regels', () => {
    expect(leesGoedkeuringsregel('any')).toBe('any');
    expect(leesGoedkeuringsregel('majority')).toBe('majority');
    expect(leesGoedkeuringsregel('quorum')).toBe('quorum');
  });

  /**
   * ⚠️ Onbekend is `any`, en dat is hier de kant die niets kapotmaakt. De
   *    database past de échte regel toe; dit scherm vertelt hem alleen na. Zou
   *    onbekend als `majority` lezen, dan toont het scherm een drempel die er
   *    niet is.
   */
  it('leest een onbekende waarde als de standaard', () => {
    expect(leesGoedkeuringsregel(null)).toBe('any');
    expect(leesGoedkeuringsregel(undefined)).toBe('any');
    expect(leesGoedkeuringsregel('')).toBe('any');
    expect(leesGoedkeuringsregel('unanimous')).toBe('any');
    expect(leesGoedkeuringsregel(3)).toBe('any');
  });
});

describe('elke regel heeft een label en een uitleg', () => {
  it('laat er geen leeg', () => {
    // Een keuzelijst met een lege optie is een keuze die niemand kan maken.
    for (const regel of GOEDKEURINGSREGELS) {
      expect(goedkeuringsregelLabels()[regel].length, regel).toBeGreaterThan(0);
      expect(goedkeuringsregelUitleg()[regel].length, regel).toBeGreaterThan(0);
    }
  });

  it('geeft elke regel een eigen uitleg', () => {
    // Twee regels met dezelfde zin is een copy-paste, en dan legt de app het
    // verschil niet uit dat de gebruiker juist moet begrijpen.
    const zinnen = GOEDKEURINGSREGELS.map((r) => goedkeuringsregelUitleg()[r]);
    expect(new Set(zinnen).size).toBe(GOEDKEURINGSREGELS.length);
  });
});

describe('groepPatchSchema — het quorum hoort bij precies één regel', () => {
  it('accepteert een quorum bij de quorumregel', () => {
    const uit = groepPatchSchema.safeParse({ approval_rule: 'quorum', approval_quorum: 3 });
    expect(uit.success).toBe(true);
  });

  /**
   * ⚠️ Dit is de CHECK `groups_quorum_bij_regel`, een laag eerder. De database
   *    weigert het ook — maar met een Postgres-melding, en `api.ts` laat
   *    servertekst nooit door tot het scherm. Dan zou de gebruiker "opslaan
   *    mislukt" lezen zonder te weten wát er mis is.
   */
  it('weigert de quorumregel zonder getal', () => {
    expect(groepPatchSchema.safeParse({ approval_rule: 'quorum' }).success).toBe(false);
  });

  it('weigert een getal bij een regel die er niet om vraagt', () => {
    expect(
      groepPatchSchema.safeParse({ approval_rule: 'majority', approval_quorum: 3 }).success,
    ).toBe(false);
    expect(groepPatchSchema.safeParse({ approval_rule: 'any', approval_quorum: 2 }).success).toBe(
      false,
    );
  });

  it('staat toe dat een quorum wordt geleegd bij het terugschakelen', () => {
    // `null` is "haal weg" en `undefined` is "laat staan". Zonder dat verschil
    // kan een groep nooit terug naar `any`: de CHECK eist dan dat het getal weg is.
    expect(
      groepPatchSchema.safeParse({ approval_rule: 'any', approval_quorum: null }).success,
    ).toBe(true);
  });

  it('houdt het quorum binnen de grenzen van de database', () => {
    expect(
      groepPatchSchema.safeParse({ approval_rule: 'quorum', approval_quorum: QUORUM_MIN - 1 })
        .success,
    ).toBe(false);
    expect(
      groepPatchSchema.safeParse({ approval_rule: 'quorum', approval_quorum: QUORUM_MAX + 1 })
        .success,
    ).toBe(false);
    expect(
      groepPatchSchema.safeParse({ approval_rule: 'quorum', approval_quorum: 2.5 }).success,
    ).toBe(false);
  });

  it('laat een patch zonder goedkeuringsvelden ongemoeid', () => {
    // De regel is optioneel: wie alleen de naam wijzigt, hoort er niets over te
    // hoeven zeggen.
    expect(groepPatchSchema.safeParse({ name: 'Nieuwe naam' }).success).toBe(true);
  });
});
