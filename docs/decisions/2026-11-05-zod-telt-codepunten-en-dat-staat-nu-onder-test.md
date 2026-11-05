# Zod telt codepunten, en dat staat nu onder test — 05-11-2026

**Issue:** QS8-673, vervolg op QS8-670 (zod 4.4.3 → 4.6.7) en op
`docs/decisions/2026-11-05-zod-telt-sinds-4-6-codepunten.md` van de batchsessie.
**Raakt:** `tests/beloftes/zod-telt-codepunten.test.ts` (nieuw), de sectie
*Emoji* in `CLAUDE.md`, en de commentaren die Zod's telling als feit stelden.
**Beslist door:** de bouwsessie, binnen de beslisbevoegdheid: een test en
uitleg, geen schema gewijzigd, geen migratie. De wijziging aan `CLAUDE.md`
staat met zoveel woorden in het issue, dat op Quintens woord is ingepland.

## Wat er mis was

Het beslisdocument van QS8-670 stelde het vast: `.max()`, `.min()` en
`.length()` tellen sinds zod 4.6 codepunten waar 4.4.3 UTF-16-eenheden telde.
De hele suite bleef bij die sprong groen. Elke grenstest in dit project toetst
`telTekens()` — het onderdeel — en geen enkele de telling van Zod zelf, dus de
naad tussen Zod en `char_length` in Postgres was onbewaakt: een terugval naar
UTF-16, of een sprong naar grafemen, maakt niets rood. Daarnaast legden een
regel in `CLAUDE.md` en een reeks commentaren de regel *gebruik `telTekens()`*
uit met een reden die niet meer klopte.

## De test — regel 18, de naad en niet het onderdeel

`tests/beloftes/zod-telt-codepunten.test.ts` draait zonder database en doet
twee dingen:

1. **Zod's telling naast `telTekens()`.** `😀` (1 codepunt, 2 eenheden) en het
   gezin `👨‍👩‍👧‍👦` (7 codepunten, 11 eenheden) tegen `.max()`, `.min()` en
   `.length()`, plus de belofte dat `z.string().length(telTekens(t))` voor elke
   `t` slaagt. De databasekant van diezelfde naad — dat `char_length`
   codepunten telt — staat in `tests/rls/tekstgrenzen.test.ts`, die wél een
   database nodig heeft; de twee bestanden verwijzen naar elkaar.
2. **De vijf kale `.max(n)`-grenzen tegen de CHECK.** Elk schema krijgt precies
   `n` emoji (wat de CHECK doorlaat) en `n + 1`. Dat is de belofte die ertoe
   doet: het formulier zegt "mag" waar de database "mag" zegt, ook in emoji.

De versie staat niet hard: de melding noemt `zod/package.json` zodat je weet
onder welke versie hij omviel, de assertie eist alleen de telling.

## De ijking — met de hand, tegen 4.4.3

`npm pack zod@4.4.3` in een scratchmap, uitgepakt, en `node_modules/zod`
tijdelijk door die map vervangen (niets aan `package.json` of het lockfile).
📏 **12 van de 15 tests rood**, elk met *"zod 4.4.3 telt hier geen codepunten
meer …"* in de melding. Daarna hersteld: 4.6.7, 15 groen.

De drie die groen bleven zeggen iets over de test zelf:

| test | waarom hij onder beide tellingen slaagt |
|---|---|
| de fixtures zijn wat ze beweren te zijn | toetst `.length` en `telTekens()`, niet Zod |
| `.max(1)` weigert het gezin | 7 én 11 zijn > 1 |
| `.min(7)` laat het gezin door | 7 én 11 zijn ≥ 7 |

Die twee gezinsgevallen staan er voor de volledigheid van de tabel uit het
issue; ze bewaken de naad niet, en dat staat hier zodat niemand ze ervoor
aanziet. Het omgekeerde — `.max(7)` laat het gezin door, `.min(8)` weigert
het — is wél onderscheidend en staat er ook.

## Punt 4: heeft elke kale `.max()` dezelfde grens als de CHECK?

📏 Gemeten op 05-11-2026, alleen-lezen, met `pg_get_constraintdef()` op
productie (`wehgocadxehottiiyvsc`) over alle CHECKs in `public` die
`char_length` noemen. Productie draagt 0299–0302 die `main` niet heeft (QS8-641),
maar de vijf constraints hieronder staan alle vijf als bestand op `main`
(0001, 0023, 0023, 0123, 0203), dus de meting geldt ook voor de map.

