import { describe, expect, it } from 'vitest';

import { ALLOWLIST, beoordeel, normaliseer } from '../../scripts/adviseur-controle.mjs';

/**
 * `adviseur:controle` legt Supabase' eigen linter naast een allowlist — QS8-235.
 *
 * ⚠️ **Waarom dit bestand bestaat.** Op 24-08 bleek `tekst:controle`
 *    maandenlang nul te melden terwijl er zeven onvertaalde zinnen in één scherm
 *    stonden. De heuristieken waren niet slecht; ze waren nooit tegen een bekend
 *    geval gelegd. Sinds QS8-115 heeft elk script dat een regel bewaakt daarom
 *    een geëxporteerde functie en een test die hem élke vorm los aanbiedt — de
 *    vormen die hij moet vinden én de vormen die hij met rust moet laten.
 *
 * ⚠️ **Die tweede helft is even belangrijk.** Een controle die alles meldt,
 *    leert je hem te negeren, en dan is hij erger dan geen controle.
 */

/** Eén bevinding zoals de linter hem teruggeeft. */
function bevinding(over: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'rls_enabled_no_policy',
    level: 'INFO',
    detail: 'Table `public.iets` has RLS enabled, but no policies exist',
    cache_key: 'rls_enabled_no_policy_public_iets',
    ...over,
  };
}

/**
 * De bevindingen die met een eigen sleutel op de lijst staan.
 *
 * ⚠️⚠️ **Deze lijst is op 24-09-2026 bijgewerkt en dat is een meting, geen
 *    reparatie.** 📏 De audit van die dag haalde de adviseur op via de MCP:
 *    `public.mijn_doelvelden` (0236) en `public.dagtellers` (0233/0234) landden
 *    op **17-09** en stonden er een week later nog niet op, terwijl de linter ze
 *    allebei meldde. Niets werd daar rood van, want `adviseur:controle` vraagt
 *    een token en draait niet in CI. `adviseurdrift:controle` (QS8-597) dekt die
 *    twee klassen sindsdien vanuit de migratiemap.
 */
const BEKENDE_SLEUTELS = [
  'security_definer_view_public_mijn_profiel',
  'security_definer_view_public_group_visible_streaks',
  'security_definer_view_public_mijn_doelvelden',
  'rls_enabled_no_policy_public_invite_events',
  'rls_enabled_no_policy_public_invite_preview_limits',
  'rls_enabled_no_policy_public_dagtellers',
  'auth_leaked_password_protection',
];

/**
 * De gemeten stand van 24-09-2026: alles verklaard, niets te ruim.
 *
 * 📏 Zeven bevindingen met een eigen sleutel, één oningelogde definer-functie
 *    (`invite_preview`) en **76** die `authenticated` mag aanroepen. Dat laatste
 *    getal stond tot deze dag op 47 en is met 29 overschreden zonder dat iemand
 *    het zag.
 *
 * ⚠️ `auth_leaked_password_protection` zit er nog in en de échte adviseur meldt
 *    hem op 24-09 **niet** meer. Dat is met opzet niet uit de allowlist gehaald:
 *    *niet meer gerapporteerd* is niet hetzelfde als *gerepareerd* (QS8-411), en
 *    het verschil is een schakelaar in het dashboard die geen sessie hier kan
 *    lezen. Deze fixture beschrijft dus de stand zoals de lijst hem verwacht,
 *    niet wat de linter vandaag toevallig teruggeeft.
 */
function gemetenStand() {
  const rijen = BEKENDE_SLEUTELS.map((cache_key) => bevinding({ cache_key }));
  rijen.push(
    bevinding({
      name: 'anon_security_definer_function_executable',
      cache_key: 'anon_security_definer_function_executable_public_invite_preview_code text',
    }),
  );
  for (let i = 0; i < 76; i += 1) {
    rijen.push(
      bevinding({
        name: 'authenticated_security_definer_function_executable',
        cache_key: `authenticated_security_definer_function_executable_public_f${i}_`,
      }),
    );
  }
  return rijen;
}

describe('normaliseer', () => {
  it('kent de vorm van de Management API', () => {
    expect(normaliseer({ lints: [bevinding()] })).toHaveLength(1);
  });

  it('kent de vorm van de MCP-tool', () => {
    expect(normaliseer({ result: { lints: [bevinding()] } })).toHaveLength(1);
  });

  it('kent een kale array', () => {
    expect(normaliseer([bevinding()])).toHaveLength(1);
  });

  it.each([
    ['null', null],
    ['een string', 'kapot'],
    ['een leeg object', {}],
    ['een foutantwoord', { error: 'unauthorized' }],
    ['lints dat geen array is', { lints: 'nee' }],
  ])('werpt bij %s in plaats van nul bevindingen te melden', (_naam, invoer) => {
    // ⚠️ Dit is de belangrijkste toets van dit blok. "Nul bevindingen" is groen
    //    en "ik snapte het antwoord niet" mag dat nooit worden. Een controle die
    //    stilvalt bij een gewijzigd antwoordformaat, meldt jarenlang niets en
    //    ziet eruit alsof alles klopt.
    expect(() => normaliseer(invoer)).toThrow();
  });
});

