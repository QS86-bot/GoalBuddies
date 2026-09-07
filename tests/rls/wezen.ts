/**
 * Wie is de eigenaar van een achtergebleven groep? — QS8-329.
 *
 * ⚠️ **Waarom dit een eigen, importvrij bestand is.** De bewaker in `harness.ts`
 *    kon alleen geijkt worden door een échte database in een toestand te
 *    brengen, en dat is precies de vorm die dit project elders al heeft
 *    afgezworen: *een controle die je niet kunt voeden, kun je niet ijken*. Het
 *    oordeel staat daarom hier, zonder één import, en `tests/wezen.test.ts`
 *    biedt hem elke vorm los aan — de vormen die hij moet melden én de vormen
 *    die hij met rust moet laten.
 *
 * ⚠️ **Wat er misging, en het stond met zoveel woorden voorspeld.** De kop van
 *    de bewaker zei: *"De vensterkeuze leunt op `fileParallelism: false` … Draait
 *    deze groep ooit parallel, dan is dit een valse rode."* Die aanname gold
 *    binnen één run. 📏 Op 07-09-2026 draaiden er twee sessies tegen dezelfde
 *    lokale stack, en de volle suite gaf **zes rode bestanden bij nul gefaalde
 *    tests** — elk bestand was los meteen weer groen.
 *
 * ⚠️ **Een tijdstempel is geen eigendomsbewijs**, en dat stond al in de harness.
 *    Deze module trekt die zin door: eigendom wordt afgeleid uit de bóekhouding
 *    (welke groepen heeft deze run aangemaakt) en uit de rij zelf (wie heeft hem
 *    aangemaakt), en niet uit de klok.
 */

/** Een groep van ná het begin van deze run, met zijn ledental erbij. */
export interface VerseGroep {
  readonly id: string;
  readonly naam: string;
  readonly status: string;
  /** `null` zodra de aanmaker verwijderd is — `groups.created_by` cascadeert niet. */
  readonly createdBy: string | null;
  readonly leden: number;
}

export type Wezensoort = 'schoon' | 'wezen' | 'ongemeten';

export interface Wezenoordeel {
  readonly soort: Wezensoort;
  /** Groepen die aantoonbaar van deze run zijn en niemand meer bevatten. */
  readonly vanOns: readonly VerseGroep[];
  /** Groepen van een andere lopende run. Niet van ons, dus niet ons oordeel. */
  readonly vanEenAndereRun: readonly VerseGroep[];
  /** Leeg én van niemand aan te wijzen: `created_by` is weg en wij kennen hem niet. */
  readonly nietToeTeWijzen: readonly VerseGroep[];
  readonly andereRunActief: boolean;
}

/**
 * Beoordeelt de verse groepen die na het opruimen zijn blijven staan.
 *
 * ⚠️ **Drie bakken en niet twee, want de derde is het eerlijke midden.** Een
 *    lege groep waarvan de aanmaker verwijderd is, ís niet toe te wijzen — dat
 *    is nu juist het lek waar deze bewaker voor gebouwd is (QS8-281:
 *    `verwijder_mijn_account()` zet `groups.created_by` op NULL en het
 *    lidmaatschap cascadeert weg, waarna beide wegen naar die groep dicht
 *    zitten). Draait er geen andere run, dan is zo'n groep van ons en hoort de
 *    run om te vallen. Draait er wél een, dan kán hij van hen zijn, en dan is
 *    de eerlijke uitslag **ongemeten** en niet groen.
 *
 * ⚠️ **`ongemeten` is met opzet geen stilte.** Dit project heeft een eigen issue
 *    over controles die "OVERGESLAGEN" printen en daarna exitcode 0 geven
 *    (QS8-268), en over een suite die zichzelf stil oversloeg (QS8-270). Wie
 *    hier iets afzwakt, hoort het te horen.
 */
