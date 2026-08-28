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

/**
 * Elke externe call heeft een timeout (CLAUDE.md, coderegel 14).
 *
 * ⚠️ Hier en niet per aanroep. Zonder deze regel hangt een verzoek dat nooit
 *    terugkomt oneindig, en dan staat er een scherm zonder spinner, zonder fout
 *    en zonder knop — de ergste van de drie staten, want hij is niet te
 *    onderscheiden van "het duurt even".
 *
 * ⚠️ Vijftien seconden: ruim boven wat een trage mobiele verbinding nodig heeft,
 *    ruim onder wat iemand accepteert voordat hij de app weggooit.
 */
const TIMEOUT_MS = 15_000;

/**
 * ⚠️ **Een Edge Function krijgt meer tijd, en dat is geen ruimhartigheid maar
 *    rekenwerk.** De Doelcoach doet een Anthropic-call; `doelcoach/index.ts`
 *    geeft die zelf 30 seconden, en de kop van `app/doel/coach/[id].tsx` zegt
 *    dat hij er gemeten twintig nodig heeft. Met de vijftien hierboven brak de
 *    client dus élke AI-call af vóórdat hij klaar kón zijn — de job liep door,
 *    kwam op `done` en de gebruiker kreeg "Het lukte niet".
 *
 * ⚠️ Vijfendertig en niet dertig: de functie mag zijn eigen dertig volmaken en
 *    daarna nog antwoorden. Een client-timeout die gelijkloopt met de
 *    server-timeout wint soms en verliest soms, en dat is de vervelendste soort
 *    fout om terug te vinden.
 */
const FUNCTIE_TIMEOUT_MS = 35_000;

function fetchMetTimeout(invoer: RequestInfo | URL, opties?: RequestInit): Promise<Response> {
  const adres = typeof invoer === 'string' ? invoer : invoer instanceof URL ? invoer.href : invoer.url;
  const grens = adres.includes('/functions/v1/') ? FUNCTIE_TIMEOUT_MS : TIMEOUT_MS;
  return fetch(invoer, { ...opties, signal: AbortSignal.timeout(grens) });
}

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
    global: { fetch: fetchMetTimeout },
  });

  return cached;
}
