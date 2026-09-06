# Het model van de lidmaatschapshulpfuncties

**04-09-2026 — QS8-146, migratie 0160.**

Zeven `SECURITY DEFINER`-functies beantwoorden de vraag *"hoort deze gebruiker
erbij?"*, en ze zitten samen onder tientallen policies. Ze zijn in vijf stappen
gegroeid — 0002, 0029, 0092, 0102, 0141, 0153 — en elk verschil tussen ze is een
autorisatieverschil. Dit document schrijft het model op dat ze delen en de
verschillen die een besluit zijn.

De dossierrij van 27-08 sprak van vier functies. 📏 Het zijn er zeven; dat alleen
al is de reden dat dit document er hoort te zijn.

## De vier assen

De persoon over wie geoordeeld wordt komt uit het JWT (`auth.uid()`) of uit een
parameter. Dat onderscheid is geen as van het model maar wel de reden dat de
onderste drie er eerst niet bij stonden: 📏 een afleiding die `auth.uid()` eiste
liet ze vallen, en dat is door de security-review op 0160 gevonden.

| functie | afgeknepen rijen | vorm | archief | open |
|---|---|---|---|---|
| `is_group_member` | 1 | `<> inactive` | dicht | — |
| `is_group_admin` | 1 (+admin) | `<> inactive` | dicht | — |
| `mag_groep_lezen` | 1 | `<> inactive` | **open** | — |
| `lid_van_open_groep` | 1 | `<> inactive` | dicht | ✓ |
| `shares_group_with_goal` | 2 | `<> inactive` | dicht | — |
| `deelt_open_groep_met_doel` | 2 | `<> inactive` | dicht | ✓ |
| `shares_group_with_user` | **2** *(sinds 0160)* | `<> inactive` | **open** | — |
| `kan_beoordeeld_worden` | 1 | `is distinct from` | open | — |
| `blokkade_met_groep` | 1 | `<> inactive` | open | — |
| `heeft_nog_beoordelaar` | 1 | **`= active`** | (alleen actief) | — |

`tests/rls/hulpfunctiemodel.test.ts` leidt de lijst uit de gedeployde database af
en legt hem naast deze tabel; een elfde functie die zijn model niet noemt maakt
hem rood.

⚠️ **De detector knipt eerst het SQL-commentaar weg**, en dat is geen netheid.
📏 Zonder die stap overleeft een mutant die het echte predicaat weghaalt en een
rollback-notitie laat staan die het citeert — gemeten op deze branch, en twee
functies in `public` dragen vandaag al zo'n regel.

### 1. De kijkerskant — overal hetzelfde, en dat is gemeten

Elke functie knijpt de kant van de aanroeper af met `status <> 'inactive'`.
📏 Nagemeten op alle zeven: **geen enkele** schrijft `status = 'active'`.

Dat verschil is één woord en het is in een diff niet te zien zonder de regel te
kennen. 0029 zegt hem: *"Alleen `inactive`. `paused` is een zelfgekozen pauze en
geen moderatie; wie even niet meedoet, hoort zijn groep gewoon te kunnen lezen.
Zou `paused` hier meelopen, dan is een adempauze nemen hetzelfde als eruit gezet
worden."*

⚠️ **Eén functie schrijft wél `= 'active'`, en dat is een gepaard besluit.**
`heeft_nog_beoordelaar()` (0147) is de spiegel van `vastgelopen_goedkeuringen()`
en moet exact dezelfde verzameling opleveren; wie er één van de twee verzet,
breekt het paar. Het gevolg is dat een lid met een adempauze niet als beschikbare
beoordelaar telt, anders dan overal elders in dit model. 📏 Zeven functies in
`public` combineren `group_members` met `= 'active'`; alleen deze valt binnen de
familie van dit document. De vraag of dat de bedoeling is staat als open rij in
`docs/ENGINEER-REVIEW.md` (04-09) — hier wordt hij alleen vastgelegd, niet
beslecht.

### 2. De tegenpartijkant — de as waar 0029 en 0102 elkaar tegenspreken

**0029 schreef de regel op:**

> ⚠️ Alleen de kant van de kíjker wordt afgeknepen. `shares_group_with_goal`
> kijkt of *jij* een groep deelt met dit doel; of de eigenaar ervan inmiddels
> uitgezet is, staat daar los van. Zou dat hier ook meelopen, dan verdween het
> doel van een uitgezet lid uit het overzicht van de groep — en dat is
> geschiedenis herschrijven.

**0102 draaide hem om**, met een meting: `bob ná het vertrek van alice ziet haar
doel: true`. Die kop noemt drie routes naar hetzelfde effect — (a) de eigenaar is
vertrokken, (b) de eigenaar staat op `inactive`, (c) de groep is gearchiveerd —
en zegt erbij dat twee van de drie dichtzetten *"dezelfde fout nog een keer
maken"* is.

⚠️ **De regel van 0029 geldt sindsdien niet meer, maar dat stond nergens.** Het
gevolg was dat `shares_group_with_user()` in de oude stand bleef staan, en het
verschil met zijn buurman las als toeval in plaats van als besluit.

