/**
 * De belofte van QS8-72: **een gedeeld document voert niets uit.**
 *
 * ⚠️⚠️ **Waarom dit een eigen belofte is en niet "zoals de chatfoto".** §6 van
 *    `docs/decisions/2026-09-09-een-foto-in-de-chat.md` legt uit waarom het bij
 *    een foto niet erg is dat de emmer alleen de *gedeclareerde* MIME-header
 *    toetst en niet de bytes: *"het belandt in een `<Image>` — willekeurige bytes
 *    renderen niet en voeren niets uit."*
 *
 *    Een document belandt niet in een `<Image>`. Het gaat via een ondertekende
 *    URL naar de systeembrowser, en dáár ís een `text/html` vanaf de
 *    storage-origin uitvoerbare code — met leesrecht op alles wat die origin
 *    verder bewaart. De veiligheid hangt daarmee aan één ding: de allowlist van
 *    de emmer. Deze suite bewaakt die, en bewaakt dat de app hem niet verruimt.
 *
 * ⚠️⚠️ **De denylist is het deel dat vooruit kijkt.** De gelijkheidstoets
 *    hieronder vindt een verschil tussen app en migratie; hij vindt niet dat
 *    iemand `image/svg+xml` aan *allebei* toevoegt, en dat is precies hoe deze
 *    grendel zou wegvallen. De denylist zegt daarom niet "de lijst is deze",
 *    maar *"deze acht mogen er nooit in"* — met de reden per stuk.
 *
 * ⚠️ **Wat hier níet staat:** dat de policies kloppen en dat de CHECK de soort
 *    aan de extensie paart. Dat vraagt een database en staat in
 *    `tests/rls/chatdocbucket.test.ts` en
 *    `tests/rls/een-document-is-wat-het-zegt.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  CHATDOC_BUCKET,
  CHATDOC_MAX_BYTES,
  CHATDOC_NAAM_MAX,
  CHATDOC_TYPES,
  chatdocPad,
  schoneBestandsnaam,
  soortUitPad,
} from '../../src/modules/buddies/chatdoc';
import { CHATFOTO_TYPES } from '../../src/modules/buddies/chatfoto';
import { soortBijlage } from '../../src/modules/buddies/chat-schemas';
import { naarVerzending } from '../../src/shared/ui/verzendbijlage';

/**
 * ⚠️ `src/lib/supabase` trekt react-native binnen en dat parst deze runner niet.
 *    Deze suite raakt de client nergens aan — hij toetst constanten, twee
 *    reguliere expressies en twee migratiebestanden — dus een schil die bij elke
 *    aanroep omvalt is hier de juiste vorm. Zelfde reden en zelfde plek als in
 *    `tests/beloftes/avatar.test.ts`.
 */
vi.mock('../../src/lib/supabase', () => ({
  supabase: () => {
    throw new Error('deze suite praat niet met Supabase');
  },
}));

const M0238 = readFileSync('supabase/migrations/0238_een_document_hoort_bij_een_groep.sql', 'utf8');
const M0236 = readFileSync(
  'supabase/migrations/0240_een_bijlage_zegt_welke_soort_hij_is.sql',
  'utf8',
);
const CHATDOC_TS = readFileSync('src/modules/buddies/chatdoc.ts', 'utf8');
const DOCUMENT_TSX = readFileSync('src/shared/ui/Document.tsx', 'utf8');

/**
 * Hetzelfde bestand zonder commentaar.
 *
 * ⚠️ De kop van `Document.tsx` legt uit waarom er geen `Linking.openURL()` in
 *    staat, en noemt hem daarvoor. Een toets op de ruwe tekst zou dáár afgaan —
 *    op de uitleg van de belofte in plaats van op een schending ervan. Precies
 *    de vorm die CLAUDE.md beschrijft als *"een controle die alles meldt, leer je
 *    negeren"*.
 */
const DOCUMENT_CODE = DOCUMENT_TSX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * De typen die een browser naar de HTML-parser kan routeren, direct of via XSLT,
 * plus de twee die dat langs een omweg doen.
 *
 * ⚠️ De vraag bij een uitbreiding is nooit "is dit formaat gangbaar" maar
 *    **"routeert een browser dit ooit naar de HTML-parser"**. Bij twijfel: nee.
 */
