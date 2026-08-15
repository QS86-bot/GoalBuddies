/**
 * Vitest-setup: laadt .env zodat integratietests tegen een echte Supabase-instantie
 * kunnen praten. Unit-tests hebben dit niet nodig en draaien ook zonder .env.
 */
import { config } from 'dotenv';

config({ path: '.env', quiet: true });
