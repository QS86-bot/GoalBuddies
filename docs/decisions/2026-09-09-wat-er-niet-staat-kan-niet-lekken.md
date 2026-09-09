# Wat er niet staat, kan niet lekken — de bewaartermijn van een gedeelde foto

**Datum:** 09-09-2026
**Issue:** QS8-396 (deel 2 van QS8-394)
**Migratie:** 0232
**Besluit van Quinten:** 21 dagen

---

## 1. Waarom dit los staat van versleuteling

Quinten vroeg of gedeelde foto's niet net als bij WhatsApp op de telefoon van de
ontvanger kunnen staan in plaats van op een server. Het antwoord uit QS8-394 was:
**WhatsApp doet dat niet.** WhatsApp uploadt media wél naar zijn eigen servers —
versleuteld — en gooit ze weg zodra ze zijn afgeleverd. De privacy zit in twee
dingen, en ze zijn los te kopiëren:

1. de server kan het niet lézen (versleuteling — QS8-397, een besluit dat nog
   openstaat en dat sleutelbeheer vraagt);
2. de server bewáárt het niet lang.

Het tweede is de goedkoopste helft en de enige die vandaag zonder nieuw
sleutelbeheer kan. **Wat er niet meer staat, kan niet lekken, niet gevorderd
worden, en niet in een datalek belanden.** Het maakt stap 3 bovendien goedkoper:
hoe korter de termijn, hoe minder er te beschermen valt.

## 2. Waarom 21 dagen

Het is een besluit van Quinten en niet van mij: het bepaalt wat een gebruiker in
zijn chat terugvindt, en dat valt onder grens 1 van de Beslisbevoegdheid — wat er
tegen een mens beloofd wordt.

De termijn staat op één plek, `chatfoto_bewaartermijn()`, en verhogen of verlagen
is één regel SQL. Maar hij staat óók in de app (`CHATFOTO_BEWAARDAGEN`), want de
gebruiker leest hem in de zin die staat waar zijn foto stónd. Die twee lopen
onvermijdelijk uiteen zodra iemand er één verandert, en dan klopt elk onderdeel
terwijl het geheel liegt — de naadfout van onwrikbare regel 18. Er is daarom een
test die de constante uit de code naast de functie uit de database legt, en die
via de database vergelijkt en niet via een tweede overgetypte `21`.

## 3. Waarom `verlopen_chatfotos()` niets verwijdert

Dit is de belangrijkste keuze in deze migratie en hij ziet eruit als een halve
maatregel. Hij is het niet.

**Een `delete from storage.objects` haalt de metadata-rij weg en laat het bestand
op de opslag staan.** Dat stond al als bevinding in `ENGINEER-REVIEW.md` sinds
QS8-71. Een opruiming die alleen in SQL leeft, maakt de foto dus onleesbaar en
bewaart hem tóch — precies de belofte van dit issue, half. Erger nog: zonder rij
wijst er niets meer naar dat pad, en is de blob voor élke volgende opruimpas
onvindbaar.

Alleen de Storage-API (`.remove()`) haalt rij én blob weg. De verdeling is
daarom:

| Wie | Wat |
|---|---|
| `verlopen_chatfotos()` | bepaalt **wat** er weg mag, en geeft paden terug |
| de rollover-functie | doet het `storage.remove()` dat de bytes weghaalt |

⚠️ Dat betekent dat de bewaartermijn pas echt gehaald wordt zodra de rollover
gepland draait. Er staat vandaag nog geen planning (Q-TODO A11); het staat als
rij in `ENGINEER-REVIEW.md`.

## 4. Het respijtuur is dragend en geen marge

`verlopen_chatfotos()` wijst een object zonder chatbericht pas aan als het een uur
oud is. Dat uur is geen veiligheidsmarge maar de reden dat de pas bruikbaar is:
**tussen de upload en de `insert` van het bericht heeft élke foto even geen
berichtrij.** Zonder dat uur zou de pas de foto wissen die op dit moment
verstuurd wordt, en dan is de opruiming zelf de bug. Een uur is ruim voor een
upload van hooguit 1 MB.

## 5. De leesgrens hangt aan het bericht (deel A)

Er lag een gemeten lek met dezelfde oorzaak. `chatfotos_select` hing uitsluitend
aan het **pad** en aan `mag_groep_lezen()`; er was geen koppeling aan het bestaan
van een `chat_messages`-rij:

