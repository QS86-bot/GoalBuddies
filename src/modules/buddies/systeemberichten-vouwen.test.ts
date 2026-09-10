import { describe, expect, it } from 'vitest';

import type { TimeZone } from '../../shared/time';

import type { ChatBericht } from './chat-schemas';
import { gevouwenTekst, voegNamenSamen, vouwSysteemberichten } from './systeemberichten-vouwen';

/**
 * Systeemberichten samenvouwen — QS8-198.
 *
 * ⚠️ **De belofte is dichtheid en niet inhoud.** Er valt niets weg: elke
 *    gebeurtenis blijft zichtbaar, alleen op één regel in plaats van drie. Dat
 *    maakt dit oppervlak strikt stiller, en een oppervlak dat mínder toont kan
 *    domeinregel 7 niet verruimen.
 *
 * ⚠️ **De valkuil die 0070 al eens omzeild heeft, staat hier onder test.** Een
 *    samenvatting die vóórwaardelijk is, maakt van de afwezigheid een signaal:
 *    verschijnt een regel alleen als iedereen meedeed, dan vertelt het uitblijven
 *    ervan dat er iemand ontbrak. Deze vouw is onvoorwaardelijk — dat is de test
 *    "vouwt ongeacht wie erin staat".
 */

const TZ = 'Europe/Amsterdam' as TimeZone;

function systeembericht(
  id: string,
  event: string,
  subject: string | null,
  created_at: string,
  actor: string | null = null,
): ChatBericht {
  return {
    id,
    sender_id: null,
    sender_name: '',
    sender_avatar: null,
    body: 'terugval',
    type: 'system',
    attachment_url: null,
    attachment_name: null,
    system_event: event,
    subject_name: subject,
    actor_name: actor,
    aantal: null,
    created_at,
    getallen: null,
  };
}

function mensbericht(id: string, created_at: string): ChatBericht {
  return {
    id,
    sender_id: 'u1',
    sender_name: 'Anna',
    sender_avatar: null,
    body: 'hoi',
    type: 'text',
    attachment_url: null,
    attachment_name: null,
    system_event: null,
    subject_name: null,
    actor_name: null,
    aantal: null,
    created_at,
    getallen: null,
  };
}

