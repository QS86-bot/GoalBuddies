/**
 * Een dagteller telt de uploads die er wáren — QS8-399, migratie 0233.
 *
 * ⚠️ **De belofte is niet "de teller telt".** Die is: *wissen en opnieuw
 *    plaatsen komt niet langs de rem*. Dat verschil is de hele bug: de drie
 *    emmertellers deden een `count(*)` over `storage.objects` zelf, dus telden ze
 *    de objecten die er stónden. Wie er één wist, mocht er weer een plaatsen.
 *
 * 📏 Gemeten vóór de reparatie, op deze stack:
 *
 *      bewijsfotos: elfde geweigerd (goed)
 *      bewijsfotos: na wissen ER DOORHEEN      <-- de bug
 *      chatfotos  : na wissen ER DOORHEEN
 *      avatars    : na wissen ER DOORHEEN
 *      chatfotos  : VERHUIZING ER DOORHEEN -> 9 rijen bij plafond 8
 *
 * ⚠️⚠️ **Waarom dit een opslagrem is en niet alleen een snelheidsrem.** Een
 *    `delete from storage.objects` haalt de metadata-rij weg maar niet de blob
 *    (`docs/DEPLOY.md` §2.6a). Wissen-en-opnieuw-plaatsen laat dus bestanden
 *    achter die niemand meer kan bereiken én zet de teller terug, en drie emmers
 *    delen één gratis tier van 1 GB.
 *
 * ⚠️ **Er staat een must-allow naast elke weigering, en die is even belangrijk.**
 *    Een rem die alles weigert haalt elke "wordt hij rood"-toets en is stuk. Elke
 *    emmer heeft hier daarom een geval dat het plafond gewoon hóórt te halen.
 *
 * ⚠️ **Deze probes schrijven als eigenaar en niet als `authenticated`.** Dat is
 *    met opzet: een trigger vuurt ongeacht de rol, en zo staat er geen
 *    groepsopzet tussen de meting en wat hij meet. De rolkant — mag
 *    `authenticated` de teller zélf aanroepen — staat apart onderaan, en dát is
 *    de vraag die de `security definer` van 0233 opwerpt.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel, elke
 * keer rechtstreeks op de stack en daarna 0233 opnieuw afgespeeld:
 *
 *   A  `bewaak_bewijsfoto_aantal()` terug naar `count(*)`   → 2 rood
 *   B  `chatfotos_aantal_begrensd_verhuisd` gedropt         → 2 rood
 *   C  `grant execute … to authenticated` op de teller      → 1 rood
 *   D  het venster laten staan i.p.v. schuiven              → 3 rood
 *   E  een tweede overload van `tel_dagteller`          → 1 rood
 *
 * ⚠️ A en B geven er allebei twee: het gedrág valt om én de vormtest ziet het.
 *    Dat is de bedoeling — de vormtest alleen zou een teller die de juiste
 *    functie áánroept maar het verkeerde doet niet zien, en de gedragstest alleen
 *    zou een vierde emmer niet zien. D geeft er drie, één per emmer, en dat is de
 *    grendel die "altijd weigeren" uitsluit.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { proefId } from './proefid';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_tables where tablename = 'dagtellers'",
  import.meta.url,
);

const EMMERS = ['bewijsfotos', 'chatfotos', 'avatars'] as const;

/**
 * De groep waarin dit bestand zijn paden legt — QS8-442.
 *
 * ⚠️⚠️ **Hier stond de letterlijke `g`, en dat was een gedeelde sleutel.**
 *    `bewaak_chatfoto_aantal()` telt op twee niveaus: per uploader
 *    (`groep||'/'||uploader`, plafond 8) én **per groep** (`groep`, plafond 20).
 *    De uploader was al een `proefId` en werd dus netjes opgeruimd; de groep was
 *    een letter, dus de rij `groep / g` viel buiten élke opruiming. 📏 Na een
 *    volle suite-run stond hij er als enige vaste sleutel tussen twintig
 *    per-run-uuids: `groep | g = 8`.
 *
 * ⚠️ **`gedeelde-identiteit:controle` vindt dit niet en dat blijft zo** — die
 *    zoekt uuid-literals, en `g` is er geen. De afweging om hem daar níet voor
 *    te verbreden staat in
 *    `docs/decisions/2026-09-13-de-waarschuwing-stond-bij-het-verkeerde-werkwoord.md` §4.
 */
