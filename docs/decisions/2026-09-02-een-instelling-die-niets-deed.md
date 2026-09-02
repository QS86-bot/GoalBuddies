# "Notitie én bijlage" is weggehaald in plaats van afgebouwd

*02-09-2026 · QS8-261 · migratie 0150*

## Wat er stond

Een groep kon zijn bewijseis op `note_and_attachment` zetten. Die waarde bestond
op zes plekken:

| Waar | Wat het deed |
|---|---|
| `groups_evidence_policy_valid` | liet de waarde toe |
| `BEWIJSEISEN` (`modules/buddies/schemas.ts`) | bood hem aan |
| `app/groep/beheer/[id].tsx` | liet hem kiezen, zonder filter |
| `nl.ts` en `en.ts` | vertaalden hem — "Notitie én bijlage" |
| `bewijseisVoorDoel()` | leidde hem af als strengste eis |
| `completions.attachment_url` | bestond, mét INSERT-kolomgrant |

En `enforce_evidence_policy()` toetste alleen `new.note`. **Een groep die deze
eis aanzette, kreeg exact het gedrag van `note_required`.**

⚠️ **De kop van 0021 zei dat dit tijdelijk was en dat het scherm de optie
zichtbaar uitzette.** Het eerste klopte, het tweede niet: `[id].tsx` rendert
`BEWIJSEISEN.map(...)` zonder er iets uit te laten. **Een afspraak die alleen in
een migratiekop staat, is geen grendel.** Dat is de kern van deze rij: er was
niets kápot, dus geen enkele test werd rood.

## Het besluit: weghalen, niet afbouwen

QS8-261 legde twee richtingen voor. Gekozen is **de keuze weghalen tot er een
uploadpad is** — de conservatieve kant van `CLAUDE.md`/Beslisbevoegdheid.

**De doorslag was niet de omvang maar de volgorde.** Een bijlage afbouwen vraagt
het **eerste client-side uploadpad van dit project**. Zelfs de avatar heeft er
geen: QS8-196 staat open met precies dezelfde vorm — leeskant af, schrijfpad
afwezig. Dat pad op de rug van een bugfix bouwen maakt de bugfix een feature, en
laat de leugen ondertussen staan.

⚠️ **Dit is geen afwijzing van de bijlage.** Het rollback-pad in de kop van 0150
is de helft van de terugweg: zodra QS8-196 een uploadpad neerzet, komt
`note_and_attachment` terug — mét een trigger die hem afdwingt en een test die
rood wordt als die tak verdwijnt.

## Geen groep verandert stilzwijgend van eis

Acceptatiecriterium uit het issue. Op productie gemeten vóór de migratie: twee
groepen, allebei `note_required`, nul op `note_and_attachment`.

⚠️ **Dat is een meting van vandaag en geen eigenschap van de migratie.** 0150
draagt daarom een `raise exception` die afbreekt zodra er wél zo'n groep staat —
dezelfde vorm die 0132 gebruikt voor `goal_done`. Een `update` die de eis stil
verlaagt zou het criterium juist schenden.

## Wat de eigenlijke reparatie is

De verwijderde waarde is het symptoom. De oorzaak is dat **niets `BEWIJSEISEN`
ooit naast de database legde**.

`bewijseis_allowlist()` (0150 §5) leest de CHECK uit, en
`tests/rls/bewijseis.test.ts` doet er een **gelijkheidstoets** op — geen
insluiting. Verruimt iemand de CHECK zonder de app, óf de app zonder de CHECK,
dan wordt het rood ongeacht welke kant het eerst verandert. Zelfde vorm en
zelfde reden als `systeembericht_allowlist()` uit 0034, dat er kwam nadat 0032
precies deze fout maakte.

⚠️ **Er lag nog een tweede lijst, en die is nu weg.** `modules/completions/api.ts`
had een eigen `Bewijseis`-unie met dezelfde drie waarden erin. Die is vervangen
door een `import type` uit `modules/buddies` — bij het compileren volledig weg,
dus zonder runtime-koppeling tussen de modules.

## Wat de mutatieproef opleverde

Elke grendel één keer met de hand gebroken. Twee daarvan hebben het werk
veranderd, en dat is de reden dat deze paragraaf bestaat.

| Mutatie | Uitkomst |
|---|---|
| de CHECK weer verruimen | rood — gelijkheidstoets én weigering |
| `BEWIJSEISEN` verruimen zonder de CHECK | rood — gelijkheidstoets én "accepteert elke eis" |
| de grant op `attachment_url` terugzetten | rood — `kolomrechten:controle` |
| de catalogussleutel terugzetten | rood — `catalogus:controle` |
| de notitie-eis uit de trigger halen | rood — twee tests |
| `btrim` eruit | rood — de spatietest |
| `bool_or` → `bool_and` | **groen, en dat was de vondst** |

⚠️ **De laatste bleef groen omdat de opstelling maar één groep had.** "De
strengste wint" was daarmee niet te ráken — geen test die groen bleef terwijl de
belofte brak, maar geen test die de belofte kón raken. Dat is `CLAUDE.md`
vraag 6: een aanname die van *"er is er altijd precies één"* naar *"er kunnen er
meer zijn"* is getild, bij QS8-56, zonder dat deze eis meeging. Er staat nu een
test met een doel in twee groepen.

⚠️ **En de derde test viel bij mutatie vijf om op de verkeerde reden.** De drie
deelden één weekdoel, dus zodra de eerste insert slaagde, brak de derde op een
dubbele voltooiing. Rood om de verkeerde reden bewijst niets; elke test maakt nu
zijn eigen weekdoel. Dezelfde kruisbesmetting die QS8-145 kwam opruimen.

## Wat er bewust onbewaakt blijft

De dode `note_and_attachment`-tak is uit `enforce_evidence_policy()` gehaald. Hem
terugzetten maakt **geen enkele test rood** — de CHECK verbiedt de waarde toch,
dus de tak is onbereikbaar. Dat is opruimwerk en geen grendel, en het staat hier
opgeschreven in plaats van dat het als bewaakt wordt voorgesteld.

**Wordt zwaarder als:** iemand de CHECK verruimt zonder de trigger na te lopen.
Dan is de gelijkheidstoets in `bewijseis.test.ts` het eerste dat rood wordt, en
die dwingt af dat er opnieuw naar deze functie gekeken wordt.
