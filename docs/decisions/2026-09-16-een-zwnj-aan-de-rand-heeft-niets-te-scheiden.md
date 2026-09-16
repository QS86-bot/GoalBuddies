# Een ZWNJ aan de rand heeft niets te scheiden — QS8-451

**Datum:** 16-09-2026
**Issue:** QS8-451, losgetrokken uit QS8-448 (migratie 0256)
**Status:** besloten — het blijft zoals het is

---

## 1. De vraag

`schone_naam()` en `schoneNaam()` strijken `U+200C` (ZERO WIDTH NON-JOINER) van
de **randen** van een weergavenaam. In het Perzisch, Arabisch en enkele Indische
schriften is de ZWNJ een betekenisdragend teken: hij verbiedt dat twee letters
aan elkaar vastschrijven.

QS8-451 legde drie opties voor:

1. laten zoals het is;
2. `U+200C` uit de bereikenlijst halen, en accepteren dat een naam die alleen uit
   een ZWNJ bestaat er dan doorheen komt;
3. wél strijken aan de rand, maar de naam weigeren als er niets overblijft — met
   de aantekening dat dát mogelijk al is wat er gebeurt.

## 2. Het besluit

**Optie 3, en die was al gebouwd.** `U+200C` blijft in `ONZICHTBARE_BEREIKEN` en
in de randenlijst van `schone_naam()`, en `profiles_display_name_zichtbaar`
weigert wat er leeg van wordt.

Dit is een besluit onder *Beslisbevoegdheid* — het raakt geen belofte aan een
mens en is niet onomkeerbaar — en het is de conservatiefste optie die het werk af
maakt.

## 3. Waarom, gemeten

📏 16-09-2026, met de echte `schoneNaam()` uit `src/shared/tekst`:

| invoer | uit |
|---|---|
| `<ZWNJ>می<ZWNJ>` | `می` |
| `<ZWNJ>می` | `می` |
| `می<ZWNJ>` | `می` |
| `می<ZWNJ>خواهم` | `می<ZWNJ>خواهم` — **onaangeroerd** |
| `<ZWNJ>` alleen | leeg, en dus geweigerd |

De middelste regel is de reden dat optie 1 en 3 samenvallen en optie 2 niets
oplevert: **de vorm die de ZWNJ in het Perzisch heeft, is de vorm die blijft
staan.** Een ZWNJ tussen twee Perzische letters is orthografisch verplicht en
wordt niet aangeraakt — dat is de contextregel van QS8-499, en zij was er nog
niet toen dit issue geschreven werd.

Wat weggaat is uitsluitend de vorm aan de rand, en daar geldt:

1. **Er is niets te scheiden.** Een ZWNJ verhindert een verbinding tussen twee
   letters. Aan het begin van een naam staat er links geen letter, aan het eind
   rechts niet — de letter die overblijft stond daar al in dezelfde vorm.
2. **Hij is een collisievector.** `می` en `<ZWNJ>می` zijn twee verschillende
   waarden die identiek renderen. Dat is woordelijk de klasse die QS8-495 en
   QS8-499 dichtgooiden voor het midden van een naam.
3. **Optie 2 opent wat QS8-448 sloot.** Zonder `U+200C` in de randenlijst is
   `schone_naam('<ZWNJ>')` niet leeg, en dan laat
   `profiles_display_name_zichtbaar` een groepszichtbaar lid zonder naam door.

## 4. ⚠️⚠️ De premisse van het issue klopt voor de client en niet voor de grens

Het issue zegt *"`schone_naam()` en `schoneNaam()` strippen U+200C van de
randen"*, en dat is waar als beschrijving van die twee functies. Het is **niet**
waar als beschrijving van wat er met een opgeslagen naam gebeurt.

📏 Gemeten op productie (16-09-2026, read-only, `wehgocadxehottiiyvsc` op `0282`):
van de vijf CHECKs op `profiles.display_name` eist er geen enkele **gelijkheid**
met `schone_naam()`. `profiles_display_name_zichtbaar` roept hem aan, maar vraagt
alleen *"blijft er iets over"*.

📏 Van de codepunten in de randenlijst van `schone_naam()` komen er **30** aan de
voorrand van `می` door álle vijf de CHECKs heen terwijl `schone_naam()` ze
wegstrijkt — aan de achterrand net zoveel. Twintig daarvan zijn witruimte en
hébben breedte; **tien renderen als nul pixels**, en dat zijn de gevaarlijke:

