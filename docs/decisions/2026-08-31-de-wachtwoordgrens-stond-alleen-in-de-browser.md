# De wachtwoordgrens stond alleen in de browser

**Datum:** 31-08-2026
**Aanleiding:** QS8-234, uit de beveiligingsdoorlichting van 31-08
**Raakt:** `scripts/wachtwoord-controle.mjs`, `src/modules/auth/schemas.ts`,
`tests/scripts/wachtwoord-controle.test.ts`

## 1. Wat er klopte

Wachtwoorden worden hier nergens door de app opgeslagen. Gemeten: geen enkele
migratie kent een kolom `password` of `wachtwoord`, en `src/modules/auth/api.ts`
geeft het veld rechtstreeks door aan `supabase.auth.signUp()` en
`signInWithPassword()`. De hash leeft in `auth.users` en is voor geen enkele
client leesbaar.

"Wachtwoorden in platte tekst" — één van de drie gaten uit het onderzoek dat de
aanleiding was — is hier structureel onmogelijk.

## 2. Wat er niet klopte

`src/modules/auth/schemas.ts` eiste twaalf tekens. Dat is **Zod, in de browser**.

Supabase Auth heeft zijn eigen `password_min_length`, standaard **6**. Staat die
lager dan het schema, dan is de twaalf een suggestie: één POST naar
`/auth/v1/signup` met de anon-sleutel — die per definitie in elke bundel zit —
maakt een account met zes tekens aan.

⚠️ **De servergrens is nog steeds ongemeten, en dat is niet hetzelfde als onwaar.**
De probe is in de sessie geprobeerd en door de sandbox geweigerd; er is geen
bewijs in beide richtingen. Ongemeten is niet groen — dat is precies de reden dat
deze controle bestaat in plaats van een zin in een document.

## 3. Waarom een controle en geen test

Een `signUp()`-test met een te kort wachtwoord bewijst meer. Maar hij kan alleen
tegen productie draaien: de lokale stack heeft een **shim** voor `auth.users`
(`supabase/shim/0000_supabase_shim.sql`) en geen GoTrue, dus daar valt niets te
weigeren. Een test die alleen op één omgeving kan draaien, draait in de praktijk
niet.

`npm run wachtwoord:controle` vraagt de Auth-configuratie op en legt
`password_min_length` naast `WACHTWOORD_MINIMUM`. Dat draait overal waar een
token is, en het bewaakt de grens **in beide richtingen** — ook als iemand het
schema verlaagt zonder de schakelaar mee te nemen.

Dat laatste is niet hypothetisch: QS8-216 stelt voor het clientminimum naar acht
te brengen. Met deze controle erbij is dat een zichtbare beslissing over de
grens, in plaats van een UX-keuze bovenop een onbekende server.

## 4. Waarom er een benoemde constante bij moest

Het getal stond in de Zod-keten:

```ts
.min(12, { error: () => t('validatie.wachtwoord_kort') })
```

⚠️ **Dat bestand draagt drie getallen die er alle drie uitzien als "de
ondergrens":** deze, de `.max(72)` ernaast, en de `.min(1)` van `inloggenSchema`
— want inloggen stelt geen eisen aan een wachtwoord dat al ooit geaccepteerd is.
Een regex op `.min(` pakt de verkeerde zodra iemand de volgorde wijzigt, en dan
bewaakt de controle stil een ánder getal dan het formulier gebruikt. Dat is geen
kapotte controle maar een liegende, en die is erger.

Vandaar `export const WACHTWOORD_MINIMUM = 12;` als stabiel anker, en een
controle die wérpt als dat anker verdwijnt in plaats van door te gaan met een
verzonnen getal.

## 5. De ijking

Per grendel gebroken, niet één mutatie voor het geheel:

| Mutatie | Werd rood |
|---|---|
| de `server < schema`-tak eruit | 2 tests |
| "onbekend" laten tellen als in orde | 4 tests |
| regex op `.min(` in plaats van op de constante | 2 tests |

⚠️ Die middelste is de belangrijkste. Geeft de API het veld niet terug — een
ander pad, een gewijzigd formaat, een gedeeltelijk antwoord — dan is er **niets
gemeten**. Zou dat als "klopt" tellen, dan meldt deze controle jarenlang groen
over een grens die niemand meer nakijkt. Dezelfde gedachte als `normaliseer()` in
`adviseur:controle`, en als de drieverdeling van de poort zelf.

## 6. Wat hier níét mee af is

⚠️ **De schakelaar zelf.** `password_min_length` staat in het Supabase-dashboard
onder Authentication → Policies en vraagt Quintens machine. Deze controle zégt of
hij goed staat; hij zet hem niet. Tot dat gebeurd is, is de uitkomst onbekend en
niet goed — en dat is de hele reden dat een `OVERGESLAGEN` hier ongemeten heet en
geen groen.

Hij hoort bij dezelfde ronde als de schakelaars van QS8-141.
