# De controle die zijn eigen naam niet waarmaakte

**16-09-2026** — sluit de rij van 07-09-2026 in `docs/ENGINEER-REVIEW.md`.

## Wat er aan de hand was

`logboek:controle` belooft in zijn eigen kop: *"er staat geen persoon in de
functielogs"*. Wat hij afdwong was smaller — hij matchte **broncode-identifiers**
en verder niets:

```js
export const PERSOONSVORMEN = [/\bprofiel\.id\b/, /\buser_id\b/, …];
```

📏 Gemeten door hem te voeden:

| vorm | treffers |
|---|---|
| ``console.error(`x: ${profiel.id}`)`` | 1 |
| ``console.error("Key (user_id)=(3f2b)")`` | 1 |
| ``console.error(`x: ${fout.message}`)`` | **0** |
| ``console.error(`x: ${fout.details}`)`` | **0** |
| ``console.error("mislukt", fout)`` | **0** |

Hij bewaakte dus de id's die je zélf in een logregel zet, en niet de melding die
de database teruggeeft. In de Edge Functions stonden op dat moment **21**
logregels van die tweede soort.

⚠️ Dat is de gevaarlijke richting van een te brede naam: je leest hem en gelooft
de dekking. De bevinding kwam uit de security-review, niet uit de controle — ik
had zijn naam geloofd in plaats van hem te voeden.

## Wat een melding werkelijk draagt — gemeten, niet aangenomen

Via PostgREST op de lokale stack, een CHECK-schending op `goals.title`:

```
status 400
{
  "code":    "23514",
  "message": "new row for relation \"goals\" violates check constraint
              \"goals_title_geen_bidi\"",
  "details": "Failing row contains (95bcba71-…, 11111111-…,
              Mijn geheime doel‫, null, other, …)."
}
```

`details` draagt de **hele rij** — de eigenaar én zijn privétekst. `message`
draagt vandaag alleen de constraintnaam. Dat verschil is de hele reden dat de
reparatie `.message` met rust laat: de volledige melding naar het functielog
sturen is de bewuste ruil van QS8-315, en die staat sinds `SENTRY_DSN` aan de
goede kant.

## Waarom er een derde klasse bij moest

"`.message` mag" is een bewering over code die ergens anders staat. `scrub.ts`
zegt zelf waarom dat wankel is:

> die draagt bij een `%`-interpolatie de waarde die de fout veroorzaakte, en
> `scrubMessage()` haalt die vorm er níét uit (gemeten)

Dat is precies de voorwaarde die de reviewrij als *"wordt zwaarder als"* noemde.
Een `raise exception 'doel % van %', v_title, v_display_name` zet een titel en
een naam in `message`, en die gaat ongezien het functielog in.

Daarom kijkt de controle nu naar drie klassen, en niet naar één:

| klasse | waar | wat |
|---|---|---|
| persoon | `supabase/functions/` | een id dat je zelf in de regel zet |
| melding | `supabase/functions/` | `.details`, `.hint`, of het hele foutobject |
| bronkant | `supabase/migrations/` | een `raise exception` die gebruikersinhoud interpoleert |

De derde maakt de tweede pas af: zonder haar is het met rust laten van `.message`
een aanname in plaats van een grens.

📏 **Alle drie stonden op 0 toen ze erbij kwamen.** Dat is het goede moment. Een
grendel die bij aankomst al rood staat wordt een opruimklus met een
uitzonderingenlijst, en daarna een register dat niemand meer leest.

## ⚠️ De ijking die groen bleef terwijl de mutatie in het bestand stond

Dit is het deel dat bewaard moet blijven.

Bij de eerste ijking van de bronkant is een echte `raise exception` aan een
migratie toegevoegd, met een `grep` erachteraan om te bevestigen dát de mutatie
er stond. De grep slaagde. De controle bleef **groen**.

De oorzaak is één teken:

```js
/\btitle\b/.test('v_title')   // false
/title\b/.test('v_title')     // true
```

`_` is een woordteken, dus `\b` staat er niet tussen `v_` en `title`. In
JavaScript lees je een persoon als `rij.user_id` en zet de punt die grens; in
PL/pgSQL heet diezelfde waarde `v_user_id` of `p_title` en is er geen grens.
**Dezelfde lijst regexen is scherp in de ene boom en blind in de andere.**

Twee dingen hebben dit gevonden, en het waren allebei regels uit `CLAUDE.md`:

1. **Mutatie per grendel, niet één mutatie voor de hele controle.** Was de
   bronkant samen met de meldingsklasse geijkt, dan was er iets rood geworden en
   had de uitslag geklopt — over de verkeerde grendel.
2. **Kijk wélke grendel rood wordt, niet dát er een rood wordt.** Hier werd er
   niets rood, en juist daardoor was het zichtbaar.

Zonder die twee was hier een grendel geland die nul gevallen kan vinden, onder
een reviewrij die op *opgelost* staat — de duurste vorm die dit project kent.

## Wat dit niet is

- **Geen verruiming van wat er gelogd mag worden.** `.message` mocht al en mag
  nog steeds; wat erbij komt is dat `.details`, `.hint` en het kale foutobject nu
  rood worden in plaats van stil door te gaan.
- **Geen verbod op `raise exception` met `%`.** Tellers, doel-id's, groeps-id's
  en tijdzones mogen; er staan er 104 en geen enkele wordt rood. Wat niet mag is
  een persoon of zijn eigen tekst.
- **Geen nieuwe uitzonderingslijst.** Er is er geen, omdat er geen geval is dat
  er een nodig heeft. Komt dat er, dan hoort er een register bij met een reden
  per rij — zoals `ZONDER_CI` en `ZONDER_PUSH` — en niet een regex die stilletjes
  ruimer wordt.

## Wat de controle niet kan zien, en waarom dat vandaag leeg is

Een bronscan ziet alleen wat er geschreven staat. Een **onafgevangen** fout logt
Deno zelf, met melding en stack, en daar komt geen `console.error` aan te pas.
📏 Nagemeten op 16-09-2026: er is in `supabase/functions/` geen enkele `throw`
van een foutobject dat van de database komt — alle `throw`-plekken zijn
`new Error(...)` met een eigen tekst, en de `.rpc()`-aanroepen geven hun fout
terug in `{ data, error }` in plaats van hem te werpen. Het pad bestaat dus, maar
er loopt vandaag niets doorheen.

**Dat blijft handwerk**, net als vraag 5 van regel 18: de controle vindt de
regel die je schrijft, niet de fout die ontsnapt.

## Wat er open blijft

`String(fout)` wordt met rust gelaten: op een PostgREST-fout levert die
`[object Object]` op en op een `Error` de melding zonder de rij. Er staan er
vandaag drie in de Edge Functions. **Wordt zwaarder als** een van die drie ooit
een object krijgt met een eigen `toString()`, of als Deno's `console.error` de
serialisatie verandert.
