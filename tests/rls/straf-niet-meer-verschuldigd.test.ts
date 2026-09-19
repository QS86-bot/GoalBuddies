import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { proefId } from './proefid';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De belofte: een getuige die ingelicht is dát een straf verschuldigd werd,
 * hoort het ook als dat niet meer zo is — en een getuige die níets gehoord
 * heeft, hoort ook nu niets (QS8-321, migratie 0293).
 *
 * ⚠️⚠️ **De tweede helft is de belangrijkste en hij is geen must-allow maar een
 *    must-deny.** Intrekken en terugdraaien gebeuren allebei naar `set`, en in
 *    die toestand bestaat de straf voor de getuige niet — 📏
 *    `commitment_zichtbaar_voor_persoon()` geeft `{due, resolved}`. Een melding
 *    aan iemand die de heenweg nooit gehoord heeft, is dus de eerste die hij
 *    over die straf hoort, en dat is precies de domeinregel 11-schending waar
 *    het oorspronkelijke voorstel van dit issue op strandde.
 *
 * ⚠️ **Het issue zelf stelde iets anders, en dat is hier eerst nagemeten.**
 *    QS8-321 schreef dat de getuige bij het **aanwijzen** bericht krijgt en bij
 *    het **intrekken** niets. 📏 Gemeten op 0292: `getuigenissen_voor()` heeft
 *    een gate op `c.status = 'due'`, dus de melding komt juist bij verschuldigd
 *    wórden; en `commitments_update` USING eist `status = 'set'`, dus intrekken
 *    kan alleen in de toestand waarin de getuige van niets weet. Er was dus geen
 *    melding bij intrekken mógelijk zonder de regel te breken. Wat overbleef is
 *    de teruggang `due -> set`, en dát is wat hier bewaakt wordt.
 *
 * IJKING — met de hand gedraaid op 19-09-2026, mutatie per grendel, elk op de
 * echte database en teruggerold. De uitslagen zijn gemeten:
 *
 *   A  de héle `commitment_witness`-eis (het `exists`-blok) eruit
 *      -> **1 rood**: 'een getuige die de heenweg niet hoorde, hoort de terugweg ook niet'
 *   B  `and c.status = 'set'` eruit
 *      -> **1 rood**: 'een straf die nog verschuldigd is, levert geen melding op'
 *   C  de `reverted`-eis op het auditspoor eruit
 *      -> **1 rood**: 'zonder teruggang in het spoor is er niets te melden'
 *   D  de anti-join op `commitment_reverted` eruit
 *      -> **1 rood**: 'dezelfde teruggang meldt maar één keer'
 *   E  `and g.owner_id <> p_user_id` eruit
 *      -> **0 rood**. Zie hieronder.
 *
 * ⚠️⚠️ **A moest overgedaan worden, en de eerste poging is leerzamer dan de
 *    tweede.** Ik verving eerst alleen `and n.kind = 'commitment_witness'` door
 *    `and n.kind is not null` — en dat gaf **0 rood**. Niet omdat de toets niets
 *    bewaakt, maar omdat carol hélemaal geen rij in `notifications_sent` heeft:
 *    het `exists` bleef vals, dus de deur ging niet open. De mutatie was fout,
 *    niet de test. Pas het wéghalen van het hele `exists`-blok bereikt de
 *    grendel die deze toets noemt. CLAUDE.md zegt het met zoveel woorden:
 *    *breek de grendel die de ijking nóemt, niet zomaar iets.*
 *
 * ⚠️⚠️ **E deed niets, en dat hoort er te staan in plaats van stilzwijgend
 *    aangenomen te worden.** `bewaak_begunstigde()` (0168) laat een rij waarin
 *    de eigenaar zijn eigen getuige is niet ontstaan, ook niet als
 *    `service_role`, dus er is geen opstelling die die conjunct bereikt zonder
 *    die trigger uit te zetten. De conjunct blijft staan om dezelfde reden als
 *    in `getuigenissen_voor()` — hij kost niets en hij is de tweede grendel op
 *    dezelfde deur — maar **geen enkele toets hieronder bewaakt hem**.
 */

