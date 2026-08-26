import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als
//    `migratieregister.test.ts`. TypeScript leest de JSDoc ernaast.
import { metSchuineStrepen, OVERSLAAN, treffersIn } from '../../scripts/tekst-controle.mjs';

/**
 * QS8-115 — de controle die hardgecodeerde UI-tekst moet vinden.
 *
 * ⚠️ **Deze tests bestaan omdat de controle maandenlang groen stond terwijl er
 *    onvertaalde tekst in de app zat.** In `app/groep/beheer/[id].tsx` alleen al
 *    zeven zinnen: een prop met één woord, een prop die over meerdere regels
 *    loopt, twee tekstsleutels in een objectliteraal, een zin in `setMelding()`
 *    en JSX-tekst met een accolade erin.
 *
 *    Het probleem was niet dat de heuristieken slecht waren. Het was dat ze
 *    nooit tegen een bekend geval gelegd zijn — er wás geen manier om te zien
 *    wat de controle wél vindt zonder de hele codebase te wijzigen. Dat is
 *    precies wat `CLAUDE.md` bij de secret-scan opschrijft: **een controle die
 *    nog nooit rood is geweest, is een aanname.**
 *
 * ⚠️ De tweede helft is even belangrijk als de eerste. Een controle die álles
 *    meldt, leert je hem te negeren; elke vorm die hij met rust moet laten,
 *    staat hier ook.
 */

/** De teksten die de controle in dit fragment vindt. */
function gevonden(...regels: readonly string[]): readonly string[] {
  return (treffersIn([...regels]) as { regel: number; tekst: string }[]).map((t) => t.tekst);
}

/** Hetzelfde, maar voor een bestand zonder JSX. */
function gevondenInTs(...regels: readonly string[]): readonly string[] {
  return (treffersIn([...regels], false) as { regel: number; tekst: string }[]).map((t) => t.tekst);
}

