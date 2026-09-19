# De laatste klok onder een straf — en een parameter die niets meer te doen had

**Datum:** 19-09-2026
**Issue:** QS8-548 · **Migratie:** `0292` · **Vervolg:** QS8-559
**Status:** besloten en gebouwd

## Wat er mis was

`maak_straffen_verschuldigd()` besliste of een streefdatum verstreken is met een
datum die van buiten de database kwam:

```sql
and g.target_date < p_vandaag
```

`p_vandaag` is `localDateIn(profiel.tz, nu)` uit
`supabase/functions/rollover/index.ts` — de **levende** `profiles.tz`, en 📏
`has_column_privilege('authenticated','public.profiles','tz','UPDATE')` is `t`.

📏 Gemeten op 18-09-2026 op de lokale stack, tegen `pg_get_functiondef()`. Straf
`set`, `created_at` dertig dagen oud, **geen** uitstelverzoek, streefdatum één
dag vóór de dag van het aangaan, en als énige variabele de zone ná het aangaan:

| zone bij aangaan | zone daarna | `verschuldigd` |
| --- | --- | --- |
| `UTC` | `UTC` (eerlijk) | 1 |
| Kiritimati | Honolulu (aanval) | **0** |

Dit was de eenvoudigste van de drie routes uit deze familie: er komt geen
uitstelverzoek aan te pas, alleen een `PATCH` op je eigen profiel.

## De familie, en waarom dit de laatste was

| migratie | wat er verzet is | issue |
| --- | --- | --- |
| `0280` | `wikkel_commitments_af()` — laat afronden een straf vervallen | QS8-322 |
| `0288` | de verlooppoort van `beslis_deadline_verzoek()` | QS8-531 |
| `0290` | het zevendaagse schild in `maak_straffen_verschuldigd()` | QS8-533 |
| `0292` | de verlooppoort in diezelfde functie | QS8-548 |

⚠️ **Alle vier zijn gevonden door achter één bevinding aan te lopen, niet door één
sweep.** `0280` sloot zijn eigen geval en schreef erbij dat de bovengrens
onbelangrijk was; QS8-530 mat dat na en vond er twee. Die twee werden `0288` en
`0290`; bij het bouwen van `0290` kwam de derde boven, drie regels verderop in
dezelfde `where`-clausule.

⚠️ **De vraag die twee van de vier vond was: "hoeveel aanroepers heeft het ding
waar ik dit over zeg?"** Die vraag vindt geen zusterclausule in dezelfde
expressie. Wat die wél vindt is het hele predicaat lezen waarin het verdachte
getal voorkomt — en dat is handwerk, geen grep.

## Het besluit

⚠️ **Grens 1 — besluit van Quinten, 19-09-2026: bevriezen op `commitments.tz`.**
Dezelfde keuze als `0280`, `0288` en `0290`, en om dezelfde reden: het is de
enige optie die niemands belofte kráppen maakt.

**De prijs stond dit keer in de vraag en niet in het antwoord**, want hij was bij
QS8-533 al gemeten. Wie eerlijk naar het **westen** verhuist, krijgt zijn straf
op de klok waarop hij hem aanging — tot een dag eerder dan zijn nieuwe kalender
zegt, mét het `commitment_due`-bericht in de begunstigde groep dat blijft staan
ook nadat een buddy uitstel toewijst (domeinregel 7 §3: een systeembericht is een
onveranderlijke kopie). Wie naar het **oosten** verhuist krijgt juist een dag
coulance terug.

Twee alternatieven lagen ernaast:

- **Laten staan en alleen vastleggen.** Dan houdt het argument in
  `rollover/index.ts` het laatste woord — *"te vroeg is precies het enige dat
  hier niet mag"* — en blijft één dag uitstel te koop voor één `PATCH`.
- **`greatest(p_vandaag, doeldatum(...))`.** Zodra één van beide klokken zegt dat
  de streefdatum voorbij is, is hij voorbij. Sluit het gat óók, maar neemt de
  coulance weg die de gekozen optie teruggeeft aan wie naar het oosten verhuist.
  Dat zou de enige plek in dit model zijn waar een bestaande belofte kráppen
  wordt.

