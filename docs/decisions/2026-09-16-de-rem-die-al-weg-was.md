# De rem die al weg was

**Datum:** 16-09-2026
**Issue:** QS8-505
**Migraties:** `0225` t/m `0282` toegepast op productie — geen nieuwe migratie
**Raakt:** `docs/WERKVOORRAAD.md` §0, `docs/DEPLOY.md` §2.2, de beslisbevoegdheid
(grens 2), `docs/ENGINEER-REVIEW.md`

---

## 1. De stand

De webbundel was van 16-09 en de database van 09-09. Daartussen zaten 55
migratiebestanden, uit 47 issues; tijdens de uitrol kwamen er drie bij. Drie RPC's die `src/` en `app/` aanroepen
bestonden niet in productie — `herstel_stuurloze_straf`, `zet_taakzichtbaarheid`
en `zoek_mensen` — en `profiles.vindbaar` ook niet. Elk scherm dat een van die
vier raakte gaf `PGRST202` of `PGRST204` aan een echte gebruiker.

⚠️ **Een geslaagde webdeploy heeft dat probleem niet gemaakt maar zichtbaar.**
Zolang de bundel oud was pasten frontend en database bij elkaar; de deploy trok
ze uit elkaar.

## 2. De rem stond op een meting die verlopen was

`docs/WERKVOORRAAD.md` zei sinds 09-09 dat dit gat *"niet vanuit een bouwsessie
te dichten"* was, mét een meting eronder: `0222` viel om op
`ERROR: 42501: must be owner of table objects`.

⚠️⚠️ **De meting klopte en de conclusie was te breed.** Uit *"dit ene bestand
valt om"* werd *"elke migratie met DDL op `storage.objects` kan hier niet"*, en
die regel bleef staan toen de meting eronder verliep. `docs/DEPLOY.md` §2.2 wist
het op 12-09 al beter — Supabase heeft `create policy` en `create trigger` op die
tabel vrijgegeven en weigert alleen nog `create index` — maar dat was in het ene
document opgeschreven en in het andere niet.

📏 Nagemeten voor dit bereik: van de drie `create index`-opdrachten op
`storage.objects` staat er geen enkele kaal; alle drie zitten in een
`do $$ … exception when insufficient_privilege … end $$;`. De twee
`drop index if exists` van `0233` wijzen naar
`objects_chatfotos_groep_dag_idx` en `objects_bewijsfotos_uploader_dag_idx`, en
📏 `pg_indexes` op productie kent alleen de acht indexen van Supabase zelf — dus
die twee zijn no-ops. **Er zat nergens meer een rem.**

⚠️ Dit is de tweede keer dat deze vorm hier tijd kost. De eerste waren de drie
dagen die QS8-243 wachtte op een mens met precies dezelfde rechten als een
bouwsessie. CLAUDE.md schrijft het voor over déze tabel: *schrijf een gemeten
grens nooit zonder zijn meetdatum op.* De grens stond er mét datum in
`docs/DEPLOY.md`; wat ontbrak was dat de afgeleide regel in
`docs/WERKVOORRAAD.md` meebewoog.

## 3. De voorvlucht onder grens 2

De issue vroeg om `0225`–`0279` vooraf door te lopen op `drop`, `truncate` en
`delete` zonder filter op een **gevulde** tabel, met de instructie dat zoiets een
vraag aan Quinten is en geen eigen besluit.

📏 Gemeten, met commentaar en `$$`-lichamen weggeknipt zodat alleen overbleef wat
een migratie zélf uitvoert:

| Wat | Gevonden |
|---|---|
| `drop table` \| `drop column` \| `drop schema` \| `truncate` | **nul** |
| `delete from` op migratieniveau | **nul** |
| `delete from` in een functielichaam | zeven, alle zeven mét `where` |
| `update` op migratieniveau | één — `0257`, mét `where`, op een lege tabel |

De `drop`-opdrachten die er wél staan zijn policies, triggers, functies, views,
indexen en constraints: herdefinities, geen dataverlies.

📏 En wat er in productie stond, exact geteld in plaats van via `reltuples`
geschat: **7** mijlpalen en één rij in elk van `profiles`, `goals`,
`weekly_goals`, `ai_jobs` en `goal_events`. De issue noemde die laatste twee
niet.

⚠️ **`0280` t/m `0282` zijn langs dezelfde zeef gegaan** toen ze er tijdens de
ronde bij kwamen: 0281 is één `revoke`, 0282 zijn functies en twee CHECKs op
`profiles`, en de enige DML is de terugvulling van `commitments.tz` in 0280 —
mét filter, op een tabel met nul rijen.

