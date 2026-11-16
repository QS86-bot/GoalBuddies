# Zod telt sinds 4.6 codepunten — 05-11-2026

**Aanleiding:** QS8-670 (`zod` van 4.4.3 naar 4.6.7, advisory 1243066) in de batch-PR #654. De bouwsessie meldde het gedragsverschil in een bijzin, de `code-critic` van de batch noemde het blokkerend, en een beslisdocument ontbrak. Dit is dat document.

## Wat er veranderd is

`z.string().max(n)`, `.min(n)` en `.length(n)` tellen onder zod 4.6.7 **codepunten**. Onder 4.4.3 telden ze UTF-16-eenheden.

📏 Gemeten op 05-11-2026 door de batchsessie, met `npm install zod@<versie>` in een eigen scratchmap en drie emoji (`😀😀😀`, in JavaScript `.length` = 6):

| versie | `z.string().max(3)` | `z.string().min(6)` |
| -- | -- | -- |
| 4.4.3 | weigert | slaagt |
| 4.6.7 | slaagt | weigert |

Onafhankelijk daarvan bevestigd door de `security-reviewer` en de `code-critic` van de batch (elk met een eigen meting).

## Wat dat doet met de grenzen in `src/`

Naar het oordeel van de `security-reviewer` (bron nagelezen, niet door de batchsessie herhaald): de clientgrenzen bij chat (4000), goedkeuringscommentaar (1000), identiteitszin (200), weeknotitie (2000) en AI-antwoord (1000) worden ruimer en lopen nu gelijk met `char_length` in Postgres. Commitments, todo's, deadline, weekdoeltitels en de weergavenaam gebruiken al `telTekens()` en veranderen niet. Er is geen `.min(n>1)` op een string, dus er wordt niets strakker. Zod zit in geen enkele Edge Function.

⚠️ **De uitzondering is het wachtwoord.** `WACHTWOORD_MAXIMUM = 72` (`src/modules/auth/schemas.ts`) is een grens in **bytes** van bcrypt. Onder 4.4.3 liet `.max(72)` hoogstens 36 emoji (144 bytes) door, nu 72 emoji (288 bytes). Het bestond al; de omvang verdubbelt. Hoe GoTrue op een wachtwoord langer dan 72 bytes reageert is **niet gemeten**. Staat als Middel in `docs/ENGINEER-REVIEW.md`.

## Wat hiermee niet besloten is

* **De tekst in `CLAUDE.md`, sectie *Emoji*,** zegt nog: *"Zod's `.max()` en `.length` tellen UTF-16-eenheden; `char_length` in Postgres telt codepunten."* Onder 4.6.7 klopt dat niet meer. Een wijziging aan `CLAUDE.md` is aan Quinten, en is door de batchsessie niet gedaan. **Voorstel voor de vervangende zin:** *"Sinds zod 4.6 tellen `.max()`, `.min()` en `.length(n)` op een string codepunten, net als `char_length` in Postgres; onder 4.4.x telden ze UTF-16-eenheden. Een grens in bytes (bcrypt, 72) is dus nog steeds geen `.max()`."*
* **Ongeveer vijftien commentaren in `src/`** leggen nog uit met "zod telt UTF-16" (onder meer `src/modules/ai/uitvoer.ts`, `src/modules/auth/schemas.ts`, `src/modules/buddies/schemas.ts`, `src/modules/commitments/commitment-schemas.ts`, `src/modules/todos/todo-schemas.ts`, `src/modules/goals/deadline-schemas.ts`). De conclusie in die commentaren (gebruik `telTekens()`) blijft goed; de reden niet. Bijwerken hoort bij QS8-672.
* **Een test die zod's eigen telling vastlegt** bestaat niet; dat is QS8-673. Tot dan bewaakt geen test de naad: een terugval naar 4.4.3 wordt niet rood.

## Aannames

* Dat `npm ci` in CI en op Hostinger echt 4.6.7 installeert is niet nagelopen; het lockfile zegt het.
* Dat elke database-CHECK hetzelfde getal in `char_length` heeft als de client is alleen bij de chat nagelezen.

## Terugdraaien

`zod` terug naar `^4.4.3` in `package.json` en het blok in `package-lock.json` terugzetten naar 4.4.3. Advisory 1243066 staat dan weer in de bundel. Geen migratie, geen data.

## Vervolg — 05-11-2026, later die dag

De drie punten onder *Wat hiermee niet besloten is* zijn in **QS8-673**
opgepakt, op één correctie na: het bijwerken van de commentaren hoorde bij
QS8-673 en niet bij QS8-672, dat alleen het wachtwoord raakt. De test die Zod's
telling vastlegt is `tests/beloftes/zod-telt-codepunten.test.ts`; de
`CLAUDE.md`-regel is vervangen; de tweede aanname (elke CHECK heeft hetzelfde
getal als de client) is per kolom gemeten. Alles in
`docs/decisions/2026-11-05-zod-telt-codepunten-en-dat-staat-nu-onder-test.md`.
