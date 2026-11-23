// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { t } from '@/shared/i18n';

import { renderScherm, router, routeParams, ruimAllesOp, type GerenderdScherm } from './scherm';

/**
 * Het uitnodigingsscherm, gerenderd zoals een gebruiker het ziet — QS8-739.
 *
 * ⚠️ Dit is de belofte van QS8-708 en QS8-716, en niet een eigenschap van een onderdeel:
 *    `uitnodiging-stand.test.ts` en `useAutomatischToetreden.test.ts` toetsen de beslissing
 *    en het effect los, dit toetst dat het scherm ze ook aanroept. Een mutatie in de
 *    bedrading (een knop die niet naar `actieVoor()` kijkt, een slot dat niet gedeeld
 *    wordt) is voor die twee onzichtbaar.
 *
 * ⚠️ Alleen de netwerkgrens en de opslag zijn vervangen (`fetchUitnodiging`,
 *    `fetchMijnLidmaatschap`, `neemDeel` en de bewaarde code). De beslislogica, het slot, de
 *    hook en de labels zijn de echte; `maakToetredenSlot` is de echte met een teller. Teksten worden gelezen uit de catalogus (`t(sleutel)`), niet
 *    letterlijk, zodat een andere formulering de test niet breekt maar een ander gedrag
 *    wel.
 */

const mocks = vi.hoisted(() => ({
  sessie: null as { user: { id: string; email: string } } | null,
  sessieLaadt: false,
  profiel: { display_name: 'Jan', onboarded_at: '2026-01-01' } as {
    display_name: string;
    onboarded_at: string | null;
  } | null,
  uitnodiging: undefined as unknown,
  lidmaatschap: null as { status: string; user_id: string } | null,
  lidmaatschapFout: false,
  neemDeel: undefined as unknown as Mock<(...a: unknown[]) => unknown>,
  vergeet: undefined as unknown as Mock<(...a: unknown[]) => unknown>,
  slotAanroepen: 0,
}));

vi.mock('@/modules/auth', () => ({
  ROUTE_AANMELDEN: '/aanmelden',
  useSession: () => ({ session: mocks.sessie, loading: mocks.sessieLaadt }),
  useProfiel: () => ({ profiel: mocks.profiel }),
}));

vi.mock('@/modules/buddies', async () => {
  const stand = await vi.importActual<object>('@/modules/buddies/uitnodiging-stand');
  const toetreden = await vi.importActual<typeof import('@/modules/buddies/uitnodiging-toetreden')>(
    '@/modules/buddies/uitnodiging-toetreden',
  );
  const hook = await vi.importActual<object>('@/modules/buddies/useAutomatischToetreden');
  const schemas = await vi.importActual<{
    huddledagLabel: unknown;
    zichtbaarheidLabels: unknown;
    zichtbaarheidUitleg: unknown;
    uitnodigingKlassementTekst: unknown;
  }>('@/modules/buddies/schemas');
  return {
    ...stand,
    ...toetreden,
    ...hook,
    // ⚠️ De labels en uitleg zijn de echte: het zijn pure functies, en de waarschuwing voor
    //    een open groep leunt op `zichtbaarheidUitleg()`.
    huddledagLabel: schemas.huddledagLabel,
    zichtbaarheidLabels: schemas.zichtbaarheidLabels,
    zichtbaarheidUitleg: schemas.zichtbaarheidUitleg,
    uitnodigingKlassementTekst: schemas.uitnodigingKlassementTekst,
    // De echte functie, met een teller: het scherm hoort er één per mount te maken.
    maakToetredenSlot: (...a: Parameters<typeof toetreden.maakToetredenSlot>) => {
      mocks.slotAanroepen += 1;
      return toetreden.maakToetredenSlot(...a);
    },
    bewaarOpenstaandeUitnodiging: async () => {},
    vergeetOpenstaandeUitnodiging: (...a: unknown[]) => mocks.vergeet(...a),
    fetchUitnodiging: async () => mocks.uitnodiging,
    fetchMijnLidmaatschap: async () => {
      if (mocks.lidmaatschapFout) throw new Error('netwerk');
      return mocks.lidmaatschap;
    },
    neemDeel: (...a: unknown[]) => mocks.neemDeel(...a),
  };
});

const GROEP = {
  group_id: 'g-1',
  group_name: 'Woensdagclub',
  member_count: 2,
  huddle_day: 3,
  zichtbaarheid: 'beschermd',
  detailed: true,
  members: [],
};
const JAN = { user: { id: 'u-1', email: 'jan@example.nl' } };

