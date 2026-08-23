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
import { createHmac, randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/lib/database.types';

export type TestDb = SupabaseClient<Database>;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Het JWT-secret van het project — dashboard, Settings → API → JWT Settings.
 *
 * ⚠️ Sinds QS8-116 tekent deze harness de gebruikerstokens zelf en logt hij niet
 *    meer in. Zie `tekenGebruikersToken()` voor waarom dat mag en wat het kost.
 *    Net als de service-role-key hoort dit secret niet in CI.
 */
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

/**
 * Draaien deze tests? Ze hebben een echte Supabase-instantie nodig, inclusief de
 * service-role-key. Die staat niet in CI (en hoort daar ook niet), dus daar
 * slaan ze zichzelf over in plaats van rood te worden.
 *
 * ⚠️ Het JWT-secret staat hier bewust in. Zonder die voorwaarde slaan de tests
 *    zichzelf niet netjes over maar vallen ze om op een ontbrekend secret — en
 *    een suite die omvalt in plaats van overslaat is precies het faalbeeld dat
 *    QS8-116 kwam opruimen.
 */
export const rlsTestsConfigured = Boolean(url && anonKey && serviceRoleKey && jwtSecret);

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

function requireEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
} {
  if (!url || !anonKey || !serviceRoleKey || !jwtSecret) {
    throw new Error(
      'RLS-tests hebben EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, ' +
        'SUPABASE_SERVICE_ROLE_KEY en SUPABASE_JWT_SECRET nodig. Zie .env.example.',
    );
  }
  guardProductie(url);
  return { url, anonKey, serviceRoleKey, jwtSecret };
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
  /** Het ruwe token, voor tests die de claims zelf willen bekijken. */
  readonly token: string;
}

interface AangemaakteGebruiker {
  readonly id: string;
  readonly email: string;
}

const createdUsers: AangemaakteGebruiker[] = [];

/**
 * Het adrespatroon van een testgebruiker — QS8-119.
 *
 * ⚠️ Deze suite verwijdert rijen met een key die RLS volledig omzeilt, tegen het
 *    échte project. Het slot daarop (`guardProductie`) is een herinnering, geen
 *    bescherming: het staat aan het begín van de run en zegt niets over wat er
 *    aan het eind verwijderd wordt.
 *
 *    Deze controle staat op de plek die er wél toe doet — vlak vóór het
 *    verwijderen. Wie ooit een id in de boekhouding stopt dat niet van deze run
 *    is, krijgt een luide fout in plaats van een verwijderde gebruiker.
 */
const TEST_EMAIL = /^rls-[a-z0-9-]+-[0-9a-f-]{36}@example\.com$/;

export function isTestEmail(email: string): boolean {
  return TEST_EMAIL.test(email);
}

function base64url(waarde: string): string {
  return Buffer.from(waarde, 'utf8').toString('base64url');
}

/**
 * De HS256-handtekening over een al gecodeerde `kop.payload`.
 *
 * ⚠️ Apart van `tekenGebruikersToken()` zodat hij te toetsen is aan de
 *    testvector uit RFC 7515 §A.1 — zie `jwt.test.ts`. Dat is het enige stuk van
 *    QS8-116 dat stil fout kan gaan: een verkeerde codering geeft geen
 *    foutmelding maar een token dat PostgREST weigert, en dan zoek je in de
 *    policies. Precies de fout die dit issue kwam repareren.
 *
 * Neemt `Buffer` óók aan, want de RFC-vector levert een sleutel in ruwe bytes.
 * Het JWT-secret van Supabase is gewone tekst en gaat als UTF-8 de HMAC in —
 * hetzelfde als wat GoTrue en PostgREST doen.
 */
export function hs256(romp: string, secret: string | Buffer): string {
  return createHmac('sha256', secret).update(romp).digest('base64url');
}

