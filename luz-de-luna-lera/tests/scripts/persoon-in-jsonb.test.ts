import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `tekst-controle.test.ts`.
import {
  RECHTGEZET,
  bewaardeTreffers,
  isRechtgezet,
  treffersIn,
} from '../../scripts/persoon-in-jsonb-controle.mjs';

/**
 * De ijking van `npm run persoon:controle`.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken** — en dat is in
 *    dit project geen stelregel maar een geleerde les. `tekst:controle` meldde
 *    maandenlang nul terwijl er zeven onvertaalde zinnen in één scherm stonden;
 *    de heuristieken waren niet slecht, ze waren nooit tegen een bekend geval
 *    gelegd.
 *
 * ⚠️ **De tweede helft is even belangrijk als de eerste.** Een controle die alles
 *    meldt, leert je hem te negeren. `group_id` en `request_id` staan hieronder
 *    juist als vormen die met rust gelaten moeten worden.
 */

describe('wat de controle moet vinden', () => {
  it('een sleutel die op _by eindigt', () => {
    const sql = `insert into goal_events (goal_id, new_value)
      values (g.id, jsonb_build_object('approved_by', auth.uid()));`;

    expect(bewaardeTreffers(sql)).toHaveLength(1);
  });

  it('auth.uid() onder een sleutel die niet op _by eindigt', () => {
    const sql = `insert into events (payload)
      values (jsonb_build_object('wie', auth.uid()));`;

    expect(bewaardeTreffers(sql)).toHaveLength(1);
  });

  it('een kolom die een mens aanwijst', () => {
    const sql = `insert into events (payload)
      values (jsonb_build_object('betrokkene', r.requester_id));`;

    expect(bewaardeTreffers(sql)).toHaveLength(1);
  });

  it('subject_id en actor_id, want 0059 gaf die juist een eigen kolom', () => {
    const sql = `insert into events (payload)
      values (jsonb_build_object('over', m.subject_id, 'door', m.actor_id));`;

    expect(bewaardeTreffers(sql)).toHaveLength(2);
  });

  it('een treffer die achter andere argumenten met haakjes staat', () => {
    // ⚠️ De reden dat er haakjes geteld worden in plaats van een reguliere
    //    expressie: `coalesce(...)` hiervóór zou een naïeve toets laten stoppen.
    const sql = `insert into events (payload)
      values (jsonb_build_object('naam', coalesce(p.display_name, 'x'), 'wie', auth.uid()));`;

    expect(bewaardeTreffers(sql)).toHaveLength(1);
  });

  it('een treffer in een update, niet alleen in een insert', () => {
    const sql = `update events set payload = jsonb_build_object('wie', auth.uid()) where id = x;`;

    expect(bewaardeTreffers(sql)).toHaveLength(1);
  });

  it('een treffer met een tekst met een apostrof ervoor', () => {
    const sql = `insert into events (payload)
      values (jsonb_build_object('reden', 'het''s zo', 'wie', auth.uid()));`;

    expect(bewaardeTreffers(sql)).toHaveLength(1);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een group_id, want een groep is geen persoon', () => {
    const sql = `insert into commitment_events (payload)
      values (jsonb_build_object('bereik', 'doelgroepen', 'group_id', c.beneficiary_group_id));`;

    expect(bewaardeTreffers(sql)).toEqual([]);
  });

  it('een request_id en een goal_id', () => {
    const sql = `insert into goal_events (new_value)
      values (jsonb_build_object('target_date', r.new_date, 'request_id', r.id));`;

    expect(bewaardeTreffers(sql)).toEqual([]);
  });

  it('een antwoord dat teruggegeven en niet bewaard wordt', () => {
    // ⚠️ Dit is de vorm die er honderden keren staat: elke RPC geeft zo zijn
    //    uitkomst terug. Meldde de controle die ook, dan verdween de ene die
    //    ertoe doet in de ruis.
    const sql = `return jsonb_build_object('ok', true, 'wie', auth.uid());`;

    expect(bewaardeTreffers(sql)).toEqual([]);
  });

  it('getallen en redencodes, zoals goal_risk.reason', () => {
    const sql = `insert into goal_risk (reason)
      values (jsonb_build_object('reden', 'niet_actief', 'tempo', v_tempo));`;

    expect(bewaardeTreffers(sql)).toEqual([]);
  });

  it('een regel die uitgecommentarieerd is', () => {
    const sql = `-- insert into events (payload) values (jsonb_build_object('wie', auth.uid()));`;

    expect(bewaardeTreffers(sql)).toEqual([]);
  });

  it('een zichtbaarheidswaarde, zoals group_events', () => {
    const sql = `insert into group_events (old_value, new_value)
      values (jsonb_build_object('zichtbaarheid', v_oud), jsonb_build_object('zichtbaarheid', p_naar));`;

    expect(bewaardeTreffers(sql)).toEqual([]);
  });
});

describe('de lijst met rechtgezette vondsten', () => {
  /**
   * ⚠️ Zonder deze test is `RECHTGEZET` een prullenbak: dan verdwijnt er een
   *    echte bevinding in zodra iemand hem lastig vindt. Mét deze test is elke
   *    regel een verwijzing die je kunt nalopen.
   */
  it('noemt bij elke regel de migratie die hem rechtzette', () => {
    // ⚠️ In dit project is de lijst leeg tot de eerste vondst. De vorm van elke
    //    regel wordt hier al bewaakt, zodat de eerste regel meteen goed is.
    for (const regel of RECHTGEZET) {
      expect(regel.door, `${regel.bestand} / ${regel.sleutel}`).toMatch(/^\d{4}[a-z]?_.+\.sql$/);
      expect(regel.waarom.length, `${regel.bestand} / ${regel.sleutel}`).toBeGreaterThan(40);
    }
  });

  it('laat niets door zolang de lijst leeg is', () => {
    expect(isRechtgezet('0001_schema.sql', 'approved_by')).toBe(false);
    expect(isRechtgezet('0001_schema.sql', 'iets_anders_by')).toBe(false);
  });
});

describe('de losse ontleding', () => {
  it('leest ook een geneste aanroep, zonder hem dubbel te tellen', () => {
    const sql = `jsonb_build_object('buiten', jsonb_build_object('wie', auth.uid()))`;

    expect(treffersIn(sql)).toHaveLength(1);
  });
});
