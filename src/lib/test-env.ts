/**
 * Vitest-setup: laadt .env zodat integratietests tegen een echte Supabase-instantie
 * kunnen praten. Unit-tests hebben dit niet nodig en draaien ook zonder .env.
 *
 * ⚠️ **Behalve het productieslot van de RLS-suite** — QS8-703. `RLS_DOEL` en
 *    `RLS_TEST_ALLOW_PROD` komen alleen uit de procesomgeving; staat het slot in
 *    `.env`, dan werpt deze setup en wordt elke test rood. Zie
 *    `src/lib/test-env-slot.ts`.
 *
 * ⚠️ `GOALBUDDIES_DOTENV` kiest een ander bestand dan `.env`. Hij bestaat voor
 *    `tests/beloftes/dotenv-opent-het-slot-niet.test.ts`, die vitest als
 *    kindproces met een eigen `.env` start: een test mag de echte `.env` van
 *    deze machine nooit overschrijven.
 */
import { config } from 'dotenv';

import { overTeNemen, slotInDotenv } from './test-env-slot';

const bestand: Record<string, string> = {};
config({ path: process.env.GOALBUDDIES_DOTENV ?? '.env', quiet: true, processEnv: bestand });

const melding = slotInDotenv(bestand);
if (melding !== null) throw new Error(melding);

Object.assign(process.env, overTeNemen(bestand, process.env));
