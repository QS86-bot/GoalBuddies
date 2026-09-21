#!/usr/bin/env node
/**
 * Duidt de stderr van een mislukte `drop database` — QS8-562.
 *
 * Gebruik (vanuit bash):
 *
 *   fout="$(psql … -c "drop database if exists ${DB};" 2>&1 >/dev/null)" || {
 *     oordeel="$(printf '%s\n' "$fout" | node scripts/psql-drop-oordeel.mjs "$DB")"
 *   }
 *
 * **stdout draagt het oordeel in één woord, stderr de melding voor de lezer.**
 * Die splitsing is er zodat de aanroeper op het oordeel kan vertakken zonder de
 * melding te hoeven ontleden — `schema-opbouwen.sh` telt bij `bezet` de sessies
 * erbij, en dat is de enige tak waarin die telling iets betekent.
 *
 * ## ⚠️⚠️ Waarom dit een node-script is en geen paar regels bash
 *
 * `verbindingsoordeel()` bestaat al, en de patronen erin zijn met de hand geijkt
 * op wat psql écht zegt (`tests/scripts/psql-verbinding.test.ts`). Diezelfde
 * indeling in bash overtypen geeft twee kopieën die uit elkaar lopen zodra
 * iemand er één aanpast — precies de reden die `scripts/ci-controle-draai.mjs`
 * opschrijft om `beoordeel()` uit de poort te hergebruiken in plaats van na te
 * bouwen. De duiding hoort op één plek, en die plek is `scripts/psql.mjs`.
 *
 * ⚠️ Dit script roept psql niet aan. Het leest tekst en schrijft tekst; wie het
 *    wil ijken heeft geen database nodig.
 */
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { dropmelding, dropOordeel } from './psql.mjs';

/** @param {NodeJS.ReadableStream} stroom */
export async function lees(stroom) {
  /** @type {Buffer[]} */
  const stukken = [];
  for await (const stuk of stroom) stukken.push(Buffer.from(stuk));
  return Buffer.concat(stukken).toString('utf8');
}

/**
 * @param {{ db: string, melding: string, host?: string | undefined,
 *           poort?: string | undefined }} opties
 * @returns {{ oordeel: string, melding: string }}
 */
export function duid({ db, melding, host, poort }) {
  return { oordeel: dropOordeel(melding), melding: dropmelding({ db, melding, host, poort }) };
}

async function hoofd() {
  const db = process.argv[2] ?? '(onbekende database)';
  const tekst = await lees(process.stdin);
  const uit = duid({ db, melding: tekst, host: process.env.PGHOST, poort: process.env.PGPORT });

  console.error(uit.melding);
  console.log(uit.oordeel);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await hoofd());
}
