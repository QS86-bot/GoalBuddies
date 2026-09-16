import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De klok onder een straf ligt vast vanaf het aangaan — 0280, reviewrij 08-09-2026.
 *
 * ⚠️⚠️ **Wat er mis was.** `wikkel_commitments_af()` besliste over een straf met
 *    `eigenaarsdatum(owner)` = `(now() at time zone profiles.tz)::date`, en `tz`
 *    staat in de UPDATE-kolomgrant van `authenticated`. De gestrafte zette dus
 *    zelf de klok die bepaalt of hij op tijd was. 📏 De spreiding over álle zones
 *    in `pg_timezone_names` is op elk moment **precies twee datums** — hier
 *    nagemeten en niet aangenomen — dus een westelijke zone kocht één extra dag.
 *
 * ⚠️ **Dit was geen nieuwe bug maar een nieuwe consequentie.** 0057 koos de
 *    coulante toets bewust: *"de fout valt zo altijd de goede kant op — een
 *    beloning is iets dat je jezelf hebt beloofd."* Dat argument geldt voor een
 *    beloning en draait om voor een straf. Vandaar dat 0280 alléén de straftak
 *    verzet en de beloningstak woordelijk laat staan; de laatste test hieronder
 *    bewaakt dat die helft níet meebewogen is.
 *
 * ⚠️ **Besluit van Quinten (16-09-2026): bevriezen, niet UTC.** Dat is de enige
 *    optie die niemands belofte verandert — je houdt de coulance die je had toen
 *    je je vastlegde, en kunt hem achteraf niet verschuiven. Afweging in
 *    `docs/decisions/2026-09-16-de-klok-die-de-gestrafte-zelf-zet.md`.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from information_schema.columns " +
    "where table_schema = 'public' and table_name = 'commitments' and column_name = 'tz'",
  import.meta.url,
);

/**
 * Een doel met een straf, aangegaan in `zoneBijAangaan`, met een streefdatum die
 * precies tussen de twee uiterste zones in valt.
 *
 * ⚠️ `target_date` wordt afgeleid van de **westelijke** zone, zodat
 *    `target_date + 1` daar vandaag is en in de oostelijke zone gisteren. Zo
 *    valt de respijtdag aan weerszijden van de twee datums die er op elk moment
 *    zijn, en meet deze opstelling het verschil dat hij wil meten.
 */
function opzet(zoneBijAangaan: string, zoneDaarna: string): string {
  return `
do $$
declare
  v_a uuid; v_b uuid; v_g uuid; v_c uuid;
  v_target date := (now() at time zone 'Pacific/Midway')::date - 1;
begin
  v_a := public.shim_maak_gebruiker('alice-strafklok@x.nl','Alice');
  v_b := public.shim_maak_gebruiker('bob-strafklok@x.nl','Bob');
  update public.profiles set tz = '${zoneBijAangaan}' where id = v_a;

  insert into public.goals (owner_id, title, target_date)
    values (v_a, 'Doel met straf', v_target) returning id into v_g;
  insert into public.commitments (goal_id, type, body, confirmed_at, beneficiary_user_id)
    values (v_g, 'penalty', 'Ik doneer vijftig euro aan een goed doel', now(), v_b)
    returning id into v_c;

  update public.profiles set tz = '${zoneDaarna}' where id = v_a;

  create temp table proef (goal_id uuid, commitment_id uuid, owner uuid);
  insert into proef values (v_g, v_c, v_a);
end $$;
`;
}

/** Draait `sql` na de opzet, rolt terug, en geeft stdout terug. */
function na(sql: string): string {
  try {
    return psqlMetInvoer(`begin;\n${sql}\nrollback;`);
  } catch (fout) {
    return fout instanceof Error ? fout.message : String(fout);
  }
}

