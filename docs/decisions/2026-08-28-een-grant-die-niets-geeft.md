# Een grant die niets geeft, hoort weg — en een bewaking met een lijst bewaakt de lijst

**Datum:** 28-08-2026
**Migratie:** 0118
**Raakt:** `supabase/migrations/0118_…`, `src/modules/buddies/api.ts`,
`tests/rls/schrijfrechten.test.ts`, `tests/rls/deling.test.ts`,
`tests/migraties/bewaking-zonder-lijst.test.ts`

## De aanleiding

Bevinding 1 van de controleronde van 28-08: elf tabellen dragen schrijfgrants
zonder bijbehorende policy, terwijl `schrijfrechten_bewaking()` uit 0101 een
**hardgecodeerde lijst van vier tabelnamen** kent en de rest niet ziet.

Dat is precies de klasse die 0101 kwam voorkomen. De migratie schreef het zelf op:
`alter default privileges` van Supabase deelt élke nieuwe tabel in `public` de
volle set uit aan `anon` en `authenticated`, dus de volgende tabel krijgt ze weer
zonder dat iemand iets doet. Een bewaking die vier namen kent, meldt dan nul.

## De meting

Generiek gesteld: welke schrijfrechten geven vandaag niets, omdat er geen policy
voor die rol en die opdracht bestaat? Gemeten op de lokale stack én op productie,
met exact dezelfde uitkomst:

| Rol | Rechten zonder policy | Tabellen |
|---|---|---|
| `anon` | 58 | 21 |
| `authenticated` | 18 | 9 |

Twee metingen eromheen, allebei op beide databases:

- **Er is geen enkele policy in `public` die `anon` of `public` als rol noemt.**
  Nul. Elke policy staat op `authenticated` of op `service_role`. Een schrijfrecht
  voor `anon` kán dus niets doen — vandaag niet en bij geen enkele rij.
- **RLS staat op alle 34 tabellen aan.** Daarom zijn de rechten vandaag inert.

## De afweging: waarom dit toch weg moet

De gegevens waren veilig. Dat is geen reden om het te laten staan, om drie redenen.

1. **Ze zijn inert door een tweede slot, niet door zichzelf.** Valt er één policy
   verkeerd om, of komt er een tabel bij waar iemand RLS vergeet, dan is het
   verschil tussen "dicht" en "open voor een niet-ingelogde beller" precies dit
   recht.
2. **De weigering is zonder dit stil.** Dat stond al in 0101: voor UPDATE en
   DELETE filtert RLS de rijen weg, en nul rijen raken is geen fout. De client
   krijgt HTTP 204 en een ongewijzigde tabel — en een test die op een foutcode
   rekent, wordt daar groen van zonder iets te bewijzen.
3. **Een lezer die grants naast policies legt, ziet tabellen waar de client iets
   lijkt te mogen.** Dat kost bij de engineer-review in november tijd die niets
   oplevert.

## De vondst onderweg: één van de achttien hield een werkende knop overeind

`koppelDoelAanGroep()` deed een `upsert` op `goal_group_links`, en PostgREST
vertaalt dat naar `on conflict do update`. Twee dingen daarover zijn nagedaan op
een echte Postgres 16, niet beredeneerd:

- **`on conflict do update` eist het UPDATE-tabelrecht al bij het plannen**, ook
  als er geen conflict is. Een rol met `select, insert, delete` maar zonder
  `update` krijgt `permission denied for table`. Het intrekken zou het koppelen
  van een doel aan een groep dus **in zijn geheel** gesloopt hebben, niet alleen
  het randgeval.
- **Het randgeval was al stuk.** Mét het recht maar zonder UPDATE-policy weigert
  Postgres bij een écht conflict met `new row violates row-level security policy`.
  Een doel voor de tweede keer aan dezelfde groep koppelen gaf dus "koppelen
  mislukt" terwijl de koppeling er gewoon stond.

De reparatie is `ignoreDuplicates: true` — `on conflict do nothing`. Die vorm
heeft het UPDATE-recht niet nodig en gaat over een bestaande koppeling heen zonder
fout; ook dat is gemeten.

⚠️ **Dit is regel 18, vraag 5: de keten was onderbroken terwijl elk schakeltje af
was.** De policies zijn juist, de datalaag is juist, en elke bestaande test
koppelt een paar dat er nog niet is. De fout zat in de vertaling ertussen, en die
had geen eigen bestand. Er was niet "een test die groen bleef terwijl de belofte
brak" — er was geen test die de belofte kón raken.

⚠️ **Volgorde bij het uitrollen: eerst de nieuwe bundel, dan deze migratie.** De
migratie staat sinds 28-08 op productie; de bundel op
`goalbuddies.q-projects.tech` is nog de oude. Tot `npm run deploy` gedraaid heeft,
geeft koppelen daar `42501`. Dat is bewust zo gelaten en niet stilgehouden: de
alternatieve volgorde laat één recht staan waar de bewaking dan over klaagt, en
dan is de nulmeting op productie geen nulmeting meer.

## Wat er voor de lijst in de plaats komt

De regel is uit te rekenen, dus er hoeft geen lijst te zijn:

> een schrijfrecht voor `anon` of `authenticated` waar geen permissieve policy
> voor diezelfde rol en opdracht bij hoort

`schrijfrechten_bewaking()` doet dat nu met `has_table_privilege()` (telt ook
rechten die via een rollidmaatschap binnenkomen) en `pg_policy`. Een policy
`for all` dekt INSERT, UPDATE én DELETE; een policy `to public` geldt voor elke
rol. Allebei tellen mee — anders meldt de bewaking iets dat wél werkt, en dan leer
je hem te negeren.

⚠️ **Waarom dit hier wél een berekening mag zijn en bij `definer_bewaking()` een
lijst.** 0101 verdedigde de lijst met "een besluit hoort in code en niet in data",
en dat klopt — voor een **uitzondering**, zoals `invite_preview` in
`definer_bewaking()`. Hier ging het niet om een uitzondering maar om de regel
zelf, en dan is elke lijst een plek waar de volgende tabel ontbreekt.

## Hoe het bewaakt wordt

| Wat | Waar | Met de hand rood gemaakt |
|---|---|---|
| Nul rechten zonder policy | `tests/rls/schrijfrechten.test.ts` | ✅ twee rechten teruggegeven die 0101 nooit gezien zou hebben (`delete on profiles to anon`, `update on goal_group_links to authenticated`) — allebei gemeld |
| De rechten die wél een policy hebben blijven staan | idem | `authenticated` houdt 37 schrijfrechten over en de bewaking noemt er geen |
| Twee keer koppelen doet geen kwaad | `tests/rls/deling.test.ts` | ✅ de vlag weggehaald → `42501 permission denied for table goal_group_links` |
| De bewaking draagt geen lijst | `tests/migraties/bewaking-zonder-lijst.test.ts` | ✅ `and c.relname in (...)` erin gezet → rood met de twee namen erbij |

⚠️ **De gedragskant van "geen lijst" is met de hand geijkt en niet in een test te
herhalen.** De RLS-suite praat via PostgREST en kan geen `grant` uitvoeren, en een
functie bouwen die dat wél kan is een gat dat je niet wilt om een test te kunnen
schrijven. Wat er wél te bewaken viel is de vórm die de terugval veroorzaakt: een
tabelnaam in de definitie. Dat is geen vervanging van de ijking — het is het slot
op de fout die 0101 maakte.
