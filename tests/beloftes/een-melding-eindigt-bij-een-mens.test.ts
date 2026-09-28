import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Database } from '../../src/lib/database.types.correcties';

import { roeptAan, zonderCommentaar } from './roept-aan';

/**
 * Een melding eindigt bij een mens — QS8-586, migratie 0296.
 *
 * ⚠️⚠️ **De belofte is niet "er is een scherm".** Hij is: *wat iemand meldt,
 *    komt terecht bij iemand die het kan afhandelen, en die kan er langs een
 *    knop bij.* Dat is een eigenschap van de kéten en niet van een onderdeel —
 *    onwrikbare regel 18, vraag 5 — en precies de vorm die dit project zeven
 *    keer betaald heeft: 📏 `public.reports` had sinds QS8-232 een tabel,
 *    policies, indexen, kolomgrants, spoofing-grendels én een schrijfpad in de
 *    app, en **nul** lezers. Elk schakeltje af, de keten onderbroken, en geen
 *    enkele test die het kón zien.
 *
 * ⚠️ **Geen van deze drie grijpt naar een bestandsnaam** (regel 18, vraag 4).
 *    Ze vegen `app/` en `src/modules/` af en vragen of de belofte *ergens*
 *    waar is. Verhuist het scherm, dan verhuist de toets mee zonder dat iemand
 *    hem aanraakt; verdwijnt hij, dan wordt hij rood.
 *
 * IJKING — met de hand, 22-09-2026. Eén mutatie per grendel, en de stand ervóór
 * is elke keer gemeten (`npx vitest run tests/beloftes/een-melding-…` → 5 groen):
 *
 *   A  `reporter_id: string` bij de hand in de `Returns` van
 *      `openstaande_meldingen` in `src/lib/database.types.ts` gezet
 *      -> `npm run typecheck` rood op precies deze regel:
 *         `tests/beloftes/een-melding-eindigt-bij-een-mens.test.ts(…): error TS1360`
 *      (de vitest-kant blijft groen — zie de kop van `typecorrecties.test.ts`:
 *       een uitspraak over types is op runtime niet te lezen)
 *   B  `handelMeldingAf(` uit `app/meldingen.tsx` weggehaald en vervangen door
 *      een vaste `{ ok: true }`
 *      -> 1 rood: 'er is een scherm dat een melding kan lezen én sluiten'
 *      -> en `exports:controle` óók rood: *handelMeldingAf() is vanaf geen
 *         enkel scherm of geplande taak te bereiken*
 *
 *   ⚠️ **Die tweede regel is een correctie op wat hier eerst stond.** Er stond
 *      dat `exports:controle` groen zou blijven omdat de import bleef staan —
 *      dat is gemeten en het is onwaar: 📏 die controle telt *aanroepen*, niet
 *      imports. Een onderbouwing zonder meting leest als een reden om er niet
 *      aan te twijfelen, en dan zou deze toets voor niets in de suite staan.
 *
 *   B2 dezelfde mutatie, maar de aanroep verhuisd naar `app/beoordelen.tsx` —
 *      lezen in het ene scherm, sluiten in het andere
 *      -> `exports:controle` **groen** (3 onbereikbaar, precies het plafond)
 *      -> 1 rood: 'er is een scherm dat een melding kan lezen én sluiten'
 *
 *   ⚠️ **B2 is dus wat deze toets toevoegt**, en B is wat hij deelt. De belofte
 *      is niet *"de functie is ergens bereikbaar"* maar *"er is één plek waar
 *      een mens een melding leest én afsluit"*. Een lijst die je niet kunt
 *      sluiten is de meldknop nog een keer.
 *   C  `profiel?.platform_beheerder === true` als voorwaarde voor de
 *      ingangskaart in `app/(tabs)/profiel.tsx` gezet
 *      -> 1 rood: 'de schermlaag kent de rol niet — de database beslist'
 */

/** Eén rij uit de lezer, zoals de schermlaag hem krijgt. */
type Melding = Database['public']['Functions']['openstaande_meldingen']['Returns'][number];

/** `true` zolang `reporter_id` géén veld van `R` is. */
type ZonderMelder<R> = 'reporter_id' extends keyof R
  ? { fout: 'de lezer geeft reporter_id terug'; gekregen: keyof R }
  : true;

/**
 * A — **de melder blijft buiten beeld, en dat is een kolombelofte.**
 *
 * ⚠️⚠️ *RLS kan geen kolommen beperken.* Dat `reporter_id` niet meegaat is dus
 *    geen policy maar de **returntabel** van `openstaande_meldingen()`, en een
 *    `select *` erbij zou hem stilzwijgend terugbrengen. De databasekant staat
 *    in `tests/rls/melding-komt-aan.test.ts`; dit is de naad ernaast — het type
 *    waarmee de schermlaag werkt.
 *
 * ⚠️ **Een tsc-toets en geen vitest-toets**, zelfde reden als bij
 *    `typecorrecties.test.ts`: bij het bouwen van de bundel is er van `Returns`
 *    niets meer over. De grendel is `npm run typecheck`, die in de poort én in
 *    CI draait.
 */
const BELOFTE = {
  'de lezer geeft reporter_id niet aan de schermlaag': true satisfies ZonderMelder<Melding>,

  /**
   * ⚠️ **De tanden van de toets hierboven.** Zonder deze regel is
   *    `ZonderMelder<>` waar voor élk type en bewijst de eerste regel niets —
   *    precies vraag 3 uit regel 18. Verdwijnt de fout hier, dan wordt
   *    `@ts-expect-error` zélf een fout, en dan is dit bestand rood.
   */
  // @ts-expect-error — een rij mét `reporter_id` hoort wél af te gaan
  'en een rij die hem wél draagt gaat af': true satisfies ZonderMelder<{
    reporter_id: string;
  }>,
} as const;

