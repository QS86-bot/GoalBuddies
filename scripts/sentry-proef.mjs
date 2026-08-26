#!/usr/bin/env node
/**
 * Sentry-rooktest, lokaal — `npm run sentry:proef`.
 *
 * Beantwoordt één vraag zonder deploy: komt een event met de DSN uit je `.env`
 * daadwerkelijk in Sentry aan? Stuurt een synthetisch testevent en zegt of
 * Sentry het accepteerde, mét het event-id zodat je het in het dashboard
 * terugvindt.
 *
 * ⚠️ Dit spiegelt de transport van `supabase/functions/_shared/sentry/index.ts`
 *    — hetzelfde envelope-formaat, dezelfde auth-header. Bewust een kopie en geen
 *    import: die helper draait op Deno (`Deno.env`) en is niet vanuit Node te
 *    laden. Wijzig je het formaat daar, pas het hier ook aan; het is precies één
 *    POST, dus dat blijft overzichtelijk.
 *
 * ⚠️ Leest `SENTRY_DSN` (server-side), niet `EXPO_PUBLIC_SENTRY_DSN` (de app).
 *    Dat is dezelfde variabele die de Edge Functions als secret gebruiken.
 */
import process from 'node:process';

import { config } from 'dotenv';

config({ path: '.env', quiet: true });

const TIMEOUT_MS = 5_000;

function fail(message, hint) {
  console.error(`\n  ✗ ${message}\n`);
  if (hint) console.error(`    ${hint}\n`);
  process.exit(1);
}

const dsnRuw = process.env.SENTRY_DSN;
if (!dsnRuw) {
  fail(
    'SENTRY_DSN ontbreekt in .env.',
    'Zet `SENTRY_DSN=https://<key>@<host>/<project-id>` in .env — dezelfde DSN als de Supabase-secret.',
  );
}

let ingestUrl;
let publicKey;
try {
  const u = new URL(dsnRuw);
  publicKey = u.username;
  const projectId = u.pathname.replace(/^\/+/, '');
  if (!publicKey || !projectId) throw new Error('geen key of project-id');
  ingestUrl = `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
} catch (fout) {
  fail(`SENTRY_DSN is onleesbaar: ${fout.message}`, 'Verwacht formaat: https://<key>@<host>/<project-id>');
}

const eventId = crypto.randomUUID().replace(/-/g, '');
const nu = new Date().toISOString();

const event = {
  event_id: eventId,
  timestamp: nu,
  platform: 'javascript',
  level: 'error',
  logger: 'edge',
  server_name: 'sentry:proef',
  environment: process.env.SENTRY_ENVIRONMENT ?? 'development',
  tags: { function: 'sentry:proef', runtime: 'node' },
  exception: {
    values: [
      {
        type: 'Error',
        value: 'Sentry-rooktest via npm run sentry:proef — dit is geen echte storing.',
      },
    ],
  },
  extra: { bron: 'lokale proef' },
};

const body =
  `${JSON.stringify({ event_id: eventId, sent_at: nu, dsn: dsnRuw })}\n` +
  `${JSON.stringify({ type: 'event' })}\n` +
  `${JSON.stringify(event)}\n`;

console.log(`\n  Testevent sturen naar ${ingestUrl} …`);

let antwoord;
try {
  antwoord = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=goalbuddies-proef/1.0`,
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
} catch (fout) {
  fail(
    `Versturen mislukte: ${fout.message}`,
    'Netwerk of DSN-host onbereikbaar? Controleer de host in SENTRY_DSN.',
  );
}

if (!antwoord.ok) {
  const tekst = await antwoord.text().catch(() => '');
  fail(
    `Sentry gaf HTTP ${antwoord.status}.`,
    tekst ? `Antwoord: ${tekst.slice(0, 200)}` : 'Klopt de DSN-key en het project-id?',
  );
}

console.log(`\n  ✓ Geaccepteerd door Sentry. Event-id: ${eventId}`);
console.log('    Zoek in Sentry → Issues op "Sentry-rooktest via npm run sentry:proef".\n');
