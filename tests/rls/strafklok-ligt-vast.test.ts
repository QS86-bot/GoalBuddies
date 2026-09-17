import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De klok onder een straf ligt vast vanaf het aangaan — 0280, reviewrij 08-09-2026.
 *
 * ⚠️⚠️ **Wat er mis was.** `wikkel_commitments_af()` besliste over een straf met
 *    `eigenaarsdatum(owner)` = `(now() at time zone profiles.tz)::date`, en `tz`
 *    staat in de UPDATE-kolomgrant van `authenticated`. De gestrafte zette dus
 *    zelf de klok die bepaalt of hij op tijd was, en kocht daarmee een extra dag.
 *
 * ⚠️⚠️ **Hier stond dat de spreiding over álle zones "op elk moment precies twee
 *    datums" is, dus één extra dag. Dat klopte niet — rechtgezet 17-09-2026
 *    (QS8-529).** 📏 De offsets in `pg_timezone_names` lopen van −12:00 tot
 *    +14:00: **26 uur** spreiding, en 26 past niet in 24. Van **10:00 tot 12:00
 *    UTC** bestaan er drie datums tegelijk en koopt een zonesprong **twee**
 *    dagen. De toets die de oude zin bewaakte telde de datums op het moment van
 *    draaien en eiste er twee; die viel er twee uur per dag uit en maakte op
 *    17-09 om 10:05 UTC CI rood op een PR die alleen documentatie wijzigde.
 *
 * ⚠️ **De twee toetsen hieronder hangen daarom niet meer van de wandklok af.**
 *    De bovengrens volgt uit de **spanwijdte** en niet uit een telling op één
 *    moment; het venster wordt op vier vaste UTC-tijden gemeten.
 *
 * ⚠️ **Dit was geen nieuwe bug maar een nieuwe consequentie.** 0057 koos de
 *    coulante toets bewust: *"de fout valt zo altijd de goede kant op — een
 *    beloning is iets dat je jezelf hebt beloofd."* Dat argument geldt voor een
 *    beloning en draait om voor een straf. Vandaar dat 0280 alléén de straftak
 *    verzet en de beloningstak woordelijk laat staan; de laatste test hieronder
 *    bewaakt dat die helft níet meebewogen is.
 *
 * ⚠️⚠️ **"De bovengrens is onbelangrijk" geldt over 0280 en niet over de
 *    codebase** — nagemeten op 17-09-2026 in de security-ronde van QS8-530.
 *    `eigenaarsdatum()` heeft meer aanroepers dan `wikkel_commitments_af()`, en
 *    twee ervan lezen de **levende** `profiles.tz`: de verlooppoort van
 *    `beslis_deadline_verzoek()` (QS8-531 — een westelijke zone zet daar een al
 *    verschuldigde straf terug op `set`) en het zevendaagse schild in
 *    `maak_straffen_verschuldigd()` (QS8-533). Daar ís het getal dragend. De
 *    metingen staan als rij van 17-09-2026 in `docs/ENGINEER-REVIEW.md` en in
 *    `docs/decisions/2026-09-17-geen-gat-in-0280-is-niet-geen-gat.md`.
 *
 * ⚠️ **En "de beloningstak valt de goede kant op" is te kort door de bocht.**
 *    📏 Nagemeten: een vrijgespeelde beloning boekt geen punten en raakt geen
 *    reeks, maar `meld_commitment()` plaatst wél `commitment_unlocked` in élke
 *    groep waaraan het doel hangt. Geen punt en geen reeks dus, maar wel een
 *    positief groepssignaal dat een dag of twee te vroeg komt.
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
 *    valt de respijtdag tussen de twee datums in die deze opstelling gebruikt,
 *    en meet ze het verschil dat ze wil meten.
 *
 * ⚠️ **Dat werkt op elk moment van de dag**, en dat is hier geen aanname maar
 *    rekenwerk: Midway is `UTC−11` en Kiritimati `UTC+14`, dus **25 uur** uit
 *    elkaar, en twee zones die meer dan 24 uur uit elkaar liggen staan nooit op
 *    dezelfde datum. Het venster uit de toets hierboven raakt deze opstelling
 *    dus niet.
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
  it('spant zesentwintig uur — daar komt de bovengrens onder deze hele rij vandaan', () => {
    // ⚠️ **Dit is de toets die de bovengrens draagt, en hij telt geen datums.**
    //    Met een spanwijdte S bestaan er op elk moment floor(S/24)+1 of +2
    //    datums tegelijk, dus koopt een zonesprong hoogstens ceil(S/24) dagen.
    //    Bij 26 uur is dat er twee. Groeit de spanwijdte ooit voorbij 48 uur,
    //    dan worden het er drie — en dán is dat het nieuws.
    const uit = na(
      "select 'spanwijdte=' || (max(utc_offset) - min(utc_offset))::text from pg_timezone_names;",
    );

    expect(uit).toContain('spanwijdte=26:00:00');
  });

  it('laat tussen 10:00 en 12:00 UTC drie datums tegelijk bestaan, daarbuiten twee', () => {
    // ⚠️ **Vier vaste UTC-tijden en niet `now()`.** De voorganger van deze toets
    //    telde op het moment van draaien en eiste er twee; dat is 22 uur per dag
    //    waar en maakt CI de andere twee uur rood. Een toets die van de wandklok
    //    afhangt, meet de wandklok.
    const uit = na(`
      select 'venster=' || string_agg(u || ':' || n::text, ' ' order by u)
      from (
        select u,
               (select count(distinct ((current_date + (u || ':00')::time)
                                        at time zone 'UTC' at time zone name)::date)
                  from pg_timezone_names) as n
        from (values ('09:00'), ('10:00'), ('11:00'), ('12:00')) as t(u)
      ) x;`);

    expect(uit).toContain('venster=09:00:2 10:00:3 11:00:3 12:00:2');
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