const NOOIT: readonly (readonly [string, string])[] = [
  ['text/html', 'is per definitie uitvoerbaar vanaf de storage-origin'],
  ['application/xhtml+xml', 'zelfde parser, andere naam'],
  ['image/svg+xml', 'draagt <script> en wordt buiten een <img> uitgevoerd'],
  ['application/xml', 'kan met een xml-stylesheet-instructie naar XSLT'],
  ['text/xml', 'idem'],
  ['text/xsl', 'is de XSLT zelf'],
  ['text/plain', 'is historisch door browsers gesniffd'],
  ['application/octet-stream', 'ontkoppelt type van extensie en laat daarmee alles binnen'],
];

/** De `allowed_mime_types` van een emmer, uit de insert van zijn migratie. */
function typenUit(sql: string): readonly string[] {
  const blok = /allowed_mime_types[\s\S]*?array\[([^\]]+)\]/i.exec(sql);
  expect(blok, 'geen allowed_mime_types in de migratie').not.toBeNull();
  return [...(blok?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

/**
 * Elke emmer die de migratiemap aanmaakt, met de typen die hij toelaat.
 *
 * ⚠️⚠️ **De hele migratiemap en niet één bestand, en dat is de reparatie van een
 *    gemeten bevinding.** 📏 Op 10-09-2026 gemeten: een lid mag een eigen object
 *    met één `update` van `chatfotos` (of `avatars`) naar `chatdocs` verhuizen —
 *    policies worden over emmers heen ge-OR'd, en op databaseniveau kijkt niets
 *    terug naar het type. **Het effectieve typebereik van `chatdocs` is dus de
 *    unie over élke emmer waar een lid vandaan mag verhuizen**, en een denylist
 *    die alleen 0238 leest, blijft groen als iemand `image/svg+xml` aan een
 *    ándere emmer toevoegt.
 *
 *    Dat is regel 18 vraag 2 in zijn zuiverste vorm: de toets ging over een
 *    eigenschap van het ónderdeel terwijl de belofte over het gehéél gaat. De
 *    verhuizing zelf staat als open rij in `docs/ENGINEER-REVIEW.md` (QS8-407);
 *    dit is de helft die een test kan dragen.
 *
 * ⚠️ Een `on conflict do update`-vorm telt mee, want die zet de waarde óók.
 */
function emmersInDeMigratiemap(): ReadonlyMap<string, readonly string[]> {
  const uit = new Map<string, readonly string[]>();

  for (const bestand of readdirSync('supabase/migrations').filter((n) => n.endsWith('.sql'))) {
    /*
      ⚠️⚠️ **Eerst de `--`-commentaren eruit, en dat is geen netheid.** 📏 Zonder
         die stap eindigt de niet-gulzige match op de eerste `;` in de tekst, en
         die staat in 0222 middenin een TODO-regel ("*op een betaalde tier mag
         dit omhoog;*") — vóór de `array[...]`. Uitkomst: twee van de vier
         emmers vielen stil buiten de toets, en de suite was groen.

         Precies de vorm die deze reparatie moest wegnemen. `bucketsIn()` in
         `scripts/storage-controle.mjs` draagt dezelfde regex; dáár valt het niet
         op omdat die alleen de naam gebruikt, en die staat vóór het commentaar.
    */
    const sql = readFileSync(`supabase/migrations/${bestand}`, 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(
      /insert\s+into\s+storage\.buckets[\s\S]*?values\s*\(\s*'([^']+)'[\s\S]*?;/gi,
    )) {
      const naam = m[1] ?? '';
      const array = /allowed_mime_types[\s\S]*?array\[([^\]]+)\]/i.exec(m[0])
        ?? /array\[([^\]]+)\]/i.exec(m[0]);
      if (array === null) continue;
      uit.set(naam, [...(array[1] ?? '').matchAll(/'([^']+)'/g)].map((t) => t[1] ?? ''));
    }
  }

  return uit;
}

// ---------------------------------------------------------------------------

