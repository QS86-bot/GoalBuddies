import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaarSql } from '../../scripts/zonder-sql-commentaar.mjs';

import { zonderCommentaar } from './roept-aan';

/**
 * Een gedempte groep belt niet, en directe steun blijft — QS8-752, migratie 0305.
 *
 * ⚠️ **De belofte is een eigenschap van het geheel** (regel 18, vraag 1 en 2):
 *    de tabel, de functie die de meldingenjob aanroept en de job zelf zijn elk
 *    correct, en het zijn de naden ertussen die stil kunnen breken. Drie naden:
 *      1. een latere migratie herdefinieert `te_beoordelen_voor()` en laat de
 *         demping vallen (precies hoe `sleutelzetters()` bijna drie sleutels
 *         verloor, QS8-358);
 *      2. de job krijgt een tweede groepsbron die langs de functie loopt;
 *      3. de directe steun (`approval_received`) krijgt een groepstak en gaat
 *         dus óók uit.
 *
 * Draait zonder database; de gemeten kant staat in `tests/rls/groep-demping.test.ts`.
 */
const ROOT = join(__dirname, '..', '..');
const MIGRATIES = join(ROOT, 'supabase', 'migrations');

function sql(naam: string): string {
  return zonderCommentaarSql(readFileSync(join(MIGRATIES, naam), 'utf8'));
}

const DEMPING = readdirSync(MIGRATIES).find((n) => n.startsWith('0305_'))!;
const JOB = zonderCommentaar(
  readFileSync(join(ROOT, 'supabase', 'functions', 'notificaties', 'index.ts'), 'utf8'),
);

/** Het lichaam van de laatste definitie van een functie, over alle migraties heen. */
function laatsteDefinitie(functie: string): string {
  const bestanden = readdirSync(MIGRATIES)
    .filter((n) => n.endsWith('.sql'))
    .sort();
  let laatste = '';
  for (const naam of bestanden) {
    const tekst = sql(naam);
    const hit = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functie}\\s*\\([\\s\\S]*?\\$\\$;`,
      'gi',
    );
    for (const m of tekst.matchAll(hit)) laatste = m[0];
  }
  return laatste;
}

describe('een gedempte groep belt niet', () => {
  it('de laatste definitie van te_beoordelen_voor() sluit een gedempte groep uit, op de groep van de koppeling', () => {
    const lichaam = laatsteDefinitie('te_beoordelen_voor');
    expect(lichaam, 'geen definitie gevonden').not.toBe('');
    expect(lichaam).toMatch(
      /not\s+exists\s*\(\s*select\s+1\s+from\s+groep_demping\s+\w+\s+where\s+\w+\.user_id\s*=\s*p_user_id\s+and\s+\w+\.group_id\s*=\s*l\.group_id/i,
    );
    // De eis zit in de join en niet achteraf: `l.group_id` is de groep van de
    // koppeling, dus een voltooiing in twee groepen blijft melden zolang er één
    // ongedempte over is.
    expect(lichaam).toMatch(/distinct/i);
  });

  it('de job leest groepen alleen via te_beoordelen_voor() — geen tweede bron die de demping omzeilt', () => {
    expect(JOB).toContain("rpc('te_beoordelen_voor'");
    const groepstabellen = [...JOB.matchAll(/\.from\('(group_members|goal_group_links|chat_messages|groups)'\)/g)].map(
      (m) => m[1],
    );
    // Enige toegestane lezer: `alleenSlapendeGroepen()`, die de nudge onderdrukt en
    // dus niets stuurt. Komt er een tweede, dan moet die langs `groep_demping`.
    expect(groepstabellen).toEqual(['group_members']);
    expect(JOB).not.toMatch(/groep_demping/);
  });

  it('de directe steun heeft geen groepstak: approval_received leest completion_approvals op subject_id', () => {
    const start = JOB.indexOf('async function verseGoedkeuringen');
    const einde = JOB.indexOf('async function', start + 10);
    const lichaam = JOB.slice(start, einde);
    expect(lichaam).toContain("from('completion_approvals')");
    expect(lichaam).toContain(".eq('subject_id', userId)");
    expect(lichaam).not.toMatch(/group_id|group_members|goal_group_links|groep_demping/);
  });
});

describe('de tabel is van de ontvanger en van niemand anders', () => {
  const tekst = sql(DEMPING);

  it('elke policy op groep_demping is user_id = auth.uid() en niets anders (geen groepstak)', () => {
    const policies = [...tekst.matchAll(/create\s+policy\s+groep_demping_\w+[\s\S]*?;/gi)].map((m) => m[0]);
    expect(policies).toHaveLength(4);
    for (const p of policies) {
      const voorwaarden = [...p.matchAll(/(?:using|with check)\s*\(([\s\S]*?)\)\s*(?:with check|;|$)/gi)];
      expect(voorwaarden.length).toBeGreaterThan(0);
      expect(p).toMatch(/user_id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)/i);
      if (!/for\s+select/i.test(p)) expect(p).toMatch(/is_group_member\(\s*group_id\s*\)/i);
      expect(p).not.toMatch(/group_members|shares_group|groups\b/i);
    }
  });

  it('geeft authenticated geen UPDATE en geen schrijfrecht op gedempt_op', () => {
    expect(tekst).not.toMatch(/grant\s+update/i);
    expect(tekst).toMatch(/grant\s+insert\s*\(\s*user_id\s*,\s*group_id\s*\)/i);
    expect(tekst).toMatch(/revoke\s+all\s+on\s+table\s+public\.groep_demping\s+from\s+public,\s*anon,\s*authenticated/i);
  });

  it('is geen kolom op group_members, zet geen systeembericht en komt niet in realtime', () => {
    expect(tekst).not.toMatch(/alter\s+table\s+(public\.)?group_members/i);
    expect(tekst).not.toMatch(/chat_messages|system_event/i);
    expect(tekst).not.toMatch(/replica\s+identity|supabase_realtime/i);
  });

  it('laat vastgelopen_goedkeuringen() ongemoeid: dempen dempt de melding en niet het recht', () => {
    expect(laatsteDefinitie('vastgelopen_goedkeuringen')).not.toMatch(/groep_demping/);
    expect(sql(DEMPING)).not.toMatch(/function\s+(public\.)?vastgelopen_goedkeuringen/i);
  });

  it('eist lidmaatschap in de insert-policy (weigert per rij vóór het schrijven)', () => {
    const insert = sql(DEMPING).match(/create\s+policy\s+groep_demping_insert[\s\S]*?;/i)![0];
    expect(insert).toMatch(/is_group_member\(\s*group_id\s*\)/i);
  });

  it('hangt aan het lidmaatschap met een composite foreign key (niet-lid dempt niet, vertrek haalt de rij weg)', () => {
    expect(tekst).toMatch(
      /foreign\s+key\s*\(\s*group_id\s*,\s*user_id\s*\)\s*references\s+public\.group_members\s*\(\s*group_id\s*,\s*user_id\s*\)\s*on\s+delete\s+cascade/i,
    );
  });
});
