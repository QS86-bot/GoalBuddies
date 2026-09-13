# Een opgeruimde branch is geen vrij issue

**Datum:** 13-09-2026 · **Issue:** QS8-449 · **Raakt:** `scripts/claim.mjs`

## Wat er misging

📏 Op 13-09-2026 heeft `npm run claim` twee keer achter elkaar een issue
vrijgegeven dat de dag ervoor af en gemerged was: **QS8-437** (PR #431) en
**QS8-438** (PR #430). Beide keren is de claim-commit gepusht voordat iemand
doorhad dat er niets te bouwen viel.

De afloop was goed — QS8-411 zegt *lees het issue én zijn reacties*, en in beide
gevallen stond in de eerste reactie "af en gemerged", dus er is geen regel code
dubbel geschreven. **Maar de branch stond er toen al**, en een cloudsessie krijgt
die niet meer weg (QS8-240). Netto: twee goede afloopen, twee stuks permanente
ruis op de remote.

## Waarom de claim het niet zag

`scripts/claim.mjs` las precies één bron: `git ls-remote --heads origin`.

Die bron beantwoordt **"zit hier iemand"**. Ze werd ook gelezen als antwoord op
**"is dit al gebouwd"**, en dat is ze niet. De kop van het script onderbouwde dat
zelfs met een meting:

> *"Op die vraag is een gelande branch juist het sterkste ja dat er is. 📏
> Gemeten: `npm run claim -- QS8-306` weigert nadat dat issue gemerged en op Done
> gezet is."*

⚠️ **Die meting klopte en bewees iets anders dan ze leek te bewijzen.** Ze werkte
doordat de branch van QS8-306 na de merge was blijven staan. Van QS8-437 en
QS8-438 was hij opgeruimd, en dan is er niets om tegenaan te botsen.

**De claim leunde dus op een neveneffect — dat niemand opruimt — en niet op een
eigenschap.** Hoe netter er opgeruimd wordt, hoe vaker hij een afgerond issue
voor vrij aanziet.

### ⚠️ Het spiegelbeeld van QS8-240

| | |
| -- | -- |
| QS8-240 | een branch die **niet weg kan** leest als bezetting die er niet is |
| QS8-449 | een branch die **wél weg is** leest als vrijheid die er niet is |

Twee foutrichtingen op dezelfde bron. Dat maakt het een eigenschap van het
mechanisme en niet twee losse ongelukken.

### ⚠️ En de rem die er wél was, stond ná de handeling

QS8-411 vond de fout allebei de keren. Maar die controle komt ná de push die de
schade maakt. Zelfde vorm als een migratie die pas bij het tweede afspelen botst:
het net hangt achter het gat.

## De keuze

Het issue woog A t/m D. Geen ervan is het geworden; het is **E**, met de vorm van
C en de tekst van D.

**A — de claim leest de issuestand uit Linear.** Het meest direct, en afgevallen
op de prijs: `claim.mjs` heeft dan een token en een netwerkaanroep nodig, en hij
draait op plekken waar dat er niet is. Faalt hij dicht, dan kun je zonder netwerk
niet meer claimen; faalt hij open, dan is het een disclaimer.

**B — ook gemergede branches laten staan.** Dan klopt de oude aanname weer. Maar
het botst frontaal met QS8-240, dat juist wil opruimen, en het laat een lijst
onbegrensd groeien die `migratie:nieuw` en `migraties:controle` óók lezen.

**C — de volgorde omdraaien.** Juist, maar op zichzelf leeg: zonder tweede bron
weet de claim niet wanneer hij zou moeten remmen.

**D — alleen de melding aanpassen.** Een waarschuwing en geen grendel — precies
de vorm die dit project bij `migratie:nieuw` net heeft weggewerkt.

**E — een tweede bron: de geschiedenis van `origin/main`. Gekozen.** Een gelande
PR laat daar een onderwerpregel achter, en die verdwijnt niet als iemand de
branch opruimt. Geen token, geen extra netwerkaanroep — de fetch die het script
al doet, is genoeg.

## 📏 De meting die de vorm bepaalde

De eerste vorm was *"noemt een commit op main dit issuenummer"*. Gemeten over
**1109** onderwerpregels tegen 22 open issues:

| signaal | open issues met een treffer |
|---|---|
| elk commit-bericht dat het nummer noemt | **14 van 22** |
| alleen een gelande PR-onderwerpregel | **3 van 22** |

⚠️ **Die eerste is onbruikbaar, en niet omdat de regex te ruim is.** Dit project
verwijst in vrijwel elke commit-tekst naar andere issues — dat is hier huisstijl
en het is de reden dat de geschiedenis leesbaar is. Een signaal dat dáárop
afgaat, meldt twee op de drie open issues, en een controle die alles meldt leer
je te negeren.

Wat overblijft zijn de twee vormen waarin werk daadwerkelijk op `main` belandt:

```
Merge pull request #440 — <titel> (QS8-447)     <- merge-commit   (232x)
<titel> (QS8-294) (#232)                        <- squash          (21x)
```

📏 **Dekking:** 24 van 24 gebouwde issues gevonden, inclusief QS8-294 zelf — dat
landde als squash, en een controle die alleen merge-commits leest had hem gemist.
📏 **Ruis:** 3 van 22, en alle drie zijn ze bij de hand nagelopen en terécht:

| issue | wat er geland is |
|---|---|
| QS8-216 | PR #226 — het wachtwoordminimum naar acht |
| QS8-243 | PR #348 en #354 — de stand van productie, en de grens bij `storage.objects` |
| QS8-433 | PR #425 — migratie 0254 |

Alle drie staan ze open omdat er nog iets ná die PR moet gebeuren. **Er ís werk
voor geland**, dus de melding is juist en niet vals.

⚠️ **Wat een merge van `main` ín een branch betreft: die valt er buiten, en dat
hoort.** Er staan er 128 op `main` en ze dragen het nummer waar iemand op dat
moment aan wérkt, niet wat er geland is. Precies de commits die het eerste
signaal zo luid maakten.

## Wat het script nu doet

Twee bronnen met verschillend gewicht, en dat verschil is het besluit:

| bron | betekent | gevolg |
|---|---|---|
| een branch op de remote | hier zit iemand **nu** | weigert hard |
| een gelande PR op `main` | hier is werk **geweest** | weigert deze keer, **zonder te pushen** |

⚠️ **Waarom de tweede niet hard weigert.** Dan waren QS8-216, QS8-243 en QS8-433
niet meer te claimen, en die staan terecht open. Er ís een legitiem vervolg op
gelande werk.

⚠️ **En waarom hij toch niet doorloopt.** De schade van dit issue ontstond niet
doordat de claim iets verkeerds dácht — de sessie las daarna netjes de reacties
en stopte — maar doordat de push vóór het lezen kwam. Een melding zonder rem had
QS8-449 dus níet voorkomen. Daarom: geen branch tot er gelezen is, en
`--vervolg` als expliciete uitweg die in de claim-commit belandt.

📏 **Nagespeeld en niet beredeneerd** (acceptatiecriterium 2): `npm run claim --
QS8-437` — hetzelfde commando dat vanochtend slaagde — weigert nu met exitcode 1,
en de remote telde 24 branches ervóór en 24 erná.

## De grendels eronder

| bestand | wat het toetst |
|---|---|
| `tests/scripts/claim.test.ts` | elke vorm los: de twee die tellen, en vijf die met rust gelaten moeten worden |
| `tests/scripts/claim-gelande-geschiedenis.test.ts` | de **naad** — een echte bare repo op schijf, en de branchtelling vóór en ná |

⚠️ **Die tweede is niet dubbelop.** 📏 Gemeten met vier mutaties, één per
grendel: haal je de `gelandVoor()`-tak uit `hoofd()`, laat je `process.exit` weg,
of zet je `--vervolg` vast op waar — dan blijven alle **23** tests in
`claim.test.ts` groen terwijl de claim exact de fout van 13-09 opnieuw maakt.
Alleen de vierde mutatie, aan de regex zelf, wordt daar gezien.

Dat is CLAUDE.md regel 18 vraag 5: een keten die op waardeniveau doodloopt
terwijl elk schakeltje af is. `gelandVoor()` zou dan het juiste antwoord geven
aan niemand — en `exports:controle` ziet dat niet, want de tests importeren hem.

⚠️ **En de ijkgetallen zijn gemeten en niet voorspeld.** Ik had er voor de eerste
drie mutaties één rode test per stuk opgeschreven; het zijn er drie, want
`--vervolg` verliest zijn aantekening in de claim-commit zodra `gelande` leeg
blijft. De tabel in de testkop draagt de meting, niet de verwachting.

## ⚠️ Wat dit besluit níet is

**Geen vervanging van QS8-411.** De claim weet nu dát er iets geland is, niet
wát. Of dat issue daarmee klaar is, staat in de reacties, en die lees je nog
steeds zelf. De claim verplaatst alleen de rem naar vóór de push.

**Geen slot.** Een claim blijft een afspraak: niets in git houdt een tweede
branch tegen, en `--vervolg` is één woord. Wat er wél bij komt is dat het
overslaan nu een handeling is in plaats van een stilte.

**Geen reden om QS8-240 anders te wegen.** Opruimen na de merge blijft goed; dit
besluit haalt juist de reden weg om het níet te doen.
