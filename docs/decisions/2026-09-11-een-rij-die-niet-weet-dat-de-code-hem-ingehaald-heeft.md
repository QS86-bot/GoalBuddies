# Een rij die niet weet dat de code hem ingehaald heeft — 11-09-2026

**Issue:** QS8-421
**Raakt:** `docs/ENGINEER-REVIEW.md` (vijf rijen herwogen, één toegevoegd),
`.claude/commands/audit.md` stap 10

---

## 1. Wat het issue vroeg, en waarom het toch hermeten moest

Vijf weggelegde Laag-rijen waren achterhaald terwijl `review:controle` er groen
op stond — dat script bewaakt dát de voorwaardezin er staat, niet óf hij nog
waar is. Het issue had ze alle vijf al benoemd en gemeten.

Toch is alles opnieuw gemeten, en dat was geen formaliteit: **twee van de vijf
kwamen er wezenlijk anders uit**, en één rij bleek ongelijk te hebben over
zichzelf.

## 2. De metingen, naast wat het issue zei

| Wat | Het issue | 📏 Gemeten op 11-09 |
| -- | -- | -- |
| aantal emmers | vier | vier **in de map**; **één op productie** |
| limieten | 2 / 1 / 1 / 5 MB, `chatdocs` pdf-only | bevestigd |
| het UPDATE-pad | *"0239 trok élk UPDATE-pad in"* | bevestigd, en preciezer: **nul** UPDATE-policies op `storage.objects` |
| stand van productie | niet genoemd | **0221**, map 255 — **31 migraties achter** |
| aanroepers `todo_items` | zeven | zeven, waarvan **vier schrijfacties** |
| schrijfpaden via de schema's | ja | bevestigd, en `api.ts` is de **enige** schrijver |
| het register in `kolomrechten-controle.mjs` | niet genoemd | de twee rijen zijn **al opgeruimd** |

## 3. De twee vondsten die het issue niet had

### 3a. Een rij kan achterlopen doordat de code zichzelf repareerde

Rij 4 zei met zoveel woorden: *"er is géén grendel die dat opvangt"*, en dat was
de kern van zijn risico-argument.

📏 Die grendel was er wél. `verlopenRegels()` in
`scripts/kolomrechten-controle.mjs` — de tak die QS8-349 bouwde — heeft de twee
`todo_items`-rijen uit `GEEN_AANROEPER` gemeld zodra `app/(tabs)/lijst.tsx`
bestond, en ze zijn eruit gehaald. Wat er nu staat is een commentaarblok dat
uitlegt dát ze verlopen zijn.

> **De code had de ratel die de rij zei te missen; alleen de rij wist het niet.**

Dat is een andere richting dan waar stap 10 van `/audit` op stuurt. Die vraagt:
*is de aanname vervallen?* — en zoekt dus naar rijen die **erger** zijn geworden.
Deze werd **beter**, en dat valt niemand op: een rij die te zwaar staat kost geen
incident, alleen aandacht die ergens anders hoorde.

⚠️ Dezelfde dag droeg `docs/WERKVOORRAAD.md` de zin dat `supabase/functions/`
buiten typecheck en CI valt — twee weken nadat dat gerepareerd was (QS8-422 heeft
hem rechtgezet). Twee gevallen op één dag, in twee verschillende documenten.

### 3b. Een Laag-rij beschrijft risico, en risico is een eigenschap van productie

De drie opslagrijen gaan over vier emmers met uiteenlopende limieten. 📏 Op
productie bestaan die vier niet: de stand is `0221`, en `chatfotos` komt in 0222,
`bewijsfotos` in 0227, `chatdocs` in 0240. Er is dáár precies één emmer, en met
één emmer bestaat "een verhuizing tússen emmers" niet.

In de map is het omgekeerd: vier emmers, maar **nul** UPDATE-policies — 0235
dropte `chatfotos_update`, 0239 `avatars_update` en `bewijsfotos_update`, en
`chatdocs` heeft er nooit een gehad. Ook daar kan de verhuizing dus niet.

**Het gat is aan beide kanten dicht, om twee verschillende redenen — en geen van
beide redenen is die van de rij.** De echte voorwaarde bleek daarmee iets dat
geen van de drie rijen noemde:

> **Wordt zwaarder als de deploy deels landt** — 0222 tot en met 0240 wél en
> 0235/0239 niet. Dan bestaan de vier emmers mét een UPDATE-pad, en dat is
> precies de combinatie die vandaag nergens bestaat.

⚠️ **En het slot is broos op een manier die de rij niet beschreef.** Het is de
afwezigheid van een **policy**, niet van een **grant**: `authenticated` heeft nog
gewoon UPDATE op `storage.objects` (die grant hoort bij `supabase_storage_admin`
en is vanuit deze repo niet in te trekken — zie de kop van 0239). Policies worden
over buckets heen ge-OR'd, dus **één nieuwe `*_update`-policy op welke emmer dan
ook heropent de klasse voor alle vier tegelijk**.

## 4. Wat er bewust níet gebeurd is

**Geen uitbreiding van `review:controle`.** Het issue zegt dat met zoveel woorden
en die afwijzing staat: het script bewaakt dát de zin er staat, en of hij waar is
heeft geen patroon. Een controle die dat zou proberen, zou het proza moeten lezen.

**Geen nieuw script voor de voorwaarden-pas.** De novembervraag uit het issue —
*moet dit een vaste stap worden?* — staat nu als 🗣-rij in
`docs/ENGINEER-REVIEW.md`, met de vier gemeten gevallen erbij (QS8-188 drie dagen
te laat, QS8-182 twee weken, en de vijf van vandaag bij toeval gevonden). Wat er
wél gebeurd is, is de lichtste vorm die iets verandert: stap 10 van `/audit`
draagt nu allebei de vondsten van §3.

**Rij 1, 2 en 3 gaan niet dicht.** Hun aanname is niet gunstig afgelopen maar
verschoven; ze hebben een nieuwe voorwaarde die klopt bij vier emmers én bij een
productie die 31 migraties achterloopt.

**Rij 4 en 5 gaan wél dicht**, met de meting erbij zodat de volgende lezer ziet
dát het gunstig afliep en niet dat iemand ze stil heeft weggehaald.

## 5. Waarom hier geen ijking onder staat

Er is niets nieuws te breken: dit issue voegt geen grendel toe. De bestaande
grendels zijn wel gedraaid — `review:controle` (192 open Laag-rijen, elk met zijn
voorwaarde), `docs:controle` en `padverwijzing:controle`.

⚠️ Dat is precies de reden dat dit issue bestaat: **de eigenlijke controle hier
is een mens die leest**, en het enige wat je daaraan kunt verbeteren is
opschrijven wáár hij moet kijken. Vandaar §3a en §3b in `/audit` stap 10 en niet
een script.
