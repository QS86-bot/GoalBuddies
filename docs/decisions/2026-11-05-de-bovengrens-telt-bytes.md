# De bovengrens telt bytes — 05-11-2026

**Issue:** QS8-672, vervolg op QS8-670 (zod 4.4.3 → 4.6.7) en op de rij van
06-09-2026 in `docs/ENGINEER-REVIEW.md`.
**Raakt:** `src/modules/auth/schemas.ts`, `src/shared/tekst/index.ts`, de
catalogi `nl` en `en`, en de tests ernaast.
**Beslist door:** de bouwsessie, binnen de beslisbevoegdheid: een
clientvalidatie en een melding, geen migratie, geen RLS, geen gevolg voor wat
een gebruiker beloofd wordt. Wel auth, en dus `security-reviewer` direct.

## Wat er mis was

`wachtwoordSchema` had een bovengrens van 72 met `.max(WACHTWOORD_MAXIMUM)`, en
die 72 is de grens van bcrypt — in **bytes**. Zod's `.max()` telt geen bytes.
📏 Onder 4.4.3 telt hij UTF-16-eenheden: 36 emoji zijn 72 eenheden en 144
bytes, en passeerden. Onder 4.6.7 telt hij voor dit geval codepunten (gemeten
op QS8-670 met een los script op beide versies): 72 emoji zijn 72 codepunten en
288 bytes, en passeren. De upgrade maakte een bekende onvolkomenheid dus
viermaal groter in bytes, en de enige test ernaast — `'a'.repeat(73)` — zag er
niets van, want in ASCII zijn alle drie de tellingen hetzelfde getal.

De kop van het schema noemde dit al als bekende onvolkomenheid en wees naar de
ER-rij. Dat was eerlijk, maar een onvolkomenheid die groter wordt zonder dat
iets rood wordt is precies waar regel 18 over gaat.

## Wat GoTrue doet met meer dan 72 bytes — gemeten, met de grens erbij

Acceptatiecriterium 1 vroeg eerst te meten of GoTrue **weigert** of **afkapt**,
want afkappen zou het risico van Middel naar zwaarder tillen: dan wordt een
lang emoji-wachtwoord stilzwijgend een korter wachtwoord.

📏 **Gemeten aan de bron**, `supabase/auth` op GitHub,
`internal/api/password.go` (branch `master`, gelezen op 05-11-2026):

- `const MaxPasswordLength = 72`;
- `checkPasswordStrength()` doet `if len(password) > MaxPasswordLength` en
  antwoordt dan met een **400** `validation_failed`,
  *"Password cannot be longer than 72 characters"*. `len()` op een Go-string
  is het aantal **bytes**; de melding zegt "characters" maar telt bytes.
- De ondergrens (`password_min_length`) wordt in dezelfde functie in **runes**
  geteld — codepunten. GoTrue telt zijn twee grenzen dus in twee eenheden, en
  dat is exact de verhouding die het schema nu ook heeft.
- bcrypt zelf (`golang.org/x/crypto/bcrypt`, `GenerateFromPassword`) geeft
  `ErrPasswordTooLong` boven 72 bytes en kapt niet af. Maar die laag wordt
  niet bereikt: de 400 komt eerder.

**Uitkomst: GoTrue weigert, kapt niet af.** Het risico blijft Middel; de
*wordt zwaarder als* van de ER-rij is niet ingetreden.

⚠️ **Drie grenzen aan die meting, en ze staan hier als aanname en niet als
voetnoot:**

1. Gelezen op `master`, niet op de tag die het Supabase-platform draait. Of
   die tag afwijkt is niet gemeten.
2. Niet gemeten tegen het eigen project. Een signup met een wachtwoord van 73
   bytes maakt bij succes een account aan, en productie is voor een bouwsessie
   alleen lezen. De uitkomst is daarom aan de code gelezen en niet aan het
   antwoord van het project `wehgocadxehottiiyvsc`.
3. De Supabase-documentatie was vanuit de sessie niet bereikbaar. Wat hier
   staat komt uit de broncode en niet uit de handleiding.

## De keuze

```ts
.refine((w) => telBytes(w) <= WACHTWOORD_MAXIMUM, { error: () => t('validatie.wachtwoord_lang') })
.refine((w) => telTekens(w) >= WACHTWOORD_MINIMUM, { error: () => t('validatie.wachtwoord_kort') })
```

- **Geen `.max()` meer.** Welke eenheid Zod telt — en dat is per versie
  verschillend gebleken — doet er niet meer toe: `telBytes()` kijkt niet naar
  Zod maar naar `TextEncoder`, en dat is de telling van bcrypt en GoTrue.
- **`telBytes()` staat in `src/shared/tekst`, naast de drie die er al waren.**
  De kop daar legt nu vier tellingen naast elkaar en zegt bij de vierde
  uitdrukkelijk waarvoor hij níet is: een CHECK telt codepunten en toets je
  met `telTekens()`. Bytes zijn de uitzondering, voor de ene grens die zelf in
  bytes staat.
