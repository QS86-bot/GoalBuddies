import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { overzichtsuur } from '../../src/modules/notifications/regels';
import { closableUserCycle, previousCycle, userCycle } from '../../src/shared/time/cycle';
import { GRACE_HOURS, type UserClock } from '../../src/shared/time/types';

/**
 * "Een weekpas heeft je reeks gered" bereikt je ook zonder de app te openen — QS8-202.
 *
 * ⚠️ **De variant zonder kapot onderdeel.** De rollover verbruikt de pas en
 *    schrijft `week_pass_events`; het dashboard toont een privéblok; de
 *    meldingen-job stuurt op diezelfde dag het weekoverzicht. Elk schakeltje af,
 *    en de keten liep nergens door: wie de app die week niet opende, hoorde het
 *    nooit. Er was niets rood te maken, want er was niets stuk — regel 18,
 *    vraag 5.
 *
 * ⚠️ **En de tegenovergestelde fout is hier de gevaarlijkste.** Een verbruikte
 *    weekpas ís het bewijs van een gemiste week (domeinregel 7). Deze melding
 *    mag daarom nergens anders heen dan naar de apparaten van de eigenaar, en de
 *    zin mag in geen enkel groepsoppervlak opduiken.
 *
 * ⚠️ Met de hand rood gemaakt, per grendel apart:
 *    1. `weekpasVerbruikt(...)` uit de job gehaald  → grendel 1 rood.
 *    2. `soort: 'cycle_summary'` vervangen door de
 *       tekstsleutel                                → grendel 2 rood.
 *    3. de weekpas-zin in `nl.ts` gezet             → grendel 3 rood.
 */
const WORTEL = fileURLToPath(new URL('../..', import.meta.url));

const JOB = 'supabase/functions/notificaties/index.ts';

function bron(pad: string): string {
  return readFileSync(join(WORTEL, pad), 'utf8');
}

