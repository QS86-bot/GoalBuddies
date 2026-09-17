# Twee poorten die elkaar niet kenden

**13-09-2026 — QS8-448**, uit de Middel-rijen 479 en 480 van
`docs/ENGINEER-REVIEW.md` (03-09-2026).

## 1. Wat er gemeten is

`handle_new_user()` normaliseerde met `nullif(trim(…), '')`; `profielSchema` met
`.trim().min(1).max(80)`. Die twee lijken hetzelfde te doen en doen het niet:

| invoer | Postgres-trigger | `profielSchema` | uitkomst |
| -- | -- | -- | -- |
| `E'\n\n'` | laat door (2 tekens) | weigert | profiel zonder naam |
| `E'\t\t'` | laat door (2) | weigert | idem |
| U+00A0 | laat door (1) | weigert | idem |
| 80× `👩` | maakt aan (char_length 80) | weigert (ziet 160) | onboarding loopt vast |
| **U+200B** | laat door (1) | **laat óók door** | **niemand vangt hem** |

Postgres' `trim()` strijkt namelijk alleen de spatie; JS' `.trim()` strijkt de
hele WhiteSpace-klasse maar niet U+200B.

⚠️ **`display_name` is groepszichtbaar.** Eén `POST /auth/v1/signup` met de
anon-sleutel — die per definitie in elke bundel zit — levert een lid in het
groepsoverzicht zonder leesbare naam.

## 2. Wat de reviewrijen níét zagen

Rij 479 noemt zero-width spaces als variant van hetzelfde geval: *"gaan er om
dezelfde reden doorheen"*. 📏 Gemeten is het een **andere** zaak. Bij `\n`, `\t`
en NBSP vángt het schema het nog; bij U+200B niet. Er is dus precies één invoer
waar beide poorten open staan, en die stond als bijzin in een rij over vier
andere.

**Dat is de reden om een reviewrij na te meten in plaats van hem te geloven** —
ook als hij klopt. Beide rijen waren waar; de rangschikking erbinnen niet.

## 3. Het besluit: één definitie, twee talen, en een toets ertussen

- `schoneNaam()` in `src/shared/tekst` en `schone_naam()` in migratie 0256
  dragen dezelfde tekenset. Er ís geen manier om één definitie in twee talen te
  hebben; wat er wél is, is een toets die ze met dezelfde invoer naast elkaar
  legt — `tests/rls/naamnormalisatie.test.ts`.
- `profielSchema.display_name` telt met `telTekens()` (codepunten), zoals
  `char_length` in `profiles_display_name_len`.
- De trigger maakt eerst schoon en oordeelt daarna; het schema doet hetzelfde in
  dezelfde volgorde.

### ⚠️⚠️ De reparatie die het erger had gemaakt

📏 `👨‍👩‍👧‍👦` is `U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466` — de
zero-width joiner **ís** de lijm. Een `regexp_replace(…, 'g')` of een
`.replace(/…/g, '')` die U+200D overal weghaalt, maakt er vier losse mensen van.

Daarom knippen beide kanten **alleen aan de rand**: `btrim()` kan per constructie
niets anders, en de TS-kant loopt met twee wijzers naar binnen. Het geval staat
aan beide kanten als toets, want dit is precies het teken dat CLAUDE.md aan
`telTekens()` laat voeren — de fout zou zichtbaar zijn geweest, maar hij zou er
wél in hebben gezeten.

### ⚠️ De set staat als escapes en niet als letterlijke tekens

Een `.sql` of `.ts` met een echte zero-width space erin is niet te reviewen en
overleeft geen editor die witruimte opruimt. Je ziet niet wat er staat, en een
diff die hem weghaalt leest als "geen wijziging".

## 4. De ijking

📏 **Vier mutaties, één per grendel, alle vier met de hand rood gezien.** Vooraf
gemeten groen: 4 (naad), 14 (aanmelding), 30 (schema).

| Mutatie | Wat er rood werd |
|---|---|
| A — de trigger terug naar `trim()` | 6 — precies de triggergevallen; de naadtest bleef terecht groen |
| B — `schone_naam()` knipt U+200D overal weg | 2 — het gezin ging van 7 naar 4 codepunten |
| C — `profielSchema` terug naar `.trim().max(80)` | 3 — waaronder de naam van 80 emoji die de trigger zélf aanmaakt |
| D — U+200B uit de TS-set, niet uit de SQL-set | 1 — en de melding noemt `zwsp` bij naam |

⚠️ **A liet de naadtest met opzet groen.** Die toetst `schone_naam()` en niet de
trigger; dat hij niet meebeweegt is het bewijs dat de twee toetsen verschillende
dingen bewaken en niet dezelfde twee keer.

## 5. Twee dingen die tijdens het bouwen misgingen

