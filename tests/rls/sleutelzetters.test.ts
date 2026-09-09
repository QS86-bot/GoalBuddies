import { describe, expect, it } from 'vitest';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * De sleutelteller kijkt per sleutel — QS8-376, migratie 0215.
 *
 * ⚠️⚠️ **`sleutelzetters()` is een grendel, en een grendel die je niet kunt
 *    voeden, kun je niet ijken.** `stille-weigering.test.ts` toetst dat de teller
 *    nul rijen geeft; dat is de must-allow en die blijft daar staan. Wat er
 *    ontbrak is de andere helft: dat hij élke vorm die hij belooft te vangen ook
 *    daadwerkelijk meldt. Zonder die helft is "de teller is leeg" niet te
 *    onderscheiden van "de teller vindt niets meer".
 *
 * ⚠️ **De derde tak keek per functie in plaats van per sleutel.** Zodra een
 *    functie ook maar één geregistreerde sleutel noemde, viel ze buiten die tak —
 *    inclusief elke onbekende sleutel die ze daarnaast zette. 📏 Dat is precies de
 *    route die in onderhoud voorkomt: wie een bestaande rem uitbreidt, raakt hem.
 *
 * ⚠️ **Elke vorm heeft zijn eigen geval**, want één mutatie voor een teller met
 *    drie takken meet één tak. Dat is in dit project al een keer misgegaan met een
 *    ijking die door een eerdere grendel liep.
 *
 * ⚠️ **Alles draait in een teruggerolde transactie.** DDL is in Postgres
 *    transactioneel, dus een verzonnen functie of een uitgebreide rem bestaat
 *    alleen binnen de `begin`/`rollback`. Er blijft niets van achter.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'sleutelzetters'",
  import.meta.url,
);

/** Draait `sleutelzetters()` nadat `opstelling` is toegepast, en rolt alles terug. */
function tellerNa(opstelling: string): string {
  return (
    psql(`
      begin;
      ${opstelling}
      select coalesce(string_agg(naam || ' | ' || bezwaar, ' /// '), 'NIETS')
        from sleutelzetters();
      rollback;
    `)
      .split('\n')
      .map((regel) => regel.trim())
      .filter((regel) => regel !== '')
      .at(-1) ?? ''
  );
}

/**
 * `rem_doelen()` opnieuw, met een verzonnen sleutel erbij.
 *
 * ⚠️ De echte definitie wordt uit de database gelezen en niet hier overgeschreven:
 *    een kopie zou verouderen zodra iemand die rem aanpast, en dan ijkt dit geval
 *    een functie die niet meer bestaat.
 */
function remDoelenMetExtraSleutel(sleutel: string): string {
  return `
  do $ijking$
  declare v_def text;
  begin
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'rem_doelen';

    if v_def is null then
      raise exception 'rem_doelen() bestaat niet meer; dit ijkgeval wijst nergens naar';
    end if;

    -- ⚠️ \`replace\` vervangt élk voorkomen. rem_doelen() heeft vandaag precies één
    --    \`begin\`; krijgt hij ooit een genest blok, dan injecteert dit meerdere
    --    keren. Onschadelijk voor de uitkomst, maar het is een aanname en die
    --    hoort opgeschreven.
    execute replace(
      v_def,
      'begin',
      'begin' || chr(10) || '  perform set_config(''app.${sleutel}'', ''1'', true);'
    );
  end
  $ijking$;
`;
}