describe('de meldingen-job vraagt of er een weekpas verbruikt is', () => {
  const job = bron(JOB);

  // Grendel 1: de keten is verbonden.
  it('leest week_pass_events op de cyclusgrens', () => {
    expect(
      job,
      `${JOB} stuurt het weekoverzicht zonder te vragen of er een weekpas op ging. ` +
        'Dan hoort iemand die de app niet opent er nog steeds niets van, en dat is ' +
        'precies de bevinding van QS8-202.',
    ).toContain("from('week_pass_events')");

    expect(job).toContain("eq('event', 'spent')");
    expect(job, 'De vraag hoort over de nét afgesloten week te gaan.').toMatch(
      /weekpasVerbruikt\(db, profiel\.id, afgelopen\.startDate\)/,
    );
  });

  it('geeft het antwoord door aan het bericht', () => {
    expect(job).toMatch(/berichtVoor\('cycle_summary', \{ weekpasGered \}/);
  });

  // Grendel 2: de soort in de database blijft er een van de vier.
  it('schrijft geen vijfde soort naar notifications_sent', () => {
    // ⚠️ **De CHECK `notifications_sent_kind_bekend` (0053) kent er vier.** Zou
    //    de variant als soort meegaan, dan weigert Postgres de rij en gaat er
    //    géén enkele melding meer uit — een storing die pas op de cyclusgrens
    //    blijkt, bij de gebruiker die hem het hardst nodig heeft.
    expect(
      job,
      'De variant is een tekst en geen soort. `soort:` hoort `cycle_summary` te ' +
        'blijven.',
    ).not.toMatch(/soort:\s*'cycle_summary_weekpas'/);
    expect(job).toMatch(/soort:\s*'cycle_summary'/);
  });
});

/**
 * Grendel 3: de weekpas blijft bij de eigenaar.
 *
 * ⚠️ **De eerste versie van deze grendel deugde niet, en dat is het opschrijven
 *    waard.** Hij toetste dat de zin "Een weekpas heeft je reeks gered" nergens
 *    in de catalogus stond, en werd meteen rood — want die zin stáát daar, als
 *    `weekpas.gered`, voor het privéblok op het dashboard. Dat is precies de
 *    plek die QS8-202 *"de enige juiste"* noemt. De grendel toetste de
 *    aanwezigheid van een tekst in plaats van de belofte.
 *
 *    De belofte is smaller en scherper: een verbruikte weekpas is het bewijs van
 *    een gemiste week (domeinregel 7), dus hij hoort op geen enkel oppervlak dat
 *    een ánder ziet. Twee zulke oppervlakken zijn er, en allebei zijn ze te
 *    toetsen: de groepsschermen en de systeemberichten.
 */
/**
 * Componenten die een weekpas laten zien, rechtstreeks of via een ander.
 *
 * ⚠️ **De eerste versie van deze lijst had alleen `<Weekpas`, en dat was het
 *    verkeerde slot.** `<Weekpas>` staat in de hele app in geen enkel scherm; hij
 *    wordt gerenderd dóór `DoelStandKaart`. Wie die kaart op een groepsscherm
 *    hergebruikt om de stand van een medelid te tonen — de meest voor de hand
 *    liggende hergebruik die er is — zet daarmee de weekpas-status van dat lid op
 *    een groepsoppervlak, en deze grendel bleef groen. Gevonden in de
 *    security-review van 03-09-2026.
 *
 * ⚠️ Dit blijft een bronscan en dus een benadering. **De echte grendel staat in de
 *    database**, en die staat er: `week_pass_events_select` (0003, herzien in
 *    0122) geeft alleen rijen met `user_id = auth.uid()`, en
 *    `tests/rls/weekpassen.test.ts` toetst dat. Een scherm dat het tóch probeert,
 *    krijgt niets. Deze lijst vangt de fout een laag eerder, waar hij nog leesbaar
 *    is.
 */
const TONEN_EEN_WEEKPAS = ['<Weekpas', '<DoelStandKaart'];

/** Elk scherm dat gegevens van een ander laat zien. */
function groepsschermen(): readonly string[] {
  const uit: string[] = [];
  const loop = (map: string): void => {
    for (const naam of readdirSync(join(WORTEL, map))) {
      const pad = join(map, naam);
      if (statSync(join(WORTEL, pad)).isDirectory()) loop(pad);
      else if (/\.tsx$/.test(naam)) uit.push(pad.split('\\').join('/'));
    }
  };

  loop(join('app', 'groep'));
  return [...uit, 'app/overzicht.tsx', 'app/beoordelen.tsx'];
}

const GROEPSSCHERMEN = groepsschermen();

describe('de weekpas komt op geen enkel groepsoppervlak', () => {
  it('vindt alle groepsschermen, ook de nieuwe', () => {
    // ⚠️ De lijst wordt uit de map gelezen en niet overgetypt. Een nieuw scherm
    //    onder `app/groep/` valt er anders automatisch buiten, en dat is precies
    //    het gat dat een hardgecodeerde lijst maakt.
    expect(GROEPSSCHERMEN.length).toBeGreaterThan(6);
    expect(GROEPSSCHERMEN).toContain('app/groep/leden/[id].tsx');
  });

  for (const pad of GROEPSSCHERMEN) {
    it(`${pad} toont geen weekpas`, () => {
      const tekst = bron(pad);

      for (const component of TONEN_EEN_WEEKPAS) {
        expect(
          tekst,
          `${pad} is een scherm dat andermans gegevens toont, en ${component} laat ` +
            'een weekpas zien. Die hoort daar niet: hij is het bewijs van een ' +
            'gemiste week.',
        ).not.toContain(component);
      }

      expect(tekst).not.toMatch(/t\('weekpas\./);
    });
  }

  it('is geen systeembericht en dus geen chatregel', () => {
    // ⚠️ De CHECK `chat_messages_system_event_bekend` is een allowlist en geldt
    //    ook voor `service_role`. Een systeembericht over een weekpas zou een
    //    gemiste week in de groepschat zetten.
    const schemas = bron('src/modules/buddies/chat-schemas.ts').toLowerCase();

    expect(schemas).not.toContain('week_pass');
    expect(schemas).not.toContain('weekpas');
  });

});


/**
 * Op het uur dat het overzicht valt, ís de week al afgeschreven — QS8-202.
 *
 * ⚠️ **Dit is de test die er niet was, en de fout die daardoor niemand zag.** De
 *    eerste versie van QS8-202 vroeg om 9:00 of er een weekpas verbruikt was, en
 *    de rollover schrijft een gemiste week pas ná de coulanceperiode van twaalf
 *    uur af. Het antwoord was dus altijd nee, voor iedereen die nooit een
 *    herinneringstijd instelde — de standaardsituatie. En de ontdubbeling op
 *    `(user_id, kind, local_date)` liet die dag geen tweede melding meer toe, dus
 *    de gebruiker hoorde het alsnog nooit: precies de klacht waar dit issue voor
 *    bestaat, in een nieuwe vorm.
 *
 *    De belofte-tests eromheen bleven groen, want die toetsen of de juiste woorden
 *    in het juiste bestand staan. Geen enkele raakte de tijd. Gevonden in de
 *    security-review van 03-09-2026.
 *
 * ⚠️ **Deze test rekent met de échte helpers en niet met een nagebouwde klok.**
 *    Een reproductie die zelf uitrekent wanneer de coulanceperiode eindigt, toetst
 *    zijn eigen aanname; `closableUserCycle()` is wat de rollover gebruikt.
 *
 * ⚠️ Met de hand rood gemaakt door `overzichtsuur()` weer `herinneringUur ?? 9`
 *    te laten geven.
 */
describe('de weekpas is verbruikt op het uur dat het overzicht valt', () => {
  const KLOK: UserClock = { weekStartDay: 1, tz: 'UTC' };

  /** Zou de rollover de zojuist afgesloten week op dit uur al afgeschreven hebben? */
  function isAfgeschreven(uur: number): boolean {
    // Maandag 07-09-2026 is een week-start bij `weekStartDay: 1`.
    const at = new Date(`2026-09-07T${String(uur).padStart(2, '0')}:00:00Z`);
    const afgelopen = previousCycle(userCycle(KLOK, at));

    // Zo filtert `rollover/index.ts`: `.lt('cycle_start_date', afsluitbaar.startDate)`.
    return afgelopen.startDate < closableUserCycle(KLOK, at).startDate;
  }

  it('meet dat de coulanceperiode het probleem was', () => {
    // ⚠️ De meting die de bevinding draagt. Vóór het grensuur is er niets te
    //    vinden, hoe correct de rest van de keten ook is.
    expect(isAfgeschreven(9)).toBe(false);
    expect(isAfgeschreven(GRACE_HOURS - 1)).toBe(false);
  });

  it('gaat om het gekozen uur wél op, voor elke herinneringstijd', () => {
    for (const herinneringUur of [null, 0, 7, 9, 11, 12, 20, 23]) {
      expect(
        isAfgeschreven(overzichtsuur(herinneringUur, GRACE_HOURS)),
        `Op uur ${overzichtsuur(herinneringUur, GRACE_HOURS)} is de week nog niet ` +
          'afgeschreven, dus kan er geen verbruikte weekpas gevonden worden. Dan ' +
          'stuurt de job het gewone overzicht en komt er die dag niets meer.',
      ).toBe(true);
    }
  });

  it('valt nog op dezelfde dag, anders slaat de tijdvoorwaarde nooit aan', () => {
    // ⚠️ `cyclus.startDate === lokaleDatum` staat naast het uur. Een uur boven de
    //    23 zou betekenen dat het bericht nooit valt.
    for (const herinneringUur of [null, 9, 20, 23]) {
      expect(overzichtsuur(herinneringUur, GRACE_HOURS)).toBeLessThanOrEqual(23);
    }
  });

  it('de standaard van overzichtsuur loopt gelijk met GRACE_HOURS', () => {
    // ⚠️ `regels.ts` heeft geen imports, want hij gaat via `edge:sync` naar Deno.
    //    De 12 staat daar dus als getal. Deze test is de grendel op die kopie.
    expect(overzichtsuur(0)).toBe(GRACE_HOURS);
  });

  it('de job vraagt het uur aan overzichtsuur en rekent het niet zelf uit', () => {
    expect(
      bron(JOB),
      `${JOB} rekent het overzichtsuur zelf uit. Dan staat de coulanceperiode op ` +
        'twee plekken en loopt er een uit de pas.',
    ).toMatch(/overzichtsuur\(uurUit\(profiel\.reminder_time\), GRACE_HOURS\)/);
  });
});