const GROEP = proefId(0);

/** Elke uuid die dit bestand zelf schrijft — en dus als enige mag opruimen. */
const ALLE_PROEF_IDS = [GROEP, proefId(1), proefId(2), proefId(3), proefId(10)];

/**
 * De `where` waarmee dit bestand zijn eigen sleutels aanwijst — en niets anders.
 *
 * ⚠️⚠️ **Één expressie voor élke schrijfactie op `dagtellers` in dit bestand,
 *    en dat is de naad die QS8-442 opleverde.** Hier stonden er twee: `leeg()`
 *    filterde netjes, en het geval "een etmaal later" deed er vier regels
 *    verderop een `update` overheen **zonder `where`**. Twee plekken die
 *    hetzelfde moeten bedoelen, lopen uit elkaar — en dat is in dit project de
 *    duurste vorm die er is.
 */
const MIJN_BEREIK = `sleutel similar to '%(${ALLE_PROEF_IDS.join('|')})%'`;

/** Wist de drie emmers en de tellers, zodat elk geval op nul begint. */
function leeg(): void {
  // ⚠️⚠️ **Alleen de sleutels van dit bestand, en dat is geen netheid.** Twee
  //    suites tegen dezelfde stack is in dit project de gewone toestand
  //    (QS8-336). Een kale `delete from dagtellers` wist dan de teller van
  //    een ándere suite — en uitgerekend de grendel die hier de belofte draagt
  //    ("wissen komt er niet langs") wordt groen als iemand anders de teller
  //    leeggemaakt heeft.
  //
  // ⚠️ Deze uitleg stond er al vóór QS8-442 en hij klopte. Wat er vier regels
  //    verderop stond was dezelfde fout met een ander werkwoord — zie
  //    `MIJN_BEREIK` hierboven. `tellerbereik:controle` bewaakt de klasse nu.
  const mijne = ALLE_PROEF_IDS.join('|');

  psql(
    `delete from storage.objects
      where bucket_id in ('bewijsfotos','chatfotos','avatars')
        and name similar to '%(${mijne})%';
     delete from dagtellers
      where ${MIJN_BEREIK};`,
  );
}

/**
 * Plaatst één object en zegt of het mocht.
 *
 * ⚠️ De weigering is een `check_violation` (23514) en geen RLS-fout: het is een
 *    trigger die nee zegt, niet een policy.
 */
function plaats(bucket: string, pad: string): 'OK' | 'GEWEIGERD' {
  try {
    psql(`insert into storage.objects (bucket_id, name) values ('${bucket}', '${pad}');`);
    return 'OK';
  } catch (fout) {
    const tekst = fout instanceof Error ? fout.message : String(fout);
    if (/Te veel|check_violation|23514/.test(tekst)) return 'GEWEIGERD';
    throw fout;
  }
}

/** Verhuist een bestaand object naar een andere emmer. */
function verhuis(pad: string, naar: string): 'OK' | 'GEWEIGERD' {
  try {
    psql(`update storage.objects set bucket_id = '${naar}' where name = '${pad}';`);
    return 'OK';
  } catch (fout) {
    const tekst = fout instanceof Error ? fout.message : String(fout);
    if (/Te veel|check_violation|23514/.test(tekst)) return 'GEWEIGERD';
    throw fout;
  }
}

/** Het pad dat de teller van deze emmer leest, met zijn plafond. */
const VORM = {
  bewijsfotos: { pad: (u: string, i: number) => `${GROEP}/${u}/f${i}.jpg`, plafond: 10 },
  chatfotos: { pad: (u: string, i: number) => `${GROEP}/${u}/c${i}.jpg`, plafond: 8 },
  avatars: { pad: (u: string, i: number) => `${u}/a${i}.jpg`, plafond: 10 },
} as const;

