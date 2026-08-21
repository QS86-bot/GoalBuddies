import { describe, expect, it } from 'vitest';

import {
  BERICHT_MAX,
  BERICHTEN_PER_PAGINA,
  berichtSchema,
  beperkVoorCache,
  CACHE_MAX,
  cursorVan,
  CACHE_VERSIE,
  isCacheGeldig,
  isSysteembericht,
  SYSTEEM_GEBEURTENISSEN,
  VERBODEN_GEBEURTENISSEN,
  voegSamen,
  type ChatBericht,
} from './chat-schemas';

/**
 * QS8-69 en QS8-74.
 *
 * De helft van dit bestand test ordening en de andere helft test domeinregel 7.
 * Die tweede helft is de belangrijkste: hij is er om rood te worden op de dag dat
 * iemand een nieuw type systeembericht toevoegt zonder zich af te vragen of de
 * groep het mag zien.
 */

function bericht(over: Partial<ChatBericht> & { id: string; created_at: string }): ChatBericht {
  return {
    sender_id: 'u1',
    sender_name: 'Sanne',
    sender_avatar: null,
    body: 'iets',
    type: 'text',
    system_event: null,
    subject_name: null,
    actor_name: null,
    ...over,
  };
}

describe('de grenzen van een bericht', () => {
  it('houdt dezelfde bovengrens aan als chat_messages_body_len uit migratie 0001', () => {
    // ⚠️ Loopt deze test stuk, dan is één van beide veranderd zonder de ander.
    //    Ruimer hier betekent een bericht typen dat de database weigert; krapper
    //    betekent een geldig bericht weigeren voordat de server het ziet.
    expect(BERICHT_MAX).toBe(4000);
  });

  it('vraagt niet meer dan de database per pagina teruggeeft', () => {
    // `groepschat()` klemt zijn limiet op 50 (migratie 0024).
    expect(BERICHTEN_PER_PAGINA).toBeLessThanOrEqual(50);
  });

  it('weigert een leeg bericht en een bericht van alleen spaties', () => {
    expect(berichtSchema.safeParse({ body: '' }).success).toBe(false);
    expect(berichtSchema.safeParse({ body: '   \n  ' }).success).toBe(false);
  });

  it('haalt witruimte aan de randen weg', () => {
    const uitkomst = berichtSchema.safeParse({ body: '  hoi  ' });
    expect(uitkomst.success && uitkomst.data.body).toBe('hoi');
  });

  it('weigert een bericht dat één teken over de grens gaat', () => {
    expect(berichtSchema.safeParse({ body: 'x'.repeat(BERICHT_MAX) }).success).toBe(true);
    expect(berichtSchema.safeParse({ body: 'x'.repeat(BERICHT_MAX + 1) }).success).toBe(false);
  });
});

