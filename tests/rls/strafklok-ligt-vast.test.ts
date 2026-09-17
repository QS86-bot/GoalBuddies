import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De klok onder een straf ligt vast vanaf het aangaan — 0280, reviewrij 08-09-2026.
 *
 * ⚠️⚠️ **Wat er mis was.** `wikkel_commitments_af()` besliste over een straf met
 *    `eigenaarsdatum(owner)` = `(now() at time zone profiles.tz)::date`, en `tz`
 *    staat in de UPDATE-kolomgrant van `authenticated`. De gestrafte zette dus
 *    zelf de klok die bepaalt of hij op tijd was. 📏 Het offsetbereik van
 *    `pg_timezone_names` is **26:00:00** — `[-12, +14]` — dus twee waarnemers
 *    verschillen tot 26 uur en hun lokale datums tot **twee kalenderdagen**. Een
 *    westelijke zone kocht dus tot twee dagen.
 *
 * ⚠️⚠️ **Dat getal stond hier tot 17-09-2026 als "precies twee datums, dus één
 *    extra dag", en dat was onjuist (QS8-525).** De toets eronder pinde het
 *    aantal **verschillende datums** vast op 2, en dat aantal beweegt met de
 *    klok mee: 📏 per uur nagemeten is het er 3 tussen 10:00 en 12:00 UTC en 2
 *    de overige tweeëntwintig uur. Deze suite was daardoor elke dag twee uur
 *    lang rood, en dat is nooit opgevallen omdat er in dat venster niets liep.
 *
 *    De les is niet "beter meten" maar **wát je vastpint**: het aantal datums is
 *    een waarneming, de spreiding is de belofte. `max - min` is wat de
 *    redenering draagt en verandert niet met het uur. Een toets op een getal dat
 *    met de klok meebeweegt, is een toets die op een willekeurig moment omvalt
 *    zonder dat er iets veranderd is — de klasse die dit project bij `rls:dekking`
 *    al een keer betaald heeft.
 *
 * ⚠️ De reparatie van 0280 verandert hier niet door: het bevriezen van
 *    `commitments.tz` haalt de manipulatie helemaal weg, of het er nu één dag of
 *    twee waren. Wat er verandert is de **omvang** van het gat dat gedicht is.
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
 *    valt de respijtdag aan weerszijden van de datumgrens die er op elk moment
 *    is, en meet deze opstelling het verschil dat hij wil meten. Het aantal
 *    verschillende datums over álle zones doet er hier niet toe — dat is er 2 of
 *    3 afhankelijk van het uur; wat telt is dat deze twee zones aan
 *    weerszijden liggen.
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
  it('spant hoogstens twee kalenderdagen — de aanname onder deze hele rij', () => {
    // ⚠️⚠️ Dit toetst de **spreiding** en niet het aantal verschillende datums.
    //    Dat aantal is 2 of 3 afhankelijk van het uur (zie de kop), dus een
    //    toets daarop valt elke dag twee uur lang om zonder dat er iets
    //    veranderd is. `max - min` verandert niet met de klok.
    //
    //    Gaat dit ooit naar drie dagen, dan koopt een zonesprong er drie en is
    //    de redenering onder 0280 aan herziening toe. Deze toets zegt dat hardop.
    const uit = na(
      "select 'spreiding=' || (max(d) - min(d)) from " +
        '(select (now() at time zone name)::date d from pg_timezone_names) x;',
    );

    expect(uit).toMatch(/spreiding=[12]\b/);
  });

  it('spant die twee dagen op élk uur van de dag, niet alleen nu', () => {
    // ⚠️⚠️ **Dit is de ijking, en hij staat in de suite en niet in een
    //    sessielogboek.** De vorige toets was groen omdat hij toevallig buiten
    //    het venster van 10:00–12:00 UTC draaide; een toets die van het uur
    //    afhangt, bewijst niets over de andere drieëntwintig. Deze rekent alle
    //    24 uur door en pakt de zwaarste.
    const uit = na(
      "select 'ergste=' || max(sp) from (select max(d) - min(d) sp from (" +
        "select u.t, (u.t at time zone 'UTC' at time zone z.name)::date d from " +
        "generate_series(date_trunc('day', now()), " +
        "date_trunc('day', now()) + interval '23 hours', interval '1 hour') u(t), " +
        'pg_timezone_names z) y group by t) x;',
    );

    expect(uit).toContain('ergste=2');
  });

  it('leunt op een offsetbereik van 26 uur, en zegt dat met zoveel woorden', () => {
    // ⚠️ De structurele grond onder allebei de toetsen hierboven: `[-12, +14]`.
    //    Dit is een eigenschap van tzdata en niet van vandaag, dus hij geldt ook
    //    op een dag waarop de zomertijd ergens verspringt. Komt er ooit een zone
    //    buiten dat bereik, dan is dit de eerste die het meldt.
    const uit = na(
      "select 'bereik=' || (max(utc_offset) - min(utc_offset)) from pg_timezone_names;",
    );

    expect(uit).toContain('bereik=26:00:00');
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