describe('beoordeel — wat er met rust gelaten moet worden', () => {
  it('meldt niets bij de gemeten stand van 24-09-2026', () => {
    const { onverwacht, verouderd } = beoordeel(gemetenStand(), ALLOWLIST);
    expect(onverwacht).toEqual([]);
    expect(verouderd).toEqual([]);
  });

  it('laat een bevinding met een eigen sleutel door, ongeacht zijn niveau', () => {
    const rijen = gemetenStand().map((r) =>
      r.cache_key === 'security_definer_view_public_mijn_profiel' ? { ...r, level: 'ERROR' } : r,
    );
    expect(beoordeel(rijen, ALLOWLIST).onverwacht).toEqual([]);
  });
});

describe('beoordeel — wat er gevonden moet worden', () => {
  it('meldt een bevinding die op geen enkele regel past', () => {
    const rijen = [
      ...gemetenStand(),
      bevinding({
        name: 'policy_exists_rls_disabled',
        level: 'ERROR',
        cache_key: 'policy_exists_rls_disabled_public_nieuw',
        detail: 'Table `public.nieuw` has policies but RLS is not enabled',
      }),
    ];
    const { onverwacht } = beoordeel(rijen, ALLOWLIST);
    expect(onverwacht).toHaveLength(1);
    expect(onverwacht.at(0)?.sleutel).toBe('policy_exists_rls_disabled_public_nieuw');
  });

  it('meldt een nieuwe tabel met RLS zonder policy, ook al staat die regel al op de lijst', () => {
    // ⚠️ De regel `rls_enabled_no_policy` staat twee keer op de lijst — met een
    //    éígen sleutel per tabel, niet als groep. Een dérde tabel is dus een
    //    nieuw besluit en geen herhaling. Dit is de reden dat die vorm bestaat
    //    naast `hoogstens`.
    const rijen = [
      ...gemetenStand(),
      bevinding({ cache_key: 'rls_enabled_no_policy_public_nog_een_tabel' }),
    ];
    expect(beoordeel(rijen, ALLOWLIST).onverwacht).toHaveLength(1);
  });

  it('meldt een tweede oningelogde functie — de ratel op hoogstens 1', () => {
    const rijen = [
      ...gemetenStand(),
      bevinding({
        name: 'anon_security_definer_function_executable',
        cache_key: 'anon_security_definer_function_executable_public_iets_anders_',
      }),
    ];
    const { onverwacht } = beoordeel(rijen, ALLOWLIST);
    expect(onverwacht).toHaveLength(1);
    expect(onverwacht.at(0)?.niveau).toBe('RATEL');
    expect(onverwacht.at(0)?.detail).toContain('hoogstens 1');
  });

  it('meldt een 77e definer-functie', () => {
    const rijen = [
      ...gemetenStand(),
      bevinding({
        name: 'authenticated_security_definer_function_executable',
        cache_key: 'authenticated_security_definer_function_executable_public_f99_',
      }),
    ];
    const { onverwacht } = beoordeel(rijen, ALLOWLIST);
    expect(onverwacht).toHaveLength(1);
    expect(onverwacht.at(0)?.detail).toContain('77 keer');
  });
});

describe('beoordeel — de lijst rot ook de andere kant op', () => {
  it('meldt een uitzondering die niets meer aanwijst', () => {
    const rijen = gemetenStand().filter(
      (r) => r.cache_key !== 'auth_leaked_password_protection',
    );
    const { onverwacht, verouderd } = beoordeel(rijen, ALLOWLIST);
    expect(onverwacht).toEqual([]);
    expect(verouderd).toEqual([
      expect.objectContaining({ soort: 'ongebruikt', sleutel: 'auth_leaked_password_protection' }),
    ]);
  });

  it('meldt een ratel die te ruim staat', () => {
    // ⚠️ Zakt het aantal definer-functies, dan hoort het getal mee te zakken.
    //    Zonder deze helft is `hoogstens` geen ratel maar een plafond waar je
    //    onder kunt blijven zitten — en dan legt niemand ooit meer vast wat de
    //    stand is.
    const rijen = gemetenStand().filter(
      (r, i) => r.name !== 'authenticated_security_definer_function_executable' || i % 2 === 0,
    );
    const { verouderd } = beoordeel(rijen, ALLOWLIST);
    expect(verouderd).toEqual([
      expect.objectContaining({
        soort: 'te-ruim',
        sleutel: 'authenticated_security_definer_function_executable',
      }),
    ]);
  });
});

describe('de allowlist zelf', () => {
  it('geeft elke regel een reden die iets zegt', () => {
    for (const regel of ALLOWLIST) {
      // Een lege reden is geen reden — dat staat ook in de foutmelding van het
      // script, en hier staat het onder test.
      expect(regel.reden.length, JSON.stringify(regel)).toBeGreaterThan(40);
    }
  });

  it('gebruikt óf een sleutel óf een regel met een maximum, nooit allebei', () => {
    for (const regel of ALLOWLIST) {
      const heeftSleutel = typeof regel.sleutel === 'string';
      const heeftRegel = typeof regel.regel === 'string';
      expect(heeftSleutel !== heeftRegel, JSON.stringify(regel)).toBe(true);
      if (heeftRegel) expect(typeof regel.hoogstens).toBe('number');
    }
  });
});