describe('wat de controle moet vinden', () => {
  it('een tekstprop met een zin erin', () => {
    expect(gevonden('<Field label="Naam van de groep" />')).toEqual(['Naam van de groep']);
  });

  it('een tekstprop met één woord dat met een hoofdletter begint', () => {
    // ⚠️ Dit gat liet `label="Huddledag"` er precies langs. Eén woord op een
    //    knop is nog steeds een woord dat vertaald moet worden.
    expect(gevonden('<Choice label="Huddledag" />')).toEqual(['Huddledag']);
  });

  it('een tekstsleutel in een objectliteraal', () => {
    // `empty={{ title: '…', body: '…' }}` — de propvariant zoekt `title=`, en
    // hier staat `title:`.
    expect(gevonden("  empty={{ title: 'Deze groep is er niet', body: 'x' }}")).toEqual([
      'Deze groep is er niet',
    ]);
  });

  it('een zin in setMelding()', () => {
    expect(gevonden("    setMelding('Opgeslagen. Alles staat er nog.');")).toEqual([
      'Opgeslagen. Alles staat er nog.',
    ]);
  });

  it('JSX-tekst met een waarde erin', () => {
    // ⚠️ De vorm die je vergeet, want hij ziet eruit als code.
    expect(gevonden('<Caption>Voorlezen kan ook: {toonCode(code)}</Caption>')).toEqual([
      'Voorlezen kan ook:',
    ]);
  });

  it('JSX-tekst naast een vertaalde waarde op dezelfde regel', () => {
    // ⚠️ De oude versie sloeg een regel volledig over zodra er érgens een `t(`
    //    op stond. Dan is één vertaalde sleutel genoeg om de rest te verbergen.
    expect(gevonden("<Body>{t('kop')} en de rest in het Nederlands</Body>")).toEqual([
      'en de rest in het Nederlands',
    ]);
  });

  it('een tekstprop die over meerdere regels loopt', () => {
    // ⚠️ De propregex eist de sluitquote op dezelfde regel en ziet hier dus
    //    niets. Alleen de tóestand — "we staan binnen hint={ … }" — vindt dit.
    expect(
      gevonden(
        '                  hint={',
        "                    'De gedeelde dag van de groep. Verandert niets aan ' +",
        "                    'wanneer jouw eigen weekdoelen resetten.'",
        '                  }',
      ),
    ).toEqual([
      'De gedeelde dag van de groep. Verandert niets aan ',
      'wanneer jouw eigen weekdoelen resetten.',
    ]);
  });

  it('een toegankelijkheidslabel, want een schermlezer leest dat voor', () => {
    expect(gevonden('<View accessibilityLabel="Laden" />')).toEqual(['Laden']);
  });

  it('een stringliteral binnen een JSX-accolade', () => {
    // ⚠️ **Dit gat is door de reparatie van 24-08 zélf veroorzaakt.** Om achttien
    //    valse meldingen te doden knipt de controle elke `{…}` weg — en daarmee
    //    ook de tekst die er letterlijk in staat. Gevonden door de
    //    code-critic-ronde, met een levend geval: twee Nederlandse knoplabels in
    //    `app/doel/coach/[id].tsx` terwijl de controle "nul" meldde.
    expect(gevonden("<Body>{'Twee woorden hier'}</Body>")).toEqual(['Twee woorden hier']);
  });

  it('een knoplabel in een ternary', () => {
    // Precies de vorm die er stond: `{bewaard ? 'Bewaard' : 'Antwoorden bewaren'}`.
    expect(gevonden("        {bewaard ? 'Bewaard' : 'Antwoorden bewaren'}")).toContain('Bewaard');
  });

  it('een template-literal met tekst erin', () => {
    // Aparte pas, want een template draagt zijn eigen accolades. Dit was de vorm
    // op regel 410 van datzelfde bestand — met de hand gevonden, niet gemeten.
    expect(gevonden('<Subheading>{`${n} mijlpalen voorgesteld`}</Subheading>')).toEqual([
      'mijlpalen voorgesteld',
    ]);
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een sleutel die door t() gaat', () => {
    expect(gevonden("<Caption>{t('reeks.beste', { aantal: 3 })}</Caption>")).toEqual([]);
  });

  it('commentaar, ook over meerdere regels', () => {
    expect(
      gevonden(
        '  /*',
        '    Dit is uitleg voor de bouwer en geen tekst voor de gebruiker.',
        '  */',
        '  // En dit ook niet.',
      ),
    ).toEqual([]);
  });

  it('aanhalingstekens als entiteit om een waarde heen', () => {
    // ⚠️ Zes valse meldingen bij de eerste meting. Na het knippen van de waarde
    //    blijft `&ldquo;  &rdquo;` over, en dat zijn drie letters achter elkaar.
    expect(gevonden('<Body>&ldquo;{titel}&rdquo;</Body>')).toEqual([]);
  });

  it('een tijdzone en een voorbeeldcode, want dat is geen taal', () => {
    // Een sleutel in de catalogus is een uitnodiging om er iets anders van te
    // maken, en dat breekt hier het voorbeeld. Zelfde reden als bij een merknaam.
    expect(gevonden('<Field placeholder="Europe/Amsterdam" />')).toEqual([]);
    expect(gevonden('<Field placeholder="VYHC-2X9G-SRVH" />')).toEqual([]);
  });

  it('een merknaam', () => {
    expect(gevonden('<Button label="Apple" />')).toEqual([]);
  });

  it('een propwaarde die geen zin is', () => {
    // `variant="stil"` en `mode="date"` beginnen met een kleine letter, en dat is
    // precies het verschil met een label.
    expect(gevonden('<Button variant="stil" mode="date" testID="knop-opslaan" />')).toEqual([]);
  });

  it('een objectliteraal in gewone code, ook met hoofdletters erin', () => {
    // ⚠️ Vijf valse meldingen bij de eerste meting van de accoladepas:
    //    `{ name: 'ECDSA', hash: 'SHA-256' }` in de webpush-crypto en
    //    `{ onConflict: 'group_id,user_id' }` in een upsert. Dat is geen
    //    schermtekst, en JSX bestaat in dit project alleen in een `.tsx`.
    expect(gevondenInTs("    { name: 'ECDSA', hash: 'SHA-256' },")).toEqual([]);
    expect(gevondenInTs("      { onConflict: 'group_id,user_id,group_period_start' },")).toEqual([]);
  });

  it('een stijlwaarde in een JSX-prop', () => {
    // Een hoofdletter scheidt een zin van een stijlwaarde; `'red'` en `'center'`
    // hebben er geen.
    expect(gevonden("<View style={{ color: 'red', textAlign: 'center' }} />")).toEqual([]);
  });

  it('een accolade met alleen variabelen erin', () => {
    expect(gevonden('        {open ? eenTekst : andereTekst}')).toEqual([]);
    expect(gevonden('        const pad = `/groep/${id}`;')).toEqual([]);
  });

  it('gewone code die toevallig op een JSX-tag lijkt', () => {
    // ⚠️ Zonder de eis van een sluittag meldde deze variant `Promise<T>`, een
    //    vergelijking en de pijl van een lambda. Die ijking blijft gelden.
    expect(gevonden('  const klaar = (n: number) => n <= grens;')).toEqual([]);
    expect(gevonden('  async function laad(): Promise<Resultaat> {')).toEqual([]);
  });
});