- **Twee grenzen, twee eenheden, en dat is de bedoeling.** De ondergrens hoort
  bij wat de gebruiker ziet en typt, en acht emoji zijn acht tekens. De
  bovengrens hoort bij wat bcrypt leest. Eén eenheid voor beide zou één van de
  twee verkeerd maken — dat was de vorm die hiervóór stond.
- **De melding noemt de eenheid en zegt wat je kunt doen.** *"Dit wachtwoord is
  te lang. Het mag hoogstens 72 bytes zijn: een letter telt voor 1, een emoji
  of accentletter voor 2 tot 4. Maak de zin korter."* De oude zei "72 tekens",
  en dat was de fout in woorden. Een test legt vast dat de melding het getal
  van de constante noemt, de eenheid bytes noemt en de eenheid tekens níet.

Wat dit **niet** verandert: de beveiliging. GoTrue weigerde al; wat de
gebruiker won is een melding in zijn eigen taal in plaats van een kale 400 die
`vertaal()` in `api.ts` als *"Dit wachtwoord voldoet niet. Gebruik een langere
zin."* vertaalde — het omgekeerde advies.

## De security-review — AKKOORD, met één lage bevinding die meegenomen is

Geen kritieke, hoge of middelzware bevindingen. Eén lage is in dit issue
gerepareerd: `vertaal()` stuurde élke servermelding met "password" erin naar
*"gebruik een langere zin"*, ook GoTrue's *"Password cannot be longer than 72
characters"*. Het schema vangt die grens vóór het verzoek af, maar tellen client
en server ooit anders — een andere GoTrue-versie, een andere route — dan wees
het advies de verkeerde kant op. Er staat nu een tak voor `longer than` vóór de
algemene wachtwoordtak, met `src/modules/auth/servermelding.test.ts` ernaast.

De tweede lage bevinding is de ER-rij van 06-09, die nog "stilzwijgend
afgekapt" zegt; die gaat via de afleverregel naar de batchsessie. Wat de review
als handmatig te verifiëren noemt staat hierboven al als grens 1 en 2: de
GoTrue-versie van het gehoste project, en `TextEncoder` op een echt
Hermes-toestel. Voor dat laatste geldt dat `edge-rapport.ts` `TextEncoder` al
op het clientpad gebruikt; een ontbrekende klasse zou daar eerder zijn
opgevallen.

## De ijking — vraag 3 van regel 18, met de hand

Zes mutaties, elk apart aangebracht en teruggedraaid, met welke tests omvielen:

| mutatie | rood |
|---|---|
| A — `telBytes` → `telTekens` | 72 emoji, 19 emoji, de melding (3) |
| B — `<=` → `<` | 72 ASCII, 18 emoji (2) |
| C — de byte-refine weg | 72 emoji, 19 emoji, 73 ASCII, de melding (4) |
| D — de oude `.max(72)` terug, onder zod 4.4.3 | 19 emoji (1) |
| E — `nl` zegt "72 tekens" | de drie catalogustoetsen van `nl`, de melding (4) |
| F — `WACHTWOORD_MAXIMUM = 80` | `nl` en `en` noemen 80 bytes, de melding (3) |
| G — de `longer than`-tak uit `vertaal()` weg | *wijst naar korter en niet naar langer* (1) |

📏 **Rij D is de belangrijkste.** Onder zod 4.4.3 — de versie op `main` op
05-11 — vangt alleen de test met **19 emoji** de oude vorm: 72 emoji zijn daar
144 UTF-16-eenheden en worden door `.max(72)` wél geweigerd, 19 emoji zijn 38
eenheden en komen erdoor. Onder 4.6.7 keert dat om en wordt het geval van 72
emoji het sprekende. Beide staan in de test; welke van de twee rood wordt hangt
af van de Zod-versie, en dat is precies waarom er geen `.max()` meer staat.

⚠️ **Een les uit de ijking zelf.** De eerste ronde herstelde elke mutatie met
`git checkout -- <bestand>`, en dat zette niet alleen de mutatie terug maar ook
het ongecommitte werk eronder; de mutaties B, C en D liepen daardoor tegen de
óude code en gaven alle drie dezelfde ene rode test. Dat viel op doordat B
(`<=` → `<`) onmogelijk hetzelfde rood kan geven als C (grens weg). De tweede
ronde herstelde uit een patch. **Een ijking die uit `HEAD` herstelt, ijkt
`HEAD`.**

## Wat er níet gedaan is

- `docs/ENGINEER-REVIEW.md` is niet aangeraakt: de bouwprompt van 05-11
  verbiedt dat de bouwsessie, en de ER-rij staat in de afleverregel voor de
  batchsessie. De rij van 06-09-2026 kan dicht: de bovengrens telt bytes, de
  *wordt zwaarder als* is gemeten en niet ingetreden.
- De test die Zod's eigen telling per versie vastlegt is niet geschreven; het
  issue wijst die uitdrukkelijk naar een vervolg op QS8-670.
- Geen meting tegen het eigen project — zie de drie grenzen hierboven.