**De terugvalketen heeft meer sporten dan ik dacht.** 📏 De eerste versie van de
triggertoets verwachtte `Naamloos` en kreeg `onzichtbaar13` — het deel vóór de
`@`. Dat was de keten die gewoon werkte (`full_name` → `name` → e-mail →
`Naamloos`) en mijn verwachting die een sport oversloeg. **De code had gelijk en
de toets niet**, en dat is de kant op die je bij een rode test het minst
verwacht.

**De psql-val stond al opgeschreven.** `tests/rls/aanmelding.test.ts` waarschuwt
in zijn eigen kop: *"via stdin en niet via `-c`; met `-c` laat psql `:'id'`
letterlijk staan"*. Ik liep er bij het schrijven van de naadtest alsnog in. De
waarschuwing stond drie mappen verderop en niet op de plek waar ik hem nodig had
— dus hij staat nu ook in `naamnormalisatie.test.ts`.

## 6. Wat dit niet oplost

⚠️ **0256 > 0221, dus rij 479 gaat over de mápstand en niet over productie.** De
clientkant (rij 480) zit wél in de bundel en is daarmee meteen waar.

⚠️ Rij 482 uit dezelfde ronde — een genest `name`-object van Apple dat als
letterlijke JSON de weergavenaam wordt — blijft open. Die is hier niet te meten:
de lokale `auth.users` is een shim van vier kolommen en geen GoTrue, dus wat er
bij een échte Apple-aanmelding in `raw_user_meta_data` staat is alleen met één
echte aanmelding vast te stellen.

---

## 7. Wat de security-review hieraan veranderde (13-09-2026)

Alles hierboven stond er al toen de `security-reviewer` langs de tak ging. Vier
van zijn bevindingen zijn zelf nagemeten en klopten, en ze veranderden de vorm
van dit issue ingrijpend genoeg om het hier apart op te schrijven.

### 7a. De aanmelding was de moeilijke deur, niet de enige

📏 **Gemeten.** `authenticated` mag `profiles.display_name` schrijven
(`has_column_privilege` → `t`), `profiles_update` toetst alleen
`id = auth.uid()`, en de enige inhoudelijke CHECK was `profiles_display_name_len`
(`char_length between 1 and 80`). Eén zero-width space is één codepunt.

Dus: een gewone ingelogde gebruiker doet `PATCH /rest/v1/profiles?id=eq.<eigen
id>` met een onzichtbare naam en staat als naamloos lid in het groepsoverzicht —
**zonder aanmelding**. En dat is de mákkelijkere route, want om groepszichtbaar
te zijn heb je toch al een account.

⚠️⚠️ **De eerste versie van dit issue repareerde de trigger en zette rij 479 op
`opgelost`.** Dat is letterlijk de vorm die CLAUDE.md benoemt bij QS8-417: *"een
reparatie die de instanties opruimt en het mechanisme laat staan, groeit terug —
en hij doet dat onder een rij die 'opgelost' zegt."* Hier was het scherper dan
dat: het mechanisme was niet eens opgeruimd, alleen de moeilijkste van twee
deuren.

De les die ik hieruit meeneem is niet "denk aan de schrijfroute". Het is: **een
issue dat een leesbaar oppervlak beschermt, moet elke schrijver van dat oppervlak
opsommen voordat het "opgelost" mag heten.** `display_name` heeft er twee — de
trigger en de PATCH — en de issuetekst noemde er één.

`profiles_display_name_zichtbaar` (0256) sluit hem. `profielSchema` blijft wat
het was: een nette melding vóór de grens, niet de grens.

### 7b. Een CHECK die een functie aanroept, heeft een `grant` nodig

📏 **Gemeten, en dit was een ship-stopper.** Met de CHECK erin en zónder
`grant execute ... to authenticated` valt **élke** profielschrijving om op
`permission denied for function schone_naam` — ook `update profiles set locale`.
Postgres toetst EXECUTE op een functie in een CHECK op het moment van schrijven,
niet bij het aanmaken van de constraint.

Bij de ijking viel dat op de bestaande tests van
`tests/rls/profielschrijven.test.ts` — *"slaat de taal en de tijdzone op"*,
*"rondt de onboarding af"* — en niet alleen op de nieuwe. **Een dichte deur leest
als een veilige deur**, en daarom staat de must-allow-helft er nu expliciet bij.

Het alternatief was de bereikenlijst een derde keer uitschrijven, inline in de
CHECK. Afgewezen: dan bewaakt de naadtest twee van de drie kopieën, en de derde
is precies degene die de grens draagt.

### 7c. De naadtest bewaakte een achtste van wat hij beloofde

📏 **Gemeten, en dit is de scherpste van de vier.** De eerste naadtest vergeleek
zestien vaste invoeren. Van de 29 codepunten in de set kwamen er **8** als
volledige rand in die zestien voor; de andere 21 waren ongedekt. Met U+205F uit
de SQL-kant gehaald — een echte drift tussen de twee talen — bleef de suite
**groen op vier tests**.