describe('de emmer en de app noemen dezelfde typen', () => {
  // ⚠️ **Een naad en geen onderdeel.** De emmer is de grendel (onwrikbare regel
  //    3); de lijst in de app is het gemak dat de gebruiker een reden geeft in
  //    plaats van een serverfout. Lopen ze uiteen, dan laat het formulier iets
  //    door dat de server weigert.
  it('de toegestane typen komen letterlijk uit migratie 0238', () => {
    expect([...typenUit(M0238)].sort()).toEqual([...CHATDOC_TYPES].sort());
  });

  it('de bovengrens komt letterlijk uit migratie 0238', () => {
    const getal = /'chatdocs',\s*'chatdocs',\s*false,\s*(?:--[^\n]*\n|\s)*?(\d+)/.exec(M0238);
    expect(getal, 'geen grootte in de insert van 0238').not.toBeNull();
    expect(Number(getal?.[1])).toBe(CHATDOC_MAX_BYTES);
  });

  it('de emmer is privé', () => {
    expect(M0238).toMatch(/values\s*\(\s*\n?\s*'chatdocs',\s*\n?\s*'chatdocs',\s*\n?\s*false/);
  });

  it('de bucketnaam in de app is de naam uit de migratie', () => {
    expect(CHATDOC_BUCKET).toBe('chatdocs');
  });
});

describe('geen enkel type dat een browser kan uitvoeren', () => {
  // ⚠️⚠️ **Dit is de grendel die vooruit kijkt.** De gelijkheidstoets hierboven
  //    blijft groen als iemand `image/svg+xml` aan *allebei* toevoegt. Deze niet.
  it.each(NOOIT)('%s staat niet in de emmer — %s', (type) => {
    expect(typenUit(M0238)).not.toContain(type);
  });

  it.each(NOOIT)('%s staat niet in de app — %s', (type) => {
    expect(CHATDOC_TYPES as readonly string[]).not.toContain(type);
  });

  it.each(NOOIT)('%s staat ook niet in de foto-emmer — %s', (type) => {
    // ⚠️ De fotolijst hoort er ook bij: een `image/svg+xml` dáár is dezelfde
    //    origin en dezelfde uitvoerbare code, en het argument van §6 ("het
    //    belandt in een `<Image>`") houdt niet meer zodra de ondertekende URL
    //    ergens anders heen kan.
    expect(CHATFOTO_TYPES as readonly string[]).not.toContain(type);
  });

  it.each(NOOIT)('%s staat in géén enkele emmer van de migratiemap — %s', (type) => {
    // ⚠️⚠️ **Dit is het geval waar de drie hierboven niet bij konden.** Een lid
    //    verhuist zijn eigen object tussen emmers met één `update`, dus een
    //    actief type in wélke emmer dan ook is een actief type in `chatdocs`.
    const emmers = emmersInDeMigratiemap();
    expect(emmers.size).toBeGreaterThan(1);

    const schuldig = [...emmers.entries()]
      .filter(([, typen]) => typen.includes(type))
      .map(([naam]) => naam);
    expect(schuldig, `${type} staat in ${schuldig.join(', ')}`).toEqual([]);
  });

  it('kent élke emmer die de migratiemap aanmaakt', () => {
    // ⚠️ Zonder dit geval is de toets hierboven groen zodra de parser niets
    //    vindt — de gevaarlijkste vorm van groen die er is. 📏 Vier emmers op
    //    10-09-2026; komt er een vijfde, dan hoort dit getal mee te bewegen en
    //    hoort iemand de rij hierboven bewust te lezen.
    expect([...emmersInDeMigratiemap().keys()].sort()).toEqual([
      'avatars',
      'bewijsfotos',
      'chatdocs',
      'chatfotos',
    ]);
  });

  it('de emmer serveert terug wat de app declareert, en dat is hard application/pdf', () => {
    // ⚠️⚠️ **De MIME van de kiezer wordt niet doorgegeven.** Wat de emmer bewaart
    //    is wat hij terugserveert, dus dít is de waarde die bepaalt of een
    //    browser het bestand ooit als HTML behandelt. Een `contentType` uit
    //    `bestand.mime` zou de allowlist tot een suggestie maken: de emmer toetst
    //    de gedeclareerde header, en die zou dan van de client komen.
    expect(CHATDOC_TS).toMatch(/contentType:\s*'application\/pdf'/);
    expect(CHATDOC_TS).not.toMatch(/contentType:\s*bestand\.mime/);
  });
});

describe('het pad ligt vast en de naam niet', () => {
  it('een gebouwd pad eindigt altijd op .pdf, wat de gebruiker ook koos', () => {
    // ⚠️ De extensie komt niet uit de bestandsnaam. Een `.PDF` of een `.tar.gz`
    //    haalt de CHECK van 0240 dus nooit, en het pad is per constructie in
    //    kleine letters — waar 0225 voor de chatfoto nog een reparatie voor nodig
    //    had.
    const pad = chatdocPad('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    expect(pad).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}\.pdf$/);
  });

  it('twee paden op rij zijn niet gelijk', () => {
    const a = chatdocPad('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const b = chatdocPad('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    expect(a).not.toBe(b);
  });

  it('de soort komt uit het pad en niet uit de naam', () => {
    // ⚠️ Zou de UI de soort uit de naam halen, dan stelt `factuur.pdf.exe` zich
    //    voor als PDF. Deze functie leest het pad, en het pad ligt vast in de
    //    CHECK.
    expect(soortUitPad('g/u/abc.pdf')).toBe('pdf');
    expect(soortUitPad('g/u/abc.exe')).toBeNull();
    expect(soortUitPad('g/u/abc.pdf.exe')).toBeNull();
    expect(soortUitPad('factuur.pdf.exe')).toBeNull();
  });
});

describe('schoneBestandsnaam maakt precies wat de CHECK toelaat', () => {
  /**
   * ⚠️⚠️ **Een naad tussen twee reguliere expressies in twee talen.** De klasse
   *    in `schoneBestandsnaam()` en de klasse in
   *    `chat_messages_attachment_name_vorm` (0240) moeten dezelfde tekens
   *    noemen. Lopen ze uiteen, dan poetst de app iets weg dat mocht, of laat ze
   *    iets staan dat de server weigert — en dat tweede is een melding waar de
   *    gebruiker niets aan kan doen.
   */
  it('de tekenklasse in de app is die van de CHECK in 0240', () => {
    const uitMigratie = /attachment_name\s*!~\s*'(\[[^']+\])'/.exec(M0236);
    expect(uitMigratie, 'geen tekenklasse in 0240').not.toBeNull();

    const uitApp = /\.replace\(\/(\[[^/]+\])\/g, ''\)/.exec(
      readFileSync('src/modules/buddies/chatdoc.ts', 'utf8'),
    );
    expect(uitApp, 'geen tekenklasse in schoneBestandsnaam()').not.toBeNull();

    // ⚠️ De app-klasse mist met opzet de `/`: die wordt niet geschrapt maar
    //    vervángen door een streepje, één regel lager. Vandaar dat hij er hier
    //    bij gezet wordt voordat de twee vergeleken worden.
    const appKlasse = (uitApp?.[1] ?? '').replace(/\]$/, '\\/]').replace('\\/', '/');
    expect(appKlasse).toBe(uitMigratie?.[1]);
  });

  it('haalt een bidi-teken eruit', () => {
    // `verslag<RLO>fdp.exe` rendert als `verslagexe.pdf` — een leugen met het
    // vertrouwen van de groep erachter.
    const rlo = String.fromCodePoint(0x202e);
    expect(schoneBestandsnaam(`verslag${rlo}fdp.exe`)).toBe('verslagfdp.exe');
  });

  it.each([
    ['een ARABIC LETTER MARK (U+061C)', 0x061c],
    ['een zero-width space (U+200B)', 0x200b],
    ['een zero-width joiner (U+200D)', 0x200d],
    ['een line separator (U+2028)', 0x2028],
  ])('haalt %s eruit', (_naam, punt) => {
    // ⚠️ Deze vier stonden er tot 10-09-2026 niet in. Geen van vieren is een
    //    override, dus het geval hierboven bleef dicht; wat er fout aan was, is
    //    dat twee van de drie bidi-marks geweigerd werden en U+061C niet.
    expect(schoneBestandsnaam(`verslag${String.fromCodePoint(punt)}.pdf`)).toBe('verslag.pdf');
  });

  it('laat een emoji in de naam met rust', () => {
    // ⚠️ De must-allow. CLAUDE.md staat de gebruiker uitdrukkelijk toe overal
    //    emoji te typen; een klasse die te ver reikt, weigert precies dat.
    expect(schoneBestandsnaam('verslag 😀.pdf')).toBe('verslag 😀.pdf');
  });

  it('vervangt een padscheider en laat de naam bestaan', () => {
    expect(schoneBestandsnaam('map/verslag.pdf')).toBe('map-verslag.pdf');
  });

  it('valt terug op een naam als er niets overblijft', () => {
    const rlo = String.fromCodePoint(0x202e);
    expect(schoneBestandsnaam(`${rlo}${rlo}`)).toBe('document.pdf');
    expect(schoneBestandsnaam('   ')).toBe('document.pdf');
  });

  it('kapt op codepunten en niet op UTF-16-eenheden', () => {
    // ⚠️⚠️ **De grens is 120 codepunten, want dat is wat `char_length` telt.**
    //    `.length` is altijd ≥ `char_length`, dus een client die in UTF-16 telt
    //    laat door wat Postgres weigert. En snijden op een surrogaatgrens rendert
    //    als een vervangingsteken — zie
    //    `docs/decisions/2026-08-28-tekst-zonder-grens.md`.
    const lang = '😀'.repeat(200);
    const uit = schoneBestandsnaam(lang);
    expect([...uit].length).toBe(CHATDOC_NAAM_MAX);
    expect(uit).not.toMatch(/�/);
    expect(uit.endsWith('😀')).toBe(true);
  });

  it('laat een naam van precies de grens met rust', () => {
    const opDeGrens = 'a'.repeat(CHATDOC_NAAM_MAX);
    expect(schoneBestandsnaam(opDeGrens)).toBe(opDeGrens);
  });
});