/**
 * Tekent een gebruikers-JWT met het JWT-secret van het project — QS8-116.
 *
 * ⚠️ **Waarom dit mag en de suite er niets mee verliest.** De anon-key van dit
 *    project is een legacy HS256-JWT, dus PostgREST verifieert symmetrisch met
 *    hetzelfde secret. Een token met deze claims is voor PostgREST niet te
 *    onderscheiden van een token van GoTrue: `auth.uid()` levert identiek op.
 *    Nagemeten bij het besluit: 194 voorkomens van `auth.uid()` in de migraties
 *    en géén van `auth.jwt()`, `auth.role()` of `request.jwt.claims` — de
 *    policies hangen dus uitsluitend aan `sub`.
 *
 *    Gaat een policy ooit `auth.jwt()` lezen, dan moet dit token de claim die
 *    hij leest óók dragen. Dat wordt dan een rode test en geen stille fout, want
 *    de policy krijgt simpelweg niets terug.
 *
 * ⚠️ **Waarom niet meer inloggen.** De suite liep vast op de rate limit van
 *    `/auth/v1/token` — een burst-limiet per IP, niet het aanmeldquotum waar
 *    iedereen naar zocht. Het aantal aanmeldingen was nooit de beperking:
 *    `admin.createUser()` deed 370 accounts in een uur zonder één weigering.
 *    Door zelf te tekenen gaan de auth-verzoeken per run van ~31 naar nul.
 *
 *    Wat we opgeven is het bewijs dat GoTrue zélf correcte claims uitgeeft. Dat
 *    is nooit de vraag van een RLS-suite geweest, en het gat wordt gedicht door
 *    de controletest in `token.test.ts`, die één echte sessie ophaalt en de
 *    claims vergelijkt.
 */
export function tekenGebruikersToken(userId: string, email: string): string {
  const env = requireEnv();

  // ⚠️ Vijf seconden terug. Een `iat` in de toekomst levert "JWT issued at
  //    future" op — het tweede gezicht van de aanmeldlimiet, en net zo goed
  //    géén policyfout. Klokverschil tussen deze machine en Supabase is klein
  //    maar niet nul.
  const nu = Math.floor(Date.now() / 1000) - 5;

  const kop = { alg: 'HS256', typ: 'JWT' };
  const claims = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iss: `${env.url}/auth/v1`,
    email,
    iat: nu,
    exp: nu + 60 * 60,
    session_id: randomUUID(),
    is_anonymous: false,
  };

  const romp = `${base64url(JSON.stringify(kop))}.${base64url(JSON.stringify(claims))}`;

  return `${romp}.${hs256(romp, env.jwtSecret)}`;
}

/**
 * Een client die volledig onder RLS draait met het meegegeven token.
 *
 * ⚠️ `global.headers.Authorization` en niet de `accessToken`-optie. De interne
 *    fallback van supabase-js zet alleen een Authorization-header als er nog
 *    geen staat, dus deze wint. De `accessToken`-optie zou ook werken maar
 *    schakelt de interne auth-client uit — en `echteSessie()` hieronder heeft er
 *    juist één nodig die wél kan inloggen.
 */
