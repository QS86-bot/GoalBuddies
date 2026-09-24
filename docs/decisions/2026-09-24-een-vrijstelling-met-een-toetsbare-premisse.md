# Een vrijstelling met een toetsbare premisse

**24-09-2026 — QS8-610.** Voortgekomen uit dossierrij **444** (01-09-2026).

## Wat er stond

`NIET_TE_LEZEN` in `scripts/kolomrechten-controle.mjs` is gesleuteld op
`(pad, tabel)`. Eén regel dooft daarmee **elke** onleesbare schrijfactie van dat
bestand naar die tabel, ook een toekomstige. De regel voor
`src/modules/goals/interview.ts → goals` droeg deze reden:

> `update(patch)` waar `patch` uit `spiegelpatch()` komt — een functie en geen
> literaal. De velden die zij zet zijn een deelverzameling van wat
> `wijzigDoel()` schrijft, en die staat hier wél onder de controle.

Die laatste zin is de premisse waarop de vrijstelling rust. Hij was een
bewering.

## Waarom een kolomsleutel hier niet kan

De voor de hand liggende reparatie is `NIET_TE_LEZEN` sleutelen op
`(pad, tabel, kolommen)`. Dat kan niet, en de reden is dezelfde als waarom de
vrijstelling bestaat: het pad is **onleesbaar**. Welke kolommen `spiegelpatch()`
schrijft is precies wat die controle niet kan zien. Een kolomlijst zou dus een
lijst zijn die niemand kan verifiëren — een register dat stil rot, en dat is de
vorm die dit project al betaald heeft.

⚠️ **Wat wél toetsbaar is, is de premisse zelf**, en die gaat niet over de grant
maar over `wijzigDoel()`. Dat is de scherpere formulering én de goedkopere: de
kolommen die `wijzigDoel()` schrijft staan als toewijzingen in de bron, dus de
controle heeft geen database nodig en draait ook in CI-baan `repo`. Dat de
UPDATE-kolomgrant van `goals` dezelfde vijf kolommen draagt, is een gevolg en
geen invoer — die kant bewaakt `kolomrechten:controle` al.

## De meting die dit issue draagt

De vraag is niet *"kan de premisse vervallen"* maar *"vangt iets anders het al"*.
Dat is met een échte mutatie gemeten en niet beredeneerd, in vier varianten.

📏 **De naïeve mutatie wordt al gevangen.** Zet je alleen `ritme: 'ritme'` in
`SPIEGELING`, dan wordt `tsc` rood — `DoelVoorvulling` kent dat veld niet. Wie
deze rij leest als *"er is geen enkel net"* leest hem te sterk.

📏 **Maar `tsc` vangt de nullability, niet de grant.** In elke variant die ik
probeerde stond het rood op een fixture of een `string | null`-mismatch, nooit op
het recht. Die zijn met een handvol regels weg, en het zijn precies de regels die
iemand die dit veld toevoegt sowieso schrijft.

📏 **De beslissende variant.** Een vraag `ritme_vraag` die spiegelt naar
`goals.status`, `status` optioneel in `DoelVoorvulling`, en `gegeven()` verbreed
naar `undefined` — vijf kleine bewerkingen:

| net | uitslag |
| -- | -- |
| `npm run typecheck` | **groen** |
| `npm run lint` | **groen** |
| `npm run kolomrechten:controle` | **groen** |
| `npm run spiegeling:controle` | **rood** |

`goals.status` heeft geen UPDATE-kolomgrant voor `authenticated`; elke spiegeling
zou een `42501` geven. Niets in deze repo zag dat, op de nieuwe controle na.

⚠️ **En `kolomrechten:controle` bleef groen in álle vier de varianten** — dat is
de kern van rij 444, nu bevestigd met een mutatie in plaats van met een
redenering.

## Twee kanaries, en waarom ze er allebei zijn

Deze controle leest twee dingen uit bron. Een lezer die niets vindt, ziet er
precies zo uit als een codebase waar niets mis is — en dat is per bron een ander
soort stilte:

- Vindt hij `SPIEGELING` niet, dan valt er niets te toetsen en zou hij **groen**
  zijn. Stil groen.
- Vindt hij de kolommen van `wijzigDoel()` niet, dan wordt élke spiegeling een
  bevinding. Een storm die als een storm leest en niet als een kapotte lezer.

Allebei zijn ze daarom een eigen, benoemde fout met een eigen zin. De tests
voeden beide gevallen apart.

## Wat hier niet mee besloten is

De andere regels in `NIET_TE_LEZEN` dragen elk hun eigen reden. Of die ook
toetsbaar zijn, is per regel een aparte vraag; dit issue pakt de regel die rij
444 bij naam noemt. **Een vrijstelling waarvan de reden zich niet laat toetsen,
is niet automatisch fout** — hij is alleen duurder, en dat hoort bij de rij te
staan in plaats van bij de volgende lezer.