export function beoordeelWezen(opties: {
  readonly verse: readonly VerseGroep[];
  /** De groepen die deze run zelf heeft aangemeld via `registreerGroep()`. */
  readonly onzeGroepen: ReadonlySet<string>;
  /** De gebruikers die deze run heeft aangemaakt. */
  readonly onzeGebruikers: ReadonlySet<string>;
  /**
   * Hoeveel profielen er ná het begin van deze run zijn aangemaakt die niet van
   * ons zijn. Boven nul is er aantoonbaar een tweede run bezig.
   *
   * ⚠️ Een tellíng en niet een vlag, zodat de aanroeper niet zelf een drempel
   *    hoeft te kiezen — en zodat de melding kan zeggen hoeveel het er waren.
   */
  readonly verseVreemdeProfielen: number;
  /**
   * Is er eerder in déze run al een andere run gezien?
   *
   * ⚠️ **Dit veld is de reparatie van een eerste versie die niet werkte, en de
   *    meting wees het aan.** Zonder geheugen kijkt de bewaker naar één moment,
   *    en de bevolking van de andere run knippert: tussen twee testbestanden
   *    door heeft die even nul verse profielen. 📏 Twee gelijktijdige runs gaven
   *    daardoor nog steeds drie valse rode — telkens op een fixture die de
   *    ándere run met opzet leeg had achtergelaten (`Opruiming vergeten`,
   *    `SETNULL proefgroep`).
   *
   *    De vraag is niet *"draait er nú iemand anders"* maar *"heeft er tijdens
   *    deze run iemand anders aan deze database gezeten"*, en die is monotoon.
   */
  readonly andereRunGezien: boolean;
}): Wezenoordeel {
  const vanOns: VerseGroep[] = [];
  const vanEenAndereRun: VerseGroep[] = [];
  const nietToeTeWijzen: VerseGroep[] = [];

  // ⚠️ **Élke verse groep met een lévende vreemde aanmaker telt mee als bewijs,
  //    ook een groep waar nog leden in zitten.** Dat is de reparatie van een
  //    signaal dat knipperde: keek de bewaker alleen naar lége vreemde groepen,
  //    dan was er tussen twee testbestanden van de andere run door even geen
  //    bewijs, en precies in dat gaatje viel de valse rode. Een run die
  //    middenin een bestand zit, heeft altijd fixtures met een levende
  //    aanmaker — en alleen middenin een bestand kan hij een verwarrende wees
  //    laten staan.
  const vreemdeAanmakers = opties.verse.filter(
    (g) => g.createdBy !== null && !opties.onzeGebruikers.has(g.createdBy),
  ).length;

  for (const groep of opties.verse) {
    if (groep.leden > 0) continue;

    const aangemeld = opties.onzeGroepen.has(groep.id);
    const onzeAanmaker = groep.createdBy !== null && opties.onzeGebruikers.has(groep.createdBy);

    if (aangemeld || onzeAanmaker) {
      vanOns.push(groep);
      continue;
    }

    // ⚠️ Een lévende aanmaker die niet van ons is, is het sluitende bewijs dat
    //    deze groep bij een andere run hoort. Dit is het geval dat op 07-09 de
    //    valse rode gaf.
    if (groep.createdBy !== null) {
      vanEenAndereRun.push(groep);
      continue;
    }

    nietToeTeWijzen.push(groep);
  }

  const andereRunActief =
    opties.andereRunGezien || opties.verseVreemdeProfielen > 0 || vreemdeAanmakers > 0;

  const soort: Wezensoort =
    vanOns.length > 0
      ? 'wezen'
      : nietToeTeWijzen.length === 0
        ? 'schoon'
        : andereRunActief
          ? 'ongemeten'
          : 'wezen';

  return { soort, vanOns, vanEenAndereRun, nietToeTeWijzen, andereRunActief };
}

/** De tekst bij een oordeel. Leeg zodra er niets te melden valt. */
export function wezentekst(oordeel: Wezenoordeel): string {
  const noem = (groepen: readonly VerseGroep[]): string[] =>
    groepen.map((g) => `  ${g.id} — "${g.naam}" (${g.status})`);

  if (oordeel.soort === 'schoon') return '';

  if (oordeel.soort === 'ongemeten') {
    return [
      `ONGEMETEN: ${oordeel.nietToeTeWijzen.length} lege groep(en) zijn niet toe te wijzen,`,
      'en er draait aantoonbaar een tweede suite tegen deze database:',
      '',
      ...noem(oordeel.nietToeTeWijzen),
      '',
      '⚠️ Deze run is hierop dus niet gemeten, en dat is iets anders dan groen.',
      '   Draai de suite opnieuw wanneer je de stack alleen hebt; dan valt hij',
      '   om als de groepen van ons waren.',
    ].join('\n');
  }

  const alles = [...oordeel.vanOns, ...oordeel.nietToeTeWijzen];

  return [
    `Deze run laat ${alles.length} groep(en) zonder leden achter:`,
    '',
    ...noem(alles),
    '',
    '⚠️ Het opruimen vindt een groep via de lidmaatschappen van de gebruikers',
    '   die het verwijdert. Verdwijnt een lidmaatschap eerder — bijvoorbeeld',
    '   doordat een test `verwijder_mijn_account()` aanroept — dan is die weg',
    '   dicht. Roep `registreerGroep(id)` aan waar de groep wordt aangemaakt.',
  ].join('\n');
}
