# Een conflictmarkering overleefde een merge, een PR en een CI-run

**Datum:** 28-08-2026
**Aanleiding:** gevonden tijdens het mergen van vier gestapelde PR's
**Raakt:** `scripts/conflictmarkeringen-controle.mjs`, `scripts/review-controle.mjs`,
`package.json`, `.github/workflows/ci.yml`, en twee ijkingstests

## 1. Wat er stond

`docs/ENGINEER-REVIEW.md` op `main` droeg **zes conflictmarkeringsregels** uit
twee eerdere merges (`fix/tekstgrenzen-en-ai-invoer` en `fix/auth-uid-initplan`),
en **twee dossierrijen die er elk drie keer in stonden**.

⚠️ **De drie kopieën waren niet identiek.** Ze verschilden in precies één ding:
het migratienummer dat ze noemden — `0119`/`0121`/`0122` voor de rij over de
InitPlan-policies, en `0120`/`0122`/`0123` voor de rij over de tekstgrenzen. Dat
zijn de restanten van de hernummeringsronde eerder die dag. **Twee van de drie
logen dus over waar de reparatie staat**, in het document dat de agenda is voor
de engineer-review in november.

Het is gevonden doordat een vólgende merge geneste markeringen opleverde, niet
doordat iemand het las.

## 2. Waarom geen enkele controle het zag

Dit is de kern, en het is regel 18 vraag 3 toegepast op de **verzameling**
controles in plaats van op één test:

| Controle | Waarom hij hier blind is |
|---|---|
| `review:controle` | leest tabelrijen; `<<<<<<< HEAD` is geen tabelrij |
| `docs:controle` | vergelijkt feiten tussen documenten; een markering is geen feit |
| `typecheck` / `lint` | kijken niet naar `.md` |
| `stand:controle` | bewaakt één gegenereerd blok, en dat blok was heel |

**Elk stuk gereedschap deed precies zijn werk.** Er was geen stuk dat dít werk
deed. Dat is dezelfde vorm als de naden waar CLAUDE.md over gaat, één niveau
hoger: niet twee correcte onderdelen met een onbewaakte naad ertussen, maar
twintig correcte controles met een onbewaakte klasse ertussen.

⚠️ **En het is de duurste variant, want er was niets kapot.** De app draaide, de
tests waren groen, de build slaagde. Alleen het document loog.

## 3. Twee reparaties

**a. `markeringen:controle`** — repo-breed, in CI. Scant alle tekstbestanden op
de drie vormen die git achterlaat.

⚠️ **`=======` telt niet mee.** Een regel met alleen isgelijktekens is in
Markdown een setext-kop. Alleen de drie vormen mét een refnaam erachter zijn
ondubbelzinnig: `<<<<<<<`, `>>>>>>>` en de diff3-variant `|||||||`.

⚠️ **De patronen worden in het script opgebouwd uit hun eigen teken en niet
uitgeschreven.** Anders bevat het bestand ze zelf en moet de controle zichzelf
overslaan — een uitzondering die hem precies zo groot maakt als hij niet moet
zijn.

**b. Een vijfde toets in `review:controle`** — dezelfde bevinding hoort er één
keer in te staan.

⚠️ **De sleutel is datum + titel en niet de volledige rij**, en dat is de hele
truc. Juist omdat de kopieën van elkaar verschílden, vindt een vergelijking op de
volledige tekst er geen enkele — dus precies dít geval niet.

## 4. Wat het ijken opleverde

Beide controles zijn tegen de **echte historische toestand** gelegd — de versie
van `docs/ENGINEER-REVIEW.md` zoals die op `main` stond — en vinden daar
respectievelijk vier markeringsregels en vier dubbele rijen.

⚠️ **En één ijking raakte zijn eigen grendel niet. Derde dag op rij.** De toets
*"een setext-kop in Markdown"* moest bewijzen waarom `=` niet in de lijst staat.
Hij bleef groen toen ik `=` toevoegde — want `=======` heeft geen naam erachter
en valt al af op een éérdere grendel. De toets die het wél raakt is een
ASCII-banner: `======= CONFIG =======` heeft exact de vorm die git ook heeft, en
zulke banners staan in gewone scripts.

Dat maakt drie dagen achter elkaar dezelfde vondst — bij `tekst:controle`, bij
`rpc:controle` en hier. De regel in `CLAUDE.md` is goed; wat eraan ontbreekt is
dat je pas wéét dat een ijking zijn grendel raakt nadat je de mutatie hebt
gedraaid. Lezen geeft het niet.

## 5. Wat dit níét oplost

De onderliggende oorzaak van de herhaalde conflicten is al aangepakt door de
parallelle sessie: het prozablok over de migratiestand in `WERKVOORRAAD.md` is nu
gegenereerd (`npm run stand`), met een `stand:controle` erbij. Deze twee
controles vangen wat er alsnog mis gaat; ze voorkomen het conflict niet.