describe('soort, extensie en emmer zijn één drieklank', () => {
  /**
   * ⚠️⚠️ **De naad tussen de CHECK en `soortBijlage()`.** De CHECK van 0240 paart
   *    élke `type`-waarde die een bijlage mag dragen aan een extensieverzameling;
   *    `soortBijlage()` vertaalt diezelfde waarde naar een emmer. Komt er ooit
   *    een derde soort bij de CHECK bij zonder dat `soortBijlage()` hem kent, dan
   *    tekent de app tegen niets en zegt de bubbel "niet meer beschikbaar" —
   *    zonder dat er iets kapot is.
   */
  it('elke soort die de CHECK een bijlage gunt, kent de app', () => {
    const takken = [...M0236.matchAll(/\(type = '([a-z]+)' and attachment_url ~ /g)].map(
      (m) => m[1] ?? '',
    );
    expect(takken.length).toBeGreaterThan(1);
    for (const soort of takken) {
      expect(soortBijlage({ type: soort }), `de app kent '${soort}' niet`).not.toBeNull();
    }
  });

  it('en omgekeerd: elke soort die de app een emmer geeft, staat in de CHECK', () => {
    for (const soort of ['photo', 'doc', 'text', 'system']) {
      const heeftEmmer = soortBijlage({ type: soort }) !== null;
      const inCheck = M0236.includes(`(type = '${soort}' and attachment_url ~ `);
      expect(heeftEmmer, `'${soort}' loopt uiteen tussen app en CHECK`).toBe(inCheck);
    }
  });

  it('de fotoextensies van de app staan alle drie in de fototak van de CHECK', () => {
    const tak = /type = 'photo' and attachment_url ~ \([\s\S]*?\(([a-z|]+)\)/.exec(M0236);
    expect(tak, 'geen fototak in 0240').not.toBeNull();
    const uitCheck = (tak?.[1] ?? '').split('|');
    // `image/jpeg` levert `jpg`, en de CHECK laat `jpeg` er ook door.
    expect(uitCheck).toEqual(expect.arrayContaining(['jpg', 'png', 'webp']));
  });
});

describe('Document.tsx kan zijn eigen pad niet openen', () => {
  /**
   * ⚠️⚠️ **Een prop die er niet is, kan niet per ongeluk in een `openURL()`
   *    belanden.** Bij een `doc`-bericht is `attachment_url` in de app een kaal
   *    opslagpad — de tégenovergestelde belofte van die bij een `photo`-bericht,
   *    waar het ná `metGetekendeChatfotos()` een ondertekende URL is. Eén
   *    component dat allebei zou aannemen, is één verwisseling verwijderd van een
   *    leeg vlak of een lek.
   *
   * ⚠️ Deze toets grijpt naar het bestand, en dat is precies wat vraag 4 van
   *    regel 18 afraadt. Hij staat er tóch, omdat er in dit project geen
   *    opstelling is die een component tekent: er is geen `jsdom` en geen
   *    testing-library, en die erbij halen is een eigen besluit. **Het alternatief
   *    was geen test**, en de belofte staat in de kop van `Document.tsx` zodat
   *    hij met het component meeverhuist. Zie de rij hierover in
   *    `docs/ENGINEER-REVIEW.md`.
   */
  it('heeft geen url- of pad-prop', () => {
    const props = /export interface DocumentProps \{([\s\S]*?)\n\}/.exec(DOCUMENT_TSX);
    expect(props, 'geen DocumentProps gevonden').not.toBeNull();
    const zonderCommentaar = (props?.[1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(zonderCommentaar).not.toMatch(/\b(url|pad|href|uri)\b\s*:/);
  });

  it('opent zelf niets', () => {
    expect(DOCUMENT_CODE).not.toMatch(/openURL|Linking|window\.open/);
  });

  it('heeft alle vier de standen die onwrikbare regel 16 vraagt', () => {
    // rust (de knop), bezig (progressbar), fout (de melding) en leeg (afwezig).
    expect(DOCUMENT_TSX).toMatch(/accessibilityRole="progressbar"/);
    expect(DOCUMENT_TSX).toMatch(/accessibilityRole="button"/);
    expect(DOCUMENT_TSX).toMatch(/soort === null.*afwezigtekst/s);
    expect(DOCUMENT_TSX).toMatch(/fout === null \? null :/);
  });
});

describe('een foto wordt nooit per ongeluk een document', () => {
  /**
   * ⚠️⚠️ **`naam` is bij `stuurBericht()` de soortbepaler**, en dat staat daar met
   *    zoveel woorden: *"staat hij er, dan is dit een document en gaat het naar
   *    `chatdocs`"*. Die keuze valt op `typeof bijlage.naam === 'string'`, dus een
   *    foto die met een lege naam zou meekomen, gaat naar de verkeerde emmer —
   *    en `typeof '' === 'string'`. Dit is de naad tussen de keuze in het scherm
   *    en de emmerkeuze in de datalaag; hij is met een spread makkelijk stuk te
   *    maken en breekt dan niets zichtbaars.
   */
  it('een gekozen foto draagt geen naam-veld, ook geen leeg', () => {
    const uit = naarVerzending({ soort: 'foto', data: new Uint8Array([1]), mime: 'image/png' });
    expect('naam' in uit).toBe(false);
  });

  it('een gekozen document draagt zijn naam wél mee', () => {
    const uit = naarVerzending({
      soort: 'doc',
      data: new Uint8Array([1]),
      mime: 'application/pdf',
      naam: 'verslag.pdf',
    });
    expect(uit.naam).toBe('verslag.pdf');
  });

  it('de datalaag kiest de emmer op precies dat veld', () => {
    // ⚠️ Grijpt naar de bron omdat de keuze in `stuurBericht()` een netwerkronde
    //    diep zit. Verhuist die regel, dan hoort deze toets mee te verhuizen —
    //    de belofte staat in de kop van `naarVerzending()`.
    const chat = readFileSync('src/modules/buddies/chat.ts', 'utf8');
    expect(chat).toMatch(/typeof bijlage\.naam === 'string'/);
  });
});
