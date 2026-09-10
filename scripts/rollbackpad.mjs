#!/usr/bin/env node
/**
 * Het rollback-pad staat heel in de kop — QS8-405.
 *
 * ⚠️ **Waarom dit naast stap 3 van `migraties-controle.mjs` staat en die niet
 *    vervangt.** Die toetst of het wóórd `ROLLBACK` in de kop voorkomt. Dat is
 *    de helft die je met een grep kunt doen, en hij is groen zodra de markering
 *    er staat — ook als het pad eronder halverwege ophoudt.
 *
 * 📏 **Het geval, gemeten op 09-09-2026 in `0233` (QS8-405).** De kop zag er zo
 *    uit, met de regelnummers van toen:
 *
 *       4| -- ROLLBACK-PAD:
 *       5| --   -- ⚠️⚠️ Ook `bewijsfotos` krijgt de bredere vorm …
 *      11| --    dan een hele".
 *      12|
 *      13| drop trigger if exists bewijsfotos_aantal_begrensd_verhuisd …   <- live SQL
 *      21|   execute function public.bewaak_bewijsfoto_aantal();
 *      23| drop trigger if exists avatars_aantal_begrensd_verhuisd …      <- zijn `--   ` kwijt
 *      24| --   drop trigger if exists chatfotos_aantal_begrensd_verhuisd …
 *
 *    Eén blok lichaam-SQL plus zijn aantekening was in de kop beland, en had
 *    onderweg de `--   ` van één rollback-stap meegenomen. Gevolg: de stap voor
 *    `avatars` draaide twee keer (onschadelijk, `if exists`), de stap voor
 *    `bewijsfotos` ontbrák in het pad, en de trigger die 0233 juist wilde
 *    toevoegen bestond alleen dankzij SQL die per ongeluk in de kop stond. Wie
 *    dat "opruimt" door de kop weer één blok te maken, haalt een grendel weg.
 *
 * ⚠️⚠️ **De toets die het issue voorstelde, vindt dit geval niet.** Dat was:
 *    *"alle regels tussen `ROLLBACK-PAD:` en de eerste lege regel beginnen met
 *    `--`"*. 📏 Nagemeten op het kapotte bestand: de zeven regels ertussen
 *    begonnen állemaal met `--`, want de aantekening was netjes uitgecommentarieerd.
 *    De toets zou groen zijn geweest op het bestand waarvoor hij bedacht was.
 *    Vandaar dat deze het aan de ándere kant pakt: niet "loopt de kop door" maar
 *    **"gaat het pad verder ónder het lichaam"**.
 *
 * ## De regel
 *
 * Draagt een migratie een rollback-markering in zijn kop, dan hoort het hele pad
 * in die kop te staan. Staat er ná de eerste uitvoerbare regel nog een
 * uitgecommentarieerd SQL-**statement** op padinspringing, dan is het pad
 * opengebroken.
 *
 * ⚠️ **De drie eisen samen zijn de meting en niet één ervan.** `--`, dan twee of
 *    meer spaties, dan een SQL-sleutelwoord, en de regel eindigt op `;`.
 *    📏 Over alle 237 migratiebestanden geeft dat precies één treffer: `0233`.
 *    Laat je de `;` weg, dan zijn het er twaalf en zijn er elf onzin — proza dat
 *    toevallig op `grant`, `insert` of `DELETE` afbreekt, zoals in `0168`:
 *
 *      --   insert or update on table "commitment_events" violates foreign key
 *
 *    Dat is een geciteerde Postgres-fout en geen statement. Een controle die die
 *    elf meldt, leer je uitzetten — en dan mist hij de twaalfde ook.
 *
 * ⚠️ De inspringing draagt echt gewicht: het pad in dit project schrijft
 *    `--   ` (drie spaties), gewoon commentaar schrijft `-- ` (één). Dat is wat
 *    "hoort bij het pad" van "hoort bij de tekst" scheidt.
 *
 * ⚠️ Geëxporteerd en los te voeden — `tests/scripts/rollbackpad.test.ts` biedt
 *    hem élke vorm aan, de vormen die hij moet vinden én de vormen die hij met
 *    rust moet laten. Een controle die je niet kunt ijken, kun je niet
 *    vertrouwen.
 *
 * ---------------------------------------------------------------------------
 * IJKING — met de hand, 10-09-2026
 * ---------------------------------------------------------------------------
 *
 * Mutatie per grendel en niet één voor de hele controle, en elke keer eerst met
 * een grep bevestigd dat de mutatie er écht in stond vóór de uitslag geloofd
 * werd. Nulmeting 13 groen, na afloop opnieuw 13 groen.
 *
 *   A  de kapotte kop van `0233` terugzetten
 *      → 1 rood in de suite (*de map zelf*) én `migraties:controle` meldt hem
 *        met naam en regelnummers. De twaalf andere gevallen blijven groen,
 *        want die voeren hun eigen bron aan
 *   B  de `;`-eis uit `PAD_STATEMENT` halen
 *      → 2 rood: de proza-must-allow én *de map zelf*. Die tweede ís de meting
 *        uit de kop: zonder de `;` meldt hij de elf geciteerde foutteksten
 *   C  de inspringing van `\s{2,}` naar `\s*` zetten
 *      → 1 rood: de must-allow met één spatie
 *   D  de `ROLLBACK`-poort uitschakelen
 *      → 1 rood: *zwijgt als er helemaal geen rollback-markering is*
 *
 * ⚠️⚠️ **Mutatie C was eerst groen, en dat is de vondst van deze ijking.** De
 *    must-allow luidde `-- drop table y; is hier nooit nodig` — met een staart,
 *    dus zonder afsluitende `;`. Die werd al door grendel B tegengehouden, en
 *    dus bewaakte hij niets van wat hij beloofde. Dat is woordelijk de valkuil
 *    die `CLAUDE.md` bij regel 18 noemt: *breek de grendel die de ijking nóemt,
 *    anders is de ijking zelf de aanname*. De test is aangescherpt tot een echt
 *    statement met één spatie, en toen werd C wél rood.
 *
 * ⚠️ **Wat deze ijking níet dekt, en dat hoort erbij te staan.** Haalt iemand de
 *    aanroep uit `migraties-controle.mjs`, dan blijft de suite groen — die
 *    voedt deze module rechtstreeks. Dat is geen gat in de belofte: *de map zelf*
 *    toetst álle migratiebestanden en draait mee in `npm test`, dus de grendel
 *    houdt ook zonder die aanroep. Wat je dan kwijt bent is de mélding op de
 *    plek waar iemand een migratie schrijft, en niet de bewaking.
 */