### Wat er van de oude reden overeind blijft

⚠️ **Dit is geen tegenspraak met `rollover/index.ts`, en dat is het opschrijven
waard.** *"Te vroeg mag niet"* gold tegenover `current_date`: de serverdatum in
UTC, die met niemand te maken heeft. `doeldatum()` is geen serverklok maar de
zone van de gebruiker zélf, bevroren op het moment dat hij zijn straf aanging.
De datum is dus nog steeds van de gebruiker; hij is alleen niet meer achteraf te
verzetten. Die comment is met deze wijziging herschreven in plaats van geschrapt.

## Het echte werk: een parameter die niets meer te doen had

Met die regel verzet leest de functie geen enkele datum meer van buiten. Wat
overbleef was een parameter die alleen nog de null-poort bewaakte, en criterium 3
van het issue noemt dat een val: de volgende schrijver leest hem als *"hier hoort
de dag van de gebruiker in"* en hangt er iets aan.

Hij verdwijnt. `maak_straffen_verschuldigd(uuid)` doet vanaf nu het werk.

### Waarom de oude handtekening blijft staan

📏 `supabase/uitgerold.json` zegt dat productie op **0282** staat (gemeten
17-09-2026) terwijl de map op `0292` staat, en de gedeployde rollover is van
09-09. Een migratie die een RPC-handtekening dropt maakt een deploy tot een harde
volgorde-eis, en die eis is hier nergens afdwingbaar: er is geen deploy-workflow
in `.github/workflows/`, en `npm run edge:gedeployd` ziet het pas achteraf en
alleen met een access token.

Dit is woordelijk de vorm van `0186` / QS8-324, die om dezelfde reden bestaat:
*dan is de deploy weer een gewone deploy in plaats van een race die je verliest
zonder het te merken.*

⚠️⚠️ **Eén verschil met `0186`, en het is het belangrijkste: deze wrapper past de
reparatie óók toe op de gedeployde rollover.** Hij gooit `p_vandaag` weg en roept
de eenargumentsvorm aan, dus het gat gaat dicht zodra `0292` op productie draait
— zonder dat er iets gedeployd hoeft te worden. Bij `0186` behield de wrapper
alleen gedrag; hier repareert hij het.

⚠️ **Geen tweede `security definer`.** De wrapper hoeft niets te mogen wat de
beller niet mag; de eenargumentsvorm is zélf definer en draagt de autorisatie.
Elke definer-functie in dit project is een kopie van de vorige — zo groeit die
verzameling zonder dat iemand het besluit.

⚠️ **Een wrapper zonder einddatum is permanent.** De voorwaarde waaronder hij weg
mag staat in zijn `comment on` én als **QS8-559**, en er staat een toets op dat
die zin er is. De voorwaarde is niet *"als de rollover gedeployd is"* maar *"als
er tegen de gedéployde bundel gemeten is dat hij de eenargumentsvorm aanroept"* —
dezelfde meting die QS8-403 op 09-09 voor `0186` deed.

### Wat het weghalen nog meer meenam

Twee dingen die niemand had opgeschreven en die de gereedschappen vonden:

- `wikkelStraffenAf(db, profiel, nu)` had `nu` nergens meer nodig. 📏 Gevonden
  omdat de parameter daarna ongebruikt was.
- `localDateIn` was daarmee zijn laatste aanroeper in `rollover/index.ts` kwijt.
  📏 `deno lint` meldde de ongebruikte import binnen één run
  (`npm run edge:types:controle`).

⚠️ Allebei zijn ze meegenomen en geen van beide is opruimwerk: een `nu` dat
nergens meer gelezen wordt is de haak waar de volgende schrijver een datum aan
hangt — precies de val die criterium 3 beschrijft, één laag hoger.

