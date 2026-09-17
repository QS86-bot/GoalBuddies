import { describe, expect, it } from 'vitest';

import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De klok onder een straf ligt vast vanaf het aangaan — 0280, reviewrij 08-09-2026.
 *
 * ⚠️⚠️ **Wat er mis was.** `wikkel_commitments_af()` besliste over een straf met
 *    `eigenaarsdatum(owner)` = `(now() at time zone profiles.tz)::date`, en `tz`
 *    staat in de UPDATE-kolomgrant van `authenticated`. De gestrafte zette dus
 *    zelf de klok die bepaalt of hij op tijd was. 📏 De uiterste offsets in
 *    `pg_timezone_names` liggen **26 uur** uit elkaar (`Etc/GMT+12` tot
 *    `Pacific/Kiritimati`), dus een westelijke zone kocht ten hoogste
 *    `ceil(26 / 24)` = **twee** extra dagen.
 *
 * ⚠️⚠️ **Hier stond tot 17-09-2026 "één dag", en die grens was gemeten en tóch
 *    onwaar** (QS8-530). De meting eronder was *"de spreiding over álle zones is
 *    op elk moment precies twee datums"*, en die klopte op het moment dat hij
 *    gedaan werd — alleen niet op elk moment. 📏 Een venster van 26 uur is
 *    langer dan een etmaal, dus het bevat **twee** middernachten gedurende
 *    26 − 24 = twee uur per dag: van **10:00 t/m 11:59 UTC** zijn het er drie.
 *    De toets hieronder stond daardoor elke dag twee uur rood op `main`.
 *
 *    ⚠️ **En de tegenspraak stond al in de repo.** `0134` draagt in zijn kop een
 *    tabel die UTC−8 nul dagen respijt geeft en UTC+10 twee — dat ís een
 *    spreiding van twee dagen tussen de uitersten. 0280 schreef er anderhalve
 *    week later één van, mét een meting erbij.
 *
 *    De les is niet "beter meten" maar *wat* je meet: het aantal datums is een
 *    eigenschap van de **klok**, de spanwijdte een eigenschap van de
 *    **tz-database**. De redenering leunt op de tweede, dus toetst de eerste
 *    toets hieronder die — en het aantal datums alleen nog op zijn bovengrens.
 *
 * ⚠️ **Wat dit níet raakt: de grendel van 0280 zelf.** Die bevriest
 *    `commitments.tz` bij het aangaan, dus de straftak is dicht of de bovengrens
 *    nu één dag is of twee.
 *
 *    ⚠️ **De beloningstak houdt bewust `eigenaarsdatum()`, en "valt de goede
 *    kant op" is daar te kort door de bocht.** 📏 Nagemeten: een vrijgespeelde
 *    beloning boekt geen punten en raakt geen reeks, maar `meld_commitment()`
 *    plaatst wél `commitment_unlocked` in élke groep waaraan het doel hangt.
 *    Netto koopt een zonesprong daar dus geen punt en geen reeks, maar wel een
 *    positief groepssignaal dat een dag of twee te vroeg komt. Dat is een
 *    andere afweging dan 0057 opschreef, en geen reden om iets te sluiten —
 *    maar wel om het niet af te doen met "de goede kant op".
 *
 *    ⚠️ **En wat dit wél raakt staat buiten dit bestand.** Twee andere plekken
 *    beslissen op de **levende** `profiles.tz`: de verlooppoort van
 *    `beslis_deadline_verzoek()` en het zevendaagse schild in
 *    `maak_straffen_verschuldigd()`. Daar is de bovengrens wél dragend.
 *    Gemeten, met rijen, in de rij van 17-09-2026 in `docs/ENGINEER-REVIEW.md`.
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
 *    `target_date + 1` daar vandaag is en in de oostelijke zone al voorbij. Zo
 *    valt de respijtdag aan weerszijden van het verschil tussen de twee zones,
 *    en meet deze opstelling het verschil dat hij wil meten.
 *
 * ⚠️ **Deze opstelling is met opzet niet klokafhankelijk, en dat is nagerekend
 *    en niet aangenomen** (QS8-530). Midway (−11) en Kiritimati (+14) liggen
 *    25 uur uit elkaar, dus hun lokale datums schelen één dag — behalve van
 *    10:00 t/m 10:59 UTC, dan twee. Beide takken houden in allebei de gevallen:
 *    bij de straftak is `v_vandaag` ofwel `target_date + 2` ofwel
 *    `target_date + 3` en daarmee sowieso te laat, en bij de must-allow is
 *    `v_vandaag` per constructie `target_date + 1` en daarmee sowieso op tijd.
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
  it('spant zesentwintig uur — en dát draagt de bovengrens, niet het aantal datums', () => {
    // ⚠️ De spanwijdte is de grootheid waar de redenering op leunt: hij hangt
    //    aan de tz-database en niet aan de klok, en hij wordt rood zodra er een
    //    extremere zone bij komt — precies het geval dat bewaakt hoort te
    //    worden. Het aantal datums is de afgeleide, en die wisselt per uur.
    //
    // ⚠️ **Hij wordt ook rood als de spanwijdte krímpt**, en dat is met opzet
    //    geen ongelijkheid: een zone die verdwijnt maakt de bovengrens kleiner,
    //    dus de veilige kant — maar dan klopt het getal in vijf documenten niet
    //    meer. Rood is daar het goede antwoord. Verzacht dit dus niet naar
    //    `>=` "omdat het toch de veilige richting is".
    //
    // ⚠️ `dagen=2` is een zwakke tripwire in zijn eentje: `ceil(x / 24)` blijft
    //    2 tot de spanwijdte boven 48 uur komt. Hij staat er voor de fórmule —
    //    `ceil` naar `floor` maakt hem rood — en de spanwijdte doet het werk.
    const uit = na(
      "select 'spanwijdte=' || (max(utc_offset) - min(utc_offset))::text || ';' ||" +
        " 'dagen=' || ceil(extract(epoch from (max(utc_offset) - min(utc_offset))) / 86400)::int || ';' ||" +
        " 'datums=' || (select count(distinct (now() at time zone name)::date) from pg_timezone_names)" +
        " from pg_timezone_names;",
    );

    expect(uit).toContain('spanwijdte=26:00:00');
    expect(uit).toContain('dagen=2');

    // ⚠️ Het aantal datums is klokafhankelijk — twee, en van 10:00 t/m 11:59 UTC
    //    drie. Alleen de bovengrens is een belofte, en die is `dagen + 1`.
    const datums = Number(/datums=(\d+)/.exec(uit)?.[1]);
    expect(datums).toBeGreaterThanOrEqual(2);
    expect(datums).toBeLessThanOrEqual(3);
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
