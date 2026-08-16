import { z } from 'zod';

import type { Weekday } from '../../shared/time';

/**
 * De invoer van de groepsschermen, plus het formaat van de uitnodigingscode.
 *
 * ⚠️ Dit bestand importeert bewust geen Supabase-client. Zou het dat wel doen,
 *    dan trekt elke test die deze regels wil controleren React Native mee — de
 *    valkuil die `shared/ui/naming.ts` en `modules/goals/cycles.ts` al eerder
 *    heeft opgeleverd.
 */

// ---------------------------------------------------------------------------
// De uitnodigingscode
// ---------------------------------------------------------------------------

/**
 * Hetzelfde alfabet als `generate_invite_code()` in migratie 0016: dertig
 * tekens, zonder 0/O, 1/I/L en U.
 *
 * ⚠️ Deze constante mag nooit uit elkaar lopen met de database. Staat hij hier
 *    ruimer, dan accepteert de app codes die de server nooit uitgeeft; staat hij
 *    krapper, dan weigert de app een geldige code voordat de server hem ziet.
 *    Er is een test die precies dit vastlegt.
 */
export const CODE_ALFABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTE = 12;

const CODE_PATROON = new RegExp(`^[${CODE_ALFABET}]{${CODE_LENGTE}}$`);

/**
 * Maakt van wat iemand plakt of typt een code die de server herkent.
 *
 * Mensen plakken links, typen met streepjes ertussen, en zetten er spaties
 * omheen. Ze typen ook een kleine l waar een 1 hoort en een O waar een 0 hoort —
 * behalve dat het alfabet die tekens juist niet kent, dus die twee omzettingen
 * zijn hier fout en gebeuren niet. Wat wel gebeurt: hoofdletters maken, en alles
 * weggooien wat niet in het alfabet zit.
 */
export function normaliseerCode(invoer: string): string {
  // ⚠️ Eerst de afsluitende schuine strepen eraf. Chat-apps en tekstverwerkers
  //    plakken die er graag achter, en `split('/').pop()` levert dan een lege
  //    string op — waarna de app de gebruiker een fout aanwrijft voor de link die
  //    hij letterlijk zo gekregen heeft.
  const zonderSlot = invoer.trim().replace(/[/\s]+$/, '');
  const zonderQuery = zonderSlot.split('?')[0] ?? '';
  const staart = zonderQuery.split('/').pop() ?? '';

  return staart
    .toUpperCase()
    .split('')
    .filter((teken) => CODE_ALFABET.includes(teken))
    .join('');
}

/** Heeft deze code de vorm die de server uitgeeft? Zegt niets over geldigheid. */
export function isCodeVorm(code: string): boolean {
  return CODE_PATROON.test(code);
}

/**
 * De code zoals hij op het scherm staat: drie blokjes van vier.
 *
 * Alleen voor de weergave — overal waar hij naar de server gaat, gaat hij zonder
 * streepjes.
 */
export function toonCode(code: string): string {
  const schoon = normaliseerCode(code);
  return (schoon.match(/.{1,4}/g) ?? []).join('-');
}

/** De deelbare link. Het pad komt overeen met `app/uitnodiging/[code].tsx`. */
export function uitnodigingsLink(basis: string, code: string): string {
  const schoon = basis.replace(/\/+$/, '');
  return `${schoon}/uitnodiging/${normaliseerCode(code)}`;
}

// ---------------------------------------------------------------------------
// Formulieren
// ---------------------------------------------------------------------------

/**
 * ⚠️ De grenzen zijn dezelfde als in `create_group()`. De server blijft de
 *    waarheid — dit schema is er om iemand niet met een foutmelding uit de
 *    database op te zadelen voor iets dat de app zelf kon zien.
 */
export const groepSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'Geef je groep een naam van minstens twee tekens.' })
    .max(60, { error: 'Maximaal 60 tekens.' }),
  huddle_day: z
    .number()
    .int()
    .min(0)
    .max(6, { error: 'Kies een dag van de week.' }),
});

export type GroepInvoer = z.infer<typeof groepSchema>;

export const groepPatchSchema = groepSchema.partial();
export type GroepPatch = z.infer<typeof groepPatchSchema>;

export const codeSchema = z
  .string()
  .transform(normaliseerCode)
  .refine(isCodeVorm, { error: 'Deze uitnodigingscode klopt niet. Controleer de link.' });

// ---------------------------------------------------------------------------
// Weergave
// ---------------------------------------------------------------------------
//
// ⚠️ Hier stond een constante `GRENZEN` met de limieten uit migratie 0016 erin.
//    Die is weggehaald: geen enkel scherm gebruikte hem, en een derde kopie van
//    getallen die in SQL staan zonder test ertussen is een tijdbom en geen
//    documentatie. De limieten komen als kenmerk terug uit de RPC's
//    (`group_full`, `daily_limit`) en `api.ts` maakt er een zin van.

export const HUDDLEDAGEN: readonly { readonly waarde: Weekday; readonly label: string }[] = [
  { waarde: 1, label: 'Maandag' },
  { waarde: 2, label: 'Dinsdag' },
  { waarde: 3, label: 'Woensdag' },
  { waarde: 4, label: 'Donderdag' },
  { waarde: 5, label: 'Vrijdag' },
  { waarde: 6, label: 'Zaterdag' },
  { waarde: 0, label: 'Zondag' },
];

export function huddledagLabel(dag: number): string {
  return HUDDLEDAGEN.find((d) => d.waarde === dag)?.label ?? 'Zondag';
}