async function open(): Promise<GerenderdScherm> {
  const { default: Uitnodiging } = await import('../../app/uitnodiging/[code]');
  return renderScherm(Uitnodiging);
}

function uitgesteld() {
  let los!: (u: { ok: true; waarde: string } | { ok: false; melding: string }) => void;
  const belofte = new Promise<{ ok: true; waarde: string } | { ok: false; melding: string }>(
    (a) => {
      los = a;
    },
  );
  return { belofte, los };
}

beforeEach(() => {
  mocks.sessie = null;
  mocks.sessieLaadt = false;
  mocks.profiel = { display_name: 'Jan', onboarded_at: '2026-01-01' };
  mocks.uitnodiging = GROEP;
  mocks.lidmaatschap = null;
  mocks.lidmaatschapFout = false;
  mocks.neemDeel = vi.fn().mockResolvedValue({ ok: true, waarde: 'g-1' });
  mocks.vergeet = vi.fn();
  mocks.slotAanroepen = 0;
  routeParams.code = 'ABC123456789';
});

afterEach(() => {
  ruimAllesOp();
});

describe('de uitnodigingspagina — de vier gevallen van QS8-708', () => {
  it('een bestaand lid ziet "Je zit al in deze groep" en geen "Deelnemen"', async () => {
    mocks.sessie = JAN;
    mocks.lidmaatschap = { status: 'active', user_id: 'u-1' };

    const s = await open();

    expect(s.tekst()).toContain(t('uitnodiging.al_lid_titel'));
    expect(s.knoppen()).toContain(t('uitnodiging.naar_groep'));
    expect(s.knoppen()).not.toContain(t('uitnodiging.deelnemen'));
    expect(mocks.neemDeel).not.toHaveBeenCalled();
  });

  it('de knop van een bestaand lid gaat naar de groep en wist de bewaarde code', async () => {
    mocks.sessie = JAN;
    mocks.lidmaatschap = { status: 'active', user_id: 'u-1' };

    const s = await open();
    expect(mocks.vergeet).toHaveBeenCalled();
    await s.klik(t('uitnodiging.naar_groep'));

    expect(router.replace).toHaveBeenCalledWith('/groep/g-1');
  });

  it('een ingelogd niet-lid ziet "Deelnemen" en kan toetreden', async () => {
    mocks.sessie = JAN;

    const s = await open();
    expect(s.knoppen()).toContain(t('uitnodiging.deelnemen'));
    expect(s.tekst()).not.toContain(t('uitnodiging.al_lid_titel'));

    await s.klik(t('uitnodiging.deelnemen'));

    expect(mocks.neemDeel).toHaveBeenCalledTimes(1);
    expect(mocks.neemDeel).toHaveBeenCalledWith('ABC123456789');
    expect(router.replace).toHaveBeenCalledWith('/groep/g-1');
  });

  it('wie niet is ingelogd krijgt inloggen aangeboden en geen "Deelnemen"', async () => {
    const s = await open();

    expect(s.knoppen()).toContain(t('uitnodiging.inloggen'));
    expect(s.knoppen()).not.toContain(t('uitnodiging.deelnemen'));
    expect(s.tekst()).toContain(t('account.niet_ingelogd'));
    expect(mocks.neemDeel).not.toHaveBeenCalled();
  });

  it('een ingetrokken of vervangen code geeft een foutstaat en geen knop om mee te doen', async () => {
    mocks.sessie = JAN;
    mocks.uitnodiging = null;

    const s = await open();

    expect(s.tekst()).toContain(t('uitnodiging.titel_verlopen'));
    expect(s.tekst()).toContain(t('uitnodiging.leeg_titel'));
    expect(s.knoppen()).not.toContain(t('uitnodiging.deelnemen'));
    expect(mocks.neemDeel).not.toHaveBeenCalled();
  });
});