const TEST_TIMEOUT = 30_000;


const ALICE = proefId(1);
const BOB = proefId(2);
const CAROL = proefId(3);
const GROEP = proefId(4);
const DOEL = proefId(5);
const DOEL2 = proefId(6);
const STRAF = proefId(7);
const STRAF2 = proefId(8);
const GROEP2 = proefId(9);
const DAVE = proefId(10);
const DOEL3 = proefId(11);
const STRAF3 = proefId(12);

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'teruggedraaide_straffen_voor'",
  import.meta.url,
);

function opruimen(): void {
  psql(`delete from commitments where id in ('${STRAF}', '${STRAF2}')`);
  psql(`delete from goals where id in ('${DOEL}', '${DOEL2}', '${DOEL3}')`);
  psql(`delete from groups where id in ('${GROEP}', '${GROEP2}')`);
  psql(`delete from auth.users where id in ('${ALICE}', '${BOB}', '${CAROL}', '${DAVE}')`);
}

/** Zet een straf op `due` en weer terug, zodat het spoor een `reverted` draagt. */
function heenEnTerug(strafId: string): void {
  psql(`update commitments set status = 'due' where id = '${strafId}'`);
  psql(`update commitments set status = 'set' where id = '${strafId}'`);
}

/** Boekt de heenweg-melding die de getuige gekregen zou hebben. */
function heenwegGemeld(userId: string, strafId: string): void {
  psql(
    `insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id) ` +
      `values ('${userId}', 'commitment_witness', current_date, 'commitment', '${strafId}')`,
  );
}

function teruggedraaidVoor(userId: string): string {
  return psql(
    `select coalesce(string_agg(commitment_id::text, ','), '') ` +
      `from teruggedraaide_straffen_voor('${userId}')`,
  ).trim();
}

