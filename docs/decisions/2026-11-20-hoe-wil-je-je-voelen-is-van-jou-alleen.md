# Hoe wil je je voelen is van jou alleen — en de vragenlijst gaat naar één vraag per scherm

**Datum:** 20-11-2026 · **Migratie:** 0311 · **Issue:** QS8-733 (onderdeel van QS8-721)
**Besluit van:** Quinten, 19-11-2026 (reacties van 12:49 en 12:58 op QS8-733) · **Raakt:** domeinregel 7, regel 15, regel 16, regel 18
**Status:** gebouwd; migratie 0311 wacht op Quintens "backup gedaan" (`docs/PROMPT-SESSIE.md` §12d).

## 1. Wat besloten is

De vragenlijst krijgt een vijfde vraag, *Hoe wil je je voelen?*, met zes voorstellen (rustig, gemotiveerd,
trots, gesteund, energiek, gefocust) en een eigen omschrijving. Een voorstel stuurt één vaste, positieve zin
onder de dagelijkse herinnering; de eigen omschrijving staat **alleen op het eigen scherm** (als motto bij de
herinneringsinstellingen), komt nooit letterlijk in een melding of bericht en is nooit zichtbaar voor de groep.
Beide zijn alleen voor de eigenaar leesbaar, de lengte wordt met `telTekens()` geteld met dezelfde grens in een CHECK.

## 2. Datamodel: twee kolommen op `profiles`, geen eigen tabel

`feeling text` (CHECK `profiles_feeling_bekend`, zes sleutels) en `feeling_own text` (CHECK
`profiles_feeling_own_len`: 1 tot en met 60 codepunten, niet alleen spaties). Allebei nullable zonder default:
niet beantwoorden mag, en `patchUitVragenlijst()` laat een overgeslagen antwoord met rust.

**Waarom niet een tabel zoals `gebruikersvoorkeuren` (0303)?** Die koos een tabel omdat een kolom op `profiles`
alleen veilig is zolang niemand hem in de kolomgrant van 0089 zet. 📏 Gemeten op de lokale stack (313 migraties
afgespeeld, daarna 0311): `authenticated` heeft SELECT op precies drie kolommen van `profiles` (`id`,
`display_name`, `avatar_url`), `has_table_privilege(..., 'select')` is `false`, en `mijn_profiel` is eigendom van
`postgres` met `authenticated=r`. Een groepsgenoot krijgt dus 42501 op beide kolommen, ook met `select *`.
Dezelfde plek als de vier andere antwoorden van de vragenlijst (0143) won het van een tweede schrijfpad, en de
nudge leest `profiles` al met de service-role. **Wat dit kost:** de eigenaar-only eigenschap hangt aan het
ontbreken van een grant; `tests/rls/gevoel.test.ts` is daarom met de hand rood gemaakt (een
`grant select (feeling, feeling_own)` laat "laat een groepsgenoot beide kolommen niet lezen" omvallen), en
`groepskolommen:controle` kent de kolommen als "niet groepszichtbaar".

**Geen INSERT-grant.** `profiles` heeft sinds 0197 geen INSERT-recht voor clients meer en `kolomrechten:controle`
weigert een recht zonder aanroeper; alleen `grant update`.

## 3. De nudge

`nudgeBericht(toon, taal, gevoel)` voegt de zin van het gevoel toe aan de body. De titel en de toon
(`reminder_tone`) blijven zoals de gebruiker ze zette, en de heldenstem komt daarna zoals voorheen. De zin is vast
per gevoel en per taal; `tests/beloftes/gevoelsregels.test.ts` toetst elke variant apart op woorden die falen
suggereren. De Edge Function selecteert `feeling` en nergens `feeling_own`, en die toets leest de bron omdat de
Deno-kant buiten `tsc` valt.

## 4. De vragenlijst

`app/onboarding/vragenlijst.tsx` (795 regels) is een doorgeefluik; de inhoud staat in
`src/schermen/vragenlijst/`, één bestand per vraag, elk onder de harde 50 regels. Eén state voor alle
antwoorden, dus terug gaan verliest niets, en elke "Volgende" bewaart wat er staat via `patchUitVragenlijst()`
(wie halverwege afhaakt, houdt zijn antwoorden; wie terugkomt begint bij de eerste open vraag). De streep toont
het aantal gedane stappen en loopt via `alsVoortgang()`. Het voorbeeld van de herinnering staat vóór de samenvatting
en gebruikt dezelfde `nudgeBericht()` als de Edge Function, dus het kan niet uit de pas lopen met de echte melding.
`PLAFOND['app/']` in `scripts/regel15-controle.mjs` zakt van 61 naar 60.

## 5. Aannames (niet besloten, wel zichtbaar)

- **De zin wordt aan de body toegevoegd en vervangt niets.** Alternatief was de titel te vervangen; dat raakt de
  toon-knop (QS8-475) en is daarom niet gedaan.
- **`database.types.ts` is niet bijgewerkt.** Het bestand is een afschrift van productie (QS8-569) en 0311 is daar nog
  niet. Tot `npm run types:db` na de migratie draait, staan de twee kolommen in `NogNietInTypes`
  (`src/modules/auth/profile.ts`); die interface verdwijnt dan.
- **Op native vraagt `Pushwacht` de toestemming al bij de eerste start**, dus vóór de vragenlijst. "Voorbeeld vóór de
  pushvraag" klopt daar niet; op web gaat de vraag via een knop op het profiel. Dat oplossen raakt `app/_layout.tsx` en
  de routewacht en is een eigen issue.
- **"Sla over" blijft naar de samenvatting springen** (zoals voorheen), en "Volgende" zonder antwoord slaat die ene vraag over.
- **Het motto is alleen zichtbaar** bij de herinneringsinstellingen; wijzigen kan via de vragenlijst. Een eigen bewerkveld is niet gebouwd.

## 6. Volgorde bij uitrol

Migratie 0311 vóór de deploy van de Edge Function `notificaties`: de functie selecteert `feeling`, en zonder de kolom
faalt die select voor iedereen (zelfde volgorde als 0310, `docs/DEPLOY.md` §2.5a).
