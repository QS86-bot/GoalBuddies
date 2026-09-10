/**
 * Het pushtokenplafond telt de registraties die er wáren — QS8-401, migratie 0234.
 *
 * ⚠️ **De belofte is niet "er komen er niet meer dan twintig in".** Die is:
 *    *wissen en opnieuw registreren komt niet langs het plafond, en
 *    herregistreren van een bestaand apparaat komt er wél gewoon door*. Die
 *    tweede helft is even hard als de eerste — `Pushwacht` in `app/_layout.tsx`
 *    herregistreert bij élke start, en 0214 beschrijft hoe iemand daardoor
 *    blijvend zonder meldingen kwam te zitten op een fout die hij zelf niet kon
 *    opheffen.
 *
 * 📏 Gemeten vóór 0234, via `registreer_push_token()` als ingelogde gebruiker:
 *
 *      na 20: 20 rijen
 *      nr 21 -> {"ok": false, "reason": "te_veel_tokens"}
 *      na wissen: 0 rijen
 *      opnieuw   -> {"ok": true}          <-- de bug
 *
 * ⚠️⚠️ **En er zat een tweede telling naast.** `begrens_pushtokens()` telde
 *    `push_tokens` en de voorcontrole in `registreer_push_token()` deed dat nóg
 *    een keer. Twee tellingen naast elkaar lopen uiteen zodra er één verandert,
 *    en dan geeft de RPC `ok` terwijl de trigger een ruwe 23514 werpt. Sinds 0234
 *    lezen ze allebei `dagtellers`; het geval *"de RPC weigert netjes"* hieronder
 *    is wat dat vastlegt.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  voorcontrole terug naar `count(*)` over `push_tokens`     → 2 rood
 *   B  `tel_dagteller` uit `begrens_pushtokens()` halen          → 2 rood
 *   C  de lege-batchtak (`v_batch = 0`) weghalen                 → 1 rood
 *
 * ⚠️ A en B geven er twee: het gedrág valt om én de bronbewaking ziet het. Dat
 *    is de bedoeling — de bronbewaking alleen zou een functie die de goede naam
 *    áánroept maar het verkeerde doet niet zien, en het gedrag alleen zou twee
 *    tellingen die het toevallig eens zijn niet zien.
 *
 * ⚠️ Het vensteregeval staat bewust níét in deze tabel: het venster van
 *    `tel_dagteller()` is in 0233 al geijkt, en híer wordt het gedekt door de
 *    `greatest` met de werkelijke telling — een mutatie op het venster alleen
 *    verandert daar niets aan.
 *
 * ⚠️ C geeft er precies één, en dat is de must-allow: zonder die tak schrijft
 *    een herregistratie (een statement met nul nieuwe rijen) tóch een tellerrij,
 *    en dan loopt iemand die bij elke start herregistreert vanzelf zijn plafond
 *    in. Precies de uitsluiting die 0214 opschreef.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { proefId } from './proefid';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'dagteller_stand'",
  import.meta.url,
);

const GEBRUIKER = proefId(1);
const PLAFOND = 20;

/** Een geldig Expo-token; de vorm staat onder `push_tokens_native_vorm`. */
function token(n: number): string {
  return `ExponentPushToken[${String(n).padStart(20, 'a')}]`;
}