⚠️ **En de generated types dragen bewust alleen de eenargumentsvorm.**
`src/lib/database.types.ts` typt `Args: { p_owner_id: string }`. Daarmee is een
nieuwe aanroep van de tweeargumentsvorm uit deze repo een `tsc`-fout in plaats
van iets dat pas bij de dropmigratie opvalt. Dat is geen omissie in de
typegeneratie maar de grendel die hoort bij *"zolang de oude vorm bestaat, blijft
een aanroeper die hem gebruikt onzichtbaar"*.

## De toetsen

Tien aanroepen in vier bestaande suites gingen mee naar de eenargumentsvorm. Twee
nieuwe dingen staan onder toets:

**`tests/rls/de-afgeschreven-wrapper.test.ts`** (vijf toetsen) bewaakt de naad:
beide deuren geven hetzelfde antwoord, de wrapper laat zich niet sturen door de
datum die de beller meestuurt, de autorisatie blijft bij de functie eronder,
allebei de handtekeningen blijven dicht voor `anon` en `authenticated`, en de
`comment on` draagt de voorwaarde waaronder hij weg mag.

⚠️ **De datumtoets is er omdat de naadtoets zonder haar niets zou bewijzen.** Die
stuurt precies de datum mee die de gedeployde rollover zou sturen, dus een
wrapper die `p_vandaag` gewoon doorgeeft, komt er even goed doorheen.

**En de toets die het gat vastlegde, is omgedraaid in plaats van weggehaald.**
`tests/rls/het-schild-meet-aan-de-bevroren-strafklok.test.ts` droeg *"stelt het
verschuldigd worden zélf nog wél uit — QS8-548, en dat is nog geen belofte"*, met
in de faalmelding dat hij omgedraaid hoorde te worden zodra iemand die regel
verzette. Dat is gebeurd; dezelfde opstelling, de verwachting omgekeerd.

📏 Gemeten met precies die opstelling: zonder `0292` `eerlijk=1 aanval=0`, met
`0292` `eerlijk=1 aanval=1`.

## De ijking

Zeven grendels, elk apart met de hand gebroken op de gedeployde functie, suite
erna, daarna teruggezet:

| mutatie | de toets die rood werd |
| --- | --- |
| `g.target_date < d.vandaag` → een datum uit `profiles.tz` | *stelt het verschuldigd worden zélf ook niet meer uit — QS8-548* |
| de wrapper wordt een tweede implementatie die `p_vandaag` gebruikt | *geeft door beide deuren hetzelfde antwoord* én *laat zich niet sturen door de datum* |
| de wrapper wordt `security definer` | *laat de autorisatie bij de functie eronder* |
| de eenargumentsvorm wordt `security invoker` | *laat de autorisatie bij de functie eronder* |
| `grant execute` op de wrapper aan `authenticated` | *houdt beide handtekeningen dicht* |
| `grant execute` op de eenargumentsvorm aan `authenticated` | *houdt beide handtekeningen dicht* |
| `comment on … is null` | *draagt de voorwaarde waaronder hij weg mag* |

⚠️ De eerste rij is de belofte van dit issue en de zes andere gaan over de
wrapper. Dat is de verhouding die klopt: de clausule is één regel, de wrapper is
het risico.

## Een gereedschap dat hierop brak, en waarom dat goed nieuws was

⚠️⚠️ De beschikbaarheidsproef van de zustersuite telde
`count(*) from pg_proc where proname = 'maak_straffen_verschuldigd'` en
verwachtte **1**. Zodra `0292` de wrapper toevoegde werd dat **2**, en wees de
suite zichzelf af als *schema loopt achter* — precies zoals `stackBeschikbaarOfFaal`
hoort te doen (QS8-270: stil overslaan zou hier als groen tellen).

**Een proef die op een naam telt, breekt bij elke overload.** Hij hoort te vragen
of de database kent wát dit bestand toetst, en dat is hier de eenargumentsvorm:
`and p.pronargs = 1`. Bijgesteld, met de reden ernaast — want de volgende
overload komt er ook een keer.