```
berichten met deze bijlage: 0
B ziet: <groep>/<uid>/nooit-verstuurd.jpg
```

Twee routes, en de tweede is de ernstige:

* **nooit verstuurd** — de upload slaagt, de `insert` sneuvelt, de compenserende
  `remove()` komt niet aan. Volgens de gebruiker is de foto nooit verstuurd.
* **verwijderd** — `verwijderBericht()` wist eerst de rij en dán het bestand. Wie
  een foto plaatst en er direct spijt van krijgt, krijgt *"weg"* te zien terwijl
  elk ander lid het bestand opsomt met één `storage.list()`.

De reparatie is een `exists`-subquery op `chat_messages` in `chatfotos_select`.
Drie dingen die daarbij kloppen en die het onderscheiden van 0130:

* het is een **andere tabel**, dus geen recursie;
* de subquery draait onder de RLS van de aanroeper, dus de nieuwe tak is strikt
  **smaller** dan wat er stond: je ziet het bestand alleen als je het bericht ziet;
* het verzenden breekt er niet op. Nagelopen in `chat.ts`: de client doet upload →
  insert en maakt géén ondertekende URL vóór de insert.

⚠️ Het beslisdocument van QS8-71 besprak *"het object overleeft de rij"* wél,
maar uitsluitend als **opslagkosten**. Dat het intussen leesbaar was, stond er
niet. Dat verschil ís de bevinding, en het is de reden dat een kostenpost en een
privacylek uit elkaar gehouden moeten worden ook als ze dezelfde oorzaak hebben.

## 6. Het plafond telde voorraad (deel C)

```
1..8: ok    9: GEWEIGERD: Te veel foto's van deze persoon vandaag (8).
A wiste 8 rijen
A opnieuw 1..8: ok    9: GEWEIGERD
```

`bewaak_chatfoto_aantal()` telde levende rijen in de bucket. Onwrikbare regel 5
vraagt een limiet **per gebruiker per dag**, en dat is een limiet op hándelingen.
`upload → remove → upload` was onbegrensd: ongelimiteerde ingress én egress op een
tier die 5 GB per maand meet.

⚠️ **En dit wordt érger van de bewaartermijn, niet beter.** Hoe agressiever de
opruimpas, hoe vaker er ruimte vrijkomt onder een plafond dat levende rijen telt.
Dat is de reden dat de twee in één migratie zitten en niet in twee.

De teller is een eigen tabel (`chatfoto_uploads`) en geen kolom op
`storage.objects`: die laatste wordt door de opruimpas juist leeggehaald, en een
teller die meegewist wordt telt niets. RLS aan, geen policy, en de tabelgrant
weg — de vorm van `invite_events`.

## 7. Een vertrekker laat geen onbereikbare blob achter

`wis_chatfotos_van_vertrekker()` (0224) deed precies het ene dat de opruimpas
onmogelijk maakt: hij wiste de metadata-rij. Sinds 0232 §4 laat hij de rij staan
en knipt hij alleen de koppeling door. Dan is de foto **meteen** onleesbaar (§5
hangt de leesgrens aan het bericht) en **binnen het uur** echt weg.

⚠️ De test die dit bewaakte, eiste `objecten: '0'` — het mechanisme, niet de
belofte. Hij stond groen terwijl de bytes bleven staan. Dat is regel 18 vraag 2 in
zijn zuiverste vorm, en de reparatie is de bewering veranderen en niet het getal:
de rij staat er nog, niemand kan hem lezen, en de pas wijst hem aan.

## 8. Wat hier bewust níet in zit

* **Versleuteling** — QS8-397. Deze stap maakt die goedkoper maar loopt er niet
  op vooruit.
* **`wis_bewijsfotos_van_vertrekker()`** — dezelfde fout, andere bucket. Die
  bucket heeft geen bewaartermijn, en de rij daar láten staan zou hem alleen maar
  langer bewaren. Staat als rij in `ENGINEER-REVIEW.md`.
* **Een alarm op een opruimpas die stilvalt.** `fotosOpgeruimd` staat in de
  uitvoer van de rollover; niets ziet erop toe dat het getal ooit boven nul komt.
  Ook een rij.