describe('systeemberichten samenvouwen', () => {
  it('vouwt drie gelijksoortige berichten van dezelfde dag tot één regel', () => {
    const uit = vouwSysteemberichten(
      [
        systeembericht('1', 'member_joined', 'Anna', '2026-09-01T09:00:00Z'),
        systeembericht('2', 'member_joined', 'Bram', '2026-09-01T10:00:00Z'),
        systeembericht('3', 'member_joined', 'Chris', '2026-09-01T11:00:00Z'),
      ],
      TZ,
    );

    expect(uit).toHaveLength(1);
    const regel = uit[0];
    expect(regel?.soort).toBe('gevouwen');
    if (regel?.soort !== 'gevouwen') throw new Error('geen gevouwen regel');

    expect(regel.namen).toEqual(['Anna', 'Bram', 'Chris']);
    expect(regel.aantal).toBe(3);
    expect(gevouwenTekst(regel)).toBe('Anna, Bram en Chris doen mee.');
  });

  it('laat twee berichten met rust', () => {
    // ⚠️ De tegenproef bij de drempel. Zonder haar is "vouwt drie" niet te
    //    onderscheiden van "vouwt altijd", en dan is elke losse gebeurtenis een
    //    lijst van één geworden.
    const uit = vouwSysteemberichten(
      [
        systeembericht('1', 'member_joined', 'Anna', '2026-09-01T09:00:00Z'),
        systeembericht('2', 'member_joined', 'Bram', '2026-09-01T10:00:00Z'),
      ],
      TZ,
    );

    expect(uit).toHaveLength(2);
    expect(uit.every((r) => r.soort === 'bericht')).toBe(true);
  });

  it('vouwt niet over een mensbericht heen', () => {
    // ⚠️ De volgorde is de belofte van een gesprek. Zou de vouw over een
    //    mensbericht springen, dan verschuift een antwoord naar boven of onder
    //    het bericht waar het op sloeg — en dat is erger dan ruis.
    const uit = vouwSysteemberichten(
      [
        systeembericht('1', 'member_joined', 'Anna', '2026-09-01T09:00:00Z'),
        systeembericht('2', 'member_joined', 'Bram', '2026-09-01T10:00:00Z'),
        mensbericht('m', '2026-09-01T10:30:00Z'),
        systeembericht('3', 'member_joined', 'Chris', '2026-09-01T11:00:00Z'),
      ],
      TZ,
    );

    expect(uit.map((r) => r.soort)).toEqual(['bericht', 'bericht', 'bericht', 'bericht']);
  });

  it('vouwt niet over een dagovergang heen', () => {
    // ⚠️ **De dag van de gróep, en dat is hier te meten.** 22:30 UTC is in
    //    Amsterdam al de volgende dag (UTC+2), dus deze drie liggen niet op één
    //    dag ook al schelen ze anderhalf uur.
    const uit = vouwSysteemberichten(
      [
        systeembericht('1', 'member_joined', 'Anna', '2026-09-01T21:00:00Z'),
        systeembericht('2', 'member_joined', 'Bram', '2026-09-01T21:30:00Z'),
        systeembericht('3', 'member_joined', 'Chris', '2026-09-01T22:30:00Z'),
      ],
      TZ,
    );

    expect(uit.map((r) => r.soort)).toEqual(['bericht', 'bericht', 'bericht']);
  });

  it('vouwt een bevestigingsreeks alleen binnen één bevestiger', () => {
    // ⚠️ **De zin noemt twee mensen en daarom is dit een eigen grendel.** Twee
    //    bevestigers in één regel zou de tweede naam moeten laten vallen, en dan
    //    verdwijnt er een positief signaal.
    const zelfde = vouwSysteemberichten(
      [
        systeembericht('1', 'completion_approved', 'Anna', '2026-09-01T09:00:00Z', 'Dana'),
        systeembericht('2', 'completion_approved', 'Bram', '2026-09-01T09:05:00Z', 'Dana'),
        systeembericht('3', 'completion_approved', 'Chris', '2026-09-01T09:10:00Z', 'Dana'),
      ],
      TZ,
    );

    expect(zelfde).toHaveLength(1);
    const regel = zelfde[0];
    if (regel?.soort !== 'gevouwen') throw new Error('geen gevouwen regel');
    expect(gevouwenTekst(regel)).toBe('Dana bevestigde de weken van Anna, Bram en Chris.');

    const gemengd = vouwSysteemberichten(
      [
        systeembericht('1', 'completion_approved', 'Anna', '2026-09-01T09:00:00Z', 'Dana'),
        systeembericht('2', 'completion_approved', 'Bram', '2026-09-01T09:05:00Z', 'Eva'),
        systeembericht('3', 'completion_approved', 'Chris', '2026-09-01T09:10:00Z', 'Dana'),
      ],
      TZ,
    );

    expect(
      gemengd.map((r) => r.soort),
      'drie bevestigingen door twee verschillende mensen horen los te blijven staan',
    ).toEqual(['bericht', 'bericht', 'bericht']);
  });

  it('vouwt ongeacht wie erin staat', () => {
    // ⚠️ **De grendel tegen de fout die 0070 vermeed.** Zou er alleen gevouwen
    //    worden als de reeks "compleet" is — iedereen deed mee — dan vertelt het
    //    uitblijven van de regel dat er iemand ontbrak, en is de afwezigheid zelf
    //    het signaal. Dezelfde drie berichten, één keer met drie verschillende
    //    mensen en één keer met dezelfde persoon drie keer: allebei één regel.
    const drieMensen = vouwSysteemberichten(
      [
        systeembericht('1', 'completion_pending', 'Anna', '2026-09-01T09:00:00Z'),
        systeembericht('2', 'completion_pending', 'Bram', '2026-09-01T10:00:00Z'),
        systeembericht('3', 'completion_pending', 'Chris', '2026-09-01T11:00:00Z'),
      ],
      TZ,
    );
    const eenPersoon = vouwSysteemberichten(
      [
        systeembericht('1', 'completion_pending', 'Anna', '2026-09-01T09:00:00Z'),
        systeembericht('2', 'completion_pending', 'Anna', '2026-09-01T10:00:00Z'),
        systeembericht('3', 'completion_pending', 'Anna', '2026-09-01T11:00:00Z'),
      ],
      TZ,
    );

    expect(drieMensen).toHaveLength(1);
    expect(eenPersoon).toHaveLength(1);

    const een = eenPersoon[0];
    if (een?.soort !== 'gevouwen') throw new Error('geen gevouwen regel');
    expect(een.namen, 'dezelfde persoon staat er één keer in').toEqual(['Anna']);
  });

  it('vouwt de gebeurtenissen niet die een eigen feit dragen', () => {
    // ⚠️ `chain_milestone` draagt een drempel en `season_recap` drie
    //    groepstotalen. Twee zulke regels zijn verschillende feiten; die op één
    //    hoop gooien is geen samenvatting maar verlies.
    for (const event of ['chain_milestone', 'milestone_done', 'goal_completed', 'season_recap']) {
      const uit = vouwSysteemberichten(
        [
          systeembericht('1', event, 'Anna', '2026-09-01T09:00:00Z'),
          systeembericht('2', event, 'Bram', '2026-09-01T10:00:00Z'),
          systeembericht('3', event, 'Chris', '2026-09-01T11:00:00Z'),
        ],
        TZ,
      );

      expect(uit.map((r) => r.soort), `${event} hoort niet gevouwen te worden`).toEqual([
        'bericht',
        'bericht',
        'bericht',
      ]);
    }
  });

  it('noemt een verdwenen account net zo als de losse zin dat doet', () => {
    const uit = vouwSysteemberichten(
      [
        systeembericht('1', 'member_joined', null, '2026-09-01T09:00:00Z'),
        systeembericht('2', 'member_joined', 'Bram', '2026-09-01T10:00:00Z'),
        systeembericht('3', 'member_joined', 'Chris', '2026-09-01T11:00:00Z'),
      ],
      TZ,
    );

    const regel = uit[0];
    if (regel?.soort !== 'gevouwen') throw new Error('geen gevouwen regel');
    expect(regel.namen[0], 'geen lege plek in de opsomming').toBe('Een oud-lid');
  });
});

describe('een opsomming van namen', () => {
  it('zet er een voegwoord tussen dat uit de catalogus komt', () => {
    expect(voegNamenSamen(['Anna'])).toBe('Anna');
    expect(voegNamenSamen(['Anna', 'Bram'])).toBe('Anna en Bram');
    expect(voegNamenSamen(['Anna', 'Bram', 'Chris'])).toBe('Anna, Bram en Chris');
  });
});
