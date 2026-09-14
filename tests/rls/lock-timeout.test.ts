/**
 * De belofte: een verzoek langs de clientweg blijft niet op een slot staan —
 * QS8-492.
 *
 * ⚠️⚠️ **Wat hier bewaakt wordt is de leesbaarheid van een fout, niet het
 *    uitblijven ervan.** Een test die een grendel even uitzet, houdt tot zijn
 *    `rollback` een ShareRowExclusiveLock op die tabel; die botst met de
 *    RowExclusiveLock van elke INSERT. Draait er een tweede suite tegen dezelfde
 *    stack, dan staat díe stil zolang de transactie leeft. 📏 Gemeten zonder de
 *    instelling die deze test bewaakt: een schrijver wachtte **23079 ms** op een
 *    houder die nog 23 s te gaan had — de wachttijd ís de looptijd van de
 *    transactie, geen fractie ervan.
 *
 *    Dat is niet weg te nemen zonder de opstelling op te geven die de grendel
 *    eronder toetst (zie het beslisdocument voor de twee afgewezen routes, elk
 *    met zijn meting). Wat wél kan is de uitslag eerlijk maken: een fout die
 *    zichzelf uitlegt binnen seconden, in plaats van een vitest-timeout van
 *    240 s op een testbestand dat part noch deel heeft aan de oorzaak.
 *
 * ⚠️ **Daarom meet deze test het gedrág en niet de instelling.** `lock_timeout`
 *    staat in de conninfo van PostgREST, en 📏 dat het dáár staat is aantoonbaar
 *    niet hetzelfde als dat het wérkt: de eerste poging gebruikte
 *    percent-codering (de URI-vorm) in een conninfo van sleutel=waarde, en
 *    Postgres weigerde élke verbinding met `-c %20lock_timeout%3D3s requires a
 *    value`. Het conf-bestand zag er toen precies goed uit. Een test die het
 *    bestand leest, was daar groen op gebleven.
 *
 * ⚠️ **De must-allow staat er met opzet naast.** Een instelling die élk verzoek
 *    afkapt, is geen reparatie maar een tweede storing; zonder dat geval bewaakt
 *    de eerste helft niets.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql, psqlBasisArgumenten } from './psql-stack';

import { spawn, type ChildProcess } from 'node:child_process';

import { PSQL_OMGEVING } from './psql-stack';

const TEST_TIMEOUT = 120_000;

/** Ruim boven de `lock_timeout` van 3 s en ruim onder de 240 s van vitest. */
const HOUD_SECONDEN = 30;

let gebruiker: TestUser;
let houder: ChildProcess | undefined;

/**
 * Beëindigt de backend die het slot houdt.
 *
 * ⚠️ **Het psql-proces doodschieten is niet genoeg, en dat is gemeten.** De
 *    backend zit in `pg_sleep()` en merkt een gesloten socket pas als hij weer
 *    iets wil schrijven — het slot bleef staan tot de sleep vanzelf afliep, en
 *    de must-allow hieronder werd daardoor rood. `pg_terminate_backend()` is de
 *    kant die wél meteen werkt.
 */
function laatHetSlotLos(): void {
  psql(
    `select pg_terminate_backend(pid) from pg_locks ` +
      `where relation = 'public.daily_moves'::regclass ` +
      `and mode = 'ShareRowExclusiveLock' and granted and pid <> pg_backend_pid()`,
  );
}

/** Wacht tot niemand `daily_moves` meer op ShareRowExclusive houdt. */
async function wachtTotHetSlotWegIs(): Promise<void> {
  const tot = Date.now() + 15_000;
  while (Date.now() < tot) {
    if (telHetSlot() === '0') return;
    await new Promise((klaar) => setTimeout(klaar, 100));
  }
  throw new Error('het slot op daily_moves bleef staan; de must-allow zou iets anders meten');
}

/** Hoeveel sessies houden ShareRowExclusive op `daily_moves`? */
function telHetSlot(): string {
  return psql(
    `select count(*) from pg_locks where relation = 'public.daily_moves'::regclass ` +
      `and mode = 'ShareRowExclusiveLock' and granted`,
  );
}

describe.runIf(rlsTestsConfigured)('een clientverzoek blijft niet op een slot staan', () => {
  beforeAll(async () => {
    gebruiker = await createTestUser('lock-timeout');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    houder?.kill('SIGKILL');
    await removeTestUsers();
  }, TEST_TIMEOUT);

  it(
    'geeft binnen seconden een fout die het slot noemt, in plaats van de houder uit te zitten',
    async () => {
      // Sessie A zet een trigger uit binnen een transactie en houdt daarmee
      // ShareRowExclusive op `daily_moves` vast. Precies de opstelling die
      // `goedkeuring-wijst-naar-de-eigenaar` op zijn eigen tabel gebruikt.
      houder = spawn('psql', psqlBasisArgumenten(), { env: PSQL_OMGEVING });
      houder.stdin?.write(
        `begin; lock table public.daily_moves in share row exclusive mode; ` +
          `select pg_sleep(${HOUD_SECONDEN}); rollback;\n`,
      );

      // Wachten tot A het slot écht heeft — zonder deze lus meet een snelle
      // uitslag misschien alleen dat A nog niet begonnen was.
      const tot = Date.now() + 15_000;
      let gepakt = false;
      while (Date.now() < tot) {
        if (telHetSlot() !== '0') {
          gepakt = true;
          break;
        }
        await new Promise((klaar) => setTimeout(klaar, 100));
      }
      expect(gepakt, 'sessie A heeft het slot niet gepakt; deze test meet dan niets').toBe(true);

      const begin = Date.now();
      const { error } = await gebruiker.db
        .from('daily_moves')
        .insert({ user_id: gebruiker.id, body: 'geblokkeerd', local_date: '2026-09-14' });
      const verstreken = Date.now() - begin;

      expect(error, 'de schrijver kwam erdoor terwijl het slot vastzat').not.toBeNull();
      expect(
        `${error?.message ?? ''}`.toLowerCase(),
        `de fout noemt het slot niet, dus de lezer weet nog steeds niet waarom: ${error?.message}`,
      ).toContain('lock timeout');
      expect(
        verstreken,
        `de schrijver zat de houder uit (${verstreken} ms) in plaats van af te kappen`,
      ).toBeLessThan(HOUD_SECONDEN * 1000);

      // ⚠️ **Het slot hier loslaten en niet pas in `afterAll`.** De must-allow
      //    hieronder schrijft naar dezelfde tabel; blijft de houder staan, dan
      //    krijgt díe ook een lock timeout en meet hij de opruiming van deze
      //    test in plaats van zijn eigen belofte. 📏 Dat is één keer gebeurd:
      //    de must-allow werd rood op precies die fout, en dat is waar hij voor
      //    is — hij ving een gat in de opzet van zijn eigen bestand.
      laatHetSlotLos();
      houder.kill('SIGKILL');
      houder = undefined;
      await wachtTotHetSlotWegIs();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een schrijver die geen slot tegenkomt gewoon door',
    async () => {
      // ⚠️ De must-allow. Zonder dit geval is een `lock_timeout` van nul
      //    seconden ook groen op de test hierboven.
      const { error } = await gebruiker.db
        .from('daily_moves')
        .insert({ user_id: gebruiker.id, body: 'ongehinderd', local_date: '2026-09-13' });

      expect(error, `een ongehinderde schrijver werd geweigerd: ${error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );
});
