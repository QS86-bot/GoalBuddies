import { describe, expect, it } from 'vitest';

import { psql, psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een melding komt aan — QS8-586, migratie 0296.
 *
 * ⚠️ **De belofte is niet "er is een RPC".** Het is: *een melding die iemand
 *    doet, belandt bij iemand die hem kan afhandelen.* Dat is een eigenschap van
 *    de kéten, en precies de klasse van onwrikbare regel 18 vraag 5 — elk
 *    schakeltje af, de keten onderbroken.
 *
 * 📏 **De toestand vóór 0296, met echte rijen gemeten:** `reports` had een
 *    schrijfpad (`meld()`), policies, indexen, kolomgrants en spoofing-grendels
 *    — en **nul** lezers van de inhoud. `meldingen_over()` leest de tabel wel,
 *    maar telt je eigen meldingen voor het dagquotum en geeft een `integer`
 *    terug.
 *
 * ⚠️⚠️ **En het geval dat de vorm van 0296 bepaalde.** `reports_select` is
 *    `reporter_id = auth.uid() OR (is_group_admin(group_id) AND subject_id <> auth.uid())`.
 *    Een melding **over de groepsbeheerder** kwam dus bij niemand aan die kon
 *    handelen:
 *
 *      melden gaf                          {"ok": true}
 *      de MELDER ziet                      1 melding
 *      de BEHEERDER (het onderwerp) ziet   0 meldingen
 *
 *    In een groep met onbekenden — het besluit van 22-09 op QS8-230 — is dat
 *    precies het geval dat het zwaarst weegt.
 *
 * ⚠️ Deze toetsen draaien via `psql` met `set local role authenticated` en niet
 *    via PostgREST, want ze gaan over wie wát ziet in de database. Alles staat in
 *    één teruggerolde transactie; er blijft niets achter.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'openstaande_meldingen'",
  import.meta.url,
);

/** Zet drie gebruikers, een groep en een melding neer. Rolt alles terug. */
function proef(regels: string[]): string {
  return psqlMetInvoer(
    [
      'begin;',
      "select set_config('p.beheerder', public.shim_maak_gebruiker('b586@proef.nl','Beheerder')::text, true);",
      "select set_config('p.melder',    public.shim_maak_gebruiker('m586@proef.nl','Melder')::text, true);",
      "select set_config('p.lid',       public.shim_maak_gebruiker('l586@proef.nl','Lid')::text, true);",
      "select set_config('p.platform',  public.shim_maak_gebruiker('x586@proef.nl','Platform')::text, true);",
      "update public.profiles set platform_beheerder = true where id = current_setting('p.platform')::uuid;",
      "select set_config('request.jwt.claim.sub', current_setting('p.beheerder'), true);",
      'set local role authenticated;',
      "select set_config('p.groep', (public.create_group('Proefgroep586'::text))->'group'->>'id', true);",
      'reset role;',
      'insert into public.group_members(group_id, user_id, role, status) values',
      "  (current_setting('p.groep')::uuid, current_setting('p.melder')::uuid, 'member', 'active'),",
      "  (current_setting('p.groep')::uuid, current_setting('p.lid')::uuid,    'member', 'active');",
      ...regels,
      'rollback;',
    ].join('\n'),
  );
}

/** Leest één `SLEUTEL=waarde`-regel uit de psql-uitvoer. */
function lees(uit: string, sleutel: string): string | undefined {
  return uit
    .split('\n')
    .map((r) => r.trim())
    .find((r) => r.startsWith(`${sleutel}=`))
    ?.slice(sleutel.length + 1);
}

/** Wisselt van gebruiker binnen de proef. */
function als(wie: string): string[] {
  return [`select set_config('request.jwt.claim.sub', current_setting('p.${wie}'), true);`, 'set local role authenticated;'];
}