⚠️⚠️ En zowel de migratiekop als `src/shared/tekst/index.ts` beweerden met zoveel
woorden: *"Verander je de ene, dan wordt die toets rood."* Dat is de vorm uit
QS8-412 één laag hoger: **een ontbrekende grendel valt op; een grendel waarvan in
de bron staat dát hij er is, valt niet op.** De bewering stond er, was onwaar, en
had de volgende lezer een reden gegeven om niet na te meten.

De reparatie is niet "meer gevallen". Het is een andere vráág: de test loopt nu
het hele codepuntbereik af en vergelijkt de **verzamelingen** in plaats van de
uitkomsten van voorbeelden. Twee richtingen apart benoemd, want het zijn twee
verschillende fouten:

| richting | wat de gebruiker merkt |
|---|---|
| alleen de database strijkt het | het formulier keurt goed, de database weigert |
| alleen de client strijkt het | een groepszichtbaar onleesbare naam in de database |

📏 Geijkt in beide richtingen: U+205F uit SQL weg → rood op *"alleen de client"*;
U+00B7 in SQL erbij → rood op *"alleen de database"*. In allebei de gevallen
bleef de oude steekproeftest groen, en dát is het bewijs dat de sweep iets
bewaakt wat de steekproef niet bewaakte.

### 7d. Een opsomming dekt je fantasie, een bereik dekt de klasse

📏 **Gemeten.** De set van 29 codepunten dekte de JS-WhiteSpace-klasse plus de
zero-width-familie. Twaalf andere tekens die óók als niets renderen kwamen langs
**beide** poorten: hangul filler (U+3164), braille blank (U+2800), soft hyphen
(U+00AD), de C0- en C1-stuurtekens (incl. U+0085 NEL, U+001B ESC), de Khmer-
en Mongoolse tekens, en de tags (U+E0000–U+E007F).

U+200B was één instantie van de klasse, niet de klasse. De set staat nu als
**twintig bereiken** en dekt 254 codepunten, aan beide kanten geteld.

⚠️ **U+FE00–U+FE0F staat er met opzet niet in.** Dat zijn de variatieselectors:
`❤️` is `U+2764 U+FE0F`, en wie die staart afknipt verandert hoe het teken
rendert. Gemeten: gezin, regenboogvlag, landsvlag, huidskleur en keycap blijven
heel.

⚠️ `btrim` kon dit niet dragen — die neemt losse tekens en kent geen bereiken.
Vandaar `regexp_replace` met twee verankerde patronen (`^…` en `…$`) en nooit een
`g`-vlag: dat laatste zou U+200D midden in een gezinsemoji weghalen.

### 7e. Eén bevinding waar de reviewer gelijk had over mijn onderbouwing

📏 In de migratie stond dat `pg_temp` in het zoekpad moet omdat iemand anders
anders `btrim` kan kapen. **Nagemeten onwaar.** Met een eigen
`pg_temp.btrim(text,text)` aanwezig én `pg_temp` expliciet vooraan gaf
`btrim('  Jan  ')` gewoon `Jan`: Postgres raadpleegt `pg_temp` nooit voor
functie- of operatornamen. Wat `pg_temp` wél vooraan pakt zijn **relatie- en
typenamen**.

De maatregel blijft (drie grendels eisen hem, en terecht); de onderbouwing is
vervangen. CLAUDE.md waarschuwt precies hiervoor: *"een afwijking die je
onderbouwt is duurder dan een die je vergeet"* — en elke definer-functie in dit
project is een kopie van de vorige, dus een onjuiste reden reist mee.

### 7f. Wat hier bewust níet in zit

- **Bidi-spoofing en homoglyphen.** U+202E aan de rand wordt nu gestript, maar
  midden in een naam blijft hij staan en keert de weergave om; Cyrillische
  homoglyphen raakt randtrimmen sowieso niet. Dat is een andere klasse — spoofing
  in plaats van leegte — en het vraagt een eigen besluit over normalisatie.
  Eigen issue.
- **U+200C (ZWNJ) aan de rand.** In het Perzisch is dat een betekenisdragend
  teken; aan de rand heeft hij niets om te scheiden, dus hij gaat weg. Afweging
  opgeschreven, eigen issue. ✅ **Besloten op 16-09-2026 (QS8-451): het blijft
  zoals het is**, en er staat nu een toets op die het besluit draagt — de oude
  suite bleef 📏 twintig van de twintig groen toen de belofte gebroken werd. Zie
  `docs/decisions/2026-09-16-een-zwnj-aan-de-rand-heeft-niets-te-scheiden.md`.
- **Bestaande profielen op productie.** 0256 is niet gedeployd (productie staat
  op `0221`). De constraint komt als `not valid` binnen en wordt in dezelfde
  migratie gevalideerd; zit er een bestaand profiel met een onzichtbare naam, dan
  faalt die `validate` en is dát het signaal — geen verrassing achteraf.