describe.runIf(beschikbaar)('wissen zet de dagteller niet terug', () => {
  beforeEach(leeg);
  afterAll(leeg);

  for (const emmer of EMMERS) {
    const { pad, plafond } = VORM[emmer];
    // ⚠️ `proefId` en geen vaste uuid: twee suites tegen dezelfde stack ruimen
    //    anders elkaars rijen op — `gedeelde-identiteit:controle` (QS8-336).
    const u = proefId(EMMERS.indexOf(emmer) + 1);

    it(`${emmer}: het plafond van ${plafond} is gewoon te halen`, () => {
      for (let i = 1; i <= plafond; i += 1) {
        expect(plaats(emmer, pad(u, i)), `upload ${i} van ${plafond} hoort te mogen`).toBe('OK');
      }
    });

    it(`${emmer}: de upload boven het plafond wordt geweigerd`, () => {
      for (let i = 1; i <= plafond; i += 1) plaats(emmer, pad(u, i));

      expect(plaats(emmer, pad(u, plafond + 1))).toBe('GEWEIGERD');
    });

    /** ⚠️ De grendel die de belofte draagt — dit is het geval dat vóór 0233 doorliet. */
    it(`${emmer}: wissen en opnieuw plaatsen komt er niet langs`, () => {
      for (let i = 1; i <= plafond; i += 1) plaats(emmer, pad(u, i));
      psql(`delete from storage.objects where bucket_id='${emmer}' and name = '${pad(u, 1)}';`);

      expect(
        plaats(emmer, pad(u, plafond + 2)),
        'de teller telt de objecten die er staan in plaats van de uploads die er waren',
      ).toBe('GEWEIGERD');
    });

    /**
     * ⚠️ Het venster moet wél schuiven, anders is het geen dagteller maar een
     *    levenslange grens. Zonder dit geval zou "altijd weigeren" groen zijn,
     *    en dan is elke weigering hierboven waardeloos als bewijs.
     *
     * ⚠️⚠️ **De objecten gaan eerst weg, en dat is geen opsmuk maar het verschil
     *    tussen de twee vragen die `avatars` stelt.** Die emmer houdt naast de
     *    dagteller ook de grens van 0130: hoeveel avatars er tegelijk *staan*,
     *    zonder venster. 📏 Zonder de `delete` hieronder faalt precies dit geval
     *    voor `avatars` en voor de andere twee niet — de dagteller was dan al
     *    geschoven en de gelijktijdigheidsgrens hield hem alsnog tegen.
     *
     *    Dat is correct gedrag en geen bug: je avatar vervángen mag altijd, hem
     *    honderd keer per dag opnieuw plaatsen niet. Het geval hierboven
     *    ("wissen en opnieuw plaatsen") dekt de andere helft — daar gaan de
     *    objecten óók weg en blijft het geweigerd, want het venster staat stil.
     */
    it(`${emmer}: een etmaal later mag het weer`, () => {
      for (let i = 1; i <= plafond; i += 1) plaats(emmer, pad(u, i));

      psql(`delete from storage.objects where bucket_id = '${emmer}';`);
      // ⚠️⚠️ **`MIJN_BEREIK` en geen kale update** — QS8-442. Hier stond
      //    `update dagtellers set venster_start = …;` zónder `where`, en dat
      //    zette het venster van **elke** teller in de database een etmaal
      //    terug. 📏 Gemeten met een vreemde rij ernaast: het aantal bleef 5 staan
      //    en de start ging van 05:11 vandaag naar 04:11 gisteren — dus de
      //    eerstvolgende `tel_dagteller()` van die andere suite begon op 1 en
      //    haar plafond vuurde niet. Dat is de faalsignatuur "expected
      //    GEWEIGERD, got OK" waar dit issue mee begon.
      psql(
        `update dagtellers set venster_start = now() - interval '25 hours'
          where ${MIJN_BEREIK};`,
      );

      expect(plaats(emmer, pad(u, plafond + 3))).toBe('OK');
    });
  }

  /**
   * ⚠️ **De tweede omzeiling.** Een object in een andere emmer parkeren en met
   *    één `update` omzetten kwam langs de rem: alleen `bewijsfotos` had de
   *    trigger op `before update of bucket_id`.
   */
  it.each([
    ['chatfotos', 8],
    ['avatars', 10],
  ])('%s: een object van buiten naar binnen verhuizen komt er niet langs', (emmer, plafond) => {
    const vorm = VORM[emmer as keyof typeof VORM];
    const u = proefId(10);
    for (let i = 1; i <= plafond; i += 1) plaats(emmer, vorm.pad(u, i));

    const geparkeerd =
      emmer === 'avatars' ? `${u}/verhuisd.jpg` : `${GROEP}/${u}/verhuisd.jpg`;
    plaats('bewijsfotos', geparkeerd);

    expect(verhuis(geparkeerd, emmer)).toBe('GEWEIGERD');
  });
});

