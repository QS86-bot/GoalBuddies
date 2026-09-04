# Het model van de lidmaatschapshulpfuncties

**04-09-2026 — QS8-146, migratie 0159.**

Zeven `SECURITY DEFINER`-functies beantwoorden de vraag *"hoort deze gebruiker
erbij?"*, en ze zitten samen onder tientallen policies. Ze zijn in vijf stappen
gegroeid — 0002, 0029, 0092, 0102, 0141, 0153 — en elk verschil tussen ze is een
autorisatieverschil. Dit document schrijft het model op dat ze delen en de
verschillen die een besluit zijn.

De dossierrij van 27-08 sprak van vier functies. 📏 Het zijn er zeven; dat alleen
al is de reden dat dit document er hoort te zijn.

## De vier assen

| functie | kijker | tegenpartij | archief | open |
|---|---|---|---|---|
| `is_group_member` | ✓ | n.v.t. | dicht | — |
| `is_group_admin` | ✓ (+admin) | n.v.t. | dicht | — |
| `mag_groep_lezen` | ✓ | n.v.t. | **open** | — |
| `lid_van_open_groep` | ✓ | n.v.t. | dicht | ✓ |
| `shares_group_with_goal` | ✓ | ✓ | dicht | — |
| `deelt_open_groep_met_doel` | ✓ | ✓ | dicht | ✓ |
| `shares_group_with_user` | ✓ | ✓ *(sinds 0159)* | **open** | — |

`tests/rls/hulpfunctiemodel.test.ts` legt deze tabel naast de gedeployde bron en
wordt rood zodra er een functie bijkomt die zijn model niet noemt.

### 1. De kijkerskant — overal hetzelfde, en dat is gemeten

Elke functie knijpt de kant van de aanroeper af met `status <> 'inactive'`.
📏 Nagemeten op alle zeven: **geen enkele** schrijft `status = 'active'`.

Dat verschil is één woord en het is in een diff niet te zien zonder de regel te
kennen. 0029 zegt hem: *"Alleen `inactive`. `paused` is een zelfgekozen pauze en
geen moderatie; wie even niet meedoet, hoort zijn groep gewoon te kunnen lezen.
Zou `paused` hier meelopen, dan is een adempauze nemen hetzelfde als eruit gezet
worden."*

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

## Wat 0159 verandert

Eén predicaat: `shares_group_with_user()` toetst nu ook of de ánder er nog bij
hoort.

📏 Gemeten op een verse database uit `supabase/migrations/`, als Alice:

| toestand van Bob | vóór 0159 | ná 0159 |
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

## Wat hier niet mee opgelost is

De Hoog-rij van 15-08 over `SECURITY DEFINER` blijft een gespreksvraag voor de
review in november: alle zeven omzeilen RLS, en dat móet ook — zonder dat krijg je
recursie op `group_members`. Dit document is het meetbare deel eronder.