describe.skipIf(!beschikbaar)('de sleutelteller vangt elke vorm', () => {
  it('MUST-FIND: de eigenaar van een sleutel zet er ongezien een onbekende bij', () => {
    // ⚠️⚠️ **Dit is het gat van QS8-376, en het is de belangrijkste van de drie.**
    //    📏 Vóór 0215 gaf dit geval `NIETS`: tak 1 zwijgt terecht (de functie mag
    //    haar eigen sleutel noemen) en tak 3 zweeg omdat de functie een
    //    geregistreerde sleutel noemt.
    const gemeld = tellerNa(remDoelenMetExtraSleutel('stiekeme_ijksleutel'));

    expect(gemeld, 'de onbekende sleutel werd niet gemeld').toContain('app.stiekeme_ijksleutel');
    expect(gemeld, 'de melding wijst niet naar de functie die hem zet').toContain('rem_doelen');
  }, 120_000);

  it('MUST-FIND: de eigenaar zet er een sleutel bij die op de zijne lijkt', () => {
    // ⚠️⚠️ **Het gat dat ná de eerste reparatie nog openstond**, gevonden in de
    //    security-ronde. `app.rem_doelen2` ontsnapte omdat de regex `[a-z_]+`
    //    greedy afkapt op het cijfer: er blijft `app.rem_doelen` over, en dát
    //    staat in het register. Tak 1 zweeg omdat `rem_doelen` de toegestane
    //    eigenaar is. Twee correcte onderdelen, gat op de naad.
    //
    //    En het is geen verzonnen naam — zo heet een tweede teller op dezelfde
    //    tabel.
    const gemeld = tellerNa(remDoelenMetExtraSleutel('rem_doelen2'));

    expect(gemeld, 'een sleutel met een cijfersuffix bleef ongemeld').toContain(
      'app.rem_doelen2',
    );
  }, 120_000);

  it('MUST-FIND: de eigenaar zet er een sleutel met hoofdletters bij', () => {
    // ⚠️⚠️ **Een GUC-naam is in Postgres hoofdletterongevoelig**, en dat maakt dit
    //    meer dan een vormkwestie. 📏 Gemeten:
    //
    //      select set_config('app.REM_DOELEN', 'ja', true);
    //      select current_setting('app.rem_doelen', true);   →  ja
    //
    //    Een functie die de hoofdlettervariant zet, schrijft dus de échte teller.
    //    De oude regex matchte na de punt geen hoofdletter, dus er was niet eens
    //    een treffer om te vergelijken.
    const gemeld = tellerNa(remDoelenMetExtraSleutel('REM_NIEUW'));

    expect(gemeld, 'een sleutel met hoofdletters bleef ongemeld').toContain('app.REM_NIEUW');
  }, 120_000);

  it('MUST-FIND: een vreemde functie zet de hoofdlettervariant van een bekende sleutel', () => {
    // De andere helft van dezelfde zaak, en de gevaarlijkste: dit is niet een
    // nieuwe sleutel maar een tweede zetter op een bestáánde rem, vermomd als
    // iets anders. Tak 1 vangt hem nu doordat de vergelijking `ilike` is.
    const gemeld = tellerNa(`
      create or replace function public.proef_hoofdlettervariant() returns void
        language plpgsql as $proef$
        begin perform set_config('app.REM_DOELEN', '1', true); end
      $proef$;
    `);

    expect(gemeld, 'de hoofdlettervariant van een bekende sleutel bleef ongemeld').toContain(
      'proef_hoofdlettervariant',
    );
  }, 120_000);

  it('MUST-FIND: een vreemde functie zet een sleutel die van een ander is', () => {
    // De eerste tak. Los geijkt, want hij vangt iets anders: niet een onbekende
    // sleutel maar een tweede zetter op een bekende.
    const gemeld = tellerNa(`
      create or replace function public.proef_derde_zetter() returns void
        language plpgsql as $proef$
        begin perform set_config('app.rem_doelen', '9', true); end
      $proef$;
    `);

    expect(gemeld, 'een tweede zetter op een bekende sleutel bleef ongemeld').toContain(
      'proef_derde_zetter',
    );
    expect(gemeld).toContain('app.rem_doelen');
  }, 120_000);

  it('MUST-FIND: een functie met alleen een onbekende sleutel', () => {
    // De derde tak in zijn oorspronkelijke vorm. Die werkte al, en moet blijven
    // werken — een reparatie die de nieuwe vorm vangt en de oude laat vallen, is
    // geen reparatie.
    //
    // ⚠️ **Alleen op de functienaam, en dat is een gerepareerde assertie.** De
    //    eerste versie toetste hier ook dat de sleutelnáám in de melding stond, en
    //    📏 daardoor werd dit geval rood zodra ik de teller terugzette naar zijn
    //    oude vorm — niet omdat het geval gemist werd, maar omdat de oude
    //    meldtekst de sleutel niet noemde. Dan meet de ijking de tekst en niet het
    //    gedrag, en lijkt de reparatie meer te repareren dan ze doet. Dat de
    //    melding de sleutel noemt is winst van 0215 en staat in het geval
    //    hierboven.
    const gemeld = tellerNa(`
      create or replace function public.proef_losse_sleutel() returns void
        language plpgsql as $proef$
        begin perform set_config('app.geheel_nieuwe_sleutel', '1', true); end
      $proef$;
    `);

    expect(gemeld, 'een functie met alleen een onbekende sleutel bleef ongemeld').toContain(
      'proef_losse_sleutel',
    );
  }, 120_000);

  it('MUST-ALLOW: zonder mutatie meldt hij niets', () => {
    // ⚠️ De keerzijde, en ze is hier meer waard dan elders: een teller die álles
    //    meldt, leer je uitzetten. Dit geval draait dezelfde opstelling als de
    //    drie hierboven, alleen zonder de mutatie — dus het toetst ook dat de
    //    `begin`/`rollback` eromheen zelf niets aanricht.
    expect(tellerNa(''), 'de teller meldt iets op een onaangeroerd schema').toBe('NIETS');
  }, 120_000);

  it('MUST-ALLOW: een rem die alleen zijn eigen sleutel zet, blijft ongemoeid', () => {
    // ⚠️ **Deze is gesubsumeerd, en dat hoort erbij te staan.** De
    //    security-ronde zocht een mutatie die alléén dit geval rood maakt en vond
    //    er geen: een tak die élke `app.`-sleutel meldt, maakt de must-allow
    //    hierboven net zo goed rood. Hij blijft staan omdat hij een ánder geval
    //    beschrijft — een rem die zijn eigen sleutel zet is de normale toestand,
    //    en die expliciet toetsen is goedkoop — maar hij voegt geen dekking toe.
    const gemeld = tellerNa(`
      do $herzet$
      declare v_def text;
      begin
        select pg_get_functiondef(p.oid) into v_def
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'rem_doelen';
        execute v_def;
      end
      $herzet$;
    `);

    expect(gemeld, 'een ongewijzigde rem wordt gemeld').toBe('NIETS');
  }, 120_000);
});