describe('de uitnodigingspagina — het ingelogde account is zichtbaar', () => {
  it('toont naam en adres bij een niet-lid, vóór de knop waarmee je meedoet', async () => {
    mocks.sessie = JAN;

    const s = await open();
    const tekst = s.tekst();

    expect(tekst).toContain(t('account.ingelogd_als', { naam: 'Jan' }));
    expect(tekst).toContain(t('account.ingelogd_adres', { adres: 'jan@example.nl' }));
    expect(tekst.indexOf('jan@example.nl')).toBeLessThan(
      tekst.lastIndexOf(t('uitnodiging.deelnemen')),
    );
  });

  it('toont het ook bij een bestaand lid', async () => {
    mocks.sessie = JAN;
    mocks.lidmaatschap = { status: 'active', user_id: 'u-1' };

    expect((await open()).tekst()).toContain('jan@example.nl');
  });

  it('zegt niets over inloggen zolang de sessie nog laadt', async () => {
    mocks.sessieLaadt = true;

    const s = await open();

    expect(s.tekst()).not.toContain(t('account.niet_ingelogd'));
    expect(s.knoppen()).not.toContain(t('uitnodiging.inloggen'));
  });
});

describe('de uitnodigingspagina — QS8-716: één toetreding tegelijk', () => {
  // ⚠️ Twee dingen die elk hun eigen toets nodig hebben. De knop is na een tik
  //    uitgeschakeld: dat is wat de gebruiker ziet, en `klik()` weigert daarna nog een
  //    tik. Het gedeelde slot is wat achter die grijze knop zit en het venster dekt
  //    waarin de knop er nog niet grijs uitziet; dat is hier niet te bereiken (onder
  //    `act()` loopt de effectronde vóór een tik), dus het wordt bewaakt op wat het
  //    wél laat zien: er is per scherm precies één slot gemaakt.

  it('na een tik op "Deelnemen" is de knop uitgeschakeld en is er één toetreding', async () => {
    mocks.sessie = JAN;
    const wacht = uitgesteld();
    mocks.neemDeel = vi.fn().mockReturnValue(wacht.belofte);

    const s = await open();
    await s.klik(t('uitnodiging.deelnemen'));

    expect(s.isUitgeschakeld(t('uitnodiging.deelnemen'))).toBe(true);
    await expect(s.klik(t('uitnodiging.deelnemen'))).rejects.toThrow(/uitgeschakeld/);
    expect(mocks.neemDeel).toHaveBeenCalledTimes(1);
  });

  it('wie na aanmelden vanzelf toetreedt, ziet de knop uitgeschakeld in plaats van actief', async () => {
    const wacht = uitgesteld();
    mocks.neemDeel = vi.fn().mockReturnValue(wacht.belofte);

    const s = await open(); // eerst niet ingelogd: de sessie was er niet bij binnenkomst
    mocks.sessie = JAN; // en nu komt hij terug van het aanmeldscherm
    await s.herrender();
    await s.wacht();

    expect(mocks.neemDeel).toHaveBeenCalledTimes(1); // vanzelf
    expect(s.isUitgeschakeld(t('uitnodiging.deelnemen'))).toBe(true);

    wacht.los({ ok: true, waarde: 'g-1' });
    await s.wacht();
    expect(router.replace).toHaveBeenCalledWith('/groep/g-1');
    expect(mocks.neemDeel).toHaveBeenCalledTimes(1);
  });

  it('de knop en het vanzelf toetreden delen één slot: er wordt er per scherm maar één gemaakt', async () => {
    mocks.sessie = JAN;
    const wacht = uitgesteld();
    mocks.neemDeel = vi.fn().mockReturnValue(wacht.belofte);

    const s = await open();
    await s.klik(t('uitnodiging.deelnemen'));
    await s.herrender(); // een tweede render maakt geen nieuw slot

    expect(mocks.slotAanroepen).toBe(1);
  });

  it('wie al ingelogd binnenkomt treedt niet vanzelf toe (een koude start)', async () => {
    mocks.sessie = JAN;

    await open();

    expect(mocks.neemDeel).not.toHaveBeenCalled();
  });
});

describe('de uitnodigingspagina — QS8-712: de afhandeling leest het profiel van nu', () => {
  // ⚠️ Wat deze test wél en niet bewaakt. In het huidige scherm verandert een binnenkomend
  //    profiel geen enkele dep van de hook (`uitvoer` hangt alleen aan `router`), dus de
  //    oorspronkelijke vorm van QS8-712 (een opruimfunctie die per effectronde afloopt)
  //    is hier niet te raken; dat bewaakt `useAutomatischToetreden.test.ts`. Dit bewaakt
  //    de bedrading ernaast: `onboarded()` leest het profiel op het moment van afhandelen
  //    en niet dat van het moment van renderen.
  it('een profiel dat binnenkomt terwijl neemDeel loopt, telt bij het doorsturen', async () => {
    mocks.profiel = null; // het profiel is nog niet binnen
    const wacht = uitgesteld();
    mocks.neemDeel = vi.fn().mockReturnValue(wacht.belofte);

    const s = await open();
    mocks.sessie = JAN;
    await s.herrender(); // start vanzelf
    mocks.profiel = { display_name: 'Jan', onboarded_at: '2026-01-01' };
    await s.herrender(); // het profiel komt binnen terwijl neemDeel loopt
    wacht.los({ ok: true, waarde: 'g-1' });
    await s.wacht();

    expect(router.replace).toHaveBeenCalledWith('/groep/g-1');
    expect(s.tekst()).toContain(t('uitnodiging.al_lid')); // "Je zit in de groep"
  });
});

