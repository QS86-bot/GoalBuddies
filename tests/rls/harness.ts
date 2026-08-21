/**
 * Gereedschap voor tests die de RLS-policies écht uitvoeren.
 *
 * ⚠️ Waarom dit bestand bestaat. De rooktest van 15-08-2026 draaide als
 *    `service_role` en die rol heeft BYPASSRLS: elke policy stond erbij en keek
 *    ernaar. Wie wil weten of de 48 policies kloppen, moet praten via de
 *    PostgREST-API, met een echt JWT van een echte gebruiker. Dat is wat hier
 *    gebouwd wordt.
 *
 * Bewust níét `src/lib/supabase.ts` hergebruiken: die client trekt React Native
 * en AsyncStorage mee, en draait sessies in opslag die tussen tests blijft hangen.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/lib/database.types';

export type TestDb = SupabaseClient<Database>;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Draaien deze tests? Ze hebben een echte Supabase-instantie nodig, inclusief de
 * service-role-key. Die staat niet in CI (en hoort daar ook niet), dus daar
 * slaan ze zichzelf over in plaats van rood te worden.
 */
export const rlsTestsConfigured = Boolean(url && anonKey && serviceRoleKey);

/**
 * Het enige Supabase-project dat er is, is het echte project. Er is (nog) geen
 * lokale stack — zie docs/Q-TODO.docx C3.
 */
const PRODUCTIE_REF = 'wehgocadxehottiiyvsc';

/**
 * ⚠️ Deze suite maakt echte accounts aan en ruimt ze daarna op met een key die
 *    RLS volledig omzeilt. Zolang dat tegen het echte project gebeurt, hoort er
 *    een slot op — niet omdat het vandaag misgaat, maar omdat het één slordige
 *    refactor verwijderd is van `delete from groups` zonder filter.
 *
 *    Zet `RLS_TEST_ALLOW_PROD=1` in .env als je bewust tegen het echte project
 *    wilt draaien. Zodra er een lokale stack is, hoort deze regel te verdwijnen.
 */
function guardProductie(target: string): void {
  if (!target.includes(PRODUCTIE_REF)) return;
  if (process.env.RLS_TEST_ALLOW_PROD === '1') return;

  throw new Error(
    [
      'De RLS-tests wijzen naar het productieproject en dat is geblokkeerd.',
      '',
      'Ze maken echte accounts aan en verwijderen die daarna met de',
      'service-role-key. Dat gaat vandaag goed, maar het is geen gewoonte om in',
      'te bakken.',
      '',
      'Draai ze tegen een lokale stack, of zet bewust in .env:',
      '  RLS_TEST_ALLOW_PROD=1',
    ].join('\n'),
  );
}

function requireEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'RLS-tests hebben EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
        'en SUPABASE_SERVICE_ROLE_KEY nodig. Zie .env.example.',
    );
  }
  guardProductie(url);
  return { url, anonKey, serviceRoleKey };
}

const noSession = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/**
 * De systeemclient. Omzeilt RLS en staat daarmee voor alles wat in productie een
 * Edge Function doet: punten boeken, kettingschakels zetten, jobs bijwerken.
 * In tests gebruiken we hem óók om te bouwen wat de client niet mag bouwen.
 */
export function adminDb(): TestDb {
  const env = requireEnv();
  return createClient<Database>(env.url, env.serviceRoleKey, noSession);
}

/** Een client zonder sessie: precies wat een uitgelogde bezoeker heeft. */
export function anonDb(): TestDb {
  const env = requireEnv();
  return createClient<Database>(env.url, env.anonKey, noSession);
}

export interface TestUser {
  readonly id: string;
  readonly email: string;
  /** Client met het JWT van deze gebruiker. Draait volledig onder RLS. */
  readonly db: TestDb;
}

const createdUserIds: string[] = [];

