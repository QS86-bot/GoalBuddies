import { afterEach, describe, expect, it } from 'vitest';

import { freezeNow, unfreezeNow, userCycle, type UserClock } from '../../shared/time';

import { afsluitbareCyclus, huidigeCyclus, inCoulanceperiode } from './cycles';
import { weekdoelSchema } from './weekly-schemas';

/**
 * QS8-45 eist: "geverifieerd met gebruikers op verschillende week-startdagen
 * tegelijk". Dat is de reden dat deze tests met twee klokken naast elkaar
 * werken en niet met één.
 *
 * QS8-51 eist een coulanceperiode van twaalf uur. Die is hier vastgelegd op de
 * grens, want daar gaat het mis — niet in het midden.
 */

afterEach(() => unfreezeNow());

const maandagStarter: UserClock = { weekStartDay: 1, tz: 'Europe/Amsterdam' };
const zondagStarter: UserClock = { weekStartDay: 0, tz: 'Europe/Amsterdam' };

describe('twee gebruikers, verschillende week-startdagen', () => {
  it('zitten op dezelfde dag in een andere cyclus', () => {
    // Woensdag 19 augustus 2026, midden op de dag.
    freezeNow(new Date('2026-08-19T12:00:00Z'));

    const vanMaandag = huidigeCyclus(maandagStarter);
    const vanZondag = huidigeCyclus(zondagStarter);

    expect(vanMaandag.startDate).toBe('2026-08-17');
    expect(vanZondag.startDate).toBe('2026-08-16');
    expect(vanMaandag.startDate).not.toBe(vanZondag.startDate);
  });

  it('krijgen allebei een cyclus van zeven dagen', () => {
    freezeNow(new Date('2026-08-19T12:00:00Z'));

    for (const klok of [maandagStarter, zondagStarter]) {
      const cyclus = huidigeCyclus(klok);
      const dagen =
        (Date.parse(cyclus.endDate) - Date.parse(cyclus.startDate)) / 86_400_000;
      expect(dagen).toBe(6);
    }
  });
});

describe('coulanceperiode van twaalf uur — QS8-51', () => {
  it('laat je maandagochtend nog de vorige week afsluiten', () => {
    // Maandag 17 augustus, 08:00 in Amsterdam (06:00 UTC). De nieuwe cyclus is
    // om middernacht begonnen, dus we zitten 8 uur in de coulanceperiode.
    freezeNow(new Date('2026-08-17T06:00:00Z'));

    expect(inCoulanceperiode(maandagStarter)).toBe(true);
    expect(afsluitbareCyclus(maandagStarter).startDate).toBe('2026-08-10');
    expect(huidigeCyclus(maandagStarter).startDate).toBe('2026-08-17');
  });

  it('sluit het venster na twaalf uur', () => {
    // Maandag 17 augustus, 12:30 in Amsterdam (10:30 UTC): net voorbij.
    freezeNow(new Date('2026-08-17T10:30:00Z'));

    expect(inCoulanceperiode(maandagStarter)).toBe(false);
    expect(afsluitbareCyclus(maandagStarter).startDate).toBe('2026-08-17');
  });

  it('geldt op de eigen week-startdag, niet op maandag voor iedereen', () => {
    // Maandagochtend is voor de zondag-starter gewoon midden in de week: geen
    // coulance, want er is niets omgeslagen.
    freezeNow(new Date('2026-08-17T06:00:00Z'));

    expect(inCoulanceperiode(zondagStarter)).toBe(false);
    expect(afsluitbareCyclus(zondagStarter).startDate).toBe('2026-08-16');
  });
});

describe('rond middernacht in de tijdzone van de gebruiker', () => {
  it('slaat om op lokale middernacht en niet op UTC-middernacht', () => {
    // 23:30 UTC op zondag 16 augustus is in Amsterdam al 01:30 op maandag 17.
    // Voor een maandag-starter is de nieuwe week dus al begonnen.
    freezeNow(new Date('2026-08-16T23:30:00Z'));

    expect(huidigeCyclus(maandagStarter).startDate).toBe('2026-08-17');

    // Voor iemand in Los Angeles is het dan nog zondagmiddag.
    const california: UserClock = { weekStartDay: 1, tz: 'America/Los_Angeles' };
    expect(huidigeCyclus(california).startDate).toBe('2026-08-10');
  });
});

describe('over een DST-overgang heen', () => {
  it('houdt de cyclus zeven kalenderdagen, ook in de week van de wisseling', () => {
    // In 2026 gaat de Europese zomertijd uit in de nacht van 24 op 25 oktober.
    freezeNow(new Date('2026-10-27T12:00:00Z'));

    const cyclus = userCycle(maandagStarter, new Date('2026-10-27T12:00:00Z'));

    expect(cyclus.startDate).toBe('2026-10-26');
    expect(cyclus.endDate).toBe('2026-11-01');

    // De week duurt in klokuren 7 × 24 = 168 uur; alleen in de DST-week wijkt
    // dat af. Die van 19 oktober telt er 169.
    const dstWeek = userCycle(maandagStarter, new Date('2026-10-21T12:00:00Z'));
    const uren = (dstWeek.endsAt.getTime() - dstWeek.startsAt.getTime()) / 3_600_000;
    expect(uren).toBe(169);
  });
});

describe('weekdoelSchema', () => {
  const geldig = {
    goal_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    milestone_id: null,
    title: 'Drie keer hardlopen',
    floor_text: 'Eén keer, al is het twintig minuten',
    ceiling_text: 'Drie keer, minstens vijf kilometer',
  };

  it('accepteert een weekdoel met vloer en plafond', () => {
    expect(weekdoelSchema.safeParse(geldig).success).toBe(true);
  });

  it('accepteert een weekdoel zónder vloer', () => {
    // De vloer is optioneel gebleven bij de review van 15-08-2026. Verplicht
    // stellen levert ingevulde onzin op.
    expect(weekdoelSchema.safeParse({ ...geldig, floor_text: null }).success).toBe(true);
  });

  it('kent geen cycle_start_date', () => {
    // ⚠️ De belangrijkste eigenschap van dit schema. Zou de client de cyclus
    //    mogen meesturen, dan bepaalt een formulier wat "deze week" is in plaats
    //    van shared/time.
    expect(Object.keys(weekdoelSchema.shape)).not.toContain('cycle_start_date');
    expect(Object.keys(weekdoelSchema.shape)).not.toContain('cycle_index');
  });

  it('weigert een doel-id dat geen uuid is', () => {
    expect(weekdoelSchema.safeParse({ ...geldig, goal_id: 'mijn-doel' }).success).toBe(false);
  });
});