**Het besluit van vandaag:** een functie die twee mensen aan elkaar verbindt,
toetst beide kanten. Alleen functies die één lidmaatschap beoordelen (`gid`
zonder tweede persoon) hebben geen tegenpartij.

Het bezwaar van 0029 — geschiedenis wordt onleesbaar — is inmiddels in de app
beantwoord, en niet als reactie hierop: `src/modules/buddies/chat.ts` valt terug
op `algemeen.oud_lid` en zegt zelf dat `profiles_select` *"niet meer van
toepassing is bij iemand die de groep verlaten heeft, terwijl zijn bericht in het
gesprek hoort te blijven staan"*. Er wordt geen rij herschreven; alleen de naam
valt terug.

### 3. De archiefkant — de splitsing van 0092 en 0153

0092 zette de archieftoets in `is_group_member()` omdat daar de schrijfpolicies
langslopen. 0153 mat dat er **zeventien** policies langs die functie liepen — elf
lezend, zes schrijvend — en splitste de leeskant af als `mag_groep_lezen()`,
zodat een archief leesbaar blijft. `archiefleesgat()` bewaakt dat geen
schrijfpolicy langs de leesfunctie gaat lopen.

Twee leesfuncties houden een archief tóch dicht, en allebei met reden:

- **`shares_group_with_goal`** — 0153 schrijft uit dat `weekly_goals` `missed` en
  `carried` draagt en de zwaarste tabel van domeinregel 7 is.
- **`deelt_open_groep_met_doel`** — dezelfde tabellen, in de open variant.

`shares_group_with_user` staat aan de leeskant zonder die last: hij draagt
`profiles_select` en `avatars_select`. Een naam en een avatar zeggen niets over
een gemiste week. Archief blijft daar dus open — anders is een groep archiveren
hetzelfde als iedereen wegsturen.

### 4. De open-groepkant — A54

`lid_van_open_groep` en `deelt_open_groep_met_doel` (0141) dragen de smalle
uitzondering van A54: een klassement per lid bestaat alleen in een **open** groep.
In een beschermde groep geeft de RPC nul rijen. Zie
`docs/decisions/2026-08-31-ritme-klassement-en-kleur.md` §2.

## Wat 0160 verandert

Eén predicaat: `shares_group_with_user()` toetst nu ook of de ánder er nog bij
hoort.

📏 Gemeten op een verse database uit `supabase/migrations/`, als Alice:

| toestand van Bob | vóór 0160 | ná 0160 |
|---|---|---|
| actief lid | true | true |
| **uitgezet** (`status = 'inactive'`) | **true** | **false** |
| adempauze (`paused`) | true | true |
| vertrokken (rij verwijderd) | false | false |
| gearchiveerde groep | true | true |

⚠️ **Twee wegen naar dezelfde toestand gaven twee uitkomsten.**
`verlaat_groep()` (0102) verwíjdert de lidmaatschapsrij; `verwijder_lid()` (0145)
zet hem op `inactive` en laat hem staan. Vertrekken maakte je onzichtbaar, eruit
gezet worden niet.

**De omgekeerde reparatie kan niet.** `verwijder_lid()` bewaart die rij met opzet:
een uitgezet lid mag niet met dezelfde code weer naar binnen, en
`join_group_with_code()` weigert het heractiveren van een inactieve rij (0029,
route 2). De `inactive`-rij ís het slot. De toets hoort dus in de functie.

Wat er lekte: naam, avatar, tijdzone en week-startdag van iemand die de groep
zojuist had weggestuurd — onbeperkt, en zonder dat hij er iets van zag.

⚠️ **Het sluit met maximaal een uur vertraging, en niet meteen.**
`AVATAR_GELDIGHEID_S` in `src/modules/auth/avatar.ts` staat op 3600, en een
signed URL wordt niet opnieuw langs RLS gehaald. Wie het overzicht laadde vlak
vóór de uitzetting, houdt die avatar nog een uur bereikbaar. Begrensd in plaats
van onbeperkt is de winst; nul is het niet.

## Wat 0161 daarnaast rechtzet

0160 legde een naad bloot die er al lag. `group_overview()` doet een **inner join
op `profiles` zonder statustoets**, en die join loopt langs `profiles_select`.
Vóór 0160 ging dat nooit mis; daarna bepaalde de kíjker het antwoord.

📏 Gemeten met Bob uit groep A gezet, Carol die met hem óók in groep B zit en
Dave die dat niet doet:

    carol (deelt groep B met bob):  a, b/inactive, c, d   total=4
    dave  (deelt niets met bob):    a,             c, d   total=3

Dat is erger dan allebei de vaste standen: wélke leden je ziet hangt af van iets
dat niets met deze groep te maken heeft, en `total_members` wordt er
kijkerafhankelijk van. 0161 laat de functie zelf filteren — de database hoort dit
te doen en niet het scherm.

## Wat hier niet mee opgelost is

De Hoog-rij van 15-08 over `SECURITY DEFINER` blijft een gespreksvraag voor de
review in november: alle zeven omzeilen RLS, en dat móet ook — zonder dat krijg je
recursie op `group_members`. Dit document is het meetbare deel eronder.