describe.skipIf(!beschikbaar)('de klok onder een straf', () => {
  it('staat op precies twee datums tegelijk — de aanname onder deze hele rij', () => {
    // ⚠️ Gaat dit ooit naar drie, dan koopt een zonesprong twee dagen en is
    //    "één dag" geen bovengrens meer. Deze toets zegt dat hardop.
    const uit = na(
      "select 'datums=' || count(distinct (now() at time zone name)::date) from pg_timezone_names;",
    );

    expect(uit).toContain('datums=2');
  });

  it('wordt bij het aangaan vastgelegd uit het profiel van de eigenaar', () => {
    const uit = na(
      `${opzet('Europe/Amsterdam', 'Europe/Amsterdam')}
       select 'zone=' || tz from public.commitments where id = (select commitment_id from proef);`,
    );

    expect(uit).toContain('zone=Europe/Amsterdam');
  });

  it('is daarna niet meer te wijzigen, ook niet door service_role', () => {
    const uit = na(
      `${opzet('Europe/Amsterdam', 'Europe/Amsterdam')}
       update public.commitments set tz = 'Pacific/Midway'
        where id = (select commitment_id from proef);`,
    );

    expect(uit).toContain('ligt vast vanaf het aangaan en is niet te wijzigen');
  });

  it('blijft staan bij een gewone update op een andere kolom', () => {
    const uit = na(
      `${opzet('Europe/Amsterdam', 'Europe/Amsterdam')}
       update public.commitments set body = 'Ik doneer honderd euro aan een goed doel'
        where id = (select commitment_id from proef);
       select 'zone=' || tz from public.commitments where id = (select commitment_id from proef);`,
    );

    expect(uit).toContain('zone=Europe/Amsterdam');
  });

  it('laat de straf staan als de eigenaar zijn klok ná het aangaan naar het westen verzet', () => {
    // ⚠️⚠️ **Dit is de bevinding zelf.** Aangegaan in Kiritimati (daar is het al
    //    de dag ná de respijtdag), daarna verzet naar Midway (daar is het nog
    //    net op tijd). Met de klok van vandaag zou de straf vervallen; met de
    //    bevroren klok blijft hij staan.
    const uit = na(
      `${opzet('Pacific/Kiritimati', 'Pacific/Midway')}
       select 'uitkomst=' || public.wikkel_commitments_af((select goal_id from proef))::text;
       select 'status=' || status from public.commitments
        where id = (select commitment_id from proef);`,
    );

    expect(uit).toContain('"blijft_staan": 1');
    expect(uit).toContain('status=set');
  });

  it('laat de straf wél vervallen als hij in de bevroren zone op tijd is', () => {
    // De must-allow. Zonder deze zou "altijd laten staan" ook groen zijn, en dan
    // bewaakt de test hierboven niets.
    const uit = na(
      `${opzet('Pacific/Midway', 'Pacific/Kiritimati')}
       select 'uitkomst=' || public.wikkel_commitments_af((select goal_id from proef))::text;
       select 'status=' || status from public.commitments
        where id = (select commitment_id from proef);`,
    );

    expect(uit).toContain('"vervallen": 1');
    expect(uit).toContain('status=cancelled');
  });

  it('laat beloning en straf op verschillende klokken lopen, in één aanroep', () => {
    // ⚠️ **Deze toets gaat over de splitsing en niet over één tak.** In dezelfde
    //    aanroep wordt de beloning vrijgespeeld (klok van vandaag: Midway, op
    //    tijd) terwijl de straf blijft staan (bevroren klok: Kiritimati, te
    //    laat). Dát is wat 0280 doet, en geen van beide asserties alleen zegt
    //    het. 0057 koos die coulance met een argument dat voor een beloning nog
    //    steeds klopt; verhuist iemand deze tak alsnog, dan wordt dit rood en is
    //    dat een besluit en geen bijvangst.
    const uit = na(
      `${opzet('Pacific/Kiritimati', 'Pacific/Midway')}
       insert into public.commitments (goal_id, type, body, confirmed_at, beneficiary_user_id)
       select goal_id, 'reward', 'Ik trakteer mezelf op een goed boek', now(), null from proef;
       select 'uitkomst=' || public.wikkel_commitments_af((select goal_id from proef))::text;`,
    );

    // De eigenaar staat nu in Midway en is daar op tijd, dus de beloning wordt
    // vrijgespeeld — terwijl de straf in dezelfde aanroep blijft staan.
    expect(uit).toContain('"vrijgespeeld": 1');
    expect(uit).toContain('"blijft_staan": 1');
  });
});
