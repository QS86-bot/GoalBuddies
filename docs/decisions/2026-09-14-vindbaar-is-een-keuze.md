# Vindbaar is een keuze, en standaard staat hij uit

**14-09-2026 — QS8-476.** Migratie 0271.

## Het besluit dat eraan voorafging

Quinten, 14-09-2026: *"Ik wil ook dat mijn profielfoto en gebruikersnaam buiten
mijn groep, dus publiekelijk, te zien is zodat mensen buiten mijn groep mij
kunnen vinden."*

Daarvóór was `profiles_select` `id = auth.uid() or shares_group_with_user(id)`:
wie nergens lid is, bestaat voor niemand. Dat is de dode hoek van het epic over
buddy's die je nog niet kent.

## ⚠️ De aanname die ik zichtbaar maak in plaats van stilzwijgend neem

`vindbaar` staat op **`default false`**. Het besluit hierboven gaat over Quintens
eigen profiel; het zegt niet dat iedere volgende gebruiker vindbaar wordt zodra
hij zich aanmeldt. CLAUDE.md is daar expliciet over:

> Voor élk níeuw oppervlak is beschermd het antwoord tot iemand het tegendeel
> besluit. Bouw niets "vast open"; dat is precies hoe een standaard verschuift
> zonder dat iemand het besloten heeft.

Wie gevonden wil worden, zet het aan. **Is opt-out bedoeld in plaats van opt-in,
dan is dat één regel in de migratie** — maar het is een besluit met een andere
zwaarte, want het verandert *ik laat me vinden* in *ik word gevonden tenzij*, en
die twee zien er in de database identiek uit.

## Waarom een RPC en geen tak op de policy

⚠️⚠️ **RLS kan geen kolommen beperken.** Een extra tak op `profiles_select` geeft
de héle rij weg aan iedere ingelogde gebruiker: `tz`, `week_start_day`,
`reminder_time`, `quiet_from`, `quiet_to`, de vier meldingsschakelaars,
`wants_own_goal`, `focus_areas`, `when_i_do_it`, `what_breaks_it`.

Dat is exact de fout die QS8-370 op `commitments_select` vond. Zelfde vorm en
zelfde reden als `getuigenissen()` (0169) en `straffen_bij_uitstelverzoek()`
(0218): een SECURITY DEFINER met een **expliciete kolomlijst**. Drie kolommen, en
een vierde erbij is een besluit en geen uitbreiding.

## Wat er in de functie zit, en waarom elk stuk er staat

