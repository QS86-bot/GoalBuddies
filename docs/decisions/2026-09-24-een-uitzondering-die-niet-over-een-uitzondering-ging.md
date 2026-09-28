# Een uitzondering die niet over een uitzondering ging

**Datum:** 24-09-2026
**Issue:** QS8-606 (gemeten tijdens QS8-599)
**Status:** gebouwd
**Raakt:** `scripts/knip-controle.mjs`, `scripts/adviseurdrift-controle.mjs`,
`tests/scripts/knip-controle.test.ts`, `tests/scripts/adviseurdrift-controle.test.ts`

## 1. Wat er aan de hand was

`adviseurdrift-controle.mjs` kreeg bij QS8-597 een **eigen** SQL-knip, en een
rij in `ZONDER_KNIP` met deze reden:

> _"de gedeelde knip is een JS-knip en haalt `--` niet weg."_

⚠️ Die reden was waar toen ik hem schreef en was het een dag later niet meer:
`scripts/zonder-sql-commentaar.mjs` was op 21-09 geland (QS8-574). **De rij
noemde een bron die bestaat**, en een register waarvan een rij een bewering
draagt die niet klopt, leest als een beoordeling die iemand gemaakt heeft.

## 2. De twee knippen verschillen écht, en om een goede reden

De gedeelde knip behandelt `$$ … $$` als een **tekstliteral**, en dat is
gemeten en geen omissie: zijn kop noemt `v_sql := $q$a--b$q$`, waar de inhoud
dáta is. Mijn knip haalde commentaar bínnen zo'n blok juist weg, want in een
migratie is `$$ … $$` meestal een **functielichaam**, en daar is `--` wél
commentaar.

Twee verschillende beloftes over dezelfde syntax, allebei juist in hun context.
Dat had makkelijk kunnen eindigen in "twee knippen, elk met een reden".

## 3. De meting die dat besliste

📏 Nagemeten op 24-09-2026 over **alle 301** migraties:

|                                                         |                |
| ------------------------------------------------------- | -------------- |
| migraties waar de twee knippen andere tekst geven       | **301** — alle |
| daarvan waar dat de telling van deze controle verandert | **0**          |

De eigen knip is daarom weg en de gedeelde ervoor in de plaats. **Eén knip is
beter dan twee die uiteen kunnen lopen**, en dat is precies waarom die knip
gedeeld ís.

⚠️ **De grens die daarmee bekend is en niet dicht**, en die staat nu als toets
in plaats van als aanname: een **uitgecommentarieerde** `create view` bínnen een
`$$`-lichaam leest de gedeelde knip als code, en dan meldt deze controle een
view die niet bestaat. Dat faalt **luid** — iemand krijgt een allowlist-regel
gevraagd voor iets wat er niet is — en dat is de goede richting. Die vorm komt
vandaag in geen enkele migratie voor.

## 4. En daaronder zat de eigenlijke reparatie

⚠️⚠️ De kop van `knip-controle.mjs` zegt **sinds QS8-574** met zoveel woorden:

> _"Er zijn twee gedeelde knippen sinds QS8-574, en dat is geen verwatering."_

Maar `knipt()` herkende er één:

```js
if (/from '\.\/zonder-commentaar\.mjs'/.test(zonderCommentaar(bron)))
  return true;
```

📏 Gevolg, gemeten: een bestand dat de **gedeelde SQL-knip** importeert krijgt
te horen dat het _"geen commentaar knipt"_, met als enige uitweg een registerrij
— **een uitzondering die niet over een uitzondering gaat**. Dat is de vorm die
een register stuk maakt: wie hem invult, zet er een beoordeling neer waar niets
te beoordelen viel, en de volgende lezer telt hem mee als een afwijking.

`knipt()` accepteert nu beide, de meldtekst noemt ze allebei met hun eigen
ijking, en het register gaat van **zes** rijen naar **vijf** — mijn rij is weg
en niemand anders had er een nodig.

⚠️ **Het bestand wist het dus al.** Dit is dezelfde vorm als de kop van `/audit`
een issue eerder (QS8-598): de documentatie stelde de juiste diagnose en de code
was er niet mee meegegaan. Twee keer op één dag is geen toeval maar een patroon —
**een kop die een regel uitlegt, is geen grendel dat de code hem volgt.**

## 5. De ijking

Stand ervóór gemeten: **86 groen, 0 rood**.

| #   | Mutatie                                                      | Wat er rood werd                                                               |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | `knipt()` herkent de SQL-knip weer niet                      | — **de mutatie landde niet**                                                   |
| 1b  | idem, per regelnummer                                        | _ziet ook de gedeelde SQL-knip_, en `knip:controle` meldt `adviseurdrift` weer |
| 2   | de wacht in de regex eruit: élke `*-commentaar.mjs` telt     | — **landde niet**                                                              |
| 2b  | idem, per regelnummer                                        | _ziet een andere commentaar-module niet aan voor een gedeelde knip_            |
| 3   | de knip uit de pijplijn van `adviseurdrift`                  | _leest een statement in een commentaarkop niet als een statement_              |
| 4   | `dollarTag()` geeft altijd `null`: `$$` is geen literal meer | _meldt een uitgecommentarieerde view in een dollar-quoted lichaam_             |

⚠️⚠️ **Rij 1 en 2 zijn dezelfde slip, en het was de derde keer vandaag.** Mijn
python-anker matchte niet door de escaping van een regex-in-een-string; de suite
bleef groen en dat zag er even uit als _"deze regel doet er niet toe"_.
**Mutaties op een regel met veel backslashes doe ik sindsdien per regelnummer en
niet per string-anker**, en ik druk de regel af vóór ik de suite draai. Dat kost
één regel en het vangt de hele klasse.

## 6. Wat dit niet is

- **Geen wijziging aan de gedeelde SQL-knip.** Zijn `$$`-gedrag is gemeten en
  juist voor zijn eigen consumenten; deze controle past zich aan, niet andersom.
- **Geen derde gedeelde knip.** De kop van `knip-controle.mjs` zegt dat een
  derde een keuze is die je verantwoordt; die keuze is hier juist ongedaan
  gemaakt.
- **Geen uitspraak over de vier knippen die `zonderCommentaar` niet héten** en
  daarom buiten dit register vallen. Die staan met hun meting in de kop van
  `knip-controle.mjs`.

## 7. Stand

- `npm run poort`: niets rood; 25 controles ongemeten.
- `knip:controle`: 31 knippen met een reden, 5 met reden zonder knip (was 6).
- `tests/scripts/knip-controle.test.ts` 69 groen,
  `tests/scripts/adviseurdrift-controle.test.ts` 17 groen.