describe.skipIf(!beschikbaar)('een teruggedraaide straf bereikt alleen wie hem kende', () => {
  beforeAll(() => {
    opruimen();
    psql(
      `insert into auth.users (id, email) values ` +
        `('${ALICE}', 'qs321-alice@example.test'), ` +
        `('${BOB}', 'qs321-bob@example.test'), ` +
        `('${CAROL}', 'qs321-carol@example.test'), ` +
        `('${DAVE}', 'qs321-dave@example.test')`,
    );
    psql(
      `insert into groups (id, name, invite_code, created_by) values ` +
        `('${GROEP}', 'QS321', generate_invite_code(), '${ALICE}'), ` +
        // ⚠️ Een tweede groep waar het doel NIET aan hangt — daar zit dave.
        `('${GROEP2}', 'QS321-twee', generate_invite_code(), '${ALICE}')`,
    );
    // ⚠️ Carol zit er met opzet óók in: de groepsband mag niet de enige reden
    //    zijn dat bob iets krijgt en zij niet.
    psql(
      `insert into group_members (group_id, user_id, role, status) values ` +
        `('${GROEP}', '${ALICE}', 'admin', 'active'), ` +
        `('${GROEP}', '${BOB}', 'member', 'active'), ` +
        `('${GROEP}', '${CAROL}', 'member', 'active'), ` +
        `('${GROEP2}', '${ALICE}', 'admin', 'active'), ` +
        `('${GROEP2}', '${DAVE}', 'member', 'active') ` +
        `on conflict do nothing`,
    );
    psql(
      `insert into goals (id, owner_id, title, target_date) ` +
        `values ('${DOEL}', '${ALICE}', 'QS321-doel', '2033-01-01')`,
    );
    // ⚠️ Een tweede doel, want `commitments_een_open_per_soort` staat maar één
    //    openstaande straf per doel toe. Carol hoort bij een eigen doel.
    psql(
      `insert into goals (id, owner_id, title, target_date) ` +
        `values ('${DOEL2}', '${ALICE}', 'QS321-doel-twee', '2033-01-01')`,
    );
    psql(
      `insert into goals (id, owner_id, title, target_date) ` +
        `values ('${DOEL3}', '${ALICE}', 'QS321-doel-drie', '2033-01-01')`,
    );
    // ⚠️⚠️ **Alle drie de doelen hangen aan GROEP en niet aan GROEP2**, en dat
    //    is de kern van de must-deny hieronder: dave is wél getuige en wél
    //    ingelicht, maar zit alleen in GROEP2.
    psql(
      `insert into goal_group_links (goal_id, group_id) values ` +
        `('${DOEL}', '${GROEP}'), ('${DOEL2}', '${GROEP}'), ('${DOEL3}', '${GROEP}')`,
    );
    psql(
      `insert into commitments (id, goal_id, type, body, beneficiary_user_id, status, confirmed_at) ` +
        `values ('${STRAF}', '${DOEL}', 'penalty', 'QS321 inzet', '${BOB}', 'set', now())`,
    );
    psql(
      `insert into commitments (id, goal_id, type, body, beneficiary_user_id, status, confirmed_at) ` +
        `values ('${STRAF2}', '${DOEL2}', 'penalty', 'QS321 tweede', '${CAROL}', 'set', now())`,
    );
    psql(
      `insert into commitments (id, goal_id, type, body, beneficiary_user_id, status, confirmed_at) ` +
        `values ('${STRAF3}', '${DOEL3}', 'penalty', 'QS321 derde', '${DAVE}', 'set', now())`,
    );
  });

  afterAll(opruimen);

  it(
    'een getuige die de heenweg hoorde, hoort de terugweg',
    () => {
      heenEnTerug(STRAF);
      heenwegGemeld(BOB, STRAF);

      expect(teruggedraaidVoor(BOB), 'de ingelichte getuige kreeg niets').toBe(STRAF);
    },
    TEST_TIMEOUT,
  );

  it(
    'een getuige die de heenweg niet hoorde, hoort de terugweg ook niet',
    () => {
      // ⚠️ **De must-deny, en de reden dat dit bestand bestaat.** Carols straf
      //    gaat heen en terug net als die van bob, maar er is nooit een
      //    `commitment_witness` voor haar geboekt — de rollover kan hem
      //    verschuldigd maken en `beslis_deadline_verzoek()` kan hem terugzetten
      //    binnen hetzelfde venster waarin de meldingenjob nog niet gedraaid
      //    heeft. Dan staat er een `reverted` in het spoor zonder dat er ooit
      //    een duw uitging, en een melding is dan een onthulling.
      heenEnTerug(STRAF2);

      expect(
        teruggedraaidVoor(CAROL),
        'een set-straf werd onthuld aan iemand die er nooit van gehoord had',
      ).toBe('');

      // ⚠️⚠️ **De positieve controle, en zonder haar bewijst het lege antwoord
      //    hierboven niets.** 📏 `teruggedraaide_straffen_voor()` op een
      //    willekeurige uuid geeft óók `''`, dus élke stille mislukking in de
      //    opstelling — straf niet aangemaakt, `heenEnTerug` zonder effect,
      //    carol geen groepslid — zou deze toets groen laten staan. Pas als
      //    dezelfde opstelling mét de heenweg-melding wél iets teruggeeft, is
      //    het lege antwoord een eigenschap van de grendel en niet van een dode
      //    fixture. Gevonden in de security-ronde op dit issue.
      heenwegGemeld(CAROL, STRAF2);
      const metHeenweg = teruggedraaidVoor(CAROL);
      psql(`delete from notifications_sent where user_id = '${CAROL}'`);

      expect(metHeenweg, 'de opstelling leeft niet — het lege antwoord bewees niets').toBe(
        STRAF2,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'een getuige buiten elke gekoppelde groep hoort niets, ook al is hij ingelicht',
    () => {
      // ⚠️⚠️ **Dit geval komt uit de security-ronde en het is een besluit van
      //    Quinten, geen afronding.** Dave is getuige van een straf op een doel
      //    dat aan GROEP hangt, maar hij zit alleen in GROEP2 — mogelijk omdat
      //    `commitments_insert` alleen `shares_group_with_user()` eist en niet
      //    dat de getuige de gekoppelde groep deelt.
      //
      //    📏 Zonder de gekoppelde-groep-eis gaf deze opstelling 1 rij, en dan
      //    hoort dave iets over een uitstel in een groep waar hij niet in zit —
      //    buiten de kring die QS8-370 heeft afgebakend. Dat het bericht het
      //    woord "uitstel" niet noemt helpt niet: er is maar één oorzaak van een
      //    teruggang, dus de gevolgtrekking kan maar één kant op.
      heenEnTerug(STRAF3);
      heenwegGemeld(DAVE, STRAF3);

      expect(
        teruggedraaidVoor(DAVE),
        'een getuige buiten de gekoppelde groepen kreeg de melding toch',
      ).toBe('');

      // ⚠️ Dezelfde positieve controle als hierboven: alleen de groepsband
      //    verandert, en dan hóórt hij hem wél te krijgen. Zonder dit bewijst
      //    het lege antwoord alleen dat er iets in de opstelling stuk is.
      psql(
        `insert into group_members (group_id, user_id, role, status) ` +
          `values ('${GROEP}', '${DAVE}', 'member', 'active') on conflict do nothing`,
      );
      const metBand = teruggedraaidVoor(DAVE);
      psql(`delete from group_members where group_id = '${GROEP}' and user_id = '${DAVE}'`);

      expect(metBand, 'de opstelling leeft niet — het lege antwoord bewees niets').toBe(STRAF3);
    },
    TEST_TIMEOUT,
  );

  it(
    'een straf die nog verschuldigd is, levert geen melding op',
    () => {
      psql(`update commitments set status = 'due' where id = '${STRAF}'`);

      const uit = teruggedraaidVoor(BOB);
      psql(`update commitments set status = 'set' where id = '${STRAF}'`);

      expect(uit, 'een nog verschuldigde straf werd als teruggedraaid gemeld').toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'zonder teruggang in het spoor is er niets te melden',
    () => {
      // ⚠️ De stand alleen is niet genoeg: `set` is ook de begintoestand. Wat
      //    deze melding draagt is dat er wérkelijk teruggedraaid is, en dat
      //    staat in `commitment_events` als `reverted` (QS8-308).
      psql(`delete from commitment_events where commitment_id = '${STRAF}' and event_type = 'reverted'`);

      const uit = teruggedraaidVoor(BOB);
      heenEnTerug(STRAF);

      expect(uit, 'een straf die nooit verschuldigd was, gold als teruggedraaid').toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'dezelfde teruggang meldt maar één keer',
    () => {
      psql(
        `insert into notifications_sent (user_id, kind, local_date, ref_type, ref_id) ` +
          `values ('${BOB}', 'commitment_reverted', current_date, 'commitment', '${STRAF}')`,
      );

      const uit = teruggedraaidVoor(BOB);
      psql(
        `delete from notifications_sent where user_id = '${BOB}' and kind = 'commitment_reverted'`,
      );

      expect(uit, 'de anti-join schoof het venster niet op').toBe('');
    },
    TEST_TIMEOUT,
  );

  it(
    'is alleen voor service_role, want hij toetst zijn aanroeper niet',
    () => {
      // ⚠️ De must-deny op de rechten, zelfde vorm en zelfde reden als bij
      //    `getuigenissen_voor()`: deze functie krijgt de gebruiker als
      //    árgument, dus wie hem mag aanroepen mag naar elke gebruiker vragen.
      const uitslag = psql(`
        select
          has_function_privilege('anon',          'public.teruggedraaide_straffen_voor(uuid)', 'EXECUTE')::text || ' ' ||
          has_function_privilege('authenticated', 'public.teruggedraaide_straffen_voor(uuid)', 'EXECUTE')::text || ' ' ||
          has_function_privilege('service_role',  'public.teruggedraaide_straffen_voor(uuid)', 'EXECUTE')::text
      `);

      expect(uitslag.trim(), 'alleen de job mag deze vraag stellen').toBe('false false true');
    },
    TEST_TIMEOUT,
  );
});