describe('de uitnodigingspagina — een open groep (A41)', () => {
  it('de waarschuwing dat de groep je gemiste weken ziet staat vóór de knop waarmee je meedoet', async () => {
    mocks.sessie = JAN;
    mocks.uitnodiging = { ...GROEP, zichtbaarheid: 'open' };

    const tekst = (await open()).tekst();

    expect(tekst).toContain(t('uitnodiging.open_waarschuwing'));
    expect(tekst.indexOf(t('uitnodiging.open_waarschuwing'))).toBeLessThan(
      tekst.lastIndexOf(t('uitnodiging.deelnemen')),
    );
  });

  it('een beschermde groep draagt die waarschuwing niet', async () => {
    mocks.sessie = JAN;

    expect((await open()).tekst()).not.toContain(t('uitnodiging.open_waarschuwing'));
  });
});

describe('de uitnodigingspagina — de stand van het klassement (QS8-801, 0341)', () => {
  // De naad tussen `fetchUitnodiging()` en het scherm: de stand die de server noemt, staat er.
  it('staat het aan, dan zegt het scherm aan', async () => {
    mocks.sessie = JAN;
    mocks.uitnodiging = { ...GROEP, klassement_aan: true };

    const tekst = (await open()).tekst();
    expect(tekst).toContain(t('uitnodiging.klassement_aan'));
    expect(tekst).not.toContain(t('uitnodiging.klassement_standaard'));
  });

  it('staat het uit, dan zegt het scherm uit', async () => {
    mocks.sessie = JAN;
    mocks.uitnodiging = { ...GROEP, klassement_aan: false };

    const tekst = (await open()).tekst();
    expect(tekst).toContain(t('uitnodiging.klassement_uit'));
    expect(tekst).not.toContain(t('uitnodiging.klassement_aan'));
  });

  it('noemt de server geen stand, dan de standaardtekst van QS8-798', async () => {
    mocks.sessie = JAN;
    mocks.uitnodiging = { ...GROEP, klassement_aan: null };

    expect((await open()).tekst()).toContain(t('uitnodiging.klassement_standaard'));
  });
});

describe('de uitnodigingspagina — fouten', () => {
  it('een neemDeel die werpt toont "Deelnemen lukte niet" en laat de knop terugkomen', async () => {
    mocks.sessie = JAN;
    mocks.neemDeel = vi.fn().mockRejectedValue(new Error('netwerk'));

    const s = await open();
    await s.klik(t('uitnodiging.deelnemen'));

    expect(s.tekst()).toContain(t('uitnodiging.deelnemen_mislukt'));
    expect(s.knoppen()).toContain(t('uitnodiging.deelnemen'));
  });

  it('een mislukte doorverwijzing na een geslaagde toetreding is geen "Deelnemen lukte niet"', async () => {
    mocks.sessie = JAN;
    router.replace.mockImplementation(() => {
      throw new Error('router');
    });

    const s = await open();
    await s.klik(t('uitnodiging.deelnemen'));

    expect(s.tekst()).not.toContain(t('uitnodiging.deelnemen_mislukt'));
    expect(s.tekst()).toContain(t('uitnodiging.al_lid')); // "Je zit in de groep"
  });

  it('een lidmaatschap dat niet te lezen was, zegt niet dat je lid bent maar biedt wel meedoen aan', async () => {
    mocks.sessie = JAN;
    mocks.lidmaatschapFout = true;

    const s = await open();

    expect(s.tekst()).toContain(t('uitnodiging.lid_onbekend'));
    expect(s.tekst()).not.toContain(t('uitnodiging.al_lid_titel'));
    expect(s.knoppen()).toContain(t('uitnodiging.deelnemen'));
  });
});
