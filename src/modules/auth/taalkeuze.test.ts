import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, TALEN, taalNaam, zetTaal } from '../../shared/i18n';

import { profielPatchSchema } from './schemas';

/**
 * De taalkeuze — QS8-115, criterium 4.
 *
 * ⚠️ **Deze tests staan op de náden en niet op de onderdelen** (onwrikbare regel
 *    18). Elk stuk van deze keten was al af en werkte: de kolom bestond sinds
 *    migratie 0061, `ProfielProvider` las hem, `t()` vertaalde. Wat ontbrak was
 *    het schrijfpad — en juist dáár breekt het, omdat elk onderdeel op zichzelf
 *    groen blijft.
 */

const wortel = join(import.meta.dirname, '..', '..', '..');

function lees(pad: string): string {
  return readFileSync(join(wortel, pad), 'utf8');
}

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('de talenlijst en de database zeggen hetzelfde', () => {
  /**
   * ⚠️ **Twee kopieën van dezelfde allowlist**, precies het patroon dat CLAUDE.md
   *    bij `chat_messages_system_event_bekend` beschrijft: `TALEN` in TypeScript
   *    en de CHECK `profiles_locale_bekend` in migratie 0061. Loopt er één voor,
   *    dan biedt de keuzelijst een taal aan die de database weigert — en dat is
   *    geen ontbrekende vertaling maar een storingsmelding op een knop die er
   *    prima uitziet.
   *
   *    Een taal toevoegen is dus altijd óók een migratie. Deze test wordt rood
   *    als je dat vergeet, en dat is de bedoeling.
   */
  it('heeft in de CHECK dezelfde talen als TALEN', () => {
    const migratie = lees('supabase/migrations/0061_taal_in_het_profiel.sql');

    const check = /check \(locale is null or locale in \(([^)]+)\)\)/.exec(migratie);
    expect(check, 'de CHECK profiles_locale_bekend is niet meer te vinden').not.toBeNull();

    const inDeDatabase = (check?.[1] ?? '')
      .split(',')
      .map((deel) => deel.trim().replace(/'/g, ''))
      .sort();

    expect(inDeDatabase).toEqual([...TALEN].sort());
  });
});

describe('het profielschema laat de taal door', () => {
  /**
   * ⚠️ `updateProfiel()` zet veld voor veld over in de update, en dat heeft een
   *    blinde vlek: vergeet je één regel, dan valideert het schema nog steeds,
   *    slaagt de aanroep nog steeds, en schrijft hij niets. Er is geen fout te
   *    zien — de gebruiker klikt op Engels en er gebeurt niets.
   */
  it('neemt locale mee in de update van updateProfiel', () => {
    const bron = lees('src/modules/auth/profile.ts');
    expect(bron).toContain('update.locale = velden.locale');
  });

  it('accepteert elke taal uit TALEN', () => {
    for (const taal of TALEN) {
      expect(profielPatchSchema.safeParse({ locale: taal }).success, taal).toBe(true);
    }
  });

  /**
   * ⚠️ NULL betekent "nog niet gekozen" en niet "Nederlands" — migratie 0061.
   *    Bij NULL volgt de app het apparaat; zodra er een waarde staat overstemt
   *    die keuze het apparaat. Zou het schema `null` weigeren, dan is er geen weg
   *    terug naar "volg mijn telefoon".
   */
  it('accepteert null als "nog niet gekozen"', () => {
    expect(profielPatchSchema.safeParse({ locale: null }).success).toBe(true);
  });

  it('weigert een taal die de app niet kent', () => {
    expect(profielPatchSchema.safeParse({ locale: 'de' }).success).toBe(false);
  });
});

describe('de taalnamen staan in hun eigen taal', () => {
  /**
   * ⚠️ Dit is de uitweg voor wie de app per ongeluk op een taal zet die hij niet
   *    leest. Stond de lijst in de huidige taal, dan zoekt een Nederlander in een
   *    Engelse app naar "Dutch" — en dat woord kent hij misschien niet eens.
   *    `taalNaam('nl')` hoort dus "Nederlands" te geven, ongeacht wat er
   *    ingesteld staat.
   */
  it('geeft dezelfde naam ongeacht de ingestelde taal', () => {
    zetTaal('nl');
    const inHetNederlands = TALEN.map(taalNaam);

    zetTaal('en');
    expect(TALEN.map(taalNaam)).toEqual(inHetNederlands);
  });

  it('schrijft elke taal in zichzelf en met een hoofdletter', () => {
    expect(taalNaam('nl')).toBe('Nederlands');
    expect(taalNaam('en')).toBe('English');
  });
});

describe('het profielscherm biedt de keuze aan', () => {
  /**
   * ⚠️ Zonder dit blok is de hele keten dood hout: de kolom, de policy, de
   *    kolomgrant en de catalogus staan er, en niemand kan er ooit bij. Dat was
   *    de stand tot 24-08-2026.
   */
  it('rendert de TaalKeuze en slaat hem op', () => {
    const scherm = lees('app/(tabs)/profiel.tsx');

    expect(scherm).toContain('<TaalKeuze');
    expect(scherm).toContain('updateProfiel(userId, { locale: nieuw })');

    // ⚠️ De opslag alléén is niet genoeg: de catalogus is procesbreed en geen
    //    React-context, dus zonder `zetTaal()` verandert er niets op het scherm
    //    tot de app herstart.
    expect(scherm).toContain('zetTaal(nieuw)');
  });
});