/**
 * De drie vormen die op 25-08-2026 door de meting heen kwamen — de zesde ijking.
 *
 * ⚠️ **Alle drie hetzelfde patroon: de heuristiek zocht een náám in plaats van
 *    een vorm.** De zetterlijst kende `setMelding`, `setFout` en `setStatus`, en
 *    `app/aanmelden.tsx` gebruikt `setGelukt`. De propvariant eiste de string
 *    direct achter de dubbele punt, en er stond een terugval tussen. En een
 *    `return` van een zin keek niemand naar, terwijl een functie die een zin
 *    teruggeeft per definitie schermtekst levert.
 *
 *    Gevonden doordat een reviewronde de app met de hand naast de controle legde
 *    — niet doordat de controle iets meldde. Dat is de derde keer dat dit script
 *    op die manier bijgesteld wordt, en de reden dat deze tests bestaan.
 */
describe('de zesde ijking — wat er op 25-08 doorheen kwam', () => {
  it('vindt een zin in een willekeurige setter, niet alleen in de drie bekende', () => {
    expect(
      gevonden("      setGelukt('Gelukt. Staat e-mailbevestiging aan, kijk dan even in je inbox.');"),
    ).toEqual(['Gelukt. Staat e-mailbevestiging aan, kijk dan even in je inbox.']);
  });

  it('vindt een zin die een functie teruggeeft', () => {
    // Stond vijf regels naast een `t()`-aanroep in hetzelfde bestand.
    expect(
      gevonden('      return `Je hebt vandaag al 10 keer de Doelcoach gebruikt.`;'),
    ).toEqual(['Je hebt vandaag al 10 keer de Doelcoach gebruikt.']);
  });

  it('vindt een tekstprop met een terugval ervoor', () => {
    // ⚠️ De gevaarlijkste van de drie: de zin ís hier de terugval, dus hij
    //    verschijnt precies wanneer er iets misgaat.
    expect(gevonden("          melding: job.error ?? 'De Doelcoach liep vast.',")).toEqual([
      'De Doelcoach liep vast.',
    ]);
  });
});