describe.skipIf(!beschikbaar)('een melding komt aan', () => {
  /**
   * ⚠️⚠️ **Dit is de toets die het issue draagt.** Hij is geschreven ná de
   *    meting dat het gat er was, en hij wordt rood zodra de escalatieroute
   *    verdwijnt — dan komt een melding over de beheerder weer nergens aan.
   */
  it('een melding over de groepsbeheerder bereikt de platformbeheerder, en niemand anders', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.beheerder')::uuid, null, 'spam', 'doet naar');",
      "select 'MELDER=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
      ...als('beheerder'),
      "select 'ONDERWERP=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
      ...als('lid'),
      "select 'ANDER_LID=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
      ...als('platform'),
      "select 'PLATFORM=' || count(*) from public.openstaande_meldingen();",
      "select 'ESCALATIE=' || coalesce((select via_escalatie::text from public.openstaande_meldingen() limit 1), '-');",
      'reset role;',
    ]);

    expect(lees(uit, 'PLATFORM'), 'de escalatieroute is de enige die dit geval kan afhandelen').toBe('1');
    expect(lees(uit, 'ESCALATIE'), 'de lezer hoort te zeggen dát dit een escalatie is').toBe('true');

    // ⚠️ De drie must-nots. Zonder deze helft is "de platformbeheerder ziet hem"
    //    ook waar als iedereen hem ziet, en dan is dit geen grendel maar een lek.
    expect(lees(uit, 'ONDERWERP'), 'het onderwerp mag een melding over zichzelf nooit zien').toBe('0');
    expect(lees(uit, 'ANDER_LID'), 'een gewoon groepslid is geen moderator').toBe('0');
    expect(lees(uit, 'MELDER'), 'de melder mag zijn eigen melding zien via reports_select, maar is geen moderator — de lezer is voor afhandelen').toBe('0');
  }, 60_000);

  it('een gewone melding bereikt de groepsbeheerder, en de escalatie blijft smal', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'harassment', 'scheldt');",
      'reset role;',
      ...als('beheerder'),
      "select 'BEHEERDER=' || count(*) from public.openstaande_meldingen();",
      "select 'TELLING=' || coalesce((select meldingen_over_onderwerp::text from public.openstaande_meldingen() limit 1), '-');",
      'reset role;',
      ...als('platform'),
      "select 'PLATFORM=' || count(*) from public.openstaande_meldingen();",
      'reset role;',
    ]);

    expect(lees(uit, 'BEHEERDER'), 'hier kan de groep zelf bij — dat is de gewone route').toBe('1');
    expect(lees(uit, 'TELLING'), 'de lezer telt hoeveel meldingen er over dit onderwerp openstaan').toBe('1');

    // ⚠️ **Dit is de belangrijkste must-not van 0296.** De platformbeheerder ziet
    //    met opzet níet alles: alleen wat de groep aantoonbaar niet kan
    //    afhandelen. Wordt dit `1`, dan leest één account elke melding in elke
    //    groep, en dat is een privacybelofte die niemand gedaan heeft.
    expect(lees(uit, 'PLATFORM'), 'de escalatie is smal — de platformbeheerder is geen moderatiedienst').toBe('0');
  }, 60_000);

  it('afhandelen kan één keer, door wie het mag, en alleen naar een geldige stand', () => {
    const uit = proef([
      ...als('melder'),
      "select public.meld(current_setting('p.groep')::uuid, current_setting('p.lid')::uuid, null, 'spam', null);",
      'reset role;',
      ...als('platform'),
      "select 'PLATFORM_MAG_NIET=' || ((public.handel_melding_af((select id from public.reports limit 1), 'reviewed'))->>'reason');",
      'reset role;',
      ...als('melder'),
      "select 'MELDER_MAG_NIET=' || ((public.handel_melding_af((select id from public.reports limit 1), 'reviewed'))->>'reason');",
      'reset role;',
      ...als('beheerder'),
      "select 'ONGELDIG=' || ((public.handel_melding_af((select id from public.reports limit 1), 'open'))->>'reason');",
      "select 'EERSTE=' || ((public.handel_melding_af((select id from public.reports limit 1), 'reviewed'))->>'ok');",
      "select 'TWEEDE=' || ((public.handel_melding_af((select id from public.reports limit 1), 'dismissed'))->>'reason');",
      'reset role;',
      "select 'SPOOR=' || (select (afgehandeld_door is not null and afgehandeld_op is not null)::text from public.reports limit 1);",
      "select 'WEG_UIT_DE_LIJST=' || (select count(*)::text from public.reports where status = 'open');",
    ]);

    expect(lees(uit, 'PLATFORM_MAG_NIET'), 'de platformbeheerder mag alleen geëscaleerde gevallen aanraken').toBe('not_allowed');
    expect(lees(uit, 'MELDER_MAG_NIET'), 'melden is geen beoordelen').toBe('not_allowed');
    expect(lees(uit, 'ONGELDIG'), "'open' is geen afhandeling").toBe('status_invalid');
    expect(lees(uit, 'EERSTE'), 'de beheerder handelt zijn eigen groep af').toBe('true');
    expect(
      lees(uit, 'TWEEDE'),
      'een tweede oordeel zou `afgehandeld_door` overschrijven, en dan is dat niet meer wie het besloot',
    ).toBe('already_handled');
    expect(lees(uit, 'SPOOR'), 'een afhandeling zonder wie en wanneer is administratie, geen bewijs').toBe('true');
    expect(lees(uit, 'WEG_UIT_DE_LIJST'), 'een afgehandelde melding staat niet meer open').toBe('0');
  }, 60_000);

  /**
   * ⚠️ **Een kolombelofte, en die is niet met RLS te maken.** *RLS kan geen
   *    kolommen beperken* — dus dat `reporter_id` niet meegaat, is een
   *    eigenschap van de **returntabel** van deze functie en van niets anders.
   *    Een `select *` erbij zou hem stilzwijgend terugbrengen.
   */
  it('de lezer geeft `reporter_id` niet terug — wie meldde is niet nodig om te beoordelen', () => {
    const kolommen = psql(
      "select string_agg(a.attname, ',' order by a.attnum) " +
        'from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, attmode, attnum) ' +
        "where p.oid = 'public.openstaande_meldingen(integer, timestamptz, uuid)'::regprocedure " +
        "and a.attmode = 't';",
    ).trim();

    expect(kolommen, 'de returnkolommen horen leesbaar te zijn in deze toets').toContain('reden');
    expect(
      kolommen,
      'wie er meldde hoort niet bij de beoordeling, en weglaten beschermt de melder tegen een beheerder die het hem betaald zet',
    ).not.toContain('reporter_id');
  }, 30_000);
});
