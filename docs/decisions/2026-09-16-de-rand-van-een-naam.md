# De rand van een naam staat in een CHECK, en de vier oude blijven staan

**Datum:** 16-09-2026 · **Issue:** QS8-508 · **Migratie:** 0284

## Wat er stuk was

`profiles.display_name` en `groups.name` droegen elk vier gelijkheids-CHECKs —
`zonder_bidi`, `zonder_onzichtbaar_middenin`, `zonder_onzichtbaar_tussen_letters`
en `zonder_losse_tags`. `schone_naam()` is precies die vier **plus een vijfde
stap**: de randen strippen. Die vijfde stond in geen enkele constraint.

Hij woonde in `handle_new_user()` en in `profielSchema`, en dat schema zit in de
bundel van de aanvaller en zegt in zijn eigen kop dat het geen grens is. Een
rechtstreekse `PATCH /rest/v1/profiles` werd dus niet genormaliseerd — en daar is
geen aanmelding voor nodig, want `authenticated` mag `display_name` schrijven en
`profiles_update` toetst alleen `id = auth.uid()`.

## ⚠️ De afwijking: erbij, niet ervoor in de plaats

QS8-508 stelt voor de vier te **vervangen** door één `= schone_naam(…)`. Dat is
niet gebeurd. De vier blijven staan en er komt één bij.

**Het argument van het issue klopt hier niet.** Het luidt dat er anders "vijf
plekken zijn die elk apart bijgewerkt moeten worden zodra er een teken bij komt".
Maar alle vijf verwijzen naar een **functie**: een teken erbij is een wijziging in
`zonder_onzichtbaar_middenin()`, en de vijf CHECKs volgen vanzelf. Er was geen
onderhoudslast om weg te nemen.

📏 **En vervangen zou ook geen regel hebben laten vallen** — gemeten over het
volledige codepuntbereik (1 t/m 1114111, surrogaten overgeslagen), in drie
posities:

| vorm | gevallen waar `x = schone_naam(x)` én één van de vier faalt |
|---|---|
| teken alleen | 0 |
| teken vooraan | 0 |
| teken middenin | 0 |

De vier zijn dus logisch geïmpliceerd. Vervangen was veilig geweest.

**De reden om het niet te doen is de toetsresolutie.** Vier bestaande RLS-toetsen
pinnen de constraintnáám in de foutmelding: `profielschrijven`, `aanmelding`,
`een-naam-rendert-niet-als-een-andere` en `groepsnaam-keert-niet-om`. Dat doen ze
omdat de security-ronde op QS8-450 mat dat een kale `23514` een toets groen houdt
terwijl juist de bedoelde CHECK weg is — `groups` draagt er twintig, en een ándere
weigert dezelfde invoer.

Klap je de vijf samen tot één, dan melden al die toetsen voortaan dezelfde naam.
De belofte blijft afgedwongen, maar ze kunnen niet meer onderscheiden of de
**bidi**-regel weg is of de **tag**-regel. Dat is precies de resolutie die die
ronde opleverde, en die geef je dan op om vier CHECK-aanroepen per schrijfactie te
besparen.

⚠️ Wordt dat ooit wél een kostenpost, dan is samenklappen een migratie van vier
regels — met de meting hierboven al gedaan.

## Wat dit kost aan gedrag

📏 Gemeten op de lokale stack, stand 0283, met de vier CHECK-expressies letterlijk
nagerekend naast `v = schone_naam(v)`:

| geval | komt er nu langs | na 0284 |
|---|---|---|
| `Quinten` | ja | ja |
| `' Quinten'` (spatie vóór) | ja | **nee** |
| `'Quinten '` (spatie ná) | ja | **nee** |
| `U+200C` + `می` | ja | **nee** |
| `U+200D` / `U+061C` / `U+034F` vóór | ja | **nee** |
| `می` + `U+180E` / `U+200E` | ja | **nee** |
| NBSP + `Quinten` | ja | **nee** |
| `U+FEFF` + `Quinten` | nee | nee |
| `Quin` + `U+200B` + `ten` | nee | nee |

**De enige bijvangst is een spatie aan de rand**, en dat is een typefout en geen
aanval. 📏 Nagemeten dat een gewone gebruiker daar niet tegenaan loopt:
`profielSchema` doet `.transform(schoneNaam)` vóór de validatie, en `schoneNaam()`
in `src/shared/tekst/index.ts` heeft de randstap als stap 5 (regels 666–675). Wie
via de app opslaat, stuurt een getrimde naam. Alleen een rechtstreekse `PATCH`
raakt deze CHECK — en dat is precies wie we wilden weigeren.

## Op `groups.name` sluit het een tweede gat

Die kolom heeft geen tegenhanger van `profiles_display_name_zichtbaar`, dus
`groups_name_len` (`char_length >= 1`) was er de enige ondergrens.

📏 Een groepsnaam van **alleen NBSP** haalde die lengte én alle vier de
gelijkheden. Na 0284 niet meer: `schone_naam()` strijkt hem tot de lege string en
dan is de gelijkheid weg.

## De grendel, en de ijking

`tests/rls/de-rand-van-een-naam.test.ts` — 25 toetsen, via PostgREST als een echte
`authenticated`, want alleen zo doen de trigger, de CHECK én de kolomgrant mee.
Elke assertie pint de constraintnaam.

| Mutatie | Uitkomst |
|---|---|
| `profiles_display_name_schoon` weg | 21 rood |
| `groups_name_schoon` weg | 2 rood |
| must-allow scherp: alleen `Quinten` geweigerd | 1 rood, de juiste |
| must-allow scherp op groups | 1 rood, de juiste |
| **dezelfde regel, ándere constraintnaam** | **21 rood** |

Die laatste is de belangrijkste: hij bewijst dat het pinnen van de naam dragend
is en niet decoratief.

## ⚠️⚠️ En het ijkharnas was zelf blind — voor de tweede keer deze sessie

De eerste must-allow-ijking (de CHECK álles laten weigeren) kwam **groen** terug.
Dat was onwaar: `createTestUser()` kan dan geen profiel schrijven, de suite valt om
in `beforeAll`, en een omgevallen suite heeft **nul falende asserties**. Mijn
harnas telde alleen die asserties.

Dat is woordelijk dezelfde klasse als de reparatie aan `rls:dekking` van
10-09-2026 (`omgevallenZonderAssertie()`), en hij trad hier op in een wegwerpscript
dat niemand reviewt. **Een instrument dat een grendel ijkt, is zelf een grendel** —
en een ijking die "groen" zegt omdat ze niet keek, is gevaarlijker dan geen
ijking, want ze leest als bewijs.

De scherpe vorm hierboven (alleen één specifieke naam weigeren) houdt de suite
overeind en laat precies één toets omvallen. Dat is wat een ijking hoort te doen.

## Buiten scope, met opzet

De twaalf overige kolommen van 0283 — notities, omschrijvingen, redenen — houden
alleen de middenin-regel. Een spatie aan de rand van een notitie is geen
spoofingvector; bij een **naam** draagt de rand de identificatie. Staat als rij in
`docs/ENGINEER-REVIEW.md` met de voorwaarde waaronder dat verandert.