/**
 * De vorm ligt op één plek vast — acceptatiecriterium 2 van QS8-399.
 *
 * ⚠️⚠️ **Dit is de test die rood wordt als er een vijfde emmer bijkomt die de
 *    vorm niet volgt.** De gevallen hierboven toetsen de drie emmers die er
 *    vandaag zijn; ze zeggen niets over de vierde. En zo is deze bug ontstaan:
 *    `bewijsfotos` (0228) kopieerde de vorm van `chatfotos` (0226), die hem van
 *    `avatars` (0130) kopieerde — inclusief de `count(*)`.
 */
describe.runIf(beschikbaar)('elke emmerteller volgt dezelfde vorm', () => {
  /** Elke triggerfunctie op `storage.objects` die een aantal begrenst. */
  function emmertellers(): string[] {
    return psql(
      `select distinct p.proname
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace ns on ns.oid = c.relnamespace
         join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal
          and ns.nspname = 'storage' and c.relname = 'objects'
          and t.tgname like '%_aantal_begrensd%'
        order by 1;`,
    )
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== '');
  }

  it('vindt de tellers, anders bewaakt de rest hier niets', () => {
    expect(emmertellers().length).toBeGreaterThanOrEqual(3);
  });

  it('laat elke teller via tel_dagteller() tellen en niet via count(*)', () => {
    const zonder = emmertellers().filter(
      (naam) =>
        !psql(`select prosrc from pg_proc where proname = '${naam}';`).includes(
          'tel_dagteller',
        ),
    );

    expect(
      zonder,
      'deze teller telt zijn eigen tabel; wissen zet hem dan terug — zie QS8-399',
    ).toEqual([]);
  });

  /**
   * ⚠️ Twee triggers per emmer: binnenkomen én verhuizen. `bewijsfotos` had ze
   *    allebei, de andere twee alleen de eerste — en dat gat was met één
   *    `update` te gebruiken.
   */
  it('geeft elke emmer een insert- én een verhuistrigger', () => {
    const namen = psql(
      `select t.tgname
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and c.relname = 'objects'
          and t.tgname like '%_aantal_begrensd%'
        order by 1;`,
    ).split('\n');

    for (const emmer of EMMERS) {
      expect(namen, `${emmer} mist zijn insert-trigger`).toContain(`${emmer}_aantal_begrensd`);
      expect(namen, `${emmer} mist zijn verhuistrigger`).toContain(
        `${emmer}_aantal_begrensd_verhuisd`,
      );
    }
  });
});

/**
 * De teller is niet rechtstreeks aan te roepen.
 *
 * ⚠️⚠️ **Dit is de prijs van de `security definer` in 0233, en hij moet betaald
 *    worden.** `tel_dagteller()` schrijft in een deny-all tabel, dus hij
 *    moet definer zijn. Mag `authenticated` hem dán ook uitvoeren, dan kan
 *    iedereen de teller van een ánder lid ophogen en dat lid zijn dag uit
 *    sturen — een griefvector met een schone naam.
 */
describe.runIf(beschikbaar)('tel_dagteller() is voor niemand aanroepbaar', () => {
  /**
   * ⚠️⚠️ **Eerst: bestaat hij onder déze handtekening?** `has_function_privilege`
   *    wérpt op een onbekende functie, maar een tweede overload zou hier stil
   *    langskomen — dan toetst dit blok de verkeerde. Dat is QS8-398 in het
   *    klein, en dit geval is wat die bevinding hier voorkomt.
   */
  it('bestaat precies één keer', () => {
    expect(
      psql(`select count(*) from pg_proc where proname = 'tel_dagteller';`).trim(),
      'een tweede overload betekent dat de rechtentoets hieronder de verkeerde meet',
    ).toBe('1');
  });

  it.each(['authenticated', 'anon'])('%s mag hem niet uitvoeren', (rol) => {
    const mag = psql(
      `select has_function_privilege('${rol}',
         'public.tel_dagteller(text, text, text, integer, interval, text, integer)', 'EXECUTE');`,
    ).trim();

    expect(mag, `${rol} kan de teller van een ander ophogen — zie de kop van 0233`).toBe('f');
  });
});
