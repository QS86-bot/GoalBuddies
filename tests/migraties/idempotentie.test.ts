import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { argumenttypes, bezwarenIn } from './idempotentie';

const MIGRATIES = join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * ⚠️ **Deze ijking is geen bedenksel.** De vormen hieronder komen uit een echte
 *    meting op 28-08-2026: het schema opgebouwd op een lege database en daarna
 *    élk van de 109 bestanden een tweede keer afgespeeld. Wat toen omviel staat
 *    hieronder onder "vindt", wat bleef staan onder "laat met rust".
 *
 * ⚠️ Een controle die alles meldt, leer je te negeren. De tweede helft weegt
 *    daarom even zwaar als de eerste.
 */
describe('idempotentie van migraties — onwrikbare regel 20', () => {
  describe('leest een functiehandtekening', () => {
    it('uit de vorm van een drop', () => {
      expect(argumenttypes('(uuid, text, text)')).toEqual(['uuid', 'text', 'text']);
    });

    it('uit de vorm van een create, met de namen ervoor', () => {
      expect(argumenttypes('(p_group_id uuid, p_body text)')).toEqual(['uuid', 'text']);
    });

    it('en laat een default buiten beschouwing', () => {
      expect(argumenttypes('(p_id uuid, p_extra jsonb default null)')).toEqual(['uuid', 'jsonb']);
    });

    it('met een lege lijst als de functie geen argumenten heeft', () => {
      expect(argumenttypes('()')).toEqual([]);
    });

    it('en normaliseert aliassen, zodat timestamptz en de lange vorm hetzelfde zijn', () => {
      expect(argumenttypes('(p_op timestamp with time zone)')).toEqual(['timestamptz']);
      expect(argumenttypes('(p_n int)')).toEqual(['integer']);
    });
  });

  describe('vindt wat bij een tweede ronde omvalt', () => {
    it('een create function zonder or replace', () => {
      const b = bezwarenIn('x.sql', 'create function public.f(p_id uuid)\nreturns void language sql as $$ select $$;');
      expect(b).toHaveLength(1);
      expect(b[0]!.soort).toBe('function');
      expect(b[0]!.naam).toBe('f');
    });

    /**
     * ⚠️ **Dit is het geval dat een controle op naam alleen zou doorlaten**, en
     *    het is precies wat 0059 deed: de driearguments-versie droppen en een
     *    versie met zes argumenten aanmaken. Dat is een ándere functie, dus de
     *    drop dekt hem niet — en bij een tweede ronde botst hij.
     */
    it('een create function waarvan de drop ervoor een andere handtekening noemt', () => {
      const sql = [
        'drop function if exists public.f(uuid, text, text);',
        '',
        'create function public.f(',
        '  p_id uuid,',
        '  p_body text,',
        '  p_extra jsonb default null',
        ')',
        'returns void language sql as $$ select $$;',
      ].join('\n');
      const b = bezwarenIn('x.sql', sql);
      expect(b).toHaveLength(1);
      expect(b[0]!.reden).toContain('uuid, text, jsonb');
    });

    it('een create unique index zonder if not exists', () => {
      const b = bezwarenIn('x.sql', 'create unique index mijn_idx\n  on public.t (a, b);');
      expect(b).toHaveLength(1);
      expect(b[0]!.soort).toBe('index');
      expect(b[0]!.naam).toBe('mijn_idx');
    });

    it('een gewone create index zonder if not exists', () => {
      expect(bezwarenIn('x.sql', 'create index mijn_idx on public.t (a);')).toHaveLength(1);
    });

    it('een create table zonder if not exists', () => {
      const b = bezwarenIn('x.sql', 'create table public.t (\n  id uuid primary key\n);');
      expect(b).toHaveLength(1);
      expect(b[0]!.soort).toBe('table');
    });

    it('een create view zonder or replace', () => {
      expect(bezwarenIn('x.sql', 'create view v as select 1;')[0]!.soort).toBe('view');
    });

    it('een create trigger zonder drop ervoor', () => {
      expect(bezwarenIn('x.sql', 'create trigger t_na_iets\n  after insert on public.t\n  for each row execute function f();')[0]!.soort).toBe('trigger');
    });

    it('een create policy zonder drop ervoor', () => {
      expect(bezwarenIn('x.sql', 'create policy t_select on public.t for select using (true);')[0]!.soort).toBe('policy');
    });

    it('een create type zonder drop ervoor', () => {
      expect(bezwarenIn('x.sql', "create type stemming as enum ('goed', 'slecht');")[0]!.soort).toBe('type');
    });
  });

  describe('laat met rust wat wél idempotent is', () => {
    it('create or replace function', () => {
      expect(bezwarenIn('x.sql', 'create or replace function public.f(p_id uuid)\nreturns void language sql as $$ select $$;')).toEqual([]);
    });

    /**
     * ⚠️ **De vorm van `groepschat` in 0059, en die moet mogen.** `create or
     *    replace` kan het returntype niet wijzigen, dus een migratie die de vorm
     *    van een functie verandert móet hem eerst droppen. Zou deze controle dat
     *    melden, dan duwt hij de schrijver naar `or replace` en valt de éérste
     *    ronde om.
     */
    it('create function met een drop ervoor die dezelfde handtekening noemt', () => {
      const sql = [
        'drop function if exists public.groepschat(uuid, timestamptz, uuid, integer);',
        '',
        'create function public.groepschat(',
        '  p_group_id  uuid,',
        '  p_before_at timestamptz default null,',
        '  p_before_id uuid default null,',
        '  p_limit     integer default 30',
        ')',
        'returns table (id uuid) language sql as $$ select null::uuid $$;',
      ].join('\n');
      expect(bezwarenIn('x.sql', sql)).toEqual([]);
    });

    it('create index if not exists', () => {
      expect(bezwarenIn('x.sql', 'create index if not exists mijn_idx on public.t (a);')).toEqual([]);
    });

    it('create table if not exists', () => {
      expect(bezwarenIn('x.sql', 'create table if not exists t (\n  id uuid\n);')).toEqual([]);
    });

    it('create or replace view', () => {
      expect(bezwarenIn('x.sql', 'create or replace view v as select 1;')).toEqual([]);
    });

    it('create trigger en create policy met een drop ervoor', () => {
      const sql = [
        'drop trigger if exists t_na_iets on public.t;',
        'create trigger t_na_iets after insert on public.t for each row execute function f();',
        'drop policy if exists t_select on public.t;',
        'create policy t_select on public.t for select using (true);',
      ].join('\n');
      expect(bezwarenIn('x.sql', sql)).toEqual([]);
    });

    it('een drop zonder schema dekt een create mét schema, en andersom', () => {
      const zonder = 'drop function if exists f(uuid);\ncreate function public.f(p_id uuid) returns void language sql as $$ select $$;';
      const met = 'drop function if exists public.f(uuid);\ncreate function f(p_id uuid) returns void language sql as $$ select $$;';
      expect(bezwarenIn('x.sql', zonder)).toEqual([]);
      expect(bezwarenIn('x.sql', met)).toEqual([]);
    });

    /**
     * ⚠️ Elke migratie draagt zijn rollback-pad in het commentaar in de kop, en
     *    daar staat vaak letterlijk `create function ...` in. 0059 doet dat.
     *    Zou de controle commentaar meelezen, dan meldt hij elk bestand met een
     *    net rollback-pad — en dat is de vorm die je hem leert negeren.
     */
    it('een create die alleen in commentaar staat', () => {
      const sql = [
        '-- Rollback:',
        '--   drop function if exists public.f(uuid, text, text, uuid, uuid, jsonb);',
        '--   create function f(uuid, text, text) ... (versie uit 0025)',
        '--   create unique index mijn_idx on t (a);',
        '',
        'create or replace function public.f(p_id uuid) returns void language sql as $$ select $$;',
      ].join('\n');
      expect(bezwarenIn('x.sql', sql)).toEqual([]);
    });
  });

  /**
   * ⚠️ **Dit is de test die rood wordt bij een nieuwe migratie die de regel
   *    breekt.** Alles hierboven ijkt de heuristiek; dít bewaakt de boom.
   *
   * ⚠️ **En hij bewaakt klasse A, niet klasse B.** Vijf bestanden (0002, 0003,
   *    0008, 0016, 0024) vallen bij een tweede ronde nog steeds om, en dat hóórt:
   *    ze zouden een oudere definitie terugzetten van een object dat een latere
   *    migratie veranderd heeft. Bij `group_visible_streaks` zou dat een
   *    domeinregel-7-besluit terugdraaien. Die fout is de beveiliging; deze
   *    controle mag hem niet wegnemen en meldt hem daarom ook niet.
   */
  it('geen enkele migratie in de boom valt bij een tweede ronde op zichzelf om', () => {
    const bestanden = readdirSync(MIGRATIES).filter((n) => n.endsWith('.sql')).sort();
    expect(bestanden.length).toBeGreaterThan(100);

    const alles = bestanden.flatMap((naam) =>
      bezwarenIn(naam, readFileSync(join(MIGRATIES, naam), 'utf8')),
    );

    expect(alles.map((b) => `${b.bestand}:${b.regel} ${b.reden}`)).toEqual([]);
  });
});