/**
 * Maakt een testgebruiker en logt hem in, zodat `user.db` een echt JWT draagt.
 *
 * ⚠️ Afwijking van de issuetekst (QS8-98), bewust. Daar staat `auth.signUp`.
 *    Dat verstuurt een bevestigingsmail zodra e-mailbevestiging aanstaat, en die
 *    mails bouncen op wegwerpadressen. Op de gedeelde SMTP van de gratis tier
 *    kost dat afzenderreputatie. `admin.createUser` met `email_confirm` slaat de
 *    mail over en levert exact dezelfde gebruiker: dezelfde rij in `auth.users`,
 *    dezelfde `handle_new_user`-trigger, hetzelfde JWT na inloggen. Wat de issue
 *    wil bewijzen — echte tokens, via de API — blijft volledig overeind.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const env = requireEnv();
  const admin = adminDb();

  const email = `rls-${label}-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });

  if (created.error || !created.data.user) {
    throw new Error(`Testgebruiker ${label} aanmaken mislukte: ${created.error?.message}`);
  }
  createdUserIds.push(created.data.user.id);

  const db = createClient<Database>(env.url, env.anonKey, noSession);
  const session = await db.auth.signInWithPassword({ email, password });

  if (session.error || !session.data.session) {
    throw new Error(`Inloggen als ${label} mislukte: ${session.error?.message}`);
  }

  return { id: created.data.user.id, email, db };
}

/**
 * Maakt een gebruiker **zonder in te loggen** — alleen een rij in `auth.users`
 * en het profiel dat `handle_new_user` daarbij aanmaakt.
 *
 * ⚠️ Bestaat om aanmeldingen te sparen, en dat is inmiddels geen zuinigheid maar
 *    noodzaak. Supabase weigert na ongeveer dertig aanmeldingen per uur, en de
 *    volledige suite zat op 43 — waarvan elf in één test, die twaalf groepsleden
 *    nodig heeft om een N+1 aan te tonen. Die elf hoeven geen JWT: wat de test
 *    bewíjst is dat het groepsoverzicht twaalf leden in één verzoek levert, niet
 *    hóé ze lid geworden zijn. Toetreden met een code wordt elders getest, mét
 *    echte tokens.
 *
 * ⚠️ Gebruik dit **alleen** voor opvulling. Zodra een test iets wil aantonen
 *    over wat déze gebruiker mag, heb je een echt token nodig en dus
 *    `createTestUser`. Een fixture die RLS omzeilt om RLS te testen, bewijst
 *    niets.
 */
export async function createTestProfile(label: string): Promise<{ id: string; email: string }> {
  const admin = adminDb();

  const email = `rls-${label}-${crypto.randomUUID()}@example.com`;

  const created = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });

  if (created.error || !created.data.user) {
    throw new Error(`Testprofiel ${label} aanmaken mislukte: ${created.error?.message}`);
  }

  createdUserIds.push(created.data.user.id);
  return { id: created.data.user.id, email };
}

/**
 * Ruimt elke gebruiker op die deze run heeft aangemaakt.
 *
 * ⚠️ Bevinding van QS8-98: `delete auth.users` alléén werkt niet. `profiles`
 *    hangt met cascade aan `auth.users`, maar een handvol kolommen verwijst naar
 *    `profiles` zónder cascade — `groups.created_by`, `completions.user_id`,
 *    `completion_approvals.approver_id`, `chat_messages.sender_id`,
 *    `goal_events.actor_id`. Zodra een gebruiker één van die rijen heeft
 *    aangemaakt, blokkeert de foreign key de verwijdering en meldt de Auth-API
 *    alleen "Database error deleting user".
 *
 *    Dat raakt niet alleen deze suite: een gebruiker die zijn account wil
 *    opzeggen, loopt tegen exact dezelfde muur. Staat als bevinding in
 *    `docs/ENGINEER-REVIEW.md`. Tot dat opgelost is ruimt deze functie de
 *    verwijzende rijen zelf op, in omgekeerde afhankelijkheidsvolgorde.
 */
export async function removeTestUsers(): Promise<void> {
  const ids = createdUserIds.splice(0);
  if (ids.length === 0) return;

  const admin = adminDb();

  const wipe = async (
    table: 'completion_approvals' | 'completions' | 'chat_messages' | 'goal_events' | 'goals' | 'group_members' | 'groups',
    column: string,
  ): Promise<void> => {
    const { error } = await admin.from(table).delete().in(column, ids);
    if (error) console.warn(`Opruimen van ${table}.${column} mislukte: ${error.message}`);
  };

  await wipe('completion_approvals', 'approver_id');
  await wipe('completion_approvals', 'subject_id');
  await wipe('completions', 'user_id');
  await wipe('chat_messages', 'sender_id');
  await wipe('goal_events', 'actor_id');
  await wipe('goals', 'owner_id');
  await wipe('group_members', 'user_id');
  await wipe('groups', 'created_by');

  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      // Niet gooien: een halve opruiming is beter dan geen, en de volgende
      // gebruiker verdient nog een poging.
      console.warn(`Testgebruiker ${id} opruimen mislukte: ${error.message}`);
    }
  }
}

/**
 * Een code die gegarandeerd bij geen enkele groep hoort.
 *
 * ⚠️ Tot migratie 0016 gaf deze functie de code waarmee een testgroep werd
 *    aangemaakt. Dat kan niet meer en dat is de bedoeling: `create_group()`
 *    verzint de code nu zelf, want een code die de aanroeper kiest, is geen code
 *    maar een verzoek. Wat ervan over is, is precies wat een negatieve test
 *    nodig heeft — een code van de juiste vorm die nergens bij hoort.
 */
export function onbekendeCode(): string {
  const alfabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alfabet[b % alfabet.length]).join('');
}