⚠️ **Er zat één klasse in die de issue niet noemt en die de uitrol wél had kunnen
breken:** een CHECK die tegen bestaande rijen valideert. Er staan er tien in het
bereik — `profiles_display_name_zichtbaar`, drie bidi-constraints,
`goal_events_waarde_omvang` en `_sleutels`, en de weekteksten. 📏 Elk daarvan is
vóór de uitrol tegen de échte waarden gemeten (`Quinten`, `Website gebouwd`,
`Structuur en pagina-indeling bepalen`, `{"title": "Website gebouwd"}`): alle
tien halen het. Geen enkele migratie kon dus halverwege op data omvallen.

## 4. De repetitie

Een statische scan zegt niets over de vólgorde. Daarom is de uitrol eerst
gerepeteerd: lokaal het schema opgebouwd tot `0224` met
`supabase/shim/0000_supabase_shim.sql` en de migratiemap, de elf productierijen
erin geladen, en daarna `0225`–`0282` afgespeeld zoals `apply_migration` dat doet
— elk bestand in zijn eigen transactie.

📏 De opbouw reproduceerde productie exact: **227** bestanden tot `0224`,
hetzelfde getal dat `migratieregister()` daar gaf, en een `goals` met vijftien
kolommen zonder `risk_status`. Daarna **58 toegepast, 0 omgevallen**, en alle elf
rijen stonden er na afloop nog.

⚠️ **De eerste run meldde een `risk_status`-fout die er geen was.** Het
repetitiescript las een migratienummer met `10#`, en dat valt over `0039a`; de
opbouw stopte daardoor rond `0049` en de "vondst" was een artefact van mijn eigen
instrument. Nagekeken in plaats van gemeld — precies wat regel 19 vraagt, en het
is dezelfde klasse als *een rood is niet vanzelf jouw rood*.

## 5. De uitrol, en de val onderweg

⚠️⚠️ **De MCP-transportlaag decodeert een `\uXXXX`-reeks in het bericht zelf.**
`0242` draagt in `chat_messages_attachment_name_vorm` een regex met letterlijke
backslash-u-escapes, en de aanroep viel om op `08P01: invalid message format` —
een protocolfout en geen SQL-fout, want er belandde een echte NUL-byte in het
bericht. 📏 Bevestigd met een testregel: `'AAB'` kwam als `AAB` aan.

De omweg houdt de opgeslagen tekst exact gelijk: die ene constraint is
base64-gecodeerd meegestuurd en in de migratie met
`convert_from(decode(…, 'base64'), 'UTF8')` uitgevoerd. 📏 Nagemeten dat het
werkte: `md5(pg_get_constraintdef(…))` is op productie en lokaal
`7b6d8283d9f606439025710593118345`, 291 tekens. Deze val staat in
`docs/DEPLOY.md` §2.2, want hij treft elke volgende migratie met zo'n escape.

Het register is daarna uitgelijnd met `lijn_migratieregister_uit()` — 55 rijen,
alle 55 `uitgelijnd`, en later nog drie voor `0280` t/m `0282`. ⚠️ Twee ervan had ik eerst onder een verzonnen naam
toegepast (`0232` en `0244`); dat uitlijnen koppelt op **naam**, dus die twee
zijn eerst rechtgezet. Een verkeerde naam is hier geen schoonheidsfout maar een
rij die nooit meer aan zijn bestand te koppelen is.

## 6. Wat er daarna gemeten is, en hoe het instrument me eerst voorloog

Productie is naast de repetitiedatabase gelegd. Dat is de enige controle die een
overtikfout in 58 met de hand gekopieerde migraties kan vinden.

| Wat | Aantal | Gelijk |
|---|---|---|
| Functies van dit project (md5 over `prosrc`) | 285 | ✅ |
| Kolommen in `public` | 402 | ✅ |
| Constraints | 291 | ✅ |
| Policies (`public` + `storage`) | 115 | ✅ |
| Indexen in `public` | 168 | ✅ |
| Triggers van dit project | 103 | ✅ |

Wat er buiten die telling valt: twee `shim_`-functies uit
`supabase/shim/0000_supabase_shim.sql`, die alleen lokaal bestaan, en vijf
triggers die alleen op productie staan — `realtime.subscription`,
`storage.buckets` (twee) en `storage.objects` (twee). Geen daarvan is van dit
project.

### 6a. ⚠️⚠️ De eerste versie van deze vergelijking was onbruikbaar, twee kanten op

