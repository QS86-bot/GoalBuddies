import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';
import { en } from '../../src/shared/i18n/en';
import { nl } from '../../src/shared/i18n/nl';

/**
 * De uitnodigingskaart is verbonden met de schakelaar — QS8-666 (A57), deel 3b, regel 18 vraag 5.
 *
 * ⚠️ **De belofte is "er is geen tweede weg om het klassement aan te zetten".** Elk schakeltje is af: de kaart, de
 *    route, de schakelaar. De keten breekt als de kaart ergens anders heen wijst of zelf de RPC aanroept; deze toets
 *    legt de twee uiteinden vast, en dat verhuist mee met de bestanden.
 *
 * IJKING (met de hand, 22-11-2026): in de kaart `router.push` op een andere route zetten -> 'wijst naar Groepsbeheer'
 * valt om; `<KlassementSchakelaar` uit het beheerscherm halen -> 'Groepsbeheer rendert de schakelaar' valt om;
 * `zetGroepsklassement(` in de kaart zetten -> 'geen eigen aanroep' valt om.
 */
const lees = (pad: string) => zonderCommentaar(readFileSync(join(__dirname, '../..', pad), 'utf8'));
const kaart = lees('src/schermen/groep/KlassementUitnodiging.tsx');
const beheer = lees('app/groep/beheer/[id].tsx');
const api = lees('src/modules/buddies/api.ts');

describe('uitnodigingskaart naar schakelaar', () => {
  it('wijst naar Groepsbeheer van deze groep', () => {
    expect(kaart).toMatch(/router\.push\(`\/groep\/beheer\/\$\{groupId\}`\)/);
  });

  it('Groepsbeheer rendert de schakelaar waar de kaart naartoe wijst', () => {
    expect(beheer).toMatch(/<KlassementSchakelaar/);
  });

  it('de kaart doet geen eigen aanroep en heeft geen wegklikknop', () => {
    expect(kaart).not.toMatch(/zetGroepsklassement|rpc\(|supabase/);
    expect(kaart.match(/<Button/g)).toHaveLength(1);
  });

  it('het scherm leest de groep met alle kolommen, zodat `klassement_aan` en `automatisch` er altijd zijn', () => {
    // Een ontbrekende kolom is `undefined`, en `!undefined` maakt van elke beheerder een uitnodiging.
    expect(api).toMatch(/export async function fetchGroep[\s\S]*?\.select\('\*'\)/);
  });

  it('de drie teksten bestaan in nl en en, zonder emoji', () => {
    for (const sleutel of ['klassement.uitnodiging_titel', 'klassement.uitnodiging_tekst', 'klassement.uitnodiging_knop'] as const) {
      expect(nl[sleutel], sleutel).toBeTruthy();
      expect(en[sleutel], sleutel).toBeTruthy();
      expect(/\p{Extended_Pictographic}/u.test(nl[sleutel] + en[sleutel])).toBe(false);
    }
  });

  it('de kaarttekst belooft alleen de gemiste week (besluit 2) en niets over een verlies', () => {
    expect(nl['klassement.uitnodiging_tekst']).toMatch(/gemiste week komt er nooit in voor/);
    expect(nl['klassement.uitnodiging_tekst']).not.toMatch(/verlies|verliest/);
  });
});