/** Roept de RPC aan als deze gebruiker en geeft het antwoord terug. */
function registreer(t: string): string {
  const claims = JSON.stringify({ sub: GEBRUIKER, role: 'authenticated' }).replace(/'/g, "''");
  return psql(
    `select set_config('request.jwt.claims', '${claims}', true);
     select registreer_push_token('${t}', 'ios');`,
  )
    .split('\n')
    .filter((r) => r.trim() !== '')
    .pop() as string;
}

function leeg(): void {
  psql(
    `delete from push_tokens where user_id = '${GEBRUIKER}';
     delete from dagtellers where domein = 'push_tokens' and sleutel = '${GEBRUIKER}';
     delete from auth.users where id = '${GEBRUIKER}';
     insert into auth.users (id, email) values ('${GEBRUIKER}', '${GEBRUIKER}@proef.local')
       on conflict (id) do nothing;`,
  );
}

function vulTotPlafond(): void {
  for (let i = 1; i <= PLAFOND; i += 1) registreer(token(i));
}

describe.runIf(beschikbaar)('het pushtokenplafond overleeft een delete', () => {
  beforeEach(leeg);
  afterAll(() => {
    psql(
      `delete from push_tokens where user_id = '${GEBRUIKER}';
       delete from dagtellers where domein = 'push_tokens' and sleutel = '${GEBRUIKER}';
       delete from auth.users where id = '${GEBRUIKER}';`,
    );
  });

  /** ⚠️ De must-allow. Een plafond dat álles weigert is groen op elke weigering. */
  it('laat twintig registraties gewoon toe', () => {
    vulTotPlafond();

    expect(psql(`select count(*) from push_tokens where user_id = '${GEBRUIKER}'`)).toBe(
      String(PLAFOND),
    );
  });

  /**
   * ⚠️⚠️ **De RPC weigert netjes en de trigger werpt niet.** Dit is het geval dat
   *    vastlegt dat de twee dezelfde bron lezen: zou de voorcontrole een ándere
   *    telling doen, dan komt hier een ruwe `23514` uit in plaats van een
   *    `reason` waar de client iets mee kan.
   */
  it('weigert de eenentwintigste met een reden en niet met een 23514', () => {
    vulTotPlafond();

    expect(registreer(token(21))).toContain('te_veel_tokens');
  });

  /**
   * ⚠️ **De must-allow met de gemeten geschiedenis.** `Pushwacht` herregistreert
   *    bij élke start; die weg mag het plafond nooit raken, ook niet als je er
   *    precies op zit.
   */
  it('laat herregistratie van een bestaand apparaat door, ook op het plafond', () => {
    vulTotPlafond();

    expect(registreer(token(1))).toContain('"ok": true');
  });

  /** ⚠️ De grendel die de belofte draagt — dit is het geval dat vóór 0234 doorliet. */
  it('laat wissen en opnieuw registreren er niet langs', () => {
    vulTotPlafond();
    psql(`delete from push_tokens where user_id = '${GEBRUIKER}'`);

    expect(
      registreer(token(31)),
      'de teller telde de rijen die er staan in plaats van de registraties die er waren',
    ).toContain('te_veel_tokens');
  });

  /**
   * ⚠️ Het venster moet schuiven, anders is het een levenslange grens en is elke
   *    weigering hierboven waardeloos als bewijs.
   *
   * ⚠️⚠️ **De rijen verouderen mee, en dat is geen opsmuk.** De voorcontrole
   *    neemt sinds 0234 `greatest` van de blijvende teller en de werkelijke
   *    telling over `push_tokens` — zie de aantekening bij die functie. 📏 Alleen
   *    `venster_start` terugzetten laat twintig rijen staan die nog geen etmaal
   *    oud zijn, en dan weigert hij terecht. Dit geval bootst een echte volgende
   *    dag na: de tokens staan er nog, maar ze zijn van gisteren.
   */
  it('laat een etmaal later weer registreren', () => {
    vulTotPlafond();
    psql(
      `update dagtellers set venster_start = now() - interval '25 hours'
        where domein = 'push_tokens' and sleutel = '${GEBRUIKER}';
       update push_tokens set created_at = now() - interval '25 hours'
        where user_id = '${GEBRUIKER}'`,
    );

    expect(registreer(token(41))).toContain('"ok": true');
  });
});

/**
 * De teller en de voorcontrole lezen dezelfde bron — criterium 3.
 *
 * ⚠️ Een bronbewaking en geen gedragstest, en dat is met opzet: het gedrag
 *    hierboven kan groen blijven terwijl er stiekem weer twee tellingen naast
 *    elkaar staan die het toevallig eens zijn. Pas als ze uiteenlopen valt het
 *    op, en dan is het al productie.
 */
describe.runIf(beschikbaar)('er is één telling voor pushtokens', () => {
  /**
   * ⚠️⚠️ **De voorcontrole leest de blijvende teller én de tabel, en dat is geen
   *    terugval naar twee tellingen.** 📏 `pushtokenplafond.test.ts` zet een
   *    gebruiker met een bevoorrechte schrijver op `plafond + 1` rijen; die komen
   *    binnen zónder claim, dus de trigger keert om en de teller weet er niets
   *    van. Met alleen `dagteller_stand()` liet deze functie daarna een échte
   *    nieuwe token door — die test viel er meteen over.
   *
   *    `greatest` van de twee is wat allebei de gevallen dekt: een `delete`
   *    verlaagt de teller niet, en een backfill telt alsnog mee.
   */
  it('laat de voorcontrole de blijvende teller lezen', () => {
    const bron = psql(`select prosrc from pg_proc where proname = 'registreer_push_token'`);

    expect(bron).toContain('dagteller_stand');
    expect(bron, 'zonder greatest ziet de voorcontrole een backfill niet').toContain('greatest');
  });

  it('laat de trigger via tel_dagteller() tellen', () => {
    const bron = psql(`select prosrc from pg_proc where proname = 'begrens_pushtokens'`);

    expect(bron).toContain('tel_dagteller');
    expect(
      /count\(\*\)\s*into\s+v_totaal/i.test(bron),
      'de trigger telt de tabel weer zelf',
    ).toBe(false);
  });

  it('houdt de lege-batchtak, want een statement zonder rijen brak niets', () => {
    const bron = psql(`select prosrc from pg_proc where proname = 'begrens_pushtokens'`);

    expect(bron).toContain('v_batch = 0');
  });
});