/** Alle bronbestanden onder `map`, zonder tests. */
function bronnenIn(map: string): readonly { readonly pad: string; readonly inhoud: string }[] {
  const uit: { pad: string; inhoud: string }[] = [];

  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bronnenIn(pad));
    else if (/\.tsx?$/.test(pad) && !pad.includes('.test.')) {
      uit.push({ pad, inhoud: readFileSync(pad, 'utf8') });
    }
  }

  return uit;
}

describe('een melding eindigt bij een mens', () => {
  it('de belofte over `reporter_id` staat onder tsc', () => {
    // ⚠️ Deze `it` bewijst niets; hij is er zodat vitest dit bestand niet leeg
    //    noemt en zodat `BELOFTE` niet als ongebruikt wegvalt. De grendel is
    //    `npm run typecheck`. Zie de kop.
    expect(Object.keys(BELOFTE)).toHaveLength(2);
  });

  /**
   * B — **er is een scherm dat allebei de kanten doet.**
   *
   * ⚠️ Lezen én sluiten in hetzelfde bestand, met opzet. Een scherm dat de
   *    lijst toont en niets kan afsluiten, is de meldknop nog een keer: iets
   *    dat je ziet en waar niets uit volgt. 📏 En dat is geen bedacht geval —
   *    het is wat `reports` twee maanden lang wél had (een schrijfkant) en niet
   *    (een uitkomst).
   */
  it('er is een scherm dat een melding kan lezen én sluiten', () => {
    const schermen = bronnenIn('app').filter(
      (b) => roeptAan(b.inhoud, 'fetchOpenstaandeMeldingen') && roeptAan(b.inhoud, 'handelMeldingAf'),
    );

    expect(
      schermen.map((b) => b.pad),
      'een lezer zonder afhandeling is de meldknop nog een keer: iets dat opslaat en niets in gang zet',
    ).not.toEqual([]);
  });

  /**
   * C — **de rol staat nergens in de schermlaag.**
   *
   * ⚠️⚠️ De ingangskaart vraagt de database *"is er iets voor mij"* en niet
   *    *"ben ik beheerder"*. Zou hij op `platform_beheerder` beslissen, dan zijn
   *    er twee waarheden over wie mag beoordelen — de kolom en de RPC — en die
   *    kunnen uit elkaar lopen. De gevaarlijke richting is niet dat de knop te
   *    vaak verschijnt maar dat hij te wéinig verschijnt: dan komt een melding
   *    opnieuw nergens aan, en dat is het gat dat dit issue dicht deed.
   *
   * ⚠️ Dezelfde gedachte als bij domeinregel 7: *de regel is pas afgedwongen als
   *    de dátabase hem afdwingt.* De schermlaag hoort er geen kopie van te
   *    hebben.
   */
  it('de schermlaag kent de rol niet — de database beslist', () => {
    const noemers = [...bronnenIn('app'), ...bronnenIn('src/modules')]
      .filter((b) => zonderCommentaar(b.inhoud).includes('platform_beheerder'))
      .map((b) => b.pad);

    expect(
      noemers,
      'wie mag beoordelen staat in `openstaande_meldingen()` en in `handel_melding_af()`; een tweede kopie in de client kan er stil van af gaan lopen',
    ).toEqual([]);
  });

  /**
   * MUST-ALLOW bij C — de zeef meldt niet zomaar alles.
   *
   * ⚠️ Zonder deze helft is de toets hierboven ook groen als hij nooit iets
   *    vindt, en dan leert een lege uitslag je niets. Hij hóórt de generatie te
   *    zien staan: `src/lib/database.types.ts` draagt de kolom, en dat bestand
   *    valt met opzet buiten de twee mappen hierboven.
   */
  it('MUST-ALLOW: de kolom bestaat wel degelijk, alleen niet in de schermlaag', () => {
    // ⚠️ Door de knip, want dit is een **bevestigende** `toContain` op ruwe
    //    bron: zonder hem is hij ook waar als de kolom alleen in een comment
    //    staat, en bij een tijdelijke uitschakeling is dat precies waar hij
    //    belandt (QS8-568). `belofteknip:controle` bewaakt die klasse.
    const gegenereerd = zonderCommentaar(readFileSync('src/lib/database.types.ts', 'utf8'));

    expect(gegenereerd, 'anders toetst de zeef hierboven een naam die nergens meer bestaat').toContain(
      'platform_beheerder',
    );
  });

  /**
   * MUST-ALLOW bij B — de zeef kijkt naar een aanroep en niet naar een naam.
   *
   * ⚠️ `roeptAan()` eist de haakjes, dus een `import { handelMeldingAf }` zonder
   *    gebruik telt niet. Dat is precies het verschil dat ijking B meet, en het
   *    is het verschil met `exports:controle`: die vraagt of er een pad naar een
   *    scherm ís, deze of het scherm hem ook gebruikt.
   */
  it('MUST-ALLOW: een bestand dat de functie alleen noemt, telt niet als scherm', () => {
    const alleenGenoemd = "import { handelMeldingAf } from '@/modules/buddies';";

    expect(roeptAan(alleenGenoemd, 'handelMeldingAf')).toBe(false);
  });
});