`U+034F` `U+061C` `U+180B` `U+180C` `U+180D` `U+180E` `U+200C` `U+200D` `U+200E` `U+200F`

Voor elk van die tien geldt dat `<teken>می` en `می` twee verschillende
opslaanbare waarden zijn die identiek renderen — de spoofing van QS8-495, aan de
rand in plaats van in het midden.

De randstap woont in de aanmeldtrigger en in `profielSchema` — en dat schema zit
in de bundel en is geen grens. Een rechtstreekse `PATCH /rest/v1/profiles` wordt
dus niet genormaliseerd.

⚠️ **Dat gat is niet nieuw en niet van dit issue.** Het is gevonden bij ijking H2
van QS8-499 en staat uitgeschreven in
`docs/decisions/2026-09-16-de-plek-is-het-probleem-en-niet-het-teken.md`. Wat er
níét was, is een plek waar het als wérk staat; dat is nu QS8-508.

**Voor dít besluit verandert het niets** — de vraag was of de randstap `U+200C`
mag strijken, en het antwoord blijft ja. Maar het verplaatst waar de winst zit:
niet in de bereikenlijst, maar in een CHECK die er nog niet is.

## 5. De grendel

De toets hoort bij de belofte en niet bij de bereikenlijst, dus hij staat in
`tests/rls/naamnormalisatie.test.ts` — het bestand dat de SQL- en de
TypeScript-kant naast elkaar legt.

`CONTEXTEN` had zes omgevingen en elk daarvan zet het codepunt **tussen** twee
dingen. De rand had één meting: `RANDVRAAG`, die het codepunt in zijn eentje
aanbiedt. Er waren er dus nul die een teken aan de rand van een woord in een
schrift dat het nodig heeft aanboden. Twee omgevingen erbij:

```ts
{ naam: 'vóór een Arabische letter', voor: '', na: 'م' },
{ naam: 'ná een Arabische letter', voor: 'م', na: '' },
```

## 6. ⚠️⚠️ De ijking, en waarom de oude toets niets zag

Regel 18 vraag 3: de belofte met de hand breken en kijken wélke toets rood wordt.
De mutatie is precies de ruil die optie 2 voorstelt — `U+200C` uit de randenlijst
aan **beide** kanten. Eén kant zou de náád breken en niet de belofte; dan meet je
of SQL en TypeScript het eens zijn, en dat was de vraag niet.

📏 16-09-2026, lokale stack (Postgres 16, 285 migraties, PostgREST):

| stand | mutatie | uitslag |
|---|---|---|
| vóór | geen | 20 geslaagd |
| oude toets | `U+200C` uit `ONZICHTBARE_BEREIKEN` én uit de randenlijst van de gedeployde `schone_naam()` | **20 geslaagd — niets rood** |
| nieuwe toets | dezelfde mutatie | ⏳ **nog niet gemeten — deze rij is pas waar als hij ingevuld is** |

**De middelste rij is de reden dat dit issue niet met één regel in een
beslisdocument afgedaan kon worden.** De belofte was te breken zonder dat er iets
rood werd: de twee talen bleven het eens, want ze werden allebei gemuteerd. Wat
er verdween was niet de overeenstemming maar de belofte — en dit bestand toetste
alleen de eerste.

⚠️ **De mutatie is afgeleid van `pg_get_functiondef()` en niet overgetypt.** Die
les staat in
`docs/decisions/2026-09-16-de-plek-is-het-probleem-en-niet-het-teken.md`: twee
ijkingen daar werden rood van een randenlijst die de ijking zelf per ongeluk had
verouderd, en dat rood bewees niets. De randenlijst hierboven verschilt op één
plek van de gedeployde: `\2000-\200F` is `\2000-\200B\200D-\200F` geworden.

## 7. Wat dit besluit níét is

- **Geen uitspraak over `U+200C` midden in een naam.** Die staat sinds QS8-499
  onder de contextregel en blijft staan tussen twee Perzische letters. Dit
  besluit gaat alleen over de rand.
- **Geen verruiming van de randenlijst.** Er gaat niets in en niets uit.
- **Geen oplossing voor QS8-508.** De randstap is nergens afgedwongen, en dat
  blijft zo tot dat issue gebouwd is. Wat hier vastligt is wat `schone_naam()`
  belóóft, niet waar die belofte een grens is.
