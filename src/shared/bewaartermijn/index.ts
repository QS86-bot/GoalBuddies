/**
 * Hoe lang de server een gedeelde bijlage bewaart — QS8-396, migratie 0235.
 *
 * **Besluit van Quinten, 09-09-2026: 21 dagen.**
 *
 * ⚠️⚠️ **Een kopie van `chatfoto_bewaartermijn()` en geen bron.** De database is
 *    de grendel: de opruimpas leest die functie, niet dit getal. Deze constante
 *    bestaat om het in de interface te kunnen zéggen. Lopen de twee uiteen, dan
 *    belooft het scherm een andere termijn dan de server aanhoudt — allebei de
 *    onderdelen kloppen en het geheel liegt, precies de naadfout van onwrikbare
 *    regel 18. `tests/rls/chatfoto-bewaartermijn.test.ts` legt ze naast elkaar.
 *
 * ⚠️ **Waarom in `shared` en niet in `modules/buddies`, met dezelfde reden als
 *    `shared/categorieen`.** `shared/ui/Foto.tsx` zet de tekst neer die er staat
 *    waar de foto stónd, en `shared` mag geen module aanspreken — de barrel van
 *    `modules/buddies` trekt de Supabase-client mee, en dan is geen enkel
 *    UI-component los te testen. `modules/buddies` exporteert hem door, dus voor
 *    elke bestaande lezer verandert er niets.
 *
 * ⚠️ **Geen tijdberekening.** Dit is een getal en geen "vandaag": correctheids-
 *    regel 7 gaat over week- en cyclusrekenwerk, en een leeftijd in dagen valt
 *    daar niet onder — om dezelfde reden dat de opruimpas in SQL mag staan.
 */
export const CHATFOTO_BEWAARDAGEN = 21;

/**
 * Hoe lang de server een gedeeld document bewaart — QS8-408, migratie 0248.
 *
 * **Besluit van Quinten, 10-09-2026: 21 dagen** — gelijk aan de chatfoto.
 *
 * ⚠️⚠️ **Gelijk aan `CHATFOTO_BEWAARDAGEN` en tóch een eigen constante, want het
 *    is een eigen keuze.** Het gaat om twee soorten inhoud met twee eigen
 *    verwachtingen; dat ze vandaag hetzelfde getal dragen, maakt er geen één
 *    keuze van. Samenvoegen zou een verschil later onmogelijk maken zonder de
 *    andere te raken. Waarom dit gevráágd is en niet aangenomen: §2 van 0248.
 *
 * ⚠️ Een kopie van `chatdoc_bewaartermijn()` en geen bron — zelfde verhouding als
 *    hierboven. `tests/rls/chatdoc-bewaartermijn.test.ts` legt de vier waarden
 *    naast elkaar: de twee databasefuncties, en deze twee constanten.
 */
export const CHATDOC_BEWAARDAGEN = 21;