| schema | kale `.max(n)` | CHECK op productie | gelijk? |
|---|---|---|---|
| `buddies/chat-schemas.ts` `berichtSchema.body` | 4000 (`BERICHT_MAX`) | `chat_messages_body_len`: `char_length(body) <= 4000` | ja |
| `completions/approval-schemas.ts` `oordeelSchema.comment` | 1000 | `completion_approvals_comment_length`: `<= 1000` | ja |
| `goals/weekly-schemas.ts` `afrondSchema.note` | 2000 | `completions_note_length`: `<= 2000` | ja |
| `goals/schemas.ts` `identity_statement` | 200 | `goals_identity_statement_len`: `<= 200` | ja |
| `goals/interview-schemas.ts` `antwoord` | 1000 (`ANTWOORD_MAX`) | geen kolomgrens per antwoord; `goal_interviews_answers_len`: `char_length(answers::text) <= 20000` op de hele jsonb | ja, met slag om de arm — zie onder |

**Uitkomst: geen clientgrens is ruimer dan zijn CHECK**, dus geen
`security-reviewer` (het issue bindt die aan precies dat geval). De vier
kolomgrenzen zijn exact gelijk en tellen sinds zod 4.6 ook in dezelfde
eenheid. Alle vier doen `.trim()` vóór `.max()`; de CHECK trimt niet, maar wat
opgeslagen wordt ís de getrimde waarde, dus dat loopt gelijk.

⚠️ **Het interview is de slag om de arm.** Zes antwoorden van hoogstens 1000
codepunten zijn hoogstens 6000 codepunten tekst; de jsonb-tekst erbovenop
(sleutels, aanhalingstekens, en `\"`-escapes voor aanhalingstekens in een
antwoord) blijft daar ruim onder de 20000. Een antwoord van 1000 emoji is in
`answers::text` ook 1000 codepunten, want Postgres escapet in jsonb geen
tekens buiten ASCII. Ruimer dan de CHECK is de client dus niet; exact gelijk is
hij ook niet, want er ís geen CHECK per antwoord. Dat was al zo en is geen
bevinding van dit issue.

Er is **geen `.min(n > 1)` op een string** in de schema's (grep op
`.min([2-9]`), dus er is niets dat door de sprong strakker is geworden.

## Wat er aan tekst veranderd is

- **`CLAUDE.md`, sectie *Emoji*.** De zin *"Zod's `.max()` en `.length` tellen
  UTF-16-eenheden"* is vervangen door wat gemeten is, met de versie erbij, en
  door de reden die blijft: `telTekens()` volgt de database en niet de
  dependency, en Zod's telling is al eens gewisseld. De waarschuwing over de
  ondergrens staat er nog, met de aantekening dat het geval sinds 4.6 niet meer
  speelt maar de reden is dat een `.min()` hier `telTekens()` heet.
- **De vijf plekken uit het issue:** `src/modules/ai/uitvoer.ts` (de zeef is
  nu strenger dan het schema, en dat staat er als bekende strengheid),
  `src/modules/ai/uitvoer.test.ts`, `tests/rls/tekstgrenzen.test.ts` (twee
  blokken).
- **En zeven die hetzelfde feit als heden stelden**, gevonden met de grep die
  *Wie bezit welk feit* voorschrijft: `buddies/schemas.ts`,
  `todos/todo-schemas.ts`, `todos/api.ts`, `goals/deadline-schemas.ts` en zijn
  test, `commitments/commitment-schemas.ts`, en de QS8-448-aantekening in
  `auth/schemas.ts` en zijn test. Overal dezelfde vorm: *onder 4.4.3 telde …*,
  de meting blijft staan, de conclusie (`telTekens()`) blijft staan, de reden
  wordt *de dependency kan wisselen*. Commentaren over JavaScript's eigen
  `.length` en `.slice()` zijn niet aangeraakt: die kloppen nog.

Niet aangeraakt, met opzet: `src/modules/auth/schemas.ts:61-76` (het
wachtwoord, QS8-672, op een eigen tak) en de schema's zelf.

## Wat er níet gedaan is

- `docs/WERKVOORRAAD.md` en `docs/VOLGENDE-SESSIE.md` zeggen beide nog dat
  `CLAUDE.md` *"nog UTF-16 zegt, wat aan Quinten is"*. Dat is na deze tak
  onwaar; de bouwsessie raakt die twee niet aan (bouwprompt), dus het staat in
  de afleverregel voor de batchsessie.
- De zeef in `uitvoer.ts` gelijktrekken met het schema (`telTekens()` in
  plaats van `.length`) is een eigen keuze en geen bijvangst; het kost vandaag
  hooguit een AI-voorstel met veel emoji.
- De meting tegen een lokale stack is niet herhaald; productie is de bron, en
  de vijf constraints zijn op `main` teruggevonden in de migratiebestanden.
