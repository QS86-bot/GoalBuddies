# Een grendel die in twee bestanden staat, ijk je twee keer

**Datum:** 12-09-2026 · **Issue:** QS8-443 · **Migratie:** geen

## Wat er mis was

`tests/beloftes/geen-foto-verlaat-de-app-met-metadata.test.ts` bewaakt dat geen
afbeelding de app verlaat met zijn EXIF eraan. Het draait `it.each(INGANGEN)`
over twee bestanden, en de faalstand toetste het zo:

```ts
const bron = lees(pad).replace(/\/\*[\s\S]*?\*\//g, ' ');
expect(bron).toMatch(/\.ok\b/);
```

📏 In `src/shared/kiezers/kiesFoto.ts` is `schoon.ok` de énige `.ok`, dus daar
beet hij. In `src/modules/auth/useAvatarKeuze.ts` staan er nog twee —
`uitkomst.ok` in het upload- en het verwijderpad. **Haal daar de grendel weg en
de test blijft groen**, met de óngeknipte avatar op elk ledenlijstje.

📏 Nagemeten met de grendel eruit: de oude assertie gaf **groen**, op precies die
twee regels.

## Waarom het een ijkingsfout was en geen regexfout

De kop van het bestand zei:

> 📏 Gemeten door `!schoon.ok` uit `kiesFoto.ts` te halen

**Eén bestand gemeten, twee bestanden bewaakt.** CLAUDE.md schrijft *mutatie per
grendel, en niet één mutatie voor de hele controle* — dit is die regel een niveau
dieper: per grendel-**instantie**. Staat dezelfde grendel in twee bestanden, dan
zijn het twee grendels, en dan zijn het twee mutaties.

⚠️ Wat het bijzonder maakt: de ijking voerde zijn geval door de énige ingang waar
de assertie toevallig scherp was. Dat is woordelijk de val waar dezelfde kop
elders voor waarschuwt bij mutatie C/D — *een ijking die zijn geval door een pad
voert dat een eerdere grendel al afvangt, bewaakt niets van wat hij belooft.* Die
les stond in het bestand en was op zijn eigen tweede grendel niet toegepast.

## De reparatie is een andere vraag, geen scherpere regex

Niet *"staat er ergens een `.ok`"* maar *"wordt de uitkomst van **déze** aanroep
gelezen"*. `opvangerVan()` vindt de naam waarin `ontdoeVanMetadata()` opgevangen
wordt, en de assertie bindt zich daaraan.

Het verschil is dat de eerste vraag naar de **plek** kijkt en de tweede naar de
**belofte** — regel 18 vraag 4. Een scherpere regex (`!schoon\.ok`) zou de
vacuïteit ook wegnemen, maar dan hangt de test aan de naam `schoon` en aan de
`!`-vorm; hernoem de variabele of schrijf `schoon.ok === false` en hij is rood
zonder dat er iets brak.

## ⚠️ En één klasse die geen van beide gevallen zag

Een bestand kan de knipper aanroepen, netjes op `.ok` toetsen, en vervolgens de
**rauwe** bytes teruggeven:

```ts
const schoon = ontdoeVanMetadata(bytes, mime);
if (!schoon.ok) return { soort: 'fout', sleutel };
return { soort: 'gekozen', data: bytes, mime };   // ← de knip is decoratie
```

Dan staat de grendel er, is de faalstand dicht, en verlaat de foto de app alsnog
met zijn coördinaten. Daar is een tweede geval voor bijgekomen: de succesroute
moet `<opvanger>.data` teruggeven.

## De knip die commentaar weghaalt is zelf een grendel

`zonderCommentaar()` is uit `roept-aan.ts` getrokken en geëxporteerd in plaats
van een derde keer overgetypt.

⚠️ Dat is geen netheid. CLAUDE.md beschrijft bij QS8-412 hoe dezelfde knip in
twee testbestanden stond en in allebei blind was voor `https://` — de suite bleef
groen op eenenzestig tests. De regelvorm die dit project daarna koos
(*begint de **regel** met `//`*) overleeft een URL juist wél; een derde kopie zet
die eigenschap opnieuw op het spel.

📏 De audit van vandaag telde **vijf** kale `\/\/`-kopieën die nog in de oude,
blinde vorm staan. Die zijn hier niet meegenomen — dat zou de branch verbreden —
maar deze ene is niet toegevoegd.

## IJking — zeven mutaties, vooraf 7 groen

| mutatie | wat er rood werd |
| -- | -- |
| A — de knip uit `kiesFoto()` | "kiesFoto.ts knipt de metadata eraf" |
| **B1** — de faalstand uit `kiesFoto.ts` | "kiesFoto.ts laat de foto vallen …" |
| **B2** — de faalstand uit `useAvatarKeuze.ts` | "useAvatarKeuze.ts laat de foto vallen …" |
| C, D — een derde kiezer buiten `INGANGEN` | "kent elke fotokiezer die er is" |
| **E1** — `kiesFoto.ts` geeft `bytes` in plaats van `schoon.data` | "kiesFoto.ts geeft de geknipte bytes terug …" |
| **E2** — `useAvatarKeuze.ts` idem | "useAvatarKeuze.ts geeft de geknipte bytes terug …" |

B2 is de meting die dit issue opleverde: vóór deze branch bleef daar **alles
groen**. E1 en E2 dekken een klasse die er nooit een geval voor had.

⚠️ Bij elke mutatie is met een `grep` vastgesteld dát hij in het bestand stond
vóór de uitslag geloofd werd, en daarna is het bestand teruggezet uit een kopie.
