import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './database.types';
import { clientEnv } from './env';

/** De client met het schema erin: elke query is getypeerd tegen de database. */
export type Db = SupabaseClient<Database>;

/**
 * De gedeelde Supabase-client voor web én native.
 *
 * Sessies worden op native in AsyncStorage bewaard en op web in localStorage,
 * dat de client zelf regelt. `detectSessionInUrl` staat alleen op web aan, omdat
 * OAuth-callbacks daar via de URL binnenkomen.
 *
 * ⚠️ Deze client gebruikt uitsluitend de anon-key en draait dus volledig onder
 *    RLS. Elke autorisatie zit in de database, nooit hier.
 */

let cached: Db | undefined;

export function supabase(): Db {
  if (cached) return cached;

  const env = clientEnv();
  const isWeb = Platform.OS === 'web';

  cached = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      ...(isWeb ? {} : { storage: AsyncStorage }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
    },
  });

  return cached;
}