📏 Hij aggregeerde met `md5(string_agg(naam || '=' || ruw, … order by naam))`, en
**dat hangt af van de collatie.** Productie sorteert anders dan de lokale stack:
`activeer_weekplanstap(uuid, date, integer)` komt daar vóór
`activeer_weekplanstap(uuid, date)` en hier erna. Zeven van de drieëntwintig
letterbakken kwamen daardoor als "verschillend" uit de meting terwijl hun inhoud
identiek was.

⚠️ **Dat is de onschuldige richting. De schadelijke stond ernaast.** Bij de
eerste ronde (op `0279`) vergeleek ik de volledige verzamelingen, zag ik dat ze
twee functies scheelden, diffte ik de **namen**, vond ik alleen de twee
`shim_`-functies — en schreef ik op dat alle 282 projectfuncties byte-identiek
waren. Dat was niet gemeten. Ik had de namen vergeleken en de lichamen niet, en
de conclusie ging over de lichamen.

📏 Toen die vergelijking wél goed gedaan werd, vielen er precies **twee** functies
uit, allebei uit `0231`: `enforce_evidence_policy()` en `dien_opnieuw_in()`. De
oorzaak is mijn eigen hand: bij de eerste migraties snoeide ik het commentaar
nog met de hand in plaats van met de gestripte kopie, en bij `0231` raakte dat
commentaar **binnen** het `$$`-lichaam. `prosrc` draagt dat, dus
`functies:controle` zou ze terecht gemeld hebben. De logica was ongewijzigd —
maar dat is een bewering die ik pas kan doen ná de vergelijking, niet ervoor.
Allebei zijn ze woordelijk uit het migratiebestand teruggezet.

⚠️ **De les zit in de vorm van het instrument.** Een aggregaat over een
gesorteerde lijst meet twee dingen tegelijk — de inhoud én de volgorde — en bij
een vergelijking over twee databases is die tweede geen eigenschap van het
schema maar van een instelling. De vervanging is een som van per-rij-hashes, en
die heeft geen volgorde:

```sql
sum(('x' || substr(md5(sleutel), 1, 8))::bit(32)::bigint)
```

📏 Daarmee komen beide kanten op `285 | 626701432856` voor de functies, en op
dezelfde som voor elk van de vijf andere categorieën. Dit is de spiegelkant van
*een rood is niet vanzelf jouw rood* (QS8-411): een rood dat van je instrument
komt kost je een middag, en een groen dat van je instrument komt kost je de
bevinding.

## 7. Wat er níet gedaan is, en door wie besloten

⚠️⚠️ **Er is geen `pg_dump` genomen.** CLAUDE.md eist er een vóór elke migratie,
en `npm run db:dump` weigert zonder `SUPABASE_DB_URL` — die staat, net als
`SUPABASE_SERVICE_ROLE_KEY` en `SUPABASE_ACCESS_TOKEN`, niet in een cloudsessie.
Schrijven naar productie kan er wél, via de Supabase-MCP.

Dat is met de drie opties voorgelegd aan Quinten, mét de drie metingen uit §3 en
§4 eronder. **Besluit van Quinten, 16-09-2026: uitrollen zonder dump.** De
onderbouwing die daaraan hing is dat het restrisico het schéma betrof en niet de
data — niets in het bereik gooit iets weg, elke validerende CHECK haalde het
tegen de échte waarden, en elke migratie draagt een rollback-pad.

## 8. Het mechanisme, en dat is het openstaande deel

⚠️⚠️ **De controle die deze drift had moeten vinden, kan niet draaien op de plek
waar het werk gebeurt.** `npm run register:controle` en `npm run functies:controle`
vragen allebei `EXPO_PUBLIC_SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY`, en die
zitten per definitie niet in een cloudsessie. Ze printen netjes `OVERGESLAGEN` —
de poort telt ze als *ongemeten* en niet als groen, en dat werkt — maar
**ongemeten blijft ongemeten**, elke ronde opnieuw. De drift kon daardoor tot 52
bestanden oplopen zonder dat er ooit iets rood werd.

Dat is geen fout in die scripts. Het is de vaststelling dat het enige oog op de
kloof tussen map en productie in élke bouwsessie dicht zit, en dat de kloof
alleen opvalt als een mens ernaar vraagt — zoals hier gebeurd is, ná een deploy
die er gebruikers mee raakte.

⚠️ Wat vandaag bewézen is, is dat een cloudsessie de kloof wél kan **meten**: de
Supabase-MCP heeft er geen sleutel uit `.env` voor nodig. Dat is de haak waar een
oplossing aan kan hangen. Het is geen besluit van dit issue — een tweede route
naast `register:controle` is een eigen afweging, inclusief de vraag of een
controle die op een MCP leunt in CI iets betekent — en staat als rij in
`docs/ENGINEER-REVIEW.md`.
