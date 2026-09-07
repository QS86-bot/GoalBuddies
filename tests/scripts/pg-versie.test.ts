import { describe, expect, it } from 'vitest';

import {
  majorUit,
  oordeel,
  PG_MAJOR_GEMETEN_OP,
  PG_MAJOR_PRODUCTIE,
} from '../../scripts/pg-versie.mjs';

/**
 * De zuivere helft van `pgversie:controle` — QS8-177.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken** (CLAUDE.md,
 *    regel 18). De helft die hem met rúst moet laten staat er daarom bij: een
 *    versiecontrole die op de verkeerde vorm aanslaat, meldt op de ene machine
 *    iets anders dan op de andere, en dat is precies wat hij moest voorkomen.
 */

describe('majorUit — de vormen die hij moet lezen', () => {
  const GOED = [
    { naam: 'productie vandaag', nummer: '170006', major: 17 },
    { naam: 'de lokale stack vandaag', nummer: '160013', major: 16 },
    { naam: 'een kale major', nummer: '180000', major: 18 },
    { naam: 'met witruimte, zoals psql -At hem geeft', nummer: ' 170006\n', major: 17 },
    { naam: 'als getal in plaats van tekst', nummer: 170006, major: 17 },
  ];

  it.each(GOED)('$naam → $major', ({ nummer, major }) => {
    expect(majorUit(nummer)).toBe(major);
  });
});

describe('majorUit — de vormen die hij niet moet raden', () => {
  const FOUT = [
    {
      naam: 'de tekst uit version()',
      // ⚠️ Dit is de reden dat deze controle het númmer leest en niet `version()`.
      //    Die tekst verschilt per distributie en per build; een regex erop vindt
      //    op de ene machine iets anders dan op de andere.
      nummer: 'PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) on x86_64',
    },
    { naam: 'een leeg antwoord', nummer: '' },
    { naam: 'niets', nummer: null },
    { naam: 'een foutmelding', nummer: 'could not connect to server' },
    {
      naam: 'het oude 9.x-schema',
      // 90623 is Postgres 9.6.23 en telt in een ander stelsel. Supabase zit al
      // jaren boven 15; hier "9" van maken zou een verkeerd antwoord zijn dat
      // eruitziet als een goed antwoord.
      nummer: '90623',
    },
  ];

  it.each(FOUT)('$naam → null', ({ nummer }) => {
    expect(majorUit(nummer)).toBeNull();
  });
});

describe('oordeel — wat de controle ervan vindt', () => {
  it('gelijke majors zijn groen', () => {
    const uit = oordeel({ lokaal: 17, productie: 17 });
    expect(uit.soort).toBe('gelijk');
    expect(uit.melding).toContain('17');
  });

  it('een verschil noemt beide getallen', () => {
    // ⚠️ Beide, en niet alleen "ongelijk". Een melding waaruit je niet kunt
    //    aflezen wát je moet installeren, kost een zoektocht per keer.
    const uit = oordeel({ lokaal: 16, productie: 17 });
    expect(uit.soort).toBe('ongelijk');
    expect(uit.melding).toContain('16');
    expect(uit.melding).toContain('17');
    expect(uit.melding).toContain(PG_MAJOR_GEMETEN_OP);
  });

  it('een onleesbare meting is niet stilzwijgend gelijk', () => {
    // ⚠️ Dit is het geval dat een naïeve controle groen laat: geen getal, dus
    //    geen verschil, dus "in orde". Het is geen versieverschil maar een
    //    kapotte meting, en die hoort niet als bewijs te tellen.
    expect(oordeel({ lokaal: null, productie: 17 }).soort).toBe('onleesbaar');
  });
});

describe('de pin op productie', () => {
  it('draagt een datum, want een gepind getal zonder datum verjaart ongemerkt', () => {
    expect(PG_MAJOR_PRODUCTIE).toBeGreaterThanOrEqual(15);
    expect(PG_MAJOR_GEMETEN_OP).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
