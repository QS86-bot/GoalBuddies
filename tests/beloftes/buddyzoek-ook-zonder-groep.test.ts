import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

/**
 * Wie nog geen groep heeft, ziet de buddyzoekkaart — QS8-643.
 *
 * ⚠️⚠️ **De keten liep niet, terwijl elk onderdeel klopte** (regel 18, vraag 5).
 *    `<Buddyzoek>` stond in `Inhoud`, en die rendert alleen als de `AsyncView` van
 *    `Samen()` niet leeg is. Leeg betekent daar: geen eigen groepen en dit doel
 *    nergens gekoppeld. Dan toont `AsyncView` alleen zijn lege staat — en wie
 *    nieuw is en onbekenden zoekt, is precies die gebruiker. 📏 Gelezen in
 *    `src/shared/ui` (`AsyncView`: `if (data === undefined || isEmpty(data))
 *    return <EmptyState …/>`).
 *
 * ⚠️ **Deze toets grijpt naar een plek, en dat is een bekende zwakte** (regel 18,
 *    vraag 4). Er is in dit project geen renderer voor schermen; de toets leest
 *    het bronbestand zonder commentaar. Verhuist de kaart naar een ander
 *    bestand, dan hoort deze toets mee te verhuizen.
 *
 * Met de hand gebroken (📏 17-11-2026): `<Buddyzoek …/>` terug in `Inhoud` →
 * beide toetsen in de eerste `describe` rood.
 */

const BRON = zonderCommentaar(
  readFileSync(join(__dirname, '..', '..', 'app', 'doel', 'samen.tsx'), 'utf8'),
);

/** Het lichaam van één functie op het hoogste niveau, tot de eerstvolgende `}` op kolom 0. */
function lichaam(kop: string): string {
  const start = BRON.indexOf(kop);
  if (start < 0) throw new Error(`niet gevonden: ${kop}`);
  const eind = BRON.indexOf('\n}\n', start);
  return BRON.slice(start, eind < 0 ? undefined : eind);
}

describe('de buddyzoekkaart staat buiten de AsyncView van Samen()', () => {
  it('Samen() rendert <Buddyzoek> ná de AsyncView en niet erbinnen', () => {
    const samen = lichaam('export default function Samen(');
    const kaart = samen.indexOf('<Buddyzoek ');
    const sluit = samen.indexOf('</AsyncView>');

    expect(kaart).toBeGreaterThan(-1);
    expect(sluit).toBeGreaterThan(-1);
    expect(kaart).toBeGreaterThan(sluit);
  });

  it('Inhoud, dat alleen met groepen rendert, draagt hem niet', () => {
    expect(lichaam('function Inhoud(')).not.toContain('<Buddyzoek');
  });
});

const KAART = zonderCommentaar(
  readFileSync(join(__dirname, '..', '..', 'src', 'shared', 'ui', 'GroepsKaart.tsx'), 'utf8'),
);

describe('een verlopen zoekopdracht leidt ergens naartoe', () => {
  it('de verlopen staat heeft een knop naar alle groepen, en de alternatieven gebruiken de gedeelde kaart', () => {
    expect(lichaam('function Verlopen(')).toContain("router.push('/groep/ontdek')");
    expect(lichaam('function Alternatieven(')).toContain('<GroepsKaart');
    // ⚠️ Geen eigen kopie meer die met één tik verstuurt (code-review op QS8-643).
    expect(BRON).not.toMatch(/vraagLidmaatschapAan\([^)]*''\)/);
  });

  it('de alternatieven hebben een lege staat met een zin, en geen witruimte', () => {
    const alternatieven = lichaam('function Alternatieven(');
    expect(alternatieven).toContain("t('buddyzoek.alternatief_geen_titel')");
    expect(alternatieven).toContain('isEmpty=');
  });
});

/**
 * ⚠️⚠️ **Een aanvraag is niet in te trekken, dus één tik verstuurt hem niet.** De
 *    knop "Vraag lidmaatschap aan" opent het formulier; pas "Versturen" roept
 *    `onVraagAan` aan. Met de hand gebroken (📏 17-11-2026): de eerste knop
 *    `onVraagAan('')` laten aanroepen → beide toetsen hieronder rood.
 */
describe('GroepsKaart vraagt in twee stappen aan', () => {
  it('de aanvraagknop opent alleen het formulier', () => {
    const knop = /onPress=\{([^}]*)\}>\s*\{t\('ontdek\.aanvragen'\)\}/.exec(KAART);
    expect(knop?.[1]).toBe('() => setOpen(true)');
  });

  it('onVraagAan staat alleen in verstuur()', () => {
    const aanroepen = KAART.match(/onVraagAan\(/g) ?? [];
    expect(aanroepen).toHaveLength(1);
    expect(lichaamIn(KAART, 'async function verstuur(')).toContain('onVraagAan(');
  });
});

function lichaamIn(bron: string, kop: string): string {
  const start = bron.indexOf(kop);
  if (start < 0) throw new Error(`niet gevonden: ${kop}`);
  return bron.slice(start, bron.indexOf('\n  }\n', start));
}