export function gebruikerDb(token: string): TestDb {
  const env = requireEnv();
  return createClient<Database>(env.url, env.anonKey, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Vertaalt een fout van de Auth-API naar iets waar je niet in de policies op
 * gaat zoeken.
 *
 * ⚠️ Acceptatiecriterium 3 van QS8-116. Met richting C is een 429 onwaarschijnlijk
 *    geworden — er wordt nog maar één keer per run ingelogd — maar een
 *    onwaarschijnlijke fout die er stil uitziet is precies hoe dat issue is
 *    ontstaan. Vier keer op rij is er in de policies gezocht naar iets wat een
 *    limiet was.
 */
function meldAuthFout(
  fout: { status?: number | undefined; message: string } | null,
  wat: string,
): never {
  if (fout?.status === 429) {
    throw new Error(
      [
        `${wat} werd geweigerd met HTTP 429: de rate limit van Supabase Auth is bereikt.`,
        '',
        '⚠️ Dit is GEEN policyfout. Zoek niet in de RLS-policies.',
        '   Wacht een paar minuten en draai opnieuw.',
      ].join('\n'),
    );
  }
  throw new Error(`${wat} mislukte: ${fout?.message ?? 'onbekende fout'}`);
}

/**
 * Maakt een testgebruiker, zodat `user.db` volledig onder RLS draait.
 *
 * ⚠️ Afwijking van de issuetekst (QS8-98), bewust. Daar staat `auth.signUp`.
 *    Dat verstuurt een bevestigingsmail zodra e-mailbevestiging aanstaat, en die
 *    mails bouncen op wegwerpadressen. Op de gedeelde SMTP van de gratis tier
 *    kost dat afzenderreputatie. `admin.createUser` met `email_confirm` slaat de
 *    mail over en levert exact dezelfde gebruiker: dezelfde rij in `auth.users`,
 *    dezelfde `handle_new_user`-trigger. Wat de issue wil bewijzen — dat de
 *    policies kloppen voor een echte gebruiker, via de API — blijft overeind.
 *
 * ⚠️ Tweede afwijking, sinds QS8-116: er wordt niet meer ingelogd. Het token
 *    wordt hier getekend in plaats van bij GoTrue opgehaald. De onderbouwing
 *    staat bij `tekenGebruikersToken()`; de controle dat het token klopt staat
 *    in `token.test.ts`.
 *
 *    Deze functie doet daarmee nog precies één verzoek aan de Auth-API, en dat
 *    is er een die niet gelimiteerd is.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminDb();

  const email = `rls-${label}-${crypto.randomUUID()}@example.com`;

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });

  if (created.error || !created.data.user) {
    meldAuthFout(created.error, `Testgebruiker ${label} aanmaken`);
  }
  createdUsers.push({ id: created.data.user.id, email });

  // Geen `signInWithPassword` meer, en dus ook geen wachtwoord nodig — QS8-116.
  const token = tekenGebruikersToken(created.data.user.id, email);

  return { id: created.data.user.id, email, db: gebruikerDb(token), token };
}

/**
 * Eén échte sessie via GoTrue, met wachtwoord en al.
 *
 * ⚠️ Bestaat voor precies één test: de controle dat een zelfgetekend token
 *    dezelfde claims draagt als een token dat GoTrue uitgeeft. Dat is het gat
 *    dat richting C openlaat, en dit is hoe het gedicht wordt.
 *
 *    Gebruik hem nergens anders. Elke aanroep is een verzoek aan
 *    `/auth/v1/token`, en dat is exact de limiet waar QS8-116 over ging — één
 *    per run is de bedoeling, niet één per bestand.
 */
export async function echteSessie(
  label: string,
): Promise<{ userId: string; email: string; accessToken: string }> {
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
    meldAuthFout(created.error, `Testgebruiker ${label} aanmaken`);
  }
  createdUsers.push({ id: created.data.user.id, email });

  const db = createClient<Database>(env.url, env.anonKey, noSession);
  const sessie = await db.auth.signInWithPassword({ email, password });

  if (sessie.error || !sessie.data.session) {
    meldAuthFout(sessie.error, `Inloggen als ${label}`);
  }

  return {
    userId: created.data.user.id,
    email,
    accessToken: sessie.data.session.access_token,
  };
}

/** De payload-claims van een JWT, zonder de handtekening te controleren. */
export function claimsVan(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1];
  if (payload === undefined) throw new Error('Geen geldig JWT: payload ontbreekt.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
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

  // ⚠️ Óók in de boekhouding met adres (QS8-119). Deze profielen zijn opvulling
  //    en loggen nooit in, maar ze worden wél opgeruimd — en dan moeten ze door
  //    dezelfde grendel als de rest.
  createdUsers.push({ id: created.data.user.id, email });
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
  const gebruikers = createdUsers.splice(0);
  if (gebruikers.length === 0) return;

  // ⚠️ De grendel uit QS8-119. Alles hieronder verwijdert met een key die RLS
  //    omzeilt; dit is de laatste plek waar nog te controleren valt dát het om
  //    testgebruikers gaat. Gooien en niet waarschuwen: bij twijfel hoort er
  //    niets verwijderd te worden, ook niet de rest van de lijst.
  const vreemd = gebruikers.filter((g) => !isTestEmail(g.email));
  if (vreemd.length > 0) {
    throw new Error(
      [
        `Opruimen afgebroken: ${vreemd.length} van de ${gebruikers.length} gebruikers`,
        'in de boekhouding zijn geen testgebruiker van deze run.',
        '',
        `Eerste afwijking: ${vreemd[0]?.email ?? '(geen adres)'}`,
        '',
        '⚠️ Er is niets verwijderd. Deze suite draait met de service-role-key',
        '   tegen het echte project; bij twijfel gaat er niets weg.',
      ].join('\n'),
    );
  }

  const ids = gebruikers.map((g) => g.id);
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