describe('een systeembericht herkennen', () => {
  it('kijkt naar het type én naar de afzender', () => {
    expect(isSysteembericht(bericht({ id: 'a', created_at: 't', type: 'system' }))).toBe(true);
    expect(isSysteembericht(bericht({ id: 'b', created_at: 't', sender_id: null }))).toBe(true);
    expect(isSysteembericht(bericht({ id: 'c', created_at: 't' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Domeinregel 7 — QS8-74
// ---------------------------------------------------------------------------

describe('domeinregel 7: falen is nooit publiek', () => {
  it('kent geen gebeurtenis die tegenslag van iemand anders aankondigt', () => {
    // ⚠️ Dit is de test die 7.6 vraagt: "een test die faalt als een nieuw type
    //    feed-item deze regel schendt". Hij vergelijkt de allowlist met een lijst
    //    van namen die per definitie over een tegenvaller gaan. Voegt iemand er
    //    één van toe, dan wordt dit rood vóór het in de groep staat.
    for (const verboden of VERBODEN_GEBEURTENISSEN) {
      expect(SYSTEEM_GEBEURTENISSEN as readonly string[]).not.toContain(verboden);
    }
  });

  it('bevat uitsluitend de negen gebeurtenissen van migratie 0025 en 0032', () => {
    // ⚠️ Een exacte lijst en geen `toContain`-reeks. Zo is een tóevoeging óók een
    //    rode test, en niet alleen een verkeerde toevoeging. Wie hier een naam
    //    bijzet, komt eerst langs de vraag: kan hieruit iemands gemiste week
    //    worden afgeleid, en kan iemand dat met één API-verzoek uitlezen?
    //
    // ⚠️ En dat werkte deze keer niet. Migratie 0032 zette `deadline_requested`
    //    op de CHECK in de database en deze lijst bleef op acht staan — waarmee
    //    de test gewoon groen bleef, want hij toetste de oude toestand tegen
    //    zichzelf. Het slot viel niet. De test in `tests/rls/epic7.test.ts`
    //    controleert daarom sinds die bevinding beide richtingen: de app mag
    //    niets kennen dat de database verbiedt, én de database niets toestaan
    //    dat de app niet kent.
    expect([...SYSTEEM_GEBEURTENISSEN]).toEqual([
      'group_sleeping',
      'member_joined',
      'completion_pending',
      'completion_approved',
      'milestone_done',
      'goal_completed',
      'commitment_unlocked',
      'commitment_due',
      'deadline_requested',
    ]);
  });

  it('kent geen gebeurtenis voor "vertel me meer"', () => {
    // Een vraag over iemands week is geen gebeurtenis voor de groep. Publiek
    // gemaakt wordt hij een openbare twijfel, en dan stelt niemand hem nog —
    // waarmee EPIC 6 de knop die hij gelijkwaardig maakte weer duurder maakt.
    expect(SYSTEEM_GEBEURTENISSEN as readonly string[]).not.toContain('completion_more_info');
  });
});

// ---------------------------------------------------------------------------
// Ordenen
// ---------------------------------------------------------------------------

describe('berichten samenvoegen', () => {
  it('sorteert oplopend op tijd', () => {
    const samen = voegSamen(
      [bericht({ id: 'b', created_at: '2026-08-18T10:00:00Z' })],
      [bericht({ id: 'a', created_at: '2026-08-18T09:00:00Z' })],
    );

    expect(samen.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('gebruikt het id als tweede sleutel bij een gelijke tijd', () => {
    // ⚠️ Dit is het geval dat echt voorkomt: `stamp_chat_message()` zet
    //    `created_at` op de tijd van de transactie, dus een systeembericht en de
    //    gebeurtenis die het aankondigt dragen exact dezelfde tijd. Zonder deze
    //    tweede sleutel springen die twee bij elke sortering van plaats en
    //    verschuift de chat onder je vinger.
    const tijd = '2026-08-18T10:00:00Z';
    const samen = voegSamen(
      [bericht({ id: 'zz', created_at: tijd })],
      [bericht({ id: 'aa', created_at: tijd })],
    );

    expect(samen.map((b) => b.id)).toEqual(['aa', 'zz']);
  });

  it('levert elk bericht één keer op, ook als het in beide lijsten staat', () => {
    const oud = bericht({ id: 'a', created_at: '2026-08-18T09:00:00Z', body: 'oude tekst' });
    const nieuw = bericht({ id: 'a', created_at: '2026-08-18T09:00:00Z', body: 'nieuwe tekst' });

    const samen = voegSamen([oud], [nieuw]);

    expect(samen).toHaveLength(1);
    // De serverversie wint: de oude kan een bijgewerkte tekst missen.
    expect(samen[0]?.body).toBe('nieuwe tekst');
  });

  it('laat een lege kant met rust', () => {
    const enige = bericht({ id: 'a', created_at: '2026-08-18T09:00:00Z' });
    expect(voegSamen([], [enige])).toHaveLength(1);
    expect(voegSamen([enige], [])).toHaveLength(1);
    expect(voegSamen([], [])).toHaveLength(0);
  });
});

describe('de cursor voor "ouder laden"', () => {
  it('wijst het oudste bericht aan, want dat is waar terugbladeren begint', () => {
    const cursor = cursorVan([
      bericht({ id: 'a', created_at: '2026-08-18T09:00:00Z' }),
      bericht({ id: 'b', created_at: '2026-08-18T10:00:00Z' }),
    ]);

    expect(cursor).toEqual({ at: '2026-08-18T09:00:00Z', id: 'a' });
  });

  it('geeft null bij een leeg gesprek', () => {
    expect(cursorVan([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// De cache
// ---------------------------------------------------------------------------

describe('de cache van de lopende periode', () => {
  it('is ongeldig zodra de groepsperiode gerold is', () => {
    // ⚠️ Een chat van vorige week tonen als "de groep nu" is erger dan een leeg
    //    scherm: dan denk je dat er niets gebeurd is.
    const cache = { periodStart: '2026-08-09', berichten: [], versie: CACHE_VERSIE };
    expect(isCacheGeldig(cache, '2026-08-09')).toBe(true);
    expect(isCacheGeldig(cache, '2026-08-16')).toBe(false);
    expect(isCacheGeldig(null, '2026-08-16')).toBe(false);
  });

  it('gooit een cache weg die van vóór een vormwijziging komt', () => {
    // ⚠️ De cache bewaart `ChatBericht` als kale JSON en leest hem terug met een
    //    cast — er is geen schema dat hem controleert. Sinds migratie 0059 rendert
    //    het scherm een systeembericht uit `subject_name` in plaats van uit
    //    `body`, en een bericht dat vóór die upgrade bewaard is, heeft dat veld
    //    niet. Zonder deze controle staat er een paar seconden "Een oud-lid doet
    //    mee" waar een naam hoort — geen storing, wel onwaar.
    expect(isCacheGeldig({ periodStart: '2026-08-09', berichten: [] }, '2026-08-09')).toBe(false);
    expect(
      isCacheGeldig({ periodStart: '2026-08-09', berichten: [], versie: 1 }, '2026-08-09'),
    ).toBe(false);
  });

  it('bewaart de níeuwste berichten en niet de oudste', () => {
    const veel = Array.from({ length: CACHE_MAX + 5 }, (_, i) =>
      bericht({ id: `b${i}`, created_at: `2026-08-18T10:${String(i).padStart(2, '0')}:00Z` }),
    );

    const beperkt = beperkVoorCache(veel);

    expect(beperkt).toHaveLength(CACHE_MAX);
    expect(beperkt.at(-1)?.id).toBe(`b${CACHE_MAX + 4}`);
  });

  it('laat een korte lijst ongemoeid', () => {
    const drie = [
      bericht({ id: 'a', created_at: '2026-08-18T09:00:00Z' }),
      bericht({ id: 'b', created_at: '2026-08-18T10:00:00Z' }),
      bericht({ id: 'c', created_at: '2026-08-18T11:00:00Z' }),
    ];

    expect(beperkVoorCache(drie)).toHaveLength(3);
  });
});