/**
 * Migraties die met reden een uitgecommentarieerd statement onder hun lichaam
 * dragen.
 *
 * ⚠️ **Vandaag leeg, en dat is de bedoeling.** Dit is de plek voor het geval dat
 *    er ooit is — een migratie die in het lichaam laat zien wat ze *niet* doet —
 *    en niet een plek om een echte melding weg te zetten. Zet je hier iets neer,
 *    schrijf dan op waaróm, net als in `ZONDER_PUSH` en `GEEN_SCHRIJFPAD`.
 *    De vraag die je eerst beantwoordt: hoort dit statement niet gewoon in het
 *    rollback-pad in de kop?
 */
export const AANVAARD = [];

/** Een rollback-markering, in elk van de drie spellingen die de map draagt. */
export const ROLLBACK = /^--\s*ROLLBACK(-PAD)?\b/im;

/**
 * Een uitgecommentarieerd SQL-statement op padinspringing.
 *
 * ⚠️ De `;` aan het eind is de helft die de elf valse meldingen wegneemt; zie de
 *    meting in de kop. Haal hem weg en de controle wordt onbruikbaar.
 */
export const PAD_STATEMENT =
  /^--\s{2,}(drop|create|alter|insert|update|delete|grant|revoke|comment on|truncate)\b.*;\s*$/i;

const uitvoerbaar = (regel) => {
  const s = regel.trim();
  return s !== '' && !s.startsWith('--');
};

/**
 * De regels waarop het rollback-pad ónder het lichaam doorloopt.
 *
 * Geeft een lege lijst als er niets aan de hand is, en ook als er helemaal geen
 * rollback-markering in de kop staat — dat laatste is de melding van stap 3 in
 * `migraties-controle.mjs` en niet van deze.
 *
 * @param {string} bron  de volledige inhoud van een migratiebestand
 * @returns {{regel: number, tekst: string}[]}  1-geïndexeerd, in leesvolgorde
 */
export function padOnderbroken(bron) {
  const regels = bron.split('\n');

  const kop = [];
  for (const regel of regels) {
    if (regel.trim() === '' || regel.trimStart().startsWith('--')) kop.push(regel);
    else break;
  }

  // Geen markering in de kop: een andere regel, een andere melding.
  if (!ROLLBACK.test(kop.join('\n'))) return [];

  // Staat er geen uitvoerbare regel in, dan is er ook niets dat het pad breekt.
  const eerste = regels.findIndex(uitvoerbaar);
  if (eerste === -1) return [];

  const gevonden = [];
  for (let i = eerste + 1; i < regels.length; i += 1) {
    if (PAD_STATEMENT.test(regels[i])) gevonden.push({ regel: i + 1, tekst: regels[i].trim() });
  }
  return gevonden;
}

/**
 * De melding voor één bestand, of `null` als er niets aan de hand is.
 *
 * ⚠️ De tekst noemt wat er moet gebeuren en niet alleen wat er mis is. Een
 *    melding die de lezer laat raden tussen "verplaats dit naar de kop" en
 *    "verplaats dit naar het lichaam" kost hem de tijd die de controle bespaarde.
 */
export function meldingVoor(naam, bron, register = AANVAARD) {
  if (register.some((r) => r.bestand === naam)) return null;

  const gevonden = padOnderbroken(bron);
  if (gevonden.length === 0) return null;

  const regels = gevonden.map((g) => `      ${g.regel}: ${g.tekst}`).join('\n');
  return (
    `Het rollback-pad van ${naam} loopt door ónder het lichaam ` +
    `(${gevonden.length} regel(s)) — onwrikbare regel 20.\n${regels}\n` +
    '      Hoort dit bij het pad, zet het dan in de kop; is het lichaam-SQL die\n' +
    '      zijn `--` verloor of juist kreeg, zet het dan in het lichaam. Zie QS8-405.'
  );
}