| Onderdeel | Waarom |
|---|---|
| `p.vindbaar` | de grendel zelf; opt-in |
| `p.id <> v_ik` | jezelf terugvinden zegt alleen iets over je eigen instelling |
| LIKE-metatekens ontsnapt, `\` eerst | zonder dit is `%` een verzoek om de hele vindbare populatie — de enumeratie cadeau |
| minimaal twee codepunten | één teken is geen zoekopdracht maar een uitleesactie |
| blokkade in **beide** richtingen | één richting laat een geblokkeerde je alsnog vinden en uitnodigen |
| `order by lower(display_name), id` | zonder unieke staart kan paginering een rij overslaan of dubbel tonen |
| `tel_dagteller()` vóór de query | onwrikbare regel 5; het bestaande mechanisme en geen eigen tellertabel |

## 📏 De index, en waarom de meting genuanceerder is dan "hij wordt gebruikt"

Eerste poging was `ilike '%term%'` met een index op `(display_name)`. Die
combinatie kan **nooit** een btree gebruiken — een sequentiële scan over
`profiles` bij elke toetsaanslag, op een tabel die naar 100k+ moet.

Nu prefix op `lower(display_name) text_pattern_ops` met `id` als staart, partieel
op `vindbaar`. Gemeten met `explain (analyze, buffers)`:

```
selectieve set      -> Index Scan, Index Cond: lower(display_name) ~>=~ 'zaai1a' AND ~<~ 'zaai1b'
50.000 van 50.000   -> Bitmap Heap Scan op de partiële voorwaarde, 217 rijen, 0,55 ms
```

Het tweede plan is **selectiviteit en geen defect**: is iedereen vindbaar, dan
zegt de partiële voorwaarde niets meer. Het eerste is de stand die je in de
praktijk hebt, juist omdát `vindbaar` standaard uit staat.

⚠️ De prijs staat erbij: wie "de Vries" heet wordt niet gevonden op "vries".
Middenin zoeken vraagt `pg_trgm`, een extensie die dit project niet heeft — een
eigen besluit met een eigen meting, en geen regel die je er stilletjes bij
schrijft.

## ⚠️ De foto, en de halve keten die er anders was

📏 Gemeten: de bucket `avatars` is **privé** (`storage.buckets.public = false`),
en `avatars_select` stond op *eigen map of gedeelde groep*. Een vreemde die je
via `zoek_mensen()` vindt deelt per definitie geen groep — dus `avatar_url` komt
terug, het tekenen levert nul ondertekende URL's op, en `Avatar` valt terug op
initialen. **Elk schakeltje af en de keten onderbroken**, terwijl het besluit
letterlijk *"profielfoto en gebruikersnaam"* zegt. Dat is regel 18 vraag 5.

Er staat nu een derde tak op die policy, met dezelfde grendel als de RPC en niet
ruimer.

### 📏 En die tak is twee keer geschreven, want de eerste vorm sloopte de bucket

De eerste vorm las de kolom rechtstreeks in de policy:

```sql
or exists (select 1 from public.profiles p where p.vindbaar and p.id = …)
```

Dat werkt niet, en de manier waarop het niet werkt is het leerzame deel. **Een
policy-expressie draait met de rechten van wie de query stelt**, en `profiles`
deelt SELECT per kolom uit: `authenticated` heeft `id, display_name, avatar_url`
en verder niets. De tak botst dus op `vindbaar`.

📏 Nagemeten op de lokale stack — en de uitslag is niet wat je van een te krappe
tak verwacht:

```
ERROR:  42501: permission denied for table profiles
```

Geen stille *nee* op die ene tak, maar een **harde fout op de hele policy**, en
dus op élke rij van de bucket. `RLS_DOEL=lokaal npx vitest run
tests/rls/avatarbucket.test.ts` ging van 20 groen naar **6 rood van de 20** —
inclusief *"laat je je eigen avatar zien"*, een tak die met vindbaarheid niets te
maken heeft. De nieuwe tak had het bestáánde oppervlak dichtgetrokken.

Twee dingen zijn hier het opschrijven waard:

1. **De richting van de fout is de verrassing.** Een tak die te weinig rechten
   heeft, faalt hier niet naar *dicht* op zichzelf maar naar *stuk* op het
   geheel. Bij een policy is "te weinig rechten" dus geen veilige kant.
2. **Wat dit vond, was de must-allow-helft van een bestaande suite.** Elke
   weigertest in dat bestand bleef groen — een policy die álles weigert, weigert
   ook wat hij moet weigeren. Zonder *"laat een groepsgenoot je avatar zien"* was
   dit gemerged.

De vorm die het wél doet is de vorm die er al naast stond: `vindbaar_voor_mij()`,
`security definer`, om exact dezelfde reden als `shares_group_with_user()` —
die leest `group_members`, waar `authenticated` evenmin bij kan. Dat de oplossing
naast het probleem stond is geen troost maar de les: **de tak ernaast is
`security definer` om een reden, en die reden gold hier ook.**

⚠️⚠️ **Hier stond eerst dat dit deel op Quintens hand moest wachten, en dat was
onjuist.** De gedachte was: `storage.objects` is eigendom van
`supabase_storage_admin` en `postgres` is geen lid van die rol, dus een
bouwsessie komt er niet bij. Dat klopte op 09-09-2026 en niet meer op
12-09-2026 — Supabase verruimde de rechten, en `docs/DEPLOY.md` §2 heeft die
meting per handeling en mét datum: `create policy` en `create trigger` gaan,
alleen `create index` wordt nog geweigerd. Deze migratie doet het eerste en niet
het laatste, dus ze kan gewoon mee.

⚠️ **Dat ik dit fout had, is de fout waar dat document letterlijk voor
waarschuwt.** Diezelfde aanname liet QS8-243 drie dagen wachten op een mens met
exact dezelfde rechten als een bouwsessie, omdat de meting er destijds **zonder
datum** stond en dus als eigenschap gelezen werd in plaats van als waarneming.
Ik nam haar over uit een migratiekop in plaats van uit de bron. **Een gemeten
grens zonder zijn meetdatum is een conclusie zonder houdbaarheidsdatum.**

## Wat er bewust niet is

- **Geen `anon`.** "Publiekelijk" betekent hier *buiten je groep*, niet
  *uitgelogd*. `revoke … from public, anon, authenticated`, en daarna een grant
  aan alleen `authenticated`.

  ⚠️⚠️ **En de policy zei dat even niet, terwijl dit document het wél beloofde.**
  De eerste vorm van `avatars_select` liet `to authenticated` weg; 📏 gemeten
  werd `pg_policy.polroles` daarmee `{0}`, oftewel PUBLIC, `anon` inbegrepen.
  Het lekte vandaag niets, maar alleen door twee ándere sloten: `anon` heeft geen
  execute op de twee helpers, en `auth.uid()` is dan null. **Bescherming die je
  niet bedoeld hebt, is geen bescherming** — één toekomstige grant haalt haar
  weg zonder dat er iets rood wordt.

  ⚠️ En de lokale stack kón dit niet zien: `supabase/shim/0000_supabase_shim.sql`
  geeft `anon` nergens recht op `storage.objects`, waar echt Supabase daar een
  grant heeft staan. Dit is dus een geval waar het document de code corrigeerde
  en niet de suite.
- **Geen publiek profielscherm.** Een zoekresultaat is een regel in een lijst,
  geen pagina. Er is geen route van een gevonden id naar meer gegevens, en dat is
  de hele veiligheidsredenering.
- **Geen totaal.** Elk ander lijstscherm leest `totaal` uit een
  `count(*) over ()`; hier zou dat een telling over de hele vindbare populatie
  zijn bij élke zoekopdracht. `meer` komt daarom uit "de pagina zat vol".
- **Geen vervolgactie op een resultaat.** Er is vandaag geen route van *gevonden*
  naar *contact*; uitnodigen vanuit het zoekscherm is een eigen epic.

## De grendel die dit bewaakt

De foto en de naam worden op twee plekken bewaakt, en dat is met opzet: ze
staan bij het object dat ze toetsen en niet bij het issue dat ze vroeg.

`tests/rls/avatarbucket.test.ts` draagt de twee toetsen op de policy — dat een
vreemde de foto van een vindbaar profiel wél ziet, en dat de vindbaarheid van de
één de foto van een ánder niet openzet. Ze zijn allebei apart geijkt: de derde
tak weghalen maakt precies de eerste rood, en `vindbaar_voor_mij()` altijd `true`
laten geven maakt precies de tweede rood (met twee bestaande weigertests erbij,
wat klopt — dan staat de hele bucket open).

`tests/rls/vindbaar-buiten-je-groep.test.ts` draagt de rest, en de zwaarste
toets daarin is de naad: **een gevonden id is geen sleutel.** Het id komt uit de RPC zelf en gaat
door acht andere leespaden; overal nul.

⚠️ Die toets bewaakte in zijn eerste vorm **niets**. Hij deed `select('*')` op
`profiles`, en die tabel deelt SELECT per kolom uit — met `*` vraagt PostgREST de
ongegunde kolommen, krijgt *permission denied*, en dan is `data` `null`; `?? []`
maakte daar een lege lijst van. 📏 Met `profiles_select` verruimd naar `true`
bleef hij op 7 van 7 staan. Nu vraagt hij een gegunde kolom en toetst hij ook dat
er geen fout was.

## Wat de securityreview eruit haalde, en wat dat zegt

Regel 19 wil de `security-reviewer` vóór de PR bij alles wat RLS of een nieuw
groepszichtbaar oppervlak raakt. Dat leverde hier drie dingen op die geen van
alle uit het ontwerp kwamen maar uit het *schrijven* ervan — en twee ervan
vielen al om in de bestaande suite, wat betekent dat de grendels werkten en er
alleen naar gekeken hoefde te worden.

1. **`create or replace view` vervangt de reloptions.** `mijn_profiel` verloor
   `security_invoker = false` en `security_barrier = true` doordat de nieuwe
   definitie ze niet noemde. Dat is het intrekken van een bestaande grendel, niet
   een nieuw gat, en daarom de stillere van de twee. 📏 `viewopties.test.ts` ging
   om op twee toetsen. **Derde keer**: 0237 deed het, 0245 schreef het op, en de
   test bestaat er precies voor.

2. **Een definer die `authenticated` mag aanroepen, moet de aanroeper toetsen.**
   De helper heette eerst `is_vindbaar(uuid)` en beantwoordde *"staat het vinkje
   van deze vreemde aan"*. Via `POST /rest/v1/rpc/…` is dat een onbeperkt orakel
   op precies de kolom die 0089's kolomgrant buiten `authenticated` houdt — de
   klasse van QS8-287/289. Hij heet nu `vindbaar_voor_mij(uuid)` en
   beantwoordt *"mag ík deze persoon zien"*.

   ⚠️ Die herformulering repareerde er iets bij dat niemand gevraagd had: de
   blokkade. `zoek_mensen()` toetste `user_blocks` tweezijdig, de policy op de
   bucket niet — dus wie jou blokkeerde kon je foto nog lezen zodra je vindbaar
   werd. Nu staat die regel op één plek en gebruiken beide oppervlakken hem.
   **Twee oppervlakken met elk een eigen kopie van dezelfde regel is precies de
   naad waar regel 18 over gaat.**

3. **Een grens die je meet ná je eigen bewerking, meet iets anders.** De
   ondergrens van twee tekens stond achter de LIKE-ontsnapping, en die maakt van
   `%`, `_` en `\` twee tekens. 📏 Gemeten met een vindbaar profiel `%rarenaam`:
   `zoek_mensen('%')` gaf die rij terug. Dezelfde klasse als een teller in
   grafemen bij een grens in codepunten — het getal klopt, de eenheid niet.

   ⚠️ **En de test die dit had moeten vinden was groen om de verkeerde reden.**
   Hij toetste `%`, `%%` en `_` op nul rijen, en dat lukte doordat geen enkele
   fixture-naam met zo'n teken begon. Er staat nu een profiel bij dat dat wél
   doet, met de must-allow-helft ernaast.

⚠️ Eén bevinding heb ik nagemeten en niet overgenomen zoals gesteld: de kop van
de index claimde dat de sortering volledig uit de index komt, terwijl de
`order by` op de kale kolom stond en de index op `lower(...)`. De 📏-meting in
die kop was dus onjuist. Gerepareerd door de query te laten sorteren op
`lower(display_name), id` — hoofdletterongevoelig zoeken hoort
hoofdletterongevoelig te sorteren — en niet door de claim te verzachten.

## Het gevolg dat ergens anders intreedt

Migratie 0203 liet `user_blocks` bewust zonder dagplafond, met de voorwaarde
*"**Wordt zwaarder als:** profiel-id's in bulk op te vragen worden."*
`zoek_mensen()` ís dat — tot 50 id's per aanroep, en elk id is een geldige
`blocked_id`. Die aanname vervalt hiermee. Staat als QS8-496.
