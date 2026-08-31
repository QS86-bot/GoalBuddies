# Het enige oningelogde eindpunt krijgt een teller

**Datum:** 31-08-2026
**Aanleiding:** QS8-236, uit de beveiligingsdoorlichting van 31-08
**Raakt:** migratie 0131, `src/modules/buddies/api.ts`, twee nieuwe testbestanden

## 1. Waarom dit geen datalek is en toch moet

De aanleiding was het onderzoek onder ~1400 AI-gebouwde apps waar 65% een echt
gat had. Alle drie de categorieën zijn tegen dit project nagemeten; deze
bevinding is wat er overbleef aan de kant van "kapotte autorisatie", en hij is
van een ander soort dan de rest.

`invite_preview()` lékt niets. 0019 geeft een oningelogde aanroeper alleen
voornamen, 0128 haalde het avatarpad er ook voor ingelogden uit, en raden kan
niet — twaalf tekens uit een alfabet van dertig is ongeveer 59 bits, met 0088 als
grendel onder die drie getallen.

Wat hij wél is: het **enige eindpunt van deze app dat zonder sessie bereikbaar
is**, en tot 0131 het enige van de vier die beveiligingsregel 5 raken zónder
limiet. `join_group_with_code` telt elke poging (0008/0034), `create_group` heeft
een dagteller (0016), AI-jobs hebben quota (0038). Deze had niets.

⚠️ **De schade valt buiten het bedreigingsmodel waar de meeste van deze regels op
staan.** Er gaan geen gegevens de deur uit; er gaat een rékening de deur uit, op
een gratis tier waar `max_connections` 60 is voor de héle database en waar geen
uitgavenplafond staat (QS8-141). Dat is een reden om hem te dichten, geen reden
om hem lichter te wegen.

## 2. Waarom per code, en niet per gebruiker of per IP

**Per gebruiker kan niet.** `invite_events.user_id` is `not null` en verwijst naar
`profiles`. Een oningelogde aanroeper heeft geen id. Dat is de reden dat er een
eigen tabel staat en niet de bestaande — geen voorkeur, een onmogelijkheid.

**Per IP is niet betrouwbaar te maken.** Het adres komt hier alleen binnen via
`request.headers`, en dat is een door de aanroeper te zetten header. Een limiet
die je met één regel omzeilt, is geen limiet maar een geruststelling.

**Per code sluit precies de dure helft.** De twee paden kosten niet hetzelfde:

| Pad | Werk | Afgeknepen? |
|---|---|---|
| Geldige code | lookup + `count(*)` + join met `profiles`, en voor een ingelogde aanroeper per lid een gecorreleerde subquery op `goals` × `goal_group_links` | **Ja** |
| Gegokte code | één probe op `groups_invite_code_key` (unieke index, nagemeten in `pg_indexes` op productie), daarna `return null` | Nee |

⚠️ **Dat tweede pad blijft open, en dat is een keuze en geen omissie.** Een teller
per code kán het niet zien: er is geen groep om tegen te tellen vóórdat de lookup
mislukt is. Wie dat wél wil, heeft een laag vóór Postgres nodig — edge, WAF, of
een uitgavenplafond dat de schade begrenst. Dat is QS8-141, niet deze migratie.

⚠️ **Hier gaat 0008's les niet op.** Daar staat "eerst loggen, dan pas zoeken",
omdat brute-force uit mislukte pogingen bestaat. Hier kán dat niet: de sleutel van
de teller kómt uit de lookup. Wie die regel klakkeloos overneemt, schrijft een
teller op een groep die niet bestaat — en maakt daarmee de groeivector die
paragraaf 3 juist vermijdt.

## 3. Een rij per groep, geen gebeurtenissentabel

`invite_events` groeit met elke poging. Voor een ingelogde aanroeper is dat
prima; die is begrensd door zijn eigen dagteller. Voor een **oningelogd** eindpunt
is een tabel die per aanroep een rij krijgt zelf de tweede helft van dezelfde
aanval: je knijpt het rekenwerk af en geeft er onbegrensde groei voor terug.

Vandaar één rij per groep met een schuivend venster in diezelfde rij. Het aantal
rijen is hoogstens het aantal groepen, en `on delete cascade` ruimt op. Dit staat
onder test: vijf aanroepen met een onbekende code voegen geen rij toe.

## 4. Waarom een bereikte limiet géén `null` teruggeeft

`null` betekent hier sinds 0019 "ingetrokken, verlopen of nooit bestaan" — met
opzet één antwoord voor drie gevallen, zodat de functie geen orakel is dat
vertelt welke codes bestaan.

⚠️ **Een bereikte limiet hoort daar niet bij.** Die code klópte; hij is alleen te
vaak geopend. Zou hij ook op `null` uitkomen, dan hoort een échte genodigde dat
zijn uitnodiging niet meer geldt terwijl hij over een uur gewoon werkt — zonder
foutmelding, en de uitnodiger ziet er niets van.

Dat verraadt niets extra's: je bent daar alleen als je code al klopte. Het
orakelbezwaar van 0019 gaat over het onderscheid tussen "bestaat" en "bestaat
niet", en dat onderscheid verschuift hier niet.

## 5. Wat er onder test staat, en hoe dat geijkt is

De databasekant staat in `tests/rls/uitnodigingslimiet.test.ts`, de naad naar de
client in `src/modules/buddies/uitnodiging-limiet.test.ts`.

⚠️ **Elke grendel is los gebroken, niet de controle als geheel** — de regel uit
CLAUDE.md. Zeven mutaties, elk tegen een draaiende stack:

| Mutatie | Werd rood |
|---|---|
| limietcontrole uit de functie | 1 test |
| teller telt niet op (`aantal = 1`) | 3 tests |
| limiet geeft `null` in plaats van een eigen antwoord | 2 tests |
| ook een rij schrijven voor een onbekende code | 3 tests |
| teller leesbaar voor `authenticated` | 1 test |
| limietwacht uit de client | 2 tests |
| naïeve wacht `'limiet_bereikt' in data` | 1 test |

⚠️ **En die ronde vond een gat in de test zelf.** "Geeft bij een bereikte limiet
iets anders dan bij een code die niet bestaat" bleef groen toen de limietcontrole
helemaal uit de functie was: `geweigerd` gaf dan de gróép terug, `onbekend` bleef
`null`, en "die twee verschillen" klopte nog steeds. Er staat nu een regel vóór
die eerst toetst dát de limiet geraakt is. Dat is regel 18 vraag 3, gevonden door
te breken en niet door te lezen — precies zoals de regel voorschrijft.

## 6. Waarom de functie van `stable` naar `volatile` gaat

Een `stable` functie mag niet schrijven, en een teller schrijft. Dat is een
gevolg en geen keuze.

⚠️ In PostgREST bepaalt dat welke HTTP-methode mag: `stable` mag via GET,
`volatile` alleen via POST. Nagekeken vóór de wijziging: er is één aanroeper
(`src/modules/buddies/api.ts`), en die gebruikt `supabase().rpc(...)` zonder
`{ get: true }` — supabase-js POST't dan. Was dat een GET geweest, dan had deze
migratie het scherm gesloopt zonder dat één test dat had gezien.
