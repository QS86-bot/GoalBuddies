import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `edge-tijd.test.ts`.
import {
  bucketsIn,
  controleer,
  policyBucketsIn,
  uploadsIn,
} from '../../scripts/storage-controle.mjs';

/**
 * De ijking van `npm run storage:controle`.
 *
 * ⚠️ **Deze controle is vandaag groen omdat er niets is** — nul buckets, nul
 *    uploads. Dat is precies het soort groen waar dit project voor waarschuwt:
 *    een controle die nog nooit rood is geweest, is een aanname. Hij is daarom
 *    hier gevoed met elke vorm die hij moet vinden én met de vormen die hij met
 *    rust moet laten.
 */

const LEEG = { sql: '', prodBron: '' };

describe('wat de controle moet vinden', () => {
  it('een bucket zonder policy op storage.objects', () => {
    const sql = "insert into storage.buckets (id, name) values ('bijlagen', 'bijlagen');";

    expect(controleer({ ...LEEG, sql }).zonderPolicy).toEqual(['bijlagen']);
  });

  it('een openbare bucket, ook mét policy', () => {
    // ⚠️ `public = true` zet RLS op storage.objects buitenspel voor het lezen:
    //    wie de URL heeft, heeft het bestand. Een policy erbij verandert dat
    //    niet, dus dit moet apart gemeld worden en niet wegvallen tegen de eerste
    //    controle.
    const sql = [
      "insert into storage.buckets (id, name, public) values ('bijlagen', 'bijlagen', true);",
      "create policy leesbaar on storage.objects for select using (bucket_id = 'bijlagen');",
    ].join('\n');

    const uitkomst = controleer({ ...LEEG, sql });
    expect(uitkomst.zonderPolicy).toEqual([]);
    expect(uitkomst.openbaar).toEqual(['bijlagen']);
  });

  it('code die uploadt naar een bucket die geen migratie aanmaakt', () => {
    // ⚠️ De volgorde uit de bevinding: eerst de uploadknop, dan een bucket die
    //    ergens in een dashboard ontstaat.
    const prodBron = "await supabase().storage.from('bijlagen').upload(pad, bestand);";

    expect(controleer({ sql: '', prodBron }).zonderBucket).toEqual(['bijlagen']);
  });

  it('een bucket die met de helper wordt gemaakt telt ook mee', () => {
    const sql = "select storage.create_bucket('avatars');";

    expect(controleer({ ...LEEG, sql }).zonderPolicy).toEqual(['avatars']);
  });
});

describe('wat hij met rust moet laten', () => {
  it('een bucket mét policy en niet openbaar', () => {
    const sql = [
      "insert into storage.buckets (id, name, public) values ('bijlagen', 'bijlagen', false);",
      'create policy bijlagen_select on storage.objects',
      "  for select to authenticated using (bucket_id = 'bijlagen' and is_group_member(...));",
    ].join('\n');

    const uitkomst = controleer({ ...LEEG, sql });
    expect(uitkomst.zonderPolicy).toEqual([]);
    expect(uitkomst.openbaar).toEqual([]);
  });

  it('een upload naar een bucket die wél in een migratie staat', () => {
    const sql = [
      "insert into storage.buckets (id, name) values ('bijlagen', 'bijlagen');",
      "create policy p on storage.objects for select using (bucket_id = 'bijlagen');",
    ].join('\n');
    const prodBron = "supabase().storage.from('bijlagen').download(pad)";

    expect(controleer({ sql, prodBron }).zonderBucket).toEqual([]);
  });

  it('een policy op een gewone tabel is geen storage-policy', () => {
    // ⚠️ Zou `on storage.objects` te los gematcht worden, dan zou élke policy in
    //    dit project bucketnamen "noemen" en zou de eerste controle nooit meer
    //    afgaan.
    const sql = "create policy chat_select on public.chat_messages for select using (x = 'bijlagen');";

    expect(policyBucketsIn(sql).has('bijlagen')).toBe(false);
  });

  it('de lege wereld van vandaag', () => {
    const uitkomst = controleer(LEEG);

    expect(uitkomst.buckets.size).toBe(0);
    expect(uitkomst.zonderPolicy).toEqual([]);
    expect(uitkomst.zonderBucket).toEqual([]);
  });

  it('een kolomnaam die toevallig storage heet, is geen upload', () => {
    const prodBron = "const storage = { from: (x: string) => x };\nstorage.from('nep');";

    expect(uploadsIn(prodBron).size).toBe(0);
  });
});

describe('de onderdelen los', () => {
  it('leest de openbaar-vlag uit de insert', () => {
    const open = bucketsIn("insert into storage.buckets (id, name, public) values ('a','a',true);");
    const dicht = bucketsIn("insert into storage.buckets (id, name, public) values ('b','b',false);");

    expect(open.get('a')?.openbaar).toBe(true);
    expect(dicht.get('b')?.openbaar).toBe(false);
  });
});