describe('wat de drie nieuwe vormen met rust moeten laten', () => {
  /**
   * ⚠️ **Dit is de helft die het verschil maakt tussen een controle en ruis.** De
   *    eerste versie van deze drie heuristieken meldde negenenveertig regels
   *    terwijl er drie fout waren: elke `return 'note_required'`, elke
   *    `setFase('rust')` en elke redencode uit `regels.ts`. Het onderscheid dat
   *    dat oploste is de hoofdletter — in dit project is een redencode
   *    kleingeschreven en begint een zin voor de gebruiker met een hoofdletter.
   */
  it('een setter die een toestand zet', () => {
    expect(gevonden("    setFase('rust');", "    setStand('pending');")).toEqual([]);
  });

  it('een teruggegeven redencode', () => {
    expect(
      gevonden("      return 'note_required';", "      return 'android';"),
    ).toEqual([]);
  });

  it('een teruggegeven reden van meerdere woorden, kleingeschreven', () => {
    // `magNudgen()` geeft zulke redenen terug voor het logboek. Ze lezen als
    // tekst en zijn het niet — en een regex kan dat alleen aan de hoofdletter zien.
    expect(gevonden("      return 'herinnering staat uit';")).toEqual([]);
  });

  it('een setter of return die al vertaald is', () => {
    expect(
      gevonden("      setGelukt(t('auth.gelukt'));", "      return t('coach.niet_jouw_doel');"),
    ).toEqual([]);
  });

  it('een tekstprop waarvan de terugval al vertaald is', () => {
    expect(gevonden("          melding: job.error ?? t('coach.vastgelopen'),")).toEqual([]);
  });
});

/**
 * De uitzonderingen werken ook op Windows — gevonden op 26-08-2026.
 *
 * ⚠️ **Deze bug heeft twaalf groene CI-runs overleefd en is gevonden door de
 *    eerste run van de `scripts_windows`-job.** `bestanden()` bouwt zijn paden
 *    met `join()`, dat op Windows `src\lib\database.types.ts` geeft, terwijl
 *    `OVERSLAAN` met schuine strepen geschreven is. De uitzonderingen matchten
 *    daar dus nóóit: de catalogus in `shared/i18n` en de gegenereerde
 *    `database.types.ts` werden meegescand, en de controle meldde tientallen
 *    typedeclaraties als onvertaalde UI-tekst.
 *
 * ⚠️ Dit is de tweede laag van dezelfde les. `tests/scripts/padvormen.test.ts`
 *    leest of een script kán starten; deze test leest of het het júiste doet
 *    met een pad dat het op Windows krijgt. Geen van beide had de ander
 *    gevonden — en alleen de echte runner vond hem in de eerste plaats.
 */
describe('paduitzonderingen zijn platformonafhankelijk', () => {
  it.each([
    ['de gegenereerde types', 'src\\lib\\database.types.ts'],
    ['de catalogus', 'src\\shared\\i18n\\nl.ts'],
    ['een testbestand', 'src\\modules\\goals\\regels.test.ts'],
  ])('slaat %s over, ook met Windows-scheidingstekens', (_naam, pad) => {
    // ⚠️ Letterlijke backslashes, en níét omgezet naar `sep`. Op een
    //    Linux-runner ís `sep` al `/`, dus dan zou deze test een pad voeren dat
    //    al goed stond en niets bewijzen. Daarom normaliseert
    //    `metSchuineStrepen()` beide scheidingstekens.
    expect(OVERSLAAN.some((r: RegExp) => r.test(metSchuineStrepen(pad)))).toBe(true);
  });

  it.each([
    ['een gewoon scherm', 'app/(tabs)/profiel.tsx'],
    ['een module', 'src/modules/goals/regels.ts'],
  ])('laat %s wél scannen', (_naam, pad) => {
    // ⚠️ De andere richting. Een uitzonderingenlijst die alles overslaat, is
    //    een controle die nooit meer iets vindt.
    expect(OVERSLAAN.some((r: RegExp) => r.test(metSchuineStrepen(pad)))).toBe(false);
  });
});
